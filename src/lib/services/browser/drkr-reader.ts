/**
 * Browser DRKR File Reader
 *
 * Reads DRKR format files (ZIP-based) in the browser using JSZip.
 * DRKR format structure:
 * - mimetype (uncompressed, first entry)
 * - manifest.json
 * - document.json
 * - preview/thumbnail.webp
 * - preview/merged.webp
 * - layers/{id}/meta.json
 * - layers/{id}/pixels.webp
 */

import JSZip from 'jszip';
import type { Document, Layer, BlendMode, LayerType } from '$lib/types/document';

export const DRKR_MIMETYPE = 'application/x-drkr';

// Types matching the Rust DRKR format
interface DrkrManifest {
	drkr_version: string;
	generator: {
		name: string;
		version: string;
		url?: string;
	};
	created_at: string;
	modified_at: string;
}

interface DrkrDocument {
	id: string;
	name: string;
	width: number;
	height: number;
	resolution?: { value: number; unit: string };
	color: { space: string; depth: number; profile?: string };
	background?: { type: string; color?: string };
	layers: DrkrLayerRef[];
	guides?: { orientation: string; position: number }[];
}

interface DrkrLayerRef {
	id: string;
	type: string;
	adjustment_id?: string;
	children?: DrkrLayerRef[];
}

interface DrkrLayerMeta {
	id: string;
	type: string;
	name: string;
	visible: boolean;
	locked: boolean;
	opacity: number;
	blend_mode: string;
	position: { x: number; y: number };
	size: { width: number; height: number };
	mask_id?: string;
	clipping_mask: boolean;
	storage?: {
		format: string;
		mode: string;
	};
}

export interface DrkrReadResult {
	document: Document;
	layerPixels: Map<string, Uint8ClampedArray>;
}

export class DrkrReader {
	private zip: JSZip;

	private constructor(zip: JSZip) {
		this.zip = zip;
	}

	/**
	 * Load a DRKR file from a File object
	 */
	static async fromFile(file: File): Promise<DrkrReader> {
		const arrayBuffer = await file.arrayBuffer();
		return this.fromArrayBuffer(arrayBuffer);
	}

	/**
	 * Load a DRKR file from an ArrayBuffer
	 */
	static async fromArrayBuffer(buffer: ArrayBuffer): Promise<DrkrReader> {
		const zip = await JSZip.loadAsync(buffer);
		return new DrkrReader(zip);
	}

	/**
	 * Validate the DRKR file format
	 */
	async validate(): Promise<void> {
		// Check mimetype
		const mimetype = await this.readFileAsString('mimetype');
		if (mimetype.trim() !== DRKR_MIMETYPE) {
			throw new Error(
				`Invalid DRKR file: expected mimetype '${DRKR_MIMETYPE}', got '${mimetype.trim()}'`
			);
		}

		// Check manifest version
		const manifest = await this.readManifest();
		const majorVersion = parseInt(manifest.drkr_version.split('.')[0], 10) || 0;
		if (majorVersion > 1) {
			throw new Error(`Unsupported DRKR version: ${manifest.drkr_version}`);
		}
	}

	/**
	 * Read the manifest.json
	 */
	async readManifest(): Promise<DrkrManifest> {
		const json = await this.readFileAsString('manifest.json');
		return JSON.parse(json);
	}

	/**
	 * Read the document.json
	 */
	async readDocumentJson(): Promise<DrkrDocument> {
		const json = await this.readFileAsString('document.json');
		return JSON.parse(json);
	}

	/**
	 * Read a layer's metadata
	 */
	async readLayerMeta(layerId: string): Promise<DrkrLayerMeta> {
		const path = `layers/${layerId}/meta.json`;
		const json = await this.readFileAsString(path);
		return JSON.parse(json);
	}

	/**
	 * Read a layer's pixel data (decodes WebP/PNG to RGBA)
	 */
	async readLayerPixels(layerId: string, width: number, height: number): Promise<Uint8ClampedArray> {
		// Try WebP first (the Rust implementation uses WebP)
		let imageData: Uint8ClampedArray | null = null;

		try {
			const webpPath = `layers/${layerId}/pixels.webp`;
			const webpData = await this.readFileAsBlob(webpPath, 'image/webp');
			imageData = await this.decodeImageBlob(webpData, width, height);
		} catch {
			// Try PNG as fallback
			try {
				const pngPath = `layers/${layerId}/pixels.png`;
				const pngData = await this.readFileAsBlob(pngPath, 'image/png');
				imageData = await this.decodeImageBlob(pngData, width, height);
			} catch {
				// Return transparent pixels if no image found
				console.warn(`No pixel data found for layer ${layerId}, using transparent`);
				return new Uint8ClampedArray(width * height * 4);
			}
		}

		return imageData;
	}

