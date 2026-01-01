import { writable, derived, get } from 'svelte/store';
import type { Document, Layer, Selection, Viewport } from '$lib/types/document';
import * as tauri from '$lib/services/tauri';

// ============ Types ============

interface LayerBuffer {
	data: Uint8ClampedArray;
	width: number;
	height: number;
	dirty: boolean;
}

export interface DocumentState {
	document: Document;
	isDirty: boolean;
	activeLayerId: string | null;
	layerPixelBuffers: Map<string, LayerBuffer>;
	viewport: Viewport;
	selection: Selection;
}

// ============ Primary Stores ============

// Map of all open documents by ID
export const openDocuments = writable<Map<string, DocumentState>>(new Map());

// Currently active document ID
export const activeDocumentId = writable<string | null>(null);

// Order of document tabs (for tab bar display)
export const documentOrder = writable<string[]>([]);

// Global loading state
export const isLoading = writable<boolean>(false);

// Global error state
export const error = writable<string | null>(null);

// ============ Derived Stores (Backwards Compatibility) ============

// Current document state (all state for the active document)
export const activeDocumentState = derived(
	[openDocuments, activeDocumentId],
	([$docs, $activeId]) => ($activeId ? $docs.get($activeId) ?? null : null)
);

// Current document (for backwards compatibility with existing components)
export const document = derived(activeDocumentState, ($state) => $state?.document ?? null);

// Current active layer ID
export const activeLayerId = derived(
	activeDocumentState,
	($state) => $state?.activeLayerId ?? null
);

// Current selection
export const selection = derived(
	activeDocumentState,
	($state) => $state?.selection ?? { type: 'none' as const, feather: 0 }
);

// Current viewport
export const viewport = derived(
	activeDocumentState,
	($state) => $state?.viewport ?? { x: 0, y: 0, zoom: 1, width: 0, height: 0 }
);

// Current dirty state
export const isDirty = derived(activeDocumentState, ($state) => $state?.isDirty ?? false);

// Current layer pixel buffers
export const layerPixelBuffers = derived(
	activeDocumentState,
	($state) => $state?.layerPixelBuffers ?? new Map()
);

// Derived ImageData cache for rendering
export const layerPixelCache = derived(layerPixelBuffers, ($buffers) => {
	const cache = new Map<string, ImageData>();
	for (const [layerId, buffer] of $buffers) {
		const dataCopy = new Uint8ClampedArray(buffer.data);
		cache.set(layerId, new ImageData(dataCopy, buffer.width, buffer.height));
	}
	return cache;
});

// Current active layer
export const activeLayer = derived([document, activeLayerId], ([$document, $activeLayerId]) => {
	if (!$document || !$activeLayerId) return null;
	return $document.layers.find((l) => l.id === $activeLayerId) ?? null;
});

// Visible layers in current document
export const visibleLayers = derived(
	document,
	($document) => $document?.layers.filter((l) => l.visible) ?? []
);

// Whether current document has a selection
export const hasSelection = derived(selection, ($selection) => $selection.type !== 'none');

// ============ Internal Helpers ============

function createDefaultDocumentState(doc: Document): DocumentState {
	return {
		document: doc,
		isDirty: false,
		activeLayerId: doc.layers[0]?.id ?? null,
		layerPixelBuffers: new Map(),
		viewport: { x: 0, y: 0, zoom: 1, width: 0, height: 0 },
		selection: { type: 'none', feather: 0 }
	};
}

function updateDocumentState(
	docId: string,
	updater: (state: DocumentState) => DocumentState
): void {
	openDocuments.update((docs) => {
		const state = docs.get(docId);
		if (state) {
			docs.set(docId, updater(state));
		}
		return new Map(docs);
	});
}

async function loadLayerPixelsForDocument(doc: Document): Promise<Map<string, LayerBuffer>> {
	const buffers = new Map<string, LayerBuffer>();

	for (const layer of doc.layers) {
		try {
			const pixels = await tauri.getLayerPixels(layer.id);
			const data = new Uint8ClampedArray(pixels);
			buffers.set(layer.id, {
				data,
				width: layer.width,
				height: layer.height,
				dirty: false
			});
		} catch (e) {
			console.error(`Failed to load pixels for layer ${layer.id}:`, e);
		}
	}

	return buffers;
}

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
		const state = createDefaultDocumentState(doc);

		// Load pixel data for the background layer
		state.layerPixelBuffers = await loadLayerPixelsForDocument(doc);

		// Add to open documents
		openDocuments.update((docs) => {
			docs.set(doc.id, state);
			return new Map(docs);
		});

		// Add to tab order and make active
		documentOrder.update((order) => [...order, doc.id]);
		activeDocumentId.set(doc.id);
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

		if (tauri.isDrkrFile(path)) {
			doc = await tauri.openDocumentDrkr(path);
		} else {
			doc = await tauri.openDocument(path);
		}

		// Check if this document is already open
		const existingDocs = get(openDocuments);
		if (existingDocs.has(doc.id)) {
			// Just switch to the existing document
			activeDocumentId.set(doc.id);
			return;
		}

		const state = createDefaultDocumentState(doc);
		state.layerPixelBuffers = await loadLayerPixelsForDocument(doc);

		// Add to open documents
		openDocuments.update((docs) => {
			docs.set(doc.id, state);
			return new Map(docs);
		});

		// Add to tab order and make active
		documentOrder.update((order) => [...order, doc.id]);
		activeDocumentId.set(doc.id);
	} catch (e) {
		error.set(e instanceof Error ? e.message : String(e));
		throw e;
	} finally {
		isLoading.set(false);
	}
}

