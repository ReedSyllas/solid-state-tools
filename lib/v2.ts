
type Id = number;
let nextId: Id = 0;
const globalObservers = new Map<Id, Set<() => void>>();
const globalObjectLookup = new WeakMap<object, Id>();
const globalKeyLookup = new Map<Id, Map<string, Id>>();

export class Signal<T> {
	private _id: Id;
	
	constructor(private _value: T) {
		if (_value !== null && typeof _value === "object") {
			const id = globalObjectLookup.get(_value);
			if (id === undefined) {
				const id = nextId;
				nextId += 1;
				globalObservers.set(id, new Set());
				globalObjectLookup.set(_value, id);
				this._id = id;
			} else {
				this._id = id;
			}
		} else {
			const id = nextId;
			nextId += 1;
			globalObservers.set(id, new Set());
			this._id = id;
		}
	}
	
	get(): T {
		return this._value;
	}
	
	set(value: T): void {
		this._value = value;
		for (const observer of Array.from(globalObservers.get(this._id)!)) {
			observer();
		}
	}
	
	on(observer: (curr: T) => void): () => void {
		const transform = () => observer(this.get());
		globalObservers.get(this._id)!.add(transform);
		return () => {
			globalObservers.get(this._id)!.delete(transform);
		};
	}
}

export class Lens<T> {
	private readonly _observers = new Set<(value: T) => void>();
	
	constructor(private _get: () => T, private _set: (next: T) => void) {}
	
	get(): T {
		return this._get();
	}
	
	set(next: T): void {
		this._set(next);
		for (const observer of Array.from(this._observers)) {
			observer(this._get());
		}
	}
	
	setWith(fn: (curr: T) => T): void {
		this._set(fn(this._get()));
	}
	
	derive<U>(transform: (value: T) => U): DeriveLens<U> {
		return new DeriveLens<U>(this, transform);
	}
	
	on(fn: (value: T) => void): () => void {
		this._observers.add(fn);
		return () => {
			this._observers.delete(fn);
		};
	}
}

export class DeriveLens<T> {
	constructor(private _lens: Lens<any>, private _transform: (value: any) => T) {}
	
	get(): T {
		return this._transform(this._lens.get());
	}
	
	on(fn: (value: T) => void): () => void {
		return this._lens.on((value) => fn(this._transform(value)));
	}
}

export class KeyedLens<T extends object> {
	private readonly _keyLens: { [K in keyof T]?: Lens<T[K]> } = {};
	
	constructor(private _getKey: <K extends keyof T>(key: K) => T[K], private _setKey: <K extends keyof T>(key: K, value: T[K]) => void) {}
	
	key<K extends keyof T>(key: K): Lens<T[K]> {
		return this._keyLens[key] ??= new Lens(() => this._getKey(key), (next) => this._setKey(key, next));
	}
}

export function test() {
	console.clear();
	// test1();
	// test2();
	test3();
}

export function test1() {
	console.group("test1");
	let source = 10;
	const count = new Lens(() => source, x => { source = x; });
	const double = new Lens(() => source * 2, x => count.set(x / 2));
	function log() {
		console.log(`count: ${count.get()}, double: ${double.get()}, source:`, source);
	}
	log();
	count.set(100);
	log();
	count.setWith(x => x * 2);
	log();
	double.set(50);
	log();
	console.groupEnd();
}

export function test2() {
	console.group("test2");
	const source = { a: 0, b: 0 };
	const value = new KeyedLens<typeof source>((key) => source[key], (key, value) => { source[key] = value; });
	const a = value.key("a");
	a.on((x) => { console.log("a changed", x); });
	const aDouble  = a.derive(x => x * 2);
	aDouble.on((x) => { console.log("aDouble changed", x); });
	const b = value.key("b");
	b.on((x) => { console.log("b changed", x); });
	const bDouble  = b.derive(x => x * 2);
	bDouble.on((x) => { console.log("bDouble changed", x); });
	function log() {
		console.log(`a: ${a.get()}, aDouble: ${aDouble.get()}, b: ${b.get()}, bDouble: ${bDouble.get()}, source:`, source);
	}
	log();
	a.set(10);
	log();
	a.setWith(x => x * 2);
	b.set(20);
	log();
	console.groupEnd();
}

export function test3() {
	console.group("test3");
	const count = new Signal(0);
	count.on((count) => { console.log(`count changed: ${count}`); });
	function log() {
		console.log(`count: ${count.get()}`);
	}
	log();
	count.set(1);
	log();
	count.set(24);
	log();
	console.groupEnd();
}

export function test4() {
	console.group("test4");
	const point = new Signal({ x: 0, y: 0 });
	point.on((point) => { console.log(`point changed: ${point}`); });
	const x = point.lens().keys().key("x");
	const y = point.lens().keys().key("y");
	function log() {
		console.log(`point: ${point.get()}`);
	}
	log();
	point.set(1);
	log();
	point.set(24);
	log();
	console.groupEnd();
}
