// Full path: frontend/src/pages/AutomatedUpgrade.js

import React, { useState, useEffect } from 'react';
import { FaUpload, FaRocket, FaServer, FaCheckCircle, FaExclamationTriangle, FaSpinner, FaTimesCircle, FaFileArchive, FaClock, FaCloudUploadAlt } from 'react-icons/fa';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL !== undefined
  ? (process.env.REACT_APP_API_URL || '')
  : '';

const AutomatedUpgrade = () => {
  const [files, setFiles] = useState({
    backend: null,
    oldUI: null,
    newUI: null,
    apiManagement: null
  });
  
  const [s3Keys, setS3Keys] = useState({
    backend: null,
    oldUI: null,
    newUI: null,
    apiManagement: null
  });
  
  const [uploadProgress, setUploadProgress] = useState({
    backend: 0,
    oldUI: 0,
    newUI: 0,
    apiManagement: 0
  });
  
  const [uploading, setUploading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(null);
  
  const [selectedServer, setSelectedServer] = useState('');
  const [servers, setServers] = useState([]);
  const [loadingServers, setLoadingServers] = useState(true);
  
  const [upgrading, setUpgrading] = useState(false);
  const [currentPhase, setCurrentPhase] = useState(null);
  const [phaseProgress, setPhaseProgress] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    loadServers();
  }, []);

  const loadServers = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/upgrade/servers`);
      console.log('Servers response:', response.data);
      
      // FIX: Use response.data.servers instead of response.data.data
      if (response.data && response.data.success && Array.isArray(response.data.servers)) {
        setServers(response.data.servers);
      } else {
        setServers([]);
        setError('Failed to load servers: Invalid response format');
      }
      setLoadingServers(false);
    } catch (err) {
      console.error('Error loading servers:', err);
      setServers([]);
      setError('Failed to load servers');
      setLoadingServers(false);
    }
  };

  const handleFileSelect = async (type, event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.zip')) {
      setError('Please select a valid ZIP file');
      return;
    }

    setFiles(prev => ({ ...prev, [type]: file }));
    setError(null);

    // Immediately upload to S3
    await uploadToS3(type, file);
  };

  const uploadToS3 = async (type, file) => {
    try {
      setUploading(true);
      setUploadingFile(type);
      setUploadProgress(prev => ({ ...prev, [type]: 0 }));

      // Get pre-signed URL from backend
      const urlResponse = await axios.post(`${API_URL}/api/upgrade/get-upload-url`, {
        fileName: file.name,
        fileType: file.type || 'application/zip',
        componentType: type
      });

      // FIX: Use s3Key instead of key
      const { uploadUrl, s3Key } = urlResponse.data;

      // Upload directly to S3
      await axios.put(uploadUrl, file, {
        headers: {
          'Content-Type': file.type || 'application/zip'
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(prev => ({ ...prev, [type]: percentCompleted }));
        }
      });

      // Store S3 key
      setS3Keys(prev => ({ ...prev, [type]: s3Key }));
      
      console.log(`✅ Uploaded ${type} to S3:`, s3Key);

    } catch (err) {
      console.error(`Error uploading ${type} to S3:`, err);
      setError(`Failed to upload ${type}: ${err.message}`);
      setFiles(prev => ({ ...prev, [type]: null }));
      setS3Keys(prev => ({ ...prev, [type]: null }));
    } finally {
      setUploading(false);
      setUploadingFile(null);
    }
  };

  const handleRemoveFile = async (type) => {
    const s3Key = s3Keys[type];
    
    if (s3Key) {
      try {
        // Delete from S3 - FIX: use s3Key instead of key
        await axios.post(`${API_URL}/api/upgrade/delete-upload`, { s3Key });
        console.log(`🗑️ Deleted ${type} from S3`);
      } catch (err) {
        console.error(`Error deleting ${type} from S3:`, err);
      }
    }
    
    setFiles(prev => ({ ...prev, [type]: null }));
    setS3Keys(prev => ({ ...prev, [type]: null }));
    setUploadProgress(prev => ({ ...prev, [type]: 0 }));
  };

  const validateUpgrade = () => {
    if (!selectedServer) {
      setError('Please select a server to upgrade');
      return false;
    }

    // At least one file must be uploaded
    const hasAnyFile = Object.values(s3Keys).some(key => key !== null);
    if (!hasAnyFile) {
      setError('At least one ZIP file must be uploaded');
      return false;
    }

    return true;
  };

  const handleUpgradeClick = () => {
    if (!validateUpgrade()) return;
    setShowConfirmModal(true);
  };

  const handleConfirmUpgrade = async () => {
    setShowConfirmModal(false);
    setUpgrading(true);
    setError(null);
    setSuccess(false);
    setPhaseProgress([]);
    setCurrentPhase(null);

    try {
      const payload = {
        serverName: selectedServer,
        s3Keys: {
          backend: s3Keys.backend,
          oldUI: s3Keys.oldUI,
          newUI: s3Keys.newUI,
          apiManagement: s3Keys.apiManagement
        }
      };

      console.log('Starting upgrade with S3 keys:', payload);

      const response = await axios.post(`${API_URL}/api/upgrade/execute`, payload, {
        timeout: 600000, // 10 minutes
      });

      if (response.data.success) {
        setSuccess(true);
        setPhaseProgress(response.data.result.phases || []);
        setCurrentPhase('Upgrade completed successfully!');
        
        // Clear files after success
        setFiles({
          backend: null,
          oldUI: null,
          newUI: null,
          apiManagement: null
        });
        setS3Keys({
          backend: null,
          oldUI: null,
          newUI: null,
          apiManagement: null
        });
      } else {
        setError(response.data.error || 'Upgrade failed');
        setPhaseProgress(response.data.phases || []);
      }
    } catch (err) {
      console.error('Upgrade error:', err);
      setError(err.response?.data?.error || err.message || 'Upgrade failed');
      if (err.response?.data?.phases) {
        setPhaseProgress(err.response.data.phases);
      }
    } finally {
      setUpgrading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const FileUploadBox = ({ type, title, file, color }) => {
    const isUploading = uploading && uploadingFile === type;
    const progress = uploadProgress[type];
    const isUploaded = s3Keys[type] !== null;

    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg border-2 ${
        isUploaded ? `border-${color}-500` : 'border-gray-300 dark:border-gray-600'
      } p-6 transition-all duration-200`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center space-x-2">
            <FaFileArchive className={`text-${color}-500`} />
            <span>{title}</span>
          </h3>
          {file && !isUploading && (
            <button
              onClick={() => handleRemoveFile(type)}
              className="text-red-500 hover:text-red-600 transition-colors"
              disabled={upgrading}
            >
              <FaTimesCircle className="text-xl" />
            </button>
          )}
        </div>

        {!file ? (
          <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-${color}-300 dark:border-${color}-700 rounded-lg cursor-pointer hover:bg-${color}-50 dark:hover:bg-${color}-900/20 transition-all`}>
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <FaUpload className={`text-3xl text-${color}-400 mb-2`} />
              <p className="text-sm text-gray-600 dark:text-gray-400">Click to upload ZIP file</p>
            </div>
            <input
              type="file"
              className="hidden"
              accept=".zip"
              onChange={(e) => handleFileSelect(type, e)}
              disabled={upgrading || uploading}
            />
          </label>
        ) : isUploading ? (
          <div className={`bg-${color}-50 dark:bg-${color}-900/20 rounded-lg p-4 border border-${color}-200 dark:border-${color}-800`}>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <FaCloudUploadAlt className={`text-${color}-500 text-2xl animate-pulse`} />
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-white truncate">{file.name}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Uploading to S3...</p>
                </div>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`bg-${color}-500 h-2 rounded-full transition-all duration-300`}
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">{progress}%</p>
            </div>
          </div>
        ) : (
          <div className={`bg-${color}-50 dark:bg-${color}-900/20 rounded-lg p-4 border border-${color}-200 dark:border-${color}-800`}>
            <div className="flex items-center space-x-3">
              <FaCheckCircle className={`text-${color}-500 text-2xl`} />
              <div className="flex-1">
                <p className="font-medium text-gray-900 dark:text-white truncate">{file.name}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{formatFileSize(file.size)}</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">✓ Uploaded to S3</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 mb-6 transition-colors duration-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <FaRocket className="text-orange-500 text-3xl" />
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Automated Upgrade</h2>
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
            <FaCloudUploadAlt className="text-blue-500" />
            <span>Files uploaded to S3</span>
          </div>
        </div>

        {/* Server Selection */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Select Backend Server to Upgrade
          </label>
          {loadingServers ? (
            <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
              <FaSpinner className="animate-spin" />
              <span>Loading servers...</span>
            </div>
          ) : (
            <select
              value={selectedServer}
              onChange={(e) => setSelectedServer(e.target.value)}
              disabled={upgrading || uploading}
              className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
            >
              <option value="">-- Select a server --</option>
              {servers.map(server => (
                <option key={server.name} value={server.name}>
                  {server.group} - {server.name} ({server.host})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* File Upload Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <FileUploadBox type="backend" title="Backend" file={files.backend} color="blue" />
          <FileUploadBox type="oldUI" title="Old UI (FE1+FE2)" file={files.oldUI} color="green" />
          <FileUploadBox type="newUI" title="New UI (FE1)" file={files.newUI} color="purple" />
          <FileUploadBox type="apiManagement" title="API Management (FE1)" file={files.apiManagement} color="pink" />
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-4">
          <button
            onClick={handleUpgradeClick}
            disabled={upgrading || uploading || !selectedServer || !Object.values(s3Keys).some(k => k !== null)}
            className="px-8 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 font-semibold text-lg"
          >
            {upgrading ? (
              <>
                <FaSpinner className="animate-spin" />
                <span>Upgrading...</span>
              </>
            ) : uploading ? (
              <>
                <FaSpinner className="animate-spin" />
                <span>Uploading to S3...</span>
              </>
            ) : (
              <>
                <FaRocket />
                <span>Start Upgrade</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Progress Display */}
      {(upgrading || phaseProgress.length > 0) && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 transition-colors duration-200">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center space-x-2">
            <FaClock className="text-orange-500" />
            <span>Upgrade Progress</span>
          </h3>

          {currentPhase && (
            <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-blue-800 dark:text-blue-300 font-medium">{currentPhase}</p>
            </div>
          )}

          <div className="space-y-3">
            {phaseProgress.map((phase, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border-2 ${
                  phase.status === 'success'
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                    : phase.status === 'error'
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
                    : phase.status === 'running'
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                    : 'bg-gray-50 dark:bg-gray-900/20 border-gray-300 dark:border-gray-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {phase.status === 'success' ? (
                      <FaCheckCircle className="text-green-500 text-xl" />
                    ) : phase.status === 'error' ? (
                      <FaTimesCircle className="text-red-500 text-xl" />
                    ) : phase.status === 'running' ? (
                      <FaSpinner className="text-blue-500 text-xl animate-spin" />
                    ) : (
                      <FaClock className="text-gray-400 text-xl" />
                    )}
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        Phase {phase.phase}: {phase.name}
                      </p>
                      {phase.details && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{phase.details}</p>
                      )}
                    </div>
                  </div>
                  {phase.duration && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">{phase.duration}</span>
                  )}
                </div>
                {phase.error && (
                  <div className="mt-2 text-sm text-red-600 dark:text-red-400">
                    Error: {phase.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="mt-6 bg-green-50 dark:bg-green-900/20 border-2 border-green-300 dark:border-green-700 rounded-lg p-6">
          <div className="flex items-center space-x-3">
            <FaCheckCircle className="text-green-500 text-3xl" />
            <div>
              <h4 className="text-lg font-bold text-green-800 dark:text-green-300">Upgrade Completed Successfully!</h4>
              <p className="text-green-700 dark:text-green-400 mt-1">All services have been upgraded and restarted. S3 files have been cleaned up.</p>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && !upgrading && !uploading && (
        <div className="mt-6 bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 rounded-lg p-6">
          <div className="flex items-center space-x-3">
            <FaExclamationTriangle className="text-red-500 text-3xl" />
            <div>
              <h4 className="text-lg font-bold text-red-800 dark:text-red-300">Error</h4>
              <p className="text-red-700 dark:text-red-400 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center space-x-3 mb-4">
              <FaExclamationTriangle className="text-orange-500 text-3xl" />
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Confirm Upgrade</h3>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                You are about to upgrade <strong>{selectedServer}</strong> with the following components:
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400">
                {s3Keys.backend && <li>Backend (from S3)</li>}
                {s3Keys.oldUI && <li>Old UI (from S3)</li>}
                {s3Keys.newUI && <li>New UI (from S3)</li>}
                {s3Keys.apiManagement && <li>API Management (from S3)</li>}
              </ul>
              <p className="text-red-600 dark:text-red-400 mt-4 font-semibold">
                ⚠️ This will stop all services and deploy new versions. Continue?
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmUpgrade}
                className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
              >
                Yes, Upgrade Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutomatedUpgrade;