# 🚀 DocuVex Pro — Universal File Transformer & PDF Studio

**High-Capacity Multi-Format Conversion, Batch Merger & Interactive PDF Studio**  
*Created & Engineered by **NxD***

DocuVex Pro is an advanced, browser-based suite built to handle high-capacity batch file operations (100+ files at once), universal multi-format conversion, interactive PDF editing, in-browser PDF reading, and multi-file-to-single-PDF merging.

---

## 👤 Creator Profile
- **Creator & Lead Architect**: **NxD**
- **Role**: Lead Developer & System Architect
- **Product**: DocuVex Pro (by NxD)

---

## 🌟 Key Features & Capabilities

### 1. ☁️ High-Capacity Bulk Upload (100+ Files)
- **Drag-and-Drop & File Picker**: Upload 100+ files of mixed types simultaneously.
- **Concurrency-Controlled Pipeline**: Processes file uploads in parallel chunks of 5 to eliminate browser freezing and network congestion.
- **Progress Tracking**: Real-time per-file progress bars and overall master progress percentage indicator.
- **Format Support**:
  - **Images**: PNG, JPG, JPEG, WEBP, GIF, SVG, BMP, HEIC, TIFF
  - **Documents**: DOCX, PPTX, XLSX, TXT, HTML, RTF, MD, CSV, JSON
  - **PDFs**: Single and multi-page documents
- **Stress-Test Benchmarks**: 1-click generation of 15, 50, or 100 realistic sample files to test grid rendering and batch conversions.

### 2. 📁 Workspace & File Manager Screen
- **Interactive Thumbnail Cards Grid**: Displays real thumbnail previews, format badges (color-coded), formatted file size, and PDF page counts.
- **Multi-Select & Bulk Actions**: Select all or arbitrary subsets with sticky floating action toolbar (*Merge to PDF*, *Convert to...*, *Download ZIP*, *Delete*).
- **Drag-and-Drop Reordering**: Rearrange file order directly in the workspace grid.
- **Filter Tabs**: Filter by *All Files*, *PDFs*, *Images*, *Documents*, or *Data & Others*.
- **Search & Sort**: Instant live text search and multi-criteria sorting (Newest, Oldest, Name A-Z, Size).
- **Grid vs. List Toggle**: Switch between visual card grid and compact list view.

### 3. 📑 Merge-to-PDF Studio
- **Interactive Filmstrip**: Visual ordered card strip with drag-and-drop reordering, move left/right controls, and removal buttons.
- **Unified Engine**: Automatically converts non-PDF formats (Word DOCX, text files, PNG/JPG photos) into clean PDF pages before merging.
- **Executive Cover Page Generator**: Add professional styled cover pages with custom document title, subtitle, author, and theme colors.
- **Page Options**: Standard A4, US Letter, or auto-fit content dimensions, portrait/landscape orientation, and customizable page numbers (*Bottom Center "Page X of Y"*, *Bottom Right*, *Top Right*).

### 4. 🔄 Universal Conversion Matrix
- **Conversion Matrix Engines**:
  - *Images* ⇄ PDF, PNG, JPG, WEBP, BMP
  - *DOCX / RTF / HTML / TXT* ⇄ PDF, DOCX, TXT, HTML, RTF
  - *PDF* ⇄ PNG (Rasterized pages), JPG, DOCX, Extracted TXT, Compressed PDF
- **Batch Target Selectors**: Choose target format per file or use the master *"Convert All To"* dropdown.
- **Settings**: Quality/compression presets (Lossless, Balanced, Compact), target DPI (72, 150, 300 DPI), and automatic ZIP bundling.

