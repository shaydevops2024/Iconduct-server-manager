// Full path: backend/src/routes/dlls.js

const express = require('express');
const router = express.Router();
const dllManager = require('../services/dllManager');
const sshService = require('../services/sshService');

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

router.get('/compare/:dllName', async (req, res) => {
  try {
    const { dllName } = req.params;
    const details = await dllManager.getDLLDetails(dllName);
    
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

router.post('/update', async (req, res) => {
  try {
    const { sourceServer, targetServer, dllName, version } = req.body;

    if (!sourceServer || !targetServer || !dllName || !version) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sourceServer, targetServer, dllName, version'
      });
    }

    const servers = sshService.getAllServers();
    const sourceServerConfig = servers.find(s => s.name === sourceServer);
    const targetServerConfig = servers.find(s => s.name === targetServer);

    if (!sourceServerConfig) {
      return res.status(404).json({
        success: false,
        error: `Source server not found: ${sourceServer}`
      });
    }

    if (!targetServerConfig) {
      return res.status(404).json({
        success: false,
        error: `Target server not found: ${targetServer}`
      });
    }

    if (!sourceServerConfig.dllPath) {
      return res.status(400).json({
        success: false,
        error: `Source server ${sourceServer} does not have dllPath configured`
      });
    }

    if (!targetServerConfig.dllPath) {
      return res.status(400).json({
        success: false,
        error: `Target server ${targetServer} does not have dllPath configured`
      });
    }

    const result = await dllManager.updateDLL(
      sourceServerConfig,
      targetServerConfig,
      dllName,
      version
    );

    res.json({
      success: true,
      message: `Successfully copied DLL ${dllName} version ${version} from ${sourceServer} to ${targetServer}`,
      data: result
    });

  } catch (error) {
    console.error('DLL update error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;