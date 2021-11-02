const Ewok = {
    dependencies: [],
    classes: {},
    
    init(options, selection = "template"){
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

        //find subcomponents
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

        //get a dependency-ordered list of templates/components
        let templateDependencies = new Graph([...used_templates], Ewok.dependencies)
        used_templates = topologicalSort(templateDependencies)

        //create the classes to make each custom element work
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
            let mod = false
            let templateScript = templateContent.querySelector('script')
            let templateScriptText
            if (templateScript) {
                templateScriptText = templateScript.textContent
                templateScript.remove()
                mod = true
            }



            console.debug("🚩 "+elementName);

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

                    console.debug("🏗 "+elementName);

                    if (!this.hasAttribute('noshadow')) {                        
                        this.attachShadow({mode: 'open'})
                    }           

                    //Alpine compatibility
                    //TODO: is this actually necessary?
                    if (this.hasAttribute('x-data')) Alpine.initTree(this)
                }


                connectedCallback() {

                    let event = new Event('connecting', {node: this});
                    this.dispatchEvent(event)

                    console.debug("⚡ "+elementName);

                    this.setAttribute('loading', '')

                    let attachPoint = this.shadowRoot || this
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
                    
                    // this block handles 'temp' (placeholder) elements
                    // and 'hasty' elements
                    let hasty = false //this.hasAttribute('hasty')
                    let temp = clone.querySelector('[temp]')
                    if (hasty) {
                        injectContent.apply(this) 
                        // we just appended the clone so we can't manipulate it any more
                        // but the later code assumes clone is still active
                        clone = attachPoint
                        //if the custom el is hasty but the template has a temp, delete it
                        temp && temp.remove() && (temp=null)
                    } else {
                        //only non-hasty elements need temp elements
                        //temp element in the custom element overrides any in the template
                        temp = this.querySelector('[temp]') || temp
                        temp && attachPoint.appendChild(temp)
                    }
                    
                    // make a convenient reference to the root of the custom el on every sub-element
                    clone.querySelectorAll('*').forEach((el) => {
                        el.host = this
                    })

                    let THIS = this
                    this.propsReady = new Promise(function(resolve, reject){
                        THIS.resolver = resolve;
		                THIS.rejecter = reject;
                    });

                    let parentPromise = nested ? host.propsReady : null
                    let promises = [parentPromise]

                    if (mod) {
                        let deviousHook = `let host; export function ewokAttachHost(){host = this};
                        `
                        //transfer code from template to element
                        let blob = new Blob([deviousHook + templateScriptText], {type: 'application/javascript'})
                        promises.push( import(URL.createObjectURL(blob)) )
                        URL.revokeObjectURL(blob)                                                                      
                    }

                    Promise.all(promises).then((results)=>{
                        
                        let thismodule = results[1]

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
                        this.props = {...hostProps, ...thismodule, ...thisDataset}

                        //the parent (if applicable), and the module (if applicable) have been resolved
                        //and props have been set, so resolve self
                        this.resolver()

                        // if component has a module assign 'this' (the component) to the host variable
                        thismodule && thismodule.ewokAttachHost.apply(this)

                        // interpolate {{variables}} in the component
                        interpolate(clone,this.props)
                        
                        // attach props to every sub-element
                        clone.querySelectorAll('*').forEach((el) => {
                            el.props = this.props
                        })

                        // for non-hasty elements, now is the time to append the template content
                        // and delete any temp element
                        //!this.hasAttribute('hasty') && 
                        injectContent.apply(this)
                        this.removeAttribute('loading')
                        
                        //run the component's mount function, if present
                        if (thismodule && thismodule.mount) thismodule.mount.apply(this, null)

                        //Alpine compatibility
                        alpinify.apply(this)

                    })                
                    
                    console.debug("✅ "+elementName);

                    event = new Event('connected', {detail: elementName});
                    event.elem = elementName
                    window.dispatchEvent(event)

                    //// functions //////////////////////////////////////////////////////////////

                    function interpolate (attachPoint, props){
        
                        [...attachPoint.children].forEach((x)=>{
                            if (x.nodeName != 'SCRIPT'){
                                let html = x.innerHTML
                                if ( html && html.includes('{{') ) x.innerHTML = handlebars(html, props)
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
            
        } //createTemplate()



        // function fill(data, el){
        //     let result = ''

        //     if (el.tagName) {
        //         //el is an element
        //         result = handlebars(el.innerHTML, data)
        //     } else if (typeof el === 'string') {
        //         //el is an attribute
        //         result = handlebars(el, data)
        //     }
            
        //     return result
        // }

        function handlebars(template, variables, fallback) {
            const regex = /\{\{[^{<"']+}}/g

            return template.replace(regex, (match) => {
                const path = match.slice(2, -2).split('|');
                return getObjPath( path[0].trim(), variables, path[1] );
            });
        }

        //get the specified property or nested property of an object
        function getObjPath(path, obj, fallback = '') {
             return path.split('.').reduce((res, key) => 
                (typeof res[key]=='function' 
                 ? res[key]() 
                 : res[key]) || fallback, obj);
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