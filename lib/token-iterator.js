/**
 * Helper class for convenient token iteration
 */
'use strict';

/**
 * @type TokenIterator
 * @param {Array} tokens
 * @type TokenIterator
 * @constructor
 */
function TokenIterator(tokens) {
	if (!(this instanceof TokenIterator)) {
		return new TokenIterator(tokens);
	}

	/** @type Array */
	this.tokens = tokens;
	this._position = 0;
	this.reset();
}

TokenIterator.prototype = {
	next: function() {
		if (this.hasNext()) {
			var token = this.tokens[++this._i];
			this._position = token.start;
			return token;
		} else {
			this._i = this._il;
		}
		
		return null;
	},
	
	current: function() {
		return this.tokens[this._i];
	},

	peek: function() {
		return this.tokens[this._i + i];
	},
	
	position: function() {
		return this._position;
	},
	
	hasNext: function() {
		return this._i < this._il - 1;
	},
	
	reset: function() {
		this._i = 0;
		this._il = this.tokens.length;
	},
	
	item: function() {
		return this.tokens[this._i];
	},
	
	itemNext: function() {
		return this.tokens[this._i + 1];
	},
	
	itemPrev: function() {
		return this.tokens[this._i - 1];
	},
	
	nextUntil: function(type, callback) {
		var token;
		var test = typeof type == 'string' 
			? function(t){return t.type == type;} 
			: type;
		
		while ((token = this.next())) {
			if (callback) {
				callback.call(this, token);
			}
			if (test.call(this, token)) {
				break;
			}
		}
	}
};

module.exports = TokenIterator;