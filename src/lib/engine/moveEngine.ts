import { get } from 'svelte/store';
import {
	activeDocumentId,
	activeDocumentState,
	openDocuments,
	activeLayerId,
	markLayerDirty
} from '$lib/stores/documents';
import { selectionState, updateSelectionState } from '$lib/stores/selection';
import { isPointInSelectionBounds } from '$lib/utils/selectionUtils';
import { history, type SelectionSnapshot } from '$lib/stores/history';
import type { Viewport, Selection } from '$lib/types/document';

interface MoveState {
	isMoving: boolean;
	layerId: string | null;
	startCanvasX: number;
	startCanvasY: number;
	startLayerX: number;
	startLayerY: number;
	zoom: number;
	// Selection-aware move state
	hasSelection: boolean;
	selection: Selection | null;
	selectionBounds: { x: number; y: number; width: number; height: number } | null;
	polygonPoints: { x: number; y: number }[] | undefined;
	originalVectorPath: { type: 'rect' | 'ellipse' | 'polygon'; points: { x: number; y: number }[]; closed: boolean } | undefined;
	extractedPixels: Uint8ClampedArray | null;
	extractedWidth: number;  // Integer width of extracted buffer
	extractedHeight: number; // Integer height of extracted buffer
	extractedOriginX: number; // Integer origin X
	extractedOriginY: number; // Integer origin Y
	beforeSnapshot: Uint8ClampedArray | null; // Background for compositing during drag
	historyBeforeState: Uint8ClampedArray | null; // Actual buffer state at start of move (for undo)
	bufferWidth: number;
	bufferHeight: number;
}

// Floating selection - persists between move operations
interface FloatingSelection {
	pixels: Uint8ClampedArray;
	width: number;
	height: number;
	layerId: string;
	// Background: the layer with the selection area cleared (what's "underneath")
	background: Uint8ClampedArray;
	// Current offset from original extraction position
	currentOffsetX: number;
	currentOffsetY: number;
	// Original extraction position
	originalX: number;
	originalY: number;
}

class MoveEngine {
	private state: MoveState = this.createEmptyState();
	private floatingSelection: FloatingSelection | null = null;

	private createEmptyState(): MoveState {
		return {
			isMoving: false,
			layerId: null,
			startCanvasX: 0,
			startCanvasY: 0,
			startLayerX: 0,
			startLayerY: 0,
			zoom: 1,
			hasSelection: false,
			selection: null,
			selectionBounds: null,
			polygonPoints: undefined,
			originalVectorPath: undefined,
			extractedPixels: null,
			extractedWidth: 0,
			extractedHeight: 0,
			extractedOriginX: 0,
			extractedOriginY: 0,
			beforeSnapshot: null,
			historyBeforeState: null,
			bufferWidth: 0,
			bufferHeight: 0
		};
	}

