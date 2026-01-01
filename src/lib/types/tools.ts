export type ToolType =
	| 'brush'
	| 'eraser'
	| 'move'
	| 'select-rect'
	| 'select-ellipse'
	| 'select-lasso'
	| 'eyedropper'
	| 'crop'
	| 'text'
	| 'shape'
	| 'zoom'
	| 'hand';

export interface BrushSettings {
	size: number; // Pixels (1-5000)
	hardness: number; // 0-100
	opacity: number; // 0-100
	flow: number; // 0-100
	spacing: number; // Percentage of brush size
	smoothing: number; // 0-100

	// Dynamics (future)
	pressureSize?: boolean;
	pressureOpacity?: boolean;
	pressureHardness?: boolean;
}

export interface SelectionSettings {
	mode: SelectionMode;
	feather: number;
	antiAlias: boolean;

	// Magic wand / select similar
	tolerance?: number;
	contiguous?: boolean;
	sampleAllLayers?: boolean;
}

export type SelectionMode = 'new' | 'add' | 'subtract' | 'intersect';

export interface TransformSettings {
	maintainAspectRatio: boolean;
	interpolation: 'nearest' | 'bilinear' | 'bicubic';
}

export interface Color {
	r: number; // 0-255
	g: number; // 0-255
	b: number; // 0-255
	a: number; // 0-1
}

export interface ColorState {
	foreground: Color;
	background: Color;
}
