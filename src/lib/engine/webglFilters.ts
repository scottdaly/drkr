/**
 * WebGL Filter Processor
 *
 * Uses GPU shaders to apply image filters, which is significantly faster
 * than CPU-based processing for large images.
 */

type FilterType = 'brightness' | 'contrast' | 'saturation' | 'blur' | 'invert' | 'grayscale';

interface FilterParams {
	brightness?: number; // -100 to 100
	contrast?: number;   // -100 to 100
	saturation?: number; // -100 to 100
	blur?: number;       // radius in pixels
	invert?: boolean;
	grayscale?: boolean;
}

// Vertex shader - simple pass-through
const vertexShaderSource = `
	attribute vec2 a_position;
	attribute vec2 a_texCoord;
	varying vec2 v_texCoord;

	void main() {
		gl_Position = vec4(a_position, 0.0, 1.0);
		v_texCoord = a_texCoord;
	}
`;

// Fragment shader for color adjustments (brightness, contrast, saturation, invert, grayscale)
const colorAdjustShaderSource = `
	precision mediump float;
	varying vec2 v_texCoord;
	uniform sampler2D u_image;
	uniform float u_brightness; // -1 to 1
	uniform float u_contrast;   // -1 to 1
	uniform float u_saturation; // -1 to 1
	uniform bool u_invert;
	uniform bool u_grayscale;

	void main() {
		vec4 color = texture2D(u_image, v_texCoord);

		// Apply brightness
		color.rgb += u_brightness;

		// Apply contrast
		color.rgb = (color.rgb - 0.5) * (1.0 + u_contrast) + 0.5;

		// Apply grayscale
		if (u_grayscale) {
			float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
			color.rgb = vec3(gray);
		}

		// Apply saturation
		float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
		color.rgb = mix(vec3(gray), color.rgb, 1.0 + u_saturation);

		// Apply invert
		if (u_invert) {
			color.rgb = 1.0 - color.rgb;
		}

		// Clamp values
		color.rgb = clamp(color.rgb, 0.0, 1.0);

		gl_FragColor = color;
	}
`;

// Fragment shader for Gaussian blur (horizontal pass)
const blurHShaderSource = `
	precision mediump float;
	varying vec2 v_texCoord;
	uniform sampler2D u_image;
	uniform vec2 u_textureSize;
	uniform float u_radius;

	void main() {
		vec2 onePixel = vec2(1.0, 0.0) / u_textureSize;
		vec4 color = vec4(0.0);
		float totalWeight = 0.0;

		// Simple box blur for now (faster than Gaussian, still looks good)
		int radiusInt = int(u_radius);
		for (int i = -50; i <= 50; i++) {
			if (i > radiusInt || i < -radiusInt) continue;
			float weight = 1.0 - abs(float(i)) / u_radius;
			color += texture2D(u_image, v_texCoord + onePixel * float(i)) * weight;
			totalWeight += weight;
		}

		gl_FragColor = color / totalWeight;
	}
`;

// Fragment shader for Gaussian blur (vertical pass)
const blurVShaderSource = `
	precision mediump float;
	varying vec2 v_texCoord;
	uniform sampler2D u_image;
	uniform vec2 u_textureSize;
	uniform float u_radius;

	void main() {
		vec2 onePixel = vec2(0.0, 1.0) / u_textureSize;
		vec4 color = vec4(0.0);
		float totalWeight = 0.0;

		int radiusInt = int(u_radius);
		for (int i = -50; i <= 50; i++) {
			if (i > radiusInt || i < -radiusInt) continue;
			float weight = 1.0 - abs(float(i)) / u_radius;
			color += texture2D(u_image, v_texCoord + onePixel * float(i)) * weight;
			totalWeight += weight;
		}

		gl_FragColor = color / totalWeight;
	}
`;

export class WebGLFilterProcessor {
	private canvas: HTMLCanvasElement;
	private gl: WebGLRenderingContext;
	private colorProgram: WebGLProgram;
	private blurHProgram: WebGLProgram;
	private blurVProgram: WebGLProgram;
	private vertexBuffer: WebGLBuffer;
	private texCoordBuffer: WebGLBuffer;
	private texture: WebGLTexture;
	private framebuffer: WebGLFramebuffer;
	private tempTexture: WebGLTexture;