### 5. ✏️ Interactive PDF Editor
- **Left Panel (Page Strip)**: Interactive thumbnails with page-level operations: reorder pages, rotate 90° CW/CCW, duplicate page, delete page, or add blank pages.
- **Top Edit Toolbar**:
  - ✏️ **Freehand Draw Pen**: Customizable stroke thickness and RGB color palette.
  - 🖍️ **Highlighter**: Semi-transparent highlighter strokes for document review.
  - 🔤 **Add Text Box**: Interactive draggable text placement with typography styling.
  - 🏷️ **Stamps & Badges**: 1-click official stamps (*APPROVED*, *CONFIDENTIAL*, *DRAFT*, *OFFICIAL*, *VOID*).
  - 💧 **Watermark Tool**: Diagonal semi-transparent watermark text overlay.
  - 📐 **Shapes**: Highlighting boxes and lines.
  - 🧼 **Undo & Clear**: Step-by-step annotation rollback.
- **Right Document Tools**:
  - PDF Stream Compression (Balanced -40%, High -70%).
  - AES Password Protection simulation.
  - Export Modes: Standard PDF, Flattened PDF (burns all annotations into page pixels), or current page PNG.
  - Version Status indicator (*● Unsaved Changes* ⇄ *✓ All changes saved*).

### 6. 📖 In-Browser PDF Reader & Viewer
- **Navigation**: Previous/Next page controls and direct page jump box (`Page [X] of Y`).
- **Zoom Tools**: Zoom In (+), Zoom Out (-), 100%, Fit Width, and Fit Page.
- **In-Document Search**: Interactive search input with hit highlights across rendered canvas.
- **Left Thumbnail Strip**: Fast jumping across multi-page documents.
- **1-Click Export & Transition**: Direct download button and instant *"Edit PDF"* transition button.

### 7. ⚡ Asynchronous Job Processing & Resilience
- **Separation of Concerns**: Conversions and merges run asynchronously via `JobQueue` without freezing HTTP web requests or browser UI.
- **Real-Time Progress**: Background jobs stream progress (0% - 100%) and step descriptions over WebSockets (with polling fallback) to the persistent jobs dock.
- **Persistent Jobs Drawer**: Collapsible floating dock showing active and completed background operations with direct download and preview links.

---

## 🛠️ Technology Architecture

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Frontend** | Modern Vanilla JS + CSS3 Design System | High-performance SPA with 0-dependency canvas rendering, drag-and-drop, and WebSockets. |
| **Backend API** | Node.js (Express 5) | File upload handling, workspace state, job queue scheduling, and REST endpoints. |
| **Job Queue** | In-Process Event-Driven Queue | Asynchronous job execution with live progress reporting and status tracking. |
| **Conversion Engines** | Apple `sips`, `textutil`, `cupsfilter`, Automator `join`, Python 3 | Native system acceleration for image conversions, document formatting, and PDF operations. |
| **Archiver** | Python `zipfile` | Multi-file ZIP archive packaging for bulk converted deliverables. |

---

## 🚀 Running the Application

### 1. Start Server

```bash
node server.js
```

The server automatically starts on:
- **OmniConvert & PDF Suite**: [http://localhost:3002](http://localhost:3002)
- **API Endpoints**: [http://localhost:3002/api](http://localhost:3002/api)
- *(Arcade Arena & QuizRoom remain accessible at `/arena` and `/quiz`)*

---

## 📡 REST API Reference

- `POST /api/upload`: Upload file (base64 JSON payload). Returns file record + thumbnail URL.
- `POST /api/demo-samples`: Generates 15, 50, or 100 mixed sample test files.
- `GET /api/files`: List all workspace files.
- `DELETE /api/files/:id`: Remove file from workspace.
- `DELETE /api/files`: Clear entire workspace.
- `POST /api/jobs/convert`: Trigger asynchronous multi-format conversion job.
- `POST /api/jobs/merge`: Trigger asynchronous multi-file PDF merge job.
- `POST /api/jobs/compress`: Trigger PDF compression job.
- `POST /api/jobs/save-pdf-edit`: Save edited PDF from PDF Editor.
- `GET /api/jobs`: List all active/completed jobs.
- `GET /api/jobs/:id`: Check specific job status and progress percentage.
- `GET /api/download/:jobId`: Download completed job deliverable (PDF, ZIP, Image, DOCX).
- `GET /api/thumbnail/:fileId`: Stream PNG preview thumbnail.
