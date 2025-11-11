# Solid JS State Tools

This is a collection of simple utilities for managing [Solid JS](https://docs.solidjs.com/) state.
It is intended to compliment Solid JS's existing state system, not replace it.

This package is tiny and only has a peer dependency of Solid JS.

## Atoms (`atom`)

Atoms combine the getter and setter of a [signal](https://docs.solidjs.com/concepts/signals) into one function.

```ts
const count = atom(createSignal(0));

console.log(count()); // 0

count(100);
console.log(count()); // 100

count(count() + 1);
console.log(count()); // 101

count((c) => c + 1);
console.log(count()); // 102
```

When called with no arguments, the atom acts like the signal's getter. If an argument is passed, it is forwarded to the signal's setter. Note that `undefined` _is_ considered an argument and is forwarded to the setter, as desired.

Atoms simplify the boilerplate that comes with managing getters and setters separately. However, signals are still preferred for granular control of the getter and setter. Additionally, atoms incur a tiny performance cost. Thus, atoms do not replace signals. They coexist.

## Atomic signals (`asig`)

Because creating and wrapping a signal with `atom` is so common, a shorthand utility was created called `asig` (atomic signal).

```ts
const count = asig(0);
// is a shorthand for
const count = atom(createSignal(0));
```

## Co-signals (`createCouple`)

A signal can be summarized as a getter setter pair. However, Solid JS's setters are more complex than just a function that accepts the new value. They can also accept a function which acts like a map predicate from the old value to the new one.

```ts
setCount(x => x + 1);
```

All of this is to say that creating signal pairs can be tedious because the setter has to handle this edge case. Take a look at the below example.

```ts
const [ count, setCount ] = createSignal(0);

const [ double, setDouble ] = [
	// The getter
	createMemo(() => count() * 2),
	
	// The setter
	(value: number | ((prev: number) => number)) => {
		
		// Possibility of a function must be explicitly handled.
		const newValue = (typeof value === "function") ? value(double()) : value;
		
		setCount(newValue / 2);
		
		// And the result must be returned.
		return newValue;
	},
];

// Both of the below work, as a signal should.
setDouble(10);         // double: 10, count: 5
setDouble(x => x + 1); // double: 11, count: 5.5
```

Wouldn't it be convenient if we didn't have to handle all of that extra fluff though?

Enter co-signals. `Cosignal` is a getter setter pair like `Signal`, except that the setter doesn't accept a mapping function nor return a value. The `createCouple` function accepts a co-signal as input.

```ts
const [ count, setCount ] = createSignal(0);

const [ double, setDouble ] = createCouple([
	() => count() * 2,
	
	(x) => {
		// Notice how we don't need to handle `x` being a function here.
		setCount(x / 2);
		
		// Nor do we need to return the result.
	},
]);

// Yet, we can still pass a function in.
setDouble(x => x + 2);
console.log(double(), count()); // 2 1

// Or use its return value.
console.log(setDouble(10), count()); // 10 5
```

The `createCouple` function transforms a co-signal into a signal. In what way?
1. The getter is memoized for you.
2. The setter is wrapped so that if a function is passed in, it is evaluated with the current value and then forwarded to the cosignal's setter, returning the latest result.

The signal returned by `createCouple` can also be wrapped with `atom` to combine the getter and setter into one.

```ts
const double = atom(createCouple(/* ... */));
```

---

Perhaps you can see the power of the above primitives. Not only in what they can do on their own, but also in what they can do when combined.
