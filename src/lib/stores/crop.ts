import { writable, derived, get } from 'svelte/store';
import { activeTool } from './tools';
import type { SnapTarget } from '$lib/utils/snapUtils';

// Aspect ratio presets
export type AspectRatioPreset = 'free' | '16:9' | '4:3' | '1:1' | 'golden' | 'custom' | 'original';

// Crop tool settings (persisted between uses)
export interface CropSettings {
	aspectRatio: AspectRatioPreset;
	customRatio: { width: number; height: number };
	showGrid: boolean;
	gridType: 'thirds' | 'golden';
	// Snapping settings
	snapEnabled: boolean;
	snapThreshold: number; // Distance in document pixels
}

// Active crop region in document space
export interface CropRegion {
	x: number;
	y: number;
	width: number;
	height: number;
}

// Handle types for interaction
export type HandleType = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se' | 'move';

// Crop tool state
export interface CropState {
	isActive: boolean;
	region: CropRegion | null;
	isDragging: boolean;
	isDrawingNew: boolean;
	activeHandle: HandleType | null;
	startPoint: { x: number; y: number } | null;
	originalRegion: CropRegion | null; // For drag operations
	activeSnaps: SnapTarget[]; // Currently active snap targets (for visualization)
}

// Default settings
const defaultSettings: CropSettings = {
	aspectRatio: 'free',
	customRatio: { width: 4, height: 3 },
	showGrid: true,
	gridType: 'thirds',
	snapEnabled: true,
	snapThreshold: 8
};

// Default state
const defaultState: CropState = {
	isActive: false,
	region: null,
	isDragging: false,
	isDrawingNew: false,
	activeHandle: null,
	startPoint: null,
	originalRegion: null,
	activeSnaps: []
};

// Stores
export const cropSettings = writable<CropSettings>(defaultSettings);
export const cropState = writable<CropState>(defaultState);

// Derived store: is crop tool active
export const isCropTool = derived(activeTool, ($activeTool) => $activeTool === 'crop');

// Derived store: has pending crop (region defined, awaiting commit)
export const hasPendingCrop = derived(cropState, ($state) => $state.region !== null);

// Helper: Get aspect ratio as a number (width / height)
export function getAspectRatioValue(
	preset: AspectRatioPreset,
	customRatio: { width: number; height: number },
	originalWidth?: number,
	originalHeight?: number
): number | null {
	switch (preset) {
		case 'free':
			return null; // No constraint
		case '16:9':
			return 16 / 9;
		case '4:3':
			return 4 / 3;
		case '1:1':
			return 1;
		case 'golden':
			return 1.618; // Golden ratio
		case 'custom':
			return customRatio.width / customRatio.height;
		case 'original':
			if (originalWidth && originalHeight) {
				return originalWidth / originalHeight;
			}
			return null;
		default:
			return null;
	}
}

// Actions
export function updateCropSettings(updates: Partial<CropSettings>): void {
	cropSettings.update((s) => ({ ...s, ...updates }));
}

export function setCropRegion(region: CropRegion | null): void {
	cropState.update((s) => ({ ...s, region }));
}

export function startCropInteraction(
	handle: HandleType | null,
	startPoint: { x: number; y: number },
	isDrawingNew: boolean = false
): void {
	cropState.update((s) => ({
		...s,
		isDragging: true,
		isDrawingNew,
		activeHandle: handle,
		startPoint,
		originalRegion: s.region ? { ...s.region } : null
	}));
}

export function endCropInteraction(): void {
	cropState.update((s) => ({
		...s,
		isDragging: false,
		isDrawingNew: false,
		activeHandle: null,
		startPoint: null,
		originalRegion: null,
		activeSnaps: []
	}));
}

export function setCropActiveSnaps(snaps: SnapTarget[]): void {
	cropState.update((s) => ({ ...s, activeSnaps: snaps }));
}

export function activateCrop(docWidth: number, docHeight: number): void {
	cropState.update((s) => ({
		...s,
		isActive: true,
		region: { x: 0, y: 0, width: docWidth, height: docHeight }
	}));
}

export function deactivateCrop(): void {
	cropState.set(defaultState);
}

export function cancelCrop(): void {
	cropState.update((s) => ({
		...s,
		region: null,
		isDragging: false,
		isDrawingNew: false,
		activeHandle: null,
		startPoint: null,
		originalRegion: null
	}));
}

// Reset to defaults
export function resetCropSettings(): void {
	cropSettings.set(defaultSettings);
}

export function resetCropState(): void {
	cropState.set(defaultState);
}
