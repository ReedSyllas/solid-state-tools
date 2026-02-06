import { batch, createComputed, createMemo, createRoot, createSelector, createSignal, getListener, getOwner, on, onCleanup, runWithOwner, untrack, type Accessor, type Resource, type Setter, type Signal, type SignalOptions } from "solid-js";
import { isDev } from "solid-js/web";

/**
 * A function that updates a state to the given value.
 * 
 * @see {@link Setter} (related type)
 */
export type Update<T> = (value: T) => void;

/**
 * Any tuple of two functions where the first accepts no arguments and the second accepts any amount.
 * 
 * Used as the source of an {@link Atom}.
 * 
 * @see {@link Atom}, {@link atom}
 */
export type SignalLike = readonly [
	getter: () => any,
	setter: (...args: any) => any,
];

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
			throw new Error(`expected signal to be an array, but got ${typeof signal}`);
		}
		if (typeof signal[0] !== "function") {
			throw new Error(`expected getter to be a function, but got ${typeof signal[0]}`);
		}
		if (typeof signal[1] !== "function") {
			throw new Error(`expected setter to be a function, but got ${typeof signal[1]}`);
		}
	}
	const [ getter, setter ] = signal;
	return Object.assign(
		(...args: unknown[]) => (args.length === 0) ? getter() : setter(...args),
		getter,
		setter,
	);
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
 * @see {@link Accessor} (input), {@link Update} (input), {@link PairOptions} (input), {@link Signal} (output)
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
export function createPair<T>(getter: Accessor<T>, setter: Update<T>, options?: PairOptions): Signal<T> {
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
 * Create an atomic getter setter pair. Short for `atom(createPair(...))`.
 * [See documentation.](https://github.com/ReedSyllas/solid-state-tools#atomic-pairs-apair)
 * 
 * @see {@link Accessor} (input), {@link Update} (input), {@link PairOptions} (input), {@link Asig} (output)
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
export function apair<T>(getter: Accessor<T>, setter: Update<T>, options?: PairOptions): Asig<T> {
	return atom(createPair(getter, setter, options));
}

export type Granular<T extends Setter<any>> = T & GranularMembers<T extends Setter<infer U> ? U : never>;

export type GranularMembers<T> = {
	/**
	 * Write a value to the signal.
	 * 
	 * Unlike a {@link Setter}, the value is interpreted literally as is.
	 * Therefore, a function can be passed here without it being invoked as a mapping function.
	 */
	set: (value: T) => void,
	/**
	 * Map the signal's current value to a new value.
	 * 
	 * Unlike a {@link Setter}, the value is expected to be a mapping function.
	 */
	map: (fn: (current: T) => T) => T,
	/**
	 * Modify the signal's value and then flush the updates to observers.
	 * 
	 * **This is intended for signals of an object with a special equals comparator.**
	 * 
	 * ## Troubleshooting
	 * 
	 * If a standard equals comparator is used for the signal, downstream observers will not be updated because the signal's value is still the same object after this call.
	 * This is a bug in your code. An equals comparator that tests the object more thoroughly must be specified.  
	 * **To fix**: set a custom equals comparator when creating the signal. See {@link sameObjectExclusionComparator}.
	 * 
	 * @see {@link sameObjectExclusionComparator}, {@link asig}, {@link createSignal}
	 * 
	 * @example
	 * ```ts
	 * const [ user, setUserRaw ] = createSignal({ firstName: "Anne", lastName: "Redwood" }, { equals: false });
	 * const setUser = granular(setUserRaw);
	 * 
	 * setUser.mod((user) => {
	 *   user.firstName = "Annabelle";
	 * });
	 * ```
	 * 
	 * @example
	 * ```ts
	 * const values: Granular<Asig<number[]>> = granular(asig([ 1, 2, 3 ], { equals: sameObjectExclusionComparator }));
	 * const lastItem = values.mod(x => x.pop());
	 * ```
	 */
	mod: <U = void>(fn: (current: T) => U) => U,
};

/**
 * Attaches useful methods to a setter-like value.
 * 
 * The methods provide an alternative syntax for updating a signal; one with more granular control.
 * 
 * This function is transparent over `setter`.
 * If passed a {@link Setter} type, it is returned as `Granular<Setter<T>>`.
 * If an {@link Asig} is passed, it is returned as `Granular<Asig<T>>`.
 * 
 * @see {@link Setter} (input), {@link Asig} (accepted input), {@link Granular} (output)
 * 
 * @example
 * ```ts
 * const [ count, setCountRaw ] = createSignal(0);
 * const setCount: Granular<Setter<number>> = granular(setCountRaw);
 * 
 * // Read count.
 * console.log(count());
 * 
 * // Update count with traditional setter.
 * setCount(2);
 * 
 * // Update count with traditional setter mapping function.
 * setCount(c => c + 1);
 * 
 * // Update count with granular `set` method.
 * setCount.set(9);
 * 
 * // Update value with granular `map` method.
 * setCount.map(c => c + 1);
 * ```
 * 
 * @example
 * ```ts
 * const list: Granular<Asig<number[]>> = granular(asig([ 1, 2 ], { equals: sameObjectExclusionComparator }));
 * 
 * // Push to list with `mod` method.
 * list.mod(x => x.push(3));
 * ```
 */
export function granular<T extends Setter<any>>(setter: T): Granular<T> {
	const members: GranularMembers<T extends Setter<infer U> ? U : never> = {
		set(value) {
			setter(() => value);
		},
		map(fn) {
			return setter((x) => fn(x));
		},
		mod(fn) {
			let value!: ReturnType<typeof fn>;
			setter((x) => {
				value = fn(x);
				return x;
			});
			return value;
		},
	};
	return Object.assign(setter, members);
}

/**
 * An equals comparison function that always returns false for objects.
 * 
 * @example
 * ```ts
 * const [ list, setList ] = createSignal<number[] | undefined>(undefined, { equals: sameObjectExclusionComparator });
 * setList(x => x);    // nothing happens because undefined equals undefined
 * 
 * setList([ 1, 2 ]);  // triggers update
 * setList(x => x);    // triggers update despite the value not changing (because it is an object)
 * ```
 */
export function sameObjectExclusionComparator<T>(prev: T, next: T): boolean {
	return typeof next !== "object" && prev === next;
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
	if (isDev) {
		// Assert that the input is valid.
		// For production, these checks are skipped for performance.
		
		if (typeof subject !== "function") {
			throw new Error(`expected subject to be a function, but got ${typeof subject}`);
		}
		if (typeof duration !== "number") {
			throw new Error(`expected duration to be a number, but got ${typeof duration}`);
		}
	}
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
	}, { defer: true }));
	return flagged;
}

