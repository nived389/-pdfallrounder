const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

function createConverterRoutes(io, jobQueue) {
  const uploadsDir = path.join(__dirname, '../../uploads');
  const thumbsDir = path.join(uploadsDir, 'thumbnails');
  const conversionsDir = path.join(__dirname, '../../conversions');
  const converterPy = path.join(__dirname, '../services/converter.py');

  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  if (!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir, { recursive: true });
  if (!fs.existsSync(conversionsDir)) fs.mkdirSync(conversionsDir, { recursive: true });

  const filesMap = new Map();

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function detectCategory(ext) {
    ext = ext.toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff', 'gif', 'svg'].includes(ext)) return 'image';
    if (['docx', 'doc', 'rtf', 'odt'].includes(ext)) return 'document';
    if (['xlsx', 'xls', 'csv'].includes(ext)) return 'spreadsheet';
    if (['pptx', 'ppt'].includes(ext)) return 'presentation';
    if (['txt', 'html', 'md', 'json', 'xml'].includes(ext)) return 'text';
    if (['zip', 'tar', 'gz', 'rar'].includes(ext)) return 'archive';
    return 'other';
  }

  function runPython(args) {
    return new Promise((resolve, reject) => {
      const proc = spawn('python3', [converterPy, ...args]);
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', d => stdout += d.toString());
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('close', code => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(stderr || stdout || `Process exited with code ${code}`));
      });
      proc.on('error', reject);
    });
  }

  async function registerFile(filePath, originalName) {
    const ext = path.extname(originalName).replace('.', '').toLowerCase();
    const fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const stat = fs.statSync(filePath);
    const category = detectCategory(ext);

    let pageCount = 1;
    if (ext === 'pdf') {
      try {
        const raw = fs.readFileSync(filePath);
        const matches = raw.toString('latin1').match(/\/Type\s*\/Page(?=[^s]|$)/g);
        pageCount = matches ? Math.max(1, matches.length) : 1;
      } catch (e) {
        pageCount = 1;
      }
    }

    const thumbPath = path.join(thumbsDir, `${fileId}.png`);
    let hasThumb = false;
    try {
      await runPython(['thumbnail', filePath, thumbPath]);
      hasThumb = fs.existsSync(thumbPath) && fs.statSync(thumbPath).size > 0;
    } catch (e) {
      hasThumb = false;
    }

    const record = {
      id: fileId,
      filename: originalName,
      originalName,
      ext,
      category,
      sizeBytes: stat.size,
      sizeFormatted: formatBytes(stat.size),
      storagePath: filePath,
      thumbnailUrl: hasThumb ? `/api/thumbnail/${fileId}` : null,
      downloadUrl: `/api/download-file/${fileId}`,
      contentUrl: `/api/file-content/${fileId}`,
      pageCount,
      createdAt: Date.now(),
      status: 'ready'
    };

    filesMap.set(fileId, record);
    return record;
  }

  // Upload single / batch files via JSON
  router.post('/upload', async (req, res) => {
    try {
      const { filename, data, mimeType } = req.body;
      if (!filename || !data) {
        return res.status(400).json({ success: false, error: 'Filename and file data are required' });
      }

      const safeName = path.basename(filename);
      const tempId = 'up_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      const filePath = path.join(uploadsDir, `${tempId}_${safeName}`);

      let buffer;
      if (data.startsWith('data:')) {
        const commaIdx = data.indexOf(',');
        const base64Str = data.substring(commaIdx + 1);
        buffer = Buffer.from(base64Str, 'base64');
      } else {
        buffer = Buffer.from(data, 'base64');
      }

      fs.writeFileSync(filePath, buffer);

      const record = await registerFile(filePath, safeName);
      if (io) io.emit('workspace:file_added', record);

      res.json({ success: true, file: record });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get all files
  router.get('/files', (req, res) => {
    const list = Array.from(filesMap.values()).sort((a, b) => b.createdAt - a.createdAt);
    res.json({ success: true, count: list.length, files: list });
  });

  // Delete single file
  router.delete('/files/:id', (req, res) => {
    const file = filesMap.get(req.params.id);
    if (!file) return res.status(404).json({ success: false, error: 'File not found' });

    try {
      if (fs.existsSync(file.storagePath)) fs.unlinkSync(file.storagePath);
      const thumb = path.join(thumbsDir, `${file.id}.png`);
      if (fs.existsSync(thumb)) fs.unlinkSync(thumb);
    } catch (e) {
      console.warn('Error deleting file on disk:', e);
    }

    filesMap.delete(req.params.id);
    if (io) io.emit('workspace:file_removed', { id: req.params.id });

    res.json({ success: true, deletedId: req.params.id });
  });

  // Clear entire workspace
  router.delete('/files', (req, res) => {
    for (const [id, file] of filesMap.entries()) {
      try {
        if (fs.existsSync(file.storagePath)) fs.unlinkSync(file.storagePath);
        const thumb = path.join(thumbsDir, `${id}.png`);
        if (fs.existsSync(thumb)) fs.unlinkSync(thumb);
      } catch (e) {}
    }
    filesMap.clear();
    if (io) io.emit('workspace:cleared');
    res.json({ success: true, message: 'Workspace cleared' });
  });

  // Generate demo samples (supports 15, 50, 100 files for stress testing!)
  router.post('/demo-samples', async (req, res) => {
    try {
      const count = Math.min(100, Math.max(1, parseInt(req.body.count || 15)));
      const demoSubdir = path.join(uploadsDir, `demo_${Date.now()}`);
      
      const outJson = await runPython(['generate_samples', demoSubdir, count.toString()]);
      const result = JSON.parse(outJson);

      const addedRecords = [];
      for (const item of result.samples) {
        const record = await registerFile(item.path, item.filename);
        addedRecords.push(record);
      }

      if (io) io.emit('workspace:batch_added', { files: addedRecords });

      res.json({
        success: true,
        count: addedRecords.length,
        files: addedRecords
      });
    } catch (err) {
      console.error('Demo samples error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Trigger Conversion Job
  router.post('/jobs/convert', (req, res) => {
    try {
      const { fileIds, targetFormat, options = {} } = req.body;
      if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({ success: false, error: 'fileIds array is required' });
      }
      if (!targetFormat) {
        return res.status(400).json({ success: false, error: 'targetFormat is required' });
      }

      const files = [];
      for (const id of fileIds) {
        const f = filesMap.get(id);
        if (f) files.push(f);
      }

      if (files.length === 0) {
        return res.status(400).json({ success: false, error: 'No matching files found in workspace' });
      }

      const job = jobQueue.createJob('convert', {
        files,
        targetFormat,
        options
      });

      res.json({ success: true, jobId: job.id, job });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Trigger Merge Job
  router.post('/jobs/merge', (req, res) => {
    try {
      const { fileIds, options = {} } = req.body;
      if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({ success: false, error: 'fileIds array is required' });
      }

      const files = [];
      for (const id of fileIds) {
        const f = filesMap.get(id);
        if (f) files.push(f);
      }

      if (files.length === 0) {
        return res.status(400).json({ success: false, error: 'No valid files selected for merge' });
      }

      const job = jobQueue.createJob('merge', {
        files,
        options
      });

      res.json({ success: true, jobId: job.id, job });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Trigger PDF Compression Job
  router.post('/jobs/compress', (req, res) => {
    try {
      const { fileId, level = 'balanced' } = req.body;
      const file = filesMap.get(fileId);
      if (!file) return res.status(404).json({ success: false, error: 'File not found' });

      const job = jobQueue.createJob('compress', {
        file,
        level
      });

      res.json({ success: true, jobId: job.id, job });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Save Edited PDF from PDF Editor
  router.post('/jobs/save-pdf-edit', async (req, res) => {
    try {
      const { originalFileId, filename, pdfBase64, pagesModified } = req.body;
      if (!pdfBase64) {
        return res.status(400).json({ success: false, error: 'PDF data is required' });
      }

      const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');
      const safeName = filename || `Edited_Document_${Date.now()}.pdf`;
      const outPath = path.join(uploadsDir, `edited_${Date.now()}_${safeName}`);

      fs.writeFileSync(outPath, buffer);

      const record = await registerFile(outPath, safeName);
      if (io) io.emit('workspace:file_added', record);

      res.json({ success: true, file: record });
    } catch (err) {
      console.error('Error saving edited PDF:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get all jobs
  router.get('/jobs', (req, res) => {
    res.json({ success: true, jobs: jobQueue.getAllJobs() });
  });

  // Get single job status
  router.get('/jobs/:id', (req, res) => {
    const job = jobQueue.getJob(req.params.id);
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
    res.json({ success: true, job });
  });

  // Download converted or merged result
  router.get('/download/:jobId', (req, res) => {
    const job = jobQueue.getJob(req.params.jobId);
    if (!job) return res.status(404).send('Job not found');
    if (job.status !== 'completed' || !job.resultFile || !fs.existsSync(job.resultFile)) {
      return res.status(400).send('Job is not completed or result file is missing');
    }

    const filename = job.resultFilename || path.basename(job.resultFile);
    res.download(job.resultFile, filename);
  });

  // Download raw workspace file
  router.get('/download-file/:fileId', (req, res) => {
    const file = filesMap.get(req.params.fileId);
    if (!file || !fs.existsSync(file.storagePath)) {
      return res.status(404).send('File not found');
    }
    res.download(file.storagePath, file.originalName);
  });

  // Stream raw file content for in-browser viewer
  router.get('/file-content/:fileId', (req, res) => {
    const file = filesMap.get(req.params.fileId);
    if (!file || !fs.existsSync(file.storagePath)) {
      return res.status(404).send('File not found');
    }

    if (file.ext === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
    } else if (file.category === 'image') {
      res.setHeader('Content-Type', `image/${file.ext === 'jpg' ? 'jpeg' : file.ext}`);
    } else if (file.ext === 'html') {
      res.setHeader('Content-Type', 'text/html');
    } else if (file.ext === 'txt' || file.ext === 'csv' || file.ext === 'md') {
      res.setHeader('Content-Type', 'text/plain');
    }

    res.sendFile(file.storagePath);
  });

  // Serve thumbnail
  router.get('/thumbnail/:fileId', (req, res) => {
    const thumbPath = path.join(thumbsDir, `${req.params.fileId}.png`);
    if (fs.existsSync(thumbPath)) {
      res.setHeader('Content-Type', 'image/png');
      res.sendFile(thumbPath);
    } else {
      // Fallback SVG icon based on file type
      const file = filesMap.get(req.params.fileId);
      const ext = file ? file.ext.toUpperCase() : 'FILE';
      const color = file && file.category === 'pdf' ? '#ef4444' : (file && file.category === 'image' ? '#10b981' : '#3b82f6');
      
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150">
        <rect width="200" height="150" fill="#f1f5f9" rx="8"/>
        <rect x="75" y="40" width="50" height="60" rx="4" fill="${color}" opacity="0.15"/>
        <rect x="75" y="40" width="50" height="60" rx="4" fill="none" stroke="${color}" stroke-width="2"/>
        <text x="100" y="75" font-family="-apple-system, sans-serif" font-weight="700" font-size="14" fill="${color}" text-anchor="middle">${ext}</text>
      </svg>`;
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(svg);
    }
  });

  // ==========================================
  // GOOGLE AUTHENTICATION ENDPOINTS
  // ==========================================
  let currentUser = null;
  let customGoogleClientId = process.env.GOOGLE_CLIENT_ID || '';

  function parseJwt(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
  }

  router.get('/auth/config', (req, res) => {
    res.json({
      success: true,
      clientId: customGoogleClientId || null
    });
  });

  router.post('/auth/config', (req, res) => {
    const { clientId } = req.body;
    if (clientId) {
      customGoogleClientId = clientId.trim();
    }
    res.json({ success: true, clientId: customGoogleClientId });
  });

  router.post('/auth/google', (req, res) => {
    try {
      const { credential, profile } = req.body;
      let userData = null;

      if (credential) {
        const decoded = parseJwt(credential);
        if (decoded) {
          userData = {
            id: decoded.sub,
            email: decoded.email,
            name: decoded.name || decoded.email.split('@')[0],
            picture: decoded.picture || null,
            plan: 'Pro Unlimited',
            authenticatedVia: 'Google'
          };
        }
      }

      if (!userData && profile) {
        userData = {
          id: profile.id || 'google_user_' + Date.now(),
          email: profile.email || 'user@gmail.com',
          name: profile.name || 'Google User',
          picture: profile.picture || null,
          plan: 'Pro Unlimited',
          authenticatedVia: 'Google'
        };
      }

      if (!userData) {
        return res.status(400).json({ success: false, error: 'Invalid Google credential' });
      }

      currentUser = userData;
      if (io) io.emit('user:authenticated', currentUser);

      res.json({ success: true, user: currentUser });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.get('/auth/me', (req, res) => {
    res.json({ success: true, user: currentUser });
  });

  router.post('/auth/logout', (req, res) => {
    currentUser = null;
    if (io) io.emit('user:logged_out');
    res.json({ success: true, message: 'Logged out successfully' });
  });

  return router;
}

module.exports = createConverterRoutes;
