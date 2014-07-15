/**
 * Simple and fast section parser for CSS
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var stringStream = require('string-stream');
	var range = require('./range');

	var reHasComment = /\/\*|\/\//;

	function isQuote(ch) {
		return ch == '"' || ch == "'";
	}

	/**
	 * Repeats given string <code>howMany</code> times
	 * @param {String} str
	 * @param {Number} howMany
	 * @return {String}
	 */
	function repeatString(str, howMany) {
		var out = '';
		while (howMany--) {
			out += str;
		}

		return out;
	}

	/**
	 * Fills substrings in `content`, defined by given ranges,
	 * with `ch` character
	 * @param  {String} content
	 * @param  {Array} ranges
	 * @return {String}
	 */
	function replaceRangesWith(content, ranges, ch, noRepeat) {
		if (ranges.length) {
			var offset = 0, fragments = [];
			ranges.forEach(function(r) {
				var repl = noRepeat ? ch : repeatString(ch, r.length);
				fragments.push(content.substring(offset, r.start), repl);
				offset = r.end;
			});

			content = fragments.join('') + content.substring(offset);
		}

		return content;
	}

	function tok(stream) {
		return range.fromIndex(stream.start, stream.pos);
	}

	return {
		/**
		 * Finds all CSS rules (sections) ranges in given CSS source
		 * @param  {String} css CSS source
		 * @return {Array} Array of section ranges
		 */
		sections: function(css) {
			css = this.sanitize(css);
			var stream = stringStream(css);
			var ranges = [], matchedRanges, ch;
			var self = this;

			var saveRule = function(r) {
				var selRange = self.extractSelector(content, r.start);
				var rule = range.fromIndex(selRange.start, r.end);
				rule._selectorEnd = selRange.end;
				rule._contentStart = r.start;
				ranges.push(rule);
			};

			while (ch = stream.next()) {
				if (isQuote(ch)) {
					if (!stream.skipString(ch)) {
						throw new Error('Unterminated string literal at ' + stream.pos);
					}

					continue;
				}

				if (ch == '{') {
					matchedRanges = this.matchBracesRanges(content, stream.pos - 1);
					matchedRanges.forEach(saveRule);

					if (matchedRanges.length) {
						stream.pos = matchedRanges[matchedRanges.length - 1].end;
						continue;
					} 
				}
			}
			
			return ranges.sort(function(a, b) {
				return a.start - b.start;
			});
		},

		/**
		 * Sanitizes given CSS content: replaces content that may 
		 * interfere with parsing (comments, interpolations, etc.)
		 * with spaces. Sanitized content MUST NOT be used for
		 * editing or outputting, it just simplifies searching
		 * @param  {String} content CSS content
		 * @return {String}
		 */
		sanitize: function(content) {
			content = this.stripComments(content);

			// remove preprocessor string interpolations like #{var}
			var stream = stringStream(content);
			var replaceRanges = [];
			var ch, ch2;

			while ((ch = stream.next())) {
				if (ch === '#' || ch === '@') {
					ch2 = stream.peek();
					if (ch2 === '{') { // string interpolation
						stream.start = stream.pos - 1;

						if (stream.skipTo('}')) {
							stream.pos += 1;
						} else {
							throw new Error('Invalid string interpolation at ' + stream.start);
						}

						replaceRanges.push(tok(stream));
					}
				} else {
					stream.skipQuoted();
				}
			}

			return replaceRangesWith(content, replaceRanges, 'a');
		},

		/**
		 * Replaces all comments in given CSS source with spaces,
		 * which allows more reliable (and faster) token search
		 * in CSS content
		 * @param  {String} css CSS content
		 * @return {String}
		 */
		stripComments: function(css) {
			if (!reHasComment.test(css)) {
				return css;
			}

			var stream = stringStream(css);
			var replaceRanges = [];
			var ch, ch2;

			while ((ch = stream.next())) {
				if (ch === '/') {
					ch2 = stream.peek();
					if (ch2 === '*') { // multiline CSS comment
						stream.start = stream.pos - 1;

						if (stream.skipTo('*/')) {
							stream.pos += 2;
						} else {
							// unclosed comment
							stream.skipToEnd();
						}

						replaceRanges.push(tok(stream));
					} else if (ch2 === '/') {
						// preprocessor’s single line comments
						stream.start = stream.pos - 1;
						while ((ch2 = stream.next())) {
							if (ch2 === '\n' || ch2 == '\r') {
								break
							}
						}

						replaceRanges.push(tok(stream));
					}
				} else {
					stream.skipQuoted();
				}
			}

			return replaceRangesWith(content, replaceRanges, ' ');
		},

		/**
		 * Matches curly braces content right after given position
		 * @param  {String} content CSS content. Must not contain comments!
		 * @param  {Number} pos     Search start position
		 * @return {Range}
		 */
		matchBracesRanges: function(content, pos, sanitize) {
			if (sanitize) {
				content = this.sanitize(content);
			}

			var stream = stringStream(content);
			stream.start = stream.pos = pos;
			var stack = [], ranges = [], ch;
			while (ch = stream.next()) {
				if (ch == '{') {
					stack.push(stream.pos - 1);
				} else if (ch == '}') {
					if (!stack.length) {
						throw new Error('Invalid source structure (check for curly braces)');
					}
					ranges.push(range.fromIndex(stack.pop(), stream.pos));
					if (!stack.length) {
						break;
					}
				} else {
					stream.skipQuoted();
				}
			}

			return ranges;
		}
	};
});