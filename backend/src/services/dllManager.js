
const sshService = require('./sshService');

const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const fs = require('fs');

const path = require('path');

const os = require('os');



class DLLManager {

  constructor() {

    this.s3Client = new S3Client({

      region: process.env.AWS_REGION || 'eu-central-1',

    });

    this.S3_BUCKET = process.env.S3_BUCKET || 'shayg-test-grafana';

    this.S3_REGION = process.env.AWS_REGION || 'eu-central-1';

  }



  async getAllDLLs() {

    const servers = sshService.getAllServers();

    console.log(`\n========================================`);

    console.log(`Scanning DLLs on ${servers.length} servers...`);

    console.log(`========================================\n`);



    const results = await Promise.allSettled(

      servers.map(server => this.getServerDLLs(server))

    );



    const dllData = [];

    results.forEach((result, index) => {

      const server = servers[index];

      if (result.status === 'fulfilled') {

        console.log(`✅ Found ${result.value.length} DLLs on ${server.name}`);

        dllData.push({

          serverName: server.name,

          serverGroup: server.group,

          dlls: result.value

        });

      } else {

        console.error(`❌ Error getting DLLs from ${server.name}:`, result.reason.message);

        dllData.push({

          serverName: server.name,

          serverGroup: server.group,

          dlls: [],

          error: result.reason.message

        });

      }

    });



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



  async updateDLL(sourceServerConfig, targetServerConfig, dllName, version) {

    console.log(`\n========================================`);

    console.log(`DLL TRANSFER - COMPLETE DEPLOYMENT`);

    console.log(`========================================`);

    console.log(`Source: ${sourceServerConfig.name}`);

    console.log(`Target: ${targetServerConfig.name}`);

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



    try {

      // STEP 1: Verify source

      console.log(`📦 STEP 1: Verifying source on ${sourceServerConfig.name}...`);

      const checkSourceCmd = `Test-Path '${sourceVersionPath}'`;

      const sourceExists = await sshService.executeCommand(sourceServerConfig, checkSourceCmd);

      if (sourceExists.trim() !== 'True') {

        throw new Error(`Source does not exist: ${sourceVersionPath}`);

      }

      console.log(`✅ Source verified\n`);



      // STEP 2: Create ZIP on source

      console.log(`📦 STEP 2: Creating ZIP on ${sourceServerConfig.name}...`);

      const zipCmd = `Push-Location '${sourceDllFolder}'; Compress-Archive -Path '${version}' -DestinationPath '${zipFileName}' -Force; Pop-Location`;

      await sshService.executeCommand(sourceServerConfig, zipCmd);

      console.log(`✅ ZIP created\n`);



      // STEP 3: Download ZIP to local machine

      console.log(`⬇️  STEP 3: Downloading ZIP to local machine...`);

      await sshService.downloadFile(sourceServerConfig, sourceZipPath, localTempPath);

      const localFileSize = fs.statSync(localTempPath).size;

      console.log(`✅ Downloaded ${localFileSize} bytes\n`);



      // STEP 4: Upload to S3

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



      // STEP 5: Generate presigned URL

      console.log(`🔗 STEP 5: Generating presigned URL...`);

      const getObjectCommand = new GetObjectCommand({

        Bucket: this.S3_BUCKET,

        Key: s3Key

      });

      const presignedUrl = await getSignedUrl(this.s3Client, getObjectCommand, { expiresIn: 3600 });

      console.log(`✅ Presigned URL generated\n`);



      // STEP 6: Download from S3 to target

      console.log(`⬇️  STEP 6: Downloading to ${targetServerConfig.name}...`);

      const ensureFolderCmd = `if (!(Test-Path '${targetDllFolder}')) { New-Item -ItemType Directory -Path '${targetDllFolder}' -Force | Out-Null }`;

      await sshService.executeCommand(targetServerConfig, ensureFolderCmd);



      const downloadCmd = `Invoke-WebRequest -Uri '${presignedUrl}' -OutFile '${targetZipPath}' -UseBasicParsing`;

      await sshService.executeCommand(targetServerConfig, downloadCmd);

      console.log(`✅ Downloaded ZIP to target\n`);



      // STEP 7: Remove old version folder if exists

      console.log(`📁 STEP 7: Preparing target location...`);

      const removeOldCmd = `if (Test-Path '${targetVersionPath}') { Remove-Item -Path '${targetVersionPath}' -Recurse -Force }`;

      await sshService.executeCommand(targetServerConfig, removeOldCmd);

      console.log(`✅ Old version removed if it existed\n`);



      // STEP 8: Extract ZIP (this puts the version folder directly into targetDllFolder)

      console.log(`📂 STEP 8: Extracting ZIP on target...`);

      const extractCmd = `Expand-Archive -Path '${targetZipPath}' -DestinationPath '${targetDllFolder}' -Force`;

      await sshService.executeCommand(targetServerConfig, extractCmd);

      console.log(`✅ ZIP extracted - version folder is now at ${targetVersionPath}\n`);



      // STEP 9: Cleanup ZIP file only

      console.log(`🧹 STEP 9: Cleaning up ZIP files...`);

      

      // Delete the ZIP file on target

      const deleteZipCmd = `Remove-Item -Path '${targetZipPath}' -Force -ErrorAction SilentlyContinue`;

      await sshService.executeCommand(targetServerConfig, deleteZipCmd);

      console.log(`   Deleted: ${zipFileName} on target`);

      

      // Delete source ZIP

      await sshService.executeCommand(sourceServerConfig, `Remove-Item -Path '${sourceZipPath}' -Force -ErrorAction SilentlyContinue`);

      console.log(`   Deleted: ${zipFileName} on source`);

      

      // Delete local temp file

      if (fs.existsSync(localTempPath)) {

        fs.unlinkSync(localTempPath);

      }

      console.log(`   Deleted local temp file\n`);



      // STEP 10: Verify primary deployment

      console.log(`🔍 STEP 10: Verifying primary deployment...`);

      const verifyCmd = `if (Test-Path '${targetVersionPath}') { Get-ChildItem -Path '${targetVersionPath}' -File | ForEach-Object { Write-Output "$($_.Name) ($($_.Length) bytes)" } } else { Write-Output "NOT FOUND" }`;

      const verifyResult = await sshService.executeCommand(targetServerConfig, verifyCmd);

      

      if (verifyResult.trim() === 'NOT FOUND' || !verifyResult.trim()) {

        throw new Error(`Deployment failed - version folder not found or empty: ${targetVersionPath}`);

      }

      

      console.log(`✅ Primary deployment verified!\n`);

      console.log(`Files in ${targetVersionPath}:`);

      console.log(verifyResult);



      // STEP 11: Copy to additional paths (if configured)

      const additionalPaths = targetServerConfig.additionalDllPaths || [];

      if (additionalPaths.length > 0) {

        console.log(`\n📋 STEP 11: Copying to ${additionalPaths.length} additional location(s)...`);

        

        for (let i = 0; i < additionalPaths.length; i++) {

          const additionalBasePath = additionalPaths[i];

          const additionalDllFolder = `${additionalBasePath}\\${dllName}`;

          const additionalVersionPath = `${additionalDllFolder}\\${version}`;

          

          console.log(`\n   📁 Additional Path ${i + 1}/${additionalPaths.length}: ${additionalVersionPath}`);

          

          try {

            // Ensure the DLL folder exists

            const ensureAdditionalFolderCmd = `if (!(Test-Path '${additionalDllFolder}')) { New-Item -ItemType Directory -Path '${additionalDllFolder}' -Force | Out-Null }`;

            await sshService.executeCommand(targetServerConfig, ensureAdditionalFolderCmd);

            

            // Remove old version if exists

            const removeOldAdditionalCmd = `if (Test-Path '${additionalVersionPath}') { Remove-Item -Path '${additionalVersionPath}' -Recurse -Force }`;

            await sshService.executeCommand(targetServerConfig, removeOldAdditionalCmd);

            

            // Copy the version folder

            const copyCmd = `Copy-Item -Path '${targetVersionPath}' -Destination '${additionalVersionPath}' -Recurse -Force`;

            await sshService.executeCommand(targetServerConfig, copyCmd);

            

            // Verify the copy

            const verifyAdditionalCmd = `if (Test-Path '${additionalVersionPath}') { (Get-ChildItem -Path '${additionalVersionPath}' -File).Count } else { Write-Output "0" }`;

            const fileCount = await sshService.executeCommand(targetServerConfig, verifyAdditionalCmd);

            

            if (parseInt(fileCount.trim()) > 0) {

              console.log(`   ✅ Copied successfully (${fileCount.trim()} files)`);

            } else {

              console.log(`   ⚠️  Warning: Copy completed but no files found`);

            }

          } catch (error) {

            console.log(`   ❌ Failed to copy to ${additionalVersionPath}: ${error.message}`);

          }

        }

        

        console.log(`\n✅ Additional paths processed\n`);

      } else {

        console.log(`\nℹ️  No additional paths configured for ${targetServerConfig.name}\n`);

      }



      console.log(`========================================`);

      console.log(`✅ DEPLOYMENT COMPLETE!`);

      console.log(`========================================`);

      console.log(`DLL: ${dllName}`);

      console.log(`Version: ${version}`);

      console.log(`Primary Location: ${targetVersionPath}`);

      if (additionalPaths.length > 0) {

        console.log(`Additional Locations: ${additionalPaths.length}`);

        additionalPaths.forEach((p, i) => {

          console.log(`  ${i + 1}. ${p}\\${dllName}\\${version}`);

        });

      }

      console.log(`========================================\n`);



      return {

        success: true,

        sourceServer: sourceServerConfig.name,

        targetServer: targetServerConfig.name,

        dllName: dllName,

        version: version,

        targetPath: targetVersionPath,

        additionalPaths: additionalPaths.map(p => `${p}\\${dllName}\\${version}`),

        deployedFiles: verifyResult.trim().split('\n').filter(line => line.trim()).map(line => {

          const match = line.match(/^(.*?) \((\d+) bytes\)$/);

          return match ? { name: match[1], size: parseInt(match[2]) } : { name: line, size: 0 };

        })

      };



    } catch (error) {

      console.error(`\n❌ DEPLOYMENT FAILED: ${error.message}\n`);



      try {

        console.log(`🧹 Cleaning up after error...`);

        if (fs.existsSync(localTempPath)) {

          fs.unlinkSync(localTempPath);

        }

        await sshService.executeCommand(sourceServerConfig, `Remove-Item -Path '${sourceZipPath}' -Force -ErrorAction SilentlyContinue`).catch(() => {});

        await sshService.executeCommand(targetServerConfig, `Remove-Item -Path '${targetZipPath}' -Force -ErrorAction SilentlyContinue`).catch(() => {});

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

