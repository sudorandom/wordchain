// src/components/EndGamePanel.tsx
import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { LinkedWordTag } from "./LinkedWordTag";
import { HistoryEntry, DifficultyLevel } from '../utils/gameHelpers'; // Assuming this path is correct

// Interface for the data required to display results for one level
interface LevelResultData {
    history: HistoryEntry[];
    score: number;
    maxScore: number;
    optimalPathWords: string[];
    levelCompleted: boolean; // Indicates if this specific level reached max score
}

// Props for the combined EndGamePanel
interface CombinedEndGamePanelProps {
    normalModeData?: LevelResultData | null;
    hardModeData?: LevelResultData | null;
    impossibleModeData?: LevelResultData | null;
    onClose: () => void;
}

// Helper function to generate the emoji line for a specific mode's results
const generateEmojiLine = (data: LevelResultData | null | undefined): string => {
    if (!data || data.maxScore <= 0) return ''; 

    const { score, maxScore } = data;
    const goodEmoji = '🔗'; 
    const badEmoji = '⛓️‍💥'; 

    const emojisArray = [];
    for (let i = 0; i < maxScore; i++) {
        emojisArray.push(i < score ? goodEmoji : badEmoji);
    }
    return emojisArray.join('');
};

// --- Component for Displaying Word Paths (Uses LinkedWordTag) ---
interface WordPathDisplayProps {
    mode: DifficultyLevel;
    history: HistoryEntry[];
    optimalPathWords: string[];
    deviationIndex: number;
    foundWordsColor: string; 
}

const WordPathDisplay: React.FC<WordPathDisplayProps> = ({
    mode,
    history,
    optimalPathWords,
    deviationIndex,
    foundWordsColor,
}) => {
    return (
        <div className="mb-4 border-t pt-3 dark:border-gray-600">
            <h4 className={`text-md font-semibold mb-2 ${foundWordsColor}`}>
                Your Path ({history.length} moves)
            </h4>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm max-h-36 overflow-y-auto pr-2">
                {history.map((histEntry, index) => {
                    const word = histEntry.wordsFormedByMove?.[0] || '???'; // Raw word for link
                    const deviated = deviationIndex !== -1 && index >= deviationIndex;
                    const isOptimalUpToDeviation = deviationIndex !== -1 && index < deviationIndex;

                    let wordStyleClass = 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200';
                    if (deviationIndex !== -1) {
                        if (deviated) {
                            wordStyleClass = 'bg-red-200 dark:bg-red-700 text-red-800 dark:text-red-200';
                        } else if (isOptimalUpToDeviation) {
                             wordStyleClass = 'bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200';
                        }
                    } else if (history.length > 0 && history.length === optimalPathWords.length && optimalPathWords.length > 0) {
                        wordStyleClass = 'bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200';
                    }
                    
                    const wordStyleOverride: React.CSSProperties = deviated ? { textDecoration: 'line-through' } : {};
                    const suffix = histEntry.wordsFormedByMove && histEntry.wordsFormedByMove.length > 1 ? '…' : '';

                    return (
                        <div key={`history-${mode}-${index}`} className="inline-flex items-baseline">
                            <LinkedWordTag
                                word={word} // Pass the original word for the link
                                className={wordStyleClass}
                                style={wordStyleOverride}
                                displayTextSuffix={suffix}
                            />
                            {index < history.length - 1 && (
                                <span className="text-gray-500 dark:text-gray-400 font-bold mx-0.5 text-xs ml-2">→</span>
                            )}
                        </div>
                    );
                })}
                {/* Display optimal path differences */}
                {deviationIndex !== -1 && optimalPathWords.slice(deviationIndex).map((optWord, index) => (
                    <div key={`optimal-diff-${mode}-${index}`} className="inline-flex items-baseline">
                        {(index === 0 || history.length > 0) && (
                             <span className="text-gray-500 dark:text-gray-400 font-bold mx-0.5 text-xs mr-1 ml-1">→</span>
                        )}
                        <LinkedWordTag
                            word={optWord} // Pass the original word for the link
                            className="bg-yellow-100 dark:bg-yellow-700 text-yellow-800 dark:text-yellow-200"
                            displayTextSuffix=" (Optimal)"
                        />
                    </div>
                ))}
            </div>
            {deviationIndex !== -1 && (
                <p className="text-sm mt-2 text-gray-500 dark:text-gray-400 italic">
                    (Your path matched the first {deviationIndex} optimal moves)
                </p>
            )}
        </div>
    );
};


