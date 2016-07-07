'use strict'

const fs = require('fs');
const debug = require('debug')('imt:gateway:client');
const EventEmitter = require('events');
const TOKEN = require('./protocol.js').TOKEN;
const Protocol = require('./protocol.js').Protocol;
const Action = require('./action.js');
const Event = require('./event.js');
const queue = require('async/queue');

const RECONNECT_TIMEOUT = 1000;
const TOKEN_TO_STRING = {};
for (let name in TOKEN) TOKEN_TO_STRING[TOKEN[name]] = name.toLowerCase();

const defer = (cb, err, klass) => {
	klass = klass || Error;
	if (err && !(err instanceof Error)) err = new klass(err);
	if ('function' != typeof cb) throw err;
	return setImmediate(cb, err);
}

const isValid = (type, value) => {
	return new RegExp(`^-----BEGIN ${type}-----[A-Za-z0-9+\/=\n]+-----END ${type}-----\n?$`).test(value);
}

/**
 * Gateway Client.
 * 
 * @event error Emitted on error.
 * @event connect Emitted once the client is connected to the server.
 * @event disconnect Emitted once client is disconnected from the server.
 * @event drain Emitted once server notifies client that its queue is drained.
 * @event action Emitted once action is received from the server.
 */

class Client extends EventEmitter {
	/**
	 * @param {Object} options Options object.
	 * 
	 * **Options:**
	 * - `host` - Host.
	 * - `port` - Port.
	 * - `key` - Path to private key file.
	 * - `cert` - Path to public certificate file.
	 * - `autoReconnect` - Auto reconnect. Optional, default: `true`.
	 * - `maxReconnectAttempts` - Max number of reconnect attempts. If the connection was successfuly established before the disconnect happened, `disconnect` event will be emitted after consuming all reconnect attempts. If the connection was not connected, `error` event with error message will be emitted. Unlimited by default.
	 **/
	
	constructor(options) {
		super();
		
		if (options == null || 'object' !== typeof options) throw new Error('Options expected.');
		if (options.host !== 'localhost') this._secure = true;
		if (this._secure && !isValid('RSA PRIVATE KEY', options.key)) throw new Error('Invalid private key.');
		if (this._secure && !isValid('CERTIFICATE', options.cert)) throw new Error('Invalid certificate.');
		
		this._options = Object.assign({}, options);
		this._options.host = this._options.host || 'gateway.integromat.com';
		this._options.port = this._options.port || 7777;
		this._manuallyDisconnected = false;
		this._attempt = 0;
		
		this._close = this._close.bind(this);
		this._connect = this._connect.bind(this);
		this._data = this._data.bind(this);
		this._error = this._error.bind(this);
		
		this._queue = queue((event, next) => {
			let packet = {
				id: event.id,
				type: event.type,
				bundle: event.bundle
			};
			
			this._protocol.send(TOKEN.EVENT, packet);
			
			this._waitingForAcknowledgement = {
				packet,
				callback: (err) => {
					if ('function' === typeof event.callback) event.callback(err);
					next();
				}
			};
	
			debug(`outgoing, token: 'event', id: '${packet.id}', data:`, event.bundle);
		}, 1);
		this._queue.pause();
	}
	
	/**
	 * Close handler.
	 * 
	 * @private
	 */

	_close() {
		let wasAuthorized = this._protocol.authorized;
		this._protocol = null;
		this._queue.pause();
		
		debug('connection closed');
		
		if (this._options.autoReconnect !== false && !this._manuallyDisconnected) {
			if (this._options.maxReconnectAttempts > 0 && this._attempt >= this._options.maxReconnectAttempts) {
				debug('max reconnect attempts reached');
				
				if (this._wasConected) {
					return this.emit('disconnect');
				} else {
					return this.emit('error', this._lastError);
				}
			}
			
			debug(`reconnect attempt no. ${this._attempt + 1} in ${RECONNECT_TIMEOUT / 1000}s`);
			
			if (this._wasConected == null) this._wasConected = wasAuthorized;
			this._reconnectTimeout = setTimeout(() => {
				debug('attempting reconnect');
				
				this.emit('reconnect');
				
				this._attempt++;
				this._reconnectTimeout = null;
				this._reconnect();
			}, RECONNECT_TIMEOUT);
		} else {
			if (wasAuthorized) this.emit('disconnect');
		}
	}
	
	/**
	 * Connect handler. This is just a TLS connection notification, authorization is still in progress.
	 * 
	 * @private
	 */
	
	_connect() {
		debug('connection established');
	}
	
	/**
	 * Data handler.
	 * 
	 * @param {Number} token Token ID.
	 * @param {Object} data Data sent along with token.
	 * 
	 * @private
	 */
	
