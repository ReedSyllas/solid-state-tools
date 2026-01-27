import { For, Show } from "solid-js";
import { asig, createFetched } from "../lib/index.ts";

export function FetchedSignal() {
	const postId = asig<string>(posts[1]?.id ?? "");
	const post = createFetched<Post | undefined>((update) => getPost(postId()).then(update));
	
	return (
		<div>
			<h2>
				{"Fetched Signal"}
			</h2>
			
			<button
				onClick={() => {
					postId("");
				}}
				style={{
					"background-color": postId() === "" ? (post.loading() ? "orange" : "lime") : undefined
				}}
			>
				{ "?" }
			</button>
			<For each={posts}>
				{ (x) =>
					<button
						onClick={() => {
							postId(x.id);
						}}
						style={{
							"background-color": postId() === x.id ? (post.loading() ? "orange" : "lime") : undefined
						}}
					>
						{ x.id }
					</button>
				}
			</For>
			
			<div>
				<Show when={post.latest()} fallback={post.loading() ? "Loading..." : "No post found"}>
					{ (post) =>
						<>
							<p>
								{ post().title }
							</p>
							<p>
								{ post().body }
							</p>
						</>
					}
				</Show>
			</div>
		</div>
	);
}

interface Post {
	id: string,
	title: string,
	body: string,
}

const posts: Post[] = [
	{
		id: "1",
		title: "The 1st post",
		body: "This is the body for the first post.",
	},
	{
		id: "2",
		title: "Another post",
		body: "This is the body for the 2nd post.",
	},
	{
		id: "3",
		title: "A post of the third variety",
		body: "This is the body for post number 3.",
	},
];

async function getPost(id: Post["id"]): Promise<Post | undefined> {
	await new Promise(resolve => setTimeout(resolve, parseInt(id) * 500));
	return posts.find(x => x.id === id);
}
