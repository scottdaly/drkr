/**
 * Browser Platform Implementation
 *
 * Implements PlatformService using browser APIs for the web app.
 * This provides browser-native alternatives to Tauri's desktop functionality.
 */

import type { Document, Layer } from '$lib/types/document';
import type {
	PlatformService,
	CreateDocumentParams,
	LayerUpdate,
	FilterParams,
	FilterResult,
	BrushStrokePoint,
	BrushStrokeSettings,
	BrushColor,
	CropResult,
	UnsavedChangesResult
} from './platform';
import { fileHandler } from './browser/file-handler';
import { filterProcessor } from './browser/filter-processor';
import { imageExporter } from './browser/image-exporter';
import { DrkrReader } from './browser/drkr-reader';
import { saveToDrkr } from './browser/drkr-writer';

// ═══════════════════════════════════════════════════════════════════════════════
// IN-MEMORY DOCUMENT STORAGE
// ═══════════════════════════════════════════════════════════════════════════════

interface StoredDocument {
	document: Document;
	layers: Map<string, Uint8Array>; // layerId -> pixel data
	fileHandle?: FileSystemFileHandle; // For File System Access API
}

const documents = new Map<string, StoredDocument>();

// Store for pending file to be opened (set by showOpenDialog, used by openDocument)
let pendingFile: File | null = null;

function generateId(): string {
	return crypto.randomUUID();
}

