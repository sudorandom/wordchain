// src/components/LinkedWordTag.tsx
import React from 'react'; // Added React import

interface LinkedWordTagProps {
    word: string;
    className?: string;
    style?: React.CSSProperties;
    displayTextSuffix?: string; // e.g., "..." or " (Optimal)"
}

export const LinkedWordTag: React.FC<LinkedWordTagProps> = ({
    word,
    className,
    style,
    displayTextSuffix = '',
}) => {
    if (!word || word === '???') { 
        return (
            <span
                className={`px-1.5 py-0.5 rounded font-medium text-xs ${className || 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}
                style={style}
            >
                {word || '???'}
                {displayTextSuffix}
            </span>
        );
    }
    return (
        <a
            href={`https://dictionary.cambridge.org/dictionary/english/${word.toLowerCase()}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`px-1.5 py-0.5 rounded font-medium text-xs ${className || ''} hover:underline focus:outline-none focus:ring-1 focus:ring-blue-500`}
            style={style}
            title={`Look up "${word}" in Cambridge Dictionary`}
        >
            {word.toUpperCase()}
            {displayTextSuffix}
        </a>
    );
};

export default LinkedWordTag; 
