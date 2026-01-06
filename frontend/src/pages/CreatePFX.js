// Full path: frontend/src/pages/CreatePFX.js

import React, { useState, useEffect } from 'react';
import { FaLock, FaUpload, FaCheckCircle, FaExclamationTriangle, FaKey, FaFileArchive, FaTrash, FaInfoCircle } from 'react-icons/fa';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const CreatePFX = () => {
  const [crtFile, setCrtFile] = useState(null);
  const [pfxPassword, setPfxPassword] = useState('');
  const [keyPassword, setKeyPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [keyExists, setKeyExists] = useState(false);
  const [keyCheckLoading, setKeyCheckLoading] = useState(true);
  const [keyPath, setKeyPath] = useState('');
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [error, setError] = useState(null);
  const [pfxFiles, setPfxFiles] = useState([]);
  const [showFileList, setShowFileList] = useState(false);

  // Check if key file exists on component mount
  useEffect(() => {
    checkKeyFile();
    loadPfxFiles();
  }, []);

  const checkKeyFile = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/pfx/check-key`);
      setKeyExists(response.data.keyExists);
      setKeyPath(response.data.keyPath);
    } catch (err) {
      console.error('Error checking key file:', err);
      setKeyExists(false);
    } finally {
      setKeyCheckLoading(false);
    }
  };

  const loadPfxFiles = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/pfx/list`);
      setPfxFiles(response.data.data.files);
    } catch (err) {
      console.error('Error loading PFX files:', err);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.crt')) {
        setError('Please select a .crt file');
        setCrtFile(null);
        return;
      }
      setCrtFile(file);
      setError(null);
    }
  };

  const handleCreatePFX = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!crtFile) {
      setError('Please select a .crt file');
      return;
    }
    if (!pfxPassword || pfxPassword.trim().length === 0) {
      setError('Please enter a password for the PFX file');
      return;
    }
    if (!keyExists) {
      setError('Static key file not found on server. Please contact administrator.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Create FormData
      const formData = new FormData();
      formData.append('crtFile', crtFile);
      formData.append('pfxPassword', pfxPassword);
      
      // Add key password if provided
      if (keyPassword && keyPassword.trim().length > 0) {
        formData.append('keyPassword', keyPassword);
      }

      // Send request
      const response = await axios.post(`${API_URL}/api/pfx/create`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data.success) {
        // Show success popup
        setSuccessData(response.data.data);
        setShowSuccessPopup(true);
        
        // Reset form
        setCrtFile(null);
        setPfxPassword('');
        setKeyPassword('');
        document.getElementById('crt-file-input').value = '';
        
        // Reload file list
        await loadPfxFiles();
      } else {
        setError(response.data.error || 'Failed to create PFX file');
      }
    } catch (err) {
      console.error('Error creating PFX:', err);
      setError(
        err.response?.data?.error || 
        err.message || 
        'Failed to create PFX file. Please check the certificate and passwords, then try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePfx = async (filename) => {
    if (!window.confirm(`Are you sure you want to delete ${filename}?`)) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/api/pfx/${filename}`);
      await loadPfxFiles();
    } catch (err) {
      console.error('Error deleting PFX:', err);
      alert('Failed to delete file');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('Path copied to clipboard!');
  };

  const handleDownloadPfx = (filename) => {
    // Create download link
    const downloadUrl = `${API_URL}/api/pfx/download/${filename}`;
    
    // Create temporary anchor element and trigger download
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <FaLock className="text-3xl text-blue-600 dark:text-blue-400" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Create PFX Certificate
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Convert SSL certificate (.crt) to PFX format using the server's private key
              </p>
            </div>
          </div>

          {/* Key File Status */}
          {keyCheckLoading ? (
            <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                <span className="text-gray-600 dark:text-gray-300">Checking key file...</span>
              </div>
            </div>
          ) : (
            <div className={`rounded-lg p-4 ${
              keyExists 
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' 
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
            }`}>
              <div className="flex items-start gap-3">
                <FaKey className={`text-xl mt-1 ${
                  keyExists 
                    ? 'text-green-600 dark:text-green-400' 
                    : 'text-red-600 dark:text-red-400'
                }`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {keyExists ? (
                      <FaCheckCircle className="text-green-600 dark:text-green-400" />
                    ) : (
                      <FaExclamationTriangle className="text-red-600 dark:text-red-400" />
                    )}
                    <span className={`font-semibold ${
                      keyExists 
                        ? 'text-green-800 dark:text-green-300' 
                        : 'text-red-800 dark:text-red-300'
                    }`}>
                      {keyExists ? 'Private Key File Found' : 'Private Key File Not Found'}
                    </span>
                  </div>
                  <p className={`text-sm ${
                    keyExists 
                      ? 'text-green-700 dark:text-green-400' 
                      : 'text-red-700 dark:text-red-400'
                  }`}>
                    {keyExists 
                      ? `Key file located at: ${keyPath}` 
                      : `Please place your private key file at: ${keyPath}`}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main Form */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <form onSubmit={handleCreatePFX} className="space-y-6">
            {/* File Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Upload Certificate (.crt file)
              </label>
              <div className="relative">
                <input
                  id="crt-file-input"
                  type="file"
                  accept=".crt"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={loading || !keyExists}
                />
                <label
                  htmlFor="crt-file-input"
                  className={`flex items-center justify-center gap-3 border-2 border-dashed rounded-lg p-8 cursor-pointer transition-colors ${
                    loading || !keyExists
                      ? 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 cursor-not-allowed'
                      : 'border-blue-300 dark:border-blue-600 hover:border-blue-500 dark:hover:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                  }`}
                >
                  <FaUpload className={`text-3xl ${
                    loading || !keyExists
                      ? 'text-gray-400 dark:text-gray-500'
                      : 'text-blue-600 dark:text-blue-400'
                  }`} />
                  <div>
                    <p className={`font-medium ${
                      loading || !keyExists
                        ? 'text-gray-500 dark:text-gray-400'
                        : 'text-blue-700 dark:text-blue-300'
                    }`}>
                      {crtFile ? crtFile.name : 'Click to upload .crt file'}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {crtFile ? `Size: ${(crtFile.size / 1024).toFixed(2)} KB` : 'Max file size: 10MB'}
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Key Password Input (Optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Private Key Password (Optional)
              </label>
              <input
                type="password"
                value={keyPassword}
                onChange={(e) => setKeyPassword(e.target.value)}
                placeholder="Enter key password (leave empty if key is not encrypted)"
                disabled={loading || !keyExists}
                className={`w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                  loading || !keyExists
                    ? 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 cursor-not-allowed'
                    : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white'
                }`}
              />
              <div className="mt-2 flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                <FaInfoCircle className="mt-0.5 flex-shrink-0" />
                <p>
                  If your private key is encrypted/password-protected, enter the password here. 
                  Leave empty if your key is not encrypted.
                </p>
              </div>
            </div>

            {/* PFX Password Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                PFX Password (Required)
              </label>
              <input
                type="password"
                value={pfxPassword}
                onChange={(e) => setPfxPassword(e.target.value)}
                placeholder="Enter password to protect the PFX file"
                disabled={loading || !keyExists}
                className={`w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                  loading || !keyExists
                    ? 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 cursor-not-allowed'
                    : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white'
                }`}
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                This password will be used to protect the generated PFX file
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <FaExclamationTriangle className="text-red-600 dark:text-red-400 text-xl mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-red-800 dark:text-red-300">Error</p>
                    <p className="text-red-700 dark:text-red-400 text-sm whitespace-pre-line">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !crtFile || !pfxPassword || !keyExists}
              className={`w-full py-3 px-6 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                loading || !crtFile || !pfxPassword || !keyExists
                  ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl'
              }`}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Creating PFX...</span>
                </>
              ) : (
                <>
                  <FaFileArchive />
                  <span>Create PFX File</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Generated PFX Files List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <div 
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setShowFileList(!showFileList)}
          >
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Generated PFX Files ({pfxFiles.length})
            </h2>
            <button className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              {showFileList ? '▲' : '▼'}
            </button>
          </div>

          {showFileList && (
            <div className="mt-4 space-y-3">
              {pfxFiles.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                  No PFX files generated yet
                </p>
              ) : (
                pfxFiles.map((file) => (
                  <div
                    key={file.filename}
                    className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <FaFileArchive className="text-blue-600 dark:text-blue-400" />
                          <span className="font-semibold text-gray-900 dark:text-white">
                            {file.filename}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                          <p>Size: {file.sizeKB} KB</p>
                          <p>Created: {new Date(file.created).toLocaleString()}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <code className="bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded text-xs flex-1 break-all">
                              {file.fullPath}
                            </code>
                            <button
                              onClick={() => copyToClipboard(file.fullPath)}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors whitespace-nowrap"
                            >
                              Copy
                            </button>
                            <button
                              onClick={() => handleDownloadPfx(file.filename)}
                              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors whitespace-nowrap"
                              title="Download to computer"
                            >
                              Download
                            </button>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeletePfx(file.filename)}
                        className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 p-2"
                        title="Delete file"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Success Popup */}
      {showSuccessPopup && successData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-2xl w-full p-8 animate-scale-in">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
                <FaCheckCircle className="text-5xl text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                PFX Created Successfully!
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Your certificate has been converted to PFX format
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 mb-6 space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Filename:
                </p>
                <p className="text-gray-900 dark:text-white font-mono text-sm">
                  {successData.filename}
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Full Path:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-gray-200 dark:bg-gray-600 px-3 py-2 rounded text-sm text-gray-900 dark:text-white font-mono break-all">
                    {successData.fullPath}
                  </code>
                  <button
                    onClick={() => copyToClipboard(successData.fullPath)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors whitespace-nowrap"
                  >
                    Copy Path
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    File Size:
                  </p>
                  <p className="text-gray-900 dark:text-white">{successData.sizeKB} KB</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Created:
                  </p>
                  <p className="text-gray-900 dark:text-white">
                    {new Date(successData.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Download and Deploy Buttons */}
            <div className="space-y-3">
              <button
                onClick={() => handleDownloadPfx(successData.filename)}
                className="w-full py-3 px-6 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Download PFX to My Computer</span>
              </button>

              <button
                onClick={() => {
                  // Navigate to Deploy SSL page with PFX filename
                  window.location.href = `/deploy-ssl?pfx=${successData.filename}`;
                }}
                className="w-full py-3 px-6 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Deploy SSL Certificate Now</span>
              </button>

              <button
                onClick={() => {
                  setShowSuccessPopup(false);
                  setSuccessData(null);
                }}
                className="w-full py-3 px-6 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add animation styles */}
      <style jsx>{`
        @keyframes scale-in {
          from {
            transform: scale(0.9);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        .animate-scale-in {
          animation: scale-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default CreatePFX;