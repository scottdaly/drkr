use super::types::*;
use crate::engine::layer::Layer;
use crate::engine::Document;
use crate::error::{AppError, AppResult};
use image::io::Reader as ImageReader;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufReader, Cursor, Read};
use std::path::Path;
use zip::ZipArchive;

/// Result of reading a DRKR file
pub struct DrkrReadResult {
    pub document: Document,
    pub layer_pixels: HashMap<String, Vec<u8>>,
}

/// Reader for DRKR format files
pub struct DrkrReader<R: Read + std::io::Seek> {
    archive: ZipArchive<R>,
}

impl DrkrReader<BufReader<File>> {
    /// Open a DRKR file from a path
    pub fn open<P: AsRef<Path>>(path: P) -> AppResult<Self> {
        let file = File::open(path).map_err(|e| AppError::IoError(e.to_string()))?;
        let reader = BufReader::new(file);
        Self::new(reader)
    }
}

impl<R: Read + std::io::Seek> DrkrReader<R> {
    /// Create a new DRKR reader from a reader
    pub fn new(reader: R) -> AppResult<Self> {
        let archive =
            ZipArchive::new(reader).map_err(|e| AppError::IoError(format!("Invalid ZIP: {}", e)))?;
        Ok(Self { archive })
    }

    /// Validate the DRKR file format
    pub fn validate(&mut self) -> AppResult<()> {
        // Check mimetype
        let mimetype = self.read_file_as_string("mimetype")?;
        if mimetype.trim() != DRKR_MIMETYPE {
            return Err(AppError::InvalidOperation(format!(
                "Invalid DRKR file: expected mimetype '{}', got '{}'",
                DRKR_MIMETYPE,
                mimetype.trim()
            )));
        }

        // Check manifest version
        let manifest = self.read_manifest()?;
        let major_version: u32 = manifest
            .drkr_version
            .split('.')
            .next()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);

        if major_version > 1 {
            return Err(AppError::InvalidOperation(format!(
                "Unsupported DRKR version: {}",
                manifest.drkr_version
            )));
        }

        Ok(())
    }

    /// Read the manifest
    pub fn read_manifest(&mut self) -> AppResult<DrkrManifest> {
        let json = self.read_file_as_string("manifest.json")?;
        serde_json::from_str(&json).map_err(|e| {
            AppError::SerializationError(format!("Failed to parse manifest.json: {}", e))
        })
    }

    /// Read the document metadata
    pub fn read_document_json(&mut self) -> AppResult<DrkrDocument> {
        let json = self.read_file_as_string("document.json")?;
        serde_json::from_str(&json).map_err(|e| {
            AppError::SerializationError(format!("Failed to parse document.json: {}", e))
        })
    }

    /// Read a layer's metadata
    pub fn read_layer_meta(&mut self, layer_id: &str) -> AppResult<DrkrLayerMeta> {
        let path = format!("layers/{}/meta.json", layer_id);
        let json = self.read_file_as_string(&path)?;
        serde_json::from_str(&json)
            .map_err(|e| AppError::SerializationError(format!("Failed to parse {}: {}", path, e)))
    }

    /// Read a layer's pixel data (decodes WebP to RGBA)
    pub fn read_layer_pixels(&mut self, layer_id: &str) -> AppResult<Vec<u8>> {
        let path = format!("layers/{}/pixels.webp", layer_id);
        let webp_data = self.read_file_as_bytes(&path)?;
        decode_webp_to_rgba(&webp_data)
    }

    /// Read the thumbnail
    pub fn read_thumbnail(&mut self) -> AppResult<Vec<u8>> {
        let webp_data = self.read_file_as_bytes("preview/thumbnail.webp")?;
        decode_webp_to_rgba(&webp_data)
    }

    /// Read the complete document with all layer pixels
    pub fn read_all(&mut self) -> AppResult<DrkrReadResult> {
        // Validate first
        self.validate()?;

        // Read document metadata
        let drkr_doc = self.read_document_json()?;

        // Build layers and read pixels
        let mut layers = Vec::new();
        let mut layer_pixels = HashMap::new();

        for layer_ref in &drkr_doc.layers {
            // Read layer metadata
            let meta = self.read_layer_meta(&layer_ref.id)?;
            let layer = meta.to_layer();

            // Read pixel data if it's a raster layer
            if layer_ref.layer_type == "raster" || layer_ref.layer_type == "ai_generated" {
                match self.read_layer_pixels(&layer_ref.id) {
                    Ok(pixels) => {
                        layer_pixels.insert(layer_ref.id.clone(), pixels);
                    }
                    Err(e) => {
                        log::warn!("Failed to read pixels for layer {}: {}", layer_ref.id, e);
                        // Create transparent pixels as fallback
                        let size = (layer.width * layer.height * 4) as usize;
                        layer_pixels.insert(layer_ref.id.clone(), vec![0u8; size]);
                    }
                }
            }

            layers.push(layer);
        }

        // Build Document
        let document = Document {
            id: drkr_doc.id,
            name: drkr_doc.name,
            width: drkr_doc.width,
            height: drkr_doc.height,
            resolution: drkr_doc.resolution.map(|r| r.value).unwrap_or(72),
            layers,
            created_at: chrono::Utc::now().timestamp_millis(),
            modified_at: chrono::Utc::now().timestamp_millis(),
            source_path: None, // Will be set by the caller
        };

        Ok(DrkrReadResult {
            document,
            layer_pixels,
        })
    }

    /// Read a file from the archive as a string
    fn read_file_as_string(&mut self, name: &str) -> AppResult<String> {
        let mut file = self
            .archive
            .by_name(name)
            .map_err(|e| AppError::IoError(format!("File '{}' not found in archive: {}", name, e)))?;

        let mut contents = String::new();
        file.read_to_string(&mut contents)
            .map_err(|e| AppError::IoError(format!("Failed to read '{}': {}", name, e)))?;

        Ok(contents)
    }

    /// Read a file from the archive as bytes
    fn read_file_as_bytes(&mut self, name: &str) -> AppResult<Vec<u8>> {
        let mut file = self
            .archive
            .by_name(name)
            .map_err(|e| AppError::IoError(format!("File '{}' not found in archive: {}", name, e)))?;

        let mut contents = Vec::new();
        file.read_to_end(&mut contents)
            .map_err(|e| AppError::IoError(format!("Failed to read '{}': {}", name, e)))?;

        Ok(contents)
    }
}

/// Decode WebP data to RGBA pixels
fn decode_webp_to_rgba(webp_data: &[u8]) -> AppResult<Vec<u8>> {
    let cursor = Cursor::new(webp_data);
    let reader = ImageReader::new(cursor)
        .with_guessed_format()
        .map_err(|e| AppError::IoError(format!("Failed to detect image format: {}", e)))?;

    let img = reader
        .decode()
        .map_err(|e| AppError::IoError(format!("Failed to decode WebP: {}", e)))?;

    Ok(img.to_rgba8().into_raw())
}
