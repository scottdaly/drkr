# Darker Implementation Plan

> A comprehensive checklist of all features to be implemented, organized by phase.
>
> **Last Updated:** January 2026

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| :white_check_mark: | Complete |
| :construction: | In Progress |
| :white_large_square: | Not Started |
| :no_entry: | Blocked / Deferred |

---

## Phase 1: Foundation & MVP

### 1.1 Project Scaffolding & Shell

| Status | Feature | Notes |
|--------|---------|-------|
| :white_check_mark: | Tauri + SvelteKit + Vite project setup | |
| :white_check_mark: | Tailwind CSS configuration | Custom editor color palette |
| :white_check_mark: | Basic application shell layout | MenuBar, Toolbar, Panels, Canvas |
| :white_check_mark: | Dark theme UI | editor-* color tokens |
| :white_check_mark: | Lucide icons integration | |
| :white_check_mark: | Error handling infrastructure | AppError enum, error toasts |

### 1.2 Canvas & Rendering

| Status | Feature | Notes |
|--------|---------|-------|
| :white_check_mark: | Canvas 2D rendering | Using CanvasRenderingContext2D |
| :white_check_mark: | Pan (scroll/drag) | Middle-mouse + scroll wheel |
| :white_check_mark: | Zoom (scroll + Ctrl) | Mouse-centered zoom |
| :white_check_mark: | Fit to screen | Ctrl+0 |
| :white_check_mark: | Checkerboard transparency background | |
| :white_check_mark: | Document border indicator | |
| :white_large_square: | WebGL 2 rendering engine | Migrate from Canvas 2D for performance |
| :white_large_square: | Tile-based rendering | For large images (>4K) |
| :white_large_square: | WebGPU support | When browser support stabilizes |

### 1.3 Document Management

| Status | Feature | Notes |
|--------|---------|-------|
| :white_check_mark: | New document dialog | Width, height, resolution, name |
| :white_check_mark: | Create document (Ctrl+N) | |
| :white_check_mark: | Open image files (Ctrl+O) | PNG, JPEG, WebP, GIF, BMP, TIFF |
| :white_check_mark: | Open DRKR files | Native format |
| :white_check_mark: | Save DRKR files | Native format |
| :white_check_mark: | Export as image | PNG, JPEG, WebP |
| :white_check_mark: | Save (Ctrl+S) | Quick save to existing path |
| :white_check_mark: | Save As (Ctrl+Shift+S) | Always prompts for location |
| :white_check_mark: | Close document (Ctrl+W) | |
| :white_check_mark: | Multi-document tabs | Tab bar with switching |
| :white_check_mark: | Tab close button | Per-tab close |
| :white_check_mark: | Tab reordering | Drag-and-drop |
| :white_check_mark: | Dirty document indicator | Dot on tab for unsaved changes |
| :white_check_mark: | Unsaved changes prompt | Dialog on close |
| :white_large_square: | Recent files list | |
| :white_large_square: | Auto-save & recovery | Periodic saves, crash recovery |
| :white_large_square: | Window close protection | Prompt for all unsaved docs |

### 1.4 Layer System

| Status | Feature | Notes |
|--------|---------|-------|
| :white_check_mark: | Layer panel UI | |
| :white_check_mark: | Background layer (auto-created) | White by default |
| :white_check_mark: | Add new layer | Transparent |
| :white_check_mark: | Delete layer | With confirmation for last layer |
| :white_check_mark: | Layer visibility toggle | Eye icon |
| :white_check_mark: | Layer lock toggle | Lock icon |
| :white_check_mark: | Layer opacity slider | 0-100% |
| :white_check_mark: | Layer selection | Click to activate |
| :white_check_mark: | Layer pixel buffer management | Frontend-side pixel editing |
| :white_large_square: | Layer renaming | Double-click to rename |
| :white_large_square: | Layer drag-and-drop reordering | Visual reordering |
| :white_large_square: | Layer thumbnails | Mini preview in panel |
| :white_large_square: | Layer blend modes | Normal, Multiply, Screen, Overlay, etc. |
| :white_large_square: | Layer masks | Alpha masks for non-destructive hiding |
| :white_large_square: | Clipping masks | Clip to layer below |
| :white_large_square: | Layer groups/folders | Organize layers hierarchically |
| :white_large_square: | Adjustment layers | Non-destructive adjustments |
| :white_large_square: | Layer effects | Drop shadow, glow, stroke |
| :white_large_square: | Layer transform | Scale, rotate, skew |

