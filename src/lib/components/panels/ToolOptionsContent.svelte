<script lang="ts">
	import { activeTool, brushSettings, selectionSettings, isBrushTool, isSelectionTool } from '$lib/stores/tools';
	import Slider from '$lib/components/ui/Slider.svelte';
</script>

<div class="content">
	{#if $isBrushTool}
		<div class="option-group">
			<label>
				<span>Size</span>
				<Slider
					min={1}
					max={500}
					bind:value={$brushSettings.size}
				/>
				<span class="value">{$brushSettings.size}px</span>
			</label>
		</div>

		<div class="option-group">
			<label>
				<span>Hardness</span>
				<Slider
					min={0}
					max={100}
					bind:value={$brushSettings.hardness}
				/>
				<span class="value">{$brushSettings.hardness}%</span>
			</label>
		</div>

		<div class="option-group">
			<label>
				<span>Opacity</span>
				<Slider
					min={0}
					max={100}
					bind:value={$brushSettings.opacity}
				/>
				<span class="value">{$brushSettings.opacity}%</span>
			</label>
		</div>

		<div class="option-group">
			<label>
				<span>Flow</span>
				<Slider
					min={0}
					max={100}
					bind:value={$brushSettings.flow}
				/>
				<span class="value">{$brushSettings.flow}%</span>
			</label>
		</div>
	{:else if $isSelectionTool}
		<div class="option-group">
			<label>
				<span>Mode</span>
				<select bind:value={$selectionSettings.mode}>
					<option value="new">New</option>
					<option value="add">Add</option>
					<option value="subtract">Subtract</option>
					<option value="intersect">Intersect</option>
				</select>
			</label>
		</div>

		<div class="option-group">
			<label>
				<span>Feather</span>
				<Slider
					min={0}
					max={100}
					bind:value={$selectionSettings.feather}
				/>
				<span class="value">{$selectionSettings.feather}px</span>
			</label>
		</div>

		<div class="option-group">
			<label class="checkbox-label">
				<input type="checkbox" bind:checked={$selectionSettings.antiAlias} />
				<span>Anti-alias</span>
			</label>
		</div>
	{:else}
		<p class="empty-message">No options for {$activeTool} tool</p>
	{/if}
</div>

<style>
	.content {
		@apply p-3 space-y-3;
	}

	.option-group {
		@apply space-y-1;
	}

	.option-group label {
		@apply flex items-center gap-2 text-sm text-editor-text;
	}

	.option-group label > span:first-child {
		@apply w-16 flex-shrink-0;
	}

	.option-group .value {
		@apply w-12 text-right text-editor-text-muted text-xs;
	}

	.option-group select {
		@apply flex-1 px-2 py-1 bg-editor-bg border border-editor-border rounded
			   text-sm text-editor-text focus:border-editor-accent outline-none;
	}

	.checkbox-label {
		@apply cursor-pointer;
	}

	.checkbox-label input[type='checkbox'] {
		@apply w-4 h-4 rounded border-editor-border bg-editor-bg
			   checked:bg-editor-accent checked:border-editor-accent;
	}

	.empty-message {
		@apply text-sm text-editor-text-muted text-center py-4;
	}
</style>
