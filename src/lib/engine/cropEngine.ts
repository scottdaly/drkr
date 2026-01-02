import { get } from 'svelte/store';
import {
	cropSettings,
	cropState,
	setCropRegion,
	setCropActiveSnaps,
	startCropInteraction,
	endCropInteraction,
	activateCrop,
	deactivateCrop,
	cancelCrop,
	getAspectRatioValue,
	type CropRegion,
	type HandleType
} from '$lib/stores/crop';
import { activeDocumentState, cropDocumentToRegion } from '$lib/stores/documents';
import { selectionState, clearSelection } from '$lib/stores/selection';
import { getSnapTargets, applySnapping } from '$lib/utils/snapUtils';
import type { Viewport, Document } from '$lib/types/document';

// Handle size in screen pixels (for hit detection)
const HANDLE_SIZE = 8;
const HANDLE_HIT_RADIUS = 12; // Slightly larger for easier clicking

interface CropEngineState {
	viewport: Viewport | null;
	document: Document | null;
}

class CropEngine {
	private engineState: CropEngineState = {
		viewport: null,
		document: null
	};

	/**
	 * Initialize crop mode when tool is selected
	 */
	activate(viewport: Viewport, doc: Document): void {
		this.engineState.viewport = viewport;
		this.engineState.document = doc;
		activateCrop(doc.width, doc.height);
	}

	/**
	 * Deactivate crop mode
	 */
	deactivate(): void {
		this.engineState.viewport = null;
		this.engineState.document = null;
		deactivateCrop();
	}

	/**
	 * Start a crop interaction (handle drag, region move, or new region draw)
	 */
	startCrop(
		canvasPoint: { x: number; y: number },
		viewport: Viewport,
		doc: Document
	): void {
		this.engineState.viewport = viewport;
		this.engineState.document = doc;

		const state = get(cropState);
		const docPoint = this.canvasToDocument(canvasPoint, viewport);

		// Check if clicking on a handle
		const handle = this.getHandleAtPoint(canvasPoint, viewport);
		if (handle) {
			startCropInteraction(handle, docPoint, false);
			return;
		}

		// Check if clicking inside the crop region
		if (state.region && this.isPointInsideRegion(docPoint, state.region)) {
			startCropInteraction('move', docPoint, false);
			return;
		}

		// Clicking outside - start drawing new region
		const newRegion: CropRegion = {
			x: docPoint.x,
			y: docPoint.y,
			width: 0,
			height: 0
		};
		setCropRegion(newRegion);
		startCropInteraction(null, docPoint, true);
	}

	/**
	 * Continue crop interaction (mouse move)
	 */
	continueCrop(
		canvasPoint: { x: number; y: number },
		shiftHeld: boolean = false,
		altHeld: boolean = false
	): void {
		const state = get(cropState);
		if (!state.isDragging || !state.startPoint || !this.engineState.viewport) return;

		const viewport = this.engineState.viewport;
		const docPoint = this.canvasToDocument(canvasPoint, viewport);
		const settings = get(cropSettings);
		const doc = this.engineState.document;

		let newRegion: CropRegion | null = null;

		if (state.isDrawingNew) {
			// Drawing a new region
			newRegion = this.calculateNewRegion(state.startPoint, docPoint);

			// Apply aspect ratio constraint (no originalRegion for new drawings)
			newRegion = this.applyAspectRatio(newRegion, settings, doc, shiftHeld, undefined, null);
		} else if (state.activeHandle === 'move' && state.originalRegion) {
			// Moving the entire region
			const dx = docPoint.x - state.startPoint.x;
			const dy = docPoint.y - state.startPoint.y;

			newRegion = {
				x: state.originalRegion.x + dx,
				y: state.originalRegion.y + dy,
				width: state.originalRegion.width,
				height: state.originalRegion.height
			};
		} else if (state.activeHandle && state.originalRegion) {
			// Resizing via handle
			newRegion = this.resizeViaHandle(
				state.originalRegion,
				state.activeHandle,
				docPoint,
				state.startPoint
			);

			// Apply aspect ratio constraint with anchor awareness
			newRegion = this.applyAspectRatio(
				newRegion,
				settings,
				doc,
				shiftHeld,
				state.activeHandle,
				state.originalRegion
			);

			// Ensure minimum size
			newRegion.width = Math.max(1, newRegion.width);
			newRegion.height = Math.max(1, newRegion.height);
		}

		if (!newRegion) return;

		// Apply snapping if enabled and Alt is not held
		if (settings.snapEnabled && !altHeld && doc) {
			const selection = get(selectionState).selection;
			const targets = getSnapTargets(doc.width, doc.height, selection);

			const result = applySnapping(
				newRegion,
				targets,
				settings.snapThreshold,
				state.activeHandle,
				state.isDrawingNew
			);

			newRegion = result.region;
			setCropActiveSnaps(result.activeSnaps);
		} else {
			setCropActiveSnaps([]);
		}

		setCropRegion(newRegion);
	}

