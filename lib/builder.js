/**
 * Builds editable tree from given CSS source
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var Section = require('./section');
	var Property = require('./property');
	var tokenizer = require('./css-tokenizer');
	var range = require('./range');
	var source = require('./source');
	var tokenIterator = require('./token-iterator');
	var sectionParser = require('./section-parser');

	var reSpaceStart = /^\s+/;
	var reSpaceEnd = /\s+$/;
	var whitespaceTokens = {'white': 1, 'line': 1, 'comment': 1};
	var WS_START = 1;
	var WS_END   = 2;

	function tokenize(css) {
		var pos = 0;
		return tokenizer.lex(css).map(function(token) {
			token.range = range(pos, token.value);
			pos = token.range.end;
			return token;
		});
	}

	/**
	 * Modifies given range to remove whitespace from beginning
	 * and/or from the end
	 * @param  {Range}  range Range to modify
	 * @param  {Source} source  Source text that range belongs to
	 * @param  {Number} mask  Mask indicating from which end 
	 * whitespace should be removed
	 * @return {Range}
	 */
	function trimWhitespaceInRange(range, source, mask) {
		mask = mask || (WS_START | WS_END);
		var text = source.substring(range), m;
		if ((mask & WS_START) && (m = text.match(reSpaceStart))) {
			range.start += m[0].length;
		}

		if ((mask & WS_END) && (m = text.match(reSpaceEnd))) {
			range.end -= m[0].length;
		}

		// in case given range is just a whatespace
		if (range.end < range.start) {
			range.end = range.start;
		}

		return range;
	}

	/**
	 * Skips white-space tokens in given iterator
	 * @param  {TokenIterator} it
	 */
	function skipWs(it) {
		while ((token = it.current())) {
			if (!(token.type in whitespaceTokens)) {
				break;
			}
			it.next();
		}
		return it;
	}

	/**
	 * Consumes CSS property and value from current token
	 * iterator state. Offsets iterator pointer into token
	 * that can be used for next value consmption
	 * @param  {TokenIterator} it
	 * @param  {Source} source
	 * @return {Object}    Object with `name` and `value` properties 
	 * as ranges. Value range can be zero-length.
	 */
	function consumeSingleProperty(it, source) {
		var name, value, end, lastNewline;
		var token = it.current();

		if (!token || !skipWs(it).hasNext()) {
			return null;
		}

		// consume property name
		token = it.current();
		name = token.range.clone();
		var isAtProperty = token.type === '@';
		while (token = it.next()) {
			name.end = token.range.end;
			if (token.type === ':' || token.type === 'white') {
				name.end = token.range.start;
				it.next();
				if (token.type == ':' || isAtProperty) {
					// XXX I really ashame of this hardcode, but I need
					// to stop parsing if this is an SCSS mixin call,
					// for example: @include border-radius(10px)
					break;
				}
			} else if (token.type == ';' || token.type == 'line') {
				// there’s no value, looks like a mixin
				// or a special use case:
				// user is writing a new property or abbreviation
				name.end = token.range.start;
				value = range(token.range.start, 0);
				it.next();
				break;
			}
		}

		token = it.current();
		if (!value && token) {
			if (token.type == 'line') {
				lastNewline = token;
			}
			// consume value
			value = token.range.clone();
			while ((token = it.next())) {
				value.end = token.range.end;
				if (token.type == 'line') {
					lastNewline = token;
				} else if (token.type == '}' || token.type == ';') {
					value.end = token.range.start;
					if (token.type == ';') {
						end = token.range.clone();
					}
					it.next();
					break;
				} else if (token.type == ':' && lastNewline) {
					// A special case: 
					// user is writing a value before existing
					// property, but didn’t inserted closing semi-colon.
					// In this case, limit value range to previous
					// newline
					value.end = lastNewline.range.start;
					it._i = it.tokens.indexOf(lastNewline);
					break;
				}
			}
		}

		if (!value) {
			value = range(name.end, 0);
		}

		return {
			name:  trimWhitespaceInRange(name, source),
			value: trimWhitespaceInRange(value, source, WS_START | (end ? WS_END : 0)),
			end:   end || range(value.end, 0)
		};
	}

	/**
	 * Parses CSS properties from given source range and returns list 
	 * of ranges of located CSS properties.
	 * Normally, CSS source must contain properties only, it must be,
	 * for example, a content of CSS selector or text between nested
	 * CSS sections
	 * @param  {Source} source CSS source
	 * @param {Range} offset Range from given source to parse
	 */
	function extractPropertiesFromRange(source, range) {
		var substr = source.substring(range).replace(reSpaceEnd, '');

		if (!substr) {
			return [];
		}

		var it = tokenIterator(tokenize(substr));
		var out = [], property, node;

		while ((property = consumeSingleProperty(it, substr))) {
			node = new Property(source, {
				name: property.name.shift(range.start),
				value: property.value.shift(range.start),
				after: property.end.shift(range.start)
			});

			out.push(node);
		}

		return out;
	}

	function addSection(parent, section, src) {
		var node = new Section(src, {
			name: range.fromIndex(section.start, section._selectorEnd),
			value: range.fromIndex(section._contentStart + 1, section.end - 1),
			after: range.fromIndex(section.end - 1, section.end)
		});

		node.parent = parent;
		parent.children.push(node);
		return node;
	}

	function parseProperties(tree) {
		var src = tree._source;

		// parse further
		tree.children.forEach(function(child) {
			if (!child.children.length) {
				child.children = extractPropertiesFromRange(src, child.range('value')).map(function(p) {
					p.parent = child;
					return p;
				});
			} else {
				parseProperties(child);
			}
		});

		// find ranges between sections to parse
		var prev = tree.parent ? tree.range('value').start : 0;
		var ranges = tree.children.map(function(child) {
			var fullRange = child.range('full');
			var r = range.fromIndex(prev, fullRange.start);
			prev = fullRange.end;
			return r;
		});

		// walk ranges in reverse order (to keep proper child indexes)
		// and insert parsed properties
		for (var i = ranges.length - 1, props; i >= 0; i--) {
			props = extractPropertiesFromRange(src, ranges[i]);
			for (var j = props.length - 1; j >= 0; j--) {
				props[j].parent = tree;
				tree.children.splice(i, 0, props[j]);
			}
		}

		return tree;
	}

	return {
		build: function(css) {
			var src = source(css);
			var root = new Section(src, {full: range(0, css)}, 'root');

			// rules are sorted in order they appear in CSS source
			// so we can optimize their nesting routine
			var insert = function(range, ctx) {
				while (ctx) {
					if (ctx.range('full').contains(range)) {
						return addSection(ctx, range, src);
					}

					ctx = ctx.parent;
				}

				// if we are here then given range is a top-level section
				return addSection(root, range, src);
			};

			var sections = sectionParser.sections(css);
			var ctx = root;
			sections.forEach(function(r) {
				ctx = insert(r, ctx);
			});

			return parseProperties(root);
		}
	};
});