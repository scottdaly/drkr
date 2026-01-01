use crate::engine::{Document, DocumentManager};
use crate::error::{AppError, AppResult};
use crate::io::{DrkrReader, DrkrWriter};
use std::sync::Mutex;
use tauri::State;

#[tauri::command]
pub fn create_document(
    manager: State<'_, Mutex<DocumentManager>>,
    name: String,
    width: u32,
    height: u32,
    resolution: Option<u32>,
) -> AppResult<Document> {
    let mut manager = manager.lock().map_err(|_| {
        AppError::InvalidOperation("Failed to acquire document manager lock".into())
    })?;

    let doc = manager.create(&name, width, height, resolution.unwrap_or(72));
    Ok(doc)
}

#[tauri::command]
pub fn get_document(
    manager: State<'_, Mutex<DocumentManager>>,
    doc_id: String,
) -> AppResult<Document> {
    let manager = manager.lock().map_err(|_| {
        AppError::InvalidOperation("Failed to acquire document manager lock".into())
    })?;

    manager
        .get(&doc_id)
        .cloned()
        .ok_or_else(|| AppError::DocumentNotFound(doc_id))
}

#[tauri::command]
pub async fn open_document(
    manager: State<'_, Mutex<DocumentManager>>,
    path: String,
) -> AppResult<Document> {
    // Read the file
    let img = image::open(&path).map_err(|e| AppError::ImageError(e.to_string()))?;

    let width = img.width();
    let height = img.height();

    // Extract filename from path
    let name = std::path::Path::new(&path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();

    let mut manager = manager.lock().map_err(|_| {
        AppError::InvalidOperation("Failed to acquire document manager lock".into())
    })?;

    // Create document
    let doc = manager.create(&name, width, height, 72);

    // Get the background layer and set its pixels
    if let Some(bg_layer) = doc.layers.first() {
        let rgba = img.to_rgba8();
        manager.set_layer_pixels(&bg_layer.id, rgba.into_raw());
    }

    Ok(doc)
}

#[tauri::command]
pub async fn save_document(
    manager: State<'_, Mutex<DocumentManager>>,
    doc_id: String,
    path: String,
    _format: Option<String>,
) -> AppResult<()> {
    let manager = manager.lock().map_err(|_| {
        AppError::InvalidOperation("Failed to acquire document manager lock".into())
    })?;

    let doc = manager
        .get(&doc_id)
        .ok_or_else(|| AppError::DocumentNotFound(doc_id.clone()))?;

    // For now, just save the first layer's pixels
    // A real implementation would composite all visible layers
    if let Some(layer) = doc.layers.first() {
        if let Some(pixels) = manager.get_layer_pixels(&layer.id) {
            let img =
                image::RgbaImage::from_raw(layer.width, layer.height, pixels.clone()).ok_or_else(
                    || AppError::ImageError("Failed to create image from pixel data".into()),
                )?;

            img.save(&path)
                .map_err(|e| AppError::ImageError(e.to_string()))?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn close_document(
    manager: State<'_, Mutex<DocumentManager>>,
    doc_id: String,
) -> AppResult<()> {
    let mut manager = manager.lock().map_err(|_| {
        AppError::InvalidOperation("Failed to acquire document manager lock".into())
    })?;

    manager.close(&doc_id)
}

/// Save a document in DRKR format
#[tauri::command]
pub async fn save_document_drkr(
    manager: State<'_, Mutex<DocumentManager>>,
    doc_id: String,
    path: String,
) -> AppResult<Document> {
    // Collect document and pixel data while holding the lock
    let (doc, layer_pixels) = {
        let manager = manager.lock().map_err(|_| {
            AppError::InvalidOperation("Failed to acquire document manager lock".into())
        })?;

        let doc = manager
            .get(&doc_id)
            .ok_or_else(|| AppError::DocumentNotFound(doc_id.clone()))?
            .clone();

        let layer_pixels = manager
            .get_all_layer_pixels(&doc_id)
            .unwrap_or_default();

        (doc, layer_pixels)
    };

    // Create the DRKR file (this doesn't need the lock)
    let mut writer = DrkrWriter::create(&path)?;
    writer.write_document(&doc, &layer_pixels)?;
    writer.finish()?;

    // Update the source path in the document
    let updated_doc = {
        let mut manager = manager.lock().map_err(|_| {
            AppError::InvalidOperation("Failed to acquire document manager lock".into())
        })?;
        manager.set_source_path(&doc_id, &path)?;
        manager.get(&doc_id).cloned()
            .ok_or_else(|| AppError::DocumentNotFound(doc_id.clone()))?
    };

    log::info!("Saved document '{}' to {}", doc.name, path);
    Ok(updated_doc)
}

/// Open a document from DRKR format
#[tauri::command]
pub async fn open_document_drkr(
    manager: State<'_, Mutex<DocumentManager>>,
    path: String,
) -> AppResult<Document> {
    // Read the DRKR file (doesn't need the lock)
    let mut reader = DrkrReader::open(&path)?;
    let mut result = reader.read_all()?;

    // Set the source path on the document
    result.document.source_path = Some(path.clone());

    // Register the document with the manager
    let mut manager = manager.lock().map_err(|_| {
        AppError::InvalidOperation("Failed to acquire document manager lock".into())
    })?;

    let doc = manager.register_loaded_document(result.document, result.layer_pixels);

    log::info!("Opened DRKR document from {}", path);
    Ok(doc)
}

/// List all open document IDs
#[tauri::command]
pub fn list_documents(
    manager: State<'_, Mutex<DocumentManager>>,
) -> AppResult<Vec<Document>> {
    let manager = manager.lock().map_err(|_| {
        AppError::InvalidOperation("Failed to acquire document manager lock".into())
    })?;

    Ok(manager.get_all_documents().into_iter().cloned().collect())
}

/// Set the source path for a document
#[tauri::command]
pub fn set_document_path(
    manager: State<'_, Mutex<DocumentManager>>,
    doc_id: String,
    path: String,
) -> AppResult<Document> {
    let mut manager = manager.lock().map_err(|_| {
        AppError::InvalidOperation("Failed to acquire document manager lock".into())
    })?;

    manager.set_source_path(&doc_id, &path)?;
    manager.get(&doc_id).cloned()
        .ok_or_else(|| AppError::DocumentNotFound(doc_id))
}
