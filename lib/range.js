/**
 * Helper module to work with ranges
 */
'use strict';

function cmp(a, b, op) {
	switch (op) {
		case 'eq':
		case '==':
			return a === b;
		case 'lt':
		case '<':
			return a < b;
		case 'lte':
		case '<=':
			return a <= b;
		case 'gt':
		case '>':
			return a > b;
		case 'gte':
		case '>=':
			return a >= b;
	}
}

/**
 * @type Range
 * @constructor
 * @param {Object} start
 * @param {Number} len
 */
function Range(start, len) {
	if (typeof start === 'object' && 'start' in start) {
		// create range from object stub
		this.start = Math.min(start.start, start.end);
		this.end = Math.max(start.start, start.end);
	} else if (Array.isArray(start)) {
		this.start = start[0];
		this.end = start[1];
	} else {
		len = typeof len === 'string' ? len.length : +len;
		this.start = start;
		this.end = start + len;
	}
}

Range.prototype = {
	/**
	 * Returns <code>true</code> if passed range is equals to current one
	 * @param {Range} range
	 * @returns {Boolean}
	 */
	equal: function(range) {
		return this.cmp(range, 'eq', 'eq');
	},
	
	/**
	 * Shifts indexes position with passed <code>delta</code>
	 * @param {Number} delta
	 * @returns {Range} range itself
	 */
	shift: function(delta) {
		this.start += delta;
		this.end += delta;
		return this;
	},
	
	/**
	 * Check if two ranges are overlapped
	 * @param {Range} range
	 * @returns {Boolean}
	 */
	overlap: function(range) {
		return range.start <= this.end && range.end >= this.start;
	},
	
	/**
	 * Finds intersection of two ranges
	 * @param {Range} range
	 * @returns {Range} <code>null</code> if ranges does not overlap
	 */
	intersection: function(range) {
		if (this.overlap(range)) {
			var start = Math.max(range.start, this.start);
			var end = Math.min(range.end, this.end);
			return new Range(start, end - start);
		}
		
		return null;
	},
	
	/**
	 * Returns the union of the thow ranges.
	 * @param {Range} range
	 * @returns {Range} <code>null</code> if ranges are not overlapped
	 */
	union: function(range) {
		if (this.overlap(range)) {
			var start = Math.min(range.start, this.start);
			var end = Math.max(range.end, this.end);
			return new Range(start, end - start);
		}
		
		return null;
	},
	
	/**
	 * Returns a Boolean value that indicates whether a specified position 
	 * is in a given range.
	 * @param {Number} loc
	 */
	inside: function(loc) {
		return this.cmp(loc, 'lte', 'gt');
	},
	
	/**
	 * Returns a Boolean value that indicates whether a specified position 
	 * is in a given range, but not equals bounds.
	 * @param {Number} loc
	 */
	contains: function(loc) {
		return this.cmp(loc, 'lt', 'gt');
	},
	
	/**
	 * Check if current range completely includes specified one
	 * @param {Range} r
	 * @returns {Boolean} 
	 */
	include: function(r) {
		return this.cmp(r, 'lte', 'gte');
	},
	
	/**
	 * Low-level comparision method
	 * @param {Number} loc
	 * @param {String} left Left comparison operator
	 * @param {String} right Right comaprison operator
	 */
	cmp: function(loc, left, right) {
		var a, b;
		if (loc instanceof Range) {
			a = loc.start;
			b = loc.end;
		} else {
			a = b = loc;
		}
		
		return cmp(this.start, a, left || '<=') && cmp(this.end, b, right || '>');
	},
	
	/**
	 * Returns substring of specified <code>str</code> for current range
	 * @param {String} str
	 * @returns {String}
	 */
	substring: function(str) {
		return this.length > 0 
			? str.substring(this.start, this.end) 
			: '';
	},
	
	/**
	 * Creates copy of current range
	 * @returns {Range}
	 */
	clone: function() {
		return new Range(this.start, this.length);
	},
	
	/**
	 * @returns {Array}
	 */
	toArray: function() {
		return [this.start, this.end];
	},

	toJSON: function() {
		return this.toArray();
	},
	
	toString: function() {
		return this.valueOf();
	},

	valueOf: function() {
		return '{' + this.start + ', ' + this.length + '}';
	}
};

Object.defineProperty(Range.prototype, 'length', {
	enumerable: true,
	get: function() {
		return Math.abs(this.end - this.start);
	}
});

/**
 * Creates new range object instance
 * @param {Object} start Range start or array with 'start' and 'end'
 * as two first indexes or object with 'start' and 'end' properties
 * @param {Number} len Range length or string to produce range from
 * @returns {Range}
 */
module.exports = function(start, len) {
	if (typeof start == 'undefined' || start === null)
		return null;
		
	if (start instanceof Range) {
		return start;
	}

	if (Array.isArray(start)) {
		len = start[1] - start[0];
		start = start[0];
	} else if (typeof start == 'object' && 'start' in start && 'end' in start) {
		len = start.end - start.start;
		start = start.start;
	}
		
	return new Range(start, len);
};

module.exports.isRange = function(val) {
	return val instanceof Range;
};

/**
 * <code>Range</code> object factory, the same as <code>module.exports()</code>
 * but last argument represents end of range, not length
 * @returns {Range}
 */
module.exports.fromIndex = function(start, end) {
	if (typeof start === 'number' && typeof end === 'number') {
		end -= start;
	}
	
	return module.exports(start, end);
};

/**
 * Helper function that sorts ranges in order as they
 * appear in text
 * @param  {Array} ranges
 * @return {Array}
 */
module.exports.sort = function(ranges, reverse) {
	ranges = ranges.sort(function(a, b) {
		return a.start - b.start || b.end - a.end;
	});

	reverse && ranges.reverse();
	return ranges;
};