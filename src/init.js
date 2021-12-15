    function init(options=Ewok.options, selection = "template"){
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

        

        // create the classes to make each custom element work
        used_templates.forEach(x=>{createComponent(x, options)})

    }