### 1.5 Tools - Drawing

| Status | Feature | Notes |
|--------|---------|-------|
| :white_check_mark: | Tool selection UI | Toolbar with icons |
| :white_check_mark: | Brush tool (B) | Basic circular brush |
| :white_check_mark: | Eraser tool (E) | Erase to transparency |
| :white_check_mark: | Brush size adjustment | [ ] keys |
| :white_check_mark: | Brush hardness adjustment | Shift + [ ] |
| :white_check_mark: | Brush opacity | Via tool options |
| :white_check_mark: | Brush flow | Via tool options |
| :white_check_mark: | Real-time stroke preview | Preview before commit |
| :white_check_mark: | Local brush rendering | Immediate visual feedback |
| :white_check_mark: | Brush cursor preview | Circle showing brush size |
| :white_large_square: | Pressure sensitivity | Tablet/stylus support |
| :white_large_square: | Brush dynamics | Size/opacity jitter |
| :white_large_square: | Custom brush tips | Load brush shapes |
| :white_large_square: | Brush presets | Save/load brush configurations |
| :white_large_square: | Smoothing/stabilization | Stroke smoothing |

### 1.6 Tools - Selection

| Status | Feature | Notes |
|--------|---------|-------|
| :white_check_mark: | Selection state management | Selection store |
| :white_check_mark: | Tool options UI | Panel for active tool |
| :white_large_square: | Rectangular marquee (M) | Basic rectangle selection |
| :white_large_square: | Elliptical marquee | Ellipse selection |
| :white_large_square: | Lasso tool | Freehand selection |
| :white_large_square: | Polygonal lasso | Point-to-point selection |
| :white_large_square: | Magic wand | Color-based selection |
| :white_large_square: | Quick select | AI-assisted selection |
| :white_large_square: | Selection marching ants | Animated selection border |
| :white_large_square: | Select All (Ctrl+A) | |
| :white_large_square: | Deselect (Ctrl+D) | |
| :white_large_square: | Inverse selection | |
| :white_large_square: | Selection feathering | Soft edges |
| :white_large_square: | Selection refinement | Edge detection |
| :white_large_square: | Selection to mask | Convert selection to layer mask |

### 1.7 Tools - Other

| Status | Feature | Notes |
|--------|---------|-------|
| :white_check_mark: | Move tool (V) | UI present, functionality pending |
| :white_check_mark: | Hand tool (H) | Pan canvas |
| :white_check_mark: | Zoom tool (Z) | Zoom in/out |
| :white_check_mark: | Eyedropper (I) | UI present |
| :white_large_square: | Move layer contents | Actually move pixels |
| :white_large_square: | Eyedropper functionality | Pick color from canvas |
| :white_large_square: | Crop tool (C) | Crop document |
| :white_large_square: | Transform tool | Free transform with handles |
| :white_large_square: | Text tool (T) | Add text layers |
| :white_large_square: | Shape tool (U) | Rectangle, ellipse, line |
| :white_large_square: | Gradient tool | Linear, radial gradients |
| :white_large_square: | Fill tool | Flood fill |
| :white_large_square: | Clone stamp | Clone from source |
| :white_large_square: | Healing brush | Content-aware healing |

### 1.8 Color System

| Status | Feature | Notes |
|--------|---------|-------|
| :white_check_mark: | Foreground/background colors | Dual color state |
| :white_check_mark: | Color picker panel | HSV picker UI |
| :white_check_mark: | Swap colors (X) | Quick swap shortcut |
| :white_check_mark: | Reset colors (D) | Black/white default |
| :white_large_square: | Color picker improvements | Better HSV/RGB controls |
| :white_large_square: | Color swatches | Preset color palette |
| :white_large_square: | Custom swatches | User-saved colors |
| :white_large_square: | Color history | Recently used colors |
| :white_large_square: | Hex input | Type color codes |
| :white_large_square: | Color profiles | ICC profile support |
| :white_large_square: | Soft proofing | Preview for print |

