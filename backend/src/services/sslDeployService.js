// Full path: backend/src/services/sslDeployService.js

const sshService = require('./sshService');
const path = require('path');
const fs = require('fs').promises;

class SSLDeployService {
  constructor() {
    this.PFX_OUTPUT_DIR = path.join(__dirname, '../../pfx-output');
  }

  /**
   * Deploy SSL certificate to backend server
   */
  async deployToBackend(serverConfig, pfxFilename, pfxPassword) {
    const results = {
      server: serverConfig.name,
      success: false,
      steps: [],
      error: null
    };

    try {
      const sslConfig = serverConfig.ssl || {
        finalPath: "D:\\IConduct\\NatsCerts",
        tempPath: "D:\\IConduct\\NatsCerts\\temp",
        certFile: "iconductcloud22.crt",
        keyFile: "iconductcloud22.key"
      };

      // Step 1: Validate PFX file exists
      const pfxPath = path.join(this.PFX_OUTPUT_DIR, pfxFilename);
      await fs.access(pfxPath);
      results.steps.push({ step: 'Validate PFX', status: 'success' });

      // Step 2: Read PFX file
      const pfxBuffer = await fs.readFile(pfxPath);
      const pfxBase64 = pfxBuffer.toString('base64');
      results.steps.push({ step: 'Read PFX file', status: 'success' });

      // Step 3: Create temp directory
      const createTempCmd = '$tempPath = "' + sslConfig.tempPath + '"; if (-not (Test-Path $tempPath)) { New-Item -ItemType Directory -Path $tempPath -Force | Out-Null }; Write-Output $tempPath';
      const tempDirResult = await sshService.executeCommand(serverConfig, createTempCmd);
      const remoteTempPath = tempDirResult.trim();
      results.steps.push({ step: 'Create temp directory', status: 'success', path: remoteTempPath });

      // Step 4: Copy PFX to remote server
      const remotePfxPath = remoteTempPath + '\\' + pfxFilename;
      const copyPfxCmd = '$base64 = \'' + pfxBase64 + '\'; $bytes = [Convert]::FromBase64String($base64); [System.IO.File]::WriteAllBytes(\'' + remotePfxPath + '\', $bytes); Write-Output \'PFX copied\'';
      await sshService.executeCommand(serverConfig, copyPfxCmd);
      results.steps.push({ step: 'Copy PFX to server', status: 'success' });

      // Step 5: Extract certificate and key using PowerShell
      const certFile = remoteTempPath + '\\certificate.crt';
      const keyFile = remoteTempPath + '\\private.key';
      
      const extractCmd = '$securePassword = ConvertTo-SecureString -String "' + pfxPassword + '" -AsPlainText -Force; ' +
        '$pfxCert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2("' + remotePfxPath + '", $securePassword, [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable); ' +
        '$certBytes = $pfxCert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert); ' +
        '$certPem = "-----BEGIN CERTIFICATE-----`n"; ' +
        '$certPem += [System.Convert]::ToBase64String($certBytes, [System.Base64FormattingOptions]::InsertLineBreaks); ' +
        '$certPem += "`n-----END CERTIFICATE-----"; ' +
        '[System.IO.File]::WriteAllText("' + certFile + '", $certPem); ' +
        '$rsaKey = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($pfxCert); ' +
        '$keyBytes = $rsaKey.ExportRSAPrivateKey(); ' +
        '$keyPem = "-----BEGIN RSA PRIVATE KEY-----`n"; ' +
        '$keyPem += [System.Convert]::ToBase64String($keyBytes, [System.Base64FormattingOptions]::InsertLineBreaks); ' +
        '$keyPem += "`n-----END RSA PRIVATE KEY-----"; ' +
        '[System.IO.File]::WriteAllText("' + keyFile + '", $keyPem); ' +
        'Write-Output "Certificate and key extracted"';
      
      await sshService.executeCommand(serverConfig, extractCmd);
      results.steps.push({ step: 'Extract certificate and key (PowerShell)', status: 'success' });

      // Step 6: Import certificate to Windows store
      const importCertCmd = '$securePassword = ConvertTo-SecureString -String "' + pfxPassword + '" -AsPlainText -Force; ' +
        '$cert = Import-PfxCertificate -FilePath "' + remotePfxPath + '" -CertStoreLocation "Cert:\\LocalMachine\\My" -Password $securePassword -Exportable; ' +
        'if (-not $cert) { throw "Certificate import failed" }; ' +
        'Write-Output $cert.Thumbprint';
      const thumbprintResult = await sshService.executeCommand(serverConfig, importCertCmd);
      const thumbprint = thumbprintResult.replace(/\s/g, '').trim();
      results.thumbprint = thumbprint;
      results.steps.push({ step: 'Import to certificate store', status: 'success', thumbprint });

      // Step 7: Get Application ID from port 443
      console.log('📝 Getting App ID from port 443...');
      const getAppIdCmd = 'netsh http show sslcert ipport=0.0.0.0:443';
      let appId = '{00000000-0000-0000-0000-000000000000}'; // Default
      
      try {
        const port443Output = await sshService.executeCommand(serverConfig, getAppIdCmd);
        console.log('📝 Port 443 output:', port443Output);
        
        // Parse output line by line
        const lines = port443Output.split('\n');
        for (const line of lines) {
          // Look for line with "Application ID"
          if (line.includes('Application ID')) {
            // Extract GUID from line like "    Application ID               : {34adfccc-9846-4bf8-9850-00e46201c64c}"
            const match = line.match(/\{[0-9a-fA-F-]{36}\}/);
            if (match) {
              appId = match[0];
              console.log('✅ Found App ID from port 443:', appId);
              break;
            }
          }
        }
        
        if (appId === '{00000000-0000-0000-0000-000000000000}') {
          console.log('⚠️  Port 443 not found or no App ID, using default');
        }
      } catch (error) {
        console.log('⚠️  Could not query port 443:', error.message);
        console.log('⚠️  Using default App ID');
      }
      
      results.appId = appId;
      const appIdSource = appId === '{00000000-0000-0000-0000-000000000000}' ? '(default - port 443 not found)' : '(from port 443)';
      results.steps.push({ step: 'Get Application ID ' + appIdSource, status: 'success', appId });

      // Step 8: Update SSL binding for port 8443
      const updateBindingCmd = '$thumbprint = "' + thumbprint + '"; ' +
        '$appId = "' + appId + '"; ' +
        '$existingBinding = netsh http show sslcert ipport=0.0.0.0:8443 2>$null; ' +
        'if ($existingBinding -match "Certificate Hash") { netsh http delete sslcert ipport=0.0.0.0:8443 | Out-Null }; ' +
        '$output = netsh http add sslcert ipport=0.0.0.0:8443 certhash=$thumbprint appid=$appId 2>&1 | Out-String; ' +
        'if ($LASTEXITCODE -ne 0) { Write-Output "NETSH_ERROR: $output" } ' +
        'else { Write-Output "SSL binding updated for port 8443" }';
      const bindingResult = await sshService.executeCommand(serverConfig, updateBindingCmd);
      
      if (bindingResult.includes('NETSH_ERROR:')) {
        throw new Error('netsh failed: ' + bindingResult.replace('NETSH_ERROR:', ''));
      }
      results.steps.push({ step: 'Update SSL binding (port 8443 ONLY)', status: 'success' });

      // Step 9: Move certificate files to final destination
      const finalCertFile = sslConfig.finalPath + '\\' + sslConfig.certFile;
      const finalKeyFile = sslConfig.finalPath + '\\' + sslConfig.keyFile;
      
      const moveCertsCmd = 'if (-not (Test-Path "' + sslConfig.finalPath + '")) { New-Item -ItemType Directory -Path "' + sslConfig.finalPath + '" -Force | Out-Null }; ' +
        'if (Test-Path "' + finalCertFile + '") { $backupDate = Get-Date -Format \'yyyyMMdd_HHmmss\'; Copy-Item "' + finalCertFile + '" "' + finalCertFile + '.backup_$backupDate" -Force }; ' +
        'if (Test-Path "' + finalKeyFile + '") { $backupDate = Get-Date -Format \'yyyyMMdd_HHmmss\'; Copy-Item "' + finalKeyFile + '" "' + finalKeyFile + '.backup_$backupDate" -Force }; ' +
        'Copy-Item "' + certFile + '" "' + finalCertFile + '" -Force; ' +
        'Copy-Item "' + keyFile + '" "' + finalKeyFile + '" -Force; ' +
        'Write-Output \'Certificates moved to final destination\'';
      await sshService.executeCommand(serverConfig, moveCertsCmd);
      results.steps.push({ step: 'Move to final destination', status: 'success', path: sslConfig.finalPath });

      // Step 10: Cleanup temp files
      const cleanupCmd = 'Remove-Item -Path "' + remoteTempPath + '" -Recurse -Force -ErrorAction SilentlyContinue; Write-Output \'Cleanup complete\'';
      await sshService.executeCommand(serverConfig, cleanupCmd);
      results.steps.push({ step: 'Cleanup temp files', status: 'success' });

      results.success = true;
      results.certFile = finalCertFile;
      results.keyFile = finalKeyFile;

    } catch (error) {
      results.error = error.message;
      results.steps.push({ step: 'Deployment failed', status: 'error', error: error.message });
    }

    return results;
  }

