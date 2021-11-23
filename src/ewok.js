const Ewok = {
    options: {noshadow: false, stylesheet: null},
    dependencies: [],
    classes: {},
    sharedModules: {},
    
    init(options=this.options, selection = "template"){
        let plates = document.querySelectorAll(selection)
        //get a string list of template IDs like "my-element,custom-picture..."
        let templates = [...plates].map(x=>x.id).filter(x=>x).join(',')
        //narrow the list down to a Set of the custom elements used on the page
        let used_templates = new Set([...document.querySelectorAll(templates)]
                                     .map(x=>x.tagName.toLowerCase()))
        

        // EXTENDED BUILT-IN TEMPLATES
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

        // COMPONENT DEPENDENCY
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
    

        // CREATE TEMPLATE FUNCTION
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
                
                sharedModules = [...templateScript].filter(x=>x.hasAttribute('shared'))
                privateModules = [...templateScript].filter(x=>!x.hasAttribute('shared'))

                sharedModules = sharedModules.reduce((t,m) => { return t+m.text }, '')
                privateModules = privateModules.reduce((t,m) => { return t+m.text }, '')

                sharedModules && blobify(sharedModules, true)

                templateScript.forEach(s=>s.remove())
            }

            // MODULE ATTACHER
            // for attaching scripts in templates as modules on components
            function blobify(code, shared=false) {
                // a way to make host refer to the component inside the module
                let hookcode = !shared ? hooks : ''
                let blob = new Blob([hookcode + code], {type: 'application/javascript'})
                promises[1+shared] =  import(URL.createObjectURL(blob))
                URL.revokeObjectURL(blob)
            }


            //console.debug("🚩 "+elementName);

            // EXTENDED BUILT-IN ELEMENTS
            // get the type of element to extend, if the 'extends' attribute is set on the template
            const ext = templateAttrs.get('extends')
            let extType
            if (ext) {
                const invalid = ()=>Ewok.warn (`${ext} is not a valid element to extend.`)
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


            // THE GENERIC CUSTOM ELEMENT CLASS
            Ewok.classes[elementName] = class extends (extType || HTMLElement) {

                constructor() {
                    super();

                    //console.debug("🏗 "+elementName);

                    if (!this.hasAttribute('noshadow') && !options?.noshadow) {
                        this.attachShadow({mode: 'open'})
                    }
                }

                /////////////////////////////////////////////////////////////////

                connectedCallback() {

                    let event = new Event('connecting', {node: this});
                    this.dispatchEvent(event)

                    //console.debug("⚡ "+elementName);

                    this.setAttribute('loading', '')                    

                    let attachPoint = options?.noshadow ? this : this.shadowRoot || this
                    this.root = attachPoint
                    this.xref = Ewok.xref.bind(this.root)
                    let host = this.parentElement || this.getRootNode().host
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
                        
                        [...el.attributes].forEach(a=>{
                            let attr = a.value
                            // don't bother with Alpine attributes
                            if (/^(@|:|x-)/.test(a.name)) return

                            let oldattr
                            do {
                                oldattr = attr
                                attr = attr.replace(/~([\w$.]+\(.*\))/g, 'this.props.$1')
                                
                            } while (attr != oldattr)
                            el.setAttribute(a.name, attr);
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

                    // waiting for modules to resolve for the current component
                    // and all its parents 
                    Promise.all(promises).then((results)=>{
                        //console.debug("✨ "+elementName);
                        
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
                            if (v[0]=='*') {
                                let sliced = v.slice(1)
                                thisDataset[p] = Ewok.getObjPath(sliced, window)
                            }
                        }
                        this.props = {...hostProps, ...thismodule, ...thisDataset}
                        if (Ewok.Alpine) this.xdata = Alpine.evaluate(this, '$data')
                        if (this.xdata) this.props.xdata = this.xdata

                        //the parent (if applicable), and the module (if applicable) have been resolved
                        //and props have been set, so resolve self
                        this.resolver()

                        // connect a bunch of variables inside the private module to the outside
                        privateModules && privateModules.EwokAttach.apply(this) 
                                       //&& delete this.EwokAttach
                        
                        // attach props to every sub-element
                        clone.querySelectorAll('*').forEach((el) => {
                            el.props = this.props
                        })
                        
                        // append the template content
                        // and delete any temp element
                        injectContent.apply(this)
                        
                        
                        //run the component's mount function, if present
                        if (thismodule && thismodule.mount) thismodule.mount.apply(this, null)
                        
                        
                        //Alpine compatibility
                        Ewok.Alpine && this.shadowRoot && Alpine.initTree(this.shadowRoot)

                        
                        // interpolate {{variables}} in the template
                        interpolate(attachPoint,this.props)
                        // also interprolate potential slots on the element itself
                        this.shadowRoot && interpolate(this,this.props)
                        
                        this.removeAttribute('loading')
                        

                        //console.debug("✅ "+elementName);
                    })                
                    
                    event = new Event('connected', {detail: elementName});
                    event.elem = elementName
                    window.dispatchEvent(event)

                    //// functions //////////////////////////////////////////////////////////////

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

                    function interpolate(node, props, recur){
                        if (node.nodeName == "#document-fragment") {
                            for (let child of [...node.childNodes])
                                interpolate(child, props, true)
                            return
                        }

                        //text nodes
                        if (node.nodeName == '#text'){
                
                            let text = node.textContent
                            if ( text.includes('{{') ) node.textContent = Ewok.handlebars(text, props)

                        //attribute nodes
                        } else if (node.nodeType==2) {

                            let text = node.value
                            if ( text.includes('{{') ) node.textContent = Ewok.handlebars(text, props)
                            
                        //normal nodes
                        } else if (
                            node.nodeType === 1 && node.nodeName != 'SCRIPT' &&
                            // don't go into custom elements (handle them when it's their time)
                            !(recur && customElements.get( node.tagName.toLowerCase() ))
                            ) {
                                let original_xdata = props ? props.xdata : undefined
                                
                                if (Ewok.Alpine && original_xdata 
                                    && (node.hasAttribute('x-data') || node.hasAttribute('x-for'))) {
                                    // adapt props for the current x-data context
                                    props.xdata = Alpine.evaluate(node, '$data')
                                }
                                node.childNodes && [...node.childNodes]
                                    .forEach(n=>{interpolate(n,props)
                                });
                                [...node.attributes].forEach((attr)=>{
                                    interpolate(attr,props,true)
                                })

                                props && (props.xdata = original_xdata)
                        }
                    }

                }//connectedCallback

                disconnectedCallback(){
                    console.debug("💥", elementName)
                    delete this.props
                }
                            
            } //anonymous class
                    
            customElements.define(elementName, Ewok.classes[elementName], ext && {extends: ext})
            //console.debug("🧾 "+elementName);
            
        } //createTemplate()


        
        const handlebars = Ewok.handlebars
        const getObjectPath = Ewok.getObjectPath
        

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

    }, // Ewok.init
    
    handlebars: function(template, variables, fallback) {
        const regex = /\{\{[^{<"']+}}/g

        return template.replace(regex, (match) => {
            const path = match.slice(2, -2).split('|');
            return Ewok.getObjPath( path[0].trim(), variables, path[1] );
        });
    },

    //get the specified property or nested property of an object
    getObjPath: function(path, obj, fallback = '') {
        if (path[0] == '*') {obj=window; path=path.slice(1)}

        const pathArray = path.split('.')

        // look in global scope if variable missing in local scope
        // const first = pathArray.shift()
        // obj = obj[first] || window[first]
        
        let result = pathArray.reduce((res, key) => {              
            return (typeof res[key]=='function' 
                ? res[key]() 
                : res[key]) ?? fallback
        }
        , obj);
        if (Ewok.options.debug && result===''){
            Ewok.warn(`Interpolation of {{${path}}} failed with no fallback.`)
        }
        return result
        
    },

    xref: function(query){
        return this.querySelector(`[x-ref=${query}]`)
    },

    warn: function(msg) {
        console.warn('🙈 Ewok: '+msg)
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

    Alpine.magic('props', (el) => {
        return el.props
    })
    Alpine.magic('host', (el) => {
        return el.host
    })
    Alpine.magic('_', (el) => {
        return (data=el.props) => {
            if (!data) {
                Ewok.warn(`No data passed to $_ at ${el.nodeName}`)
                return
            }

            el.tmplt = el.tmplt || el.innerHTML
            let processedText

            const original_xdata = data.xdata
            if (data && data==el.props) {
                data.xdata = Alpine.evaluate(el, '$data')
            } else if (!data) {
                data = Alpine.evaluate(el, '$data')
            }
            processedText = Ewok.handlebars(el.tmplt, data)
            data.xdata = original_xdata

            return processedText
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