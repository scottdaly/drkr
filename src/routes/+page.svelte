<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import MenuBar from '$lib/components/MenuBar.svelte';
	import DocumentTabBar from '$lib/components/DocumentTabBar.svelte';
	import Toolbar from '$lib/components/toolbar/Toolbar.svelte';
	import Canvas from '$lib/components/canvas/Canvas.svelte';
	import LayersPanel from '$lib/components/panels/LayersPanel.svelte';
	import TabbedOptionsPanel from '$lib/components/panels/TabbedOptionsPanel.svelte';
	import AIPanel from '$lib/components/panels/AIPanel.svelte';
	import ColorPanel from '$lib/components/panels/ColorPanel.svelte';
	import NewDocumentDialog from '$lib/components/dialogs/NewDocumentDialog.svelte';
	import {
		createNewDocument,
		error,
		clearError,
		openDocumentFromFile,
		saveDocument,
		saveDocumentAs,
		closeDocument,
		fitToScreen,
		setZoom,
		viewport,
		document as documentStore,
		isDirty,
		getDocumentDisplayName
	} from '$lib/stores/documents';
	import { history } from '$lib/stores/history';
	import { setTool, brushSettings, swapColors, resetColors } from '$lib/stores/tools';
	import { moveEngine } from '$lib/engine/moveEngine';
	import { loadRecentFiles } from '$lib/stores/recentFiles';
	import type { ToolType } from '$lib/types/tools';

	// Load recent files on mount
	onMount(() => {
		loadRecentFiles();
	});

	// Reactive window title
	$: {
		if ($documentStore) {
			const docName = getDocumentDisplayName($documentStore);
			const dirty = $isDirty ? ' *' : '';
			if (typeof document !== 'undefined') {
				document.title = `${docName}${dirty} - Darker`;
			}
		} else {
			if (typeof document !== 'undefined') {
				document.title = 'Darker';
			}
		}
	}

	let showNewDocumentDialog = false;

	async function handleCreateDocument(
		event: CustomEvent<{
			name: string;
			width: number;
			height: number;
			resolution: number;
			background: { type: 'white' | 'black' | 'transparent' | 'custom'; color: string };
		}>
	) {
		showNewDocumentDialog = false;
		const { name, width, height, resolution, background } = event.detail;

		try {
			await createNewDocument(name, width, height, resolution, background);
		} catch (e) {
			console.error('Failed to create document:', e);
		}
	}

	function handleCancelDialog() {
		showNewDocumentDialog = false;
	}

	// Tool shortcut mapping
	const toolShortcuts: Record<string, ToolType> = {
		'v': 'move',
		'h': 'hand',
		'm': 'select-rect',
		'b': 'brush',
		'e': 'eraser',
		'i': 'eyedropper',
		'c': 'crop',
		't': 'text',
		'u': 'shape',
		'z': 'zoom'
	};

	// Keyboard shortcuts
	function handleKeydown(event: KeyboardEvent) {
		// Ignore if typing in an input
		if (
			event.target instanceof HTMLInputElement ||
			event.target instanceof HTMLTextAreaElement
		) {
			return;
		}

		const isMod = event.metaKey || event.ctrlKey;
		const key = event.key.toLowerCase();

		// === File shortcuts (with modifier) ===

		// New document (Ctrl/Cmd+N)
		if (isMod && key === 'n') {
			event.preventDefault();
			showNewDocumentDialog = true;
			return;
		}

		// Open document (Ctrl/Cmd+O)
		if (isMod && key === 'o') {
			event.preventDefault();
			openDocumentFromFile();
			return;
		}

		// Save document (Ctrl/Cmd+S)
		if (isMod && !event.shiftKey && key === 's') {
			event.preventDefault();
			saveDocument();
			return;
		}

		// Save As document (Ctrl/Cmd+Shift+S)
		if (isMod && event.shiftKey && key === 's') {
			event.preventDefault();
			saveDocumentAs();
			return;
		}

		// Close document (Ctrl/Cmd+W)
		if (isMod && key === 'w') {
			event.preventDefault();
			closeDocument();
			return;
		}

		// === Edit shortcuts (with modifier) ===

		// Undo (Ctrl/Cmd+Z)
		if (isMod && !event.shiftKey && key === 'z') {
			event.preventDefault();
			const result = history.undo();
			if (result.success) {
				moveEngine.syncFloatingSelectionAfterUndo(result.restoredSelectionBounds);
			}
			return;
		}

		// Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)
		if (isMod && event.shiftKey && key === 'z') {
			event.preventDefault();
			const result = history.redo();
			if (result.success) {
				moveEngine.syncFloatingSelectionAfterUndo(result.restoredSelectionBounds);
			}
			return;
		}
		if (isMod && key === 'y') {
			event.preventDefault();
			const result = history.redo();
			if (result.success) {
				moveEngine.syncFloatingSelectionAfterUndo(result.restoredSelectionBounds);
			}
			return;
		}

		// === View shortcuts (with modifier) ===

		// Fit to screen (Ctrl/Cmd+0)
		if (isMod && event.key === '0') {
			event.preventDefault();
			fitToScreen();
			return;
		}

		// Zoom in (Ctrl/Cmd++ or Ctrl/Cmd+=)
		if (isMod && (event.key === '+' || event.key === '=')) {
			event.preventDefault();
			const currentZoom = get(viewport).zoom;
			setZoom(currentZoom * 1.25);
			return;
		}

		// Zoom out (Ctrl/Cmd+-)
		if (isMod && event.key === '-') {
			event.preventDefault();
			const currentZoom = get(viewport).zoom;
			setZoom(currentZoom / 1.25);
			return;
		}

		// === Tool shortcuts (no modifier) ===
		if (!isMod && !event.shiftKey && !event.altKey) {
			// Tool selection
			if (toolShortcuts[key]) {
				event.preventDefault();
				setTool(toolShortcuts[key]);
				return;
			}

			// Brush size decrease ([)
			if (event.key === '[') {
				event.preventDefault();
				brushSettings.update(s => ({
					...s,
					size: Math.max(1, s.size - (s.size > 100 ? 10 : s.size > 20 ? 5 : 1))
				}));
				return;
			}

			// Brush size increase (])
			if (event.key === ']') {
				event.preventDefault();
				brushSettings.update(s => ({
					...s,
					size: Math.min(500, s.size + (s.size >= 100 ? 10 : s.size >= 20 ? 5 : 1))
				}));
				return;
			}

			// Swap foreground/background colors (X)
			if (key === 'x') {
				event.preventDefault();
				swapColors();
				return;
			}

			// Reset colors to default (D)
			if (key === 'd') {
				event.preventDefault();
				resetColors();
				return;
			}
		}

		// === Brush hardness shortcuts (with Shift) ===
		if (event.shiftKey && !isMod && !event.altKey) {
			// Decrease hardness (Shift+[)
			if (event.key === '{' || event.key === '[') {
				event.preventDefault();
				brushSettings.update(s => ({
					...s,
					hardness: Math.max(0, s.hardness - 10)
				}));
				return;
			}

			// Increase hardness (Shift+])
			if (event.key === '}' || event.key === ']') {
				event.preventDefault();
				brushSettings.update(s => ({
					...s,
					hardness: Math.min(100, s.hardness + 10)
				}));
				return;
			}
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="app-container">
	<MenuBar on:newDocument={() => (showNewDocumentDialog = true)} />
	<DocumentTabBar on:newDocument={() => (showNewDocumentDialog = true)} />
	<Toolbar />

	<div class="main-content">
		<aside class="left-panels">
			<LayersPanel />
		</aside>

		<main class="canvas-area">
			<Canvas on:newDocument={() => (showNewDocumentDialog = true)} />
		</main>

		<aside class="right-panels">
			<TabbedOptionsPanel />
			<ColorPanel />
			<AIPanel />
		</aside>
	</div>

	{#if $error}
		<div class="error-toast">
			<span>{$error}</span>
			<button on:click={clearError}>x</button>
		</div>
	{/if}
</div>

<NewDocumentDialog
	bind:open={showNewDocumentDialog}
	on:create={handleCreateDocument}
	on:cancel={handleCancelDialog}
/>

<style>
	.app-container {
		@apply flex flex-col h-screen bg-editor-bg;
	}

	.main-content {
		@apply flex flex-1 overflow-hidden;
	}

	.left-panels,
	.right-panels {
		@apply flex flex-col w-64 bg-editor-panel border-editor-border;
	}

	.left-panels {
		@apply border-r;
	}

	.right-panels {
		@apply border-l;
	}

	.canvas-area {
		@apply flex-1 overflow-hidden bg-neutral-800;
	}

	.error-toast {
		@apply fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3
			   px-4 py-2 bg-red-500/90 text-white rounded-lg shadow-lg z-50;
	}

	.error-toast button {
		@apply text-lg leading-none hover:opacity-80;
	}
</style>
