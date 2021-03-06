var assert = require('assert');
var fs = require('fs');
var path = require('path');
var build = require('../');

describe('CSS Tree', function() {
	var names = function(node) {
		return node.all().map(function(child) {
			return child.name;
		});
	};

	it('parse', function() {
		var tree = build('@import test;\na {b:c; d {foo:bar} e:f; }\n\tg {bax:baq}');

		assert.deepEqual(names(tree), ['@import', 'a', 'b', 'd', 'foo', 'e', 'g', 'bax']);
		assert.equal(tree.get(0).name, '@import');
		assert.equal(tree.get(0).value, 'test');

		assert.equal(tree.get(1).name, 'a');
		assert.equal(tree.get(1).before, '\n');
		assert.equal(tree.get(1).between, ' {');
		assert.equal(tree.get(1).after, ' }');

		tree = build('a {b:c;}\n@import test;');
		assert.deepEqual(names(tree), ['a', 'b', '@import']);

		// LESS mixin references
		tree = build('a{.b;}');
		assert.deepEqual(names(tree), ['a', '.b']);
		var node = tree.get('a').get('.b');
		assert.equal(node.name, '.b');
		assert.equal(node.value, '');
		assert.equal(node.between, '');
		assert.equal(node.after, ';');
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

	it('redundant semi-colons', function() {
		var tree = build('a{b{c:e}; d:f};');
		assert.deepEqual(names(tree), ['a', 'b', 'c', 'd']);
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

	it('best insertion point', function() {
		var tree = build('a {\n\tb:c;\n\n\td {\n\t\tfoo: bar;\n\t}\n\te {}\n}');
		var section = tree.get('a');
		var subsection = section.get('d');

		section.property('b2', 'c2');
		subsection.property('b3', 'c3');

		assert.equal(tree.valueOf(), 'a {\n\tb:c;\n\tb2:c2;\n\n\td {\n\t\tfoo: bar;\n\t\tb3: c3;\n\t}\n\te {}\n}');
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
		assert.equal(tree.valueOf(), 'a {b:c;foo:bar;}');
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

	it('serialization', function() {
		var css = '@import test;\na {b:c; d {foo:bar} }\n\te {bax:baq}';
		var tree = build(css);
		var json = tree.toJSON();

		assert.equal(json.src, css);
		assert.equal(json.t, 'root');
		assert.equal(json.c.length, 3);

		assert.equal(json.c[0].t, 'property');
		assert.deepEqual(json.c[0].r, {name: [0,7], between: [7,8], value: [8,12], after: [12,13]});

		// restore tree from JSON
		tree = build(json);
		assert.equal(tree.valueOf(), css);
		assert.equal(tree.children.length, 3);
		assert.equal(tree.children[0].valueOf(), '@import test;');
		assert.equal(tree.children[1].valueOf(), '\na {b:c; d {foo:bar} }');
	});

	it('selector declaration', function() {
		var rule = build('div.sample {}').sections[0];
		assert.equal(rule.selector.valueOf(), 'div.sample');
		rule.name = 'foo.bar';
		assert.equal(rule.selector.valueOf(), 'foo.bar');
	});

	it('modify empty document', function() {
		var tree = build();
		tree.addSection('d').property('e', 'f');
		assert.equal(tree.valueOf(), 'd {\n\te: f;\n}\n');

		tree = build('/* comment */');
		tree.addSection('d').property('e', 'f');
		assert.equal(tree.valueOf(), '/* comment */d {\n\te: f;\n}\n');
	});

	it('insert at-properties', function() {
		var tree = build('a{b:c}');
		tree.addProperty('@import', 'url()', 'first');
		assert.equal(tree.valueOf(), '\n@import url();a{b:c}');
	});

	it('changeset', function() {
		var css = 'a{b:c;d:e}';
		var tree = build(css);

		var section = tree.get('a');
		section.property('b', 'foo');
		section.get('d').remove();
		section.property('bar', 'baz');
		assert.deepEqual(tree.source.changeset, [[4, 5, 'foo'], [8, 11, ''], [8, 8, 'bar:baz;']]);

		// replay changes on another source
		var src = new build.Source(css);
		src.applyChangeset(tree.source.changeset);
		assert.equal(src.valueOf(),tree.source.valueOf());
	});

	it('backtick expressions', function() {
		var source = '.eval{\njs: `42`;\nmultiline: `(function(){var x = 1 + 1;\nreturn x})()`;}';
		var tree = build(source);
		var section = tree.get('.eval');
		assert.equal(section.property('js'), '`42`');
		assert.equal(section.property('multiline'), '`(function(){var x = 1 + 1;\nreturn x})()`');
	});

	it('comment parsing', function() {
		var source = fs.readFileSync(path.join(__dirname, 'css/comments.css'), 'utf8');
		var tree = build(source);

		assert.equal(tree.children.length, 2);
		assert.equal(tree.get(0).name, 'a');
		assert.equal(tree.get(1).name, 'baz');

		var baz = tree.get('baz');
		assert.equal(baz.children.length, 2);
		assert.equal(baz.get(0).name, 'a');
		assert.equal(baz.get(0).value, 'b');

		assert.equal(baz.get(1).name, 'j');
		assert.equal(baz.get(1).value, 'url(//foo)');
	});

	it('LESS variables', function() {
		var tree = build('@a: 1;@b : 2;');
		assert.equal(tree.get('@a').value, '1');
		assert.equal(tree.get('@b').value, '2');
	});

	it('SCSS variables', function() {
		var tree = build('$a: 1;$b : 2;');
		assert.equal(tree.get('$a').value, '1');
		assert.equal(tree.get('$b').value, '2');
	});
});
