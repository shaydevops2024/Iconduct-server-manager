// Full path: frontend/src/components/Layout.js

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FaServer, FaCog, FaFileCode, FaSun, FaMoon } from 'react-icons/fa';
import { useTheme } from '../context/ThemeContext';

const Layout = ({ children }) => {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  const navItems = [
    { path: '/', label: 'Dashboard', icon: FaServer },
    { path: '/config-merger', label: 'Config Merger', icon: FaCog },
    { path: '/dll-manager', label: 'DLL Manager', icon: FaFileCode },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-md border-b border-gray-200 dark:border-gray-700 transition-colors duration-200">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FaServer className="text-orange-500 text-3xl" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                IConduct <span className="text-orange-500">Server Manager</span>
              </h1>
            </div>
            
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 
                       transition-all duration-200"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? (
                <FaMoon className="text-gray-700 text-xl" />
              ) : (
                <FaSun className="text-yellow-400 text-xl" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm transition-colors duration-200">
        <div className="container mx-auto px-4">
          <div className="flex space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-2 px-6 py-4 font-medium transition-colors
                    ${isActive 
                      ? 'text-orange-500 border-b-2 border-orange-500 bg-orange-50 dark:bg-orange-900/20' 
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                >
                  <Icon className="text-lg" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-auto shadow-inner transition-colors duration-200">
        <div className="container mx-auto px-4 py-4 text-center text-gray-600 dark:text-gray-400 text-sm">
          <p>IConduct Server Management © {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
