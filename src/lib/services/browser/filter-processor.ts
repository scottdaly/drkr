/**
 * Browser Filter Processor
 *
 * Implements image filters using pure JavaScript/Canvas 2D.
 * These are the browser-side equivalents of the Rust filters.
 */

import type { FilterParams } from '../platform';

export class BrowserFilterProcessor {
	/**
	 * Apply filter to pixel data (in-place modification)
	 */
	applyFilter(
		pixels: Uint8ClampedArray,
		width: number,
		height: number,
		filter: FilterParams
	): void {
		switch (filter.type) {
			case 'brightness':
				this.applyBrightness(pixels, filter.value);
				break;
			case 'contrast':
				this.applyContrast(pixels, filter.value);
				break;
			case 'saturation':
				this.applySaturation(pixels, filter.value);
				break;
			case 'invert':
				this.applyInvert(pixels);
				break;
			case 'grayscale':
				this.applyGrayscale(pixels);
				break;
			case 'gaussianBlur':
				this.applyBoxBlur(pixels, width, height, filter.radius);
				break;
			default:
				console.warn(`Unknown filter type: ${(filter as { type: string }).type}`);
		}
	}

	/**
	 * Brightness adjustment
	 * @param value - Amount to add to each channel (-255 to 255)
	 */
	private applyBrightness(pixels: Uint8ClampedArray, value: number): void {
		for (let i = 0; i < pixels.length; i += 4) {
			pixels[i] = Math.min(255, Math.max(0, pixels[i] + value));
			pixels[i + 1] = Math.min(255, Math.max(0, pixels[i + 1] + value));
			pixels[i + 2] = Math.min(255, Math.max(0, pixels[i + 2] + value));
			// Alpha unchanged
		}
	}

	/**
	 * Contrast adjustment
	 * @param value - Contrast factor (-255 to 255)
	 */
	private applyContrast(pixels: Uint8ClampedArray, value: number): void {
		const factor = (259 * (value + 255)) / (255 * (259 - value));
		for (let i = 0; i < pixels.length; i += 4) {
			pixels[i] = Math.min(255, Math.max(0, factor * (pixels[i] - 128) + 128));
			pixels[i + 1] = Math.min(255, Math.max(0, factor * (pixels[i + 1] - 128) + 128));
			pixels[i + 2] = Math.min(255, Math.max(0, factor * (pixels[i + 2] - 128) + 128));
		}
	}

	/**
	 * Saturation adjustment
	 * @param value - Saturation factor (-100 to 100)
	 */
	private applySaturation(pixels: Uint8ClampedArray, value: number): void {
		const factor = 1 + value / 100;
		for (let i = 0; i < pixels.length; i += 4) {
			// Calculate luminance
			const gray = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
			pixels[i] = Math.min(255, Math.max(0, gray + factor * (pixels[i] - gray)));
			pixels[i + 1] = Math.min(255, Math.max(0, gray + factor * (pixels[i + 1] - gray)));
			pixels[i + 2] = Math.min(255, Math.max(0, gray + factor * (pixels[i + 2] - gray)));
		}
	}

	/**
	 * Invert colors
	 */
	private applyInvert(pixels: Uint8ClampedArray): void {
		for (let i = 0; i < pixels.length; i += 4) {
			pixels[i] = 255 - pixels[i];
			pixels[i + 1] = 255 - pixels[i + 1];
			pixels[i + 2] = 255 - pixels[i + 2];
		}
	}

	/**
	 * Convert to grayscale
	 */
	private applyGrayscale(pixels: Uint8ClampedArray): void {
		for (let i = 0; i < pixels.length; i += 4) {
			// ITU-R BT.709 luminance formula
			const gray = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
			pixels[i] = gray;
			pixels[i + 1] = gray;
			pixels[i + 2] = gray;
		}
	}

	/**
	 * Box blur (approximates Gaussian blur)
	 * Uses two passes (horizontal + vertical) for separable blur
	 */
	private applyBoxBlur(
		pixels: Uint8ClampedArray,
		width: number,
		height: number,
		radius: number
	): void {
		const size = Math.ceil(radius);
		if (size < 1) return;

		// Create a copy of the original pixels
		const copy = new Uint8ClampedArray(pixels);

		// Horizontal pass
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				let r = 0,
					g = 0,
					b = 0,
					a = 0,
					count = 0;

				for (let dx = -size; dx <= size; dx++) {
					const nx = x + dx;
					if (nx >= 0 && nx < width) {
						const idx = (y * width + nx) * 4;
						r += copy[idx];
						g += copy[idx + 1];
						b += copy[idx + 2];
						a += copy[idx + 3];
						count++;
					}
				}

				const idx = (y * width + x) * 4;
				pixels[idx] = r / count;
				pixels[idx + 1] = g / count;
				pixels[idx + 2] = b / count;
				pixels[idx + 3] = a / count;
			}
		}

		// Copy result for vertical pass
		copy.set(pixels);

		// Vertical pass
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				let r = 0,
					g = 0,
					b = 0,
					a = 0,
					count = 0;

				for (let dy = -size; dy <= size; dy++) {
					const ny = y + dy;
					if (ny >= 0 && ny < height) {
						const idx = (ny * width + x) * 4;
						r += copy[idx];
						g += copy[idx + 1];
						b += copy[idx + 2];
						a += copy[idx + 3];
						count++;
					}
				}

				const idx = (y * width + x) * 4;
				pixels[idx] = r / count;
				pixels[idx + 1] = g / count;
				pixels[idx + 2] = b / count;
				pixels[idx + 3] = a / count;
			}
		}
	}

	/**
	 * Apply filter and return new pixel data (non-destructive)
	 */
	applyFilterCopy(
		pixels: Uint8ClampedArray,
		width: number,
		height: number,
		filter: FilterParams
	): Uint8ClampedArray {
		const copy = new Uint8ClampedArray(pixels);
		this.applyFilter(copy, width, height, filter);
		return copy;
	}
}

// Export singleton instance
export const filterProcessor = new BrowserFilterProcessor();
