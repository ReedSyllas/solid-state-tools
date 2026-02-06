import { createSubscription } from "../lib/index.ts";

export function LocalStorageSubscription() {
	const count = createSubscription<number>({
		get() {
			// Fetch once from local storage.
			return parseIntSafe(localStorage.getItem("count"), 0);
		},
		
		set(value) {
			// Write once to local storage.
			localStorage.setItem("count", value.toString());
		},
		
		sub(update) {
			const fn = (event: StorageEvent) => {
				if (event.key !== "count") {
					return;
				}
				
				// Write incoming value.
				update(parseIntSafe(event.newValue, 0));
			};
			
			// Write first value.
			update(parseIntSafe(localStorage.getItem("count"), 0));
			
			// Subscribe to changes.
			window.addEventListener("storage", fn);
			
			return () => {
				// Unsubscribe from changes.
				window.removeEventListener("storage", fn);
			};
		},
	}, {
		initial: 0
	});
	
	return (
		<div>
			<h2>
				{"Local Storage Subscription"}
			</h2>
			
			<button onClick={() => {
				count(0);
				count.push();
			}}>
				{"Reset"}
			</button>
			
			<p>
				{"Count: "}
				<span>
					{ count() }
				</span>
			</p>
			<button onClick={() => {
				count(c => c / 2);
				count.push();
			}}>
				{"/2"}
			</button>
			<button onClick={() => {
				count(c => c - 2);
				count.push();
			}}>
				{"-2"}
			</button>
			<button onClick={() => {
				count(c => c - 1);
				count.push();
			}}>
				{"-1"}
			</button>
			<button onClick={() => {
				count(c => c + 1);
				count.push();
			}}>
				{"+1"}
			</button>
			<button onClick={() => {
				count(c => c + 2);
				count.push();
			}}>
				{"+2"}
			</button>
			<button onClick={() => {
				count(c => c * 2);
				count.push();
			}}>
				{"x2"}
			</button>
		</div>
	);
}

function parseIntSafe(value: string | undefined | null, fallback: number, radix?: number | undefined): number {
	const parsed = typeof value === "string" ? parseInt(value, radix) : fallback;
	return isNaN(parsed) ? fallback : parsed;
}
