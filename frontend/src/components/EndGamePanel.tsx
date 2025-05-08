import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { HistoryEntry, DifficultyLevel } from '../utils/gameHelpers'; // Assuming DifficultyLevel is exported

// Interface for the data required to display results for one level
interface LevelResultData {
    history: HistoryEntry[];
    score: number;
    maxScore: number;
    playerWords: Set<string>;
    optimalPathWords: string[];
    levelCompleted: boolean; // Indicates if this specific level reached max score
}

// Props for the combined EndGamePanel
interface CombinedEndGamePanelProps {
    normalModeData?: LevelResultData | null; // Optional data for normal mode
    hardModeData?: LevelResultData | null;   // Optional data for hard mode
    impossibleModeData?: LevelResultData | null; // Optional data for impossible mode
    onClose: () => void;
    // Removed onPlayHardMode and onResetGame as they are handled in App.tsx now
}

// Helper function to generate the emoji line for a specific mode's results
const generateEmojiLine = (data: LevelResultData | null | undefined): string => {
    if (!data || data.maxScore <= 0) return ''; // Cannot generate if no data or no max score

    const { score, maxScore } = data;
    const goodEmoji = '🔗'; // Chain link for successful words
    const badEmoji = '⛓️‍💥'; // Broken chain for missed optimal words (U+26D3 U+200D U+1F4A5)

    let emojisArray = [];
    for (let i = 0; i < maxScore; i++) {
        emojisArray.push(i < score ? goodEmoji : badEmoji);
    }

    return emojisArray.join('');
};


