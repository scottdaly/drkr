import type { CropRegion, HandleType } from '$lib/stores/crop';
import type { Selection } from '$lib/types/document';

// Snap target types
export type SnapTargetType = 'document-edge' | 'document-center' | 'selection' | 'guide';

export interface SnapTarget {
	type: SnapTargetType;
	axis: 'x' | 'y';
	position: number; // Document space coordinate
}

export interface SnapResult {
	region: CropRegion;
	activeSnaps: SnapTarget[];
}

interface RegionEdge {
	axis: 'x' | 'y';
	side: 'left' | 'right' | 'top' | 'bottom';
	position: number;
}

/**
 * Collect all snap targets from document, selection, and guides
 */
export function getSnapTargets(
	docWidth: number,
	docHeight: number,
	selection: Selection | null
): SnapTarget[] {
	const targets: SnapTarget[] = [];

	// Document edges
	targets.push({ type: 'document-edge', axis: 'x', position: 0 });
	targets.push({ type: 'document-edge', axis: 'x', position: docWidth });
	targets.push({ type: 'document-edge', axis: 'y', position: 0 });
	targets.push({ type: 'document-edge', axis: 'y', position: docHeight });

	// Document center
	targets.push({ type: 'document-center', axis: 'x', position: docWidth / 2 });
	targets.push({ type: 'document-center', axis: 'y', position: docHeight / 2 });

	// Selection bounds (if active)
	if (selection && selection.type !== 'none' && selection.bounds) {
		const b = selection.bounds;
		targets.push({ type: 'selection', axis: 'x', position: b.x });
		targets.push({ type: 'selection', axis: 'x', position: b.x + b.width });
		targets.push({ type: 'selection', axis: 'y', position: b.y });
		targets.push({ type: 'selection', axis: 'y', position: b.y + b.height });
		// Selection center
		targets.push({ type: 'selection', axis: 'x', position: b.x + b.width / 2 });
		targets.push({ type: 'selection', axis: 'y', position: b.y + b.height / 2 });
	}

	// TODO: Add guide support when guides feature is implemented
	// doc.guides?.forEach(guide => {
	//   targets.push({
	//     type: 'guide',
	//     axis: guide.orientation === 'vertical' ? 'x' : 'y',
	//     position: guide.position
	//   });
	// });

	return targets;
}

/**
 * Get which edges should be checked for snapping based on the active handle
 */
function getEdgesToSnap(region: CropRegion, handle: HandleType | null): RegionEdge[] {
	const left = region.x;
	const right = region.x + region.width;
	const top = region.y;
	const bottom = region.y + region.height;

	switch (handle) {
		case 'nw':
			return [
				{ axis: 'x', side: 'left', position: left },
				{ axis: 'y', side: 'top', position: top }
			];
		case 'n':
			return [{ axis: 'y', side: 'top', position: top }];
		case 'ne':
			return [
				{ axis: 'x', side: 'right', position: right },
				{ axis: 'y', side: 'top', position: top }
			];
		case 'w':
			return [{ axis: 'x', side: 'left', position: left }];
		case 'e':
			return [{ axis: 'x', side: 'right', position: right }];
		case 'sw':
			return [
				{ axis: 'x', side: 'left', position: left },
				{ axis: 'y', side: 'bottom', position: bottom }
			];
		case 's':
			return [{ axis: 'y', side: 'bottom', position: bottom }];
		case 'se':
			return [
				{ axis: 'x', side: 'right', position: right },
				{ axis: 'y', side: 'bottom', position: bottom }
			];
		case 'move':
		case null:
		default:
			// For move operations and drawing new regions, check all edges
			return [
				{ axis: 'x', side: 'left', position: left },
				{ axis: 'x', side: 'right', position: right },
				{ axis: 'y', side: 'top', position: top },
				{ axis: 'y', side: 'bottom', position: bottom }
			];
	}
}

/**
 * Adjust region for a single snap
 */
function adjustRegionForSnap(
	region: CropRegion,
	edge: RegionEdge,
	target: SnapTarget,
	handle: HandleType | null
): CropRegion {
	const delta = target.position - edge.position;
	const newRegion = { ...region };

	if (edge.axis === 'x') {
		if (handle === 'move' || handle === null) {
			// Move: shift entire region
			newRegion.x += delta;
		} else if (edge.side === 'left') {
			// Resize from left: adjust x and width
			newRegion.x += delta;
			newRegion.width -= delta;
		} else {
			// Resize from right: adjust width only
			newRegion.width += delta;
		}
	} else {
		if (handle === 'move' || handle === null) {
			// Move: shift entire region
			newRegion.y += delta;
		} else if (edge.side === 'top') {
			// Resize from top: adjust y and height
			newRegion.y += delta;
			newRegion.height -= delta;
		} else {
			// Resize from bottom: adjust height only
			newRegion.height += delta;
		}
	}

	return newRegion;
}

/**
 * Apply snapping to a crop region
 */
export function applySnapping(
	region: CropRegion,
	targets: SnapTarget[],
	threshold: number,
	handle: HandleType | null,
	isDrawingNew: boolean = false
): SnapResult {
	const edges = getEdgesToSnap(region, isDrawingNew ? null : handle);
	const activeSnaps: SnapTarget[] = [];
	let snappedRegion = { ...region };

	// Track which axes have been snapped to avoid double-snapping
	const snappedAxes = new Set<string>();

	// For move operations, we want to snap all edges together
	// For resize operations, we snap individual edges
	const isMove = handle === 'move';

	for (const edge of edges) {
		// Skip if we already snapped this axis (for move operations)
		if (isMove && snappedAxes.has(edge.axis)) continue;

		// Get matching targets for this axis, sorted by distance
		const matchingTargets = targets
			.filter((t) => t.axis === edge.axis)
			.map((t) => ({
				target: t,
				distance: Math.abs(edge.position - t.position)
			}))
			.filter((t) => t.distance <= threshold)
			.sort((a, b) => a.distance - b.distance);

		if (matchingTargets.length > 0) {
			const closest = matchingTargets[0];
			snappedRegion = adjustRegionForSnap(
				snappedRegion,
				edge,
				closest.target,
				isDrawingNew ? null : handle
			);
			activeSnaps.push(closest.target);

			if (isMove) {
				snappedAxes.add(edge.axis);
			}
		}
	}

	return { region: snappedRegion, activeSnaps };
}
