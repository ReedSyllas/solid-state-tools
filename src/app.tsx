import { ComplexSignalAtom } from "./complex-signal-atom.tsx";
import { Counter } from "./counter.tsx";
import { FetchedSignal } from "./fetched-signal.tsx";

export default function App() {
	return (
		<>
			<h1>
				{"Solid State Tools"}
			</h1>
			<hr />
			<Counter />
			<hr />
			<ComplexSignalAtom />
			<hr />
			<FetchedSignal />
		</>
	);
}
