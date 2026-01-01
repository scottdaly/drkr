import { writable, derived, get } from 'svelte/store';
import type { Document, Layer, Selection, Viewport } from '$lib/types/document';
import * as tauri from '$lib/services/tauri';

// Core document state
export const document = writable<Document | null>(null);
export const activeLayerId = writable<string | null>(null);
export const selection = writable<Selection>({ type: 'none', feather: 0 });

// Viewport state
export const viewport = writable<Viewport>({
	x: 0,
	y: 0,
	zoom: 1,
	width: 0,
	height: 0
});

// Loading/error state
export const isLoading = writable<boolean>(false);
export const error = writable<string | null>(null);

// Derived state (automatically updates when dependencies change)
export const activeLayer = derived([document, activeLayerId], ([$document, $activeLayerId]) => {
	if (!$document || !$activeLayerId) return null;
	return $document.layers.find((l) => l.id === $activeLayerId) ?? null;
});

export const visibleLayers = derived(
	document,
	($document) => $document?.layers.filter((l) => l.visible) ?? []
);

export const hasSelection = derived(selection, ($selection) => $selection.type !== 'none');

// Document dirty state
export const isDirty = writable<boolean>(false);

// Layer pixel data - mutable buffers for local editing
// We store raw Uint8ClampedArray for direct manipulation
interface LayerBuffer {
	data: Uint8ClampedArray;
	width: number;
	height: number;
	dirty: boolean; // true if local changes haven't been synced to backend
}
export const layerPixelBuffers = writable<Map<string, LayerBuffer>>(new Map());

// Derived ImageData cache for rendering (created from buffers)
export const layerPixelCache = derived(layerPixelBuffers, ($buffers) => {
	const cache = new Map<string, ImageData>();
	for (const [layerId, buffer] of $buffers) {
		// Create a new Uint8ClampedArray to ensure proper typing for ImageData
		const dataCopy = new Uint8ClampedArray(buffer.data);
		cache.set(layerId, new ImageData(dataCopy, buffer.width, buffer.height));
	}
	return cache;
});

// ============ Document Actions ============

export async function createNewDocument(
	name: string,
	width: number,
	height: number,
	resolution: number = 72
): Promise<void> {
	isLoading.set(true);
	error.set(null);

	try {
		const doc = await tauri.createDocument({ name, width, height, resolution });
		document.set(doc);

		// Set the first layer as active
		if (doc.layers.length > 0) {
			activeLayerId.set(doc.layers[0].id);
			// Load pixel data for the first layer
			await loadLayerPixels(doc.layers[0].id, width, height);
		}

		isDirty.set(false);
		resetViewport();
	} catch (e) {
		error.set(e instanceof Error ? e.message : String(e));
		throw e;
	} finally {
		isLoading.set(false);
	}
}

export async function openDocumentFromFile(): Promise<void> {
	const path = await tauri.showOpenDialog();
	if (!path) return;

	isLoading.set(true);
	error.set(null);

	try {
		let doc: Document;

		// Use DRKR reader for .drkr files, otherwise use image reader
		if (tauri.isDrkrFile(path)) {
			doc = await tauri.openDocumentDrkr(path);
		} else {
			doc = await tauri.openDocument(path);
		}

		document.set(doc);

		// Load pixel data for all layers
		for (const layer of doc.layers) {
			await loadLayerPixels(layer.id, layer.width, layer.height);
		}

		// Set the first layer as active
		if (doc.layers.length > 0) {
			activeLayerId.set(doc.layers[0].id);
		}

		isDirty.set(false);
		resetViewport();
	} catch (e) {
		error.set(e instanceof Error ? e.message : String(e));
		throw e;
	} finally {
		isLoading.set(false);
	}
}

export async function saveDocumentAs(): Promise<void> {
	const doc = get(document);
	if (!doc) return;

	// Default to saving as .drkr if no extension in name
	const defaultName = doc.name.includes('.') ? doc.name : `${doc.name}.drkr`;
	const path = await tauri.showSaveDialog(defaultName);
	if (!path) return;

	isLoading.set(true);
	error.set(null);

	try {
		// Use DRKR format for .drkr files, otherwise export as image
		if (tauri.isDrkrFile(path)) {
			await tauri.saveDocumentDrkr(doc.id, path);
		} else {
			await tauri.saveDocument(doc.id, path);
		}
		isDirty.set(false);
	} catch (e) {
		error.set(e instanceof Error ? e.message : String(e));
		throw e;
	} finally {
		isLoading.set(false);
	}
}

export async function closeCurrentDocument(): Promise<void> {
	const doc = get(document);
	if (!doc) return;

	try {
		await tauri.closeDocument(doc.id);
		document.set(null);
		activeLayerId.set(null);
		layerPixelBuffers.set(new Map());
		isDirty.set(false);
	} catch (e) {
		error.set(e instanceof Error ? e.message : String(e));
	}
}

