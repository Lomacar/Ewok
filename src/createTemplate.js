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


        console.debug("🚩 "+elementName);

        // EXTENDED BUILT-IN ELEMENTS
        // get the type of element to extend, if the 'extends' attribute is set on the template
        const ext = templateAttrs.get('extends')
        let extType
        if (ext) {
            const invalid = ()=>warn (`${ext} is not a valid element to extend.`)
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

            connectedCallback() {

                let event = new Event('connecting', {node: this});
                this.dispatchEvent(event)

                console.debug("⚡ "+elementName);

                this.setAttribute('loading', '')

                //copy attributes from template tag onto custom element
                //unless that attribute is already set
                for (const a of templateAttrs) {
                    if (!this.hasAttribute(a[0])) {
                        this.setAttribute(a[0], a[1])
                    }
                }

                if (!this.hasAttribute('noshadow') && !options?.noshadow) {
                    this.attachShadow({mode: 'open'})
                }

                let attachPoint = options?.noshadow ? this : this.shadowRoot || this
                this.root = attachPoint
                this.xref = xref.bind(this.root)
                let host = this.parentElement || this.getRootNode().host
                let nested = host.hasOwnProperty('props')
                
                let clone = templateContent.cloneNode(true)
                
                // 'temp' (placeholder) elements
                let temp = clone.querySelector('[temp]')
                    temp = this.querySelector('[temp]') || temp
                    temp && attachPoint.appendChild(temp)
                
                

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
                        if (v[0]=='*') {
                            let sliced = v.slice(1)
                            thisDataset[p] = getObjPath(sliced, window)
                        }
                    }
                    this.props = {...hostProps, ...thismodule, ...thisDataset}
                    if (Ewok.Alpine) this.xdata = Alpine.evaluate(this, '$data')
                    if (this.xdata) this.props.xdata = this.xdata

                    // make a convenient reference to the host and parent shadowRoot of the custom el on every sub-element
                connectThings.call(this, clone)
                this.shadowRoot && connectThings.call(this, this)
                function connectThings(start){
                    start.querySelectorAll('*').forEach((el) => {
                        //el.host = this;
                        //el.root = attachPoint;
                        
                        // replace ~ shorthand with 'this.props'
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
                }

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
                    this.shadowRoot && this.querySelectorAll('*').forEach((el) => {
                        el.props = this.props
                    })

                    // append the template content
                    // and delete any temp element
                    injectContent.call(this, clone, attachPoint, !!temp)
                    
                    
                    //run the component's mount function, if present
                    if (thismodule && thismodule.mount) thismodule.mount.apply(this, null)
                    
                    
                    //Alpine compatibility
                    Ewok.Alpine && !nested && this.shadowRoot && Alpine.initTree(this.shadowRoot)
                    Ewok.Alpine && this.shadowRoot && Alpine.initTree(this)
                    
                    
                    // interpolate {{variables}} in the template
                    interpolate(attachPoint,this.props)
                    // also interprolate potential slots on the element itself
                    this.shadowRoot && interpolate(this,this.props)
                    
                    this.removeAttribute('loading')
                    

                    console.debug("✅ "+elementName);
                })                
                
                event = new Event('connected', {detail: elementName});
                event.elem = elementName
                window.dispatchEvent(event)

            }//connectedCallback

            disconnectedCallback(){
                console.debug("💥", elementName)
                delete this.props
            }
                        
        } //anonymous class
                
        customElements.define(elementName, Ewok.classes[elementName], ext && {extends: ext})
        console.debug("🧾 "+elementName);
        
    }