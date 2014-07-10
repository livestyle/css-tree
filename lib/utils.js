if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	return {
		extend: function(obj) {
			for (var i = 1, il = arguments.length, src; i < il; i++) {
				if (!(src = arguments[i])) {
					continue;
				}

				Object.keys(src).forEach(function(key) {
					obj[key] = src[key];
				});
			}

			return obj;
		},

		/**
		 * Simple class inheritance
		 * @param {Function} child Child class
		 * @param {Function} base Base class
		 * @param {Object} [args?] Additional properties to be added 
		 * to `child` prototype
		 * @return {Object}
		 */
		inherit: function(child, base) {
			// var Surrogate = function() {
			// 	this.constructor = child;
			// 	this.super = base;
			// };
			// Surrogate.prototype = base.prototype;
			// child.prototype = new Surrogate;

			child.prototype = Object.create(base.prototype);
			child.prototype.constructor = child;
			child.__super__ = base.prototype;

			for (var i = 2, il = arguments.length; i < il; i++) {
				this.extend(child.prototype, arguments[i]);
			}

			return child;
		}
	};
});