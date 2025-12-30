const express = require('express');
const router = express.Router();
const windowsServiceMonitor = require('../services/windowsServiceMonitor');
const sshService = require('../services/sshService');

/**
 * GET /api/services
 * Get all services from all servers
 */
router.get('/', async (req, res) => {
  try {
    const services = await windowsServiceMonitor.getAllServices();
    res.json({
      success: true,
      data: services,
      groups: sshService.getServerGroups()
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
 * Get services for a specific server group
 */
router.get('/:group', async (req, res) => {
  try {
    const { group } = req.params;
    const services = await windowsServiceMonitor.getServicesByGroup(group);
    res.json({
      success: true,
      group,
      data: services
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
 * Get services for a specific server
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

    const serviceNames = sshService.getServiceNames();
    const services = await windowsServiceMonitor.getServerServices(server, serviceNames);
    
    res.json({
      success: true,
      serverName,
      data: services
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;