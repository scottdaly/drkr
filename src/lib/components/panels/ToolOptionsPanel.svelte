<script lang="ts">
	import ToolOptionsContent from './ToolOptionsContent.svelte';
</script>

<div class="panel">
	<header class="panel-header">
		<h3>Tool Options</h3>
	</header>

	<div class="panel-content">
		<ToolOptionsContent />
	</div>
</div>

<style>
	.panel {
		@apply flex flex-col bg-editor-panel border-b border-editor-border;
	}

	.panel-header {
		@apply flex items-center px-3 py-2 border-b border-editor-border;
	}

	.panel-header h3 {
		@apply text-sm font-medium text-editor-text;
	}

	.panel-content {
		@apply flex-1 overflow-y-auto;
	}
</style>
