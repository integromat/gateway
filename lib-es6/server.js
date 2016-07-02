'use strict'

const {EventEmitter} = require('events');
const {TOKEN, Protocol} = require('./protocol.js');
const debug = require('debug')('imt:gateway:server');

const TOKEN_TO_STRING = {};
for (let name in TOKEN) TOKEN_TO_STRING[TOKEN[name]] = name.toLowerCase();

/**
 * Gateway Server for testing purposes.
 */

class Server extends EventEmitter {
	constructor() {
		super();
		
		this._connections = [];
		this._server = require('net').createServer((socket) => {
			let ip = socket.remoteAddress;
			debug('client conntected', ip);
			
			let protocol = new Protocol(socket);
			this._connections.push(protocol);
			protocol.on('data', (token, data) => {
				debug(`incoming, token: '${TOKEN_TO_STRING[token]}', data:`, data);
				
				switch (token) {
					case TOKEN.HELLO:
						protocol.send(TOKEN.WELCOME);
						protocol.send(TOKEN.DRAINED);
						break;
					
					case TOKEN.EVENT:
						protocol.send(TOKEN.ACKNOWLEDGEMENT, {
							correlid: data.id,
							status: 0
						})
						
						// Loopback
						protocol.send(TOKEN.ACTION, {
							id: Date.now(),
							type: data.type,
							parameters: data.bundle
						});
						
						break;
				}
			})
			protocol.on('sent', (token, data) => {
				debug(`outgoing, token: '${TOKEN_TO_STRING[token]}', data:`, data);
			})
			protocol.on('close', (token, data) => {
				debug('client disconntected', ip);
				this._connections.splice(this._connections.indexOf(protocol), 1);
			})
		})
	}
	
	/**
	 * Destroy the server.
	 */
	
	destroy(callback) {
		this._server.close(callback);
		this._server = null;
	}
	
	/**
	 * Start the server.
	 */
	
	listen(callback) {
		this._server.listen(7777, () => {
			debug('listening on port 7777');
			if ('function' === typeof callback) callback()
		});
		
		return this;
	}
	
	/**
	 * Kick all connected clients.
	 */
	
	kick() {
		this._connections.forEach((protocol) => {
			protocol.end(TOKEN.BYE);
		})
	}
}

module.exports = Server;
