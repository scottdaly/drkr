import { writable, derived } from 'svelte/store';
import type { ToolType, BrushSettings, SelectionSettings, Color, ColorState } from '$lib/types/tools';

export const activeTool = writable<ToolType>('brush');

export const brushSettings = writable<BrushSettings>({
	size: 20,
	hardness: 80,
	opacity: 100,
	flow: 100,
	spacing: 25,
	smoothing: 50
});

export const selectionSettings = writable<SelectionSettings>({
	mode: 'new',
	feather: 0,
	antiAlias: true,
	tolerance: 32,
	contiguous: true,
	sampleAllLayers: false
});

export const colors = writable<ColorState>({
	foreground: { r: 0, g: 0, b: 0, a: 1 },
	background: { r: 255, g: 255, b: 255, a: 1 }
});

// Tool-specific derived state
export const currentToolSettings = derived(activeTool, ($activeTool) => {
	switch ($activeTool) {
		case 'brush':
		case 'eraser':
			return { type: 'brush' as const, store: brushSettings };
		case 'select-rect':
		case 'select-ellipse':
		case 'select-lasso':
			return { type: 'selection' as const, store: selectionSettings };
		default:
			return { type: 'none' as const, store: null };
	}
});

// Check if current tool is a brush-type tool
export const isBrushTool = derived(activeTool, ($activeTool) =>
	['brush', 'eraser'].includes($activeTool)
);

// Check if current tool is a selection tool
export const isSelectionTool = derived(activeTool, ($activeTool) =>
	['select-rect', 'select-ellipse', 'select-lasso'].includes($activeTool)
);

// Actions
export function setTool(tool: ToolType): void {
	activeTool.set(tool);
}

export function setBrushSize(size: number): void {
	brushSettings.update((s) => ({ ...s, size: Math.max(1, Math.min(5000, size)) }));
}

export function setBrushOpacity(opacity: number): void {
	brushSettings.update((s) => ({ ...s, opacity: Math.max(0, Math.min(100, opacity)) }));
}

export function setBrushHardness(hardness: number): void {
	brushSettings.update((s) => ({ ...s, hardness: Math.max(0, Math.min(100, hardness)) }));
}

export function setForegroundColor(color: Color): void {
	colors.update((c) => ({ ...c, foreground: color }));
}

export function setBackgroundColor(color: Color): void {
	colors.update((c) => ({ ...c, background: color }));
}

export function swapColors(): void {
	colors.update((c) => ({
		foreground: c.background,
		background: c.foreground
	}));
}

export function resetColors(): void {
	colors.set({
		foreground: { r: 0, g: 0, b: 0, a: 1 },
		background: { r: 255, g: 255, b: 255, a: 1 }
	});
}
