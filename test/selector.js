var assert = require('assert');
var selector = require('../lib/selector');

describe('CSS selector', function() {
	var stringify = function(item) {
		return item.valueOf();
	};

	var list = function(decl) {
		return decl.list.map(stringify);
	};

	var parts = function(sel) {
		return sel.parts.map(stringify);
	};

	it('parse', function() {

		var decl = selector('a, b');
		assert.equal(decl.list.length, 2);
		assert.deepEqual(list(decl), ['a', 'b']);

		decl = selector('a,\n/* comment */ b');
		assert.equal(decl.list.length, 2);
		assert.deepEqual(list(decl), ['a', 'b']);

		decl = selector('div[data="foo,bar"]:hover, .sample, a > b c + d');
		assert.equal(decl.list.length, 3);
		assert.deepEqual(list(decl), ['div[data="foo,bar"]:hover', '.sample', 'a > b c + d']);
	});

	it('find parts', function() {
		var sel = selector('#nav ul.menu > li a').list[0];

		assert.equal(sel.parts.length, 4);
		assert.deepEqual(parts(sel), ['#nav', 'ul.menu', 'li', 'a']);

		assert.equal(sel.fragments.length, 8);
		assert.deepEqual(sel.fragments, ['#nav', ' ', 'ul', '.menu', ' > ', 'li', ' ', 'a']);

	});

	it('find fragments', function() {
		var part = selector('div.sample#main[data="foo,bar"]:hover').list[0].parts[0];

		assert.equal(part.fragments.length, 5);
		assert.deepEqual(part.fragments, ['div', '.sample', '#main', '[data="foo,bar"]', ':hover']);
	});
});