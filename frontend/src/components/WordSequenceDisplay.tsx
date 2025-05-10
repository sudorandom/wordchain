// src/components/WordSequenceDisplay.tsx
import React from 'react';
// Assuming LinkedWordTag.tsx is in the same directory or path is correctly adjusted.
import { LinkedWordTag } from "./LinkedWordTag"; 
import { HistoryEntry } from '../utils/gameHelpers'; // Ensure this path is correct

interface WordSequenceDisplayProps {
    history: HistoryEntry[];
    showEndGamePanelOverride: boolean;
}

export const WordSequenceDisplay: React.FC<WordSequenceDisplayProps> = ({ history, showEndGamePanelOverride }) => {
    // Determine which history to display. If panel override is active, don't show this sequence.
    const displayHistory = (!showEndGamePanelOverride && history) ? history : [];

    // If there's no history to display, render an empty div to maintain layout spacing.
    if (displayHistory.length === 0) {
        return <div className="min-h-[2rem] mt-4 mb-2"></div>; // Added mb-2 for consistency if it had content
    }

    return (
        <div className="flex flex-wrap items-center justify-center mt-4 gap-x-1 gap-y-2 text-lg px-4 pb-2" role="list" aria-label="Word sequence">
            {displayHistory.map((histEntry, entryIndex) => {
                // Determine the styling class based on whether the move was deviated.
                // This style will apply to all words formed by this move.
                const wordGroupStyleClass = `px-2 py-1 rounded font-medium text-sm sm:text-base ${
                    histEntry.isDeviated 
                        ? 'bg-orange-100 dark:bg-orange-800 text-orange-800 dark:text-orange-200' 
                        : 'bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200'
                }`;

                const wordsInMove = histEntry.wordsFormedByMove || [];

                return (
                    <div key={`hist-group-${entryIndex}`} className="inline-flex items-baseline" role="listitem">
                        {/* Render each word from the current history entry */}
                        {wordsInMove.map((word, wordIndex) => (
                            <React.Fragment key={`word-${entryIndex}-${wordIndex}`}>
                                <LinkedWordTag
                                    word={word || '???'} // Pass the original word, or placeholder
                                    className={wordGroupStyleClass}
                                    // displayTextSuffix is not needed here as we display all words
                                />
                                {/* Add a space if it's not the last word within this specific move's group */}
                                {wordIndex < wordsInMove.length - 1 && (
                                    <span className="mx-1"> </span> // Space between words of the same move
                                )}
                            </React.Fragment>
                        ))}
                        
                        {/* Display an arrow if this is not the last history entry (move) in the sequence. */}
                        {entryIndex < displayHistory.length - 1 &&
                            <span className="text-gray-500 dark:text-gray-400 font-bold mx-2" aria-hidden="true">→</span>}
                    </div>
                );
            })}
        </div>
    );
};
