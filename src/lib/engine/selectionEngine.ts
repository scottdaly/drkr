import { get } from 'svelte/store';
import {
	startDrawingSelection,
	updateDrawingSelection,
	commitDrawingSelection,
	cancelDrawingSelection,
	selectionState,
	updateMarchingAntsOffset
} from '$lib/stores/selection';
import { selectionSettings } from '$lib/stores/tools';
import type { Viewport } from '$lib/types/document';

interface SelectionEngineState {
	isActive: boolean;
	selectionType: 'rect' | 'ellipse' | 'lasso' | null;
	startPoint: { x: number; y: number } | null;
	shiftHeld: boolean;
}

class SelectionEngine {
	private state: SelectionEngineState = {
		isActive: false,
		selectionType: null,
		startPoint: null,
		shiftHeld: false
	};

	private marchingAntsAnimationId: number | null = null;
	private marchingAntsLastTime = 0;

	/**
	 * Start drawing a selection
	 */
	startSelection(
		type: 'rect' | 'ellipse' | 'lasso',
		canvasPoint: { x: number; y: number },
		viewport: Viewport
	): void {
		// Convert canvas point to document space
		const docPoint = this.canvasToDocument(canvasPoint, viewport);

		this.state = {
			isActive: true,
			selectionType: type,
			startPoint: docPoint,
			shiftHeld: false
		};

		startDrawingSelection(type, docPoint);
	}

	/**
	 * Continue drawing (mouse move)
	 */
	continueSelection(
		canvasPoint: { x: number; y: number },
		viewport: Viewport,
		shiftHeld: boolean
	): void {
		if (!this.state.isActive) return;

		this.state.shiftHeld = shiftHeld;

		// Convert to document space
		let docPoint = this.canvasToDocument(canvasPoint, viewport);

		// Apply shift constraint for rect/ellipse (square/circle)
		if (shiftHeld && this.state.startPoint && this.state.selectionType !== 'lasso') {
			docPoint = this.constrainToSquare(this.state.startPoint, docPoint);
		}

		updateDrawingSelection(docPoint);
	}

	/**
	 * End selection drawing
	 */
	endSelection(): void {
		if (!this.state.isActive) return;

		const settings = get(selectionSettings);
		commitDrawingSelection(settings.mode);

		this.state = {
			isActive: false,
			selectionType: null,
			startPoint: null,
			shiftHeld: false
		};

		// Start marching ants animation if we have a selection
		this.startMarchingAntsAnimation();
	}

	/**
	 * Cancel selection drawing
	 */
	cancel(): void {
		if (!this.state.isActive) return;

		cancelDrawingSelection();

		this.state = {
			isActive: false,
			selectionType: null,
			startPoint: null,
			shiftHeld: false
		};
	}

	/**
	 * Check if selection drawing is active
	 */
	get isActive(): boolean {
		return this.state.isActive;
	}

	/**
	 * Get the current selection type being drawn
	 */
	get currentType(): 'rect' | 'ellipse' | 'lasso' | null {
		return this.state.selectionType;
	}

	/**
	 * Convert canvas coordinates to document coordinates
	 */
	private canvasToDocument(
		canvasPoint: { x: number; y: number },
		viewport: Viewport
	): { x: number; y: number } {
		return {
			x: (canvasPoint.x - viewport.x) / viewport.zoom,
			y: (canvasPoint.y - viewport.y) / viewport.zoom
		};
	}

	/**
	 * Constrain a point to make a square/circle from start point
	 */
	private constrainToSquare(
		start: { x: number; y: number },
		current: { x: number; y: number }
	): { x: number; y: number } {
		const dx = current.x - start.x;
		const dy = current.y - start.y;
		const size = Math.max(Math.abs(dx), Math.abs(dy));

		return {
			x: start.x + size * Math.sign(dx),
			y: start.y + size * Math.sign(dy)
		};
	}

	/**
	 * Start marching ants animation
	 */
	startMarchingAntsAnimation(): void {
		if (this.marchingAntsAnimationId !== null) return;

		const animate = (time: number) => {
			// Update every 80ms for a nice animation speed
			if (time - this.marchingAntsLastTime >= 80) {
				const state = get(selectionState);
				if (state.selection.type === 'none') {
					this.stopMarchingAntsAnimation();
					return;
				}

				updateMarchingAntsOffset(state.marchingAntsOffset + 1);
				this.marchingAntsLastTime = time;
			}

			this.marchingAntsAnimationId = requestAnimationFrame(animate);
		};

		this.marchingAntsAnimationId = requestAnimationFrame(animate);
	}

	/**
	 * Stop marching ants animation
	 */
	stopMarchingAntsAnimation(): void {
		if (this.marchingAntsAnimationId !== null) {
			cancelAnimationFrame(this.marchingAntsAnimationId);
			this.marchingAntsAnimationId = null;
		}
	}

	/**
	 * Get preview rectangle for rect/ellipse selection (in document space)
	 */
	getPreviewRect(): { x: number; y: number; width: number; height: number } | null {
		const state = get(selectionState);

		if (!state.isDrawing || !state.startPoint || !state.currentPoint) {
			return null;
		}

		if (state.drawingType === 'lasso') {
			return null;
		}

		const x = Math.min(state.startPoint.x, state.currentPoint.x);
		const y = Math.min(state.startPoint.y, state.currentPoint.y);
		const width = Math.abs(state.currentPoint.x - state.startPoint.x);
		const height = Math.abs(state.currentPoint.y - state.startPoint.y);

		return { x, y, width, height };
	}

	/**
	 * Get preview lasso path (in document space)
	 */
	getLassoPath(): { x: number; y: number }[] | null {
		const state = get(selectionState);

		if (!state.isDrawing || state.drawingType !== 'lasso') {
			return null;
		}

		return state.lassoPoints.length > 0 ? state.lassoPoints : null;
	}

	/**
	 * Get committed selection bounds (in document space)
	 */
	getSelectionBounds(): { x: number; y: number; width: number; height: number } | null {
		const state = get(selectionState);

		if (state.selection.type === 'none' || !state.selection.bounds) {
			return null;
		}

		return state.selection.bounds;
	}

	/**
	 * Get committed selection type
	 */
	getSelectionType(): 'rect' | 'ellipse' | 'path' | 'none' {
		const state = get(selectionState);
		if (state.selection.type === 'none') return 'none';
		if (state.selection.type === 'rect') return 'rect';
		if (state.selection.type === 'ellipse') return 'ellipse';
		return 'path';
	}

	/**
	 * Get polygon points for lasso selection
	 */
	getPolygonPoints(): { x: number; y: number }[] | null {
		const state = get(selectionState);

		if (state.vectorPath?.type === 'polygon') {
			return state.vectorPath.points;
		}

		return null;
	}

	/**
	 * Get current marching ants offset
	 */
	getMarchingAntsOffset(): number {
		return get(selectionState).marchingAntsOffset;
	}
}

export const selectionEngine = new SelectionEngine();
