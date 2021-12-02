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
                const children = [...frame.contentDocument.querySelectorAll('template[id]')];
                children.forEach(child => frame.before(child)); 
                frame.remove();
                // console.log('BALETED!');
            });
        }
    }
    customElements.define('ewok-import', EwokImportContent);