// Full path: backend/src/routes/dlls.js

const express = require('express');
const router = express.Router();
const dllManager = require('../services/dllManager');
const sshService = require('../services/sshService');
const dbService = require('../services/dbService');

router.get('/', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const dlls = await dllManager.getAllDLLs(forceRefresh);
    
    const lastRefresh = await dbService.getDLLLastRefresh();
    
    res.json({
      success: true,
      data: dlls,
      lastRefresh: lastRefresh,
      cached: !forceRefresh
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    console.log('\n🔄 Manual refresh requested\n');
    const dlls = await dllManager.getAllDLLs(true);
    
    const lastRefresh = await dbService.getDLLLastRefresh();
    
    res.json({
      success: true,
      data: dlls,
      lastRefresh: lastRefresh,
      message: 'DLL data refreshed successfully'
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
    const { sourceServer, targetServer, targetServers, dllName, version } = req.body;

    // Handle both single server (backward compatibility) and multiple servers
    let targets = [];
    if (targetServers && Array.isArray(targetServers)) {
      targets = targetServers;
    } else if (targetServer) {
      targets = [targetServer];
    }

    if (!sourceServer || targets.length === 0 || !dllName || !version) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sourceServer, targetServer(s), dllName, version'
      });
    }

    const servers = sshService.getAllServers();
    const sourceServerConfig = servers.find(s => s.name === sourceServer);

    if (!sourceServerConfig) {
      return res.status(404).json({
        success: false,
        error: `Source server not found: ${sourceServer}`
      });
    }

    if (!sourceServerConfig.dllPath) {
      return res.status(400).json({
        success: false,
        error: `Source server ${sourceServer} does not have dllPath configured`
      });
    }

    // Validate all target servers
    const targetServerConfigs = [];
    for (const target of targets) {
      const config = servers.find(s => s.name === target);
      if (!config) {
        return res.status(404).json({
          success: false,
          error: `Target server not found: ${target}`
        });
      }
      if (!config.dllPath) {
        return res.status(400).json({
          success: false,
          error: `Target server ${target} does not have dllPath configured`
        });
      }
      targetServerConfigs.push(config);
    }

    console.log(`\n========================================`);
    console.log(`MULTI-SERVER DLL DEPLOYMENT`);
    console.log(`========================================`);
    console.log(`Source: ${sourceServer}`);
    console.log(`Targets: ${targets.join(', ')}`);
    console.log(`DLL: ${dllName}`);
    console.log(`Version: ${version}`);
    console.log(`========================================\n`);

    // Deploy to each target server
    const results = [];
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < targetServerConfigs.length; i++) {
      const targetConfig = targetServerConfigs[i];
      console.log(`\n[${i + 1}/${targetServerConfigs.length}] Deploying to ${targetConfig.name}...`);
      
      try {
        const result = await dllManager.updateDLL(
          sourceServerConfig,
          targetConfig,
          dllName,
          version
        );

        results.push({
          success: true,
          targetServer: targetConfig.name,
          data: result
        });
        successCount++;
        console.log(`✅ [${i + 1}/${targetServerConfigs.length}] Success: ${targetConfig.name}\n`);
      } catch (error) {
        results.push({
          success: false,
          targetServer: targetConfig.name,
          error: error.message
        });
        failureCount++;
        console.error(`❌ [${i + 1}/${targetServerConfigs.length}] Failed: ${targetConfig.name} - ${error.message}\n`);
      }
    }

    console.log(`\n========================================`);
    console.log(`DEPLOYMENT SUMMARY`);
    console.log(`========================================`);
    console.log(`Total Servers: ${targetServerConfigs.length}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${failureCount}`);
    console.log(`========================================\n`);

    // Return overall success if at least one deployment succeeded
    const overallSuccess = successCount > 0;
    const message = successCount === targetServerConfigs.length
      ? `Successfully deployed DLL ${dllName} version ${version} to all ${successCount} servers`
      : failureCount === targetServerConfigs.length
        ? `Failed to deploy DLL ${dllName} to all servers`
        : `Deployed DLL ${dllName} version ${version} to ${successCount}/${targetServerConfigs.length} servers`;

    res.json({
      success: overallSuccess,
      message: message,
      results: results,
      summary: {
        total: targetServerConfigs.length,
        successful: successCount,
        failed: failureCount
      }
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