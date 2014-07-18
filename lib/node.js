/**
 * Basic editable node
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}
 
define(function(require, exports, module) {
	var range = require('./range');
	var source = require('./source');

	var styles = ['before', 'between', 'after'];
	var rangeNames = ['name', 'value', 'before', 'between', 'after'];

	function updateRanges(node, fromPos, delta) {
		var list = node._ranges;
		Object.keys(list).forEach(function(key) {
			var r = list[key];
			if (r.start > fromPos) {
				r.start += delta;
			}

			if (r.end > fromPos) {
				r.end += delta;
			}
		});

		node.children.forEach(function(child) {
			updateRanges(child, fromPos, delta);
		});
	}

	function allChildren(node, out) {
		out = out || [];
		node.children.forEach(function(child) {
			out.push(child);
			allChildren(child, out);
		});
		return out;
	}

	function Node(source, ranges, type) {
		this._ranges = ranges;
		this._source = source;
		this.children = [];
		this.type = type || 'node';
		this.parent = null;
	}

	Node.prototype = {
		/**
		 * Returns named range
		 * @param  {String} name Token name
		 * @return {Range}
		 */
		range: function(name) {
			var first, last, from, to, r;
			if (!(name in this._ranges)) {
				switch (name) {
					case 'full':
						first = this._ranges.before || this._ranges.name;
						last = this._ranges.after || this._ranges.value;
						return range.fromIndex(first.start, last.end);
					case 'value':
						// there’s no value token: looks like it’s a section,
						// collect token from inner items, if possible
						if (this.children.length) {
							from = this.children[0].start;
							to = this.children[this.children.length - 1].end;
						} else {
							from = to = this.range('before').end;
						}

						return this._ranges[name] = range.fromIndex(from, to);
					case 'before':
						var ix = this.parent.indexOf(this);
						if (ix === 0) {
							if (this.parent === this.root) {
								// we’re in first top-level section
								from = 0
							} else {
								from = this.parent.range('value').start;
							}
						} else {
							from = this.parent.children[ix - 1].range('full').end;
						}

						to = this.range('name').start;
						return this._ranges[name] = range.fromIndex(from, to);
					case 'between':
						return range.fromIndex(this.range('name').end, this.range('value').start);
					case 'after':
						from = this.range('value').end;
						var ix = this.parent.indexOf(this);
						var next = this.parent.children[ix + 1];
						if (next) {
							to = next.range('full').start;
						} else {
							to = this.parent.range('value').end;
						}

						// make sure this range doesn’t contains any newlines
						// since they belongs to sibling’s `before` range
						var _i = from;
						while (_i <= to) {
							if (/[\n\r]/.test(source.valueOf()[_i])) {
								to = _i - 1;
								break;
							}
						}
						return this._ranges[name] = range.fromIndex(from, to);
				}
			}

			return this._ranges[name];
		},

		/**
		 * Get or set formatting token value
		 * @param  {String} name  Style token name
		 * @param  {String} value New value for style token
		 * @return {String}
		 */
		style: function(name, value) {
			if (!~style.indexOf(name)) {
				throw new Error('Unknown style: ' + name);
			}

			if (typeof value !== 'undefined') {
				this._replaceRange(name, value);
			}

			return this._rangeValue(name);
		},

		/**
		 * Returns index of given node in current node’s
		 * child list
		 * @param  {Node} node
		 * @return {Number}
		 */
		indexOf: function(node) {
			return this.children.indexOf(node);
		},

		/**
		 * Returns child node by its index or name
		 * @param  {String|Number} name
		 * @return {Node}
		 */
		get: function(name) {
			if (typeof name === 'number') {
				return this.children[name];
			}

			for (var i = 0, il = this.children.length; i < il; i++) {
				if (this.children[i].name === name) {
					return this.children[i];
				}
			}
		},

		/**
		 * Returns all child nodes, including nested ones
		 * @return {Array}
		 */
		all: function() {
			return allChildren(this);
		},

		/**
		 * Creates a detached shallow copy of current node.
		 * This node has its own source and ranges and is used mostly
		 * as a stub for creating new nodes with given formatting
		 * @return {Node}
		 */
		clone: function() {
			var ranges = {};
			var offset = Number.POSITIVE_INFINITY;
			rangeNames.forEach(function(key) {
				ranges[key] = this.range(key).clone();
				if (ranges[key].start < offset) {
					offset = ranges[key].start;
				}
			}, this);

			// adjust ranges so they match the new source
			rangeNames.forEach(function(key) {
				ranges[key].shift(-offset);
			});

			return new this.constructor(source(this.valueOf()), ranges, this.type);
		},

		/**
		 * Inserts given node at specified position 
		 * (index in child list)
		 * @param  {Node} node    Node to insert
		 * @param  {Number} atIndex Index in child list where to insert node. 
		 * Can be negative.
		 */
		insert: function(node, atIndex) {
			atIndex = atIndex || 0;
			var len = this.children.length;

			if (atIndex === 'first') {
				atIndex = 0;
			} else if (atIndex === 'last') {
				atIndex = len;
			} else if (atIndex < 0) {
				atIndex += len;
			}

			if (atIndex < 0 || atIndex > len) {
				throw new Error('Index ' + atIndex + ' is out of range');
			}

			// XXX make sure value token exists even 
			// if node doesn’t have value
			var valueRange = node.range('value');
			var fullRange = node.range('full');

			// find position in source where new node should be inserted
			var insIndex = -1;
			if (this.children[atIndex]) {
				insIndex = this.children[atIndex].range('full').start;
			} else {
				insIndex = valueRange.end;
			}

			this._replaceRange(range(insIndex, 0), node.valueOf());
			this.children.splice(atIndex, 0, node);
			node.parent = this;
			return node;
		},

		/**
		 * Removes current node from tree
		 * @return {Node}
		 */
		remove: function() {
			if (!this.parent) {
				// node is already removed
				return this;
			}

			var ix = this.parent.indexOf(this);
			if (!~ix) {
				// node is already removed
				return this;
			}

			this._replaceRange(this.range('full'), '');
			this.children.splice(ix, 1);
			return this;
		},

		valueOf: function(trim) {
			var out = this._rangeValue('full');
			if (trim) {
				out = out.trim();
			}

			return out;
		},

		_rangeValue: function(range) {
			if (typeof range === 'string') {
				range = this.range(range);
			}

			return this._source.substring(range);
		},
		_replaceRange: function(range, value) {
			value = value || '';
			if (typeof range === 'string') {
				range = this.range(range);
			}

			this._source.update(range, value);
			var delta = value.length - range.length;
			if (delta) {
				updateRanges(this.root, range.start, delta);
			}
		}
	};

	var props = {
		'root': {
			enumerable: true,
			get: function() {
				var ctx = this;
				while (ctx && ctx.parent) {
					ctx = ctx.parent;
				}
				return ctx;
			}
		}
	};

	rangeNames.forEach(function(key) {
		props[key] = {
			enumerable: true,
			get: function() {
				return this._rangeValue(key);
			},
			set: function(value) {
				this._replaceRange(key, value);
			}
		};
	});

	Object.defineProperties(Node.prototype, props);

	return Node;
});