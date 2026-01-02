<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let color = '#ffffff';
	export let showSwatches = true;

	const dispatch = createEventDispatcher<{
		change: string;
	}>();

	// HSV state
	let hue = 0;
	let saturation = 0;
	let brightness = 100;

	// Quick swatches
	const swatches = [
		'#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff',
		'#ffff00', '#00ffff', '#ff00ff', '#ff8000', '#8000ff'
	];

	// Elements for drag handling
	let svArea: HTMLDivElement;
	let hueSlider: HTMLDivElement;
	let isDraggingSV = false;
	let isDraggingHue = false;

	// Initialize HSV from color prop
	$: {
		const hsv = hexToHsv(color);
		hue = hsv.h;
		saturation = hsv.s;
		brightness = hsv.v;
	}

	function hexToHsv(hex: string): { h: number; s: number; v: number } {
		const rgb = hexToRgb(hex);
		return rgbToHsv(rgb.r, rgb.g, rgb.b);
	}

	function hexToRgb(hex: string): { r: number; g: number; b: number } {
		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return result ? {
			r: parseInt(result[1], 16),
			g: parseInt(result[2], 16),
			b: parseInt(result[3], 16)
		} : { r: 255, g: 255, b: 255 };
	}

	function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
		r /= 255; g /= 255; b /= 255;
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const d = max - min;
		let h = 0;
		const s = max === 0 ? 0 : d / max;
		const v = max;

		if (max !== min) {
			switch (max) {
				case r: h = (g - b) / d + (g < b ? 6 : 0); break;
				case g: h = (b - r) / d + 2; break;
				case b: h = (r - g) / d + 4; break;
			}
			h /= 6;
		}

		return { h: h * 360, s: s * 100, v: v * 100 };
	}

	function hsvToHex(h: number, s: number, v: number): string {
		s /= 100; v /= 100;
		const c = v * s;
		const x = c * (1 - Math.abs((h / 60) % 2 - 1));
		const m = v - c;
		let r = 0, g = 0, b = 0;

		if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
		else if (h >= 60 && h < 120) { r = x; g = c; b = 0; }
		else if (h >= 120 && h < 180) { r = 0; g = c; b = x; }
		else if (h >= 180 && h < 240) { r = 0; g = x; b = c; }
		else if (h >= 240 && h < 300) { r = x; g = 0; b = c; }
		else { r = c; g = 0; b = x; }

		const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
		return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
	}

	function hueToColor(h: number): string {
		return hsvToHex(h, 100, 100);
	}

	function updateColor() {
		const newColor = hsvToHex(hue, saturation, brightness);
		dispatch('change', newColor);
	}

	function handleSVMouseDown(event: MouseEvent) {
		isDraggingSV = true;
		updateSVFromEvent(event);
	}

	function handleSVMouseMove(event: MouseEvent) {
		if (!isDraggingSV) return;
		updateSVFromEvent(event);
	}

	function updateSVFromEvent(event: MouseEvent) {
		if (!svArea) return;
		const rect = svArea.getBoundingClientRect();
		const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
		const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
		saturation = x * 100;
		brightness = (1 - y) * 100;
		updateColor();
	}

	function handleHueMouseDown(event: MouseEvent) {
		isDraggingHue = true;
		updateHueFromEvent(event);
	}

	function handleHueMouseMove(event: MouseEvent) {
		if (!isDraggingHue) return;
		updateHueFromEvent(event);
	}

	function updateHueFromEvent(event: MouseEvent) {
		if (!hueSlider) return;
		const rect = hueSlider.getBoundingClientRect();
		const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
		hue = y * 360;
		updateColor();
	}

	function handleMouseUp() {
		isDraggingSV = false;
		isDraggingHue = false;
	}

	function selectSwatch(swatchColor: string) {
		const hsv = hexToHsv(swatchColor);
		hue = hsv.h;
		saturation = hsv.s;
		brightness = hsv.v;
		dispatch('change', swatchColor);
	}

	function handleHexInput(event: Event) {
		const input = event.target as HTMLInputElement;
		let value = input.value.trim();
		if (!value.startsWith('#')) value = '#' + value;
		if (/^#[0-9a-fA-F]{6}$/.test(value)) {
			const hsv = hexToHsv(value);
			hue = hsv.h;
			saturation = hsv.s;
			brightness = hsv.v;
			dispatch('change', value.toLowerCase());
		}
	}

	$: currentColor = hsvToHex(hue, saturation, brightness);
	$: hueColor = hueToColor(hue);
