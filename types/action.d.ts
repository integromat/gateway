export type TAction = {

	id: string;
	type: string;
	parameters: unknown;

	new(id: string, type: string, parameters: unknown): TAction;

};
