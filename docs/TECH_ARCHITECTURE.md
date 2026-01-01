# Darker — Technical Architecture Document

> A modern, lightweight image editor with generative AI capabilities

**Version:** 2.1  
**Last Updated:** January 2026  
**Status:** Planning / Pre-Development

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Goals & Non-Goals](#goals--non-goals)
3. [Technology Stack](#technology-stack)
4. [System Architecture](#system-architecture)
5. [Multi-Platform Architecture](#multi-platform-architecture)
6. [Frontend Architecture](#frontend-architecture)
7. [Backend Architecture](#backend-architecture)
8. [Generative AI Integration](#generative-ai-integration)
9. [Scalability & Performance](#scalability--performance)
10. [File Format Support](#file-format-support)
11. [Data Models](#data-models)
12. [Development Roadmap](#development-roadmap)
13. [Development Setup](#development-setup)
14. [Cost Analysis](#cost-analysis)
15. [Technical Decisions Log](#technical-decisions-log)
16. [Resources & References](#resources--references)

---

## Executive Summary

Darker is a cross-platform desktop image editor designed as a lightweight, modern alternative to Adobe Photoshop. The application prioritizes fast startup times, low memory usage, and integrated generative AI features that leverage cloud APIs rather than bundled machine learning models.

### Key Differentiators

| Aspect | Traditional Editors | Darker |
|--------|---------------------|--------------|
| **App Size** | 2-5 GB | < 50 MB |
| **Startup Time** | 15-60 seconds | < 3 seconds |
| **AI Features** | Bundled models (stale) | API-based (always current) |
| **Subscription** | $23+/month | Free + usage-based AI costs |
| **Architecture** | Legacy codebases | Modern stack, maintainable |

### Target Users

- Photographers seeking a faster editing workflow
- Designers who need quick edits without Photoshop's overhead
- Developers building visual content
- Anyone frustrated with bloated creative software

---

## Goals & Non-Goals

### Goals

- **Performance:** Sub-3-second launch, responsive at 4K+ canvas sizes
- **Simplicity:** Core editing features without feature bloat
- **Modern AI:** Generative editing that surpasses Adobe's neural filters
- **Cross-platform:** Native experience on macOS, Windows, and Linux
- **Browser deployment:** Same app runs in modern browsers with near-native performance
- **Maintainability:** Clean architecture that a small team can maintain
- **Openness:** Potential for future open-source release

### Non-Goals

- Full Photoshop feature parity (not trying to clone every feature)
- Mobile platforms (desktop-first, mobile may come later)
- Real-time collaboration (single-user focus for v1)
- Video editing capabilities
- 3D rendering or compositing

---

## Technology Stack

### Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Shared Application Code                          │
│                                                                         │
│   Svelte Components │ Svelte Stores │ WebGL Renderer │ Service Layer   │
│                                                                         │
├─────────────────────────────────────┬───────────────────────────────────┤
│         Desktop (Tauri)             │           Browser                 │
│  ─────────────────────────────────  │  ───────────────────────────────  │
│  • Native Rust backend              │  • Rust → WASM processing         │
│  • Tauri IPC                        │  • File System Access API         │
│  • Native file dialogs              │  • IndexedDB / OPFS storage       │
│  • System integration               │  • AI proxy backend               │
│  • ~10MB installer                  │  • ~3MB initial load              │
├─────────────────────────────────────┴───────────────────────────────────┤
│                          External Services                              │
│              (Google AI, OpenAI, Stability AI, Replicate)               │
└─────────────────────────────────────────────────────────────────────────┘
```

### Stack Selection Rationale

| Component | Choice | Alternatives Considered | Rationale |
|-----------|--------|-------------------------|-----------|
| **App Framework** | Tauri | Electron, Flutter, Native | 10-20x smaller bundles, native performance, Rust backend |
| **Frontend Framework** | Svelte | React, SolidJS, Vue | Minimal runtime overhead, cleaner reactivity model, less boilerplate |
| **Rendering** | WebGL 2 | Canvas 2D, WebGPU | GPU acceleration, broad browser support, WebGPU migration path |
| **Styling** | Tailwind CSS | CSS Modules, styled-components | Rapid iteration, consistent design system |
| **Backend Language** | Rust | Node.js, Go, C++ | Memory safety, performance, excellent image processing ecosystem |
| **AI Integration** | External APIs | Bundled models | Always-current models, no app bloat, provider flexibility |

---

## System Architecture

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                           Tauri Shell                                │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                    Frontend (WebView)                          │  │
│  │                                                                │  │
│  │  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐ │  │
│  │  │   Svelte     │  │   WebGL Canvas   │  │   AI Feature     │ │  │
│  │  │   App Shell  │  │   (Rendering)    │  │   Panel          │ │  │
│  │  │              │  │                  │  │                  │ │  │
│  │  │  • Toolbar   │  │  • Layer comp    │  │  • Prompt input  │ │  │
│  │  │  • Panels    │  │  • Viewport      │  │  • Provider UI   │ │  │
│  │  │  • Dialogs   │  │  • Brush preview │  │  • Progress      │ │  │
│  │  └──────────────┘  └──────────────────┘  └──────────────────┘ │  │
│  │                                                                │  │
│  │  ┌──────────────────────────────────────────────────────────┐ │  │
│  │  │                    Svelte Stores                         │ │  │
│  │  │  • documentStore  • toolStore  • uiStore  • aiStore      │ │  │
│  │  └──────────────────────────────────────────────────────────┘ │  │
│  │                                                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                │                                     │
│                           Tauri IPC                                  │
│                    (Commands + Events)                               │
│                                │                                     │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                       Rust Backend                             │  │
│  │                                                                │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐ │  │
│  │  │  Core Engine    │  │  AI Service     │  │  File I/O      │ │  │
│  │  │                 │  │  Orchestrator   │  │                │ │  │
│  │  │  • Layer mgmt   │  │                 │  │  • Format I/O  │ │  │
│  │  │  • Filters      │  │  • API routing  │  │  • PSD parse   │ │  │
│  │  │  • History      │  │  • Caching      │  │  • RAW decode  │ │  │
│  │  │  • Selections   │  │  • Key mgmt     │  │  • Tiled I/O   │ │  │
│  │  │  • Transforms   │  │  • Fallbacks    │  │  • Export      │ │  │
│  │  └─────────────────┘  └─────────────────┘  └────────────────┘ │  │
│  │                                │                               │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                   │                                  │
└───────────────────────────────────│──────────────────────────────────┘
                                    │
                     ┌──────────────┴──────────────┐
                     │      External AI APIs       │
                     │                             │
                     │  • Google (Nano Banana Pro) │
                     │  • OpenAI (GPT Image)       │
                     │  • Stability AI             │
                     │  • Replicate                │
                     └─────────────────────────────┘
```

### Data Flow

1. **User Interaction** → Svelte components capture input
2. **State Update** → Svelte stores manage application state
3. **Rendering** → WebGL canvas renders current document state
4. **Backend Operations** → Heavy processing delegated to Rust via Tauri IPC
5. **AI Operations** → Rust backend orchestrates external API calls
6. **File Operations** → Rust handles all file system interactions

---

## Multi-Platform Architecture

The application is designed to run as both a desktop application (via Tauri) and a web application (browser-only). This is achieved through a platform abstraction layer that isolates platform-specific code from the core application logic.

### Platform Portability Matrix

| Component | Desktop (Tauri) | Browser | Code Sharing |
|-----------|-----------------|---------|--------------|
| Svelte UI components | ✓ | ✓ | 100% shared |
| WebGL rendering engine | ✓ | ✓ | 100% shared |
| Svelte stores | ✓ | ✓ | 100% shared |
| Tailwind CSS | ✓ | ✓ | 100% shared |
| Image processing | Rust (native) | Rust (WASM) | 95% shared |
| AI API calls | Rust backend | JS fetch / proxy | Interface shared |
| File I/O | Tauri fs API | File System Access API | Interface shared |
| Persistent storage | Filesystem | IndexedDB / OPFS | Interface shared |

**Approximately 70-80% of the codebase is directly shared between platforms.**

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Application Layer                               │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    Svelte Components                            │   │
│   │              (100% shared across platforms)                     │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                  │                                      │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                      Svelte Stores                              │   │
│   │              (100% shared across platforms)                     │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                  │                                      │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                   Service Layer                                 │   │
│   │         (Shared interfaces, platform-specific implementations)  │   │
│   │                                                                 │   │
│   │   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────┐ │   │
│   │   │ FileSystem  │ │  Storage    │ │ Processing  │ │    AI    │ │   │
│   │   │  Service    │ │  Service    │ │  Service    │ │ Service  │ │   │
│   │   └─────────────┘ └─────────────┘ └─────────────┘ └──────────┘ │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                  │                                      │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                  Platform Abstraction Layer                     │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                  │                                      │
├──────────────────────────────────┼──────────────────────────────────────┤
│                                  │                                      │
│         ┌────────────────────────┴────────────────────────┐            │
│         │                                                  │            │
│         ▼                                                  ▼            │
│  ┌─────────────────────────┐                ┌─────────────────────────┐ │
│  │    Desktop Platform     │                │    Browser Platform     │ │
│  │        (Tauri)          │                │                         │ │
│  │                         │                │                         │ │
│  │  • Native Rust backend  │                │  • WASM processing      │ │
│  │  • Tauri IPC            │                │  • File System Access   │ │
│  │  • Native file dialogs  │                │  • IndexedDB / OPFS     │ │
│  │  • System integration   │                │  • Fetch API            │ │
│  │                         │                │  • Service Workers      │ │
│  └─────────────────────────┘                └─────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Platform Detection

```typescript
// src/lib/platform/detect.ts
export type PlatformType = 'tauri' | 'browser';

export function detectPlatform(): PlatformType {
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    return 'tauri';
  }
  return 'browser';
}

export const currentPlatform = detectPlatform();
export const isTauri = currentPlatform === 'tauri';
export const isBrowser = currentPlatform === 'browser';
```

### Service Interfaces

All platform-specific functionality is accessed through abstract service interfaces:

```typescript
// src/lib/services/types.ts

// ============================================
// File System Service
// ============================================
export interface FileHandle {
  id: string;
  name: string;
  type: 'tauri' | 'browser';
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface FileSystemService {
  /** Open a file picker dialog and return a handle */
  openFile(filters?: FileFilter[]): Promise<FileHandle | null>;
  
  /** Open a save dialog and write data */
  saveFile(data: Uint8Array, suggestedName: string, filters?: FileFilter[]): Promise<boolean>;
  
  /** Read file contents from a handle */
  readFile(handle: FileHandle): Promise<Uint8Array>;
  
  /** Check if File System Access API is supported (browser) */
  isSupported(): boolean;
}

// ============================================
// Storage Service
// ============================================
export interface DocumentMeta {
  id: string;
  name: string;
  width: number;
  height: number;
  thumbnailUrl?: string;
  createdAt: number;
  modifiedAt: number;
  size: number;
}

export interface StorageService {
  /** Save document data */
  saveDocument(id: string, data: Uint8Array, meta: Partial<DocumentMeta>): Promise<void>;
  
  /** Load document data */
  loadDocument(id: string): Promise<Uint8Array | null>;
  
  /** Delete a document */
  deleteDocument(id: string): Promise<void>;
  
  /** List all saved documents */
  listDocuments(): Promise<DocumentMeta[]>;
  
  /** Get available storage space (if known) */
  getStorageQuota(): Promise<{ used: number; available: number } | null>;
}

// ============================================
// Image Processing Service
// ============================================
export interface ProcessingService {
  /** Initialize the processing backend (load WASM if needed) */
  initialize(): Promise<void>;
  
  /** Apply gaussian blur to pixel data */
  gaussianBlur(pixels: Uint8Array, width: number, height: number, radius: number): Promise<Uint8Array>;
  
  /** Apply unsharp mask */
  unsharpMask(pixels: Uint8Array, width: number, height: number, amount: number, radius: number, threshold: number): Promise<Uint8Array>;
  
  /** Resize image */
  resize(pixels: Uint8Array, srcWidth: number, srcHeight: number, dstWidth: number, dstHeight: number, method: 'nearest' | 'bilinear' | 'bicubic'): Promise<Uint8Array>;
  
  /** Adjust brightness/contrast */
  adjustBrightnessContrast(pixels: Uint8Array, brightness: number, contrast: number): Promise<Uint8Array>;
  
  /** Adjust hue/saturation/lightness */
  adjustHSL(pixels: Uint8Array, hue: number, saturation: number, lightness: number): Promise<Uint8Array>;
  
  /** Decode image file to RGBA pixels */
  decodeImage(data: Uint8Array): Promise<{ pixels: Uint8Array; width: number; height: number }>;
  
  /** Encode RGBA pixels to image format */
  encodeImage(pixels: Uint8Array, width: number, height: number, format: 'png' | 'jpeg' | 'webp', quality?: number): Promise<Uint8Array>;
}

// ============================================
// AI Service
// ============================================
export interface AIEditOptions {
  previewMode?: boolean;
  preferredProvider?: 'google' | 'openai' | 'stability' | 'replicate';
  maxCost?: number;
}

export interface AIResult {
  image: Uint8Array;
  provider: string;
  cached: boolean;
  cost?: number;
}

export interface AIService {
  /** Check if AI services are available and configured */
  isAvailable(): Promise<boolean>;
  
  /** Edit image with natural language prompt */
  editWithPrompt(image: Uint8Array, prompt: string, options?: AIEditOptions): Promise<AIResult>;
  
  /** Remove background from image */
  removeBackground(image: Uint8Array): Promise<AIResult>;
  
  /** Upscale image */
  upscale(image: Uint8Array, factor: 2 | 4): Promise<AIResult>;
  
  /** Restore faces in image */
  restoreFaces(image: Uint8Array): Promise<AIResult>;
  
  /** Generate image from prompt */
  generate(prompt: string, width: number, height: number): Promise<AIResult>;
  
  /** Get current cost summary */
  getCostSummary(): Promise<{ monthly: number; total: number; budget?: number }>;
}

// ============================================
// Combined Platform Services
// ============================================
export interface PlatformServices {
  fileSystem: FileSystemService;
  storage: StorageService;
  processing: ProcessingService;
  ai: AIService;
  
  /** Platform identifier */
  platform: 'tauri' | 'browser';
  
  /** Platform capabilities */
  capabilities: {
    nativeMenus: boolean;
    nativeDialogs: boolean;
    offlineSupport: boolean;
    unlimitedStorage: boolean;
  };
}
```

### Desktop Platform Implementation (Tauri)

```typescript
// src/lib/platform/tauri/index.ts
import { open, save } from '@tauri-apps/api/dialog';
import { readBinaryFile, writeBinaryFile } from '@tauri-apps/api/fs';
import { invoke } from '@tauri-apps/api/tauri';
import type { 
  PlatformServices, 
  FileSystemService, 
  StorageService,
  ProcessingService,
  AIService 
} from '../types';

// ============================================
// Tauri File System Service
// ============================================
class TauriFileSystemService implements FileSystemService {
  async openFile(filters = [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]) {
    const selected = await open({
      multiple: false,
      filters,
    });
    
    if (!selected || Array.isArray(selected)) return null;
    
    return {
      id: selected,
      name: selected.split('/').pop() || selected,
      type: 'tauri' as const,
    };
  }
  
  async saveFile(data: Uint8Array, suggestedName: string, filters = []) {
    const path = await save({
      defaultPath: suggestedName,
      filters,
    });
    
    if (!path) return false;
    
    await writeBinaryFile(path, data);
    return true;
  }
  
  async readFile(handle: { id: string }) {
    const data = await readBinaryFile(handle.id);
    return new Uint8Array(data);
  }
  
  isSupported() {
    return true;
  }
}

// ============================================
// Tauri Storage Service
// ============================================
class TauriStorageService implements StorageService {
  async saveDocument(id: string, data: Uint8Array, meta: Partial<DocumentMeta>) {
    await invoke('save_document', { id, data: Array.from(data), meta });
  }
  
  async loadDocument(id: string) {
    const data = await invoke<number[] | null>('load_document', { id });
    return data ? new Uint8Array(data) : null;
  }
  
  async deleteDocument(id: string) {
    await invoke('delete_document', { id });
  }
  
  async listDocuments() {
    return invoke<DocumentMeta[]>('list_documents');
  }
  
  async getStorageQuota() {
    // Desktop has effectively unlimited storage
    return null;
  }
}

// ============================================
// Tauri Processing Service (Native Rust)
// ============================================
class TauriProcessingService implements ProcessingService {
  async initialize() {
    // Native Rust is always ready
  }
  
  async gaussianBlur(pixels: Uint8Array, width: number, height: number, radius: number) {
    const result = await invoke<number[]>('gaussian_blur', {
      pixels: Array.from(pixels),
      width,
      height,
      radius,
    });
    return new Uint8Array(result);
  }
  
  async unsharpMask(pixels: Uint8Array, width: number, height: number, amount: number, radius: number, threshold: number) {
    const result = await invoke<number[]>('unsharp_mask', {
      pixels: Array.from(pixels),
      width,
      height,
      amount,
      radius,
      threshold,
    });
    return new Uint8Array(result);
  }
  
  async resize(pixels: Uint8Array, srcWidth: number, srcHeight: number, dstWidth: number, dstHeight: number, method: string) {
    const result = await invoke<number[]>('resize_image', {
      pixels: Array.from(pixels),
      srcWidth,
      srcHeight,
      dstWidth,
      dstHeight,
      method,
    });
    return new Uint8Array(result);
  }
  
  async adjustBrightnessContrast(pixels: Uint8Array, brightness: number, contrast: number) {
    const result = await invoke<number[]>('adjust_brightness_contrast', {
      pixels: Array.from(pixels),
      brightness,
      contrast,
    });
    return new Uint8Array(result);
  }
  
  async adjustHSL(pixels: Uint8Array, hue: number, saturation: number, lightness: number) {
    const result = await invoke<number[]>('adjust_hsl', {
      pixels: Array.from(pixels),
      hue,
      saturation,
      lightness,
    });
    return new Uint8Array(result);
  }
  
  async decodeImage(data: Uint8Array) {
    return invoke<{ pixels: number[]; width: number; height: number }>('decode_image', {
      data: Array.from(data),
    }).then(r => ({
      pixels: new Uint8Array(r.pixels),
      width: r.width,
      height: r.height,
    }));
  }
  
  async encodeImage(pixels: Uint8Array, width: number, height: number, format: string, quality = 90) {
    const result = await invoke<number[]>('encode_image', {
      pixels: Array.from(pixels),
      width,
      height,
      format,
      quality,
    });
    return new Uint8Array(result);
  }
}

// ============================================
// Tauri AI Service
// ============================================
class TauriAIService implements AIService {
  async isAvailable() {
    return invoke<boolean>('ai_is_available');
  }
  
  async editWithPrompt(image: Uint8Array, prompt: string, options = {}) {
    const result = await invoke<{ image: number[]; provider: string; cached: boolean; cost?: number }>('ai_edit_with_prompt', {
      image: Array.from(image),
      prompt,
      options,
    });
    return {
      ...result,
      image: new Uint8Array(result.image),
    };
  }
  
  async removeBackground(image: Uint8Array) {
    const result = await invoke<{ image: number[]; provider: string; cached: boolean; cost?: number }>('ai_remove_background', {
      image: Array.from(image),
    });
    return {
      ...result,
      image: new Uint8Array(result.image),
    };
  }
  
  async upscale(image: Uint8Array, factor: 2 | 4) {
    const result = await invoke<{ image: number[]; provider: string; cached: boolean; cost?: number }>('ai_upscale', {
      image: Array.from(image),
      factor,
    });
    return {
      ...result,
      image: new Uint8Array(result.image),
    };
  }
  
  async restoreFaces(image: Uint8Array) {
    const result = await invoke<{ image: number[]; provider: string; cached: boolean; cost?: number }>('ai_restore_faces', {
      image: Array.from(image),
    });
    return {
      ...result,
      image: new Uint8Array(result.image),
    };
  }
  
  async generate(prompt: string, width: number, height: number) {
    const result = await invoke<{ image: number[]; provider: string; cached: boolean; cost?: number }>('ai_generate', {
      prompt,
      width,
      height,
    });
    return {
      ...result,
      image: new Uint8Array(result.image),
    };
  }
  
  async getCostSummary() {
    return invoke<{ monthly: number; total: number; budget?: number }>('ai_get_cost_summary');
  }
}

// ============================================
// Tauri Platform Export
// ============================================
export class TauriPlatform implements PlatformServices {
  fileSystem = new TauriFileSystemService();
  storage = new TauriStorageService();
  processing = new TauriProcessingService();
  ai = new TauriAIService();
  platform = 'tauri' as const;
  
  capabilities = {
    nativeMenus: true,
    nativeDialogs: true,
    offlineSupport: true,
    unlimitedStorage: true,
  };
}
```

### Browser Platform Implementation

```typescript
// src/lib/platform/browser/index.ts
import type { 
  PlatformServices, 
  FileSystemService, 
  StorageService,
  ProcessingService,
  AIService,
  DocumentMeta 
} from '../types';

// ============================================
// Browser File System Service
// ============================================
class BrowserFileSystemService implements FileSystemService {
  async openFile(filters = [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]) {
    if (!this.isSupported()) {
      // Fallback to input element
      return this.openFileFallback(filters);
    }
    
    try {
      const [handle] = await window.showOpenFilePicker({
        types: filters.map(f => ({
          description: f.name,
          accept: { 'image/*': f.extensions.map(e => `.${e}`) },
        })),
      });
      
      return {
        id: handle.name,
        name: handle.name,
        type: 'browser' as const,
        _handle: handle,  // Store native handle
      };
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
      throw e;
    }
  }
  
  private async openFileFallback(filters: { name: string; extensions: string[] }[]): Promise<FileHandle | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = filters.flatMap(f => f.extensions.map(e => `.${e}`)).join(',');
      
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) {
          resolve({
            id: URL.createObjectURL(file),
            name: file.name,
            type: 'browser' as const,
            _file: file,
          });
        } else {
          resolve(null);
        }
      };
      
      input.click();
    });
  }
  
  async saveFile(data: Uint8Array, suggestedName: string, filters = []) {
    if (!this.isSupported()) {
      // Fallback to download
      this.downloadFile(data, suggestedName);
      return true;
    }
    
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: filters.map(f => ({
          description: f.name,
          accept: { 'image/*': f.extensions.map(e => `.${e}`) },
        })),
      });
      
      const writable = await handle.createWritable();
      await writable.write(data);
      await writable.close();
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
      throw e;
    }
  }
  
  private downloadFile(data: Uint8Array, filename: string) {
    const blob = new Blob([data]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  async readFile(handle: FileHandle & { _handle?: FileSystemFileHandle; _file?: File }) {
    if (handle._handle) {
      const file = await handle._handle.getFile();
      const buffer = await file.arrayBuffer();
      return new Uint8Array(buffer);
    }
    
    if (handle._file) {
      const buffer = await handle._file.arrayBuffer();
      return new Uint8Array(buffer);
    }
    
    // Fallback: fetch from blob URL
    const response = await fetch(handle.id);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }
  
  isSupported() {
    return 'showOpenFilePicker' in window;
  }
}

// ============================================
// Browser Storage Service (IndexedDB + OPFS)
// ============================================
class BrowserStorageService implements StorageService {
  private db: IDBDatabase | null = null;
  private opfsRoot: FileSystemDirectoryHandle | null = null;
  
  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('PixelStudio', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'id' });
        }
        
        if (!db.objectStoreNames.contains('metadata')) {
          const metaStore = db.createObjectStore('metadata', { keyPath: 'id' });
          metaStore.createIndex('modifiedAt', 'modifiedAt');
        }
      };
    });
  }
  
  private async getOPFS(): Promise<FileSystemDirectoryHandle> {
    if (this.opfsRoot) return this.opfsRoot;
    this.opfsRoot = await navigator.storage.getDirectory();
    return this.opfsRoot;
  }
  
  async saveDocument(id: string, data: Uint8Array, meta: Partial<DocumentMeta>) {
    // Store large binary data in OPFS for better performance
    if ('storage' in navigator && 'getDirectory' in navigator.storage) {
      try {
        const root = await this.getOPFS();
        const fileHandle = await root.getFileHandle(`${id}.pxl`, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();
      } catch (e) {
        // Fall back to IndexedDB
        console.warn('OPFS not available, using IndexedDB:', e);
        const db = await this.getDB();
        const tx = db.transaction('documents', 'readwrite');
        await tx.objectStore('documents').put({ id, data });
      }
    } else {
      const db = await this.getDB();
      const tx = db.transaction('documents', 'readwrite');
      await tx.objectStore('documents').put({ id, data });
    }
    
    // Store metadata in IndexedDB
    const db = await this.getDB();
    const tx = db.transaction('metadata', 'readwrite');
    const fullMeta: DocumentMeta = {
      id,
      name: meta.name || 'Untitled',
      width: meta.width || 0,
      height: meta.height || 0,
      createdAt: meta.createdAt || Date.now(),
      modifiedAt: Date.now(),
      size: data.byteLength,
      thumbnailUrl: meta.thumbnailUrl,
    };
    await tx.objectStore('metadata').put(fullMeta);
  }
  
  async loadDocument(id: string) {
    // Try OPFS first
    if ('storage' in navigator && 'getDirectory' in navigator.storage) {
      try {
        const root = await this.getOPFS();
        const fileHandle = await root.getFileHandle(`${id}.pxl`);
        const file = await fileHandle.getFile();
        const buffer = await file.arrayBuffer();
        return new Uint8Array(buffer);
      } catch (e) {
        // File might be in IndexedDB
      }
    }
    
    // Fall back to IndexedDB
    const db = await this.getDB();
    const tx = db.transaction('documents', 'readonly');
    const result = await new Promise<{ id: string; data: Uint8Array } | undefined>((resolve) => {
      const request = tx.objectStore('documents').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    });
    
    return result?.data || null;
  }
  
  async deleteDocument(id: string) {
    // Delete from OPFS
    if ('storage' in navigator && 'getDirectory' in navigator.storage) {
      try {
        const root = await this.getOPFS();
        await root.removeEntry(`${id}.pxl`);
      } catch (e) {
        // Ignore if not found
      }
    }
    
    // Delete from IndexedDB
    const db = await this.getDB();
    const tx = db.transaction(['documents', 'metadata'], 'readwrite');
    tx.objectStore('documents').delete(id);
    tx.objectStore('metadata').delete(id);
  }
  
  async listDocuments() {
    const db = await this.getDB();
    const tx = db.transaction('metadata', 'readonly');
    
    return new Promise<DocumentMeta[]>((resolve) => {
      const request = tx.objectStore('metadata').index('modifiedAt').getAll();
      request.onsuccess = () => resolve(request.result.reverse());
      request.onerror = () => resolve([]);
    });
  }
  
  async getStorageQuota() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        available: estimate.quota || 0,
      };
    }
    return null;
  }
}

// ============================================
// Browser Processing Service (WASM)
// ============================================
class BrowserProcessingService implements ProcessingService {
  private wasm: typeof import('../../wasm/pkg') | null = null;
  
  async initialize() {
    if (this.wasm) return;
    
    // Dynamically import WASM module
    this.wasm = await import('../../wasm/pkg');
    await this.wasm.default();  // Initialize WASM
  }
  
  private ensureInitialized() {
    if (!this.wasm) {
      throw new Error('Processing service not initialized. Call initialize() first.');
    }
    return this.wasm;
  }
  
  async gaussianBlur(pixels: Uint8Array, width: number, height: number, radius: number) {
    const wasm = this.ensureInitialized();
    return wasm.gaussian_blur(pixels, width, height, radius);
  }
  
  async unsharpMask(pixels: Uint8Array, width: number, height: number, amount: number, radius: number, threshold: number) {
    const wasm = this.ensureInitialized();
    return wasm.unsharp_mask(pixels, width, height, amount, radius, threshold);
  }
  
  async resize(pixels: Uint8Array, srcWidth: number, srcHeight: number, dstWidth: number, dstHeight: number, method: string) {
    const wasm = this.ensureInitialized();
    return wasm.resize_image(pixels, srcWidth, srcHeight, dstWidth, dstHeight, method);
  }
  
  async adjustBrightnessContrast(pixels: Uint8Array, brightness: number, contrast: number) {
    const wasm = this.ensureInitialized();
    return wasm.adjust_brightness_contrast(pixels, brightness, contrast);
  }
  
  async adjustHSL(pixels: Uint8Array, hue: number, saturation: number, lightness: number) {
    const wasm = this.ensureInitialized();
    return wasm.adjust_hsl(pixels, hue, saturation, lightness);
  }
  
  async decodeImage(data: Uint8Array) {
    const wasm = this.ensureInitialized();
    return wasm.decode_image(data);
  }
  
  async encodeImage(pixels: Uint8Array, width: number, height: number, format: string, quality = 90) {
    const wasm = this.ensureInitialized();
    return wasm.encode_image(pixels, width, height, format, quality);
  }
}

// ============================================
// Browser AI Service (Direct API or Proxy)
// ============================================
class BrowserAIService implements AIService {
  private apiEndpoint: string;
  private apiKey: string | null;
  
  constructor() {
    // In browser, AI calls go through a proxy to protect API keys
    // Or users can provide their own keys
    this.apiEndpoint = import.meta.env.VITE_AI_PROXY_URL || '/api/ai';
    this.apiKey = localStorage.getItem('userAIKey');
  }
  
  async isAvailable() {
    try {
      const response = await fetch(`${this.apiEndpoint}/status`);
      return response.ok;
    } catch {
      return false;
    }
  }
  
  private async request<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (this.apiKey) {
      headers['X-User-API-Key'] = this.apiKey;
    }
    
    const response = await fetch(`${this.apiEndpoint}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      throw new Error(`AI request failed: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  async editWithPrompt(image: Uint8Array, prompt: string, options = {}) {
    const result = await this.request<{ image: string; provider: string; cached: boolean; cost?: number }>('/edit', {
      image: this.arrayToBase64(image),
      prompt,
      options,
    });
    
    return {
      ...result,
      image: this.base64ToArray(result.image),
    };
  }
  
  async removeBackground(image: Uint8Array) {
    const result = await this.request<{ image: string; provider: string; cached: boolean; cost?: number }>('/remove-background', {
      image: this.arrayToBase64(image),
    });
    
    return {
      ...result,
      image: this.base64ToArray(result.image),
    };
  }
  
  async upscale(image: Uint8Array, factor: 2 | 4) {
    const result = await this.request<{ image: string; provider: string; cached: boolean; cost?: number }>('/upscale', {
      image: this.arrayToBase64(image),
      factor,
    });
    
    return {
      ...result,
      image: this.base64ToArray(result.image),
    };
  }
  
  async restoreFaces(image: Uint8Array) {
    const result = await this.request<{ image: string; provider: string; cached: boolean; cost?: number }>('/restore-faces', {
      image: this.arrayToBase64(image),
    });
    
    return {
      ...result,
      image: this.base64ToArray(result.image),
    };
  }
  
  async generate(prompt: string, width: number, height: number) {
    const result = await this.request<{ image: string; provider: string; cached: boolean; cost?: number }>('/generate', {
      prompt,
      width,
      height,
    });
    
    return {
      ...result,
      image: this.base64ToArray(result.image),
    };
  }
  
  async getCostSummary() {
    return this.request<{ monthly: number; total: number; budget?: number }>('/cost-summary', {});
  }
  
  private arrayToBase64(array: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < array.byteLength; i++) {
      binary += String.fromCharCode(array[i]);
    }
    return btoa(binary);
  }
  
  private base64ToArray(base64: string): Uint8Array {
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    return array;
  }
}

// ============================================
// Browser Platform Export
// ============================================
export class BrowserPlatform implements PlatformServices {
  fileSystem = new BrowserFileSystemService();
  storage = new BrowserStorageService();
  processing = new BrowserProcessingService();
  ai = new BrowserAIService();
  platform = 'browser' as const;
  
  capabilities = {
    nativeMenus: false,
    nativeDialogs: false,
    offlineSupport: true,  // With service worker
    unlimitedStorage: false,
  };
}
```

### Platform Factory

```typescript
// src/lib/platform/index.ts
import type { PlatformServices } from './types';
import { detectPlatform } from './detect';

let platformInstance: PlatformServices | null = null;

export async function initializePlatform(): Promise<PlatformServices> {
  if (platformInstance) return platformInstance;
  
  const platformType = detectPlatform();
  
  if (platformType === 'tauri') {
    const { TauriPlatform } = await import('./tauri');
    platformInstance = new TauriPlatform();
  } else {
    const { BrowserPlatform } = await import('./browser');
    platformInstance = new BrowserPlatform();
  }
  
  // Initialize processing service (loads WASM for browser)
  await platformInstance.processing.initialize();
  
  return platformInstance;
}

export function getPlatform(): PlatformServices {
  if (!platformInstance) {
    throw new Error('Platform not initialized. Call initializePlatform() first.');
  }
  return platformInstance;
}

// Re-export types
export * from './types';
export * from './detect';
```

### Usage in Components

Components never import platform-specific code directly:

```svelte
<!-- src/lib/components/dialogs/OpenDialog.svelte -->
<script lang="ts">
  import { getPlatform } from '$lib/platform';
  import { document } from '$lib/stores/document';
  
  const platform = getPlatform();
  
  async function openFile() {
    const handle = await platform.fileSystem.openFile([
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'psd'] }
    ]);
    
    if (!handle) return;
    
    const data = await platform.fileSystem.readFile(handle);
    const decoded = await platform.processing.decodeImage(data);
    
    // Create new document from decoded image
    document.set({
      id: crypto.randomUUID(),
      name: handle.name,
      width: decoded.width,
      height: decoded.height,
      // ...
    });
  }
</script>

<button on:click={openFile}>
  Open File
</button>
```

### WASM Build Configuration

For browser deployment, the Rust processing code compiles to WebAssembly:

```toml
# src-tauri/Cargo.toml (add WASM target)
[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
# ... existing dependencies ...

# WASM-specific (only when targeting wasm32)
[target.'cfg(target_arch = "wasm32")'.dependencies]
wasm-bindgen = "0.2"
console_error_panic_hook = "0.1"
```

```rust
// src-tauri/src/wasm.rs
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn gaussian_blur(
    pixels: &mut [u8],
    width: u32,
    height: u32,
    radius: f32,
) -> Vec<u8> {
    // Same implementation as native
    crate::processing::filters::gaussian_blur(pixels, width, height, radius)
}

#[wasm_bindgen]
pub fn decode_image(data: &[u8]) -> Result<ImageData, JsValue> {
    let decoded = crate::io::formats::decode(data)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    
    Ok(ImageData {
        pixels: decoded.pixels,
        width: decoded.width,
        height: decoded.height,
    })
}

#[wasm_bindgen]
pub struct ImageData {
    pub width: u32,
    pub height: u32,
    #[wasm_bindgen(skip)]
    pub pixels: Vec<u8>,
}

#[wasm_bindgen]
impl ImageData {
    #[wasm_bindgen(getter)]
    pub fn pixels(&self) -> Vec<u8> {
        self.pixels.clone()
    }
}
```

```bash
# Build WASM module
cd src-tauri
wasm-pack build --target web --out-dir ../src/lib/wasm/pkg
```

### Browser-Specific Considerations

| Concern | Solution |
|---------|----------|
| **WASM Performance** | ~80-90% of native speed; sufficient for most operations |
| **Memory Limits** | Browsers cap at ~2-4GB; tile-based rendering mitigates this |
| **API Key Security** | Use proxy backend to hide keys; or let users provide their own |
| **Offline Support** | Service Worker caches app shell; OPFS stores documents locally |
| **Safari Compatibility** | File System Access API limited; fallback to input/download |
| **Large Files** | OPFS handles large files better than IndexedDB |
| **Initial Load** | WASM module is ~1-2MB; lazy load after app shell renders |

### Deployment Targets

| Target | Build Command | Output |
|--------|---------------|--------|
| **Desktop (all platforms)** | `npm run tauri build` | Native installers |
| **Web (static)** | `npm run build` + WASM build | Static files for any host |
| **Web (with AI proxy)** | Deploy static + API backend | Full featured web app |
| **PWA** | Add manifest + service worker | Installable web app |

---

### Framework: Svelte + TypeScript

Svelte was selected over React for several reasons specific to image editor requirements:

| Consideration | Svelte Advantage |
|---------------|------------------|
| **Runtime Size** | ~2KB vs React's ~40KB+ |
| **Reactivity** | Compile-time, no virtual DOM diffing |
| **Boilerplate** | Significantly less code for same functionality |
| **State Management** | Built-in stores, no external dependencies |
| **Learning Curve** | Closer to vanilla JS/HTML mental model |

### Project Structure

```
darker/
├── docs/
│   ├── architecture.md              # This document
│   └── drkr-spec/                   # DRKR file format specification
│       ├── SPECIFICATION.md         # Full format specification
│       ├── CHANGELOG.md             # Spec version history
│       ├── schemas/                 # JSON validation schemas
│       │   ├── manifest.schema.json
│       │   ├── document.schema.json
│       │   ├── layer.schema.json
│       │   └── ai-history.schema.json
│       └── test-files/              # Reference test files
│           ├── minimal.drkr
│           ├── with-layers.drkr
│           ├── with-ai-history.drkr
│           └── large-tiled.drkr
│
├── src/
│   └── lib/
│       ├── components/
│       │   ├── canvas/
│       │   │   ├── Canvas.svelte           # Main WebGL canvas
│       │   │   ├── CanvasOverlay.svelte    # Tool previews, selections
│       │   │   └── ViewportControls.svelte # Zoom, pan controls
│       │   ├── panels/
│       │   │   ├── LayersPanel.svelte      # Layer management
│       │   │   ├── ToolOptionsPanel.svelte # Active tool settings
│       │   │   ├── AIPanel.svelte          # Generative AI features
│       │   │   ├── HistoryPanel.svelte     # Undo/redo list
│       │   │   └── ColorPanel.svelte       # Color picker, swatches
│       │   ├── toolbar/
│       │   │   ├── Toolbar.svelte          # Main tool selection
│       │   │   └── ToolButton.svelte       # Individual tool button
│       │   ├── dialogs/
│       │   │   ├── ExportDialog.svelte     # Export settings
│       │   │   ├── NewDocumentDialog.svelte
│       │   │   └── PreferencesDialog.svelte
│       │   └── ui/
│       │       ├── Button.svelte
│       │       ├── Slider.svelte
│       │       ├── Dropdown.svelte
│       │       └── ...
│       ├── stores/
│       │   ├── document.ts                 # Document state
│       │   ├── tools.ts                    # Tool selection & settings
│       │   ├── ui.ts                       # Panel visibility, layout
│       │   ├── ai.ts                       # AI operation state
│       │   └── preferences.ts              # User preferences
│       ├── engine/
│       │   ├── renderer.ts                 # WebGL rendering engine
│       │   ├── brushEngine.ts              # Brush stroke handling
│       │   ├── selectionEngine.ts          # Selection tools
│       │   └── blendModes.ts               # Blend mode shaders
│       ├── platform/                       # Platform abstraction layer
│       │   ├── index.ts                    # Platform factory & exports
│       │   ├── types.ts                    # Service interfaces
│       │   ├── detect.ts                   # Platform detection
│       │   ├── tauri/                      # Desktop implementations
│       │   │   ├── index.ts
│       │   │   ├── fileSystem.ts
│       │   │   ├── storage.ts
│       │   │   ├── processing.ts
│       │   │   └── ai.ts
│       │   └── browser/                    # Browser implementations
│       │       ├── index.ts
│       │       ├── fileSystem.ts
│       │       ├── storage.ts
│       │       ├── processing.ts
│       │       └── ai.ts
│       ├── wasm/                           # WASM build output (browser)
│       │   └── pkg/                        # Generated by wasm-pack
│       ├── services/
│       │   └── shortcuts.ts                # Keyboard shortcut manager
│       └── types/
│           ├── document.ts                 # Document type definitions
│           ├── tools.ts                    # Tool type definitions
│           ├── drkr.ts                     # DRKR format type definitions
│           └── ai.ts                       # AI type definitions
│
├── src-tauri/                              # Rust backend (desktop only)
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── wasm.rs                         # WASM exports (shared code)
│   │   ├── commands/                       # Tauri IPC commands
│   │   ├── engine/                         # Core image engine
│   │   ├── processing/                     # Image processing
│   │   ├── io/                             # File format handling
│   │   │   ├── mod.rs
│   │   │   ├── formats.rs                  # Format detection
│   │   │   ├── drkr/                       # DRKR format implementation
│   │   │   │   ├── mod.rs
│   │   │   │   ├── reader.rs               # Read .drkr files
│   │   │   │   ├── writer.rs               # Write .drkr files
│   │   │   │   ├── manifest.rs             # Manifest handling
│   │   │   │   ├── document.rs             # Document serialization
│   │   │   │   ├── layers.rs               # Layer serialization
│   │   │   │   ├── ai_history.rs           # AI history serialization
│   │   │   │   ├── adjustments.rs          # Adjustment serialization
│   │   │   │   ├── tiles.rs                # Tiled storage handling
│   │   │   │   └── validation.rs           # Format validation
│   │   │   ├── psd.rs                      # PSD import/export
│   │   │   ├── png.rs                      # PNG handling
│   │   │   ├── jpeg.rs                     # JPEG handling
│   │   │   └── raw.rs                      # RAW file processing
│   │   ├── ai/                             # AI service integration
│   │   └── color/                          # Color management
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── routes/
│   └── +page.svelte                        # Main application page
├── app.html
├── app.css                                 # Global styles + Tailwind
└── app.d.ts                                # TypeScript declarations
```

### State Management

Svelte's built-in stores provide reactive state management without external dependencies:

```typescript
// src/lib/stores/document.ts
import { writable, derived } from 'svelte/store';
import type { Document, Layer } from '$lib/types/document';

// Core document state
export const document = writable<Document | null>(null);
export const activeLayerId = writable<string | null>(null);

// Derived state (automatically updates when dependencies change)
export const activeLayer = derived(
  [document, activeLayerId],
  ([$document, $activeLayerId]) => {
    if (!$document || !$activeLayerId) return null;
    return $document.layers.find(l => l.id === $activeLayerId) ?? null;
  }
);

export const visibleLayers = derived(
  document,
  ($document) => $document?.layers.filter(l => l.visible) ?? []
);

// Actions
export function addLayer(layer: Layer): void {
  document.update(doc => {
    if (!doc) return doc;
    return { ...doc, layers: [...doc.layers, layer] };
  });
}

export function updateLayer(id: string, updates: Partial<Layer>): void {
  document.update(doc => {
    if (!doc) return doc;
    return {
      ...doc,
      layers: doc.layers.map(l => l.id === id ? { ...l, ...updates } : l)
    };
  });
}

export function reorderLayers(fromIndex: number, toIndex: number): void {
  document.update(doc => {
    if (!doc) return doc;
    const layers = [...doc.layers];
    const [removed] = layers.splice(fromIndex, 1);
    layers.splice(toIndex, 0, removed);
    return { ...doc, layers };
  });
}
```

```typescript
// src/lib/stores/tools.ts
import { writable, derived } from 'svelte/store';
import type { Tool, BrushSettings, SelectionSettings } from '$lib/types/tools';

export type ToolType = 'brush' | 'eraser' | 'move' | 'select-rect' | 
                       'select-ellipse' | 'select-lasso' | 'eyedropper' |
                       'crop' | 'text' | 'shape';

export const activeTool = writable<ToolType>('brush');

export const brushSettings = writable<BrushSettings>({
  size: 20,
  hardness: 80,
  opacity: 100,
  flow: 100,
  spacing: 25,
});

export const selectionSettings = writable<SelectionSettings>({
  mode: 'new',        // 'new' | 'add' | 'subtract' | 'intersect'
  feather: 0,
  antiAlias: true,
});

// Tool-specific derived state
export const currentToolSettings = derived(
  activeTool,
  ($activeTool) => {
    switch ($activeTool) {
      case 'brush':
      case 'eraser':
        return { type: 'brush', store: brushSettings };
      case 'select-rect':
      case 'select-ellipse':
      case 'select-lasso':
        return { type: 'selection', store: selectionSettings };
      default:
        return { type: 'none', store: null };
    }
  }
);
```

### Component Example

```svelte
<!-- src/lib/components/panels/LayersPanel.svelte -->
<script lang="ts">
  import { flip } from 'svelte/animate';
  import { dndzone } from 'svelte-dnd-action';
  import { document, activeLayerId, updateLayer, reorderLayers } from '$lib/stores/document';
  import { Eye, EyeOff, Lock, Unlock, Trash2 } from 'lucide-svelte';
  
  function handleDndConsider(e: CustomEvent) {
    $document.layers = e.detail.items;
  }
  
  function handleDndFinalize(e: CustomEvent) {
    $document.layers = e.detail.items;
  }
  
  function toggleVisibility(layerId: string, currentVisible: boolean) {
    updateLayer(layerId, { visible: !currentVisible });
  }
  
  function toggleLock(layerId: string, currentLocked: boolean) {
    updateLayer(layerId, { locked: !currentLocked });
  }
</script>

<div class="layers-panel">
  <header class="panel-header">
    <h3>Layers</h3>
    <div class="panel-actions">
      <button on:click={() => {/* add layer */}} title="New Layer">+</button>
    </div>
  </header>
  
  {#if $document}
    <ul
      class="layer-list"
      use:dndzone={{ items: $document.layers, flipDurationMs: 200 }}
      on:consider={handleDndConsider}
      on:finalize={handleDndFinalize}
    >
      {#each $document.layers as layer (layer.id)}
        <li
          class="layer-item"
          class:active={layer.id === $activeLayerId}
          animate:flip={{ duration: 200 }}
          on:click={() => $activeLayerId = layer.id}
        >
          <button
            class="visibility-toggle"
            on:click|stopPropagation={() => toggleVisibility(layer.id, layer.visible)}
          >
            {#if layer.visible}
              <Eye size={16} />
            {:else}
              <EyeOff size={16} />
            {/if}
          </button>
          
          <div class="layer-thumbnail">
            <!-- Thumbnail rendered from layer data -->
          </div>
          
          <span class="layer-name">{layer.name}</span>
          
          <button
            class="lock-toggle"
            on:click|stopPropagation={() => toggleLock(layer.id, layer.locked)}
          >
            {#if layer.locked}
              <Lock size={14} />
            {:else}
              <Unlock size={14} />
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .layers-panel {
    @apply flex flex-col h-full bg-neutral-900 text-neutral-100;
  }
  
  .panel-header {
    @apply flex items-center justify-between px-3 py-2 border-b border-neutral-700;
  }
  
  .layer-list {
    @apply flex-1 overflow-y-auto;
  }
  
  .layer-item {
    @apply flex items-center gap-2 px-2 py-1.5 cursor-pointer
           hover:bg-neutral-800 transition-colors;
  }
  
  .layer-item.active {
    @apply bg-blue-900/50;
  }
  
  .layer-thumbnail {
    @apply w-10 h-10 bg-neutral-700 rounded;
  }
  
  .layer-name {
    @apply flex-1 truncate text-sm;
  }
</style>
```

### Rendering Engine

The WebGL rendering engine is framework-agnostic and communicates with Svelte via stores:

```typescript
// src/lib/engine/renderer.ts
import { get } from 'svelte/store';
import { document, visibleLayers } from '$lib/stores/document';
import { viewport } from '$lib/stores/ui';

export class Renderer {
  private gl: WebGL2RenderingContext;
  private programs: Map<string, WebGLProgram> = new Map();
  private textures: Map<string, WebGLTexture> = new Map();
  private frameId: number | null = null;
  
  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      desynchronized: true,
      preserveDrawingBuffer: false,
    });
    
    if (!gl) throw new Error('WebGL 2 not supported');
    this.gl = gl;
    
    this.initShaders();
    this.startRenderLoop();
  }
  
  private initShaders(): void {
    // Initialize blend mode shaders, filter shaders, etc.
    this.programs.set('normal', this.createProgram(normalVert, normalFrag));
    this.programs.set('multiply', this.createProgram(normalVert, multiplyFrag));
    // ... additional blend modes
  }
  
  private startRenderLoop(): void {
    const render = () => {
      this.render();
      this.frameId = requestAnimationFrame(render);
    };
    this.frameId = requestAnimationFrame(render);
  }
  
  private render(): void {
    const layers = get(visibleLayers);
    const vp = get(viewport);
    
    this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
    this.gl.clearColor(0.2, 0.2, 0.2, 1.0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    
    // Render layers from bottom to top
    for (const layer of layers) {
      this.renderLayer(layer, vp);
    }
  }
  
  private renderLayer(layer: Layer, viewport: Viewport): void {
    const texture = this.textures.get(layer.dataRef);
    if (!texture) return;
    
    const program = this.programs.get(layer.blendMode) ?? this.programs.get('normal')!;
    this.gl.useProgram(program);
    
    // Set uniforms (opacity, transform, etc.)
    // Bind texture and draw
  }
  
  public updateLayerTexture(layerId: string, pixels: Uint8Array, width: number, height: number): void {
    // Upload new pixel data to GPU texture
  }
  
  public destroy(): void {
    if (this.frameId) cancelAnimationFrame(this.frameId);
    // Clean up WebGL resources
  }
}
```

### Frontend Dependencies

```json
{
  "devDependencies": {
    "@sveltejs/adapter-static": "^3.0.0",
    "@sveltejs/kit": "^2.0.0",
    "@sveltejs/vite-plugin-svelte": "^3.0.0",
    "@tauri-apps/cli": "^1.5.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "svelte": "^4.2.0",
    "svelte-check": "^3.6.0",
    "tailwindcss": "^3.4.0",
    "tslib": "^2.6.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  },
  "dependencies": {
    "@tauri-apps/api": "^1.5.0",
    "lucide-svelte": "^0.300.0",
    "svelte-dnd-action": "^0.9.0"
  }
}
```

---

## Backend Architecture

### Rust Crate Structure

```
src-tauri/
├── src/
│   ├── main.rs                    # Tauri application entry
│   ├── lib.rs                     # Library exports
│   ├── commands/
│   │   ├── mod.rs
│   │   ├── document.rs            # Document operations
│   │   ├── layer.rs               # Layer operations
│   │   ├── filters.rs             # Filter processing
│   │   ├── file_io.rs             # File import/export
│   │   └── ai.rs                  # AI operation commands
│   ├── engine/
│   │   ├── mod.rs
│   │   ├── document.rs            # Document data structure
│   │   ├── layer.rs               # Layer management
│   │   ├── history.rs             # Undo/redo system
│   │   ├── selection.rs           # Selection operations
│   │   └── tiles.rs               # Tile-based image handling
│   ├── processing/
│   │   ├── mod.rs
│   │   ├── filters.rs             # Image filters
│   │   ├── adjustments.rs         # Color adjustments
│   │   ├── transforms.rs          # Geometric transforms
│   │   └── blend.rs               # Blend mode implementations
│   ├── io/
│   │   ├── mod.rs
│   │   ├── formats.rs             # Format detection
│   │   ├── png.rs                 # PNG handling
│   │   ├── jpeg.rs                # JPEG handling
│   │   ├── psd.rs                 # PSD import/export
│   │   └── raw.rs                 # RAW file processing
│   ├── ai/
│   │   ├── mod.rs
│   │   ├── service.rs             # AI service abstraction
│   │   ├── providers/
│   │   │   ├── mod.rs
│   │   │   ├── google.rs          # Nano Banana integration
│   │   │   ├── openai.rs          # GPT Image integration
│   │   │   ├── stability.rs       # Stability AI integration
│   │   │   └── replicate.rs       # Replicate integration
│   │   ├── cache.rs               # Result caching
│   │   └── cost.rs                # Usage tracking
│   └── color/
│       ├── mod.rs
│       ├── profiles.rs            # ICC profile handling
│       └── conversion.rs          # Color space conversion
├── Cargo.toml
└── tauri.conf.json
```

### Core Dependencies

```toml
# Cargo.toml
[package]
name = "pixel-studio"
version = "0.1.0"
edition = "2021"

[dependencies]
# Tauri framework
tauri = { version = "1.5", features = ["dialog", "fs", "path", "shell", "window"] }

# Async runtime
tokio = { version = "1.35", features = ["full"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Image processing
image = "0.24"
imageproc = "0.23"
palette = "0.7"

# Parallel processing
rayon = "1.8"

# HTTP client (for AI APIs)
reqwest = { version = "0.11", features = ["json", "multipart"] }

# File format support
psd = "0.3"
rawloader = "0.37"
imagepipe = "0.5"

# Color management
lcms2 = "6.0"

# Caching
lru = "0.12"

# Error handling
thiserror = "1.0"
anyhow = "1.0"

# Logging
log = "0.4"
env_logger = "0.10"

# UUID generation
uuid = { version = "1.6", features = ["v4"] }

[features]
default = []
gpu-compute = ["wgpu"]  # Optional GPU compute support

[dependencies.wgpu]
version = "0.18"
optional = true
```

### Command Examples

```rust
// src-tauri/src/commands/document.rs
use tauri::State;
use crate::engine::{Document, DocumentManager};
use crate::error::AppResult;

#[tauri::command]
pub async fn create_document(
    manager: State<'_, DocumentManager>,
    width: u32,
    height: u32,
    name: String,
    color_profile: Option<String>,
) -> AppResult<Document> {
    let doc = manager.create(width, height, &name, color_profile.as_deref())?;
    Ok(doc)
}

#[tauri::command]
pub async fn open_document(
    manager: State<'_, DocumentManager>,
    path: String,
) -> AppResult<Document> {
    let doc = manager.open(&path).await?;
    Ok(doc)
}

#[tauri::command]
pub async fn save_document(
    manager: State<'_, DocumentManager>,
    doc_id: String,
    path: String,
    format: Option<String>,
) -> AppResult<()> {
    manager.save(&doc_id, &path, format.as_deref()).await?;
    Ok(())
}
```

```rust
// src-tauri/src/commands/filters.rs
use tauri::State;
use crate::engine::DocumentManager;
use crate::processing::filters;
use crate::error::AppResult;

#[derive(Debug, serde::Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum FilterParams {
    GaussianBlur { radius: f32 },
    UnsharpMask { amount: f32, radius: f32, threshold: u8 },
    Brightness { value: i32 },
    Contrast { value: f32 },
    HueSaturation { hue: i32, saturation: i32, lightness: i32 },
    Levels { black: u8, white: u8, gamma: f32 },
    Curves { points: Vec<(u8, u8)> },
}

#[tauri::command]
pub async fn apply_filter(
    manager: State<'_, DocumentManager>,
    doc_id: String,
    layer_id: String,
    filter: FilterParams,
) -> AppResult<LayerUpdateResult> {
    let result = manager.with_document(&doc_id, |doc| {
        let layer = doc.get_layer_mut(&layer_id)?;
        
        match filter {
            FilterParams::GaussianBlur { radius } => {
                filters::gaussian_blur(&mut layer.pixels, layer.width, layer.height, radius)
            }
            FilterParams::UnsharpMask { amount, radius, threshold } => {
                filters::unsharp_mask(&mut layer.pixels, layer.width, layer.height, amount, radius, threshold)
            }
            // ... other filters
        }
        
        Ok(LayerUpdateResult {
            layer_id: layer_id.clone(),
            affected_region: layer.bounds(),
        })
    })?;
    
    Ok(result)
}
```

### History System

```rust
// src-tauri/src/engine/history.rs
use std::collections::VecDeque;

pub struct HistoryManager {
    undo_stack: VecDeque<HistoryEntry>,
    redo_stack: Vec<HistoryEntry>,
    max_entries: usize,
}

pub struct HistoryEntry {
    pub id: String,
    pub name: String,
    pub timestamp: u64,
    pub snapshot: DocumentSnapshot,
}

pub enum DocumentSnapshot {
    Full(Vec<u8>),                           // Complete document state
    LayerDelta { layer_id: String, delta: LayerDelta },  // Incremental change
}

pub struct LayerDelta {
    pub region: Rect,
    pub before: Vec<u8>,
    pub after: Vec<u8>,
}

impl HistoryManager {
    pub fn new(max_entries: usize) -> Self {
        Self {
            undo_stack: VecDeque::with_capacity(max_entries),
            redo_stack: Vec::new(),
            max_entries,
        }
    }
    
    pub fn push(&mut self, entry: HistoryEntry) {
        // Clear redo stack on new action
        self.redo_stack.clear();
        
        // Remove oldest entry if at capacity
        if self.undo_stack.len() >= self.max_entries {
            self.undo_stack.pop_front();
        }
        
        self.undo_stack.push_back(entry);
    }
    
    pub fn undo(&mut self) -> Option<&HistoryEntry> {
        if let Some(entry) = self.undo_stack.pop_back() {
            self.redo_stack.push(entry);
            self.redo_stack.last()
        } else {
            None
        }
    }
    
    pub fn redo(&mut self) -> Option<&HistoryEntry> {
        if let Some(entry) = self.redo_stack.pop() {
            self.undo_stack.push_back(entry);
            self.undo_stack.back()
        } else {
            None
        }
    }
}
```

---

## Generative AI Integration

### Design Philosophy

The application uses an **API-first approach** for AI features rather than bundling machine learning models. This provides several advantages:

| Aspect | Bundled Models | API-First (Our Approach) |
|--------|----------------|--------------------------|
| **App Size** | +2-5 GB per model | No impact |
| **Model Currency** | Frozen at release | Always latest |
| **Maintenance** | Developer responsibility | Provider responsibility |
| **Cost Model** | Upfront compute | Pay-per-use |
| **Flexibility** | Locked to bundled models | Swap providers easily |
| **Offline Use** | Supported | Requires internet |

### AI Service Architecture

```rust
// src-tauri/src/ai/service.rs
use async_trait::async_trait;
use crate::error::AIResult;

#[async_trait]
pub trait AIProvider: Send + Sync {
    async fn edit_image(&self, image: &[u8], prompt: &str) -> AIResult<Vec<u8>>;
    async fn remove_background(&self, image: &[u8]) -> AIResult<Vec<u8>>;
    async fn upscale(&self, image: &[u8], factor: u8) -> AIResult<Vec<u8>>;
    async fn generate(&self, prompt: &str, width: u32, height: u32) -> AIResult<Vec<u8>>;
    
    fn name(&self) -> &str;
    fn supports_operation(&self, op: AIOperation) -> bool;
    fn estimated_cost(&self, op: AIOperation) -> f64;
}

pub struct AIServiceManager {
    providers: Vec<Box<dyn AIProvider>>,
    cache: AICache,
    cost_tracker: CostTracker,
    config: AIConfig,
}

impl AIServiceManager {
    pub async fn edit_with_prompt(
        &self,
        image: &[u8],
        prompt: &str,
        options: EditOptions,
    ) -> AIResult<AIEditResult> {
        // 1. Check cache for identical request
        let cache_key = self.compute_cache_key(image, prompt);
        if let Some(cached) = self.cache.get(&cache_key).await {
            return Ok(cached);
        }
        
        // 2. Optionally preview at lower resolution
        let process_image = if options.preview_mode {
            self.downscale_for_preview(image)?
        } else {
            image.to_vec()
        };
        
        // 3. Select best provider for this operation
        let provider = self.select_provider(AIOperation::Edit, &options)?;
        
        // 4. Execute with fallback on failure
        let result = match provider.edit_image(&process_image, prompt).await {
            Ok(result) => result,
            Err(e) => {
                log::warn!("Primary provider failed: {}, trying fallback", e);
                self.fallback_edit(&process_image, prompt).await?
            }
        };
        
        // 5. Track cost
        self.cost_tracker.record(provider.name(), AIOperation::Edit);
        
        // 6. Cache successful result
        self.cache.set(&cache_key, &result).await;
        
        Ok(AIEditResult {
            image: result,
            provider: provider.name().to_string(),
            cached: false,
        })
    }
    
    fn select_provider(&self, op: AIOperation, options: &EditOptions) -> AIResult<&dyn AIProvider> {
        // Priority: user preference > cost optimization > quality
        if let Some(preferred) = &options.preferred_provider {
            return self.get_provider(preferred);
        }
        
        if options.optimize_for_cost {
            return self.cheapest_provider_for(op);
        }
        
        self.best_provider_for(op)
    }
}
```

### Provider Implementations

```rust
// src-tauri/src/ai/providers/google.rs
use super::AIProvider;
use crate::error::AIResult;
use reqwest::Client;
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};

pub struct GoogleAIProvider {
    client: Client,
    api_key: String,
    model: String,  // e.g., "gemini-3-pro-image"
}

impl GoogleAIProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
            model: "gemini-3-pro-image".to_string(),
        }
    }
}

#[async_trait]
impl AIProvider for GoogleAIProvider {
    async fn edit_image(&self, image: &[u8], prompt: &str) -> AIResult<Vec<u8>> {
        let image_base64 = BASE64.encode(image);
        
        let response = self.client
            .post(format!(
                "https://generativelanguage.googleapis.com/v1/models/{}:generateContent",
                self.model
            ))
            .header("x-goog-api-key", &self.api_key)
            .json(&serde_json::json!({
                "contents": [{
                    "parts": [
                        { "text": prompt },
                        {
                            "inline_data": {
                                "mime_type": "image/png",
                                "data": image_base64
                            }
                        }
                    ]
                }],
                "generationConfig": {
                    "responseModalities": ["image", "text"]
                }
            }))
            .send()
            .await?;
        
        let result: GoogleAIResponse = response.json().await?;
        
        // Extract image from response
        let image_data = result.candidates
            .first()
            .and_then(|c| c.content.parts.iter().find(|p| p.inline_data.is_some()))
            .and_then(|p| p.inline_data.as_ref())
            .ok_or(AIError::NoImageInResponse)?;
        
        let decoded = BASE64.decode(&image_data.data)?;
        Ok(decoded)
    }
    
    fn name(&self) -> &str {
        "google"
    }
    
    fn supports_operation(&self, op: AIOperation) -> bool {
        matches!(op, 
            AIOperation::Edit | 
            AIOperation::Generate | 
            AIOperation::StyleTransfer |
            AIOperation::RemoveBackground
        )
    }
    
    fn estimated_cost(&self, op: AIOperation) -> f64 {
        match op {
            AIOperation::Edit => 0.03,
            AIOperation::Generate => 0.04,
            AIOperation::StyleTransfer => 0.03,
            AIOperation::RemoveBackground => 0.02,
            _ => 0.05,
        }
    }
}
```

### Provider Capability Matrix

| Operation | Google (Nano Banana) | OpenAI (GPT Image) | Stability AI | Replicate |
|-----------|----------------------|--------------------|--------------|-----------|
| **Scene Editing** | ✓ Primary | ✓ Fallback | ✓ | ✓ |
| **Background Removal** | ✓ | ○ | ○ | ✓ Primary |
| **Object Replacement** | ✓ Primary | ✓ | ✓ Inpainting | ✓ |
| **Upscaling** | ○ | ○ | ✓ | ✓ Primary |
| **Face Restoration** | ○ | ○ | ○ | ✓ Primary |
| **Style Transfer** | ✓ Primary | ✓ | ✓ | ✓ |
| **Generation** | ✓ | ✓ Primary | ✓ | ✓ |
| **Outpainting** | ✓ | ✓ Primary | ✓ | ✓ |

**Legend:** ✓ Supported, ○ Limited/Not recommended, Primary = default choice for this operation

### Cost Management

```rust
// src-tauri/src/ai/cost.rs
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::RwLock;
use chrono::{DateTime, Utc};

pub struct CostTracker {
    total_cents: AtomicU64,
    monthly_budget_cents: Option<u64>,
    operations: RwLock<Vec<CostEntry>>,
}

pub struct CostEntry {
    timestamp: DateTime<Utc>,
    provider: String,
    operation: AIOperation,
    cost_cents: u64,
}

impl CostTracker {
    pub fn record(&self, provider: &str, operation: AIOperation) {
        let cost = self.estimate_cost_cents(provider, operation);
        self.total_cents.fetch_add(cost, Ordering::SeqCst);
        
        let entry = CostEntry {
            timestamp: Utc::now(),
            provider: provider.to_string(),
            operation,
            cost_cents: cost,
        };
        
        self.operations.write().unwrap().push(entry);
    }
    
    pub fn is_within_budget(&self) -> bool {
        match self.monthly_budget_cents {
            Some(budget) => self.get_monthly_spend() < budget,
            None => true,
        }
    }
    
    pub fn get_monthly_spend(&self) -> u64 {
        let now = Utc::now();
        let month_start = now.with_day(1).unwrap();
        
        self.operations
            .read()
            .unwrap()
            .iter()
            .filter(|e| e.timestamp >= month_start)
            .map(|e| e.cost_cents)
            .sum()
    }
    
    pub fn get_summary(&self) -> CostSummary {
        CostSummary {
            total_cents: self.total_cents.load(Ordering::SeqCst),
            monthly_cents: self.get_monthly_spend(),
            budget_cents: self.monthly_budget_cents,
            operation_count: self.operations.read().unwrap().len(),
        }
    }
}
```

### AI Panel UI

```svelte
<!-- src/lib/components/panels/AIPanel.svelte -->
<script lang="ts">
  import { invoke } from '@tauri-apps/api/tauri';
  import { aiStore } from '$lib/stores/ai';
  import { activeLayer } from '$lib/stores/document';
  import { Wand2, Eraser, ArrowUpCircle, Paintbrush } from 'lucide-svelte';
  
  let prompt = '';
  let isProcessing = false;
  let previewMode = true;
  let selectedProvider: 'auto' | 'google' | 'openai' | 'stability' = 'auto';
  
  async function executeEdit() {
    if (!$activeLayer || !prompt.trim()) return;
    
    isProcessing = true;
    
    try {
      const result = await invoke('ai_edit_with_prompt', {
        layerId: $activeLayer.id,
        prompt: prompt.trim(),
        options: {
          previewMode,
          preferredProvider: selectedProvider === 'auto' ? null : selectedProvider,
        }
      });
      
      // Update layer with result
      aiStore.setLastResult(result);
    } catch (error) {
      aiStore.setError(error.message);
    } finally {
      isProcessing = false;
    }
  }
  
  async function quickAction(action: string) {
    if (!$activeLayer) return;
    
    isProcessing = true;
    
    try {
      const command = {
        'remove-bg': 'ai_remove_background',
        'upscale': 'ai_upscale',
        'restore-faces': 'ai_restore_faces',
      }[action];
      
      const result = await invoke(command, {
        layerId: $activeLayer.id,
      });
      
      aiStore.setLastResult(result);
    } catch (error) {
      aiStore.setError(error.message);
    } finally {
      isProcessing = false;
    }
  }
</script>

<div class="ai-panel">
  <header class="panel-header">
    <Wand2 size={18} />
    <h3>AI Edit</h3>
  </header>
  
  <div class="panel-content">
    {#if $activeLayer}
      <div class="prompt-section">
        <label for="ai-prompt">Describe your edit:</label>
        <textarea
          id="ai-prompt"
          bind:value={prompt}
          placeholder="e.g., Replace the background with a sunset beach"
          rows="3"
        />
      </div>
      
      <div class="options">
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={previewMode} />
          <span>Quick preview (512px)</span>
        </label>
        
        <label class="select-label">
          Provider:
          <select bind:value={selectedProvider}>
            <option value="auto">Auto (best quality)</option>
            <option value="google">Nano Banana Pro</option>
            <option value="openai">GPT Image</option>
            <option value="stability">Stability AI</option>
          </select>
        </label>
      </div>
      
      <button
        class="generate-btn"
        on:click={executeEdit}
        disabled={isProcessing || !prompt.trim()}
      >
        {#if isProcessing}
          Processing...
        {:else}
          Generate
        {/if}
      </button>
      
      <hr />
      
      <div class="quick-actions">
        <span class="section-label">Quick Actions</span>
        <div class="action-grid">
          <button on:click={() => quickAction('remove-bg')} disabled={isProcessing}>
            <Eraser size={16} />
            Remove BG
          </button>
          <button on:click={() => quickAction('upscale')} disabled={isProcessing}>
            <ArrowUpCircle size={16} />
            Upscale 2x
          </button>
          <button on:click={() => quickAction('restore-faces')} disabled={isProcessing}>
            <Paintbrush size={16} />
            Restore Faces
          </button>
        </div>
      </div>
      
      {#if $aiStore.costSummary}
        <div class="cost-info">
          Est. cost: ~${($aiStore.costSummary.lastOperationCents / 100).toFixed(2)}
          <span class="monthly">
            This month: ${($aiStore.costSummary.monthlyCents / 100).toFixed(2)}
          </span>
        </div>
      {/if}
    {:else}
      <p class="no-selection">Select a layer to use AI features</p>
    {/if}
  </div>
</div>
```

---

## Scalability & Performance

### Challenge 1: Large Image Support

**Problem:** WebGL textures are limited to 8192-16384 pixels depending on GPU.

**Solution:** Tile-based rendering with viewport culling.

```
┌─────────────────────────────────────────────────────────────┐
│                Full Image (e.g., 30000 x 20000 pixels)      │
│  ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐  │
│  │ Tile │ Tile │ Tile │ Tile │ Tile │ Tile │ Tile │ Tile │  │
│  ├──────┼──────┼──────┼──────┼──────┼──────┼──────┼──────┤  │
│  │ Tile │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ Tile │ Tile │ Tile │ Tile │  │
│  ├──────│▓  VIEWPORT     ▓│──────┼──────┼──────┼──────┤  │
│  │ Tile │▓  (visible)    ▓│ Tile │ Tile │ Tile │ Tile │  │
│  ├──────│▓               ▓│──────┼──────┼──────┼──────┤  │
│  │ Tile │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ Tile │ Tile │ Tile │ Tile │  │
│  ├──────┼──────┼──────┼──────┼──────┼──────┼──────┼──────┤  │
│  │ Tile │ Tile │ Tile │ Tile │ Tile │ Tile │ Tile │ Tile │  │
│  └──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘  │
│                                                             │
│  Only tiles intersecting viewport are loaded into GPU       │
└─────────────────────────────────────────────────────────────┘
```

```rust
// src-tauri/src/engine/tiles.rs
pub struct TiledImage {
    pub width: u32,
    pub height: u32,
    pub tile_size: u32,
    tiles: HashMap<TileCoord, TileState>,
}

#[derive(Clone, Copy, Hash, Eq, PartialEq)]
pub struct TileCoord {
    pub x: u32,
    pub y: u32,
}

pub enum TileState {
    NotLoaded,
    Loading,
    InMemory(Vec<u8>),
    OnGPU(TextureHandle),
}

impl TiledImage {
    pub fn new(width: u32, height: u32, tile_size: u32) -> Self {
        let tiles_x = (width + tile_size - 1) / tile_size;
        let tiles_y = (height + tile_size - 1) / tile_size;
        
        let mut tiles = HashMap::new();
        for y in 0..tiles_y {
            for x in 0..tiles_x {
                tiles.insert(TileCoord { x, y }, TileState::NotLoaded);
            }
        }
        
        Self { width, height, tile_size, tiles }
    }
    
    pub fn get_visible_tiles(&self, viewport: &Viewport) -> Vec<TileCoord> {
        let start_x = (viewport.x / self.tile_size as f64).floor() as u32;
        let start_y = (viewport.y / self.tile_size as f64).floor() as u32;
        let end_x = ((viewport.x + viewport.width) / self.tile_size as f64).ceil() as u32;
        let end_y = ((viewport.y + viewport.height) / self.tile_size as f64).ceil() as u32;
        
        let mut visible = Vec::new();
        for y in start_y..=end_y {
            for x in start_x..=end_x {
                let coord = TileCoord { x, y };
                if self.tiles.contains_key(&coord) {
                    visible.push(coord);
                }
            }
        }
        visible
    }
    
    pub fn ensure_tiles_loaded(&mut self, tiles: &[TileCoord]) {
        for coord in tiles {
            if let Some(TileState::NotLoaded) = self.tiles.get(coord) {
                self.load_tile(*coord);
            }
        }
    }
    
    pub fn unload_distant_tiles(&mut self, viewport: &Viewport, buffer: u32) {
        // Unload tiles that are far from the current viewport to manage memory
        let visible = self.get_visible_tiles(viewport);
        let visible_set: HashSet<_> = visible.into_iter().collect();
        
        for (coord, state) in self.tiles.iter_mut() {
            if !visible_set.contains(coord) {
                if let TileState::OnGPU(_) = state {
                    *state = TileState::InMemory(/* ... */);
                }
            }
        }
    }
}
```

### Challenge 2: Real-Time Brush Performance

**Problem:** IPC latency between frontend and Rust backend could affect brush responsiveness.

**Solution:** Hybrid rendering—predict strokes in JavaScript, commit final pixels in Rust.

```typescript
// src/lib/engine/brushEngine.ts
export class BrushEngine {
  private predictedStrokes: StrokePoint[] = [];
  private pendingCommit: StrokePoint[] = [];
  private predictionCanvas: OffscreenCanvas;
  private predictionCtx: OffscreenCanvasRenderingContext2D;
  
  constructor(width: number, height: number) {
    this.predictionCanvas = new OffscreenCanvas(width, height);
    this.predictionCtx = this.predictionCanvas.getContext('2d')!;
  }
  
  public onPointerDown(event: PointerEvent): void {
    this.predictedStrokes = [];
    this.addPoint(event);
  }
  
  public onPointerMove(event: PointerEvent): void {
    const point = this.createStrokePoint(event);
    
    // 1. Immediately render prediction (no latency)
    this.predictedStrokes.push(point);
    this.renderPredictedStroke(point);
    
    // 2. Queue for Rust processing
    this.pendingCommit.push(point);
  }
  
  public async onPointerUp(): Promise<void> {
    // 3. Send complete stroke to Rust for final processing
    const result = await invoke('commit_brush_stroke', {
      points: this.predictedStrokes,
      brush: get(brushSettings),
      layerId: get(activeLayerId),
    });
    
    // 4. Replace prediction with authoritative result
    this.clearPrediction();
    this.applyFinalResult(result);
  }
  
  private renderPredictedStroke(point: StrokePoint): void {
    const ctx = this.predictionCtx;
    const brush = get(brushSettings);
    
    // Simple circle rendering for prediction
    ctx.globalAlpha = brush.opacity / 100;
    ctx.beginPath();
    ctx.arc(point.x, point.y, brush.size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
```

### Challenge 3: WebGPU Migration

**Problem:** WebGL 2 has limitations for GPU compute; WebGPU offers significant improvements but isn't universally supported yet.

**Solution:** Abstract rendering backend to enable future migration.

```typescript
// src/lib/engine/renderBackend.ts
export interface RenderBackend {
  // Lifecycle
  initialize(canvas: HTMLCanvasElement): Promise<void>;
  destroy(): void;
  
  // Texture management
  createTexture(width: number, height: number, format: PixelFormat): TextureHandle;
  uploadPixels(texture: TextureHandle, data: Uint8Array): void;
  readPixels(texture: TextureHandle, region?: Rect): Uint8Array;
  deleteTexture(texture: TextureHandle): void;
  
  // Rendering
  beginFrame(): void;
  drawLayer(layer: LayerRenderData, transform: Matrix4, blend: BlendMode): void;
  endFrame(): void;
  
  // Compute (for filters)
  applyFilter(filter: FilterProgram, input: TextureHandle, output: TextureHandle): void;
}

// Current implementation
export class WebGL2Backend implements RenderBackend {
  private gl: WebGL2RenderingContext;
  // ... WebGL 2 implementation
}

// Future implementation
export class WebGPUBackend implements RenderBackend {
  private device: GPUDevice;
  private context: GPUCanvasContext;
  // ... WebGPU implementation with compute shaders
}

// Factory function
export async function createRenderBackend(canvas: HTMLCanvasElement): Promise<RenderBackend> {
  // Try WebGPU first
  if ('gpu' in navigator) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        const backend = new WebGPUBackend();
        await backend.initialize(canvas);
        console.log('Using WebGPU backend');
        return backend;
      }
    } catch (e) {
      console.warn('WebGPU initialization failed, falling back to WebGL 2');
    }
  }
  
  // Fall back to WebGL 2
  const backend = new WebGL2Backend();
  await backend.initialize(canvas);
  console.log('Using WebGL 2 backend');
  return backend;
}
```

### Performance Targets

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **App Launch** | < 3 seconds | Time from click to responsive UI |
| **Document Open (10MB)** | < 2 seconds | Time from dialog close to rendered |
| **Brush Latency** | < 16ms (60fps) | Time from pointer move to visual update |
| **Filter Preview** | < 100ms | Time from slider change to preview update |
| **Zoom/Pan** | 60fps | Consistent frame rate during navigation |
| **Memory Usage** | < 500MB baseline | With no documents open |
| **Memory per Layer** | ~width×height×4 bytes | RGBA pixel data |

---

## File Format Support

### Native Format: DRKR

The application uses a custom open format (`.drkr`) as its native file format. DRKR is designed specifically for modern image editing with AI-native features.

#### Why a Custom Format?

| Consideration | PSD | OpenRaster (ORA) | DRKR |
|---------------|-----|------------------|------|
| AI operation history | Not supported | Bolted on via extensions | First-class citizen |
| Non-destructive adjustments | Supported | Not in spec | Native support |
| Browser streaming | Not designed for it | ZIP-based, must load fully | Offset table for Range requests |
| Tile-based large images | Not supported | One PNG per layer | Built-in tiled storage |
| Modern compression | Limited | PNG only | WebP, AVIF |
| Spec control | Adobe proprietary | Community committee | Project-controlled, MIT licensed |

#### DRKR Format Overview

DRKR files are ZIP archives with a defined structure:

```
document.drkr
├── mimetype                     # "application/x-drkr"
├── manifest.json                # Version, TOC, byte offsets
├── document.json                # Canvas size, layer tree, metadata
├── layers/
│   └── {layer-id}/
│       ├── meta.json            # Layer properties
│       ├── pixels.webp          # Pixel data (small layers)
│       └── tiles/               # Tiled storage (large layers)
├── masks/
│   └── {mask-id}.webp
├── adjustments/
│   └── {adj-id}.json            # Non-destructive adjustment params
├── ai/
│   ├── history.json             # Full AI operation log
│   └── assets/                  # Cached AI outputs
├── preview/
│   ├── thumbnail.webp           # 256px preview
│   └── merged.webp              # Flattened preview
└── extensions/                  # Third-party data
```

#### Key DRKR Features

| Feature | Description |
|---------|-------------|
| **AI History** | Every AI operation logged with prompt, provider, model, cost, seed |
| **Reproducible AI** | Operations marked `reproducible: true` can be regenerated |
| **Non-Destructive Adjustments** | Curves, levels, HSL stored as parameters, not baked pixels |
| **Tiled Storage** | Layers > 4096px stored as tiles for memory efficiency |
| **Sparse Tiles** | Fully transparent tiles can be omitted |
| **Streaming Access** | Byte offset table enables HTTP Range request loading |
| **Forwards Compatible** | Unknown fields preserved on round-trip |

#### File Format Strategy

| Format | Use Case |
|--------|----------|
| **.drkr** | Native format — full fidelity, all features |
| **.psd** | Import/export for Photoshop compatibility |
| **.ora** | Export for GIMP/Krita compatibility (future) |
| **.png / .jpg / .webp** | Flattened export for sharing |

The full DRKR specification is maintained in `docs/drkr-spec/SPECIFICATION.md` and published under the MIT license.

### Import/Export Formats

| Format | Read | Write | Notes |
|--------|------|-------|-------|
| **DRKR** | ✓ | ✓ | Native format, full fidelity |
| **PNG** | ✓ | ✓ | Full support including 16-bit |
| **JPEG** | ✓ | ✓ | Quality settings on export |
| **WebP** | ✓ | ✓ | Lossy and lossless |
| **TIFF** | ✓ | ✓ | Common variants |
| **GIF** | ✓ | ○ | Read only (no animation) |
| **BMP** | ✓ | ✓ | Basic support |
| **PSD** | ✓ Partial | ✓ Partial | See PSD compatibility below |
| **RAW** | ✓ Basic | ✗ | CR2, NEF, ARW, DNG |

### PSD Compatibility

| Feature | Import | Export | Notes |
|---------|--------|--------|-------|
| Raster layers | ✓ | ✓ | Full support |
| Layer groups | ✓ | ✓ | Full support |
| Blend modes | ✓ | ✓ | All 27 standard modes |
| Opacity | ✓ | ✓ | Full support |
| Layer masks | ✓ | ✓ | Full support |
| Adjustment layers | △ | △ | Common adjustments only |
| Smart objects | ○ | ○ | Rasterized on import |
| Text layers | ○ | ○ | Rasterized on import |
| Vector shapes | ○ | ○ | Rasterized on import |
| Layer effects | △ | △ | Basic effects only |
| 3D layers | ✗ | ✗ | Not supported |
| Video layers | ✗ | ✗ | Not supported |

**Legend:** ✓ Full support, △ Partial support, ○ Rasterized/flattened, ✗ Not supported

---

## Data Models

### Document Structure

```typescript
// src/lib/types/document.ts
export interface Document {
  id: string;
  name: string;
  width: number;
  height: number;
  resolution: number;        // PPI
  colorProfile: ColorProfile;
  layers: Layer[];
  guides: Guide[];
  createdAt: number;
  modifiedAt: number;
  
  // For large image support
  tiled: boolean;
  tileSize?: number;
}

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  opacity: number;           // 0-100
  blendMode: BlendMode;
  
  // Position within document
  x: number;
  y: number;
  width: number;
  height: number;
  
  // Pixel data reference (stored in Rust backend)
  dataRef: string;
  
  // Optional features
  mask?: MaskData;
  clippingMask?: boolean;
  
  // For AI-generated content
  aiMetadata?: AILayerMetadata;
}

export type LayerType = 
  | 'raster'
  | 'adjustment'
  | 'group'
  | 'text'        // Future
  | 'shape';      // Future

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'colorDodge'
  | 'colorBurn'
  | 'hardLight'
  | 'softLight'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export interface MaskData {
  dataRef: string;
  enabled: boolean;
  linked: boolean;         // Linked to layer transform
  density: number;         // 0-100
  feather: number;         // Pixels
}

export interface AILayerMetadata {
  prompt: string;
  provider: string;
  model: string;
  timestamp: number;
  cost?: number;
}

export interface ColorProfile {
  name: string;
  colorSpace: 'srgb' | 'display-p3' | 'adobe-rgb';
  iccProfile?: Uint8Array;
}
```

### Tool Configuration

```typescript
// src/lib/types/tools.ts
export interface BrushSettings {
  size: number;            // Pixels (1-5000)
  hardness: number;        // 0-100
  opacity: number;         // 0-100
  flow: number;            // 0-100
  spacing: number;         // Percentage of brush size
  smoothing: number;       // 0-100
  
  // Dynamics (future)
  pressureSize?: boolean;
  pressureOpacity?: boolean;
  pressureHardness?: boolean;
}

export interface SelectionSettings {
  mode: SelectionMode;
  feather: number;
  antiAlias: boolean;
  
  // Magic wand / select similar
  tolerance?: number;
  contiguous?: boolean;
  sampleAllLayers?: boolean;
}

export type SelectionMode = 'new' | 'add' | 'subtract' | 'intersect';

export interface TransformSettings {
  maintainAspectRatio: boolean;
  interpolation: 'nearest' | 'bilinear' | 'bicubic';
}
```

---

## Development Roadmap

### Phase 1: MVP (Weeks 1-6)

**Goal:** Functional image editor with basic AI features

#### Week 1-2: Foundation
- [ ] Project scaffolding (Tauri + SvelteKit + Vite)
- [ ] Basic application shell and layout
- [ ] WebGL canvas initialization
- [ ] Single-layer rendering
- [ ] DRKR format: basic reader/writer structure
- [ ] Image open/save (PNG, JPEG)
- [ ] Basic pan and zoom

#### Week 3: Layer System
- [ ] Multi-layer document model
- [ ] Layer panel UI
- [ ] Layer visibility toggle
- [ ] Layer opacity
- [ ] Layer reordering (drag and drop)
- [ ] Basic blend modes (normal, multiply, screen, overlay)

#### Week 4: Core Tools
- [ ] Brush tool (basic)
- [ ] Eraser tool
- [ ] Move tool
- [ ] Rectangular selection
- [ ] Elliptical selection
- [ ] Color picker

#### Week 5: AI Integration
- [ ] AI service abstraction layer
- [ ] Google Nano Banana integration
- [ ] "Edit with prompt" feature
- [ ] Background removal
- [ ] Image upscaling

#### Week 6: Polish & Release Prep
- [ ] Keyboard shortcuts
- [ ] Undo/redo system
- [ ] Export dialog
- [ ] Basic adjustments (brightness, contrast, saturation)
- [ ] Bug fixes and performance optimization
- [ ] Application packaging

### Phase 2: Professional Features (Weeks 7-12)

- [ ] Advanced brush engine (pressure sensitivity, dynamics)
- [ ] Layer masks
- [ ] Clipping masks
- [ ] Full adjustment layer suite
- [ ] Advanced selection tools (lasso, magic wand, quick select)
- [ ] Selection refinement
- [ ] Additional AI features (style transfer, object removal)
- [ ] History panel with thumbnails

### Phase 3: File Compatibility (Weeks 13-16)

- [ ] DRKR format: full specification implementation
- [ ] DRKR format: tiled storage for large images
- [ ] DRKR format: AI history serialization
- [ ] DRKR format: adjustment layer serialization
- [ ] DRKR format: streaming/partial load support
- [ ] PSD import (layered)
- [ ] PSD export (layered)
- [ ] RAW file support
- [ ] Batch export
- [ ] Recent files
- [ ] Auto-save and recovery

### Phase 4: Browser Deployment (Weeks 17-20)

- [ ] WASM build configuration and optimization
- [ ] Browser platform service implementations
- [ ] IndexedDB / OPFS storage layer
- [ ] AI proxy backend (for API key security)
- [ ] Service Worker for offline support
- [ ] PWA manifest and icons
- [ ] Browser-specific testing (Chrome, Firefox, Safari, Edge)
- [ ] Static hosting deployment (Vercel, Netlify, or similar)

### Phase 5: Advanced Features (Weeks 21-28)

- [ ] Tile-based rendering for large images
- [ ] WebGPU migration (when browser support stabilizes)
- [ ] Text layers
- [ ] Vector shapes
- [ ] Advanced AI (outpainting, variations)
- [ ] Plugin system (WASM-based)
- [ ] Color management (ICC profiles)
- [ ] Soft proofing
- [ ] Real-time collaboration (WebRTC)

---

## Development Setup

### Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Node.js 18+
# Using nvm (recommended):
nvm install 18
nvm use 18

# Install Tauri CLI
cargo install tauri-cli

# Install wasm-pack (for browser builds)
cargo install wasm-pack

# Platform-specific dependencies

# macOS (via Homebrew)
xcode-select --install

# Ubuntu/Debian
sudo apt update
sudo apt install libwebkit2gtk-4.0-dev build-essential curl wget libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

# Windows
# Install Visual Studio Build Tools with C++ workload
# Install WebView2 (usually pre-installed on Windows 10/11)
```

### Project Initialization

```bash
# Create new project
npm create tauri-app@latest pixel-studio -- --template sveltekit-ts

cd pixel-studio

# Install frontend dependencies
npm install

# Add UI dependencies
npm install lucide-svelte svelte-dnd-action

# Add Tailwind CSS
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Run development server
npm run tauri dev
```

### Environment Configuration

```bash
# .env (do not commit)
GOOGLE_AI_KEY=your_google_ai_api_key
OPENAI_API_KEY=your_openai_api_key
STABILITY_API_KEY=your_stability_api_key
REPLICATE_API_TOKEN=your_replicate_token
```

```json
// .vscode/settings.json (recommended)
{
  "editor.formatOnSave": true,
  "svelte.enable-ts-plugin": true,
  "rust-analyzer.cargo.features": "all"
}
```

### Build Commands

```bash
# Development (desktop)
npm run tauri dev

# Build desktop app for current platform
npm run tauri build

# Build desktop app with debug info
npm run tauri build -- --debug

# Build WASM module (for browser)
cd src-tauri
wasm-pack build --target web --out-dir ../src/lib/wasm/pkg
cd ..

# Build browser version (static)
npm run build

# Preview browser build locally
npm run preview

# Run tests
npm test                    # Frontend tests
cargo test                  # Rust tests

# Build for all platforms
npm run build:desktop       # Tauri build
npm run build:web           # SvelteKit build + WASM
npm run build:all           # Both
```

### Browser Deployment

For browser deployment, you'll need:

1. **Static file hosting** — Vercel, Netlify, Cloudflare Pages, or any static host
2. **AI proxy backend** (optional) — To hide API keys from client

```bash
# Deploy to Vercel
npm i -g vercel
vercel

# Deploy to Netlify
npm i -g netlify-cli
netlify deploy --prod

# Self-hosted (any static server)
npm run build
# Serve the `build/` directory
```

#### AI Proxy Backend (Optional)

If you want to hide API keys from the client, deploy a simple proxy:

```typescript
// Example: Vercel Edge Function (api/ai/edit.ts)
import { GoogleGenerativeAI } from '@google/generative-ai';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  const { image, prompt, options } = await req.json();
  
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-image' });
  
  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType: 'image/png', data: image } }
  ]);
  
  // Extract and return image
  return Response.json({ 
    image: result.response.candidates[0].content.parts[0].inlineData.data,
    provider: 'google',
    cached: false 
  });
}
```

---

## Cost Analysis

### Development Costs

| Item | Cost | Notes |
|------|------|-------|
| Developer time | Variable | Primary investment |
| Apple Developer Program | $99/year | Required for macOS distribution |
| Windows Code Signing | ~$200-400/year | Optional, improves trust |
| API testing during development | ~$50-100 | AI feature development |
| **Total first year** | ~$350-600 | Excluding developer time |

### User Operating Costs

AI features incur per-use API costs. Users can optionally provide their own API keys.

| Usage Level | AI Operations/Month | Est. Monthly Cost |
|-------------|---------------------|-------------------|
| Light | 20-50 | $1-3 |
| Moderate | 100-200 | $5-10 |
| Heavy | 300-500 | $15-25 |
| Professional | 500+ | $25-50 |

**Comparison:** Adobe Photoshop subscription costs $22.99/month (annual) or $34.49/month (monthly).

### Monetization Options (Future Consideration)

1. **Free + API passthrough** — Users pay AI providers directly
2. **Freemium** — Free editor, paid AI credits
3. **One-time purchase** — Pay once, bring your own API keys
4. **Open source** — Community-driven development

---

## Technical Decisions Log

| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|-------------------------|
| 2026-01 | Use Tauri over Electron | 10-20x smaller bundles, better performance, Rust backend | Electron, Flutter, native |
| 2026-01 | Use Svelte over React | Less runtime overhead, cleaner reactivity, better fit for canvas-heavy app | React, SolidJS, Vue |
| 2026-01 | API-first AI integration | Always-current models, no app bloat, provider flexibility | Bundled ONNX models, local Stable Diffusion |
| 2026-01 | WebGL 2 with WebGPU migration path | Broad compatibility now, future performance gains | WebGPU-only, Canvas 2D |
| 2026-01 | Tile-based architecture for large images | Enables gigapixel support without memory explosion | Memory-mapped files, streaming |
| 2026-01 | Platform abstraction layer | Enables browser deployment with ~70% shared code; Rust→WASM for processing | Separate codebases, browser-only, desktop-only |
| 2026-01 | OPFS for browser storage | Better performance than IndexedDB for large binary files | IndexedDB only, localStorage |
| 2026-01 | Custom DRKR file format | AI-native features, browser streaming support, tile storage, full spec control | PSD as native, OpenRaster (ORA) |
| 2026-01 | DRKR integrated in main repo | Faster iteration while format stabilizes; extract to separate library when stable | Separate library from day one |

---

## Resources & References

### Documentation
- [Tauri Documentation](https://tauri.app/v1/guides/)
- [Svelte Documentation](https://svelte.dev/docs)
- [SvelteKit Documentation](https://kit.svelte.dev/docs)
- [WebGL 2 Fundamentals](https://webgl2fundamentals.org/)
- [WebGPU Specification](https://www.w3.org/TR/webgpu/)

### Rust Crates
- [image](https://docs.rs/image/) — Image encoding/decoding
- [imageproc](https://docs.rs/imageproc/) — Image processing algorithms
- [psd](https://docs.rs/psd/) — PSD file parsing
- [rawloader](https://docs.rs/rawloader/) — RAW file decoding
- [lcms2](https://docs.rs/lcms2/) — Color management

### AI API Documentation
- [Google AI Studio](https://aistudio.google.com/) — Nano Banana API
- [OpenAI API](https://platform.openai.com/docs/) — Image generation
- [Stability AI](https://platform.stability.ai/docs/) — Stable Diffusion API
- [Replicate](https://replicate.com/docs) — Model hosting

### Reference Implementations
- [Photopea](https://www.photopea.com/) — Browser-based editor (inspiration)
- [Krita Source](https://invent.kde.org/graphics/krita) — Open source reference
- [GIMP Source](https://gitlab.gnome.org/GNOME/gimp) — Open source reference

---

## Contributing

*This section to be expanded if/when the project accepts external contributions.*

### Code Style
- TypeScript: Follow project ESLint configuration
- Rust: Follow `rustfmt` defaults
- Commits: Use conventional commit format

### Pull Request Process
1. Create feature branch from `main`
2. Implement changes with tests
3. Update documentation as needed
4. Submit PR with clear description

---

## License

*License to be determined. Consider MIT, Apache 2.0, or dual-license for maximum flexibility.*

---

**Document Maintainer:** [Project Lead]  
**Last Review:** January 2026  
**Next Review:** After MVP completion