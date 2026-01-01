<script lang="ts">
	import { history, historyList, canUndo, canRedo } from '$lib/stores/history';
	import { document } from '$lib/stores/documents';
	import { Brush, Eraser, Trash2, Image } from 'lucide-svelte';

	function getActionIcon(name: string) {
		if (name.includes('Brush')) return Brush;
		if (name.includes('Eraser')) return Eraser;
		return Image;
	}

	function handleJumpTo(index: number) {
		history.jumpTo(index);
	}

	function handleClearHistory() {
		if (confirm('Clear all history? This cannot be undone.')) {
			history.clear();
		}
	}

	function formatTime(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}
</script>

<div class="content">
	{#if $document}
		<div class="toolbar">
			<button
				class="clear-btn"
				on:click={handleClearHistory}
				disabled={!$canUndo && !$canRedo}
				title="Clear History"
			>
				<Trash2 size={12} />
				<span>Clear</span>
			</button>
		</div>

		<ul class="history-list">
			<!-- Original state (index 0) -->
			<li
				class="history-item"
				class:current={$historyList.currentIndex === 0}
				class:past={$historyList.currentIndex > 0}
				role="button"
				tabindex="0"
				on:click={() => handleJumpTo(0)}
				on:keydown={(e) => e.key === 'Enter' && handleJumpTo(0)}
			>
				<span class="action-icon">
					<Image size={14} />
				</span>
				<div class="action-info">
					<span class="action-name">Open Document</span>
				</div>
			</li>

			<!-- History entries -->
			{#each $historyList.entries as entry, i (entry.id)}
				{@const entryIndex = i + 1}
				{@const Icon = getActionIcon(entry.name)}
				<li
					class="history-item"
					class:current={$historyList.currentIndex === entryIndex}
					class:past={$historyList.currentIndex > entryIndex}
					class:future={$historyList.currentIndex < entryIndex}
					role="button"
					tabindex="0"
					on:click={() => handleJumpTo(entryIndex)}
					on:keydown={(e) => e.key === 'Enter' && handleJumpTo(entryIndex)}
				>
					<span class="action-icon">
						<Icon size={14} />
					</span>
					<div class="action-info">
						<span class="action-name">{entry.name}</span>
						<span class="action-time">{formatTime(entry.timestamp)}</span>
					</div>
				</li>
			{/each}
		</ul>

		{#if $historyList.entries.length === 0}
			<p class="empty-message">No history yet</p>
		{/if}
	{:else}
		<p class="empty-message">No document open</p>
	{/if}
</div>

<style>
	.content {
		@apply flex flex-col;
	}

	.toolbar {
		@apply flex justify-end px-2 py-1.5 border-b border-editor-border;
	}

	.clear-btn {
		@apply flex items-center gap-1 px-2 py-1 text-xs text-editor-text-muted
			   hover:text-editor-text hover:bg-editor-border/50 rounded transition-colors
			   disabled:opacity-50 disabled:cursor-not-allowed;
	}

	.history-list {
		@apply flex flex-col;
	}

	.history-item {
		@apply flex items-center gap-2 px-3 py-1.5 cursor-pointer
			   text-editor-text transition-colors;
	}

	.history-item:hover {
		@apply bg-editor-border/50;
	}

	.history-item.current {
		@apply bg-editor-accent/20 font-medium;
	}

	.history-item.past {
		@apply text-editor-text;
	}

	.history-item.future {
		@apply text-editor-text-muted opacity-60;
	}

	.action-icon {
		@apply flex items-center justify-center w-5 h-5 text-editor-text-muted;
	}

	.history-item.current .action-icon {
		@apply text-editor-accent;
	}

	.action-info {
		@apply flex-1 flex flex-col min-w-0;
	}

	.action-name {
		@apply truncate text-sm;
	}

	.action-time {
		@apply text-xs text-editor-text-muted;
	}

	.empty-message {
		@apply p-4 text-sm text-editor-text-muted text-center;
	}
</style>
