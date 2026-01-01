import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],

	// Prevent vite from obscuring rust errors
	clearScreen: false,

	// Tauri expects a fixed port, fail if that port is not available
	server: {
		port: 1420,
		strictPort: true,
		watch: {
			// Tell vite to ignore watching `src-tauri`
			ignored: ['**/src-tauri/**']
		}
	},

	// To make use of `TAURI_DEBUG` and other env variables
	envPrefix: ['VITE_', 'TAURI_']
});
