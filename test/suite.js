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
		assert.equal(tree.get(1).after, ' }');
	});

	it('parse & check ranges', function() {
		var tree = build('a{b:c;}');
		var rule = tree.get('a');
		
		assert.deepEqual(rule.range('name').toArray(), [0, 1]);
		assert.deepEqual(rule.range('value').toArray(), [2, 6]);
		
		var property = rule.get(0);
		assert.deepEqual(property.range('name').toArray(), [2, 3]);
		assert.deepEqual(property.range('value').toArray(), [4, 5]);
		
		assert.equal(property.value, 'c');
		assert.equal(rule.indexOf('b'), 0);
		assert.equal(rule.name, 'a');
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

	it('preserve formatting', function() {
		var rule;

		rule = build('img {\n\tborder: 1px solid red !important; /* comment */\n\tfont: "arial", sans-serif;\n}').get(0);
		rule.property('color', 'red');
		assert.equal(rule.valueOf(), 'img {\n\tborder: 1px solid red !important; /* comment */\n\tfont: "arial", sans-serif;\n\tcolor: red;\n}');
		
		rule = build('.a {\n\tcolor: black;\n\t}').get(0);
		rule.property('font', 'bold');
		assert.equal(rule.valueOf(), '.a {\n\tcolor: black;\n\tfont: bold;\n\t}');
		
		rule = build('a {\n\tb: c;\n\t/* c */\n\td: e;\n}').get(0);
		rule.property('f', 'g', 1);
		assert.equal(rule.valueOf(), 'a {\n\tb: c;\n\tf: g;\n\t/* c */\n\td: e;\n}');
		
		rule.property('h', 'i');
		assert.equal(rule.valueOf(), 'a {\n\tb: c;\n\tf: g;\n\t/* c */\n\td: e;\n\th: i;\n}');
	});

	it('incomplete rules', function() {
		// without colon
		var rule = build('a{b\nc:d;}').get(0);
		assert.equal(rule.get(0).name, 'b');
		assert.equal(rule.get(1).name, 'c');

		rule.property('b', 'test');
		assert.equal(rule.valueOf(), 'a{b:test;\nc:d;}');

		// with colon
		rule = build('a{b:\nc:d;}').get(0);
		assert.equal(rule.get(0).name, 'b');
		assert.equal(rule.get(1).name, 'c');

		rule.property('b', 'test');
		assert.equal(rule.valueOf(), 'a{b:test;\nc:d;}');
	});

	it('section modification', function() {
		var tree, rule;
		
		// simple cloning
		rule = build('a{b:c;}').section('a');
		rule.addSection('d').property('e', 'f');
		assert.equal(rule.valueOf(), 'a{b:c;d{e:f;}}');

		// preserve formatting
		tree = build('a {\n\tb: c;\n}');
		tree.addSection('d').property('e', 'f');
		assert.equal(tree.children.length, 2);
		assert.equal(tree.valueOf(), 'a {\n\tb: c;\n}\nd {\n\te: f;\n}');

		tree.section('d').remove();
		assert.equal(tree.children.length, 1);
		assert.equal(tree.valueOf(), 'a {\n\tb: c;\n}\n');
	});
});