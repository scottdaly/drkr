import { writable, derived, get } from 'svelte/store';
import { layerPixelBuffers, isDirty } from './document';

// A history entry stores the pixels that were changed
export interface HistoryEntry {
	id: string;
	name: string; // Human-readable description
	layerId: string;
	timestamp: number;
	// Bounding box of affected region
	bounds: {
		x: number;
		y: number;
		width: number;
		height: number;
	};
	// The pixels BEFORE the change (for undo)
	beforePixels: Uint8ClampedArray;
	// The pixels AFTER the change (for redo)
	afterPixels: Uint8ClampedArray;
}

interface HistoryState {
	undoStack: HistoryEntry[];
	redoStack: HistoryEntry[];
	maxEntries: number;
	maxMemoryBytes: number;
	currentMemoryBytes: number;
}

const MAX_ENTRIES = 100;
const MAX_MEMORY_BYTES = 50 * 1024 * 1024; // 50MB limit

function createHistoryStore() {
	const { subscribe, set, update } = writable<HistoryState>({
		undoStack: [],
		redoStack: [],
		maxEntries: MAX_ENTRIES,
		maxMemoryBytes: MAX_MEMORY_BYTES,
		currentMemoryBytes: 0
	});

	return {
		subscribe,

		// Push a new entry onto the undo stack
		push(entry: HistoryEntry): void {
			update((state) => {
				const entrySize = entry.beforePixels.byteLength + entry.afterPixels.byteLength;
				let newMemory = state.currentMemoryBytes + entrySize;
				const newUndoStack = [...state.undoStack, entry];

				// Clear redo stack when new action is performed
				const freedRedoMemory = state.redoStack.reduce(
					(sum, e) => sum + e.beforePixels.byteLength + e.afterPixels.byteLength,
					0
				);
				newMemory -= freedRedoMemory;

				// Trim old entries if over memory limit or max entries
				while (
					newUndoStack.length > 0 &&
					(newUndoStack.length > state.maxEntries || newMemory > state.maxMemoryBytes)
				) {
					const removed = newUndoStack.shift()!;
					newMemory -= removed.beforePixels.byteLength + removed.afterPixels.byteLength;
				}

				return {
					...state,
					undoStack: newUndoStack,
					redoStack: [],
					currentMemoryBytes: newMemory
				};
			});
		},

		// Undo the last action
		undo(): boolean {
			const state = get({ subscribe });
			if (state.undoStack.length === 0) return false;

			const entry = state.undoStack[state.undoStack.length - 1];

			// Restore the "before" pixels
			const restored = restorePixels(entry.layerId, entry.bounds, entry.beforePixels);
			if (!restored) return false;

			update((s) => ({
				...s,
				undoStack: s.undoStack.slice(0, -1),
				redoStack: [...s.redoStack, entry]
			}));

			isDirty.set(true);
			return true;
		},

		// Redo the last undone action
		redo(): boolean {
			const state = get({ subscribe });
			if (state.redoStack.length === 0) return false;

			const entry = state.redoStack[state.redoStack.length - 1];

			// Restore the "after" pixels
			const restored = restorePixels(entry.layerId, entry.bounds, entry.afterPixels);
			if (!restored) return false;

			update((s) => ({
				...s,
				redoStack: s.redoStack.slice(0, -1),
				undoStack: [...s.undoStack, entry]
			}));

			isDirty.set(true);
			return true;
		},

		// Clear all history
		clear(): void {
			set({
				undoStack: [],
				redoStack: [],
				maxEntries: MAX_ENTRIES,
				maxMemoryBytes: MAX_MEMORY_BYTES,
				currentMemoryBytes: 0
			});
		},

		// Jump to a specific state by index
		// Index 0 = original state (before any actions)
		// Index 1 = after first action, etc.
		jumpTo(targetIndex: number): void {
			const state = get({ subscribe });
			const currentIndex = state.undoStack.length;

			if (targetIndex === currentIndex) return;

			if (targetIndex < currentIndex) {
				// Need to undo
				const undoCount = currentIndex - targetIndex;
				for (let i = 0; i < undoCount; i++) {
					this.undo();
				}
			} else {
				// Need to redo
				const redoCount = targetIndex - currentIndex;
				for (let i = 0; i < redoCount; i++) {
					this.redo();
				}
			}
		}
	};
}