// ============ Layer Actions ============

export async function loadLayerPixels(layerId: string, width: number, height: number): Promise<ImageData | null> {
	try {
		const pixels = await tauri.getLayerPixels(layerId);
		const data = new Uint8ClampedArray(pixels);

		layerPixelBuffers.update((buffers) => {
			buffers.set(layerId, { data, width, height, dirty: false });
			return buffers;
		});

		return new ImageData(data, width, height);
	} catch (e) {
		console.error('Failed to load layer pixels:', e);
		return null;
	}
}

// Get mutable access to a layer's pixel buffer
export function getLayerBuffer(layerId: string): LayerBuffer | undefined {
	return get(layerPixelBuffers).get(layerId);
}

// Mark a layer buffer as modified (for rendering updates)
export function markLayerDirty(layerId: string): void {
	layerPixelBuffers.update((buffers) => {
		const buffer = buffers.get(layerId);
		if (buffer) {
			buffer.dirty = true;
			// Force reactivity by creating new map
			return new Map(buffers);
		}
		return buffers;
	});
}

export async function addNewLayer(name: string = 'New Layer'): Promise<void> {
	const doc = get(document);
	if (!doc) return;

	try {
		const layer = await tauri.addLayer(doc.id, name);

		document.update((d) => {
			if (!d) return d;
			return { ...d, layers: [...d.layers, layer] };
		});

		activeLayerId.set(layer.id);
		isDirty.set(true);

		// Create empty (transparent) buffer locally - no need to fetch from backend
		// New layers are always transparent, so we just create a zeroed buffer
		const emptyData = new Uint8ClampedArray(layer.width * layer.height * 4);
		layerPixelBuffers.update((buffers) => {
			buffers.set(layer.id, {
				data: emptyData,
				width: layer.width,
				height: layer.height,
				dirty: false
			});
			return new Map(buffers); // Force reactivity
		});
	} catch (e) {
		error.set(e instanceof Error ? e.message : String(e));
	}
}

export async function deleteLayer(layerId: string): Promise<void> {
	const doc = get(document);
	if (!doc) return;

	// Don't allow deleting the last layer
	if (doc.layers.length <= 1) {
		error.set('Cannot delete the last layer');
		return;
	}

	try {
		await tauri.removeLayer(doc.id, layerId);

		document.update((d) => {
			if (!d) return d;
			return { ...d, layers: d.layers.filter((l) => l.id !== layerId) };
		});

		// Clear from pixel buffers
		layerPixelBuffers.update((buffers) => {
			buffers.delete(layerId);
			return buffers;
		});

		// If we deleted the active layer, select another
		if (get(activeLayerId) === layerId) {
			const remaining = get(document)?.layers;
			if (remaining && remaining.length > 0) {
				activeLayerId.set(remaining[remaining.length - 1].id);
			}
		}

		isDirty.set(true);
	} catch (e) {
		error.set(e instanceof Error ? e.message : String(e));
	}
}

export async function updateLayerProperty(
	layerId: string,
	updates: tauri.LayerUpdate
): Promise<void> {
	const doc = get(document);
	if (!doc) return;

	try {
		const updatedLayer = await tauri.updateLayer(doc.id, layerId, updates);

		document.update((d) => {
			if (!d) return d;
			return {
				...d,
				layers: d.layers.map((l) => (l.id === layerId ? updatedLayer : l))
			};
		});

		isDirty.set(true);
	} catch (e) {
		error.set(e instanceof Error ? e.message : String(e));
	}
}

export function setActiveLayer(id: string | null): void {
	activeLayerId.set(id);
}

// ============ Selection Actions ============

export function clearSelection(): void {
	selection.set({ type: 'none', feather: 0 });
}

// ============ Viewport Actions ============

export function setZoom(zoom: number): void {
	viewport.update((vp) => ({ ...vp, zoom: Math.max(0.1, Math.min(32, zoom)) }));
}

export function pan(dx: number, dy: number): void {
	viewport.update((vp) => ({ ...vp, x: vp.x + dx, y: vp.y + dy }));
}

export function resetViewport(): void {
	viewport.update((vp) => ({ ...vp, x: 0, y: 0, zoom: 1 }));
}

export function fitToScreen(): void {
	const doc = get(document);
	const vp = get(viewport);
	if (!doc || !vp.width || !vp.height) return;

	const scaleX = vp.width / doc.width;
	const scaleY = vp.height / doc.height;
	const zoom = Math.min(scaleX, scaleY) * 0.9; // 90% to leave some padding

	viewport.update((v) => ({
		...v,
		zoom,
		x: (vp.width - doc.width * zoom) / 2,
		y: (vp.height - doc.height * zoom) / 2
	}));
}

