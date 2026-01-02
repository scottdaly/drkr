/**
 * Browser DRKR File Writer
 *
 * Creates DRKR format files (ZIP-based) in the browser using JSZip.
 * DRKR format structure:
 * - mimetype (uncompressed, first entry)
 * - manifest.json
 * - document.json
 * - preview/thumbnail.webp (or .png)
 * - preview/merged.webp (or .png)
 * - layers/{id}/meta.json
 * - layers/{id}/pixels.webp (or .png)
 */

import JSZip from 'jszip';
import type { Document, Layer, BlendMode } from '$lib/types/document';
import { DRKR_MIMETYPE } from './drkr-reader';
import { imageExporter } from './image-exporter';

const DRKR_VERSION = '1.0';
const APP_VERSION = '1.0.0'; // Browser version

// Types for DRKR format
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
	color: { space: string; depth: number };
	background?: { type: string };
	layers: DrkrLayerRef[];
}

interface DrkrLayerRef {
	id: string;
	type: string;
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
	clipping_mask: boolean;
	storage: {
		format: string;
		mode: string;
	};
}

export class DrkrWriter {
	private zip: JSZip;
	private useWebP: boolean;

	constructor() {
		this.zip = new JSZip();
		// Check if WebP encoding is supported
		this.useWebP = this.checkWebPSupport();
	}

	/**
	 * Check if the browser supports WebP encoding
	 */
	private checkWebPSupport(): boolean {
		const canvas = document.createElement('canvas');
		canvas.width = 1;
		canvas.height = 1;
		return canvas.toDataURL('image/webp').startsWith('data:image/webp');
	}

	/**
	 * Write a complete document to a DRKR file
	 */
	async writeDocument(
		doc: Document,
		layerPixels: Map<string, Uint8ClampedArray>
	): Promise<Blob> {
		// 1. Write mimetype (MUST be first)
		this.writeMimetype();

		// 2. Write manifest
		this.writeManifest();

		// 3. Write document.json
		this.writeDocumentJson(doc);

		// 4. Write thumbnail and merged preview
		await this.writeThumbnail(doc, layerPixels);
		await this.writeMergedPreview(doc, layerPixels);

		// 5. Write layers
		for (const layer of doc.layers) {
			const pixels = layerPixels.get(layer.id);
			if (pixels) {
				await this.writeLayer(layer, pixels);
			}
		}

		// Generate the ZIP blob
		return this.zip.generateAsync({
			type: 'blob',
			compression: 'DEFLATE',
			compressionOptions: { level: 6 }
		});
	}

	/**
	 * Write the mimetype file (uncompressed, first entry)
	 */
	private writeMimetype(): void {
		// Note: JSZip doesn't guarantee order or allow per-file compression options easily
		// The mimetype being first and uncompressed is a convention from ODF/EPUB
		// For browser usage this is less critical, but we still write it first
		this.zip.file('mimetype', DRKR_MIMETYPE, { compression: 'STORE' });
	}

	/**
	 * Write the manifest.json
	 */
	private writeManifest(): void {
		const now = new Date().toISOString();
		const manifest: DrkrManifest = {
			drkr_version: DRKR_VERSION,
			generator: {
				name: 'Darker Browser',
				version: APP_VERSION,
				url: 'https://github.com/darker'
			},
			created_at: now,
			modified_at: now
		};

		this.zip.file('manifest.json', JSON.stringify(manifest, null, 2));
	}

	/**
	 * Write the document.json
	 */
	private writeDocumentJson(doc: Document): void {
		const drkrDoc: DrkrDocument = {
			id: doc.id,
			name: doc.name,
			width: doc.width,
			height: doc.height,
			resolution: {
				value: doc.resolution,
				unit: 'ppi'
			},
			color: {
				space: 'srgb',
				depth: 8
			},
			background: { type: 'transparent' },
			layers: doc.layers.map((layer) => ({
				id: layer.id,
				type: layer.type
			}))
		};

		this.zip.file('document.json', JSON.stringify(drkrDoc, null, 2));
	}

	/**
	 * Write a layer's metadata and pixels
	 */
	private async writeLayer(layer: Layer, pixels: Uint8ClampedArray): Promise<void> {
		const layerDir = `layers/${layer.id}`;

		// Write meta.json
		const meta: DrkrLayerMeta = {
			id: layer.id,
			type: layer.type,
			name: layer.name,
			visible: layer.visible,
			locked: layer.locked,
			opacity: layer.opacity,
			blend_mode: this.blendModeToString(layer.blendMode),
			position: { x: layer.x, y: layer.y },
			size: { width: layer.width, height: layer.height },
			clipping_mask: layer.clippingMask ?? false,
			storage: {
				format: this.useWebP ? 'webp' : 'png',
				mode: 'single'
			}
		};

		this.zip.file(`${layerDir}/meta.json`, JSON.stringify(meta, null, 2));

		// Encode and write pixels
		const imageBlob = await this.encodePixels(pixels, layer.width, layer.height);
		const ext = this.useWebP ? 'webp' : 'png';
		const arrayBuffer = await imageBlob.arrayBuffer();
		this.zip.file(`${layerDir}/pixels.${ext}`, new Uint8Array(arrayBuffer));
	}

