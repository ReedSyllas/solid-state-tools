import { onCleanup } from "solid-js";
import { createSpool } from "../lib/index.ts";

export function Timer() {
	const time = createSpool((setTime, prev) => {
		// Start timer.
		const interval = setInterval(() => void setTime(prev() + 1), 1000);
		
		// Dispose of timer when signal is destroyed.
		onCleanup(() => void clearInterval(interval));
	}, {
		initial: 0,
	});
	
	return (
		<div>
			<h2>
				{"Timer"}
			</h2>
			
			{ time() }
			{" second(s)"}
		</div>
	);
}
