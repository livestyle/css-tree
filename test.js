var gonzales = require('gonzales-pe');
var css = 'a[href="d"]{ /*  x  */ color: red\ntes }';
var ast = gonzales.srcToAST({
	src: css,
	needInfo: true
});


console.log(ast[1][1]);