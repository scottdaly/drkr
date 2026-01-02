import { writable, derived, get } from 'svelte/store';
import type { Document, Layer, Selection, Viewport } from '$lib/types/document';
import * as tauri from '$lib/services/tauri';
import { addRecentFile, getFilenameFromPath } from './recentFiles';
import { isPointInSelectionBounds } from '$lib/utils/selectionUtils';
import { colors } from './tools';
// Note: history is imported dynamically in cropDocumentToRegion to avoid circular dependency

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
			// Use base64 encoding for efficient pixel transfer (~33% overhead vs ~500% for JSON array)
			const pixels = await tauri.getLayerPixelsBase64(layer.id);
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

/**
 * Sync all dirty layer pixels from frontend to backend.
 * Called before saving to ensure backend has current pixel data.
 */
async function syncDirtyLayersToBackend(docId: string): Promise<void> {
	const docs = get(openDocuments);
	const state = docs.get(docId);
	if (!state) return;

	const syncPromises: Promise<void>[] = [];

	for (const [layerId, buffer] of state.layerPixelBuffers) {
		if (buffer.dirty) {
			syncPromises.push(
				tauri.setLayerPixelsBase64(layerId, buffer.data).then(() => {
					// Mark as clean after successful sync
					updateDocumentState(docId, (s) => {
						const buf = s.layerPixelBuffers.get(layerId);
						if (buf) buf.dirty = false;
						return { ...s, layerPixelBuffers: new Map(s.layerPixelBuffers) };
					});
				})
			);
		}
	}

	await Promise.all(syncPromises);
}

// ============ Document Actions ============

export interface BackgroundOption {
	type: 'white' | 'black' | 'transparent' | 'custom';
	color: string;
}

function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (result) {
		return {
			r: parseInt(result[1], 16),
			g: parseInt(result[2], 16),
			b: parseInt(result[3], 16),
			a: 255
		};
	}
	return { r: 255, g: 255, b: 255, a: 255 };
}

