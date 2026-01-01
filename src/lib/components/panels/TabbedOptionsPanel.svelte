<script lang="ts">
	import { Settings, History } from 'lucide-svelte';
	import ToolOptionsContent from './ToolOptionsContent.svelte';
	import HistoryContent from './HistoryContent.svelte';

	type Tab = 'options' | 'history';
	let activeTab: Tab = 'options';
</script>

<div class="panel">
	<header class="panel-header">
		<div class="tabs">
			<button
				class="tab"
				class:active={activeTab === 'options'}
				on:click={() => (activeTab = 'options')}
				title="Tool Options"
			>
				<Settings size={14} />
				<span>Options</span>
			</button>
			<button
				class="tab"
				class:active={activeTab === 'history'}
				on:click={() => (activeTab = 'history')}
				title="History"
			>
				<History size={14} />
				<span>History</span>
			</button>
		</div>
	</header>

	<div class="panel-content">
		{#if activeTab === 'options'}
			<ToolOptionsContent />
		{:else}
			<HistoryContent />
		{/if}
	</div>
</div>

<style>
	.panel {
		@apply flex flex-col bg-editor-panel border-b border-editor-border;
	}

	.panel-header {
		@apply border-b border-editor-border;
	}

	.tabs {
		@apply flex;
	}

	.tab {
		@apply flex items-center gap-1.5 px-3 py-2 text-sm text-editor-text-muted
			   border-b-2 border-transparent transition-colors;
	}

	.tab:hover {
		@apply text-editor-text bg-editor-border/30;
	}

	.tab.active {
		@apply text-editor-text border-editor-accent;
	}

	.panel-content {
		@apply flex-1 overflow-y-auto;
		max-height: 300px;
	}
</style>
