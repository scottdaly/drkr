import { get } from 'svelte/store';
import { updateViewport, viewport } from '$lib/stores/documents';
import type { Viewport } from '$lib/types/document';

// Predefined zoom steps for consistent step-zoom behavior
const ZOOM_STEPS = [
	0.1, 0.15, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5, 6, 8, 12, 16, 24, 32
];

interface ZoomState {
	isActive: boolean;
	isDrawingMarquee: boolean;
	marqueeStart: { x: number; y: number } | null;
	marqueeEnd: { x: number; y: number } | null;
	startPoint: { x: number; y: number } | null;
}

class ZoomEngine {
	private state: ZoomState = {
		isActive: false,
		isDrawingMarquee: false,
		marqueeStart: null,
		marqueeEnd: null,
		startPoint: null
	};

	private dragThreshold = 5; // pixels before switching to marquee mode

	/**
	 * Start a zoom interaction (could be click or marquee drag)
	 */
	startZoom(point: { x: number; y: number }): void {
		this.state = {
			isActive: true,
			isDrawingMarquee: false,
			marqueeStart: null,
			marqueeEnd: null,
			startPoint: point
		};
	}

	/**
	 * Continue zoom interaction - switches to marquee mode if dragged far enough
	 */
	continueZoom(point: { x: number; y: number }): void {
		if (!this.state.isActive || !this.state.startPoint) return;

		const dx = point.x - this.state.startPoint.x;
		const dy = point.y - this.state.startPoint.y;
		const distance = Math.sqrt(dx * dx + dy * dy);

		if (distance > this.dragThreshold) {
			// Switch to marquee mode
			this.state.isDrawingMarquee = true;
			this.state.marqueeStart = this.state.startPoint;
			this.state.marqueeEnd = point;
		} else if (this.state.isDrawingMarquee) {
			// Already in marquee mode, update end point
			this.state.marqueeEnd = point;
		}
	}

	/**
	 * End zoom interaction - either step zoom or marquee zoom
	 */
	endZoom(altKey: boolean): void {
		if (!this.state.isActive) return;

		const vp = get(viewport);

		if (this.state.isDrawingMarquee && this.state.marqueeStart && this.state.marqueeEnd) {
			// Marquee zoom: fit the selected rectangle
			this.zoomToMarquee(vp);
		} else if (this.state.startPoint) {
			// Click zoom: step in or out
			this.stepZoom(this.state.startPoint, altKey ? 'out' : 'in', vp);
		}

		this.reset();
	}

	/**
	 * Cancel zoom operation
	 */
	cancel(): void {
		this.reset();
	}

	/**
	 * Reset state
	 */
	private reset(): void {
		this.state = {
			isActive: false,
			isDrawingMarquee: false,
			marqueeStart: null,
			marqueeEnd: null,
			startPoint: null
		};
	}

	/**
	 * Step zoom in or out by one level
	 */
	private stepZoom(
		point: { x: number; y: number },
		direction: 'in' | 'out',
		vp: Viewport
	): void {
		const currentZoom = vp.zoom;
		const currentIndex = this.findNearestZoomIndex(currentZoom);
		const newIndex =
			direction === 'in'
				? Math.min(currentIndex + 1, ZOOM_STEPS.length - 1)
				: Math.max(currentIndex - 1, 0);
		const newZoom = ZOOM_STEPS[newIndex];

		if (newZoom === currentZoom) return;

		// Zoom centered on click point
		updateViewport((v) => ({
			...v,
			zoom: newZoom,
			x: point.x - (point.x - v.x) * (newZoom / currentZoom),
			y: point.y - (point.y - v.y) * (newZoom / currentZoom)
		}));
	}

