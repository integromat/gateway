'use strict'

/**
 * Action.
 */

class Event {
	constructor(type, bundle, id = null) {
		this.type = type;
		this.bundle = bundle || null;
		this.id = id || null;
	}
}

module.exports = Event;