/**
 * A function that will periodically call the given update function as needed.
 * The current value (stateful) is also available to the consumer for incremental changes.
 * 
 * @see {@link Update}, {@link Accessor}
 */
export type Winch<T, Initial extends T | undefined> = (update: Update<T>, value: Accessor<Initial>) => void;

/**
 * Options for creation of a spool signal.
 * 
 * @see {@link createSpool}
 */
export interface SpoolOptions<T> {
	/**
	 * The initial value of the spool signal.
	 * @default undefined
	 */
	initial?: T,
	/**
	 * If set to true, the winch will not be invoked until the spool signal is read for the first time.
	 * @default false
	 */
	late?: boolean,
}

/**
 * Create a signal from a winch.
 * 
 * This is essentially an alternative way of writing a signal declaration.
 * 
 * Note that the winch is not tracked and therefore does not automatically rerun when state changes.
 * This behavior can be implemented in the winch function itself, if desired.
 * Use {@link createFetched} for a reactive version.
 * 
 * @see {@link Winch} (input), {@link SpoolOptions} (input), {@link Accessor} (output)
 * 
 * @example
 * ```tsx
 * // A timer that updates each second.
 * const time: Accessor<number> = createSpool((setTime, curr) => {
 *   // Start timer.
 *   const interval = setInterval(() => void setTime(curr() + 1), 1000);
 *   
 *   // Dispose of timer when signal is destroyed.
 *   onCleanup(() => void clearInterval(interval));
 * }, {
 *   initial: 0,
 * });
 * 
 * <div>
 *   { time() }
 * </div>
 * ```
 */
export function createSpool<T>(winch: Winch<T, T>, options: SpoolOptions<T> & { initial: T }): Accessor<T>;
export function createSpool<T>(winch: Winch<T, T | undefined>, options?: SpoolOptions<T>): Accessor<T | undefined>;
export function createSpool<T>(winch: Winch<T, T | undefined>, options?: SpoolOptions<T>): Accessor<T | undefined> {
	const [ spool, setSpool ] = createSignal(options?.initial);
	const wind = () => winch((x) => setSpool(() => x), spool);
	if (options?.late) {
		const owner = getOwner();
		let init: (() => void) | undefined = () => {
			init = undefined;
			runWithOwner(owner, wind);
		};
		return () => {
			init?.();
			return spool();
		};
	}
	wind();
	return spool;
}

/**
 * A synchronous reactive state driven by a winch.
 * 
 * @see {@link Accessor}, {@link Winch}, {@link createFetched} (constructor)
 */
export type Fetched<T> = Accessor<T> & FetchedMembers<T>;