	/**
	 * Start a move operation on the active layer.
	 * If there's a selection, will move only selected pixels.
	 * Returns true if move started successfully.
	 */
	startMove(canvasPoint: { x: number; y: number }, viewport: Viewport): boolean {
		const docState = get(activeDocumentState);
		if (!docState) return false;

		const activeLayer = get(activeLayerId);
		if (!activeLayer) return false;

		const layer = docState.document.layers.find((l) => l.id === activeLayer);
		if (!layer || layer.locked) return false;

		const buffer = docState.layerPixelBuffers.get(activeLayer);
		if (!buffer) return false;

		// Check for selection
		const selState = get(selectionState);
		const hasSelection = selState.selection.type !== 'none' && !!selState.selection.bounds;

		// Deep copy the vectorPath if it exists
		const originalVectorPath = selState.vectorPath ? {
			type: selState.vectorPath.type,
			points: selState.vectorPath.points.map(p => ({ x: p.x, y: p.y })),
			closed: selState.vectorPath.closed
		} : undefined;

		this.state = {
			isMoving: true,
			layerId: activeLayer,
			startCanvasX: canvasPoint.x,
			startCanvasY: canvasPoint.y,
			startLayerX: layer.x,
			startLayerY: layer.y,
			zoom: viewport.zoom,
			hasSelection,
			selection: hasSelection ? selState.selection : null,
			selectionBounds: hasSelection ? { ...selState.selection.bounds! } : null,
			polygonPoints: selState.vectorPath?.type === 'polygon' ? selState.vectorPath.points.map(p => ({ x: p.x, y: p.y })) : undefined,
			originalVectorPath,
			extractedPixels: null,
			extractedWidth: 0,
			extractedHeight: 0,
			extractedOriginX: 0,
			extractedOriginY: 0,
			beforeSnapshot: null,
			historyBeforeState: null,
			bufferWidth: buffer.width,
			bufferHeight: buffer.height
		};

		if (hasSelection) {
			// Capture actual buffer state for history BEFORE any modifications
			// This is what undo will restore to
			this.state.historyBeforeState = new Uint8ClampedArray(buffer.data);

			// Check if we have a floating selection to reuse
			if (this.floatingSelection && this.floatingSelection.layerId === activeLayer) {
				// Reuse floating selection - don't re-extract
				this.state.extractedPixels = this.floatingSelection.pixels;
				this.state.extractedWidth = this.floatingSelection.width;
				this.state.extractedHeight = this.floatingSelection.height;
				// Origin is the original extraction position plus current offset
				this.state.extractedOriginX = this.floatingSelection.originalX + this.floatingSelection.currentOffsetX;
				this.state.extractedOriginY = this.floatingSelection.originalY + this.floatingSelection.currentOffsetY;

				// Use the stored background for compositing during drag
				this.state.beforeSnapshot = this.floatingSelection.background;
			} else {
				// First grab - extract selected pixels
				this.extractSelectedPixels(buffer);

				// Clear source area to create the "background"
				this.clearSelectedPixels(buffer);

				// Store the background (layer with selection cleared)
				const background = new Uint8ClampedArray(buffer.data);

				// beforeSnapshot is the background for continueMove to restore
				this.state.beforeSnapshot = background;

				// Store as floating selection for future grabs
				this.floatingSelection = {
					pixels: new Uint8ClampedArray(this.state.extractedPixels!),
					width: this.state.extractedWidth,
					height: this.state.extractedHeight,
					layerId: activeLayer,
					background: background,
					currentOffsetX: 0,
					currentOffsetY: 0,
					originalX: this.state.extractedOriginX,
					originalY: this.state.extractedOriginY
				};
			}

			markLayerDirty(activeLayer);
		}

		return true;
	}

	/**
	 * Extract pixels from the selection area into a buffer
	 */
	private extractSelectedPixels(buffer: { data: Uint8ClampedArray; width: number; height: number }): void {
		if (!this.state.selectionBounds || !this.state.selection) return;

		const { x: bx, y: by, width: bw, height: bh } = this.state.selectionBounds;
		const { data, width } = buffer;

		// Calculate integer bounds for the extracted buffer
		const originX = Math.floor(bx);
		const originY = Math.floor(by);
		const extractedWidth = Math.ceil(bx + bw) - originX;
		const extractedHeight = Math.ceil(by + bh) - originY;

		// Store dimensions for pasting later
		this.state.extractedOriginX = originX;
		this.state.extractedOriginY = originY;
		this.state.extractedWidth = extractedWidth;
		this.state.extractedHeight = extractedHeight;

		// Create buffer sized to integer dimensions
		this.state.extractedPixels = new Uint8ClampedArray(extractedWidth * extractedHeight * 4);

		const minX = Math.max(0, originX);
		const maxX = Math.min(buffer.width, originX + extractedWidth);
		const minY = Math.max(0, originY);
		const maxY = Math.min(buffer.height, originY + extractedHeight);

		for (let y = minY; y < maxY; y++) {
			for (let x = minX; x < maxX; x++) {
				if (isPointInSelectionBounds(x, y, this.state.selection, this.state.polygonPoints)) {
					const srcIdx = (y * width + x) * 4;
					const dstX = x - originX;
					const dstY = y - originY;
					const dstIdx = (dstY * extractedWidth + dstX) * 4;

					this.state.extractedPixels[dstIdx] = data[srcIdx];
					this.state.extractedPixels[dstIdx + 1] = data[srcIdx + 1];
					this.state.extractedPixels[dstIdx + 2] = data[srcIdx + 2];
					this.state.extractedPixels[dstIdx + 3] = data[srcIdx + 3];
				}
			}
		}
	}

