// Full path: backend/src/services/upgradeService.js

const sshService = require('./sshService');
const s3Service = require('./s3UpgradeService');
const path = require('path');
const fs = require('fs').promises;

class UpgradeService {
  constructor() {
    this.scriptsPath = path.join(__dirname, '../../automation_scripts/upgrade');
    this.phases = [];
    this.logFilePath = null;
    this.serverName = null;
    
    // Store active upgrades for live status updates
    this.activeUpgrades = new Map();
  }

  async initializeLogging(serverName) {
    this.serverName = serverName;
    const logsDir = path.join(__dirname, '../../logs');
    
    // Ensure logs directory exists
    try {
      await fs.mkdir(logsDir, { recursive: true });
    } catch (err) {
      console.error('Failed to create logs directory:', err);
    }
    
    // Create log file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFilePath = path.join(logsDir, `upgrade_${serverName}_${timestamp}.log`);
    
    await this.log(`=================================================`);
    await this.log(`UPGRADE LOG - ${serverName}`);
    await this.log(`Started: ${new Date().toISOString()}`);
    await this.log(`=================================================\n`);
  }

  async log(message) {
    if (!this.logFilePath) return;
    
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    
    try {
      await fs.appendFile(this.logFilePath, logMessage);
    } catch (err) {
      console.error('Failed to write to log file:', err);
    }
  }

  getUpgradeStatus(serverName) {
    return this.activeUpgrades.get(serverName) || null;
  }

  setUpgradeStatus(serverName, status) {
    this.activeUpgrades.set(serverName, {
      ...status,
      lastUpdate: new Date().toISOString()
    });
  }

  clearUpgradeStatus(serverName) {
    this.activeUpgrades.delete(serverName);
  }

  async executeUpgrade(serverConfig, s3Keys) {
    this.phases = [];
    const startTime = Date.now();
    
    // Initialize logging
    await this.initializeLogging(serverConfig.name);

    // Initialize upgrade status
    this.setUpgradeStatus(serverConfig.name, {
      status: 'running',
      phases: [],
      startTime: new Date().toISOString(),
      currentPhase: null
    });

    try {
      await this.log(`Starting upgrade for server: ${serverConfig.name} (${serverConfig.host})`);
      await this.log(`S3 Keys: ${JSON.stringify(s3Keys, null, 2)}`);
      
      // Backend server only
      const serverType = 'backend';
      console.log(`Server type forced to: ${serverType}`);
      await this.log(`Server type: ${serverType}`);

      // Phase 1: Download files from S3
      await this.runPhase(1, 'Download Files from S3', async () => {
        return await this.downloadFromS3(serverConfig, s3Keys);
      });

      // Phase 2: Create temp folder
      await this.runPhase(2, 'Create Temp Folder', async () => {
        return await this.createTempFolder(serverConfig);
      });

      // Phase 3: Unzip files
      await this.runPhase(3, 'Unzip Files & Extract Nested ZIPs', async () => {
        return await this.unzipFiles(serverConfig);
      });

      // Phase 3.5: Run UpdateDB (backend only)
      await this.runPhase(3.5, 'Run Database Update', async () => {
        return await this.runUpdateDB(serverConfig);
      });

      // Phase 4: Smart rename
      await this.runPhase(4, 'Smart Rename Using Service Paths', async () => {
        return await this.smartRename(serverConfig);
      });

      // Backend-specific phases
      await this.runPhase(5, 'Copy vault.json Files', async () => {
        return await this.copyVaultFiles(serverConfig);
      });

      await this.runPhase(6, 'Copy .config Files', async () => {
        return await this.copyConfigFiles(serverConfig);
      });

      await this.runPhase(7, 'Copy Special Folders', async () => {
        return await this.copySpecialFolders(serverConfig);
      });

      // Phase 8: Stop services
      await this.runPhase(8, 'Stop Services', async () => {
        return await this.stopServices(serverConfig);
      });

      // Phase 9: Backup folders
      await this.runPhase(9, 'Backup & Move to Backup Folder', async () => {
        return await this.backupFolders(serverConfig);
      });

      // Phase 10: Deploy new version
      await this.runPhase(10, 'Deploy New Version', async () => {
        return await this.deployNewVersion(serverConfig);
      });

      // Phase 11: Start services
      await this.runPhase(11, 'Start Services', async () => {
        return await this.startServices(serverConfig);
      });

      // Phase 12: Cleanup temp folders
      await this.runPhase(12, 'Cleanup Temp Folders', async () => {
        return await this.cleanupTemp(serverConfig);
      });

      // Phase 13: Cleanup S3 files
      await this.runPhase(13, 'Cleanup S3 Files', async () => {
        return await this.cleanupS3Files(s3Keys);
      });

      const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

      await this.log(`\n=================================================`);
      await this.log(`UPGRADE COMPLETED SUCCESSFULLY`);
      await this.log(`Total duration: ${totalDuration}s`);
      await this.log(`Completed: ${new Date().toISOString()}`);
      await this.log(`=================================================\n`);

      // Clear upgrade status on success
      this.clearUpgradeStatus(serverConfig.name);

      return {
        success: true,
        message: 'Upgrade completed successfully',
        phases: this.phases,
        duration: `${totalDuration}s`,
        logFile: this.logFilePath
      };
    } catch (error) {
      console.error('Upgrade failed:', error);
      
      await this.log(`\n=================================================`);
      await this.log(`UPGRADE FAILED`);
      await this.log(`Error: ${error.message}`);
      await this.log(`Completed: ${new Date().toISOString()}`);
      await this.log(`=================================================\n`);
      
      // Mark current phase as error
      if (this.phases.length > 0) {
        const lastPhase = this.phases[this.phases.length - 1];
        if (lastPhase.status === 'running') {
          lastPhase.status = 'error';
          lastPhase.error = error.message;
        }
      }

      // Update status with error
      this.setUpgradeStatus(serverConfig.name, {
        status: 'error',
        phases: this.phases,
        error: error.message
      });

      // Clear after a delay to allow final status check
      setTimeout(() => {
        this.clearUpgradeStatus(serverConfig.name);
      }, 30000); // Keep for 30 seconds

      throw {
        message: error.message,
        phases: this.phases,
        logFile: this.logFilePath
      };
    }
  }

