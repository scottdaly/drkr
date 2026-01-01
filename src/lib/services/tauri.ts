import { invoke } from '@tauri-apps/api/tauri';
import { open, save, ask, confirm, message } from '@tauri-apps/api/dialog';
import type { Document, Layer } from '$lib/types/document';
import type { BlendMode } from '$lib/types/document';

// Document Commands

export interface CreateDocumentParams {
	name: string;
	width: number;
	height: number;
	resolution?: number;
}

export async function createDocument(params: CreateDocumentParams): Promise<Document> {
	return invoke<Document>('create_document', {
		name: params.name,
		width: params.width,
		height: params.height,
		resolution: params.resolution ?? 72
	});
}

export async function openDocument(path: string): Promise<Document> {
	return invoke<Document>('open_document', { path });
}

export async function saveDocument(
	docId: string,
	path: string,
	format?: string
): Promise<void> {
	return invoke('save_document', { docId, path, format });
}

export async function closeDocument(docId: string): Promise<void> {
	return invoke('close_document', { docId });
}

// DRKR Format Commands

export async function saveDocumentDrkr(docId: string, path: string): Promise<Document> {
	return invoke<Document>('save_document_drkr', { docId, path });
}

export async function openDocumentDrkr(path: string): Promise<Document> {
	return invoke<Document>('open_document_drkr', { path });
}

export async function getDocument(docId: string): Promise<Document> {
	return invoke<Document>('get_document', { docId });
}

export async function listDocuments(): Promise<Document[]> {
	return invoke<Document[]>('list_documents');
}

export async function setDocumentPath(docId: string, path: string): Promise<Document> {
	return invoke<Document>('set_document_path', { docId, path });
}

// Layer Commands

export async function addLayer(docId: string, name: string): Promise<Layer> {
	return invoke<Layer>('add_layer', { docId, name });
}

export async function removeLayer(docId: string, layerId: string): Promise<void> {
	return invoke('remove_layer', { docId, layerId });
}

export interface LayerUpdate {
	name?: string;
	visible?: boolean;
	locked?: boolean;
	opacity?: number;
	blendMode?: BlendMode;
	x?: number;
	y?: number;
}

export async function updateLayer(
	docId: string,
	layerId: string,
	update: LayerUpdate
): Promise<Layer> {
	return invoke<Layer>('update_layer', { docId, layerId, update });
}

export async function reorderLayers(
	docId: string,
	fromIndex: number,
	toIndex: number
): Promise<void> {
	return invoke('reorder_layers', { docId, fromIndex, toIndex });
}

export async function getLayerPixels(layerId: string): Promise<Uint8Array> {
	const pixels = await invoke<number[]>('get_layer_pixels', { layerId });
	return new Uint8Array(pixels);
}

// Filter Commands

export type FilterParams =
	| { type: 'gaussianBlur'; radius: number }
	| { type: 'brightness'; value: number }
	| { type: 'contrast'; value: number }
	| { type: 'saturation'; value: number }
	| { type: 'invert' }
	| { type: 'grayscale' };

export interface FilterResult {
	layerId: string;
	success: boolean;
}

export async function applyFilter(
	docId: string,
	layerId: string,
	filter: FilterParams
): Promise<FilterResult> {
	return invoke<FilterResult>('apply_filter', { docId, layerId, filter });
}

// Dialog Helpers

export async function showOpenDialog(): Promise<string | null> {
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

export async function showSaveDialog(defaultName?: string): Promise<string | null> {
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

// Check if a file path is a DRKR file
export function isDrkrFile(path: string): boolean {
	return path.toLowerCase().endsWith('.drkr');
}

// Brush Commands

export interface BrushStrokePoint {
	x: number;
	y: number;
	pressure?: number;
	timestamp: number;
}

export interface BrushStrokeSettings {
	size: number;
	hardness: number;
	opacity: number;
	flow: number;
	spacing: number;
}

export interface BrushColor {
	r: number;
	g: number;
	b: number;
	a: number;
}

export async function applyBrushStroke(
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

// Dialog Helpers

export type UnsavedChangesResult = 'save' | 'discard' | 'cancel';

/**
 * Show a dialog asking about unsaved changes.
 * Returns 'save' if user wants to save, 'discard' if they want to discard, 'cancel' to abort.
 */
export async function showUnsavedChangesDialog(documentName: string): Promise<UnsavedChangesResult> {
	// Use ask() which shows Yes/No buttons - we'll use it for Save/Don't Save
	// Then handle cancel via the dialog's cancel behavior
	const shouldSave = await ask(
		`"${documentName}" has unsaved changes. Do you want to save before closing?`,
		{
			title: 'Unsaved Changes',
			type: 'warning',
			okLabel: 'Save',
			cancelLabel: "Don't Save"
		}
	);

	// ask() returns true for OK (Save), false for Cancel (Don't Save)
	// If user clicks the window close button, it returns false
	return shouldSave ? 'save' : 'discard';
}

/**
 * Show a confirmation dialog with custom message.
 */
export async function showConfirmDialog(title: string, msg: string): Promise<boolean> {
	return confirm(msg, { title, type: 'warning' });
}

/**
 * Show an info message dialog.
 */
export async function showMessage(title: string, msg: string): Promise<void> {
	return message(msg, { title, type: 'info' });
}
