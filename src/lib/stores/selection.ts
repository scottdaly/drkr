import { writable, derived, get } from 'svelte/store';
import type { Selection } from '$lib/types/document';
import type { SelectionMode } from '$lib/types/tools';
import { activeDocumentId, openDocuments } from './documents';
import { isPointInSelectionBounds } from '$lib/utils/selectionUtils';

/**
 * Selection state for the active document
 */
export interface SelectionState {
	// The committed selection
	selection: Selection;

	// For geometric selections (rect, ellipse)
	vectorPath?: {
		type: 'rect' | 'ellipse' | 'polygon';
		points: { x: number; y: number }[];
		closed: boolean;
	};

	// Drawing state
	isDrawing: boolean;
	drawingType: 'rect' | 'ellipse' | 'lasso' | null;
	startPoint: { x: number; y: number } | null;
	currentPoint: { x: number; y: number } | null;
	lassoPoints: { x: number; y: number }[];

	// Marching ants animation offset
	marchingAntsOffset: number;
}

// Per-document selection state
const documentSelections = writable<Map<string, SelectionState>>(new Map());

// Default empty selection state
function createEmptySelectionState(): SelectionState {
	return {
		selection: {
			type: 'none',
			feather: 0
		},
		isDrawing: false,
		drawingType: null,
		startPoint: null,
		currentPoint: null,
		lassoPoints: [],
		marchingAntsOffset: 0
	};
}

// Get selection state for active document
export const selectionState = derived(
	[documentSelections, activeDocumentId],
	([$documentSelections, $activeDocumentId]) => {
		if (!$activeDocumentId) return createEmptySelectionState();
		return $documentSelections.get($activeDocumentId) || createEmptySelectionState();
	}
);

// Just the selection data
export const selection = derived(selectionState, ($state) => $state.selection);

// Check if there's an active selection
export const hasSelection = derived(
	selection,
	($selection) => $selection.type !== 'none' && $selection.bounds !== undefined
);

// Check if currently drawing a selection
export const isDrawingSelection = derived(selectionState, ($state) => $state.isDrawing);

/**
 * Update selection state for active document
 */
export function updateSelectionState(updater: (state: SelectionState) => SelectionState): void {
	const docId = get(activeDocumentId);
	if (!docId) return;

	documentSelections.update((map) => {
		const current = map.get(docId) || createEmptySelectionState();
		const updated = updater(current);
		map.set(docId, updated);
		return new Map(map);
	});
}

/**
 * Start drawing a selection
 */
export function startDrawingSelection(
	type: 'rect' | 'ellipse' | 'lasso',
	point: { x: number; y: number }
): void {
	updateSelectionState((state) => ({
		...state,
		isDrawing: true,
		drawingType: type,
		startPoint: point,
		currentPoint: point,
		lassoPoints: type === 'lasso' ? [point] : []
	}));
}

/**
 * Update the current drawing point
 */
export function updateDrawingSelection(point: { x: number; y: number }): void {
	updateSelectionState((state) => {
		if (!state.isDrawing) return state;

		if (state.drawingType === 'lasso') {
			// Add point to lasso path (with some distance threshold to avoid too many points)
			const lastPoint = state.lassoPoints[state.lassoPoints.length - 1];
			if (lastPoint) {
				const dx = point.x - lastPoint.x;
				const dy = point.y - lastPoint.y;
				const dist = Math.sqrt(dx * dx + dy * dy);
				if (dist < 2) return state; // Skip points too close together
			}

			return {
				...state,
				currentPoint: point,
				lassoPoints: [...state.lassoPoints, point]
			};
		}

		return {
			...state,
			currentPoint: point
		};
	});
}

/**
 * Commit the current drawing as a selection
 */
