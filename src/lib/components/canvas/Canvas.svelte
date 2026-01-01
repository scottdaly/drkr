<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		document as documentStore,
		viewport,
		updateViewport,
		visibleLayers,
		layerPixelCache,
		fitToScreen,
		isLoading,
		createNewDocument,
		openDocumentFromFile
	} from '$lib/stores/documents';
	import { activeTool, brushSettings, colors } from '$lib/stores/tools';
	import { brushEngine, canDraw, getBrushPreviewSize, currentStrokePreview } from '$lib/engine/brushEngine';
	import { FilePlus, FolderOpen } from 'lucide-svelte';

	let canvasContainer: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;
	let animationFrameId: number | null = null;

	// For panning
	let isPanning = false;
	let lastPanPoint = { x: 0, y: 0 };

	// For drawing
	let isDrawing = false;
	let brushCursorPos = { x: 0, y: 0 };
	let showBrushCursor = false;

	onMount(() => {
		initCanvas();
		startRenderLoop();

		// Fit to screen when document changes
		const unsubscribe = documentStore.subscribe((doc) => {
			if (doc) {
				// Small delay to ensure viewport dimensions are set
				setTimeout(fitToScreen, 50);
			}
		});

		return () => {
			unsubscribe();
		};
	});

	onDestroy(() => {
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
		}
	});

	function initCanvas() {
		ctx = canvas.getContext('2d', { alpha: false });
		if (!ctx) {
			console.error('Could not get 2D context');
			return;
		}

		resizeCanvas();
	}

	function resizeCanvas() {
		if (!canvasContainer || !canvas || !ctx) return;

		const rect = canvasContainer.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;

		canvas.width = rect.width * dpr;
		canvas.height = rect.height * dpr;
		canvas.style.width = `${rect.width}px`;
		canvas.style.height = `${rect.height}px`;

		ctx.scale(dpr, dpr);

		updateViewport((vp) => ({
			...vp,
			width: rect.width,
			height: rect.height
		}));
	}

	function startRenderLoop() {
		function render() {
			renderCanvas();
			animationFrameId = requestAnimationFrame(render);
		}

		animationFrameId = requestAnimationFrame(render);
	}

	function renderCanvas() {
		if (!ctx || !canvas) return;

		const vp = $viewport;
		const doc = $documentStore;
		const dpr = window.devicePixelRatio || 1;

		// Clear canvas with dark background
		ctx.fillStyle = '#1f1f1f';
		ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);

		if (!doc) return;

		// Draw checkerboard pattern for transparency
		drawCheckerboard(ctx, vp, doc.width, doc.height);

		// Draw each visible layer
		const cache = $layerPixelCache;
		for (const layer of $visibleLayers) {
			const imageData = cache.get(layer.id);
			if (!imageData) continue;

			// Create temporary canvas for the layer
			const tempCanvas = document.createElement('canvas');
			tempCanvas.width = layer.width;
			tempCanvas.height = layer.height;
			const tempCtx = tempCanvas.getContext('2d');
			if (!tempCtx) continue;

			tempCtx.putImageData(imageData, 0, 0);

			// Apply layer opacity
			ctx.globalAlpha = layer.opacity / 100;

			// Draw the layer with viewport transform
			ctx.drawImage(
				tempCanvas,
				vp.x + layer.x * vp.zoom,
				vp.y + layer.y * vp.zoom,
				layer.width * vp.zoom,
				layer.height * vp.zoom
			);

			ctx.globalAlpha = 1;
		}

		// Draw real-time stroke preview
		const strokePreview = $currentStrokePreview;
		if (strokePreview && strokePreview.points.length > 0) {
			drawStrokePreview(ctx, vp, strokePreview);
		}

		// Draw document border
		ctx.strokeStyle = '#444';
		ctx.lineWidth = 1;
		ctx.strokeRect(vp.x, vp.y, doc.width * vp.zoom, doc.height * vp.zoom);
	}

	function drawStrokePreview(
		ctx: CanvasRenderingContext2D,
		vp: { x: number; y: number; zoom: number },
		preview: { points: { x: number; y: number }[]; color: { r: number; g: number; b: number; a: number }; settings: { size: number; hardness: number; opacity: number; flow: number }; isEraser: boolean }
	) {
		const { points, color, settings, isEraser } = preview;
		const radius = (settings.size / 2) * vp.zoom;
		const hardness = settings.hardness / 100;
		const opacity = (settings.opacity / 100) * (settings.flow / 100);

		// Clip to document bounds
		const doc = $documentStore;
		if (doc) {
			ctx.save();
			ctx.beginPath();
			ctx.rect(vp.x, vp.y, doc.width * vp.zoom, doc.height * vp.zoom);
			ctx.clip();
		}

		for (const point of points) {
			const screenX = vp.x + point.x * vp.zoom;
			const screenY = vp.y + point.y * vp.zoom;

			if (isEraser) {
				// For eraser, draw a semi-transparent pattern to indicate erasing
				ctx.globalCompositeOperation = 'destination-out';
				ctx.globalAlpha = opacity;
			} else {
				ctx.globalCompositeOperation = 'source-over';
				ctx.globalAlpha = opacity;
			}

			// Create radial gradient for soft brush
			const gradient = ctx.createRadialGradient(
				screenX, screenY, radius * hardness,
				screenX, screenY, radius
			);

			if (isEraser) {
				gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
				gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
			} else {
				gradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, 1)`);
				gradient.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
			}

			ctx.fillStyle = gradient;
			ctx.beginPath();
			ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
			ctx.fill();
		}

		ctx.globalCompositeOperation = 'source-over';
		ctx.globalAlpha = 1;

		if (doc) {
			ctx.restore();
		}
	}

	function drawCheckerboard(
		ctx: CanvasRenderingContext2D,
		vp: { x: number; y: number; zoom: number },
		docWidth: number,
		docHeight: number
	) {
		const checkSize = 8;
		const scaledCheckSize = checkSize * vp.zoom;

		// Clip to document bounds
		ctx.save();
		ctx.beginPath();
		ctx.rect(vp.x, vp.y, docWidth * vp.zoom, docHeight * vp.zoom);
		ctx.clip();

		// Draw white background first
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(vp.x, vp.y, docWidth * vp.zoom, docHeight * vp.zoom);

		// Draw gray checks
		ctx.fillStyle = '#cccccc';
		const startCol = Math.floor(-vp.x / scaledCheckSize);
		const startRow = Math.floor(-vp.y / scaledCheckSize);
		const endCol = Math.ceil((docWidth * vp.zoom - vp.x) / scaledCheckSize) + startCol;
		const endRow = Math.ceil((docHeight * vp.zoom - vp.y) / scaledCheckSize) + startRow;

		for (let row = startRow; row <= endRow; row++) {
			for (let col = startCol; col <= endCol; col++) {
				if ((row + col) % 2 === 0) {
					ctx.fillRect(
						vp.x + col * scaledCheckSize,
						vp.y + row * scaledCheckSize,
						scaledCheckSize,
						scaledCheckSize
					);
				}
			}
		}

		ctx.restore();
	}

	function handleWheel(event: WheelEvent) {
		event.preventDefault();

		if (event.ctrlKey || event.metaKey) {
			// Zoom centered on mouse position
			const rect = canvas.getBoundingClientRect();
			const mouseX = event.clientX - rect.left;
			const mouseY = event.clientY - rect.top;

			const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
			const oldZoom = $viewport.zoom;
			const newZoom = Math.max(0.1, Math.min(32, oldZoom * zoomFactor));

			// Adjust pan to keep mouse position stable
			updateViewport((vp) => ({
				...vp,
				zoom: newZoom,
				x: mouseX - (mouseX - vp.x) * (newZoom / oldZoom),
				y: mouseY - (mouseY - vp.y) * (newZoom / oldZoom)
			}));
		} else {
			// Pan
			updateViewport((vp) => ({
				...vp,
				x: vp.x - event.deltaX,
				y: vp.y - event.deltaY
			}));
		}
	}

	function handlePointerDown(event: PointerEvent) {
		const rect = canvas.getBoundingClientRect();
		const canvasX = event.clientX - rect.left;
		const canvasY = event.clientY - rect.top;

		// Middle mouse button for panning
		if (event.button === 1) {
			isPanning = true;
			lastPanPoint = { x: event.clientX, y: event.clientY };
			event.preventDefault();
			return;
		}

		// Left click for drawing (brush/eraser tools)
		if (event.button === 0 && canDraw()) {
			isDrawing = true;
			canvas.setPointerCapture(event.pointerId);

			brushEngine.startStroke(
				{ x: canvasX, y: canvasY, pressure: event.pressure },
				$viewport
			);
			event.preventDefault();
			return;
		}
	}

	function handlePointerMove(event: PointerEvent) {
		const rect = canvas.getBoundingClientRect();
		const canvasX = event.clientX - rect.left;
		const canvasY = event.clientY - rect.top;

		// Update brush cursor position
		brushCursorPos = { x: canvasX, y: canvasY };

		// Show brush cursor when using brush/eraser
		showBrushCursor = ($activeTool === 'brush' || $activeTool === 'eraser') && $documentStore !== null;

		if (isPanning) {
			const dx = event.clientX - lastPanPoint.x;
			const dy = event.clientY - lastPanPoint.y;
			lastPanPoint = { x: event.clientX, y: event.clientY };

			updateViewport((vp) => ({
				...vp,
				x: vp.x + dx,
				y: vp.y + dy
			}));
			return;
		}

		if (isDrawing && brushEngine.drawing) {
			brushEngine.continueStroke(
				{ x: canvasX, y: canvasY, pressure: event.pressure },
				$viewport
			);
		}
	}

	function handlePointerUp(event: PointerEvent) {
		if (isPanning) {
			isPanning = false;
			return;
		}

		if (isDrawing) {
			isDrawing = false;
			canvas.releasePointerCapture(event.pointerId);
			brushEngine.endStroke();
		}
	}

	function handlePointerLeave() {
		showBrushCursor = false;
		if (isPanning) {
			isPanning = false;
		}
	}

	function handlePointerEnter() {
		showBrushCursor = ($activeTool === 'brush' || $activeTool === 'eraser') && $documentStore !== null;
	}

	// Keep legacy mouse handlers for middle-click panning compatibility
	function handleMouseDown(event: MouseEvent) {
		// Middle mouse button for panning
		if (event.button === 1) {
			isPanning = true;
			lastPanPoint = { x: event.clientX, y: event.clientY };
			event.preventDefault();
		}
	}

	function handleMouseMove(event: MouseEvent) {
		if (isPanning) {
			const dx = event.clientX - lastPanPoint.x;
			const dy = event.clientY - lastPanPoint.y;
			lastPanPoint = { x: event.clientX, y: event.clientY };

			updateViewport((vp) => ({
				...vp,
				x: vp.x + dx,
				y: vp.y + dy
			}));
		}
	}

	function handleMouseUp() {
		isPanning = false;
	}

	async function handleQuickNew() {
		await createNewDocument('Untitled', 1920, 1080, 72);
	}

	async function handleQuickOpen() {
		await openDocumentFromFile();
	}
</script>

<svelte:window on:resize={resizeCanvas} />

<div
	class="canvas-container"
	bind:this={canvasContainer}
	on:wheel={handleWheel}
	on:pointerdown={handlePointerDown}
	on:pointermove={handlePointerMove}
	on:pointerup={handlePointerUp}
	on:pointerleave={handlePointerLeave}
	on:pointerenter={handlePointerEnter}
	on:mousedown={handleMouseDown}
	on:mousemove={handleMouseMove}
	on:mouseup={handleMouseUp}
	on:mouseleave={handleMouseUp}
	role="application"
	aria-label="Canvas"
	class:drawing={$activeTool === 'brush' || $activeTool === 'eraser'}
>
	<canvas bind:this={canvas}></canvas>

	<!-- Brush cursor overlay -->
	{#if showBrushCursor}
		<div
			class="brush-cursor"
			style="
				left: {brushCursorPos.x}px;
				top: {brushCursorPos.y}px;
				width: {getBrushPreviewSize($viewport.zoom)}px;
				height: {getBrushPreviewSize($viewport.zoom)}px;
			"
		></div>
	{/if}

	{#if !$documentStore && !$isLoading}
		<div class="empty-state">
			<p class="title">Welcome to Darker</p>
			<p class="subtitle">Create a new document or open an existing file</p>
			<div class="quick-actions">
				<button class="action-btn" on:click={handleQuickNew}>
					<FilePlus size={20} />
					<span>New Document</span>
				</button>
				<button class="action-btn" on:click={handleQuickOpen}>
					<FolderOpen size={20} />
					<span>Open File</span>
				</button>
			</div>
			<p class="hint">or press Ctrl+N / Ctrl+O</p>
		</div>
	{/if}

	{#if $isLoading}
		<div class="loading-overlay">
			<div class="spinner"></div>
			<span>Loading...</span>
		</div>
	{/if}
</div>

<style>
	.canvas-container {
		@apply relative w-full h-full overflow-hidden cursor-crosshair;
	}

	.canvas-container.drawing {
		@apply cursor-none;
	}

	canvas {
		@apply block;
	}

	.brush-cursor {
		@apply absolute pointer-events-none rounded-full border border-white/80;
		transform: translate(-50%, -50%);
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3);
		mix-blend-mode: difference;
	}

	.empty-state {
		@apply absolute inset-0 flex flex-col items-center justify-center gap-4;
	}

	.title {
		@apply text-2xl font-semibold text-editor-text;
	}

	.subtitle {
		@apply text-editor-text-muted;
	}

	.quick-actions {
		@apply flex gap-4 mt-4;
	}

	.action-btn {
		@apply flex items-center gap-2 px-4 py-2 bg-editor-panel border border-editor-border
			   rounded-lg text-editor-text hover:border-editor-accent hover:bg-editor-accent/10
			   transition-colors;
	}

	.hint {
		@apply text-sm text-editor-text-muted mt-4;
	}

	.loading-overlay {
		@apply absolute inset-0 flex flex-col items-center justify-center gap-3
			   bg-editor-bg/80;
	}

	.spinner {
		@apply w-8 h-8 border-2 border-editor-accent border-t-transparent rounded-full
			   animate-spin;
	}
</style>
