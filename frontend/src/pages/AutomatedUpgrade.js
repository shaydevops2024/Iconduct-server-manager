// Full path: frontend/src/pages/AutomatedUpgrade.js

import React, { useState, useEffect, useRef } from 'react';
import { FaUpload, FaRocket, FaServer, FaCheckCircle, FaExclamationTriangle, FaSpinner, FaTimesCircle, FaFileArchive, FaClock, FaCloudUploadAlt, FaFileAlt, FaHistory, FaTrash } from 'react-icons/fa';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL !== undefined
  ? (process.env.REACT_APP_API_URL || '')
  : '';

// All phases that will be displayed
const ALL_PHASES = [
  { phase: 1, name: 'Download Files from S3' },
  { phase: 2, name: 'Create Temp Folder' },
  { phase: 3, name: 'Unzip Files & Extract Nested ZIPs' },
  { phase: 3.5, name: 'Run Database Update' },
  { phase: 4, name: 'Smart Rename Using Service Paths' },
  { phase: 5, name: 'Copy vault.json Files' },
  { phase: 6, name: 'Copy .config Files' },
  { phase: 7, name: 'Copy Special Folders' },
  { phase: 8, name: 'Stop Services' },
  { phase: 9, name: 'Backup & Move to Backup Folder' },
  { phase: 10, name: 'Deploy New Version' },
  { phase: 11, name: 'Start Services' },
  { phase: 12, name: 'Cleanup Temp Folders' },
  { phase: 13, name: 'Cleanup S3 Files' },
];

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
  const [allPhases, setAllPhases] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionData, setCompletionData] = useState(null);
  const [showLogs, setShowLogs] = useState(false);
  const [upgradeLogs, setUpgradeLogs] = useState('');
  const [loadingLogs, setLoadingLogs] = useState(false);
  
  // Logs history
  const [showLogsHistory, setShowLogsHistory] = useState(false);
  const [logsHistory, setLogsHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedLogFile, setSelectedLogFile] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [logToDelete, setLogToDelete] = useState(null);

  const progressRef = useRef(null);
  const pollingIntervalRef = useRef(null);

  // Auto-scroll to progress when upgrading starts or phases update
  useEffect(() => {
    if (upgrading && progressRef.current) {
      progressRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [upgrading, phaseProgress]);

  // Initialize all phases when upgrade starts
  useEffect(() => {
    if (upgrading && allPhases.length === 0) {
      const initialPhases = ALL_PHASES.map(p => ({
        ...p,
        status: 'pending',
        duration: null,
        details: null,
        error: null
      }));
      setAllPhases(initialPhases);
    }
  }, [upgrading, allPhases.length]);

  // Update phase statuses as backend reports progress
  useEffect(() => {
    if (phaseProgress.length > 0) {
      const updatedPhases = ALL_PHASES.map(templatePhase => {
        const progressPhase = phaseProgress.find(p => p.phase === templatePhase.phase);
        if (progressPhase) {
          return progressPhase;
        }
        return {
          ...templatePhase,
          status: 'pending',
          duration: null,
          details: null,
          error: null
        };
      });
      setAllPhases(updatedPhases);
    }
  }, [phaseProgress]);

  // Start/stop polling for live updates
  useEffect(() => {
    if (upgrading && selectedServer) {
      // Start polling
      pollingIntervalRef.current = setInterval(() => {
        pollUpgradeStatus();
      }, 3000); // Poll every 3 seconds
      
      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
      };
    }
  }, [upgrading, selectedServer]);

  const pollUpgradeStatus = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/upgrade/status/${selectedServer}`);
      
      if (response.data.success && response.data.status === 'running') {
        // Update phases
        if (response.data.phases && response.data.phases.length > 0) {
          setPhaseProgress(response.data.phases);
        }
        
        // Update current phase
        if (response.data.currentPhase) {
          setCurrentPhase(response.data.currentPhase);
        }
      }
    } catch (err) {
      console.error('Error polling upgrade status:', err);
    }
  };

  useEffect(() => {
    loadServers();
  }, []);

  const loadServers = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/upgrade/servers`);
      
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

    await uploadToS3(type, file);
  };

  const uploadToS3 = async (type, file) => {
    try {
      setUploading(true);
      setUploadingFile(type);
      setUploadProgress(prev => ({ ...prev, [type]: 0 }));

      const urlResponse = await axios.post(`${API_URL}/api/upgrade/get-upload-url`, {
        fileName: file.name,
        fileType: file.type || 'application/zip',
        componentType: type
      });

      const { uploadUrl, s3Key } = urlResponse.data;

      await axios.put(uploadUrl, file, {
        headers: {
          'Content-Type': file.type || 'application/zip'
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(prev => ({ ...prev, [type]: percentCompleted }));
        }
      });

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

  const formatDuration = (durationStr) => {
    if (!durationStr) return '00:00:00';
    
    const seconds = parseFloat(durationStr.replace('s', ''));
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const loadUpgradeLogs = async (serverNameOverride) => {
    setLoadingLogs(true);
    try {
      const server = serverNameOverride || selectedServer;
      const response = await axios.get(`${API_URL}/api/upgrade/logs/${server}`);
      if (response.data.success) {
        setUpgradeLogs(response.data.logs || 'No logs available');
      } else {
        setUpgradeLogs('Failed to load logs');
      }
    } catch (err) {
      console.error('Error loading logs:', err);
      setUpgradeLogs('Error loading logs: ' + err.message);
    } finally {
      setLoadingLogs(false);
    }
  };

  const loadLogsHistory = async () => {
    setLoadingHistory(true);
    try {
      const response = await axios.get(`${API_URL}/api/upgrade/logs`);
      if (response.data.success) {
        setLogsHistory(response.data.logs || []);
      }
    } catch (err) {
      console.error('Error loading logs history:', err);
      setError('Failed to load logs history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const viewLogFile = async (filename) => {
    setLoadingLogs(true);
    setShowLogs(true);
    setSelectedLogFile(filename);
    try {
      const response = await axios.get(`${API_URL}/api/upgrade/logs/file/${filename}`);
      if (response.data.success) {
        setUpgradeLogs(response.data.logs || 'No content');
      } else {
        setUpgradeLogs('Failed to load log file');
      }
    } catch (err) {
      console.error('Error loading log file:', err);
      setUpgradeLogs('Error loading log file: ' + err.message);
    } finally {
      setLoadingLogs(false);
    }
  };

  const confirmDeleteLog = (filename) => {
    setLogToDelete(filename);
    setShowDeleteConfirm(true);
  };

  const deleteLogFile = async () => {
    if (!logToDelete) return;
    
    try {
      await axios.delete(`${API_URL}/api/upgrade/logs/${logToDelete}`);
      
      // Refresh logs history
      await loadLogsHistory();
      
      setShowDeleteConfirm(false);
      setLogToDelete(null);
    } catch (err) {
      console.error('Error deleting log:', err);
      alert('Failed to delete log file: ' + err.message);
    }
  };

  const handleConfirmUpgrade = async () => {
    setShowConfirmModal(false);
    setUpgrading(true);
    setError(null);
    setSuccess(false);
    setPhaseProgress([]);
    setAllPhases([]);
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
        timeout: 1800000,
      });

      if (response.data.success) {
        setSuccess(true);
        setPhaseProgress(response.data.result.phases || []);
        setCurrentPhase('Upgrade completed successfully!');
        
        const deployedFolders = [];
        const phases = response.data.result.phases || [];
        
        const deployPhase = phases.find(p => p.phase === 10);
        if (deployPhase && deployPhase.details) {
          const match = deployPhase.details.match(/Deployed \d+ folder\(s\): (.+)/);
          if (match) {
            const folderList = match[1].split(', ').map(f => f.trim()).filter(f => f.length > 0);
            deployedFolders.push(...folderList);
          }
        }
        
        setCompletionData({
          success: true,
          serverName: selectedServer,
          duration: response.data.result.duration,
          deployedFolders: deployedFolders,
          totalPhases: phases.length,
          successPhases: phases.filter(p => p.status === 'success').length
        });
        
        setShowCompletionModal(true);
        
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
      
      const phases = err.response?.data?.phases || phaseProgress;
      const errorMessage = err.response?.data?.error || err.message || 'Upgrade failed';
      
      setError(errorMessage);
      if (err.response?.data?.phases) {
        setPhaseProgress(err.response.data.phases);
      }
      
      const failedPhase = phases.find(p => p.status === 'error');
      
      let totalDuration = '00:00:00';
      if (phases.length > 0) {
        const totalSeconds = phases.reduce((sum, phase) => {
          const duration = parseFloat(phase.duration?.replace('s', '') || 0);
          return sum + duration;
        }, 0);
        totalDuration = formatDuration(`${totalSeconds}s`);
      }
      
      setCompletionData({
        success: false,
        serverName: selectedServer,
        duration: totalDuration,
        error: errorMessage,
        failedPhase: failedPhase,
        totalPhases: phases.length,
        successPhases: phases.filter(p => p.status === 'success').length
      });
      
      setShowCompletionModal(true);
    } finally {
      setUpgrading(false);
      // Stop polling
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
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
    const colorClasses = {
      blue: 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20',
      green: 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20',
      purple: 'border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20',
      pink: 'border-pink-300 dark:border-pink-700 bg-pink-50 dark:bg-pink-900/20'
    };

    const isUploading = uploading && uploadingFile === type;
    const progress = uploadProgress[type];
    const hasFile = s3Keys[type] !== null;

    return (
      <div className={`border-2 rounded-lg p-4 transition-all ${hasFile ? colorClasses[color] : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <FaFileArchive className={`text-${color}-500 text-xl`} />
            <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
          </div>
          {hasFile && (
            <button
              onClick={() => handleRemoveFile(type)}
              disabled={upgrading || uploading}
              className="text-red-500 hover:text-red-600 disabled:opacity-50"
            >
              <FaTimesCircle />
            </button>
          )}
        </div>

        {hasFile ? (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <FaCheckCircle className="text-green-500" />
              <span className="text-sm text-gray-700 dark:text-gray-300">{files[type]?.name || 'Uploaded'}</span>
            </div>
            {files[type] && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Size: {formatFileSize(files[type].size)}
              </p>
            )}
          </div>
        ) : (
          <div>
            {isUploading ? (
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
                  <FaSpinner className="animate-spin" />
                  <span className="text-sm">Uploading to S3... {progress}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className={`bg-${color}-500 h-2 rounded-full transition-all duration-300`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : (
              <label className="cursor-pointer">
                <div className="flex items-center justify-center space-x-2 py-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-orange-500 dark:hover:border-orange-500 transition-colors">
                  <FaUpload className="text-gray-400" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Click to upload ZIP</span>
                </div>
                <input
                  type="file"
                  accept=".zip"
                  onChange={(e) => handleFileSelect(type, e)}
                  disabled={upgrading || uploading}
                  className="hidden"
                />
              </label>
            )}
          </div>
        )}
      </div>
    );
  };

  const getPhaseStatusIcon = (status) => {
    switch (status) {
      case 'success':
        return <FaCheckCircle className="text-green-500 text-xl" />;
      case 'error':
        return <FaTimesCircle className="text-red-500 text-xl" />;
      case 'running':
        return <FaSpinner className="text-blue-500 text-xl animate-spin" />;
      default:
        return <FaClock className="text-gray-400 text-xl" />;
    }
  };

  const getPhaseStatusColor = (status) => {
    switch (status) {
      case 'success':
        return 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700';
      case 'error':
        return 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700';
      case 'running':
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 animate-pulse';
      default:
        return 'bg-gray-50 dark:bg-gray-900/20 border-gray-300 dark:border-gray-700';
    }
  };

  const getPhaseStatusText = (status) => {
    switch (status) {
      case 'success':
        return <span className="text-green-600 dark:text-green-400 font-semibold">Completed</span>;
      case 'error':
        return <span className="text-red-600 dark:text-red-400 font-semibold">Failed</span>;
      case 'running':
        return <span className="text-blue-600 dark:text-blue-400 font-semibold">In Progress</span>;
      default:
        return <span className="text-gray-500 dark:text-gray-400">Pending</span>;
    }
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <FileUploadBox type="backend" title="Backend" file={files.backend} color="blue" />
          <FileUploadBox type="oldUI" title="Old UI (FE1+FE2)" file={files.oldUI} color="green" />
          <FileUploadBox type="newUI" title="New UI (FE1)" file={files.newUI} color="purple" />
          <FileUploadBox type="apiManagement" title="API Management (FE1)" file={files.apiManagement} color="pink" />
        </div>

        <div className="flex justify-end space-x-3">
          <button
            onClick={() => {
              loadLogsHistory();
              setShowLogsHistory(true);
            }}
            className="px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center space-x-2 font-semibold"
          >
            <FaHistory />
            <span>Logs History</span>
          </button>
          
          <button
            onClick={() => {
              if (selectedServer) {
                loadUpgradeLogs();
                setShowLogs(true);
              } else {
                alert('Please select a server first');
              }
            }}
            disabled={!selectedServer}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 font-semibold"
          >
            <FaFileAlt />
            <span>Show Logs</span>
          </button>

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

      {/* Live Progress Display - Shows all phases from the start */}
      {(upgrading || (!upgrading && phaseProgress.length > 0)) && (
        <div ref={progressRef} className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 mb-6 transition-colors duration-200">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center space-x-2">
            <FaClock className="text-orange-500" />
            <span>{upgrading ? 'Upgrade in Progress' : 'Upgrade Summary'}</span>
          </h3>

          <div className="space-y-3">
            {allPhases.map((phase, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border-2 transition-all duration-300 ${getPhaseStatusColor(phase.status)}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1">
                    {getPhaseStatusIcon(phase.status)}
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-gray-900 dark:text-white">
                          Phase {phase.phase}: {phase.name}
                        </p>
                        {getPhaseStatusText(phase.status)}
                      </div>
                      {phase.details && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{phase.details}</p>
                      )}
                    </div>
                  </div>
                  {phase.duration && (
                    <span className="text-sm text-gray-500 dark:text-gray-400 ml-4">{formatDuration(phase.duration)}</span>
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
              <p className="text-green-700 dark:text-green-400 mt-1">All services have been upgraded and restarted.</p>
              <p className="text-green-600 dark:text-green-500 mt-1 text-sm">✓ S3 upgrade files have been automatically cleaned up</p>
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

      {/* Completion Modal */}
      {showCompletionModal && completionData && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden animate-slideUp">
            {/* Header */}
            <div className={`p-6 ${completionData.success ? 'bg-gradient-to-r from-green-500 to-green-600' : 'bg-gradient-to-r from-red-500 to-red-600'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  {completionData.success ? (
                    <div className="bg-white rounded-full p-3 animate-bounce">
                      <FaCheckCircle className="text-green-500 text-4xl" />
                    </div>
                  ) : (
                    <div className="bg-white rounded-full p-3 animate-pulse">
                      <FaTimesCircle className="text-red-500 text-4xl" />
                    </div>
                  )}
                  <div>
                    <h2 className="text-2xl font-bold text-white">
                      {completionData.success ? 'Upgrade Completed!' : 'Upgrade Failed'}
                    </h2>
                    <p className="text-white text-opacity-90 mt-1">
                      Server: <span className="font-semibold">{completionData.serverName}</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCompletionModal(false)}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center space-x-2 mb-2">
                    <FaClock className="text-blue-500" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Total Time</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatDuration(completionData.duration)}</p>
                </div>
                
                <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
                  <div className="flex items-center space-x-2 mb-2">
                    <FaCheckCircle className="text-green-500" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Completed</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {completionData.successPhases}/{completionData.totalPhases}
                  </p>
                </div>
                
                <div className={`${completionData.success ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'} rounded-xl p-4 border`}>
                  <div className="flex items-center space-x-2 mb-2">
                    <FaServer className={completionData.success ? 'text-purple-500' : 'text-red-500'} />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Status</span>
                  </div>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {completionData.success ? 'Success' : 'Error'}
                  </p>
                </div>
              </div>

              {/* Success: Deployed Folders */}
              {completionData.success && completionData.deployedFolders && completionData.deployedFolders.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center space-x-2">
                    <FaFileArchive className="text-orange-500" />
                    <span>Updated Folders ({completionData.deployedFolders.length})</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {completionData.deployedFolders.map((folder, index) => (
                      <div
                        key={index}
                        className="bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-gray-700 dark:text-gray-300 flex items-center space-x-2"
                      >
                        <FaCheckCircle className="text-green-500 text-xs flex-shrink-0" />
                        <span className="truncate">{folder}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error Details */}
              {!completionData.success && (
                <div className="mb-6">
                  <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl p-4">
                    <h3 className="text-lg font-semibold text-red-800 dark:text-red-300 mb-2 flex items-center space-x-2">
                      <FaExclamationTriangle />
                      <span>Error Details</span>
                    </h3>
                    <p className="text-red-700 dark:text-red-400 font-medium mb-2">{completionData.error}</p>
                    {completionData.failedPhase && (
                      <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-800">
                        <p className="text-sm text-red-600 dark:text-red-400">
                          <strong>Failed at Phase {completionData.failedPhase.phase}:</strong> {completionData.failedPhase.name}
                        </p>
                        {completionData.failedPhase.error && (
                          <p className="text-xs text-red-500 dark:text-red-500 mt-1 font-mono bg-red-100 dark:bg-red-900/30 p-2 rounded">
                            {completionData.failedPhase.error}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 flex justify-between items-center">
              <button
                onClick={() => {
                  setShowLogs(true);
                  loadUpgradeLogs();
                }}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors flex items-center space-x-2"
              >
                <FaFileAlt />
                <span>Show Logs</span>
              </button>
              
              <button
                onClick={() => setShowCompletionModal(false)}
                className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
                  completionData.success
                    ? 'bg-green-500 hover:bg-green-600 text-white'
                    : 'bg-gray-600 hover:bg-gray-700 text-white'
                }`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {showLogs && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="bg-white rounded-full p-3">
                    <FaFileAlt className="text-blue-500 text-3xl" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Upgrade Logs</h2>
                    <p className="text-white text-opacity-90 mt-1">
                      {selectedLogFile || `Server: ${selectedServer}`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowLogs(false);
                    setSelectedLogFile(null);
                  }}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              {loadingLogs ? (
                <div className="flex items-center justify-center py-12">
                  <FaSpinner className="animate-spin text-blue-500 text-3xl mr-3" />
                  <span className="text-gray-600 dark:text-gray-400">Loading logs...</span>
                </div>
              ) : (
                <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-green-400 overflow-x-auto">
                  <pre className="whitespace-pre-wrap">{upgradeLogs}</pre>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 flex justify-end">
              <button
                onClick={() => {
                  setShowLogs(false);
                  setSelectedLogFile(null);
                }}
                className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logs History Modal */}
      {showLogsHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-500 to-purple-600 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="bg-white rounded-full p-3">
                    <FaHistory className="text-purple-500 text-3xl" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Logs History</h2>
                    <p className="text-white text-opacity-90 mt-1">All upgrade logs</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowLogsHistory(false)}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              {loadingHistory ? (
                <div className="flex items-center justify-center py-12">
                  <FaSpinner className="animate-spin text-purple-500 text-3xl mr-3" />
                  <span className="text-gray-600 dark:text-gray-400">Loading logs history...</span>
                </div>
              ) : logsHistory.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  No logs found
                </div>
              ) : (
                <div className="space-y-2">
                  {logsHistory.map((log, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <FaServer className="text-purple-500" />
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-white">
                              {log.serverName}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {new Date(log.timestamp).toLocaleString()} · {formatFileSize(log.size)}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => viewLogFile(log.filename)}
                          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors flex items-center space-x-2"
                        >
                          <FaFileAlt />
                          <span>View</span>
                        </button>
                        <button
                          onClick={() => confirmDeleteLog(log.filename)}
                          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center space-x-2"
                        >
                          <FaTrash />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 flex justify-end">
              <button
                onClick={() => setShowLogsHistory(false)}
                className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center space-x-3 mb-4">
              <FaExclamationTriangle className="text-red-500 text-3xl" />
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Delete Log?</h3>
            </div>
            
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              Are you sure you want to delete this log file? This action cannot be undone.
            </p>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setLogToDelete(null);
                }}
                className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={deleteLogFile}
                className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutomatedUpgrade;