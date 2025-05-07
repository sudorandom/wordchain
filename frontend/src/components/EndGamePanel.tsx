// src/components/EndGamePanel.tsx
import React, { useMemo } from 'react';
import {HistoryEntry} from '../utils/gameHelpers';

interface EndGamePanelProps {
  history: HistoryEntry[];
  score: number;
  maxScore: number;
  playerWords: Set<string>;
  optimalPathWords: string[];
  onClose: () => void;
  onPlayHardMode: () => void;
  onResetGame: () => void;
  difficulty: 'simple' | 'hard';
  levelJustCompleted: boolean;
}

const EndGamePanel: React.FC<EndGamePanelProps> = ({
    history,
    score,
    maxScore,
    playerWords,
    optimalPathWords,
    onClose,
    onPlayHardMode,
    onResetGame,
    difficulty,
    levelJustCompleted
}) => {
    const sortedPlayerWords = useMemo(() => [...playerWords].sort(), [playerWords]);

    let title = "Game Over!";

    if (levelJustCompleted) {
        title = difficulty === 'simple' ? "Simple Level Complete!" : "Daily Challenge Complete!";
    }

    const showPlayHardButton = levelJustCompleted && difficulty === 'simple';
    const showComeBackMessage = (levelJustCompleted && difficulty === 'hard');
    const showRetryButton = !levelJustCompleted;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center z-20 p-4">
            <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-lg shadow-xl text-center w-full max-w-2xl">
                <h2 className="text-3xl font-bold mb-4 text-gray-800 dark:text-gray-100">{title}</h2>

                {/* Container for player words and optimal path words sections */}
                <div className="flex flex-col md:flex-row justify-around gap-4 mb-6 max-h-60 overflow-y-auto"> {/* Vertical scroll for the container if content exceeds max-h-60 */}
                    {/* Player's found words and history section */}
                    <div className="flex-1 border rounded p-3 bg-gray-50 dark:bg-gray-700 dark:border-gray-600 min-w-0"> {/* min-w-0 for flex child proper sizing */}
                        <h3 className="text-lg font-semibold mb-2 text-green-700 dark:text-green-400">You found {sortedPlayerWords.length} words</h3>
                        {/* Wrapper for history items to enable wrapping */}
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            {history.map((histEntry, index) => (
                                // Each "word ->" pair is an item in the flex container
                                <div key={`history-${index}`} className="inline-flex items-baseline"> 
                                    <span className="px-2 py-1 bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200 rounded font-medium">
                                        {/* Display the first word formed by the move, or '???' if undefined */}
                                        {histEntry.wordsFormedByMove?.[0]?.toUpperCase() || '???'}
                                        {/* Add ellipsis if more than one word was formed by this move */}
                                        {histEntry.wordsFormedByMove && histEntry.wordsFormedByMove.length > 1 ? '...' : ''}
                                    </span>
                                    {/* Conditionally render the arrow: only if it's not the last item in history */}
                                    {index < history.length - 1 && (
                                        <span className="text-gray-500 dark:text-gray-400 font-bold mx-1">→</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Optimal path words section (shown if player didn't get max score) */}
                    {score !== maxScore && (
                        <div className="flex-1 border rounded p-3 bg-gray-50 dark:bg-gray-700 dark:border-gray-600 min-w-0"> {/* min-w-0 for flex child proper sizing */}
                            <h3 className="text-lg font-semibold mb-2 text-purple-700 dark:text-purple-400">Optimal: {optimalPathWords.length} words</h3>
                            {optimalPathWords.length > 0 ? (
                                // Wrapper for optimal path words to enable wrapping
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                    {optimalPathWords.map((word, index) => (
                                        <span 
                                            key={`optimal-${word}-${index}`} 
                                            className="px-2 py-1 bg-purple-100 dark:bg-purple-800 text-purple-800 dark:text-purple-200 rounded font-medium"
                                        >
                                            {word.toUpperCase()}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 dark:text-gray-400 italic">No optimal path defined.</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Message if player didn't get max score */}
                {score !== maxScore && (
                    <p className="text-lg mb-2 text-gray-700 dark:text-gray-300">There is a different set of moves that get <i>more words</i>. Try again and look for different valid moves!</p>
                )}

                {/* Action Buttons */}
                <div className="mt-6"> {/* Added a wrapper for buttons for better spacing control */}
                    {showPlayHardButton && (
                        <button 
                            onClick={onPlayHardMode} 
                            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md shadow focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:ring-offset-gray-800 mr-3 mb-2 md:mb-0"
                        >
                            Play Hard Mode
                        </button>
                    )}
                    {showComeBackMessage && (
                        <p className="text-xl font-semibold text-green-600 dark:text-green-400 my-4">Come back tomorrow for a new challenge!</p>
                    )}
                    <button 
                        onClick={onClose} 
                        className="px-6 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md shadow focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 dark:bg-gray-600 dark:hover:bg-gray-500 dark:focus:ring-gray-500 dark:ring-offset-gray-800 mb-2 md:mb-0"
                    >
                        {showComeBackMessage ? "View Board" : "Close"}
                    </button>
                    {showRetryButton && (
                        <button 
                            onClick={onResetGame} 
                            className="ml-0 md:ml-3 px-6 py-2 bg-indigo-600 text-white rounded-md shadow hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:ring-offset-gray-800 mb-2 md:mb-0"
                        >
                            Retry Level
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EndGamePanel;
