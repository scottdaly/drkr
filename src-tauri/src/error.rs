use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Document not found: {0}")]
    DocumentNotFound(String),

    #[error("Layer not found: {0}")]
    LayerNotFound(String),

    #[error("Invalid operation: {0}")]
    InvalidOperation(String),

    #[allow(dead_code)]
    #[error("File error: {0}")]
    FileError(String),

    #[error("Image processing error: {0}")]
    ImageError(String),

    #[allow(dead_code)]
    #[error("AI service error: {0}")]
    AIError(String),

    #[error("IO error: {0}")]
    IoError(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),
}

// Implement Serialize for Tauri
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