	/**
	 * End crop interaction
	 */
	endCrop(): void {
		const state = get(cropState);
		if (!state.isDragging) return;

		// Normalize region (ensure positive width/height)
		if (state.region) {
			const normalized = this.normalizeRegion(state.region);
			if (normalized.width > 0 && normalized.height > 0) {
				setCropRegion(normalized);
			} else {
				// Region too small, reset to full canvas
				const doc = this.engineState.document;
				if (doc) {
					setCropRegion({ x: 0, y: 0, width: doc.width, height: doc.height });
				}
			}
		}

		endCropInteraction();
	}

	/**
	 * Cancel crop operation
	 */
	cancel(): void {
		cancelCrop();
	}

	/**
	 * Commit the crop - execute the actual crop operation
	 */
	async commitCrop(): Promise<boolean> {
		const state = get(cropState);
		if (!state.region) return false;

		const region = this.normalizeRegion(state.region);
		if (region.width <= 0 || region.height <= 0) return false;

		const docState = get(activeDocumentState);
		if (!docState) return false;

		console.log('Committing crop:', region);

		// Clear any selection before crop
		clearSelection();

		// Call backend to perform the crop
		const success = await cropDocumentToRegion(
			docState.document.id,
			Math.round(region.x),
			Math.round(region.y),
			Math.round(region.width),
			Math.round(region.height)
		);

		if (success) {
			this.deactivate();
		}

		return success;
	}

	/**
	 * Set crop region from current selection
	 */
	setCropFromSelection(): boolean {
		const selState = get(selectionState);
		if (selState.selection.type === 'none' || !selState.selection.bounds) {
			return false;
		}

		const bounds = selState.selection.bounds;
		setCropRegion({
			x: bounds.x,
			y: bounds.y,
			width: bounds.width,
			height: bounds.height
		});

		return true;
	}

	/**
	 * Get handle at canvas point (for cursor and hit detection)
	 */
	getHandleAtPoint(
		canvasPoint: { x: number; y: number },
		viewport: Viewport
	): HandleType | null {
		const state = get(cropState);
		if (!state.region) return null;

		const handles = this.getHandlePositions(state.region, viewport);

		for (const [type, pos] of Object.entries(handles)) {
			const dist = Math.hypot(canvasPoint.x - pos.x, canvasPoint.y - pos.y);
			if (dist <= HANDLE_HIT_RADIUS) {
				return type as HandleType;
			}
		}

		return null;
	}

	/**
	 * Get handle positions in canvas space
	 */
	getHandlePositions(
		region: CropRegion,
		viewport: Viewport
	): Record<HandleType, { x: number; y: number }> {
		const x = viewport.x + region.x * viewport.zoom;
		const y = viewport.y + region.y * viewport.zoom;
		const w = region.width * viewport.zoom;
		const h = region.height * viewport.zoom;

		return {
			nw: { x, y },
			n: { x: x + w / 2, y },
			ne: { x: x + w, y },
			w: { x, y: y + h / 2 },
			e: { x: x + w, y: y + h / 2 },
			sw: { x, y: y + h },
			s: { x: x + w / 2, y: y + h },
			se: { x: x + w, y: y + h },
			move: { x: x + w / 2, y: y + h / 2 } // Center for move handle reference
		};
	}

