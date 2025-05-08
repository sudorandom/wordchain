// src/components/EndGamePanel.tsx
import React, { useMemo, useState, useCallback } from 'react';
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
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const shareLines: string[] = [];

        shareLines.push(`Word Chain ${today}`);


        const normalEmojiLine = generateEmojiLine(normalModeData);
        if (normalEmojiLine) {
            shareLines.push(normalEmojiLine);
        }

        const hardEmojiLine = generateEmojiLine(hardModeData);
        if (hardEmojiLine) {
             shareLines.push(hardEmojiLine);
        }
        
        const impossibleEmojiLine = generateEmojiLine(impossibleModeData); // Add impossible emoji line
        if (impossibleEmojiLine) {
             shareLines.push(impossibleEmojiLine);
        }
        
        const gameUrl = 'https://wordchain.kmcd.dev/'; 
        shareLines.push(gameUrl);
        
        return shareLines.join('\n');
    }, [normalModeData, hardModeData, impossibleModeData]); // Added impossibleModeData dependency

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

    // Determine the main title based on completion status of all levels
    const allCompleted = normalModeData?.levelCompleted && hardModeData?.levelCompleted && impossibleModeData?.levelCompleted;
    const title = allCompleted ? "Daily Challenge Complete!" : "Today's Results";
    
    // Helper component to render results for one level (excluding share section)
    const renderLevelResult = (
        mode: DifficultyLevel, // Use DifficultyLevel type
        data: LevelResultData | null | undefined
    ) => {
        if (!data) return null; // Don't render if no data for this mode

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

        return (
            // Added flex-basis for better control on different screen sizes
            <div className={`flex-1 border rounded-lg p-4 ${bgColor} ${borderColor} min-w-0 md:basis-1/3`}> 
                <h3 className={`text-xl font-bold mb-3 ${titleColor}`}>{modeName} Mode {levelCompleted ? <i className="fas fa-check text-green-500"></i> : ''}</h3>
                
                <p className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">Score: {score} / {maxScore}</p>

                 <div className="mb-4 border-t pt-3 dark:border-gray-600">
                     <h4 className={`text-md font-semibold mb-2 ${foundWordsColor}`}>Your Path ({history.length} moves, {sortedPlayerWords.length} unique words)</h4>
                     <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm max-h-24 overflow-y-auto pr-2">
                         {history.map((histEntry, index) => (
                             <div key={`history-${mode}-${index}`} className="inline-flex items-baseline"> 
                                 <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200 rounded font-medium text-xs">
                                     {histEntry.wordsFormedByMove?.[0]?.toUpperCase() || '???'}
                                     {histEntry.wordsFormedByMove && histEntry.wordsFormedByMove.length > 1 ? '…' : ''}
                                 </span>
                                 {index < history.length - 1 && (
                                     <span className="text-gray-500 dark:text-gray-400 font-bold mx-0.5 text-xs">→</span>
                                 )}
                             </div>
                         ))}
                     </div>
                 </div>

                {score !== maxScore && optimalPathWords.length > 0 && (
                    <div className="mb-4 border-t pt-3 dark:border-gray-600">
                        <h4 className={`text-md font-semibold mb-2 ${optimalWordsColor}`}>Optimal Path ({optimalPathWords.length} words)</h4>
                         <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm max-h-24 overflow-y-auto pr-2">
                            {optimalPathWords.map((word, index) => (
                                <span 
                                    key={`optimal-${mode}-${word}-${index}`} 
                                    className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-800 text-orange-800 dark:text-orange-200 rounded font-medium text-xs"
                                >
                                    {word.toUpperCase()}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
                {score !== maxScore && optimalPathWords.length === 0 && (
                     <div className="mb-4 border-t pt-3 dark:border-gray-600">
                         <h4 className={`text-md font-semibold mb-2 ${optimalWordsColor}`}>Optimal Path</h4>
                         <p className="text-sm text-gray-500 dark:text-gray-400 italic">No optimal path defined.</p>
                     </div>
                )}
            </div>
        );
    };

    // --- Render Logic ---
    const hasNormalData = normalModeData != null;
    const hasHardData = hardModeData != null;
    const hasImpossibleData = impossibleModeData != null; // Check impossible data
    const showComeBackMessage = allCompleted; // Show only if all three are done
    const canShare = (normalModeData && normalModeData.maxScore > 0) || 
                     (hardModeData && hardModeData.maxScore > 0) || 
                     (impossibleModeData && impossibleModeData.maxScore > 0); // Check all modes for sharing

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center z-20 p-4 font-sans">
            {/* Increased max-w again for three columns */}
            <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-lg shadow-xl text-center w-full max-w-6xl max-h-[90vh] overflow-y-auto"> 
                <h2 className="text-3xl font-bold mb-6 text-gray-800 dark:text-gray-100">{title}</h2>

                {/* Container for the three result sections */}
                <div className="flex flex-col md:flex-row justify-around gap-4 mb-6"> {/* Reduced gap slightly */}
                    {renderLevelResult('normal', normalModeData)}
                    {renderLevelResult('hard', hardModeData)}
                    {renderLevelResult('impossible', impossibleModeData)} {/* Render impossible */}
                </div>

                {/* Combined Shareable Results Section */}
                 {canShare && (
                    <div className="mt-6 mb-6 p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Share Results!</h3>
                            <button
                                onClick={handleCopyToClipboard}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:ring-offset-gray-800 transition-colors duration-150 ease-in-out"
                            >
                                {copied ? 'Copied!' : 'Copy'}
                            </button>
                        </div>
                        <pre className="whitespace-pre-wrap bg-white dark:bg-gray-600 p-3 rounded text-sm text-left text-gray-900 dark:text-gray-50 overflow-x-auto select-all">
                            {combinedShareText}
                        </pre>
                    </div>
                )}


                {/* Message if no level data provided */}
                {!hasNormalData && !hasHardData && !hasImpossibleData && (
                    <p className="text-lg text-gray-500 dark:text-gray-400 mb-6">No results available to display.</p>
                )}

                {/* Bottom Section */}
                <div className="mt-8 pt-4 border-t dark:border-gray-600">
                    {showComeBackMessage && (
                        <p className="text-xl font-semibold text-green-600 dark:text-green-400 my-4">
                            You've completed all challenges! Come back tomorrow!
                        </p>
                    )}
                    <button 
                        onClick={onClose} 
                        className="px-8 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md shadow focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 dark:bg-gray-600 dark:hover:bg-gray-500 dark:focus:ring-gray-500 dark:ring-offset-gray-800"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EndGamePanel;
