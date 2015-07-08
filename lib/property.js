'use strict';

var Node = require('./node');
var utils = require('./utils');

function Property(source, ranges) {
	if (!(this instanceof Node)) {
		return new Property(source, ranges);
	}

	Node.call(this, source, ranges, 'property');
}

module.exports = utils.inherit(Property, Node);