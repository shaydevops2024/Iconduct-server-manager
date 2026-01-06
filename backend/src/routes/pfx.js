// Full path: backend/src/routes/pfx.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);

// Configure multer for file uploads (store in memory temporarily)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Only allow .crt files
    if (file.originalname.toLowerCase().endsWith('.crt')) {
      cb(null, true);
    } else {
      cb(new Error('Only .crt files are allowed'));
    }
  }
});

// Static key file path (must be placed manually, excluded from git)
const STATIC_KEY_PATH = path.join(__dirname, '../../config/ssl/iconductcloud22.key');

// Output directory for generated PFX files
const PFX_OUTPUT_DIR = path.join(__dirname, '../../pfx-output');

// Ensure output directory exists
const ensureOutputDir = async () => {
  try {
    await fs.access(PFX_OUTPUT_DIR);
  } catch {
    await fs.mkdir(PFX_OUTPUT_DIR, { recursive: true });
    console.log(`✅ Created PFX output directory: ${PFX_OUTPUT_DIR}`);
  }
};

// Check if static key file exists
const checkKeyFileExists = async () => {
  try {
    await fs.access(STATIC_KEY_PATH);
    return true;
  } catch {
    return false;
  }
};

/**
 * POST /api/pfx/create
 * Create PFX file from uploaded .crt file + static .key file
 */
router.post('/create', upload.single('crtFile'), async (req, res) => {
  let tempCrtPath = null;
  let tempPfxPath = null;

  try {
    // Validate uploaded file
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No .crt file uploaded'
      });
    }

    // Validate PFX password
    const pfxPassword = req.body.pfxPassword;
    if (!pfxPassword || pfxPassword.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'PFX password is required'
      });
    }

    // Get key password (optional - empty string if not provided)
    const keyPassword = req.body.keyPassword || '';

    // Check if static key file exists
    const keyExists = await checkKeyFileExists();
    if (!keyExists) {
      return res.status(500).json({
        success: false,
        error: `Static key file not found at: ${STATIC_KEY_PATH}. Please place your private key file in backend/config/ssl/ directory.`
      });
    }

    // Ensure output directory exists
    await ensureOutputDir();

    // Generate unique filename for the PFX file
    const timestamp = Date.now();
    const originalName = req.file.originalname.replace('.crt', '');
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const pfxFilename = `${sanitizedName}_${timestamp}.pfx`;
    const pfxOutputPath = path.join(PFX_OUTPUT_DIR, pfxFilename);

    // Create temporary .crt file
    const tempDir = path.join(__dirname, '../../temp');
    try {
      await fs.access(tempDir);
    } catch {
      await fs.mkdir(tempDir, { recursive: true });
    }
    
    tempCrtPath = path.join(tempDir, `temp_${timestamp}.crt`);
    await fs.writeFile(tempCrtPath, req.file.buffer);

    console.log(`\n========================================`);
    console.log(`🔐 Creating PFX file...`);
    console.log(`   CRT file: ${req.file.originalname}`);
    console.log(`   Key file: ${STATIC_KEY_PATH}`);
    console.log(`   Key encrypted: ${keyPassword ? 'Yes (password provided)' : 'No (or no password provided)'}`);
    console.log(`   Output: ${pfxOutputPath}`);
    console.log(`========================================\n`);

    // Check if OpenSSL is installed
    try {
      await execPromise('which openssl');
    } catch {
      return res.status(500).json({
        success: false,
        error: 'OpenSSL is not installed on the server. Please install it: apk add openssl'
      });
    }

    // Build OpenSSL command with proper password handling
    const escapedPfxPassword = pfxPassword.replace(/'/g, "'\\''");
    const escapedKeyPassword = keyPassword.replace(/'/g, "'\\''");
    
    // Build command parts
    let opensslCommand = `openssl pkcs12 -export -out "${pfxOutputPath}" -inkey "${STATIC_KEY_PATH}" -in "${tempCrtPath}"`;
    
    // Add key password if provided (for encrypted keys)
    if (keyPassword && keyPassword.trim().length > 0) {
      opensslCommand += ` -passin pass:'${escapedKeyPassword}'`;
    }
    
    // Add PFX output password
    opensslCommand += ` -passout pass:'${escapedPfxPassword}'`;
    
    // Redirect stderr to stdout to capture all output
    opensslCommand += ` 2>&1`;
    
    console.log(`🔧 Executing OpenSSL command...`);
    console.log(`   Command (passwords hidden): openssl pkcs12 -export -out "${pfxOutputPath}" -inkey "${STATIC_KEY_PATH}" -in "${tempCrtPath}" ${keyPassword ? '-passin pass:***' : ''} -passout pass:***`);
    
    try {
      const { stdout, stderr } = await execPromise(opensslCommand, {
        timeout: 30000, // 30 second timeout
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });
      
      // Log any output
      if (stdout && stdout.trim()) {
        console.log(`   OpenSSL output: ${stdout.trim()}`);
      }
      if (stderr && stderr.trim()) {
        console.log(`   OpenSSL stderr: ${stderr.trim()}`);
      }
      
      // Check if PFX file was created
      try {
        await fs.access(pfxOutputPath);
      } catch {
        throw new Error('PFX file was not created. This usually means:\n1. Certificate and private key do not match\n2. Wrong key password (if key is encrypted)\n3. Invalid certificate format');
      }

      // Get file stats
      const stats = await fs.stat(pfxOutputPath);
      const fileSizeKB = (stats.size / 1024).toFixed(2);

      console.log(`✅ PFX file created successfully!`);
      console.log(`   Size: ${fileSizeKB} KB`);
      console.log(`   Path: ${pfxOutputPath}`);
      console.log(`========================================\n`);

      // Return success response
      res.json({
        success: true,
        message: 'PFX file created successfully',
        data: {
          filename: pfxFilename,
          fullPath: pfxOutputPath,
          sizeKB: fileSizeKB,
          timestamp: new Date().toISOString()
        }
      });

    } catch (opensslError) {
      console.error('❌ OpenSSL error:', opensslError.message);
      
      let errorMessage = 'Failed to create PFX file';
      
      // Check for timeout
      if (opensslError.killed || opensslError.signal === 'SIGTERM') {
        errorMessage = 'OpenSSL command timed out after 30 seconds. Possible causes:\n1. Wrong key password (if key is encrypted)\n2. Certificate and key do not match\n3. OpenSSL is waiting for input';
      }
      // Check for password errors
      else if (opensslError.message.includes('bad decrypt') || opensslError.message.includes('bad password')) {
        errorMessage = 'Wrong key password. If your private key is encrypted, please provide the correct key password.';
      }
      // Check for certificate/key mismatch
      else if (opensslError.message.includes('unable to load') || opensslError.message.includes('no certificate matches')) {
        errorMessage = 'Certificate and private key do not match. Please verify you are using the correct certificate for this key.';
      }
      // Generic OpenSSL error
      else if (opensslError.message) {
        errorMessage = `OpenSSL error: ${opensslError.message}`;
      }
      
      throw new Error(errorMessage);
    }

  } catch (error) {
    console.error('❌ Error creating PFX:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create PFX file'
    });
  } finally {
    // Cleanup temporary files
    if (tempCrtPath) {
      try {
        await fs.unlink(tempCrtPath);
        console.log(`🧹 Cleaned up temporary .crt file`);
      } catch (e) {
        console.error('Failed to cleanup temp .crt file:', e);
      }
    }
  }
});

