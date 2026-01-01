use crate::engine::DocumentManager;
use crate::error::{AppError, AppResult};
use serde::Deserialize;
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum FilterParams {
    GaussianBlur { radius: f32 },
    Brightness { value: i32 },
    Contrast { value: f32 },
    Saturation { value: f32 },
    Invert,
    Grayscale,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterResult {
    pub layer_id: String,
    pub success: bool,
}

#[tauri::command]
pub fn apply_filter(
    manager: State<'_, Mutex<DocumentManager>>,
    doc_id: String,
    layer_id: String,
    filter: FilterParams,
) -> AppResult<FilterResult> {
    let mut manager = manager.lock().map_err(|_| {
        AppError::InvalidOperation("Failed to acquire document manager lock".into())
    })?;

    // Get document to verify it exists
    let doc = manager
        .get(&doc_id)
        .ok_or_else(|| AppError::DocumentNotFound(doc_id.clone()))?;

    // Get layer dimensions
    let layer = doc
        .get_layer(&layer_id)
        .ok_or_else(|| AppError::LayerNotFound(layer_id.clone()))?;

    let (width, height) = (layer.width, layer.height);

    // Get pixel data
    let pixels = manager
        .get_layer_pixels(&layer_id)
        .ok_or_else(|| AppError::LayerNotFound(layer_id.clone()))?
        .clone();

    // Apply filter
    let processed = match filter {
        FilterParams::Brightness { value } => apply_brightness(pixels, value),
        FilterParams::Contrast { value } => apply_contrast(pixels, value),
        FilterParams::Saturation { value } => apply_saturation(pixels, value),
        FilterParams::Invert => apply_invert(pixels),
        FilterParams::Grayscale => apply_grayscale(pixels),
        FilterParams::GaussianBlur { radius } => apply_gaussian_blur(pixels, width, height, radius),
    };

    // Update pixel data
    manager.set_layer_pixels(&layer_id, processed);

    Ok(FilterResult {
        layer_id,
        success: true,
    })
}

fn apply_brightness(mut pixels: Vec<u8>, value: i32) -> Vec<u8> {
    for chunk in pixels.chunks_exact_mut(4) {
        for i in 0..3 {
            chunk[i] = (chunk[i] as i32 + value).clamp(0, 255) as u8;
        }
    }
    pixels
}

fn apply_contrast(mut pixels: Vec<u8>, value: f32) -> Vec<u8> {
    let factor = (259.0 * (value + 255.0)) / (255.0 * (259.0 - value));

    for chunk in pixels.chunks_exact_mut(4) {
        for i in 0..3 {
            let new_val = factor * (chunk[i] as f32 - 128.0) + 128.0;
            chunk[i] = new_val.clamp(0.0, 255.0) as u8;
        }
    }
    pixels
}

fn apply_saturation(mut pixels: Vec<u8>, value: f32) -> Vec<u8> {
    let factor = 1.0 + value / 100.0;

    for chunk in pixels.chunks_exact_mut(4) {
        let r = chunk[0] as f32;
        let g = chunk[1] as f32;
        let b = chunk[2] as f32;

        let gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        chunk[0] = (gray + factor * (r - gray)).clamp(0.0, 255.0) as u8;
        chunk[1] = (gray + factor * (g - gray)).clamp(0.0, 255.0) as u8;
        chunk[2] = (gray + factor * (b - gray)).clamp(0.0, 255.0) as u8;
    }
    pixels
}

fn apply_invert(mut pixels: Vec<u8>) -> Vec<u8> {
    for chunk in pixels.chunks_exact_mut(4) {
        chunk[0] = 255 - chunk[0];
        chunk[1] = 255 - chunk[1];
        chunk[2] = 255 - chunk[2];
    }
    pixels
}

fn apply_grayscale(mut pixels: Vec<u8>) -> Vec<u8> {
    for chunk in pixels.chunks_exact_mut(4) {
        let gray = (0.2126 * chunk[0] as f32 + 0.7152 * chunk[1] as f32 + 0.0722 * chunk[2] as f32)
            as u8;
        chunk[0] = gray;
        chunk[1] = gray;
        chunk[2] = gray;
    }
    pixels
}

fn apply_gaussian_blur(pixels: Vec<u8>, width: u32, height: u32, radius: f32) -> Vec<u8> {
    // Simple box blur approximation for now
    // A proper implementation would use separable Gaussian kernel
    let radius = radius.round() as i32;
    if radius <= 0 {
        return pixels;
    }

    let mut output = pixels.clone();
    let w = width as i32;
    let h = height as i32;

    // Simple box blur (horizontal pass)
    for y in 0..h {
        for x in 0..w {
            let mut r_sum = 0u32;
            let mut g_sum = 0u32;
            let mut b_sum = 0u32;
            let mut count = 0u32;

            for dx in -radius..=radius {
                let nx = x + dx;
                if nx >= 0 && nx < w {
                    let idx = ((y * w + nx) * 4) as usize;
                    r_sum += pixels[idx] as u32;
                    g_sum += pixels[idx + 1] as u32;
                    b_sum += pixels[idx + 2] as u32;
                    count += 1;
                }
            }

            let idx = ((y * w + x) * 4) as usize;
            output[idx] = (r_sum / count) as u8;
            output[idx + 1] = (g_sum / count) as u8;
            output[idx + 2] = (b_sum / count) as u8;
        }
    }

    output
}
