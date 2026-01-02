/**
 * Filter Engine
 *
 * Handles applying filters to layers with GPU acceleration when available.
 * Falls back to Rust backend when WebGL is not supported.
 */

import { get } from 'svelte/store';
import { activeDocumentState, layerPixelBuffers, markLayerDirty } from '$lib/stores/documents';
import { applyWebGLFilter } from './webglFilters';
import * as tauri from '$lib/services/tauri';
import type { FilterParams } from '$lib/services/tauri';

export interface FilterResult {
	success: boolean;
	error?: string;
	usedGPU: boolean;
}

/**
 * Apply a filter to a layer, using WebGL acceleration when available.
 */
export async function applyFilter(
	docId: string,
	layerId: string,
	filter: FilterParams
): Promise<FilterResult> {
	const state = get(activeDocumentState);
	if (!state) {
		return { success: false, error: 'No active document', usedGPU: false };
	}

	const buffer = state.layerPixelBuffers.get(layerId);
	if (!buffer) {
		return { success: false, error: 'Layer not found', usedGPU: false };
	}

	// Try WebGL acceleration first
	const webglResult = tryWebGLFilter(buffer.data, buffer.width, buffer.height, filter);

	if (webglResult) {
		// WebGL succeeded - update the buffer with the result
		buffer.data.set(webglResult);
		markLayerDirty(layerId);

		return { success: true, usedGPU: true };
	}

	// Fall back to Rust backend
	try {
		// Sync current pixels to backend first
		await tauri.setLayerPixelsBase64(layerId, buffer.data);

		// Apply filter on backend
		const result = await tauri.applyFilter(docId, layerId, filter);

		if (result.success) {
			// Fetch updated pixels back from backend
			const pixels = await tauri.getLayerPixelsBase64(layerId);
			buffer.data.set(pixels);
			markLayerDirty(layerId);
		}

		return { success: result.success, usedGPU: false };
	} catch (e) {
		return {
			success: false,
			error: e instanceof Error ? e.message : String(e),
			usedGPU: false
		};
	}
}

/**
 * Try to apply a filter using WebGL.
 * Returns the filtered pixels or null if WebGL is not available.
 */
function tryWebGLFilter(
	pixels: Uint8ClampedArray,
	width: number,
	height: number,
	filter: FilterParams
): Uint8ClampedArray | null {
	// Convert tauri filter params to WebGL filter params
	switch (filter.type) {
		case 'brightness':
			return applyWebGLFilter(pixels, width, height, { brightness: filter.value });

		case 'contrast':
			return applyWebGLFilter(pixels, width, height, { contrast: filter.value });

		case 'saturation':
			return applyWebGLFilter(pixels, width, height, { saturation: filter.value });

		case 'gaussianBlur':
			return applyWebGLFilter(pixels, width, height, { blur: filter.radius });

		case 'invert':
			return applyWebGLFilter(pixels, width, height, { invert: true });

		case 'grayscale':
			return applyWebGLFilter(pixels, width, height, { grayscale: true });

		default:
			// Unsupported filter type for WebGL
			return null;
	}
}

/**
 * Check if GPU-accelerated filters are available.
 */
export function isGPUFilteringAvailable(): boolean {
	if (typeof window === 'undefined') return false;

	const canvas = document.createElement('canvas');
	return !!canvas.getContext('webgl');
}

/**
 * Apply multiple filters in sequence.
 * This is more efficient than applying filters one at a time
 * as it reduces GPU/CPU round trips.
 */
export async function applyFiltersChain(
	docId: string,
	layerId: string,
	filters: FilterParams[]
): Promise<FilterResult> {
	const state = get(activeDocumentState);
	if (!state) {
		return { success: false, error: 'No active document', usedGPU: false };
	}

	const buffer = state.layerPixelBuffers.get(layerId);
	if (!buffer) {
		return { success: false, error: 'Layer not found', usedGPU: false };
	}

	// Try to apply all filters using WebGL
	let currentPixels = buffer.data;
	let allWebGL = true;

	for (const filter of filters) {
		const result = tryWebGLFilter(currentPixels, buffer.width, buffer.height, filter);

		if (result) {
			currentPixels = result;
		} else {
			allWebGL = false;
			break;
		}
	}

	if (allWebGL) {
		// All filters were applied with WebGL
		buffer.data.set(currentPixels);
		markLayerDirty(layerId);
		return { success: true, usedGPU: true };
	}

	// Fall back to applying filters one by one through the backend
	for (const filter of filters) {
		const result = await applyFilter(docId, layerId, filter);
		if (!result.success) {
			return result;
		}
	}

	return { success: true, usedGPU: false };
}
