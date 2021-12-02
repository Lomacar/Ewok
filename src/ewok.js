(() => {
  
    window.Ewok = {
        options: {noshadow: false, stylesheet: null},
        dependencies: [],
        classes: {},
        sharedModules: {},
        xref,
        init
    }

    
    //== init
    
    // code that is injected in modules to add references to their host component
    const hooks = `let host, root, xref, xdata; 
    export function EwokAttach(){
        host = this
        root = host.root
        xref = Ewok.xref.bind(root)
        xdata = host.xdata
    };
    `

    //== createTemplate

    //== functions

    //== dependency

    //== ewokImporter   
    
    
    document.addEventListener('alpine:init', () => {
        // console.log("### ALPINE INIT ### ");
        
    
        Alpine.magic('props', (el) => {
            return el.props
        })
        Alpine.magic('host', (el) => {
            return el.host
        })
        Alpine.magic('_', (el) => {
            return (data=el.props) => {
                if (!data) {
                    warn(`No data passed to $_ at ${el.nodeName}`)
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
                processedText = handlebars(el.tmplt, data)
                data.xdata = original_xdata
    
                return processedText
            }
        })
        
    })
    
    document.addEventListener('alpine:initialized', () => {
        
        Ewok.Alpine = true
    
        // Ewok.shadowDive(document.body, "template[id]", (m)=>{
        //     m.setAttribute("x-ignore","");
        // })
    
        if (document.readyState === "complete") {
            // console.log("~~~ Ewok INIT  ~~~")
                init() 
        } else { 
            window.onload = function(){
                // console.log("~~~ Ewok INIT window load  ~~~")
                init()
            }
        }
    
        
    })

    
    window.onload = function(){
        // console.log("~~~ Ewok INIT window load  ~~~")
        !Ewok.Alpine && init()
    }

})();

