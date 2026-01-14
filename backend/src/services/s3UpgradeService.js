// Full path: backend/src/services/s3UpgradeService.js

const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const fs = require('fs');

class S3UpgradeService {
  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'eu-central-1'
    });

    this.S3_BUCKET = process.env.S3_BUCKET || 'shayg-test-grafana';
    this.S3_REGION = process.env.AWS_REGION || 'eu-central-1';
    this.UPGRADE_PREFIX = 'upgrades/';
  }

  /**
   * Generate pre-signed URL for direct upload from frontend
   */
  async getUploadUrl(fileName, fileType, componentType) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');

    const key = `${this.UPGRADE_PREFIX}${componentType}/${timestamp}-${random}-${sanitizedName}`;

    const command = new PutObjectCommand({
      Bucket: this.S3_BUCKET,
      Key: key,
      ContentType: fileType || 'application/zip'
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 3600
    });

    console.log(`✅ Generated upload URL for: ${key}`);

    return {
      uploadUrl,
      key
    };
  }

  /**
   * Upload file from backend directly to S3
   */
  async uploadFile(filePath, fileName, componentType) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');

    const key = `${this.UPGRADE_PREFIX}${componentType}/${timestamp}-${random}-${sanitizedName}`;

    const fileStream = fs.createReadStream(filePath);
    const fileStats = fs.statSync(filePath);

    const command = new PutObjectCommand({
      Bucket: this.S3_BUCKET,
      Key: key,
      Body: fileStream,
      ContentType: 'application/zip',
      ContentLength: fileStats.size
    });

    await this.s3Client.send(command);

    console.log(
      `✅ Uploaded to S3: ${key} (${(fileStats.size / 1024 / 1024).toFixed(2)} MB)`
    );

    return key;
  }

  /**
   * 🔑 Generate pre-signed download URL (CRITICAL)
   */
  async getDownloadUrl(key) {
    const command = new GetObjectCommand({
      Bucket: this.S3_BUCKET,
      Key: key
    });

    const downloadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 3600
    });

    console.log(`✅ Generated download URL for: ${key}`);

    return downloadUrl;
  }

  /**
   * Delete a single file from S3
   */
  async deleteFile(key) {
    if (!key) return;

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.S3_BUCKET,
        Key: key
      });

      await this.s3Client.send(command);
      console.log(`🗑️ Deleted from S3: ${key}`);
    } catch (error) {
      console.error(`❌ Failed deleting ${key}:`, error);
      throw error;
    }
  }

  /**
   * Cleanup all upgrade artifacts
   */
  async cleanupUpgradeFiles(s3Keys) {
    const deletePromises = [];
    const files = [];

    if (s3Keys.backend) {
      deletePromises.push(this.deleteFile(s3Keys.backend));
      files.push(s3Keys.backend);
    }
    if (s3Keys.oldUI) {
      deletePromises.push(this.deleteFile(s3Keys.oldUI));
      files.push(s3Keys.oldUI);
    }
    if (s3Keys.newUI) {
      deletePromises.push(this.deleteFile(s3Keys.newUI));
      files.push(s3Keys.newUI);
    }
    if (s3Keys.apiManagement) {
      deletePromises.push(this.deleteFile(s3Keys.apiManagement));
      files.push(s3Keys.apiManagement);
    }

    if (deletePromises.length === 0) {
      console.log('ℹ️ No S3 files to clean up');
      return;
    }

    console.log(`🗑️ Cleaning up ${files.length} S3 file(s)...`);

    const results = await Promise.allSettled(deletePromises);

    let success = 0;
    let failed = 0;

    results.forEach(r => {
      if (r.status === 'fulfilled') success++;
      else failed++;
    });

    console.log(`✅ Cleanup finished: ${success} succeeded, ${failed} failed`);
  }
}

module.exports = new S3UpgradeService();
