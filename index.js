/**
 * Builds editable tree from given CSS source
 */
'use strict';

var Root = require('./lib/root');
var Section = require('./lib/section');
var Property = require('./lib/property');
var Node = require('./lib/node');
var SelectorDeclaration = require('./lib/selector');
var tokenizer = require('./lib/css-tokenizer');
var range = require('./lib/range');
var source = require('./lib/source');
var tokenIterator = require('./lib/token-iterator');
var sectionParser = require('./lib/section-parser');

var reSpaceStart = /^\s+/;
var reSpaceEnd = /\s+$/;
var whitespaceTokens = {'white': 1, 'line': 1, 'comment': 1};
var WS_START = 1;
var WS_END   = 2;

function tokenize(css) {
	var tokens = tokenizer.lex(css);
	var pos = 0, token;
	for (var i = 0, il = tokens.length; i < il; i++) {
		token = tokens[i];
		token.range = range(pos, token.value);
		pos = token.range.end;
	}
	return tokens;
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
 * Skips some tokens that are not important for
 * consuming properties
 * @param  {TokenIterator} it
 */
function skipFormattingTokens(it) {
	var token;
	while ((token = it.current())) {
		if (!(token.type in whitespaceTokens) && token.type !== ';') {
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

	if (!token || !skipFormattingTokens(it).hasNext()) {
		return null;
	}

	// consume property name
	token = it.current();
	name = token.range.clone();
	var isAtProperty = token.type === '@';
	while (token = it.next()) {
		name.end = token.range.end;
		if (token.type === 'white' && it.hasNext() && it.peek().type === ':') {
			// Edge case: formatting space after variable definition
			// @a : 1;
			// --^
			token = it.next();
		}

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
			if (token.type === ';') {
				end = range(token.range.start, token.value);
			}

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
 * @param  {Source} src CSS source
 * @param {Range} offset Range from given source to parse
 */
function extractPropertiesFromRange(src, offset) {
	var substr = src.substring(offset).replace(reSpaceEnd, '');

	if (!substr) {
		return [];
	}

	var it = tokenIterator(tokenize(substr, offset));
	var subsource = source(substr);
	var out = [], property, node;

	while ((property = consumeSingleProperty(it, subsource))) {
		node = new Property(src, {
			name:    property.name.shift(offset.start),
			value:   property.value.shift(offset.start),
			between: range.fromIndex(property.name.end, property.value.start),
			after:   property.end.shift(offset.start)
		});

		out.push(node);
	}

	return out;
}

function addSection(parent, section, src) {
	var endOffset = section.end - 1;
	var str = src.valueOf();
	while (endOffset > 0) {
		if (/\s/.test(str[endOffset - 1])) {
			endOffset--;
		} else {
			break;
		}
	}

	var node = new Section(src, {
		name:    range.fromIndex(section.start, section._selectorEnd),
		between: range.fromIndex(section._selectorEnd, section._contentStart + 1),
		value:   range.fromIndex(section._contentStart + 1, endOffset),
		after:   range.fromIndex(endOffset, section.end)
	});

	node.parent = parent;
	parent.children.push(node);
	return node;
}

function parseProperties(tree) {
	var src = tree._source;

	// parse further
	var child;
	for (var i = 0, il = tree.children.length; i < il; i++) {
		child = tree.children[i];
		if (!child.children.length) {
			child.children = extractPropertiesFromRange(src, child.range('value'));
			for (var j = 0, jl = child.children.length; j < jl; j++) {
				child.children[j].parent = child;
			}
		} else {
			parseProperties(child);
		}
	}

	// find ranges between sections to parse
	// for sections use actual `value` range since `range('value')` will
	// return range composed of child nodes
	var targetRange = tree.type === 'root' ? tree.range('full') : tree._ranges.value;
	var prev = targetRange.start;
	var ranges = tree.children.map(function(child) {
		var fullRange = child.range('self');
		var r = range.fromIndex(prev, fullRange.start);
		prev = fullRange.end;
		return r;
	});

	ranges.push(range.fromIndex(prev, targetRange.end));

	// walk ranges in reverse order (to keep proper child indexes)
	// and insert parsed properties
	for (var i = ranges.length - 1, props; i >= 0; i--) {
		props = extractPropertiesFromRange(src, ranges[i]);
		for (var j = props.length - 1; j >= 0; j--) {
			props[j].parent = tree;
			tree.children.splice(i, 0, props[j]);
		}
	}

	tree.children.sort(function(a, b) {
		return a.range('name').start - b.range('name').start;
	});

	return tree;
}

/**
 * Restores tree from given JSON
 * @param  {Object} json
 * @return {Root}
 */
function fromJSON(json) {
	var src = source(json.src);
	var factory = function(data) {
		var ranges = {};
		if (data.r) {
			for (var p in data.r) {
				ranges[p] = range(data.r[p]);
			}
		}

		var node;
		if (data.t === 'root') {
			node = new Root(src);
		} else if (data.t === 'section') {
			node = new Section(src, ranges);
		} else if (data.t === 'property') {
			node = new Property(src, ranges);
		} else {
			throw new Error('Unknown node type: ' + data.t);
		}

		if (data.c) {
			data.c.forEach(function(child) {
				child = factory(child);
				child.parent = node;
				node.children.push(child);
			});
		}

		return node;
	};

	return factory(json);
}

module.exports = function(css) {
	if (css instanceof Node) {
		return css;
	}

	if (typeof css === 'object') {
		return fromJSON(css);
	}

	css = css || '';
	var src = source(css);
	var root = new Root(src);

	// rules are sorted in order they appear in CSS source
	// so we can optimize their nesting routine
	var insert = function(range, ctx) {
		while (ctx) {
			if (ctx.range('self').contains(range)) {
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
};

module.exports.Source = source;
module.exports.SelectorDeclaration = SelectorDeclaration;
module.exports.parseSelector = function(sel) {
	return new SelectorDeclaration(sel);
};
