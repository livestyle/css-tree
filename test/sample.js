var chalk = require('chalk');
var builder = require('../lib/builder');

var tree = builder.build('@import test;\na {b:c; d {foo:bar} }\n\te {bax:baq}');

function stringify(node, indent) {
	indent = indent || '';
	var out = indent + node.name;
	if (node.type === 'section') {
		out += ' {\n' + 
			node.children.map(function(child) {
				return stringify(child, indent + '\t');
			}).join('\n') +
			'\n' + indent + '}';
	} else {
		out += ': ' + node.value + ';';
	}

	return out;
}

function visualize(str) {
	return str.replace(/\t/g, chalk.gray('\\t'))
		.replace(/\n/g, chalk.gray('\\n'));
}

console.log(tree.children.map(function(node) {
	return stringify(node);
}).join('\n'));

tree.children.forEach(function(node) {
	console.log(['name', 'value', 'before', 'between', 'after'].map(function(key) {
		return key + ': "' + visualize(node[key]) + '"';
	}).join(', '));
})