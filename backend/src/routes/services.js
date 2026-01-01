// Full path: backend/src/routes/services.js

const express = require('express');
const router = express.Router();
const windowsServiceMonitor = require('../services/windowsServiceMonitor');
const sshService = require('../services/sshService');
const cacheService = require('../services/cacheService');

/**
 * GET /api/services
 * Get all services from all servers (with caching)
 */
router.get('/', async (req, res) => {
  try {
    const cacheKey = 'all-services';
    const cached = cacheService.get(cacheKey);
    
    if (cached) {
      console.log('📦 Serving from cache');
      return res.json({
        success: true,
        data: cached.data,
        groups: cached.groups,
        cached: true
      });
    }

    console.log('🔄 Cache miss - fetching fresh data');
    const services = await windowsServiceMonitor.getAllServices();
    const groups = sshService.getServerGroups();
    
    // Cache for 10 seconds
    cacheService.set(cacheKey, { data: services, groups }, 10000);
    
    res.json({
      success: true,
      data: services,
      groups,
      cached: false
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/services/groups
 * Get available server groups
 */
router.get('/groups', (req, res) => {
  try {
    const groups = sshService.getServerGroups();
    res.json({
      success: true,
      data: groups
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/services/:group
 * Get services for a specific server group (with caching)
 */
router.get('/:group', async (req, res) => {
  try {
    const { group } = req.params;
    const cacheKey = `services-group-${group}`;
    const cached = cacheService.get(cacheKey);
    
    if (cached) {
      console.log(`📦 Serving group ${group} from cache`);
      return res.json({
        success: true,
        group,
        data: cached,
        cached: true
      });
    }

    console.log(`🔄 Cache miss for group ${group} - fetching fresh data`);
    const services = await windowsServiceMonitor.getServicesByGroup(group);
    
    // Cache for 10 seconds
    cacheService.set(cacheKey, services, 10000);
    
    res.json({
      success: true,
      group,
      data: services,
      cached: false
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/services/server/:serverName
 * Get services for a specific server (with caching)
 */
router.get('/server/:serverName', async (req, res) => {
  try {
    const { serverName } = req.params;
    const cacheKey = `services-server-${serverName}`;
    const cached = cacheService.get(cacheKey);
    
    if (cached) {
      console.log(`📦 Serving server ${serverName} from cache`);
      return res.json({
        success: true,
        serverName,
        data: cached,
        cached: true
      });
    }

    const servers = sshService.getAllServers();
    const server = servers.find(s => s.name === serverName);
    
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found'
      });
    }

    console.log(`🔄 Cache miss for server ${serverName} - fetching fresh data`);
    const services = await windowsServiceMonitor.getServerServices(server);
    
    // Cache for 10 seconds
    cacheService.set(cacheKey, services, 10000);
    
    res.json({
      success: true,
      serverName,
      data: services,
      cached: false
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