</script>

<svelte:window
	on:mousemove={(e) => { handleSVMouseMove(e); handleHueMouseMove(e); }}
	on:mouseup={handleMouseUp}
/>

<div class="color-picker">
	<div class="picker-main">
		<!-- Saturation/Brightness area -->
		<div
			class="sv-area"
			bind:this={svArea}
			on:mousedown={handleSVMouseDown}
			style="background: linear-gradient(to right, white, {hueColor});"
			role="slider"
			aria-label="Saturation and brightness"
			tabindex="0"
		>
			<div class="sv-gradient"></div>
			<div
				class="sv-cursor"
				style="left: {saturation}%; top: {100 - brightness}%;"
			></div>
		</div>

		<!-- Hue slider -->
		<div
			class="hue-slider"
			bind:this={hueSlider}
			on:mousedown={handleHueMouseDown}
			role="slider"
			aria-label="Hue"
			tabindex="0"
		>
			<div
				class="hue-cursor"
				style="top: {(hue / 360) * 100}%;"
			></div>
		</div>
	</div>

	<!-- Color preview and hex input -->
	<div class="picker-footer">
		<div class="color-preview" style="background-color: {currentColor};"></div>
		<div class="hex-input-wrapper">
			<span class="hex-label">#</span>
			<input
				type="text"
				class="hex-input"
				value={currentColor.slice(1)}
				maxlength="6"
				on:change={handleHexInput}
			/>
		</div>
	</div>

	<!-- Quick swatches -->
	{#if showSwatches}
		<div class="swatches">
			{#each swatches as swatch}
				<button
					type="button"
					class="swatch"
					class:selected={currentColor.toLowerCase() === swatch.toLowerCase()}
					style="background-color: {swatch};"
					on:click={() => selectSwatch(swatch)}
					title={swatch}
				></button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.color-picker {
		@apply flex flex-col gap-3 p-3;
		width: 240px;
	}

	.picker-main {
		@apply flex gap-2;
	}

	.sv-area {
		@apply relative flex-1 rounded cursor-crosshair;
		height: 150px;
	}

	.sv-gradient {
		@apply absolute inset-0 rounded;
		background: linear-gradient(to bottom, transparent, black);
	}

	.sv-cursor {
		@apply absolute w-4 h-4 border-2 border-white rounded-full;
		transform: translate(-50%, -50%);
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3), inset 0 0 0 1px rgba(0, 0, 0, 0.3);
		pointer-events: none;
	}

	.hue-slider {
		@apply relative w-4 rounded cursor-pointer;
		background: linear-gradient(
			to bottom,
			#ff0000 0%,
			#ffff00 17%,
			#00ff00 33%,
			#00ffff 50%,
			#0000ff 67%,
			#ff00ff 83%,
			#ff0000 100%
		);
	}

	.hue-cursor {
		@apply absolute left-0 right-0 h-2 border-2 border-white rounded;
		transform: translateY(-50%);
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3);
		pointer-events: none;
	}

	.picker-footer {
		@apply flex gap-2 items-center;
	}

	.color-preview {
		@apply w-10 h-8 rounded border border-editor-border;
	}

	.hex-input-wrapper {
		@apply flex-1 flex items-center bg-editor-panel border border-editor-border rounded px-2;
	}

	.hex-label {
		@apply text-editor-text-muted text-sm;
	}

	.hex-input {
		@apply flex-1 bg-transparent border-none text-editor-text text-sm py-1.5 px-1 outline-none;
		font-family: monospace;
	}

	.swatches {
		@apply flex gap-1 flex-wrap;
	}

	.swatch {
		@apply w-5 h-5 rounded border border-editor-border cursor-pointer
			   hover:scale-110 transition-transform;
	}

	.swatch.selected {
		@apply ring-2 ring-editor-accent ring-offset-1 ring-offset-editor-bg;
	}
</style>
