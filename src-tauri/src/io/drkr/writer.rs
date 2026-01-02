use super::types::*;
use crate::engine::Document;
use crate::error::{AppError, AppResult};
use image::{DynamicImage, ImageFormat, RgbaImage};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufWriter, Cursor, Write};
use std::path::Path;
use zip::write::{FileOptions, ZipWriter};
use zip::CompressionMethod;

/// Writer for DRKR format files
pub struct DrkrWriter<W: Write + std::io::Seek> {
    zip: ZipWriter<W>,
}

impl DrkrWriter<BufWriter<File>> {
    /// Create a new DRKR writer for a file path
    pub fn create<P: AsRef<Path>>(path: P) -> AppResult<Self> {
        let file = File::create(path).map_err(|e| AppError::IoError(e.to_string()))?;
        let writer = BufWriter::new(file);
        Ok(Self {
            zip: ZipWriter::new(writer),
        })
    }
}

impl<W: Write + std::io::Seek> DrkrWriter<W> {
    /// Create a new DRKR writer from a writer
    #[allow(dead_code)]
    pub fn new(writer: W) -> Self {
        Self {
            zip: ZipWriter::new(writer),
        }
    }

    /// Write a complete document to the DRKR file
    pub fn write_document(
        &mut self,
        doc: &Document,
        layer_pixels: &HashMap<String, Vec<u8>>,
    ) -> AppResult<()> {
        // 1. Write mimetype (MUST be first, uncompressed)
        self.write_mimetype()?;

        // 2. Write manifest
        self.write_manifest(doc)?;

        // 3. Write document.json
        self.write_document_json(doc)?;

        // 4. Write thumbnail
        self.write_thumbnail(doc, layer_pixels)?;

        // 5. Write merged preview
        self.write_merged_preview(doc, layer_pixels)?;

        // 6. Write layers
        for layer in &doc.layers {
            if let Some(pixels) = layer_pixels.get(&layer.id) {
                self.write_layer(layer, pixels)?;
            }
        }

        Ok(())
    }

    /// Finalize and close the archive
    pub fn finish(mut self) -> AppResult<W> {
        self.zip
            .finish()
            .map_err(|e| AppError::IoError(format!("Failed to finalize ZIP: {}", e)))
    }

    fn write_mimetype(&mut self) -> AppResult<()> {
        // mimetype MUST be stored uncompressed
        let options = FileOptions::default().compression_method(CompressionMethod::Stored);
        self.zip
            .start_file("mimetype", options)
            .map_err(|e| AppError::IoError(format!("Failed to write mimetype: {}", e)))?;
        self.zip
            .write_all(DRKR_MIMETYPE.as_bytes())
            .map_err(|e| AppError::IoError(e.to_string()))?;
        Ok(())
    }

    fn write_manifest(&mut self, _doc: &Document) -> AppResult<()> {
        let now = chrono::Utc::now().to_rfc3339();
        let manifest = DrkrManifest {
            drkr_version: DRKR_VERSION.to_string(),
            generator: DrkrGenerator {
                name: "Darker".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
                url: Some("https://github.com/darker".to_string()),
            },
            created_at: now.clone(),
            modified_at: now,
            files: None, // Optional file offset table
            extensions_used: None,
        };

        let json = serde_json::to_string_pretty(&manifest)
            .map_err(|e| AppError::SerializationError(e.to_string()))?;

        let options = FileOptions::default().compression_method(CompressionMethod::Deflated);
        self.zip
            .start_file("manifest.json", options)
            .map_err(|e| AppError::IoError(e.to_string()))?;
        self.zip
            .write_all(json.as_bytes())
            .map_err(|e| AppError::IoError(e.to_string()))?;

        Ok(())
    }

    fn write_document_json(&mut self, doc: &Document) -> AppResult<()> {
        let drkr_doc = DrkrDocument::from_document(doc);
        let json = serde_json::to_string_pretty(&drkr_doc)
            .map_err(|e| AppError::SerializationError(e.to_string()))?;

        let options = FileOptions::default().compression_method(CompressionMethod::Deflated);
        self.zip
            .start_file("document.json", options)
            .map_err(|e| AppError::IoError(e.to_string()))?;
        self.zip
            .write_all(json.as_bytes())
            .map_err(|e| AppError::IoError(e.to_string()))?;

        Ok(())
    }

    fn write_layer(
        &mut self,
        layer: &crate::engine::layer::Layer,
        pixels: &[u8],
    ) -> AppResult<()> {
        let layer_dir = format!("layers/{}", layer.id);

        // Write meta.json
        let meta = DrkrLayerMeta::from_layer(layer);
        let meta_json = serde_json::to_string_pretty(&meta)
            .map_err(|e| AppError::SerializationError(e.to_string()))?;

        let options = FileOptions::default().compression_method(CompressionMethod::Deflated);
        self.zip
            .start_file(format!("{}/meta.json", layer_dir), options)
            .map_err(|e| AppError::IoError(e.to_string()))?;
        self.zip
            .write_all(meta_json.as_bytes())
            .map_err(|e| AppError::IoError(e.to_string()))?;

        // Write pixels.webp
        let webp_data = encode_rgba_to_webp(pixels, layer.width, layer.height)?;

        self.zip
            .start_file(format!("{}/pixels.webp", layer_dir), options)
            .map_err(|e| AppError::IoError(e.to_string()))?;
        self.zip
            .write_all(&webp_data)
            .map_err(|e| AppError::IoError(e.to_string()))?;

        Ok(())
    }