	/**
	 * Clear the selected area to transparent
	 */
	private clearSelectedPixels(buffer: { data: Uint8ClampedArray; width: number; height: number }): void {
		if (!this.state.selectionBounds || !this.state.selection) return;

		const { x: bx, y: by, width: bw, height: bh } = this.state.selectionBounds;
		const { data, width } = buffer;

		const minX = Math.max(0, Math.floor(bx));
		const maxX = Math.min(buffer.width, Math.ceil(bx + bw));
		const minY = Math.max(0, Math.floor(by));
		const maxY = Math.min(buffer.height, Math.ceil(by + bh));

		for (let y = minY; y < maxY; y++) {
			for (let x = minX; x < maxX; x++) {
				if (isPointInSelectionBounds(x, y, this.state.selection, this.state.polygonPoints)) {
					const idx = (y * width + x) * 4;
					data[idx] = 0;
					data[idx + 1] = 0;
					data[idx + 2] = 0;
					data[idx + 3] = 0;
				}
			}
		}
	}

	/**
	 * Clear the area where the floating selection currently sits
	 * This clears based on the extracted pixel buffer, not the selection shape
	 */
	private clearFloatingSelectionArea(buffer: { data: Uint8ClampedArray; width: number; height: number }): void {
		if (!this.state.extractedPixels) return;

		const { extractedWidth, extractedHeight, extractedOriginX, extractedOriginY } = this.state;
		const { data, width, height } = buffer;

		for (let sy = 0; sy < extractedHeight; sy++) {
			for (let sx = 0; sx < extractedWidth; sx++) {
				// Check if this pixel in the floating selection is non-transparent
				const srcIdx = (sy * extractedWidth + sx) * 4;
				if (this.state.extractedPixels[srcIdx + 3] === 0) continue;

				const dstX = extractedOriginX + sx;
				const dstY = extractedOriginY + sy;

				if (dstX < 0 || dstX >= width || dstY < 0 || dstY >= height) continue;

				const dstIdx = (dstY * width + dstX) * 4;
				data[dstIdx] = 0;
				data[dstIdx + 1] = 0;
				data[dstIdx + 2] = 0;
				data[dstIdx + 3] = 0;
			}
		}
	}

	/**
	 * Paste extracted pixels at an offset from original position
	 */
	private pastePixelsAtOffset(
		buffer: { data: Uint8ClampedArray; width: number; height: number },
		deltaX: number,
		deltaY: number
	): void {
		if (!this.state.extractedPixels) return;

		const { extractedWidth, extractedHeight, extractedOriginX, extractedOriginY } = this.state;
		const { data, width, height } = buffer;

		// New position is original position + delta
		const newOriginX = extractedOriginX + deltaX;
		const newOriginY = extractedOriginY + deltaY;

		for (let sy = 0; sy < extractedHeight; sy++) {
			for (let sx = 0; sx < extractedWidth; sx++) {
				const srcIdx = (sy * extractedWidth + sx) * 4;
				const alpha = this.state.extractedPixels[srcIdx + 3];

				if (alpha === 0) continue; // Skip transparent pixels

				const dstX = newOriginX + sx;
				const dstY = newOriginY + sy;

				// Bounds check
				if (dstX < 0 || dstX >= width || dstY < 0 || dstY >= height) continue;

				const dstIdx = (dstY * width + dstX) * 4;

				// Simple overwrite (could add alpha blending here)
				data[dstIdx] = this.state.extractedPixels[srcIdx];
				data[dstIdx + 1] = this.state.extractedPixels[srcIdx + 1];
				data[dstIdx + 2] = this.state.extractedPixels[srcIdx + 2];
				data[dstIdx + 3] = alpha;
			}
		}
	}

	/**
	 * Update the selection bounds and vectorPath to follow the moved pixels
	 */
	private updateSelectionPosition(deltaX: number, deltaY: number): void {
		if (!this.state.selectionBounds || !this.state.originalVectorPath) return;

		const originalBounds = this.state.selectionBounds;

		updateSelectionState((state) => {
			// Update selection bounds
			const newBounds = {
				x: originalBounds.x + deltaX,
				y: originalBounds.y + deltaY,
				width: originalBounds.width,
				height: originalBounds.height
			};

			// Update vectorPath points
			const newVectorPath = this.state.originalVectorPath ? {
				type: this.state.originalVectorPath.type,
				points: this.state.originalVectorPath.points.map(p => ({
					x: p.x + deltaX,
					y: p.y + deltaY
				})),
				closed: this.state.originalVectorPath.closed
			} : state.vectorPath;

			return {
				...state,
				selection: {
					...state.selection,
					bounds: newBounds
				},
				vectorPath: newVectorPath
			};
		});
	}

