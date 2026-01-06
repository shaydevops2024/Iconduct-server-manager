// Full path: backend/src/routes/ssl-deploy.js

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const sslDeployService = require('../services/sslDeployService');
const sshService = require('../services/sshService');

const PFX_OUTPUT_DIR = path.join(__dirname, '../../pfx-output');

/**
 * GET /api/ssl-deploy/pfx-list
 * Get list of available PFX files for deployment
 */
router.get('/pfx-list', async (req, res) => {
  try {
    // Check if directory exists
    try {
      await fs.access(PFX_OUTPUT_DIR);
    } catch {
      return res.json({
        success: true,
        data: []
      });
    }

    const files = await fs.readdir(PFX_OUTPUT_DIR);
    const pfxFiles = files.filter(f => f.endsWith('.pfx'));
    
    const fileDetails = await Promise.all(
      pfxFiles.map(async (filename) => {
        const fullPath = path.join(PFX_OUTPUT_DIR, filename);
        const stats = await fs.stat(fullPath);
        return {
          filename,
          sizeKB: (stats.size / 1024).toFixed(2),
          created: stats.birthtime.toISOString()
        };
      })
    );

    // Sort by creation date (newest first)
    fileDetails.sort((a, b) => new Date(b.created) - new Date(a.created));

    res.json({
      success: true,
      data: fileDetails
    });
  } catch (error) {
    console.error('Error listing PFX files:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/ssl-deploy/servers
 * Get list of available servers (backend and frontend)
 */
router.get('/servers', (req, res) => {
  try {
    const allServers = sshService.getAllServers();
    
    const servers = {
      backend: [],
      frontend: []
    };

    // Process each backend server
    allServers.forEach(server => {
      // Add backend server
      servers.backend.push({
        name: server.name,
        host: server.host,
        group: server.group,
        ssl: server.ssl || {
          opensslPath: "C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe",
          finalPath: "D:\\IConduct\\NatsCerts",
          tempPath: "D:\\IConduct\\NatsCerts\\temp",
          certFile: "iconductcloud22.crt",
          keyFile: "iconductcloud22.key"
        }
      });

      // Add frontend servers if they exist
      if (server.frontendServers && Array.isArray(server.frontendServers)) {
        server.frontendServers.forEach(feServer => {
          servers.frontend.push({
            name: feServer.name,
            host: feServer.host,
            group: server.group, // Inherit group from parent backend server
            port: feServer.port,
            username: feServer.username,
            password: feServer.password,
            privateKey: feServer.privateKey,
            ssl: feServer.ssl || {
              opensslPath: "C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe",
              finalPath: "C:\\IConduct\\NatsCert",
              tempPath: "C:\\IConduct\\NatsCert\\temp",
              certFile: "iconductcloud22.crt",
              keyFile: "iconductcloud22.key"
            }
          });
        });
      }
    });

    res.json({
      success: true,
      data: servers
    });
  } catch (error) {
    console.error('Error getting servers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/ssl-deploy/deploy
 * Deploy SSL certificate to selected servers
 */
router.post('/deploy', async (req, res) => {
  try {
    const { pfxFilename, pfxPassword, backendServers, frontendServers, ports } = req.body;

    // Validation
    if (!pfxFilename) {
      return res.status(400).json({
        success: false,
        error: 'PFX filename is required'
      });
    }

    if (!pfxPassword) {
      return res.status(400).json({
        success: false,
        error: 'PFX password is required'
      });
    }

    if (!backendServers || backendServers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one backend server must be selected'
      });
    }

    // Validate ports
    const selectedPorts = ports && ports.length > 0 ? ports : ['8443'];
    console.log('🔌 Selected ports:', selectedPorts.join(', '));

    // Verify PFX file exists
    const pfxPath = path.join(PFX_OUTPUT_DIR, pfxFilename);
    try {
      await fs.access(pfxPath);
    } catch {
      return res.status(404).json({
        success: false,
        error: `PFX file not found: ${pfxFilename}`
      });
    }

    console.log(`\n========================================`);
    console.log(`🚀 Starting SSL Deployment`);
    console.log(`   PFX: ${pfxFilename}`);
    console.log(`   Backend servers: ${backendServers.length}`);
    console.log(`   Frontend servers: ${frontendServers ? frontendServers.length : 0}`);
    console.log(`   🔌 Ports: ${selectedPorts.join(', ')}`);
    console.log(`========================================\n`);

    const deploymentResults = {
      success: true,
      backend: [],
      frontend: [],
      errors: []
    };

    // Get all server configurations
    const allServers = sshService.getAllServers();

    // Build a map of all frontend servers for easy lookup
    const frontendServerMap = new Map();
    allServers.forEach(server => {
      if (server.frontendServers && Array.isArray(server.frontendServers)) {
        server.frontendServers.forEach(feServer => {
          frontendServerMap.set(feServer.name, {
            ...feServer,
            parentBackend: server,
            ssl: feServer.ssl || {
              opensslPath: "C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe",
              finalPath: "C:\\IConduct\\NatsCert",
              tempPath: "C:\\IConduct\\NatsCert\\temp",
              certFile: "iconductcloud22.crt",
              keyFile: "iconductcloud22.key"
            }
          });
        });
      }
    });

    // Deploy to backend servers
    console.log(`📦 Deploying to backend servers...`);
    for (const serverName of backendServers) {
      try {
        const serverConfig = allServers.find(s => s.name === serverName);
        if (!serverConfig) {
          throw new Error(`Server configuration not found: ${serverName}`);
        }

        console.log(`\n🔄 Deploying to backend: ${serverName}`);
        const result = await sslDeployService.deployToBackend(serverConfig, pfxFilename, pfxPassword, selectedPorts);
        
        deploymentResults.backend.push(result);
        
        if (result.success) {
          console.log(`✅ ${serverName} - Deployment successful`);
        } else {
          console.error(`❌ ${serverName} - Deployment failed: ${result.error}`);
          deploymentResults.errors.push(`Backend ${serverName}: ${result.error}`);
        }
      } catch (error) {
        console.error(`❌ ${serverName} - Deployment error:`, error);
        deploymentResults.backend.push({
          server: serverName,
          success: false,
          error: error.message,
          steps: [{ step: 'Deployment failed', status: 'error', error: error.message }]
        });
        deploymentResults.errors.push(`Backend ${serverName}: ${error.message}`);
      }
    }

    // Deploy to frontend servers (if any successful backend deployments)
    const successfulBackends = deploymentResults.backend.filter(r => r.success);
    
    if (frontendServers && frontendServers.length > 0) {
      if (successfulBackends.length === 0) {
        deploymentResults.errors.push('Cannot deploy to frontend: No successful backend deployments');
        deploymentResults.success = false;
      } else {
        console.log(`\n🌐 Deploying to frontend servers...`);
        
        // Use first successful backend as source
        const sourceBackend = successfulBackends[0];
        
        for (const serverName of frontendServers) {
          try {
            const serverConfig = frontendServerMap.get(serverName);
            if (!serverConfig) {
              throw new Error(`Frontend server configuration not found: ${serverName}`);
            }

            console.log(`\n🔄 Deploying to frontend: ${serverName}`);
            const result = await sslDeployService.deployToFrontend(serverConfig, sourceBackend, pfxPassword, pfxFilename, selectedPorts);
            
            deploymentResults.frontend.push(result);
            
            if (result.success) {
              console.log(`✅ ${serverName} - Deployment successful`);
            } else {
              console.error(`❌ ${serverName} - Deployment failed: ${result.error}`);
              deploymentResults.errors.push(`Frontend ${serverName}: ${result.error}`);
            }
          } catch (error) {
            console.error(`❌ ${serverName} - Deployment error:`, error);
            deploymentResults.frontend.push({
              server: serverName,
              success: false,
              error: error.message,
              steps: [{ step: 'Deployment failed', status: 'error', error: error.message }]
            });
            deploymentResults.errors.push(`Frontend ${serverName}: ${error.message}`);
          }
        }
      }
    }

    // Final summary
    console.log(`\n========================================`);
    console.log(`📊 Deployment Summary`);
    console.log(`   Backend: ${successfulBackends.length}/${deploymentResults.backend.length} successful`);
    console.log(`   Frontend: ${deploymentResults.frontend.filter(r => r.success).length}/${deploymentResults.frontend.length} successful`);
    console.log(`   Errors: ${deploymentResults.errors.length}`);
    console.log(`========================================\n`);

    // Overall success if no errors
    if (deploymentResults.errors.length > 0) {
      deploymentResults.success = false;
    }

    res.json({
      success: true,
      data: deploymentResults
    });

  } catch (error) {
    console.error('Deployment error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/ssl-deploy/test-connection
 * Test connection to a specific server
 */
router.post('/test-connection', async (req, res) => {
  try {
    const { serverName } = req.body;

    if (!serverName) {
      return res.status(400).json({
        success: false,
        error: 'Server name is required'
      });
    }

    const allServers = sshService.getAllServers();
    const serverConfig = allServers.find(s => s.name === serverName);

    if (!serverConfig) {
      return res.status(404).json({
        success: false,
        error: `Server not found: ${serverName}`
      });
    }

    // Test connectivity using fast TCP check
    const connectivityResult = await sshService.checkServerAvailability(serverConfig, 5000);

    res.json({
      success: true,
      data: {
        server: serverName,
        available: connectivityResult.available,
        error: connectivityResult.error
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