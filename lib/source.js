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

		/**
		 * Returns location info about given character:
		 * line, character in line and textual hint
		 * @param  {Number} ch Character offset in source
		 * @return {Object}
		 */
		location: function(ch) {
			var reNl = /\r\n?/g;
			var source = this._code.replace(reNl, '\n');
			var part = this._code.substring(0, ch).replace(reNl, '\n');
			var lines = part.split('\n');
			
			var lineCh = (lines[lines.length - 1] || '').length + 1;
			var fullLine = source.split('\n')[lines.length - 1] || '';
			
			var chunkSize = 50;
			var offset = Math.max(0, lineCh - chunkSize);
			var formattedLine = fullLine.substr(offset, chunkSize * 2) + '\n';
			for (var i = 0; i < lineCh - offset - 1; i++) {
				formattedLine += '-';
			}
			formattedLine += '^';

			return {
				line: lines.length,
				col: lineCh,
				text: fullLine,
				hint: formattedLine
			};
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