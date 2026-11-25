import { Counter } from "./counter.tsx";
import { lensTest } from "./lens-test.ts";

export default function App() {
	lensTest();
	return (
		<>
			<h1>
				{"Solid State Tools"}
			</h1>
			<hr />
			<Counter />
		</>
	);
}
