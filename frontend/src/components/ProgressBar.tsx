// src/components/ProgressBar.tsx
import React from 'react';

interface ProgressBarProps {
    currentScore: number; // Represents the current depth or progress
    maxScore: number;   // Represents the maximum depth or total
}

const ProgressBar: React.FC<ProgressBarProps> = ({ currentScore, maxScore }) => {
    // Calculate the percentage for the progress bar width
    // Ensures percentage is between 0 and 100.
    const percentage = maxScore > 0 ? Math.min(100, Math.max(0, (currentScore / maxScore) * 100)) : 0;
    const fillWidth = `${percentage}%`;

    return (
        // Main container for the progress bar.
        // It's relatively positioned to serve as a context for absolutely positioned children.
        // Acts as the "track" of the progress bar with a darker, inset look.
        // flex, items-center, justify-center are used to center the text overlay.
        <div
            className="relative flex-grow bg-slate-700 dark:bg-slate-800 rounded-md h-8 overflow-hidden flex items-center justify-center mr-2 shadow-inner border border-slate-500 dark:border-slate-600"
            title={`Progress: ${currentScore} of ${maxScore}`}
        >
            {/* Filled part of the progress bar.
                Uses a vibrant blue gradient.
                It's absolutely positioned to overlay the track.
                Its width is dynamic based on the current score.
                A subtle shine/highlight effect is added.
            */}
            <div
                className="absolute left-0 top-0 h-full transition-all duration-300 ease-out rounded-sm bg-gradient-to-b from-sky-400 to-blue-600 dark:from-sky-500 dark:to-blue-700 shadow-md"
                style={{ width: fillWidth }}
            >
                {/* Optional: subtle shine effect for the filled part */}
                <div className="absolute top-0 left-0 w-full h-1/2 bg-white opacity-10 rounded-t-sm"></div>
            </div>

            {/* Text overlay, centered on the progress bar.
                It's relatively positioned within the flex centering context of the parent.
                z-10 ensures it's on top of the filled part.
                Uses a monospaced font for a "digital" look.
                Text shadow is added for better legibility over varying backgrounds.
            */}
            <div
                className="relative z-10 text-sm font-mono font-bold text-white px-2"
                style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.7)' }} // Text shadow for legibility
            >
                {currentScore}/{maxScore}
            </div>
        </div>
    );
};

export default ProgressBar;
