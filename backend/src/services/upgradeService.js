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

  async initializeLogging(serverName, upgradeType = 'backend') {
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
    this.logFilePath = path.join(logsDir, `upgrade_${upgradeType}_${serverName}_${timestamp}.log`);
    
    await this.log(`=================================================`);
    await this.log(`${upgradeType.toUpperCase()} UPGRADE LOG - ${serverName}`);
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

  getUpgradeStatus(upgradeKey) {
    return this.activeUpgrades.get(upgradeKey) || null;
  }

  setUpgradeStatus(upgradeKey, status) {
    this.activeUpgrades.set(upgradeKey, {
      ...status,
      lastUpdate: new Date().toISOString()
    });
  }

  clearUpgradeStatus(upgradeKey) {
    this.activeUpgrades.delete(upgradeKey);
  }

  // Format seconds to hh:mm:ss
  formatDuration(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // ==========================================
  // MULTI-SERVER UPGRADE (MAIN LOGIC)
  // ==========================================

  async executeMultiServerUpgrade(serverGroup, selectedServers, serverConfigs, s3Keys) {
    const startTime = Date.now();
    
    // Create upgrade key for status tracking
    const upgradeKey = this.getUpgradeKey(serverGroup, selectedServers);
    
    // Initialize logging
    await this.initializeLogging(upgradeKey, 'multi');
    
    // Initialize upgrade status
    this.setUpgradeStatus(upgradeKey, {
      status: 'running',
      phases: [],
      startTime: new Date().toISOString(),
      currentPhase: null
    });

    this.phases = [];
    const results = {
      backend: null,
      fe1: null,
      fe2: null
    };

    try {
      await this.log(`Starting multi-server upgrade for group: ${serverGroup}`);
      await this.log(`Selected servers: ${JSON.stringify(selectedServers)}`);
      await this.log(`S3 Keys: ${JSON.stringify(s3Keys, null, 2)}`);

      // Execute backend upgrade if selected
      if (selectedServers.backend && serverConfigs.backend) {
        await this.log(`\n--- BACKEND UPGRADE ---`);
        try {
          results.backend = await this.executeSingleBackendUpgrade(serverConfigs.backend, s3Keys, upgradeKey);
          await this.log(`Backend upgrade completed successfully`);
        } catch (error) {
          await this.log(`Backend upgrade failed: ${error.message}`);
          throw error;
        }
      }

      // Execute FE1 upgrade if selected
      if (selectedServers.fe1 && serverConfigs.fe1) {
        await this.log(`\n--- FRONTEND 1 UPGRADE ---`);
        try {
          results.fe1 = await this.executeSingleFrontendUpgrade(serverConfigs.fe1, s3Keys, upgradeKey);
          await this.log(`Frontend 1 upgrade completed successfully`);
        } catch (error) {
          await this.log(`Frontend 1 upgrade failed: ${error.message}`);
          throw error;
        }
      }

      // Execute FE2 upgrade if selected
      if (selectedServers.fe2 && serverConfigs.fe2) {
        await this.log(`\n--- FRONTEND 2 UPGRADE ---`);
        try {
          results.fe2 = await this.executeSingleFrontendUpgrade(serverConfigs.fe2, s3Keys, upgradeKey);
          await this.log(`Frontend 2 upgrade completed successfully`);
        } catch (error) {
          await this.log(`Frontend 2 upgrade failed: ${error.message}`);
          throw error;
        }
      }

      // Cleanup S3 files
      await this.runPhase(13, 'Cleanup S3 Files', async () => {
        return await this.cleanupS3Files(s3Keys);
      });

      const totalSeconds = (Date.now() - startTime) / 1000;
      const totalDuration = this.formatDuration(totalSeconds);

      await this.log(`\n=================================================`);
      await this.log(`MULTI-SERVER UPGRADE COMPLETED SUCCESSFULLY`);
      await this.log(`Total duration: ${totalDuration}`);
      await this.log(`Completed: ${new Date().toISOString()}`);
      await this.log(`=================================================\n`);

      // Clear upgrade status on success
      this.clearUpgradeStatus(upgradeKey);

      return {
        success: true,
        message: 'Multi-server upgrade completed successfully',
        results: results,
        phases: this.phases,
        duration: totalDuration,
        logFile: this.logFilePath
      };

    } catch (error) {
      console.error('Multi-server upgrade failed:', error);
      
      const totalSeconds = (Date.now() - startTime) / 1000;
      const totalDuration = this.formatDuration(totalSeconds);
      
      await this.log(`\n=================================================`);
      await this.log(`MULTI-SERVER UPGRADE FAILED`);
      await this.log(`Error: ${error.message}`);
      await this.log(`Duration before failure: ${totalDuration}`);
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
      this.setUpgradeStatus(upgradeKey, {
        status: 'error',
        phases: this.phases,
        error: error.message
      });

      // Clear after a delay
      setTimeout(() => {
        this.clearUpgradeStatus(upgradeKey);
      }, 30000);

      throw {
        message: error.message,
        phases: this.phases,
        logFile: this.logFilePath
      };
    }
  }

  getUpgradeKey(serverGroup, selectedServers) {
    const parts = [serverGroup];
    if (selectedServers.backend) parts.push('backend');
    if (selectedServers.fe1) parts.push('fe1');
    if (selectedServers.fe2) parts.push('fe2');
    return parts.join('_');
  }

  // ==========================================
  // SINGLE BACKEND UPGRADE
  // ==========================================

  async executeSingleBackendUpgrade(serverConfig, s3Keys, upgradeKey) {
    try {
      await this.log(`Starting backend upgrade for: ${serverConfig.name}`);

      // Phase 1: Download files from S3
      await this.runPhase(1, 'Download Backend from S3', async () => {
        return await this.downloadBackendFromS3(serverConfig, s3Keys.backend);
      });

      // Phase 2: Create temp folder
      await this.runPhase(2, 'Create Temp Folder', async () => {
        return await this.createTempFolder(serverConfig);
      });

      // Phase 3: Unzip files
      await this.runPhase(3, 'Unzip Files & Extract Nested ZIPs', async () => {
        return await this.unzipFiles(serverConfig);
      });

      // Phase 3.5: Run UpdateDB
      await this.runPhase(3.5, 'Run Database Update', async () => {
        return await this.runUpdateDB(serverConfig);
      });

      // Phase 4: Smart rename
      await this.runPhase(4, 'Smart Rename Using Service Paths', async () => {
        return await this.smartRename(serverConfig);
      });

      // Phase 5: Copy vault.json
      await this.runPhase(5, 'Copy vault.json Files', async () => {
        return await this.copyVaultFiles(serverConfig);
      });

      // Phase 6: Copy .config files
      await this.runPhase(6, 'Copy .config Files', async () => {
        return await this.copyConfigFiles(serverConfig);
      });

      // Phase 7: Copy special folders
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

      // Phase 12: Cleanup temp
      await this.runPhase(12, 'Cleanup Temp Folders', async () => {
        return await this.cleanupTemp(serverConfig);
      });

      await this.log(`Backend upgrade completed: ${serverConfig.name}`);
      
      return {
        success: true,
        server: serverConfig.name
      };

    } catch (error) {
      await this.log(`Backend upgrade failed for ${serverConfig.name}: ${error.message}`);
      throw error;
    }
  }

  // ==========================================
  // SINGLE FRONTEND UPGRADE
  // ==========================================

  async executeSingleFrontendUpgrade(serverConfig, s3Keys, upgradeKey) {
    try {
      await this.log(`Starting frontend upgrade for: ${serverConfig.name}`);

      // Phase 1: Download Old UI from S3
      await this.runPhase(1, `Download Old UI from S3`, async () => {
        return await this.oldUIDownloadToServer(serverConfig, s3Keys.oldUI);
      });

      // Phase 2: Unzip files
      await this.runPhase(2, `Unzip Files`, async () => {
        return await this.oldUIUnzipOnServer(serverConfig);
      });

      // Phase 3: Copy config files
      await this.runPhase(3, `Copy Config Files`, async () => {
        return await this.oldUICopyConfigOnServer(serverConfig);
      });

      // Phase 4: Stop IIS
      await this.runPhase(4, `Stop IIS`, async () => {
        return await this.oldUIStopIISOnServer(serverConfig);
      });

      // Phase 5: Backup old version
      await this.runPhase(5, `Backup Old Version`, async () => {
        return await this.oldUIBackupOnServer(serverConfig);
      });

      // Phase 6: Deploy new version
      await this.runPhase(6, `Deploy New Version`, async () => {
        return await this.oldUIDeployOnServer(serverConfig);
      });

      // Phase 7: Start IIS
      await this.runPhase(7, `Start IIS`, async () => {
        return await this.oldUIStartIISOnServer(serverConfig);
      });

      // Phase 8: Cleanup temp
      await this.runPhase(8, `Cleanup Temp Folders`, async () => {
        return await this.oldUICleanupOnServer(serverConfig);
      });

      await this.log(`Frontend upgrade completed: ${serverConfig.name}`);
      
      return {
        success: true,
        server: serverConfig.name
      };

    } catch (error) {
      await this.log(`Frontend upgrade failed for ${serverConfig.name}: ${error.message}`);
      throw error;
    }
  }

  // ==========================================
  // PHASE RUNNER
  // ==========================================

  async runPhase(phaseNumber, phaseName, phaseFunction) {
    const phaseStart = Date.now();
    
    const phase = {
      phase: phaseNumber,
      name: phaseName,
      status: 'running',
      duration: null,
      details: null,
      error: null
    };
    
    this.phases.push(phase);
    
    await this.log(`\n======================================== `);
    await this.log(`PHASE ${phaseNumber}: ${phaseName}`);
    await this.log(`======================================== \n`);
    
    try {
      const result = await phaseFunction();
      
      const seconds = (Date.now() - phaseStart) / 1000;
      const duration = this.formatDuration(seconds);
      phase.status = 'completed';
      phase.duration = duration;
      phase.details = typeof result === 'string' ? result : null;
      
      await this.log(`\nPhase ${phaseNumber} completed in ${duration}`);
      
      return result;
      
    } catch (error) {
      const seconds = (Date.now() - phaseStart) / 1000;
      const duration = this.formatDuration(seconds);
      phase.status = 'error';
      phase.duration = duration;
      phase.error = error.message;
      
      await this.log(`\nPhase ${phaseNumber} FAILED after ${duration}: ${error.message}`);
      
      throw error;
    }
  }

  // ==========================================
  // BACKEND-SPECIFIC PHASE METHODS
  // ==========================================

  async downloadBackendFromS3(serverConfig, backendKey) {
    const scriptTemplate = await this.loadScript('01-download-from-s3.ps1');
    
    const backendUrl = await s3Service.getDownloadUrl(backendKey);
    
    if (!backendUrl) {
      throw new Error('Backend S3 key not provided');
    }
    
    const script = scriptTemplate.replace('{{BACKEND_URL}}', backendUrl);
    
    const result = await sshService.executeScript(serverConfig, script);
    return result.trim();
  }

  async createTempFolder(serverConfig) {
    const scriptTemplate = await this.loadScript('02-create-temp-folder.ps1');
    const result = await sshService.executeScript(serverConfig, scriptTemplate);
    return result.trim();
  }

  async unzipFiles(serverConfig) {
    const scriptTemplate = await this.loadScript('03-unzip-files.ps1');
    const result = await sshService.executeScript(serverConfig, scriptTemplate);
    return result.trim();
  }

  async runUpdateDB(serverConfig) {
    const scriptTemplate = await this.loadScript('03.5-run-updatedb.ps1');
    const result = await sshService.executeScript(serverConfig, scriptTemplate);
    return result.trim();
  }

  async smartRename(serverConfig) {
    const scriptTemplate = await this.loadScript('04-rename-folders.ps1');
    const result = await sshService.executeScript(serverConfig, scriptTemplate);
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
    const result = await sshService.executeScript(serverConfig, scriptTemplate);
    return result.trim();
  }

  async backupFolders(serverConfig) {
    const scriptTemplate = await this.loadScript('09-backup-folders.ps1');
    const result = await sshService.executeScript(serverConfig, scriptTemplate);
    return result.trim();
  }

  async deployNewVersion(serverConfig) {
    const scriptTemplate = await this.loadScript('10-deploy-new-version.ps1');
    const result = await sshService.executeScript(serverConfig, scriptTemplate);
    return result.trim();
  }

  async startServices(serverConfig) {
    const scriptTemplate = await this.loadScript('11-start-services.ps1');
    const result = await sshService.executeScript(serverConfig, scriptTemplate);
    return result.trim();
  }

  async cleanupTemp(serverConfig) {
    const scriptTemplate = await this.loadScript('12-cleanup-temp.ps1');
    const result = await sshService.executeScript(serverConfig, scriptTemplate);
    return result.trim();
  }

  // ==========================================
  // FRONTEND-SPECIFIC PHASE METHODS
  // ==========================================

  async oldUIDownloadToServer(serverConfig, oldUIKey) {
    const scriptTemplate = await this.loadScript('oldUI_01-download-from-s3.ps1');
    
    const oldUIUrl = await s3Service.getDownloadUrl(oldUIKey);
    
    if (!oldUIUrl) {
      throw new Error('Old UI S3 key not provided');
    }
    
    const script = scriptTemplate.replace('{{OLD_UI_URL}}', oldUIUrl);
    
    const result = await sshService.executeScript(serverConfig, script);
    return result.trim();
  }

  async oldUIUnzipOnServer(serverConfig) {
    const scriptTemplate = await this.loadScript('oldUI_02-unzip-files.ps1');
    const result = await sshService.executeScript(serverConfig, scriptTemplate);
    return result.trim();
  }

  async oldUICopyConfigOnServer(serverConfig) {
    const scriptTemplate = await this.loadScript('oldUI_03-copy-config-files.ps1');
    const result = await sshService.executeScript(serverConfig, scriptTemplate);
    return result.trim();
  }

  async oldUIStopIISOnServer(serverConfig) {
    const scriptTemplate = await this.loadScript('oldUI_04-stop-iis.ps1');
    const result = await sshService.executeScript(serverConfig, scriptTemplate);
    return result.trim();
  }

  async oldUIBackupOnServer(serverConfig) {
    const scriptTemplate = await this.loadScript('oldUI_05-backup-old-version.ps1');
    const result = await sshService.executeScript(serverConfig, scriptTemplate);
    return result.trim();
  }

  async oldUIDeployOnServer(serverConfig) {
    const scriptTemplate = await this.loadScript('oldUI_06-deploy-new-version.ps1');
    const result = await sshService.executeScript(serverConfig, scriptTemplate);
    return result.trim();
  }

  async oldUIStartIISOnServer(serverConfig) {
    const scriptTemplate = await this.loadScript('oldUI_07-start-iis.ps1');
    const result = await sshService.executeScript(serverConfig, scriptTemplate);
    return result.trim();
  }

  async oldUICleanupOnServer(serverConfig) {
    const scriptTemplate = await this.loadScript('oldUI_08-cleanup-temp.ps1');
    const result = await sshService.executeScript(serverConfig, scriptTemplate);
    return result.trim();
  }

  // ==========================================
  // S3 CLEANUP
  // ==========================================

  async cleanupS3Files(s3Keys) {
    await s3Service.cleanupUpgradeFiles(s3Keys);
    return 'S3 files cleaned up successfully';
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  async loadScript(scriptName) {
    const scriptPath = path.join(this.scriptsPath, scriptName);
    const content = await fs.readFile(scriptPath, 'utf8');
    return content;
  }

  async getUpgradeLogs(serverNameOrKey) {
    const logsDir = path.join(__dirname, '../../logs');
    
    try {
      const files = await fs.readdir(logsDir);
      
      // Support multiple formats
      const serverLogFiles = files
        .filter(f => {
          // Match if key is included in filename
          if (f.includes(serverNameOrKey)) return true;
          
          // Match old format: upgrade_ServerName_timestamp.log
          const oldFormat = f.match(/^upgrade_(.+?)_(\d{4}-\d{2}-\d{2}T.+)\.log$/);
          if (oldFormat && oldFormat[1] === serverNameOrKey) return true;
          
          // Match new format: upgrade_type_ServerName_timestamp.log
          const newFormat = f.match(/^upgrade_(.+?)_(.+?)_(\d{4}-\d{2}-\d{2}T.+)\.log$/);
          if (newFormat && newFormat[2] === serverNameOrKey) return true;
          
          return false;
        })
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

        // Try new format first: upgrade_type_ServerName_timestamp.log
        let match = file.match(
          /^upgrade_(.+?)_(.+?)_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d+Z)\.log$/
        );

        if (match) {
          const isoTimestamp = match[3].replace(
            /T(\d{2})-(\d{2})-(\d{2})-(\d+)Z/,
            'T$1:$2:$3.$4Z'
          );

          logsList.push({
            filename: file,
            upgradeType: match[1],
            serverName: match[2],
            timestamp: new Date(isoTimestamp),
            size: stats.size,
            createdAt: stats.birthtime
          });
        } else {
          // Try old format: upgrade_ServerName_timestamp.log
          match = file.match(
            /^upgrade_(.+?)_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d+Z)\.log$/
          );

          if (match) {
            const isoTimestamp = match[2].replace(
              /T(\d{2})-(\d{2})-(\d{2})-(\d+)Z/,
              'T$1:$2:$3.$4Z'
            );

            logsList.push({
              filename: file,
              upgradeType: 'backend',
              serverName: match[1],
              timestamp: new Date(isoTimestamp),
              size: stats.size,
              createdAt: stats.birthtime
            });
          }
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