export async function createNewDocument(
	name: string,
	width: number,
	height: number,
	resolution: number = 72,
	background: BackgroundOption = { type: 'white', color: '#ffffff' }
): Promise<void> {
	isLoading.set(true);
	error.set(null);

	try {
		const doc = await tauri.createDocument({ name, width, height, resolution });
		const state = createDefaultDocumentState(doc);

		// Create pixel buffers directly in frontend (no backend transfer needed)
		for (const layer of doc.layers) {
			const pixelCount = layer.width * layer.height * 4;
			const data = new Uint8ClampedArray(pixelCount);

			// Fill based on background type
			if (background.type === 'transparent') {
				// Leave as zeros (transparent)
			} else if (background.type === 'black') {
				// Fill with black (alpha = 255, RGB = 0)
				for (let i = 0; i < pixelCount; i += 4) {
					data[i] = 0;
					data[i + 1] = 0;
					data[i + 2] = 0;
					data[i + 3] = 255;
				}
			} else if (background.type === 'custom') {
				const rgba = hexToRgba(background.color);
				for (let i = 0; i < pixelCount; i += 4) {
					data[i] = rgba.r;
					data[i + 1] = rgba.g;
					data[i + 2] = rgba.b;
					data[i + 3] = rgba.a;
				}
			} else {
				// White (default)
				data.fill(255);
			}

			state.layerPixelBuffers.set(layer.id, {
				data,
				width: layer.width,
				height: layer.height,
				dirty: false
			});
		}

		// Mark as dirty since it's a new unsaved document
		state.isDirty = true;

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

		// Add to recent files
		if (path) {
			addRecentFile(path, getFilenameFromPath(path));
		}
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
			// Sync dirty layer pixels to backend before saving
			await syncDirtyLayersToBackend(targetId);

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
		// Sync dirty layer pixels to backend before saving
		await syncDirtyLayersToBackend(targetId);

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

/**
 * Delete (clear to transparent) the contents of the current selection
 */
export function deleteSelectionContents(
	sel: Selection,
	polygonPoints?: { x: number; y: number }[]
): void {
	const docId = get(activeDocumentId);
	const layerId = get(activeLayerId);
	if (!docId || !layerId) return;

	const state = get(activeDocumentState);
	if (!state) return;

	const buffer = state.layerPixelBuffers.get(layerId);
	if (!buffer) return;

	if (sel.type === 'none' || !sel.bounds) return;

	const { bounds } = sel;
	const { data, width, height } = buffer;

	// Iterate over selection bounds and clear pixels inside selection
	const minY = Math.max(0, Math.floor(bounds.y));
	const maxY = Math.min(height, Math.ceil(bounds.y + bounds.height));
	const minX = Math.max(0, Math.floor(bounds.x));
	const maxX = Math.min(width, Math.ceil(bounds.x + bounds.width));

	for (let y = minY; y < maxY; y++) {
		for (let x = minX; x < maxX; x++) {
			if (isPointInSelectionBounds(x, y, sel, polygonPoints)) {
				const idx = (y * width + x) * 4;
				data[idx] = 0; // R
				data[idx + 1] = 0; // G
				data[idx + 2] = 0; // B
				data[idx + 3] = 0; // A (transparent)
			}
		}
	}

	markLayerDirty(layerId);
}

/**
 * Fill the current selection (or entire layer if no selection) with the foreground color
 */
export function fillSelectionWithColor(
	sel: Selection,
	polygonPoints?: { x: number; y: number }[]
): void {
	const docId = get(activeDocumentId);
	const layerId = get(activeLayerId);
	if (!docId || !layerId) return;

	const state = get(activeDocumentState);
	const colorState = get(colors);
	if (!state) return;

	const buffer = state.layerPixelBuffers.get(layerId);
	if (!buffer) return;

	const bounds = sel.bounds;
	const { data, width, height } = buffer;
	const fg = colorState.foreground;

	// If no selection, fill entire layer; otherwise fill within bounds
	const minX = bounds ? Math.max(0, Math.floor(bounds.x)) : 0;
	const maxX = bounds ? Math.min(width, Math.ceil(bounds.x + bounds.width)) : width;
	const minY = bounds ? Math.max(0, Math.floor(bounds.y)) : 0;
	const maxY = bounds ? Math.min(height, Math.ceil(bounds.y + bounds.height)) : height;

	for (let y = minY; y < maxY; y++) {
		for (let x = minX; x < maxX; x++) {
			if (isPointInSelectionBounds(x, y, sel, polygonPoints)) {
				const idx = (y * width + x) * 4;
				data[idx] = fg.r;
				data[idx + 1] = fg.g;
				data[idx + 2] = fg.b;
				data[idx + 3] = Math.round(fg.a * 255);
			}
		}
	}

	markLayerDirty(layerId);
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

	updateDocumentState(docId, (state) => {
		const newViewport = updater(state.viewport);

		// Validate and clamp zoom to safe bounds
		if (!isFinite(newViewport.zoom) || newViewport.zoom <= 0) {
			newViewport.zoom = state.viewport.zoom;
		} else {
			newViewport.zoom = Math.max(0.1, Math.min(32, newViewport.zoom));
		}

		// Validate position values
		if (!isFinite(newViewport.x)) newViewport.x = state.viewport.x;
		if (!isFinite(newViewport.y)) newViewport.y = state.viewport.y;

		return {
			...state,
			viewport: newViewport
		};
	});
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

export function applyBrushStampLocal(
	layerId: string,
	params: BrushStampParams,
	selection?: Selection,
	polygonPoints?: { x: number; y: number }[]
): void {
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

	// Use passed selection or fallback to no selection
	const currentSelection = selection ?? { type: 'none' as const, feather: 0 };

	for (let py = minY; py <= maxY; py++) {
		for (let px = minX; px <= maxX; px++) {
			// Skip pixels outside the selection (if there is one)
			if (!isPointInSelectionBounds(px, py, currentSelection, polygonPoints)) continue;

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
	isEraser: boolean,
	selection?: Selection,
	polygonPoints?: { x: number; y: number }[]
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
		}, selection, polygonPoints);
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

/**
 * Rename a document
 */
export async function renameDocument(docId: string, newName: string): Promise<void> {
	const docs = get(openDocuments);
	const state = docs.get(docId);
	if (!state) return;

	// Update local state
	openDocuments.update((docs) => {
		const docState = docs.get(docId);
		if (docState) {
			docs.set(docId, {
				...docState,
				document: { ...docState.document, name: newName },
				isDirty: true
			});
		}
		return new Map(docs);
	});

	// Update backend
	try {
		await tauri.renameDocument(docId, newName);
	} catch (e) {
		console.error('Failed to rename document on backend:', e);
	}
}

/**
 * Get a display name for a document (filename if saved, document name otherwise)
 */
export function getDocumentDisplayName(doc: Document): string {
	if (doc.sourcePath) {
		return getFilenameFromPath(doc.sourcePath);
	}
	return doc.name;
}

/**
 * Crop the document to the specified region.
 * This updates the backend, reloads pixel data, and updates local state.
 */
export async function cropDocumentToRegion(
	docId: string,
	x: number,
	y: number,
	width: number,
	height: number
): Promise<boolean> {
	const docs = get(openDocuments);
	const state = docs.get(docId);
	if (!state) return false;

	isLoading.set(true);
	error.set(null);

	try {
		// Sync dirty layers to backend before crop
		await syncDirtyLayersToBackend(docId);

		// Call backend crop command
		const result = await tauri.cropDocument(docId, x, y, width, height);

		// Reload document from backend to get updated dimensions
		const updatedDoc = await tauri.getDocument(docId);

		// Reload pixel data for all layers
		const newBuffers = await loadLayerPixelsForDocument(updatedDoc);

		// Update document state
		updateDocumentState(docId, (s) => ({
			...s,
			document: updatedDoc,
			layerPixelBuffers: newBuffers,
			isDirty: true
		}));

		// Clear history since document dimensions changed
		// (old pixel coordinates no longer map to new coordinates)
		// TODO: Implement full document snapshot history for crop operations
		// Use dynamic import to avoid circular dependency with history.ts
		const { history } = await import('./history');
		history.clear();

		return true;
	} catch (e) {
		error.set(e instanceof Error ? e.message : String(e));
		console.error('Failed to crop document:', e);
		return false;
	} finally {
		isLoading.set(false);
	}
}

/**
 * Open a document from a specific file path (used for recent files)
 */
export async function openDocumentFromPath(path: string): Promise<void> {
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

		// Add to recent files
		addRecentFile(path, getFilenameFromPath(path));
	} catch (e) {
		error.set(e instanceof Error ? e.message : String(e));
		throw e;
	} finally {
		isLoading.set(false);
	}
}
