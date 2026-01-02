/**
 * Tauri Platform Implementation
 *
 * Implements PlatformService using Tauri APIs for the desktop app.
 * This wraps all Rust backend calls through Tauri's invoke system.
 */

import { invoke } from '@tauri-apps/api/tauri';
import { open, save, ask, confirm, message } from '@tauri-apps/api/dialog';
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
import { uint8ArrayToBase64, base64ToUint8Array } from './platform';

export class TauriPlatformService implements PlatformService {
	// ─────────────────────────────────────────────────────────────────────────────
	// Document Operations
	// ─────────────────────────────────────────────────────────────────────────────

	async createDocument(params: CreateDocumentParams): Promise<Document> {
		return invoke<Document>('create_document', {
			name: params.name,
			width: params.width,
			height: params.height,
			resolution: params.resolution ?? 72
		});
	}

	async openDocument(path: string): Promise<Document> {
		return invoke<Document>('open_document', { path });
	}

	async openDocumentDrkr(path: string): Promise<Document> {
		return invoke<Document>('open_document_drkr', { path });
	}

	async saveDocument(docId: string, path: string, format?: string): Promise<void> {
		return invoke('save_document', { docId, path, format });
	}

	async saveDocumentDrkr(docId: string, path: string): Promise<Document> {
		return invoke<Document>('save_document_drkr', { docId, path });
	}

	async getDocument(docId: string): Promise<Document> {
		return invoke<Document>('get_document', { docId });
	}

	async listDocuments(): Promise<Document[]> {
		return invoke<Document[]>('list_documents');
	}

	async closeDocument(docId: string): Promise<void> {
		return invoke('close_document', { docId });
	}

	async setDocumentPath(docId: string, path: string): Promise<Document> {
		return invoke<Document>('set_document_path', { docId, path });
	}

	async renameDocument(docId: string, name: string): Promise<Document> {
		return invoke<Document>('rename_document', { docId, name });
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// Layer Operations
	// ─────────────────────────────────────────────────────────────────────────────

	async addLayer(docId: string, name: string): Promise<Layer> {
		return invoke<Layer>('add_layer', { docId, name });
	}

	async removeLayer(docId: string, layerId: string): Promise<void> {
		return invoke('remove_layer', { docId, layerId });
	}

	async updateLayer(docId: string, layerId: string, update: LayerUpdate): Promise<Layer> {
		return invoke<Layer>('update_layer', { docId, layerId, update });
	}

	async reorderLayers(docId: string, fromIndex: number, toIndex: number): Promise<void> {
		return invoke('reorder_layers', { docId, fromIndex, toIndex });
	}

	async getLayerPixels(layerId: string): Promise<Uint8Array> {
		const pixels = await invoke<number[]>('get_layer_pixels', { layerId });
		return new Uint8Array(pixels);
	}

	async getLayerPixelsBase64(layerId: string): Promise<Uint8Array> {
		const base64 = await invoke<string>('get_layer_pixels_base64', { layerId });
		return base64ToUint8Array(base64);
	}

	async setLayerPixelsBase64(layerId: string, pixels: Uint8ClampedArray | Uint8Array): Promise<void> {
		const base64 = uint8ArrayToBase64(pixels);
		return invoke('set_layer_pixels_base64', { layerId, pixelsBase64: base64 });
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// Filter Operations
	// ─────────────────────────────────────────────────────────────────────────────

	async applyFilter(docId: string, layerId: string, filter: FilterParams): Promise<FilterResult> {
		return invoke<FilterResult>('apply_filter', { docId, layerId, filter });
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
		return invoke('apply_brush_stroke', {
			docId,
			layerId,
			points,
			settings,
			color,
			isEraser
		});
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
		return invoke<CropResult>('crop_document', { docId, x, y, width, height });
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// Dialog Operations
	// ─────────────────────────────────────────────────────────────────────────────

	async showOpenDialog(): Promise<string | null> {
		const selected = await open({
			multiple: false,
			filters: [
				{
					name: 'Darker Documents',
					extensions: ['drkr']
				},
				{
					name: 'Images',
					extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff']
				},
				{
					name: 'All Files',
					extensions: ['*']
				}
			]
		});

		if (Array.isArray(selected)) {
			return selected[0] ?? null;
		}
		return selected;
	}

	async showSaveDialog(defaultName?: string): Promise<string | null> {
		const selected = await save({
			defaultPath: defaultName,
			filters: [
				{ name: 'Darker Document', extensions: ['drkr'] },
				{ name: 'PNG', extensions: ['png'] },
				{ name: 'JPEG', extensions: ['jpg', 'jpeg'] },
				{ name: 'WebP', extensions: ['webp'] }
			]
		});

		return selected;
	}

	async showUnsavedChangesDialog(documentName: string): Promise<UnsavedChangesResult> {
		const shouldSave = await ask(
			`"${documentName}" has unsaved changes. Do you want to save before closing?`,
			{
				title: 'Unsaved Changes',
				type: 'warning',
				okLabel: 'Save',
				cancelLabel: "Don't Save"
			}
		);

		return shouldSave ? 'save' : 'discard';
	}

	async showConfirmDialog(title: string, msg: string): Promise<boolean> {
		return confirm(msg, { title, type: 'warning' });
	}

	async showMessage(title: string, msg: string): Promise<void> {
		return message(msg, { title, type: 'info' });
	}
}
