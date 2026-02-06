import { createSignal } from "solid-js";
import { atom } from "../lib/index.ts";

export function AtomWithMembers() {
	const [ source, setSource ] = createSignal(0);
	const a = 10;
	const b = 20;
	const value = atom([ Object.assign(source, { a }), Object.assign(setSource, { b }) ]);
	
	return (
		<div>
			<h2>
				{"Atom With Members"}
			</h2>
			
			<p style={ { "color": value.a === a ? "green" : "red" } }>
				{"`a` expectation: "}
				{ a }
				{", reality: "}
				{ value.a }
			</p>
			
			<p style={ { "color": value.b === b ? "green" : "red" } }>
				{"`b` expectation: "}
				{ b }
				{", reality: "}
				{ value.b }
			</p>
		</div>
	);
}
