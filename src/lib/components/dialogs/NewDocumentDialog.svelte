<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { X } from 'lucide-svelte';

	export let open = false;

	const dispatch = createEventDispatcher<{
		create: { name: string; width: number; height: number; resolution: number };
		cancel: void;
	}>();

	let name = 'Untitled';
	let width = 1920;
	let height = 1080;
	let resolution = 72;

	// Preset dimensions
	const presets = [
		{ label: 'HD (1920x1080)', width: 1920, height: 1080 },
		{ label: '4K (3840x2160)', width: 3840, height: 2160 },
		{ label: 'Square (1080x1080)', width: 1080, height: 1080 },
		{ label: 'Instagram Story (1080x1920)', width: 1080, height: 1920 },
		{ label: 'A4 @ 300ppi', width: 2480, height: 3508 },
		{ label: 'Letter @ 300ppi', width: 2550, height: 3300 }
	];

	function applyPreset(preset: (typeof presets)[0]) {
		width = preset.width;
		height = preset.height;
	}

	function handleSubmit() {
		dispatch('create', { name, width, height, resolution });
		resetForm();
	}

	function handleCancel() {
		dispatch('cancel');
		resetForm();
	}

	function resetForm() {
		name = 'Untitled';
		width = 1920;
		height = 1080;
		resolution = 72;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			handleCancel();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
	<div class="overlay" on:click={handleCancel} role="presentation">
		<div class="dialog" on:click|stopPropagation role="dialog" aria-modal="true" aria-labelledby="dialog-title">
			<header class="dialog-header">
				<h2 id="dialog-title">New Document</h2>
				<button class="close-btn" on:click={handleCancel} aria-label="Close">
					<X size={18} />
				</button>
			</header>

			<form on:submit|preventDefault={handleSubmit}>
				<div class="dialog-content">
					<div class="form-group">
						<label for="doc-name">Name</label>
						<input
							type="text"
							id="doc-name"
							bind:value={name}
							placeholder="Document name"
						/>
					</div>

					<div class="form-row">
						<div class="form-group">
							<label for="doc-width">Width (px)</label>
							<input
								type="number"
								id="doc-width"
								bind:value={width}
								min="1"
								max="30000"
							/>
						</div>

						<div class="form-group">
							<label for="doc-height">Height (px)</label>
							<input
								type="number"
								id="doc-height"
								bind:value={height}
								min="1"
								max="30000"
							/>
						</div>

						<div class="form-group">
							<label for="doc-resolution">Resolution (ppi)</label>
							<input
								type="number"
								id="doc-resolution"
								bind:value={resolution}
								min="1"
								max="1200"
							/>
						</div>
					</div>

					<div class="presets">
						<span class="presets-label">Presets:</span>
						<div class="preset-buttons">
							{#each presets as preset}
								<button
									type="button"
									class="preset-btn"
									on:click={() => applyPreset(preset)}
								>
									{preset.label}
								</button>
							{/each}
						</div>
					</div>

					<div class="size-info">
						Estimated size: {((width * height * 4) / 1024 / 1024).toFixed(1)} MB
					</div>
				</div>

				<footer class="dialog-footer">
					<button type="button" class="btn btn-secondary" on:click={handleCancel}>
						Cancel
					</button>
					<button type="submit" class="btn btn-primary">
						Create
					</button>
				</footer>
			</form>
		</div>
	</div>
{/if}

<style>
	.overlay {
		@apply fixed inset-0 bg-black/60 flex items-center justify-center z-50;
	}

	.dialog {
		@apply bg-editor-panel rounded-lg shadow-2xl w-full max-w-md
			   border border-editor-border;
	}

	.dialog-header {
		@apply flex items-center justify-between px-4 py-3 border-b border-editor-border;
	}

	.dialog-header h2 {
		@apply text-lg font-semibold text-editor-text;
	}

	.close-btn {
		@apply p-1 rounded text-editor-text-muted hover:text-editor-text
			   hover:bg-editor-border transition-colors;
	}

	.dialog-content {
		@apply p-4 space-y-4;
	}

	.form-group {
		@apply flex flex-col gap-1;
	}

	.form-group label {
		@apply text-sm text-editor-text-muted;
	}

	.form-group input {
		@apply w-full px-3 py-2 bg-editor-bg border border-editor-border rounded
			   text-editor-text focus:border-editor-accent outline-none;
	}

	.form-row {
		@apply grid grid-cols-3 gap-3;
	}

	.presets {
		@apply space-y-2;
	}

	.presets-label {
		@apply text-sm text-editor-text-muted;
	}

	.preset-buttons {
		@apply flex flex-wrap gap-2;
	}

	.preset-btn {
		@apply px-2 py-1 text-xs bg-editor-bg border border-editor-border rounded
			   text-editor-text hover:border-editor-accent transition-colors;
	}

	.size-info {
		@apply text-sm text-editor-text-muted text-center pt-2 border-t border-editor-border;
	}

	.dialog-footer {
		@apply flex justify-end gap-2 px-4 py-3 border-t border-editor-border;
	}

	.btn {
		@apply px-4 py-2 rounded font-medium transition-colors;
	}

	.btn-secondary {
		@apply bg-editor-bg border border-editor-border text-editor-text
			   hover:bg-editor-border;
	}

	.btn-primary {
		@apply bg-editor-accent text-white hover:bg-editor-accent-hover;
	}
</style>
