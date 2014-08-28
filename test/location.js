var assert = require('assert');
var source = require('../lib/source');

describe('Source location', function() {
	it('locate character', function() {
		var src = source('padding: 10px;\nmargin: 8px;\ncolor: red;');
		
		var loc = src.location(9);
		assert(loc.line, 1);
		assert(loc.col, 10);

		loc = src.location(18);
		assert(loc.line, 2);
		assert(loc.col, 4);

		loc = src.location(27);
		assert(loc.line, 2);
		assert(loc.col, 13);

		loc = src.location(28);
		assert(loc.line, 3);
		assert(loc.col, 1);
	});
});