use crate::engine::DocumentManager;
use crate::error::{AppError, AppResult};
use serde::Deserialize;
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrushStrokePoint {
    pub x: f64,
    pub y: f64,
    pub pressure: Option<f64>,
    #[allow(dead_code)]
    pub timestamp: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrushStrokeSettings {
    pub size: f64,
    pub hardness: f64,    // 0-100
    pub opacity: f64,     // 0-100
    pub flow: f64,        // 0-100
    #[allow(dead_code)]
    pub spacing: f64,     // percentage
}

#[derive(Debug, Clone, Deserialize)]
pub struct BrushColor {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: f64,  // 0-1
}

#[tauri::command]
pub fn apply_brush_stroke(
    manager: State<'_, Mutex<DocumentManager>>,
    doc_id: String,
    layer_id: String,
    points: Vec<BrushStrokePoint>,
    settings: BrushStrokeSettings,
    color: BrushColor,
    is_eraser: bool,
) -> AppResult<()> {
    let mut manager = manager.lock().map_err(|_| {
        AppError::InvalidOperation("Failed to acquire document manager lock".into())
    })?;

    // Get the document to find layer dimensions
    let doc = manager
        .get(&doc_id)
        .ok_or_else(|| AppError::DocumentNotFound(doc_id.clone()))?;

    let layer = doc
        .get_layer(&layer_id)
        .ok_or_else(|| AppError::LayerNotFound(layer_id.clone()))?;

    // Check if layer is locked
    if layer.locked {
        return Err(AppError::InvalidOperation("Layer is locked".into()));
    }

    let layer_width = layer.width as usize;
    let layer_height = layer.height as usize;
    let layer_x = layer.x;
    let layer_y = layer.y;

    // Get mutable pixel data
    let pixels = manager
        .get_layer_pixels(&layer_id)
        .ok_or_else(|| AppError::LayerNotFound(layer_id.clone()))?
        .clone();

    let mut pixels = pixels;

    // Apply brush stroke
    for point in &points {
        apply_brush_stamp(
            &mut pixels,
            layer_width,
            layer_height,
            layer_x,
            layer_y,
            point,
            &settings,
            &color,
            is_eraser,
        );
    }

    // Save modified pixels back
    manager.set_layer_pixels(&layer_id, pixels);

    // Mark document as modified
    if let Some(doc) = manager.get_mut(&doc_id) {
        doc.modified_at = chrono::Utc::now().timestamp_millis();
    }

    Ok(())
}

fn apply_brush_stamp(
    pixels: &mut [u8],
    layer_width: usize,
    layer_height: usize,
    layer_x: i32,
    layer_y: i32,
    point: &BrushStrokePoint,
    settings: &BrushStrokeSettings,
    color: &BrushColor,
    is_eraser: bool,
) {
    let radius = settings.size / 2.0;
    let pressure = point.pressure.unwrap_or(1.0);

    // Calculate effective opacity based on flow and pressure
    let base_opacity = (settings.opacity / 100.0) * (settings.flow / 100.0) * pressure;

    // Calculate brush bounds relative to layer
    let brush_x = point.x - layer_x as f64;
    let brush_y = point.y - layer_y as f64;

    let min_x = ((brush_x - radius).floor() as i32).max(0) as usize;
    let max_x = ((brush_x + radius).ceil() as i32).min(layer_width as i32 - 1) as usize;
    let min_y = ((brush_y - radius).floor() as i32).max(0) as usize;
    let max_y = ((brush_y + radius).ceil() as i32).min(layer_height as i32 - 1) as usize;

    // Precompute hardness factor for falloff
    // hardness of 100 = hard edge, 0 = soft edge
    let hardness = settings.hardness / 100.0;
    let inner_radius = radius * hardness;
    let falloff_range = radius - inner_radius;

    for py in min_y..=max_y {
        for px in min_x..=max_x {
            let dx = px as f64 - brush_x;
            let dy = py as f64 - brush_y;
            let dist = (dx * dx + dy * dy).sqrt();

            if dist > radius {
                continue;
            }

            // Calculate opacity based on distance and hardness
            let alpha = if dist <= inner_radius {
                base_opacity
            } else if falloff_range > 0.0 {
                let falloff = 1.0 - ((dist - inner_radius) / falloff_range);
                base_opacity * falloff * falloff // quadratic falloff for smoother edges
            } else {
                base_opacity
            };

            if alpha <= 0.0 {
                continue;
            }

            let idx = (py * layer_width + px) * 4;
            if idx + 3 >= pixels.len() {
                continue;
            }

            if is_eraser {
                // Eraser: reduce alpha
                let current_alpha = pixels[idx + 3] as f64 / 255.0;
                let new_alpha = (current_alpha * (1.0 - alpha)).max(0.0);
                pixels[idx + 3] = (new_alpha * 255.0) as u8;
            } else {
                // Normal brush: blend color
                blend_pixel(
                    &mut pixels[idx..idx + 4],
                    color.r,
                    color.g,
                    color.b,
                    (alpha * color.a * 255.0) as u8,
                );
            }
        }
    }
}

fn blend_pixel(dst: &mut [u8], src_r: u8, src_g: u8, src_b: u8, src_a: u8) {
    if src_a == 0 {
        return;
    }

    let src_alpha = src_a as f64 / 255.0;
    let dst_alpha = dst[3] as f64 / 255.0;

    // Porter-Duff "over" compositing
    let out_alpha = src_alpha + dst_alpha * (1.0 - src_alpha);

    if out_alpha <= 0.0 {
        dst[0] = 0;
        dst[1] = 0;
        dst[2] = 0;
        dst[3] = 0;
        return;
    }

    let src_r = src_r as f64 / 255.0;
    let src_g = src_g as f64 / 255.0;
    let src_b = src_b as f64 / 255.0;
    let dst_r = dst[0] as f64 / 255.0;
    let dst_g = dst[1] as f64 / 255.0;
    let dst_b = dst[2] as f64 / 255.0;

    let out_r = (src_r * src_alpha + dst_r * dst_alpha * (1.0 - src_alpha)) / out_alpha;
    let out_g = (src_g * src_alpha + dst_g * dst_alpha * (1.0 - src_alpha)) / out_alpha;
    let out_b = (src_b * src_alpha + dst_b * dst_alpha * (1.0 - src_alpha)) / out_alpha;

    dst[0] = (out_r * 255.0).clamp(0.0, 255.0) as u8;
    dst[1] = (out_g * 255.0).clamp(0.0, 255.0) as u8;
    dst[2] = (out_b * 255.0).clamp(0.0, 255.0) as u8;
    dst[3] = (out_alpha * 255.0).clamp(0.0, 255.0) as u8;
}