### 1.9 History & Undo

| Status | Feature | Notes |
|--------|---------|-------|
| :white_check_mark: | History manager (Rust) | Backend undo system |
| :white_check_mark: | History store (Frontend) | State management |
| :white_check_mark: | Undo (Ctrl+Z) | Keyboard shortcut |
| :white_check_mark: | Redo (Ctrl+Shift+Z / Ctrl+Y) | Keyboard shortcut |
| :white_check_mark: | Brush stroke history entries | Track brush operations |
| :white_check_mark: | History panel UI | Basic list view |
| :white_large_square: | History thumbnails | Visual state preview |
| :white_large_square: | Jump to history state | Click to restore |
| :white_large_square: | Non-linear history | Branch history |
| :white_large_square: | History snapshots in DRKR | Save undo states |

### 1.10 Filters & Adjustments

| Status | Feature | Notes |
|--------|---------|-------|
| :white_check_mark: | Filter command infrastructure | Tauri commands |
| :white_check_mark: | Brightness adjustment | |
| :white_check_mark: | Contrast adjustment | |
| :white_check_mark: | Saturation adjustment | |
| :white_check_mark: | Gaussian blur | |
| :white_check_mark: | Invert | |
| :white_check_mark: | Grayscale | |
| :white_large_square: | Filter preview | Real-time preview |
| :white_large_square: | Levels | Histogram-based adjustment |
| :white_large_square: | Curves | Advanced tonal control |
| :white_large_square: | Hue/Saturation | HSL adjustment |
| :white_large_square: | Color balance | RGB balance |
| :white_large_square: | Unsharp mask | Sharpening |
| :white_large_square: | Noise reduction | Denoise |
| :white_large_square: | Lens correction | Distortion fix |
| :white_large_square: | Vignette | Edge darkening |
| :white_large_square: | Adjustment layers | Non-destructive filters |

### 1.11 Keyboard Shortcuts

| Status | Feature | Notes |
|--------|---------|-------|
| :white_check_mark: | File shortcuts | Ctrl+N, Ctrl+O, Ctrl+S, Ctrl+Shift+S, Ctrl+W |
| :white_check_mark: | Edit shortcuts | Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y |
| :white_check_mark: | View shortcuts | Ctrl+0, Ctrl++, Ctrl+- |
| :white_check_mark: | Tool shortcuts | V, H, M, B, E, I, C, T, U, Z |
| :white_check_mark: | Brush size | [ and ] |
| :white_check_mark: | Brush hardness | Shift+[ and Shift+] |
| :white_check_mark: | Color shortcuts | X (swap), D (reset) |
| :white_large_square: | Selection shortcuts | Ctrl+A, Ctrl+D, Ctrl+Shift+I |
| :white_large_square: | Layer shortcuts | Ctrl+Shift+N (new layer) |
| :white_large_square: | Customizable shortcuts | User-defined mappings |

---

## Phase 2: DRKR File Format

### 2.1 Core Format

| Status | Feature | Notes |
|--------|---------|-------|
| :white_check_mark: | ZIP-based container | Standard ZIP archive |
| :white_check_mark: | mimetype file | First file, uncompressed |
| :white_check_mark: | manifest.json | Version, generator info |
| :white_check_mark: | document.json | Document metadata |
| :white_check_mark: | Layer meta.json | Per-layer properties |
| :white_check_mark: | Layer pixels as WebP | Compressed pixel data |
| :white_check_mark: | Thumbnail generation | 256x256 preview |
| :white_check_mark: | Merged preview | Full-resolution flattened |
| :white_check_mark: | Read DRKR files | DrkrReader |
| :white_check_mark: | Write DRKR files | DrkrWriter |

### 2.2 Advanced Format Features

