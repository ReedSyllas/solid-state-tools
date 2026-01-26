import { apair, asig, createBlinker } from "../lib/index.ts";

export function Counter() {
	const count = asig(0);
	const countBlinked = createBlinker(count, 200);
	
	const double = apair(() => count() * 2, (x) => count(x / 2));
	const doubleBlinked = createBlinker(count, 200);
	
	return (
		<div>
			<h2>
				{"Counter"}
			</h2>
			
			<button onClick={() => void count(0)}>
				{"Reset"}
			</button>
			
			<p>
				{"Count: "}
				<span style={ { "background-color": countBlinked() ? "orange" : undefined } }>
					{ count() }
				</span>
			</p>
			<button onClick={() => void count(c => c + 1)}>
				{"Increment count"}
			</button>
			<button onClick={() => void count(c => c + 2)}>
				{"Increment count + 2"}
			</button>
			<button onClick={() => void count(c => c * 2)}>
				{"Increment count x 2"}
			</button>
			
			<p>
				{"Double: "}
				<span style={ { "background-color": doubleBlinked() ? "orange" : undefined } }>
					{ double() }
				</span>
			</p>
			<button onClick={() => void double(c => c + 1)}>
				{"Increment double"}
			</button>
			<button onClick={() => void double(c => c + 2)}>
				{"Increment double + 2"}
			</button>
			<button onClick={() => void double(c => c * 2)}>
				{"Increment double x 2"}
			</button>
		</div>
	);
}
