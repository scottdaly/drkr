<script lang="ts">
	import { activeTool, brushSettings, selectionSettings, isBrushTool, isSelectionTool } from '$lib/stores/tools';
	import { cropSettings, cropState, updateCropSettings } from '$lib/stores/crop';
	import { cropEngine } from '$lib/engine/cropEngine';
	import Slider from '$lib/components/ui/Slider.svelte';
	import { Check, X } from 'lucide-svelte';

	function handleCommitCrop() {
		cropEngine.commitCrop();
	}

	function handleCancelCrop() {
		cropEngine.cancel();
	}

	function handleCropToSelection() {
		cropEngine.setCropFromSelection();
	}
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
	{:else if $activeTool === 'crop'}
		<div class="option-group">
			<label>
				<span>Ratio</span>
				<select
					bind:value={$cropSettings.aspectRatio}
				>
					<option value="free">Free</option>
					<option value="original">Original</option>
					<option value="1:1">1:1 (Square)</option>
					<option value="4:3">4:3</option>
					<option value="16:9">16:9</option>
					<option value="golden">Golden Ratio</option>
					<option value="custom">Custom...</option>
				</select>
			</label>
		</div>

		{#if $cropSettings.aspectRatio === 'custom'}
			<div class="option-group custom-ratio">
				<label>
					<span>Width</span>
					<input
						type="number"
						min="1"
						max="100"
						bind:value={$cropSettings.customRatio.width}
					/>
				</label>
				<span class="ratio-separator">:</span>
				<label>
					<span class="sr-only">Height</span>
					<input
						type="number"
						min="1"
						max="100"
						bind:value={$cropSettings.customRatio.height}
					/>
				</label>
			</div>
		{/if}

		<div class="option-group">
			<label class="checkbox-label">
				<input
					type="checkbox"
					bind:checked={$cropSettings.showGrid}
				/>
				<span>Show Grid</span>
			</label>
		</div>

		{#if $cropSettings.showGrid}
			<div class="option-group">
				<label>
					<span>Grid</span>
					<select
						bind:value={$cropSettings.gridType}
					>
						<option value="thirds">Rule of Thirds</option>
						<option value="golden">Golden Ratio</option>
					</select>
				</label>
			</div>
		{/if}

		<div class="option-group">
			<label class="checkbox-label">
				<input
					type="checkbox"
					bind:checked={$cropSettings.snapEnabled}
				/>
				<span>Snap to Edges</span>
			</label>
			<span class="option-hint">Hold Alt to disable temporarily</span>
		</div>

		{#if $cropState.region}
			<div class="crop-dimensions">
				<span class="dim-label">Size:</span>
				<span class="dim-value">
					{Math.round($cropState.region.width)} × {Math.round($cropState.region.height)}
				</span>
			</div>
		{/if}

		<div class="crop-actions">
			<button class="crop-btn crop-to-selection" on:click={handleCropToSelection} title="Crop to Selection">
				Crop to Selection
			</button>
			<div class="action-row">
				<button class="crop-btn apply" on:click={handleCommitCrop} disabled={!$cropState.region}>
					<Check size={14} />
					<span>Apply</span>
				</button>
				<button class="crop-btn cancel" on:click={handleCancelCrop} disabled={!$cropState.region}>
					<X size={14} />
					<span>Cancel</span>
				</button>
			</div>
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

	.option-hint {
		@apply text-xs text-editor-text-muted ml-6;
	}

	.empty-message {
		@apply text-sm text-editor-text-muted text-center py-4;
	}

	/* Crop tool styles */
	.custom-ratio {
		@apply flex items-center gap-2;
	}

	.custom-ratio label {
		@apply flex items-center gap-1;
	}

	.custom-ratio input[type='number'] {
		@apply w-14 px-2 py-1 bg-editor-bg border border-editor-border rounded
			   text-sm text-editor-text focus:border-editor-accent outline-none;
	}

	.ratio-separator {
		@apply text-editor-text-muted font-bold;
	}

	.sr-only {
		@apply absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0;
		clip: rect(0, 0, 0, 0);
	}

	.crop-dimensions {
		@apply flex items-center gap-2 py-2 text-sm;
	}

	.dim-label {
		@apply text-editor-text-muted;
	}

	.dim-value {
		@apply text-editor-text font-mono;
	}

	.crop-actions {
		@apply flex flex-col gap-2 pt-2 border-t border-editor-border mt-2;
	}

	.action-row {
		@apply flex gap-2;
	}

	.crop-btn {
		@apply flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-sm
			   transition-colors disabled:opacity-50 disabled:cursor-not-allowed;
	}

	.crop-btn.crop-to-selection {
		@apply w-full bg-editor-bg border border-editor-border text-editor-text
			   hover:bg-editor-border/50;
	}

	.crop-btn.apply {
		@apply flex-1 bg-editor-accent text-white hover:bg-editor-accent/80;
	}

	.crop-btn.cancel {
		@apply flex-1 bg-editor-bg border border-editor-border text-editor-text
			   hover:bg-editor-border/50;
	}
</style>
