var assert = require('assert');
var build = require('../lib/builder').build;

describe('CSS Tree', function() {
	it('parse', function() {
		var tree = build('@import test;\na {b:c; d {foo:bar} }\n\te {bax:baq}');
		var names = tree.all().map(function(node) {
			return node.name;
		});

		assert.deepEqual(names, ['@import', 'a', 'b', 'd', 'foo', 'e', 'bax']);
		assert.equal(tree.get(0).name, '@import');
		assert.equal(tree.get(0).value, 'test');

		assert.equal(tree.get(1).name, 'a');
		assert.equal(tree.get(1).before, '\n');
		assert.equal(tree.get(1).between, ' {');
		assert.equal(tree.get(1).after, '}');
	});

	it('modify section', function() {
		var tree = build('a {b:c}\nd {e:f}');

		assert.equal(tree.get(0).name, 'a');
		tree.get(0).name = 'foo';
		assert.equal(tree.get(0).name, 'foo');

		assert.equal(tree.get(1).name, 'd');
		tree.get(1).name = 'bar';
		assert.equal(tree.get(1).name, 'bar');

		assert.equal(tree.valueOf(), 'foo {b:c}\nbar {e:f}');
	});

	it('modify property', function() {
		var tree = build('a {b:c;d:e}');
		var section = tree.get(0);

		assert.equal(section.get(0).name, 'b');
		assert.equal(section.get(0).value, 'c');
		
		section.get(0).name = 'foo';
		section.get(0).value = 'bar';
		
		assert.equal(section.get(0).name, 'foo');
		assert.equal(section.get(0).value, 'bar');

		assert.equal(section.property('foo'), 'bar');
		assert.equal(section.property('bar'), undefined);

		assert.equal(tree.valueOf(), 'a {foo:bar;d:e}');
	});

	it('add property', function() {
		var tree = build('a {b:c;} d{}');
		var section = tree.get('a');

		section.property('b', 'ddd');
		section.property('foo', 'bar');

		assert.equal(section.children.length, 2);

		assert.equal(section.property('b'), 'ddd');
		assert.equal(section.property('foo'), 'bar');

		assert.equal(tree.valueOf(), 'a {b:ddd;foo:bar;} d{}');
	});
});