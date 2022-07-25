import {TEvent} from './event';
import {TAction} from './action';
import {EventEmitter} from 'events';

type TClientOptions = {
	host?: string;
	port?: number;
	key: string;
	cert: string;
	autoReconnect?: boolean;
	maxReconnectAttempts?: number;
	ca?: {
		root?: string;
		intermediate?: string;
	}
}

export type TClient = EventEmitter & {

	on(event: 'error', listener: (err: Error) => void): void;
	on(event: 'connect', listener: () => void): void;
	on(event: 'disconnect', listener: () => void): void;
	on(event: 'drain', listener: () => void): void;
	on(event: 'action', listener: (action: TAction, ack: (err?: Error) => void) => void): void;

	new(options: TClientOptions): TClient;
	connect(): void;
	close(): void;
	send(event: TEvent, callback: () => void): void;

}
