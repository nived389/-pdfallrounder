const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

class JobQueue {
  constructor(io) {
    this.io = io;
    this.jobs = new Map();
    this.conversionsDir = path.join(__dirname, '../../conversions');
    this.uploadsDir = path.join(__dirname, '../../uploads');
    this.converterPy = path.join(__dirname, 'converter.py');
    
    if (!fs.existsSync(this.conversionsDir)) {
      fs.mkdirSync(this.conversionsDir, { recursive: true });
    }
  }

  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  getAllJobs() {
    return Array.from(this.jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  createJob(type, payload) {
    const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const job = {
      id: jobId,
      type, // 'convert', 'merge', 'compress', 'batch_convert'
      status: 'queued', // queued, processing, completed, failed
      progressPercent: 0,
      currentStep: 'Job queued...',
      totalFiles: payload.files ? payload.files.length : 1,
      processedFiles: 0,
      payload,
      createdAt: Date.now(),
      completedAt: null,
      resultFile: null,
      resultFilename: null,
      resultUrl: null,
      error: null
    };

    this.jobs.set(jobId, job);
    this.emitProgress(job);

    // Schedule processing asynchronously
    setImmediate(() => {
      this.processJob(jobId);
    });

    return job;
  }

  emitProgress(job) {
    if (this.io) {
      this.io.emit('job:update', {
        id: job.id,
        type: job.type,
        status: job.status,
        progressPercent: job.progressPercent,
        currentStep: job.currentStep,
        processedFiles: job.processedFiles,
        totalFiles: job.totalFiles,
        resultUrl: job.resultUrl,
        resultFilename: job.resultFilename,
        error: job.error
      });
    }
  }

  async processJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'processing';
    job.progressPercent = 5;
    job.currentStep = 'Initializing conversion worker...';
    this.emitProgress(job);

    try {
      if (job.type === 'merge') {
        await this.handleMergeJob(job);
      } else if (job.type === 'convert' || job.type === 'batch_convert') {
        await this.handleConvertJob(job);
      } else if (job.type === 'compress') {
        await this.handleCompressJob(job);
      } else {
        throw new Error('Unsupported job type: ' + job.type);
      }

      job.status = 'completed';
      job.progressPercent = 100;
      job.completedAt = Date.now();
      job.currentStep = 'Completed successfully!';
      this.emitProgress(job);
    } catch (err) {
      console.error(`Job ${jobId} failed:`, err);
      job.status = 'failed';
      job.error = err.message || 'Processing failed';
      job.currentStep = 'Error: ' + job.error;
      this.emitProgress(job);
    }
  }

  async handleMergeJob(job) {
    const { files, options = {} } = job.payload;
    if (!files || files.length === 0) {
      throw new Error('No files provided for merge');
    }

    job.progressPercent = 15;
    job.currentStep = `Preparing ${files.length} document/image components...`;
    this.emitProgress(job);

    let outputPdfName = options.outputName ? options.outputName.trim() : `Merged_Document_${Date.now()}.pdf`;
    if (!outputPdfName.toLowerCase().endsWith('.pdf')) {
      outputPdfName += '.pdf';
    }
    const outputPdfPath = path.join(this.conversionsDir, `${job.id}_${outputPdfName}`);

    function hexToRgb(hex) {
      hex = (hex || '#3b82f6').replace('#', '');
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      const num = parseInt(hex, 16);
      return rgb((num >> 16 & 255) / 255, (num >> 8 & 255) / 255, (num & 255) / 255);
    }

    function sanitizeForPdf(str) {
      if (!str) return '';
      return String(str)
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/[\u2026]/g, '...')
        .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');
    }

    const mergedPdf = await PDFDocument.create();
    const font = await mergedPdf.embedFont(StandardFonts.Helvetica);
    const boldFont = await mergedPdf.embedFont(StandardFonts.HelveticaBold);

    // 1. Cover Page
    let coverAdded = false;
    if (options.coverTitle && options.coverTitle.trim()) {
      job.currentStep = 'Generating executive cover page...';
      job.progressPercent = 25;
      this.emitProgress(job);

      const coverPage = mergedPdf.addPage([595.28, 841.89]);
      const themeColor = hexToRgb(options.coverTheme || '#3b82f6');

      // Top color banner
      coverPage.drawRectangle({
        x: 0,
        y: 760,
        width: 595.28,
        height: 81.89,
        color: themeColor
      });

      // Accent stripe
      coverPage.drawRectangle({
        x: 0,
        y: 750,
        width: 595.28,
        height: 10,
        color: rgb(0.08, 0.12, 0.2)
      });

      coverPage.drawText(sanitizeForPdf(options.coverTitle.trim()), {
        x: 50,
        y: 520,
        size: 28,
        font: boldFont,
        color: rgb(0.12, 0.16, 0.22)
      });

      if (options.coverSubtitle) {
        coverPage.drawText(sanitizeForPdf(options.coverSubtitle.trim()), {
          x: 50,
          y: 480,
          size: 14,
          font: font,
          color: rgb(0.4, 0.45, 0.55)
        });
      }

      const author = options.coverAuthor ? options.coverAuthor.trim() : 'DocuVex Pro Suite by NxD';
      coverPage.drawText(sanitizeForPdf(`Author: ${author}`), {
        x: 50,
        y: 430,
        size: 12,
        font: boldFont,
        color: rgb(0.2, 0.25, 0.35)
      });

      const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      coverPage.drawText(sanitizeForPdf(`Generated on: ${todayStr} - Total Components: ${files.length}`), {
        x: 50,
        y: 405,
        size: 11,
        font: font,
        color: rgb(0.45, 0.5, 0.6)
      });

      coverPage.drawText('Powered by DocuVex Pro Universal Engine - Created by NxD', {
        x: 50,
        y: 50,
        size: 9,
        font: font,
        color: rgb(0.6, 0.65, 0.7)
      });

      coverAdded = true;
    }

    const tocEntries = [];
    let pageOffset = coverAdded ? 1 : 0;

    // 2. Merge components
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const filePath = f.storagePath || f.path;
      if (!filePath || !fs.existsSync(filePath)) continue;

      const ext = path.extname(filePath).toLowerCase().replace('.', '');
      job.currentStep = `Merging component ${i + 1} of ${files.length}: ${f.filename || path.basename(filePath)}...`;
      job.progressPercent = 30 + Math.round((i / files.length) * 50);
      this.emitProgress(job);

      if (ext === 'pdf') {
        try {
          const pdfBuffer = fs.readFileSync(filePath);
          const srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
          const pages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
          tocEntries.push({ title: f.filename || path.basename(filePath), startPage: pageOffset + 1, pageCount: pages.length });
          pages.forEach(p => mergedPdf.addPage(p));
          pageOffset += pages.length;
        } catch (e) {
          console.warn('Error loading pdf in merge:', e);
        }
      } else if (['png', 'jpg', 'jpeg'].includes(ext)) {
        try {
          const imgBuffer = fs.readFileSync(filePath);
          const img = ext === 'png' ? await mergedPdf.embedPng(imgBuffer) : await mergedPdf.embedJpg(imgBuffer);
          const isAuto = (options.pageSize || '').toLowerCase() === 'auto';
          const page = isAuto ? mergedPdf.addPage([img.width, img.height]) : mergedPdf.addPage([595.28, 841.89]);
          if (isAuto) {
            page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
          } else {
            const { width, height } = img.scaleToFit(535.28, 781.89);
            page.drawImage(img, {
              x: (595.28 - width) / 2,
              y: (841.89 - height) / 2,
              width,
              height
            });
          }
          tocEntries.push({ title: f.filename || path.basename(filePath), startPage: pageOffset + 1, pageCount: 1 });
          pageOffset += 1;
        } catch (e) {
          console.warn('Error embedding image in merge:', e);
        }
      } else {
        // Plain text / Markdown / CSV / code - paginate across pages so nothing is dropped
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.split(/\r?\n/);
          const linesPerPage = 42;
          const totalTextPages = Math.max(1, Math.ceil(lines.length / linesPerPage));

          for (let tp = 0; tp < totalTextPages; tp++) {
            const page = mergedPdf.addPage([595.28, 841.89]);
            let y = 780;
            if (tp === 0) {
              page.drawText(f.filename || path.basename(filePath), { x: 50, y, size: 16, font: boldFont });
              y -= 30;
            } else {
              page.drawText(`${f.filename || path.basename(filePath)} (Page ${tp + 1}/${totalTextPages})`, { x: 50, y, size: 11, font: boldFont, color: rgb(0.4, 0.45, 0.5) });
              y -= 25;
            }
            const pageLines = lines.slice(tp * linesPerPage, (tp + 1) * linesPerPage);
            for (const line of pageLines) {
              if (y < 40) break;
              page.drawText(line.substring(0, 90), { x: 50, y, size: 10, font });
              y -= 16;
            }
          }
          tocEntries.push({ title: f.filename || path.basename(filePath), startPage: pageOffset + 1, pageCount: totalTextPages });
          pageOffset += totalTextPages;
        } catch (e) {
          console.warn('Error appending text file in merge:', e);
        }
      }
    }

    // 3. Table of Contents
    if (options.generateTOC && tocEntries.length > 1) {
      const tocPage = mergedPdf.insertPage(coverAdded ? 1 : 0, [595.28, 841.89]);
      tocPage.drawText('Table of Contents', { x: 50, y: 780, size: 22, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
      tocPage.drawRectangle({ x: 50, y: 765, width: 495.28, height: 2, color: hexToRgb(options.coverTheme || '#3b82f6') });

      let y = 730;
      for (let i = 0; i < tocEntries.length; i++) {
        if (y < 50) break;
        const item = tocEntries[i];
        const pageNum = item.startPage + 1; // offset by 1 for TOC itself
        tocPage.drawText(`${i + 1}.  ${item.title.substring(0, 50)}`, { x: 50, y, size: 12, font });
        tocPage.drawText(`Page ${pageNum}`, { x: 480, y, size: 12, font: boldFont, color: rgb(0.2, 0.2, 0.2) });
        y -= 26;
      }
    }

    // 4. Page numbering
    if (options.pageNumbers && options.pageNumbers !== 'none') {
      const totalPages = mergedPdf.getPageCount();
      for (let i = (coverAdded ? 1 : 0); i < totalPages; i++) {
        const page = mergedPdf.getPage(i);
        const { width } = page.getSize();
        const text = `Page ${i + 1} of ${totalPages}`;
        let x = width / 2 - 30;
        if (options.pageNumbers === 'bottom-right') x = width - 100;
        page.drawText(text, { x, y: 20, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
      }
    }

    const mergedBytes = await mergedPdf.save();
    fs.writeFileSync(outputPdfPath, mergedBytes);

    job.progressPercent = 90;
    job.currentStep = 'Generating preview thumbnail for merged document...';
    this.emitProgress(job);

    const thumbPath = path.join(this.conversionsDir, `${job.id}_thumb.png`);
    try {
      await this.runPythonCommand(['thumbnail', outputPdfPath, thumbPath]);
    } catch (e) {}

    const stat = fs.statSync(outputPdfPath);
    job.resultFile = outputPdfPath;
    job.resultFilename = outputPdfName;
    job.resultUrl = `/api/download/${job.id}`;
    job.resultSize = stat.size;
  }

  async handleConvertJob(job) {
    const { files, targetFormat, options = {} } = job.payload;
    if (!files || files.length === 0) {
      throw new Error('No files provided for conversion');
    }

    const convertedFilesMap = {}; // arcname -> path
    const results = [];
    const total = files.length;

    for (let i = 0; i < total; i++) {
      const file = files[i];
      const filePath = file.storagePath || file.path;
      const fileTargetFormat = file.targetFormat || targetFormat;

      const progress = Math.round(15 + ((i / total) * 70));
      job.progressPercent = progress;
      job.processedFiles = i + 1;
      job.currentStep = `Converting file ${i + 1}/${total}: ${file.name || path.basename(filePath)} -> ${fileTargetFormat.toUpperCase()}...`;
      this.emitProgress(job);

      const res = await this.runPythonCommand([
        'convert',
        filePath,
        this.conversionsDir,
        fileTargetFormat,
        JSON.stringify(options)
      ]);

      let parsed = {};
      try {
        parsed = JSON.parse(res);
      } catch (e) {
        parsed = { success: false, error: res };
      }

      if (parsed.success && parsed.outputFile && fs.existsSync(parsed.outputFile)) {
        convertedFilesMap[parsed.filename] = parsed.outputFile;
        results.push(parsed);
      } else {
        console.warn(`File conversion failed for ${filePath}:`, parsed.error);
      }
    }

    if (results.length === 0) {
      throw new Error('All file conversions failed');
    }

    job.progressPercent = 88;
    job.currentStep = 'Packaging converted deliverables...';
    this.emitProgress(job);

    if (results.length === 1 && !options.forceZip) {
      // Single file result
      const single = results[0];
      job.resultFile = single.outputFile;
      job.resultFilename = single.filename;
      job.resultUrl = `/api/download/${job.id}`;
      job.resultSize = fs.statSync(single.outputFile).size;
    } else {
      // Multiple files -> Bundle into ZIP
      const zipName = `Converted_Files_Batch_${Date.now()}.zip`;
      const zipPath = path.join(this.conversionsDir, `${job.id}_${zipName}`);
      const manifestPath = path.join(this.conversionsDir, `${job.id}_zip_manifest.json`);

      fs.writeFileSync(manifestPath, JSON.stringify({ filesMap: convertedFilesMap }));
      await this.runPythonCommand(['zip', manifestPath, zipPath]);

      if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);

      if (!fs.existsSync(zipPath)) {
        throw new Error('Failed to generate ZIP archive');
      }

      job.resultFile = zipPath;
      job.resultFilename = zipName;
      job.resultUrl = `/api/download/${job.id}`;
      job.resultSize = fs.statSync(zipPath).size;
    }
  }

  async handleCompressJob(job) {
    const { file, level = 'balanced' } = job.payload;
    const filePath = file.storagePath || file.path;
    const baseName = path.basename(filePath, path.extname(filePath));
    const outputPdfName = `${baseName}_compressed.pdf`;
    const outputPath = path.join(this.conversionsDir, `${job.id}_${outputPdfName}`);

    job.progressPercent = 30;
    job.currentStep = `Optimizing PDF streams with ${level} compression...`;
    this.emitProgress(job);

    await this.runPythonCommand([
      'convert',
      filePath,
      this.conversionsDir,
      'pdf',
      JSON.stringify({ quality: level === 'high' ? 'low' : (level === 'low' ? 'best' : 'normal') })
    ]);

    job.resultFile = outputPath;
    job.resultFilename = outputPdfName;
    job.resultUrl = `/api/download/${job.id}`;
    job.resultSize = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
  }

  runPythonCommand(args) {
    return new Promise((resolve, reject) => {
      const proc = spawn('python3', [this.converterPy, ...args]);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', data => {
        stdout += data.toString();
      });

      proc.stderr.on('data', data => {
        stderr += data.toString();
      });

      proc.on('close', code => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(stderr || stdout || `Process exited with code ${code}`));
        }
      });

      proc.on('error', err => {
        reject(err);
      });
    });
  }
}

module.exports = JobQueue;
