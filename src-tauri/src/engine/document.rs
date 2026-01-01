use super::history::HistoryManager;
use super::layer::Layer;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub resolution: u32,
    pub layers: Vec<Layer>,
    pub created_at: i64,
    pub modified_at: i64,
    /// The file path where this document is saved (if any)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_path: Option<String>,
}

impl Document {
    pub fn new(name: &str, width: u32, height: u32, resolution: u32) -> Self {
        let now = chrono::Utc::now().timestamp_millis();
        let id = Uuid::new_v4().to_string();

        // Create default background layer
        let background_layer = Layer::new_raster("Background", width, height);

        Self {
            id,
            name: name.to_string(),
            width,
            height,
            resolution,
            layers: vec![background_layer],
            created_at: now,
            modified_at: now,
            source_path: None,
        }
    }

    pub fn get_layer(&self, layer_id: &str) -> Option<&Layer> {
        self.layers.iter().find(|l| l.id == layer_id)
    }

    pub fn get_layer_mut(&mut self, layer_id: &str) -> Option<&mut Layer> {
        self.layers.iter_mut().find(|l| l.id == layer_id)
    }

    pub fn add_layer(&mut self, layer: Layer) {
        self.layers.push(layer);
        self.mark_modified();
    }

    pub fn remove_layer(&mut self, layer_id: &str) -> AppResult<Layer> {
        let index = self
            .layers
            .iter()
            .position(|l| l.id == layer_id)
            .ok_or_else(|| AppError::LayerNotFound(layer_id.to_string()))?;

        let layer = self.layers.remove(index);
        self.mark_modified();
        Ok(layer)
    }

    pub fn reorder_layers(&mut self, from_index: usize, to_index: usize) -> AppResult<()> {
        if from_index >= self.layers.len() || to_index >= self.layers.len() {
            return Err(AppError::InvalidOperation("Invalid layer indices".into()));
        }

        let layer = self.layers.remove(from_index);
        self.layers.insert(to_index, layer);
        self.mark_modified();
        Ok(())
    }

    fn mark_modified(&mut self) {
        self.modified_at = chrono::Utc::now().timestamp_millis();
    }
}

pub struct DocumentManager {
    documents: HashMap<String, Document>,
    history: HashMap<String, HistoryManager>,
    pixel_data: HashMap<String, Vec<u8>>, // layer_id -> RGBA pixel data
}

impl DocumentManager {
    pub fn new() -> Self {
        Self {
            documents: HashMap::new(),
            history: HashMap::new(),
            pixel_data: HashMap::new(),
        }
    }

    pub fn create(&mut self, name: &str, width: u32, height: u32, resolution: u32) -> Document {
        let doc = Document::new(name, width, height, resolution);

        // Initialize pixel data for the background layer
        if let Some(bg_layer) = doc.layers.first() {
            let pixels = vec![255u8; (width * height * 4) as usize]; // White background
            self.pixel_data.insert(bg_layer.id.clone(), pixels);
        }

        // Initialize history for this document
        self.history
            .insert(doc.id.clone(), HistoryManager::new(50));

        let doc_clone = doc.clone();
        self.documents.insert(doc.id.clone(), doc);

        doc_clone
    }

    pub fn get(&self, doc_id: &str) -> Option<&Document> {
        self.documents.get(doc_id)
    }

    pub fn get_mut(&mut self, doc_id: &str) -> Option<&mut Document> {
        self.documents.get_mut(doc_id)
    }

    pub fn close(&mut self, doc_id: &str) -> AppResult<()> {
        let doc = self
            .documents
            .remove(doc_id)
            .ok_or_else(|| AppError::DocumentNotFound(doc_id.to_string()))?;

        // Clean up pixel data for all layers
        for layer in &doc.layers {
            self.pixel_data.remove(&layer.id);
        }

        // Clean up history
        self.history.remove(doc_id);

        Ok(())
    }

    pub fn get_layer_pixels(&self, layer_id: &str) -> Option<&Vec<u8>> {
        self.pixel_data.get(layer_id)
    }

    pub fn set_layer_pixels(&mut self, layer_id: &str, pixels: Vec<u8>) {
        self.pixel_data.insert(layer_id.to_string(), pixels);
    }

    pub fn add_layer_to_document(
        &mut self,
        doc_id: &str,
        name: &str,
        width: u32,
        height: u32,
    ) -> AppResult<Layer> {
        // Check document exists first
        if !self.documents.contains_key(doc_id) {
            return Err(AppError::DocumentNotFound(doc_id.to_string()));
        }

        let layer = Layer::new_raster(name, width, height);
        let layer_clone = layer.clone();

        // Initialize transparent pixel data
        let pixels = vec![0u8; (width * height * 4) as usize];
        self.pixel_data.insert(layer.id.clone(), pixels);

        // Now add layer to document
        if let Some(doc) = self.documents.get_mut(doc_id) {
            doc.add_layer(layer);
        }

        Ok(layer_clone)
    }

    /// Register a document that was loaded from a file
    /// This is used when loading DRKR files
    pub fn register_loaded_document(
        &mut self,
        doc: Document,
        layer_pixels: std::collections::HashMap<String, Vec<u8>>,
    ) -> Document {
        let doc_id = doc.id.clone();
        let doc_clone = doc.clone();

        // Initialize history for this document
        self.history.insert(doc_id.clone(), HistoryManager::new(50));

        // Store all layer pixels
        for (layer_id, pixels) in layer_pixels {
            self.pixel_data.insert(layer_id, pixels);
        }

        // Add document to manager
        self.documents.insert(doc_id, doc);

        doc_clone
    }

    /// Get all layer pixel data for a document (for saving)
    pub fn get_all_layer_pixels(&self, doc_id: &str) -> Option<std::collections::HashMap<String, Vec<u8>>> {
        let doc = self.documents.get(doc_id)?;
        let mut result = std::collections::HashMap::new();

        for layer in &doc.layers {
            if let Some(pixels) = self.pixel_data.get(&layer.id) {
                result.insert(layer.id.clone(), pixels.clone());
            }
        }

        Some(result)
    }

    /// Set the source path for a document (called after saving)
    pub fn set_source_path(&mut self, doc_id: &str, path: &str) -> AppResult<()> {
        let doc = self.documents.get_mut(doc_id)
            .ok_or_else(|| AppError::DocumentNotFound(doc_id.to_string()))?;
        doc.source_path = Some(path.to_string());
        Ok(())
    }

    /// List all open document IDs
    pub fn list_documents(&self) -> Vec<String> {
        self.documents.keys().cloned().collect()
    }

    /// Get all open documents
    pub fn get_all_documents(&self) -> Vec<&Document> {
        self.documents.values().collect()
    }
}

impl Default for DocumentManager {
    fn default() -> Self {
        Self::new()
    }
}
