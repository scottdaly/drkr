export interface Document {
	id: string;
	name: string;
	width: number;
	height: number;
	resolution: number; // PPI
	colorProfile: ColorProfile;
	layers: Layer[];
	guides: Guide[];
	createdAt: number;
	modifiedAt: number;

	// For large image support
	tiled: boolean;
	tileSize?: number;

	// File path where document is saved (if any)
	sourcePath?: string;
}

export interface Layer {
	id: string;
	name: string;
	type: LayerType;
	visible: boolean;
	locked: boolean;
	opacity: number; // 0-100
	blendMode: BlendMode;

	// Position within document
	x: number;
	y: number;
	width: number;
	height: number;

	// Pixel data reference (stored in Rust backend)
	dataRef: string;

	// Optional features
	mask?: MaskData;
	clippingMask?: boolean;

	// For AI-generated content
	aiMetadata?: AILayerMetadata;
}

export type LayerType = 'raster' | 'adjustment' | 'group' | 'text' | 'shape';

export type BlendMode =
	| 'normal'
	| 'multiply'
	| 'screen'
	| 'overlay'
	| 'darken'
	| 'lighten'
	| 'colorDodge'
	| 'colorBurn'
	| 'hardLight'
	| 'softLight'
	| 'difference'
	| 'exclusion'
	| 'hue'
	| 'saturation'
	| 'color'
	| 'luminosity';

export interface MaskData {
	dataRef: string;
	enabled: boolean;
	linked: boolean; // Linked to layer transform
	density: number; // 0-100
	feather: number; // Pixels
}

export interface AILayerMetadata {
	prompt: string;
	provider: string;
	model: string;
	timestamp: number;
	cost?: number;
}

export interface ColorProfile {
	name: string;
	colorSpace: 'srgb' | 'display-p3' | 'adobe-rgb';
	iccProfile?: Uint8Array;
}

export interface Guide {
	id: string;
	orientation: 'horizontal' | 'vertical';
	position: number; // Pixels from left/top edge
}

export interface Selection {
	type: 'none' | 'rect' | 'ellipse' | 'path' | 'bitmap';
	bounds?: { x: number; y: number; width: number; height: number };
	maskData?: Uint8Array;
	feather: number;
}

export interface Viewport {
	x: number;
	y: number;
	zoom: number;
	width: number;
	height: number;
}
