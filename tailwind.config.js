/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				// Custom dark theme colors for image editor
				editor: {
					bg: '#1a1a1a',
					panel: '#252525',
					border: '#3a3a3a',
					accent: '#0078d4',
					'accent-hover': '#1a8cff',
					text: '#e0e0e0',
					'text-muted': '#888888'
				}
			}
		}
	},
	plugins: []
};