	/**
	 * Get cursor style for handle type
	 */
	getCursorForHandle(handle: HandleType | null): string {
		switch (handle) {
			case 'nw':
			case 'se':
				return 'nwse-resize';
			case 'ne':
			case 'sw':
				return 'nesw-resize';
			case 'n':
			case 's':
				return 'ns-resize';
			case 'e':
			case 'w':
				return 'ew-resize';
			case 'move':
				return 'move';
			default:
				return 'crosshair';
		}
	}

	/**
	 * Check if crop is active
	 */
	get isActive(): boolean {
		return get(cropState).isActive;
	}

	/**
	 * Check if currently dragging
	 */
	get isDragging(): boolean {
		return get(cropState).isDragging;
	}

	/**
	 * Check if there's a pending crop region
	 */
	hasPendingCrop(): boolean {
		const state = get(cropState);
		return state.region !== null;
	}

	/**
	 * Get current crop region
	 */
	getCropRegion(): CropRegion | null {
		return get(cropState).region;
	}

	// Private helper methods

	private canvasToDocument(
		canvasPoint: { x: number; y: number },
		viewport: Viewport
	): { x: number; y: number } {
		return {
			x: (canvasPoint.x - viewport.x) / viewport.zoom,
			y: (canvasPoint.y - viewport.y) / viewport.zoom
		};
	}

	private isPointInsideRegion(
		point: { x: number; y: number },
		region: CropRegion
	): boolean {
		const normalized = this.normalizeRegion(region);
		return (
			point.x >= normalized.x &&
			point.x <= normalized.x + normalized.width &&
			point.y >= normalized.y &&
			point.y <= normalized.y + normalized.height
		);
	}

	private calculateNewRegion(
		start: { x: number; y: number },
		current: { x: number; y: number }
	): CropRegion {
		return {
			x: Math.min(start.x, current.x),
			y: Math.min(start.y, current.y),
			width: Math.abs(current.x - start.x),
			height: Math.abs(current.y - start.y)
		};
	}

	private normalizeRegion(region: CropRegion): CropRegion {
		return {
			x: region.width < 0 ? region.x + region.width : region.x,
			y: region.height < 0 ? region.y + region.height : region.y,
			width: Math.abs(region.width),
			height: Math.abs(region.height)
		};
	}

	private resizeViaHandle(
		original: CropRegion,
		handle: HandleType,
		docPoint: { x: number; y: number },
		startPoint: { x: number; y: number }
	): CropRegion {
		const dx = docPoint.x - startPoint.x;
		const dy = docPoint.y - startPoint.y;

		let { x, y, width, height } = original;

		switch (handle) {
			case 'nw':
				x += dx;
				y += dy;
				width -= dx;
				height -= dy;
				break;
			case 'n':
				y += dy;
				height -= dy;
				break;
			case 'ne':
				y += dy;
				width += dx;
				height -= dy;
				break;
			case 'w':
				x += dx;
				width -= dx;
				break;
			case 'e':
				width += dx;
				break;
			case 'sw':
				x += dx;
				width -= dx;
				height += dy;
				break;
			case 's':
				height += dy;
				break;
			case 'se':
				width += dx;
				height += dy;
				break;
		}

		return { x, y, width, height };
	}