export interface FetchedMembers<T> {
	error: Accessor<unknown>,
	latest: Accessor<T>,
	state: Accessor<FetchedState>,
	is: (key: FetchedState) => boolean,
}

/**
 * Represents the current state of a fetched signal.
 * 
 * Its identical to {@link Resource.state} in meaning.
 * See the [table of definitions](https://docs.solidjs.com/reference/basic-reactivity/create-resource#resource) for that.
 * 
 * @see {@link Fetched.state}
 */
export type FetchedState = "unresolved" | "pending" | "ready" | "refreshing" | "errored";

/**
 * Create a signal that's driven by a tracked winch.
 * 
 * The winch is tracked and therefore is rerun when its state changes.
 * 
 * If the winch is rerun, the old winch can no longer mutate the state.
 * This prevents race conditions where the old winch attempts to write _after_ the new winch resolved.
 * 
 * @see {@link Winch} (input), {@link SpoolOptions} (input), {@link Fetched} (output)
 */
export function createFetched<T>(winch: Winch<T, T>, options: SpoolOptions<T> & { initial: T }): Fetched<T>;
export function createFetched<T>(winch: Winch<T, T | undefined>, options?: SpoolOptions<T>): Fetched<T | undefined>;
export function createFetched<T>(winch: Winch<T, T | undefined>, options?: SpoolOptions<T>): Fetched<T | undefined> {
	const [ error, setError ] = createSignal<unknown>();
	const [ latest, setLatest ] = createSignal(options?.initial);
	const [ state, setState ] = createSignal<FetchedState>("unresolved");
	const is = createSelector(state);
	let hasLatest = false;
	const fetched = createSpool<T | undefined>((update, value) => {
		createComputed(() => {
			let invalided = false;
			onCleanup(() => {
				invalided = true;
				update(undefined);
			});
			setState(hasLatest ? "refreshing" : "pending");
			try {
				winch((x) => {
					if (invalided) return;
					batch(() => {
						setState("ready");
						setLatest(() => x);
						hasLatest = true;
						update(x);
					});
				}, value);
			} catch (error) {
				batch(() => {
					setState("errored");
					setError(error);
				});
			}
		});
	}, options);
	return Object.assign(fetched, {
		error,
		latest,
		state,
		is,
	});
}

/**
 * @see {@link quantum} (constructor), {@link Accessor} (related)
 */
export type QuantumAccessor<T> = Accessor<T>;

/**
 * Create a quantum accessor.
 * 
 * A quantum accessor counts its listeners and executes `track` if it is used at least once.
 * When it is no longer used, `track`'s disposal function is invoked.
 * 
 * Quantum accessors have standalone utility, but their primary purpose was to create and destroy subscriptions on the fly.
 * Thus, {@link createSubscription} and {@link derive} replace most situations where {@link quantum} would be invoked directly.
 * 
 * Note that quantum accessors count listeners ambiguously.
 * Thus, some primitives must be substituted with a quantum-compatible one to preserve the 'quantum' behavior.
 * Using a quantum accessor in these primitives (e.g. {@link createMemo}) is not _wrong_, but it may have unintended side-effects.
 * Use {@link derive} in place of {@link createMemo} for quantum accessors.
 * 
 * Technically, {@link QuantumAccessor} is just an alias of {@link Accessor} and can be used anywhere {@link Accessor} is allowed.
 * However, it is useful to mark it this way due to the special handling (mentioned above) that's sometimes needed.
 * 
 * @example
 * ```ts
 * const [ source ] = createSignal(0);
 * const count = quantum(source, () => {
 *   console.log("count is now observed");
 *   return () => {
 *     console.log("count is no longer observed");
 *   };
 * });
 * 
 * createRoot((dispose) => {
 *   count(); // nothing happens because `createRoot` doesn't track signals
 *   
 *   createComputed(() => {
 *     count(); // prints "count is now observed" because `createComputed` started tracking `count`
 *     count(); // nothing happens because count is already tracked at least once
 *   });
 *   
 *   dispose(); // prints "count is no longer observed" because the `createComputed` is destroyed and `count` isn't tracked by anything else
 * });
 * ```
 */
export function quantum<T>(source: Accessor<T>, track: () => () => void): QuantumAccessor<T> {
	let counter = 0;
	let dispose: (() => void) | undefined;
	const count = () => {
		if (counter === 0) {
			dispose = untrack(track);
		}
		counter++;
	};
	const uncount = () => queueMicrotask(() => {
		counter--;
		if (counter === 0) {
			dispose?.();
			dispose = undefined;
		}
	});
	return () => {
		if (getListener()) {
			count();
			onCleanup(uncount);
		}
		return source();
	};
}

