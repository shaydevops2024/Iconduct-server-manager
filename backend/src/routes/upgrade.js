// Full path: backend/src/routes/upgrade.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const sshService = require('../services/sshService');
const upgradeService = require('../services/upgradeService');
const s3UpgradeService = require('../services/s3UpgradeService');

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Get list of available servers for upgrade (BACKEND ONLY)
 */
router.get('/servers', async (req, res) => {
  try {
    const servers = sshService.getAllServers();
    
    // Filter to only backend servers (exclude frontend)
    const backendServers = servers.filter(server => server.group !== 'frontend');

    res.json({
      success: true,
      servers: backendServers
    });
  } catch (error) {
    console.error('Error fetching servers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get list of frontend servers (for Old UI upgrade) - NEW ROUTE
 */
router.get('/frontend-servers', async (req, res) => {
  try {
    const servers = sshService.getAllServers();
    
    // Get frontend servers from the first backend server's frontendServers array
    const backendWithFE = servers.find(server => server.frontendServers && server.frontendServers.length > 0);
    
    if (!backendWithFE) {
      return res.json({
        success: true,
        servers: []
      });
    }

    res.json({
      success: true,
      servers: backendWithFE.frontendServers || []
    });
  } catch (error) {
    console.error('Error fetching frontend servers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get pre-signed S3 upload URL
 */
router.post('/get-upload-url', async (req, res) => {
  try {
    const { fileName, fileType, componentType } = req.body;

    if (!fileName || !componentType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: fileName, componentType'
      });
    }

    const result = await s3UpgradeService.getUploadUrl(fileName, fileType, componentType);

    res.json({
      success: true,
      uploadUrl: result.uploadUrl,
      s3Key: result.key
    });
  } catch (error) {
    console.error('Error generating upload URL:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Delete uploaded file from S3
 */
router.post('/delete-upload', async (req, res) => {
  try {
    const { s3Key } = req.body;

    if (!s3Key) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: s3Key'
      });
    }

    await s3UpgradeService.deleteFile(s3Key);

    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Execute backend upgrade (UNCHANGED - ORIGINAL)
 */
router.post('/execute', async (req, res) => {
  try {
    const { serverName, s3Keys } = req.body;

    if (!serverName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: serverName'
      });
    }

    if (!s3Keys || typeof s3Keys !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid s3Keys'
      });
    }

    // Get server config from sshService
    const allServers = sshService.getAllServers();
    const serverConfig = allServers.find(s => s.name === serverName);
    if (!serverConfig) {
      return res.status(404).json({
        success: false,
        error: `Server not found: ${serverName}`
      });
    }

    console.log(`Starting upgrade for ${serverName}`);

    // Execute upgrade
    const result = await upgradeService.executeUpgrade(serverConfig, s3Keys);

    res.json({
      success: true,
      result: result
    });

  } catch (error) {
    console.error('Upgrade execution error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Upgrade failed',
      phases: error.phases || []
    });
  }
});

/**
 * Execute Old UI upgrade (runs on all FE servers) - NEW ROUTE
 */
router.post('/execute-old-ui', async (req, res) => {
  try {
    const { s3Keys } = req.body;

    if (!s3Keys || typeof s3Keys !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid s3Keys'
      });
    }

    if (!s3Keys.oldUI) {
      return res.status(400).json({
        success: false,
        error: 'Old UI S3 key is required'
      });
    }

    // Get frontend servers from config
    const allServers = sshService.getAllServers();
    const backendWithFE = allServers.find(server => server.frontendServers && server.frontendServers.length > 0);
    
    if (!backendWithFE || !backendWithFE.frontendServers || backendWithFE.frontendServers.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No frontend servers configured'
      });
    }

    const frontendServers = backendWithFE.frontendServers;

    console.log(`Starting Old UI upgrade for ${frontendServers.length} frontend server(s)`);

    // Execute Old UI upgrade
    const result = await upgradeService.executeOldUIUpgrade(frontendServers, s3Keys);

    res.json({
      success: true,
      result: result
    });

  } catch (error) {
    console.error('Old UI upgrade execution error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Old UI upgrade failed',
      phases: error.phases || []
    });
  }
});

/**
 * Get upgrade status (for live polling)
 */
router.get('/status/:serverName', async (req, res) => {
  try {
    const { serverName } = req.params;
    
    const status = upgradeService.getUpgradeStatus(serverName);
    
    if (!status) {
      return res.json({
        success: true,
        status: 'idle',
        phases: []
      });
    }
    
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('Error getting upgrade status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get upgrade logs for a server (most recent)
 */
router.get('/logs/:serverName', async (req, res) => {
  try {
    const { serverName } = req.params;
    
    const logs = await upgradeService.getUpgradeLogs(serverName);
    
    res.json({
      success: true,
      logs: logs
    });
  } catch (error) {
    console.error('Error getting logs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * List all upgrade logs
 */
router.get('/logs', async (req, res) => {
  try {
    const logsList = await upgradeService.listAllLogs();
    
    res.json({
      success: true,
      logs: logsList
    });
  } catch (error) {
    console.error('Error listing logs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get specific log file content
 */
router.get('/logs/file/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    const logContent = await upgradeService.getLogContent(filename);
    
    res.json({
      success: true,
      logs: logContent
    });
  } catch (error) {
    console.error('Error getting log file:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Delete log file
 */
router.delete('/logs/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    await upgradeService.deleteLog(filename);
    
    res.json({
      success: true,
      message: 'Log deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting log:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;