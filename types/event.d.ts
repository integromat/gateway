export type TEvent = {

	id?: string;
	type: string;
	bundle?: unknown;

	new(type: string, bundle?: unknown): TEvent;

};