	/**
	 * Write the thumbnail preview
	 */
	private async writeThumbnail(
		doc: Document,
		layerPixels: Map<string, Uint8ClampedArray>
	): Promise<void> {
		// Composite all visible layers
		const composited = imageExporter.compositeLayers(
			doc.layers,
			layerPixels,
			doc.width,
			doc.height
		);

		// Scale to thumbnail size (max 256x256)
		const scaled = await this.scalePixels(composited, doc.width, doc.height, 256, 256);

		// Encode
		const blob = await this.encodePixels(scaled.pixels, scaled.width, scaled.height);
		const ext = this.useWebP ? 'webp' : 'png';
		const arrayBuffer = await blob.arrayBuffer();
		this.zip.file(`preview/thumbnail.${ext}`, new Uint8Array(arrayBuffer));
	}

	/**
	 * Write the merged preview (full resolution)
	 */
	private async writeMergedPreview(
		doc: Document,
		layerPixels: Map<string, Uint8ClampedArray>
	): Promise<void> {
		// Composite all visible layers
		const composited = imageExporter.compositeLayers(
			doc.layers,
			layerPixels,
			doc.width,
			doc.height
		);

		// Encode at full resolution
		const blob = await this.encodePixels(composited, doc.width, doc.height);
		const ext = this.useWebP ? 'webp' : 'png';
		const arrayBuffer = await blob.arrayBuffer();
		this.zip.file(`preview/merged.${ext}`, new Uint8Array(arrayBuffer));
	}

	/**
	 * Encode pixels to PNG or WebP
	 */
	private async encodePixels(
		pixels: Uint8ClampedArray,
		width: number,
		height: number
	): Promise<Blob> {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;

		const ctx = canvas.getContext('2d');
		if (!ctx) {
			throw new Error('Failed to get canvas context');
		}

		// Create ImageData from pixels (need to create a proper copy)
		const pixelsCopy = new Uint8ClampedArray(pixels.length);
		pixelsCopy.set(pixels);
		const imageData = new ImageData(pixelsCopy, width, height);
		ctx.putImageData(imageData, 0, 0);

		return new Promise((resolve, reject) => {
			const mimeType = this.useWebP ? 'image/webp' : 'image/png';
			const quality = this.useWebP ? 0.9 : undefined;

			canvas.toBlob(
				(blob) => {
					if (blob) {
						resolve(blob);
					} else {
						reject(new Error('Failed to encode image'));
					}
				},
				mimeType,
				quality
			);
		});
	}

	/**
	 * Scale pixels to fit within max dimensions
	 */
	private async scalePixels(
		pixels: Uint8ClampedArray,
		srcWidth: number,
		srcHeight: number,
		maxWidth: number,
		maxHeight: number
	): Promise<{ pixels: Uint8ClampedArray; width: number; height: number }> {
		// Calculate scaled dimensions
		if (srcWidth <= maxWidth && srcHeight <= maxHeight) {
			return { pixels, width: srcWidth, height: srcHeight };
		}

		const scaleX = maxWidth / srcWidth;
		const scaleY = maxHeight / srcHeight;
		const scale = Math.min(scaleX, scaleY);

		const newWidth = Math.round(srcWidth * scale);
		const newHeight = Math.round(srcHeight * scale);

		// Use canvas for scaling
		const srcCanvas = document.createElement('canvas');
		srcCanvas.width = srcWidth;
		srcCanvas.height = srcHeight;
		const srcCtx = srcCanvas.getContext('2d');
		if (!srcCtx) {
			throw new Error('Failed to get canvas context');
		}

		// Create ImageData from pixels
		const pixelsCopy = new Uint8ClampedArray(pixels.length);
		pixelsCopy.set(pixels);
		const imageData = new ImageData(pixelsCopy, srcWidth, srcHeight);
		srcCtx.putImageData(imageData, 0, 0);

		// Scale to destination canvas
		const dstCanvas = document.createElement('canvas');
		dstCanvas.width = newWidth;
		dstCanvas.height = newHeight;
		const dstCtx = dstCanvas.getContext('2d');
		if (!dstCtx) {
			throw new Error('Failed to get canvas context');
		}

		// Use high-quality scaling
		dstCtx.imageSmoothingEnabled = true;
		dstCtx.imageSmoothingQuality = 'high';
		dstCtx.drawImage(srcCanvas, 0, 0, newWidth, newHeight);

		const scaledImageData = dstCtx.getImageData(0, 0, newWidth, newHeight);
		return {
			pixels: scaledImageData.data,
			width: newWidth,
			height: newHeight
		};
	}

	/**
	 * Convert blend mode to string format used in DRKR
	 */
	private blendModeToString(mode: BlendMode): string {
		switch (mode) {
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
			case 'colorDodge':
				return 'color-dodge';
			case 'colorBurn':
				return 'color-burn';
			case 'hardLight':
				return 'hard-light';
			case 'softLight':
				return 'soft-light';
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

/**
 * Convenience function to save a document as DRKR
 */
export async function saveToDrkr(
	doc: Document,
	layerPixels: Map<string, Uint8ClampedArray>
): Promise<Blob> {
	const writer = new DrkrWriter();
	return writer.writeDocument(doc, layerPixels);
}
