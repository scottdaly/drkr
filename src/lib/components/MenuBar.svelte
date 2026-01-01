<script lang="ts">
	import { get } from 'svelte/store';
	import { createEventDispatcher } from 'svelte';
	import {
		document,
		isDirty,
		openDocumentFromFile,
		saveDocument,
		saveDocumentAs,
		closeDocument,
		fitToScreen,
		setZoom,
		viewport
	} from '$lib/stores/documents';
	import { history, canUndo, canRedo, undoName, redoName } from '$lib/stores/history';
	import { FilePlus, FolderOpen, Save, Download, X, Undo2, Redo2, ZoomIn, ZoomOut, Maximize } from 'lucide-svelte';

	const dispatch = createEventDispatcher<{
		newDocument: void;
	}>();

	let activeMenu: string | null = null;

	function toggleMenu(menu: string) {
		activeMenu = activeMenu === menu ? null : menu;
	}

	function closeMenu() {
		activeMenu = null;
	}

	function handleNewDocument() {
		dispatch('newDocument');
		closeMenu();
	}

	async function handleOpen() {
		closeMenu();
		try {
			await openDocumentFromFile();
		} catch (e) {
			console.error('Failed to open document:', e);
		}
	}

	async function handleSave() {
		closeMenu();
		try {
			await saveDocument();
		} catch (e) {
			console.error('Failed to save document:', e);
		}
	}

	async function handleSaveAs() {
		closeMenu();
		try {
			await saveDocumentAs();
		} catch (e) {
			console.error('Failed to save document:', e);
		}
	}

	async function handleClose() {
		closeMenu();
		await closeDocument();
	}

	function handleUndo() {
		closeMenu();
		history.undo();
	}

	function handleRedo() {
		closeMenu();
		history.redo();
	}

	function handleZoomIn() {
		closeMenu();
		const currentZoom = get(viewport).zoom;
		setZoom(currentZoom * 1.25);
	}

	function handleZoomOut() {
		closeMenu();
		const currentZoom = get(viewport).zoom;
		setZoom(currentZoom / 1.25);
	}

	function handleFitToScreen() {
		closeMenu();
		fitToScreen();
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.menu-bar')) {
			closeMenu();
		}
	}
</script>

<svelte:window on:click={handleClickOutside} />

<nav class="menu-bar">
	<div class="menu-item">
		<button
			class="menu-trigger"
			class:active={activeMenu === 'file'}
			on:click|stopPropagation={() => toggleMenu('file')}
		>
			File
		</button>

		{#if activeMenu === 'file'}
			<div class="menu-dropdown">
				<button class="menu-option" on:click={handleNewDocument}>
					<FilePlus size={14} />
					<span>New</span>
					<span class="shortcut">Ctrl+N</span>
				</button>

				<button class="menu-option" on:click={handleOpen}>
					<FolderOpen size={14} />
					<span>Open...</span>
					<span class="shortcut">Ctrl+O</span>
				</button>

				<div class="menu-divider"></div>

				<button class="menu-option" on:click={handleSave} disabled={!$document}>
					<Save size={14} />
					<span>Save</span>
					<span class="shortcut">Ctrl+S</span>
				</button>

				<button class="menu-option" on:click={handleSaveAs} disabled={!$document}>
					<Download size={14} />
					<span>Save As...</span>
					<span class="shortcut">Ctrl+Shift+S</span>
				</button>

				<div class="menu-divider"></div>

				<button class="menu-option" on:click={handleClose} disabled={!$document}>
					<X size={14} />
					<span>Close</span>
					<span class="shortcut">Ctrl+W</span>
				</button>
			</div>
		{/if}
	</div>

	<div class="menu-item">
		<button
			class="menu-trigger"
			class:active={activeMenu === 'edit'}
			on:click|stopPropagation={() => toggleMenu('edit')}
		>
			Edit
		</button>

		{#if activeMenu === 'edit'}
			<div class="menu-dropdown">
				<button class="menu-option" disabled={!$canUndo} on:click={handleUndo}>
					<Undo2 size={14} />
					<span>{$undoName ? `Undo ${$undoName}` : 'Undo'}</span>
					<span class="shortcut">Ctrl+Z</span>
				</button>
				<button class="menu-option" disabled={!$canRedo} on:click={handleRedo}>
					<Redo2 size={14} />
					<span>{$redoName ? `Redo ${$redoName}` : 'Redo'}</span>
					<span class="shortcut">Ctrl+Shift+Z</span>
				</button>
			</div>
		{/if}
	</div>

	<div class="menu-item">
		<button
			class="menu-trigger"
			class:active={activeMenu === 'view'}
			on:click|stopPropagation={() => toggleMenu('view')}
		>
			View
		</button>

		{#if activeMenu === 'view'}
			<div class="menu-dropdown">
				<button class="menu-option" disabled={!$document} on:click={handleZoomIn}>
					<ZoomIn size={14} />
					<span>Zoom In</span>
					<span class="shortcut">Ctrl+=</span>
				</button>
				<button class="menu-option" disabled={!$document} on:click={handleZoomOut}>
					<ZoomOut size={14} />
					<span>Zoom Out</span>
					<span class="shortcut">Ctrl+-</span>
				</button>
				<div class="menu-divider"></div>
				<button class="menu-option" disabled={!$document} on:click={handleFitToScreen}>
					<Maximize size={14} />
					<span>Fit to Screen</span>
					<span class="shortcut">Ctrl+0</span>
				</button>
			</div>
		{/if}
	</div>

	<div class="spacer"></div>

	{#if $document}
		<div class="document-info">
			<span class="document-name">
				{$document.name}{$isDirty ? ' *' : ''}
			</span>
			<span class="document-size">
				{$document.width} x {$document.height}
			</span>
		</div>
	{/if}
</nav>

<style>
	.menu-bar {
		@apply flex items-center h-8 bg-editor-panel border-b border-editor-border px-1;
	}

	.menu-item {
		@apply relative;
	}

	.menu-trigger {
		@apply px-3 py-1 text-sm text-editor-text hover:bg-editor-border rounded transition-colors;
	}

	.menu-trigger.active {
		@apply bg-editor-border;
	}

	.menu-dropdown {
		@apply absolute top-full left-0 mt-0.5 min-w-48 py-1
			   bg-editor-panel border border-editor-border rounded shadow-lg z-50;
	}

	.menu-option {
		@apply flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left
			   text-editor-text hover:bg-editor-accent/20 transition-colors
			   disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent;
	}

	.menu-option span:first-of-type {
		@apply flex-1;
	}

	.shortcut {
		@apply text-xs text-editor-text-muted;
	}

	.menu-divider {
		@apply my-1 border-t border-editor-border;
	}

	.spacer {
		@apply flex-1;
	}

	.document-info {
		@apply flex items-center gap-3 px-3 text-sm;
	}

	.document-name {
		@apply text-editor-text;
	}

	.document-size {
		@apply text-editor-text-muted;
	}
</style>
