import { createRoot } from "solid-js";
import { createLens, turn } from "../lib/index.ts";

/** Console walkthrough of lens semantics. Read the output in devtools. */
export function lensTest() {
	console.clear();
	console.group("lenses");

	const source = { x: 7, y: 4, z: { a: false, b: false } };

	const dispose = createRoot((dispose) => {
		console.log("root: created");
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
		return dispose;
	});

	dispose();
	console.log("root: disposed");

	console.log(source);

	console.groupEnd();
}