  async runPhase(phaseNumber, phaseName, phaseFunction) {
    const phaseStart = Date.now();
    
    const phase = {
      phase: phaseNumber,
      name: phaseName,
      status: 'running',
      details: null,
      error: null,
      duration: null
    };
    
    this.phases.push(phase);
    
    // Update live status
    if (this.serverName) {
      this.setUpgradeStatus(this.serverName, {
        status: 'running',
        phases: [...this.phases],
        currentPhase: phaseName
      });
    }
    
    console.log(`\n========================================`);
    console.log(`PHASE ${phaseNumber}: ${phaseName}`);
    console.log(`========================================\n`);
    
    await this.log(`\n========================================`);
    await this.log(`PHASE ${phaseNumber}: ${phaseName}`);
    await this.log(`========================================`);

    try {
      const result = await phaseFunction();
      
      const duration = ((Date.now() - phaseStart) / 1000).toFixed(1);
      phase.status = 'success';
      phase.duration = `${duration}s`;
      phase.details = result || 'Completed';
      
      // Update live status
      if (this.serverName) {
        this.setUpgradeStatus(this.serverName, {
          status: 'running',
          phases: [...this.phases],
          currentPhase: null
        });
      }
      
      console.log(`✅ Phase ${phaseNumber} completed in ${duration}s\n`);
      await this.log(`✅ Phase ${phaseNumber} completed in ${duration}s`);
      await this.log(`Result: ${result || 'Completed'}`);
      
      return result;
    } catch (error) {
      const duration = ((Date.now() - phaseStart) / 1000).toFixed(1);
      phase.status = 'error';
      phase.duration = `${duration}s`;
      phase.error = error.message;
      
      // Update live status
      if (this.serverName) {
        this.setUpgradeStatus(this.serverName, {
          status: 'error',
          phases: [...this.phases],
          error: error.message
        });
      }
      
      console.error(`❌ Phase ${phaseNumber} failed: ${error.message}\n`);
      await this.log(`❌ Phase ${phaseNumber} FAILED: ${error.message}`);
      await this.log(`Error details: ${error.stack || error.toString()}`);
      
      throw error;
    }
  }

