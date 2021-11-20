const Ewok = {
    options: {noshadow: false, stylesheet: null},
    dependencies: [],
    classes: {},
    sharedModules: {},
    
    init(options=this.options, selection = "template"){
        plates = document.querySelectorAll(selection)
        //get a string list of template IDs like "my-element,custom-picture..."
        let templates = [...plates].map(x=>x.id).filter(x=>x).join(',')
        //narrow the list down to a Set of the custom elements used on the page
        let used_templates = new Set([...document.querySelectorAll(templates)]
                                     .map(x=>x.tagName.toLowerCase()))
        

        // Extended Built-in Templates
        // look for templates that extend built-in html elements                                     
        let ext_templates = [...document.querySelectorAll(selection)]
                            .filter(t=>t.hasAttribute('extends'))
                            .map(x=>`[is=${x.id}]`).join(',')
        //...and their corresponding use via is="..."
        if (ext_templates) {
            let used_ext_templates = new Set([...document.querySelectorAll(ext_templates)]
                                         .map(x=>x.getAttribute('is')))            
            //add the extended templates to the regular templates set
            if (used_ext_templates.size) used_templates = new Set([...used_templates,...used_ext_templates])
        }

        // find subcomponents
        used_templates.forEach((t) => {
            let frag = document.getElementById(t).content
            let subcomponents = new Set([...frag.querySelectorAll(templates)]
                                        .map(x=>x.tagName.toLowerCase()))
            if (subcomponents.size) subcomponents.forEach(sc => {
                Ewok.dependencies.push([sc,t])
                //make sure components that are only inside templates count as used
                used_templates.add(sc)
            })
        })

        // get a dependency-ordered list of templates/components
        let templateDependencies = new Graph([...used_templates], Ewok.dependencies)
        used_templates = topologicalSort(templateDependencies)

        // code that is injected in modules to add references to their host component
        const hooks = `let host, root, xref, xdata; 
                        export function EwokAttach(){
                            host = this
                            root = host.root
                            xref = Ewok.xref.bind(root)
                            xdata = host.xdata
                        };
                       `

        // create the classes to make each custom element work
        used_templates.forEach(x=>{createTemplate(x, options)})
    


        function createTemplate(elementName, options){
            
            const templateElement = document.getElementById(elementName)
            const templateContent = templateElement.content
            const templateAttrs = new Map ( Object.entries(
                                            [...templateElement.attributes]
                                            .filter(a=>a.name!='id')
                                            .reduce((obj,a)=>{ 
                                                obj[a.name] = a.value;
                                                templateElement.removeAttribute(a.name)
                                                return obj
                                            },{})
                                        ))
            
            //prepare script from template
            let promises = []
            let templateScript = templateContent.querySelectorAll('script')
            let sharedModules
            let privateModules
            if (templateScript.length) {
                //let templateScriptText = templateScript.textContent
                sharedModules = [...templateScript].filter(x=>x.hasAttribute('shared'))
                privateModules = [...templateScript].filter(x=>!x.hasAttribute('shared'))

                sharedModules = sharedModules.reduce((t,m) => { return t+m.text }, '')
                privateModules = privateModules.reduce((t,m) => { return t+m.text }, '')

                sharedModules && blobify(sharedModules, true)

                templateScript.forEach(s=>s.remove())
            }

            // for attaching scripts in templates as modules on components
            function blobify(code, shared=false) {
                // a way to make host refer to the component inside the module
                let hookcode = !shared ? hooks : ''
                let blob = new Blob([hookcode + code], {type: 'application/javascript'})
                promises[1+shared] =  import(URL.createObjectURL(blob))
                URL.revokeObjectURL(blob)
            }


            //console.debug("🚩 "+elementName);

            //get the type of element to extend, if the 'extends' attribute is set on the template
            const ext = templateAttrs.get('extends')
            let extType
            if (ext) {
                const invalid = ()=>EwokWarn (`${ext} is not a valid element to extend.`)
                try {
                    const extEl = document.createElement(ext)
                    if (extEl.__proto__ == HTMLUnknownElement.prototype){
                        throw 'invalid element type'
                    } else {
                        extType = extEl.__proto__.constructor
                    }
                } catch {
                    invalid()
                    ext = null
                }
            }


            // Here is the generic custom element class!
            Ewok.classes[elementName] = class extends (extType || HTMLElement) {

                constructor() {
                    super();

                    //console.debug("🏗 "+elementName);

                    if (!this.hasAttribute('noshadow') && !options?.noshadow) {                        
                        this.attachShadow({mode: 'open'})
                    }           

                    //Alpine compatibility
                    //TODO: is this actually necessary?
                    //if (this.hasAttribute('x-data') && Alpine) Alpine.initTree(this)
                }


            ///////////////////////////////////////////////////////////////////                

                connectedCallback() {

                    let event = new Event('connecting', {node: this});
                    this.dispatchEvent(event)

                    //console.debug("⚡ "+elementName);

                    this.setAttribute('loading', '')

                    let attachPoint = options?.noshadow ? this : this.shadowRoot || this
                    this.root = attachPoint
                    this.xref = Ewok.xref.bind(this.root)
                    let host = this.parentElement || this.getRootNode().host
                    if (typeof Alpine=="object") this.xdata = Alpine.mergeProxies(this._x_dataStack)
                    let nested = host.hasOwnProperty('props')

                    //copy attributes from template tag onto custom element
                    //unless that attribute is already set
                    for (const a of templateAttrs) {
                        if (!this.hasAttribute(a[0])) {
                            this.setAttribute(a[0], a[1])
                        }
                    }
                    
                    let clone = templateContent.cloneNode(true)
                    
                    // 'temp' (placeholder) elements
                    let temp = clone.querySelector('[temp]')
                        temp = this.querySelector('[temp]') || temp
                        temp && attachPoint.appendChild(temp)
                    
                    // make a convenient reference to the host and parent shadowRoot of the custom el on every sub-element
                    clone.querySelectorAll('*').forEach((el) => {
                        el.host = this
                        el.root = this.root;
                        [...el.getAttributeNames()].forEach(a=>{
                            let attr = el.getAttribute(a)
                            let oldattr
                            do {
                                oldattr = attr
                                attr = attr.replace(/~([\w$.]+\(.*\))/g, 'this.props.$1')
                                
                            } while (attr != oldattr)
                            el.setAttribute(a, attr);
                        });
                    })

                    let THIS = this
                    this.propsReady = new Promise(function(resolve, reject){
                        THIS.resolver = resolve;
		                THIS.rejecter = reject;
                    });

                    //components must not be processed before their parent's props are ready
                    let parentPromise = nested ? host.propsReady : null
                    promises[0] = parentPromise
                    
                    //transfer js code from template to element
                    if (privateModules) { blobify(privateModules) }

                /////////////////////////////////////////////////////////////////  

                    Promise.all(promises).then((results)=>{
                        console.debug("✨ "+elementName);
                        
                        let privateModules = results[1]
                        let sharedModules = results[2]
                        let thismodule = { ...sharedModules, ...privateModules}
                        sharedModules && (Ewok.sharedModules[elementName] = sharedModules)

                        //SET PROPS
                        let hostProps = nested ? host.props : null
                        //convert attributes with $ to the global variables they point to
                        let thisDataset = {...this.dataset}
                        for (let p in thisDataset) {
                            let v = thisDataset[p]
                            if (v[0]=='$') {
                                let sliced = v.slice(1)
                                if (v.includes('.')) thisDataset[p] = getObjPath(sliced, window)
                                else thisDataset[p] = window[sliced]
                            }
                        }
                        this.props = this._ = {...hostProps, ...thismodule, ...thisDataset}

                        //the parent (if applicable), and the module (if applicable) have been resolved
                        //and props have been set, so resolve self
                        this.resolver()

                        // if component has a module assign 'this' (the component) to the host variable
                        privateModules && privateModules.EwokAttach.apply(this)

                        // interpolate {{variables}} in the template
                        interpolate(clone,this.props)
                        // interpolate any HTML (slots) in the custom element instance
                        if (this.shadowRoot) interpolate(this,this.props)
                        
                        // attach props to every sub-element
                        clone.querySelectorAll('*').forEach((el) => {
                            el.props = el._ = this.props
                        })


                        // append the template content
                        // and delete any temp element
                        injectContent.apply(this)
                        this.removeAttribute('loading')
                        
                        //run the component's mount function, if present
                        if (thismodule && thismodule.mount) thismodule.mount.apply(this, null)

                        //Alpine compatibility
                        if (typeof Alpine != "undefined") alpinify.apply(this)

                        console.debug("✅ "+elementName);
                    })                
                    

                    event = new Event('connected', {detail: elementName});
                    event.elem = elementName
                    window.dispatchEvent(event)

                    //// functions //////////////////////////////////////////////////////////////

                    function interpolate (attachPoint, props){
                        [...attachPoint.children].forEach((x)=>{
                            if (x.nodeName != 'SCRIPT' && !Object.keys(Ewok.classes).includes( x.tagName.toLowerCase() ) ){
                                let html = x.innerHTML
                                if ( html && html.includes('{{') ) x.innerHTML = handlebars(html, props)
                                if ( html && html.includes('{*') ) {
                                    // this ridiculous regex removes single astrixes between curly braces
                                    // i.e {**{xyz}**} becomes {*{xyz}*}
                                    x.innerHTML = x.innerHTML.replace(/(\{\**)\*(\{)(.*)(\}\**)\*(\})/g, '$1$2$3$4$5')
                                }
                            }
                        })
                    }

                    function injectContent(){
                        // if Ewok options specifies a stylesheet, insert it
                        if (this.shadowRoot && options?.stylesheet) {
                            let stylelink = document.createElement('link')
                                stylelink.setAttribute('rel', 'stylesheet')
                                stylelink.setAttribute('href', options.stylesheet)
                            this.shadowRoot.appendChild(stylelink)
                        }

                        //attach the main content, from the template
                        attachPoint.appendChild(clone) 
                        temp && attachPoint.querySelectorAll('[temp]').forEach(el=>el.remove())
                    }

                    function alpinify() {
                        if (this.shadowRoot) {
                            if (this.closest('[x-data]')) {
                                Alpine.initTree(this.shadowRoot)
                            }
                        }
                    }
                }//connectedCallback
                            
            } //anonymous class
                    
            customElements.define(elementName, Ewok.classes[elementName], ext && {extends: ext})
            //console.debug("🧾 "+elementName);
            
        } //createTemplate()


        
        function handlebars(template, variables, fallback) {
            const regex = /\{\{[^{<"']+}}/g

            return template.replace(regex, (match) => {
                const path = match.slice(2, -2).split('|');
                return getObjPath( path[0].trim(), variables, path[1] );
            });
        }

        //get the specified property or nested property of an object
        function getObjPath(path, obj, fallback = '') {
            if (path[0] == '$') {obj=window; path=path.slice(1)}
            //if (path[0] == '\\') path=path.slice(1)

            return path.split('.').reduce((res, key) => {              
                return (typeof res[key]=='function' 
                    ? res[key]() 
                    : res[key]) ?? fallback
            }
            , obj);
            
        }

        

        //////////////////////////////////////////////
        //stuff for sorting the component dependencies

        function Graph(nodes,edges) {
            const adjacencyList = this.adjacencyList = new Map();
            const independentNodes = this.independentNodes = new Set(nodes);

            this.nodes = nodes
                
            this.addNode = function (node) {
                adjacencyList.set(node, new Set())
            }
            this.addEdge = function (dependency,dependent) {
                try {
                    adjacencyList.get(dependency).add(dependent)
                    return true
                } catch (error) {
                    console.warn("Invalid edge.")
                    return false
                }
            }


            if (nodes && nodes.length) {
                nodes.forEach(this.addNode)
                if (edges && edges.length) {
                    edges.forEach(edge => {
                        if (this.addEdge(...edge))
                            independentNodes.delete(edge[1])
                    })
                }
            }

            return this
        }

        function topologicalSort (graph) {
            const L = []

            const inDegree = {};
            for (const v of graph.nodes) {
                for (neighbor of graph.adjacencyList.get(v)) {
                    inDegree[neighbor] = inDegree[neighbor] + 1 || 1;
                }
            }

            let index = 0
            let queue = new Set(graph.independentNodes)
            while (queue.size) {
                let n = queue.values().next().value
                queue.delete(n)
                L.push(n)
                index++
                graph.adjacencyList.get(n).forEach((m)=>{
                    inDegree[m]--
                    if (inDegree[m]===0){
                        queue.add(m)
                    }
                })

            }

            if (index !== graph.nodes.length) {
                console.warn("Dependecy cycle detected.");
            }

            return L
        }

        function EwokWarn (msg) {
            console.warn('🙈 Ewok: '+msg)
        }

    }, // Ewok.init

    xref: function(query){
        return this.querySelector(`[x-ref=${query}]`)
    }
}

// nifty custom element that imports HTML via iframe
// from https://codepen.io/piccalilli/project/editor/DyVyPG
class EwokImportContent extends HTMLElement {
    
    constructor () {
        super()
    }

    get path() {
        return this.getAttribute('src') || '';
    }
    
    get loading() {
        return this.getAttribute('loading') || 'auto';
    }
    
    connectedCallback() {
    this.innerHTML = `
        <iframe src="${this.path}" loading="${this.loading}" hidden></iframe>
    `;
    
    const frame = this.querySelector('iframe');
    
    frame.addEventListener('load', evt => {
        const children = [...frame.contentDocument.children];
        children.forEach(child => frame.before(child)); 
        frame.remove();
    });
    }
}

if ('customElements' in window) {
    customElements.define('ewok-import', EwokImportContent);
}


document.addEventListener('alpine:init', () => {
    
    Ewok.Alpine = true

    Ewok.shadowDive(document.body, "template[id]", (m)=>{
        m.setAttribute("x-ignore","");
    })

    Alpine.magic('props', (el) => {
        return el.props
    })
    Alpine.magic('host', (el) => {
        return el.host
    })
    Alpine.magic('_', (el) => {
        return (data=el.props) => {
            el.tmplt = el.tmplt || el.innerHTML
            return Ewok.handlebars(el.tmplt, data)
        }
    })
    
window.onload = function(){
    Ewok.init()
        Ewok.init = null
    }
})

window.onload = function(){
    !Ewok.Alpine && Ewok.init && Ewok.init()
}