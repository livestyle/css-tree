/**
 * Builds editable tree from given CSS source
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var Node = require('./node');
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
		name = range(token.start, token.value);
		var isAtProperty = token.value[0] === '@';
		while (token = it.next()) {
			name.end = token.end;
			if (token.type === ':' || token.type === 'white') {
				name.end = token.start;
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
				name.end = token.start;
				value = range(token.start, 0);
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
			value = range(token.start, token.value);
			while ((token = it.next())) {
				value.end = token.end;
				if (token.type == 'line') {
					lastNewline = token;
				} else if (token.type == '}' || token.type == ';') {
					value.end = token.start;
					if (token.type == ';') {
						end = range(token.start, token.value);
					}
					it.next();
					break;
				} else if (token.type == ':' && lastNewline) {
					// A special case: 
					// user is writing a value before existing
					// property, but didn’t inserted closing semi-colon.
					// In this case, limit value range to previous
					// newline
					value.end = lastNewline.start;
					it._i = it.tokens.indexOf(lastNewline);
					break;
				}
			}
		}

		if (!value) {
			value = range(name.end, 0);
		}

		return {
			name: trimWhitespaceInRange(name, source),
			value: trimWhitespaceInRange(value, source, WS_START | (end ? WS_END : 0)),
			end: end || range(value.end, 0)
		};
	}

	/**
	 * Parses given CSS source and returns list of ranges of located CSS properties.
	 * Normally, CSS source must contain properties only, it must be,
	 * for example, a content of CSS selector or text between nested
	 * CSS sections
	 * @param  {Source} source CSS source
	 * @param {Number} offset Offset of properties subset from original source.
	 * Used to provide proper ranges of locates items
	 */
	function extractPropertiesFromSource(source, offset) {
		offset = offset || 0;
		source = source.replace(reSpaceEnd, '');
		var out = [];

		if (!source) {
			return out;
		}

		var tokens = cssParser.parse(source);
		var it = tokenIterator.create(tokens);
		var property;

		while ((property = consumeSingleProperty(it, source))) {
			out.push({
				nameText: property.name.substring(source),
				name: property.name.shift(offset),

				valueText: property.value.substring(source),
				value: property.value.shift(offset),

				endText: property.end.substring(source),
				end: property.end.shift(offset)
			});
		}

		return out;
	}

	/**
	 * Parses CSS properties from given CSS source
	 * and adds them to CSSEditContainer node
	 * @param  {CSSEditContainer} node
	 * @param  {String} source CSS source
	 * @param {Number} offset Offset of properties subset from original source
	 */
	function consumeProperties(node, source, offset) {
		var list = extractPropertiesFromSource(source, offset);

		list.forEach(function(property) {
			node._children.push(new CSSEditElement(node,
				editTree.createToken(property.name.start, property.nameText),
				editTree.createToken(property.value.start, property.valueText),
				editTree.createToken(property.end.start, property.endText)
				));
		});
	}

	function addChild(parent, section, src) {
		var node = new Node(src, {
			name: range.fromIndex(section.start, section._selectorEnd),
			value: range.fromIndex(section._contentStart, section.end)
		}, 'section');

		node.parent = parent;
		parent.children.push(node);
	};

	return {
		parse: function(css) {
			var pos = 0, tokens;

			if (Array.isArray(css)) {
				tokens = css;
				css = tokenizer.toSource(css);
			} else {
				tokens = tokenize(css);
			}

			var src = source(css);
			var root = new Node(src, {full: range(0, css)}, 'root');

			// rules are sorted in order they appear in CSS source
			// so we can optimize their nesting routine
			var insert = function(range, ctx) {
				while (ctx && ctx.range) {
					if (ctx.range.contains(range)) {
						return addChild(ctx, range, src);
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


			// XXX here!








			
			var currentSection = sections.shift();

			var topLevelSections = [];
			allRules.forEach(function(r) {
				var isTopLevel = !topLevelSections.some(function(tr) {
					return tr.contains(r);
				});

				if (isTopLevel) {
					topLevelSections.push(r);
				}
			});


			var nameRange = range.fromIndex(currentSection.start, currentRule._selectorEnd);
			var valueRange = range.fromIndex(currentSection._contentStart, currentRule.end);
			var rangeSet = {
				name: selectorRange,
				value: range.fromIndex(currentRule.start, currentRule._selectorEnd)
			};


			this._name = selectorRange.substring(source);
			this._positions.name = selectorRange.start;
			this._positions.contentStart = currentRule._contentStart + 1;

			var sectionOffset = currentRule._contentStart + 1;
			var sectionEnd = currentRule.end - 1;

			// parse properties between nested rules
			// and add nested rules as children
			var that = this;
			_.each(topLevelRules, function(r) {
				consumeProperties(that, source.substring(sectionOffset, r.start), sectionOffset);
				var opt = _.extend({}, that.options, {offset: r.start + that.options.offset});
				// XXX I think I don’t need nested containers here
				// They should be handled separately
				// that._children.push(new CSSEditContainer(r.substring(source), opt));
				sectionOffset = r.end;
			});

			// consume the rest of data
			consumeProperties(this, source.substring(sectionOffset, currentRule.end - 1), sectionOffset);
			this._saveStyle();


		}
	};
});