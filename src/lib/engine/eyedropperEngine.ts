import { get } from 'svelte/store';
import { setForegroundColor, setBackgroundColor } from '$lib/stores/tools';
import { activeDocumentState, layerPixelCache, activeLayerId } from '$lib/stores/documents';
import type { Viewport, Layer } from '$lib/types/document';

interface SampleOptions {
	setBackground?: boolean; // Alt+click sets background color
	activeLayerOnly?: boolean; // Ctrl+click samples active layer only
}

interface SampledColor {
	r: number;
	g: number;
	b: number;
	a: number;
}

class EyedropperEngine {
	/**
	 * Sample a color from the canvas at the given canvas coordinates.
	 * Returns the sampled color or null if no color was found.
	 */
	sampleColor(
		canvasPoint: { x: number; y: number },
		viewport: Viewport,
		options: SampleOptions = {}
	): SampledColor | null {
		const state = get(activeDocumentState);
		if (!state) return null;

		const cache = get(layerPixelCache);
		const { document: doc } = state;
		const activeLayer = get(activeLayerId);

		// Convert to document coordinates
		const docX = (canvasPoint.x - viewport.x) / viewport.zoom;
		const docY = (canvasPoint.y - viewport.y) / viewport.zoom;

		// Check document bounds
		if (docX < 0 || docX >= doc.width || docY < 0 || docY >= doc.height) {
			return null;
		}

		// Get layers to sample (either all visible or active only)
		let layersToSample = doc.layers.filter((l) => l.visible);
		if (options.activeLayerOnly && activeLayer) {
			layersToSample = layersToSample.filter((l) => l.id === activeLayer);
		}

		// Iterate from top to bottom (reverse order since last in array = top)
		for (let i = layersToSample.length - 1; i >= 0; i--) {
			const layer = layersToSample[i];
			const imageData = cache.get(layer.id);
			if (!imageData) continue;

			// Convert to layer-relative coordinates
			const layerX = Math.floor(docX - layer.x);
			const layerY = Math.floor(docY - layer.y);

			// Check layer bounds
			if (layerX < 0 || layerX >= layer.width || layerY < 0 || layerY >= layer.height) {
				continue;
			}

			// Get pixel
			const idx = (layerY * layer.width + layerX) * 4;
			const r = imageData.data[idx];
			const g = imageData.data[idx + 1];
			const b = imageData.data[idx + 2];
			const a = imageData.data[idx + 3];

			// Skip fully transparent pixels (continue to layer below)
			if (a === 0) continue;

			const color: SampledColor = { r, g, b, a: a / 255 };

			// Set color in store
			if (options.setBackground) {
				setBackgroundColor(color);
			} else {
				setForegroundColor(color);
			}

			return color;
		}

		return null;
	}

	/**
	 * Preview sample (for hover display) - doesn't set color in store
	 */
	previewColor(
		canvasPoint: { x: number; y: number },
		viewport: Viewport
	): SampledColor | null {
		const state = get(activeDocumentState);
		if (!state) return null;

		const cache = get(layerPixelCache);
		const { document: doc } = state;

		// Convert to document coordinates
		const docX = (canvasPoint.x - viewport.x) / viewport.zoom;
		const docY = (canvasPoint.y - viewport.y) / viewport.zoom;

		// Check document bounds
		if (docX < 0 || docX >= doc.width || docY < 0 || docY >= doc.height) {
			return null;
		}

		// Get visible layers
		const visibleLayers = doc.layers.filter((l) => l.visible);

		// Iterate from top to bottom
		for (let i = visibleLayers.length - 1; i >= 0; i--) {
			const layer = visibleLayers[i];
			const imageData = cache.get(layer.id);
			if (!imageData) continue;

			const layerX = Math.floor(docX - layer.x);
			const layerY = Math.floor(docY - layer.y);

			if (layerX < 0 || layerX >= layer.width || layerY < 0 || layerY >= layer.height) {
				continue;
			}

			const idx = (layerY * layer.width + layerX) * 4;
			const r = imageData.data[idx];
			const g = imageData.data[idx + 1];
			const b = imageData.data[idx + 2];
			const a = imageData.data[idx + 3];

			if (a === 0) continue;

			return { r, g, b, a: a / 255 };
		}

		return null;
	}
}

export const eyedropperEngine = new EyedropperEngine();
