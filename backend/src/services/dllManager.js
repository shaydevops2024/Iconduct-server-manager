// Full path: backend/src/services/dllManager.js
const sshService = require('./sshService');
const dbService = require('./dbService');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const sql = require('mssql');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

class DLLManager {
  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'eu-central-1',
    });
    this.S3_BUCKET = process.env.S3_BUCKET || 'shayg-test-grafana';
    this.S3_REGION = process.env.AWS_REGION || 'eu-central-1';
  }

  async getAllDLLs(forceRefresh = false) {
    console.log(`\n========================================`);
    console.log(`${forceRefresh ? '🔄 FORCE REFRESH' : '📦 Getting'} DLL data...`);
    console.log(`========================================\n`);

    // If not forcing refresh, try to get from cache
    if (!forceRefresh) {
      const cachedData = await dbService.getCachedDLLs();
      if (cachedData && cachedData.length > 0) {
        const lastRefresh = await dbService.getDLLLastRefresh();
        console.log(`✅ Returning cached DLL data from database`);
        console.log(`   Last refresh: ${lastRefresh || 'Unknown'}`);
        console.log(`   Servers: ${cachedData.length}`);
        console.log(`========================================\n`);
        
        // Return cached data with server statuses
        const statuses = await dbService.getAllServerStatuses();
        return cachedData.map(server => ({
          ...server,
          available: statuses[server.serverName]?.isAvailable ?? true,
          errorMessage: statuses[server.serverName]?.errorMessage || null
        }));
      }
      console.log(`⚠️  No cached data found, fetching from servers...\n`);
    }

    // Force refresh or no cache - fetch from servers
    const servers = sshService.getAllServers();
    console.log(`Scanning DLLs on ${servers.length} servers...`);
    console.log(`========================================\n`);

    // First, do quick availability checks for all servers
    console.log(`🔍 Checking server availability (fast TCP check)...\n`);
    const availabilityChecks = await Promise.all(
      servers.map(server => sshService.checkServerAvailability(server))
    );

    const availableServers = [];
    const unavailableServers = [];

    servers.forEach((server, index) => {
      if (availabilityChecks[index].available) {
        availableServers.push(server);
      } else {
        unavailableServers.push({
          server,
          error: availabilityChecks[index].error
        });
        // Update DB with server unavailable status
        dbService.updateServerStatus(
          server.name,
          server.group,
          false,
          availabilityChecks[index].error
        );
      }
    });

    console.log(`\n✅ Available servers: ${availableServers.length}/${servers.length}`);
    console.log(`❌ Unavailable servers: ${unavailableServers.length}/${servers.length}\n`);

    // Fetch DLLs only from available servers
    const results = await Promise.allSettled(
      availableServers.map(server => this.getServerDLLs(server))
    );

    const dllData = [];

    // Process available servers
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const server = availableServers[i];
      
      if (result.status === 'fulfilled') {
        console.log(`✅ Found ${result.value.length} DLLs on ${server.name}`);
        
        // Cache in database
        await dbService.cacheDLLData(server.name, server.group, result.value);
        
        // Update server status as available
        await dbService.updateServerStatus(server.name, server.group, true, null);
        
        dllData.push({
          serverName: server.name,
          serverGroup: server.group,
          dlls: result.value,
          available: true
        });
      } else {
        console.error(`❌ Error getting DLLs from ${server.name}:`, result.reason.message);
        
        // Update server status as unavailable
        await dbService.updateServerStatus(server.name, server.group, false, result.reason.message);
        
        dllData.push({
          serverName: server.name,
          serverGroup: server.group,
          dlls: [],
          available: false,
          errorMessage: result.reason.message
        });
      }
    }

    // Add unavailable servers to response
    unavailableServers.forEach(({ server, error }) => {
      console.log(`⚠️  Skipped ${server.name} - ${error}`);
      dllData.push({
        serverName: server.name,
        serverGroup: server.group,
        dlls: [],
        available: false,
        errorMessage: error
      });
    });

    // Update last refresh timestamp
    await dbService.updateDLLRefreshTime();

    console.log(`\n========================================`);
    console.log(`✅ DLL scan complete!`);
    console.log(`   Total servers: ${servers.length}`);
    console.log(`   Available: ${availableServers.length}`);
    console.log(`   Unavailable: ${unavailableServers.length}`);
    console.log(`========================================\n`);

    return dllData;
  }

  extractVersionFromFilename(filename) {
    const nameWithoutExt = filename.replace(/\.dll$/i, '');
    const versionPattern = /(\d+\.\d+\.\d+\.\d+)/;
    const match = nameWithoutExt.match(versionPattern);
    return match ? match[1] : null;
  }

  async getServerDLLs(serverConfig) {
    try {
      const dllPath = serverConfig.dllPath;
      if (!dllPath) {
        console.log(`⚠️ No DLL path configured for ${serverConfig.name}`);
        return [];
      }

      console.log(`\n🔍 Scanning DLLs on ${serverConfig.name} at ${dllPath}`);

      const command = `Get-ChildItem -Path '${dllPath}' -Directory -ErrorAction SilentlyContinue | ForEach-Object { $folder = $_; Get-ChildItem -Path $folder.FullName -Filter '*.dll' -Recurse -ErrorAction SilentlyContinue | ForEach-Object { $dll = $_; try { $ver = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($dll.FullName); $fv = $ver.FileVersion; $pv = $ver.ProductVersion; $fvClean = if([string]::IsNullOrWhiteSpace($fv) -or $fv -eq '0.0.0.0'){''}else{$fv.Trim()}; $pvClean = if([string]::IsNullOrWhiteSpace($pv) -or $pv -eq '0.0.0.0'){''}else{$pv.Trim()}; $bestVer = if($pvClean -ne ''){$pvClean}elseif($fvClean -ne ''){$fvClean}else{'N/A'}; [PSCustomObject]@{Name=$dll.Name;Folder=$folder.Name;FullPath=$dll.FullName;FileVersion=if($fvClean -ne ''){$fvClean}else{'N/A'};ProductVersion=if($pvClean -ne ''){$pvClean}else{'N/A'};Version=$bestVer;Size=[math]::Round($dll.Length/1KB,2);LastModified=$dll.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')} } catch { [PSCustomObject]@{Name=$dll.Name;Folder=$folder.Name;FullPath=$dll.FullName;FileVersion='N/A';ProductVersion='N/A';Version='N/A';Size=[math]::Round($dll.Length/1KB,2);LastModified=$dll.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')} } } } | ConvertTo-Json`;

      const output = await sshService.executeCommand(serverConfig, command);
      if (!output.trim()) {
        console.log(`⚠️ No DLLs found on ${serverConfig.name}`);
        return [];
      }

      const parsed = JSON.parse(output);
      let dlls = Array.isArray(parsed) ? parsed : [parsed];

      dlls = dlls.map(dll => {
        const filenameVersion = this.extractVersionFromFilename(dll.Name);
        if (filenameVersion) {
          const metadataVersion = dll.Version !== 'N/A' ? dll.Version : null;
          if (!metadataVersion) {
            dll.Version = filenameVersion;
            dll.VersionSource = 'filename';
          } else if (this.compareVersions(filenameVersion, metadataVersion) > 0) {
            dll.Version = filenameVersion;
            dll.VersionSource = 'filename';
          } else {
            dll.VersionSource = 'metadata';
          }
        } else {
          dll.VersionSource = 'metadata';
        }
        return dll;
      });

      console.log(`\n📦 Processed ${dlls.length} DLLs from ${serverConfig.name}`);
      return dlls;
    } catch (error) {
      console.error(`❌ Error getting DLLs from ${serverConfig.name}:`, error.message);
      throw error;
    }
  }

  async updateDatabase(dbConfig, dllName, version) {
    console.log(`\n========================================`);
    console.log(`DATABASE UPDATE`);
    console.log(`========================================`);
    console.log(`DLL Name: ${dllName}`);
    console.log(`Version: ${version}\n`);

    let pool;
    try {
      console.log(`🔌 Connecting to database...`);
      pool = await sql.connect(dbConfig);
      console.log(`✅ Connected to database\n`);

      console.log(`🔍 Step 1: Finding ConnectorType ID...`);
      const connectorTypeResult = await pool.request()
        .input('dllName', sql.NVarChar, dllName)
        .query(`SELECT Id, Name FROM ConnectorType WHERE Name LIKE '%' + @dllName + '%'`);

      if (connectorTypeResult.recordset.length === 0) {
        console.log(`❌ ConnectorType not found for: ${dllName}`);
        console.log(`   Please ensure the DLL name exists in ConnectorType table\n`);
        return { success: false, error: 'ConnectorType not found' };
      }

      const connectorTypeId = connectorTypeResult.recordset[0].Id;
      const connectorTypeName = connectorTypeResult.recordset[0].Name;
      console.log(`✅ Found ConnectorType:`);
      console.log(`   ID: ${connectorTypeId}`);
      console.log(`   Name: ${connectorTypeName}\n`);

      console.log(`🔍 Step 2: Checking if version exists...`);
      const versionCheckResult = await pool.request()
        .input('connectorTypeId', sql.Int, connectorTypeId)
        .input('version', sql.NVarChar, version)
        .query(`SELECT * FROM ConnectorTypeVersion WHERE ConnectorTypeId = @connectorTypeId AND Version = @version`);

      if (versionCheckResult.recordset.length > 0) {
        console.log(`ℹ️  Version already exists in database:`);
        console.log(`   ID: ${versionCheckResult.recordset[0].Id}`);
        console.log(`   Version: ${versionCheckResult.recordset[0].Version}`);
        console.log(`   Enabled: ${versionCheckResult.recordset[0].Enabled}`);
        console.log(`   ConnectorTypeId: ${versionCheckResult.recordset[0].ConnectorTypeId}\n`);
      } else {
        console.log(`📝 Step 3: Inserting new version into database...`);
        const newGuid = crypto.randomUUID();
        const insertResult = await pool.request()
          .input('version', sql.NVarChar, version)
          .input('enabled', sql.Bit, true)
          .input('connectorTypeId', sql.Int, connectorTypeId)
          .input('uid', sql.UniqueIdentifier, newGuid)
          .query(`
            INSERT INTO ConnectorTypeVersion (Version, Enabled, ConnectorTypeId, UID)
            OUTPUT INSERTED.Id, INSERTED.Version, INSERTED.Enabled, INSERTED.ConnectorTypeId
            VALUES (@version, @enabled, @connectorTypeId, @uid)
          `);

        console.log(`✅ New version inserted successfully:`);
        console.log(`   ID: ${insertResult.recordset[0].Id}`);
        console.log(`   Version: ${insertResult.recordset[0].Version}`);
        console.log(`   Enabled: ${insertResult.recordset[0].Enabled}`);
        console.log(`   ConnectorTypeId: ${insertResult.recordset[0].ConnectorTypeId}\n`);
      }

      console.log(`📋 Step 4: All versions for ConnectorTypeId ${connectorTypeId}:`);
      const allVersionsResult = await pool.request()
        .input('connectorTypeId', sql.Int, connectorTypeId)
        .query(`
          SELECT Id, Version, Description, Enabled, ConnectorTypeId, UID 
          FROM ConnectorTypeVersion 
          WHERE ConnectorTypeId = @connectorTypeId
          ORDER BY Version DESC
        `);

      console.log(`\n   Total versions: ${allVersionsResult.recordset.length}`);
      console.log(`   ┌─────┬──────────┬─────────┐`);
      console.log(`   │ ID  │ Version  │ Enabled │`);
      console.log(`   ├─────┼──────────┼─────────┤`);
      allVersionsResult.recordset.forEach(row => {
        console.log(`   │ ${String(row.Id).padEnd(3)} │ ${String(row.Version).padEnd(8)} │ ${row.Enabled ? '  ✅   ' : '  ❌   '} │`);
      });
      console.log(`   └─────┴──────────┴─────────┘\n`);

      console.log(`========================================`);
      console.log(`✅ DATABASE UPDATE COMPLETE!`);
      console.log(`========================================\n`);

      return {
        success: true,
        connectorTypeId: connectorTypeId,
        allVersions: allVersionsResult.recordset
      };
    } catch (error) {
      console.error(`\n❌ DATABASE ERROR: ${error.message}\n`);
      throw error;
    } finally {
      if (pool) {
        await pool.close();
        console.log(`🔌 Database connection closed\n`);
      }
    }
  }

  async deployToServer(serverConfig, dllName, version, presignedUrl, serverType = 'Backend') {
    const dllPath = serverConfig.dllPath;
    const dllFolder = `${dllPath}\\${dllName}`;
    const versionPath = `${dllFolder}\\${version}`;
    const timestamp = Date.now();
    const zipFileName = `${dllName}_${version}_${timestamp}.zip`;
    const zipPath = `${dllFolder}\\${zipFileName}`;

    try {
      console.log(`\n   🎯 Deploying to ${serverType}: ${serverConfig.name}`);
      console.log(`   📍 Target: ${versionPath}`);

      const ensureFolderCmd = `if (!(Test-Path '${dllFolder}')) { New-Item -ItemType Directory -Path '${dllFolder}' -Force | Out-Null }`;
      await sshService.executeCommand(serverConfig, ensureFolderCmd);

      const downloadCmd = `Invoke-WebRequest -Uri '${presignedUrl}' -OutFile '${zipPath}' -UseBasicParsing`;
      await sshService.executeCommand(serverConfig, downloadCmd);
      console.log(`   ✅ Downloaded ZIP`);

      const removeOldCmd = `if (Test-Path '${versionPath}') { Remove-Item -Path '${versionPath}' -Recurse -Force }`;
      await sshService.executeCommand(serverConfig, removeOldCmd);

      const extractCmd = `Expand-Archive -Path '${zipPath}' -DestinationPath '${dllFolder}' -Force`;
      await sshService.executeCommand(serverConfig, extractCmd);
      console.log(`   ✅ Extracted ZIP`);

      const deleteZipCmd = `Remove-Item -Path '${zipPath}' -Force -ErrorAction SilentlyContinue`;
      await sshService.executeCommand(serverConfig, deleteZipCmd);

      const verifyCmd = `if (Test-Path '${versionPath}') { (Get-ChildItem -Path '${versionPath}' -File).Count } else { Write-Output "0" }`;
      const fileCount = await sshService.executeCommand(serverConfig, verifyCmd);
      
      if (parseInt(fileCount.trim()) > 0) {
        console.log(`   ✅ Verified: ${fileCount.trim()} files deployed`);
        return { success: true, path: versionPath, fileCount: parseInt(fileCount.trim()) };
      } else {
        throw new Error('No files found after deployment');
      }
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      return { success: false, path: versionPath, error: error.message };
    }
  }

  async updateDLL(sourceServerConfig, targetServerConfig, dllName, version) {
    console.log(`\n========================================`);
    console.log(`DLL TRANSFER - FULL DEPLOYMENT`);
    console.log(`========================================`);
    console.log(`Source: ${sourceServerConfig.name}`);
    console.log(`Target: ${targetServerConfig.name} (Backend)`);
    console.log(`DLL: ${dllName}`);
    console.log(`Version: ${version}\n`);

    const sourceDllPath = sourceServerConfig.dllPath;
    const sourceDllFolder = `${sourceDllPath}\\${dllName}`;
    const sourceVersionPath = `${sourceDllFolder}\\${version}`;

    const targetDllPath = targetServerConfig.dllPath;
    const targetDllFolder = `${targetDllPath}\\${dllName}`;
    const targetVersionPath = `${targetDllFolder}\\${version}`;

    const timestamp = Date.now();
    const zipFileName = `${dllName}_${version}_${timestamp}.zip`;
    const sourceZipPath = `${sourceDllFolder}\\${zipFileName}`;
    const localTempPath = path.join(os.tmpdir(), zipFileName);
    const targetZipPath = `${targetDllFolder}\\${zipFileName}`;
    const s3Key = `${zipFileName}`;

    let s3Uploaded = false;
    let presignedUrl = null;
    const deploymentResults = {
      backend: null,
      additionalPaths: [],
      frontendServers: [],
      database: null
    };

    try {
      console.log(`📦 STEP 1: Verifying source on ${sourceServerConfig.name}...`);
      const checkSourceCmd = `Test-Path '${sourceVersionPath}'`;
      const sourceExists = await sshService.executeCommand(sourceServerConfig, checkSourceCmd);
      if (sourceExists.trim() !== 'True') {
        throw new Error(`Source does not exist: ${sourceVersionPath}`);
      }
      console.log(`✅ Source verified\n`);

      console.log(`📦 STEP 2: Creating ZIP on ${sourceServerConfig.name}...`);
      const zipCmd = `Push-Location '${sourceDllFolder}'; Compress-Archive -Path '${version}' -DestinationPath '${zipFileName}' -Force; Pop-Location`;
      await sshService.executeCommand(sourceServerConfig, zipCmd);
      console.log(`✅ ZIP created\n`);

      console.log(`⬇️  STEP 3: Downloading ZIP to local machine...`);
      await sshService.downloadFile(sourceServerConfig, sourceZipPath, localTempPath);
      const localFileSize = fs.statSync(localTempPath).size;
      console.log(`✅ Downloaded ${localFileSize} bytes\n`);

      console.log(`☁️  STEP 4: Uploading to S3...`);
      const fileStream = fs.createReadStream(localTempPath);
      const uploadCommand = new PutObjectCommand({
        Bucket: this.S3_BUCKET,
        Key: s3Key,
        Body: fileStream,
        ContentType: 'application/zip'
      });

      await this.s3Client.send(uploadCommand);
      s3Uploaded = true;
      console.log(`✅ Uploaded to S3\n`);

      console.log(`🔗 STEP 5: Generating presigned URL...`);
      const getObjectCommand = new GetObjectCommand({
        Bucket: this.S3_BUCKET,
        Key: s3Key
      });
      presignedUrl = await getSignedUrl(this.s3Client, getObjectCommand, { expiresIn: 3600 });
      console.log(`✅ Presigned URL generated (valid for 1 hour)\n`);

      console.log(`========================================`);
      console.log(`BACKEND DEPLOYMENT`);
      console.log(`========================================`);
      
      const backendResult = await this.deployToServer(targetServerConfig, dllName, version, presignedUrl, 'Backend');
      deploymentResults.backend = backendResult;

      if (!backendResult.success) {
        throw new Error(`Backend deployment failed: ${backendResult.error}`);
      }

      const additionalPaths = targetServerConfig.additionalDllPaths || [];
      if (additionalPaths.length > 0) {
        console.log(`\n📋 STEP 7: Copying to ${additionalPaths.length} additional backend location(s)...`);
        
        for (let i = 0; i < additionalPaths.length; i++) {
          const additionalBasePath = additionalPaths[i];
          const additionalDllFolder = `${additionalBasePath}\\${dllName}`;
          const additionalVersionPath = `${additionalDllFolder}\\${version}`;
          
          console.log(`\n   📁 Additional Path ${i + 1}/${additionalPaths.length}: ${additionalVersionPath}`);
          
          try {
            const ensureAdditionalFolderCmd = `if (!(Test-Path '${additionalDllFolder}')) { New-Item -ItemType Directory -Path '${additionalDllFolder}' -Force | Out-Null }`;
            await sshService.executeCommand(targetServerConfig, ensureAdditionalFolderCmd);
            
            const removeOldAdditionalCmd = `if (Test-Path '${additionalVersionPath}') { Remove-Item -Path '${additionalVersionPath}' -Recurse -Force }`;
            await sshService.executeCommand(targetServerConfig, removeOldAdditionalCmd);
            
            const copyCmd = `Copy-Item -Path '${targetVersionPath}\\*' -Destination '${additionalVersionPath}' -Recurse -Force`;
            await sshService.executeCommand(targetServerConfig, copyCmd);
            
            const verifyAdditionalCmd = `if (Test-Path '${additionalVersionPath}') { (Get-ChildItem -Path '${additionalVersionPath}' -File).Count } else { Write-Output "0" }`;
            const fileCount = await sshService.executeCommand(targetServerConfig, verifyAdditionalCmd);
            
            if (parseInt(fileCount.trim()) > 0) {
              console.log(`   ✅ Copied successfully (${fileCount.trim()} files)`);
              deploymentResults.additionalPaths.push({ path: additionalVersionPath, success: true, fileCount: parseInt(fileCount.trim()) });
            } else {
              console.log(`   ⚠️  Warning: Copy completed but no files found`);
              deploymentResults.additionalPaths.push({ path: additionalVersionPath, success: false, error: 'No files found' });
            }
          } catch (error) {
            console.log(`   ❌ Failed: ${error.message}`);
            deploymentResults.additionalPaths.push({ path: additionalVersionPath, success: false, error: error.message });
          }
        }
      }

      const frontendServers = targetServerConfig.frontendServers || [];
      if (frontendServers.length > 0) {
        console.log(`\n========================================`);
        console.log(`FRONTEND DEPLOYMENT`);
        console.log(`========================================`);
        console.log(`Deploying to ${frontendServers.length} frontend server(s)...\n`);
        
        for (let i = 0; i < frontendServers.length; i++) {
          const feServer = frontendServers[i];
          const feResult = await this.deployToServer(feServer, dllName, version, presignedUrl, 'Frontend');
          deploymentResults.frontendServers.push({
            serverName: feServer.name,
            ...feResult
          });
        }
      }

      if (targetServerConfig.dbConnection) {
        try {
          const dbResult = await this.updateDatabase(targetServerConfig.dbConnection, dllName, version);
          deploymentResults.database = dbResult;
        } catch (error) {
          console.error(`⚠️  Database update failed: ${error.message}`);
          deploymentResults.database = { success: false, error: error.message };
        }
      } else {
        console.log(`\nℹ️  No database connection configured for ${targetServerConfig.name}\n`);
      }

      console.log(`🧹 STEP 10: Cleaning up temporary files...`);
      await sshService.executeCommand(sourceServerConfig, `Remove-Item -Path '${sourceZipPath}' -Force -ErrorAction SilentlyContinue`);
      if (fs.existsSync(localTempPath)) {
        fs.unlinkSync(localTempPath);
      }
      console.log(`✅ Cleanup complete\n`);

      console.log(`========================================`);
      console.log(`✅ DEPLOYMENT COMPLETE!`);
      console.log(`========================================`);
      console.log(`DLL: ${dllName}`);
      console.log(`Version: ${version}`);
      console.log(`\nBACKEND:`);
      console.log(`  Main: ${targetVersionPath} ✅`);
      if (additionalPaths.length > 0) {
        console.log(`  Additional: ${deploymentResults.additionalPaths.filter(r => r.success).length}/${additionalPaths.length} ✅`);
      }
      if (frontendServers.length > 0) {
        const feSuccess = deploymentResults.frontendServers.filter(r => r.success).length;
        console.log(`\nFRONTEND:`);
        console.log(`  Deployed: ${feSuccess}/${frontendServers.length} ✅`);
        deploymentResults.frontendServers.forEach(fe => {
          console.log(`    ${fe.serverName}: ${fe.success ? '✅' : '❌'}`);
        });
      }
      if (deploymentResults.database) {
        console.log(`\nDATABASE:`);
        console.log(`  Update: ${deploymentResults.database.success ? '✅' : '❌'}`);
      }
      console.log(`========================================\n`);

      return {
        success: true,
        sourceServer: sourceServerConfig.name,
        targetServer: targetServerConfig.name,
        dllName: dllName,
        version: version,
        deploymentResults: deploymentResults
      };
    } catch (error) {
      console.error(`\n❌ DEPLOYMENT FAILED: ${error.message}\n`);

      try {
        console.log(`🧹 Cleaning up after error...`);
        if (fs.existsSync(localTempPath)) {
          fs.unlinkSync(localTempPath);
        }
        await sshService.executeCommand(sourceServerConfig, `Remove-Item -Path '${sourceZipPath}' -Force -ErrorAction SilentlyContinue`).catch(() => {});
      } catch (cleanupError) {
        console.error(`⚠️  Cleanup error: ${cleanupError.message}`);
      }

      throw error;
    } finally {
      if (s3Uploaded) {
        try {
          console.log(`☁️  Removing from S3...`);
          const deleteCommand = new DeleteObjectCommand({
            Bucket: this.S3_BUCKET,
            Key: s3Key
          });
          await this.s3Client.send(deleteCommand);
          console.log(`✅ Removed from S3\n`);
        } catch (err) {
          console.error(`⚠️  Failed to remove from S3: ${err.message}`);
        }
      }
    }
  }

  async getDLLSummary() {
    const allDLLs = await this.getAllDLLs();

    console.log(`\n========================================`);
    console.log(`Creating DLL Summary`);
    console.log(`========================================\n`);

    const folderMap = new Map();

    allDLLs.forEach(serverData => {
      if (serverData.dlls && serverData.dlls.length > 0) {
        serverData.dlls.forEach(dll => {
          if (!folderMap.has(dll.Folder)) {
            folderMap.set(dll.Folder, {
              folderName: dll.Folder,
              dlls: []
            });
          }

          const folderInfo = folderMap.get(dll.Folder);
          folderInfo.dlls.push({
            name: dll.Name,
            server: serverData.serverName,
            serverGroup: serverData.serverGroup,
            version: dll.Version,
            versionSource: dll.VersionSource,
            fileVersion: dll.FileVersion,
            productVersion: dll.ProductVersion,
            size: dll.Size,
            lastModified: dll.LastModified,
            fullPath: dll.FullPath
          });
        });
      }
    });

    const summary = Array.from(folderMap.values()).map(folder => {
      console.log(`\n📁 Folder: ${folder.folderName}`);

      const allVersions = folder.dlls
        .map(dll => dll.version)
        .filter(v => v && v !== 'N/A' && v !== '0.0.0.0');

      const uniqueVersions = [...new Set(allVersions)];
      const sortedVersions = uniqueVersions.sort((a, b) => this.compareVersions(b, a));

      const latestVersion = sortedVersions[0] || 'N/A';
      const previousVersions = sortedVersions.slice(1);

      console.log(`   Latest: ${latestVersion}`);
      console.log(`   Previous: [${previousVersions.join(', ')}]`);

      const versionGroups = {};
      folder.dlls.forEach(dll => {
        const ver = dll.version || 'N/A';
        if (!versionGroups[ver]) {
          versionGroups[ver] = [];
        }
        versionGroups[ver].push(dll);
      });

      return {
        folderName: folder.folderName,
        latestVersion,
        previousVersions,
        allVersions: sortedVersions,
        dllCount: folder.dlls.length,
        versionGroups,
        servers: [...new Set(folder.dlls.map(d => d.server))]
      };
    });

    console.log(`\n========================================`);
    console.log(`Summary Created for ${summary.length} folders`);
    console.log(`========================================\n`);

    return summary.sort((a, b) => a.folderName.localeCompare(b.folderName));
  }

  compareVersions(v1, v2) {
    if (!v1 || v1 === 'N/A') return -1;
    if (!v2 || v2 === 'N/A') return 1;

    const clean1 = v1.replace(/^[^0-9]+/, '');
    const clean2 = v2.replace(/^[^0-9]+/, '');

    const parts1 = clean1.split('.').map(n => parseInt(n) || 0);
    const parts2 = clean2.split('.').map(n => parseInt(n) || 0);

    const maxLen = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < maxLen; i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;

      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }

    return 0;
  }

  async getFolderDetails(folderName) {
    const allDLLs = await this.getAllDLLs();

    const details = [];
    allDLLs.forEach(serverData => {
      const matchingDlls = serverData.dlls.filter(dll =>
        dll.Folder.toLowerCase() === folderName.toLowerCase()
      );

      if (matchingDlls.length > 0) {
        matchingDlls.forEach(dll => {
          details.push({
            server: serverData.serverName,
            serverGroup: serverData.serverGroup,
            name: dll.Name,
            folder: dll.Folder,
            version: dll.Version,
            versionSource: dll.VersionSource,
            fileVersion: dll.FileVersion,
            productVersion: dll.ProductVersion,
            size: dll.Size,
            lastModified: dll.LastModified,
            fullPath: dll.FullPath
          });
        });
      }
    });

    return details;
  }
}

module.exports = new DLLManager();