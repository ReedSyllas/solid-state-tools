# Solid State Tools

Links: [GitHub Repository](https://github.com/ReedSyllas/solid-state-tools), [NPM Package](https://www.npmjs.com/package/solid-state-tools).

Solid State Tools is a collection of simple utilities for managing [Solid JS](https://docs.solidjs.com/) state.

All features are intended to compliment Solid JS's existing state system, building upon the existing foundation.

The package is small and the only production dependency is Solid JS.

# Usage

| Utility                            | Summary                                           |
| ---------------------------------- | ------------------------------------------------- |
| [atom](#atoms-atom)                | Combines a getter setter pair into one function.  |
| [createPair](#pairs-createpair)    | Creates a signal from a getter setter pair.       |
| [asig](#atomic-signals-asig)       | Shorthand for `atom(createSignal(...))`           |
| [apair](#atomic-pairs-apair)       | Shorthand for `atom(createCouple(...))`           |
| [createBlinker](#pairs-createpair) | Creates a reactive boolean for flashing elements. |

Read the sections below for a breakdown of each utility.

## Atoms (`atom`)

Atoms combine the getter and setter of a [signal](https://docs.solidjs.com/concepts/signals) into one function.

```ts
const count: Atom<Signal<number>> = atom(createSignal(0));

console.log(count()); // 0

// Sets count to 100.
count(100);
console.log(count()); // 100

// Sets count to its current value plus one.
count(count() + 1);
console.log(count()); // 101

// Sets count to its current value plus one (alternative syntax).
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

The second parameter (optional) is the config object, which is simply forwarded to [createSignal's options](https://docs.solidjs.com/reference/basic-reactivity/create-signal#options).

```ts
const list = asig([], { equals: false });
// is short for
const list = atom(createSignal([], { equals: false }));
```

## Pairs (`createPair`)

A signal can be summarized as a getter setter pair.
However, the setter of a Solid JS signal is more complex than it appears at first glance.
Why?

1. It accepts a function which transforms the previous value into the new one.
	```ts
	setCount(x => x + 1);
	```

2. It also returns the value.
	```ts
	const [ _count, setCount ] = createSignal(0);

	console.log(setCount(10));         // 10
	console.log(setCount(x => x + 5)); // 15
	```

All of this is to say that creating custom signal pairs can be tedious.
Below is an example showing the complexity involved.

```ts
const [ count, setCount ] = createSignal(0);

const [ double, setDouble ] = [
	// The getter
	createMemo(() => count() * 2),
	
	// The setter
	(newValue: number | ((prev: number) => number)) => {
		
		// The function case must be handled.
		const unwrappedNewValue = (typeof newValue === "function") ? newValue(untrack(double)) : newValue;
		
		setCount(unwrappedNewValue / 2);
		
		// And the result must be returned.
		return unwrappedNewValue;
	},
];
```

With that, the following statements work (as is expected of a setter):

```ts
setDouble(10);              // double: 10, count: 5
setDouble(x => x + 1);      // double: 11, count: 5.5
console.log(setDouble(20)); // 20
```

But, the crusty boilerplate to get it working is annoying as heck.

**Enter the `createPair` utility.**

It accepts a getter and a writer and returns a signal.
A writer is similar to a setter, except that it doesn't accept a function as input nor does it return a value.
Basically, it's the setter of the previous example without all the boilerplate.
See it in action:

```ts
const [ count, setCount ] = createSignal(0);

const [ double, setDouble ] = createPair(
	// The provided getter is automatically memoized.
	() => count() * 2,
	
	(newValue) => {
		// Notice how we don't need to handle `newValue` being a function here.
		setCount(newValue / 2);
		
		// Nor do we need to return anything.
	},
);

// Yet, we can still inject a function.
setDouble(x => x + 2);
console.log(double(), count()); // 2 1

// Or use its return value.
console.log(setDouble(10), count()); // 10 5
```

It can be succinctly rewritten into this:

```ts
const [ double, setDouble ] = createPair(() => count() * 2, (x) => setCount(x / 2));
```

Much better, right?

> [!NOTE]
> The getter passed to `createPair` is [memoized](https://docs.solidjs.com/concepts/derived-values/memos) unless otherwise set in the `options`.
> Memoization immediately invokes the getter, so keep that in mind because it can cause undesirable side-effects.

By the way! The `createPair` output, like any signal, can be converted into an atom so that the getter and setter are merged together. See [atom](#atoms-atom) for details.

```ts
const double = atom(createPair(() => count() * 2, (x) => setCount(x / 2)));

double()   // read
double(10) // write
```

## Atomic pairs (`apair`)

Similar to [atomic signals](#atomic-signals-asig), wrapping a `createPair` call with `atom` is a common enough pattern to warrant a shorthand: `apair`.

```ts
const double = apair(() => count() * 2, (double) => count(double / 2));
// is short for
const double = atom(createPair(() => count() * 2, (double) => count(double / 2)));
```

## Blinkers (`createBlinker`)

A blinker is a reactive boolean that tracks some state. When the state updates, the blinker temporarily flips to true.

This is primarily useful for flashing an element on the page when a signal changes to draw the user's attention to it.

```tsx
const [ count, setCount ] = createSignal(0);
const countBlinked = createBlinker(count, 200);

// Flashes orange for 200ms when count changes.
<span style={ { "color": countBlinked() ? "orange" : undefined } }>
	{ count() }
</span>
```

# Conclusion

Perhaps you can see the power of the above primitives.
Specifically, how they work together to reduce boilerplate.

More utilities for this library are in the works and are coming soon.
