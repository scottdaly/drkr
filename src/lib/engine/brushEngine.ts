import { get, writable } from 'svelte/store';
import { brushSettings, colors, activeTool } from '$lib/stores/tools';
import { document as documentStore, activeLayerId, applyBrushStrokLocal, markLayerDirty, layerPixelBuffers } from '$lib/stores/documents';
import { history, captureRegion, createBrushHistoryEntry } from '$lib/stores/history';
import { selectionState } from '$lib/stores/selection';
import type { BrushSettings, Color } from '$lib/types/tools';
import type { Viewport } from '$lib/types/document';
import * as tauri from '$lib/services/tauri';

// Store for real-time stroke preview
export const currentStrokePreview = writable<{
	points: Point[];
	color: Color;
	settings: BrushSettings;
	isEraser: boolean;
} | null>(null);

export interface Point {
	x: number;
	y: number;
	pressure?: number;
}

export interface StrokePoint extends Point {
	timestamp: number;
}

export interface BrushStroke {
	points: StrokePoint[];
	settings: BrushSettings;
	color: Color;
	isEraser: boolean;
	layerId: string;
}

class BrushEngine {
	private isDrawing = false;
	private currentStroke: StrokePoint[] = [];
	private lastPoint: StrokePoint | null = null;
	private strokeStartTime = 0;

	// For stroke smoothing
	private smoothingBuffer: Point[] = [];

	// For undo/redo - track affected region
	private strokeBounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
	private beforeSnapshot: Uint8ClampedArray | null = null;
	private strokeLayerId: string | null = null;
	private strokeIsEraser = false;

	/**
	 * Start a new brush stroke
	 */
	startStroke(canvasPoint: Point, viewport: Viewport): void {
		const doc = get(documentStore);
		const layerId = get(activeLayerId);

		if (!doc || !layerId) return;

		// Check if active layer is locked
		const layer = doc.layers.find((l) => l.id === layerId);
		if (!layer || layer.locked) return;

		this.isDrawing = true;
		this.currentStroke = [];
		this.smoothingBuffer = [];
		this.strokeStartTime = Date.now();

		// Convert canvas coordinates to document coordinates
		const docPoint = this.canvasToDocument(canvasPoint, viewport);

		const strokePoint: StrokePoint = {
			x: docPoint.x,
			y: docPoint.y,
			pressure: canvasPoint.pressure ?? 1,
			timestamp: 0
		};

		this.currentStroke.push(strokePoint);
		this.lastPoint = strokePoint;
		this.smoothingBuffer.push(docPoint);

		// Get settings for undo tracking
		const settings = get(brushSettings);
		const colorState = get(colors);
		const tool = get(activeTool);
		const isEraser = tool === 'eraser';
		const radius = settings.size / 2;

		// Initialize bounds tracking for undo/redo
		this.strokeLayerId = layerId;
		this.strokeIsEraser = isEraser;
		this.strokeBounds = {
			minX: Math.floor(docPoint.x - radius),
			minY: Math.floor(docPoint.y - radius),
			maxX: Math.ceil(docPoint.x + radius),
			maxY: Math.ceil(docPoint.y + radius)
		};

		// Capture "before" snapshot of the entire layer (we'll trim it at the end)
		const buffer = get(layerPixelBuffers).get(layerId);
		if (buffer) {
			this.beforeSnapshot = new Uint8ClampedArray(buffer.data);
		}

		// Apply first point locally for immediate feedback
		const currentSelectionState = get(selectionState);
		const polygonPoints = currentSelectionState.vectorPath?.type === 'polygon'
			? currentSelectionState.vectorPath.points
			: undefined;
		applyBrushStrokLocal(
			layerId,
			[docPoint],
			{
				size: settings.size,
				hardness: settings.hardness,
				opacity: settings.opacity,
				flow: settings.flow
			},
			colorState.foreground,
			isEraser,
			currentSelectionState.selection,
			polygonPoints
		);

		// Clear any previous preview
		currentStrokePreview.set(null);
	}

