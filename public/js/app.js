/**
 * OmniConvert Pro — Advanced Universal Converter & PDF Studio
 * Feature-Packed Frontend Controller with Deep Options
 */

class OmniConvertApp {
  constructor() {
    this.files = [];
    this.selectedIds = new Set();
    this.mergeOrder = [];

    // Studio & Viewer State
    this.currentViewerFile = null;
    this.viewerCurrentPage = 1;
    this.viewerTotalPages = 1;
    this.viewerRotation = 0;
    this.viewerZoom = 1.0;
    this.isInverted = false;
    
    // Tools: view | draw | highlight | text | signature | stamp | watermark | shape
    this.currentTool = 'view';
    this.currentColor = '#ef4444';
    this.currentStrokeSize = 4;
    
    // Annotations Map: pageNum -> Array of annotation objects
    this.pageAnnotations = new Map();
    this.isDrawing = false;
    this.currentPath = null;

    this.initSocket();
    this.initEvents();
    this.fetchFiles();
  }

  // =========================================================================
  // Socket & Sync
  // =========================================================================

  initSocket() {
    try {
      this.socket = io();

      this.socket.on('workspace:file_added', (file) => {
        if (!this.files.some(f => f.id === file.id)) {
          this.files.unshift(file);
          this.selectedIds.add(file.id);
          this.renderUI();
        }
      });

      this.socket.on('workspace:batch_added', (data) => {
        if (data.files) {
          data.files.forEach(f => {
            if (!this.files.some(existing => existing.id === f.id)) {
              this.files.push(f);
              this.selectedIds.add(f.id);
            }
          });
          this.renderUI();
        }
      });

      this.socket.on('workspace:file_removed', (data) => {
        this.files = this.files.filter(f => f.id !== data.id);
        this.selectedIds.delete(data.id);
        this.renderUI();
      });

      this.socket.on('workspace:cleared', () => {
        this.files = [];
        this.selectedIds.clear();
        this.renderUI();
      });

      this.socket.on('job:update', (job) => {
        this.handleJobUpdate(job);
      });
    } catch (e) {
      console.warn('Socket error:', e);
    }
  }

  // =========================================================================
  // DOM Event Bindings
  // =========================================================================

