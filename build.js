const fs = require('fs')
/////////////////////////

const input  = 'src/ewok.js'
const output = 'dist/ewok.js'
const root   = 'src/'

const ext    = '.js'

// looks for file with optional directory as: //== dir/file
const regex  = /\/\/== *([\w-\/]+)/g


const fileContent = fs.readFileSync(input).toString()


// replace the comment references with the corresponding file content
const replacement = fileContent.replace(regex, (match, group)=>{

    const comment = '//////// '+group+ext+' ////////\n\n'
    const replace = fs.readFileSync(root+group+ext).toString()
    return comment + replace

})

// write replacement to a file
fs.writeFileSync(output, replacement)