  /**
   * Backend only — no server type detection
   */
  async downloadFromS3(serverConfig, s3Keys) {
    const scriptTemplate = await this.loadScript('01-download-from-s3.ps1');

    const backendUrl = s3Keys.backend
      ? await s3Service.getDownloadUrl(s3Keys.backend)
      : '';

    const oldUIUrl = s3Keys.oldUI
      ? await s3Service.getDownloadUrl(s3Keys.oldUI)
      : '';

    const newUIUrl = s3Keys.newUI
      ? await s3Service.getDownloadUrl(s3Keys.newUI)
      : '';

    const apiMgmtUrl = s3Keys.apiManagement
      ? await s3Service.getDownloadUrl(s3Keys.apiManagement)
      : '';

    let script = scriptTemplate.replace('{{SERVER_TYPE}}', 'backend');

    script = script
      .replace('{{HAS_BACKEND}}', backendUrl ? 'true' : 'false')
      .replace('{{HAS_OLD_UI}}', oldUIUrl ? 'true' : 'false')
      .replace('{{HAS_NEW_UI}}', newUIUrl ? 'true' : 'false')
      .replace('{{HAS_API_MANAGEMENT}}', apiMgmtUrl ? 'true' : 'false')
      .replace('{{BACKEND_URL}}', backendUrl)
      .replace('{{OLD_UI_URL}}', oldUIUrl)
      .replace('{{NEW_UI_URL}}', newUIUrl)
      .replace('{{API_MGMT_URL}}', apiMgmtUrl);

    const result = await sshService.executeScript(serverConfig, script);
    return result.trim();
  }

  async createTempFolder(serverConfig) {
    const scriptTemplate = await this.loadScript('02-create-temp-folder.ps1');
    const script = scriptTemplate.replace('{{SERVER_TYPE}}', 'backend');
    const result = await sshService.executeScript(serverConfig, script);
    return result.trim();
  }

  async unzipFiles(serverConfig) {
    const scriptTemplate = await this.loadScript('03-unzip-files.ps1');
    const script = scriptTemplate.replace('{{SERVER_TYPE}}', 'backend');
    const result = await sshService.executeScript(serverConfig, script);
    return result.trim();
  }

  async runUpdateDB(serverConfig) {
    const scriptTemplate = await this.loadScript('03.5-run-updatedb.ps1');
    const result = await sshService.executeScript(serverConfig, scriptTemplate);
    return result.trim();
  }

  async smartRename(serverConfig) {
    const scriptTemplate = await this.loadScript('04-rename-folders.ps1');
    const script = scriptTemplate.replace('{{SERVER_TYPE}}', 'backend');
    const result = await sshService.executeScript(serverConfig, script);
    return result.trim();
  }

  async copyVaultFiles(serverConfig) {
    const scriptTemplate = await this.loadScript('05-copy-vault-json.ps1');
    const result = await sshService.executeScript(serverConfig, scriptTemplate);
    return result.trim();
  }

  async copyConfigFiles(serverConfig) {
    const scriptTemplate = await this.loadScript('06-copy-config-files.ps1');
    const result = await sshService.executeScript(serverConfig, scriptTemplate);
    return result.trim();
  }

  async copySpecialFolders(serverConfig) {
    const scriptTemplate = await this.loadScript('07-copy-special-folders.ps1');
    const result = await sshService.executeScript(serverConfig, scriptTemplate);
    return result.trim();
  }

  async stopServices(serverConfig) {
    const scriptTemplate = await this.loadScript('08-stop-services.ps1');
    const script = scriptTemplate.replace('{{SERVER_TYPE}}', 'backend');
    const result = await sshService.executeScript(serverConfig, script);
    return result.trim();
  }

  async backupFolders(serverConfig) {
    const scriptTemplate = await this.loadScript('09-backup-folders.ps1');
    const script = scriptTemplate.replace('{{SERVER_TYPE}}', 'backend');
    const result = await sshService.executeScript(serverConfig, script);
    return result.trim();
  }

