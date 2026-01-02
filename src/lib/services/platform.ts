/**
 * Platform Abstraction Layer
 *
 * This module provides a unified interface for platform-specific functionality.
 * It allows the same frontend code to work with both:
 * - Tauri (desktop app with Rust backend)
 * - Browser (web app with JS/WASM backend)
 */

import type { Document, Layer, BlendMode } from '$lib/types/document';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export interface CreateDocumentParams {
	name: string;
	width: number;
	height: number;
	resolution?: number;
	backgroundColor?: string;
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

export interface CropResult {
	docId: string;
	newWidth: number;
	newHeight: number;
	layersAffected: string[];
}

export interface DialogFilter {
	name: string;
	extensions: string[];
}

export type UnsavedChangesResult = 'save' | 'discard' | 'cancel';

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM SERVICE INTERFACE
// ═══════════════════════════════════════════════════════════════════════════════

export interface PlatformService {
	// ─────────────────────────────────────────────────────────────────────────────
	// Document Operations
	// ─────────────────────────────────────────────────────────────────────────────

	/** Create a new blank document */
	createDocument(params: CreateDocumentParams): Promise<Document>;

	/** Open an image file (PNG, JPG, WebP, etc.) */
	openDocument(path: string): Promise<Document>;

	/** Open a DRKR project file */
	openDocumentDrkr(path: string): Promise<Document>;

	/** Save document to standard image format */
	saveDocument(docId: string, path: string, format?: string): Promise<void>;

	/** Save document as DRKR project */
	saveDocumentDrkr(docId: string, path: string): Promise<Document>;

	/** Get document by ID */
	getDocument(docId: string): Promise<Document>;

	/** List all open documents */
	listDocuments(): Promise<Document[]>;

	/** Close and cleanup document */
	closeDocument(docId: string): Promise<void>;

	/** Set document file path */
	setDocumentPath(docId: string, path: string): Promise<Document>;

	/** Rename document */
	renameDocument(docId: string, name: string): Promise<Document>;

	// ─────────────────────────────────────────────────────────────────────────────
	// Layer Operations
	// ─────────────────────────────────────────────────────────────────────────────

	/** Add a new layer to document */
	addLayer(docId: string, name: string): Promise<Layer>;

	/** Remove a layer */
	removeLayer(docId: string, layerId: string): Promise<void>;

	/** Update layer properties */
	updateLayer(docId: string, layerId: string, update: LayerUpdate): Promise<Layer>;

	/** Reorder layers */
	reorderLayers(docId: string, fromIndex: number, toIndex: number): Promise<void>;

	/** Get layer pixel data (legacy - less efficient) */
	getLayerPixels(layerId: string): Promise<Uint8Array>;

	/** Get layer pixel data as base64 (more efficient) */
	getLayerPixelsBase64(layerId: string): Promise<Uint8Array>;

	/** Set layer pixel data from frontend */
	setLayerPixelsBase64(layerId: string, pixels: Uint8ClampedArray | Uint8Array): Promise<void>;

	// ─────────────────────────────────────────────────────────────────────────────
	// Filter Operations
	// ─────────────────────────────────────────────────────────────────────────────

	/** Apply a filter to a layer */
	applyFilter(docId: string, layerId: string, filter: FilterParams): Promise<FilterResult>;

	// ─────────────────────────────────────────────────────────────────────────────
	// Brush Operations
	// ─────────────────────────────────────────────────────────────────────────────

	/** Apply brush stroke to layer */
	applyBrushStroke(
		docId: string,
		layerId: string,
		points: BrushStrokePoint[],
		settings: BrushStrokeSettings,
		color: BrushColor,
		isEraser: boolean
	): Promise<void>;

	// ─────────────────────────────────────────────────────────────────────────────
	// Crop Operations
	// ─────────────────────────────────────────────────────────────────────────────

	/** Crop document to specified region */
	cropDocument(
		docId: string,
		x: number,
		y: number,
		width: number,
		height: number
	): Promise<CropResult>;

	// ─────────────────────────────────────────────────────────────────────────────
	// Dialog Operations
	// ─────────────────────────────────────────────────────────────────────────────

	/** Show file open dialog */
	showOpenDialog(): Promise<string | null>;

	/** Show file save dialog */
	showSaveDialog(defaultName?: string): Promise<string | null>;

	/** Show unsaved changes dialog */
	showUnsavedChangesDialog(documentName: string): Promise<UnsavedChangesResult>;

	/** Show confirmation dialog */
	showConfirmDialog(title: string, message: string): Promise<boolean>;

	/** Show message dialog */
	showMessage(title: string, message: string): Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if running in Tauri environment
 */
export function isTauri(): boolean {
	return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * Check if running in browser environment (non-Tauri)
 */
export function isBrowser(): boolean {
	return typeof window !== 'undefined' && !('__TAURI__' in window);
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a file path is a DRKR file
 */
export function isDrkrFile(path: string): boolean {
	return path.toLowerCase().endsWith('.drkr');
}

/**
 * Convert Uint8Array to base64 string
 */
export function uint8ArrayToBase64(bytes: Uint8ClampedArray | Uint8Array): string {
	let binary = '';
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

/**
 * Convert base64 string to Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
	const binary = atob(base64);
	const len = binary.length;
	const bytes = new Uint8Array(len);
	for (let i = 0; i < len; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

let platformInstance: PlatformService | null = null;

/**
 * Get the platform service instance.
 * Automatically detects and returns the appropriate implementation.
 */
export async function getPlatform(): Promise<PlatformService> {
	if (platformInstance) {
		return platformInstance;
	}

	if (isTauri()) {
		const { TauriPlatformService } = await import('./platform-tauri');
		platformInstance = new TauriPlatformService();
	} else {
		const { BrowserPlatformService } = await import('./platform-browser');
		platformInstance = new BrowserPlatformService();
	}

	return platformInstance;
}

/**
 * Reset platform instance (useful for testing)
 */
export function resetPlatform(): void {
	platformInstance = null;
}