export async function saveDocument(docId?: string): Promise<boolean> {
	const targetId = docId ?? get(activeDocumentId);
	if (!targetId) return false;

	const docs = get(openDocuments);
	const state = docs.get(targetId);
	if (!state) return false;

	const doc = state.document;

	// If document has a source path, save to that path
	if (doc.sourcePath && tauri.isDrkrFile(doc.sourcePath)) {
		isLoading.set(true);
		error.set(null);

		try {
			const updatedDoc = await tauri.saveDocumentDrkr(doc.id, doc.sourcePath);

			// Update document state
			updateDocumentState(targetId, (s) => ({
				...s,
				document: updatedDoc,
				isDirty: false
			}));

			return true;
		} catch (e) {
			error.set(e instanceof Error ? e.message : String(e));
			throw e;
		} finally {
			isLoading.set(false);
		}
	}

	// No source path, fall back to Save As
	return saveDocumentAs(targetId);
}

export async function saveDocumentAs(docId?: string): Promise<boolean> {
	const targetId = docId ?? get(activeDocumentId);
	if (!targetId) return false;

	const docs = get(openDocuments);
	const state = docs.get(targetId);
	if (!state) return false;

	const doc = state.document;
	const defaultName = doc.name.includes('.') ? doc.name : `${doc.name}.drkr`;
	const path = await tauri.showSaveDialog(defaultName);
	if (!path) return false;

	isLoading.set(true);
	error.set(null);

	try {
		let updatedDoc: Document;

		if (tauri.isDrkrFile(path)) {
			updatedDoc = await tauri.saveDocumentDrkr(doc.id, path);
		} else {
			await tauri.saveDocument(doc.id, path);
			// For non-DRKR formats, update the path manually
			updatedDoc = await tauri.setDocumentPath(doc.id, path);
		}

		// Update document state
		updateDocumentState(targetId, (s) => ({
			...s,
			document: updatedDoc,
			isDirty: false
		}));

		return true;
	} catch (e) {
		error.set(e instanceof Error ? e.message : String(e));
		throw e;
	} finally {
		isLoading.set(false);
	}
}

export async function closeDocument(docId?: string, force: boolean = false): Promise<boolean> {
	const targetId = docId ?? get(activeDocumentId);
	if (!targetId) return true;

	const docs = get(openDocuments);
	const state = docs.get(targetId);
	if (!state) return true;

	// Check for unsaved changes
	if (state.isDirty && !force) {
		const result = await tauri.showUnsavedChangesDialog(state.document.name);

		if (result === 'save') {
			const saved = await saveDocument(targetId);
			if (!saved) return false; // Save was cancelled
		}
		// 'discard' continues with close, 'cancel' would need a different dialog
	}

	try {
		await tauri.closeDocument(targetId);
	} catch (e) {
		console.error('Failed to close document on backend:', e);
	}

	// Remove from stores
	openDocuments.update((docs) => {
		docs.delete(targetId);
		return new Map(docs);
	});

	documentOrder.update((order) => order.filter((id) => id !== targetId));

	// Switch to another document if this was active
	if (get(activeDocumentId) === targetId) {
		const order = get(documentOrder);
		activeDocumentId.set(order[order.length - 1] ?? null);
	}

	return true;
}

export async function closeAllDocuments(): Promise<boolean> {
	const order = get(documentOrder);

	for (const docId of [...order]) {
		const closed = await closeDocument(docId);
		if (!closed) return false; // User cancelled
	}

	return true;
}

// ============ Tab Management ============

export function switchToDocument(docId: string): void {
	const docs = get(openDocuments);
	if (docs.has(docId)) {
		activeDocumentId.set(docId);
	}
}

