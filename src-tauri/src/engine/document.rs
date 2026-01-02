use super::history::HistoryManager;
use super::layer::Layer;
use crate::commands::crop::CropResult;
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

    /// Rename a document
    pub fn rename_document(&mut self, doc_id: &str, name: &str) -> AppResult<()> {
        let doc = self.documents.get_mut(doc_id)
            .ok_or_else(|| AppError::DocumentNotFound(doc_id.to_string()))?;
        doc.name = name.to_string();
        Ok(())
    }

    /// List all open document IDs
    #[allow(dead_code)]
    pub fn list_documents(&self) -> Vec<String> {
        self.documents.keys().cloned().collect()
    }

    /// Get all open documents
    pub fn get_all_documents(&self) -> Vec<&Document> {
        self.documents.values().collect()
    }

    /// Crop the document to the specified region.
    ///
    /// This modifies the document dimensions and crops/expands all layer pixel buffers.
    /// Negative x/y values extend the canvas, positive values crop into existing content.
    ///
    /// # Arguments
    /// * `doc_id` - The document ID
    /// * `crop_x` - X coordinate of crop region origin (in original document space)
    /// * `crop_y` - Y coordinate of crop region origin
    /// * `new_width` - Width of the cropped document
    /// * `new_height` - Height of the cropped document
    pub fn crop_document(
        &mut self,
        doc_id: &str,
        crop_x: i32,
        crop_y: i32,
        new_width: u32,
        new_height: u32,
    ) -> AppResult<CropResult> {
        let doc = self
            .documents
            .get_mut(doc_id)
            .ok_or_else(|| AppError::DocumentNotFound(doc_id.to_string()))?;

        let mut layers_affected: Vec<String> = Vec::new();

        // Process each layer
        for layer in &mut doc.layers {
            // Get current pixel data for this layer
            let old_pixels = self
                .pixel_data
                .get(&layer.id)
                .cloned()
                .unwrap_or_else(|| vec![0u8; (layer.width * layer.height * 4) as usize]);

            // Calculate new layer pixels
            let new_pixels = Self::crop_layer_pixels(
                &old_pixels,
                layer.width,
                layer.height,
                layer.x,
                layer.y,
                crop_x,
                crop_y,
                new_width,
                new_height,
            );

            // Update layer dimensions and position
            // After crop, layer position is adjusted relative to new document origin
            layer.x -= crop_x;
            layer.y -= crop_y;
            layer.width = new_width;
            layer.height = new_height;

            // Store new pixel data
            self.pixel_data.insert(layer.id.clone(), new_pixels);
            layers_affected.push(layer.id.clone());
        }

        // Update document dimensions
        doc.width = new_width;
        doc.height = new_height;
        doc.mark_modified();

        Ok(CropResult {
            doc_id: doc_id.to_string(),
            new_width,
            new_height,
            layers_affected,
        })
    }

    /// Crop/expand layer pixels to fit a new region.
    ///
    /// This handles both cropping (removing pixels outside the region)
    /// and expansion (adding transparent pixels for new areas).
    fn crop_layer_pixels(
        old_pixels: &[u8],
        old_width: u32,
        old_height: u32,
        layer_x: i32,
        layer_y: i32,
        crop_x: i32,
        crop_y: i32,
        new_width: u32,
        new_height: u32,
    ) -> Vec<u8> {
        let mut new_pixels = vec![0u8; (new_width * new_height * 4) as usize];

        // For each pixel in the new buffer, determine if it should come from old buffer
        for new_y in 0..new_height as i32 {
            for new_x in 0..new_width as i32 {
                // Calculate position in original document space
                let doc_x = crop_x + new_x;
                let doc_y = crop_y + new_y;

                // Calculate position in old layer space
                let old_layer_x = doc_x - layer_x;
                let old_layer_y = doc_y - layer_y;

                // Check if this position was within the old layer bounds
                if old_layer_x >= 0
                    && old_layer_x < old_width as i32
                    && old_layer_y >= 0
                    && old_layer_y < old_height as i32
                {
                    // Copy pixel from old buffer
                    let old_idx = ((old_layer_y as u32 * old_width + old_layer_x as u32) * 4) as usize;
                    let new_idx = ((new_y as u32 * new_width + new_x as u32) * 4) as usize;

                    if old_idx + 3 < old_pixels.len() && new_idx + 3 < new_pixels.len() {
                        new_pixels[new_idx] = old_pixels[old_idx];
                        new_pixels[new_idx + 1] = old_pixels[old_idx + 1];
                        new_pixels[new_idx + 2] = old_pixels[old_idx + 2];
                        new_pixels[new_idx + 3] = old_pixels[old_idx + 3];
                    }
                }
                // Else: pixel stays transparent (already initialized to 0)
            }
        }

        new_pixels
    }
}

impl Default for DocumentManager {
    fn default() -> Self {
        Self::new()
    }
}
