const express = require('express');
const router = express.Router();
const multer = require('multer');
const configMerger = require('../services/configMerger');

// Configure multer for file uploads (in-memory storage)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

/**
 * POST /api/configs/merge/json
 * Merge multiple JSON files
 */
router.post('/merge/json', upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded'
      });
    }

    const files = req.files.map(file => ({
      filename: file.originalname,
      content: file.buffer.toString('utf8')
    }));

    const result = await configMerger.mergeJSONFiles(files);
    const stats = configMerger.getConfigStats(result.mergedConfig);

    res.json({
      success: true,
      data: {
        mergedConfig: result.mergedConfig,
        conflicts: result.conflicts,
        stats,
        filesProcessed: files.length
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
 * POST /api/configs/merge/xml
 * Merge multiple XML files
 */
router.post('/merge/xml', upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded'
      });
    }

    const files = req.files.map(file => ({
      filename: file.originalname,
      content: file.buffer.toString('utf8')
    }));

    const result = await configMerger.mergeXMLFiles(files);
    const stats = configMerger.getConfigStats(result.mergedConfig);

    res.json({
      success: true,
      data: {
        mergedConfig: result.mergedConfig,
        xmlOutput: result.xmlOutput,
        conflicts: result.conflicts,
        stats,
        filesProcessed: files.length
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
 * POST /api/configs/resolve
 * Resolve conflicts and get final merged config
 */
router.post('/resolve', async (req, res) => {
  try {
    const { mergedConfig, resolutions, format } = req.body;

    if (!mergedConfig) {
      return res.status(400).json({
        success: false,
        error: 'No merged config provided'
      });
    }

    let finalConfig = mergedConfig;
    if (resolutions && resolutions.length > 0) {
      finalConfig = configMerger.resolveConflicts(mergedConfig, resolutions);
    }

    const output = configMerger.exportConfig(finalConfig, format);
    const stats = configMerger.getConfigStats(finalConfig);

    res.json({
      success: true,
      data: {
        config: finalConfig,
        output,
        stats
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
 * POST /api/configs/export
 * Export merged config as downloadable file
 */
router.post('/export', async (req, res) => {
  try {
    const { config, format } = req.body;

    if (!config) {
      return res.status(400).json({
        success: false,
        error: 'No config provided'
      });
    }

    const output = configMerger.exportConfig(config, format);
    const extension = format === 'xml' ? 'xml' : 'json';
    const filename = `merged-config-${Date.now()}.${extension}`;

    res.setHeader('Content-Type', format === 'xml' ? 'application/xml' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(output);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;