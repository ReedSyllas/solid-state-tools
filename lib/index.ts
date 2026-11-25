import {
	type Accessor,
	createSignal,
	getObserver,
	getOwner,
	onCleanup,
	type Signal,
	untrack,
} from "solid-js";

function isRef(value: any): value is object {
	return value !== null && typeof value === "object";
}

/**
 * Throws when there is no Solid owner. Without one, `onCleanup` never runs and lenses would leak
 * their graph ids. Call it before allocating anything.
 */
function requireOwner() {
	if (getOwner() === null) {
		throw new Error(
			"A Solid owner is required. Create this inside a component, `createRoot`, or `runWithOwner`.",
		);
	}
}

/** Callbacks to run when the current turn ends, or `null` when no turn is active. */
let TURN: (() => void)[] | null = null;

export function isInTurn(): boolean {
	return TURN !== null;
}

/** Schedules `fn` to run when the current turn ends. Throws when no turn is active. */
export function onTurnEnd(fn: () => void) {
	if (TURN === null) {
		throw new Error(
			"A turn is required. Make sure this code runs with one.",
		);
	}
	TURN.push(fn);
}

/**
 * Runs `fn` as one turn: all changes made inside it settle together when it returns. Nested calls
 * join the outer turn. `set` starts a turn on its own, so this is only needed to group writes.
 */
export function turn<T>(fn: () => T): T {
	if (TURN !== null) {
		return fn();
	}
	const queue: (() => void)[] = [];
	TURN = queue;
	try {
		return fn();
	} finally {
		// Always settle, even if `fn` threw. Otherwise the graph stays queued and never notifies again.
		// TURN stays set while settling because observers may `set`, which joins this turn.
		try {
			let next: (() => void) | undefined;
			while ((next = queue.shift()) !== undefined) {
				next();
			}
		} finally {
			TURN = null;
		}
	}
}

export function withTurn<T>(fn: () => T): () => T {
	return () => turn(fn);
}

export type GraphId = number;

/**
 * Tracks which lenses are bound to which ids and which ids changed during the current turn.
 *
 * There are two kinds of ids:
 * - **Root ids** are created per {@link createLens} call. A root is its own slot, so two roots
 *   holding the same object are still independent.
 * - **Key ids** identify the slot `(object, key)`. Every key lens whose parent currently holds
 *   `object` shares this id, so a write through any of them notifies all of them.
 *
 * An id is released (and recycled) once no lens is bound to it.
 */
export class Graph {
	private nextId: GraphId = 0;
	private readonly sparseIds: GraphId[] = [];
	private readonly lenses = new Map<GraphId, Set<RoLens<any>>>();
	private readonly releasers = new Map<GraphId, () => void>();
	private readonly keyIds = new WeakMap<object, Map<PropertyKey, GraphId>>();
	private readonly invalidatedIds = new Set<GraphId>();
	private isInTurnQueue = false;

	createId(onRelease?: () => void): GraphId {
		let id = this.sparseIds.pop();
		if (id === undefined) {
			id = this.nextId;
			this.nextId += 1;
		}
		this.lenses.set(id, new Set());
		if (onRelease) this.releasers.set(id, onRelease);
		return id;
	}

	/** Returns the id of the slot `(target, key)`, creating it if needed. */
	keyId(target: unknown, key: PropertyKey): GraphId {
		if (!isRef(target)) {
			// There is no shared slot to identify, so the lens gets a private id.
			return this.createId();
		}
		let ids = this.keyIds.get(target);
		if (!ids) {
			ids = new Map();
			this.keyIds.set(target, ids);
		}
		let id = ids.get(key);
		if (id === undefined) {
			const slots = ids;
			id = this.createId(() => {
				slots.delete(key);
			});
			ids.set(key, id);
		}
		return id;
	}

