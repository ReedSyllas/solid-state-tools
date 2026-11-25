import { createBlinker, createLens, withTurn } from "../lib/index.ts";

export function Counter() {
	const count = createLens(0);
	const countBlinking = createBlinker(count, 200);
	
	const double = count.derive((count) => count * 2);
	const doubleBlinking = createBlinker(double, 200);
	
	return (
		<div>
			<h2>
				{"Counter"}
			</h2>
			<button onClick={() => { count.set(0); }}>
				{"Reset"}
			</button>
			<p>
				{"Count: "}
				<span style={ { "background-color": countBlinking() ? "orange" : undefined } }>
					{ count.get() }
				</span>
			</p>
			<button onClick={withTurn(() => { count.setWith(c => c / 2); })}>
				{"/2"}
			</button>
			<button onClick={withTurn(() => { count.setWith(c => c - 2); })}>
				{"-2"}
			</button>
			<button onClick={withTurn(() => { count.setWith(c => c - 1); })}>
				{"-1"}
			</button>
			<button onClick={withTurn(() => { count.setWith(c => c + 1); })}>
				{"+1"}
			</button>
			<button onClick={withTurn(() => { count.setWith(c => c + 2); })}>
				{"+2"}
			</button>
			<button onClick={withTurn(() => { count.setWith(c => c * 2); })}>
				{"x2"}
			</button>
			<p>
				{"Double: "}
				<span style={ { "background-color": doubleBlinking() ? "orange" : undefined } }>
					{ double.get() }
				</span>
			</p>
		</div>
	);
}
