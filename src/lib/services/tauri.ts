/**
 * Tauri Service - Compatibility Layer
 *
 * This module provides backward-compatible exports that use the platform abstraction.
 * Existing code that imports from '$lib/services/tauri' will continue to work,
 * automatically using the appropriate platform implementation (Tauri or Browser).
 *
 * For new code, consider importing directly from '$lib/services/platform' instead.
 */

import { getPlatform, isDrkrFile as _isDrkrFile } from './platform';
import type { Document, Layer } from '$lib/types/document';

// Re-export types from platform.ts
export type {
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

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT COMMANDS
// ═══════════════════════════════════════════════════════════════════════════════

export async function createDocument(params: {
	name: string;
	width: number;
	height: number;
	resolution?: number;
}): Promise<Document> {
	const platform = await getPlatform();
	return platform.createDocument(params);
}

export async function openDocument(path: string): Promise<Document> {
	const platform = await getPlatform();
	return platform.openDocument(path);
}

export async function saveDocument(docId: string, path: string, format?: string): Promise<void> {
	const platform = await getPlatform();
	return platform.saveDocument(docId, path, format);
}

export async function closeDocument(docId: string): Promise<void> {
	const platform = await getPlatform();
	return platform.closeDocument(docId);
}

export async function saveDocumentDrkr(docId: string, path: string): Promise<Document> {
	const platform = await getPlatform();
	return platform.saveDocumentDrkr(docId, path);
}

export async function openDocumentDrkr(path: string): Promise<Document> {
	const platform = await getPlatform();
	return platform.openDocumentDrkr(path);
}

export async function getDocument(docId: string): Promise<Document> {
	const platform = await getPlatform();
	return platform.getDocument(docId);
}

export async function listDocuments(): Promise<Document[]> {
	const platform = await getPlatform();
	return platform.listDocuments();
}

export async function setDocumentPath(docId: string, path: string): Promise<Document> {
	const platform = await getPlatform();
	return platform.setDocumentPath(docId, path);
}

export async function renameDocument(docId: string, name: string): Promise<Document> {
	const platform = await getPlatform();
	return platform.renameDocument(docId, name);
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER COMMANDS
// ═══════════════════════════════════════════════════════════════════════════════

export async function addLayer(docId: string, name: string): Promise<Layer> {
	const platform = await getPlatform();
	return platform.addLayer(docId, name);
}

export async function removeLayer(docId: string, layerId: string): Promise<void> {
	const platform = await getPlatform();
	return platform.removeLayer(docId, layerId);
}

export async function updateLayer(
	docId: string,
	layerId: string,
	update: import('./platform').LayerUpdate
): Promise<Layer> {
	const platform = await getPlatform();
	return platform.updateLayer(docId, layerId, update);
}

export async function reorderLayers(docId: string, fromIndex: number, toIndex: number): Promise<void> {
	const platform = await getPlatform();
	return platform.reorderLayers(docId, fromIndex, toIndex);
}

export async function getLayerPixels(layerId: string): Promise<Uint8Array> {
	const platform = await getPlatform();
	return platform.getLayerPixels(layerId);
}

export async function getLayerPixelsBase64(layerId: string): Promise<Uint8Array> {
	const platform = await getPlatform();
	return platform.getLayerPixelsBase64(layerId);
}

export async function setLayerPixelsBase64(
	layerId: string,
	pixels: Uint8ClampedArray | Uint8Array
): Promise<void> {
	const platform = await getPlatform();
	return platform.setLayerPixelsBase64(layerId, pixels);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILTER COMMANDS
// ═══════════════════════════════════════════════════════════════════════════════

export async function applyFilter(
	docId: string,
	layerId: string,
	filter: import('./platform').FilterParams
): Promise<import('./platform').FilterResult> {
	const platform = await getPlatform();
	return platform.applyFilter(docId, layerId, filter);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BRUSH COMMANDS
// ═══════════════════════════════════════════════════════════════════════════════

export async function applyBrushStroke(
	docId: string,
	layerId: string,
	points: import('./platform').BrushStrokePoint[],
	settings: import('./platform').BrushStrokeSettings,
	color: import('./platform').BrushColor,
	isEraser: boolean
): Promise<void> {
	const platform = await getPlatform();
	return platform.applyBrushStroke(docId, layerId, points, settings, color, isEraser);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CROP COMMANDS
// ═══════════════════════════════════════════════════════════════════════════════

export async function cropDocument(
	docId: string,
	x: number,
	y: number,
	width: number,
	height: number
): Promise<import('./platform').CropResult> {
	const platform = await getPlatform();
	return platform.cropDocument(docId, x, y, width, height);
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIALOG COMMANDS
// ═══════════════════════════════════════════════════════════════════════════════

export async function showOpenDialog(): Promise<string | null> {
	const platform = await getPlatform();
	return platform.showOpenDialog();
}

export async function showSaveDialog(defaultName?: string): Promise<string | null> {
	const platform = await getPlatform();
	return platform.showSaveDialog(defaultName);
}

export async function showUnsavedChangesDialog(
	documentName: string
): Promise<import('./platform').UnsavedChangesResult> {
	const platform = await getPlatform();
	return platform.showUnsavedChangesDialog(documentName);
}

export async function showConfirmDialog(title: string, msg: string): Promise<boolean> {
	const platform = await getPlatform();
	return platform.showConfirmDialog(title, msg);
}

export async function showMessage(title: string, msg: string): Promise<void> {
	const platform = await getPlatform();
	return platform.showMessage(title, msg);
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

// Re-export utility function (sync, no platform needed)
export const isDrkrFile = _isDrkrFile;