	/** Binds `lens` to `id`. Returns a function that unbinds it, releasing `id` if it was the last lens. */
	bind(id: GraphId, lens: RoLens<any>): () => void {
		this.lenses.get(id)!.add(lens);
		let unbound = false;
		return () => {
			if (unbound) return;
			unbound = true;
			const bound = this.lenses.get(id)!;
			bound.delete(lens);
			if (bound.size === 0) {
				this.release(id);
			}
		};
	}

	lensesAt(id: GraphId): RoLens<any>[] {
		return this.lenses.get(id)?.values().toArray() ?? [];
	}

	invalidate(id: GraphId) {
		this.invalidatedIds.add(id);
		if (!this.isInTurnQueue) {
			onTurnEnd(this._settle);
			this.isInTurnQueue = true;
		}
	}

	dispose() {
		Object.freeze(this);
	}

	private release(id: GraphId) {
		console.log("should dispose id:", id);
		this.lenses.delete(id);
		this.invalidatedIds.delete(id);
		this.releasers.get(id)?.();
		this.releasers.delete(id);
		if (id === this.nextId - 1) {
			this.nextId -= 1;
		} else {
			this.sparseIds.push(id);
		}
	}

	private _settle = () => {
		// Observers may `set` while settling, which invalidates more ids. Keep draining until stable.
		// Solid batches the trigger writes itself (they apply on its next flush), so computations only
		// ever see the settled graph. `untrack` keeps observers from subscribing a Solid computation
		// that happened to call `set`.
		let rounds = 0;
		try {
			untrack(() => {
			while (this.invalidatedIds.size > 0) {
				if (++rounds > MAX_SETTLE_ROUNDS) {
					throw new Error(
						`Graph did not settle after ${MAX_SETTLE_ROUNDS} rounds. An effect is likely setting state it depends on.`,
					);
				}
				const ids = this.invalidatedIds.values().toArray();
				this.invalidatedIds.clear();
				for (const invalidatedId of ids) {
					for (const lens of this.lensesAt(invalidatedId)) {
						RoLens.notify(lens);
					}
				}
			}
			});
		} finally {
			this.invalidatedIds.clear();
			this.isInTurnQueue = false;
		}
	};
}

const MAX_SETTLE_ROUNDS = 100;

const GLOBAL_GRAPH = new Graph();

/**
 * A read-only view of a value in the graph.
 *
 * Effects run when the turn that changed the value settles. A derived lens (from {@link derive})
 * is notified one settle round after its source, so chains of derived lenses propagate naturally.
 */
export class RoLens<T> {
	protected _id: GraphId;
	protected _unbind: () => void;
	protected _disposed = false;
	private readonly _observers = new Set<() => void>();
	/** Extra teardown, e.g. a derived lens unsubscribing from its source. Runs newest first. */
	private readonly _cleanups: (() => void)[] = [];
	/**
	 * Created on the first tracked read and dropped once Solid has no subscribers, so lenses that
	 * aren't being watched by Solid don't hold a signal.
	 */
	private _trigger: Signal<void> | undefined;

	constructor(
		protected readonly _graph: Graph,
		protected readonly _resolveId: () => GraphId,
		private readonly _get: () => T,
	) {
		this._id = _resolveId();
		this._unbind = this._graph.bind(this._id, this);
	}

	/**
	 * Reads the value and, inside a Solid computation (JSX, a `createEffect` compute, `createMemo`,
	 * ...), subscribes it to this lens. The computation re-runs on Solid's next flush after the turn
	 * that changed it settles.
	 */
	get(): T {
		if (getObserver() !== null && !this._disposed) {
			if (this._trigger === undefined) {
				const trigger: Signal<void> = createSignal<void>(undefined, {
					equals: false,
					// Lenses may be set from a component body or computation (e.g. a lens effect reacting
					// to another lens). The trigger is internal, so it opts out of Solid's owned-write guard.
					ownedWrite: true,
					unobserved: () => {
						// The lens may be disposed (and frozen) by the time Solid lets go.
						if (!this._disposed && this._trigger === trigger) {
							this._trigger = undefined;
						}
					},
				});
				this._trigger = trigger;
			}
			this._trigger[0]();
		}
		return this._get();
	}

