/**
 * Browser Image Exporter
 *
 * Handles exporting images to various formats (PNG, JPEG, WebP)
 * and compositing multiple layers into a single image.
 */

import type { Layer, BlendMode } from '$lib/types/document';

export type ExportFormat = 'png' | 'jpeg' | 'webp';

export interface ExportOptions {
	format: ExportFormat;
	quality?: number; // 0-1, only for JPEG and WebP
	backgroundColor?: string; // For JPEG (which doesn't support transparency)
}

export class BrowserImageExporter {
	/**
	 * Export pixel data to a Blob in the specified format
	 */
	async exportToBlob(
		pixels: Uint8ClampedArray,
		width: number,
		height: number,
		options: ExportOptions
	): Promise<Blob> {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;

		const ctx = canvas.getContext('2d');
		if (!ctx) {
			throw new Error('Failed to get canvas context');
		}

		// For JPEG, fill with background color first (no transparency support)
		if (options.format === 'jpeg' && options.backgroundColor) {
			ctx.fillStyle = options.backgroundColor;
			ctx.fillRect(0, 0, width, height);
		}

		// Create ImageData from pixels (need to create a copy with proper ArrayBuffer)
		const pixelsCopy = new Uint8ClampedArray(pixels.length);
		pixelsCopy.set(pixels);
		const imageData = new ImageData(pixelsCopy, width, height);
		ctx.putImageData(imageData, 0, 0);

		return new Promise((resolve, reject) => {
			const mimeType = this.getMimeType(options.format);
			const quality = options.quality ?? 0.92;

			canvas.toBlob(
				(blob) => {
					if (blob) {
						resolve(blob);
					} else {
						reject(new Error(`Failed to export as ${options.format}`));
					}
				},
				mimeType,
				options.format === 'png' ? undefined : quality
			);
		});
	}

	/**
	 * Export to PNG blob
	 */
	async exportToPng(pixels: Uint8ClampedArray, width: number, height: number): Promise<Blob> {
		return this.exportToBlob(pixels, width, height, { format: 'png' });
	}

	/**
	 * Export to JPEG blob
	 */
	async exportToJpeg(
		pixels: Uint8ClampedArray,
		width: number,
		height: number,
		quality: number = 0.92,
		backgroundColor: string = '#ffffff'
	): Promise<Blob> {
		return this.exportToBlob(pixels, width, height, {
			format: 'jpeg',
			quality,
			backgroundColor
		});
	}

	/**
	 * Export to WebP blob
	 */
	async exportToWebp(
		pixels: Uint8ClampedArray,
		width: number,
		height: number,
		quality: number = 0.92
	): Promise<Blob> {
		return this.exportToBlob(pixels, width, height, { format: 'webp', quality });
	}

	/**
	 * Composite multiple layers into a single pixel array
	 */
	compositeLayers(
		layers: Layer[],
		layerPixels: Map<string, Uint8ClampedArray>,
		docWidth: number,
		docHeight: number,
		backgroundColor?: string
	): Uint8ClampedArray {
		// Create output buffer
		const output = new Uint8ClampedArray(docWidth * docHeight * 4);

		// Fill with background color if specified
		if (backgroundColor) {
			const bg = this.parseColor(backgroundColor);
			for (let i = 0; i < output.length; i += 4) {
				output[i] = bg.r;
				output[i + 1] = bg.g;
				output[i + 2] = bg.b;
				output[i + 3] = 255;
			}
		}

		// Composite layers from bottom to top (reverse order since layers[0] is typically top)
		const sortedLayers = [...layers].reverse();

		for (const layer of sortedLayers) {
			if (!layer.visible) continue;

			const pixels = layerPixels.get(layer.id);
			if (!pixels) continue;

			this.compositeLayer(output, docWidth, docHeight, pixels, layer);
		}

		return output;
	}

	/**
	 * Composite a single layer onto the output buffer
	 */
	private compositeLayer(
		output: Uint8ClampedArray,
		docWidth: number,
		docHeight: number,
		layerPixels: Uint8ClampedArray,
		layer: Layer
	): void {
		const opacity = layer.opacity / 100;

		for (let ly = 0; ly < layer.height; ly++) {
			for (let lx = 0; lx < layer.width; lx++) {
				// Calculate document coordinates
				const dx = layer.x + lx;
				const dy = layer.y + ly;

				// Skip if outside document bounds
				if (dx < 0 || dx >= docWidth || dy < 0 || dy >= docHeight) continue;

				const srcIdx = (ly * layer.width + lx) * 4;
				const dstIdx = (dy * docWidth + dx) * 4;

				// Get source color with layer opacity
				const srcR = layerPixels[srcIdx];
				const srcG = layerPixels[srcIdx + 1];
				const srcB = layerPixels[srcIdx + 2];
				const srcA = (layerPixels[srcIdx + 3] / 255) * opacity;

				if (srcA === 0) continue;

				// Apply blend mode
				const [blendR, blendG, blendB] = this.applyBlendMode(
					srcR,
					srcG,
					srcB,
					output[dstIdx],
					output[dstIdx + 1],
					output[dstIdx + 2],
					layer.blendMode
				);

				// Porter-Duff "over" compositing
				const dstA = output[dstIdx + 3] / 255;
				const outA = srcA + dstA * (1 - srcA);

				if (outA > 0) {
					output[dstIdx] = (blendR * srcA + output[dstIdx] * dstA * (1 - srcA)) / outA;
					output[dstIdx + 1] = (blendG * srcA + output[dstIdx + 1] * dstA * (1 - srcA)) / outA;
					output[dstIdx + 2] = (blendB * srcA + output[dstIdx + 2] * dstA * (1 - srcA)) / outA;
					output[dstIdx + 3] = outA * 255;
				}
			}
		}
	}

