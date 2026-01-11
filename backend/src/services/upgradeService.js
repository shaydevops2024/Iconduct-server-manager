// Full path: backend/src/services/upgradeService.js

const sshService = require('./sshService');
const s3Service = require('./s3UpgradeService');
const path = require('path');
const fs = require('fs').promises;

class UpgradeService {
  constructor() {
    this.scriptsPath = path.join(__dirname, '../../automation_scripts/upgrade');
    this.phases = [];
  }

  async executeUpgrade(serverConfig, s3Keys) {
    this.phases = [];
    const startTime = Date.now();

    try {
      // Determine server type
      const serverType = this.determineServerType(serverConfig);
      console.log(`Server type detected: ${serverType}`);

      // Determine which files to download based on server type
      const filesToDownload = this.determineFilesToDownload(serverType, s3Keys);
      console.log(`Files to download:`, filesToDownload);

      // Generate download URLs only for files needed for this server
      const downloadUrls = {};
      
      for (const fileType of filesToDownload) {
        if (s3Keys[fileType]) {
          downloadUrls[fileType] = await s3Service.getDownloadUrl(s3Keys[fileType]);
        }
      }

      // PHASE 1: Download files from S3 to server
      await this.runPhase(1, 'Download Files from S3', async () => {
        return await this.downloadFromS3(serverConfig, downloadUrls, serverType);
      });

      // PHASE 2: Create temp folder
      await this.runPhase(2, 'Create Temp Folder', async () => {
        return await this.createTempFolder(serverConfig, serverType);
      });

      // PHASE 3: Unzip files (with recursive unzipping)
      await this.runPhase(3, 'Unzip Files & Extract Nested ZIPs', async () => {
        return await this.unzipFiles(serverConfig, serverType);
      });

      // PHASE 3.5: Run UpdateDB (backend only)
      if (serverType === 'backend') {
        await this.runPhase(3.5, 'Run Database Update', async () => {
          return await this.runUpdateDB(serverConfig, serverType);
        });
      }

      // PHASE 4: Rename folders using service paths
      await this.runPhase(4, 'Smart Rename Using Service Paths', async () => {
        return await this.renameFolders(serverConfig, serverType);
      });

      // Backend-only phases
      if (serverType === 'backend') {
        // PHASE 5: Copy vault.json files
        await this.runPhase(5, 'Copy vault.json Files', async () => {
          return await this.copyVaultFiles(serverConfig, serverType);
        });

        // PHASE 6: Copy .config files for agents/schedulers
        await this.runPhase(6, 'Copy .config Files', async () => {
          return await this.copyConfigFiles(serverConfig, serverType);
        });

        // PHASE 7: Copy special folders (Connectors, ConnectorAssemblyCache)
        await this.runPhase(7, 'Copy Special Folders', async () => {
          return await this.copySpecialFolders(serverConfig, serverType);
        });
      }

      // PHASE 8: Stop services
      await this.runPhase(8, 'Stop Services', async () => {
        return await this.stopServices(serverConfig, serverType);
      });

      // PHASE 9: Backup existing folders to Backup folder
      await this.runPhase(9, 'Backup & Move to Backup Folder', async () => {
        return await this.backupFolders(serverConfig, serverType);
      });

      // PHASE 10: Deploy new version
      await this.runPhase(10, 'Deploy New Version', async () => {
        return await this.deployNewVersion(serverConfig, serverType);
      });

      // PHASE 11: Start services
      await this.runPhase(11, 'Start Services', async () => {
        return await this.startServices(serverConfig, serverType);
      });

      // PHASE 12: Cleanup temp folder
      await this.runPhase(12, 'Cleanup', async () => {
        return await this.cleanup(serverConfig, serverType);
      });

      const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

      return {
        success: true,
        message: 'Upgrade completed successfully',
        phases: this.phases,
        duration: `${totalDuration}s`
      };

    } catch (error) {
      console.error('Upgrade failed:', error);
      
      // Mark current phase as error
      if (this.phases.length > 0) {
        const lastPhase = this.phases[this.phases.length - 1];
        if (lastPhase.status === 'running') {
          lastPhase.status = 'error';
          lastPhase.error = error.message;
        }
      }

      throw {
        message: error.message,
        phases: this.phases
      };
    }
  }

  determineServerType(serverConfig) {
    // Frontend servers are in the 'frontend' group
    if (serverConfig.group === 'frontend') {
      return 'frontend';
    }
    // Everything else is backend
    return 'backend';
  }

  determineFilesToDownload(serverType, s3Keys) {
    const files = [];
    
    if (serverType === 'backend') {
      // Backend servers only get backend.zip
      if (s3Keys.backend) files.push('backend');
    } else {
      // Frontend servers (FE1, FE2)
      // Check server name to determine FE1 vs FE2
      // For now, we'll download all UI files that are available
      // and the script will handle which to process
      if (s3Keys.oldUI) files.push('oldUI');
      if (s3Keys.newUI) files.push('newUI');
      if (s3Keys.apiManagement) files.push('apiManagement');
    }
    
    return files;
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
    
    console.log(`\n========================================`);
    console.log(`PHASE ${phaseNumber}: ${phaseName}`);
    console.log(`========================================\n`);

    try {
      const result = await phaseFunction();
      
      const duration = ((Date.now() - phaseStart) / 1000).toFixed(1);
      phase.status = 'success';
      phase.duration = `${duration}s`;
      phase.details = result || 'Completed';
      
      console.log(`✅ Phase ${phaseNumber} completed in ${duration}s\n`);
      
      return result;
    } catch (error) {
      const duration = ((Date.now() - phaseStart) / 1000).toFixed(1);
      phase.status = 'error';
      phase.duration = `${duration}s`;
      phase.error = error.message;
      
      console.error(`❌ Phase ${phaseNumber} failed: ${error.message}\n`);
      
      throw error;
    }
  }