	constructor() {
		// Create offscreen canvas
		this.canvas = document.createElement('canvas');
		const gl = this.canvas.getContext('webgl', {
			premultipliedAlpha: false,
			preserveDrawingBuffer: true
		});

		if (!gl) {
			throw new Error('WebGL not supported');
		}

		this.gl = gl;

		// Create shader programs
		this.colorProgram = this.createProgram(vertexShaderSource, colorAdjustShaderSource);
		this.blurHProgram = this.createProgram(vertexShaderSource, blurHShaderSource);
		this.blurVProgram = this.createProgram(vertexShaderSource, blurVShaderSource);

		// Create buffers
		this.vertexBuffer = this.createBuffer(new Float32Array([
			-1, -1,
			 1, -1,
			-1,  1,
			 1,  1,
		]));

		this.texCoordBuffer = this.createBuffer(new Float32Array([
			0, 1,
			1, 1,
			0, 0,
			1, 0,
		]));

		// Create textures
		this.texture = this.createTexture();
		this.tempTexture = this.createTexture();

		// Create framebuffer for multi-pass rendering
		this.framebuffer = gl.createFramebuffer()!;
	}

	/**
	 * Apply filters to pixel data using GPU shaders
	 */
	applyFilters(
		pixels: Uint8ClampedArray,
		width: number,
		height: number,
		params: FilterParams
	): Uint8ClampedArray {
		const gl = this.gl;

		// Resize canvas if needed
		if (this.canvas.width !== width || this.canvas.height !== height) {
			this.canvas.width = width;
			this.canvas.height = height;
			gl.viewport(0, 0, width, height);

			// Resize temp texture
			gl.bindTexture(gl.TEXTURE_2D, this.tempTexture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		}

		// Upload source pixels to texture
		gl.bindTexture(gl.TEXTURE_2D, this.texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

		let currentTexture = this.texture;
		let targetTexture = this.tempTexture;

		// Apply blur if needed (two-pass)
		if (params.blur && params.blur > 0) {
			// Horizontal pass
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, targetTexture, 0);

			this.renderWithProgram(this.blurHProgram, currentTexture, {
				u_textureSize: [width, height],
				u_radius: Math.min(params.blur, 50)
			});

			// Swap textures
			[currentTexture, targetTexture] = [targetTexture, currentTexture];

			// Vertical pass
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, targetTexture, 0);

			this.renderWithProgram(this.blurVProgram, currentTexture, {
				u_textureSize: [width, height],
				u_radius: Math.min(params.blur, 50)
			});

			// Swap textures
			[currentTexture, targetTexture] = [targetTexture, currentTexture];
		}

		// Apply color adjustments
		const hasColorAdjustments =
			params.brightness !== undefined ||
			params.contrast !== undefined ||
			params.saturation !== undefined ||
			params.invert ||
			params.grayscale;

		if (hasColorAdjustments) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, targetTexture, 0);

			this.renderWithProgram(this.colorProgram, currentTexture, {
				u_brightness: (params.brightness ?? 0) / 100,
				u_contrast: (params.contrast ?? 0) / 100,
				u_saturation: (params.saturation ?? 0) / 100,
				u_invert: params.invert ?? false,
				u_grayscale: params.grayscale ?? false
			});