// Helper to restore pixels to a layer buffer
function restorePixels(
	layerId: string,
	bounds: { x: number; y: number; width: number; height: number },
	pixels: Uint8ClampedArray
): boolean {
	const buffers = get(layerPixelBuffers);
	const buffer = buffers.get(layerId);
	if (!buffer) return false;

	const { x, y, width, height } = bounds;

	// Copy pixels back to the buffer
	for (let row = 0; row < height; row++) {
		for (let col = 0; col < width; col++) {
			const srcIdx = (row * width + col) * 4;
			const dstIdx = ((y + row) * buffer.width + (x + col)) * 4;

			buffer.data[dstIdx] = pixels[srcIdx];
			buffer.data[dstIdx + 1] = pixels[srcIdx + 1];
			buffer.data[dstIdx + 2] = pixels[srcIdx + 2];
			buffer.data[dstIdx + 3] = pixels[srcIdx + 3];
		}
	}

	// Trigger reactivity
	layerPixelBuffers.update((b) => new Map(b));

	return true;
}

export const history = createHistoryStore();

// Derived stores for UI
export const canUndo = derived(history, ($history) => $history.undoStack.length > 0);
export const canRedo = derived(history, ($history) => $history.redoStack.length > 0);
export const undoName = derived(history, ($history) => {
	const last = $history.undoStack[$history.undoStack.length - 1];
	return last ? last.name : null;
});
export const redoName = derived(history, ($history) => {
	const last = $history.redoStack[$history.redoStack.length - 1];
	return last ? last.name : null;
});

// Combined history list for the history panel
// Returns all entries in order with current state index
export const historyList = derived(history, ($history) => {
	// Combine undo stack (past) + redo stack (future, reversed)
	const entries = [
		...$history.undoStack,
		...[...$history.redoStack].reverse()
	];
	return {
		entries,
		currentIndex: $history.undoStack.length // Current state is after all undo entries
	};
});

// Helper to capture pixels from a region (call BEFORE making changes)
export function captureRegion(
	layerId: string,
	bounds: { x: number; y: number; width: number; height: number }
): Uint8ClampedArray | null {
	const buffers = get(layerPixelBuffers);
	const buffer = buffers.get(layerId);
	if (!buffer) return null;

	const { x, y, width, height } = bounds;
	const pixels = new Uint8ClampedArray(width * height * 4);

	for (let row = 0; row < height; row++) {
		for (let col = 0; col < width; col++) {
			const srcIdx = ((y + row) * buffer.width + (x + col)) * 4;
			const dstIdx = (row * width + col) * 4;

			pixels[dstIdx] = buffer.data[srcIdx];
			pixels[dstIdx + 1] = buffer.data[srcIdx + 1];
			pixels[dstIdx + 2] = buffer.data[srcIdx + 2];
			pixels[dstIdx + 3] = buffer.data[srcIdx + 3];
		}
	}

	return pixels;
}

// Helper to create a history entry for a brush stroke
export function createBrushHistoryEntry(
	layerId: string,
	bounds: { x: number; y: number; width: number; height: number },
	beforePixels: Uint8ClampedArray,
	isEraser: boolean
): HistoryEntry {
	// Capture the "after" pixels
	const afterPixels = captureRegion(layerId, bounds);

	return {
		id: crypto.randomUUID(),
		name: isEraser ? 'Eraser Stroke' : 'Brush Stroke',
		layerId,
		timestamp: Date.now(),
		bounds,
		beforePixels,
		afterPixels: afterPixels || new Uint8ClampedArray(0)
	};
}