// ============ Local Pixel Manipulation ============

export interface BrushStampParams {
	x: number;
	y: number;
	size: number;
	hardness: number; // 0-100
	opacity: number; // 0-100
	flow: number; // 0-100
	color: { r: number; g: number; b: number; a: number };
	isEraser: boolean;
}

// Apply a brush stamp directly to the local pixel buffer (no backend call)
export function applyBrushStampLocal(layerId: string, params: BrushStampParams): void {
	const buffers = get(layerPixelBuffers);
	const buffer = buffers.get(layerId);
	if (!buffer) return;

	const { data, width, height } = buffer;
	const { x, y, size, hardness, opacity, flow, color, isEraser } = params;

	const radius = size / 2;
	const baseOpacity = (opacity / 100) * (flow / 100);
	const hardnessFactor = hardness / 100;
	const innerRadius = radius * hardnessFactor;
	const falloffRange = radius - innerRadius;

	// Calculate bounds
	const minX = Math.max(0, Math.floor(x - radius));
	const maxX = Math.min(width - 1, Math.ceil(x + radius));
	const minY = Math.max(0, Math.floor(y - radius));
	const maxY = Math.min(height - 1, Math.ceil(y + radius));

	for (let py = minY; py <= maxY; py++) {
		for (let px = minX; px <= maxX; px++) {
			const dx = px - x;
			const dy = py - y;
			const dist = Math.sqrt(dx * dx + dy * dy);

			if (dist > radius) continue;

			// Calculate opacity based on distance and hardness
			let alpha: number;
			if (dist <= innerRadius) {
				alpha = baseOpacity;
			} else if (falloffRange > 0) {
				const falloff = 1 - (dist - innerRadius) / falloffRange;
				alpha = baseOpacity * falloff * falloff; // Quadratic falloff
			} else {
				alpha = baseOpacity;
			}

			if (alpha <= 0) continue;

			const idx = (py * width + px) * 4;

			if (isEraser) {
				// Eraser: reduce alpha
				const currentAlpha = data[idx + 3] / 255;
				const newAlpha = Math.max(0, currentAlpha * (1 - alpha));
				data[idx + 3] = Math.round(newAlpha * 255);
			} else {
				// Normal brush: blend color using Porter-Duff "over"
				blendPixel(data, idx, color.r, color.g, color.b, Math.round(alpha * color.a * 255));
			}
		}
	}
}

function blendPixel(data: Uint8ClampedArray, idx: number, srcR: number, srcG: number, srcB: number, srcA: number): void {
	if (srcA === 0) return;

	const srcAlpha = srcA / 255;
	const dstAlpha = data[idx + 3] / 255;

	// Porter-Duff "over" compositing
	const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);

	if (outAlpha <= 0) {
		data[idx] = 0;
		data[idx + 1] = 0;
		data[idx + 2] = 0;
		data[idx + 3] = 0;
		return;
	}

	const srcRNorm = srcR / 255;
	const srcGNorm = srcG / 255;
	const srcBNorm = srcB / 255;
	const dstRNorm = data[idx] / 255;
	const dstGNorm = data[idx + 1] / 255;
	const dstBNorm = data[idx + 2] / 255;

	const outR = (srcRNorm * srcAlpha + dstRNorm * dstAlpha * (1 - srcAlpha)) / outAlpha;
	const outG = (srcGNorm * srcAlpha + dstGNorm * dstAlpha * (1 - srcAlpha)) / outAlpha;
	const outB = (srcBNorm * srcAlpha + dstBNorm * dstAlpha * (1 - srcAlpha)) / outAlpha;

	data[idx] = Math.round(Math.min(255, Math.max(0, outR * 255)));
	data[idx + 1] = Math.round(Math.min(255, Math.max(0, outG * 255)));
	data[idx + 2] = Math.round(Math.min(255, Math.max(0, outB * 255)));
	data[idx + 3] = Math.round(Math.min(255, Math.max(0, outAlpha * 255)));
}

// Apply multiple brush stamps (for a stroke segment)
export function applyBrushStrokLocal(
	layerId: string,
	points: { x: number; y: number }[],
	settings: { size: number; hardness: number; opacity: number; flow: number },
	color: { r: number; g: number; b: number; a: number },
	isEraser: boolean
): void {
	for (const point of points) {
		applyBrushStampLocal(layerId, {
			x: point.x,
			y: point.y,
			size: settings.size,
			hardness: settings.hardness,
			opacity: settings.opacity,
			flow: settings.flow,
			color,
			isEraser
		});
	}
	// Trigger reactivity update
	markLayerDirty(layerId);
}

// ============ Error Handling ============

export function clearError(): void {
	error.set(null);
}
