import { resolve } from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import solid from "@solidjs/vite-plugin";

export default defineConfig({
	build: {
		lib: {
			entry: resolve(import.meta.dirname, "lib/index.ts"),
			fileName: "index",
			formats: [ "es" ],
			name: "SolidStateTools",
		},
		rollupOptions: {
			external: [ "solid-js" ],
			output: {
				globals: {
					"solid-js": "solid",
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
