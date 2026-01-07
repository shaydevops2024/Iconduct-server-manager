// Full path: backend/src/routes/encryption.js

const express = require('express');
const router = express.Router();
const sshService = require('../services/sshService');

/**
 * POST /api/encryption/process
 * Execute CryptoCLI.exe on TEST3 server with encrypt/decrypt parameter
 */
router.post('/process', async (req, res) => {
  try {
    const { operation, text } = req.body;

    // Validation
    if (!operation || !text) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: operation and text'
      });
    }

    if (operation !== 'encrypt' && operation !== 'decrypt') {
      return res.status(400).json({
        success: false,
        error: 'Invalid operation. Must be "encrypt" or "decrypt"'
      });
    }

    // Find TEST3-Server
    const servers = sshService.getAllServers();
    const test3Server = servers.find(s => s.name === 'TEST3-Server');

    if (!test3Server) {
      return res.status(404).json({
        success: false,
        error: 'TEST3-Server not found in configuration'
      });
    }

    console.log(`\n========================================`);
    console.log(`ENCRYPTION OPERATION`);
    console.log(`========================================`);
    console.log(`Server: ${test3Server.name}`);
    console.log(`Operation: ${operation}`);
    console.log(`Text length: ${text.length} characters`);
    console.log(`========================================\n`);

    // Escape the text for PowerShell - very important!
    const escapedText = text
      .replace(/\\/g, '\\\\')   // Escape backslashes first
      .replace(/"/g, '\\"')     // Escape double quotes
      .replace(/`/g, '\\`')     // Escape backticks
      .replace(/\$/g, '\\$')    // Escape dollar signs
      .replace(/\r/g, '')       // Remove carriage returns
      .replace(/\n/g, '\\n');   // Escape newlines

    // Build the PowerShell command
    const cryptoCommand = `C:\\CryptoCLI\\CryptoCLI.exe ${operation} "${escapedText}"`;
    
    console.log(`🔐 Executing: CryptoCLI.exe ${operation} [text]`);

    // Execute command via SSH
    const output = await sshService.executeCommand(test3Server, cryptoCommand);

    console.log(`✅ Operation completed successfully`);
    console.log(`Result length: ${output.trim().length} characters\n`);

    res.json({
      success: true,
      data: {
        operation: operation,
        result: output.trim(),
        server: test3Server.name
      }
    });

  } catch (error) {
    console.error(`\n❌ Encryption operation failed: ${error.message}\n`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/encryption/test-connection
 * Test connection to TEST3 server
 */
router.get('/test-connection', async (req, res) => {
  try {
    const servers = sshService.getAllServers();
    const test3Server = servers.find(s => s.name === 'TEST3-Server');

    if (!test3Server) {
      return res.status(404).json({
        success: false,
        error: 'TEST3-Server not found in configuration'
      });
    }

    console.log(`\n🔍 Testing connection to ${test3Server.name}...`);

    // Quick availability check
    const availability = await sshService.checkServerAvailability(test3Server);

    if (!availability.available) {
      console.log(`❌ Server not available: ${availability.error}\n`);
      return res.json({
        success: false,
        available: false,
        error: availability.error,
        server: test3Server.name
      });
    }

    // Test if CryptoCLI.exe exists
    const testCommand = 'Test-Path "C:\\CryptoCLI\\CryptoCLI.exe"';
    const exists = await sshService.executeCommand(test3Server, testCommand);

    console.log(`✅ Connection successful`);
    console.log(`CryptoCLI.exe exists: ${exists.trim()}\n`);

    res.json({
      success: true,
      available: true,
      cryptoCliExists: exists.trim().toLowerCase() === 'true',
      server: test3Server.name
    });

  } catch (error) {
    console.error(`❌ Connection test failed: ${error.message}\n`);
    res.status(500).json({
      success: false,
      available: false,
      error: error.message
    });
  }
});

module.exports = router;
