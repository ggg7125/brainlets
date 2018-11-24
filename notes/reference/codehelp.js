//setting array2 = array1 creates a REFERENCE not a copy. to get a copy do array2 = array1.slice()

var fs = require('fs') //file system, can write txt files and stuff
fs.writeFileSync("hello.txt", "hello my friend")
console.log(fs.readFileSync("hello.txt").toString())