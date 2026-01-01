import { writable } from 'svelte/store';

export interface Preferences {
	// General
	theme: 'dark' | 'light' | 'system';
	language: string;

	// Performance
	gpuAcceleration: boolean;
	maxHistorySteps: number;
	autoSaveInterval: number; // minutes, 0 = disabled

	// Tools
	defaultBrushSize: number;
	smoothBrushPreview: boolean;

	// AI
	defaultAIProvider: 'auto' | 'google' | 'openai' | 'stability' | 'replicate';
	aiPreviewMode: boolean;
	monthlyBudgetCents: number | null;

	// Export
	defaultExportFormat: 'png' | 'jpeg' | 'webp';
	defaultJpegQuality: number;
}

const defaultPreferences: Preferences = {
	theme: 'dark',
	language: 'en',
	gpuAcceleration: true,
	maxHistorySteps: 50,
	autoSaveInterval: 5,
	defaultBrushSize: 20,
	smoothBrushPreview: true,
	defaultAIProvider: 'auto',
	aiPreviewMode: true,
	monthlyBudgetCents: null,
	defaultExportFormat: 'png',
	defaultJpegQuality: 90
};

function createPreferencesStore() {
	const { subscribe, set, update } = writable<Preferences>(defaultPreferences);

	return {
		subscribe,
		set,
		update,

		// Load preferences from storage
		load(): void {
			// In Tauri, we'd load from the file system
			// For now, use localStorage as a fallback
			try {
				const stored = localStorage.getItem('darker-preferences');
				if (stored) {
					const parsed = JSON.parse(stored);
					set({ ...defaultPreferences, ...parsed });
				}
			} catch {
				// Use defaults if loading fails
			}
		},

		// Save preferences to storage
		save(prefs: Preferences): void {
			try {
				localStorage.setItem('darker-preferences', JSON.stringify(prefs));
			} catch {
				// Ignore save errors
			}
		},

		// Reset to defaults
		reset(): void {
			set(defaultPreferences);
		}
	};
}

export const preferences = createPreferencesStore();
