import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Maximum file size: 100 Megabytes
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

// Ensure required directories exist
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');
const METADATA_FILE = path.join(DATA_DIR, 'files.json');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Database helper functions (Atomic JSON Storage)
function loadMetadata() {
  try {
    if (!fs.existsSync(METADATA_FILE)) {
      fs.writeFileSync(METADATA_FILE, JSON.stringify({ files: [] }, null, 2));
      return { files: [] };
    }
    const data = fs.readFileSync(METADATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading metadata file, initializing fresh:', err);
    return { files: [] };
  }
}

function saveMetadata(data) {
  try {
    const tempFile = `${METADATA_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempFile, METADATA_FILE);
  } catch (err) {
    console.error('Error saving metadata file:', err);
  }
}

// Generate unique 6-digit numeric code (e.g. "492815")
function generateUniqueCode(existingFiles) {
  const activeCodes = new Set(existingFiles.map(f => f.code));
  let code = '';
  let attempts = 0;

  do {
    // Generate 6 random digits
    const num = crypto.randomInt(100000, 999999);
    code = num.toString();
    attempts++;
  } while (activeCodes.has(code) && attempts < 1000);

  return code;
}

// Expiration calculator in milliseconds
function calculateExpirationDate(durationStr) {
  const now = Date.now();
  switch (durationStr) {
    case '1h': // 1 hour (useful for testing or quick burn)
      return new Date(now + 60 * 60 * 1000).toISOString();
    case '1d': // 1 day (24 hours)
      return new Date(now + 24 * 60 * 60 * 1000).toISOString();
    case '1w': // 1 week (7 days)
      return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    case '1m': // 1 month (30 days)
      return new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
    default:
      // Default to 1 day if unrecognized
      return new Date(now + 24 * 60 * 60 * 1000).toISOString();
  }
}

// Background cleanup routine for expired files
function cleanupExpiredFiles() {
  const metadata = loadMetadata();
  const now = new Date();
  let changed = false;

  const validFiles = [];

  for (const file of metadata.files) {
    const expiresAt = new Date(file.expiresAt);
    if (expiresAt <= now) {
      console.log(`[Auto-Cleanup] Deleting expired file code: ${file.code} (${file.originalName})`);
      try {
        const filePath = path.join(UPLOADS_DIR, file.storedFilename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.error(`Failed to delete expired file on disk: ${file.storedFilename}`, err);
      }
      changed = true;
    } else {
      validFiles.push(file);
    }
  }

  if (changed) {
    metadata.files = validFiles;
    saveMetadata(metadata);
  }
}

// Run cleanup every 5 minutes and on server launch
cleanupExpiredFiles();
setInterval(cleanupExpiredFiles, 5 * 60 * 1000);

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // Generate safe unique storage name while keeping extension
    const ext = path.extname(file.originalname);
    const uniqueId = crypto.randomUUID();
    cb(null, `${Date.now()}-${uniqueId}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES, // 100 MB
    files: 1
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes

// 1. Get service status & config limits
app.get('/api/stats', (req, res) => {
  const metadata = loadMetadata();
  res.json({
    maxSizeBytes: MAX_FILE_SIZE_BYTES,
    maxSizeFormatted: '100 MB',
    activeTransfers: metadata.files.length
  });
});

// 2. Upload file
app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'File size exceeds 100 MB limit. Please select a smaller file.'
        });
      }
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(500).json({ error: `Unexpected error: ${err.message}` });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file was provided.' });
    }

    try {
      const metadata = loadMetadata();
      const code = generateUniqueCode(metadata.files);
      const duration = req.body.duration || '1d';
      const burnAfterDownload = req.body.burnAfterDownload === 'true' || req.body.burnAfterDownload === true;
      const expiresAt = calculateExpirationDate(duration);

      const fileRecord = {
        code,
        id: crypto.randomUUID(),
        originalName: req.file.originalname,
        storedFilename: req.file.filename,
        mimeType: req.file.mimetype || 'application/octet-stream',
        size: req.file.size,
        createdAt: new Date().toISOString(),
        expiresAt,
        duration,
        burnAfterDownload,
        downloadCount: 0
      };

      metadata.files.push(fileRecord);
      saveMetadata(metadata);

      // Determine client host URL for direct links & QR codes
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const baseUrl = `${protocol}://${host}`;
      const directUrl = `${baseUrl}/#receive?code=${code}`;

      // Generate QR Code data URL
      const qrCodeDataUrl = await QRCode.toDataURL(directUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      });

      console.log(`[Upload Success] Code: ${code} | File: ${fileRecord.originalName} (${(fileRecord.size / (1024 * 1024)).toFixed(2)} MB) | Expiry: ${expiresAt}`);

      res.status(201).json({
        success: true,
        code,
        file: {
          originalName: fileRecord.originalName,
          size: fileRecord.size,
          expiresAt: fileRecord.expiresAt,
          duration: fileRecord.duration,
          burnAfterDownload: fileRecord.burnAfterDownload
        },
        directUrl,
        qrCodeUrl: qrCodeDataUrl
      });
    } catch (uploadError) {
      console.error('Upload processing error:', uploadError);
      // Clean up uploaded file on disk if registration failed
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
      res.status(500).json({ error: 'Failed to process file upload.' });
    }
  });
});