// ═══════════════════════════════════════════════════════════════════════════════
// BROWSER PLATFORM SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export class BrowserPlatformService implements PlatformService {
	// ─────────────────────────────────────────────────────────────────────────────
	// Document Operations
	// ─────────────────────────────────────────────────────────────────────────────

	async createDocument(params: CreateDocumentParams): Promise<Document> {
		const docId = generateId();
		const layerId = generateId();

		const layer: Layer = {
			id: layerId,
			name: 'Background',
			type: 'raster',
			visible: true,
			locked: false,
			opacity: 100,
			blendMode: 'normal',
			x: 0,
			y: 0,
			width: params.width,
			height: params.height,
			dataRef: layerId
		};

		const now = Date.now();
		const document: Document = {
			id: docId,
			name: params.name,
			width: params.width,
			height: params.height,
			resolution: params.resolution ?? 72,
			colorProfile: { name: 'sRGB', colorSpace: 'srgb' },
			layers: [layer],
			guides: [],
			createdAt: now,
			modifiedAt: now,
			tiled: false
		};

		// Create pixel data for the layer
		const pixelData = new Uint8Array(params.width * params.height * 4);

		// Fill with background color if specified
		if (params.backgroundColor) {
			const color = parseColor(params.backgroundColor);
			for (let i = 0; i < pixelData.length; i += 4) {
				pixelData[i] = color.r;
				pixelData[i + 1] = color.g;
				pixelData[i + 2] = color.b;
				pixelData[i + 3] = color.a;
			}
		}

		documents.set(docId, {
			document,
			layers: new Map([[layerId, pixelData]])
		});

		return document;
	}

	async openDocument(path: string): Promise<Document> {
		// In browser, we use the pendingFile set by showOpenDialog
		if (!pendingFile) {
			throw new Error('No file selected. Use showOpenDialog first.');
		}

		const file = pendingFile;
		pendingFile = null;

		// Read the image file
		const imageData = await fileHandler.readImageFile(file);

		// Create document from image
		const docId = generateId();
		const layerId = generateId();

		const layer: Layer = {
			id: layerId,
			name: 'Background',
			type: 'raster',
			visible: true,
			locked: false,
			opacity: 100,
			blendMode: 'normal',
			x: 0,
			y: 0,
			width: imageData.width,
			height: imageData.height,
			dataRef: layerId
		};

		const now = Date.now();
		const document: Document = {
			id: docId,
			name: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
			width: imageData.width,
			height: imageData.height,
			resolution: 72,
			colorProfile: { name: 'sRGB', colorSpace: 'srgb' },
			layers: [layer],
			guides: [],
			createdAt: now,
			modifiedAt: now,
			tiled: false,
			sourcePath: file.name
		};

		// Store the document with pixel data
		documents.set(docId, {
			document,
			layers: new Map([[layerId, new Uint8Array(imageData.data)]])
		});

		return document;
	}

	async openDocumentDrkr(path: string): Promise<Document> {
		// In browser, we use the pendingFile set by showOpenDialog
		if (!pendingFile) {
			throw new Error('No file selected. Use showOpenDialog first.');
		}

		const file = pendingFile;
		pendingFile = null;

		// Parse the DRKR file
		const reader = await DrkrReader.fromFile(file);
		const result = await reader.readAll();

		// Store the document with all layer pixels
		documents.set(result.document.id, {
			document: result.document,
			layers: new Map(
				Array.from(result.layerPixels).map(([k, v]) => [k, new Uint8Array(v)])
			)
		});

		// Update source path
		result.document.sourcePath = file.name;

		return result.document;
	}

	async saveDocument(docId: string, path: string, format?: string): Promise<void> {
		const stored = documents.get(docId);
		if (!stored) {
			throw new Error(`Document not found: ${docId}`);
		}

		// Composite all layers
		const composited = imageExporter.compositeLayers(
			stored.document.layers,
			new Map(Array.from(stored.layers).map(([k, v]) => [k, new Uint8ClampedArray(v)])),
			stored.document.width,
			stored.document.height
		);

		// Determine format from path or parameter
		const ext = format || path.split('.').pop()?.toLowerCase() || 'png';
		let blob: Blob;

		switch (ext) {
			case 'jpg':
			case 'jpeg':
				blob = await imageExporter.exportToJpeg(
					composited,
					stored.document.width,
					stored.document.height,
					0.92,
					'#ffffff'
				);
				break;
			case 'webp':
				blob = await imageExporter.exportToWebp(
					composited,
					stored.document.width,
					stored.document.height
				);
				break;
			case 'png':
			default:
				blob = await imageExporter.exportToPng(
					composited,
					stored.document.width,
					stored.document.height
				);
				break;
		}

		// Save the file
		await fileHandler.saveFile(blob, path, stored.fileHandle);
	}

	async saveDocumentDrkr(docId: string, path: string): Promise<Document> {
		const stored = documents.get(docId);
		if (!stored) {
			throw new Error(`Document not found: ${docId}`);
		}

		// Convert layer pixels to Uint8ClampedArray for the writer
		const layerPixels = new Map<string, Uint8ClampedArray>(
			Array.from(stored.layers).map(([k, v]) => [k, new Uint8ClampedArray(v)])
		);

		// Create the DRKR file
		const blob = await saveToDrkr(stored.document, layerPixels);

		// Save using file handler
		const filename = path.endsWith('.drkr') ? path : `${path}.drkr`;
		await fileHandler.saveFile(blob, filename, stored.fileHandle);

		// Update document source path
		stored.document.sourcePath = filename;
		stored.document.modifiedAt = Date.now();

		return stored.document;
	}

	async getDocument(docId: string): Promise<Document> {
		const stored = documents.get(docId);
		if (!stored) {
			throw new Error(`Document not found: ${docId}`);
		}
		return stored.document;
	}

	async listDocuments(): Promise<Document[]> {
		return Array.from(documents.values()).map((s) => s.document);
	}

	async closeDocument(docId: string): Promise<void> {
		documents.delete(docId);
	}

	async setDocumentPath(docId: string, path: string): Promise<Document> {
		const stored = documents.get(docId);
		if (!stored) {
			throw new Error(`Document not found: ${docId}`);
		}
		stored.document.sourcePath = path;
		stored.document.modifiedAt = Date.now();
		return stored.document;
	}

	async renameDocument(docId: string, name: string): Promise<Document> {
		const stored = documents.get(docId);
		if (!stored) {
			throw new Error(`Document not found: ${docId}`);
		}
		stored.document.name = name;
		stored.document.modifiedAt = Date.now();
		return stored.document;
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// Layer Operations
	// ─────────────────────────────────────────────────────────────────────────────

	async addLayer(docId: string, name: string): Promise<Layer> {
		const stored = documents.get(docId);
		if (!stored) {
			throw new Error(`Document not found: ${docId}`);
		}

		const layerId = generateId();
		const { width, height } = stored.document;

		const layer: Layer = {
			id: layerId,
			name,
			type: 'raster',
			visible: true,
			locked: false,
			opacity: 100,
			blendMode: 'normal',
			x: 0,
			y: 0,
			width,
			height,
			dataRef: layerId
		};

		// Create transparent pixel data
		const pixelData = new Uint8Array(width * height * 4);
		stored.layers.set(layerId, pixelData);
		stored.document.layers.unshift(layer); // Add to top
		stored.document.modifiedAt = Date.now();

		return layer;
	}

	async removeLayer(docId: string, layerId: string): Promise<void> {
		const stored = documents.get(docId);
		if (!stored) {
			throw new Error(`Document not found: ${docId}`);
		}

		const index = stored.document.layers.findIndex((l) => l.id === layerId);
		if (index === -1) {
			throw new Error(`Layer not found: ${layerId}`);
		}

		stored.document.layers.splice(index, 1);
		stored.layers.delete(layerId);
		stored.document.modifiedAt = Date.now();
	}

	async updateLayer(docId: string, layerId: string, update: LayerUpdate): Promise<Layer> {
		const stored = documents.get(docId);
		if (!stored) {
			throw new Error(`Document not found: ${docId}`);
		}

		const layer = stored.document.layers.find((l) => l.id === layerId);
		if (!layer) {
			throw new Error(`Layer not found: ${layerId}`);
		}

		// Apply updates
		if (update.name !== undefined) layer.name = update.name;
		if (update.visible !== undefined) layer.visible = update.visible;
		if (update.locked !== undefined) layer.locked = update.locked;
		if (update.opacity !== undefined) layer.opacity = update.opacity;
		if (update.blendMode !== undefined) layer.blendMode = update.blendMode;
		if (update.x !== undefined) layer.x = update.x;
		if (update.y !== undefined) layer.y = update.y;

		stored.document.modifiedAt = Date.now();
		return layer;
	}

	async reorderLayers(docId: string, fromIndex: number, toIndex: number): Promise<void> {
		const stored = documents.get(docId);
		if (!stored) {
			throw new Error(`Document not found: ${docId}`);
		}

		const layers = stored.document.layers;
		const [removed] = layers.splice(fromIndex, 1);
		layers.splice(toIndex, 0, removed);
		stored.document.modifiedAt = Date.now();
	}

	async getLayerPixels(layerId: string): Promise<Uint8Array> {
		for (const stored of documents.values()) {
			const pixels = stored.layers.get(layerId);
			if (pixels) {
				return pixels;
			}
		}
		throw new Error(`Layer not found: ${layerId}`);
	}

	async getLayerPixelsBase64(layerId: string): Promise<Uint8Array> {
		return this.getLayerPixels(layerId);
	}

	async setLayerPixelsBase64(
		layerId: string,
		pixels: Uint8ClampedArray | Uint8Array
	): Promise<void> {
		for (const stored of documents.values()) {
			if (stored.layers.has(layerId)) {
				stored.layers.set(layerId, new Uint8Array(pixels));
				stored.document.modifiedAt = Date.now();
				return;
			}
		}
		throw new Error(`Layer not found: ${layerId}`);
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// Filter Operations
	// ─────────────────────────────────────────────────────────────────────────────

	async applyFilter(docId: string, layerId: string, filter: FilterParams): Promise<FilterResult> {
		const stored = documents.get(docId);
		if (!stored) {
			return { layerId, success: false };
		}

		const pixels = stored.layers.get(layerId);
		if (!pixels) {
			return { layerId, success: false };
		}

		const layer = stored.document.layers.find((l) => l.id === layerId);
		if (!layer) {
			return { layerId, success: false };
		}

		// Apply the filter using our filter processor
		const clampedPixels = new Uint8ClampedArray(pixels);
		filterProcessor.applyFilter(clampedPixels, layer.width, layer.height, filter);

		// Store the modified pixels back
		stored.layers.set(layerId, new Uint8Array(clampedPixels));
		stored.document.modifiedAt = Date.now();

		return { layerId, success: true };
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// Brush Operations
	// ─────────────────────────────────────────────────────────────────────────────

	async applyBrushStroke(
		docId: string,
		layerId: string,
		points: BrushStrokePoint[],
		settings: BrushStrokeSettings,
		color: BrushColor,
		isEraser: boolean
	): Promise<void> {
		// In browser mode, brush strokes are handled directly in the frontend
		// The frontend already modifies the pixel buffer, so we just need to mark as modified
		const stored = documents.get(docId);
		if (stored) {
			stored.document.modifiedAt = Date.now();
		}
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// Crop Operations
	// ─────────────────────────────────────────────────────────────────────────────

	async cropDocument(
		docId: string,
		x: number,
		y: number,
		width: number,
		height: number
	): Promise<CropResult> {
		const stored = documents.get(docId);
		if (!stored) {
			throw new Error(`Document not found: ${docId}`);
		}

		const layersAffected: string[] = [];

		// Crop each layer
		for (const layer of stored.document.layers) {
			const pixels = stored.layers.get(layer.id);
			if (!pixels) continue;

			// Create new cropped pixel buffer
			const croppedPixels = new Uint8Array(width * height * 4);

			// Copy pixels from old buffer to new buffer
			for (let cy = 0; cy < height; cy++) {
				for (let cx = 0; cx < width; cx++) {
					const srcX = x + cx - layer.x;
					const srcY = y + cy - layer.y;

					if (srcX >= 0 && srcX < layer.width && srcY >= 0 && srcY < layer.height) {
						const srcIdx = (srcY * layer.width + srcX) * 4;
						const dstIdx = (cy * width + cx) * 4;

						croppedPixels[dstIdx] = pixels[srcIdx];
						croppedPixels[dstIdx + 1] = pixels[srcIdx + 1];
						croppedPixels[dstIdx + 2] = pixels[srcIdx + 2];
						croppedPixels[dstIdx + 3] = pixels[srcIdx + 3];
					}
				}
			}

			// Update layer
			stored.layers.set(layer.id, croppedPixels);
			layer.x = 0;
			layer.y = 0;
			layer.width = width;
			layer.height = height;
			layersAffected.push(layer.id);
		}

		// Update document dimensions
		stored.document.width = width;
		stored.document.height = height;
		stored.document.modifiedAt = Date.now();

		return {
			docId,
			newWidth: width,
			newHeight: height,
			layersAffected
		};
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// Dialog Operations
	// ─────────────────────────────────────────────────────────────────────────────

	async showOpenDialog(): Promise<string | null> {
		const files = await fileHandler.showOpenDialog({ multiple: false });

		if (!files || files.length === 0) {
			return null;
		}

		// Store the file for later use by openDocument
		pendingFile = files[0];
		return files[0].name;
	}

	async showSaveDialog(defaultName?: string): Promise<string | null> {
		const handle = await fileHandler.showSaveDialog({
			suggestedName: defaultName ?? 'untitled.png'
		});

		if (handle) {
			// Store the handle for the active document (if we can identify it)
			// For now, return the suggested name
			return defaultName ?? 'untitled.png';
		}

		// Fallback mode - no File System Access API
		return defaultName ?? 'untitled.png';
	}

	async showUnsavedChangesDialog(documentName: string): Promise<UnsavedChangesResult> {
		const message = `"${documentName}" has unsaved changes. Do you want to save before closing?`;
		const shouldSave = window.confirm(message);
		return shouldSave ? 'save' : 'discard';
	}

	async showConfirmDialog(title: string, msg: string): Promise<boolean> {
		return window.confirm(msg);
	}

	async showMessage(title: string, msg: string): Promise<void> {
		window.alert(msg);
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function parseColor(color: string): { r: number; g: number; b: number; a: number } {
	if (color.startsWith('#')) {
		const hex = color.slice(1);
		if (hex.length === 6) {
			return {
				r: parseInt(hex.slice(0, 2), 16),
				g: parseInt(hex.slice(2, 4), 16),
				b: parseInt(hex.slice(4, 6), 16),
				a: 255
			};
		}
		if (hex.length === 8) {
			return {
				r: parseInt(hex.slice(0, 2), 16),
				g: parseInt(hex.slice(2, 4), 16),
				b: parseInt(hex.slice(4, 6), 16),
				a: parseInt(hex.slice(6, 8), 16)
			};
		}
	}
	return { r: 255, g: 255, b: 255, a: 255 };
}
