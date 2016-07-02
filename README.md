# Integromat Gateway Client for Node.js

[![NPM Version][npm-image]][npm-url] [![Travis CI][travis-image]][travis-url]

## Installation

```sh
$ npm install imt-gateway
```

## Quick Example

```javascript
const {Client, Event} = require('imt-gateway');

let gw = new Client({
    key: '-----BEGIN RSA PRIVATE KEY----- ...',
    cert: '-----BEGIN CERTIFICATE----- ...'
})

gw.on('action', (action, ack) => {
    // ... do something
    ack();
})

gw.on('drained', () => {
    gw.send(new Event('weather', {temperature: 24}));
})

gw.connect();
```

## Documentation

- [Obtaining a Certificate](#obtaining-a-certificate)
- [Client](#client)
- [Event](#event)
- [Action](#action)

## Obtaining a Certificate

TBD

## Client

Client is an EventEmitter.

```javascript
let gw = new Client(options);
```

**Options**

- `key` - Private key in PEM format. Required.
- `cert` - Signed certificate in PEM format. Required.
- `autoReconnect` - Auto reconnect. Optional, default: `true`.
- `maxReconnectAttempts` - Max number of reconnect attempts. If the connection was successfuly established before the disconnect happened, `disconnect` event will be emitted after consuming all reconnect attempts. If the connection was not connected, `error` event with error message will be emitted. Unlimited by default.

**Events**

- `connect` - Dispatched after connection has established.
- `disconnect` - Dispatched after connection has closed.
- `drain` - Dispatched after all actions from the server was received. Client must not send events before `drain` is emitted.
- `action(action, ack)` - Dispatched when new action is received from the server.
- `error(err)` - Dispatched on error.

### connect()

Create a new connection to the server.

**Example**

```javascript
gw.connect();
```

### close()

Close connection to the server.

**Example**

```javascript
gw.close();
```

### send(event, [callback])

Send new event to the server.

**Arguments**

- `event` - Instance of an [Event](#event) object.
- `callback(err)` - A callback which is called after the event was successfuly received by the server, or if an error has occurred.

**Example**

```javascript
let event = new Event('weather', {
	temperature: 24
});

gw.send(event, (err) => {
	// error checks
	console.log('Event was sent.')
});
```

## Event

Events are messages sent from client to the server.

```javascript
let event = new Event(type, data);
```

**IMPORTANT:** Client muset alway wait for `drain` event before it can send events to the server.

**Arguments**

- `type` - Type of an event.
- `data` - An object containing data to be transfered to the server.

## Action

Actions are messages sent from the server to client.

```javascript
gw.on('action', (action, ack) => {
	console.log('action type:', action.type);
	console.log('action parameters:', action.parameters);
	
	ack(); // Sends acknowledgement to the server that the action was received.
})
```

**IMPORTANT:** Server always wait for the acknowledgement before it send another action to the client.

## License

Copyright (c) 2016 Integromat

The MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

[npm-image]: https://img.shields.io/npm/v/imt-gateway.svg?style=flat-square
[npm-url]: https://www.npmjs.com/package/imt-gateway
[travis-image]: https://img.shields.io/travis/integromat/imt-gateway/master.svg?style=flat-square&label=unit
[travis-url]: https://travis-ci.org/integromat/imt-gateway