  initEvents() {
    // Theme toggle
    document.getElementById('btn-theme-toggle').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('omni-theme', next);
    });
    const savedTheme = localStorage.getItem('omni-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Sample loading buttons
    document.getElementById('btn-add-samples').addEventListener('click', () => this.loadSamples(12));
    document.getElementById('btn-add-stress').addEventListener('click', () => this.loadSamples(50));

    // Clear all
    document.getElementById('btn-clear-all').addEventListener('click', () => {
      if (this.files.length && confirm('Clear all files from workspace?')) {
        this.clearFiles();
      }
    });

    // Drag and drop zone
    const dropCard = document.getElementById('drop-card');
    const fileInput = document.getElementById('file-input');

    dropCard.addEventListener('click', () => fileInput.click());
    dropCard.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropCard.classList.add('drag-over');
    });
    dropCard.addEventListener('dragleave', () => dropCard.classList.remove('drag-over'));
    dropCard.addEventListener('drop', (e) => {
      e.preventDefault();
      dropCard.classList.remove('drag-over');
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        this.uploadFiles(e.dataTransfer.files);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length) {
        this.uploadFiles(e.target.files);
      }
    });

    // Select all checkbox
    document.getElementById('chk-select-all').addEventListener('change', (e) => {
      if (e.target.checked) {
        this.files.forEach(f => this.selectedIds.add(f.id));
      } else {
        this.selectedIds.clear();
      }
      this.renderUI();
    });

    // Action 1: Open Merge Studio Modal
    document.getElementById('btn-merge-action').addEventListener('click', () => this.openMergeModal());

    // Action 2: Open Advanced Conversion Modal
    document.getElementById('btn-open-convert-modal').addEventListener('click', () => {
      document.getElementById('modal-convert-options').style.display = 'flex';
    });

    // Action 3: Quick Convert Run
    document.getElementById('btn-quick-convert').addEventListener('click', () => {
      const target = document.getElementById('quick-convert-select').value;
      this.startConvertJob({ targetFormat: target });
    });

    // Action 4: Download ZIP
    document.getElementById('btn-download-all-zip').addEventListener('click', () => {
      this.startConvertJob({ targetFormat: 'zip', forceZip: true });
    });

    // Merge Modal Cover Page Toggle
    document.getElementById('chk-merge-cover').addEventListener('change', (e) => {
      document.getElementById('cover-fields').style.display = e.target.checked ? 'block' : 'none';
    });

    // Confirm Merge Button
    document.getElementById('btn-confirm-merge').addEventListener('click', () => this.startAdvancedMerge());

    // Confirm Advanced Convert Button
    document.getElementById('btn-adv-convert-start').addEventListener('click', () => {
      const targetFormat = document.getElementById('adv-convert-target').value;
      const dpi = document.getElementById('adv-convert-dpi').value;
      const quality = document.getElementById('adv-convert-quality').value;
      const scale = document.getElementById('adv-convert-scale').value;
      const forceZip = document.getElementById('adv-convert-zip').checked;

      this.closeModals();
      this.startConvertJob({
        targetFormat,
        dpi,
        quality,
        maxWidth: scale,
        forceZip
      });
    });

    // Studio Ribbon Tools
    document.querySelectorAll('.ribbon-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ribbon-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentTool = btn.dataset.tool;

        const drawCanvas = document.getElementById('view-draw-canvas');
        if (this.currentTool === 'view') {
          drawCanvas.style.pointerEvents = 'none';
        } else {
          drawCanvas.style.pointerEvents = 'auto';
        }

        if (this.currentTool === 'signature') {
          this.insertSignature();
        } else if (this.currentTool === 'stamp') {
          this.insertStamp();
        } else if (this.currentTool === 'watermark') {
          this.applyWatermark();
        }
      });
    });

    // Studio Color & Size Pickers
    const colorPicker = document.getElementById('studio-color-picker');
    colorPicker.addEventListener('input', (e) => {
      this.currentColor = e.target.value;
    });

    const sizeSlider = document.getElementById('studio-size-slider');
    sizeSlider.addEventListener('input', (e) => {
      this.currentStrokeSize = parseInt(e.target.value);
      document.getElementById('studio-size-val').textContent = `${this.currentStrokeSize}px`;
    });

    // Studio Navigation & Page Operations
    document.getElementById('btn-prev-page').addEventListener('click', () => this.changePage(-1));
    document.getElementById('btn-next-page').addEventListener('click', () => this.changePage(1));
    document.getElementById('btn-rotate-cw').addEventListener('click', () => this.rotatePage(90));
    document.getElementById('btn-add-blank').addEventListener('click', () => this.addBlankPage());
    document.getElementById('btn-delete-page').addEventListener('click', () => this.deleteCurrentPage());
    document.getElementById('btn-undo-draw').addEventListener('click', () => this.undoDraw());
    document.getElementById('btn-clear-draw').addEventListener('click', () => this.clearDraw());

    // Studio Zoom & Night Mode
    document.getElementById('btn-zoom-in').addEventListener('click', () => this.zoom(0.15));
    document.getElementById('btn-zoom-out').addEventListener('click', () => this.zoom(-0.15));
    document.getElementById('btn-dark-reading').addEventListener('click', () => this.toggleNightReading());

    // Studio Save & Export
    document.getElementById('btn-editor-save').addEventListener('click', () => this.saveViewerPDF());
    document.getElementById('btn-editor-download-raw').addEventListener('click', () => {
      if (this.currentViewerFile) {
        window.location.href = this.currentViewerFile.downloadUrl;
      }
    });

    // Canvas drawing setup
    this.initCanvasDrawing();
  }

  // =========================================================================
  // API Calls & Uploads
  // =========================================================================

  async fetchFiles() {
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      if (data.success && data.files) {
        this.files = data.files;
        this.files.forEach(f => this.selectedIds.add(f.id));
        this.renderUI();
      }
    } catch (e) {
      console.warn('Error fetching files:', e);
    }
  }

  async loadSamples(count = 12) {
    this.showToast(`Loading ${count} realistic sample files...`);
    try {
      const res = await fetch('/api/demo-samples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count })
      });
      const data = await res.json();
      if (data.success) {
        this.files = data.files;
        this.files.forEach(f => this.selectedIds.add(f.id));
        this.renderUI();
        this.showToast(`Added ${data.count} sample files!`);
      }
    } catch (e) {
      this.showToast('Failed to load samples');
    }
  }

  async clearFiles() {
    try {
      await fetch('/api/files', { method: 'DELETE' });
      this.files = [];
      this.selectedIds.clear();
      this.renderUI();
      this.showToast('Workspace cleared');
    } catch (e) {}
  }

  async deleteSingle(id) {
    try {
      await fetch(`/api/files/${id}`, { method: 'DELETE' });
      this.files = this.files.filter(f => f.id !== id);
      this.selectedIds.delete(id);
      this.renderUI();
      this.showToast('File removed');
    } catch (e) {}
  }

  async uploadFiles(fileList) {
    const list = Array.from(fileList);
    if (!list.length) return;

    const progressBox = document.getElementById('upload-progress-box');
    const fill = document.getElementById('upload-progress-fill');
    const statusText = document.getElementById('upload-status-text');
    const pctText = document.getElementById('upload-percentage');

    progressBox.style.display = 'block';

    let done = 0;
    const total = list.length;

    const queue = [...list];
    const worker = async () => {
      while (queue.length) {
        const file = queue.shift();
        try {
          const base64 = await this.readAsBase64(file);
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: file.name,
              data: base64,
              mimeType: file.type
            })
          });
          const data = await res.json();
          if (data.success) {
            this.files.unshift(data.file);
            this.selectedIds.add(data.file.id);
          }
        } catch (e) {}

        done++;
        const pct = Math.round((done / total) * 100);
        fill.style.width = `${pct}%`;
        pctText.textContent = `${pct}%`;
        statusText.textContent = `Uploading ${done} of ${total} files...`;
        this.renderUI();
      }
    };

    const workers = [];
    for (let i = 0; i < Math.min(5, total); i++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    setTimeout(() => {
      progressBox.style.display = 'none';
      this.showToast(`Upload complete (${total} files)`);
    }, 600);
  }

  readAsBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  // =========================================================================
  // Rendering Files Grid
  // =========================================================================

  renderUI() {
    const count = this.files.length;
    document.getElementById('file-count-badge').textContent = `${count} ${count === 1 ? 'file' : 'files'}`;

    const actionBar = document.getElementById('action-bar');
    const grid = document.getElementById('files-grid');

    if (count === 0) {
      actionBar.style.display = 'none';
      grid.innerHTML = '';
      return;
    }

    actionBar.style.display = 'flex';
    document.getElementById('selected-label').textContent = `${this.selectedIds.size} of ${count} selected`;
    document.getElementById('chk-select-all').checked = this.selectedIds.size === count;

    grid.innerHTML = '';
    this.files.forEach(file => {
      const isSelected = this.selectedIds.has(file.id);
      const card = document.createElement('div');
      card.className = `file-card ${isSelected ? 'selected' : ''}`;
      card.draggable = true;

      let badgeType = 'doc';
      if (file.category === 'pdf') badgeType = 'pdf';
      else if (file.category === 'image') badgeType = 'img';

      card.innerHTML = `
        <div class="card-thumb-wrap">
          <input type="checkbox" class="card-chk" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation()" />
          <span class="card-badge ${badgeType}">${file.ext.toUpperCase()}</span>
          <img class="card-thumb-img" src="${file.thumbnailUrl || '/api/thumbnail/' + file.id}" onerror="this.src='/api/thumbnail/${file.id}'" alt="${file.filename}" />
        </div>
        <div class="card-info">
          <div class="card-name" title="${file.filename}">${file.filename}</div>
          <div class="card-meta">${file.sizeFormatted} • ${file.pageCount > 1 ? file.pageCount + ' pages' : file.ext.toUpperCase()}</div>
        </div>
        <div class="card-btn-row">
          <button class="btn btn-xs btn-secondary" onclick="app.openViewer('${file.id}')">✏️ Edit / View</button>
          <button class="btn btn-xs btn-ghost" onclick="app.downloadSingle('${file.id}')">⬇</button>
          <button class="btn btn-xs btn-ghost" onclick="app.deleteSingle('${file.id}')">✕</button>
        </div>
      `;

      const chk = card.querySelector('.card-chk');
      chk.addEventListener('change', (e) => {
        if (e.target.checked) this.selectedIds.add(file.id);
        else this.selectedIds.delete(file.id);
        card.classList.toggle('selected', e.target.checked);
        document.getElementById('selected-label').textContent = `${this.selectedIds.size} of ${this.files.length} selected`;
        document.getElementById('chk-select-all').checked = this.selectedIds.size === this.files.length;
      });

      card.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', file.id));
      card.addEventListener('dragover', (e) => e.preventDefault());
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        const srcId = e.dataTransfer.getData('text/plain');
        if (srcId && srcId !== file.id) {
          const fromIdx = this.files.findIndex(f => f.id === srcId);
          const toIdx = this.files.findIndex(f => f.id === file.id);
          if (fromIdx >= 0 && toIdx >= 0) {
            const item = this.files.splice(fromIdx, 1)[0];
            this.files.splice(toIdx, 0, item);
            this.renderUI();
          }
        }
      });

      grid.appendChild(card);
    });
  }

  downloadSingle(id) {
    const f = this.files.find(item => item.id === id);
    if (f) window.location.href = f.downloadUrl;
  }

  // =========================================================================
  // Advanced Merge to PDF Studio
  // =========================================================================

  openMergeModal() {
    const selected = (this.selectedIds.size ? Array.from(this.selectedIds) : this.files.map(f => f.id))
      .map(id => this.files.find(f => f.id === id))
      .filter(Boolean);

    if (selected.length === 0) {
      this.showToast('Please select at least 1 file to merge');
      return;
    }

    this.mergeOrder = [...selected];
    const filmstrip = document.getElementById('merge-filmstrip');
    filmstrip.innerHTML = '';

    this.mergeOrder.forEach((file, idx) => {
      const card = document.createElement('div');
      card.className = 'merge-card';
      card.innerHTML = `
        <span class="merge-num">${idx + 1}</span>
        <img class="merge-thumb" src="${file.thumbnailUrl || '/api/thumbnail/' + file.id}" />
        <div class="merge-name" title="${file.filename}">${file.filename}</div>
      `;
      filmstrip.appendChild(card);
    });

    document.getElementById('modal-merge').style.display = 'flex';
  }

  async startAdvancedMerge() {
    this.closeModals();
    this.showProcessingModal('Merging into PDF Portfolio...', 'Assembling documents, generating cover page and TOC.');

    const filename = document.getElementById('merge-filename').value.trim() || 'Combined_Portfolio.pdf';
    const pageSize = document.getElementById('merge-page-size').value;
    const orientation = document.getElementById('merge-orientation').value;
    const pageNumbering = document.getElementById('merge-numbering').value;
    
    const hasCover = document.getElementById('chk-merge-cover').checked;
    const coverTitle = hasCover ? (document.getElementById('merge-title-input').value.trim() || 'Executive Portfolio') : null;
    const coverSubtitle = hasCover ? (document.getElementById('merge-subtitle-input').value.trim() || 'Compiled from Multi-Format Documents') : null;
    const coverAuthor = hasCover ? (document.getElementById('merge-author-input').value.trim() || 'OmniConvert Pro Suite') : null;
    const coverThemeRadio = document.querySelector('input[name="cover-color"]:checked');
    const coverTheme = coverThemeRadio ? coverThemeRadio.value : '#3b82f6';
    
    const generateTOC = document.getElementById('chk-merge-toc').checked;

    try {
      const res = await fetch('/api/jobs/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileIds: this.mergeOrder.map(f => f.id),
          options: {
            outputName: filename,
            pageSize,
            orientation,
            pageNumbers: pageNumbering,
            coverTitle,
            coverSubtitle,
            coverAuthor,
            coverTheme,
            generateTOC
          }
        })
      });
      const data = await res.json();
      if (!data.success) {
        this.showToast('Merge error: ' + data.error);
        this.closeModals();
      }
    } catch (e) {
      this.showToast('Merge failed');
      this.closeModals();
    }
  }

  // =========================================================================
  // Advanced Universal Conversion
  // =========================================================================

  async startConvertJob(options = {}) {
    const ids = this.selectedIds.size ? Array.from(this.selectedIds) : this.files.map(f => f.id);
    if (!ids.length) {
      this.showToast('Please select files to convert');
      return;
    }

    const targetFormat = options.targetFormat || 'pdf';
    this.showProcessingModal(`Converting ${ids.length} files to ${targetFormat.toUpperCase()}...`, 'Processing format transformation asynchronously.');

    try {
      const res = await fetch('/api/jobs/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileIds: ids,
          targetFormat: targetFormat === 'zip' ? 'pdf' : targetFormat,
          options: {
            dpi: options.dpi || '150',
            quality: options.quality || 'normal',
            maxWidth: options.maxWidth || null,
            forceZip: options.forceZip || targetFormat === 'zip' || ids.length > 1
          }
        })
      });
      const data = await res.json();
      if (!data.success) {
        this.showToast('Conversion error: ' + data.error);
        this.closeModals();
      }
    } catch (e) {
      this.showToast('Conversion failed');
      this.closeModals();
    }
  }

  // =========================================================================
  // Processing Modal Handler
  // =========================================================================

  showProcessingModal(title, desc) {
    document.getElementById('proc-spinner').style.display = 'block';
    document.getElementById('proc-success').style.display = 'none';
    document.getElementById('proc-title').textContent = title;
    document.getElementById('proc-desc').textContent = desc;
    document.getElementById('proc-bar-wrap').style.display = 'block';
    document.getElementById('proc-fill').style.width = '20%';
    document.getElementById('proc-actions').style.display = 'none';
    document.getElementById('modal-processing').style.display = 'flex';
  }

  handleJobUpdate(job) {
    const fill = document.getElementById('proc-fill');
    if (fill) fill.style.width = `${job.progressPercent}%`;

    const desc = document.getElementById('proc-desc');
    if (desc && job.currentStep) desc.textContent = job.currentStep;

    if (job.status === 'completed') {
      document.getElementById('proc-spinner').style.display = 'none';
      document.getElementById('proc-success').style.display = 'flex';
      document.getElementById('proc-title').textContent = 'Ready!';
      document.getElementById('proc-desc').textContent = `Finished: ${job.resultFilename || 'Complete'}`;
      document.getElementById('proc-bar-wrap').style.display = 'none';

      const btn = document.getElementById('btn-proc-download');
      btn.href = job.resultUrl;
      btn.textContent = `Download ${job.resultFilename || 'Deliverable'}`;
      document.getElementById('proc-actions').style.display = 'block';
      this.showToast('Finished processing!');
    }
  }

  // =========================================================================
  // Pro PDF Studio & Canvas Drawing / Annotations
  // =========================================================================

  openViewer(fileId) {
    const file = this.files.find(f => f.id === fileId);
    if (!file) return;

    this.currentViewerFile = file;
    this.viewerCurrentPage = 1;
    this.viewerTotalPages = file.pageCount || 1;
    this.viewerRotation = 0;
    this.viewerZoom = 1.0;
    this.isInverted = false;
    this.pageAnnotations.clear();

    document.getElementById('viewer-filename').textContent = file.filename;
    document.getElementById('viewer-page-info').textContent = `Page 1 of ${this.viewerTotalPages}`;
    document.getElementById('studio-doc-badge').textContent = file.ext.toUpperCase();
    document.getElementById('canvas-wrapper').classList.remove('inverted');
    document.getElementById('modal-editor').style.display = 'flex';

    this.renderStudioThumbnails();
    this.renderViewerCanvas();
  }

  renderStudioThumbnails() {
    const strip = document.getElementById('studio-page-strip');
    strip.innerHTML = '';

    for (let p = 1; p <= this.viewerTotalPages; p++) {
      const card = document.createElement('div');
      card.className = `page-thumb-card ${p === this.viewerCurrentPage ? 'active' : ''}`;

      const canvas = document.createElement('canvas');
      canvas.width = 110;
      canvas.height = 145;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 110, 145);
      ctx.fillStyle = '#64748b';
      ctx.font = "bold 12px 'Inter', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText(`Page ${p}`, 55, 75);

      card.appendChild(canvas);

      const num = document.createElement('span');
      num.className = 'page-badge-num';
      num.textContent = `P.${p}`;
      card.appendChild(num);

      card.addEventListener('click', () => {
        this.viewerCurrentPage = p;
        document.getElementById('viewer-page-info').textContent = `Page ${this.viewerCurrentPage} of ${this.viewerTotalPages}`;
        this.renderStudioThumbnails();
        this.renderViewerCanvas();
      });

      strip.appendChild(card);
    }
  }

  initCanvasDrawing() {
    const drawCanvas = document.getElementById('view-draw-canvas');

    drawCanvas.addEventListener('mousedown', (e) => {
      if (this.currentTool === 'view') return;
      const rect = drawCanvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / this.viewerZoom;
      const y = (e.clientY - rect.top) / this.viewerZoom;

      if (this.currentTool === 'text') {
        const text = prompt('Enter text note:', 'Sample Note');
        if (text && text.trim()) {
          this.getPageAnnotations().push({
            tool: 'text',
            text: text.trim(),
            x,
            y,
            color: this.currentColor,
            size: 16
          });
          this.redrawDrawCanvas();
        }
        return;
      }

      if (this.currentTool === 'shape') {
        this.getPageAnnotations().push({
          tool: 'shape',
          x,
          y,
          width: 130,
          height: 70,
          color: this.currentColor
        });
        this.redrawDrawCanvas();
        return;
      }

      this.isDrawing = true;
      this.currentPath = {
        tool: this.currentTool,
        color: this.currentColor,
        size: this.currentStrokeSize,
        points: [{ x, y }]
      };
    });

    drawCanvas.addEventListener('mousemove', (e) => {
      if (!this.isDrawing || !this.currentPath) return;
      const rect = drawCanvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / this.viewerZoom;
      const y = (e.clientY - rect.top) / this.viewerZoom;
      this.currentPath.points.push({ x, y });
      this.redrawDrawCanvas();
    });

    drawCanvas.addEventListener('mouseup', () => {
      if (this.isDrawing && this.currentPath) {
        this.isDrawing = false;
        this.getPageAnnotations().push(this.currentPath);
        this.currentPath = null;
        this.redrawDrawCanvas();
      }
    });

    drawCanvas.addEventListener('mouseleave', () => {
      if (this.isDrawing && this.currentPath) {
        this.isDrawing = false;
        this.getPageAnnotations().push(this.currentPath);
        this.currentPath = null;
        this.redrawDrawCanvas();
      }
    });
  }

  getPageAnnotations() {
    if (!this.pageAnnotations.has(this.viewerCurrentPage)) {
      this.pageAnnotations.set(this.viewerCurrentPage, []);
    }
    return this.pageAnnotations.get(this.viewerCurrentPage);
  }

  redrawDrawCanvas() {
    const canvas = document.getElementById('view-draw-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(this.viewerZoom, this.viewerZoom);

    const items = [...this.getPageAnnotations()];
    if (this.currentPath) items.push(this.currentPath);

    items.forEach(item => {
      if (item.points && item.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(item.points[0].x, item.points[0].y);
        for (let i = 1; i < item.points.length; i++) {
          ctx.lineTo(item.points[i].x, item.points[i].y);
        }
        if (item.tool === 'highlight') {
          ctx.strokeStyle = item.color || '#facc15';
          ctx.lineWidth = (item.size || 6) * 3;
          ctx.globalAlpha = 0.35;
        } else {
          ctx.strokeStyle = item.color || '#ef4444';
          ctx.lineWidth = item.size || 4;
          ctx.globalAlpha = 1.0;
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      } else if (item.tool === 'text') {
        ctx.save();
        ctx.font = `bold ${item.size || 16}px 'Inter', sans-serif`;
        ctx.fillStyle = item.color || '#ef4444';
        ctx.fillText(item.text, item.x, item.y);
        ctx.restore();
      } else if (item.tool === 'signature') {
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, 20);
        ctx.bezierCurveTo(20, -10, 40, 40, 70, 5);
        ctx.bezierCurveTo(90, -20, 110, 30, 140, 10);
        ctx.stroke();
        ctx.font = "italic 14px 'Inter', sans-serif";
        ctx.fillStyle = "#1e40af";
        ctx.fillText("Digitally Signed", 10, 38);
        ctx.restore();
      } else if (item.tool === 'stamp') {
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.rotate(-15 * Math.PI / 180);
        ctx.strokeStyle = item.color || '#10b981';
        ctx.fillStyle = item.color || '#10b981';
        ctx.lineWidth = 3;
        ctx.strokeRect(-65, -22, 130, 44);
        ctx.font = "bold 14px 'Inter', sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.stamp || 'APPROVED', 0, 0);
        ctx.restore();
      } else if (item.tool === 'watermark') {
        ctx.save();
        ctx.translate(canvas.width / (2 * this.viewerZoom), canvas.height / (2 * this.viewerZoom));
        ctx.rotate(-45 * Math.PI / 180);
        ctx.font = "bold 58px 'Inter', sans-serif";
        ctx.fillStyle = "rgba(100, 116, 139, 0.22)";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.text || 'CONFIDENTIAL', 0, 0);
        ctx.restore();
      } else if (item.tool === 'shape') {
        ctx.save();
        ctx.strokeStyle = item.color || '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(item.x, item.y, item.width, item.height);
        ctx.restore();
      }
    });

    ctx.restore();
  }

  renderViewerCanvas() {
    const baseCanvas = document.getElementById('view-base-canvas');
    const drawCanvas = document.getElementById('view-draw-canvas');
    const ctx = baseCanvas.getContext('2d');

    const baseW = 700;
    const baseH = 950;
    const w = baseW * this.viewerZoom;
    const h = baseH * this.viewerZoom;

    baseCanvas.width = w;
    baseCanvas.height = h;
    drawCanvas.width = w;
    drawCanvas.height = h;

    ctx.save();
    ctx.scale(this.viewerZoom, this.viewerZoom);

    // Rotation
    ctx.translate(baseW / 2, baseH / 2);
    ctx.rotate(this.viewerRotation * Math.PI / 180);
    ctx.translate(-baseW / 2, -baseH / 2);

    // Paper sheet
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, baseW, baseH);

    // Document header
    ctx.fillStyle = '#0f172a';
    ctx.font = "bold 22px 'Inter', sans-serif";
    ctx.fillText(`${this.currentViewerFile.filename}`, 45, 60);

    ctx.fillStyle = '#64748b';
    ctx.font = "12px 'Inter', sans-serif";
    ctx.fillText(`Page ${this.viewerCurrentPage} of ${this.viewerTotalPages} • Size: ${this.currentViewerFile.sizeFormatted}`, 45, 84);

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(45, 100);
    ctx.lineTo(baseW - 45, 100);
    ctx.stroke();

    // Body content simulation
    ctx.fillStyle = '#334155';
    ctx.font = "14px 'Inter', sans-serif";
    for (let i = 1; i <= 17; i++) {
      ctx.fillText(`Section ${i}: Document content extracted from source file for view/edit.`, 45, 115 + (i * 38));
    }

    ctx.restore();
    this.redrawDrawCanvas();
  }

  rotatePage(deg) {
    this.viewerRotation = (this.viewerRotation + deg + 360) % 360;
    this.renderViewerCanvas();
    this.showToast(`Rotated page ${this.viewerRotation}°`);
  }

  changePage(delta) {
    const next = this.viewerCurrentPage + delta;
    if (next >= 1 && next <= this.viewerTotalPages) {
      this.viewerCurrentPage = next;
      document.getElementById('viewer-page-info').textContent = `Page ${this.viewerCurrentPage} of ${this.viewerTotalPages}`;
      this.renderStudioThumbnails();
      this.renderViewerCanvas();
    }
  }

  addBlankPage() {
    this.viewerTotalPages++;
    this.viewerCurrentPage = this.viewerTotalPages;
    document.getElementById('viewer-page-info').textContent = `Page ${this.viewerCurrentPage} of ${this.viewerTotalPages}`;
    this.renderStudioThumbnails();
    this.renderViewerCanvas();
    this.showToast('Blank page appended');
  }

  deleteCurrentPage() {
    if (this.viewerTotalPages <= 1) {
      this.showToast('Cannot delete single remaining page');
      return;
    }
    this.viewerTotalPages--;
    if (this.viewerCurrentPage > this.viewerTotalPages) {
      this.viewerCurrentPage = this.viewerTotalPages;
    }
    this.pageAnnotations.delete(this.viewerCurrentPage);
    document.getElementById('viewer-page-info').textContent = `Page ${this.viewerCurrentPage} of ${this.viewerTotalPages}`;
    this.renderStudioThumbnails();
    this.renderViewerCanvas();
    this.showToast('Page deleted');
  }

  zoom(delta) {
    this.viewerZoom = Math.max(0.5, Math.min(2.2, this.viewerZoom + delta));
    document.getElementById('zoom-text').textContent = `${Math.round(this.viewerZoom * 100)}%`;
    this.renderViewerCanvas();
  }

  toggleNightReading() {
    this.isInverted = !this.isInverted;
    document.getElementById('canvas-wrapper').classList.toggle('inverted', this.isInverted);
    this.showToast(this.isInverted ? 'Night reading invert ON' : 'Night reading invert OFF');
  }

  undoDraw() {
    const list = this.getPageAnnotations();
    if (list.length) {
      list.pop();
      this.redrawDrawCanvas();
    }
  }

  clearDraw() {
    this.pageAnnotations.set(this.viewerCurrentPage, []);
    this.redrawDrawCanvas();
    this.showToast('Cleared page annotations');
  }

  insertSignature() {
    this.getPageAnnotations().push({
      tool: 'signature',
      x: 250,
      y: 400
    });
    this.redrawDrawCanvas();
    this.showToast('Digital signature placed');
  }

  insertStamp() {
    const stampText = prompt('Choose stamp (APPROVED, CONFIDENTIAL, DRAFT, OFFICIAL):', 'APPROVED') || 'APPROVED';
    let color = '#10b981';
    if (stampText.toUpperCase() === 'CONFIDENTIAL') color = '#ef4444';
    else if (stampText.toUpperCase() === 'DRAFT') color = '#f59e0b';
    else if (stampText.toUpperCase() === 'OFFICIAL') color = '#3b82f6';

    this.getPageAnnotations().push({
      tool: 'stamp',
      stamp: stampText.toUpperCase(),
      color,
      x: 350,
      y: 260
    });
    this.redrawDrawCanvas();
    this.showToast(`Stamp ${stampText} added`);
  }

  applyWatermark() {
    const text = prompt('Enter watermark text:', 'CONFIDENTIAL') || 'CONFIDENTIAL';
    this.getPageAnnotations().push({
      tool: 'watermark',
      text: text.toUpperCase()
    });
    this.redrawDrawCanvas();
    this.showToast('Watermark applied');
  }

  async saveViewerPDF() {
    const baseCanvas = document.getElementById('view-base-canvas');
    const drawCanvas = document.getElementById('view-draw-canvas');

    const merged = document.createElement('canvas');
    merged.width = baseCanvas.width;
    merged.height = baseCanvas.height;
    const ctx = merged.getContext('2d');
    ctx.drawImage(baseCanvas, 0, 0);
    ctx.drawImage(drawCanvas, 0, 0);

    const dataUrl = merged.toDataURL('image/jpeg', 0.95);
    this.showToast('Exporting high-resolution PDF deliverable...');

    try {
      const filename = `Edited_${this.currentViewerFile ? this.currentViewerFile.filename : 'Document.pdf'}`;
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          data: dataUrl,
          mimeType: 'image/jpeg'
        })
      });

      const data = await res.json();
      if (data.success) {
        this.showToast('Saved to workspace!');
        this.closeModals();
        window.location.href = data.file.downloadUrl;
      }
    } catch (e) {
      this.showToast('Save failed');
    }
  }

  // =========================================================================
  // Utilities
  // =========================================================================

  closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
  }

  resetView() {
    this.closeModals();
  }

  showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => toast.classList.remove('show'), 2800);
  }
}

// Start App
document.addEventListener('DOMContentLoaded', () => {
  window.app = new OmniConvertApp();
});
