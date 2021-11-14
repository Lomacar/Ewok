# Ewok - Easy Web Components

![](https://cdn.icon-icons.com/icons2/1070/PNG/128/ewok_icon-icons.com_76943.png)

### Working with native web components shouldn't be complicated. Ewok.js is a small library with no dependencies that makes web components — a.k.a. custom elements — simple and fun.

Taking advantage of modern browser capabilities, Ewok allows you to design an entire component (markup, styling, and scripting) within a single template tag. This allows for a "Single File Component" (SFC) approach.

- - -



## Declare your components with just HTML, and then use.

The `id` of the template is the name of the custom element.

```html
<template id="my-element">
    <p>
        Hello, Endor.
    </p>
</template>

<!-- This will contain the contents of the template. -->
<my-element></my-element>
```



## Interpolation

You can use variables in your templates with {{handlebar}} notation. These variables can be listed as data-attributes on the custom element, or the template, they can be global JavaScript variables, or they can come from a script tag in the template.

```html
<template id="greet-planet">
    <p>
        Hello, {{planet}}.
    </p>
</template>

<!-- This will produce a paragraph saying "Hello, Hoth." -->
<greet-planet data-planet="Hoth"></greet-planet>
```

A $ before a variable indicates it should be found in the global scope.

```html
<template id="greet-planet" data-planet="$randomPlanet">
    <p>
        Hello, {{planet}}.
    </p>
</template>

<script>
    const planets = ["Endor", "Hoth", "Tatooine", "Bespin"]
    const randomPlanet = planets[Math.floor(Math.random()*planets.length)];
</script>

<!-- Produces a paragraph saying hello to a random planet. -->
<greet-planet></greet-planet>
```



## Scripting, or 'component state'

You can have a script tag inside your template. This will be treated as a module attached to each custom element instance so they can each have their own personal code sandbox for variables and functions. Only exported items will be accessible by the component, the rest will be private.

```html
<template id="greet-planet">
    <script>
        const privateVar = "I'll never tell."

        export let killCount = 0

        export function attackStormtroopers(){
            let success = Math.round(Math.random())
            this.killCount += success
            host.root.querySelector('.result').innerText = success ? 'Hit!' : "Miss"
            host.root.querySelector('.count').innerText = this.killCount
        }
    </script>
    
    <button onclick="this.props.attackStormtroopers()">Attack</button>
    <p class="result"></p>
    <p>Kill Count: <span class="count"></span></p>
</template>
```

