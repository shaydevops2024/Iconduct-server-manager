// Full path: backend/src/services/windowsServiceMonitor.js
// Full path: backend/src/services/windowsServiceMonitor.js

const sshService = require('./sshService');
const dbService = require('./dbService');

class WindowsServiceMonitor {
  /**
   * Get all services matching IConduct names across all servers
   */
  async getAllServices() {
    const servers = sshService.getAllServers();
    
    // Quick availability check first
    console.log(`\n🔍 Checking availability for ${servers.length} servers...\n`);
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

    console.log(`✅ Available: ${availableServers.length}, ❌ Unavailable: ${unavailableServers.length}\n`);
    
    const results = await Promise.allSettled(
      availableServers.map(server => this.getServerServices(server))
    );

    // Group by server group
    const groupedServices = {};
    
    // Process available servers
    results.forEach((result, index) => {
      const server = availableServers[index];
      if (!groupedServices[server.group]) {
        groupedServices[server.group] = [];
      }
      
      if (result.status === 'fulfilled') {
        // Update server status as available
        dbService.updateServerStatus(server.name, server.group, true, null);
        
        groupedServices[server.group].push({
          serverName: server.name,
          services: result.value.services,
          systemMetrics: result.value.systemMetrics,
          available: true
        });
      } else {
        // Update server status as unavailable
        dbService.updateServerStatus(server.name, server.group, false, result.reason.message);
        
        groupedServices[server.group].push({
          serverName: server.name,
          services: [],
          systemMetrics: { cpuPercent: 0, ramPercent: 0 },
          available: false,
          errorMessage: result.reason.message
        });
      }
    });

    // Add unavailable servers to response
    unavailableServers.forEach(({ server, error }) => {
      if (!groupedServices[server.group]) {
        groupedServices[server.group] = [];
      }
      
      groupedServices[server.group].push({
        serverName: server.name,
        services: [],
        systemMetrics: { cpuPercent: 0, ramPercent: 0 },
        available: false,
        errorMessage: error
      });
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
   * Get services from a single server - OPTIMIZED VERSION
   * Combined: Services + CPU + RAM in ONE SSH call (66% faster!)
   */
  async getServerServices(serverConfig) {
    try {
      console.log(`\n📡 ${serverConfig.name}`);
      
      const configuredServiceNames = serverConfig.serviceNames || [];
      
      if (configuredServiceNames.length === 0) {
        console.log(`  ⚠️  No services configured in servers.json`);
        return {
          services: [],
          systemMetrics: { cpuPercent: 0, ramPercent: 0 }
        };
      }
      
      console.log(`  📋 Configured services in servers.json:`);
      configuredServiceNames.forEach(name => console.log(`     - ${name}`));
      
      // COMBINED COMMAND - Single line, no newlines (CRITICAL for SSH!)
      const combinedCommand = `$services = Get-Service | Where-Object {$_.Name -like '*IConduct*' -or $_.DisplayName -like '*IConduct*'} | ForEach-Object {[PSCustomObject]@{Name=$_.Name;DisplayName=$_.DisplayName;Status=$_.Status.ToString()}}; $cpu = (Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average; if ($cpu -eq $null) { $cpu = 0 }; $os = Get-WmiObject Win32_OperatingSystem; $ram = [math]::Round((1 - ($os.FreePhysicalMemory / $os.TotalVisibleMemorySize)) * 100); if ($ram -eq $null) { $ram = 0 }; [PSCustomObject]@{Services=$services;CPU=[int]$cpu;RAM=[int]$ram} | ConvertTo-Json -Depth 3`;

      const output = await sshService.executeCommand(serverConfig, combinedCommand);
      
      if (!output || output.trim().length === 0) {
        console.log(`  ⚠️  Empty output from server`);
        return {
          services: [],
          systemMetrics: { cpuPercent: 0, ramPercent: 0 }
        };
      }

      let parsed;
      try {
        parsed = JSON.parse(output.trim());
      } catch (e) {
        console.error(`  ❌ Parse error: ${e.message}`);
        return {
          services: [],
          systemMetrics: { cpuPercent: 0, ramPercent: 0 }
        };
      }

      // Extract services
      let allServices = [];
      if (parsed.Services) {
        allServices = Array.isArray(parsed.Services) ? parsed.Services : [parsed.Services];
      }

      if (allServices.length === 0) {
        console.log(`  ⚠️  No IConduct services found on server`);
        return {
          services: [],
          systemMetrics: {
            cpuPercent: Math.min(parsed.CPU || 0, 100),
            ramPercent: Math.min(parsed.RAM || 0, 100)
          }
        };
      }

      console.log(`  🔍 Found ${allServices.length} IConduct services on server:`);
      allServices.forEach(s => console.log(`     - ${s.Name} (${s.DisplayName})`));

      // STRICT FILTERING: Only include services that match EXACTLY
      const filteredServices = [];
      
      for (const service of allServices) {
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

      // Extract system metrics from combined result
      const systemMetrics = {
        cpuPercent: Math.min(parsed.CPU || 0, 100),
        ramPercent: Math.min(parsed.RAM || 0, 100)
      };

      console.log(`  ✅ System: CPU ${systemMetrics.cpuPercent}%, RAM ${systemMetrics.ramPercent}%`);

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
