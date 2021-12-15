# Ewok - Easy Web Components

![](https://cdn.icon-icons.com/icons2/1070/PNG/128/ewok_icon-icons.com_76943.png)

### Working with native web components shouldn't be complicated. Ewok.js is a tiny library with no dependencies that makes web components simple and fun.

No JavaScript needed to set up! Ewok allows you to design an entire component (markup, styling, and scripting) within a single template tag. This allows for a "Single File Component" (SFC) approach. Ewok is designed to work entirely client-side, with no build step necessary; however, for performance you would probably want to combine your SFCs into one file, or just a few.

⚠ **Warning**: Ewok is in early development right now and subject to breaking changes.



- - -



## Declare your components with just HTML, and then use.

The `id` of the template matches the name of the custom element. (Custom elements need to be lowercase and have a dash `-`.)

```html
<template id="my-element">
    <p>
        Hello, Endor.
    </p>
</template>

<!-- This will contain the contents of the template. -->
<my-element></my-element>

<!-- This is all you need to get Ewok up and running. -->
<script src="/js/ewok.js"></script>
```



## Interpolation

You can use variables in your templates with {{handlebar}} notation. These variables can be listed as data-attributes on the custom element, or the template, they can be global JavaScript variables, or they can come from a script tag inside the template.

```html
<template id="greet-planet">
    <p class="{{temperature}}">
        Hello, {{planet}}.
    </p>
</template>

<!-- This will produce a paragraph saying "Hello, Hoth." -->
<greet-planet data-planet="Hoth" data-temperature="cold"></greet-planet>
```

An asterisk `*` at the beginning of a data-attribute value indicates that it is a variable found in the global scope.

```html
<template id="greet-planet" data-planet="*randomPlanet">
    <p>
        Hello, {{planet}}.
    </p>
</template>

<script>
    var planets = ["Endor", "Hoth", "Tatooine", "Bespin"]
    var randomPlanet = ()=>{return planets[Math.floor(Math.random()*planets.length)]}
</script>

<!-- Produces a paragraph saying hello to a random planet. -->
<greet-planet></greet-planet>
```

<!--**Note:** a data-attribute on a custom element will override a data-attribute from its template if they have the same name.-->

- If the the handlebars expression begins with '*', like `{{*data}}` then it will be treated as a global variable name.
- Variables can use dot notation to access deeper properties of objects and arrays, like `{{data.users.0.name}}`.
- If any part of the chain is a function it will be called, but no arguments can be passed. Do NOT use parentheses after a function name. For example, just use `{{data.calculateResult}}`.
- A fallback value can be given after a pipe character, in case the desired variable is not found: `{{user.post|Nothing here.}}`



## Internal scripts, component state

You can have a script tag inside your template. This will be treated as a module attached to each custom element instance so they can each have their own personal code sandbox for variables and functions. Only exported items will be accessible by the component, the rest will be private.

```html
<template id="shoot-stuff">
    <script>
        const privateVar = "I'll never tell."

        export let killCount = 0

        export function shoot(){
            let success = Math.round(Math.random())
            this.killCount += success
            xref('result').innerText = success ? 'Hit!' : 'Miss'
            xref('count').innerText = this.killCount
        }
    </script>
    
    <button onclick="this.props.shoot()">Shoot</button>
    <p x-ref="result"></p>
    <p>Kill Count: <span x-ref="count"></span></p>
</template>
```

- Since scripts are converted to modules, you can use top-level `await` within the component script context.
- By default every component instance maintains its own copy of the script, and any variables used within. If you want to share Javascript between components of the same type use the ‘shared’ property on the script tag: `<script shared>`. You can have multiple script tags in a component so one could be shared and another could be private.

<!--**Note:** Exported module variables override data-attributes on the *template*, if they have the same name (e.g. `export let name = 'Wicket'` will override `data-name="Widdle"`), but the same data-attribute on the *custom element* overrides everything.-->



## Integration with Alpine

Ewok doesn't handle data-binding, reactivity, or fancy templating stuff like for-loops, but it has a friend who does: [Alpine.js​](https://alpinejs.dev/). Ewok is designed to integrate automatically with Alpine if it is present. Here is a super easy counter example using Alpine.

```html
<template id="alpine-counter" x-data='{count: 0}'>
    <button @click="count++"> ▲ </button>
    <button @click="count--"> ▼ </button>
    <input type="number" x-model="count">
</template>

<alpine-counter></alpine-counter>
```

<!--You can define `x-data` and other Alpine attributes on the template or on the custom element, because Ewok copies all* attributes from the template element to the custom element, but existing attributes on the custom element take precedence and are preserved.-->
<!--\* (some things like `id` are not copied)-->

Ewok adds a few "magics" to Alpine to make working with components and data easier:

- **$props**
  This is a shortcut to the props object that lives in each component and stores all the module variables and data-attribute variables
- **$host**
  Just a shortcut to select the top node of the custom element.
- **$_**
  This special magic gives you super-charged (reactive) interpolation. It is meant to be used with [x-text](https://alpinejs.dev/directives/text) and [x-html ](https://alpinejs.dev/directives/html) on a component that has text content with handlebar expressions.

(Examples forthcoming.)


## Importing components

You probably don't want to define your all your templates in the same page where you use them! Ewok has it's own component to import your components: `<ewok-import>`. The following is an example of storing common page elements in a `layouts.html` file for re-use across your website.

```html
<!-- Place this anywhere in document. Even outside the <html> tag seems to work, but probably not advisable! -->
<ewok-import src="/components/layout.html"></ewok-import>

<body>
	<page-header></page-header>
    
    <page-content title="Welcome">
    	<section slot="text">
        	Lorem ipsum dolor sit amet consectetur adipisicing elit. 
            Natus quas, soluta illum dolor ex nam fugit doloremque, voluptatum repudiandae.
            Ut pariatur voluptate officiis reprehenderit esse iste impedit mollitia nostrum quos?
        </section>
    </page-content>
    
    <page-footer></page-footer>
</body>
```



## Extending built-in HTML elements

If you want to make customized versions of regular HTML elements, use `extends` on your template, and `is` on the element you want to customize. 

```html
<template id="expanding-list" extends="ul">
    <script>
        export function mount(){

            let lh = '1.4em'
            let open = false

            host.style.height = host.style.lineHeight = lh

            host.onclick = ()=>{
                open = !open
                host.style.height = open ? host.scrollHeight + "px" : lh;
            }
        }
    </script>
    <style>
        ul { transition: all 0.3s; overflow: hidden; }
    </style>
</template>

<ul is="expanding-list">
    <li>Click to open</li>
    <li>Wicket</li>
    <li>Widdle</li>
    <li>Weechee</li>    
</ul>
```



## Styling components

One nice thing about components is that you can declare CSS inside them and it won't leak out, and CSS from outside won't interfere with the internals of components. With this template you can have "crazy-link" elements with magical rainbow colors, without affecting styles anywhere else.

```html
<style>
    a {color: blue} /* boring */
</style>

<template id="crazy-link">
    <style>
        a {
            background-image: linear-gradient(to left,
                violet, indigo, blue, green, yellow, orange, red
            );   
		    -webkit-background-clip: text;
		  	color: transparent;
        }
        a:before, a:after { content: '⭐' }
    </style>
    
    <!-- No boring blue links here! -->
    <a href="{{src}}">{{text}}</a>
</template>

<crazy-link data-src="foo.html" data-text="I dare you to click me."></crazy-link>
```

But what if you *do* want to interfere with styles from the outside? 🤔 For example, what if you want to apply a pre-made CSS theme to your website without having to manually tweak all your hand-crafted components? With Ewok you can inject a common stylesheet into all your components using `Ewok.options.stylesheet = "/css/theme.css"` or whatever you call your styles.



## Optional ‘shadowless components’ (plain custom elements)

By default, Ewok components use [shadow DOMs](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_shadow_DOM) (i.e. they have shadow roots). If all you want is a way to re-use HTML, without all the features—and potential complications—of shadow DOM components, then you can simply tag a template or element instance with the attribute `noshadow`. Or you can turn off shadow roots completely with `Ewok.options.noshadow = true`.

```html
<template id="shadowless-element" noshadow>
    <h1>Behold</h1>
    <p>I have no shadow. Styles pass right into me.</p>
    <script>
        export const note="You can still have internal, private scripts like this."
    </script>
    <p>
        Alpine, {{interpolation}} and most other Ewok features still work too.
    </p>
</template>
```
