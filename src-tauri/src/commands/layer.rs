use crate::engine::{DocumentManager, Layer};
use crate::error::{AppError, AppResult};
use std::sync::Mutex;
use tauri::State;

use crate::engine::LayerUpdate;

#[tauri::command]
pub fn add_layer(
    manager: State<'_, Mutex<DocumentManager>>,
    doc_id: String,
    name: String,
) -> AppResult<Layer> {
    let mut manager = manager.lock().map_err(|_| {
        AppError::InvalidOperation("Failed to acquire document manager lock".into())
    })?;

    let doc = manager
        .get(&doc_id)
        .ok_or_else(|| AppError::DocumentNotFound(doc_id.clone()))?;

    let (width, height) = (doc.width, doc.height);

    manager.add_layer_to_document(&doc_id, &name, width, height)
}

#[tauri::command]
pub fn remove_layer(
    manager: State<'_, Mutex<DocumentManager>>,
    doc_id: String,
    layer_id: String,
) -> AppResult<()> {
    let mut manager = manager.lock().map_err(|_| {
        AppError::InvalidOperation("Failed to acquire document manager lock".into())
    })?;

    let doc = manager
        .get_mut(&doc_id)
        .ok_or_else(|| AppError::DocumentNotFound(doc_id.clone()))?;

    doc.remove_layer(&layer_id)?;
    Ok(())
}

#[tauri::command]
pub fn update_layer(
    manager: State<'_, Mutex<DocumentManager>>,
    doc_id: String,
    layer_id: String,
    update: LayerUpdate,
) -> AppResult<Layer> {
    let mut manager = manager.lock().map_err(|_| {
        AppError::InvalidOperation("Failed to acquire document manager lock".into())
    })?;

    let doc = manager
        .get_mut(&doc_id)
        .ok_or_else(|| AppError::DocumentNotFound(doc_id.clone()))?;

    let layer = doc
        .get_layer_mut(&layer_id)
        .ok_or_else(|| AppError::LayerNotFound(layer_id.clone()))?;

    layer.apply_update(update);

    Ok(layer.clone())
}

#[tauri::command]
pub fn reorder_layers(
    manager: State<'_, Mutex<DocumentManager>>,
    doc_id: String,
    from_index: usize,
    to_index: usize,
) -> AppResult<()> {
    let mut manager = manager.lock().map_err(|_| {
        AppError::InvalidOperation("Failed to acquire document manager lock".into())
    })?;

    let doc = manager
        .get_mut(&doc_id)
        .ok_or_else(|| AppError::DocumentNotFound(doc_id.clone()))?;

    doc.reorder_layers(from_index, to_index)
}

#[tauri::command]
pub fn get_layer_pixels(
    manager: State<'_, Mutex<DocumentManager>>,
    layer_id: String,
) -> AppResult<Vec<u8>> {
    let manager = manager.lock().map_err(|_| {
        AppError::InvalidOperation("Failed to acquire document manager lock".into())
    })?;

    manager
        .get_layer_pixels(&layer_id)
        .cloned()
        .ok_or_else(|| AppError::LayerNotFound(layer_id))
}