	_data(token, data) {
		debug(`incoming, token: '${TOKEN_TO_STRING[token]}', data:`, data);
		
		switch (token) {
			case TOKEN.WELCOME:
				debug('connection authorized');
				
				this._attempt = 0;
				this._protocol.authorized = true;
				
				if (!this._wasConected) this.emit('connect');
				break;

			case TOKEN.DRAINED:
				this._queue.resume();
				this.emit('drain');
				break;
			
			case TOKEN.ACTION:
				this.emit('action', new Action(data.type, data.parameters), (err) => {
					if (!this._protocol) return;
					
					let res = {
						correlid: data.id,
						status: 0
					};
						
					if (err) {
						res.status = 1;
						res.error = {message: err.message};
					}
					
					debug(`outgoing, token: 'acknowledgement', correlid: '${data.id}'`);
					this._protocol.send(TOKEN.ACKNOWLEDGEMENT, res);
				})
				break;
			
			case TOKEN.ACKNOWLEDGEMENT:
				if (!this._waitingForAcknowledgement) {
					this.emit('error', new Error("Received acknowledgement even if there is no event in the queue."));
					return this._protocol.socket.destroy(); // Interrupt connection immediately.
				}
				if (this._waitingForAcknowledgement.packet.id !== data.correlid) {
					this.emit('error', new Error("Received acknowledgement for different event."));
					return this._protocol.socket.destroy(); // Interrupt connection immediately.
				}
				
				let cb = this._waitingForAcknowledgement.callback;
				this._waitingForAcknowledgement = null;
				
				if (cb != null) {
					if (data.status !== 0) {
						let err = new Error(data.error.message);
						err.code = data.error.code;
						cb(err);
					} else {
						cb();
					}
				}
				break;
			
			case TOKEN.BYE:
				if (data && data.error != null) {
					let err = new Error(data.error.message);
					err.code = data.error.code;
					this.emit('error', err);
				}
				break;
		}
	}
	
	/**
	 * Error handler.
	 * 
	 * @param {Error} error Error object.
	 * 
	 * @private
	 */
	
	_error(err) {
		debug('connection error', err.message);
		
		this._lastError = err;
		
		if (this._options.autoReconnect === false) {
			this.emit('error', err);
		}
	}
	
	/**
	 * Method used to connect to the server.
	 * 
	 * @private
	 */
	
	_reconnect() {
		debug(`connecting to ${this._options.host}:${this._options.port}`);
		
		if (this._protocol) return defer(() => this.emit('error', new Error('Client is not in valid state.')));
		
		let config = {
			host: this._options.host,
			port: this._options.port
		}
		
		if (this._secure) {
			config.key = this._options.key;
			config.cert = this._options.cert;
			config.ca = [fs.readFileSync(`${__dirname}/../certs/${config.host}.root.ca.pem`), fs.readFileSync(`${__dirname}/../certs/${config.host}.intermediate.ca.pem`)];
		}
		
		let socket = require(this._secure ? 'tls' : 'net').connect(config);
		
		this._protocol = new Protocol(socket);
		this._protocol.on('error', this._error);
		this._protocol.on('data', this._data);
		this._protocol.on('close', this._close);
		this._protocol.on('connect', this._connect);
	}
	
	/**
	 * Connect to the Gateway server.
	 * 
	 * returns {Client}
	 */
	
	connect() {
		if (this._protocol) return; // Already connected.
		
		this._attempt = 0;
		this._manuallyDisconnected = false;
		this._wasAuthorized = false;
		if (this._reconnectTimeout) {
			clearTimeout(this._reconnectTimeout);
			this._reconnectTimeout = null;
		}
		
		this._reconnect();
		return this;
	}
	
	/**
	 * Disconnect from the Gateway server.
	 * 
	 * @returns {Client}
	 */
	
	close() {
		if (!this._protocol) return; // Already disconnected.
		
		this._manuallyDisconnected = true;
		
		if (this._reconnectTimeout) {
			clearTimeout(this._reconnectTimeout);
			if (this._wasConected) defer(() => this.emit('disconnect'));
		} else if (this._protocol && this._protocol.closed === false) {
			this._protocol.end();
		}
		
		this._waitingForAcknowledgement = null;
		this._wasConected = null;
		return this;
	}
	
	/**
	 * Send event to the server. Message is automatically queued when connection is not yet established or when another event was not yet processed.
	 * 
	 * @param {Event} event Event.
	 * @param {Function} [callback] Callback to call when acknowledgment is received.
	 * @returns {Client}
	 */
	
	send(event, callback) {
		if (callback != null && 'function' !== typeof callback) throw new Error('Invalid callback.');
		if (!(event instanceof Event)) return defer(callback, 'Event expected.', TypeError);
		if ('string' !== typeof event.type) return defer(callback, 'Invalid event type.');
		if (event.type === '') return defer(callback, 'Event type not specified.');
		if (event.bundle != null && 'object' !== typeof event.bundle) return defer(callback, 'Invalid event bundle.');
		
		event.callback = callback;
		if (event.id == null) event.id = Date.now();
		this._queue.push(event);
		return this;
	}
}

module.exports = Client;
