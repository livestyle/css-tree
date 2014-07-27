if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var Node = require('./node');
	var Property = require('./property');
	var utils = require('./utils');
	var source = require('./source');
	var range = require('./range');

	var defaultSection = [
		['before',  ''],
		['name',    'a'],
		['between', ' {'],
		['value',   ' '],
		['after',   '\n}\n']
	];

	var defaultPropSeparator = ': ';
	var defaultProperty = [
		['before',  '\n\t'],
		['name',    'a'],
		['between', defaultPropSeparator],
		['value',   'b'],
		['after',   ';']
	];

	/**
	 * Constructs node from given data
	 * @param  {Function} Constructor Node constructor method
	 * @param  {Array} data           Node source data
	 * @return {Node}
	 */
	function constructNode(Constructor, data) {
		var ranges = {};
		var src = '';
		var offset = 0;
		data.forEach(function(d) {
			src += d[1];
			ranges[d[0]] = range(offset, d[1]);
			offset += d[1].length;
		});

		return new Constructor(source(src), ranges);
	}

	/**
	 * Creates a new section node
	 * @param  {String} name  Section name (selector)
	 * @param  {Node} donor Optional section donor. If provided, donor 
	 * will be cloned, e.g. new node will use donor’s formatting
	 * @return {Section}
	 */
	function createSection(name, donor) {
		var node = donor ? donor.clone() : constructNode(Section, defaultSection);
		node.value = '';
		node.name = name;
		return node;
	}

	/**
	 * Creates a new property node
	 * @param  {String} name  Section name (selector)
	 * @param  {Node} donor Optional prperty donor. If provided, donor 
	 * will be cloned, e.g. new node will use donor’s formatting
	 * @return {Section}
	 */
	function createProperty(name, value, donor) {
		var node = donor ? donor.clone() : constructNode(Property, defaultProperty);
		node.value = value;
		node.name = name;
		return node;
	}

	function candidateScore(node) {
		var score = 0;
		if (node.between) {
			score++;
		}
		if (node.after) {
			score++;
		}
		return score;
	}

	/**
	 * Finds best property donor for given section
	 * @param  {Section} section 
	 * @return {Node}
	 */
	function findBestPropertyDonor(section) {
		var candidates = [];
		var sortCandidates = function(a, b) {
			return b.score - a.score;
		};

		section.properties.forEach(function(p) {
			var score = candidateScore(p);
			if (score) {
				candidates.push({
					node: p,
					score: score
				});
			}
		});

		candidates.sort(sortCandidates);
		if (candidates[0] && candidates[0].score > 1) {
			return candidates[0].node;
		}

		// find any first valid property
		var prop = candidates[0] && candidates[0].node;
		section.root.sections.some(function(s) {
			return s.properties.some(function(p) {
				if (/^[a-z]/.test(p.name) && candidateScore(p) > 1) {
					return prop = p;
				}
			});
		});
		return prop;
	}

	function findBestSectionDonor(node) {
		if (node.type === 'section') {
			return node;
		}

		var sections = node.root.sections;
		return sections[sections.length - 1];
	}

	function ensurePropertyTerminator(node) {
		if (node && node.type === 'property' && node.after.indexOf(';') === -1) {
			node.after += ';';
		}
		return node;
	}

	function Section(source, ranges, type) {
		if (!(this instanceof Section)) {
			return new Section(source, ranges, type);
		}

		Node.call(this, source, ranges, type || 'section');
	}

	utils.inherit(Section, Node, {
		/**
		 * Override Node’s `range` method for some section-specific changes 
		 * @return {Range}
		 */
		range: function(name) {
			switch (name) {
				case 'value':
					// sections actually doesn’t have explicit
					// values: it’s just string representation of 
					// all child nodes
					if (this.children.length) {
						var from = this.children[0].range('full').start;
						var to = this.children[this.children.length - 1].range('full').end;
						return range.fromIndex(from, to);
					}

					break;
			}

			return Node.prototype.range.apply(this, arguments);
		},

		/**
		 * Get or set value for property child with given name. 
		 * If multiple properties with the same name are present, returns
		 * value of the last one (like in real CSS).
		 *
		 * If value is given but there’s no such property node, it will be created
		 * @param  {String} name  Property name
		 * @param  {String} value Property value
		 * @param  {Number} hint  Hint where to create a new property if it’s required
		 * @return {String}       Property value
		 */
		property: function(name, value, hint) {
			var props = this.properties.filter(function(node) {
				return node.name === name;
			});

			var prop = props[props.length - 1];
			if (typeof value !== 'undefined') {
				// update property value
				if (!prop) {
					// no such property: create one
					return this.addProperty(name, value, hint).value;
				}

				// make sure property contains separator
				if (!prop.between) {
					var donor = findBestPropertyDonor(this);
					prop.between = donor && donor.between ? donor.between : defaultPropSeparator;
				}
				prop.value = value;
				ensurePropertyTerminator(prop);
			}

			return prop ? prop.value : void 0;
		},

		/**
		 * Adds new property to current section
		 * @param {String} name  Property name
		 * @param {String} value Property value
		 * @param {Object} hint  Hint where to put new property
		 * @returns {Property}
		 */
		addProperty: function(name, value, hint) {
			if (typeof hint === 'undefined') {
				hint = 'last';
			}
			var prop = createProperty(name, value, findBestPropertyDonor(this));

			// make sure previous property contains terminating semicolon
			ensurePropertyTerminator(this.get(this._resolveIndex(hint) - 1));
			return this.insert(prop, hint);
		},

		/**
		 * Returns child section node with given name (selector). 
		 * If there are multiple sections with the same name, the 
		 * last one is returned.
		 * @param  {String} name Section name (selector)
		 * @return {Section}
		 */
		section: function(name) {
			var sections = this.sections.filter(function(node) {
				return node.name === name;
			});

			return sections[sections.length - 1];
		},

		/**
		 * Creates new child section 
		 * @param {String} name Section name (selector)
		 * @param {Object} hint  Hint where to put new property
		 * @returns {Section}
		 */
		addSection: function(name, hint) {
			if (typeof hint === 'undefined') {
				hint = 'last';
			}
			var section = createSection(name, findBestSectionDonor(this));
			this.insert(section, hint);

			// try to fix formatting for some common patterns
			var ix = this.indexOf(section);
			if (ix > 0) {
				// not a first section, check if need to
				// add some formatting to previous one
				var prev = this.children[ix - 1];
				var reHasEndNl = /\n\s*$/;
				if (prev.type === 'section' && ~section.after.indexOf('\n') && !reHasEndNl.test(prev.after)) {
					prev.after += '\n';
				}
			}

			return section;
		}
	});

	Object.defineProperties(Section.prototype, {
		'properties': {
			enumerable: true,
			get: function() {
				return this.children.filter(function(node) {
					return node.type === 'property';
				});
			}
		},
		'sections': {
			enumerable: true,
			get: function() {
				return this.children.filter(function(node) {
					return node.type === 'section';
				});
			}
		}
	});

	return Section;
});