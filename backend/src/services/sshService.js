// Full path: backend/src/services/sshService.js

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

class SSHService {
  constructor() {
    this.configPath = path.join(__dirname, '../../config/servers.json');
    this.loadConfig();
  }

  loadConfig() {
    try {
      const configData = fs.readFileSync(this.configPath, 'utf8');
      this.config = JSON.parse(configData);
    } catch (error) {
      console.error('Error loading server configuration:', error);
      this.config = { servers: [] };
    }
  }

  /**
   * Execute a PowerShell command on a Windows server via SSH
   * Uses scriptblock approach that works from command line
   */
  async executeCommand(serverConfig, command) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let output = '';
      let errorOutput = '';

      conn.on('ready', () => {
        console.log(`Executing command on ${serverConfig.name} (${serverConfig.host})`);
        
        // Escape the command for cmd.exe + PowerShell
        // Use scriptblock with & to ensure it executes as a script
        const escapedCommand = command
          .replace(/\\/g, '\\\\')  // Escape backslashes
          .replace(/"/g, '\\"');    // Escape double quotes for cmd.exe
        
        const psCommand = `powershell.exe -NoProfile -Command "& {${escapedCommand}}"`;
        
        console.log(`Command length: ${psCommand.length}`);
        
        conn.exec(psCommand, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          stream.on('close', (code, signal) => {
            conn.end();
            if (code !== 0 && code !== null) {
              console.error(`Command failed on ${serverConfig.name} with code ${code}`);
              if (errorOutput) {
                console.error(`Error output (first 500 chars): ${errorOutput.substring(0, 500)}`);
              }
              reject(new Error(`Command failed with code ${code}`));
            } else {
              resolve(output);
            }
          }).on('data', (data) => {
            output += data.toString();
          }).stderr.on('data', (data) => {
            errorOutput += data.toString();
          });
        });
      }).on('error', (err) => {
        console.error(`SSH connection error to ${serverConfig.name}:`, err.message);
        reject(err);
      }).connect({
        host: serverConfig.host,
        port: serverConfig.port || 22,
        username: serverConfig.username,
        password: serverConfig.password,
        privateKey: serverConfig.privateKey ? fs.readFileSync(serverConfig.privateKey) : undefined,
        readyTimeout: 30000
      });
    });
  }

  /**
   * Get all servers from configuration
   */
  getAllServers() {
    return this.config.servers;
  }

  /**
   * Get servers by group
   */
  getServersByGroup(group) {
    return this.config.servers.filter(server => server.group === group);
  }

  /**
   * Get server groups
   */
  getServerGroups() {
    // Extract unique groups from servers
    const groups = [...new Set(this.config.servers.map(s => s.group))];
    return groups.sort();
  }
}

module.exports = new SSHService();