// --- Main Component ---
const EndGamePanel: React.FC<CombinedEndGamePanelProps> = ({
    normalModeData,
    hardModeData,
    impossibleModeData, // Added prop
    onClose,
}) => {
    const [copied, setCopied] = useState(false);

    // Generate the combined share text including Impossible mode
    const combinedShareText = useMemo(() => {
        const today = new Date().toISOString().slice(0, 10); // IANA-MM-DD
        const shareLines: string[] = [];

        shareLines.push(`Word Chain ${today}`);

        const normalEmojiLine = generateEmojiLine(normalModeData);
        if (normalEmojiLine) {
            shareLines.push(`Normal: ${normalEmojiLine}`);
        }

        const hardEmojiLine = generateEmojiLine(hardModeData);
        if (hardEmojiLine) {
            shareLines.push(`Hard: ${hardEmojiLine}`);
        }

        const impossibleEmojiLine = generateEmojiLine(impossibleModeData); // Add impossible emoji line
        if (impossibleEmojiLine) {
            shareLines.push(`Impossible: ${impossibleEmojiLine}`);
        }

        const gameUrl = 'https://wordchain.kmcd.dev/';
        shareLines.push(gameUrl);

        return shareLines.join('\n');
    }, [normalModeData, hardModeData, impossibleModeData]);

    const handleCopyToClipboard = useCallback(() => {
        if (!combinedShareText) return;
        navigator.clipboard.writeText(combinedShareText)
            .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            })
            .catch(err => {
                console.error('Failed to copy share text: ', err);
            });
    }, [combinedShareText]);

    // Add useEffect for handling Escape key press
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    // Determine the main title based on completion status of all levels
    const allCompleted =
        normalModeData?.levelCompleted &&
        hardModeData?.levelCompleted &&
        impossibleModeData?.levelCompleted;
    const title = allCompleted ? "Daily Challenge Complete!" : "Today's Results";

    const renderLevelResult = (
        mode: DifficultyLevel,
        data: LevelResultData | null | undefined
    ) => {
        if (!data) return null;

        const { history, score, maxScore, playerWords, optimalPathWords, levelCompleted } = data;
        const sortedPlayerWords = [...playerWords].sort();
        const modeName = mode.charAt(0).toUpperCase() + mode.slice(1);

        // Define colors based on mode
        let titleColor = 'text-gray-700 dark:text-gray-400';
        let bgColor = 'bg-gray-50 dark:bg-gray-900';
        let borderColor = 'border-gray-200 dark:border-gray-700';
        if (mode === 'normal') {
            titleColor = 'text-blue-700 dark:text-blue-400';
            bgColor = 'bg-blue-50 dark:bg-blue-900';
            borderColor = 'border-blue-200 dark:border-blue-700';
        } else if (mode === 'hard') {
            titleColor = 'text-purple-700 dark:text-purple-400';
            bgColor = 'bg-purple-50 dark:bg-purple-900';
            borderColor = 'border-purple-200 dark:border-purple-700';
        } else if (mode === 'impossible') {
            titleColor = 'text-red-700 dark:text-red-400';
            bgColor = 'bg-red-50 dark:bg-red-900';
            borderColor = 'border-red-200 dark:border-red-700';
        }

        const foundWordsColor = 'text-green-700 dark:text-green-400';
        const optimalWordsColor = 'text-orange-700 dark:text-orange-400';

        // Determine deviation point
        let deviationIndex = -1;
        if (optimalPathWords && history) {
            for (let i = 0; i < Math.min(history.length, optimalPathWords.length); i++) {
                if (history[i]?.wordsFormedByMove?.[0]?.toUpperCase() !== optimalPathWords[i]?.toUpperCase()) {
                    deviationIndex = i;
                    break;
                }
            }
        }

        return (
            <div className={`flex-1 border rounded-lg p-4 ${bgColor} ${borderColor} min-w-0`}>
                <div className="flex justify-between items-start mb-2">
                    <h3 className={`text-xl font-bold ${titleColor} text-left`}>
                        {modeName} Mode {levelCompleted ? <i className="fas fa-check text-green-500"></i> : ''}
                    </h3>
                    <p className="text-lg font-semibold text-gray-800 dark:text-gray-200 text-right">
                        Score: {score} / {maxScore}
                    </p>
                </div>

                <div className="mb-4 border-t pt-3 dark:border-gray-600">
                    <h4 className={`text-md font-semibold mb-2 ${foundWordsColor}`}>
                        Your Path ({history.length} moves, {sortedPlayerWords.length} unique words)
                    </h4>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm max-h-36 overflow-y-auto pr-2">
                        {history.map((histEntry, index) => {
                            const word = histEntry.wordsFormedByMove?.[0]?.toUpperCase() || '???';
                            const deviated = index >= deviationIndex && deviationIndex !== -1;
                            const isOptimalUpToDeviation = index < deviationIndex;

                            return (
                                <div key={`history-${mode}-${index}`} className="inline-flex items-baseline">
                                    <span
                                        className={`px-1.5 py-0.5 rounded font-medium text-xs
                                            ${isOptimalUpToDeviation
                                                ? 'bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200'
                                                : ''
                                            }
                                            ${deviated ? 'bg-red-200 dark:bg-red-700' : 'bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200'}
                                        `}
                                        style={{
                                            textDecoration: deviated ? 'line-through' : 'none',
                                        }}
                                    >
                                        {word}
                                        {histEntry.wordsFormedByMove && histEntry.wordsFormedByMove.length > 1 ? '…' : ''}
                                    </span>
                                    {index < history.length - 1 && (
                                        <span className="text-gray-500 dark:text-gray-400 font-bold mx-0.5 text-xs ml-2">→</span>
                                    )}
                                </div>
                            );
                        })}
                        {/* Display optimal path differences */}
                        {deviationIndex !== -1 && optimalPathWords.slice(deviationIndex).map((word, index) => (
                            <span
                                key={`optimal-${mode}-${word}-${index + deviationIndex}`}
                                className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded font-medium text-xs"
                            >
                                {word.toUpperCase()}
                            </span>
                        ))}
                    </div>
                    {/* Informative text about matching moves */}
                    {deviationIndex !== -1 && (
                        <p className="text-sm mt-2 text-gray-500 dark:text-gray-400 italic">
                            (Your path matched the first {deviationIndex} optimal moves)
                        </p>
                    )}
                    {deviationIndex === -1 && optimalPathWords.length > history.length && (
                        <p className="text-sm mt-2 text-gray-500 dark:text-gray-400 italic">
                            (Your path matched the optimal path, which continues for {optimalPathWords.length - history.length} more moves)
                        </p>
                    )}
                    {score !== maxScore && optimalPathWords.length === 0 && (
                        <div className="mt-4">
                            <h4 className={`text-md font-semibold mb-2 ${optimalWordsColor}`}>Optimal Path</h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400 italic">No optimal path defined.</p>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // --- Render Logic ---
    const hasNormalData = normalModeData != null;
    const hasHardData = hardModeData != null;
    const hasImpossibleData = impossibleModeData != null; // Check impossible data
    const showComeBackMessage = allCompleted; // Show only if all three are done
    const canShare =
        (normalModeData && normalModeData.maxScore > 0) ||
        (hardModeData && hardModeData.maxScore > 0) ||
        (impossibleModeData && impossibleModeData.maxScore > 0); // Check all modes for sharing

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center z-20 p-4 font-sans">
            <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-lg shadow-xl text-center w-full max-w-6xl max-h-[90vh] overflow-y-auto relative">
                <button
                    onClick={onClose}
                    className="cursor-pointer absolute top-4 right-5 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 focus:outline-none transition-colors duration-150 ease-in-out"
                >
                    <i className="fas fa-x"></i>
                </button>
                <h2 className="text-3xl font-bold mb-6 text-gray-800 dark:text-gray-100 text-center">
                    {title}
                </h2>
                <div className="flex flex-col md:flex-row justify-between gap-6">
                    {/* Left Column: Results */}
                    <div className="md:w-1/2">
                        <div className="flex flex-col gap-4">
                            {renderLevelResult('normal', normalModeData)}
                            {renderLevelResult('hard', hardModeData)}
                            {renderLevelResult('impossible', impossibleModeData)}
                        </div>
                    </div>

                    {/* Right Column: Share, Message, Close */}
                    <div className="md:w-1/2 flex flex-col items-start justify-start">
                        {canShare && (
                            <div className="mb-6 w-full">
                                <div className="p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700">
                                    <div className="flex justify-between items-center mb-3">
                                        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Share Results!</h3>
                                        <button
                                            onClick={handleCopyToClipboard}
                                            className="cursor-pointer px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:ring-offset-gray-800 transition-colors duration-150 ease-in-out"
                                        >
                                            {copied ? 'Copied!' : 'Copy'}
                                        </button>
                                    </div>
                                    <pre className="whitespace-pre-wrap bg-white dark:bg-gray-600 p-3 rounded text-sm text-left text-gray-900 dark:text-gray-50 overflow-x-auto select-all">
                                        {combinedShareText}
                                    </pre>
                                </div>
                            </div>
                        )}
                        {(hasNormalData || hasHardData || hasImpossibleData) && (
                            <div className="w-full flex flex-col items-end justify-end ">
                                {showComeBackMessage && (
                                    <p className="text-xl font-semibold text-green-600 dark:text-green-400 my-4 text-left">
                                        You've completed all challenges! Come back tomorrow!
                                    </p>
                                )}
                                <div className="mt-auto">
                                    {/* The close button is now the X at the top right */}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className="absolute bottom-6 right-6">
                    <button
                        onClick={onClose}
                        className="cursor-pointer px-8 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md shadow focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 dark:bg-gray-600 dark:hover:bg-gray-500 dark:focus:ring-gray-500 dark:ring-offset-gray-800"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EndGamePanel;