// --- Main Component ---
const EndGamePanel: React.FC<CombinedEndGamePanelProps> = ({
    normalModeData,
    hardModeData,
    impossibleModeData,
    onClose,
}) => {
    const [copied, setCopied] = useState(false);

    const combinedShareText = useMemo(() => {
        const today = new Date().toISOString().slice(0, 10); 
        const shareLines: string[] = [];
        shareLines.push(`wordseq ${today}`);

        const normalEmojiLine = generateEmojiLine(normalModeData);
        if (normalEmojiLine) shareLines.push(`Normal: ${normalEmojiLine}`);
        
        const hardEmojiLine = generateEmojiLine(hardModeData);
        if (hardEmojiLine) shareLines.push(`Hard: ${hardEmojiLine}`);

        const impossibleEmojiLine = generateEmojiLine(impossibleModeData);
        if (impossibleEmojiLine) shareLines.push(`Impossible: ${impossibleEmojiLine}`);
        
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
            .catch(err => console.error('Failed to copy share text: ', err));
    }, [combinedShareText]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const allCompleted = normalModeData?.levelCompleted && hardModeData?.levelCompleted && impossibleModeData?.levelCompleted;
    const title = allCompleted ? "Daily Challenge Complete!" : "Today's Results";

    const renderLevelResult = (
        mode: DifficultyLevel,
        data: LevelResultData | null | undefined
    ) => {
        if (!data) return null;

        const { history, score, maxScore, optimalPathWords, levelCompleted } = data;
        const modeName = mode.charAt(0).toUpperCase() + mode.slice(1);

        let titleColor = 'text-gray-700 dark:text-gray-400';
        let bgColor = 'bg-gray-100 dark:bg-gray-900'; 
        let borderColor = 'border-gray-300 dark:border-gray-700'; 
        
        if (mode === 'normal') {
            titleColor = 'text-blue-600 dark:text-blue-400';
            bgColor = 'bg-blue-50 dark:bg-blue-900/30';
            borderColor = 'border-blue-400 dark:border-blue-600';
        } else if (mode === 'hard') {
            titleColor = 'text-purple-600 dark:text-purple-400';
            bgColor = 'bg-purple-50 dark:bg-purple-900/30';
            borderColor = 'border-purple-400 dark:border-purple-600';
        } else if (mode === 'impossible') {
            titleColor = 'text-red-600 dark:text-red-500';
            bgColor = 'bg-red-50 dark:bg-red-900/30';
            borderColor = 'border-red-400 dark:border-red-600';
        }

        const foundWordsColor = 'text-gray-600 dark:text-gray-300'; 
        const optimalWordsColor = 'text-orange-600 dark:text-orange-400';

        let deviationIndex = -1;
        if (optimalPathWords && optimalPathWords.length > 0 && history) {
            if (history.length > 0 || optimalPathWords.length > 0) {
                if (history.length < optimalPathWords.length && score < maxScore) {
                    deviationIndex = history.length; 
                }
                for (let i = 0; i < Math.min(history.length, optimalPathWords.length); i++) {
                    if (history[i]?.wordsFormedByMove?.[0]?.toUpperCase() !== optimalPathWords[i]?.toUpperCase()) {
                        deviationIndex = i;
                        break;
                    }
                }
                if (deviationIndex === -1 && history.length < optimalPathWords.length && score < maxScore) {
                    deviationIndex = history.length;
                }
            }
        }

        return (
            <div className={`flex-1 border rounded-lg p-4 ${bgColor} ${borderColor} min-w-0 shadow-md`}>
                <div className="flex justify-between items-start mb-2">
                    <h3 className={`text-xl font-bold ${titleColor} text-left`}>
                        {modeName} Mode {levelCompleted ? <i className="fas fa-check text-green-500"></i> : ''}
                    </h3>
                    <p className="text-lg font-semibold text-gray-800 dark:text-gray-200 text-right">
                        Score: {score} / {maxScore}
                    </p>
                </div>

                <WordPathDisplay
                    mode={mode}
                    history={history}
                    optimalPathWords={optimalPathWords}
                    deviationIndex={deviationIndex}
                    foundWordsColor={foundWordsColor}
                />
                
                {score < maxScore && optimalPathWords && optimalPathWords.length > 0 && deviationIndex === -1 && history.length < optimalPathWords.length && (
                     <div className="mt-2">
                        <h4 className={`text-md font-semibold mb-1 ${optimalWordsColor}`}>Remaining Optimal Path:</h4>
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                            {optimalPathWords.slice(history.length).map((word, index) => (
                                <div key={`remaining-optimal-${mode}-${index}`} className="inline-flex items-baseline">
                                     {index === 0 && history.length > 0 && <span className="text-gray-500 dark:text-gray-400 font-bold mx-0.5 text-xs mr-1">→</span>}
                                    <LinkedWordTag
                                        word={word} // Use LinkedWordTag here
                                        className="bg-yellow-100 dark:bg-yellow-700 text-yellow-800 dark:text-yellow-200"
                                    />
                                    {index < optimalPathWords.slice(history.length).length - 1 && (
                                        <span className="text-gray-500 dark:text-gray-400 font-bold mx-0.5 text-xs ml-1">→</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {score < maxScore && (!optimalPathWords || optimalPathWords.length === 0) && (
                    <div className="mt-4">
                        <h4 className={`text-md font-semibold mb-2 ${optimalWordsColor}`}>Optimal Path</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400 italic">No optimal path defined for this level.</p>
                    </div>
                )}
            </div>
        );
    };

    const hasNormalData = normalModeData != null;
    const hasHardData = hardModeData != null;
    const hasImpossibleData = impossibleModeData != null;
    const showComeBackMessage = allCompleted;
    const canShare = (normalModeData && normalModeData.maxScore > 0) ||
                     (hardModeData && hardModeData.maxScore > 0) ||
                     (impossibleModeData && impossibleModeData.maxScore > 0);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center z-20 p-4 font-sans">
            <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-lg shadow-xl text-center w-full max-w-4xl md:max-w-5xl lg:max-w-6xl max-h-[90vh] overflow-y-auto relative">
                <button
                    onClick={onClose}
                    className="cursor-pointer absolute top-3 right-4 md:top-4 md:right-5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 focus:outline-none transition-colors duration-150 ease-in-out text-2xl"
                    aria-label="Close panel"
                >
                    <i className="fas fa-times"></i>
                </button>
                <h2 className="text-2xl md:text-3xl font-bold mb-6 text-gray-800 dark:text-gray-100 text-center">
                    {title}
                </h2>
                <div className="flex flex-col lg:flex-row justify-between gap-6">
                    <div className="lg:w-2/3 grid grid-cols-1 md:grid-cols-1 gap-4">
                        {renderLevelResult('normal', normalModeData)}
                        {renderLevelResult('hard', hardModeData)}
                        {renderLevelResult('impossible', impossibleModeData)}
                    </div>
                    <div className="lg:w-1/3 flex flex-col items-center lg:items-start justify-start mt-6 lg:mt-0">
                        {canShare && (
                            <div className="mb-6 w-full max-w-md mx-auto lg:mx-0">
                                <div className="p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 shadow">
                                    <div className="flex justify-between items-center mb-3">
                                        <h3 className="text-lg md:text-xl font-semibold text-gray-800 dark:text-gray-100">Share Results!</h3>
                                        <button
                                            onClick={handleCopyToClipboard}
                                            className="cursor-pointer px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:ring-offset-gray-800 transition-colors duration-150 ease-in-out"
                                        >
                                            {copied ? 'Copied!' : 'Copy'}
                                        </button>
                                    </div>
                                    <pre className="whitespace-pre-wrap bg-white dark:bg-gray-600 p-3 rounded text-xs md:text-sm text-left text-gray-900 dark:text-gray-50 overflow-x-auto select-all shadow-inner">
                                        {combinedShareText}
                                    </pre>
                                </div>
                            </div>
                        )}
                        {(hasNormalData || hasHardData || hasImpossibleData) && (
                            <div className="w-full flex flex-col items-center lg:items-start justify-end text-center lg:text-left">
                                {showComeBackMessage && (
                                    <p className="text-lg md:text-xl font-semibold text-green-600 dark:text-green-400 my-4">
                                        You've completed all challenges! Come back tomorrow!
                                    </p>
                                )}
                                <div className="mt-auto w-full flex justify-center lg:justify-end pt-4">
                                     <button
                                        onClick={onClose}
                                        className="cursor-pointer px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md shadow focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:bg-indigo-500 dark:hover:bg-indigo-600 dark:focus:ring-indigo-600 dark:ring-offset-gray-800 transition-colors duration-150 ease-in-out"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EndGamePanel;
