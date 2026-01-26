import { createComputed, createMemo, createSignal, on, untrack, type Accessor, type Setter, type Signal, type SignalOptions } from "solid-js";
import { isDev } from "solid-js/web";

/**
 * Any tuple of two functions where the first accepts no arguments and the second accepts any amount.
 * 
 * Used as the source of an {@link Atom}.
 * 
 * @see {@link Atom}, {@link atom}
 */
export type SignalLike = readonly [ () => any, (...args: any) => any ];

/**
 * An {@link Atom} is a polymorphic function that calls one of two
 *  functions depending on the number of arguments it has.
 * 
 * If called with zero arguments, the first function is called.
 * Otherwise, the second function is called with all arguments forwarded to it.
 * 
 * @see {@link SignalLike}, {@link atom} (constructor)
 */
export type Atom<T extends SignalLike = SignalLike> = T[0] & T[1];

/**
 * Combine a getter and setter function pair into one.
 * [See documentation.](https://github.com/ReedSyllas/solid-state-tools#atoms-atom)
 * 
 * Accepts a tuple of two functions.
 * The first is the getter, the second is the setter.
 * A new function is returned that, when called with zero arguments, calls the getter.
 * Otherwise, it calls the setter and forwards all of the arguments.
 * 
 * @see {@link SignalLike} (input), {@link Atom} (output)
 * 
 * @example
 * ```ts
 * const count: Atom<Signal<T>> = atom(createSignal(0));
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
export function atom<const T extends SignalLike>(signal: T): Atom<T> {
	if (isDev) {
		// Assert that the input is valid.
		// For production, these checks are skipped for performance.
		
		if (!Array.isArray(signal)) {
			throw new Error(`expected a getter setter pair as an array, but got ${typeof signal}`);
		}
		if (typeof signal[0] !== "function") {
			throw new Error(`expected a getter function, but got ${typeof signal[0]}`);
		}
		if (typeof signal[1] !== "function") {
			throw new Error(`expected a setter function, but got ${typeof signal[1]}`);
		}
	}
	const [ getter, setter ] = signal;
	return (...args: unknown[]) => (args.length === 0) ? getter() : setter(...args);
}

/**
 * Similar to a signal setter, except it doesn't accept a mapping function nor return a result.
 * 
 * @see {@link createPair} (for example usage)
 */
export type Writer<T> = (value: T) => void;

export interface PairOptions {
	/**
	 * @default true
	 */
	memoized: boolean,
}

/**
 * Create a signal from a getter setter pair.
 * [See documentation.](https://github.com/ReedSyllas/solid-state-tools#pairs-createpair)
 * 
 * **The getter is immediately invoked for memoization.**
 * 
 * @see {@link Accessor} (input), {@link Writer} (input), {@link PairOptions} (input), {@link Signal} (output)
 * 
 * @example
 * ```ts
 * const [ count, setCount ] = createSignal(0);
 * const [ double, setDouble ] = createPair(() => count() * 2, (x) => setCount(x / 2));
 * 
 * setDouble(x => x + 2);
 * console.log(double(), count()); // 2 1
 * ```
 */
export function createPair<T>(getter: Accessor<T>, setter: Writer<T>, options?: PairOptions): Signal<T> {
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
	const get = options?.memoized === false ? getter : createMemo(getter);
	const set = ((source) => {
		const value = (typeof source === "function") ? (source as Function)(untrack(get)) : source;
		setter(value);
		return value;
	}) as Setter<T>;
	return [ get, set ] as const;
}

/**
 * Create a reactive boolean that temporarily flips to true when the subject changes value.
 * 
 * Useful for flashing an element when a signal changes value.
 * Perhaps to draw the user's attention to it.
 * 
 * @param subject The subject to track for changes.
 * @param duration The duration in milliseconds to "blink" before resetting to false. Default: 500.
 * 
 * @see {@link Accessor}
 * 
 * @example
 * ```tsx
 * const [ count, setCount ] = createSignal(0);
 * const countBlinked = createBlinker(count, 200);
 * 
 * <span style={ { "color": countBlinked() ? "orange" : undefined } }>
 *   { count() }
 * </span>
 * ```
 */
export function createBlinker(subject: Accessor<unknown>, duration: number = 500): Accessor<boolean> {
	const [ flagged, setFlagged ] = createSignal(false);
	let timeout: ReturnType<typeof setTimeout> | undefined;
	createComputed(on(subject, () => {
		if (timeout !== undefined) {
			clearTimeout(timeout);
		} else {
			setFlagged(true);
		}
		timeout = setTimeout(() => {
			setFlagged(false);
			timeout = undefined;
		}, duration);
	}));
	return flagged;
}

/**
 * An atomic signal. A signal where the getter and setter are combined into one function.
 * 
 * @see {@link Atom}, {@link asig} (constructor)
 */
export type Asig<T> = Atom<Signal<T>>;

/**
 * Create an atomic signal. Short for `atom(createSignal(...))`.
 * [See documentation.](https://github.com/ReedSyllas/solid-state-tools#atomic-signals-asig)
 * 
 * @see {@link Asig} (output), {@link Atom}, {@link atom}
 * 
 * @example
 * ```ts
 * const count = asig(0);
 * 
 * count(10);
 * console.log(count()); // 10
 * 
 * count(x => x + 10);
 * console.log(count()); // 20
 * ```
 */
export function asig<T>(value: T, options?: SignalOptions<T>): Asig<T>;
export function asig<T>(): Asig<T | undefined>;
export function asig<T>(value?: T | undefined, options?: SignalOptions<T | undefined>): Asig<T | undefined> {
	return atom(createSignal(value, options));
}

/**
 * Create an atomic getter setter pair. Short for `atom(createPair(...))`.
 * [See documentation.](https://github.com/ReedSyllas/solid-state-tools#atomic-pairs-apair)
 * 
 * @see {@link Accessor} (input), {@link Writer} (input), {@link PairOptions} (input), {@link Asig} (output)
 * 
 * @example
 * ```ts
 * const count = asig(0);
 * const double = apair(() => count() * 2, (x) => count(x / 2));
 * 
 * count(10);
 * console.log(count(), double()); // 10 20
 * 
 * double(100);
 * console.log(count(), double()); // 50 100
 * ```
 */
export function apair<T>(getter: Accessor<T>, setter: Writer<T>, options?: PairOptions): Asig<T> {
	return atom(createPair(getter, setter, options));
}
