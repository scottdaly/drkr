/**
 * Recent Files Store
 *
 * Tracks recently opened files with localStorage persistence.
 */

import { writable, get } from 'svelte/store';

export interface RecentFile {
	path: string;
	name: string;
	lastOpened: number; // timestamp
}

const STORAGE_KEY = 'darker_recent_files';
const MAX_RECENT = 10;

export const recentFiles = writable<RecentFile[]>([]);

/**
 * Load recent files from localStorage.
 * Should be called on app initialization.
 */
export function loadRecentFiles(): void {
	if (typeof window === 'undefined') return;

	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const files = JSON.parse(stored) as RecentFile[];
			// Sort by most recent first
			files.sort((a, b) => b.lastOpened - a.lastOpened);
			recentFiles.set(files.slice(0, MAX_RECENT));
		}
	} catch (e) {
		console.warn('Failed to load recent files:', e);
		recentFiles.set([]);
	}
}

/**
 * Save recent files to localStorage.
 */
function saveRecentFiles(): void {
	if (typeof window === 'undefined') return;

	try {
		const files = get(recentFiles);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
	} catch (e) {
		console.warn('Failed to save recent files:', e);
	}
}

/**
 * Add a file to the recent files list.
 * If the file already exists, it will be moved to the top.
 */
export function addRecentFile(path: string, name: string): void {
	recentFiles.update((files) => {
		// Remove existing entry for this path
		const filtered = files.filter((f) => f.path !== path);

		// Add new entry at the beginning
		const updated = [
			{ path, name, lastOpened: Date.now() },
			...filtered
		].slice(0, MAX_RECENT);

		return updated;
	});

	saveRecentFiles();
}

/**
 * Remove a file from the recent files list.
 */
export function removeRecentFile(path: string): void {
	recentFiles.update((files) => files.filter((f) => f.path !== path));
	saveRecentFiles();
}

/**
 * Clear all recent files.
 */
export function clearRecentFiles(): void {
	recentFiles.set([]);
	saveRecentFiles();
}

/**
 * Get the filename from a path.
 */
export function getFilenameFromPath(path: string): string {
	const parts = path.split(/[/\\]/);
	return parts[parts.length - 1] || path;
}

/**
 * Format the last opened timestamp for display.
 */
export function formatLastOpened(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) return 'Just now';
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days < 7) return `${days}d ago`;

	// Show actual date for older files
	return new Date(timestamp).toLocaleDateString();
}