/**
 * Derive a new quantum accessor from an existing one while preserving the quantum behavior.
 * 
 * Essentially, this is a quantum-compatible version of {@link createMemo}.
 * 
 * This provides no advantage over {@link createMemo} for traditional accessors.
 * 
 * @see {@link quantum}, {@link QuantumAccessor}
 * 
 * @example
 * ```ts
 * const count: QuantumAccessor<number> = ...;
 * const double = derive(() => count() * 2);
 * ```
 */
export function derive<T>(source: QuantumAccessor<T>, options?: SignalOptions<T>): QuantumAccessor<T> {
	const [ value, setValue ] = createSignal(untrack(source), options);
	return quantum(value, () => createRoot((dispose) => {
		createComputed(() => void setValue(source));
		return dispose;
	}));
}

/**
 * Handler for a subscription.
 * 
 * @see {@link Subscription}, {@link createSubscription}
 */
export type Subscribable<T, Initial extends T | undefined> = {
	get: () => T,
	set: (value: Awaited<T>) => T extends Promise<any> ? Promise<void> : void,
	sub: (update: Update<Awaited<T>>) => () => void,
	reconcile?: (remote: Awaited<T>, local: Initial, cache: Awaited<T> | undefined) => Awaited<T>,
};

/**
 * A state driven by a remote subscription.
 * 
 * @see {@link createSubscription} (constructor), {@link QuantumAccessor} (component type)
 */
export type Subscription<T> = QuantumAccessor<Awaited<T>> & Setter<Awaited<T>> & SubscriptionMembers<T>;

export type SubscriptionMembers<T> = {
	/**
	 * The last known remote value.
	 * 
	 * It changes when a new remote value is pushed or pulled to this subscribable.
	 */
	cache: Accessor<Awaited<T> | undefined>,
	/**
	 * Fetch the remote value and reconcile it with the current value (local) and cache.
	 */
	pull: () => T,
	/**
	 * Push local to the remote.
	 */
	push: () => T extends Promise<any> ? Promise<void> : void,
	/**
	 * True if subscribed to the remote.
	 */
	subscribed: Accessor<boolean>,
	/**
	 * True if the current value (local) is different from the last known remote value (cache).
	 */
	detached: Accessor<boolean>,
};

/**
 * Options for creation of a subscription.
 * 
 * @see {@link createSubscription}, {@link Subscription}
 */
export interface SubscriptionOptions<T> {
	initial?: Awaited<T>,
}

/**
 * Create a new subscription from a subscribable (handler).
 * 
 * Quantum signals are used for dynamic subscription through observation.
 */
export function createSubscription<T>(handler: Subscribable<T, T>, options: SubscriptionOptions<T> & { initial: T }): Subscription<T>;
export function createSubscription<T>(handler: Subscribable<T, T | undefined>, options?: SubscriptionOptions<T>): Subscription<T | undefined>;
export function createSubscription<T>(handler: Subscribable<T, T | undefined>, options?: SubscriptionOptions<T>): Subscription<T | undefined> {
	const [ local, setLocal ] = createSignal<Awaited<T> | undefined>(options?.initial);
	let hasLocal = !!options?.initial;
	const [ cache, setCache ] = createSignal<Awaited<T> | undefined>();
	const [ subscribed, setSubscribed ] = createSignal(false);
	const detached = createMemo(() => local() !== cache());
	const updateFromRemote = (remote: Awaited<T>): Awaited<T> => batch(() => {
		const reconciled = handler.reconcile ? handler.reconcile(remote, untrack(local), untrack(cache)) : remote;
		hasLocal = true;
		setLocal(() => reconciled);
		setCache(() => reconciled);
		return reconciled;
	});
	const fn: Asig<Awaited<T> | undefined> = atom([
		quantum(local, () => {
			const dispose = handler.sub(updateFromRemote);
			setSubscribed(true);
			return () => {
				setSubscribed(false);
				dispose();
			};
		}),
		(...args: any) => {
			hasLocal = true;
			return setLocal(...args);
		},
	]);
	const members: SubscriptionMembers<T> = {
		pull() {
			const value = untrack(handler.get);
			if (typeof value === "object" && value !== null && value instanceof Promise) {
				return new Promise<Awaited<T>>((resolve, reject) => {
					value.then((x) => {
						resolve(updateFromRemote(x));
					});
					value.catch(reject);
				}) as T;
			}
			return updateFromRemote(value as Awaited<T>) as T;
		},
		push(): any {
			if (!hasLocal) return;
			const value = handler.set(untrack(local)!);
			if (typeof value === "object" && value !== null && value instanceof Promise) {
				return value;
			}
		},
		cache,
		subscribed,
		detached,
	};
	return Object.assign(fn, members);
}
