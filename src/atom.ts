import { createSignal, untrack, type Signal, type SignalOptions } from "solid-js";

export type Atomical = readonly [ () => any, (...args: any) => any ];

export type Atom<T extends Atomical = Atomical> = T[0] & T[1];

export function atom<const T extends Atomical>(value: T): Atom<T>;
export function atom(value: unknown): unknown {
	if (Array.isArray(value)) {
		if (typeof value[0] === "function" && typeof value[0] === "function") {
			return (...args: any) => (args.length === 0) ? value[0]() : value[1](...args);
		}
	}
	throw new Error("cannot create an atom from this value");
}

export type Asig<T> = Atom<Signal<T>>;

/**
 * Creates an atomic signal. Alias of `atom(createSignal(...))`.
 */
export function asig<T>(): Atom<Signal<T | undefined>>;
export function asig<T>(value: T, options?: SignalOptions<T>): Atom<Signal<T>>;
export function asig<T>(...args: [ value?: T, options?: SignalOptions<T> ]): Atom<Signal<T> | Signal<T | undefined>> {
	return atom(args.length === 0 ? createSignal<T>() : createSignal(args[0] as T, args[1]));
}

export type Cosignal<T> = [
	() => T,
	(value: T) => T,
];

/**
 * Creates a signal from a getter/setter pair.
 */
export function createCosignal<T>(cosignal: Cosignal<T>): Signal<T> {
	const [ get, set ] = cosignal;
	return [
		get,
		(value) => set((typeof value === "function") ? (value as any)(untrack(get)) : value),
	] as Signal<T>;
}