	/**
	 * Read the complete document with all layer pixels
	 */
	async readAll(): Promise<DrkrReadResult> {
		// Validate first
		await this.validate();

		// Read document metadata
		const drkrDoc = await this.readDocumentJson();

		// Build layers and read pixels
		const layers: Layer[] = [];
		const layerPixels = new Map<string, Uint8ClampedArray>();

		for (const layerRef of drkrDoc.layers) {
			// Read layer metadata
			const meta = await this.readLayerMeta(layerRef.id);
			const layer = this.convertLayerMetaToLayer(meta);
			layers.push(layer);

			// Read pixel data for raster layers
			if (layerRef.type === 'raster' || layerRef.type === 'ai_generated') {
				const pixels = await this.readLayerPixels(layerRef.id, meta.size.width, meta.size.height);
				layerPixels.set(layerRef.id, pixels);
			}
		}

		// Build Document
		const document: Document = {
			id: drkrDoc.id,
			name: drkrDoc.name,
			width: drkrDoc.width,
			height: drkrDoc.height,
			resolution: drkrDoc.resolution?.value ?? 72,
			colorProfile: {
				name: drkrDoc.color.profile ?? 'sRGB',
				colorSpace: drkrDoc.color.space === 'srgb' ? 'srgb' : 'srgb'
			},
			layers,
			guides: (drkrDoc.guides ?? []).map((g, i) => ({
				id: `guide-${i}`,
				orientation: g.orientation as 'horizontal' | 'vertical',
				position: g.position
			})),
			createdAt: Date.now(),
			modifiedAt: Date.now(),
			tiled: false
		};

		return { document, layerPixels };
	}

	/**
	 * Read a file from the archive as a string
	 */
	private async readFileAsString(path: string): Promise<string> {
		const file = this.zip.file(path);
		if (!file) {
			throw new Error(`File '${path}' not found in archive`);
		}
		return file.async('string');
	}

	/**
	 * Read a file from the archive as a Blob
	 */
	private async readFileAsBlob(path: string, mimeType: string): Promise<Blob> {
		const file = this.zip.file(path);
		if (!file) {
			throw new Error(`File '${path}' not found in archive`);
		}
		const data = await file.async('uint8array');
		// Use slice().buffer to create a proper ArrayBuffer that works with Blob
		return new Blob([data.slice().buffer], { type: mimeType });
	}

	/**
	 * Decode an image blob to RGBA pixels using Canvas
	 */
	private async decodeImageBlob(blob: Blob, expectedWidth: number, expectedHeight: number): Promise<Uint8ClampedArray> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			const url = URL.createObjectURL(blob);

			img.onload = () => {
				URL.revokeObjectURL(url);

				const canvas = document.createElement('canvas');
				canvas.width = expectedWidth;
				canvas.height = expectedHeight;

				const ctx = canvas.getContext('2d');
				if (!ctx) {
					reject(new Error('Failed to get canvas context'));
					return;
				}

				// Draw scaled to expected dimensions if needed
				ctx.drawImage(img, 0, 0, expectedWidth, expectedHeight);
				const imageData = ctx.getImageData(0, 0, expectedWidth, expectedHeight);
				resolve(imageData.data);
			};

			img.onerror = () => {
				URL.revokeObjectURL(url);
				reject(new Error('Failed to decode image'));
			};

			img.src = url;
		});
	}

	/**
	 * Convert DRKR layer metadata to internal Layer type
	 */
	private convertLayerMetaToLayer(meta: DrkrLayerMeta): Layer {
		return {
			id: meta.id,
			name: meta.name,
			type: this.parseLayerType(meta.type),
			visible: meta.visible ?? true,
			locked: meta.locked ?? false,
			opacity: meta.opacity ?? 100,
			blendMode: this.parseBlendMode(meta.blend_mode),
			x: meta.position.x,
			y: meta.position.y,
			width: meta.size.width,
			height: meta.size.height,
			dataRef: meta.id,
			clippingMask: meta.clipping_mask ?? false
		};
	}

	/**
	 * Parse layer type string
	 */
	private parseLayerType(typeStr: string): LayerType {
		switch (typeStr) {
			case 'raster':
				return 'raster';
			case 'adjustment':
				return 'adjustment';
			case 'group':
				return 'group';
			case 'text':
				return 'text';
			case 'shape':
				return 'shape';
			case 'ai_generated':
				return 'raster'; // Treat as raster
			default:
				return 'raster';
		}
	}

	/**
	 * Parse blend mode string
	 */
	private parseBlendMode(modeStr: string): BlendMode {
		switch (modeStr) {
			case 'normal':
				return 'normal';
			case 'multiply':
				return 'multiply';
			case 'screen':
				return 'screen';
			case 'overlay':
				return 'overlay';
			case 'darken':
				return 'darken';
			case 'lighten':
				return 'lighten';
			case 'color-dodge':
				return 'colorDodge';
			case 'color-burn':
				return 'colorBurn';
			case 'hard-light':
				return 'hardLight';
			case 'soft-light':
				return 'softLight';
			case 'difference':
				return 'difference';
			case 'exclusion':
				return 'exclusion';
			case 'hue':
				return 'hue';
			case 'saturation':
				return 'saturation';
			case 'color':
				return 'color';
			case 'luminosity':
				return 'luminosity';
			default:
				return 'normal';
		}
	}
}
