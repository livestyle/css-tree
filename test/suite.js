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
		section.property('bam', 'baz', 0);

		assert.equal(section.children.length, 3);

		assert.equal(section.property('b'), 'ddd');
		assert.equal(section.property('foo'), 'bar');
		assert.equal(section.property('bam'), 'baz');

		assert.equal(tree.valueOf(), 'a {bam:baz;b:ddd;foo:bar;} d{}');
	});

	it('remove property', function() {
		var tree = build('a {b:c;d:e;f:g} h{}');
		var section = tree.get('a');

		section.get('d').remove();
		assert.equal(tree.valueOf(), 'a {b:c;f:g} h{}');
	});

	it('add & remove property', function() {
		var tree = build('a {b:c;} h{}');
		var section = tree.get('a');

		section.property('foo', 'bar');
		section.get('b').remove();

		assert.equal(section.property('foo'), 'bar');
		assert.equal(tree.valueOf(), 'a {foo:bar;} h{}');
	});

	it('ensure terminating semicolon', function() {
		var tree = build('a {b:c}');
		var section = tree.get('a');

		section.property('foo', 'bar');

		assert.equal(section.property('b'), 'c');
		assert.equal(section.property('foo'), 'bar');
		assert.equal(tree.valueOf(), 'a {b:c;foo:bar}');
	});
});