			[currentTexture, targetTexture] = [targetTexture, currentTexture];
		}

		// Read back pixels from the final result
		// If we've done any processing, read from framebuffer
		// Otherwise, just return the original
		if (params.blur || hasColorAdjustments) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, currentTexture, 0);

			const result = new Uint8ClampedArray(width * height * 4);
			gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, result);

			gl.bindFramebuffer(gl.FRAMEBUFFER, null);

			// WebGL reads pixels upside down, need to flip
			return this.flipVertically(result, width, height);
		}

		return pixels;
	}

	/**
	 * Check if WebGL is available
	 */
	static isSupported(): boolean {
		const canvas = document.createElement('canvas');
		return !!canvas.getContext('webgl');
	}

	/**
	 * Dispose of GPU resources
	 */
	dispose(): void {
		const gl = this.gl;
		gl.deleteProgram(this.colorProgram);
		gl.deleteProgram(this.blurHProgram);
		gl.deleteProgram(this.blurVProgram);
		gl.deleteBuffer(this.vertexBuffer);
		gl.deleteBuffer(this.texCoordBuffer);
		gl.deleteTexture(this.texture);
		gl.deleteTexture(this.tempTexture);
		gl.deleteFramebuffer(this.framebuffer);
	}

	// ============ Private helpers ============

	private createShader(type: number, source: string): WebGLShader {
		const gl = this.gl;
		const shader = gl.createShader(type)!;
		gl.shaderSource(shader, source);
		gl.compileShader(shader);

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			const error = gl.getShaderInfoLog(shader);
			gl.deleteShader(shader);
			throw new Error(`Shader compile error: ${error}`);
		}

		return shader;
	}

	private createProgram(vertexSource: string, fragmentSource: string): WebGLProgram {
		const gl = this.gl;
		const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexSource);
		const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);

		const program = gl.createProgram()!;
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			const error = gl.getProgramInfoLog(program);
			gl.deleteProgram(program);
			throw new Error(`Program link error: ${error}`);
		}

		// Clean up shaders (they're now part of the program)
		gl.deleteShader(vertexShader);
		gl.deleteShader(fragmentShader);

		return program;
	}

	private createBuffer(data: Float32Array): WebGLBuffer {
		const gl = this.gl;
		const buffer = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
		return buffer;
	}

	private createTexture(): WebGLTexture {
		const gl = this.gl;
		const texture = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, texture);

		// Set texture parameters for non-power-of-2 textures
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

		return texture;
	}

	private renderWithProgram(
		program: WebGLProgram,
		sourceTexture: WebGLTexture,
		uniforms: Record<string, number | number[] | boolean>
	): void {
		const gl = this.gl;

		gl.useProgram(program);

		// Set up vertex position attribute
		const positionLoc = gl.getAttribLocation(program, 'a_position');
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
		gl.enableVertexAttribArray(positionLoc);
		gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

		// Set up texture coordinate attribute
		const texCoordLoc = gl.getAttribLocation(program, 'a_texCoord');
		gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
		gl.enableVertexAttribArray(texCoordLoc);
		gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);

		// Bind source texture
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
		gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);

		// Set uniforms
		for (const [name, value] of Object.entries(uniforms)) {
			const loc = gl.getUniformLocation(program, name);
			if (loc === null) continue;

			if (typeof value === 'boolean') {
				gl.uniform1i(loc, value ? 1 : 0);
			} else if (typeof value === 'number') {
				gl.uniform1f(loc, value);
			} else if (Array.isArray(value)) {
				if (value.length === 2) {
					gl.uniform2f(loc, value[0], value[1]);
				} else if (value.length === 3) {
					gl.uniform3f(loc, value[0], value[1], value[2]);
				} else if (value.length === 4) {
					gl.uniform4f(loc, value[0], value[1], value[2], value[3]);
				}
			}
		}

		// Draw
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	}

	private flipVertically(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
		const result = new Uint8ClampedArray(data.length);
		const rowSize = width * 4;

		for (let y = 0; y < height; y++) {
			const srcRow = (height - 1 - y) * rowSize;
			const dstRow = y * rowSize;
			result.set(data.subarray(srcRow, srcRow + rowSize), dstRow);
		}

		return result;
	}
}

// Singleton instance
let instance: WebGLFilterProcessor | null = null;

/**
 * Get the WebGL filter processor instance
 */
export function getWebGLFilterProcessor(): WebGLFilterProcessor | null {
	if (!WebGLFilterProcessor.isSupported()) {
		return null;
	}

	if (!instance) {
		try {
			instance = new WebGLFilterProcessor();
		} catch (e) {
			console.warn('Failed to create WebGL filter processor:', e);
			return null;
		}
	}

	return instance;
}

/**
 * Apply a filter using WebGL if available, otherwise return null
 */
export function applyWebGLFilter(
	pixels: Uint8ClampedArray,
	width: number,
	height: number,
	params: FilterParams
): Uint8ClampedArray | null {
	const processor = getWebGLFilterProcessor();
	if (!processor) {
		return null;
	}

	try {
		return processor.applyFilters(pixels, width, height, params);
	} catch (e) {
		console.warn('WebGL filter failed:', e);
		return null;
	}
}
