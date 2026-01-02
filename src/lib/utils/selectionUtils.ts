import type { Selection } from '$lib/types/document';

/**
 * Check if a point is inside a selection
 * @param x - X coordinate in document space
 * @param y - Y coordinate in document space
 * @param selection - The selection to check against
 * @param polygonPoints - For lasso selections, the polygon points
 * @returns true if point is in selection (or if there's no selection)
 */
export function isPointInSelectionBounds(
	x: number,
	y: number,
	selection: Selection,
	polygonPoints?: { x: number; y: number }[]
): boolean {
	// No selection = everything selected
	if (selection.type === 'none' || !selection.bounds) return true;

	const { bounds } = selection;

	// Check bounding box first (fast rejection)
	if (
		x < bounds.x ||
		x > bounds.x + bounds.width ||
		y < bounds.y ||
		y > bounds.y + bounds.height
	) {
		return false;
	}

	// Rectangle: already checked bounds
	if (selection.type === 'rect') {
		return true;
	}

	// Ellipse: check if point is inside ellipse
	if (selection.type === 'ellipse') {
		const cx = bounds.x + bounds.width / 2;
		const cy = bounds.y + bounds.height / 2;
		const rx = bounds.width / 2;
		const ry = bounds.height / 2;

		const dx = (x - cx) / rx;
		const dy = (y - cy) / ry;
		return dx * dx + dy * dy <= 1;
	}

	// Polygon/Path: use ray casting
	if (selection.type === 'path' && polygonPoints && polygonPoints.length >= 3) {
		return isPointInPolygon({ x, y }, polygonPoints);
	}

	return true;
}

/**
 * Point in polygon test using ray casting algorithm
 */
function isPointInPolygon(
	point: { x: number; y: number },
	polygon: { x: number; y: number }[]
): boolean {
	if (polygon.length < 3) return false;

	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const xi = polygon[i].x;
		const yi = polygon[i].y;
		const xj = polygon[j].x;
		const yj = polygon[j].y;

		if (yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) {
			inside = !inside;
		}
	}

	return inside;
}
