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
 * Get list of available server groups
 */
router.get('/server-groups', async (req, res) => {
  try {
    const groups = sshService.getServerGroups();

    res.json({
      success: true,
      groups: groups
    });
  } catch (error) {
    console.error('Error fetching server groups:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get backend server for a specific group
 */
router.get('/servers/:groupName', async (req, res) => {
  try {
    const { groupName } = req.params;
    const servers = sshService.getServersByGroup(groupName);
    
    // Get the backend server (not frontend)
    const backendServer = servers.find(s => !s.name.includes('FE'));

    if (!backendServer) {
      return res.status(404).json({
        success: false,
        error: `No backend server found for group: ${groupName}`
      });
    }

    res.json({
      success: true,
      server: backendServer
    });
  } catch (error) {
    console.error('Error fetching server:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get frontend servers for a specific group
 */
router.get('/frontend-servers/:groupName', async (req, res) => {
  try {
    const { groupName } = req.params;
    const servers = sshService.getAllServers();
    
    // Get backend server that has frontendServers
    const backendServer = servers.find(s => s.group === groupName && s.frontendServers);
    
    if (!backendServer || !backendServer.frontendServers) {
      return res.json({
        success: true,
        servers: []
      });
    }

    res.json({
      success: true,
      servers: backendServer.frontendServers || []
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
 * Execute multi-server upgrade (MAIN ROUTE)
 */
router.post('/execute-multi', async (req, res) => {
  try {
    const { serverGroup, selectedServers, s3Keys } = req.body;

    if (!serverGroup) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: serverGroup'
      });
    }

    if (!selectedServers || typeof selectedServers !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid selectedServers'
      });
    }

    if (!s3Keys || typeof s3Keys !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid s3Keys'
      });
    }

    // Get all servers for this group
    const allServers = sshService.getAllServers();
    const groupServers = allServers.filter(s => s.group === serverGroup);
    
    if (groupServers.length === 0) {
      return res.status(404).json({
        success: false,
        error: `No servers found for group: ${serverGroup}`
      });
    }

    // Get backend server
    const backendServer = groupServers.find(s => !s.name.includes('FE'));
    
    // Get frontend servers from backend server's frontendServers array
    let frontendServers = [];
    if (backendServer && backendServer.frontendServers) {
      frontendServers = backendServer.frontendServers;
    }

    const serverConfigs = {
      backend: selectedServers.backend && backendServer ? backendServer : null,
      fe1: selectedServers.fe1 && frontendServers[0] ? frontendServers[0] : null,
      fe2: selectedServers.fe2 && frontendServers[1] ? frontendServers[1] : null,
      newUI: selectedServers.newUI && frontendServers[0] ? frontendServers[0] : null, // New UI is on FE1
    };

    // Validate that selected servers exist
    if (selectedServers.backend && !serverConfigs.backend) {
      return res.status(404).json({
        success: false,
        error: `Backend server not found in group: ${serverGroup}`
      });
    }
    if (selectedServers.fe1 && !serverConfigs.fe1) {
      return res.status(404).json({
        success: false,
        error: `Frontend server 1 not found in group: ${serverGroup}`
      });
    }
    if (selectedServers.fe2 && !serverConfigs.fe2) {
      return res.status(404).json({
        success: false,
        error: `Frontend server 2 not found in group: ${serverGroup}`
      });
    }
    if (selectedServers.newUI && !serverConfigs.newUI) {
      return res.status(404).json({
        success: false,
        error: `New UI server (FE1) not found in group: ${serverGroup}`
      });
    }

    // Validate required files are uploaded
    if (selectedServers.backend && !s3Keys.backend) {
      return res.status(400).json({
        success: false,
        error: 'Backend S3 key is required for backend upgrade'
      });
    }

    if ((selectedServers.fe1 || selectedServers.fe2) && !s3Keys.oldUI) {
      return res.status(400).json({
        success: false,
        error: 'Old UI S3 key is required for frontend upgrade'
      });
    }

    if (selectedServers.newUI && !s3Keys.newUI) {
      return res.status(400).json({
        success: false,
        error: 'New UI S3 key is required for New UI upgrade'
      });
    }

    console.log(`Starting multi-server upgrade for group: ${serverGroup}`);
    console.log('Selected servers:', selectedServers);
    console.log('S3 keys:', s3Keys);

    // Execute multi-server upgrade
    const result = await upgradeService.executeMultiServerUpgrade(serverGroup, selectedServers, serverConfigs, s3Keys);

    res.json({
      success: true,
      result: result
    });

  } catch (error) {
    console.error('Multi-server upgrade execution error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Multi-server upgrade failed',
      phases: error.phases || []
    });
  }
});

/**
 * Get upgrade status (for live polling)
 */
router.get('/status/:upgradeKey', async (req, res) => {
  try {
    const { upgradeKey } = req.params;
    
    const status = upgradeService.getUpgradeStatus(upgradeKey);
    
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
 * Get upgrade logs for a server or upgrade key (most recent)
 */
router.get('/logs/:serverNameOrKey', async (req, res) => {
  try {
    const { serverNameOrKey } = req.params;
    
    const logs = await upgradeService.getUpgradeLogs(serverNameOrKey);
    
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