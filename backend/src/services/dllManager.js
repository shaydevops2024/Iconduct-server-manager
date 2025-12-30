// Full path: backend/src/services/dllManager.js

const sshService = require('./sshService');

class DLLManager {
  /**
   * Get all DLLs from all servers
   */
  async getAllDLLs() {
    const servers = sshService.getAllServers();
    const dllPath = sshService.getDllPath();
    
    console.log(`Scanning DLLs on ${servers.length} servers...`);
    
    const results = await Promise.allSettled(
      servers.map(server => this.getServerDLLs(server, dllPath))
    );

    const dllData = [];
    results.forEach((result, index) => {
      const server = servers[index];
      if (result.status === 'fulfilled') {
        console.log(`Found ${result.value.length} DLLs on ${server.name}`);
        dllData.push({
          serverName: server.name,
          serverGroup: server.group,
          dlls: result.value
        });
      } else {
        console.error(`Error getting DLLs from ${server.name}:`, result.reason.message);
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
   * Get DLLs from a specific server - SIMPLIFIED VERSION
   */
  async getServerDLLs(serverConfig, dllPath = null) {
    const path = dllPath || sshService.getDllPath();
    
    try {
      console.log(`Scanning DLLs on ${serverConfig.name} at ${path}`);
      
      // Simplified PowerShell command - all in one line
      const command = `Get-ChildItem -Path '${path}' -Directory -ErrorAction SilentlyContinue | ForEach-Object { $folder = $_; Get-ChildItem -Path $folder.FullName -Filter '*.dll' -Recurse -ErrorAction SilentlyContinue | ForEach-Object { $dll = $_; try { $ver = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($dll.FullName); [PSCustomObject]@{Name=$dll.Name;Folder=$folder.Name;FullPath=$dll.FullName;Version=$ver.FileVersion;ProductVersion=$ver.ProductVersion;Size=[math]::Round($dll.Length/1KB,2);LastModified=$dll.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')} } catch { [PSCustomObject]@{Name=$dll.Name;Folder=$folder.Name;FullPath=$dll.FullName;Version='N/A';ProductVersion='N/A';Size=[math]::Round($dll.Length/1KB,2);LastModified=$dll.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')} } } } | ConvertTo-Json`;

      const output = await sshService.executeCommand(serverConfig, command);
      
      console.log(`Raw DLL output from ${serverConfig.name} (length: ${output.length})`);
      
      if (!output.trim()) {
        console.log(`No DLLs found on ${serverConfig.name}`);
        return [];
      }

      const parsed = JSON.parse(output);
      const dlls = Array.isArray(parsed) ? parsed : [parsed];
      console.log(`Successfully parsed ${dlls.length} DLLs from ${serverConfig.name}`);
      return dlls;
    } catch (error) {
      console.error(`Error getting DLLs from ${serverConfig.name}:`, error.message);
      throw error;
    }
  }

  /**
   * Get aggregated DLL information grouped by FOLDER
   */
  async getDLLSummary() {
    const allDLLs = await this.getAllDLLs();
    
    // Group by FOLDER instead of DLL name
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
            productVersion: dll.ProductVersion,
            size: dll.Size,
            lastModified: dll.LastModified,
            fullPath: dll.FullPath
          });
        });
      }
    });

    // Convert to array and get latest version for each folder
    const summary = Array.from(folderMap.values()).map(folder => {
      // Get all unique versions in this folder
      const versions = folder.dlls
        .map(dll => dll.version)
        .filter((v, i, arr) => v && v !== 'N/A' && arr.indexOf(v) === i)
        .sort((a, b) => this.compareVersions(b, a));
      
      // Get the latest version
      const latestVersion = versions[0] || 'N/A';
      
      // Get previous versions (all except the latest)
      const previousVersions = versions.slice(1);
      
      // Group DLLs by version
      const versionGroups = {};
      folder.dlls.forEach(dll => {
        if (!versionGroups[dll.version]) {
          versionGroups[dll.version] = [];
        }
        versionGroups[dll.version].push(dll);
      });

      return {
        folderName: folder.folderName,
        latestVersion,
        previousVersions,
        allVersions: versions,
        dllCount: folder.dlls.length,
        versionGroups,
        servers: [...new Set(folder.dlls.map(d => d.server))]
      };
    });

    return summary.sort((a, b) => a.folderName.localeCompare(b.folderName));
  }

  /**
   * Compare version strings
   */
  compareVersions(v1, v2) {
    if (!v1 || v1 === 'N/A') return -1;
    if (!v2 || v2 === 'N/A') return 1;
    
    const parts1 = v1.split('.').map(n => parseInt(n) || 0);
    const parts2 = v2.split('.').map(n => parseInt(n) || 0);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
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
            ...dll
          });
        });
      }
    });

    return details;
  }
}

module.exports = new DLLManager();