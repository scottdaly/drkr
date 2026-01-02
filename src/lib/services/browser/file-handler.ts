/**
 * Browser File Handler
 *
 * Handles file operations in the browser using the File System Access API
 * with fallbacks for browsers that don't support it (Safari, Firefox).
 */

export interface OpenDialogOptions {
	multiple?: boolean;
	accept?: string;
}

export interface SaveDialogOptions {
	suggestedName?: string;
	types?: { description: string; accept: Record<string, string[]> }[];
}

// Type augmentation for File System Access API
declare global {
	interface Window {
		showOpenFilePicker?: (options?: {
			multiple?: boolean;
			types?: { description: string; accept: Record<string, string[]> }[];
		}) => Promise<FileSystemFileHandle[]>;
		showSaveFilePicker?: (options?: {
			suggestedName?: string;
			types?: { description: string; accept: Record<string, string[]> }[];
		}) => Promise<FileSystemFileHandle>;
	}
}

export class BrowserFileHandler {
	/**
	 * Show open file dialog using File System Access API or fallback
	 */
	async showOpenDialog(options?: OpenDialogOptions): Promise<File[] | null> {
		// Modern browsers (Chrome, Edge)
		if ('showOpenFilePicker' in window && window.showOpenFilePicker) {
			try {
				const handles = await window.showOpenFilePicker({
					multiple: options?.multiple ?? false,
					types: [
						{
							description: 'Darker Documents',
							accept: { 'application/x-drkr': ['.drkr'] }
						},
						{
							description: 'Images',
							accept: {
								'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']
							}
						}
					]
				});

				const files: File[] = [];
				for (const handle of handles) {
					files.push(await handle.getFile());
				}
				return files;
			} catch (e) {
				if ((e as Error).name === 'AbortError') return null;
				throw e;
			}
		}

		// Fallback for Safari and older browsers
		return new Promise((resolve) => {
			const input = document.createElement('input');
			input.type = 'file';
			input.accept = options?.accept ?? 'image/*,.drkr';
			input.multiple = options?.multiple ?? false;

			input.onchange = () => {
				if (input.files && input.files.length > 0) {
					resolve(Array.from(input.files));
				} else {
					resolve(null);
				}
			};

			// Handle cancel by detecting when file picker closes without selection
			const onFocus = () => {
				window.removeEventListener('focus', onFocus);
				setTimeout(() => {
					if (!input.files || input.files.length === 0) {
						resolve(null);
					}
				}, 300);
			};
			window.addEventListener('focus', onFocus);

			input.click();
		});
	}

	/**
	 * Show save file dialog using File System Access API
	 * Returns a file handle for saving, or null if user cancels or API unavailable
	 */
	async showSaveDialog(options?: SaveDialogOptions): Promise<FileSystemFileHandle | null> {
		if ('showSaveFilePicker' in window && window.showSaveFilePicker) {
			try {
				return await window.showSaveFilePicker({
					suggestedName: options?.suggestedName ?? 'untitled.png',
					types: options?.types ?? [
						{
							description: 'Darker Document',
							accept: { 'application/x-drkr': ['.drkr'] }
						},
						{
							description: 'PNG Image',
							accept: { 'image/png': ['.png'] }
						},
						{
							description: 'JPEG Image',
							accept: { 'image/jpeg': ['.jpg', '.jpeg'] }
						},
						{
							description: 'WebP Image',
							accept: { 'image/webp': ['.webp'] }
						}
					]
				});
			} catch (e) {
				if ((e as Error).name === 'AbortError') return null;
				throw e;
			}
		}

		// Fallback: return null, caller should use download approach
		return null;
	}

	/**
	 * Save data using File System Access API or download fallback
	 */
	async saveFile(
		data: Uint8Array | Blob,
		filename: string,
		handle?: FileSystemFileHandle | null
	): Promise<void> {
		const blob = data instanceof Blob ? data : new Blob([data.slice().buffer]);

		if (handle) {
			// Use File System Access API
			const writable = await handle.createWritable();
			await writable.write(blob);
			await writable.close();
		} else {
			// Fallback: trigger download
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		}
	}

	/**
	 * Read file as ArrayBuffer
	 */
	async readFileAsBuffer(file: File): Promise<ArrayBuffer> {
		return file.arrayBuffer();
	}

	/**
	 * Read an image file and return ImageData
	 */
	async readImageFile(file: File): Promise<ImageData> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			const url = URL.createObjectURL(file);

			img.onload = () => {
				const canvas = document.createElement('canvas');
				canvas.width = img.width;
				canvas.height = img.height;

				const ctx = canvas.getContext('2d');
				if (!ctx) {
					URL.revokeObjectURL(url);
					reject(new Error('Failed to get canvas context'));
					return;
				}

				ctx.drawImage(img, 0, 0);
				const imageData = ctx.getImageData(0, 0, img.width, img.height);
				URL.revokeObjectURL(url);
				resolve(imageData);
			};

			img.onerror = () => {
				URL.revokeObjectURL(url);
				reject(new Error('Failed to load image'));
			};

			img.src = url;
		});
	}

	/**
	 * Check if File System Access API is available
	 */
	hasFileSystemAccess(): boolean {
		return 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;
	}
}

// Export singleton instance
export const fileHandler = new BrowserFileHandler();
