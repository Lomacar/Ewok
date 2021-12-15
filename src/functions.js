    function injectContent(content, attachPoint, hasTemp){
        // if Ewok options specifies a stylesheet, insert it
        if (this.shadowRoot && Ewok.options?.stylesheet) {
            let stylelink = document.createElement('link')
                stylelink.setAttribute('rel', 'stylesheet')
                stylelink.setAttribute('href', options.stylesheet)
            this.shadowRoot.appendChild(stylelink)
        }

        //attach the main content, from the template
        attachPoint.appendChild(content) 
        //if there was temporary content, remove it
        hasTemp && attachPoint.querySelectorAll('[temp]').forEach(el=>el.remove())
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
            if ( text.includes('{{') ) node.textContent = handlebars(text, props)

        //attribute nodes
        } else if (node.nodeType==2) {

            let text = node.value
            if ( text.includes('{{') ) node.value = handlebars(text, props)
            
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

        
    function handlebars(template, variables, fallback) {
        const regex = /\{\{[^{<"']+}}/g

        return template.replace(regex, (match) => {
            const path = match.slice(2, -2).split('|');
            return getObjPath( path[0].trim(), variables, path[1] );
        });
    }

    //get the specified property or nested property of an object
    function getObjPath(path, obj, fallback = '') {
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
            warn(`Interpolation of {{${path}}} failed with no fallback.`)
        }
        return result
        
    }

    function xref(query){
        return this.querySelector(`[x-ref=${query}]`)
    }

    function warn(msg) {
        console.warn('🙈 Ewok: '+msg)
    }

    function shadowDive(el, selector, func) {
        let root = el.shadowRoot || el;
        root.querySelector(selector) && func(root.querySelector(selector), root);
        [...root.children].map(el => shadowDive(el, selector, func));
    }
    function assignProps(el, props) {
        for (child of el.children) {
            if (!customElements.get(child.tagName.toLowerCase())){
                child.props = props;
                assignProps(child, props)
            }
        }
    }