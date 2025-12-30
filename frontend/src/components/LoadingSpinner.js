import React from 'react';
import { FaSpinner } from 'react-icons/fa';

const LoadingSpinner = ({ message = 'Loading...' }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <FaSpinner className="text-soft-orange text-5xl animate-spin" />
      <p className="text-soft-grey text-lg">{message}</p>
    </div>
  );
};

export default LoadingSpinner;