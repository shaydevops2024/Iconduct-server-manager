// Full path: backend/src/server.js

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const winston = require('winston');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Middleware
app.use(cors());
app.use(compression()); // Enable gzip compression for responses
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Import routes
const servicesRoutes = require('./routes/services');
const configRoutes = require('./routes/configs');
const dllRoutes = require('./routes/dlls');
const pfxRoutes = require('./routes/pfx');
const sslDeployRoutes = require('./routes/ssl-deploy');
const encryptionRoutes = require('./routes/encryption');

// Use routes
app.use('/api/services', servicesRoutes);
app.use('/api/configs', configRoutes);
app.use('/api/dlls', dllRoutes);
app.use('/api/pfx', pfxRoutes);
app.use('/api/ssl-deploy', sslDeployRoutes);
app.use('/api/encryption', encryptionRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`);
  res.status(500).json({ 
    error: 'Internal server error', 
    message: err.message 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📊 Dashboard: http://localhost:${PORT}/api/health`);
  logger.info(`⚡ Compression enabled`);
  logger.info(`📦 Cache enabled (10s TTL)`);
  logger.info(`🔐 SSL Deploy enabled`);
  logger.info(`🔑 Encryption enabled`);
});

module.exports = app;
