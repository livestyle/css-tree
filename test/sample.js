var builder = require('../lib/builder');

var tree = builder.build('@import test; a {b:c; d {foo:bar} } e {bax:baq}');

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

console.log(tree.children.map(function(node) {
	return stringify(node);
}).join('\n'));