export function commitDrawingSelection(mode: SelectionMode): void {
	const state = get(selectionState);
	if (!state.isDrawing || !state.startPoint || !state.currentPoint) {
		cancelDrawingSelection();
		return;
	}

	let newSelection: Selection;
	let bounds: { x: number; y: number; width: number; height: number } | undefined;

	if (state.drawingType === 'rect' || state.drawingType === 'ellipse') {
		const x = Math.min(state.startPoint.x, state.currentPoint.x);
		const y = Math.min(state.startPoint.y, state.currentPoint.y);
		const width = Math.abs(state.currentPoint.x - state.startPoint.x);
		const height = Math.abs(state.currentPoint.y - state.startPoint.y);

		// Minimum size check
		if (width < 2 || height < 2) {
			cancelDrawingSelection();
			return;
		}

		bounds = { x, y, width, height };
		newSelection = {
			type: state.drawingType,
			bounds,
			feather: 0
		};
	} else if (state.drawingType === 'lasso') {
		// Calculate bounding box from lasso points
		if (state.lassoPoints.length < 3) {
			cancelDrawingSelection();
			return;
		}

		const xs = state.lassoPoints.map((p) => p.x);
		const ys = state.lassoPoints.map((p) => p.y);
		const minX = Math.min(...xs);
		const minY = Math.min(...ys);
		const maxX = Math.max(...xs);
		const maxY = Math.max(...ys);

		bounds = {
			x: minX,
			y: minY,
			width: maxX - minX,
			height: maxY - minY
		};

		newSelection = {
			type: 'path',
			bounds,
			feather: 0
		};
	} else {
		cancelDrawingSelection();
		return;
	}

	// Apply selection mode
	const currentSelection = state.selection;

	if (mode === 'new' || currentSelection.type === 'none') {
		// Replace selection
		updateSelectionState((s) => ({
			...s,
			selection: newSelection,
			vectorPath:
				state.drawingType === 'lasso'
					? {
							type: 'polygon',
							points: [...state.lassoPoints],
							closed: true
						}
					: {
							type: state.drawingType!,
							points: [state.startPoint!, state.currentPoint!],
							closed: true
						},
			isDrawing: false,
			drawingType: null,
			startPoint: null,
			currentPoint: null,
			lassoPoints: []
		}));
	} else {
		// For add/subtract/intersect, we'd need bitmap operations
		// For now, just replace (full implementation would use bitmap masks)
		updateSelectionState((s) => ({
			...s,
			selection: newSelection,
			vectorPath:
				state.drawingType === 'lasso'
					? {
							type: 'polygon',
							points: [...state.lassoPoints],
							closed: true
						}
					: {
							type: state.drawingType!,
							points: [state.startPoint!, state.currentPoint!],
							closed: true
						},
			isDrawing: false,
			drawingType: null,
			startPoint: null,
			currentPoint: null,
			lassoPoints: []
		}));
	}
}

/**
 * Cancel the current drawing
 */
export function cancelDrawingSelection(): void {
	updateSelectionState((state) => ({
		...state,
		isDrawing: false,
		drawingType: null,
		startPoint: null,
		currentPoint: null,
		lassoPoints: []
	}));
}

/**
 * Clear the selection (Ctrl+D / Cmd+D)
 */
export function clearSelection(): void {
	updateSelectionState((state) => ({
		...state,
		selection: {
			type: 'none',
			feather: 0
		},
		vectorPath: undefined,
		isDrawing: false,
		drawingType: null,
		startPoint: null,
		currentPoint: null,
		lassoPoints: []
	}));
}

/**
 * Select all (Ctrl+A / Cmd+A)
 */
export function selectAll(): void {
	const docs = get(openDocuments);
	const docId = get(activeDocumentId);
	if (!docId) return;

	const docState = docs.get(docId);
	if (!docState) return;

	const { width, height } = docState.document;

	updateSelectionState((state) => ({
		...state,
		selection: {
			type: 'rect',
			bounds: { x: 0, y: 0, width, height },
			feather: 0
		},
		vectorPath: {
			type: 'rect',
			points: [
				{ x: 0, y: 0 },
				{ x: width, y: height }
			],
			closed: true
		},
		isDrawing: false,
		drawingType: null,
		startPoint: null,
		currentPoint: null,
		lassoPoints: []
	}));
}

/**
 * Invert selection
 */
export function invertSelection(): void {
	// This would require bitmap mask support
	// For now, we'll just log that it's not implemented
	console.warn('Invert selection not yet implemented (requires bitmap masks)');
}

/**
 * Update marching ants animation offset
 */
export function updateMarchingAntsOffset(offset: number): void {
	updateSelectionState((state) => ({
		...state,
		marchingAntsOffset: offset % 16 // Loop every 16 pixels
	}));
}

/**
 * Check if a point is inside the current selection
 * This version includes polygon support for lasso selections
 */
export function isPointInSelection(x: number, y: number): boolean {
	const state = get(selectionState);
	const sel = state.selection;

	// For lasso selections, pass the polygon points
	const polygonPoints =
		sel.type === 'path' && state.vectorPath?.type === 'polygon'
			? state.vectorPath.points
			: undefined;

	return isPointInSelectionBounds(x, y, sel, polygonPoints);
}

/**
 * Get the preview path for rendering during drawing
 */
export function getSelectionPreviewPath(): { x: number; y: number }[] | null {
	const state = get(selectionState);

	if (!state.isDrawing || !state.startPoint || !state.currentPoint) {
		return null;
	}

	if (state.drawingType === 'lasso') {
		return state.lassoPoints;
	}

	// For rect/ellipse, return corner points
	return [state.startPoint, state.currentPoint];
}
