<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { X, ArrowLeftRight, Monitor, Share2, Printer, Image, Smartphone, LayoutGrid, ChevronDown } from 'lucide-svelte';
	import ColorPicker from '../ColorPicker.svelte';

	export let open = false;
	let showColorPicker = false;
	let colorSwatchEl: HTMLButtonElement;
	let originalColor = '#ffffff'; // Color before picker opened (for cancel)

	const dispatch = createEventDispatcher<{
		create: {
			name: string;
			width: number;
			height: number;
			resolution: number;
			background: { type: 'white' | 'black' | 'transparent' | 'custom'; color: string };
		};
		cancel: void;
	}>();

	let name = 'Untitled';
	let width = 1920;
	let height = 1080;
	let resolution = 72;

	// Background options
	type BgType = 'white' | 'black' | 'transparent' | 'custom';
	let bgType: BgType = 'white';
	let bgColor = '#ffffff';

	// Preset categories with more presets
	type Preset = { label: string; width: number; height: number; resolution?: number };
	const presetCategories: Array<{
		name: string;
		icon: typeof Monitor;
		presets: Preset[];
	}> = [
		{
			name: 'Screen',
			icon: Monitor,
			presets: [
				{ label: 'HD 1080p', width: 1920, height: 1080 },
				{ label: '4K UHD', width: 3840, height: 2160 },
				{ label: '2K QHD', width: 2560, height: 1440 },
				{ label: 'MacBook Pro', width: 2880, height: 1800 },
				{ label: 'iMac 5K', width: 5120, height: 2880 },
				{ label: 'Ultrawide', width: 3440, height: 1440 }
			]
		},
		{
			name: 'Social',
			icon: Share2,
			presets: [
				{ label: 'Instagram Post', width: 1080, height: 1080 },
				{ label: 'Instagram Story', width: 1080, height: 1920 },
				{ label: 'Instagram Portrait', width: 1080, height: 1350 },
				{ label: 'YouTube Thumbnail', width: 1280, height: 720 },
				{ label: 'YouTube Cover', width: 2560, height: 1440 },
				{ label: 'Twitter Header', width: 1500, height: 500 },
				{ label: 'Twitter Post', width: 1200, height: 675 },
				{ label: 'Facebook Cover', width: 1640, height: 664 },
				{ label: 'LinkedIn Banner', width: 1584, height: 396 }
			]
		},
		{
			name: 'Print',
			icon: Printer,
			presets: [
				{ label: 'A4', width: 2480, height: 3508, resolution: 300 },
				{ label: 'A3', width: 3508, height: 4961, resolution: 300 },
				{ label: 'A5', width: 1748, height: 2480, resolution: 300 },
				{ label: 'Letter', width: 2550, height: 3300, resolution: 300 },
				{ label: 'Legal', width: 2550, height: 4200, resolution: 300 },
				{ label: 'Tabloid', width: 3300, height: 5100, resolution: 300 }
			]
		},
		{
			name: 'Photo',
			icon: Image,
			presets: [
				{ label: '4x6"', width: 1200, height: 1800, resolution: 300 },
				{ label: '5x7"', width: 1500, height: 2100, resolution: 300 },
				{ label: '8x10"', width: 2400, height: 3000, resolution: 300 },
				{ label: '11x14"', width: 3300, height: 4200, resolution: 300 },
				{ label: '16x20"', width: 4800, height: 6000, resolution: 300 },
				{ label: 'Square 8x8"', width: 2400, height: 2400, resolution: 300 }
			]
		},
		{
			name: 'Mobile',
			icon: Smartphone,
			presets: [
				{ label: 'iPhone 15 Pro', width: 1179, height: 2556 },
				{ label: 'iPhone SE', width: 750, height: 1334 },
				{ label: 'iPad Pro 12.9"', width: 2048, height: 2732 },
				{ label: 'Android Phone', width: 1080, height: 2340 },
				{ label: 'Android Tablet', width: 1600, height: 2560 }
			]
		},
		{
			name: 'Square',
			icon: LayoutGrid,
			presets: [
				{ label: '512 x 512', width: 512, height: 512 },
				{ label: '1024 x 1024', width: 1024, height: 1024 },
				{ label: '2048 x 2048', width: 2048, height: 2048 },
				{ label: '4096 x 4096', width: 4096, height: 4096 }
			]
		}
	];

	let activeCategory = 'Screen';

	function applyPreset(preset: Preset) {
		width = preset.width;
		height = preset.height;
		if (preset.resolution) {
			resolution = preset.resolution;
		}
	}

	function swapDimensions() {
		[width, height] = [height, width];
	}

	function handleSubmit() {
		dispatch('create', {
			name,
			width,
			height,
			resolution,
			background: { type: bgType, color: bgColor }
		});
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
		bgType = 'white';
		bgColor = '#ffffff';
		originalColor = '#ffffff';
		activeCategory = 'Screen';
		showColorPicker = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (showColorPicker) {
				showColorPicker = false;
			} else {
				handleCancel();
			}
		}
	}

	function handleClickOutsideColorPicker(event: MouseEvent) {
		if (showColorPicker && colorSwatchEl && !colorSwatchEl.contains(event.target as Node)) {
			const popover = (event.target as Element).closest('.color-picker-popover');
			if (!popover) {
				showColorPicker = false;
			}
		}
	}

	function handleOverlayClick(event: MouseEvent) {
		// Only close if clicking directly on the overlay, not on children
		// This prevents accidental closes during text selection
		if (event.target === event.currentTarget) {
			handleCancel();
		}
	}

	// Calculate scaled preview dimensions for aspect ratio display
	function getPreviewDimensions(w: number, h: number, maxSize: number = 80): { width: number; height: number } {
		const aspect = w / h;
		if (aspect >= 1) {
			return { width: maxSize, height: maxSize / aspect };
		} else {
			return { width: maxSize * aspect, height: maxSize };
		}
	}

	// Reactive swatch color based on bgType and bgColor
	$: swatchColor = bgType === 'white' ? '#ffffff' : bgType === 'black' ? '#000000' : bgType === 'custom' ? bgColor : 'transparent';

	$: currentPresets = presetCategories.find((c) => c.name === activeCategory)?.presets ?? [];
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
	<div class="overlay" on:mousedown={handleOverlayClick} on:keydown={() => {}} role="presentation">
		<div class="dialog" on:mousedown|stopPropagation on:click={handleClickOutsideColorPicker} on:keydown={() => {}} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
			<header class="dialog-header">
				<h2 id="dialog-title">New Document</h2>
				<button class="close-btn" on:click={handleCancel} aria-label="Close">
					<X size={18} />
				</button>
			</header>

			<form on:submit|preventDefault={handleSubmit}>
				<div class="dialog-content">
					<!-- Name Input -->
					<div class="form-group">
						<label for="doc-name">Name</label>
						<input
							type="text"
							id="doc-name"
							bind:value={name}
							placeholder="Document name"
						/>
					</div>

					<!-- Dimensions Row -->
					<div class="dimensions-row">
						<div class="form-group dim-input">
							<label for="doc-width">Width (px)</label>
							<input
								type="number"
								id="doc-width"
								bind:value={width}
								min="1"
								max="30000"
							/>
						</div>

						<button type="button" class="swap-btn" on:click={swapDimensions} title="Swap width and height">
							<ArrowLeftRight size={16} />
						</button>

						<div class="form-group dim-input">
							<label for="doc-height">Height (px)</label>
							<input
								type="number"
								id="doc-height"
								bind:value={height}
								min="1"
								max="30000"
							/>
						</div>

						<div class="form-group res-input">
							<label for="doc-resolution">PPI</label>
							<input
								type="number"
								id="doc-resolution"
								bind:value={resolution}
								min="1"
								max="1200"
							/>
						</div>
					</div>

					<!-- Background Section -->
					<div class="background-section">
						<label for="bg-select">Background</label>
						<div class="bg-row">
							<select id="bg-select" bind:value={bgType} class="bg-select">
								<option value="white">White</option>
								<option value="black">Black</option>
								<option value="transparent">Transparent</option>
								<option value="custom">Custom</option>
							</select>
							<div class="color-swatch-wrapper">
								{#if bgType === 'transparent'}
									<div class="color-swatch checkerboard"></div>
								{:else}
									<button
										type="button"
										bind:this={colorSwatchEl}
										class="color-swatch-btn"
										style="background-color: {swatchColor}"
										on:click={() => {
											originalColor = bgColor;
											showColorPicker = !showColorPicker;
											if (bgType === 'white') bgType = 'custom';
										}}
									></button>
								{/if}
								{#if showColorPicker}
									<div class="color-picker-popover">
										<ColorPicker
											color={bgColor}
											on:change={(e) => {
												bgColor = e.detail;
												bgType = 'custom';
											}}
										/>
										<div class="color-picker-actions">
											<button
												type="button"
												class="picker-btn picker-btn-cancel"
												on:click={() => {
													bgColor = originalColor;
													showColorPicker = false;
												}}
											>
												Cancel
											</button>
											<button
												type="button"
												class="picker-btn picker-btn-ok"
												on:click={() => {
													showColorPicker = false;
												}}
											>
												OK
											</button>
										</div>
									</div>
								{/if}
							</div>
						</div>
					</div>

					<!-- Presets Section -->
					<div class="presets-section">
						<div class="category-tabs">
							{#each presetCategories as category}
								<button
									type="button"
									class="category-tab"
									class:active={activeCategory === category.name}
									on:click={() => (activeCategory = category.name)}
								>
									{category.name}
								</button>
							{/each}
						</div>
						<div class="preset-grid">
							{#each currentPresets as preset}
								{@const dims = getPreviewDimensions(preset.width, preset.height)}
								<button
									type="button"
									class="preset-card"
									class:selected={width === preset.width && height === preset.height}
									on:click={() => applyPreset(preset)}
								>
									<div class="preset-preview">
										<div
											class="preset-shape"
											style="width: {dims.width}px; height: {dims.height}px;"
										></div>
									</div>
									<div class="preset-info">
										<span class="preset-label">{preset.label}</span>
										<span class="preset-dims">{preset.width} x {preset.height}</span>
									</div>
								</button>
							{/each}
						</div>
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
		@apply bg-editor-panel rounded-lg shadow-2xl w-full max-w-2xl
			   border border-editor-border max-h-[90vh] overflow-hidden flex flex-col;
	}

	.dialog-header {
		@apply flex items-center justify-between px-4 py-3 border-b border-editor-border flex-shrink-0;
	}

	.dialog-header h2 {
		@apply text-lg font-semibold text-editor-text;
	}

	.close-btn {
		@apply p-1 rounded text-editor-text-muted hover:text-editor-text
			   hover:bg-editor-border transition-colors;
	}

	.dialog-content {
		@apply p-4 space-y-4 overflow-y-auto flex-1;
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

	/* Hide number input spinners */
	.form-group input[type="number"] {
		-moz-appearance: textfield;
	}

	.form-group input[type="number"]::-webkit-outer-spin-button,
	.form-group input[type="number"]::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.dimensions-row {
		@apply flex items-end gap-2;
	}

	.dim-input {
		@apply flex-1;
	}

	.res-input {
		@apply w-20;
	}

	.swap-btn {
		@apply p-2 mb-0.5 rounded bg-editor-bg border border-editor-border
			   text-editor-text-muted hover:text-editor-text hover:border-editor-accent
			   transition-colors;
	}

	.background-section {
		@apply flex flex-col gap-1;
	}

	.background-section label {
		@apply text-sm text-editor-text-muted;
	}

	.bg-row {
		@apply flex gap-2;
	}

	.bg-select {
		@apply flex-1 px-3 py-2 bg-editor-bg border border-editor-border rounded
			   text-editor-text focus:border-editor-accent outline-none
			   appearance-none cursor-pointer;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 8px center;
		padding-right: 32px;
	}

	.color-swatch-wrapper {
		@apply flex-shrink-0 relative;
	}

	.color-swatch-btn {
		@apply w-10 h-10 border border-editor-border cursor-pointer rounded-md
			   hover:border-editor-accent transition-colors;
	}

	.color-picker-popover {
		@apply absolute top-full right-0 mt-2 z-50 shadow-xl
			   bg-editor-panel border border-editor-border rounded-lg overflow-hidden;
	}

	.color-picker-actions {
		@apply flex gap-2 p-3 pt-0 justify-end;
	}

	.picker-btn {
		@apply px-3 py-1.5 text-sm rounded font-medium transition-colors;
	}

	.picker-btn-cancel {
		@apply bg-transparent text-editor-text-muted hover:text-editor-text;
	}

	.picker-btn-ok {
		@apply bg-editor-accent text-white hover:bg-editor-accent-hover;
	}

	.color-swatch {
		@apply w-10 h-10 border border-editor-border cursor-pointer;
		padding: 0;
		border-radius: 6px;
		-webkit-appearance: none;
		appearance: none;
		background: none;
	}

	.color-swatch::-webkit-color-swatch-wrapper {
		padding: 0;
		border-radius: 5px;
	}

	.color-swatch::-webkit-color-swatch {
		border: none;
		border-radius: 5px;
	}

	.color-swatch::-moz-color-swatch {
		border: none;
		border-radius: 5px;
	}

	.color-swatch.checkerboard {
		background-image:
			linear-gradient(45deg, #666 25%, transparent 25%),
			linear-gradient(-45deg, #666 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, #666 75%),
			linear-gradient(-45deg, transparent 75%, #666 75%);
		background-size: 10px 10px;
		background-position: 0 0, 0 5px, 5px -5px, -5px 0px;
		background-color: #999;
		cursor: default;
	}

	.presets-section {
		@apply space-y-2;
	}

	.category-tabs {
		@apply flex gap-1 overflow-x-auto pb-1;
		scrollbar-width: thin;
	}

	.category-tab {
		@apply px-3 py-1.5 text-xs rounded
			   text-editor-text-muted hover:text-editor-text
			   transition-colors whitespace-nowrap;
	}

	.category-tab.active {
		@apply text-editor-text bg-editor-border;
	}

	.preset-grid {
		@apply grid grid-cols-3 gap-2 max-h-64 overflow-y-auto p-1;
	}

	.preset-card {
		@apply flex flex-col items-center p-3 bg-editor-bg border border-editor-border
			   rounded-lg hover:border-editor-accent transition-colors cursor-pointer;
	}

	.preset-card.selected {
		@apply border-editor-accent bg-editor-accent/10;
	}

	.preset-preview {
		@apply flex items-center justify-center w-full h-20 mb-2;
	}

	.preset-shape {
		@apply border border-editor-text-muted/50 rounded-sm;
	}

	.preset-info {
		@apply flex flex-col items-center gap-0.5 w-full;
	}

	.preset-label {
		@apply text-xs text-editor-text font-medium text-center truncate w-full;
	}

	.preset-dims {
		@apply text-xs text-editor-text-muted;
	}

	.dialog-footer {
		@apply flex justify-end gap-2 px-4 py-3 border-t border-editor-border flex-shrink-0;
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