| Status | Feature | Notes |
|--------|---------|-------|
| :white_large_square: | Tiled storage | For large images (>4096px) |
| :white_large_square: | AI history serialization | Store prompt history |
| :white_large_square: | Adjustment layer serialization | Non-destructive params |
| :white_large_square: | Layer masks in DRKR | Mask data storage |
| :white_large_square: | Layer groups in DRKR | Hierarchical layers |
| :white_large_square: | Streaming/partial load | Load thumbnails first |
| :white_large_square: | File validation | Schema validation |
| :white_large_square: | Extension support | Third-party data |

---

## Phase 3: AI Integration

### 3.1 AI Infrastructure

| Status | Feature | Notes |
|--------|---------|-------|
| :white_check_mark: | AI panel UI | Basic panel layout |
| :white_check_mark: | AI state store | Loading, progress, history |
| :white_check_mark: | Provider selection UI | Google, OpenAI, Stability |
| :white_large_square: | API key management | Secure storage |
| :white_large_square: | AI service abstraction | Provider-agnostic interface |
| :white_large_square: | Cost tracking | Usage monitoring |
| :white_large_square: | Request caching | Avoid duplicate API calls |
| :white_large_square: | Error handling | Graceful API failures |

### 3.2 AI Features

| Status | Feature | Notes |
|--------|---------|-------|
| :white_large_square: | Edit with prompt | Natural language editing |
| :white_large_square: | Background removal | AI-powered segmentation |
| :white_large_square: | Image upscaling | Super-resolution |
| :white_large_square: | Face restoration | Enhance faces |
| :white_large_square: | Object removal | Remove unwanted elements |
| :white_large_square: | Style transfer | Apply artistic styles |
| :white_large_square: | Generate from prompt | Text-to-image |
| :white_large_square: | Inpainting | Fill selected areas |
| :white_large_square: | Outpainting | Extend image borders |
| :white_large_square: | Variations | Generate alternatives |
| :white_large_square: | Preview mode | Low-res preview before commit |

### 3.3 AI Providers

| Status | Feature | Notes |
|--------|---------|-------|
| :white_large_square: | Google (Gemini/Imagen) | Primary provider |
| :white_large_square: | OpenAI (DALL-E) | Alternative provider |
| :white_large_square: | Stability AI | Stable Diffusion |
| :white_large_square: | Replicate | Model marketplace |
| :white_large_square: | Provider fallback | Auto-switch on failure |

---

## Phase 4: File Compatibility

### 4.1 Import Formats

| Status | Feature | Notes |
|--------|---------|-------|
| :white_check_mark: | PNG import | Via image crate |
| :white_check_mark: | JPEG import | Via image crate |
| :white_check_mark: | WebP import | Via image crate |
| :white_check_mark: | GIF import | Via image crate |
| :white_check_mark: | BMP import | Via image crate |
| :white_check_mark: | TIFF import | Via image crate |
| :white_large_square: | PSD import (layered) | Preserve layers |
| :white_large_square: | RAW file support | Camera raw files |
| :white_large_square: | SVG import | Vector to raster |
| :white_large_square: | PDF import | Page to image |

### 4.2 Export Formats

| Status | Feature | Notes |
|--------|---------|-------|
| :white_check_mark: | PNG export | |
| :white_check_mark: | JPEG export | |
| :white_check_mark: | WebP export | |
| :white_large_square: | Export dialog | Quality, format options |
| :white_large_square: | PSD export (layered) | Preserve layers |
| :white_large_square: | TIFF export | High quality |
| :white_large_square: | PDF export | Print-ready |
| :white_large_square: | Batch export | Multiple files |
| :white_large_square: | Export presets | Saved configurations |

---

## Phase 5: Browser Deployment

### 5.1 WASM Build

| Status | Feature | Notes |
|--------|---------|-------|
| :white_large_square: | WASM build configuration | wasm-pack setup |
| :white_large_square: | Processing functions in WASM | Filters, transforms |
| :white_large_square: | WASM lazy loading | Load after shell |
| :white_large_square: | WASM performance optimization | |

