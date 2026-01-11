// Full path: backend/src/services/sshService.js

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');

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
   * Fast TCP port check to see if server is reachable
   * Returns quickly (2-3 seconds) instead of waiting for SSH timeout
   */
  async checkServerAvailability(serverConfig, timeout = 3000) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let isResolved = false;

      const cleanup = () => {
        if (!isResolved) {
          isResolved = true;
          socket.destroy();
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        console.log(`⚠️  ${serverConfig.name} - Connection timeout (${timeout}ms)`);
        resolve({ available: false, error: 'Connection timeout' });
      }, timeout);

      socket.on('connect', () => {
        clearTimeout(timer);
        cleanup();
        console.log(`✅ ${serverConfig.name} - Server is reachable`);
        resolve({ available: true, error: null });
      });

      socket.on('error', (err) => {
        clearTimeout(timer);
        cleanup();
        console.log(`❌ ${serverConfig.name} - Not reachable: ${err.message}`);
        resolve({ available: false, error: err.message });
      });

      socket.connect(serverConfig.port || 22, serverConfig.host);
    });
  }

  /**
   * Execute a PowerShell script by uploading it and running it remotely
   * This avoids command line length limits
   */
  async executeScript(serverConfig, scriptContent, retries = 3) {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await this._executeScriptOnce(serverConfig, scriptContent);
        return result;
      } catch (error) {
        lastError = error;
        console.log(`Script execution attempt ${attempt}/${retries} failed for ${serverConfig.name}: ${error.message}`);
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    throw lastError;
  }

  /**
   * Internal method to execute a script once by uploading it
   */
  async _executeScriptOnce(serverConfig, scriptContent) {
    const scriptName = `upgrade-script-${crypto.randomBytes(8).toString('hex')}.ps1`;
    const remotePath = `C:\\Windows\\Temp\\${scriptName}`;
    const localTempPath = path.join(require('os').tmpdir(), scriptName);

    try {
      // Write script to local temp file
      fs.writeFileSync(localTempPath, scriptContent, 'utf8');

      // Upload script to server
      await this.uploadFile(serverConfig, localTempPath, remotePath);

      // Execute the script
      const executeCommand = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${remotePath}"`;
      const result = await this.executeCommand(serverConfig, executeCommand);

      // Delete remote script
      const cleanupCommand = `Remove-Item -Path "${remotePath}" -Force -ErrorAction SilentlyContinue`;
      await this.executeCommand(serverConfig, cleanupCommand).catch(() => {
        console.log('Warning: Could not delete remote script file');
      });

      // Delete local temp file
      try {
        fs.unlinkSync(localTempPath);
      } catch (e) {
        console.log('Warning: Could not delete local temp script file');
      }

      return result;

    } catch (error) {
      // Cleanup on error
      try {
        if (fs.existsSync(localTempPath)) {
          fs.unlinkSync(localTempPath);
        }
      } catch (e) {
        // Ignore cleanup errors
      }

      throw error;
    }
  }

  /**
   * Execute a PowerShell command on a Windows server via SSH with retries
   * Use this for short commands only (< 2000 characters)
   */
  async executeCommand(serverConfig, command, retries = 3) {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await this._executeCommandOnce(serverConfig, command);
        return result;
      } catch (error) {
        lastError = error;
        console.log(`SSH command attempt ${attempt}/${retries} failed for ${serverConfig.name}: ${error.message}`);
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    throw lastError;
  }

  /**
   * Internal method to execute a command once with real-time output
   */
  _executeCommandOnce(serverConfig, command) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let output = '';
      let errorOutput = '';

      conn.on('ready', () => {
        console.log(`Executing command on ${serverConfig.name} (${serverConfig.host})`);

        // For short commands, execute directly
        const psCommand = `powershell.exe -NoProfile -Command "& {${command}}"`;

        console.log(`Command length: ${command.length} characters`);

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
              reject(new Error(`Command failed with code ${code}: ${errorOutput || 'No error output'}`));
            } else {
              resolve(output);
            }
          }).on('data', (data) => {
            const chunk = data.toString();
            output += chunk;
            // Log output in real-time for visibility
            const lines = chunk.split('\n');
            lines.forEach(line => {
              const trimmed = line.trim();
              if (trimmed) {
                console.log(`[${serverConfig.name}] ${trimmed}`);
              }
            });
          }).stderr.on('data', (data) => {
            const chunk = data.toString();
            errorOutput += chunk;
            const lines = chunk.split('\n');
            lines.forEach(line => {
              const trimmed = line.trim();
              if (trimmed) {
                console.error(`[${serverConfig.name}] ERROR: ${trimmed}`);
              }
            });
          });
        });
      }).on('error', (err) => {
        conn.end();
        reject(new Error(`SSH connection error to ${serverConfig.name}: ${err.message}`));
      }).connect({
      host: serverConfig.host,
      port: serverConfig.port || 22,
      username: serverConfig.username,
      password: serverConfig.password,
      privateKey: serverConfig.privateKey ? fs.readFileSync(serverConfig.privateKey) : undefined,
      readyTimeout: 30000,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3,
      algorithms: { serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521'] },
      hostVerifier: () => true,
    });
    });
  }

  /**
   * Download a file from remote Windows server to local machine with retries
   */
  async downloadFile(serverConfig, remotePath, localPath, retries = 3) {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await this._downloadFileOnce(serverConfig, remotePath, localPath);
        return result;
      } catch (error) {
        lastError = error;
        console.log(`Download attempt ${attempt}/${retries} failed for ${serverConfig.name}: ${error.message}`);
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    throw lastError;
  }

  /**
   * Internal method to download a file once
   */
  _downloadFileOnce(serverConfig, remotePath, localPath) {
    return new Promise((resolve, reject) => {
      const conn = new Client();

      conn.on('ready', () => {
        console.log(`📥 Downloading file from ${serverConfig.name}...`);
        console.log(`   Remote: ${remotePath}`);
        console.log(`   Local: ${localPath}`);

        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            return reject(new Error(`SFTP error: ${err.message}`));
          }

          // Convert Windows path to SFTP path (forward slashes)
          const sftpPath = remotePath.replace(/\\/g, '/');

          // Create write stream for local file
          const writeStream = fs.createWriteStream(localPath);

          // Create read stream from remote file
          const readStream = sftp.createReadStream(sftpPath);

          let bytesReceived = 0;

          readStream.on('data', (chunk) => {
            bytesReceived += chunk.length;
          });

          readStream.on('error', (err) => {
            conn.end();
            // Clean up partial file
            if (fs.existsSync(localPath)) {
              fs.unlinkSync(localPath);
            }
            reject(new Error(`Download error: ${err.message}`));
          });

          writeStream.on('error', (err) => {
            conn.end();
            reject(new Error(`Write error: ${err.message}`));
          });

          writeStream.on('finish', () => {
            conn.end();
            console.log(`✅ Downloaded ${bytesReceived} bytes successfully`);
            resolve(localPath);
          });

          // Pipe the remote file to local file
          readStream.pipe(writeStream);
        });
      }).on('error', (err) => {
        reject(new Error(`SSH connection error to ${serverConfig.name}: ${err.message}`));
      }).connect({
        host: serverConfig.host,
        port: serverConfig.port || 22,
        username: serverConfig.username,
        password: serverConfig.password,
        privateKey: serverConfig.privateKey ? fs.readFileSync(serverConfig.privateKey) : undefined,
        readyTimeout: 30000,
        keepaliveInterval: 10000,
        keepaliveCountMax: 3,
      });
    });
  }

  /**
   * Upload a file from local machine to remote Windows server with retries
   */
  async uploadFile(serverConfig, localPath, remotePath, retries = 3) {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await this._uploadFileOnce(serverConfig, localPath, remotePath);
        return result;
      } catch (error) {
        lastError = error;
        console.log(`Upload attempt ${attempt}/${retries} failed for ${serverConfig.name}: ${error.message}`);
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    throw lastError;
  }

  /**
   * Internal method to upload a file once
   */
  _uploadFileOnce(serverConfig, localPath, remotePath) {
    return new Promise((resolve, reject) => {
      const conn = new Client();

      conn.on('ready', () => {
        console.log(`📤 Uploading script to ${serverConfig.name}...`);

        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            return reject(new Error(`SFTP error: ${err.message}`));
          }

          // Convert Windows path to SFTP path (forward slashes)
          const sftpPath = remotePath.replace(/\\/g, '/');

          // Check if local file exists
          if (!fs.existsSync(localPath)) {
            conn.end();
            return reject(new Error(`Local file not found: ${localPath}`));
          }

          const fileSize = fs.statSync(localPath).size;

          // Create read stream from local file
          const readStream = fs.createReadStream(localPath);

          // Create write stream to remote file
          const writeStream = sftp.createWriteStream(sftpPath);

          let bytesSent = 0;

          readStream.on('data', (chunk) => {
            bytesSent += chunk.length;
          });

          readStream.on('error', (err) => {
            conn.end();
            reject(new Error(`Read error: ${err.message}`));
          });

          writeStream.on('error', (err) => {
            conn.end();
            reject(new Error(`Upload error: ${err.message}`));
          });

          writeStream.on('close', () => {
            conn.end();
            console.log(`✅ Uploaded script (${bytesSent} bytes)`);
            resolve(remotePath);
          });

          // Pipe the local file to remote file
          readStream.pipe(writeStream);
        });
      }).on('error', (err) => {
        reject(new Error(`SSH connection error to ${serverConfig.name}: ${err.message}`));
      }).connect({
        host: serverConfig.host,
        port: serverConfig.port || 22,
        username: serverConfig.username,
        password: serverConfig.password,
        privateKey: serverConfig.privateKey ? fs.readFileSync(serverConfig.privateKey) : undefined,
        readyTimeout: 30000,
        keepaliveInterval: 10000,
        keepaliveCountMax: 3,
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
