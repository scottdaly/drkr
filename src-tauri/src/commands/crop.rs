use crate::engine::DocumentManager;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

/// Result of a crop operation, includes updated document info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CropResult {
    pub doc_id: String,
    pub new_width: u32,
    pub new_height: u32,
    pub layers_affected: Vec<String>,
}

/// Crop the document to the specified region.
///
/// The crop region can extend beyond current document bounds (canvas expansion)
/// or be smaller (cropping). All layers are adjusted accordingly.
///
/// # Arguments
/// * `doc_id` - The document ID
/// * `x` - X coordinate of crop region (can be negative for expansion)
/// * `y` - Y coordinate of crop region (can be negative for expansion)
/// * `width` - Width of the new document
/// * `height` - Height of the new document
#[tauri::command]
pub fn crop_document(
    manager: State<'_, Mutex<DocumentManager>>,
    doc_id: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> AppResult<CropResult> {
    // Validate dimensions
    if width == 0 || height == 0 {
        return Err(AppError::InvalidOperation(
            "Crop dimensions must be greater than zero".into(),
        ));
    }

    let mut manager = manager.lock().map_err(|_| {
        AppError::InvalidOperation("Failed to acquire document manager lock".into())
    })?;

    let result = manager.crop_document(&doc_id, x, y, width, height)?;

    log::info!(
        "Cropped document {} to {}x{} at ({}, {})",
        doc_id, width, height, x, y
    );

    Ok(result)
}