// 3. Inspect file info by code (pre-download check)
app.get('/api/info/:code', (req, res) => {
  const code = (req.params.code || '').trim().replace(/[-\s]/g, '');
  const metadata = loadMetadata();
  const fileRecord = metadata.files.find(f => f.code === code);

  if (!fileRecord) {
    return res.status(404).json({
      error: 'Code not found. Please verify the 6-digit code.'
    });
  }

  const now = new Date();
  const expiresAt = new Date(fileRecord.expiresAt);

  if (expiresAt <= now) {
    // Already expired - trigger background cleanup
    cleanupExpiredFiles();
    return res.status(410).json({
      error: 'This file has expired and is no longer available for download.'
    });
  }

  const filePath = path.join(UPLOADS_DIR, fileRecord.storedFilename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      error: 'File data is no longer present on the server.'
    });
  }

  const timeRemainingMs = Math.max(0, expiresAt.getTime() - now.getTime());

  res.json({
    success: true,
    code: fileRecord.code,
    originalName: fileRecord.originalName,
    size: fileRecord.size,
    mimeType: fileRecord.mimeType,
    createdAt: fileRecord.createdAt,
    expiresAt: fileRecord.expiresAt,
    timeRemainingMs,
    burnAfterDownload: fileRecord.burnAfterDownload,
    downloadCount: fileRecord.downloadCount
  });
});

// 4. Download file by code
app.get('/api/download/:code', (req, res) => {
  const code = (req.params.code || '').trim().replace(/[-\s]/g, '');
  const metadata = loadMetadata();
  const fileRecordIndex = metadata.files.findIndex(f => f.code === code);

  if (fileRecordIndex === -1) {
    return res.status(404).json({ error: 'Invalid or expired download code.' });
  }

  const fileRecord = metadata.files[fileRecordIndex];
  const now = new Date();
  const expiresAt = new Date(fileRecord.expiresAt);

  if (expiresAt <= now) {
    cleanupExpiredFiles();
    return res.status(410).json({ error: 'This file has expired.' });
  }

  const filePath = path.join(UPLOADS_DIR, fileRecord.storedFilename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on server.' });
  }

  // Increment download count
  fileRecord.downloadCount = (fileRecord.downloadCount || 0) + 1;
  saveMetadata(metadata);

  // Set download headers properly (encoded filename handles unicode & spaces)
  res.setHeader('Content-Type', fileRecord.mimeType || 'application/octet-stream');
  res.setHeader('Content-Length', fileRecord.size);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(fileRecord.originalName)}"; filename*=UTF-8''${encodeURIComponent(fileRecord.originalName)}`
  );

  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);

  fileStream.on('end', () => {
    console.log(`[Download Success] Code: ${code} | File: ${fileRecord.originalName}`);
    // If burn after download is active, remove immediately
    if (fileRecord.burnAfterDownload) {
      console.log(`[Burn After Download] Removing file ${fileRecord.code}`);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        const updatedMetadata = loadMetadata();
        updatedMetadata.files = updatedMetadata.files.filter(f => f.code !== code);
        saveMetadata(updatedMetadata);
      } catch (err) {
        console.error('Error during burn after download removal:', err);
      }
    }
  });

  fileStream.on('error', (err) => {
    console.error('File stream error during download:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error streaming file.' });
    }
  });
});

// 5. Delete file manually (if sender wants to cancel/delete before expiry)
app.delete('/api/file/:code', (req, res) => {
  const code = (req.params.code || '').trim().replace(/[-\s]/g, '');
  const metadata = loadMetadata();
  const fileRecordIndex = metadata.files.findIndex(f => f.code === code);

  if (fileRecordIndex === -1) {
    return res.status(404).json({ error: 'Code not found.' });
  }

  const [removedFile] = metadata.files.splice(fileRecordIndex, 1);
  saveMetadata(metadata);

  try {
    const filePath = path.join(UPLOADS_DIR, removedFile.storedFilename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error('Error deleting file manually:', err);
  }

  res.json({ success: true, message: 'File deleted successfully.' });
});

// Fallback for SPA routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 QuickDrop server running at http://localhost:${PORT}`);
  console.log(`📁 File uploads directory: ${UPLOADS_DIR}`);
  console.log(`⏱️ Max file limit: 100 MB | Expiry options: 1 Day, 1 Week, 1 Month`);
});
