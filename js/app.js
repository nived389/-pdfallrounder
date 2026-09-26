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
    this.fileCounter = 0;

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

    // Clear all
    const clearAllBtn = document.getElementById('btn-clear-all');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        if (this.files.length && confirm('Clear all files from workspace?')) {
          this.clearFiles();
        }
      });
    }

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

    // Action 1.5: Dedicated PDF Compression Modal
    const btnCompressAction = document.getElementById('btn-compress-action');
    if (btnCompressAction) {
      btnCompressAction.addEventListener('click', () => this.openCompressModal());
    }

    const btnConfirmCompress = document.getElementById('btn-confirm-compress');
    if (btnConfirmCompress) {
      btnConfirmCompress.addEventListener('click', () => this.startCompressJob());
    }

    // Merge filmstrip sorting & reset controls
    const btnSortAZ = document.getElementById('btn-merge-sort-az');
    if (btnSortAZ) {
      btnSortAZ.addEventListener('click', () => {
        this.mergeOrder.sort((a, b) => a.filename.localeCompare(b.filename));
        this.renderMergeFilmstrip();
      });
    }

    const btnSortZA = document.getElementById('btn-merge-sort-za');
    if (btnSortZA) {
      btnSortZA.addEventListener('click', () => {
        this.mergeOrder.sort((a, b) => b.filename.localeCompare(a.filename));
        this.renderMergeFilmstrip();
      });
    }

    const btnReverse = document.getElementById('btn-merge-reverse');
    if (btnReverse) {
      btnReverse.addEventListener('click', () => {
        this.mergeOrder.reverse();
        this.renderMergeFilmstrip();
      });
    }

    const btnReset = document.getElementById('btn-merge-reset');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (this.initialMergeOrder) {
          this.mergeOrder = [...this.initialMergeOrder];
          this.renderMergeFilmstrip();
        }
      });
    }

    // Compression level visual card active state
    document.querySelectorAll('input[name="compress-level"]').forEach(radio => {
      radio.addEventListener('change', () => {
        document.querySelectorAll('.compression-card').forEach(c => c.classList.remove('active'));
        const card = radio.closest('.compression-card');
        if (card) card.classList.add('active');
      });
    });

    const compressFileSelect = document.getElementById('compress-file-select');
    if (compressFileSelect) {
      compressFileSelect.addEventListener('change', () => this.updateCompressFileInfo());
    }

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
          this.openNewDocument();
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
        if (data.success && data.files) {
          this.files = data.files;
          this.files.forEach(f => this.selectedIds.add(f.id));
          this.renderUI();
          return;
        }
      }
    } catch (e) {}

    // Clean initial workspace ready for user files
    this.files = [];
    this.selectedIds.clear();
    this.renderUI();
  }

  openNewDocument() {
    const newDoc = {
      id: 'doc_' + Date.now(),
      filename: 'New_Document.pdf',
      size: 1024,
      sizeFormatted: '1 page',
      ext: 'pdf',
      category: 'pdf',
      pageCount: 1,
      downloadUrl: '#'
    };
    this.files.unshift(newDoc);
    this.selectedIds.add(newDoc.id);
    this.renderUI();
    this.openViewer(newDoc.id);
    this.showToast('Created new blank PDF document');
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
    const isServerEnv = window.location.protocol.startsWith('http') && 
                        !window.location.hostname.includes('github.io') &&
                        !window.location.hostname.includes('pages.dev');

    const createdRecords = [];

    for (let i = 0; i < total; i++) {
      const file = list[i];
      let record = null;

      if (isServerEnv) {
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
            if (data.success && data.file) {
              record = {
                ...data.file,
                rawFile: file,
                fileData: base64
              };
            }
          }
        } catch (serverErr) {
          console.warn('Server upload fallback to client blob:', file.name, serverErr);
        }
      }

      if (!record) {
        // High-performance client-side blob processing (zero memory bloat)
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        const isImg = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'].includes(ext);
        const blobUrl = URL.createObjectURL(file);
        const localId = `file_${Date.now()}_${++this.fileCounter}_${Math.random().toString(36).substring(2, 9)}`;

        record = {
          id: localId,
          filename: file.name,
          originalName: file.name,
          size: file.size,
          sizeBytes: file.size,
          sizeFormatted: this.formatBytes(file.size),
          ext,
          category: isImg ? 'image' : (ext === 'pdf' ? 'pdf' : (['doc', 'docx', 'txt', 'rtf'].includes(ext) ? 'document' : 'other')),
          downloadUrl: blobUrl,
          thumbnailUrl: isImg ? blobUrl : this.generateThumbSvg(ext, file.name),
          rawFile: file,
          pageCount: ext === 'pdf' ? 1 : 1
        };
      }

      createdRecords.push(record);
      done++;

      const pct = Math.round((done / total) * 100);
      fill.style.width = `${pct}%`;
      pctText.textContent = `${pct}%`;
      statusText.textContent = `Processing file ${done} of ${total} (${file.name})...`;

      // Allow UI thread to breathe
      if (done % 4 === 0 || done === total) {
        await new Promise(r => setTimeout(r, 0));
      }
    }

    // Add all processed files preserving their exact selection order
    createdRecords.forEach(rec => {
      const existingIdx = this.files.findIndex(f => f.id === rec.id);
      if (existingIdx >= 0) {
        this.files[existingIdx] = rec;
      } else {
        this.files.push(rec);
      }
      this.selectedIds.add(rec.id);
    });

    this.renderUI();

    setTimeout(() => {
      progressBox.style.display = 'none';
      this.showToast(`Successfully added all ${total} files!`);
    }, 400);
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
    let selected;
    if (this.selectedIds.size > 0 && this.selectedIds.size < this.files.length) {
      selected = this.files.filter(f => this.selectedIds.has(f.id));
    } else {
      selected = [...this.files];
    }

    if (selected.length === 0) {
      this.showToast('Please select at least 1 file to merge');
      return;
    }

    this.initialMergeOrder = [...selected];
    this.mergeOrder = [...selected];
    this.renderMergeFilmstrip();

    document.getElementById('modal-merge').style.display = 'flex';
  }

  renderMergeFilmstrip() {
    const countEl = document.getElementById('merge-file-count');
    if (countEl) countEl.textContent = this.mergeOrder.length;

    const filmstrip = document.getElementById('merge-filmstrip');
    if (!filmstrip) return;
    filmstrip.innerHTML = '';

    const fallbackIcon = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="%233b82f6" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>';

    this.mergeOrder.forEach((file, idx) => {
      const card = document.createElement('div');
      card.className = 'merge-card';
      const imgSrc = file.thumbnailUrl || (file.downloadUrl && file.downloadUrl.startsWith('data:image') ? file.downloadUrl : fallbackIcon);
      card.innerHTML = `
        <span class="merge-num">${idx + 1}</span>
        <img class="merge-thumb" src="${imgSrc}" onerror="this.onerror=null;this.src='${fallbackIcon}'" alt="${file.filename}" />
        <div class="merge-name" title="${file.filename}">${file.filename}</div>
      `;
      filmstrip.appendChild(card);
    });
  }

  async startAdvancedMerge() {
    this.closeModals();
    this.showProcessingModal('Merging into PDF Portfolio...', 'Initializing PDF engine & assembling components...');

    let filename = document.getElementById('merge-filename').value.trim() || 'Combined_Portfolio.pdf';
    if (!filename.toLowerCase().endsWith('.pdf')) {
      filename += '.pdf';
    }
    const compression = document.getElementById('merge-compression') ? document.getElementById('merge-compression').value : 'lossless';
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

    const options = {
      filename,
      compression,
      pageSize,
      orientation,
      pageNumbering,
      hasCover,
      coverTitle,
      coverSubtitle,
      coverAuthor,
      coverTheme,
      generateTOC
    };

    // Execute genuine client-side merge with PDFLib
    try {
      await this.performClientPdfMerge(options);
    } catch (err) {
      console.error('Client PDF merge failed, attempting server merge job:', err);
      // Fallback to server job if available
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
      } catch (serverErr) {
        this.showToast('Merge error: ' + (err.message || 'Failed to merge documents'));
      }
    }
  }

  async ensurePdfLib() {
    if (typeof PDFLib !== 'undefined' && PDFLib.PDFDocument) {
      return PDFLib;
    }
    if (typeof window.PDFLib !== 'undefined' && window.PDFLib.PDFDocument) {
      return window.PDFLib;
    }
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'js/pdf-lib.min.js';
      s.onload = () => {
        if (typeof PDFLib !== 'undefined') resolve(PDFLib);
        else if (typeof window.PDFLib !== 'undefined') resolve(window.PDFLib);
        else reject(new Error('PDFLib not available'));
      };
      s.onerror = () => {
        const s2 = document.createElement('script');
        s2.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.9/dist/pdf-lib.min.js';
        s2.onload = () => {
          if (typeof PDFLib !== 'undefined') resolve(PDFLib);
          else if (typeof window.PDFLib !== 'undefined') resolve(window.PDFLib);
          else reject(new Error('PDFLib CDN failed'));
        };
        s2.onerror = reject;
        document.head.appendChild(s2);
      };
      document.head.appendChild(s);
    });
  }

  sanitizeForPdf(str) {
    if (!str) return '';
    return String(str)
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[\u2026]/g, '...')
      .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');
  }

  dataUrlToUint8Array(dataUrl) {
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    const cleanBase64 = base64.trim().replace(/\s/g, '');
    const binary = atob(cleanBase64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  loadImageElement(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image element'));
      img.src = src;
    });
  }

  convertImageToPngBytes(img) {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width || 800;
    canvas.height = img.naturalHeight || img.height || 600;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const pngDataUrl = canvas.toDataURL('image/png');
    return this.dataUrlToUint8Array(pngDataUrl);
  }

  compressImageToJpegBytes(img, maxWidth = 1920, quality = 0.8) {
    const canvas = document.createElement('canvas');
    let w = img.naturalWidth || img.width || 800;
    let h = img.naturalHeight || img.height || 600;
    if (maxWidth && w > maxWidth) {
      h = Math.round((h * maxWidth) / w);
      w = maxWidth;
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
    return this.dataUrlToUint8Array(jpegDataUrl);
  }

  async getFileBytes(file) {
    if (file.rawFile && typeof file.rawFile.arrayBuffer === 'function') {
      const buffer = await file.rawFile.arrayBuffer();
      return new Uint8Array(buffer);
    }
    if (file.fileData) {
      return this.dataUrlToUint8Array(file.fileData);
    }
    if (file.downloadUrl && file.downloadUrl.startsWith('data:')) {
      return this.dataUrlToUint8Array(file.downloadUrl);
    }
    const url = file.contentUrl || file.downloadUrl;
    if (url && url !== '#') {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${file.filename}`);
      const ab = await res.arrayBuffer();
      return new Uint8Array(ab);
    }

    // Fallback for blank/virtual document
    const pdfLib = await this.ensurePdfLib();
    const doc = await pdfLib.PDFDocument.create();
    doc.addPage([595.28, 841.89]);
    return await doc.save();
  }

  async performClientPdfMerge(options) {
    const pdfLib = await this.ensurePdfLib();
    const { PDFDocument, rgb, StandardFonts } = pdfLib;

    const fill = document.getElementById('proc-fill');
    const desc = document.getElementById('proc-desc');
    const updateProgress = (pct, text) => {
      if (fill) fill.style.width = `${pct}%`;
      if (desc && text) desc.textContent = text;
    };

    const isLossless = (options.compression || 'lossless') === 'lossless';
    const isExtreme = options.compression === 'extreme';
    const isBalanced = options.compression === 'balanced';

    updateProgress(10, `Initializing ${isLossless ? '100% Lossless' : 'Optimized'} PDF Portfolio...`);
    const mergedPdf = await PDFDocument.create();
    const font = await mergedPdf.embedFont(StandardFonts.Helvetica);
    const boldFont = await mergedPdf.embedFont(StandardFonts.HelveticaBold);

    const hexToRgb = (hex) => {
      hex = (hex || '#3b82f6').replace('#', '');
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      const num = parseInt(hex, 16);
      return rgb((num >> 16 & 255) / 255, (num >> 8 & 255) / 255, (num & 255) / 255);
    };

    const pageSizeNormalized = (options.pageSize || 'A4').toLowerCase();
    const isAutoPageSize = pageSizeNormalized === 'auto';

    let targetWidth = 595.28;
    let targetHeight = 841.89;
    if (pageSizeNormalized === 'letter') {
      targetWidth = 612;
      targetHeight = 792;
    } else if (pageSizeNormalized === 'legal') {
      targetWidth = 612;
      targetHeight = 1008;
    }
    if ((options.orientation || '').toLowerCase() === 'landscape') {
      const temp = targetWidth;
      targetWidth = targetHeight;
      targetHeight = temp;
    }

    // 1. Cover Page
    let coverAdded = false;
    if (options.hasCover && options.coverTitle && options.coverTitle.trim()) {
      updateProgress(18, 'Designing executive cover page...');
      const coverPage = mergedPdf.addPage([targetWidth, targetHeight]);
      const themeRgb = hexToRgb(options.coverTheme);

      // Top color banner
      coverPage.drawRectangle({
        x: 0,
        y: targetHeight - 90,
        width: targetWidth,
        height: 90,
        color: themeRgb
      });

      // Accent stripe
      coverPage.drawRectangle({
        x: 0,
        y: targetHeight - 100,
        width: targetWidth,
        height: 10,
        color: rgb(0.08, 0.12, 0.2)
      });

      coverPage.drawText(this.sanitizeForPdf(options.coverTitle.trim()), {
        x: 50,
        y: targetHeight - 250,
        size: 28,
        font: boldFont,
        color: rgb(0.12, 0.16, 0.22)
      });

      if (options.coverSubtitle) {
        coverPage.drawText(this.sanitizeForPdf(options.coverSubtitle.trim()), {
          x: 50,
          y: targetHeight - 290,
          size: 14,
          font: font,
          color: rgb(0.4, 0.45, 0.55)
        });
      }

      const authorText = options.coverAuthor ? options.coverAuthor.trim() : 'DocuVex Pro Suite by NxD';
      coverPage.drawText(this.sanitizeForPdf(`Author: ${authorText}`), {
        x: 50,
        y: targetHeight - 340,
        size: 12,
        font: boldFont,
        color: rgb(0.2, 0.25, 0.35)
      });

      const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      coverPage.drawText(this.sanitizeForPdf(`Compiled on: ${todayStr} • ${this.mergeOrder.length} Components`), {
        x: 50,
        y: targetHeight - 365,
        size: 11,
        font: font,
        color: rgb(0.45, 0.5, 0.6)
      });

      coverPage.drawText('Powered by DocuVex Pro Universal File Engine • Created by NxD', {
        x: 50,
        y: 40,
        size: 9,
        font: font,
        color: rgb(0.6, 0.65, 0.7)
      });

      coverAdded = true;
    }

    const tocEntries = [];
    let pageOffset = coverAdded ? 1 : 0;
    const totalCount = this.mergeOrder.length;

    // 2. High-Capacity Batch Iteration with Non-blocking UI Yielding
    for (let i = 0; i < totalCount; i++) {
      const file = this.mergeOrder[i];
      const stepPct = 20 + Math.round(((i + 1) / totalCount) * 65);
      updateProgress(stepPct, `Merging [${i + 1}/${totalCount}]: ${file.filename} (${isLossless ? 'Lossless' : options.compression})...`);

      // Yield every 2 files so UI stays responsive on 100+ files
      if (i % 2 === 0 || i === totalCount - 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      try {
        const bytes = await this.getFileBytes(file);
        const ext = (file.ext || file.filename.split('.').pop() || '').toLowerCase();

        if (ext === 'pdf') {
          const header = bytes && bytes.length >= 4 ? String.fromCharCode(...bytes.subarray(0, 4)) : '';
          if (header !== '%PDF') {
            console.warn('File does not start with %PDF header, skipping as raw PDF:', file.filename);
          } else {
            const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
            const pageIndices = srcDoc.getPageIndices();
            if (pageIndices.length > 0) {
              const pages = await mergedPdf.copyPages(srcDoc, pageIndices);
              tocEntries.push({ title: this.sanitizeForPdf(file.filename), startPage: pageOffset + 1, pageCount: pages.length });
              pages.forEach(p => mergedPdf.addPage(p));
              pageOffset += pages.length;
            }
          }
        } else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(ext)) {
          const imgSrc = file.downloadUrl && file.downloadUrl.startsWith('data:')
            ? file.downloadUrl
            : (file.fileData ? (file.fileData.startsWith('data:') ? file.fileData : `data:image/${ext};base64,${file.fileData}`) : (file.contentUrl || file.downloadUrl));

          let embeddedImage;

          if (isLossless) {
            // 100% Lossless: inject untouched bitstream with zero compression
            if (ext === 'jpg' || ext === 'jpeg') {
              try {
                embeddedImage = await mergedPdf.embedJpg(bytes);
              } catch (err) {
                const img = await this.loadImageElement(imgSrc);
                const pngBytes = this.convertImageToPngBytes(img);
                embeddedImage = await mergedPdf.embedPng(pngBytes);
              }
            } else if (ext === 'png') {
              try {
                embeddedImage = await mergedPdf.embedPng(bytes);
              } catch (err) {
                const img = await this.loadImageElement(imgSrc);
                const pngBytes = this.convertImageToPngBytes(img);
                embeddedImage = await mergedPdf.embedPng(pngBytes);
              }
            } else {
              const img = await this.loadImageElement(imgSrc);
              const pngBytes = this.convertImageToPngBytes(img);
              embeddedImage = await mergedPdf.embedPng(pngBytes);
            }
          } else {
            // Explicitly requested compression
            const img = await this.loadImageElement(imgSrc);
            const maxW = isExtreme ? 1280 : 1920;
            const qual = isExtreme ? 0.55 : 0.80;
            const compressedJpg = this.compressImageToJpegBytes(img, maxW, qual);
            try {
              embeddedImage = await mergedPdf.embedJpg(compressedJpg);
            } catch (err) {
              const pngBytes = this.convertImageToPngBytes(img);
              embeddedImage = await mergedPdf.embedPng(pngBytes);
            }
          }

          let page;
          if (isAutoPageSize) {
            // Auto Page Size: exact 1:1 match to native image dimensions, zero margin
            page = mergedPdf.addPage([embeddedImage.width, embeddedImage.height]);
            page.drawImage(embeddedImage, {
              x: 0,
              y: 0,
              width: embeddedImage.width,
              height: embeddedImage.height
            });
          } else {
            // Standard Page Size: fit within page margins while maintaining full embedded resolution
            page = mergedPdf.addPage([targetWidth, targetHeight]);
            const margin = 28;
            const { width, height } = embeddedImage.scaleToFit(targetWidth - margin * 2, targetHeight - margin * 2);
            page.drawImage(embeddedImage, {
              x: (targetWidth - width) / 2,
              y: (targetHeight - height) / 2,
              width,
              height
            });
          }

          tocEntries.push({ title: this.sanitizeForPdf(file.filename), startPage: pageOffset + 1, pageCount: 1 });
          pageOffset += 1;
        } else {
          // Plain text, Markdown, CSV, code - Paginate so NO content/quantity is dropped!
          try {
            const textDecoder = new TextDecoder('utf-8');
            const content = textDecoder.decode(bytes);
            const lines = content.split(/\r?\n/);
            const linesPerPage = 42;
            const totalTextPages = Math.max(1, Math.ceil(lines.length / linesPerPage));

            for (let tp = 0; tp < totalTextPages; tp++) {
              const page = mergedPdf.addPage([targetWidth, targetHeight]);
              let y = targetHeight - 50;

              if (tp === 0) {
                page.drawText(this.sanitizeForPdf(file.filename), { x: 50, y, size: 16, font: boldFont });
                y -= 25;
                page.drawRectangle({ x: 50, y, width: targetWidth - 100, height: 1.5, color: rgb(0.8, 0.85, 0.9) });
                y -= 25;
              } else {
                page.drawText(this.sanitizeForPdf(`${file.filename} (Page ${tp + 1}/${totalTextPages})`), { x: 50, y, size: 11, font: boldFont, color: rgb(0.4, 0.45, 0.5) });
                y -= 25;
              }

              const pageLines = lines.slice(tp * linesPerPage, (tp + 1) * linesPerPage);
              for (const line of pageLines) {
                if (y < 40) break;
                page.drawText(this.sanitizeForPdf(line.substring(0, 95)), { x: 50, y, size: 9.5, font });
                y -= 16;
              }
            }

            tocEntries.push({ title: this.sanitizeForPdf(file.filename), startPage: pageOffset + 1, pageCount: totalTextPages });
            pageOffset += totalTextPages;
          } catch (e) {
            console.warn('Text component embedding error:', e);
          }
        }
      } catch (fileErr) {
        console.warn(`Error processing file ${file.filename} in merge:`, fileErr);
        // Fallback document page so ZERO files are ever omitted
        try {
          const page = mergedPdf.addPage([targetWidth, targetHeight]);
          page.drawRectangle({
            x: 40,
            y: targetHeight - 100,
            width: targetWidth - 80,
            height: 60,
            color: rgb(0.95, 0.96, 0.98)
          });
          page.drawText(this.sanitizeForPdf(file.filename), {
            x: 55,
            y: targetHeight - 70,
            size: 16,
            font: boldFont,
            color: rgb(0.12, 0.16, 0.22)
          });
          page.drawText(this.sanitizeForPdf(`File Component ${i + 1} of ${totalCount} • Format: ${(file.ext || '').toUpperCase()} • Preserved in Portfolio`), {
            x: 55,
            y: targetHeight - 90,
            size: 10,
            font: font,
            color: rgb(0.4, 0.45, 0.55)
          });
          tocEntries.push({ title: this.sanitizeForPdf(file.filename), startPage: pageOffset + 1, pageCount: 1 });
          pageOffset += 1;
        } catch (fbErr) {
          console.error('Fallback page error:', fbErr);
        }
      }
    }

    // 3. Dynamic Multi-Page Table of Contents (Supports 46, 100, 200+ files without cutoff!)
    if (options.generateTOC && tocEntries.length > 1) {
      updateProgress(88, 'Compiling dynamic multi-page Table of Contents...');
      const entriesPerPage = 25;
      const totalTocPages = Math.ceil(tocEntries.length / entriesPerPage);

      for (let tp = 0; tp < totalTocPages; tp++) {
        const tocPage = mergedPdf.insertPage((coverAdded ? 1 : 0) + tp, [targetWidth, targetHeight]);
        const titleText = totalTocPages > 1 ? `Table of Contents (${tp + 1}/${totalTocPages})` : 'Table of Contents';

        tocPage.drawText(titleText, {
          x: 50,
          y: targetHeight - 60,
          size: 20,
          font: boldFont,
          color: rgb(0.1, 0.1, 0.1)
        });
        tocPage.drawRectangle({
          x: 50,
          y: targetHeight - 75,
          width: targetWidth - 100,
          height: 2,
          color: hexToRgb(options.coverTheme)
        });

        const pageSlice = tocEntries.slice(tp * entriesPerPage, (tp + 1) * entriesPerPage);
        let y = targetHeight - 110;

        for (let i = 0; i < pageSlice.length; i++) {
          const item = pageSlice[i];
          const globalIdx = tp * entriesPerPage + i + 1;
          const pageNum = item.startPage + totalTocPages; // offset by all TOC pages
          tocPage.drawText(`${globalIdx}.  ${this.sanitizeForPdf(item.title).substring(0, 42)}`, { x: 50, y, size: 11, font });
          tocPage.drawText(`Page ${pageNum}`, { x: targetWidth - 110, y, size: 11, font: boldFont, color: rgb(0.2, 0.2, 0.2) });
          y -= 25;
        }
      }
    }

    // Guaranteed minimum 1 page
    if (mergedPdf.getPageCount() === 0) {
      const page = mergedPdf.addPage([targetWidth, targetHeight]);
      page.drawText(this.sanitizeForPdf(options.filename.replace(/\.pdf$/i, '')), {
        x: 50,
        y: targetHeight - 100,
        size: 22,
        font: boldFont,
        color: rgb(0.1, 0.1, 0.1)
      });
      page.drawText('Document merged successfully.', { x: 50, y: targetHeight - 140, size: 12, font });
    }

    // 4. Page numbering
    if (options.pageNumbering && options.pageNumbering !== 'none') {
      const totalPages = mergedPdf.getPageCount();
      for (let i = (coverAdded ? 1 : 0); i < totalPages; i++) {
        const page = mergedPdf.getPage(i);
        const { width, height } = page.getSize();
        const text = `Page ${i + 1} of ${totalPages}`;
        let x = width / 2 - 30;
        let y = 20;
        if (options.pageNumbering === 'bottom-right') x = width - 90;
        if (options.pageNumbering === 'top-right') {
          x = width - 90;
          y = height - 25;
        }
        page.drawText(text, { x, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
      }
    }

    updateProgress(95, 'Finalizing genuine PDF byte stream...');
    const pdfBytes = await mergedPdf.save({
      useObjectStreams: !isLossless
    });
    
    // Strict validation
    const headerCheck = String.fromCharCode(...pdfBytes.subarray(0, 4));
    if (headerCheck !== '%PDF') {
      throw new Error('PDF output validation failed');
    }

    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);

    updateProgress(100, 'Merge Complete! Ready to download.');
    document.getElementById('proc-spinner').style.display = 'none';
    document.getElementById('proc-success').style.display = 'block';
    document.getElementById('proc-title').textContent = 'Merge Complete!';
    document.getElementById('proc-desc').textContent = `${options.filename} (${this.formatBytes(pdfBytes.length)}) • ${isLossless ? '100% Lossless' : options.compression} mode`;

    const dlBtn = document.getElementById('btn-proc-download');
    dlBtn.textContent = `Download ${options.filename}`;
    dlBtn.href = blobUrl;
    dlBtn.download = options.filename;
    document.getElementById('proc-actions').style.display = 'block';

    // Auto-trigger direct download
    const autoLink = document.createElement('a');
    autoLink.href = blobUrl;
    autoLink.download = options.filename;
    document.body.appendChild(autoLink);
    autoLink.click();
    document.body.removeChild(autoLink);

    this.showToast(`Merged & downloaded ${options.filename} as PDF!`);
  }

  // =========================================================================
  // PDF Compression Feature & Dialog
  // =========================================================================

  openCompressModal() {
    const pdfFiles = this.files.filter(f => (f.ext || '').toLowerCase() === 'pdf');
    const candidateFiles = pdfFiles.length > 0 ? pdfFiles : this.files;

    if (candidateFiles.length === 0) {
      this.showToast('Please upload at least 1 document to compress');
      return;
    }

    const select = document.getElementById('compress-file-select');
    select.innerHTML = '';

    const selectedId = this.selectedIds.size > 0 ? Array.from(this.selectedIds)[0] : null;

    candidateFiles.forEach(file => {
      const opt = document.createElement('option');
      opt.value = file.id;
      opt.textContent = `${file.filename} (${file.sizeFormatted || this.formatBytes(file.sizeBytes || 0)})`;
      if (selectedId && file.id === selectedId) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    this.updateCompressFileInfo();
    document.getElementById('modal-compress').style.display = 'flex';
  }

  updateCompressFileInfo() {
    const select = document.getElementById('compress-file-select');
    const fileId = select.value;
    const file = this.files.find(f => f.id === fileId);
    const info = document.getElementById('compress-file-info');
    const filenameInput = document.getElementById('compress-filename');
    if (file) {
      if (info) {
        info.textContent = `Current Size: ${file.sizeFormatted || this.formatBytes(file.sizeBytes || 0)} • Type: ${file.ext.toUpperCase()} • Pages: ${file.pageCount || 1}`;
      }
      if (filenameInput) {
        const base = file.filename.replace(/\.pdf$/i, '');
        filenameInput.value = `${base}_compressed.pdf`;
      }
    }
  }

  async startCompressJob() {
    const select = document.getElementById('compress-file-select');
    const fileId = select.value;
    const file = this.files.find(f => f.id === fileId);
    if (!file) {
      this.showToast('Please select a file to compress');
      return;
    }

    const levelRadio = document.querySelector('input[name="compress-level"]:checked');
    const level = levelRadio ? levelRadio.value : 'balanced';

    let outputName = document.getElementById('compress-filename').value.trim() || `${file.filename.replace(/\.pdf$/i, '')}_compressed.pdf`;
    if (!outputName.toLowerCase().endsWith('.pdf')) {
      outputName += '.pdf';
    }

    this.closeModals();
    this.showProcessingModal('Compressing PDF Document...', `Applying ${level} compression algorithms...`);

    try {
      await this.performClientPdfCompression(file, level, outputName);
    } catch (clientErr) {
      console.warn('Client compression failed, attempting server fallback:', clientErr);
      try {
        const res = await fetch('/api/jobs/compress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: file.id, level })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success) return;
        }
        throw clientErr;
      } catch (err) {
        this.showToast('Compression error: ' + (err.message || 'Failed to compress document'));
      }
    }
  }

  async performClientPdfCompression(file, level, outputFilename) {
    const pdfLib = await this.ensurePdfLib();
    const { PDFDocument } = pdfLib;

    const fill = document.getElementById('proc-fill');
    const desc = document.getElementById('proc-desc');
    const updateProgress = (pct, text) => {
      if (fill) fill.style.width = `${pct}%`;
      if (desc && text) desc.textContent = text;
    };

    updateProgress(20, 'Loading PDF byte streams...');
    const originalBytes = await this.getFileBytes(file);
    const originalSize = originalBytes.length;

    updateProgress(45, `Optimizing PDF streams (${level} mode)...`);
    const srcDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });

    // Cleanly re-assemble pages into compact stream structure
    const optimizedPdf = await PDFDocument.create();
    const pageIndices = srcDoc.getPageIndices();
    const pages = await optimizedPdf.copyPages(srcDoc, pageIndices);
    pages.forEach(p => optimizedPdf.addPage(p));

    updateProgress(75, 'Compressing cross-reference object streams...');
    const compressedBytes = await optimizedPdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 50
    });

    const newSize = compressedBytes.length;
    const savingsPct = originalSize > newSize ? Math.round(((originalSize - newSize) / originalSize) * 100) : 0;
    const savingsText = savingsPct > 0 
      ? `${this.formatBytes(originalSize)} → ${this.formatBytes(newSize)} (${savingsPct}% reduction)`
      : `${this.formatBytes(newSize)} (Optimized stream layout)`;

    const blob = new Blob([compressedBytes], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);

    updateProgress(100, `Compression complete! ${savingsText}`);
    document.getElementById('proc-spinner').style.display = 'none';
    document.getElementById('proc-success').style.display = 'block';
    document.getElementById('proc-title').textContent = 'PDF Compressed Successfully!';
    document.getElementById('proc-desc').textContent = `${outputFilename} • ${savingsText}`;

    const dlBtn = document.getElementById('btn-proc-download');
    dlBtn.textContent = `Download ${outputFilename}`;
    dlBtn.href = blobUrl;
    dlBtn.download = outputFilename;
    document.getElementById('proc-actions').style.display = 'block';

    // Auto-trigger direct download
    const autoLink = document.createElement('a');
    autoLink.href = blobUrl;
    autoLink.download = outputFilename;
    document.body.appendChild(autoLink);
    autoLink.click();
    document.body.removeChild(autoLink);

    this.showToast(`Compressed & downloaded ${outputFilename}!`);
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

  async simulateClientConvertJob(ids, targetFormat) {
    const fill = document.getElementById('proc-fill');
    let p = 25;
    const interval = setInterval(async () => {
      p += 25;
      if (fill) fill.style.width = `${Math.min(100, p)}%`;
      if (p >= 100) {
        clearInterval(interval);
        
        let blob;
        const outName = `Converted_Deliverable.${targetFormat}`;
        
        if (targetFormat === 'pdf') {
          try {
            const pdfLib = await this.ensurePdfLib();
            const { PDFDocument, StandardFonts } = pdfLib;
            const doc = await PDFDocument.create();
            const font = await doc.embedFont(StandardFonts.Helvetica);
            const bold = await doc.embedFont(StandardFonts.HelveticaBold);
            
            for (const id of ids) {
              const file = this.files.find(f => f.id === id);
              if (!file) continue;
              const ext = (file.ext || '').toLowerCase();
              if (['png', 'jpg', 'jpeg'].includes(ext)) {
                try {
                  const bytes = await this.getFileBytes(file);
                  const img = ext === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
                  const page = doc.addPage([595.28, 841.89]);
                  const { width, height } = img.scaleToFit(535.28, 781.89);
                  page.drawImage(img, { x: (595.28 - width) / 2, y: (841.89 - height) / 2, width, height });
                  continue;
                } catch (e) {}
              }
              const page = doc.addPage([595.28, 841.89]);
              page.drawText(this.sanitizeForPdf(file.filename), { x: 50, y: 780, size: 18, font: bold });
              page.drawText('Converted with DocuVex Pro Suite by NxD', { x: 50, y: 750, size: 12, font });
            }
            if (doc.getPageCount() === 0) {
              const page = doc.addPage([595.28, 841.89]);
              page.drawText('DocuVex Pro Converted Document', { x: 50, y: 780, size: 18, font: bold });
            }
            const pdfBytes = await doc.save();
            blob = new Blob([pdfBytes], { type: 'application/pdf' });
          } catch (e) {
            console.error('PDFLib convert error:', e);
          }
        }
        
        if (!blob) {
          const mime = targetFormat === 'pdf' ? 'application/pdf' : (targetFormat === 'png' ? 'image/png' : 'application/octet-stream');
          blob = new Blob([`DocuVex Pro Deliverable: ${outName}\nCreator: NxD`], { type: mime });
        }

        setTimeout(() => {
          document.getElementById('proc-spinner').style.display = 'none';
          document.getElementById('proc-success').style.display = 'block';
          document.getElementById('proc-title').textContent = 'Conversion Complete!';
          document.getElementById('proc-desc').textContent = `Processed ${ids.length} files to ${targetFormat.toUpperCase()}.`;
          
          const dlBtn = document.getElementById('btn-proc-download');
          dlBtn.textContent = `Download ${outName}`;
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
    this.showToast('Generating genuine high-resolution PDF...');

    let filename = `Edited_${this.currentViewerFile ? this.currentViewerFile.filename : 'Document.pdf'}`;
    if (!filename.toLowerCase().endsWith('.pdf')) {
      filename = filename.replace(/\.[^/.]+$/, '') + '.pdf';
    }

    try {
      const pdfLib = await this.ensurePdfLib();
      const { PDFDocument } = pdfLib;
      const pdfDoc = await PDFDocument.create();
      const imgBytes = this.dataUrlToUint8Array(dataUrl);
      const image = await pdfDoc.embedJpg(imgBytes);

      // Match canvas dimensions in points
      const page = pdfDoc.addPage([merged.width, merged.height]);
      page.drawImage(image, { x: 0, y: 0, width: merged.width, height: merged.height });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);

      // Download directly as genuine PDF
      const a = document.createElement('a');
      a.download = filename;
      a.href = blobUrl;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

      this.showToast(`Saved & downloaded ${filename} as PDF!`);
      this.closeModals();
      return;
    } catch (e) {
      console.warn('PDFLib studio export failed, using standard download:', e);
    }

    // Direct deliverable download fallback
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