export function reorderTabs(fromIndex: number, toIndex: number): void {
	documentOrder.update((order) => {
		if (fromIndex < 0 || fromIndex >= order.length) return order;
		if (toIndex < 0 || toIndex >= order.length) return order;

		const newOrder = [...order];
		const [moved] = newOrder.splice(fromIndex, 1);
		newOrder.splice(toIndex, 0, moved);
		return newOrder;
	});
}

// ============ Layer Actions ============

export async function loadLayerPixels(
	layerId: string,
	width: number,
	height: number
): Promise<ImageData | null> {
	const docId = get(activeDocumentId);
	if (!docId) return null;

	try {
		const pixels = await tauri.getLayerPixels(layerId);
		const data = new Uint8ClampedArray(pixels);

		updateDocumentState(docId, (state) => {
			state.layerPixelBuffers.set(layerId, { data, width, height, dirty: false });
			return { ...state, layerPixelBuffers: new Map(state.layerPixelBuffers) };
		});

		return new ImageData(data, width, height);
	} catch (e) {
		console.error('Failed to load layer pixels:', e);
		return null;
	}
}

export function getLayerBuffer(layerId: string): LayerBuffer | undefined {
	const state = get(activeDocumentState);
	return state?.layerPixelBuffers.get(layerId);
}

export function markLayerDirty(layerId: string): void {
	const docId = get(activeDocumentId);
	if (!docId) return;

	updateDocumentState(docId, (state) => {
		const buffer = state.layerPixelBuffers.get(layerId);
		if (buffer) {
			buffer.dirty = true;
		}
		return {
			...state,
			isDirty: true,
			layerPixelBuffers: new Map(state.layerPixelBuffers)
		};
	});
}

export async function addNewLayer(name: string = 'New Layer'): Promise<void> {
	const docId = get(activeDocumentId);
	const state = get(activeDocumentState);
	if (!docId || !state) return;

	try {
		const layer = await tauri.addLayer(docId, name);

		updateDocumentState(docId, (s) => {
			// Add layer to document
			const updatedDoc = { ...s.document, layers: [...s.document.layers, layer] };

			// Create empty buffer for new layer
			const emptyData = new Uint8ClampedArray(layer.width * layer.height * 4);
			s.layerPixelBuffers.set(layer.id, {
				data: emptyData,
				width: layer.width,
				height: layer.height,
				dirty: false
			});

			return {
				...s,
				document: updatedDoc,
				activeLayerId: layer.id,
				isDirty: true,
				layerPixelBuffers: new Map(s.layerPixelBuffers)
			};
		});
	} catch (e) {
		error.set(e instanceof Error ? e.message : String(e));
	}
}

export async function deleteLayer(layerId: string): Promise<void> {
	const docId = get(activeDocumentId);
	const state = get(activeDocumentState);
	if (!docId || !state) return;

	// Don't allow deleting the last layer
	if (state.document.layers.length <= 1) {
		error.set('Cannot delete the last layer');
		return;
	}

	try {
		await tauri.removeLayer(docId, layerId);

		updateDocumentState(docId, (s) => {
			// Remove layer from document
			const updatedLayers = s.document.layers.filter((l) => l.id !== layerId);
			const updatedDoc = { ...s.document, layers: updatedLayers };

			// Remove from pixel buffers
			s.layerPixelBuffers.delete(layerId);

			// Select another layer if this was active
			let newActiveLayerId = s.activeLayerId;
			if (s.activeLayerId === layerId) {
				newActiveLayerId = updatedLayers[updatedLayers.length - 1]?.id ?? null;
			}

			return {
				...s,
				document: updatedDoc,
				activeLayerId: newActiveLayerId,
				isDirty: true,
				layerPixelBuffers: new Map(s.layerPixelBuffers)
			};
		});
	} catch (e) {
		error.set(e instanceof Error ? e.message : String(e));
	}
}

export async function updateLayerProperty(
	layerId: string,
	updates: tauri.LayerUpdate
): Promise<void> {
	const docId = get(activeDocumentId);
	const state = get(activeDocumentState);
	if (!docId || !state) return;

	try {
		const updatedLayer = await tauri.updateLayer(docId, layerId, updates);

		updateDocumentState(docId, (s) => {
			const updatedLayers = s.document.layers.map((l) =>
				l.id === layerId ? updatedLayer : l
			);
			return {
				...s,
				document: { ...s.document, layers: updatedLayers },
				isDirty: true
			};
		});
	} catch (e) {
		error.set(e instanceof Error ? e.message : String(e));
	}
}

export function setActiveLayer(layerId: string | null): void {
	const docId = get(activeDocumentId);
	if (!docId) return;

	updateDocumentState(docId, (state) => ({
		...state,
		activeLayerId: layerId
	}));
}

