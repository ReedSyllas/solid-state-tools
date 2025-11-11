import { createSignal, untrack, type Signal, type SignalOptions } from "solid-js";
import { isDev } from "solid-js/web";

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
		// For production, the checks are skipped for performance.
		
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
	return (...args: any) => (args.length === 0) ? (value as any)[0]() : (value as any)[1](...args);
}

/**
 * An atomic signal.
 * A signal where the getter and setter are combined into one function.
 */
export type Asig<T> = Atom<Signal<T>>;

/**
 * Create an atomic signal.
 * Shorthand for `atom(createSignal(...))`.
 *
 * ### Example
 * ```
 * const count = asig(0);
 * ```
 */
export function asig<T>(): Atom<Signal<T | undefined>>;
export function asig<T>(value: T, options?: SignalOptions<T>): Atom<Signal<T>>;
export function asig<T>(...args: [ value?: T, options?: SignalOptions<T> ]): Atom<Signal<T> | Signal<T | undefined>> {
	return atom(args.length === 0 ? createSignal<T>() : createSignal(args[0] as T, args[1]));
}

/**
 * A getter setter pair.
 * While similar to `Signal`, the setter of
 *  `Cosignal` does not accept a mapping function.
 */
export type Cosignal<T> = [
	() => T,
	(value: T) => T,
];

/**
 * Create signal from a getter/setter tuple.
 *
 * ### Example
 * ```
 * const [ count, setCount ] = createSignal(0);
 * const [ double, setDouble ] = createCosignal([
 * 	() => count() * 2,
 * 	(x) => void setCount(x / 2),
 * ]);
 *
 * double(x => x + 2);
 * console.log(double(), count()); // 12 6
 * ```
 */
export function createCosignal<T>(cosignal: Cosignal<T>): Signal<T> {
	if (isDev) {
		// Assert that the input is valid.
		// For production, the checks are skipped for performance.
		
		if (!Array.isArray(cosignal)) {
			throw new Error(`expected a getter setter pair as an array, but got ${typeof cosignal}`);
		}
		if (typeof cosignal[0] !== "function") {
			throw new Error(`expected a getter function, but got ${typeof cosignal[0]}`);
		}
		if (typeof cosignal[1] !== "function") {
			throw new Error(`expected a setter function, but got ${typeof cosignal[1]}`);
		}
	}
	const [ get, set ] = cosignal;
	return [
		get,
		(value) => set((typeof value === "function") ? (value as any)(untrack(get)) : value),
	] as Signal<T>;
}