	/**
	 * Continue the current stroke with a new point
	 */
	continueStroke(canvasPoint: Point, viewport: Viewport): StrokePoint[] {
		if (!this.isDrawing || !this.lastPoint) return [];

		const docPoint = this.canvasToDocument(canvasPoint, viewport);
		const settings = get(brushSettings);
		const colorState = get(colors);
		const tool = get(activeTool);
		const isEraser = tool === 'eraser';
		const layerId = get(activeLayerId);
		const radius = settings.size / 2;

		// Add to smoothing buffer
		this.smoothingBuffer.push(docPoint);
		if (this.smoothingBuffer.length > 5) {
			this.smoothingBuffer.shift();
		}

		// Apply smoothing
		const smoothedPoint = this.applySmoothingToPoint(docPoint, settings.smoothing);

		// Interpolate points based on spacing
		const newPoints = this.interpolatePoints(this.lastPoint, smoothedPoint, settings);

		// Add new points to stroke
		for (const point of newPoints) {
			const strokePoint: StrokePoint = {
				...point,
				pressure: canvasPoint.pressure ?? 1,
				timestamp: Date.now() - this.strokeStartTime
			};
			this.currentStroke.push(strokePoint);

			// Expand bounds to include this point
			if (this.strokeBounds) {
				this.strokeBounds.minX = Math.min(this.strokeBounds.minX, Math.floor(point.x - radius));
				this.strokeBounds.minY = Math.min(this.strokeBounds.minY, Math.floor(point.y - radius));
				this.strokeBounds.maxX = Math.max(this.strokeBounds.maxX, Math.ceil(point.x + radius));
				this.strokeBounds.maxY = Math.max(this.strokeBounds.maxY, Math.ceil(point.y + radius));
			}
		}

		if (newPoints.length > 0) {
			this.lastPoint = {
				...newPoints[newPoints.length - 1],
				pressure: canvasPoint.pressure ?? 1,
				timestamp: Date.now() - this.strokeStartTime
			};

			// Apply stroke locally for immediate visual feedback
			if (layerId && newPoints.length > 0) {
				const currentSelectionState = get(selectionState);
				const polygonPoints = currentSelectionState.vectorPath?.type === 'polygon'
					? currentSelectionState.vectorPath.points
					: undefined;
				applyBrushStrokLocal(
					layerId,
					newPoints,
					{
						size: settings.size,
						hardness: settings.hardness,
						opacity: settings.opacity,
						flow: settings.flow
					},
					colorState.foreground,
					isEraser,
					currentSelectionState.selection,
					polygonPoints
				);
			}
		}

		return newPoints.map((p) => ({
			...p,
			pressure: canvasPoint.pressure ?? 1,
			timestamp: Date.now() - this.strokeStartTime
		}));
	}

	/**
	 * End the current stroke and send to backend (non-blocking)
	 */
	endStroke(): boolean {
		if (!this.isDrawing) return false;

		this.isDrawing = false;

		const layerId = get(activeLayerId);
		const doc = get(documentStore);

		if (!layerId || !doc || this.currentStroke.length === 0) {
			this.reset();
			return false;
		}

		const settings = get(brushSettings);
		const colorState = get(colors);
		const tool = get(activeTool);
		const isEraser = tool === 'eraser';

		// Create history entry for undo/redo
		if (this.strokeBounds && this.beforeSnapshot && this.strokeLayerId) {
			const buffer = get(layerPixelBuffers).get(this.strokeLayerId);
			if (buffer) {
				// Clamp bounds to layer dimensions
				const bounds = {
					x: Math.max(0, this.strokeBounds.minX),
					y: Math.max(0, this.strokeBounds.minY),
					width: Math.min(buffer.width, this.strokeBounds.maxX) - Math.max(0, this.strokeBounds.minX),
					height: Math.min(buffer.height, this.strokeBounds.maxY) - Math.max(0, this.strokeBounds.minY)
				};

				if (bounds.width > 0 && bounds.height > 0) {
					// Extract "before" pixels from the snapshot
					const beforePixels = this.extractRegion(
						this.beforeSnapshot,
						buffer.width,
						bounds
					);

					// Extract "after" pixels from the current buffer
					const afterPixels = this.extractRegion(
						buffer.data,
						buffer.width,
						bounds
					);

					// Push to history
					history.push({
						id: crypto.randomUUID(),
						name: this.strokeIsEraser ? 'Eraser Stroke' : 'Brush Stroke',
						layerId: this.strokeLayerId,
						timestamp: Date.now(),
						bounds,
						beforePixels,
						afterPixels
					});
				}
			}
		}

		// Fire-and-forget: send stroke to backend for persistence
		// The local buffer already has the changes, so no need to wait
		tauri.applyBrushStroke(
			doc.id,
			layerId,
			this.currentStroke,
			{
				size: settings.size,
				hardness: settings.hardness,
				opacity: settings.opacity,
				flow: settings.flow,
				spacing: settings.spacing
			},
			isEraser ? { r: 0, g: 0, b: 0, a: 0 } : colorState.foreground,
			isEraser
		).catch((error) => {
			console.error('Failed to sync brush stroke to backend:', error);
		});

		this.reset();
		return true;
	}

