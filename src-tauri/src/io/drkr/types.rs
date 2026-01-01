use serde::{Deserialize, Serialize};

/// MIME type for DRKR files
pub const DRKR_MIMETYPE: &str = "application/x-drkr";

/// Current DRKR format version
pub const DRKR_VERSION: &str = "1.0";

// ============================================================================
// Manifest types (manifest.json)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrkrManifest {
    pub drkr_version: String,
    pub generator: DrkrGenerator,
    pub created_at: String,
    pub modified_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub files: Option<std::collections::HashMap<String, DrkrFileEntry>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extensions_used: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrkrGenerator {
    pub name: String,
    pub version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrkrFileEntry {
    pub offset: u64,
    pub size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checksum: Option<String>,
}

// ============================================================================
// Document types (document.json)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrkrDocument {
    pub id: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolution: Option<DrkrResolution>,
    pub color: DrkrColorConfig,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background: Option<DrkrBackground>,
    pub layers: Vec<DrkrLayerRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub guides: Option<Vec<DrkrGuide>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<DrkrMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrkrResolution {
    pub value: u32,
    pub unit: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrkrColorConfig {
    pub space: String,
    pub depth: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum DrkrBackground {
    Transparent,
    Color { color: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrkrLayerRef {
    pub id: String,
    #[serde(rename = "type")]
    pub layer_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub adjustment_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<DrkrLayerRef>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrkrGuide {
    pub orientation: String,
    pub position: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrkrMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom: Option<serde_json::Value>,
}

// ============================================================================
// Layer types (layers/{id}/meta.json)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrkrLayerMeta {
    pub id: String,
    #[serde(rename = "type")]
    pub layer_type: String,
    pub name: String,
    #[serde(default = "default_true")]
    pub visible: bool,
    #[serde(default)]
    pub locked: bool,
    #[serde(default = "default_opacity")]
    pub opacity: u8,
    #[serde(default = "default_blend_mode")]
    pub blend_mode: String,
    pub position: DrkrPosition,
    pub size: DrkrSize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mask_id: Option<String>,
    #[serde(default)]
    pub clipping_mask: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub storage: Option<DrkrStorage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<String>,
}

fn default_true() -> bool {
    true
}

fn default_opacity() -> u8 {
    100
}

fn default_blend_mode() -> String {
    "normal".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrkrPosition {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrkrSize {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrkrStorage {
    pub format: String,
    pub mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tile_size: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tiles: Option<DrkrTileInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrkrTileInfo {
    pub columns: u32,
    pub rows: u32,
    #[serde(default)]
    pub sparse: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub empty_tiles: Option<Vec<String>>,
}

// ============================================================================
// Conversion helpers
// ============================================================================

use crate::engine::layer::{BlendMode, Layer, LayerType};
use crate::engine::Document;

impl DrkrLayerMeta {
    /// Convert from internal Layer type
    pub fn from_layer(layer: &Layer) -> Self {
        Self {
            id: layer.id.clone(),
            layer_type: match layer.layer_type {
                LayerType::Raster => "raster".to_string(),
                LayerType::Adjustment => "adjustment".to_string(),
                LayerType::Group => "group".to_string(),
                LayerType::Text => "text".to_string(),
                LayerType::Shape => "shape".to_string(),
            },
            name: layer.name.clone(),
            visible: layer.visible,
            locked: layer.locked,
            opacity: layer.opacity,
            blend_mode: blend_mode_to_string(&layer.blend_mode),
            position: DrkrPosition {
                x: layer.x,
                y: layer.y,
            },
            size: DrkrSize {
                width: layer.width,
                height: layer.height,
            },
            mask_id: None,
            clipping_mask: false,
            storage: Some(DrkrStorage {
                format: "webp".to_string(),
                mode: "single".to_string(),
                tile_size: None,
                tiles: None,
            }),
            created_at: None,
            modified_at: None,
        }
    }

    /// Convert to internal Layer type
    pub fn to_layer(&self) -> Layer {
        Layer {
            id: self.id.clone(),
            name: self.name.clone(),
            layer_type: match self.layer_type.as_str() {
                "raster" => LayerType::Raster,
                "adjustment" => LayerType::Adjustment,
                "group" => LayerType::Group,
                "text" => LayerType::Text,
                "shape" => LayerType::Shape,
                "ai_generated" => LayerType::Raster, // Treat as raster
                _ => LayerType::Raster,
            },
            visible: self.visible,
            locked: self.locked,
            opacity: self.opacity,
            blend_mode: string_to_blend_mode(&self.blend_mode),
            x: self.position.x,
            y: self.position.y,
            width: self.size.width,
            height: self.size.height,
        }
    }
}

impl DrkrDocument {
    /// Create from internal Document type
    pub fn from_document(doc: &Document) -> Self {
        Self {
            id: doc.id.clone(),
            name: doc.name.clone(),
            width: doc.width,
            height: doc.height,
            resolution: Some(DrkrResolution {
                value: doc.resolution,
                unit: "ppi".to_string(),
            }),
            color: DrkrColorConfig {
                space: "srgb".to_string(),
                depth: 8,
                profile: None,
            },
            background: Some(DrkrBackground::Transparent),
            layers: doc
                .layers
                .iter()
                .map(|l| DrkrLayerRef {
                    id: l.id.clone(),
                    layer_type: match l.layer_type {
                        LayerType::Raster => "raster".to_string(),
                        LayerType::Adjustment => "adjustment".to_string(),
                        LayerType::Group => "group".to_string(),
                        LayerType::Text => "text".to_string(),
                        LayerType::Shape => "shape".to_string(),
                    },
                    adjustment_id: None,
                    children: None,
                })
                .collect(),
            guides: None,
            metadata: None,
        }
    }
}

fn blend_mode_to_string(mode: &BlendMode) -> String {
    match mode {
        BlendMode::Normal => "normal",
        BlendMode::Multiply => "multiply",
        BlendMode::Screen => "screen",
        BlendMode::Overlay => "overlay",
        BlendMode::Darken => "darken",
        BlendMode::Lighten => "lighten",
        BlendMode::ColorDodge => "color-dodge",
        BlendMode::ColorBurn => "color-burn",
        BlendMode::HardLight => "hard-light",
        BlendMode::SoftLight => "soft-light",
        BlendMode::Difference => "difference",
        BlendMode::Exclusion => "exclusion",
        BlendMode::Hue => "hue",
        BlendMode::Saturation => "saturation",
        BlendMode::Color => "color",
        BlendMode::Luminosity => "luminosity",
    }
    .to_string()
}

fn string_to_blend_mode(s: &str) -> BlendMode {
    match s {
        "normal" => BlendMode::Normal,
        "multiply" => BlendMode::Multiply,
        "screen" => BlendMode::Screen,
        "overlay" => BlendMode::Overlay,
        "darken" => BlendMode::Darken,
        "lighten" => BlendMode::Lighten,
        "color-dodge" => BlendMode::ColorDodge,
        "color-burn" => BlendMode::ColorBurn,
        "hard-light" => BlendMode::HardLight,
        "soft-light" => BlendMode::SoftLight,
        "difference" => BlendMode::Difference,
        "exclusion" => BlendMode::Exclusion,
        "hue" => BlendMode::Hue,
        "saturation" => BlendMode::Saturation,
        "color" => BlendMode::Color,
        "luminosity" => BlendMode::Luminosity,
        _ => BlendMode::Normal,
    }
}
