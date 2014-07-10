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

	var styles = ['before', 'between', 'after'];

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
			var first, last;
			if (name === 'full') {
				first = this._ranges.before || this._ranges.name;
				last = this._ranges.after || this._ranges.value;
				return range.fromIndex(first.start, last.end);
			} else if (name === 'value' && !(name in this._ranges)) {
				// there’s no value token: looks like it’s a section,
				// collect token from inner items, if possible
				if (this.children.length) {
					first = this.children[0];
					last = this.children[this.children.length - 1];
				} else {
					first = last = this._ranges.before;
				}

				return range.fromIndex(first.start, last.end);
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

	Object.defineProperties(Node.prototype, {
		'root': {
			enumerable: true,
			get: function() {
				var ctx = this;
				while (ctx && ctx.parent) {
					ctx = ctx.parent;
				}
				return ctx;
			}
		},
		'name': {
			enumerable: true,
			get: function() {
				return this._rangeValue('name');
			},
			set: function(value) {
				this._replaceRange('name', value);
			}
		},
		'value': {
			enumerable: true,
			get: function() {
				return this._rangeValue('value');
			},
			set: function(value) {
				this._replaceRange('value', value);
			}
		}
	});
});