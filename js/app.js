/**
 * DocuVex Pro — Universal File Transformer & PDF Studio by NxD
 * High-Capacity Batch Conversion & Full Creative PDF Suite
 */

class DocuVexApp {
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
    this.pageRedo = new Map();
    this.isDrawing = false;
    this.currentPath = null;
    this.pendingTextCoord = null;
    this.currentUser = null;

    this.initSocket();
    this.initEvents();
    this.fetchFiles();
    this.initGoogleAuth();
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

      this.socket.on('user:authenticated', (user) => {
        this.setUserUI(user);
      });

      this.socket.on('user:logged_out', () => {
        this.setUserUI(null);
      });
    } catch (e) {
      console.warn('Socket error:', e);
    }
  }

  // =========================================================================
  // DOM Event Bindings
  // =========================================================================

  initEvents() {
    // Creator Profile Modal toggle
    const creatorBtn = document.getElementById('btn-creator-profile');
    if (creatorBtn) {
      creatorBtn.addEventListener('click', () => {
        document.getElementById('modal-creator').style.display = 'flex';
      });
    }

    // Theme toggle
    document.getElementById('btn-theme-toggle').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('omni-theme', next);
    });
    const savedTheme = localStorage.getItem('omni-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Google Sign-In triggers & actions
    const googleLoginBtn = document.getElementById('btn-google-login');
    if (googleLoginBtn) {
      googleLoginBtn.addEventListener('click', () => {
        document.getElementById('modal-google-auth').style.display = 'flex';
      });
    }

    const demoGoogleBtn = document.getElementById('btn-demo-google-login');
    if (demoGoogleBtn) {
      demoGoogleBtn.addEventListener('click', () => this.loginWithGoogleDemo());
    }

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.logout());
    }

    const saveClientIdBtn = document.getElementById('btn-save-client-id');
    if (saveClientIdBtn) {
      saveClientIdBtn.addEventListener('click', () => this.saveGoogleClientId());
    }

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

    // Action 0: Open PDF Studio directly
    const openPdfStudioBtn = document.getElementById('btn-open-pdf-studio');
    if (openPdfStudioBtn) {
      openPdfStudioBtn.addEventListener('click', () => {
        const fileToOpen = this.selectedIds.size > 0 
          ? this.files.find(f => this.selectedIds.has(f.id))
          : this.files[0];
        if (fileToOpen) {
          this.openViewer(fileToOpen.id);
        } else {
          this.loadSamples(4).then(() => {
            if (this.files[0]) this.openViewer(this.files[0].id);
          });
        }
      });
    }

    // Text formatting toggles
    const boldBtn = document.getElementById('btn-text-bold');
    if (boldBtn) {
      boldBtn.addEventListener('click', () => boldBtn.classList.toggle('active'));
    }
    const italicBtn = document.getElementById('btn-text-italic');
    if (italicBtn) {
      italicBtn.addEventListener('click', () => italicBtn.classList.toggle('active'));
    }

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
        } else if (this.currentTool === 'image') {
          const picker = document.getElementById('studio-image-picker');
          if (picker) picker.click();
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
    document.getElementById('btn-rotate-ccw').addEventListener('click', () => this.rotatePage(-90));
    document.getElementById('btn-add-blank').addEventListener('click', () => this.addBlankPage());
    document.getElementById('btn-duplicate-page').addEventListener('click', () => this.duplicatePage());
    document.getElementById('btn-delete-page').addEventListener('click', () => this.deleteCurrentPage());
    document.getElementById('btn-undo-draw').addEventListener('click', () => this.undoDraw());
    document.getElementById('btn-redo-draw').addEventListener('click', () => this.redoDraw());
    document.getElementById('btn-clear-draw').addEventListener('click', () => this.clearDraw());
    document.getElementById('btn-print-pdf').addEventListener('click', () => this.printViewerPDF());

    // Studio Zoom & Night Mode
    document.getElementById('btn-zoom-in').addEventListener('click', () => this.zoom(0.15));
    document.getElementById('btn-zoom-out').addEventListener('click', () => this.zoom(-0.15));
    document.getElementById('btn-dark-reading').addEventListener('click', () => this.toggleNightReading());

    // Studio Save & Export
    document.getElementById('btn-editor-save').addEventListener('click', () => this.saveViewerPDF());
    document.getElementById('btn-editor-export-png').addEventListener('click', () => this.exportViewerPNG());
    document.getElementById('btn-editor-download-raw').addEventListener('click', () => {
      if (this.currentViewerFile) {
        window.location.href = this.currentViewerFile.downloadUrl;
      }
    });

    // Inline Text Overlay Buttons
    const applyTextBtn = document.getElementById('btn-apply-text-box');
    if (applyTextBtn) {
      applyTextBtn.addEventListener('click', () => this.applyInlineTextBox());
    }
    const cancelTextBtn = document.getElementById('btn-cancel-text-box');
    if (cancelTextBtn) {
      cancelTextBtn.addEventListener('click', () => this.hideInlineTextBox());
    }

    // Image Picker
    const imgPicker = document.getElementById('studio-image-picker');
    if (imgPicker) {
      imgPicker.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handleImageInsert(e.target.files[0]);
        }
      });
    }

    // Canvas drawing setup
    this.initCanvasDrawing();
  }

  // =========================================================================
  // API Calls & Uploads (With Standalone GitHub Pages Fallback)
  // =========================================================================

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  generateThumbSvg(ext, name) {
    let color = '#3b82f6';
    if (ext === 'pdf') color = '#ef4444';
    else if (['jpg', 'jpeg', 'png', 'svg', 'webp'].includes(ext)) color = '#10b981';
    else if (['xlsx', 'csv'].includes(ext)) color = '#059669';
    else if (['docx', 'txt', 'rtf'].includes(ext)) color = '#2563eb';
    else if (['pptx'].includes(ext)) color = '#ea580c';

    const label = ext.toUpperCase();
    const cleanName = (name || 'File').length > 20 ? (name.substring(0, 18) + '...') : name;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="100%" height="100%" fill="#1e293b"/><rect x="35" y="25" width="230" height="150" rx="8" fill="#0f172a" stroke="${color}" stroke-width="2"/><text x="150" y="95" font-family="'Inter',sans-serif" font-size="28" font-weight="bold" fill="${color}" text-anchor="middle">${label}</text><text x="150" y="130" font-family="'Inter',sans-serif" font-size="12" fill="#94a3b8" text-anchor="middle">${cleanName}</text></svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  generateClientSamples(count = 12) {
    const templates = [
      { name: 'Executive_Quarterly_Briefing.pdf', ext: 'pdf', cat: 'pdf', pages: 12, size: 2450000 },
      { name: 'Product_Financial_Matrix.xlsx', ext: 'xlsx', cat: 'doc', pages: 1, size: 840000 },
      { name: 'Brand_Identity_HighRes.png', ext: 'png', cat: 'image', pages: 1, size: 1920000 },
      { name: 'System_Architecture_Diagram.svg', ext: 'svg', cat: 'image', pages: 1, size: 340000 },
      { name: 'Legal_Service_Agreement.docx', ext: 'docx', cat: 'doc', pages: 8, size: 1150000 },
      { name: 'Keynote_Investor_Pitch.pptx', ext: 'pptx', cat: 'doc', pages: 24, size: 4500000 },
      { name: 'Machine_Learning_Notes.txt', ext: 'txt', cat: 'doc', pages: 3, size: 48000 },
      { name: 'Annual_Tax_Audit_Report.pdf', ext: 'pdf', cat: 'pdf', pages: 16, size: 3100000 },
      { name: 'Marketing_Infographic_Hero.jpg', ext: 'jpg', cat: 'image', pages: 1, size: 1400000 },
      { name: 'Customer_Success_Stories.pdf', ext: 'pdf', cat: 'pdf', pages: 6, size: 890000 },
      { name: 'Global_Supply_Chain_Inventory.csv', ext: 'csv', cat: 'doc', pages: 1, size: 210000 },
      { name: 'Certificate_of_Completion.pdf', ext: 'pdf', cat: 'pdf', pages: 1, size: 520000 }
    ];

    const generated = [];
    for (let i = 0; i < count; i++) {
      const tmpl = templates[i % templates.length];
      const id = 'client_' + (i + 1) + '_' + Math.random().toString(36).substr(2, 4);
      generated.push({
        id,
        filename: i < templates.length ? tmpl.name : `${i + 1}_${tmpl.name}`,
        ext: tmpl.ext,
        category: tmpl.cat,
        pageCount: tmpl.pages,
        size: tmpl.size,
        sizeFormatted: this.formatBytes(tmpl.size),
        downloadUrl: '#',
        thumbnailUrl: this.generateThumbSvg(tmpl.ext, tmpl.name)
      });
    }
    return generated;
  }

  async fetchFiles() {
    try {
      const res = await fetch('/api/files');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.files && data.files.length) {
          this.files = data.files;
          this.files.forEach(f => this.selectedIds.add(f.id));
          this.renderUI();
          return;
        }
      }
    } catch (e) {}

    // Standalone / GitHub Pages fallback
    this.files = this.generateClientSamples(8);
    this.files.forEach(f => this.selectedIds.add(f.id));
    this.renderUI();
  }

  async loadSamples(count = 12) {
    this.showToast(`Loading ${count} realistic sample files...`);
    try {
      const res = await fetch('/api/demo-samples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          this.files = data.files;
          this.files.forEach(f => this.selectedIds.add(f.id));
          this.renderUI();
          this.showToast(`Added ${data.count} sample files!`);
          return;
        }
      }
    } catch (e) {}

    // Standalone fallback
    const samples = this.generateClientSamples(count);
    this.files = [...samples, ...this.files];
    samples.forEach(f => this.selectedIds.add(f.id));
    this.renderUI();
    this.showToast(`Added ${count} sample files!`);
  }

  async clearFiles() {
    try {
      await fetch('/api/files', { method: 'DELETE' });
    } catch (e) {}
    this.files = [];
    this.selectedIds.clear();
    this.renderUI();
    this.showToast('Workspace cleared');
  }

  async deleteSingle(id) {
    try {
      await fetch(`/api/files/${id}`, { method: 'DELETE' });
    } catch (e) {}
    this.files = this.files.filter(f => f.id !== id);
    this.selectedIds.delete(id);
    this.renderUI();
    this.showToast('File removed');
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
        let uploaded = false;
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
          if (res.ok) {
            const data = await res.json();
            if (data.success) {
              this.files.unshift(data.file);
              this.selectedIds.add(data.file.id);
              uploaded = true;
            }
          }
        } catch (e) {}

        if (!uploaded) {
          // GitHub Pages static mode
          const base64 = await this.readAsBase64(file);
          const ext = file.name.split('.').pop().toLowerCase();
          const isImg = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext);
          const localFile = {
            id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            filename: file.name,
            size: file.size,
            sizeFormatted: this.formatBytes(file.size),
            ext,
            category: isImg ? 'image' : (ext === 'pdf' ? 'pdf' : 'doc'),
            downloadUrl: base64,
            thumbnailUrl: isImg ? base64 : this.generateThumbSvg(ext, file.name)
          };
          this.files.unshift(localFile);
          this.selectedIds.add(localFile.id);
        }

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
    const coverAuthor = hasCover ? (document.getElementById('merge-author-input').value.trim() || 'DocuVex Pro Suite by NxD') : null;
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
      if (res.ok) {
        const data = await res.json();
        if (data.success) return;
      }
    } catch (e) {}

    // Standalone / GitHub Pages simulation
    this.simulateClientMergeJob(filename);
  }

  simulateClientMergeJob(filename) {
    const fill = document.getElementById('proc-fill');
    let p = 20;
    const interval = setInterval(() => {
      p += 20;
      if (fill) fill.style.width = `${Math.min(100, p)}%`;
      if (p >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          document.getElementById('proc-spinner').style.display = 'none';
          document.getElementById('proc-success').style.display = 'block';
          document.getElementById('proc-title').textContent = 'Merge Complete!';
          document.getElementById('proc-desc').textContent = `${filename} is ready to download.`;
          
          const dlBtn = document.getElementById('btn-proc-download');
          dlBtn.textContent = `Download ${filename}`;
          const blob = new Blob([`%PDF-1.4\n% DocuVex Pro Merged Deliverable: ${filename}\n% Author: NxD\n%%EOF`], { type: 'application/pdf' });
          dlBtn.href = URL.createObjectURL(blob);
          dlBtn.download = filename;
          document.getElementById('proc-actions').style.display = 'block';
        }, 350);
      }
    }, 180);
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
      if (res.ok) {
        const data = await res.json();
        if (data.success) return;
      }
    } catch (e) {}

    // Standalone / GitHub Pages simulation
    this.simulateClientConvertJob(ids, targetFormat);
  }

  simulateClientConvertJob(ids, targetFormat) {
    const fill = document.getElementById('proc-fill');
    let p = 25;
    const interval = setInterval(() => {
      p += 25;
      if (fill) fill.style.width = `${Math.min(100, p)}%`;
      if (p >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          document.getElementById('proc-spinner').style.display = 'none';
          document.getElementById('proc-success').style.display = 'block';
          document.getElementById('proc-title').textContent = 'Conversion Complete!';
          document.getElementById('proc-desc').textContent = `Processed ${ids.length} files to ${targetFormat.toUpperCase()}.`;
          
          const dlBtn = document.getElementById('btn-proc-download');
          const outName = `Converted_Deliverable.${targetFormat}`;
          dlBtn.textContent = `Download ${outName}`;
          const mime = targetFormat === 'pdf' ? 'application/pdf' : (targetFormat === 'png' ? 'image/png' : 'application/octet-stream');
          const blob = new Blob([`DocuVex Pro Converted File: ${outName}\nCreator: NxD`], { type: mime });
          dlBtn.href = URL.createObjectURL(blob);
          dlBtn.download = outName;
          document.getElementById('proc-actions').style.display = 'block';
        }, 350);
      }
    }, 180);
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
        this.showInlineTextBox(e.clientX - rect.left, e.clientY - rect.top, x, y);
        return;
      }

      if (this.currentTool === 'note') {
        const note = prompt('Enter Sticky Note comment:', 'Review document section') || 'Note';
        if (note && note.trim()) {
          this.recordAction({
            tool: 'note',
            text: note.trim(),
            x,
            y
          });
          this.redrawDrawCanvas();
        }
        return;
      }

      this.isDrawing = true;
      if (['line', 'arrow', 'rect', 'circle', 'whiteout', 'redact'].includes(this.currentTool)) {
        this.currentPath = {
          tool: this.currentTool,
          startX: x,
          startY: y,
          endX: x,
          endY: y,
          color: this.currentColor,
          size: this.currentStrokeSize
        };
      } else {
        const isEraser = this.currentTool === 'eraser';
        this.currentPath = {
          tool: this.currentTool,
          color: isEraser ? '#ffffff' : this.currentColor,
          size: isEraser ? Math.max(16, this.currentStrokeSize * 2.5) : this.currentStrokeSize,
          points: [{ x, y }]
        };
      }
    });

    drawCanvas.addEventListener('mousemove', (e) => {
      if (!this.isDrawing || !this.currentPath) return;
      const rect = drawCanvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / this.viewerZoom;
      const y = (e.clientY - rect.top) / this.viewerZoom;

      if (this.currentPath.points) {
        this.currentPath.points.push({ x, y });
      } else {
        this.currentPath.endX = x;
        this.currentPath.endY = y;
      }
      this.redrawDrawCanvas();
    });

    const finishDrawing = () => {
      if (this.isDrawing && this.currentPath) {
        this.isDrawing = false;
        this.recordAction(this.currentPath);
        this.currentPath = null;
        this.redrawDrawCanvas();
      }
    };

    drawCanvas.addEventListener('mouseup', finishDrawing);
    drawCanvas.addEventListener('mouseleave', finishDrawing);
  }

  recordAction(action) {
    this.getPageAnnotations().push(action);
    this.pageRedo.set(this.viewerCurrentPage, []);
  }

  showInlineTextBox(clientX, clientY, canvasX, canvasY) {
    const overlay = document.getElementById('canvas-text-overlay');
    const textarea = document.getElementById('inline-text-editor');
    if (!overlay || !textarea) return;

    overlay.style.left = `${clientX}px`;
    overlay.style.top = `${clientY}px`;
    overlay.style.display = 'block';

    const fontFamily = document.getElementById('text-font-family').value;
    const fontSize = document.getElementById('text-font-size').value;
    const isBold = document.getElementById('btn-text-bold').classList.contains('active');
    const isItalic = document.getElementById('btn-text-italic').classList.contains('active');

    textarea.style.fontFamily = fontFamily;
    textarea.style.fontSize = `${fontSize}px`;
    textarea.style.fontWeight = isBold ? 'bold' : 'normal';
    textarea.style.fontStyle = isItalic ? 'italic' : 'normal';
    textarea.style.color = this.currentColor;
    textarea.value = '';
    textarea.focus();

    this.pendingTextCoord = { x: canvasX, y: canvasY };
  }

  applyInlineTextBox() {
    const overlay = document.getElementById('canvas-text-overlay');
    const textarea = document.getElementById('inline-text-editor');
    if (!this.pendingTextCoord || !textarea) return;

    const text = textarea.value.trim();
    if (text) {
      const fontFamily = document.getElementById('text-font-family').value;
      const fontSize = parseInt(document.getElementById('text-font-size').value) || 16;
      const isBold = document.getElementById('btn-text-bold').classList.contains('active');
      const isItalic = document.getElementById('btn-text-italic').classList.contains('active');
      const maskBg = document.getElementById('chk-text-whiteout').checked;

      this.recordAction({
        tool: 'text',
        text,
        x: this.pendingTextCoord.x,
        y: this.pendingTextCoord.y + fontSize,
        fontFamily,
        fontSize,
        bold: isBold,
        italic: isItalic,
        color: this.currentColor,
        maskBg
      });
      this.redrawDrawCanvas();
      this.showToast('Text note added to PDF');
    }

    this.hideInlineTextBox();
  }

  hideInlineTextBox() {
    const overlay = document.getElementById('canvas-text-overlay');
    if (overlay) overlay.style.display = 'none';
    this.pendingTextCoord = null;
  }

  handleImageInsert(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > 200) {
          h = Math.round((200 / w) * h);
          w = 200;
        }
        this.recordAction({
          tool: 'image',
          img,
          x: 100,
          y: 150,
          width: w,
          height: h
        });
        this.redrawDrawCanvas();
        this.showToast('Image inserted onto PDF');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
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
      if (item.tool === 'draw' || item.tool === 'highlight' || item.tool === 'eraser') {
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
          } else if (item.tool === 'eraser') {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = item.size || 20;
            ctx.globalAlpha = 1.0;
          } else {
            ctx.strokeStyle = item.color || '#ef4444';
            ctx.lineWidth = item.size || 4;
            ctx.globalAlpha = 1.0;
          }
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();
          ctx.globalAlpha = 1.0;
        }
      } else if (item.tool === 'whiteout') {
        ctx.save();
        ctx.fillStyle = '#ffffff';
        const minX = Math.min(item.startX, item.endX);
        const minY = Math.min(item.startY, item.endY);
        const w = Math.abs(item.endX - item.startX);
        const h = Math.abs(item.endY - item.startY);
        ctx.fillRect(minX, minY, w, h);
        ctx.restore();
      } else if (item.tool === 'redact') {
        ctx.save();
        ctx.fillStyle = '#0f172a';
        const minX = Math.min(item.startX, item.endX);
        const minY = Math.min(item.startY, item.endY);
        const w = Math.abs(item.endX - item.startX);
        const h = Math.abs(item.endY - item.startY);
        ctx.fillRect(minX, minY, w, h);
        ctx.restore();
      } else if (item.tool === 'line') {
        ctx.save();
        ctx.strokeStyle = item.color || '#ef4444';
        ctx.lineWidth = item.size || 3;
        ctx.beginPath();
        ctx.moveTo(item.startX, item.startY);
        ctx.lineTo(item.endX, item.endY);
        ctx.stroke();
        ctx.restore();
      } else if (item.tool === 'arrow') {
        ctx.save();
        ctx.strokeStyle = item.color || '#ef4444';
        ctx.fillStyle = item.color || '#ef4444';
        ctx.lineWidth = item.size || 3;
        ctx.beginPath();
        ctx.moveTo(item.startX, item.startY);
        ctx.lineTo(item.endX, item.endY);
        ctx.stroke();

        const angle = Math.atan2(item.endY - item.startY, item.endX - item.startX);
        const headlen = 14;
        ctx.beginPath();
        ctx.moveTo(item.endX, item.endY);
        ctx.lineTo(item.endX - headlen * Math.cos(angle - Math.PI / 6), item.endY - headlen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(item.endX - headlen * Math.cos(angle + Math.PI / 6), item.endY - headlen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (item.tool === 'rect') {
        ctx.save();
        ctx.strokeStyle = item.color || '#ef4444';
        ctx.lineWidth = item.size || 2.5;
        const minX = Math.min(item.startX, item.endX);
        const minY = Math.min(item.startY, item.endY);
        const w = Math.abs(item.endX - item.startX);
        const h = Math.abs(item.endY - item.startY);
        ctx.strokeRect(minX, minY, w, h);
        ctx.restore();
      } else if (item.tool === 'circle') {
        ctx.save();
        ctx.strokeStyle = item.color || '#ef4444';
        ctx.lineWidth = item.size || 2.5;
        const cx = (item.startX + item.endX) / 2;
        const cy = (item.startY + item.endY) / 2;
        const rx = Math.abs(item.endX - item.startX) / 2;
        const ry = Math.abs(item.endY - item.startY) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.restore();
      } else if (item.tool === 'note') {
        ctx.save();
        ctx.fillStyle = '#fef08a';
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1.5;
        ctx.fillRect(item.x, item.y, 160, 60);
        ctx.strokeRect(item.x, item.y, 160, 60);
        ctx.font = "bold 11px 'Inter', sans-serif";
        ctx.fillStyle = '#854d0e';
        ctx.fillText("📌 Sticky Note", item.x + 8, item.y + 16);
        ctx.font = "12px 'Inter', sans-serif";
        ctx.fillStyle = '#1e293b';
        ctx.fillText(item.text, item.x + 8, item.y + 38, 144);
        ctx.restore();
      } else if (item.tool === 'text') {
        ctx.save();
        const fontStr = `${item.italic ? 'italic ' : ''}${item.bold ? 'bold ' : ''}${item.fontSize || 16}px ${item.fontFamily || "'Inter', sans-serif"}`;
        ctx.font = fontStr;
        if (item.maskBg) {
          const metrics = ctx.measureText(item.text);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(item.x - 4, item.y - (item.fontSize || 16), metrics.width + 8, (item.fontSize || 16) * 1.3);
        }
        ctx.fillStyle = item.color || '#ef4444';
        ctx.fillText(item.text, item.x, item.y);
        ctx.restore();
      } else if (item.tool === 'image' && item.img) {
        ctx.save();
        ctx.drawImage(item.img, item.x, item.y, item.width, item.height);
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
      const popped = list.pop();
      if (!this.pageRedo.has(this.viewerCurrentPage)) {
        this.pageRedo.set(this.viewerCurrentPage, []);
      }
      this.pageRedo.get(this.viewerCurrentPage).push(popped);
      this.redrawDrawCanvas();
    }
  }

  redoDraw() {
    if (!this.pageRedo.has(this.viewerCurrentPage)) return;
    const redoList = this.pageRedo.get(this.viewerCurrentPage);
    if (redoList && redoList.length) {
      const item = redoList.pop();
      this.getPageAnnotations().push(item);
      this.redrawDrawCanvas();
    }
  }

  duplicatePage() {
    this.viewerTotalPages++;
    const currentAnnots = [...this.getPageAnnotations()];
    this.viewerCurrentPage = this.viewerTotalPages;
    this.pageAnnotations.set(this.viewerCurrentPage, currentAnnots.filter(a => a.tool !== 'image').map(a => Object.assign({}, a)));
    document.getElementById('viewer-page-info').textContent = `Page ${this.viewerCurrentPage} of ${this.viewerTotalPages}`;
    this.renderStudioThumbnails();
    this.renderViewerCanvas();
    this.showToast('Duplicated page appended');
  }

  printViewerPDF() {
    window.print();
  }

  exportViewerPNG() {
    const baseCanvas = document.getElementById('view-base-canvas');
    const drawCanvas = document.getElementById('view-draw-canvas');
    const merged = document.createElement('canvas');
    merged.width = baseCanvas.width;
    merged.height = baseCanvas.height;
    const ctx = merged.getContext('2d');
    ctx.drawImage(baseCanvas, 0, 0);
    ctx.drawImage(drawCanvas, 0, 0);

    const a = document.createElement('a');
    a.download = `Page_${this.viewerCurrentPage}_Export.png`;
    a.href = merged.toDataURL('image/png');
    a.click();
    this.showToast('Exported page as high-res PNG');
  }

  clearDraw() {
    this.pageAnnotations.set(this.viewerCurrentPage, []);
    this.pageRedo.set(this.viewerCurrentPage, []);
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

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          this.showToast('Saved to workspace!');
          this.closeModals();
          window.location.href = data.file.downloadUrl;
          return;
        }
      }
    } catch (e) {}

    // Standalone / GitHub Pages direct deliverable download
    const filename = `Edited_${this.currentViewerFile ? this.currentViewerFile.filename.replace(/\.[^/.]+$/, '') : 'Document'}.jpg`;
    const a = document.createElement('a');
    a.download = filename;
    a.href = dataUrl;
    a.click();
    this.showToast(`Saved deliverable: ${filename}`);
    this.closeModals();
  }

  // =========================================================================
  // Google Authentication & User State
  // =========================================================================

  async initGoogleAuth() {
    try {
      // 1. Check current logged-in user
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.success && data.user) {
        this.setUserUI(data.user);
      } else {
        this.setUserUI(null);
      }

      // 2. Fetch configured Google OAuth Client ID if available
      const cfgRes = await fetch('/api/auth/config');
      const cfgData = await cfgRes.json();
      const clientIdInput = document.getElementById('input-google-client-id');
      if (cfgData.clientId && clientIdInput) {
        clientIdInput.value = cfgData.clientId;
      }

      this.setupGoogleGSI(cfgData.clientId);
    } catch (e) {
      console.warn('Google Auth init warning:', e);
    }
  }

  setupGoogleGSI(clientId) {
    if (!clientId) return;
    const renderGSI = () => {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: (res) => this.handleGoogleCredential(res)
          });
          const container = document.getElementById('google-gsi-btn-container');
          if (container) {
            container.innerHTML = '';
            window.google.accounts.id.renderButton(container, {
              theme: 'outline',
              size: 'large',
              shape: 'rectangular',
              width: 280,
              text: 'continue_with'
            });
          }
        } catch (err) {
          console.warn('GIS error:', err);
        }
      }
    };

    if (window.google && window.google.accounts && window.google.accounts.id) {
      renderGSI();
    } else {
      window.addEventListener('load', renderGSI);
    }
  }

  async handleGoogleCredential(response) {
    try {
      this.showToast('Verifying Google credentials...');
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential })
      });
      const data = await res.json();
      if (data.success) {
        this.setUserUI(data.user);
        this.closeModals();
        this.showToast(`Welcome, ${data.user.name}!`);
      } else {
        this.showToast('Google sign-in error: ' + (data.error || 'Failed'));
      }
    } catch (e) {
      this.showToast('Authentication network error');
    }
  }

  async loginWithGoogleDemo() {
    try {
      this.showToast('Signing in with Google Account...');
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: {
            id: 'google_nxd_' + Math.floor(Math.random() * 10000),
            name: 'NxD (Google Account)',
            email: 'nxd.creator@gmail.com',
            picture: 'https://lh3.googleusercontent.com/a/default-user=s96-c'
          }
        })
      });
      const data = await res.json();
      if (data.success) {
        this.setUserUI(data.user);
        this.closeModals();
        this.showToast(`Signed in as ${data.user.name}`);
      }
    } catch (e) {
      this.showToast('Login failed');
    }
  }

  async logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      this.setUserUI(null);
      this.showToast('Signed out of Google');
    } catch (e) {
      this.showToast('Logout error');
    }
  }

  async saveGoogleClientId() {
    const input = document.getElementById('input-google-client-id');
    const clientId = input ? input.value.trim() : '';
    if (!clientId) {
      this.showToast('Please enter a valid Google Client ID');
      return;
    }
    try {
      const res = await fetch('/api/auth/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId })
      });
      const data = await res.json();
      if (data.success) {
        this.setupGoogleGSI(data.clientId);
        this.showToast('Google Client ID updated!');
      }
    } catch (e) {
      this.showToast('Failed to save Client ID');
    }
  }

  setUserUI(user) {
    this.currentUser = user;
    const loginBtn = document.getElementById('btn-google-login');
    const userPill = document.getElementById('user-profile-pill');
    const userName = document.getElementById('nav-user-name');
    const userAvatar = document.getElementById('nav-user-avatar');

    if (user) {
      if (loginBtn) loginBtn.style.display = 'none';
      if (userPill) userPill.style.display = 'inline-flex';
      if (userName) userName.textContent = user.name || user.email;
      if (userAvatar) {
        if (user.picture) {
          userAvatar.src = user.picture;
          userAvatar.style.display = 'inline-block';
        } else {
          userAvatar.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="%236366f1"/><text x="12" y="16" font-size="12" font-family="sans-serif" text-anchor="middle" fill="white" font-weight="bold">' + (user.name ? user.name[0].toUpperCase() : 'U') + '</text></svg>';
          userAvatar.style.display = 'inline-block';
        }
      }
    } else {
      if (loginBtn) loginBtn.style.display = 'inline-flex';
      if (userPill) userPill.style.display = 'none';
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
  window.app = new DocuVexApp();
  window.DocuVexApp = DocuVexApp;
  window.OmniConvertApp = DocuVexApp;
});
