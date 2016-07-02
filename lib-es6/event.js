'use strict'

/**
 * Action.
 */

class Event {
	constructor(type, bundle = null) {
		this.type = type;
		this.bundle = bundle;
	}
}

module.exports = Event;