	/**
	 * Continue the move operation with new canvas coordinates.
	 */
	continueMove(canvasPoint: { x: number; y: number }): void {
		if (!this.state.isMoving || !this.state.layerId) return;

		// Calculate delta in document space (divide by zoom)
		const deltaX = Math.round((canvasPoint.x - this.state.startCanvasX) / this.state.zoom);
		const deltaY = Math.round((canvasPoint.y - this.state.startCanvasY) / this.state.zoom);

		if (this.state.hasSelection && this.state.beforeSnapshot) {
			// For selection move, restore from background then paste at new offset
			const docState = get(activeDocumentState);
			if (!docState) return;

			const buffer = docState.layerPixelBuffers.get(this.state.layerId);
			if (!buffer) return;

			// Restore background (layer with original selection area cleared)
			// This is the "clean" state without any floating pixels
			buffer.data.set(this.state.beforeSnapshot);

			// Paste floating pixels at new position (background + floating = composite)
			this.pastePixelsAtOffset(buffer, deltaX, deltaY);

			markLayerDirty(this.state.layerId);

			// Update selection bounds to follow the moved pixels
			this.updateSelectionPosition(deltaX, deltaY);
		} else {
			// No selection - move entire layer position
			const newX = Math.round(this.state.startLayerX + deltaX);
			const newY = Math.round(this.state.startLayerY + deltaY);
			this.updateLayerPosition(this.state.layerId, newX, newY);
		}
	}

	/**
	 * End the move operation and commit the changes.
	 */
	endMove(): void {
		if (!this.state.isMoving || !this.state.layerId) return;

		const docState = get(activeDocumentState);
		if (!docState) {
			this.state = this.createEmptyState();
			return;
		}

		if (this.state.hasSelection && this.floatingSelection && this.state.historyBeforeState) {
			const buffer = docState.layerPixelBuffers.get(this.state.layerId);
			if (buffer) {
				// Calculate final delta from this move operation
				// (We need to track total offset from original position)
				const selState = get(selectionState);
				if (selState.selection.bounds) {
					// Update floating selection with new offset
					// New offset = current selection position - original extraction position
					this.floatingSelection.currentOffsetX = Math.round(selState.selection.bounds.x) - this.floatingSelection.originalX;
					this.floatingSelection.currentOffsetY = Math.round(selState.selection.bounds.y) - this.floatingSelection.originalY;
				}

				// For history, use the full layer
				const fullBounds = {
					x: 0,
					y: 0,
					width: buffer.width,
					height: buffer.height
				};

				// "Before" is the actual buffer state when move started
				const beforePixels = this.state.historyBeforeState;

				// "After" is current state (background + floating pixels at new position)
				const afterPixels = new Uint8ClampedArray(buffer.data);

				// Capture selection state before and after move
				const selectionBefore: SelectionSnapshot = {
					bounds: this.state.selectionBounds ? { ...this.state.selectionBounds } : undefined,
					vectorPath: this.state.originalVectorPath ? {
						type: this.state.originalVectorPath.type,
						points: this.state.originalVectorPath.points.map(p => ({ x: p.x, y: p.y })),
						closed: this.state.originalVectorPath.closed
					} : undefined
				};

				const selectionAfter: SelectionSnapshot = {
					bounds: selState.selection.bounds ? { ...selState.selection.bounds } : undefined,
					vectorPath: selState.vectorPath ? {
						type: selState.vectorPath.type,
						points: selState.vectorPath.points.map(p => ({ x: p.x, y: p.y })),
						closed: selState.vectorPath.closed
					} : undefined
				};

				history.push({
					id: crypto.randomUUID(),
					name: 'Move Selection',
					layerId: this.state.layerId,
					timestamp: Date.now(),
					bounds: fullBounds,
					beforePixels,
					afterPixels,
					selectionBefore,
					selectionAfter
				});
			}
		} else if (!this.state.hasSelection) {
			// Layer position move (no selection)
			// Get current layer position
			const layer = docState.document.layers.find((l) => l.id === this.state.layerId);
			if (layer) {
				const currentX = layer.x;
				const currentY = layer.y;
				const startX = this.state.startLayerX;
				const startY = this.state.startLayerY;

				// Only create history if position actually changed
				if (currentX !== startX || currentY !== startY) {
					// Create history entry with layer position
					// Note: pixels don't change for layer moves, so we use empty arrays
					history.push({
						id: crypto.randomUUID(),
						name: 'Move Layer',
						layerId: this.state.layerId,
						timestamp: Date.now(),
						bounds: { x: 0, y: 0, width: 0, height: 0 },
						beforePixels: new Uint8ClampedArray(0),
						afterPixels: new Uint8ClampedArray(0),
						layerPositionBefore: { x: startX, y: startY },
						layerPositionAfter: { x: currentX, y: currentY }
					});
				}
			}
		}

		this.state = this.createEmptyState();
	}

