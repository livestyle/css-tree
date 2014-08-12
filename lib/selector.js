/**
 * Module for working with selectors: parse, read and modify rule’s
 * selector 
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var stringStream = require('string-stream');
	var sectionParser = require('./section-parser');

	var reComma = /,/;
	var reNameSeparator = /[>\+\~\s]/;
	var reNameModifiers = /[\.#%:]/;
	var reSelSpaces = /[ \t\n]+/g;

	function sanitize(sel) {
		return sectionParser.stripComments(normalize(sel), '');
	}

	function normalize(sel) {
		return sel.trim().replace(reSelSpaces, ' ');
	}

	/**
	 * Normalizes attribute definition in given CSS definition
	 * @param  {String} attr
	 * @return {String}
	 */
	function normalizeAttribute(attr) {
		if (attr.charAt(0) == '[') {
			attr = stripped(attr);
		}

		attr = attr.trim();
		return '[' + attr.replace(/^([\w\-]+)\s*(\W?=)\s*/, '$1$2') + ']';
	}

	/**
	 * Returns stripped string: a string without first and last character.
	 * Used for “unquoting” strings
	 * @param {String} str
	 * @returns {String}
	 */
	function stripped(str) {
		return str.substring(1, str.length - 1);
	}

	function unifyPart(part) {
		var stream = stringStream(part), ch;
		var out = '';
		while (ch = stream.next()) {
			if (ch == '[') {
				stream.backUp(1);
				stream.start = stream.pos;
				stream.skipToPair('[', ']', true);
				out += normalizeAttribute(stream.current());
			} else {
				out += ch;
			}
		}

		return out;
	}

	/**
	 * @param  {String} op
	 * @return {String}
	 */
	function normalizeOperator(op) {
		if (!op) {
			return '';
		}

		op = op.replace(/\s+/g, ' ');
		if (op !== ' ') {
			op = op.trim();
		}

		return op;
	}

	function stringifyParts(parts) {
		return parts.map(function(part) {
			return part.toString();
		}).join(' ').trim();
	}

	function parseDeclaration(decl) {
		var selectors = [];
		var add = function(sel) {
			sel && selectors.push(new Selector(sel));
			return selectors;
		};
		
		if (!reComma.test(decl)) {
			// nothing to split
			return add(decl);
		}

		var stream = stringStream(decl), ch;
		while (ch = stream.next()) {
			 if (ch == '(') {
				stream.backUp(1);
				if (!stream.skipToPair('(', ')', true)) {
					stream.backUp(-1);
					continue;
				}
			} else if (ch == '[') {
				stream.backUp(1);
				if (!stream.skipToPair('[', ']', true)) {
					stream.backUp(-1);
					continue;
				}
			} else  if (ch == ',') {
				add(stream.current(true));
				stream.start = stream.pos;
			} else {
				stream.skipQuoted();
			}
		}

		return add(stream.current());
	}

	/**
	 * Splits given selector by parts.
	 * For example, in `#nav > li + a span` parts are: `[#nav, li, a, span]`
	 * @param  {String} sel
	 * @return {Array}
	 */
	function splitSelectorByParts(sel) {
		var stream = stringStream(sel);
		var parts = [], op = '', ch;
		var add = function(part, op, start) {
			if (part) {
				parts.push(new SelectorPart(part, op, start));
			}

			return parts;
		};

		while (ch = stream.next()) {
			if (reNameSeparator.test(ch)) {
				add(stream.current(true), op, stream.start);
				stream.start = stream.pos - 1;
				stream.eatWhile(reNameSeparator);
				op = stream.current();
				stream.start = stream.pos;
			} else if (ch == '[') {
				stream.backUp(1);
				if (!stream.skipToPair('[', ']', true)) {
					break;
				}
			} else if (ch == '(') {
				stream.backUp(1);
				if (!stream.skipToPair('(', ')', true)) {
					break;
				}
			}
		}

		return add(stream.current(), op, stream.start);
	}

	function parsePart(part) {
		var out = [];
		part = unifyPart(part);
		var stream = stringStream(part), ch;
		while (ch = stream.next()) {
			if (reNameModifiers.test(ch)) {
				out.push(stream.current(true));
				stream.start = stream.pos - 1;
				if (ch == ':' && stream.peek() == ':') {
					stream.next();
				}
			} else if (ch == '[') {
				out.push(stream.current(true));
				// consume attribute set
				stream.backUp(1);
				stream.start = stream.pos;
				if (!stream.skipToPair('[', ']', true)) {
					break;
				}

				out.push(stream.current());
				stream.start = stream.pos;
			} else if (ch == '(') {
				stream.backUp(1);
				if (!stream.skipToPair('(', ')', true)) {
					throw new Error('Unable to parse ' + part);
				}
			}
		}

		out.push(stream.current());
		return out.filter(function(fragment) {
			return !!fragment;
		});
	}

	/**
	 * A selector declaration. May consist of multiple comma-separated selectors,
	 * e.g. `body, div.content`. Selector declaration is lazy-parsed so it’s save to
	 * create many instances of this class
	 * @param {String} sel A selector declaration
	 */
	function SelectorDeclaration(decl) {
		if (!(this instanceof SelectorDeclaration)) {
			return new SelectorDeclaration(decl);
		}

		this._decl = sanitize(decl);
		this._list = null;
	}

	SelectorDeclaration.prototype = {
		/**
		 * Adds new selectors to declaration list
		 * @param {Selector} sel Selector or array of selectors to add
		 */
		add: function(sel) {
			if (!Array.isArray(sel)) {
				sel = [sel];
			}

			var list = this.list;
			sel.forEach(function(item) {
				if (!(item instanceof Selector)) {
					item = new Selector(item);
				}
				list.push(item);
			});
			return list;
		},

		/**
		 * Creates a copy of current selector declaration
		 * @return {SelectorDeclaration}
		 */
		clone: function() {
			return new SelectorDeclaration(this.valueOf());
		},

		valueOf: function() {
			return this.list.map(function(item) {
				return item.valueOf();
			}).join(', ');
		},

		toString: function() {
			return this.valueOf();
		}
	};

	Object.defineProperties(SelectorDeclaration.prototype, {
		/**
		 * List of all selectors in current declaration
		 * @type {Array}
		 */
		list: {
			enumerable: true,
			get: function() {
				if (!this._list) {
					this._list = parseDeclaration(this._decl);
				}

				return this._list;
			}
		},

		length: {
			enumerable: true,
			get: function() {
				return this.valueOf().length;
			}
		},
	});

	/**
	 * A single selector in comma-separated declaration
	 * @param {String} sel
	 */
	function Selector(sel) {
		this._sel = sel.trim();
		this._parts = null;
	}

	Selector.prototype = {
		removePart: function(part, op) {
			var parts = this.parts;
			if (part instanceof SelectorPart) {
				this._parts = parts.filter(function(item) {
					return item !== part;
				});
			} else {
				this._parts = parts.filter(function(item) {
					return !(item.toString() === part && (typeof op === 'undefined' || item.op === op))
				});
			}
		},

		clone: function() {
			return new Selector(this.valueOf());
		},

		valueOf: function() {
			return stringifyParts(this.parts);
		},

		toString: function() {
			return this.valueOf();
		}
	};

	Object.defineProperties(Selector.prototype, {
		length: {
			enumerable: true,
			get: function() {
				return this.valueOf().length;
			}
		},

		/**
		 * Parts of current selector. For example, in `#nav > li + a span` 
		 * parts are: `[#nav, li, a, span]`
		 * @type {Array}
		 */
		parts: {
			enumerable: true,
			get: function() {
				if (!this._parts) {
					this._parts = splitSelectorByParts(this._sel);
				}
				return this._parts;
			}
		},

		/**
		 * Array of fragments of current selector.
		 * Simple concatenation of these fragments will produce full selector
		 * @type {Array}
		 */
		fragments: {
			enumerable: true,
			get: function() {
				var out = [];
				this.parts.forEach(function(part) {
					if (part.op) {
						out.push(part.op == ' ' ? part.op : (' ' + part.op + ' '));
					}
					out = out.concat(part.fragments);
				});
				return out;
			}
		}
	});

	/**
	 * Selector part: a unit in selector that holds info about 
	 * fragments in selector part. This info can be used for selector comparison.
	 * For example, a selector part `div[data-info]:hover`
	 * contains the following fragments: `['div', '[data-info]', ':hover']`
	 * @param {String} part A selector part
	 * @param {String} op Preceding part operator
	 */
	function SelectorPart(part, op) {
		this.op = normalizeOperator(op);
		this._part = part.trim();
		this._fragments = null;
	}

	SelectorPart.prototype = {
		/**
		 * Check if current part equals given one
		 * @param  {SelectorPart} part
		 * @return {Boolean}
		 */
		equals: function(part) {
			return this.op === part.op && this.valueOf() === part.valueOf();
		},

		/**
		 * Creates copy of current part
		 * @return {SelectorPart}
		 */
		clone: function() {
			return new SelectorPart(this.valueOf(), this.op);
		},

		/**
		 * In current selector, removes fragments that exists in given one
		 * @param  {SelectorPart} part
		 */
		removeFragments: function(part) {
			var of = this.fragments;
			var pf = part.fragments;
			out._removedIx = null;

			// remove target fragments & find best insertion point
			for (var i = pf.length - 1, ix; i >= 0; i--) {
				ix = of.indexOf(pf[i]);
				if (ix != -1) {
					of.splice(ix, 1);
					out._removedIx = ix;
				}
			}

			return out;
		},

		/**
		 * Orders fragments of current part: put them in the order as they
		 * should appear in selector. For example, ensures that pseudo-selectors
		 * are at the end, element names are at the beginning etc.
		 */
		order: function() {
			var rePseudoElement = /^::/;
			var rePseudoClass = /^:/;
			var rest = [], elems = [], classes = [];
			this.fragments.forEach(function(f) {
				if (rePseudoElement.test(f)) {
					elems.push(f);
				} else if (rePseudoClass.test(f)) {
					classes.push(f);
				} else {
					rest.push(f);
				}
			});

			this.fragments = rest.concat(classes, elems);
			return this;
		},

		/**
		 * Creates string representation of current parsed selector part
		 * @param  {RegExp} skip Tokens matching this regexp will be skipped 
		 * from output
		 * @return {String}
		 */
		valueOf: function(skip) {
			var fragments = this.fragments;
			if (skip) {
				fragments = fragments.filter(function(f) {
					return !skip.test(f);
				});
			}

			return fragments.join('');
		},

		toString: function(skipOperator) {
			var op = '';
			if (!skipOperator) {
				op = (this.op && this.op !== ' ' ? this.op + ' ' : this.op);
			}
			return (op + this.valueOf()).trim();
		}
	};

	Object.defineProperties(SelectorPart.prototype, {
		length: {
			enumerable: true,
			get: function() {
				return this.valueOf().length;
			}
		},

		fragments: {
			enumerable: true,
			get: function() {
				if (!this._fragments) {
					this._fragments = parsePart(this._part);
				}

				return this._fragments;
			}
		}
	});

	SelectorDeclaration.Selector = Selector;
	SelectorDeclaration.SelectorPart = SelectorPart;
	return SelectorDeclaration;
});