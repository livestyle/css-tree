if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var Node = require('./node');
	var utils = require('./utils');

	function Property(source, ranges) {
		if (!(this instanceof Node)) {
			return new Property(source, ranges);
		}

		Node.call(this, source, ranges, 'property');
	}

	return utils.inherit(Property, Node);
});