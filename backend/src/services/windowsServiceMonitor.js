// Full path: backend/src/services/windowsServiceMonitor.js

const sshService = require('./sshService');

class WindowsServiceMonitor {
  /**
   * Get all services matching IConduct names across all servers
   */
  async getAllServices() {
    const servers = sshService.getAllServers();
    
    const results = await Promise.allSettled(
      servers.map(server => this.getServerServices(server))
    );

    // Group by server group
    const groupedServices = {};
    results.forEach((result, index) => {
      const server = servers[index];
      if (result.status === 'fulfilled') {
        if (!groupedServices[server.group]) {
          groupedServices[server.group] = [];
        }
        groupedServices[server.group].push({
          serverName: server.name,
          services: result.value.services,
          systemMetrics: result.value.systemMetrics
        });
      }
    });

    return groupedServices;
  }

  /**
   * Get services for a specific server group
   */
  async getServicesByGroup(group) {
    const servers = sshService.getServersByGroup(group);
    
    const results = await Promise.allSettled(
      servers.map(server => this.getServerServices(server))
    );

    return results
      .filter(result => result.status === 'fulfilled')
      .map((result, index) => ({
        serverName: servers[index].name,
        services: result.value.services,
        systemMetrics: result.value.systemMetrics
      }));
  }

  /**
   * Get system-level CPU and RAM usage percentages
   */
  async getSystemMetrics(serverConfig) {
    console.log(`  🔍 Getting system metrics...`);
    
    let cpuPercent = 0;
    let ramPercent = 0;
    
    // Get CPU percentage
    try {
      const cpuCmd = `Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average | Select-Object -ExpandProperty Average`;
      const cpuOut = await sshService.executeCommand(serverConfig, cpuCmd);
      cpuPercent = Math.round(parseFloat(cpuOut.trim())) || 0;
      if (cpuPercent > 100) cpuPercent = 100;
    } catch (e) {
      console.log(`  ⚠️  CPU query failed: ${e.message}`);
    }
    
    // Get RAM percentage
    try {
      const ramCmd = `$os = Get-WmiObject Win32_OperatingSystem; [math]::Round((1 - ($os.FreePhysicalMemory / $os.TotalVisibleMemorySize)) * 100)`;
      const ramOut = await sshService.executeCommand(serverConfig, ramCmd);
      ramPercent = parseInt(ramOut.trim()) || 0;
      if (ramPercent > 100) ramPercent = 100;
    } catch (e) {
      console.log(`  ⚠️  RAM query failed: ${e.message}`);
    }
    
    console.log(`  ✅ System: CPU ${cpuPercent}%, RAM ${ramPercent}%`);
    return { cpuPercent, ramPercent };
  }

  /**
   * Get services from a single server - STRICT FILTERING
   * Only returns services that are EXACTLY in the serviceNames list
   */
  async getServerServices(serverConfig) {
    try {
      console.log(`\n📡 ${serverConfig.name}`);
      
      const configuredServiceNames = serverConfig.serviceNames || [];
      
      if (configuredServiceNames.length === 0) {
        console.log(`  ⚠️  No services configured in servers.json`);
        return {
          services: [],
          systemMetrics: await this.getSystemMetrics(serverConfig)
        };
      }
      
      console.log(`  📋 Configured services in servers.json:`);
      configuredServiceNames.forEach(name => console.log(`     - ${name}`));
      
      // Get basic service info - Name, DisplayName, Status ONLY
      const serviceCommand = `Get-Service | Where-Object {$_.Name -like '*IConduct*' -or $_.DisplayName -like '*IConduct*'} | ForEach-Object {[PSCustomObject]@{Name=$_.Name;DisplayName=$_.DisplayName;Status=$_.Status.ToString()}} | ConvertTo-Json`;

      const serviceOutput = await sshService.executeCommand(serverConfig, serviceCommand);
      
      let allServices = [];
      if (serviceOutput && serviceOutput.trim().length > 0) {
        try {
          const cleanOutput = serviceOutput.trim();
          
          if (cleanOutput === '[]' || cleanOutput === '') {
            console.log(`  ⚠️  No IConduct services found on server`);
            return {
              services: [],
              systemMetrics: await this.getSystemMetrics(serverConfig)
            };
          }
          
          const parsed = JSON.parse(cleanOutput);
          allServices = Array.isArray(parsed) ? parsed : [parsed];
          
          console.log(`  🔍 Found ${allServices.length} IConduct services on server:`);
          allServices.forEach(s => console.log(`     - ${s.Name} (${s.DisplayName})`));
        } catch (e) {
          console.error(`  ❌ Parse error: ${e.message}`);
          return {
            services: [],
            systemMetrics: await this.getSystemMetrics(serverConfig)
          };
        }
      } else {
        console.log(`  ⚠️  Empty output from server`);
        return {
          services: [],
          systemMetrics: await this.getSystemMetrics(serverConfig)
        };
      }

      // STRICT FILTERING: Only include services that match EXACTLY
      const filteredServices = [];
      
      for (const service of allServices) {
        // Check if this service's Name OR DisplayName matches ANY configured name (case-insensitive exact match)
        const isConfigured = configuredServiceNames.some(configName => {
          const configLower = configName.toLowerCase().trim();
          const nameLower = service.Name.toLowerCase().trim();
          const displayLower = service.DisplayName.toLowerCase().trim();
          
          return nameLower === configLower || displayLower === configLower;
        });
        
        if (isConfigured) {
          filteredServices.push(service);
          console.log(`  ✅ INCLUDED: ${service.Name} (${service.DisplayName})`);
        } else {
          console.log(`  ❌ EXCLUDED: ${service.Name} (${service.DisplayName}) - NOT in servers.json`);
        }
      }

      console.log(`  📊 Final result: ${filteredServices.length} services match servers.json configuration`);

      // Double-check: ensure we're not returning anything not in the config
      const finalServices = filteredServices.filter(service => {
        const isInConfig = configuredServiceNames.some(configName => 
          service.Name.toLowerCase().trim() === configName.toLowerCase().trim() ||
          service.DisplayName.toLowerCase().trim() === configName.toLowerCase().trim()
        );
        return isInConfig;
      });

      // Get system-level metrics
      const systemMetrics = await this.getSystemMetrics(serverConfig);

      // Log which configured services were NOT found
      const foundNames = finalServices.map(s => s.Name.toLowerCase());
      const foundDisplayNames = finalServices.map(s => s.DisplayName.toLowerCase());
      const notFound = configuredServiceNames.filter(configName => {
        const configLower = configName.toLowerCase();
        return !foundNames.includes(configLower) && !foundDisplayNames.includes(configLower);
      });
      
      if (notFound.length > 0) {
        console.log(`  ⚠️  Configured but NOT FOUND on server: ${notFound.join(', ')}`);
      }

      console.log(`  ✅ Returning ${finalServices.length} services\n`);
      
      return {
        services: finalServices,
        systemMetrics: systemMetrics
      };
      
    } catch (error) {
      console.error(`  ❌ Error: ${error.message}`);
      return {
        services: [],
        systemMetrics: {
          cpuPercent: 0,
          ramPercent: 0
        }
      };
    }
  }

  /**
   * Get specific service details
   */
  async getServiceDetails(serverConfig, serviceName) {
    try {
      const command = `Get-Service -Name '${serviceName}' | Select-Object Name,DisplayName,Status | ConvertTo-Json`;

      const output = await sshService.executeCommand(serverConfig, command);
      return JSON.parse(output);
    } catch (error) {
      throw new Error(`Failed to get service details: ${error.message}`);
    }
  }
}

module.exports = new WindowsServiceMonitor();