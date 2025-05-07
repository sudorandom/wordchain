// src/components/ProgressBar.tsx
import React from 'react';

interface ProgressBarProps {
  currentScore: number;
  maxScore: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ currentScore, maxScore }) => {
    const percentage = maxScore > 0 ? Math.min(100, (currentScore / maxScore) * 100) : 0;
    const greenWidth = `${percentage}%`;
    const greyWidth = `${100 - percentage}%`;

    return (
        <div className="flex-grow bg-gray-300 dark:bg-gray-600 rounded-full h-4 overflow-hidden flex mr-2" title={`Reached depth ${currentScore} of ${maxScore}`}>
            <div className="bg-blue-500 dark:bg-blue-400 h-full transition-all duration-500 ease-out rounded-l-full" style={{ width: greenWidth }}></div>
            <div className="bg-gray-400 dark:bg-gray-500 h-full rounded-r-full" style={{ width: greyWidth }}></div>
        </div>
    );
};

export default ProgressBar;
