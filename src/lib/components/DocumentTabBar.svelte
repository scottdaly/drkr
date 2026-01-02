<script lang="ts">
	import { createEventDispatcher, tick } from 'svelte';
	import { X, Plus } from 'lucide-svelte';
	import {
		openDocuments,
		activeDocumentId,
		documentOrder,
		switchToDocument,
		closeDocument,
		reorderTabs,
		renameDocument
	} from '$lib/stores/documents';

	const dispatch = createEventDispatcher<{ newDocument: void }>();

	let draggedTabId: string | null = null;
	let dragOverTabId: string | null = null;

	// Rename state
	let editingTabId: string | null = null;
	let editingName = '';
	let renameInput: HTMLInputElement;

	function handleTabClick(docId: string) {
		if (editingTabId !== docId) {
			switchToDocument(docId);
		}
	}

	async function handleCloseTab(event: MouseEvent, docId: string) {
		event.stopPropagation();
		await closeDocument(docId);
	}

	async function startRename(docId: string) {
		const state = $openDocuments.get(docId);
		if (!state) return;

		// Use document name (not filename from path) for editing
		editingName = state.document.name;
		editingTabId = docId;

		await tick();
		if (renameInput) {
			renameInput.focus();
			renameInput.select();
		}
	}

	async function finishRename() {
		if (editingTabId && editingName.trim()) {
			await renameDocument(editingTabId, editingName.trim());
		}
		editingTabId = null;
		editingName = '';
	}

	function cancelRename() {
		editingTabId = null;
		editingName = '';
	}

	function handleRenameKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			finishRename();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelRename();
		}
	}

	function handleDragStart(event: DragEvent, docId: string) {
		draggedTabId = docId;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', docId);
		}
	}

	function handleDragOver(event: DragEvent, docId: string) {
		event.preventDefault();
		if (draggedTabId && draggedTabId !== docId) {
			dragOverTabId = docId;
		}
	}

	function handleDragLeave() {
		dragOverTabId = null;
	}

	function handleDrop(event: DragEvent, targetDocId: string) {
		event.preventDefault();

		if (draggedTabId && draggedTabId !== targetDocId) {
			const fromIndex = $documentOrder.indexOf(draggedTabId);
			const toIndex = $documentOrder.indexOf(targetDocId);

			if (fromIndex !== -1 && toIndex !== -1) {
				reorderTabs(fromIndex, toIndex);
			}
		}

		draggedTabId = null;
		dragOverTabId = null;
	}

	function handleDragEnd() {
		draggedTabId = null;
		dragOverTabId = null;
	}

	function getDocumentDisplayName(docId: string): string {
		const state = $openDocuments.get(docId);
		if (!state) return 'Untitled';

		const doc = state.document;
		if (doc.sourcePath) {
			// Extract filename from path
			const parts = doc.sourcePath.split(/[/\\]/);
			return parts[parts.length - 1] || doc.name;
		}
		return doc.name;
	}
</script>

{#if $documentOrder.length > 0}
	<div class="tab-bar">
		<div class="tabs-container">
			{#each $documentOrder as docId (docId)}
				<button
					class="tab"
					class:active={docId === $activeDocumentId}
					class:dragging={docId === draggedTabId}
					class:drag-over={docId === dragOverTabId}
					class:editing={docId === editingTabId}
					draggable={editingTabId !== docId}
					on:click={() => handleTabClick(docId)}
					on:dblclick={() => startRename(docId)}
					on:dragstart={(e) => handleDragStart(e, docId)}
					on:dragover={(e) => handleDragOver(e, docId)}
					on:dragleave={handleDragLeave}
					on:drop={(e) => handleDrop(e, docId)}
					on:dragend={handleDragEnd}
				>
					{#if editingTabId === docId}
						<input
							type="text"
							class="rename-input"
							bind:this={renameInput}
							bind:value={editingName}
							on:blur={finishRename}
							on:keydown={handleRenameKeydown}
							on:click|stopPropagation
						/>
					{:else}
						<span class="tab-name">
							{getDocumentDisplayName(docId)}{#if $openDocuments.get(docId)?.isDirty} *{/if}
						</span>
					{/if}
					<button
						class="close-btn"
						title="Close"
						on:click={(e) => handleCloseTab(e, docId)}
					>
						<X size={12} />
					</button>
				</button>
			{/each}
			<button
				class="new-tab-btn"
				title="New Document"
				on:click={() => dispatch('newDocument')}
			>
				<Plus size={16} />
			</button>
		</div>
	</div>
{/if}

<style>
	.tab-bar {
		@apply flex items-center h-9 bg-editor-bg border-b border-editor-border overflow-hidden;
	}

	.tabs-container {
		@apply flex items-center h-full overflow-x-auto;
		scrollbar-width: thin;
	}

	.tabs-container::-webkit-scrollbar {
		height: 4px;
	}

	.tabs-container::-webkit-scrollbar-track {
		@apply bg-transparent;
	}

	.tabs-container::-webkit-scrollbar-thumb {
		@apply bg-editor-border rounded;
	}

	.tab {
		@apply flex items-center gap-1.5 h-full px-3 text-sm
			   text-editor-text-muted border-r border-editor-border
			   hover:bg-editor-panel hover:text-editor-text
			   transition-colors cursor-pointer select-none
			   min-w-0 max-w-48 shrink-0;
	}

	.tab.active {
		@apply bg-editor-panel text-editor-text border-b-2 border-b-editor-accent;
	}

	.tab.dragging {
		@apply opacity-50;
	}

	.tab.drag-over {
		@apply border-l-2 border-l-editor-accent;
	}

	.tab-name {
		@apply truncate flex-1;
	}

	.tab.editing {
		@apply cursor-text;
	}

	.rename-input {
		@apply flex-1 min-w-0 px-1 py-0.5 bg-editor-bg border border-editor-accent rounded
			   text-sm text-editor-text outline-none;
	}

	.close-btn {
		@apply p-0.5 rounded opacity-0 hover:bg-editor-border
			   transition-all shrink-0;
	}

	.tab:hover .close-btn,
	.tab.active .close-btn {
		@apply opacity-100;
	}

	.close-btn:hover {
		@apply text-editor-text;
	}

	.new-tab-btn {
		@apply flex items-center justify-center w-8 h-full
			   text-editor-text-muted hover:text-editor-text hover:bg-editor-panel
			   transition-colors shrink-0;
	}
</style>