### 5.2 Browser Platform Layer

| Status | Feature | Notes |
|--------|---------|-------|
| :white_large_square: | Platform detection | Tauri vs browser |
| :white_large_square: | File System Access API | Modern file handling |
| :white_large_square: | Fallback file handling | Input/download for Safari |
| :white_large_square: | IndexedDB storage | Document persistence |
| :white_large_square: | OPFS storage | Large file support |
| :white_large_square: | AI proxy backend | Secure API keys |

### 5.3 PWA Features

| Status | Feature | Notes |
|--------|---------|-------|
| :white_large_square: | Service Worker | Offline caching |
| :white_large_square: | PWA manifest | Installable app |
| :white_large_square: | Offline support | Work without network |
| :white_large_square: | App icons | All sizes |

---

## Phase 6: Advanced Features

### 6.1 Text & Vector

| Status | Feature | Notes |
|--------|---------|-------|
| :white_large_square: | Text layers | Editable text |
| :white_large_square: | Font selection | System fonts |
| :white_large_square: | Text styling | Bold, italic, etc. |
| :white_large_square: | Vector shapes | Rectangle, ellipse, path |
| :white_large_square: | Shape styling | Fill, stroke |
| :white_large_square: | Path editing | Bezier curves |

### 6.2 Advanced Editing

| Status | Feature | Notes |
|--------|---------|-------|
| :white_large_square: | Content-aware fill | AI-powered fill |
| :white_large_square: | Perspective transform | Warp |
| :white_large_square: | Liquify tool | Mesh deformation |
| :white_large_square: | HDR merge | Combine exposures |
| :white_large_square: | Focus stacking | Combine focal planes |
| :white_large_square: | Panorama stitching | Merge images |

### 6.3 Performance & Scale

| Status | Feature | Notes |
|--------|---------|-------|
| :white_large_square: | GPU acceleration | WebGL compute |
| :white_large_square: | Multi-threaded processing | Web Workers |
| :white_large_square: | Gigapixel support | Tiled rendering |
| :white_large_square: | Memory management | Efficient buffer handling |
| :white_large_square: | Background processing | Non-blocking operations |

### 6.4 Extensibility

| Status | Feature | Notes |
|--------|---------|-------|
| :white_large_square: | Plugin system | WASM-based plugins |
| :white_large_square: | Custom filters | User-defined effects |
| :white_large_square: | Script automation | Batch operations |
| :white_large_square: | Action recording | Record/playback macros |

---

## Summary Statistics

| Phase | Complete | In Progress | Not Started | Total |
|-------|----------|-------------|-------------|-------|
| Phase 1: Foundation & MVP | 65 | 0 | 55 | 120 |
| Phase 2: DRKR Format | 11 | 0 | 8 | 19 |
| Phase 3: AI Integration | 4 | 0 | 19 | 23 |
| Phase 4: File Compatibility | 7 | 0 | 10 | 17 |
| Phase 5: Browser Deployment | 0 | 0 | 13 | 13 |
| Phase 6: Advanced Features | 0 | 0 | 20 | 20 |
| **TOTAL** | **87** | **0** | **125** | **212** |

**Overall Progress: ~41% Complete**

---

## Priority Queue (Next Up)

Based on user impact and technical dependencies, these are the recommended next features:

1. **Layer drag-and-drop reordering** - High user value, low complexity
2. **Selection tools** - Essential for professional editing
3. **Move tool functionality** - Complete the basic tool set
4. **Eyedropper functionality** - Pick colors from canvas
5. **Layer blend modes** - Important for compositing
6. **Filter preview** - Better UX for adjustments
7. **WebGL rendering migration** - Performance improvement
8. **AI integration (background removal)** - Key differentiator

---

## Notes

- This plan is based on the [TECH_ARCHITECTURE.md](./TECH_ARCHITECTURE.md) document
- The [DRKR_FILE_FORMAT_SPEC.md](./DRKR_FILE_FORMAT_SPEC.md) defines the native file format
- Browser deployment (Phase 5) is deferred until desktop version is mature
- AI features depend on external API integrations