  /**
   * Deploy SSL certificate to frontend server
   */
  async deployToFrontend(serverConfig, backendResult, pfxPassword, pfxFilename) {
    const results = {
      server: serverConfig.name,
      success: false,
      steps: [],
      error: null
    };

    try {
      if (!backendResult.success) {
        throw new Error('Backend deployment was not successful');
      }

      results.steps.push({ step: 'Validate backend deployment', status: 'success' });

      const sslConfig = serverConfig.ssl || {
        finalPath: "C:\\IConduct\\NatsCert",
        tempPath: "C:\\IConduct\\NatsCert\\temp",
        certFile: "iconductcloud22.crt",
        keyFile: "iconductcloud22.key"
      };

      // Step 1: Validate PFX file exists on local machine
      const pfxPath = path.join(this.PFX_OUTPUT_DIR, pfxFilename);
      await fs.access(pfxPath);
      results.steps.push({ step: 'Validate PFX', status: 'success' });

      // Step 2: Read PFX file from local machine
      const pfxBuffer = await fs.readFile(pfxPath);
      const pfxBase64 = pfxBuffer.toString('base64');
      results.steps.push({ step: 'Read PFX file', status: 'success' });

      // Step 3: Create temp directory on frontend
      const createTempCmd = '$tempPath = "' + sslConfig.tempPath + '"; if (-not (Test-Path $tempPath)) { New-Item -ItemType Directory -Path $tempPath -Force | Out-Null }; Write-Output $tempPath';
      const tempDirResult = await sshService.executeCommand(serverConfig, createTempCmd);
      const frontendTempPath = tempDirResult.trim();
      results.steps.push({ step: 'Create temp directory', status: 'success', path: frontendTempPath });

      // Step 4: Copy PFX to frontend server
      const frontendPfxPath = frontendTempPath + '\\' + pfxFilename;
      const copyPfxCmd = '$base64 = \'' + pfxBase64 + '\'; $bytes = [Convert]::FromBase64String($base64); [System.IO.File]::WriteAllBytes(\'' + frontendPfxPath + '\', $bytes); Write-Output \'PFX copied\'';
      await sshService.executeCommand(serverConfig, copyPfxCmd);
      results.steps.push({ step: 'Copy PFX to server', status: 'success' });

      // Step 5: Extract certificate and key using OpenSSL (same as backend)
      const frontendCertFile = frontendTempPath + '\\' + sslConfig.certFile;
      const frontendKeyFile = frontendTempPath + '\\' + sslConfig.keyFile;
      const frontendP12File = frontendTempPath + '\\temp.p12';
      
      const opensslPath = sslConfig.opensslPath || 'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe';
      
      const extractCmd = 'if (-not (Test-Path "' + opensslPath + '")) { throw "OpenSSL not found at: ' + opensslPath + '" }; ' +
        '& "' + opensslPath + '" pkcs12 -in "' + frontendPfxPath + '" -nocerts -out "' + frontendKeyFile + '" -nodes -passin pass:' + pfxPassword + ' 2>&1; ' +
        'if ($LASTEXITCODE -ne 0) { throw "Failed to extract private key" }; ' +
        '& "' + opensslPath + '" pkcs12 -in "' + frontendPfxPath + '" -clcerts -nokeys -out "' + frontendCertFile + '" -passin pass:' + pfxPassword + ' 2>&1; ' +
        'if ($LASTEXITCODE -ne 0) { throw "Failed to extract certificate" }; ' +
        '& "' + opensslPath + '" pkcs12 -export -in "' + frontendCertFile + '" -inkey "' + frontendKeyFile + '" -out "' + frontendP12File + '" -passout pass:' + pfxPassword + ' 2>&1; ' +
        'if ($LASTEXITCODE -ne 0) { throw "Failed to create P12 file" }; ' +
        'if (-not (Test-Path "' + frontendCertFile + '")) { throw "Certificate file not created" }; ' +
        'if (-not (Test-Path "' + frontendKeyFile + '")) { throw "Key file not created" }; ' +
        'if (-not (Test-Path "' + frontendP12File + '")) { throw "P12 file not created" }; ' +
        'Write-Output "Extraction completed"';
      
      await sshService.executeCommand(serverConfig, extractCmd);
      results.steps.push({ step: 'Extract certificate and key (OpenSSL)', status: 'success' });

      // Step 6: Import certificate to Windows store
      const importCertCmd = '$securePassword = ConvertTo-SecureString -String "' + pfxPassword + '" -AsPlainText -Force; ' +
        '$cert = Import-PfxCertificate -FilePath "' + frontendP12File + '" -CertStoreLocation "Cert:\\LocalMachine\\My" -Password $securePassword -Exportable; ' +
        'if (-not $cert) { throw "Certificate import failed" }; ' +
        'Write-Output $cert.Thumbprint';
      const thumbprintResult = await sshService.executeCommand(serverConfig, importCertCmd);
      const thumbprint = thumbprintResult.replace(/\s/g, '').trim();
      results.thumbprint = thumbprint;
      results.steps.push({ step: 'Import to certificate store', status: 'success', thumbprint });

      // Step 7: Get Application ID from port 443
      console.log('📝 Getting App ID from port 443...');
      const getAppIdCmd = 'netsh http show sslcert ipport=0.0.0.0:443';
      let appId = '{00000000-0000-0000-0000-000000000000}'; // Default
      
      try {
        const port443Output = await sshService.executeCommand(serverConfig, getAppIdCmd);
        console.log('📝 Port 443 output:', port443Output);
        
        // Parse output line by line
        const lines = port443Output.split('\n');
        for (const line of lines) {
          // Look for line with "Application ID"
          if (line.includes('Application ID')) {
            // Extract GUID from line like "    Application ID               : {34adfccc-9846-4bf8-9850-00e46201c64c}"
            const match = line.match(/\{[0-9a-fA-F-]{36}\}/);
            if (match) {
              appId = match[0];
              console.log('✅ Found App ID from port 443:', appId);
              break;
            }
          }
        }
        
        if (appId === '{00000000-0000-0000-0000-000000000000}') {
          console.log('⚠️  Port 443 not found or no App ID, using default');
        }
      } catch (error) {
        console.log('⚠️  Could not query port 443:', error.message);
        console.log('⚠️  Using default App ID');
      }
      
      results.appId = appId;
      const appIdSource = appId === '{00000000-0000-0000-0000-000000000000}' ? '(default - port 443 not found)' : '(from port 443)';
      results.steps.push({ step: 'Get Application ID ' + appIdSource, status: 'success', appId });

      // Step 8: Update SSL binding for port 8443
      const updateNetshCmd = '$thumbprint = "' + thumbprint + '"; ' +
        '$appId = "' + appId + '"; ' +
        '$existingBinding = netsh http show sslcert ipport=0.0.0.0:8443 2>$null; ' +
        'if ($existingBinding -match "Certificate Hash") { netsh http delete sslcert ipport=0.0.0.0:8443 | Out-Null }; ' +
        '$output = netsh http add sslcert ipport=0.0.0.0:8443 certhash=$thumbprint appid=$appId 2>&1 | Out-String; ' +
        'if ($LASTEXITCODE -ne 0) { Write-Output "NETSH_ERROR: $output" } ' +
        'else { Write-Output "SSL binding updated for port 8443" }';
      const bindingResult = await sshService.executeCommand(serverConfig, updateNetshCmd);
      
      if (bindingResult.includes('NETSH_ERROR:')) {
        throw new Error('netsh failed: ' + bindingResult.replace('NETSH_ERROR:', ''));
      }
      results.steps.push({ step: 'Update SSL binding (port 8443 ONLY)', status: 'success' });

      // Step 9: Move certificates to final destination
      const finalCertFile = sslConfig.finalPath + '\\' + sslConfig.certFile;
      const finalKeyFile = sslConfig.finalPath + '\\' + sslConfig.keyFile;
      
      const moveCertsCmd = 'if (-not (Test-Path "' + sslConfig.finalPath + '")) { New-Item -ItemType Directory -Path "' + sslConfig.finalPath + '" -Force | Out-Null }; ' +
        'if (Test-Path "' + finalCertFile + '") { $backupDate = Get-Date -Format \'yyyyMMdd_HHmmss\'; Copy-Item "' + finalCertFile + '" "' + finalCertFile + '.backup_$backupDate" -Force }; ' +
        'if (Test-Path "' + finalKeyFile + '") { $backupDate = Get-Date -Format \'yyyyMMdd_HHmmss\'; Copy-Item "' + finalKeyFile + '" "' + finalKeyFile + '.backup_$backupDate" -Force }; ' +
        'Copy-Item "' + frontendCertFile + '" "' + finalCertFile + '" -Force; ' +
        'Copy-Item "' + frontendKeyFile + '" "' + finalKeyFile + '" -Force; ' +
        'Write-Output \'Certificates moved to final destination\'';
      await sshService.executeCommand(serverConfig, moveCertsCmd);
      results.steps.push({ step: 'Move to final destination', status: 'success', path: sslConfig.finalPath });

      // Step 10: Cleanup temp files
      const cleanupCmd = 'Remove-Item -Path "' + frontendTempPath + '" -Recurse -Force -ErrorAction SilentlyContinue; Write-Output \'Cleanup complete\'';
      await sshService.executeCommand(serverConfig, cleanupCmd);
      results.steps.push({ step: 'Cleanup temp files', status: 'success' });

      results.success = true;

    } catch (error) {
      results.error = error.message;
      results.steps.push({ step: 'Deployment failed', status: 'error', error: error.message });
    }

    return results;
  }
}

module.exports = new SSLDeployService();