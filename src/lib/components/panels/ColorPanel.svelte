<script lang="ts">
	import { colors, swapColors, resetColors } from '$lib/stores/tools';
	import { RotateCcw, RefreshCw } from 'lucide-svelte';

	function colorToHex(color: { r: number; g: number; b: number }): string {
		return (
			'#' +
			[color.r, color.g, color.b].map((c) => c.toString(16).padStart(2, '0')).join('')
		);
	}

	function hexToColor(hex: string): { r: number; g: number; b: number } {
		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		if (!result) return { r: 0, g: 0, b: 0 };
		return {
			r: parseInt(result[1], 16),
			g: parseInt(result[2], 16),
			b: parseInt(result[3], 16)
		};
	}

	function handleForegroundChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const color = hexToColor(input.value);
		colors.update((c) => ({
			...c,
			foreground: { ...color, a: c.foreground.a }
		}));
	}

	function handleBackgroundChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const color = hexToColor(input.value);
		colors.update((c) => ({
			...c,
			background: { ...color, a: c.background.a }
		}));
	}
</script>

<div class="panel">
	<header class="panel-header">
		<h3>Color</h3>
		<div class="panel-actions">
			<button class="icon-btn" on:click={swapColors} title="Swap colors (X)">
				<RefreshCw size={14} />
			</button>
			<button class="icon-btn" on:click={resetColors} title="Reset colors (D)">
				<RotateCcw size={14} />
			</button>
		</div>
	</header>

	<div class="panel-content">
		<div class="color-swatches">
			<div class="swatch-container">
				<label for="foreground-color" class="swatch-label">Foreground</label>
				<div class="swatch foreground">
					<input
						type="color"
						id="foreground-color"
						value={colorToHex($colors.foreground)}
						on:input={handleForegroundChange}
					/>
				</div>
			</div>

			<div class="swatch-container">
				<label for="background-color" class="swatch-label">Background</label>
				<div class="swatch background">
					<input
						type="color"
						id="background-color"
						value={colorToHex($colors.background)}
						on:input={handleBackgroundChange}
					/>
				</div>
			</div>
		</div>

		<div class="color-values">
			<div class="color-row">
				<span class="label">R:</span>
				<span class="value">{$colors.foreground.r}</span>
				<span class="label">G:</span>
				<span class="value">{$colors.foreground.g}</span>
				<span class="label">B:</span>
				<span class="value">{$colors.foreground.b}</span>
			</div>
		</div>
	</div>
</div>

<style>
	.panel {
		@apply flex flex-col bg-editor-panel border-t border-editor-border;
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
			   hover:bg-editor-border transition-colors;
	}

	.panel-content {
		@apply p-3 space-y-3;
	}

	.color-swatches {
		@apply flex gap-4;
	}

	.swatch-container {
		@apply flex flex-col items-center gap-1;
	}

	.swatch-label {
		@apply text-xs text-editor-text-muted;
	}

	.swatch {
		@apply relative w-12 h-12 rounded border border-editor-border overflow-hidden;
	}

	.swatch input[type='color'] {
		@apply absolute inset-0 w-full h-full cursor-pointer;
		border: none;
		padding: 0;
	}

	.swatch input[type='color']::-webkit-color-swatch-wrapper {
		padding: 0;
	}

	.swatch input[type='color']::-webkit-color-swatch {
		border: none;
	}

	.color-values {
		@apply pt-2 border-t border-editor-border;
	}

	.color-row {
		@apply flex items-center gap-2 text-xs;
	}

	.color-row .label {
		@apply text-editor-text-muted;
	}

	.color-row .value {
		@apply text-editor-text w-8;
	}
</style>
