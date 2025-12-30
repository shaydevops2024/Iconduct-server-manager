// Full path: backend/src/services/dllManager.js

const sshService = require('./sshService');

class DLLManager {
  /**
   * Get all DLLs from all servers
   */
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

  /**
   * Extract version from filename
   * Looks for patterns like: filename.1.0.2.0.dll or filename-1.0.2.0.dll
   */
  extractVersionFromFilename(filename) {
    // Remove .dll extension
    const nameWithoutExt = filename.replace(/\.dll$/i, '');
    
    // Look for version pattern: X.X.X.X where X is a number
    // Matches: 1.0.0.0, 1.0.2.0, 2.0.0.0, etc.
    const versionPattern = /(\d+\.\d+\.\d+\.\d+)/;
    const match = nameWithoutExt.match(versionPattern);
    
    if (match) {
      return match[1];
    }
    
    return null;
  }

  /**
   * Get DLLs from a specific server - uses dllPath from server config
   */
  async getServerDLLs(serverConfig) {
    try {
      const dllPath = serverConfig.dllPath;
      
      if (!dllPath) {
        console.log(`⚠️  No DLL path configured for ${serverConfig.name}`);
        return [];
      }
      
      console.log(`\n🔍 Scanning DLLs on ${serverConfig.name} at ${dllPath}`);
      
      // PowerShell command - gets FileVersion and ProductVersion
      const command = `Get-ChildItem -Path '${dllPath}' -Directory -ErrorAction SilentlyContinue | ForEach-Object { $folder = $_; Get-ChildItem -Path $folder.FullName -Filter '*.dll' -Recurse -ErrorAction SilentlyContinue | ForEach-Object { $dll = $_; try { $ver = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($dll.FullName); $fv = $ver.FileVersion; $pv = $ver.ProductVersion; $fvClean = if([string]::IsNullOrWhiteSpace($fv) -or $fv -eq '0.0.0.0'){''}else{$fv.Trim()}; $pvClean = if([string]::IsNullOrWhiteSpace($pv) -or $pv -eq '0.0.0.0'){''}else{$pv.Trim()}; $bestVer = if($pvClean -ne ''){$pvClean}elseif($fvClean -ne ''){$fvClean}else{'N/A'}; [PSCustomObject]@{Name=$dll.Name;Folder=$folder.Name;FullPath=$dll.FullName;FileVersion=if($fvClean -ne ''){$fvClean}else{'N/A'};ProductVersion=if($pvClean -ne ''){$pvClean}else{'N/A'};Version=$bestVer;Size=[math]::Round($dll.Length/1KB,2);LastModified=$dll.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')} } catch { [PSCustomObject]@{Name=$dll.Name;Folder=$folder.Name;FullPath=$dll.FullName;FileVersion='N/A';ProductVersion='N/A';Version='N/A';Size=[math]::Round($dll.Length/1KB,2);LastModified=$dll.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')} } } } | ConvertTo-Json`;

      const output = await sshService.executeCommand(serverConfig, command);
      
      if (!output.trim()) {
        console.log(`⚠️  No DLLs found on ${serverConfig.name}`);
        return [];
      }

      const parsed = JSON.parse(output);
      let dlls = Array.isArray(parsed) ? parsed : [parsed];
      
      // Post-process: Extract version from filename if metadata version seems wrong
      dlls = dlls.map(dll => {
        const filenameVersion = this.extractVersionFromFilename(dll.Name);
        
        if (filenameVersion) {
          const metadataVersion = dll.Version !== 'N/A' ? dll.Version : null;
          
          // If no metadata version, use filename version
          if (!metadataVersion) {
            dll.Version = filenameVersion;
            dll.VersionSource = 'filename';
          }
          // If metadata version exists, use the higher version
          else if (this.compareVersions(filenameVersion, metadataVersion) > 0) {
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

  /**
   * Get aggregated DLL information grouped by FOLDER
   */
  async getDLLSummary() {
    const allDLLs = await this.getAllDLLs();
    
    console.log(`\n========================================`);
    console.log(`Creating DLL Summary`);
    console.log(`========================================\n`);
    
    // Group by FOLDER
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

    // Convert to array and analyze versions
    const summary = Array.from(folderMap.values()).map(folder => {
      console.log(`\n📁 Folder: ${folder.folderName}`);
      
      // Extract all versions (excluding N/A)
      const allVersions = folder.dlls
        .map(dll => dll.version)
        .filter(v => v && v !== 'N/A' && v !== '0.0.0.0');
      
      // Get unique versions
      const uniqueVersions = [...new Set(allVersions)];
      
      // Sort versions (highest first)
      const sortedVersions = uniqueVersions.sort((a, b) => this.compareVersions(b, a));
      
      // Get latest and previous
      const latestVersion = sortedVersions[0] || 'N/A';
      const previousVersions = sortedVersions.slice(1);
      
      console.log(`   Latest: ${latestVersion}`);
      console.log(`   Previous: [${previousVersions.join(', ')}]`);
      
      // Group DLLs by version
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

  /**
   * Compare version strings (semantic versioning)
   */
  compareVersions(v1, v2) {
    if (!v1 || v1 === 'N/A') return -1;
    if (!v2 || v2 === 'N/A') return 1;
    
    // Remove any non-numeric prefixes
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

  /**
   * Get DLL details by folder name
   */
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