	/**
	 * Apply blend mode to source and destination colors
	 */
	private applyBlendMode(
		srcR: number,
		srcG: number,
		srcB: number,
		dstR: number,
		dstG: number,
		dstB: number,
		mode: BlendMode
	): [number, number, number] {
		// Normalize to 0-1 range
		const sr = srcR / 255;
		const sg = srcG / 255;
		const sb = srcB / 255;
		const dr = dstR / 255;
		const dg = dstG / 255;
		const db = dstB / 255;

		let r: number, g: number, b: number;

		switch (mode) {
			case 'multiply':
				r = sr * dr;
				g = sg * dg;
				b = sb * db;
				break;

			case 'screen':
				r = 1 - (1 - sr) * (1 - dr);
				g = 1 - (1 - sg) * (1 - dg);
				b = 1 - (1 - sb) * (1 - db);
				break;

			case 'overlay':
				r = dr < 0.5 ? 2 * sr * dr : 1 - 2 * (1 - sr) * (1 - dr);
				g = dg < 0.5 ? 2 * sg * dg : 1 - 2 * (1 - sg) * (1 - dg);
				b = db < 0.5 ? 2 * sb * db : 1 - 2 * (1 - sb) * (1 - db);
				break;

			case 'darken':
				r = Math.min(sr, dr);
				g = Math.min(sg, dg);
				b = Math.min(sb, db);
				break;

			case 'lighten':
				r = Math.max(sr, dr);
				g = Math.max(sg, dg);
				b = Math.max(sb, db);
				break;

			case 'colorDodge':
				r = dr === 0 ? 0 : sr === 1 ? 1 : Math.min(1, dr / (1 - sr));
				g = dg === 0 ? 0 : sg === 1 ? 1 : Math.min(1, dg / (1 - sg));
				b = db === 0 ? 0 : sb === 1 ? 1 : Math.min(1, db / (1 - sb));
				break;

			case 'colorBurn':
				r = dr === 1 ? 1 : sr === 0 ? 0 : 1 - Math.min(1, (1 - dr) / sr);
				g = dg === 1 ? 1 : sg === 0 ? 0 : 1 - Math.min(1, (1 - dg) / sg);
				b = db === 1 ? 1 : sb === 0 ? 0 : 1 - Math.min(1, (1 - db) / sb);
				break;

			case 'hardLight':
				r = sr < 0.5 ? 2 * sr * dr : 1 - 2 * (1 - sr) * (1 - dr);
				g = sg < 0.5 ? 2 * sg * dg : 1 - 2 * (1 - sg) * (1 - dg);
				b = sb < 0.5 ? 2 * sb * db : 1 - 2 * (1 - sb) * (1 - db);
				break;

			case 'softLight':
				r = sr < 0.5 ? dr - (1 - 2 * sr) * dr * (1 - dr) : dr + (2 * sr - 1) * (this.softLightD(dr) - dr);
				g = sg < 0.5 ? dg - (1 - 2 * sg) * dg * (1 - dg) : dg + (2 * sg - 1) * (this.softLightD(dg) - dg);
				b = sb < 0.5 ? db - (1 - 2 * sb) * db * (1 - db) : db + (2 * sb - 1) * (this.softLightD(db) - db);
				break;

			case 'difference':
				r = Math.abs(sr - dr);
				g = Math.abs(sg - dg);
				b = Math.abs(sb - db);
				break;

			case 'exclusion':
				r = sr + dr - 2 * sr * dr;
				g = sg + dg - 2 * sg * dg;
				b = sb + db - 2 * sb * db;
				break;

			case 'normal':
			default:
				r = sr;
				g = sg;
				b = sb;
				break;
		}

		return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
	}

	/**
	 * Helper function for soft light blend mode
	 */
	private softLightD(x: number): number {
		return x <= 0.25 ? ((16 * x - 12) * x + 4) * x : Math.sqrt(x);
	}

	/**
	 * Parse hex color string to RGB
	 */
	private parseColor(hex: string): { r: number; g: number; b: number } {
		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return result
			? {
					r: parseInt(result[1], 16),
					g: parseInt(result[2], 16),
					b: parseInt(result[3], 16)
				}
			: { r: 255, g: 255, b: 255 };
	}

	/**
	 * Get MIME type for export format
	 */
	private getMimeType(format: ExportFormat): string {
		switch (format) {
			case 'png':
				return 'image/png';
			case 'jpeg':
				return 'image/jpeg';
			case 'webp':
				return 'image/webp';
		}
	}
}

// Export singleton instance
export const imageExporter = new BrowserImageExporter();
