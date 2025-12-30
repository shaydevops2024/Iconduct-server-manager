const express = require('express');
const router = express.Router();
const dllManager = require('../services/dllManager');
const sshService = require('../services/sshService');

/**
 * GET /api/dlls
 * Get all DLLs from all servers
 */
router.get('/', async (req, res) => {
  try {
    const dlls = await dllManager.getAllDLLs();
    res.json({
      success: true,
      data: dlls
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dlls/summary
 * Get aggregated DLL summary across all servers
 */
router.get('/summary', async (req, res) => {
  try {
    const summary = await dllManager.getDLLSummary();
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dlls/server/:serverName
 * Get DLLs from a specific server
 */
router.get('/server/:serverName', async (req, res) => {
  try {
    const { serverName } = req.params;
    const servers = sshService.getAllServers();
    const server = servers.find(s => s.name === serverName);
    
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found'
      });
    }

    const dlls = await dllManager.getServerDLLs(server);
    res.json({
      success: true,
      serverName,
      data: dlls
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dlls/details/:dllName
 * Get details for a specific DLL across all servers
 */
router.get('/details/:dllName', async (req, res) => {
  try {
    const { dllName } = req.params;
    const details = await dllManager.getDLLDetails(dllName);
    
    res.json({
      success: true,
      dllName,
      data: details
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dlls/compare/:dllName
 * Compare versions of a specific DLL across servers
 */
router.get('/compare/:dllName', async (req, res) => {
  try {
    const { dllName } = req.params;
    const details = await dllManager.getDLLDetails(dllName);
    
    // Group by version
    const versionMap = new Map();
    details.forEach(dll => {
      if (!versionMap.has(dll.Version)) {
        versionMap.set(dll.Version, []);
      }
      versionMap.get(dll.Version).push({
        server: dll.server,
        serverGroup: dll.serverGroup,
        folder: dll.Folder,
        lastModified: dll.LastModified
      });
    });

    const comparison = Array.from(versionMap.entries()).map(([version, servers]) => ({
      version,
      servers,
      count: servers.length
    })).sort((a, b) => dllManager.compareVersions(b.version, a.version));

    res.json({
      success: true,
      dllName,
      data: {
        totalServers: details.length,
        uniqueVersions: comparison.length,
        versions: comparison
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;