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

	function sortRanges(ranges) {
		return ranges.sort(function(a, b) {
			return a.start - b.start || a.end - b.end;
		});
	}

	function unique(ranges) {
		var out = [];
		ranges.forEach(function(r) {
			if (r && !~out.indexOf(r)) {
				out.push(r);
			}
		});
		return out;
	}

	function parentRanges(node) {
		var parents = [];
		var ctx = node;
		while (ctx = ctx.parent) {
			// do not use range() method since it may generate
			// unexisting ranges which are not our target
			parents.push(ctx._ranges.value, ctx._ranges.full);
		}

		return unique(parents);
	}

	function nextNodeRanges(node, r) {
		if (typeof r === 'string') {
			r = node.range(r);
		}

		var ranges = nodeRanges(node);
		var ix = ranges.indexOf(r);
		return ~ix ? ranges.slice(ix + 1) : [];
	}

	function nextNodes(node, fn) {
		var parent = node.parent;
		if (parent) {
			for (var i = parent.indexOf(node) + 1, il = parent.children.length; i < il; i++) {
				fn(parent.children[i], i);
			}
		}
	}

	function nextRanges(node, r) {
		var out = [];
		if (r) {
			out = out.concat(nextNodeRanges(node, r));
		}

		// include next siblings
		nextNodes(node, function(s) {
			out = out.concat(allRanges(s));
		});
		
		// include parent’s next siblings
		var parent = node.parent;
		var concat = function(s) {
			out = out.concat(allRanges(s));
		};

		while (parent) {
			out = out.concat(nextNodeRanges(parent, 'value'));
			nextNodes(parent, concat);
			parent = parent.parent;
		}

		return unique(out);
	}

	function nodeRanges(node) {
		var ranges = node._ranges;
		var out = [];
		Object.keys(ranges).forEach(function(key) {
			if (ranges[key]) {
				out.push(ranges[key]);
			}
		})

		return sortRanges(out);
	}

	function allRanges(node) {
		var out = nodeRanges(node);
		node.all().forEach(function(child) {
			out = out.concat(nodeRanges(child));
		});
		return out;
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
			if (!this._ranges[name]) {
				switch (name) {
					case 'full':
						// first = this._ranges.before || this._ranges.name;
						// last = this._ranges.after || this._ranges.value;
						first = this.range('before');
						last = this.range('after');
						return range.fromIndex(first.start, last.end);
					case 'self':
						first = this.range('name');
						last = this.range('after');
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
			return this.children.indexOf(this.get(node));
		},

		/**
		 * Returns child node by its index or name
		 * @param  {String|Number} name
		 * @return {Node}
		 */
		get: function(name) {
			if (name instanceof Node) {
				return name;
			}

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
				// TODO clone only existing ranges
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
			atIndex = this._resolveIndex(atIndex || 0);
			var len = this.children.length;

			if (atIndex < 0 || atIndex > len) {
				throw new Error('Index ' + atIndex + ' is out of range');
			}

			// find position in source where new node should be inserted
			var insChar = -1;
			if (this.children[atIndex]) {
				insChar = this.children[atIndex].range('full').start;
			} else {
				insChar = this.range('value').end;
			}

			var insData = node.valueOf();

			// make sure node and tree shares the same source
			if (node._source !== this._source) {
				allRanges(node).forEach(function(r) {
					r.shift(insChar);
				});
				node._source = this._source;
			}
			
			// insert node into tree
			this.children.splice(atIndex, 0, node);
			node.parent = this;
			node._replaceRange(range(insChar, 0), insData);

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

		toString: function() {
			return this.valueOf();
		},

		_resolveIndex: function(index) {
			var len = this.children.length;

			if (index === 'first') {
				return 0;
			}

			if (index === 'last') {
				return len;
			}

			if (index < 0) {
				return index + len;
			}

			return index;
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
				parentRanges(this).forEach(function(r) {
					if (r) {
						r.end += delta;
					}
				});

				nextRanges(this, range).forEach(function(r) {
					if (r.start >= range.start) {
						r.start += delta;
						r.end += delta;
					} else if (r.end >= range.start) {
						r.end += delta;
					}
				});
			}
		},

		_dumpRanges: function() {
			var ranges = this._ranges;
			var self = this;
			return Object.keys(ranges).map(function(key) {
				return key + ' (' + ranges[key].start + ':' + ranges[key].end + ') "' + self._rangeValue(key) + '"';
			}).join('\n');
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
				var range = this.range(key);
				this._replaceRange(range, value);
				range.end = range.start + value.length;
			}
		};
	});

	Object.defineProperties(Node.prototype, props);

	return Node;
});