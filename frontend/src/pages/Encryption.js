// Full path: frontend/src/pages/Encryption.js

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaLock, FaUnlock, FaKey, FaCopy, FaCheckCircle, FaExclamationTriangle, FaSpinner, FaTimes, FaHome, FaServer } from 'react-icons/fa';
import axios from 'axios';

// Use empty string for production (relies on nginx proxy), falls back to localhost for dev
const API_URL = process.env.REACT_APP_API_URL !== undefined
  ? (process.env.REACT_APP_API_URL || '')  // Empty string for relative URLs
  : 'http://localhost:5000';  // Development fallback

const Encryption = () => {
  const navigate = useNavigate();
  const [operation, setOperation] = useState('encrypt'); // 'encrypt' or 'decrypt'
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState({ checked: false, available: false });
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  // Test connection on mount
  useEffect(() => {
    testConnection();
  }, []);

  const testConnection = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/encryption/test-connection`);
      setConnectionStatus({
        checked: true,
        available: response.data.available,
        cryptoCliExists: response.data.cryptoCliExists,
        error: response.data.error
      });
    } catch (error) {
      setConnectionStatus({
        checked: true,
        available: false,
        error: error.response?.data?.error || error.message
      });
    }
  };

  const handleProcess = async () => {
    if (!inputText.trim()) {
      alert('Please enter text to process');
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/api/encryption/process`, {
        operation: operation,
        text: inputText
      });

      if (response.data.success) {
        setModalData({
          success: true,
          operation: operation,
          result: response.data.data.result,
          server: response.data.data.server
        });
        setShowModal(true);
      } else {
        setModalData({
          success: false,
          error: response.data.error
        });
        setShowModal(true);
      }
    } catch (error) {
      console.error('Encryption error:', error);
      setModalData({
        success: false,
        error: error.response?.data?.error || error.message
      });
      setShowModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToClipboard = () => {
    if (modalData?.result) {
      // Try modern clipboard API first (works on HTTPS and localhost)
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(modalData.result)
          .then(() => {
            setCopiedToClipboard(true);
            setTimeout(() => setCopiedToClipboard(false), 2000);
          })
          .catch(err => {
            console.error('Clipboard API failed:', err);
            // Fall back to old method
            fallbackCopyToClipboard(modalData.result);
          });
      } else {
        // Use fallback method for HTTP
        fallbackCopyToClipboard(modalData.result);
      }
    }
  };

  const fallbackCopyToClipboard = (text) => {
    // Create a temporary textarea element
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      // Use the older execCommand method (works over HTTP)
      const successful = document.execCommand('copy');
      if (successful) {
        setCopiedToClipboard(true);
        setTimeout(() => setCopiedToClipboard(false), 2000);
      }
    } catch (err) {
      console.error('Fallback copy failed:', err);
      alert('Copy failed. Please manually select and copy the text.');
    } finally {
      document.body.removeChild(textArea);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setCopiedToClipboard(false);
    setInputText(''); // Clear the input text for next operation
  };

  const handleBackToDashboard = () => {
    navigate('/');
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6 transition-colors duration-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg">
              <FaKey className="text-white text-2xl" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Encryption Tool
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                Encrypt or decrypt text using CryptoCLI on TEST3 Server
              </p>
            </div>
          </div>
          
          <button
            onClick={handleBackToDashboard}
            className="flex items-center space-x-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 
                     hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 
                     rounded-lg transition-all duration-200"
          >
            <FaHome />
            <span>Dashboard</span>
          </button>
        </div>

        {/* Connection Status */}
        <div className="mt-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
          <div className="flex items-center space-x-2">
            <FaServer className={`${connectionStatus.available ? 'text-green-500' : 'text-red-500'}`} />
            <span className="font-medium text-gray-700 dark:text-gray-300">
              Server Status:
            </span>
            {connectionStatus.checked ? (
              <span className={`${connectionStatus.available ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} font-semibold`}>
                {connectionStatus.available ? 
                  (connectionStatus.cryptoCliExists ? '✓ Connected - CryptoCLI Ready' : '✓ Connected - CryptoCLI Not Found') 
                  : `✗ Disconnected${connectionStatus.error ? ` - ${connectionStatus.error}` : ''}`
                }
              </span>
            ) : (
              <span className="text-gray-500">Checking...</span>
            )}
            <button
              onClick={testConnection}
              className="ml-auto text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 transition-colors duration-200">
        {/* Operation Toggle */}
        <div className="mb-8">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Select Operation
          </label>
          <div className="relative inline-flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setOperation('encrypt')}
              className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all duration-300 ${
                operation === 'encrypt'
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg transform scale-105'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <FaLock className="text-lg" />
              <span>Encrypt</span>
            </button>
            <button
              onClick={() => setOperation('decrypt')}
              className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all duration-300 ${
                operation === 'decrypt'
                  ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg transform scale-105'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <FaUnlock className="text-lg" />
              <span>Decrypt</span>
            </button>
          </div>
        </div>

        {/* Input Text Area */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            {operation === 'encrypt' ? 'Text to Encrypt' : 'Text to Decrypt'}
          </label>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={operation === 'encrypt' ? 'Enter plain text here...' : 'Enter encrypted text here...'}
            rows="8"
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg 
                     focus:ring-2 focus:ring-purple-500 focus:border-transparent
                     bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                     placeholder-gray-400 dark:placeholder-gray-500
                     transition-colors duration-200 resize-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {inputText.length} characters
            </span>
            {inputText && (
              <button
                onClick={() => setInputText('')}
                className="text-sm text-red-600 dark:text-red-400 hover:underline"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Action Button */}
        <div className="flex justify-center">
          <button
            onClick={handleProcess}
            disabled={loading || !connectionStatus.available || !inputText.trim()}
            className={`flex items-center space-x-3 px-8 py-4 rounded-lg font-semibold text-lg
                     transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5
                     ${loading || !connectionStatus.available || !inputText.trim()
                       ? 'bg-gray-400 dark:bg-gray-600 text-gray-200 cursor-not-allowed'
                       : operation === 'encrypt'
                         ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white'
                         : 'bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white'
                     }`}
          >
            {loading ? (
              <>
                <FaSpinner className="animate-spin text-xl" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                {operation === 'encrypt' ? <FaLock className="text-xl" /> : <FaUnlock className="text-xl" />}
                <span>{operation === 'encrypt' ? 'Encrypt Text' : 'Decrypt Text'}</span>
              </>
            )}
          </button>
        </div>

        {/* Info Box */}
        <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-start space-x-3">
            <FaExclamationTriangle className="text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800 dark:text-blue-300">
              <p className="font-semibold mb-1">Important Information:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-700 dark:text-blue-400">
                <li>This tool connects to TEST3-Server to run CryptoCLI.exe</li>
                <li>Encryption/decryption is performed server-side for security</li>
                <li>Results are displayed once processing is complete</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Results Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full transform transition-all animate-slide-up">
            {/* Modal Header */}
            <div className={`p-6 rounded-t-2xl ${
              modalData.success
                ? 'bg-gradient-to-r from-green-500 to-emerald-600'
                : 'bg-gradient-to-r from-red-500 to-rose-600'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {modalData.success ? (
                    <FaCheckCircle className="text-white text-3xl" />
                  ) : (
                    <FaExclamationTriangle className="text-white text-3xl" />
                  )}
                  <div>
                    <h3 className="text-2xl font-bold text-white">
                      {modalData.success ? 'Success!' : 'Error'}
                    </h3>
                    <p className="text-white text-opacity-90 text-sm">
                      {modalData.success 
                        ? `Text ${modalData.operation}ed successfully`
                        : 'Operation failed'
                      }
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeModal}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
                >
                  <FaTimes className="text-xl" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {modalData.success ? (
                <>
                  {/* Server Info */}
                  <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                      <FaServer />
                      <span>Processed on: <span className="font-semibold text-gray-900 dark:text-white">{modalData.server}</span></span>
                    </div>
                  </div>

                  {/* Result */}
                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Result:
                    </label>
                    <div className="relative">
                      <textarea
                        value={modalData.result}
                        readOnly
                        rows="8"
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg
                                 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white
                                 font-mono text-sm resize-none"
                      />
                      <button
                        onClick={handleCopyToClipboard}
                        className={`absolute top-3 right-3 flex items-center space-x-2 px-3 py-2 rounded-lg
                                 transition-all duration-200 ${
                          copiedToClipboard
                            ? 'bg-green-500 text-white'
                            : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500'
                        }`}
                      >
                        {copiedToClipboard ? (
                          <>
                            <FaCheckCircle />
                            <span className="text-sm font-medium">Copied!</span>
                          </>
                        ) : (
                          <>
                            <FaCopy />
                            <span className="text-sm font-medium">Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mb-6">
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-red-800 dark:text-red-300">
                      <span className="font-semibold">Error:</span> {modalData.error}
                    </p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={closeModal}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 
                           hover:from-purple-600 hover:to-indigo-700 text-white font-semibold rounded-lg
                           transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  Process Another
                </button>
                <button
                  onClick={handleBackToDashboard}
                  className="px-6 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600
                           text-gray-700 dark:text-gray-200 font-semibold rounded-lg
                           transition-all duration-200"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-up {
          from { 
            opacity: 0;
            transform: translateY(20px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default Encryption;