	/** Reads the value without subscribing. Always computed from the source, so it is never stale. */
	peek(): T {
		return this._get();
	}

	onEffect(observer: (value: T) => void): () => void {
		const run = () => observer(this.peek());
		this._observers.add(run);
		return () => {
			this._observers.delete(run);
		};
	}

	effect(observer: (value: T) => void): void {
		requireOwner();
		onCleanup(this.onEffect(observer));
	}

	/**
	 * Creates a read-only lens of `transform(this.peek())`, owned by the current Solid owner.
	 *
	 * If `eq` is given, the derived lens only notifies when `eq(previous, next)` is false, where
	 * `previous` is the last value it notified with (or its initial value).
	 */
	derive<U>(
		transform: (value: T) => U,
		eq?: (curr: U, next: U) => boolean,
	): RoLens<U> {
		if (this._disposed) {
			throw new Error("Cannot derive from a disposed lens.");
		}
		requireOwner();
		const derived = new RoLens<U>(
			this._graph,
			() => this._graph.createId(),
			// Untracked: the derived lens's own trigger is what Solid should see, or `eq` is bypassed.
			() => transform(this.peek()),
		);
		let last = eq ? derived.peek() : undefined;
		// Subscribe to the lens rather than its id, so this follows key lenses when they rebind.
		const unsubscribe = this.onEffect(() => {
			if (eq) {
				const next = derived.peek();
				if (eq(last as U, next)) return;
				last = next;
			}
			derived._graph.invalidate(derived._id);
		});
		derived._cleanups.push(unsubscribe);
		onCleanup(() => RoLens.dispose(derived));
		return derived;
	}

	/** Like {@link derive} with an identity transform: notifies only when the value is not `Object.is` equal. */
	distinct(): RoLens<T> {
		return this.distinctBy(Object.is);
	}

	/** Like {@link derive} with an identity transform: notifies only when `eq` returns false. */
	distinctBy(eq: (curr: T, next: T) => boolean): RoLens<T> {
		return this.derive((value) => value, eq);
	}

	private _notify() {
		for (const observer of Array.from(this._observers)) {
			observer();
		}
		this._trigger?.[1]();
	}

	/** Teardown hook for subclasses. Called once, by {@link RoLens.dispose}. */
	protected _dispose() {
		let cleanup: (() => void) | undefined;
		while ((cleanup = this._cleanups.pop()) !== undefined) {
			cleanup();
		}
		this._unbind();
		this._observers.clear();
		// Solid computations still subscribed simply stop updating.
		this._trigger = undefined;
	}

	static dispose(lens: RoLens<any>) {
		if (lens._disposed) return;
		lens._disposed = true;
		lens._dispose();
		Object.freeze(lens);
	}

	/** @internal Runs this lens's observers. Called by the graph when the turn settles. */
	static notify(lens: RoLens<any>) {
		lens._notify();
	}
}

/**
 * A readable/writable view of a location.
 *
 * - `set` replaces the value at this lens's location. For a root lens that location is private
 *   to the lens. For a key lens it is the `(object, key)` slot, which every lens viewing that slot
 *   sees.
 * - Replacing a value rebinds all descendant key lenses to the new object's slots and notifies them.
 *
 * Lifetime: a lens from {@link createLens} belongs to the current Solid owner. Inside a
 * `createEffect` or `createMemo` that is the computation, so the lens is disposed on each re-run. A key lens belongs to its
 * parent lens (not to whichever owner first called `.key()`), so it is cached safely across owners
 * and is disposed, in reverse creation order, right before its parent.
 */
export class Lens<T> extends RoLens<T> {
	private readonly _children = new Map<PropertyKey, Lens<any>>();

	constructor(
		graph: Graph,
		resolveId: () => GraphId,
		get: () => T,
		private readonly _set: (next: T) => void,
	) {
		super(graph, resolveId, get);
	}

