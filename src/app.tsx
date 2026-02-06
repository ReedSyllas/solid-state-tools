import { AtomWithMembers } from "./atom-with-members.tsx";
import { Counter } from "./counter.tsx";
import { FetchedSignal } from "./fetched-signal.tsx";
import { LocalStorageSubscription } from "./local-storage-subscription.tsx";
import { Timer } from "./timer.tsx";

export default function App() {
	return (
		<>
			<h1>
				{"Solid State Tools"}
			</h1>
			<hr />
			<Counter />
			<hr />
			<FetchedSignal />
			<hr />
			<Timer />
			<hr />
			<LocalStorageSubscription />
			<hr />
			<AtomWithMembers />
		</>
	);
}
