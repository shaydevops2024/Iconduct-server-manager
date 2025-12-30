import React, { useState } from 'react';
import { configAPI } from '../services/api';
import { FaFileUpload, FaDownload, FaExclamationTriangle } from 'react-icons/fa';
import LoadingSpinner from '../components/LoadingSpinner';

const ConfigMerger = () => {
  const [format, setFormat] = useState('json');
  const [files, setFiles] = useState([]);
  const [mergedConfig, setMergedConfig] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resolutions, setResolutions] = useState({});

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
    setError(null);
  };

  const handleMerge = async () => {
    if (files.length === 0) {
      setError('Please select files to merge');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = format === 'json' 
        ? await configAPI.mergeJSON(files)
        : await configAPI.mergeXML(files);

      setMergedConfig(response.data.data.mergedConfig);
      setConflicts(response.data.data.conflicts || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to merge files');
      console.error('Error merging files:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConflictResolution = (conflictIndex, value) => {
    setResolutions(prev => ({
      ...prev,
      [conflictIndex]: value
    }));
  };

  const handleResolveAndExport = async () => {
    setLoading(true);
    try {
      const resolutionArray = Object.entries(resolutions).map(([index, value]) => ({
        key: conflicts[index].key,
        chosenValue: value
      }));

      const response = await configAPI.resolve(mergedConfig, resolutionArray, format);
      const finalConfig = response.data.data.config;

      // Export the file
      const exportResponse = await configAPI.export(finalConfig, format);
      const blob = new Blob([exportResponse.data], { 
        type: format === 'xml' ? 'application/xml' : 'application/json' 
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `merged-config-${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Reset
      setFiles([]);
      setMergedConfig(null);
      setConflicts([]);
      setResolutions({});
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to export config');
      console.error('Error exporting:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!mergedConfig) return;

    setLoading(true);
    try {
      const response = await configAPI.export(mergedConfig, format);
      const blob = new Blob([response.data], { 
        type: format === 'xml' ? 'application/xml' : 'application/json' 
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `merged-config-${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to export config');
      console.error('Error exporting:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Processing files..." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Config File Merger</h2>
        <p className="text-soft-grey">Merge multiple configuration files into one unified config</p>
      </div>

      {/* Format Selection */}
      <div className="bg-card-bg rounded-lg p-6 border border-soft-grey/20">
        <h3 className="text-xl font-semibold text-white mb-4">Select Format</h3>
        <div className="flex space-x-4">
          <button
            onClick={() => setFormat('json')}
            className={`px-6 py-3 rounded-lg font-medium transition-all
              ${format === 'json' 
                ? 'bg-soft-orange text-white' 
                : 'bg-dark-bg text-soft-grey hover:text-white'}`}
          >
            JSON Files
          </button>
          <button
            onClick={() => setFormat('xml')}
            className={`px-6 py-3 rounded-lg font-medium transition-all
              ${format === 'xml' 
                ? 'bg-soft-orange text-white' 
                : 'bg-dark-bg text-soft-grey hover:text-white'}`}
          >
            XML Files
          </button>
        </div>
      </div>

      {/* File Upload */}
      <div className="bg-card-bg rounded-lg p-6 border border-soft-grey/20">
        <h3 className="text-xl font-semibold text-white mb-4">Upload Files</h3>
        
        <div className="border-2 border-dashed border-soft-grey/40 rounded-lg p-8 text-center hover:border-soft-orange transition-colors">
          <input
            type="file"
            multiple
            accept={format === 'json' ? '.json' : '.xml'}
            onChange={handleFileChange}
            className="hidden"
            id="file-upload"
          />
          <label htmlFor="file-upload" className="cursor-pointer">
            <FaFileUpload className="text-soft-orange text-5xl mx-auto mb-4" />
            <p className="text-white mb-2">Click to upload {format.toUpperCase()} files</p>
            <p className="text-soft-grey text-sm">or drag and drop</p>
          </label>
        </div>

        {files.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-white font-medium">Selected files ({files.length}):</p>
            <ul className="space-y-1">
              {files.map((file, index) => (
                <li key={index} className="text-soft-grey text-sm">
                  • {file.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          onClick={handleMerge}
          disabled={files.length === 0}
          className="mt-4 bg-soft-orange text-white px-6 py-3 rounded-lg font-medium
                   hover:bg-opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Merge Files
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
          <p className="text-red-500">{error}</p>
        </div>
      )}

      {/* Conflicts */}
      {conflicts.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500 rounded-lg p-6">
          <div className="flex items-center space-x-3 mb-4">
            <FaExclamationTriangle className="text-yellow-500 text-2xl" />
            <h3 className="text-xl font-semibold text-white">Conflicts Detected ({conflicts.length})</h3>
          </div>

          <div className="space-y-4">
            {conflicts.map((conflict, index) => (
              <div key={index} className="bg-dark-bg rounded-lg p-4">
                <p className="text-white font-medium mb-2">Key: {conflict.key}</p>
                <p className="text-soft-grey text-sm mb-3">From: {conflict.file}</p>
                
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => handleConflictResolution(index, conflict.existingValue)}
                    className={`p-3 rounded-lg text-left transition-all
                      ${resolutions[index] === conflict.existingValue 
                        ? 'bg-soft-orange text-white' 
                        : 'bg-card-bg text-soft-grey hover:bg-soft-orange/20'}`}
                  >
                    <p className="text-xs mb-1">Keep Existing:</p>
                    <p className="font-mono text-sm break-all">
                      {JSON.stringify(conflict.existingValue)}
                    </p>
                  </button>

                  <button
                    onClick={() => handleConflictResolution(index, conflict.newValue)}
                    className={`p-3 rounded-lg text-left transition-all
                      ${resolutions[index] === conflict.newValue 
                        ? 'bg-soft-orange text-white' 
                        : 'bg-card-bg text-soft-grey hover:bg-soft-orange/20'}`}
                  >
                    <p className="text-xs mb-1">Use New:</p>
                    <p className="font-mono text-sm break-all">
                      {JSON.stringify(conflict.newValue)}
                    </p>
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleResolveAndExport}
            disabled={Object.keys(resolutions).length !== conflicts.length}
            className="mt-4 bg-soft-orange text-white px-6 py-3 rounded-lg font-medium
                     hover:bg-opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Resolve & Export
          </button>
        </div>
      )}

      {/* Merged Config Preview */}
      {mergedConfig && conflicts.length === 0 && (
        <div className="bg-card-bg rounded-lg p-6 border border-soft-grey/20">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-white">Merged Configuration</h3>
            <button
              onClick={handleExport}
              className="flex items-center space-x-2 bg-soft-orange text-white px-4 py-2 rounded-lg
                       hover:bg-opacity-90 transition-all"
            >
              <FaDownload />
              <span>Export</span>
            </button>
          </div>

          <pre className="bg-dark-bg rounded-lg p-4 overflow-auto max-h-96 text-soft-grey text-sm font-mono">
            {JSON.stringify(mergedConfig, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default ConfigMerger;