/**
 * A simple object wrapper around string that should be
 * used across editable nodes for a single CSS source
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	function Source(code) {
		if (!(this instanceof Source)) {
			return new Source(code);
		}

		this._code = code;
	}

	Source.prototype = {
		/**
		 * Replaces given range in current source code
		 * with given value
		 * @param  {String} value
		 * @param  {Range} range
		 * @return {Source}
		 */
		update: function(range, value) {
			if (range.start >= 0 && range.start <= this.length) {
				this._code = this._code.substring(0, range.start) + value + this._code.substring(range.end);
			}
			return this;
		},

		substring: function(range) {
			return range.substring(this._code);
		},

		valueOf: function() {
			return this._code;
		}
	};

	Object.defineProperty(Source.prototype, 'length', {
		enumerable: true,
		get: function() {
			return this._code.length;
		}
	});

	return Source;
});