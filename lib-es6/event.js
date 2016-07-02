'use strict'

/**
 * Action.
 */

class Event {
	constructor(type, bundle) {
		this.type = type;
		this.bundle = bundle || null;
	}
}

module.exports = Event;
