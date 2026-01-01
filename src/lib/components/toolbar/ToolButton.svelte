<script lang="ts">
	import type { ComponentType, SvelteComponent } from 'svelte';

	export let icon: ComponentType<SvelteComponent>;
	export let label: string;
	export let shortcut: string | undefined = undefined;
	export let active: boolean = false;
</script>

<button
	class="tool-button"
	class:active
	title={shortcut ? `${label} (${shortcut})` : label}
	on:click
>
	<svelte:component this={icon} size={18} />
</button>

<style>
	.tool-button {
		@apply flex items-center justify-center w-8 h-8 rounded
			   text-editor-text-muted hover:text-editor-text
			   hover:bg-editor-border transition-colors;
	}

	.tool-button.active {
		@apply text-editor-accent bg-editor-accent/20;
	}
</style>
