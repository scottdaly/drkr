<script lang="ts">
	export let min: number = 0;
	export let max: number = 100;
	export let step: number = 1;
	export let value: number = 50;
</script>

<input type="range" {min} {max} {step} bind:value class="slider" />

<style>
	.slider {
		@apply flex-1 h-1 bg-editor-border rounded-full appearance-none cursor-pointer;
	}

	.slider::-webkit-slider-thumb {
		@apply w-3 h-3 bg-editor-text rounded-full appearance-none cursor-pointer
			   hover:bg-editor-accent transition-colors;
	}

	.slider::-moz-range-thumb {
		@apply w-3 h-3 bg-editor-text rounded-full border-none cursor-pointer
			   hover:bg-editor-accent transition-colors;
	}

	.slider:focus {
		@apply outline-none;
	}

	.slider:focus::-webkit-slider-thumb {
		@apply ring-2 ring-editor-accent ring-offset-1 ring-offset-editor-panel;
	}
</style>
