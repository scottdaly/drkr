<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import {
		document as documentStore,
		viewport,
		updateViewport,
		visibleLayers,
		layerPixelCache,
		fitToScreen,
		isLoading,
		openDocumentFromFile,
		openDocumentFromPath
	} from '$lib/stores/documents';

	const dispatch = createEventDispatcher<{
		newDocument: void;
	}>();
	import { activeTool, brushSettings, colors } from '$lib/stores/tools';
	import { brushEngine, canDraw, getBrushPreviewSize, currentStrokePreview } from '$lib/engine/brushEngine';
	import { eyedropperEngine } from '$lib/engine/eyedropperEngine';
	import { moveEngine } from '$lib/engine/moveEngine';
	import { zoomEngine } from '$lib/engine/zoomEngine';
	import { selectionEngine } from '$lib/engine/selectionEngine';
	import { cropEngine } from '$lib/engine/cropEngine';
	import { cropState, cropSettings } from '$lib/stores/crop';
	import { selectionState, clearSelection, selectAll, hasSelection } from '$lib/stores/selection';
	import { deleteSelectionContents, fillSelectionWithColor } from '$lib/stores/documents';
	import ZoomContextMenu from './ZoomContextMenu.svelte';
	import { FilePlus, FolderOpen, Clock, X, FileImage } from 'lucide-svelte';
	import {
		recentFiles,
		removeRecentFile,
		clearRecentFiles,
		formatLastOpened
	} from '$lib/stores/recentFiles';

	let canvasContainer: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;
	let animationFrameId: number | null = null;

	// For panning
	let isPanning = false;
	let lastPanPoint = { x: 0, y: 0 };

	// For hand tool / spacebar panning
	let isHandPanning = false;
	let isSpacebarHeld = false;

	// For drawing
	let isDrawing = false;
	let brushCursorPos = { x: 0, y: 0 };
	let showBrushCursor = false;

	// For zoom tool
	let isAltHeld = false;
	let zoomMenuVisible = false;
	let zoomMenuX = 0;
	let zoomMenuY = 0;

	// For selection tools
	let isShiftHeld = false;

	// Activate/deactivate crop tool when tool changes
	$: if ($activeTool === 'crop' && $documentStore && $viewport) {
		cropEngine.activate($viewport, $documentStore);
	} else if ($activeTool !== 'crop' && cropEngine.isActive) {
		cropEngine.deactivate();
	}

	onMount(() => {
		initCanvas();
		startRenderLoop();

		let lastDocId: string | null = null;

		// When a NEW document is opened, ensure viewport dimensions are set then fit to screen
		const unsubscribe = documentStore.subscribe((doc) => {
			if (doc && doc.id !== lastDocId) {
				lastDocId = doc.id;
				// Set viewport dimensions now that a document exists
				const rect = canvasContainer?.getBoundingClientRect();
				if (rect) {
					updateViewport((vp) => ({
						...vp,
						width: rect.width,
						height: rect.height
					}));
				}
				setTimeout(fitToScreen, 50);
			} else if (!doc) {
				lastDocId = null;
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

		// Draw zoom marquee preview
		const marqueeRect = zoomEngine.getMarqueeRect();
		if (marqueeRect) {
			ctx.strokeStyle = '#00aaff';
			ctx.lineWidth = 1;
			ctx.setLineDash([4, 4]);
			ctx.strokeRect(marqueeRect.x, marqueeRect.y, marqueeRect.width, marqueeRect.height);
			ctx.setLineDash([]);
		}

		// Draw selection preview (while drawing)
		drawSelectionPreview(ctx, vp);

		// Draw committed selection with marching ants
		drawMarchingAnts(ctx, vp);

		// Draw crop overlay when crop tool is active
		if ($activeTool === 'crop') {
			drawCropOverlay(ctx, vp, doc);
		}
	}

	function drawSelectionPreview(
		ctx: CanvasRenderingContext2D,
		vp: { x: number; y: number; zoom: number }
	) {
		const state = $selectionState;
		if (!state.isDrawing) return;

		ctx.save();

		if (state.drawingType === 'lasso' && state.lassoPoints.length > 1) {
			// Draw lasso path (don't close until selection is committed)
			ctx.strokeStyle = '#00aaff';
			ctx.lineWidth = 1;
			ctx.setLineDash([4, 4]);

			ctx.beginPath();
			const firstPoint = state.lassoPoints[0];
			ctx.moveTo(vp.x + firstPoint.x * vp.zoom, vp.y + firstPoint.y * vp.zoom);

			for (let i = 1; i < state.lassoPoints.length; i++) {
				const point = state.lassoPoints[i];
				ctx.lineTo(vp.x + point.x * vp.zoom, vp.y + point.y * vp.zoom);
			}

			ctx.stroke();
		} else if (
			(state.drawingType === 'rect' || state.drawingType === 'ellipse') &&
			state.startPoint &&
			state.currentPoint
		) {
			// Draw rect or ellipse preview
			const x = Math.min(state.startPoint.x, state.currentPoint.x);
			const y = Math.min(state.startPoint.y, state.currentPoint.y);
			const width = Math.abs(state.currentPoint.x - state.startPoint.x);
			const height = Math.abs(state.currentPoint.y - state.startPoint.y);

			const screenX = vp.x + x * vp.zoom;
			const screenY = vp.y + y * vp.zoom;
			const screenWidth = width * vp.zoom;
			const screenHeight = height * vp.zoom;

			ctx.strokeStyle = '#00aaff';
			ctx.lineWidth = 1;
			ctx.setLineDash([4, 4]);

			if (state.drawingType === 'rect') {
				ctx.strokeRect(screenX, screenY, screenWidth, screenHeight);
			} else {
				// Draw ellipse
				ctx.beginPath();
				ctx.ellipse(
					screenX + screenWidth / 2,
					screenY + screenHeight / 2,
					screenWidth / 2,
					screenHeight / 2,
					0,
					0,
					Math.PI * 2
				);
				ctx.stroke();
			}
		}

		ctx.setLineDash([]);
		ctx.restore();
	}

	function drawMarchingAnts(
		ctx: CanvasRenderingContext2D,
		vp: { x: number; y: number; zoom: number }
	) {
		const state = $selectionState;
		if (state.selection.type === 'none' || !state.selection.bounds) return;

		const { bounds } = state.selection;
		const screenX = vp.x + bounds.x * vp.zoom;
		const screenY = vp.y + bounds.y * vp.zoom;
		const screenWidth = bounds.width * vp.zoom;
		const screenHeight = bounds.height * vp.zoom;

		ctx.save();

		// Draw marching ants with animated offset
		const offset = state.marchingAntsOffset;

		// First draw white dashes
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = 1;
		ctx.setLineDash([4, 4]);
		ctx.lineDashOffset = -offset;

		if (state.selection.type === 'rect') {
			ctx.strokeRect(screenX, screenY, screenWidth, screenHeight);
		} else if (state.selection.type === 'ellipse') {
			ctx.beginPath();
			ctx.ellipse(
				screenX + screenWidth / 2,
				screenY + screenHeight / 2,
				screenWidth / 2,
				screenHeight / 2,
				0,
				0,
				Math.PI * 2
			);
			ctx.stroke();
		} else if (state.selection.type === 'path' && state.vectorPath?.type === 'polygon') {
			// Draw polygon path
			const points = state.vectorPath.points;
			if (points.length > 1) {
				ctx.beginPath();
				ctx.moveTo(vp.x + points[0].x * vp.zoom, vp.y + points[0].y * vp.zoom);
				for (let i = 1; i < points.length; i++) {
					ctx.lineTo(vp.x + points[i].x * vp.zoom, vp.y + points[i].y * vp.zoom);
				}
				ctx.closePath();
				ctx.stroke();
			}
		}

		// Then draw black dashes offset by half
		ctx.strokeStyle = '#000000';
		ctx.lineDashOffset = -offset + 4;

		if (state.selection.type === 'rect') {
			ctx.strokeRect(screenX, screenY, screenWidth, screenHeight);
		} else if (state.selection.type === 'ellipse') {
			ctx.beginPath();
			ctx.ellipse(
				screenX + screenWidth / 2,
				screenY + screenHeight / 2,
				screenWidth / 2,
				screenHeight / 2,
				0,
				0,
				Math.PI * 2
			);
			ctx.stroke();
		} else if (state.selection.type === 'path' && state.vectorPath?.type === 'polygon') {
			const points = state.vectorPath.points;
			if (points.length > 1) {
				ctx.beginPath();
				ctx.moveTo(vp.x + points[0].x * vp.zoom, vp.y + points[0].y * vp.zoom);
				for (let i = 1; i < points.length; i++) {
					ctx.lineTo(vp.x + points[i].x * vp.zoom, vp.y + points[i].y * vp.zoom);
				}
				ctx.closePath();
				ctx.stroke();
			}
		}

		ctx.setLineDash([]);
		ctx.restore();
	}

	function drawCropOverlay(
		ctx: CanvasRenderingContext2D,
		vp: { x: number; y: number; zoom: number },
		doc: { width: number; height: number }
	) {
		const state = $cropState;
		if (!state.region) return;

		const region = state.region;
		const settings = $cropSettings;

		// Convert region to screen coordinates
		const screenX = vp.x + region.x * vp.zoom;
		const screenY = vp.y + region.y * vp.zoom;
		const screenWidth = region.width * vp.zoom;
		const screenHeight = region.height * vp.zoom;

		// Document bounds in screen space
		const docScreenX = vp.x;
		const docScreenY = vp.y;
		const docScreenW = doc.width * vp.zoom;
		const docScreenH = doc.height * vp.zoom;

		ctx.save();

		// Draw darkened areas outside crop region
		ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';

		// Top area
		if (screenY > docScreenY) {
			ctx.fillRect(docScreenX, docScreenY, docScreenW, screenY - docScreenY);
		}
		// Bottom area
		const bottomY = screenY + screenHeight;
		if (bottomY < docScreenY + docScreenH) {
			ctx.fillRect(docScreenX, bottomY, docScreenW, docScreenY + docScreenH - bottomY);
		}
		// Left area (between top and bottom darkened areas)
		if (screenX > docScreenX) {
			const leftHeight = Math.min(screenHeight, docScreenY + docScreenH - screenY);
			ctx.fillRect(docScreenX, screenY, screenX - docScreenX, leftHeight);
		}
		// Right area
		const rightX = screenX + screenWidth;
		if (rightX < docScreenX + docScreenW) {
			const rightHeight = Math.min(screenHeight, docScreenY + docScreenH - screenY);
			ctx.fillRect(rightX, screenY, docScreenX + docScreenW - rightX, rightHeight);
		}

		// Draw crop border
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = 1;
		ctx.strokeRect(screenX, screenY, screenWidth, screenHeight);

		// Draw grid overlay if enabled
		if (settings.showGrid && screenWidth > 20 && screenHeight > 20) {
			ctx.strokeStyle = 'rgba(59, 130, 246, 0.7)'; // Blue for visibility on most backgrounds
			ctx.lineWidth = 1;

			if (settings.gridType === 'thirds') {
				// Rule of thirds: 2 vertical + 2 horizontal lines
				ctx.beginPath();
				// Vertical lines at 1/3 and 2/3
				ctx.moveTo(screenX + screenWidth / 3, screenY);
				ctx.lineTo(screenX + screenWidth / 3, screenY + screenHeight);
				ctx.moveTo(screenX + (2 * screenWidth) / 3, screenY);
				ctx.lineTo(screenX + (2 * screenWidth) / 3, screenY + screenHeight);
				// Horizontal lines at 1/3 and 2/3
				ctx.moveTo(screenX, screenY + screenHeight / 3);
				ctx.lineTo(screenX + screenWidth, screenY + screenHeight / 3);
				ctx.moveTo(screenX, screenY + (2 * screenHeight) / 3);
				ctx.lineTo(screenX + screenWidth, screenY + (2 * screenHeight) / 3);
				ctx.stroke();
			} else if (settings.gridType === 'golden') {
				// Golden ratio: lines at 1/phi and (phi-1)/phi
				const phi = 1.618;
				const shortRatio = 1 / phi;
				const longRatio = 1 - shortRatio;

				ctx.beginPath();
				// Vertical lines
				ctx.moveTo(screenX + screenWidth * shortRatio, screenY);
				ctx.lineTo(screenX + screenWidth * shortRatio, screenY + screenHeight);
				ctx.moveTo(screenX + screenWidth * longRatio, screenY);
				ctx.lineTo(screenX + screenWidth * longRatio, screenY + screenHeight);
				// Horizontal lines
				ctx.moveTo(screenX, screenY + screenHeight * shortRatio);
				ctx.lineTo(screenX + screenWidth, screenY + screenHeight * shortRatio);
				ctx.moveTo(screenX, screenY + screenHeight * longRatio);
				ctx.lineTo(screenX + screenWidth, screenY + screenHeight * longRatio);
				ctx.stroke();
			}
		}

		// Draw resize handles
		const handleSize = 8;
		const handles = [
			{ x: screenX, y: screenY }, // nw
			{ x: screenX + screenWidth / 2, y: screenY }, // n
			{ x: screenX + screenWidth, y: screenY }, // ne
			{ x: screenX, y: screenY + screenHeight / 2 }, // w
			{ x: screenX + screenWidth, y: screenY + screenHeight / 2 }, // e
			{ x: screenX, y: screenY + screenHeight }, // sw
			{ x: screenX + screenWidth / 2, y: screenY + screenHeight }, // s
			{ x: screenX + screenWidth, y: screenY + screenHeight } // se
		];

		ctx.fillStyle = '#ffffff';
		ctx.strokeStyle = '#000000';
		ctx.lineWidth = 1;

		for (const handle of handles) {
			ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
			ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
		}

		// Draw dimensions text
		if (screenWidth > 60 && screenHeight > 30) {
			const dimText = `${Math.round(region.width)} × ${Math.round(region.height)}`;
			ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
			ctx.font = '12px sans-serif';
			const textMetrics = ctx.measureText(dimText);
			const textX = screenX + screenWidth / 2 - textMetrics.width / 2;
			const textY = screenY + screenHeight / 2 + 4;
			ctx.fillRect(textX - 4, textY - 14, textMetrics.width + 8, 18);
			ctx.fillStyle = '#ffffff';
			ctx.fillText(dimText, textX, textY);
		}

		// Draw active snap indicator lines
		const activeSnaps = state.activeSnaps;
		if (activeSnaps && activeSnaps.length > 0) {
			ctx.strokeStyle = '#ff6600'; // Orange for snaps
			ctx.lineWidth = 1;
			ctx.setLineDash([4, 4]);

			for (const snap of activeSnaps) {
				ctx.beginPath();
				if (snap.axis === 'x') {
					const snapScreenX = vp.x + snap.position * vp.zoom;
					ctx.moveTo(snapScreenX, 0);
					ctx.lineTo(snapScreenX, canvas.height / (window.devicePixelRatio || 1));
				} else {
					const snapScreenY = vp.y + snap.position * vp.zoom;
					ctx.moveTo(0, snapScreenY);
					ctx.lineTo(canvas.width / (window.devicePixelRatio || 1), snapScreenY);
				}
				ctx.stroke();
			}

			ctx.setLineDash([]);
		}

		ctx.restore();
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
		// Use a fixed screen-space check size for consistent visibility at all zoom levels
		const screenCheckSize = 8; // Always 8 pixels on screen

		// Clip to document bounds
		ctx.save();
		ctx.beginPath();
		ctx.rect(vp.x, vp.y, docWidth * vp.zoom, docHeight * vp.zoom);
		ctx.clip();

		// Draw white background first
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(vp.x, vp.y, docWidth * vp.zoom, docHeight * vp.zoom);

		// Draw gray checks in screen space (not document space)
		ctx.fillStyle = '#cccccc';

		// Calculate visible area in screen coordinates
		const screenStartX = Math.max(0, vp.x);
		const screenStartY = Math.max(0, vp.y);
		const screenEndX = vp.x + docWidth * vp.zoom;
		const screenEndY = vp.y + docHeight * vp.zoom;

		// Align to check grid
		const startCol = Math.floor(screenStartX / screenCheckSize);
		const startRow = Math.floor(screenStartY / screenCheckSize);
		const endCol = Math.ceil(screenEndX / screenCheckSize);
		const endRow = Math.ceil(screenEndY / screenCheckSize);

		for (let row = startRow; row <= endRow; row++) {
			for (let col = startCol; col <= endCol; col++) {
				if ((row + col) % 2 === 0) {
					ctx.fillRect(
						col * screenCheckSize,
						row * screenCheckSize,
						screenCheckSize,
						screenCheckSize
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

		// Hand tool OR spacebar held = pan mode
		if (($activeTool === 'hand' || isSpacebarHeld) && event.button === 0) {
			isHandPanning = true;
			isPanning = true;
			lastPanPoint = { x: event.clientX, y: event.clientY };
			canvas.setPointerCapture(event.pointerId);
			event.preventDefault();
			return;
		}

		// Eyedropper tool
		if ($activeTool === 'eyedropper' && event.button === 0) {
			eyedropperEngine.sampleColor(
				{ x: canvasX, y: canvasY },
				$viewport,
				{
					setBackground: event.altKey,
					activeLayerOnly: event.ctrlKey || event.metaKey
				}
			);
			event.preventDefault();
			return;
		}

		// Move tool
		if ($activeTool === 'move' && event.button === 0) {
			if (moveEngine.startMove({ x: canvasX, y: canvasY }, $viewport)) {
				canvas.setPointerCapture(event.pointerId);
			}
			event.preventDefault();
			return;
		}

		// Crop tool
		if ($activeTool === 'crop' && event.button === 0 && $documentStore) {
			cropEngine.startCrop({ x: canvasX, y: canvasY }, $viewport, $documentStore);
			canvas.setPointerCapture(event.pointerId);
			event.preventDefault();
			return;
		}

		// Zoom tool
		if ($activeTool === 'zoom' && event.button === 0) {
			zoomEngine.startZoom({ x: canvasX, y: canvasY });
			canvas.setPointerCapture(event.pointerId);
			event.preventDefault();
			return;
		}

		// Selection tools
		if (
			['select-rect', 'select-ellipse', 'select-lasso'].includes($activeTool) &&
			event.button === 0
		) {
			const toolType = $activeTool.replace('select-', '') as 'rect' | 'ellipse' | 'lasso';
			// Starting a new selection clears any floating selection
			moveEngine.clearFloatingSelection();
			selectionEngine.startSelection(toolType, { x: canvasX, y: canvasY }, $viewport);
			canvas.setPointerCapture(event.pointerId);
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

		// Move tool dragging
		if (moveEngine.isMoving) {
			moveEngine.continueMove({ x: canvasX, y: canvasY });
			return;
		}

		// Crop tool dragging
		if (cropEngine.isDragging) {
			cropEngine.continueCrop({ x: canvasX, y: canvasY }, isShiftHeld, isAltHeld);
			return;
		}

		// Update cursor for crop tool handles
		if ($activeTool === 'crop' && !cropEngine.isDragging) {
			const handle = cropEngine.getHandleAtPoint({ x: canvasX, y: canvasY }, $viewport);
			canvas.style.cursor = cropEngine.getCursorForHandle(handle);
		}

		// Zoom tool marquee
		if (zoomEngine.isActive) {
			zoomEngine.continueZoom({ x: canvasX, y: canvasY });
			return;
		}

		// Selection tool drawing
		if (selectionEngine.isActive) {
			selectionEngine.continueSelection({ x: canvasX, y: canvasY }, $viewport, isShiftHeld);
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
		// Handle hand tool panning
		if (isHandPanning) {
			isHandPanning = false;
			isPanning = false;
			canvas.releasePointerCapture(event.pointerId);
			return;
		}

		if (isPanning) {
			isPanning = false;
			return;
		}

		// Handle move tool
		if (moveEngine.isMoving) {
			moveEngine.endMove();
			canvas.releasePointerCapture(event.pointerId);
			return;
		}

		// Handle crop tool
		if (cropEngine.isDragging) {
			cropEngine.endCrop();
			canvas.releasePointerCapture(event.pointerId);
			return;
		}

		// Handle zoom tool
		if (zoomEngine.isActive) {
			zoomEngine.endZoom(event.altKey);
			canvas.releasePointerCapture(event.pointerId);
			return;
		}

		// Handle selection tool
		if (selectionEngine.isActive) {
			selectionEngine.endSelection();
			canvas.releasePointerCapture(event.pointerId);
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

	function handleQuickNew() {
		dispatch('newDocument');
	}

	async function handleQuickOpen() {
		await openDocumentFromFile();
	}

	async function handleOpenRecent(path: string) {
		try {
			await openDocumentFromPath(path);
		} catch (e) {
			// File might not exist anymore - remove from recent files
			console.error('Failed to open recent file:', e);
			removeRecentFile(path);
		}
	}

	function handleRemoveRecent(event: MouseEvent, path: string) {
		event.stopPropagation();
		removeRecentFile(path);
	}

	function truncatePath(path: string, maxLength: number = 40): string {
		if (path.length <= maxLength) return path;
		const parts = path.split(/[/\\]/);
		const filename = parts.pop() || '';
		let truncated = '.../' + filename;
		for (let i = parts.length - 1; i >= 0 && truncated.length < maxLength; i--) {
			const newPath = parts[i] + '/' + truncated.slice(4);
			if (newPath.length > maxLength - 4) break;
			truncated = '.../' + newPath;
		}
		return truncated;
	}

	// Context menu for zoom tool
	function handleContextMenu(event: MouseEvent) {
		// Show zoom context menu when zoom tool is active
		if ($activeTool === 'zoom' && $documentStore) {
			event.preventDefault();
			zoomMenuX = event.clientX;
			zoomMenuY = event.clientY;
			zoomMenuVisible = true;
		}
	}

	function handleZoomMenuAction(event: CustomEvent<'zoom-in' | 'zoom-out' | 'fit-screen' | 'actual-size' | 'fit-width'>) {
		const action = event.detail;
		const doc = $documentStore;
		const vp = $viewport;

		if (!doc) return;

		switch (action) {
			case 'zoom-in':
				zoomEngine.stepZoomCenter('in');
				break;
			case 'zoom-out':
				zoomEngine.stepZoomCenter('out');
				break;
			case 'fit-screen':
				fitToScreen();
				break;
			case 'actual-size':
				// Zoom to 100%, centered on document
				updateViewport((v) => ({
					...v,
					zoom: 1,
					x: (v.width - doc.width) / 2,
					y: (v.height - doc.height) / 2
				}));
				break;
			case 'fit-width':
				// Fit document width to viewport
				const widthZoom = (vp.width * 0.95) / doc.width;
				updateViewport((v) => ({
					...v,
					zoom: widthZoom,
					x: (v.width - doc.width * widthZoom) / 2,
					y: (v.height - doc.height * widthZoom) / 2
				}));
				break;
		}
	}

	function closeZoomMenu() {
		zoomMenuVisible = false;
	}

	// Keyboard handlers for spacebar panning, move cancel, and zoom modifier
	function handleKeyDown(event: KeyboardEvent) {
		// Don't process if in an input field
		const target = event.target as HTMLElement;
		if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

		// Escape cancels move operation
		if (event.key === 'Escape' && moveEngine.isMoving) {
			moveEngine.cancelMove();
			event.preventDefault();
			return;
		}

		// Escape cancels zoom marquee
		if (event.key === 'Escape' && zoomEngine.isActive) {
			zoomEngine.cancel();
			event.preventDefault();
			return;
		}

		// Escape cancels selection drawing
		if (event.key === 'Escape' && selectionEngine.isActive) {
			selectionEngine.cancel();
			event.preventDefault();
			return;
		}

		// Escape cancels crop operation
		if (event.key === 'Escape' && $activeTool === 'crop' && cropEngine.hasPendingCrop()) {
			cropEngine.cancel();
			event.preventDefault();
			return;
		}

		// Enter commits crop operation
		if (event.key === 'Enter' && $activeTool === 'crop' && cropEngine.hasPendingCrop()) {
			cropEngine.commitCrop();
			event.preventDefault();
			return;
		}

		// Ctrl/Cmd+D = Deselect
		if ((event.ctrlKey || event.metaKey) && event.key === 'd') {
			clearSelection();
			moveEngine.clearFloatingSelection();
			event.preventDefault();
			return;
		}

		// Ctrl/Cmd+A = Select All
		if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
			selectAll();
			event.preventDefault();
			return;
		}

		// Alt+Delete/Backspace = Fill selection with foreground color
		if (event.altKey && (event.key === 'Delete' || event.key === 'Backspace')) {
			const polygonPoints = $selectionState.vectorPath?.type === 'polygon'
				? $selectionState.vectorPath.points
				: undefined;
			fillSelectionWithColor($selectionState.selection, polygonPoints);
			event.preventDefault();
			return;
		}

		// Delete/Backspace = Clear selection contents (if there's a selection)
		if ((event.key === 'Delete' || event.key === 'Backspace') && $hasSelection) {
			const polygonPoints = $selectionState.vectorPath?.type === 'polygon'
				? $selectionState.vectorPath.points
				: undefined;
			deleteSelectionContents($selectionState.selection, polygonPoints);
			event.preventDefault();
			return;
		}

		// Alt key for zoom out
		if (event.key === 'Alt') {
			isAltHeld = true;
		}

		// Shift key for selection constraint
		if (event.key === 'Shift') {
			isShiftHeld = true;
		}

		// Spacebar held = temporary hand tool
		if (event.code === 'Space' && !isSpacebarHeld && !event.repeat) {
			isSpacebarHeld = true;
			event.preventDefault();
		}
	}

	function handleKeyUp(event: KeyboardEvent) {
		// Alt key release
		if (event.key === 'Alt') {
			isAltHeld = false;
		}

		// Shift key release
		if (event.key === 'Shift') {
			isShiftHeld = false;
		}

		if (event.code === 'Space') {
			isSpacebarHeld = false;
			if (isHandPanning) {
				isHandPanning = false;
				isPanning = false;
			}
		}
	}
</script>

<svelte:window on:resize={resizeCanvas} on:keydown={handleKeyDown} on:keyup={handleKeyUp} />

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
	on:contextmenu={handleContextMenu}
	role="application"
	aria-label="Canvas"
	class:drawing={($activeTool === 'brush' || $activeTool === 'eraser') && $documentStore !== null}
	class:hand-cursor={($activeTool === 'hand' || isSpacebarHeld) && $documentStore !== null}
	class:grabbing={isHandPanning}
	class:eyedropper-cursor={$activeTool === 'eyedropper' && $documentStore !== null}
	class:move-cursor={$activeTool === 'move' && $documentStore !== null}
	class:moving={moveEngine.isMoving}
	class:zoom-cursor={$activeTool === 'zoom' && $documentStore !== null}
	class:zoom-out={$activeTool === 'zoom' && isAltHeld && $documentStore !== null}
	class:selection-cursor={['select-rect', 'select-ellipse', 'select-lasso'].includes($activeTool) && $documentStore !== null}
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
			<div class="empty-content">
				<!-- Recent Files Section -->
				{#if $recentFiles.length > 0}
					<div class="recent-section">
						<div class="section-header">
							<Clock size={16} />
							<span>Recent Files</span>
						</div>
						<div class="recent-list">
							{#each $recentFiles as file (file.path)}
								<button
									class="recent-item"
									on:click={() => handleOpenRecent(file.path)}
									title={file.path}
								>
									<FileImage size={16} class="file-icon" />
									<div class="recent-info">
										<span class="recent-name">{file.name}</span>
										<span class="recent-path">{truncatePath(file.path)}</span>
									</div>
									<span class="recent-time">{formatLastOpened(file.lastOpened)}</span>
									<button
										class="remove-btn"
										on:click={(e) => handleRemoveRecent(e, file.path)}
										title="Remove from recent"
									>
										<X size={14} />
									</button>
								</button>
							{/each}
						</div>
						<button class="clear-recent" on:click={clearRecentFiles}>
							Clear Recent Files
						</button>
					</div>
				{/if}

				<!-- Quick Actions Section -->
				<div class="actions-section">
					<p class="title">Welcome to Darker</p>
					<p class="subtitle">
						{#if $recentFiles.length > 0}
							Open a recent file or start fresh
						{:else}
							Create a new document or open an existing file
						{/if}
					</p>
					<div class="quick-actions">
						<button class="action-btn primary" on:click={handleQuickNew}>
							<FilePlus size={20} />
							<span>New Document</span>
						</button>
						<button class="action-btn" on:click={handleQuickOpen}>
							<FolderOpen size={20} />
							<span>Open File</span>
						</button>
					</div>
					<p class="hint">or press Cmd+N / Cmd+O</p>
				</div>
			</div>
		</div>
	{/if}

	{#if $isLoading}
		<div class="loading-overlay">
			<div class="spinner"></div>
			<span>Loading...</span>
		</div>
	{/if}

	<!-- Zoom context menu -->
	<ZoomContextMenu
		x={zoomMenuX}
		y={zoomMenuY}
		visible={zoomMenuVisible}
		on:action={handleZoomMenuAction}
		on:close={closeZoomMenu}
	/>
</div>

<style>
	.canvas-container {
		@apply relative w-full h-full overflow-hidden cursor-crosshair;
	}

	.canvas-container.drawing {
		@apply cursor-none;
	}

	.canvas-container.hand-cursor {
		cursor: grab;
	}

	.canvas-container.hand-cursor.grabbing,
	.canvas-container.grabbing {
		cursor: grabbing;
	}

	.canvas-container.eyedropper-cursor {
		cursor: crosshair;
	}

	.canvas-container.move-cursor {
		cursor: move;
	}

	.canvas-container.move-cursor.moving,
	.canvas-container.moving {
		cursor: grabbing;
	}

	.canvas-container.zoom-cursor {
		cursor: zoom-in;
	}

	.canvas-container.zoom-cursor.zoom-out {
		cursor: zoom-out;
	}

	.canvas-container.selection-cursor {
		cursor: crosshair;
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
		@apply absolute inset-0 flex items-center justify-center;
	}

	.empty-content {
		@apply flex gap-12 items-start max-w-4xl;
	}

	.recent-section {
		@apply flex flex-col gap-3 min-w-[280px] max-w-[320px];
	}

	.section-header {
		@apply flex items-center gap-2 text-editor-text-muted text-sm font-medium;
	}

	.recent-list {
		@apply flex flex-col gap-1 max-h-[320px] overflow-y-auto;
	}

	.recent-item {
		@apply flex items-center gap-3 px-3 py-2 rounded-lg text-left w-full
			   bg-editor-panel/50 border border-transparent
			   hover:bg-editor-panel hover:border-editor-border
			   transition-colors;
	}

	.recent-item :global(.file-icon) {
		@apply flex-shrink-0 text-editor-text-muted;
	}

	.recent-info {
		@apply flex flex-col flex-1 min-w-0;
	}

	.recent-name {
		@apply text-sm text-editor-text truncate;
	}

	.recent-path {
		@apply text-xs text-editor-text-muted truncate;
	}

	.recent-time {
		@apply text-xs text-editor-text-muted flex-shrink-0;
	}

	.remove-btn {
		@apply p-1 rounded opacity-0
			   hover:bg-editor-border/50 text-editor-text-muted
			   hover:text-editor-text transition-all;
	}

	.recent-item:hover .remove-btn {
		@apply opacity-100;
	}

	.clear-recent {
		@apply text-xs text-editor-text-muted hover:text-editor-accent
			   transition-colors self-start mt-1;
	}

	.actions-section {
		@apply flex flex-col items-center gap-4;
	}

	.title {
		@apply text-2xl font-semibold text-editor-text;
	}

	.subtitle {
		@apply text-editor-text-muted text-center;
	}

	.quick-actions {
		@apply flex gap-4 mt-2;
	}

	.action-btn {
		@apply flex items-center gap-2 px-4 py-2 bg-editor-panel border border-editor-border
			   rounded-lg text-editor-text hover:border-editor-accent hover:bg-editor-accent/10
			   transition-colors;
	}

	.action-btn.primary {
		@apply bg-editor-accent/20 border-editor-accent/50 hover:bg-editor-accent/30;
	}

	.hint {
		@apply text-sm text-editor-text-muted mt-2;
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
