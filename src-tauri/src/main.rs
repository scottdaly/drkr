// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod engine;
mod error;
mod io;

use commands::{brush, crop, document, filters, layer};
use engine::DocumentManager;
use std::sync::Mutex;

fn main() {
    env_logger::init();

    tauri::Builder::default()
        .manage(Mutex::new(DocumentManager::new()))
        .invoke_handler(tauri::generate_handler![
            // Document commands
            document::create_document,
            document::open_document,
            document::save_document,
            document::close_document,
            document::get_document,
            document::save_document_drkr,
            document::open_document_drkr,
            document::list_documents,
            document::set_document_path,
            document::rename_document,
            // Layer commands
            layer::add_layer,
            layer::remove_layer,
            layer::update_layer,
            layer::reorder_layers,
            layer::get_layer_pixels,
            layer::get_layer_pixels_base64,
            layer::set_layer_pixels_base64,
            // Brush commands
            brush::apply_brush_stroke,
            // Filter commands
            filters::apply_filter,
            // Crop commands
            crop::crop_document,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