	/**
	 * Extract a region of pixels from a buffer
	 */
	private extractRegion(
		data: Uint8ClampedArray,
		bufferWidth: number,
		bounds: { x: number; y: number; width: number; height: number }
	): Uint8ClampedArray {
		const { x, y, width, height } = bounds;
		const pixels = new Uint8ClampedArray(width * height * 4);

		for (let row = 0; row < height; row++) {
			for (let col = 0; col < width; col++) {
				const srcIdx = ((y + row) * bufferWidth + (x + col)) * 4;
				const dstIdx = (row * width + col) * 4;

				pixels[dstIdx] = data[srcIdx];
				pixels[dstIdx + 1] = data[srcIdx + 1];
				pixels[dstIdx + 2] = data[srcIdx + 2];
				pixels[dstIdx + 3] = data[srcIdx + 3];
			}
		}

		return pixels;
	}

	/**
	 * Cancel the current stroke
	 */
	cancelStroke(): void {
		this.reset();
	}

	/**
	 * Check if currently drawing
	 */
	get drawing(): boolean {
		return this.isDrawing;
	}

	/**
	 * Get current stroke points
	 */
	get stroke(): StrokePoint[] {
		return this.currentStroke;
	}

	/**
	 * Convert canvas coordinates to document coordinates
	 */
	private canvasToDocument(canvasPoint: Point, viewport: Viewport): Point {
		return {
			x: (canvasPoint.x - viewport.x) / viewport.zoom,
			y: (canvasPoint.y - viewport.y) / viewport.zoom,
			pressure: canvasPoint.pressure
		};
	}

	/**
	 * Apply smoothing to a point based on the smoothing buffer
	 */
	private applySmoothingToPoint(point: Point, smoothingLevel: number): Point {
		if (smoothingLevel === 0 || this.smoothingBuffer.length < 2) {
			return point;
		}

		const weight = smoothingLevel / 100;
		let sumX = 0;
		let sumY = 0;
		let totalWeight = 0;

		// Weighted average favoring recent points
		for (let i = 0; i < this.smoothingBuffer.length; i++) {
			const w = (i + 1) / this.smoothingBuffer.length;
			sumX += this.smoothingBuffer[i].x * w;
			sumY += this.smoothingBuffer[i].y * w;
			totalWeight += w;
		}

		const avgX = sumX / totalWeight;
		const avgY = sumY / totalWeight;

		return {
			x: point.x * (1 - weight) + avgX * weight,
			y: point.y * (1 - weight) + avgY * weight,
			pressure: point.pressure
		};
	}

	/**
	 * Interpolate points between two positions based on brush spacing
	 */
	private interpolatePoints(from: Point, to: Point, settings: BrushSettings): Point[] {
		const points: Point[] = [];

		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const distance = Math.sqrt(dx * dx + dy * dy);

		// Calculate spacing in pixels
		const spacingPixels = Math.max(1, (settings.size * settings.spacing) / 100);

		if (distance < spacingPixels) {
			// Only add destination if we haven't moved enough
			if (distance > 0.5) {
				points.push(to);
			}
			return points;
		}

		// Calculate number of points to add
		const numPoints = Math.floor(distance / spacingPixels);

		for (let i = 1; i <= numPoints; i++) {
			const t = i / numPoints;
			points.push({
				x: from.x + dx * t,
				y: from.y + dy * t,
				pressure: from.pressure !== undefined && to.pressure !== undefined
					? from.pressure + (to.pressure - from.pressure) * t
					: undefined
			});
		}

		return points;
	}

	/**
	 * Reset the engine state
	 */
	private reset(): void {
		this.isDrawing = false;
		this.currentStroke = [];
		this.lastPoint = null;
		this.smoothingBuffer = [];
		this.strokeBounds = null;
		this.beforeSnapshot = null;
		this.strokeLayerId = null;
		this.strokeIsEraser = false;
		currentStrokePreview.set(null);
	}
}

// Export singleton instance
export const brushEngine = new BrushEngine();

// Helper to render brush preview (cursor)
export function getBrushPreviewSize(zoom: number): number {
	const settings = get(brushSettings);
	return settings.size * zoom;
}

// Helper to check if we should draw
export function canDraw(): boolean {
	const doc = get(documentStore);
	const layerId = get(activeLayerId);
	const tool = get(activeTool);

	if (!doc || !layerId) return false;
	if (tool !== 'brush' && tool !== 'eraser') return false;

	const layer = doc.layers.find((l) => l.id === layerId);
	return layer !== undefined && !layer.locked && layer.visible;
}
