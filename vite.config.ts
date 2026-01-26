import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import solid from "vite-plugin-solid";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	build: {
		lib: {
			entry: resolve(__dirname, "src/index.ts"),
			name: "SolidStateTools",
			fileName: "index",
		},
		rollupOptions: {
			external: [ "solid-js" ],
			output: {
				globals: {
					"solid-js": "Solid",
				},
			},
		},
	},
	plugins: [
		solid(),
		dts({
			insertTypesEntry: true,
		}),
	],
});
