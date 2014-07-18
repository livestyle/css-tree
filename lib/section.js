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
		['before',  '\n'],
		['name',    'a'],
		['between', ' {'],
		['value',   ' '],
		['after',   '\n}']
	];

	var defaultProperty = [
		['before',  '\n\t'],
		['name',    'a'],
		['between', ': '],
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

	/**
	 * Finds best property donor for given section
	 * @param  {Section} section 
	 * @return {Node}
	 */
	function findBestPropertyDonor(section) {
		var props = section.properties;
		if (props.length) {
			return props[0];
		}

		// find any first valid property
		var prop = null;
		section.root.sections.some(function(s) {
			return s.properties.some(function(p) {
				if (/^[a-z]/.test(p.name)) {
					return prop = p;
				}
			});
		});
		return prop;
	}

	function Section(source, ranges, type) {
		if (!(this instanceof Node)) {
			return new Section(source, ranges, type);
		}

		Node.call(this, source, ranges, type || 'section');
	}

	utils.inherit(Section, Node, {
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
					prop = createProperty(name, value, findBestPropertyDonor(this));
					return this.insert(prop, typeof hint !== 'undefined' ? hint : 'last');
				}

				prop.value = value;
			}

			return prop ? prop.value : void 0;
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