import { resolve } from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import solid from "vite-plugin-solid";

export default defineConfig({
	build: {
		lib: {
			entry: resolve(__dirname, "lib/index.ts"),
			fileName: "index",
			formats: [ "es" ],
			name: "SolidStateTools",
		},
		rollupOptions: {
			external: [ "solid-js", "solid-js/web" ],
			output: {
				globals: {
					"solid-js": "solid",
					"solid-js/web": "solidWeb",
				},
			},
		},
	},
	plugins: [
		solid(),
		dts({
			entryRoot: "lib",
			outDir: "dist/types",
			include: [ "lib" ],
		}),
	],
});
