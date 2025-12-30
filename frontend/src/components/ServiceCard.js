// Full path: frontend/src/components/ServiceCard.js

import React from 'react';
import { FaCircle, FaMemory, FaMicrochip } from 'react-icons/fa';

const ServiceCard = ({ service }) => {
  const isRunning = service.Status === 'Running';

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg p-4 border-2 transition-all hover:shadow-lg ${
      isRunning 
        ? 'border-green-400 dark:border-green-500 hover:border-green-500 dark:hover:border-green-400' 
        : 'border-red-400 dark:border-red-500 hover:border-red-500 dark:hover:border-red-400'
    }`}>
      {/* Status Indicator */}
      <div className="flex items-center justify-between mb-3">
        <FaCircle 
          className={`text-sm ${isRunning ? 'text-green-500' : 'text-red-500'} animate-pulse`} 
        />
        <span className={`text-xs font-bold px-2 py-1 rounded ${
          isRunning 
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
        }`}>
          {service.Status}
        </span>
      </div>

      {/* Service Name */}
      <h5 className="text-gray-900 dark:text-white font-semibold text-sm mb-1 truncate" title={service.DisplayName}>
        {service.DisplayName || service.Name}
      </h5>
      
      {/* Technical Name (if different) */}
      {service.DisplayName && service.DisplayName !== service.Name && (
        <p className="text-gray-600 dark:text-gray-400 text-xs mb-3 truncate" title={service.Name}>
          {service.Name}
        </p>
      )}

      {/* Metrics */}
      <div className="flex items-center justify-between text-xs mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-1" title="RAM Usage">
          <FaMemory className="text-orange-500" />
          <span className="text-gray-700 dark:text-gray-300">{service.RAM} MB</span>
        </div>
        <div className="flex items-center space-x-1" title="CPU Usage">
          <FaMicrochip className="text-orange-500" />
          <span className="text-gray-700 dark:text-gray-300">{service.CPU}</span>
        </div>
      </div>
    </div>
  );
};

export default ServiceCard;
