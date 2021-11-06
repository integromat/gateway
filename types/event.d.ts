export type TEvent = {

	type: string;
	bundle?: unknown;

	new(type: string, bundle?: unknown): TEvent;

};