  async downloadFromS3(serverConfig, downloadUrls, serverType) {
    const scriptTemplate = await this.loadScript('01-download-from-s3.ps1');
    
    // Replace placeholders with URLs
    let script = scriptTemplate
      .replace('{{SERVER_TYPE}}', serverType)
      .replace('{{BACKEND_URL}}', downloadUrls.backend || '')
      .replace('{{OLD_UI_URL}}', downloadUrls.oldUI || '')
      .replace('{{NEW_UI_URL}}', downloadUrls.newUI || '')
      .replace('{{API_MGMT_URL}}', downloadUrls.apiManagement || '');
    
    const result = await sshService.executeScript(serverConfig, script);
    return result.trim();
  }

  async createTempFolder(serverConfig, serverType) {
    const scriptTemplate = await this.loadScript('02-create-temp-folder.ps1');
    const script = scriptTemplate.replace('{{SERVER_TYPE}}', serverType);
    const result = await sshService.executeScript(serverConfig, script);
    return result.trim();
  }

  async unzipFiles(serverConfig, serverType) {
    const scriptTemplate = await this.loadScript('03-unzip-files.ps1');
    const script = scriptTemplate.replace('{{SERVER_TYPE}}', serverType);
    const result = await sshService.executeScript(serverConfig, script);
    return result.trim();
  }

  async runUpdateDB(serverConfig, serverType) {
    const scriptTemplate = await this.loadScript('03.5-run-updatedb.ps1');
    const script = scriptTemplate.replace('{{SERVER_TYPE}}', serverType);
    const result = await sshService.executeScript(serverConfig, script);
    return result.trim();
  }

  async renameFolders(serverConfig, serverType) {
    const scriptTemplate = await this.loadScript('04-rename-folders.ps1');
    const script = scriptTemplate.replace('{{SERVER_TYPE}}', serverType);
    const result = await sshService.executeScript(serverConfig, script);
    return result.trim();
  }

  async copyVaultFiles(serverConfig, serverType) {
    const scriptTemplate = await this.loadScript('05-copy-vault-json.ps1');
    const script = scriptTemplate.replace('{{SERVER_TYPE}}', serverType);
    const result = await sshService.executeScript(serverConfig, script);
    return result.trim();
  }

  async copyConfigFiles(serverConfig, serverType) {
    const scriptTemplate = await this.loadScript('06-copy-config-files.ps1');
    const script = scriptTemplate.replace('{{SERVER_TYPE}}', serverType);
    const result = await sshService.executeScript(serverConfig, script);
    return result.trim();
  }

  async copySpecialFolders(serverConfig, serverType) {
    const scriptTemplate = await this.loadScript('07-copy-special-folders.ps1');
    const script = scriptTemplate.replace('{{SERVER_TYPE}}', serverType);
    const result = await sshService.executeScript(serverConfig, script);
    return result.trim();
  }

  async stopServices(serverConfig, serverType) {
    const scriptTemplate = await this.loadScript('08-stop-services.ps1');
    
    // Get service names from config
    const serviceNames = serverConfig.serviceNames || [];
    const servicesJson = JSON.stringify(serviceNames);
    
    const script = scriptTemplate
      .replace('{{SERVICE_NAMES_JSON}}', servicesJson)
      .replace('{{SERVER_TYPE}}', serverType);
    const result = await sshService.executeScript(serverConfig, script);
    return result.trim();
  }

  async backupFolders(serverConfig, serverType) {
    const scriptTemplate = await this.loadScript('09-backup-folders.ps1');
    const script = scriptTemplate.replace('{{SERVER_TYPE}}', serverType);
    const result = await sshService.executeScript(serverConfig, script);
    return result.trim();
  }

  async deployNewVersion(serverConfig, serverType) {
    const scriptTemplate = await this.loadScript('10-deploy-new-version.ps1');
    const script = scriptTemplate.replace('{{SERVER_TYPE}}', serverType);
    const result = await sshService.executeScript(serverConfig, script);
    return result.trim();
  }

  async startServices(serverConfig, serverType) {
    const scriptTemplate = await this.loadScript('11-start-services.ps1');
    
    // Get service names from config
    const serviceNames = serverConfig.serviceNames || [];
    const servicesJson = JSON.stringify(serviceNames);
    
    const script = scriptTemplate
      .replace('{{SERVICE_NAMES_JSON}}', servicesJson)
      .replace('{{SERVER_TYPE}}', serverType);
    const result = await sshService.executeScript(serverConfig, script);
    return result.trim();
  }

  async cleanup(serverConfig, serverType) {
    const scriptTemplate = await this.loadScript('12-cleanup-temp.ps1');
    const script = scriptTemplate.replace('{{SERVER_TYPE}}', serverType);
    const result = await sshService.executeScript(serverConfig, script);
    return result.trim();
  }

  async loadScript(scriptName) {
    const scriptPath = path.join(this.scriptsPath, scriptName);
    const content = await fs.readFile(scriptPath, 'utf8');
    return content;
  }
}

module.exports = new UpgradeService();
