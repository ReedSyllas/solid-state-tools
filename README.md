# Solid JS State Tools

This package is a collection of utilities for managing [Solid JS](https://docs.solidjs.com/) state.

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

## Co-signals (`createCosignal`)

A signal can be summarized as a getter setter pair. However, Solid JS's setters are more complex than just a function that accepts a new value for the signal. They can also accept a function which acts like a map predicate from the old value to the new one.

All this is to say that creating signals manually can be tedious since the setter has to handle this edge case. Co-signals make defining the getter setter pair easy.

```ts
const [ count, setCount ] = createSignal(0);
const [ double, setDouble ] = createCosignal([
	() => count() * 2,
	
	// Notice how we don't need to handle `x` being a function here.
	(x) => void setCount(x / 2),
]);

// Yet, we can still pass a mapping function here.
double(x => x + 2);
console.log(double(), count()); // 12 6

// Or simply use it traditionally.
double(10);
console.log(double(), count()); // 10 5
```

It's important to note that the getter is not automatically memoized and should be wrapped with `createMemo`, when appropriate.

```ts
const [ double, setDouble ] = createCosignal([
	// Memoize to reduce extra computation.
	createMemo(() => count() * 2),
	/* ... */
]);
```

Finally, co-signals can be wrapped with `atom`, of course.

```ts
const double = atom(createCosignal(/* ... */));
```

To be clear, `createCosignal` and `createSignal` return the same kind of value and therefore should work in every situation native signals do.