/**
 * GET /api/pfx/check-key
 * Check if static key file exists
 */
router.get('/check-key', async (req, res) => {
  try {
    const keyExists = await checkKeyFileExists();
    res.json({
      success: true,
      keyExists,
      keyPath: STATIC_KEY_PATH
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/pfx/list
 * List all generated PFX files
 */
router.get('/list', async (req, res) => {
  try {
    await ensureOutputDir();
    
    const files = await fs.readdir(PFX_OUTPUT_DIR);
    const pfxFiles = files.filter(f => f.endsWith('.pfx'));
    
    const fileDetails = await Promise.all(
      pfxFiles.map(async (filename) => {
        const fullPath = path.join(PFX_OUTPUT_DIR, filename);
        const stats = await fs.stat(fullPath);
        return {
          filename,
          fullPath,
          sizeKB: (stats.size / 1024).toFixed(2),
          created: stats.birthtime.toISOString()
        };
      })
    );

    // Sort by creation date (newest first)
    fileDetails.sort((a, b) => new Date(b.created) - new Date(a.created));

    res.json({
      success: true,
      data: {
        files: fileDetails,
        outputDirectory: PFX_OUTPUT_DIR
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/pfx/:filename
 * Delete a specific PFX file
 */
router.delete('/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    
    // Validate filename (security check)
    if (!filename.endsWith('.pfx') || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid filename'
      });
    }

    const filePath = path.join(PFX_OUTPUT_DIR, filename);
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Delete file
    await fs.unlink(filePath);
    
    console.log(`🗑️  Deleted PFX file: ${filename}`);

    res.json({
      success: true,
      message: 'PFX file deleted successfully',
      filename
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/pfx/download/:filename
 * Download a specific PFX file
 */
router.get('/download/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    
    // Validate filename (security check)
    if (!filename.endsWith('.pfx') || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid filename'
      });
    }

    const filePath = path.join(PFX_OUTPUT_DIR, filename);
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    console.log(`⬇️  Downloading PFX file: ${filename}`);

    // Set headers for download
    res.setHeader('Content-Type', 'application/x-pkcs12');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Stream the file
    const fileStream = require('fs').createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('Error downloading PFX:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;