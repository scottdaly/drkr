<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { ZoomIn, ZoomOut, Maximize, Square, ArrowLeftRight } from 'lucide-svelte';

	export let x: number;
	export let y: number;
	export let visible: boolean = false;

	let menuElement: HTMLDivElement;

	const dispatch = createEventDispatcher<{
		action: 'zoom-in' | 'zoom-out' | 'fit-screen' | 'actual-size' | 'fit-width';
		close: void;
	}>();

	function handleAction(action: 'zoom-in' | 'zoom-out' | 'fit-screen' | 'actual-size' | 'fit-width') {
		dispatch('action', action);
		dispatch('close');
	}

	function handleWindowClick(event: MouseEvent) {
		if (!visible || !menuElement) return;

		// Check if click is outside the menu
		if (!menuElement.contains(event.target as Node)) {
			dispatch('close');
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			dispatch('close');
		}
	}
</script>

<svelte:window
	on:keydown={handleKeydown}
	on:mousedown={handleWindowClick}
	on:pointerdown={handleWindowClick}
/>

{#if visible}
	<div
		bind:this={menuElement}
		class="context-menu"
		style="left: {x}px; top: {y}px;"
		role="menu"
	>
		<button class="menu-item" on:click={() => handleAction('zoom-in')} role="menuitem">
			<ZoomIn size={14} />
			<span>Zoom In</span>
		</button>
		<button class="menu-item" on:click={() => handleAction('zoom-out')} role="menuitem">
			<ZoomOut size={14} />
			<span>Zoom Out</span>
		</button>
		<div class="separator"></div>
		<button class="menu-item" on:click={() => handleAction('fit-screen')} role="menuitem">
			<Maximize size={14} />
			<span>Fit to Screen</span>
		</button>
		<button class="menu-item" on:click={() => handleAction('actual-size')} role="menuitem">
			<Square size={14} />
			<span>Actual Size (100%)</span>
		</button>
		<button class="menu-item" on:click={() => handleAction('fit-width')} role="menuitem">
			<ArrowLeftRight size={14} />
			<span>Fit Width</span>
		</button>
	</div>
{/if}

<style>
	.context-menu {
		@apply fixed z-50 py-1 bg-editor-panel border border-editor-border rounded-lg shadow-xl
		       min-w-[160px];
	}

	.menu-item {
		@apply flex items-center gap-2 w-full px-3 py-1.5 text-sm text-editor-text
		       hover:bg-editor-accent/20 transition-colors text-left;
	}

	.menu-item :global(svg) {
		@apply text-editor-text-muted;
	}

	.separator {
		@apply my-1 border-t border-editor-border;
	}
</style>
