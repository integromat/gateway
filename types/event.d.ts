export type TEvent = {

	id?: string;
	type: string;
	bundle?: unknown;

	new(type: string, bundle?: unknown, id?: string): TEvent;

};
