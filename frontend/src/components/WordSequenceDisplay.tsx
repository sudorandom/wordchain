import React from 'react';
import { HistoryEntry } from '../utils/gameHelpers';

interface WordSequenceDisplayProps {
    history: HistoryEntry[];
    showEndGamePanelOverride: boolean;
}

export const WordSequenceDisplay: React.FC<WordSequenceDisplayProps> = ({ history, showEndGamePanelOverride }) => {
    const displayHistory = (!showEndGamePanelOverride && history) ? history : [];
    if (displayHistory.length === 0) return <div className="min-h-[2rem] mt-4"></div>;
    return (
        <div className="flex flex-wrap items-center justify-center mt-4 gap-x-2 gap-y-1 text-lg px-4 pb-2">
            {displayHistory.map((histEntry, index) => (
                <div key={`hist-${index}`} className="inline-flex items-baseline">
                    <a href={`https://dictionary.cambridge.org/dictionary/english/${histEntry.wordsFormedByMove?.[0]}`} target="_blank">
                    <span className={`px-2 py-1 rounded font-medium text-sm sm:text-base
                        ${histEntry.isDeviated ? 'bg-orange-100 dark:bg-orange-800 text-orange-800 dark:text-orange-200'
                            : 'bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200'}`}>
                        {histEntry.wordsFormedByMove?.[0]?.toUpperCase() || '???'}
                        {histEntry.wordsFormedByMove && histEntry.wordsFormedByMove.length > 1 ? '...' : ''}
                    </span>
                    </a>
                    {index < displayHistory.length - 1 &&
                        <span className="text-gray-500 dark:text-gray-400 font-bold mx-1">→</span>}
                </div>
            ))}
        </div>
    );
};