  async deployNewVersion(serverConfig) {
    const scriptTemplate = await this.loadScript('10-deploy-new-version.ps1');
    const script = scriptTemplate.replace('{{SERVER_TYPE}}', 'backend');
    const result = await sshService.executeScript(serverConfig, script);
    
    const jsonMatch = result.match(/DEPLOYED_FOLDERS_JSON:\s*(\[.*?\])/s);
    if (jsonMatch) {
      try {
        const deployedFolders = JSON.parse(jsonMatch[1]);
        return `Deployed ${deployedFolders.length} folder(s): ${deployedFolders.join(', ')}`;
      } catch (e) {
        console.error('Failed to parse deployed folders JSON:', e);
      }
    }
    
    return result.trim();
  }

  async startServices(serverConfig) {
    const scriptTemplate = await this.loadScript('11-start-services.ps1');
    const script = scriptTemplate.replace('{{SERVER_TYPE}}', 'backend');
    const result = await sshService.executeScript(serverConfig, script);
    return result.trim();
  }

  async cleanupTemp(serverConfig) {
    const scriptTemplate = await this.loadScript('12-cleanup-temp.ps1');
    const script = scriptTemplate.replace('{{SERVER_TYPE}}', 'backend');
    const result = await sshService.executeScript(serverConfig, script);
    return result.trim();
  }

  async cleanupS3Files(s3Keys) {
    const filesToDelete = Object.values(s3Keys).filter(key => key !== null);
    
    if (filesToDelete.length === 0) {
      return 'No files to cleanup';
    }

    await s3Service.cleanupUpgradeFiles(s3Keys);
    return `Cleaned up ${filesToDelete.length} file(s) from S3 bucket`;
  }

  async loadScript(scriptName) {
    const scriptPath = path.join(this.scriptsPath, scriptName);
    const content = await fs.readFile(scriptPath, 'utf8');
    return content;
  }

  async getUpgradeLogs(serverName) {
    const logsDir = path.join(__dirname, '../../logs');
    
    try {
      const files = await fs.readdir(logsDir);
      const serverLogFiles = files
        .filter(f => f.startsWith(`upgrade_${serverName}_`))
        .sort()
        .reverse();
      
      if (serverLogFiles.length === 0) {
        return 'No logs found for this server';
      }
      
      const logFilePath = path.join(logsDir, serverLogFiles[0]);
      return await fs.readFile(logFilePath, 'utf8');
    } catch (err) {
      console.error('Error reading log file:', err);
      return `Error reading log file: ${err.message}`;
    }
  }

  async listAllLogs() {
    const logsDir = path.join(__dirname, '../../logs');
    
    try {
      const files = await fs.readdir(logsDir);
      const upgradeLogFiles = files.filter(f => f.startsWith('upgrade_'));
      const logsList = [];

      for (const file of upgradeLogFiles) {
        const filePath = path.join(logsDir, file);
        const stats = await fs.stat(filePath);

        const match = file.match(
          /^upgrade_(.+?)_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d+Z)\.log$/
        );

        if (match) {
          const isoTimestamp = match[2].replace(
            /T(\d{2})-(\d{2})-(\d{2})-(\d+)Z/,
            'T$1:$2:$3.$4Z'
          );

          logsList.push({
            filename: file,
            serverName: match[1],
            timestamp: new Date(isoTimestamp),
            size: stats.size,
            createdAt: stats.birthtime
          });
        }
      }

      logsList.sort((a, b) => b.timestamp - a.timestamp);
      return logsList;
    } catch (err) {
      console.error('Error listing logs:', err);
      throw new Error(`Failed to list logs: ${err.message}`);
    }
  }

  async getLogContent(filename) {
    const logsDir = path.join(__dirname, '../../logs');
    const logFilePath = path.join(logsDir, filename);
    return await fs.readFile(logFilePath, 'utf8');
  }

  async deleteLog(filename) {
    const logsDir = path.join(__dirname, '../../logs');
    const logFilePath = path.join(logsDir, filename);

    if (!filename.startsWith('upgrade_') || !filename.endsWith('.log')) {
      throw new Error('Invalid log file name');
    }

    await fs.unlink(logFilePath);
    return true;
  }
}

module.exports = new UpgradeService();