	/**
	 * Zoom to fit the marquee rectangle in the viewport
	 */
	private zoomToMarquee(vp: Viewport): void {
		if (!this.state.marqueeStart || !this.state.marqueeEnd) return;

		// Get marquee dimensions in canvas space
		const marqueeWidth = Math.abs(this.state.marqueeEnd.x - this.state.marqueeStart.x);
		const marqueeHeight = Math.abs(this.state.marqueeEnd.y - this.state.marqueeStart.y);

		// Don't zoom if marquee is too small - treat as a click instead
		if (marqueeWidth < 10 || marqueeHeight < 10) {
			const centerX = (this.state.marqueeStart.x + this.state.marqueeEnd.x) / 2;
			const centerY = (this.state.marqueeStart.y + this.state.marqueeEnd.y) / 2;
			this.stepZoom({ x: centerX, y: centerY }, 'in', vp);
			return;
		}

		// Convert marquee to document space dimensions
		const docMarqueeWidth = marqueeWidth / vp.zoom;
		const docMarqueeHeight = marqueeHeight / vp.zoom;

		// Safety check for valid dimensions
		if (docMarqueeWidth <= 0 || docMarqueeHeight <= 0 || !isFinite(docMarqueeWidth) || !isFinite(docMarqueeHeight)) {
			return;
		}

		// Calculate zoom level to fit marquee in viewport
		const scaleX = vp.width / docMarqueeWidth;
		const scaleY = vp.height / docMarqueeHeight;
		const rawZoom = Math.min(scaleX, scaleY) * 0.9; // 90% to add padding
		const newZoom = Math.max(ZOOM_STEPS[0], Math.min(rawZoom, ZOOM_STEPS[ZOOM_STEPS.length - 1]));

		// Safety check for valid zoom
		if (!isFinite(newZoom) || newZoom <= 0) {
			return;
		}

		// Marquee center in canvas space
		const marqueeCenterCanvasX = (this.state.marqueeStart.x + this.state.marqueeEnd.x) / 2;
		const marqueeCenterCanvasY = (this.state.marqueeStart.y + this.state.marqueeEnd.y) / 2;

		// Convert marquee center from canvas space to document space
		const docCenterX = (marqueeCenterCanvasX - vp.x) / vp.zoom;
		const docCenterY = (marqueeCenterCanvasY - vp.y) / vp.zoom;

		// Position viewport so docCenter appears at viewport center after zoom
		const viewportCenterX = vp.width / 2;
		const viewportCenterY = vp.height / 2;
		const newX = viewportCenterX - docCenterX * newZoom;
		const newY = viewportCenterY - docCenterY * newZoom;

		updateViewport((v) => ({
			...v,
			zoom: newZoom,
			x: newX,
			y: newY
		}));
	}

	/**
	 * Find the nearest zoom step index for current zoom level
	 */
	private findNearestZoomIndex(zoom: number): number {
		let nearestIndex = 0;
		let minDiff = Math.abs(ZOOM_STEPS[0] - zoom);

		for (let i = 1; i < ZOOM_STEPS.length; i++) {
			const diff = Math.abs(ZOOM_STEPS[i] - zoom);
			if (diff < minDiff) {
				minDiff = diff;
				nearestIndex = i;
			}
		}

		return nearestIndex;
	}

	/**
	 * Get the current marquee rectangle for rendering
	 */
	getMarqueeRect(): { x: number; y: number; width: number; height: number } | null {
		if (!this.state.isDrawingMarquee || !this.state.marqueeStart || !this.state.marqueeEnd) {
			return null;
		}
		return {
			x: Math.min(this.state.marqueeStart.x, this.state.marqueeEnd.x),
			y: Math.min(this.state.marqueeStart.y, this.state.marqueeEnd.y),
			width: Math.abs(this.state.marqueeEnd.x - this.state.marqueeStart.x),
			height: Math.abs(this.state.marqueeEnd.y - this.state.marqueeStart.y)
		};
	}

	/**
	 * Check if currently in marquee drawing mode
	 */
	get isDrawingMarquee(): boolean {
		return this.state.isDrawingMarquee;
	}

	/**
	 * Check if zoom interaction is active
	 */
	get isActive(): boolean {
		return this.state.isActive;
	}

	/**
	 * Programmatically step zoom in or out, centered on viewport
	 */
	stepZoomCenter(direction: 'in' | 'out'): void {
		const vp = get(viewport);
		const centerX = vp.width / 2;
		const centerY = vp.height / 2;

		const currentZoom = vp.zoom;
		const currentIndex = this.findNearestZoomIndex(currentZoom);
		const newIndex =
			direction === 'in'
				? Math.min(currentIndex + 1, ZOOM_STEPS.length - 1)
				: Math.max(currentIndex - 1, 0);
		const newZoom = ZOOM_STEPS[newIndex];

		if (newZoom === currentZoom) return;

		// Zoom centered on viewport center
		updateViewport((v) => ({
			...v,
			zoom: newZoom,
			x: centerX - (centerX - v.x) * (newZoom / currentZoom),
			y: centerY - (centerY - v.y) * (newZoom / currentZoom)
		}));
	}
}

export const zoomEngine = new ZoomEngine();
