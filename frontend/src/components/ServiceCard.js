// Full path: frontend/src/components/ServiceCard.js

import React from 'react';
import { FaCircle, FaMicrochip, FaMemory } from 'react-icons/fa';

const ServiceCard = ({ service }) => {
  const isRunning = service.Status === 'Running';

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg p-4 border-2 transition-all hover:shadow-md ${
      isRunning 
        ? 'border-green-500 dark:border-green-600' 
        : 'border-red-500 dark:border-red-600'
    }`}>
      {/* Service Name & Status */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-gray-900 dark:text-white font-semibold text-sm truncate mb-1" title={service.DisplayName}>
            {service.DisplayName}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 text-xs truncate" title={service.Name}>
            {service.Name}
          </p>
        </div>
      </div>

      {/* Status Badge */}
      <div className="mb-3">
        <span className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-medium ${
          isRunning
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
        }`}>
          <FaCircle className="text-[8px]" />
          <span>{service.Status}</span>
        </span>
      </div>

      {/* Metrics - CPU and RAM with labels */}
      <div className="space-y-2 pt-3 border-t border-gray-200 dark:border-gray-700">
        {/* CPU */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FaMicrochip className="text-blue-500 text-sm" />
            <span className="text-gray-600 dark:text-gray-400 text-xs font-medium">CPU</span>
          </div>
          <span className="text-gray-900 dark:text-white text-sm font-semibold">
            {service.CPU ? `${service.CPU}%` : '0%'}
          </span>
        </div>

        {/* RAM/Memory */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FaMemory className="text-purple-500 text-sm" />
            <span className="text-gray-600 dark:text-gray-400 text-xs font-medium">Memory</span>
          </div>
          <span className="text-gray-900 dark:text-white text-sm font-semibold">
            {service.RAM ? `${service.RAM} MB` : '0 MB'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ServiceCard;
