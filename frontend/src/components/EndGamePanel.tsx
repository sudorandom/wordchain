// src/components/EndGamePanel.tsx
import React, { useMemo } from 'react';

interface EndGamePanelProps {
  score: number;
  maxScore: number;
  playerWords: Set<string>;
  optimalPathWords: string[];
  overallFailedAttempts: number;
  onClose: () => void;
  onPlayHardMode: () => void;
  onResetGame: () => void;
  difficulty: 'simple' | 'hard';
  dailyProgress: { simpleCompleted: boolean; hardCompleted: boolean };
  levelJustCompleted: boolean;
}

const EndGamePanel: React.FC<EndGamePanelProps> = ({
    score,
    maxScore,
    playerWords,
    optimalPathWords,
    overallFailedAttempts,
    onClose,
    onPlayHardMode,
    onResetGame,
    difficulty,
    dailyProgress,
    levelJustCompleted
}) => {
    const sortedPlayerWords = useMemo(() => [...playerWords].sort(), [playerWords]);

    let title = "Game Over!";
    let message = `You reached depth ${score} out of ${maxScore}.`;

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
                <p className="text-lg mb-2 text-gray-700 dark:text-gray-300">You found <span className="font-semibold">{playerWords.size}</span> unique words.</p>

                <div className="flex flex-col md:flex-row justify-around gap-4 mb-6 max-h-60 overflow-y-auto">
                    <div className="flex-1 border rounded p-3 bg-gray-50 dark:bg-gray-700 dark:border-gray-600">
                        <h3 className="text-lg font-semibold mb-2 text-green-700 dark:text-green-400">You found {sortedPlayerWords.length} words</h3>
                        {sortedPlayerWords.length > 0 ? <ol className="text-left text-sm space-y-1 list-decimal list-inside text-gray-700 dark:text-gray-300">{sortedPlayerWords.map(word => <li key={word}>{word.toUpperCase()}</li>)}</ol> : <p className="text-sm text-gray-500 dark:text-gray-400 italic">None found.</p>}
                    </div>
                    {
                        score != maxScore &&
                        <div className="flex-1 border rounded p-3 bg-gray-50 dark:bg-gray-700 dark:border-gray-600">
                            <h3 className="text-lg font-semibold mb-2 text-blue-700 dark:text-blue-400">There are {optimalPathWords.length} words possible.</h3>
                            {optimalPathWords.length > 0 ? <ol className="text-left text-sm space-y-1 list-decimal list-inside text-gray-700 dark:text-gray-300">{optimalPathWords.map((word, index) => <li key={`${word}-${index}`}>{word.toUpperCase()}</li>)}</ol> : <p className="text-sm text-gray-500 dark:text-gray-400 italic">No optimal path defined.</p>}
                        </div>
                    }
                </div>

                {showPlayHardButton && (
                    <button onClick={onPlayHardMode} className="mt-4 px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md shadow focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:ring-offset-gray-800 mr-3">
                        Play Hard Mode
                    </button>
                )}
                {showComeBackMessage && (
                     <p className="text-xl font-semibold text-green-600 dark:text-green-400 my-4">Come back tomorrow for a new challenge!</p>
                )}
                 <button onClick={onClose} className="mt-4 px-6 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md shadow focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 dark:bg-gray-600 dark:hover:bg-gray-500 dark:focus:ring-gray-500 dark:ring-offset-gray-800">
                    {showComeBackMessage ? "View Board" : "Close"}
                </button>
                 {showRetryButton && (
                    <button onClick={onResetGame} className="mt-4 ml-3 px-6 py-2 bg-indigo-600 text-white rounded-md shadow hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:ring-offset-gray-800">
                        Retry Level
                    </button>
                )}
            </div>
        </div>
    );
};

export default EndGamePanel;
