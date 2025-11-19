import { createMemo, createSignal, untrack, type Accessor, type Setter, type Signal, type SignalOptions } from "solid-js";
import { isDev } from "solid-js/web";

// UTILITIES

/**
 * Any tuple of two functions where the first accepts no arguments and the second accepts any amount.
 */
export type SignalLike = readonly [ () => any, (...args: any) => any ];

/**
 * An atom is a polymorphic function that calls one of two
 *  functions depending on the number of arguments it has.
 * 
 * If called with zero arguments, the first function is called.
 * Otherwise, the second function is called and all of the arguments are forwarded to it.
 */
export type Atom<T extends SignalLike = SignalLike> = T[0] & T[1];

/**
 * Combine a getter and setter function pair into one.
 *
 * Accepts a tuple of two functions.
 * The first is the getter, the second is the setter.
 * A new function is returned that, when called with zero arguments, calls the getter.
 * Otherwise, it calls the setter and forwards all of the arguments.
 * 
 * ### Example
 * ```
 * const count = atom(createSignal(0));
 * 
 * // Read
 * count();
 * 
 * // Write
 * count(100);
 * count(x => x + 1);
 * count(count() + 1);
 * ```
 */
export function atom<const T extends SignalLike>(value: T): Atom<T>;
export function atom(value: unknown): unknown {
	if (isDev) {
		// Assert that the input is valid.
		// For production, these checks are skipped for performance.
		
		if (!Array.isArray(value)) {
			throw new Error(`expected a getter setter pair as an array, but got ${typeof value}`);
		}
		if (typeof value[0] !== "function") {
			throw new Error(`expected a getter function, but got ${typeof value[0]}`);
		}
		if (typeof value[1] !== "function") {
			throw new Error(`expected a setter function, but got ${typeof value[1]}`);
		}
	}
	return (...args: unknown[]) => (args.length === 0) ? (value as SignalLike)[0]() : (value as SignalLike)[1](...args);
}

/**
 * Similar to a signal setter, except it doesn't accept a mapping function nor return a result.
 */
export type Cosetter<T> = (value: T) => void;

/**
 * Create a signal from a cosignal.
 * 
 * ### Example
 * ```
 * const [ count, setCount ] = createSignal(0);
 * const [ double, setDouble ] = createSignalPair([
 * 	() => count() * 2,
 * 	(x) => void setCount(x / 2),
 * ]);
 * 
 * double(x => x + 2);
 * console.log(double(), count()); // 2 1
 * ```
 */
export function createCouple<T>(getter: Accessor<T>, setter: Cosetter<T>): Signal<T> {
	if (isDev) {
		// Assert that the input is valid.
		// For production, these checks are skipped for performance.
		
		if (typeof getter !== "function") {
			throw new Error(`expected getter to be a function, but got ${typeof getter}`);
		}
		if (typeof setter !== "function") {
			throw new Error(`expected setter to be a function, but got ${typeof setter}`);
		}
	}
	const get = createMemo(getter);
	const set = ((source) => {
		const value = (typeof source === "function") ? (source as Function)(untrack(get)) : source;
		setter(value);
		return value;
	}) as Setter<T>;
	return [ get, set ] as const;
}

// SHORTHANDS

/**
 * An atomic signal.
 * A signal where the getter and setter are combined into one function.
 */
export type Asig<T> = Atom<Signal<T>>;

/**
 * Create an atomic signal.
 * Short for `atom(createSignal(...))`.
 * 
 * ### Example
 * ```
 * const count = asig(0);
 * 
 * count(10);
 * console.log(count()); // 10
 * 
 * count(x => x + 10);
 * console.log(count()); // 20
 * ```
 */
export function asig<T>(): Asig<T | undefined>;
export function asig<T>(value: T, options?: SignalOptions<T>): Asig<T>;
export function asig<T>(value?: T | undefined, options?: SignalOptions<T | undefined>): Asig<T | undefined> {
	return atom(createSignal(value, options));
}

/**
 * Create an atomic cosignal pair.
 * Short for `atom(createCouple(...))`.
 * 
 * ### Example
 * ```
 * const count = asig(0);
 * const double = apair(() => count() * 2, (double) => void count(double / 2));
 * 
 * count(10);
 * console.log(count(), double()); // 10 20
 * 
 * double(100);
 * console.log(count(), double()); // 50 100
 * ```
 */
export function apair<T>(getter: Accessor<T>, setter: Cosetter<T>): Asig<T> {
	return atom(createCouple(getter, setter));
}
