'use strict'

const assert = require('assert');
const Server = require('..').Server;
const Client = require('..').Client;
const Event = require('..').Event;

describe('Gateway Local', () => {
	let server;
	
	before((done) => {
		server = new Server().listen(done);
	})
	
	it('should reconnect to the server', (done) => {
		let reconnect = 0;
		let connect = 0;
		let disconnect = 0;
		let drain = 0;
		
		let client = new Client({
			host: 'localhost'
		})
		
		client.on('drain', () => {
			drain++;
			if (drain === 1) server.kick();
			if (drain === 2) client.close();
		})
		
		client.on('reconnect', () => {
			reconnect++;
		})
		
		client.on('connect', () => {
			connect++;
		})
		
		client.on('disconnect', () => {
			disconnect++;
			
			assert.strictEqual(reconnect, 1);
			assert.strictEqual(connect, 1);
			assert.strictEqual(disconnect, 1);
			assert.strictEqual(drain, 2);
			
			done();
		})
		
		client.connect();
	})
	
	it('should send some action', (done) => {
		const DATA = {a: 'b', c: 777};
		
		let client = new Client({
			host: 'localhost'
		})
		
		client.send(new Event('test', DATA));

		client.on('action', (action, ack) => {
			assert.strictEqual(action.type, 'test');
			assert.deepStrictEqual(action.parameters, DATA);
			ack();
			
			client.close()
		})
		
		client.on('disconnect', () => {
			done();
		})
		
		client.connect();
	})
	
	it('should send many actions at once', (done) => {
		const DATA = {a: 'b', c: 777};
		
		let i = 0, client = new Client({
			host: 'localhost'
		})
		
		client.on('drain', () => {
			client.send(new Event('test', DATA));
			client.send(new Event('test', DATA));
			client.send(new Event('test', DATA));
			client.send(new Event('test', DATA));
			client.send(new Event('test', DATA));
			client.send(new Event('test', DATA));
			client.send(new Event('test', DATA));
			client.send(new Event('test', DATA));
			client.send(new Event('test', DATA));
			client.send(new Event('test', DATA));
		})
		
		client.on('action', (action, ack) => {
			assert.strictEqual(action.type, 'test');
			assert.deepStrictEqual(action.parameters, DATA);
			ack();
			
			if (++i === 10) client.close()
		})
		
		client.on('disconnect', () => {
			done();
		})
		
		client.connect();
	})
	
	after((done) => {
		server.destroy(done);
	})
})

describe.skip('Gateway Production', () => {
	it('should connect to the server', (done) => {
		let client = new Client({
			key: require('fs').readFileSync(`${__dirname}/../certs/client.key`),
			cert: require('fs').readFileSync(`${__dirname}/../certs/client.pem`),
			autoReconnect: false
		})
		
		client.on('drain', () => {
			client.close();
		})

		client.on('disconnect', () => {
			done();
		})
		
		client.connect();
	})
})