	/** Replaces the value. Starts a turn if none is active, so effects run before this returns. */
	set(next: T): void {
		turn(() => {
			this._set(next);
			this._graph.invalidate(this._id);
			// Every lens viewing this slot now has a new value, so all of their descendants must rebind.
			for (const lens of this._graph.lensesAt(this._id)) {
				if (lens instanceof Lens) {
					lens._refreshChildren();
				}
			}
		});
	}

	setWith(fn: (curr: T) => T): void {
		this.set(fn(this.peek()));
	}

	key<T extends object, K extends keyof T>(
		this: Lens<T>,
		key: K,
	): Lens<T[K]> {
		if (this._disposed) {
			throw new Error("Cannot create a key lens from a disposed lens.");
		}
		const cached = this._children.get(key);
		if (cached && !cached._disposed) {
			return cached;
		}
		// Re-insert so iteration order (and thus disposal order) matches creation order.
		this._children.delete(key);
		const child = new Lens<T[K]>(
			this._graph,
			() => this._graph.keyId(this.peek(), key),
			() => this.peek()[key],
			(next) => {
				this.peek()[key] = next;
			},
		);
		this._children.set(key, child);
		return child;
	}

	/** Re-resolves this lens's slot after an ancestor changed, then does the same for its children. */
	private _refresh() {
		const next = this._resolveId();
		if (next !== this._id) {
			// Bind before unbinding so `next` can't be recycled in between.
			const unbindNext = this._graph.bind(next, this);
			this._unbind();
			this._id = next;
			this._unbind = unbindNext;
		}
		this._graph.invalidate(this._id);
		this._refreshChildren();
	}

	private _refreshChildren() {
		for (const [key, child] of this._children) {
			if (child._disposed) {
				this._children.delete(key);
			} else {
				child._refresh();
			}
		}
	}

	protected override _dispose() {
		// Children were created after their parent, so they go first, newest first.
		for (const child of this._children.values().toArray().reverse()) {
			RoLens.dispose(child);
		}
		this._children.clear();
		super._dispose();
	}
}

/**
 * Creates an independent root lens. Two roots created from the same object share key slots
 * (writes through `.key()` are seen by both), but `set` on one never affects the other.
 */
export function createLens<T>(value: T): Lens<T> {
	requireOwner();
	const lens = new Lens<T>(
		GLOBAL_GRAPH,
		() => GLOBAL_GRAPH.createId(),
		() => value,
		(next) => {
			value = next;
		},
	);
	onCleanup(() => RoLens.dispose(lens));
	return lens;
}

export function createBlinker(
	lens: RoLens<any>,
	/** Duration in ms. */ duration: number = 500,
): Accessor<boolean> {
	// Written from lens observers, which may run inside an owned scope.
	const [blinking, setBlinking] = createSignal(false, { ownedWrite: true });
	let timeout: ReturnType<typeof setTimeout> | undefined;
	lens.effect(() => {
		if (timeout !== undefined) {
			clearTimeout(timeout);
		} else {
			setBlinking(true);
		}
		timeout = setTimeout(() => {
			timeout = undefined;
			setBlinking(false);
		}, duration);
	});
	return blinking;
}

export type Delta<T extends object> = Change<T>[];

export type Change<T extends object> =
	| SetChange<T, keyof T>
	| DeleteChange<T, keyof T>;

export type SetChange<T extends object, K extends keyof T> = {
	type: "set";
	key: K;
	value: T[K];
};

export type DeleteChange<T extends object, K extends keyof T> = {
	type: "delete";
	key: K;
};

export class ResizableKeyedLens<T extends object> {
	private _delta: Delta<T> = [];

	constructor(
		private _set: <K extends keyof T>(key: K, value: T[K]) => void,
		private _delete: (key: keyof T) => void,
	) {}

	set<K extends keyof T>(key: K, value: T[K]): void {
		this._set(key, value);
		this._delta.push({ type: "set", key, value });
	}

	delete(key: keyof T): void {
		this._delete(key);
		this._delta.push({ type: "delete", key });
	}
}
