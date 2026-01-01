use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LayerType {
    Raster,
    Adjustment,
    Group,
    Text,
    Shape,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BlendMode {
    Normal,
    Multiply,
    Screen,
    Overlay,
    Darken,
    Lighten,
    ColorDodge,
    ColorBurn,
    HardLight,
    SoftLight,
    Difference,
    Exclusion,
    Hue,
    Saturation,
    Color,
    Luminosity,
}

impl Default for BlendMode {
    fn default() -> Self {
        BlendMode::Normal
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Layer {
    pub id: String,
    pub name: String,
    pub layer_type: LayerType,
    pub visible: bool,
    pub locked: bool,
    pub opacity: u8, // 0-100
    pub blend_mode: BlendMode,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Layer {
    pub fn new_raster(name: &str, width: u32, height: u32) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            layer_type: LayerType::Raster,
            visible: true,
            locked: false,
            opacity: 100,
            blend_mode: BlendMode::Normal,
            x: 0,
            y: 0,
            width,
            height,
        }
    }

    pub fn bounds(&self) -> (i32, i32, u32, u32) {
        (self.x, self.y, self.width, self.height)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerUpdate {
    pub name: Option<String>,
    pub visible: Option<bool>,
    pub locked: Option<bool>,
    pub opacity: Option<u8>,
    pub blend_mode: Option<BlendMode>,
    pub x: Option<i32>,
    pub y: Option<i32>,
}

impl Layer {
    pub fn apply_update(&mut self, update: LayerUpdate) {
        if let Some(name) = update.name {
            self.name = name;
        }
        if let Some(visible) = update.visible {
            self.visible = visible;
        }
        if let Some(locked) = update.locked {
            self.locked = locked;
        }
        if let Some(opacity) = update.opacity {
            self.opacity = opacity.min(100);
        }
        if let Some(blend_mode) = update.blend_mode {
            self.blend_mode = blend_mode;
        }
        if let Some(x) = update.x {
            self.x = x;
        }
        if let Some(y) = update.y {
            self.y = y;
        }
    }
}
