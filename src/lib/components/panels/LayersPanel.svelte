<script lang="ts">
	import {
		document,
		activeLayerId,
		setActiveLayer,
		addNewLayer,
		deleteLayer,
		updateLayerProperty
	} from '$lib/stores/documents';
	import { Eye, EyeOff, Lock, Unlock, Plus, Trash2 } from 'lucide-svelte';

	async function toggleVisibility(layerId: string, currentVisible: boolean) {
		await updateLayerProperty(layerId, { visible: !currentVisible });
	}

	async function toggleLock(layerId: string, currentLocked: boolean) {
		await updateLayerProperty(layerId, { locked: !currentLocked });
	}

	async function handleAddLayer() {
		const layerNum = ($document?.layers.length ?? 0) + 1;
		await addNewLayer(`Layer ${layerNum}`);
	}

	async function handleDeleteLayer(layerId: string) {
		await deleteLayer(layerId);
	}
</script>

<div class="panel">
	<header class="panel-header">
		<h3>Layers</h3>
		<div class="panel-actions">
			<button
				class="icon-btn"
				on:click={handleAddLayer}
				title="New Layer"
				disabled={!$document}
			>
				<Plus size={16} />
			</button>
		</div>
	</header>

	<div class="panel-content">
		{#if $document}
			<ul class="layer-list">
				{#each [...$document.layers].reverse() as layer (layer.id)}
					<li
						class="layer-item"
						class:active={layer.id === $activeLayerId}
						role="button"
						tabindex="0"
						on:click={() => setActiveLayer(layer.id)}
						on:keydown={(e) => e.key === 'Enter' && setActiveLayer(layer.id)}
					>
						<button
							class="visibility-toggle"
							on:click|stopPropagation={() => toggleVisibility(layer.id, layer.visible)}
							title={layer.visible ? 'Hide layer' : 'Show layer'}
						>
							{#if layer.visible}
								<Eye size={14} />
							{:else}
								<EyeOff size={14} />
							{/if}
						</button>

						<div class="layer-thumbnail" class:transparent={!layer.visible}>
							<!-- Layer thumbnail would be rendered here -->
						</div>

						<div class="layer-info">
							<span class="layer-name">{layer.name}</span>
							<span class="layer-opacity">{layer.opacity}%</span>
						</div>

						<button
							class="lock-toggle"
							on:click|stopPropagation={() => toggleLock(layer.id, layer.locked)}
							title={layer.locked ? 'Unlock layer' : 'Lock layer'}
						>
							{#if layer.locked}
								<Lock size={12} />
							{:else}
								<Unlock size={12} />
							{/if}
						</button>

						<button
							class="delete-btn"
							on:click|stopPropagation={() => handleDeleteLayer(layer.id)}
							title="Delete layer"
							disabled={$document.layers.length <= 1}
						>
							<Trash2 size={12} />
						</button>
					</li>
				{/each}
			</ul>

			<div class="layer-actions">
				<label class="opacity-control">
					<span>Opacity:</span>
					{#if $activeLayerId}
						{@const activeLayer = $document.layers.find((l) => l.id === $activeLayerId)}
						{#if activeLayer}
							<input
								type="range"
								min="0"
								max="100"
								value={activeLayer.opacity}
								on:input={(e) =>
									updateLayerProperty($activeLayerId, {
										opacity: parseInt(e.currentTarget.value)
									})}
							/>
							<span class="opacity-value">{activeLayer.opacity}%</span>
						{/if}
					{/if}
				</label>
			</div>
		{:else}
			<p class="empty-message">No document open</p>
		{/if}
	</div>
</div>

<style>
	.panel {
		@apply flex flex-col flex-1 bg-editor-panel;
	}

	.panel-header {
		@apply flex items-center justify-between px-3 py-2 border-b border-editor-border;
	}

	.panel-header h3 {
		@apply text-sm font-medium text-editor-text;
	}

	.panel-actions {
		@apply flex gap-1;
	}

	.icon-btn {
		@apply p-1 rounded text-editor-text-muted hover:text-editor-text
			   hover:bg-editor-border transition-colors
			   disabled:opacity-50 disabled:cursor-not-allowed;
	}

	.panel-content {
		@apply flex-1 overflow-y-auto flex flex-col;
	}

	.layer-list {
		@apply flex-1 flex flex-col;
	}

	.layer-item {
		@apply flex items-center gap-2 px-2 py-1.5 cursor-pointer
			   hover:bg-editor-border/50 transition-colors;
	}

	.layer-item.active {
		@apply bg-editor-accent/20;
	}

	.visibility-toggle,
	.lock-toggle,
	.delete-btn {
		@apply p-0.5 text-editor-text-muted hover:text-editor-text transition-colors;
	}

	.delete-btn {
		@apply opacity-0 hover:text-red-400 disabled:opacity-0;
	}

	.layer-item:hover .delete-btn:not(:disabled) {
		@apply opacity-100;
	}

	.layer-thumbnail {
		@apply w-8 h-8 bg-white rounded border border-editor-border
			   bg-[length:8px_8px] bg-[linear-gradient(45deg,#ccc_25%,transparent_25%,transparent_75%,#ccc_75%),linear-gradient(45deg,#ccc_25%,transparent_25%,transparent_75%,#ccc_75%)]
			   bg-[position:0_0,4px_4px];
	}

	.layer-thumbnail.transparent {
		@apply opacity-50;
	}

	.layer-info {
		@apply flex-1 flex flex-col min-w-0;
	}

	.layer-name {
		@apply truncate text-sm text-editor-text;
	}

	.layer-opacity {
		@apply text-xs text-editor-text-muted;
	}

	.layer-actions {
		@apply p-2 border-t border-editor-border;
	}

	.opacity-control {
		@apply flex items-center gap-2 text-sm text-editor-text;
	}

	.opacity-control input[type='range'] {
		@apply flex-1 h-1 bg-editor-border rounded-full appearance-none cursor-pointer;
	}

	.opacity-control input[type='range']::-webkit-slider-thumb {
		@apply w-3 h-3 bg-editor-text rounded-full appearance-none cursor-pointer;
	}

	.opacity-value {
		@apply w-10 text-right text-editor-text-muted text-xs;
	}

	.empty-message {
		@apply p-4 text-sm text-editor-text-muted text-center;
	}
</style>
