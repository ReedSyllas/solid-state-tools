import { type Accessor, createSignal } from "solid-js";

function isRef(value: any): value is object {
	return value !== null && typeof value === "object";
}

let OWNER: Owner | null = null;

export class Owner {
	/** A stack: the last cleanup registered runs first. Duplicates are kept at each position. */
	private readonly _cleanups: (() => void)[] = [];
	private _disposed = false;

	constructor(parent: Owner | null) {
		parent?.onDispose(() => this.dispose());
	}

	dispose() {
		if (this._disposed) return;
		this._disposed = true;
		// Pop rather than iterate a snapshot, so cleanups registered during disposal still run.
		let cleanup: (() => void) | undefined;
		while ((cleanup = this._cleanups.pop()) !== undefined) {
			cleanup();
		}
		Object.freeze(this);
	}

	/** Registers `fn` to run on dispose. If this owner is already disposed, `fn` runs immediately. */
	onDispose(fn: () => void) {
		if (this._disposed) {
			fn();
			return;
		}
		this._cleanups.push(fn);
	}
}

export function getOwner(): Owner | null {
	return OWNER;
}

export function getOwnerRequired(): Owner {
	if (OWNER === null) {
		throw new Error(
			"An owner is required. Make sure this code runs with one.",
		);
	}
	return OWNER;
}

export function runWithOwner<T>(owner: Owner | null, fn: () => T): T {
	const currOwner = OWNER;
	OWNER = owner;
	try {
		return fn();
	} finally {
		OWNER = currOwner;
	}
}

let TURN: Owner | null = null;

export function getTurn(): Owner | null {
	return TURN;
}

export function getTurnRequired(): Owner {
	if (TURN === null) {
		throw new Error(
			"A turn is required. Make sure this code runs with one.",
		);
	}
	return TURN;
}

export function turn<T>(fn: () => T): T {
	if (TURN !== null) {
		// Already inside a turn: join it, so its changes settle together with the outer turn's.
		return fn();
	}
	const turn = new Owner(null);
	TURN = turn;
	try {
		return fn();
	} finally {
		// Always settle, even if `fn` threw. Otherwise the graph stays queued and never notifies again.
		// TURN stays set while disposing because settling observers may `set` (which needs a turn).
		try {
			turn.dispose();
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
			getTurnRequired().onDispose(this._settle);
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
		let rounds = 0;
		try {
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

	constructor(
		protected readonly _graph: Graph,
		protected readonly _resolveId: () => GraphId,
		private readonly _get: () => T,
	) {
		this._id = _resolveId();
		this._unbind = this._graph.bind(this._id, this);
	}

	/** Always computed from the source, so it is never stale, even mid-turn. */
	get(): T {
		return this._get();
	}

	onEffect(observer: (value: T) => void): () => void {
		const run = () => observer(this.get());
		this._observers.add(run);
		return () => {
			this._observers.delete(run);
		};
	}

	effect(observer: (value: T) => void): void {
		getOwnerRequired().onDispose(this.onEffect(observer));
	}

	/**
	 * Creates a read-only lens of `transform(this.get())`, owned by the current owner.
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
		const owner = getOwnerRequired();
		const derived = new RoLens<U>(
			this._graph,
			() => this._graph.createId(),
			() => transform(this.get()),
		);
		let last = eq ? derived.get() : undefined;
		// Subscribe to the lens rather than its id, so this follows key lenses when they rebind.
		const unsubscribe = this.onEffect(() => {
			if (eq) {
				const next = derived.get();
				if (eq(last as U, next)) return;
				last = next;
			}
			derived._graph.invalidate(derived._id);
		});
		derived._cleanups.push(unsubscribe);
		owner.onDispose(() => RoLens.dispose(derived));
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
	}

	/** Teardown hook for subclasses. Called once, by {@link RoLens.dispose}. */
	protected _dispose() {
		let cleanup: (() => void) | undefined;
		while ((cleanup = this._cleanups.pop()) !== undefined) {
			cleanup();
		}
		this._unbind();
		this._observers.clear();
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
 * Lifetime: a lens from {@link createLens} belongs to the current owner. A key lens belongs to its
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

	set(next: T): void {
		this._set(next);
		this._graph.invalidate(this._id);
		// Every lens viewing this slot now has a new value, so all of their descendants must rebind.
		for (const lens of this._graph.lensesAt(this._id)) {
			if (lens instanceof Lens) {
				lens._refreshChildren();
			}
		}
	}

	setWith(fn: (curr: T) => T): void {
		this.set(fn(this.get()));
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
			() => this._graph.keyId(this.get(), key),
			() => this.get()[key],
			(next) => {
				this.get()[key] = next;
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
	const owner = getOwnerRequired();
	const lens = new Lens<T>(
		GLOBAL_GRAPH,
		() => GLOBAL_GRAPH.createId(),
		() => value,
		(next) => {
			value = next;
		},
	);
	owner.onDispose(() => RoLens.dispose(lens));
	return lens;
}

export function createBlinker(
	lens: RoLens<any>,
	/** Duration in ms. */ duration: number = 500,
): Accessor<boolean> {
	const [blinking, setBlinking] = createSignal(false);
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

export function test() {
	console.clear();
	console.group("v3");

	const source = { x: 7, y: 4, z: { a: false, b: false } };

	const owner = new Owner(getOwner());
	console.log("owner: created");

	runWithOwner(owner, () => {
		const point = createLens(source);

		const x = point.key("x");
		x.effect((value) => {
			console.log("x changed:", value);
		});

		const y = point.key("y");
		y.effect((value) => {
			console.log("y changed:", value);
		});

		const z = point.key("z");

		const a = z.key("a");
		a.effect((value) => {
			console.log("a changed:", value);
		});

		const b = z.key("b");
		b.effect((value) => {
			console.log("b changed:", value);
		});

		const zAlt = createLens(point.get().z);

		// Replacing a root is independent: point.z is untouched and no observers fire.
		turn(() => {
			zAlt.set({ a: true, b: true });
			console.log("a:", a.get(), "& b:", b.get());
		});

		// Writing through a key of the same object is shared: "a changed" fires.
		const zFresh = createLens(point.get().z);
		turn(() => {
			zFresh.key("a").set(true);
		});

		// Replacing point.z rebinds a and b to the new object: both fire.
		turn(() => {
			z.set({ a: false, b: true });
		});

		// b now tracks the new object, so a write through another root still reaches it: "b changed" fires.
		const zNew = createLens(point.get().z);
		turn(() => {
			zNew.key("b").set(false);
		});

		console.log(point);
	});

	owner.dispose();
	console.log("owner: disposed");

	console.log(source);

	console.groupEnd();
}