    fn write_thumbnail(
        &mut self,
        doc: &Document,
        layer_pixels: &HashMap<String, Vec<u8>>,
    ) -> AppResult<()> {
        // Composite all visible layers and scale to max 256x256
        let merged = composite_layers(doc, layer_pixels)?;

        // Scale to thumbnail size (max 256x256)
        let thumbnail = scale_to_fit(&merged, 256, 256);

        // Encode as WebP
        let webp_data = encode_dynamic_image_to_webp(&thumbnail)?;

        let options = FileOptions::default().compression_method(CompressionMethod::Deflated);
        self.zip
            .start_file("preview/thumbnail.webp", options)
            .map_err(|e| AppError::IoError(e.to_string()))?;
        self.zip
            .write_all(&webp_data)
            .map_err(|e| AppError::IoError(e.to_string()))?;

        Ok(())
    }

    fn write_merged_preview(
        &mut self,
        doc: &Document,
        layer_pixels: &HashMap<String, Vec<u8>>,
    ) -> AppResult<()> {
        // Composite all visible layers at full resolution
        let merged = composite_layers(doc, layer_pixels)?;

        // Encode as WebP
        let webp_data = encode_dynamic_image_to_webp(&merged)?;

        let options = FileOptions::default().compression_method(CompressionMethod::Deflated);
        self.zip
            .start_file("preview/merged.webp", options)
            .map_err(|e| AppError::IoError(e.to_string()))?;
        self.zip
            .write_all(&webp_data)
            .map_err(|e| AppError::IoError(e.to_string()))?;

        Ok(())
    }
}

/// Encode RGBA pixels to WebP format
fn encode_rgba_to_webp(pixels: &[u8], width: u32, height: u32) -> AppResult<Vec<u8>> {
    let img = RgbaImage::from_raw(width, height, pixels.to_vec())
        .ok_or_else(|| AppError::InvalidOperation("Invalid pixel data dimensions".into()))?;

    let dynamic = DynamicImage::ImageRgba8(img);
    encode_dynamic_image_to_webp(&dynamic)
}

/// Encode a DynamicImage to WebP
fn encode_dynamic_image_to_webp(img: &DynamicImage) -> AppResult<Vec<u8>> {
    let mut cursor = Cursor::new(Vec::new());
    img.write_to(&mut cursor, ImageFormat::WebP)
        .map_err(|e| AppError::IoError(format!("Failed to encode WebP: {}", e)))?;
    Ok(cursor.into_inner())
}

/// Composite all visible layers into a single image
fn composite_layers(
    doc: &Document,
    layer_pixels: &HashMap<String, Vec<u8>>,
) -> AppResult<DynamicImage> {
    // Create transparent base image
    let mut result = RgbaImage::new(doc.width, doc.height);

    // Composite layers from bottom to top
    for layer in &doc.layers {
        if !layer.visible {
            continue;
        }

        if let Some(pixels) = layer_pixels.get(&layer.id) {
            let layer_img = RgbaImage::from_raw(layer.width, layer.height, pixels.clone())
                .ok_or_else(|| {
                    AppError::InvalidOperation("Invalid layer pixel data".into())
                })?;

            // Simple alpha compositing
            for y in 0..layer.height {
                for x in 0..layer.width {
                    let dst_x = (layer.x + x as i32) as u32;
                    let dst_y = (layer.y + y as i32) as u32;

                    if dst_x < doc.width && dst_y < doc.height {
                        let src_pixel = layer_img.get_pixel(x, y);
                        let dst_pixel = result.get_pixel_mut(dst_x, dst_y);

                        // Apply layer opacity
                        let src_alpha =
                            (src_pixel[3] as u32 * layer.opacity as u32 / 100) as u8;

                        if src_alpha == 255 {
                            *dst_pixel = *src_pixel;
                        } else if src_alpha > 0 {
                            // Alpha blend
                            let src_a = src_alpha as f32 / 255.0;
                            let dst_a = dst_pixel[3] as f32 / 255.0;
                            let out_a = src_a + dst_a * (1.0 - src_a);

                            if out_a > 0.0 {
                                for c in 0..3 {
                                    let src_c = src_pixel[c] as f32;
                                    let dst_c = dst_pixel[c] as f32;
                                    let out_c = (src_c * src_a + dst_c * dst_a * (1.0 - src_a))
                                        / out_a;
                                    dst_pixel[c] = out_c.min(255.0) as u8;
                                }
                                dst_pixel[3] = (out_a * 255.0) as u8;
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(DynamicImage::ImageRgba8(result))
}

/// Scale image to fit within max dimensions while preserving aspect ratio
fn scale_to_fit(img: &DynamicImage, max_width: u32, max_height: u32) -> DynamicImage {
    let (width, height) = (img.width(), img.height());

    if width <= max_width && height <= max_height {
        return img.clone();
    }

    let scale_x = max_width as f32 / width as f32;
    let scale_y = max_height as f32 / height as f32;
    let scale = scale_x.min(scale_y);

    let new_width = (width as f32 * scale) as u32;
    let new_height = (height as f32 * scale) as u32;

    img.resize(new_width, new_height, image::imageops::FilterType::Lanczos3)
}
