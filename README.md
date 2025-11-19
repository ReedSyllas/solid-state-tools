# Solid State Tools

Solid State Tools is a collection of simple utilities for managing [Solid JS](https://docs.solidjs.com/) state.

All features are intended to compliment Solid JS's existing state system, building upon the existing foundation.

The package is small and only has a peer dependency of Solid JS.

# Usage

This library introduces some new primitives:

1. [atom](#atoms-atom)
2. [createCouple](#couples-and-co-signals-createcouple)

And, a few shorthand functions that combine these primitives and those from Solid JS together.

1. [asig](#atomic-signals-asig)
2. [apair](#atomic-couples-apair)

Read the sections below for a breakdown of each utility.

## Atoms (`atom`)

Atoms combine the getter and setter of a [signal](https://docs.solidjs.com/concepts/signals) into one function.

```ts
const count: Atom<Signal<number>> = atom(createSignal(0));

console.log(count()); // 0

count(100);
console.log(count()); // 100

count(count() + 1);
console.log(count()); // 101

count((c) => c + 1);
console.log(count()); // 102
```

When called with no arguments, the atom acts like the signal's getter.
If an argument is passed, it is forwarded to the signal's setter. Note that `undefined` _is_ considered an argument and is forwarded to the setter.

Atoms simplify the boilerplate that comes with managing separate getters and setters.
However, signals are still preferred when granular control of the getter and setter is needed.
Additionally, atoms incur a tiny performance cost. Thus, atoms do not replace signals. They coexist.

## Atomic signals (`asig`)

Creating a signal and immediately 'atomizing' it is a common pattern. The `asig` function was created for this, along with its related type `Asig`.

```ts
const count: Asig<number> = asig(0);
// is short for
const count: Atom<Signal<number>> = atom(createSignal(0));
```

## Couples and co-signals (`createCouple`)

A signal can be summarized as a getter setter pair.
However, the setter of a Solid JS signal is more complex than it appears at first glance.
Why?

1. It accepts a function which transforms the previous value into the new one.
	```ts
	setCount(x => x + 1);
	```

2. It also returns the value. This essentially makes it "transparent".
	```ts
	const [ _count, setCount ] = createSignal(0);

	console.log(setCount(10));         // Prints: 10
	console.log(setCount(x => x + 5)); // Prints: 15
	```

All of this is to say that creating custom signal pairs can be tedious.
Below is an example showing the complexity involved.

```ts
const [ count, setCount ] = createSignal(0);

const [ double, setDouble ] = [
	// The getter
	createMemo(() => count() * 2),
	
	// The setter
	(value: number | ((prev: number) => number)) => {
		
		// The possibility of a function must be handled.
		const newValue = (typeof value === "function") ? value(untrack(double)) : value;
		
		setCount(newValue / 2);
		
		// And the result must be returned.
		return newValue;
	},
];
```

With that, all of the statements below work exactly as expected.

```ts
setDouble(10);              // double: 10, count: 5
setDouble(x => x + 1);      // double: 11, count: 5.5
console.log(setDouble(20)); // Prints: 20
```

But, wouldn't it be convenient if we could skip the crusty boilerplate?

**Enter the `createCouple` utility**

It accepts a co-signal and returns a regular signal.
A co-signal is similar to signal, except that the setter doesn't accept a function nor does it return a value.
Basically, it's the previous example without the boilerplate. Take a look.

```ts
const [ count, setCount ] = createSignal(0);

const [ double, setDouble ] = createCouple([
	() => count() * 2,
	
	(newValue) => {
		// Notice how we don't need to handle `newValue` being a function here.
		setCount(newValue / 2);
		
		// Nor do we need to return anything.
	},
]);

// Yet, we can still pass a function in.
setDouble(x => x + 2);
console.log(double(), count()); // 2 1

// Or use its return value.
console.log(setDouble(10), count()); // 10 5
```

Much better, right?

> [!NOTE]
> The getter passed to `createCouple` is always memoized.
> This has the consequence that the getter is immediately invoked by `createMemo` (a Solid JS feature).

A `createCouple` call, like any expression that evaluates to a signal, can be converted into an atom so that the getter and setter are merged into one.

```ts
const double = atom(createCouple([ /* ... */ ]));
```

## Atomic couples (`apair`)

Similar to [atomic signals](#atomic-signals-asig), wrapping a `createCouple` call with `atom` is a common enough pattern to warrant a shorthand function: `apair`.

```ts
const double = apair(() => count() * 2, (double) => count(double / 2));
// is short for
const double = atom(createCouple([ () => count() * 2, (double) => count(double / 2) ]));
```

# Conclusion

Perhaps you can see the power of the above primitives.
Not only in what they do, but also in how they combine.