	/**
	 * Cancel the move operation and restore original state.
	 */
	cancelMove(): void {
		if (!this.state.isMoving || !this.state.layerId) return;

		if (this.state.hasSelection && this.state.beforeSnapshot) {
			// Restore pixels from snapshot
			const docState = get(activeDocumentState);
			if (docState) {
				const buffer = docState.layerPixelBuffers.get(this.state.layerId);
				if (buffer) {
					buffer.data.set(this.state.beforeSnapshot);
					markLayerDirty(this.state.layerId);
				}
			}

			// Restore selection to original position
			this.updateSelectionPosition(0, 0);
		} else {
			// Restore original layer position
			this.updateLayerPosition(this.state.layerId, this.state.startLayerX, this.state.startLayerY);
		}

		this.state = this.createEmptyState();
	}

	/**
	 * Update layer position in the document store.
	 */
	private updateLayerPosition(layerId: string, x: number, y: number): void {
		const docId = get(activeDocumentId);
		if (!docId) return;

		openDocuments.update((docs) => {
			const state = docs.get(docId);
			if (!state) return docs;

			const layerIndex = state.document.layers.findIndex((l) => l.id === layerId);
			if (layerIndex === -1) return docs;

			const updatedLayers = [...state.document.layers];
			updatedLayers[layerIndex] = {
				...updatedLayers[layerIndex],
				x,
				y
			};

			docs.set(docId, {
				...state,
				isDirty: true,
				document: {
					...state.document,
					layers: updatedLayers
				}
			});

			return new Map(docs);
		});
	}

	/**
	 * Check if a move operation is in progress.
	 */
	get isMoving(): boolean {
		return this.state.isMoving;
	}

	/**
	 * Get the ID of the layer being moved.
	 */
	get movingLayerId(): string | null {
		return this.state.layerId;
	}

	/**
	 * Clear the floating selection.
	 * Call this when the selection is deselected (Ctrl+D) to commit the pixels.
	 */
	clearFloatingSelection(): void {
		this.floatingSelection = null;
	}

	/**
	 * Sync floating selection state after undo/redo.
	 * Updates the offset to match the restored selection position, or clears
	 * the floating selection if we've undone back to before the first extraction.
	 */
	syncFloatingSelectionAfterUndo(restoredBounds: { x: number; y: number; width: number; height: number } | undefined): void {
		if (!this.floatingSelection) return;

		// If no selection bounds after undo, clear floating selection
		if (!restoredBounds) {
			this.floatingSelection = null;
			return;
		}

		const restoredX = Math.round(restoredBounds.x);
		const restoredY = Math.round(restoredBounds.y);
		const originalX = this.floatingSelection.originalX;
		const originalY = this.floatingSelection.originalY;

		// If restored to original position, we've undone back to before the first extraction
		// Clear the floating selection so next move does a fresh extraction
		if (restoredX === originalX && restoredY === originalY) {
			this.floatingSelection = null;
			return;
		}

		// Otherwise, update offset to match restored position
		this.floatingSelection.currentOffsetX = restoredX - originalX;
		this.floatingSelection.currentOffsetY = restoredY - originalY;
	}

	/**
	 * Check if there's an active floating selection.
	 */
	get hasFloatingSelection(): boolean {
		return this.floatingSelection !== null;
	}
}

export const moveEngine = new MoveEngine();
