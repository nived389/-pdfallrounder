const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

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

    const manifestPath = path.join(this.conversionsDir, `${job.id}_manifest.json`);
    const outputPdfName = options.outputName ? (options.outputName.endsWith('.pdf') ? options.outputName : options.outputName + '.pdf') : `Merged_Document_${Date.now()}.pdf`;
    const outputPdfPath = path.join(this.conversionsDir, `${job.id}_${outputPdfName}`);

    fs.writeFileSync(manifestPath, JSON.stringify({
      files: files.map(f => f.storagePath || f.path),
      options
    }));

    job.progressPercent = 35;
    job.currentStep = 'Merging and rendering high-resolution PDF pages...';
    this.emitProgress(job);

    await this.runPythonCommand(['merge', manifestPath, outputPdfPath]);

    if (!fs.existsSync(outputPdfPath) || fs.statSync(outputPdfPath).size === 0) {
      throw new Error('Failed to generate merged PDF');
    }

    // Clean up manifest
    if (fs.existsSync(manifestPath)) {
      fs.unlinkSync(manifestPath);
    }

    job.progressPercent = 90;
    job.currentStep = 'Generating preview thumbnail for merged document...';
    this.emitProgress(job);

    const thumbPath = path.join(this.conversionsDir, `${job.id}_thumb.png`);
    await this.runPythonCommand(['thumbnail', outputPdfPath, thumbPath]);

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