	private applyAspectRatio(
		region: CropRegion,
		settings: { aspectRatio: string; customRatio: { width: number; height: number } },
		doc: Document | null,
		shiftHeld: boolean,
		handle?: HandleType,
		originalRegion?: CropRegion | null
	): CropRegion {
		// Determine the target aspect ratio
		let ratio = getAspectRatioValue(
			settings.aspectRatio as any,
			settings.customRatio,
			doc?.width,
			doc?.height
		);

		// If shift held and free mode, lock to the original region's aspect ratio
		if (shiftHeld && settings.aspectRatio === 'free') {
			if (originalRegion && originalRegion.width > 0 && originalRegion.height > 0) {
				// Lock to the aspect ratio at drag start
				ratio = originalRegion.width / originalRegion.height;
			} else {
				// Drawing new region with shift = square
				ratio = 1;
			}
		}

		if (ratio === null) return region;

		const { x, y, width, height } = region;

		// Determine which dimension to adjust based on handle
		const isHorizontalHandle = handle === 'e' || handle === 'w';
		const isVerticalHandle = handle === 'n' || handle === 's';
		const isCornerHandle = ['nw', 'ne', 'sw', 'se'].includes(handle || '');

		if (isHorizontalHandle) {
			// Horizontal edge handles: adjust height, anchor based on handle
			const newHeight = Math.abs(width) / ratio;
			if (handle === 'w') {
				// Left edge: right side anchored, center vertically
				const heightDiff = newHeight - Math.abs(height);
				return { x, y: y - heightDiff / 2, width, height: newHeight };
			} else {
				// Right edge: left side anchored, center vertically
				const heightDiff = newHeight - Math.abs(height);
				return { x, y: y - heightDiff / 2, width, height: newHeight };
			}
		} else if (isVerticalHandle) {
			// Vertical edge handles: adjust width, anchor based on handle
			const newWidth = Math.abs(height) * ratio;
			if (handle === 'n') {
				// Top edge: bottom anchored, center horizontally
				const widthDiff = newWidth - Math.abs(width);
				return { x: x - widthDiff / 2, y, width: newWidth, height };
			} else {
				// Bottom edge: top anchored, center horizontally
				const widthDiff = newWidth - Math.abs(width);
				return { x: x - widthDiff / 2, y, width: newWidth, height };
			}
		} else if (isCornerHandle && originalRegion) {
			// Corner handles: determine primary drag direction and anchor to opposite corner
			const widthDelta = Math.abs(width - originalRegion.width);
			const heightDelta = Math.abs(height - originalRegion.height);

			if (widthDelta >= heightDelta) {
				// Width changed more, adjust height to match ratio
				const newHeight = Math.abs(width) / ratio;

				switch (handle) {
					case 'se':
						// Anchor top-left: x, y stay fixed
						return { x, y, width, height: newHeight };
					case 'sw':
						// Anchor top-right: x changes with width, y stays fixed
						return { x, y, width, height: newHeight };
					case 'ne':
						// Anchor bottom-left: x stays fixed, y adjusts for new height
						return { x, y: y + height - newHeight, width, height: newHeight };
					case 'nw':
						// Anchor bottom-right: both x and y adjust
						return { x, y: y + height - newHeight, width, height: newHeight };
				}
			} else {
				// Height changed more, adjust width to match ratio
				const newWidth = Math.abs(height) * ratio;

				switch (handle) {
					case 'se':
						// Anchor top-left: x, y stay fixed
						return { x, y, width: newWidth, height };
					case 'sw':
						// Anchor top-right: x adjusts for new width, y stays fixed
						return { x: x + width - newWidth, y, width: newWidth, height };
					case 'ne':
						// Anchor bottom-left: x stays fixed, y changes with height
						return { x, y, width: newWidth, height };
					case 'nw':
						// Anchor bottom-right: x adjusts for new width
						return { x: x + width - newWidth, y, width: newWidth, height };
				}
			}
		}

		// Fallback for drawing new or no handle specified
		const currentRatio = Math.abs(width) / Math.abs(height);
		if (currentRatio > ratio) {
			// Too wide, adjust width
			const newWidth = Math.abs(height) * ratio;
			return { x, y, width: width >= 0 ? newWidth : -newWidth, height };
		} else {
			// Too tall, adjust height
			const newHeight = Math.abs(width) / ratio;
			return { x, y, width, height: height >= 0 ? newHeight : -newHeight };
		}
	}
}

export const cropEngine = new CropEngine();
