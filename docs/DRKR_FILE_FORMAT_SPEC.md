# DRKR File Format Specification

> **Version:** 1.0.0-draft  
> **Status:** Draft  
> **Last Updated:** January 2026  
> **License:** MIT

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Design Principles](#2-design-principles)
3. [File Structure](#3-file-structure)
4. [Core Components](#4-core-components)
5. [Layer Types](#5-layer-types)
6. [AI Operations](#6-ai-operations)
7. [Adjustment System](#7-adjustment-system)
8. [Tiled Storage](#8-tiled-storage)
9. [History & Snapshots](#9-history--snapshots)
10. [Streaming Access](#10-streaming-access)
11. [Extensibility](#11-extensibility)
12. [Versioning & Compatibility](#12-versioning--compatibility)
13. [Reference Implementation](#13-reference-implementation)
14. [MIME Type & File Association](#14-mime-type--file-association)
15. [Security Considerations](#15-security-considerations)

---

## 1. Introduction

### 1.1 Purpose

DRKR (pronounced "darker") is an open file format designed for modern image editing applications with first-class support for:

- **Generative AI workflows** — Prompts, provider metadata, and reproducible operations
- **Non-destructive editing** — Adjustment layers stored as parameters, not baked pixels
- **Large image support** — Tile-based storage for gigapixel images
- **Browser compatibility** — Streamable structure for web-based editors
- **Efficient storage** — Modern compression formats (WebP, AVIF)

### 1.2 Goals

1. **Open** — Fully documented, no proprietary components, MIT licensed
2. **Efficient** — Smaller files than PSD/ORA for equivalent content
3. **Streamable** — Partial file access without loading entire document
4. **AI-Native** — Generation history is a first-class citizen, not an afterthought
5. **Future-Proof** — Extensible schema, backwards compatible versioning
6. **Recoverable** — Human-inspectable structure, layers extractable manually

### 1.3 Non-Goals

- Backwards compatibility with PSD, ORA, or other formats (use export)
- Video or animation support (may be added in future version)
- 3D layer support

---

## 2. Design Principles

### 2.1 ZIP-Based Container

A `.drkr` file is a standard ZIP archive (uncompressed or DEFLATE). This provides:

- Extractability using standard tools (unzip, 7-Zip, etc.)
- Familiar structure for developers
- Built-in file integrity via ZIP CRC checks
- Streaming support via ZIP64 extensions

### 2.2 JSON for Metadata, Binary for Pixels

- All metadata is stored as JSON (human-readable, easy to parse)
- Pixel data uses efficient binary formats (WebP, AVIF, raw)
- Clear separation of structure and content

### 2.3 Lazy-Load Friendly

- Table of contents at predictable location
- Layers are independent files (load only what's needed)
- Thumbnail and preview available without full extraction

### 2.4 Forwards Compatible

- Readers MUST ignore unknown fields
- Writers MUST preserve unknown fields when round-tripping
- Breaking changes require major version increment

---

## 3. File Structure

### 3.1 Overview

```
document.drkr (ZIP archive)
│
├── mimetype                          # MUST be first file, uncompressed
├── manifest.json                     # Table of contents, version info
├── document.json                     # Document metadata
│
├── layers/                           # Layer data
│   ├── {layer-id}/
│   │   ├── meta.json                 # Layer properties
│   │   ├── pixels.webp               # Pixel data (small layers)
│   │   └── tiles/                    # Tiled pixel data (large layers)
│   │       ├── 0-0.webp
│   │       ├── 0-1.webp
│   │       └── ...
│   └── ...
│
├── masks/                            # Layer masks
│   └── {mask-id}.webp
│
├── adjustments/                      # Non-destructive adjustment data
│   └── {adjustment-id}.json
│
├── ai/                               # AI operation history
│   ├── history.json                  # Operation log
│   └── assets/                       # Referenced AI assets (optional)
│       └── {asset-id}.webp
│
├── history/                          # Undo snapshots (optional)
│   ├── index.json
│   └── snapshots/
│       └── {snapshot-id}.json
│
├── preview/                          # Quick previews
│   ├── thumbnail.webp                # 256x256 max
│   └── merged.webp                   # Full resolution flattened
│
└── extensions/                       # Third-party extensions
    └── {vendor}/
        └── ...
```

### 3.2 Required Files

The following files MUST be present in a valid `.drkr` file:

| File | Description |
|------|-------------|
| `mimetype` | MIME type identifier |
| `manifest.json` | Version and table of contents |
| `document.json` | Document dimensions and properties |
| `preview/thumbnail.webp` | Thumbnail image |

### 3.3 File Ordering

For optimal streaming, files SHOULD be ordered:

1. `mimetype` (MUST be first, uncompressed, for MIME detection)
2. `manifest.json`
3. `document.json`
4. `preview/thumbnail.webp`
5. `preview/merged.webp`
6. Layer metadata files (`layers/*/meta.json`)
7. Layer pixel data (`layers/*/pixels.webp` or `layers/*/tiles/*`)
8. Everything else

This ordering allows readers to display a preview before fully loading the document.

---

## 4. Core Components

### 4.1 mimetype

**Path:** `mimetype`  
**Compression:** MUST be stored uncompressed (STORE method)  
**Encoding:** ASCII

**Content:**
```
application/x-drkr
```

This file MUST be the first entry in the ZIP archive to enable MIME type detection via magic bytes.

### 4.2 manifest.json

**Path:** `manifest.json`  
**Encoding:** UTF-8 JSON

```json
{
  "drkr_version": "1.0",
  "generator": {
    "name": "Darker",
    "version": "1.0.0",
    "url": "https://example.com/darkroom"
  },
  "created_at": "2026-01-15T10:00:00Z",
  "modified_at": "2026-01-15T14:32:00Z",
  "files": {
    "document.json": {
      "offset": 1024,
      "size": 2048,
      "checksum": "sha256:a1b2c3..."
    },
    "layers/layer-001/pixels.webp": {
      "offset": 3072,
      "size": 1048576,
      "checksum": "sha256:d4e5f6..."
    }
  },
  "extensions_used": [
    "com.example.custom-filter"
  ]
}
```

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `drkr_version` | string | Yes | Spec version (semver major.minor) |
| `generator` | object | Yes | Application that created the file |
| `generator.name` | string | Yes | Application name |
| `generator.version` | string | Yes | Application version |
| `generator.url` | string | No | Application website |
| `created_at` | string | Yes | ISO 8601 timestamp |
| `modified_at` | string | Yes | ISO 8601 timestamp |
| `files` | object | No | File offsets for streaming (optional but recommended) |
| `extensions_used` | array | No | List of extension identifiers used |

### 4.3 document.json

**Path:** `document.json`  
**Encoding:** UTF-8 JSON

```json
{
  "id": "doc-550e8400-e29b-41d4-a716-446655440000",
  "name": "Sunset Beach Edit",
  "width": 4096,
  "height": 2731,
  "resolution": {
    "value": 300,
    "unit": "ppi"
  },
  "color": {
    "space": "srgb",
    "depth": 8,
    "profile": null
  },
  "background": {
    "type": "transparent"
  },
  "layers": [
    {
      "id": "layer-001",
      "type": "raster"
    },
    {
      "id": "layer-002",
      "type": "adjustment",
      "adjustment_id": "adj-001"
    },
    {
      "id": "group-001",
      "type": "group",
      "children": [
        {
          "id": "layer-003",
          "type": "raster"
        },
        {
          "id": "layer-004",
          "type": "ai_generated"
        }
      ]
    }
  ],
  "guides": [
    { "orientation": "horizontal", "position": 1365 },
    { "orientation": "vertical", "position": 2048 }
  ],
  "metadata": {
    "author": "Jane Doe",
    "description": "Beach photo with AI-enhanced sky",
    "tags": ["landscape", "beach", "ai-edited"],
    "custom": {}
  }
}
```

**Document Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique document identifier (UUID recommended) |
| `name` | string | Yes | Document display name |
| `width` | integer | Yes | Canvas width in pixels |
| `height` | integer | Yes | Canvas height in pixels |
| `resolution` | object | No | Print resolution |
| `color` | object | Yes | Color configuration |
| `background` | object | No | Canvas background |
| `layers` | array | Yes | Layer tree (ordered bottom to top) |
| `guides` | array | No | Guide lines |
| `metadata` | object | No | User metadata |

**Color Configuration:**

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `space` | string | `srgb`, `display-p3`, `adobe-rgb`, `prophoto-rgb` | Color space |
| `depth` | integer | `8`, `16`, `32` | Bits per channel |
| `profile` | string | null or path | Embedded ICC profile path |

**Background Types:**

| Type | Description |
|------|-------------|
| `transparent` | Fully transparent (checkerboard in UI) |
| `color` | Solid color: `{ "type": "color", "color": "#ffffff" }` |

---

## 5. Layer Types

### 5.1 Common Layer Properties

All layer types share these properties in their `meta.json`:

```json
{
  "id": "layer-001",
  "type": "raster",
  "name": "Background",
  "visible": true,
  "locked": false,
  "opacity": 100,
  "blend_mode": "normal",
  "position": {
    "x": 0,
    "y": 0
  },
  "size": {
    "width": 4096,
    "height": 2731
  },
  "mask_id": null,
  "clipping_mask": false,
  "created_at": "2026-01-15T10:00:00Z",
  "modified_at": "2026-01-15T14:32:00Z"
}
```

**Common Fields:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | string | Yes | — | Unique layer identifier |
| `type` | string | Yes | — | Layer type (see below) |
| `name` | string | Yes | — | Display name |
| `visible` | boolean | No | `true` | Layer visibility |
| `locked` | boolean | No | `false` | Edit lock |
| `opacity` | integer | No | `100` | Opacity (0-100) |
| `blend_mode` | string | No | `"normal"` | Blend mode |
| `position` | object | Yes | — | Position on canvas |
| `size` | object | Yes | — | Layer dimensions |
| `mask_id` | string | No | `null` | Associated mask ID |
| `clipping_mask` | boolean | No | `false` | Clips to layer below |

**Blend Modes:**

```
normal, dissolve,
darken, multiply, color-burn, linear-burn, darker-color,
lighten, screen, color-dodge, linear-dodge, lighter-color,
overlay, soft-light, hard-light, vivid-light, linear-light, pin-light, hard-mix,
difference, exclusion, subtract, divide,
hue, saturation, color, luminosity
```

### 5.2 Raster Layer

Standard pixel layer.

**Type:** `"raster"`

**Additional Fields:**
```json
{
  "type": "raster",
  "storage": {
    "format": "webp",
    "mode": "single"
  }
}
```

**Pixel Data Location:** `layers/{layer-id}/pixels.webp`

### 5.3 Tiled Raster Layer

For layers exceeding tile threshold (default: 4096x4096).

**Type:** `"raster"` with tiled storage

```json
{
  "type": "raster",
  "storage": {
    "format": "webp",
    "mode": "tiled",
    "tile_size": 2048,
    "tiles": {
      "columns": 2,
      "rows": 2,
      "sparse": false
    }
  }
}
```

**Tile Naming:** `layers/{layer-id}/tiles/{row}-{col}.webp`

Example for a 4096x4096 layer with 2048px tiles:
```
layers/layer-001/tiles/
├── 0-0.webp    # Top-left
├── 0-1.webp    # Top-right
├── 1-0.webp    # Bottom-left
└── 1-1.webp    # Bottom-right
```

### 5.4 AI-Generated Layer

Layer created or modified by generative AI.

**Type:** `"ai_generated"`

```json
{
  "type": "ai_generated",
  "name": "AI Background",
  "ai": {
    "operation_id": "op-001",
    "regeneratable": true,
    "source_operation_ids": []
  },
  "storage": {
    "format": "webp",
    "mode": "single"
  }
}
```

**AI-Specific Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `ai.operation_id` | string | Reference to operation in `ai/history.json` |
| `ai.regeneratable` | boolean | Can be regenerated from prompt |
| `ai.source_operation_ids` | array | Chain of operations that produced this layer |

### 5.5 Adjustment Layer

Non-destructive adjustment.

**Type:** `"adjustment"`

```json
{
  "type": "adjustment",
  "name": "Curves Adjustment",
  "adjustment_id": "adj-001",
  "affects": "below"
}
```

Adjustment parameters stored in `adjustments/{adjustment-id}.json`.

**Affects Values:**

| Value | Description |
|-------|-------------|
| `"below"` | Affects all layers below |
| `"clipped"` | Affects only the layer directly below (clipping mask) |

### 5.6 Group Layer

Container for other layers.

**Type:** `"group"`

```json
{
  "type": "group",
  "name": "Retouching",
  "children": [
    { "id": "layer-005", "type": "raster" },
    { "id": "layer-006", "type": "raster" }
  ],
  "pass_through": true
}
```

**Group-Specific Fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `children` | array | `[]` | Nested layer references |
| `pass_through` | boolean | `true` | Blend mode pass-through |

### 5.7 Text Layer (Future)

Reserved for future implementation.

**Type:** `"text"`

### 5.8 Shape Layer (Future)

Reserved for future implementation.

**Type:** `"shape"`

---

## 6. AI Operations

### 6.1 Overview

AI operations are logged in `ai/history.json`. This provides:

- **Provenance** — Track how AI was used in the document
- **Reproducibility** — Regenerate results with same parameters
- **Cost Tracking** — Monitor API usage
- **Transparency** — Users can see all AI modifications

### 6.2 ai/history.json

```json
{
  "version": 1,
  "total_cost": {
    "usd": 0.15,
    "operations": 5
  },
  "operations": [
    {
      "id": "op-001",
      "type": "generate",
      "timestamp": "2026-01-15T14:32:00Z",
      "status": "completed",
      "target_layer": "layer-004",
      
      "input": {
        "prompt": "A serene Japanese garden at sunset with a koi pond",
        "negative_prompt": "people, text, watermark, low quality",
        "dimensions": {
          "width": 1024,
          "height": 1024
        },
        "seed": 42,
        "guidance_scale": 7.5
      },
      
      "provider": {
        "name": "google",
        "model": "gemini-3-pro-image",
        "model_version": "2026-01",
        "endpoint": "generateContent"
      },
      
      "output": {
        "asset_ref": "ai/assets/op-001-output.webp",
        "dimensions": {
          "width": 1024,
          "height": 1024
        },
        "hash": "sha256:abc123..."
      },
      
      "cost": {
        "usd": 0.04,
        "provider_credits": 1
      },
      
      "reproducible": true,
      "user_rating": null
    },
    {
      "id": "op-002",
      "type": "edit",
      "timestamp": "2026-01-15T14:35:00Z",
      "status": "completed",
      "target_layer": "layer-004",
      "source_layers": ["layer-004"],
      
      "input": {
        "prompt": "Add a small stone lantern near the pond",
        "mask_ref": "masks/mask-op-002.webp",
        "preserve_background": true
      },
      
      "provider": {
        "name": "google",
        "model": "gemini-3-pro-image",
        "model_version": "2026-01"
      },
      
      "output": {
        "asset_ref": null,
        "applied_to_layer": true,
        "hash": "sha256:def456..."
      },
      
      "cost": {
        "usd": 0.03
      },
      
      "reproducible": true,
      "parent_operation": "op-001"
    },
    {
      "id": "op-003",
      "type": "upscale",
      "timestamp": "2026-01-15T14:40:00Z",
      "status": "completed",
      "target_layer": "layer-004",
      
      "input": {
        "factor": 2,
        "model_preference": "quality"
      },
      
      "provider": {
        "name": "replicate",
        "model": "real-esrgan",
        "model_version": "2.0"
      },
      
      "output": {
        "dimensions": {
          "width": 2048,
          "height": 2048
        }
      },
      
      "cost": {
        "usd": 0.02
      },
      
      "reproducible": true,
      "parent_operation": "op-002"
    }
  ]
}
```

### 6.3 Operation Types

| Type | Description |
|------|-------------|
| `generate` | Create image from text prompt |
| `edit` | Modify existing image with prompt |
| `inpaint` | Fill masked region |
| `outpaint` | Extend image boundaries |
| `upscale` | Increase resolution |
| `restore` | Face restoration, denoising |
| `remove_background` | Extract subject |
| `style_transfer` | Apply artistic style |
| `variation` | Generate variations of image |

### 6.4 Operation Status

| Status | Description |
|--------|-------------|
| `completed` | Successfully completed |
| `failed` | Operation failed (error stored) |
| `pending` | Awaiting processing |
| `cancelled` | Cancelled by user |

### 6.5 Reproducibility

An operation is `reproducible: true` if:

1. All input parameters are stored
2. Provider supports deterministic generation (seed)
3. No external dependencies have changed

Users can "replay" reproducible operations to regenerate results.

---

## 7. Adjustment System

### 7.1 Overview

Adjustment layers store parameters, not pixels. This enables:

- Non-destructive editing
- Smaller file sizes
- Re-editable adjustments
- Real-time preview

### 7.2 Adjustment File

**Path:** `adjustments/{adjustment-id}.json`

```json
{
  "id": "adj-001",
  "type": "curves",
  "version": 1,
  "params": {
    "master": {
      "points": [[0, 0], [64, 58], [128, 128], [192, 200], [255, 255]]
    },
    "red": {
      "points": [[0, 0], [255, 255]]
    },
    "green": {
      "points": [[0, 0], [255, 255]]
    },
    "blue": {
      "points": [[0, 0], [255, 255]]
    }
  }
}
```

### 7.3 Adjustment Types

#### Brightness/Contrast

```json
{
  "type": "brightness_contrast",
  "params": {
    "brightness": 15,
    "contrast": 10,
    "use_legacy": false
  }
}
```

| Param | Type | Range | Default |
|-------|------|-------|---------|
| `brightness` | integer | -150 to 150 | 0 |
| `contrast` | integer | -100 to 100 | 0 |
| `use_legacy` | boolean | — | false |

#### Levels

```json
{
  "type": "levels",
  "params": {
    "input_black": 0,
    "input_white": 255,
    "gamma": 1.0,
    "output_black": 0,
    "output_white": 255,
    "channel": "master"
  }
}
```

#### Curves

```json
{
  "type": "curves",
  "params": {
    "master": { "points": [[0, 0], [255, 255]] },
    "red": { "points": [[0, 0], [255, 255]] },
    "green": { "points": [[0, 0], [255, 255]] },
    "blue": { "points": [[0, 0], [255, 255]] }
  }
}
```

Points are `[input, output]` pairs, 0-255 range.

#### Hue/Saturation

```json
{
  "type": "hue_saturation",
  "params": {
    "master": {
      "hue": 0,
      "saturation": 0,
      "lightness": 0
    },
    "colorize": false,
    "colorize_hue": 0,
    "colorize_saturation": 50
  }
}
```

| Param | Type | Range |
|-------|------|-------|
| `hue` | integer | -180 to 180 |
| `saturation` | integer | -100 to 100 |
| `lightness` | integer | -100 to 100 |

#### Color Balance

```json
{
  "type": "color_balance",
  "params": {
    "shadows": { "cyan_red": 0, "magenta_green": 0, "yellow_blue": 0 },
    "midtones": { "cyan_red": 10, "magenta_green": -5, "yellow_blue": 15 },
    "highlights": { "cyan_red": 0, "magenta_green": 0, "yellow_blue": 0 },
    "preserve_luminosity": true
  }
}
```

#### Exposure

```json
{
  "type": "exposure",
  "params": {
    "exposure": 0.0,
    "offset": 0.0,
    "gamma": 1.0
  }
}
```

#### Vibrance

```json
{
  "type": "vibrance",
  "params": {
    "vibrance": 25,
    "saturation": 0
  }
}
```

#### Black & White

```json
{
  "type": "black_white",
  "params": {
    "reds": 40,
    "yellows": 60,
    "greens": 40,
    "cyans": 60,
    "blues": 20,
    "magentas": 80,
    "tint": {
      "enabled": false,
      "hue": 0,
      "saturation": 0
    }
  }
}
```

#### Photo Filter

```json
{
  "type": "photo_filter",
  "params": {
    "color": "#ec8a00",
    "density": 25,
    "preserve_luminosity": true
  }
}
```

#### Invert

```json
{
  "type": "invert",
  "params": {}
}
```

#### Posterize

```json
{
  "type": "posterize",
  "params": {
    "levels": 4
  }
}
```

#### Threshold

```json
{
  "type": "threshold",
  "params": {
    "level": 128
  }
}
```

#### Gradient Map

```json
{
  "type": "gradient_map",
  "params": {
    "gradient": {
      "type": "linear",
      "stops": [
        { "position": 0, "color": "#000000" },
        { "position": 0.5, "color": "#ff6b00" },
        { "position": 1, "color": "#ffffff" }
      ]
    },
    "dither": false,
    "reverse": false
  }
}
```

#### Selective Color

```json
{
  "type": "selective_color",
  "params": {
    "method": "relative",
    "reds": { "cyan": 0, "magenta": 0, "yellow": 0, "black": 0 },
    "yellows": { "cyan": 0, "magenta": 0, "yellow": 0, "black": 0 },
    "greens": { "cyan": 0, "magenta": 0, "yellow": 0, "black": 0 },
    "cyans": { "cyan": 0, "magenta": 0, "yellow": 0, "black": 0 },
    "blues": { "cyan": 0, "magenta": 0, "yellow": 0, "black": 0 },
    "magentas": { "cyan": 0, "magenta": 0, "yellow": 0, "black": 0 },
    "whites": { "cyan": 0, "magenta": 0, "yellow": 0, "black": 0 },
    "neutrals": { "cyan": 0, "magenta": 0, "yellow": 0, "black": 0 },
    "blacks": { "cyan": 0, "magenta": 0, "yellow": 0, "black": 0 }
  }
}
```

---

## 8. Tiled Storage

### 8.1 When to Use Tiles

Tiles SHOULD be used when either dimension exceeds the tile threshold:

| Scenario | Recommendation |
|----------|----------------|
| Layer ≤ 4096×4096 | Single file storage |
| Layer > 4096×4096 | Tiled storage |

Implementations MAY use a different threshold based on target platform constraints.

### 8.2 Tile Configuration

```json
{
  "storage": {
    "format": "webp",
    "mode": "tiled",
    "tile_size": 2048,
    "tiles": {
      "columns": 15,
      "rows": 10,
      "sparse": true,
      "empty_tiles": ["3-5", "3-6", "4-5", "4-6"]
    }
  }
}
```

### 8.3 Sparse Tiles

For images with large transparent regions, tiles that are 100% transparent MAY be omitted:

- Set `sparse: true`
- List omitted coordinates in `empty_tiles`
- Missing tiles are treated as fully transparent

### 8.4 Tile Naming Convention

```
tiles/{row}-{col}.{format}
```

- `row`: 0-indexed from top
- `col`: 0-indexed from left
- `format`: matches `storage.format`

### 8.5 Edge Tiles

Edge tiles that extend beyond image boundaries:
- MUST be full tile size
- MUST have transparent padding
- Padding region is ignored during composition

---

## 9. History & Snapshots

### 9.1 Overview

Optional undo history can be stored in the file for persistence across sessions.

### 9.2 history/index.json

```json
{
  "version": 1,
  "max_snapshots": 50,
  "current_index": 23,
  "snapshots": [
    {
      "id": "snap-001",
      "timestamp": "2026-01-15T14:00:00Z",
      "name": "Document created",
      "type": "full"
    },
    {
      "id": "snap-002",
      "timestamp": "2026-01-15T14:05:00Z",
      "name": "Brush stroke on Layer 1",
      "type": "delta",
      "affected_layers": ["layer-001"]
    }
  ]
}
```

### 9.3 Snapshot Types

| Type | Description | Storage |
|------|-------------|---------|
| `full` | Complete document state | Full document.json + all layer pixels |
| `delta` | Changes only | Modified regions + updated metadata |

### 9.4 Delta Snapshot

```json
{
  "id": "snap-002",
  "type": "delta",
  "base_snapshot": "snap-001",
  "changes": {
    "layers": {
      "layer-001": {
        "type": "pixels_modified",
        "region": { "x": 100, "y": 100, "width": 200, "height": 150 },
        "before": "history/snapshots/snap-002/layer-001-before.webp",
        "after": "history/snapshots/snap-002/layer-001-after.webp"
      }
    },
    "document": {
      "modified_at": "2026-01-15T14:05:00Z"
    }
  }
}
```

---

## 10. Streaming Access

### 10.1 Goals

Enable partial file loading for:
- Thumbnail preview before full load
- Layer-by-layer loading
- Web-based editors using HTTP Range requests

### 10.2 File Offset Table

The `manifest.json` MAY include byte offsets:

```json
{
  "files": {
    "preview/thumbnail.webp": {
      "offset": 512,
      "size": 8192,
      "checksum": "sha256:..."
    },
    "document.json": {
      "offset": 8704,
      "size": 4096,
      "checksum": "sha256:..."
    }
  }
}
```

### 10.3 HTTP Range Request Flow

```
1. GET /document.drkr (Range: bytes=0-1023)
   → Read ZIP local file headers, find manifest.json

2. GET /document.drkr (Range: bytes=X-Y)
   → Read manifest.json, get file offsets

3. GET /document.drkr (Range: bytes=A-B)
   → Read thumbnail.webp, display preview

4. GET /document.drkr (Range: bytes=C-D)
   → Read document.json, build layer tree

5. GET /document.drkr (Range: bytes=E-F)
   → Read visible layer pixels on demand
```

### 10.4 Implementation Notes

- ZIP files store local file headers before each file's data
- The Central Directory is at the end of the archive
- For streaming, the offset table in manifest.json bypasses the need to read the Central Directory first
- Implementations SHOULD fall back to standard ZIP reading if offsets are unavailable

---

## 11. Extensibility

### 11.1 Extension Namespace

Third-party extensions use the `extensions/` directory:

```
extensions/
└── com.example.my-extension/
    ├── manifest.json
    └── data/
        └── ...
```

### 11.2 Extension Manifest

```json
{
  "id": "com.example.my-extension",
  "name": "My Custom Extension",
  "version": "1.0.0",
  "drkr_version_min": "1.0",
  "description": "Adds custom functionality",
  "data_files": [
    "data/settings.json"
  ]
}
```

### 11.3 Reserved Namespaces

The following prefixes are reserved:

- `com.darker.*` — Official extensions
- `org.drkr.*` — Specification-related extensions

### 11.4 Unknown Content Handling

Implementations MUST:
- Preserve unknown extensions when saving
- Preserve unknown fields in JSON files
- Warn users if required extensions are missing

---

## 12. Versioning & Compatibility

### 12.1 Version Format

The `drkr_version` field uses semantic versioning (major.minor):

- **Major** — Breaking changes, old readers cannot open
- **Minor** — Additive changes, old readers can open (may lose new features)

### 12.2 Compatibility Rules

| Reader Version | File Version | Behavior |
|----------------|--------------|----------|
| 1.0 | 1.0 | Full support |
| 1.0 | 1.1 | Opens, ignores unknown features |
| 1.0 | 2.0 | Error: version not supported |
| 1.1 | 1.0 | Full support |

### 12.3 Feature Detection

Readers SHOULD check `extensions_used` in manifest and warn if:
- Required extensions are unavailable
- Features may not display correctly

---

## 13. Reference Implementation

### 13.1 Reading a DRKR File (TypeScript)

```typescript
import JSZip from 'jszip';

interface DRKRDocument {
  manifest: Manifest;
  document: DocumentData;
  thumbnail: Blob;
}

async function openDRKR(file: File): Promise<DRKRDocument> {
  const zip = await JSZip.loadAsync(file);
  
  // Verify mimetype
  const mimetype = await zip.file('mimetype')?.async('string');
  if (mimetype?.trim() !== 'application/x-drkr') {
    throw new Error('Invalid DRKR file: incorrect mimetype');
  }
  
  // Read manifest
  const manifestJson = await zip.file('manifest.json')?.async('string');
  if (!manifestJson) {
    throw new Error('Invalid DRKR file: missing manifest.json');
  }
  const manifest = JSON.parse(manifestJson) as Manifest;
  
  // Check version compatibility
  const [major] = manifest.drkr_version.split('.').map(Number);
  if (major > 1) {
    throw new Error(`Unsupported DRKR version: ${manifest.drkr_version}`);
  }
  
  // Read document
  const documentJson = await zip.file('document.json')?.async('string');
  if (!documentJson) {
    throw new Error('Invalid DRKR file: missing document.json');
  }
  const document = JSON.parse(documentJson) as DocumentData;
  
  // Read thumbnail
  const thumbnailData = await zip.file('preview/thumbnail.webp')?.async('blob');
  if (!thumbnailData) {
    throw new Error('Invalid DRKR file: missing thumbnail');
  }
  
  return { manifest, document, thumbnail: thumbnailData };
}

async function readLayer(zip: JSZip, layerId: string): Promise<ImageData> {
  const metaJson = await zip.file(`layers/${layerId}/meta.json`)?.async('string');
  if (!metaJson) {
    throw new Error(`Layer not found: ${layerId}`);
  }
  const meta = JSON.parse(metaJson) as LayerMeta;
  
  if (meta.storage.mode === 'single') {
    const pixelData = await zip.file(`layers/${layerId}/pixels.webp`)?.async('blob');
    return decodeWebP(pixelData);
  } else {
    // Tiled layer - load all tiles
    return loadTiledLayer(zip, layerId, meta);
  }
}
```

### 13.2 Writing a DRKR File (TypeScript)

```typescript
async function saveDRKR(document: Document): Promise<Blob> {
  const zip = new JSZip();
  
  // mimetype MUST be first and uncompressed
  zip.file('mimetype', 'application/x-drkr', { compression: 'STORE' });
  
  // Manifest
  const manifest: Manifest = {
    drkr_version: '1.0',
    generator: {
      name: 'Darker',
      version: '1.0.0'
    },
    created_at: document.createdAt,
    modified_at: new Date().toISOString()
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  
  // Document
  zip.file('document.json', JSON.stringify(document.toJSON(), null, 2));
  
  // Layers
  for (const layer of document.layers) {
    const layerDir = `layers/${layer.id}`;
    zip.file(`${layerDir}/meta.json`, JSON.stringify(layer.meta, null, 2));
    
    if (layer.type === 'raster' || layer.type === 'ai_generated') {
      const webp = await encodeWebP(layer.pixels);
      zip.file(`${layerDir}/pixels.webp`, webp);
    }
  }
  
  // Adjustments
  for (const adj of document.adjustments) {
    zip.file(`adjustments/${adj.id}.json`, JSON.stringify(adj, null, 2));
  }
  
  // AI History
  if (document.aiHistory.operations.length > 0) {
    zip.file('ai/history.json', JSON.stringify(document.aiHistory, null, 2));
  }
  
  // Thumbnail
  const thumbnail = await generateThumbnail(document, 256);
  zip.file('preview/thumbnail.webp', thumbnail);
  
  // Merged preview
  const merged = await flattenDocument(document);
  zip.file('preview/merged.webp', merged);
  
  return zip.generateAsync({ type: 'blob' });
}
```

### 13.3 Reading a DRKR File (Rust)

```rust
use std::io::{Read, Seek};
use zip::ZipArchive;
use serde::Deserialize;

#[derive(Deserialize)]
struct Manifest {
    drkr_version: String,
    generator: Generator,
    created_at: String,
    modified_at: String,
}

pub fn open_drkr<R: Read + Seek>(reader: R) -> Result<DRKRDocument, DRKRError> {
    let mut archive = ZipArchive::new(reader)?;
    
    // Verify mimetype
    let mut mimetype = String::new();
    archive.by_name("mimetype")?.read_to_string(&mut mimetype)?;
    if mimetype.trim() != "application/x-drkr" {
        return Err(DRKRError::InvalidMimetype);
    }
    
    // Read manifest
    let manifest: Manifest = {
        let mut file = archive.by_name("manifest.json")?;
        serde_json::from_reader(&mut file)?
    };
    
    // Check version
    let major: u32 = manifest.drkr_version
        .split('.')
        .next()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    
    if major > 1 {
        return Err(DRKRError::UnsupportedVersion(manifest.drkr_version));
    }
    
    // Read document
    let document: DocumentData = {
        let mut file = archive.by_name("document.json")?;
        serde_json::from_reader(&mut file)?
    };
    
    Ok(DRKRDocument { manifest, document, archive })
}
```

---

## 14. MIME Type & File Association

### 14.1 MIME Type

```
application/x-drkr
```

### 14.2 File Extension

```
.drkr
```

### 14.3 Magic Bytes

DRKR files can be identified by:

1. ZIP magic bytes: `50 4B 03 04` (PK..)
2. First file entry named `mimetype` containing `application/x-drkr`

### 14.4 UTI (macOS)

```
com.darker.drkr
```

### 14.5 File Association (Windows Registry)

```registry
[HKEY_CLASSES_ROOT\.drkr]
@="DRKRFile"
"Content Type"="application/x-drkr"

[HKEY_CLASSES_ROOT\DRKRFile]
@="Darker Document"

[HKEY_CLASSES_ROOT\DRKRFile\DefaultIcon]
@="darker.exe,0"

[HKEY_CLASSES_ROOT\DRKRFile\shell\open\command]
@="\"C:\\Program Files\\Darker\\darker.exe\" \"%1\""
```

---

## 15. Security Considerations

### 15.1 ZIP Bomb Prevention

Implementations MUST:
- Limit decompression ratio (recommended: 100:1 max)
- Limit total extracted size
- Limit number of files in archive

### 15.2 Path Traversal

Implementations MUST:
- Reject files with paths containing `..`
- Reject absolute paths
- Sanitize all paths before extraction

### 15.3 JSON Parsing

Implementations SHOULD:
- Limit JSON nesting depth
- Limit string lengths
- Validate against schema before processing

### 15.4 AI Content Provenance

The AI history provides transparency but:
- Prompts may contain sensitive information
- Users SHOULD be warned before sharing files with AI history
- Implementations MAY offer "strip AI history" on export

### 15.5 External References

DRKR files MUST NOT:
- Reference external URLs for content
- Execute embedded scripts
- Auto-load external resources

All content must be self-contained within the archive.

---

## Appendix A: JSON Schemas

*Full JSON schemas for validation will be published separately.*

## Appendix B: Changelog

### Version 1.0.0-draft (January 2026)
- Initial draft specification

---

## License

This specification is released under the MIT License.

Copyright (c) 2026 Darker Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this specification and associated documentation files (the "Specification"), to deal in the Specification without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Specification, and to permit persons to whom the Specification is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Specification.

THE SPECIFICATION IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SPECIFICATION OR THE USE OR OTHER DEALINGS IN THE SPECIFICATION.