// ============ Selection Actions ============

export function clearSelection(): void {
	const docId = get(activeDocumentId);
	if (!docId) return;

	updateDocumentState(docId, (state) => ({
		...state,
		selection: { type: 'none', feather: 0 }
	}));
}

// ============ Viewport Actions ============

export function setViewportSize(width: number, height: number): void {
	const docId = get(activeDocumentId);
	if (!docId) return;

	updateDocumentState(docId, (state) => ({
		...state,
		viewport: { ...state.viewport, width, height }
	}));
}

// Direct viewport update for Canvas component
export function updateViewport(
	updater: (vp: Viewport) => Viewport
): void {
	const docId = get(activeDocumentId);
	if (!docId) return;

	updateDocumentState(docId, (state) => ({
		...state,
		viewport: updater(state.viewport)
	}));
}

export function setZoom(zoom: number): void {
	const docId = get(activeDocumentId);
	if (!docId) return;

	updateDocumentState(docId, (state) => ({
		...state,
		viewport: { ...state.viewport, zoom: Math.max(0.1, Math.min(32, zoom)) }
	}));
}

export function pan(dx: number, dy: number): void {
	const docId = get(activeDocumentId);
	if (!docId) return;

	updateDocumentState(docId, (state) => ({
		...state,
		viewport: {
			...state.viewport,
			x: state.viewport.x + dx,
			y: state.viewport.y + dy
		}
	}));
}

export function resetViewport(): void {
	const docId = get(activeDocumentId);
	if (!docId) return;

	updateDocumentState(docId, (state) => ({
		...state,
		viewport: { ...state.viewport, x: 0, y: 0, zoom: 1 }
	}));
}

export function fitToScreen(): void {
	const docId = get(activeDocumentId);
	const state = get(activeDocumentState);
	if (!docId || !state) return;

	const doc = state.document;
	const vp = state.viewport;
	if (!vp.width || !vp.height) return;

	const scaleX = vp.width / doc.width;
	const scaleY = vp.height / doc.height;
	const zoom = Math.min(scaleX, scaleY) * 0.9;

	updateDocumentState(docId, (s) => ({
		...s,
		viewport: {
			...s.viewport,
			zoom,
			x: (vp.width - doc.width * zoom) / 2,
			y: (vp.height - doc.height * zoom) / 2
		}
	}));
}

// ============ Local Pixel Manipulation ============

export interface BrushStampParams {
	x: number;
	y: number;
	size: number;
	hardness: number;
	opacity: number;
	flow: number;
	color: { r: number; g: number; b: number; a: number };
	isEraser: boolean;
}

export function applyBrushStampLocal(layerId: string, params: BrushStampParams): void {
	const state = get(activeDocumentState);
	if (!state) return;

	const buffer = state.layerPixelBuffers.get(layerId);
	if (!buffer) return;

	const { data, width, height } = buffer;
	const { x, y, size, hardness, opacity, flow, color, isEraser } = params;

	const radius = size / 2;
	const baseOpacity = (opacity / 100) * (flow / 100);
	const hardnessFactor = hardness / 100;
	const innerRadius = radius * hardnessFactor;
	const falloffRange = radius - innerRadius;

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

			let alpha: number;
			if (dist <= innerRadius) {
				alpha = baseOpacity;
			} else if (falloffRange > 0) {
				const falloff = 1 - (dist - innerRadius) / falloffRange;
				alpha = baseOpacity * falloff * falloff;
			} else {
				alpha = baseOpacity;
			}

			if (alpha <= 0) continue;

			const idx = (py * width + px) * 4;

			if (isEraser) {
				const currentAlpha = data[idx + 3] / 255;
				const newAlpha = Math.max(0, currentAlpha * (1 - alpha));
				data[idx + 3] = Math.round(newAlpha * 255);
			} else {
				blendPixel(data, idx, color.r, color.g, color.b, Math.round(alpha * color.a * 255));
			}
		}
	}
}

function blendPixel(
	data: Uint8ClampedArray,
	idx: number,
	srcR: number,
	srcG: number,
	srcB: number,
	srcA: number
): void {
	if (srcA === 0) return;

	const srcAlpha = srcA / 255;
	const dstAlpha = data[idx + 3] / 255;

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
	markLayerDirty(layerId);
}

// ============ Error Handling ============

export function clearError(): void {
	error.set(null);
}

// ============ Utility ============

export function getDocumentCount(): number {
	return get(openDocuments).size;
}

export function hasUnsavedDocuments(): boolean {
	const docs = get(openDocuments);
	for (const state of docs.values()) {
		if (state.isDirty) return true;
	}
	return false;
}
