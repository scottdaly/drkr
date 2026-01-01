<script lang="ts">
	import { slide } from 'svelte/transition';
	import { activeLayer } from '$lib/stores/documents';
	import { aiState, isAIProcessing } from '$lib/stores/ai';
	import { Wand2, Eraser, ArrowUpCircle, Paintbrush, ChevronDown, ChevronRight } from 'lucide-svelte';

	let collapsed = false;
	let prompt = '';
	let previewMode = true;
	let selectedProvider: 'auto' | 'google' | 'openai' | 'stability' = 'auto';

	function toggleCollapsed() {
		collapsed = !collapsed;
	}

	async function executeEdit() {
		if (!$activeLayer || !prompt.trim()) return;

		// TODO: Invoke Tauri command
		console.log('Execute AI edit:', { prompt, previewMode, selectedProvider });
	}

	async function quickAction(action: string) {
		if (!$activeLayer) return;

		// TODO: Invoke Tauri command
		console.log('Quick action:', action);
	}
</script>

<div class="panel" class:collapsed>
	<header class="panel-header" on:click={toggleCollapsed} role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && toggleCollapsed()}>
		<div class="header-left">
			{#if collapsed}
				<ChevronRight size={14} />
			{:else}
				<ChevronDown size={14} />
			{/if}
			<Wand2 size={14} />
			<h3>AI Edit</h3>
		</div>
	</header>

	{#if !collapsed}
		<div class="panel-content" transition:slide={{ duration: 150 }}>
			{#if $activeLayer}
				<div class="prompt-section">
					<label for="ai-prompt">Describe your edit:</label>
					<textarea
						id="ai-prompt"
						bind:value={prompt}
						placeholder="e.g., Replace the background with a sunset beach"
						rows="3"
					></textarea>
				</div>

				<div class="options">
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={previewMode} />
						<span>Quick preview (512px)</span>
					</label>

					<label class="select-label">
						<span>Provider:</span>
						<select bind:value={selectedProvider}>
							<option value="auto">Auto (best quality)</option>
							<option value="google">Google AI</option>
							<option value="openai">OpenAI</option>
							<option value="stability">Stability AI</option>
						</select>
					</label>
				</div>

				<button class="generate-btn" on:click={executeEdit} disabled={$isAIProcessing || !prompt.trim()}>
					{#if $isAIProcessing}
						Processing...
					{:else}
						Generate
					{/if}
				</button>

				<hr class="divider" />

				<div class="quick-actions">
					<span class="section-label">Quick Actions</span>
					<div class="action-grid">
						<button on:click={() => quickAction('remove-bg')} disabled={$isAIProcessing}>
							<Eraser size={14} />
							<span>Remove BG</span>
						</button>
						<button on:click={() => quickAction('upscale')} disabled={$isAIProcessing}>
							<ArrowUpCircle size={14} />
							<span>Upscale 2x</span>
						</button>
						<button on:click={() => quickAction('restore-faces')} disabled={$isAIProcessing}>
							<Paintbrush size={14} />
							<span>Fix Faces</span>
						</button>
					</div>
				</div>

				{#if $aiState.costSummary}
					<div class="cost-info">
						<span>This month: ${($aiState.costSummary.monthlyCents / 100).toFixed(2)}</span>
					</div>
				{/if}

				{#if $aiState.error}
					<div class="error-message">
						{$aiState.error}
					</div>
				{/if}
			{:else}
				<p class="empty-message">Select a layer to use AI features</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.panel {
		@apply flex flex-col bg-editor-panel border-t border-editor-border;
	}

	.panel.collapsed {
		@apply flex-none;
	}

	.panel-header {
		@apply flex items-center justify-between px-3 py-2 cursor-pointer
			   hover:bg-editor-border/30 transition-colors select-none;
	}

	.panel:not(.collapsed) .panel-header {
		@apply border-b border-editor-border;
	}

	.header-left {
		@apply flex items-center gap-2;
	}

	.panel-header h3 {
		@apply text-sm font-medium text-editor-text;
	}

	.panel-content {
		@apply p-3 space-y-3 overflow-y-auto;
	}

	.prompt-section label {
		@apply block text-sm text-editor-text mb-1;
	}

	.prompt-section textarea {
		@apply w-full p-2 bg-editor-bg border border-editor-border rounded
			   text-sm text-editor-text placeholder-editor-text-muted
			   resize-none focus:border-editor-accent outline-none;
	}

	.options {
		@apply space-y-2;
	}

	.checkbox-label {
		@apply flex items-center gap-2 text-sm text-editor-text cursor-pointer;
	}

	.checkbox-label input {
		@apply w-4 h-4 rounded border-editor-border bg-editor-bg
			   checked:bg-editor-accent checked:border-editor-accent;
	}

	.select-label {
		@apply flex items-center gap-2 text-sm text-editor-text;
	}

	.select-label select {
		@apply flex-1 px-2 py-1 bg-editor-bg border border-editor-border rounded
			   text-sm text-editor-text focus:border-editor-accent outline-none;
	}

	.generate-btn {
		@apply w-full py-2 bg-editor-accent text-white rounded font-medium
			   hover:bg-editor-accent-hover transition-colors
			   disabled:opacity-50 disabled:cursor-not-allowed;
	}

	.divider {
		@apply border-editor-border;
	}

	.quick-actions {
		@apply space-y-2;
	}

	.section-label {
		@apply block text-xs text-editor-text-muted uppercase tracking-wide;
	}

	.action-grid {
		@apply grid grid-cols-3 gap-2;
	}

	.action-grid button {
		@apply flex flex-col items-center gap-1 p-2 bg-editor-bg border border-editor-border
			   rounded text-xs text-editor-text hover:border-editor-accent transition-colors
			   disabled:opacity-50 disabled:cursor-not-allowed;
	}

	.cost-info {
		@apply text-xs text-editor-text-muted text-center;
	}

	.error-message {
		@apply p-2 bg-red-500/20 border border-red-500/50 rounded text-sm text-red-400;
	}

	.empty-message {
		@apply text-sm text-editor-text-muted text-center py-4;
	}
</style>
