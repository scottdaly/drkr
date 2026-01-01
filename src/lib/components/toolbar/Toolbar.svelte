<script lang="ts">
	import { activeTool, setTool } from '$lib/stores/tools';
	import type { ToolType } from '$lib/types/tools';
	import ToolButton from './ToolButton.svelte';
	import {
		MousePointer2,
		Hand,
		Square,
		Circle,
		Lasso,
		Paintbrush,
		Eraser,
		Pipette,
		Crop,
		Type,
		Shapes,
		ZoomIn
	} from 'lucide-svelte';

	const tools: { id: ToolType; icon: typeof MousePointer2; label: string; shortcut?: string }[] = [
		{ id: 'move', icon: MousePointer2, label: 'Move', shortcut: 'V' },
		{ id: 'hand', icon: Hand, label: 'Hand', shortcut: 'H' },
		{ id: 'select-rect', icon: Square, label: 'Rectangular Selection', shortcut: 'M' },
		{ id: 'select-ellipse', icon: Circle, label: 'Elliptical Selection' },
		{ id: 'select-lasso', icon: Lasso, label: 'Lasso Selection', shortcut: 'L' },
		{ id: 'brush', icon: Paintbrush, label: 'Brush', shortcut: 'B' },
		{ id: 'eraser', icon: Eraser, label: 'Eraser', shortcut: 'E' },
		{ id: 'eyedropper', icon: Pipette, label: 'Eyedropper', shortcut: 'I' },
		{ id: 'crop', icon: Crop, label: 'Crop', shortcut: 'C' },
		{ id: 'text', icon: Type, label: 'Text', shortcut: 'T' },
		{ id: 'shape', icon: Shapes, label: 'Shape', shortcut: 'U' },
		{ id: 'zoom', icon: ZoomIn, label: 'Zoom', shortcut: 'Z' }
	];
</script>

<div class="toolbar">
	{#each tools as tool}
		<ToolButton
			icon={tool.icon}
			label={tool.label}
			shortcut={tool.shortcut}
			active={$activeTool === tool.id}
			on:click={() => setTool(tool.id)}
		/>
	{/each}
</div>

<style>
	.toolbar {
		@apply flex items-center gap-1 px-2 py-1 bg-editor-panel border-b border-editor-border;
	}
</style>
