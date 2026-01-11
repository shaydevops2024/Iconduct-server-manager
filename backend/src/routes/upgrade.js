// Full path: backend/src/routes/upgrade.js

const express = require('express');
const router = express.Router();
const upgradeService = require('../services/upgradeService');
const s3UpgradeService = require('../services/s3UpgradeService');
const sshService = require('../services/sshService');

/**
 * Get list of available backend servers
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
    console.error('Error getting servers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Upload file to S3 (direct upload from backend)
 */
router.post('/upload-to-s3', async (req, res) => {
  try {
    const { fileName, fileType, fileBuffer } = req.body;
    
    if (!fileName || !fileType || !fileBuffer) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: fileName, fileType, fileBuffer'
      });
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(fileBuffer, 'base64');
    
    // Upload to S3
    const s3Key = await s3UpgradeService.uploadFile(buffer, fileName, fileType);
    
    res.json({
      success: true,
      s3Key: s3Key
    });
  } catch (error) {
    console.error('Error uploading to S3:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get pre-signed URL for direct upload to S3 from browser
 */
router.post('/get-upload-url', async (req, res) => {
  try {
    const { fileName, fileType, componentType } = req.body;
    
    if (!fileName || !fileType || !componentType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: fileName, fileType, componentType'
      });
    }

    // Generate S3 key
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const s3Key = `upgrades/${componentType}/${timestamp}-${randomString}-${fileName}`;
    
    // Generate pre-signed URL for upload
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    
    const s3Client = new S3Client({
      region: process.env.AWS_REGION || 'eu-central-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
    
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME || 'shayg-test-grafana',
      Key: s3Key,
      ContentType: fileType
    });
    
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    
    res.json({
      success: true,
      uploadUrl: uploadUrl,
      s3Key: s3Key
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
      message: 'File deleted from S3'
    });
  } catch (error) {
    console.error('Error deleting from S3:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Execute upgrade on a server
 */
router.post('/execute', async (req, res) => {
  try {
    const { serverName, s3Keys } = req.body;
    
    if (!serverName || !s3Keys) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: serverName, s3Keys'
      });
    }

    // Find server config
    const servers = sshService.getAllServers();
    const serverConfig = servers.find(s => s.name === serverName);
    
    if (!serverConfig) {
      return res.status(404).json({
        success: false,
        error: `Server not found: ${serverName}`
      });
    }

    console.log(`Starting upgrade for server: ${serverName}`);
    console.log('S3 Keys:', s3Keys);

    // Execute upgrade
    const result = await upgradeService.executeUpgrade(serverConfig, s3Keys);
    
    // Cleanup S3 files after successful upgrade
    try {
      const keysToClean = Object.values(s3Keys).filter(key => key);
      if (keysToClean.length > 0) {
        await s3UpgradeService.cleanupUpgradeFiles(keysToClean);
        console.log('Cleaned up S3 files after successful upgrade');
      }
    } catch (cleanupError) {
      console.error('Error cleaning up S3 files:', cleanupError);
      // Don't fail the upgrade if cleanup fails
    }
    
    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    console.error('Error executing upgrade:', error);
    
    // Try to cleanup S3 files even if upgrade failed
    try {
      const { s3Keys } = req.body;
      if (s3Keys) {
        const keysToClean = Object.values(s3Keys).filter(key => key);
        if (keysToClean.length > 0) {
          await s3UpgradeService.cleanupUpgradeFiles(keysToClean);
          console.log('Cleaned up S3 files after failed upgrade');
        }
      }
    } catch (cleanupError) {
      console.error('Error cleaning up S3 files:', cleanupError);
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Upgrade failed',
      phases: error.phases || []
    });
  }
});

module.exports = router;