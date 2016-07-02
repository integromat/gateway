'use strict'

const debug = require('debug')('imt:gateway:protocol');
const {EventEmitter} = require('events');
const msgpack = require('msgpack-lite');
const os = require('os');
const tls = require('tls');

const HEADER_LENGTH = 6;
const BUFFER_SIZE = 10485760; // 10MB
const TOKEN = {
	HELLO: 0x01,
	WELCOME: 0x02,
	BYE: 0x03,
	EVENT: 0x04,
	ACTION: 0x05,
	ACKNOWLEDGEMENT: 0x06,
	DRAINED: 0x07
};

/**
 * Protocol implementation.
 * 
 * @property {Boolean} closed If `true`, connection was closed.
 * 
 * @event data Emitted on data.
 * @event error Emitted on error.
 * @event end Emitted when socked is closed.
 */

class Protocol extends EventEmitter {
	constructor(socket) {
		super();
		
		this.authorized = false;
		this.drained = false;
		this.closed = false;
		this.closing = false;
		
		this._secure = socket instanceof tls.TLSSocket;
		this._data = this._data.bind(this);
		this._close = this._close.bind(this);
		this._error = this._error.bind(this);
		this._connect = this._connect.bind(this);
		
		this.buffer = new Buffer(0);
		
		this.socket = socket;
		this.socket.on('data', this._data);
		this.socket.on('error', this._error);
		this.socket.on('close', this._close);
		this.socket.on(this._secure ? 'secureConnect' : 'connect', this._connect);
	}
	
	/**
	 * Release protocol and it's event listeners from memory.
	 * 
	 * @returns {Protocol}
	 */
	
	destroy() {
		this.removeAllListeners();
		this.buffer = null;
		
		if (this.socket) {
			this.socket.removeListener('data', this._data);
			this.socket.removeListener('error', this._error);
			this.socket.removeListener('close', this._close);
			this.socket.removeListener(this._secure ? 'secureConnect' : 'connect', this._connect);
			this.socket = null;
		}
		
		this.authorized = false;
		return this;
	}
	
	/**
	 * Socket connect handler.
	 * 
	 * @private
	 */
	
	_connect() {
		if (this._secure && !this.socket.authorized) return this.socket.destroy();
		if (this._secure) this.certificate = this.socket.getPeerCertificate();
		
		this.emit('connect');
		this.send(TOKEN.HELLO, {
			metadata: {
				device_name: os.hostname()
			}
		});
	}
	
	/**
	 * Socket data handler.
	 * 
	 * @private
	 */

	_data(chunk) {
		if (this.closed || this.closing) return; // don't receive anything when closed or error
		
		debug('chunk', chunk);
		
		this.buffer = Buffer.concat([this.buffer, chunk]);
		this.emit('stats', chunk.length, 0);
		
		if (this.buffer.length > BUFFER_SIZE) {
			return this.end(TOKEN.BYE, {
				error: {
					code: "IM491",
					message: "Maximum buffer size exceeded."
				}
			});
		}
		
		while (this.buffer.length >= HEADER_LENGTH) {
			let token = this.buffer.readUInt8(0);
			let length = this.buffer.readUInt32LE(2);
			
			if (this.allowedTokens != null && this.allowedTokens.indexOf(token) === -1) {
				return this.end(TOKEN.BYE, {
					error: {
						code: "IM480",
						message: "Invalid token in current state."
					}
				});
			}

			if (this.buffer.length >= HEADER_LENGTH + length) {
				let body = this.buffer.slice(6, HEADER_LENGTH + length);
				this.buffer = this.buffer.slice(HEADER_LENGTH + length);
				
				if (length) {
					try {
						var data = msgpack.decode(body);
					} catch (e) {
						return this._error(new Error(`Failed to deserialize packet. ${e.message}`));
					}
				} else {
					var data = null;
				}
				
				this.emit('data', token, data);
			} else {
				break;
			}
		}
	}
	
	/**
	 * Socket end handler.
	 * 
	 * @private
	 */
	
	_close() {
		if (this.closed) return;
		this.closed = true;
		
		if (this._destroyTimeout) {
			clearTimeout(this._destroyTimeout);
			this._destroyTimeout = null;
		}
		
		this.emit('close');
		this.destroy();
	}
	
	/**
	 * Socket error handler.
	 * 
	 * @private
	 */
	
	_error(err) {
		this.closing = true;
		
		this.emit('error', err);
		if (this.socket) this.socket.destroy();
		// don't this.destroy() here, it will be destroyed on the 'close' event
	}

	/**
	 * Close TCP connection and optionaly send final token.
	 * 
	 * @param {Number} [token] Token ID.
	 * @param {Object} [data] Data structure.
	 * @returns {Protocol}
	 */
	
	end(token, data) {
		if (!this.socket) return this;
		if (token != null) this.send(token, data);
		
		this.closing = true;
		this.socket.end();
		
		this._destroyTimeout = setTimeout(() => {
			if (this.socket) this.socket.destroy();
			this._destroyTimeout = null;
		}, 1000);
		
		return this;
	}

	/**
	 * Send token over TCP.
	 * 
	 * @param {Number} token Token ID.
	 * @parma {Object} data Data structure.
	 * @returns {Protocol}
	 */
	
	send(token, data) {
		if (!this.socket || this.closing) return this;
		if (token === TOKEN.DRAINED) this.drained = true;
		
		if (data != null) {
			try {
				var body = msgpack.encode(data);
				var {length} = body;
			} catch (e) {
				if (token === TOKEN.BYE) {
					return console.error(new Error(`Failed to serialize packet. ${e.message}`));
				} else {
					return this._error(new Error(`Failed to serialize packet. ${e.message}`));
				}
			}
		} else {
			var length = 0;
		}

		let packet = new Buffer(HEADER_LENGTH + length);
		packet.writeUInt8(token, 0);
		packet.writeUInt8(0x00, 1);
		packet.writeUInt32LE(length, 2);
		if (length) body.copy(packet, HEADER_LENGTH);
		
		debug('sent', packet);
		this.socket.write(packet);
		
		this.emit('stats', 0, packet.length);
		this.emit('sent', token, data);
		
		return this;
	}
}

exports.TOKEN = TOKEN;
exports.Protocol = Protocol;
