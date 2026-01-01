
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

   * Execute a PowerShell command on a Windows server via SSH with retries

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

   * Internal method to execute a command once

   */

  _executeCommandOnce(serverConfig, command) {

    return new Promise((resolve, reject) => {

      const conn = new Client();

      let output = '';

      let errorOutput = '';



      conn.on('ready', () => {

        console.log(`Executing command on ${serverConfig.name} (${serverConfig.host})`);



        // Escape the command for cmd.exe + PowerShell

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

              reject(new Error(`Command failed with code ${code}: ${errorOutput || 'No error output'}`));

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

        console.log(`📤 Uploading file to ${serverConfig.name}...`);

        console.log(`   Local: ${localPath}`);

        console.log(`   Remote: ${remotePath}`);



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

            console.log(`✅ Uploaded ${bytesSent} bytes successfully`);

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

