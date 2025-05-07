// src/components/EndGamePanel.tsx
import React, { useMemo, useState, useCallback } from 'react';
import { HistoryEntry } from '../utils/gameHelpers';

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
  simpleModeData?: LevelResultData | null; // Optional data for simple mode
  hardModeData?: LevelResultData | null;   // Optional data for hard mode
  onClose: () => void;
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
    
    // Include score fraction in the line
    // return `(${score}/${maxScore}) ${emojisArray.join('')}`; 
    // Updated based on user example: just the emojis
    return emojisArray.join(''); 
};


// --- Main Component ---
const EndGamePanel: React.FC<CombinedEndGamePanelProps> = ({
    simpleModeData,
    hardModeData,
    onClose,
}) => {
    const [copied, setCopied] = useState(false);

    // Generate the combined share text
    const combinedShareText = useMemo(() => {
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const shareLines = [`Word Chain ${today}`];

        let simpleScoreLine = '';
        let hardScoreLine = '';

        // Add score fraction to title line if data exists
        if (simpleModeData && simpleModeData.maxScore > 0) {
            simpleScoreLine = `(${simpleModeData.score}/${simpleModeData.maxScore})`;
        }
        if (hardModeData && hardModeData.maxScore > 0) {
             hardScoreLine = `(${hardModeData.score}/${hardModeData.maxScore})`;
        }
        
        // Append scores to title if they exist
        if (simpleScoreLine || hardScoreLine) {
             shareLines[0] += ` ${simpleScoreLine}${simpleScoreLine && hardScoreLine ? ' | ' : ''}${hardScoreLine}`;
        }


        const simpleEmojiLine = generateEmojiLine(simpleModeData);
        if (simpleEmojiLine) {
            shareLines.push(simpleEmojiLine);
        }

        const hardEmojiLine = generateEmojiLine(hardModeData);
        if (hardEmojiLine) {
             shareLines.push(hardEmojiLine);
        }
        
        const gameUrl = 'https://wordchain.kmcd.dev/'; 
        shareLines.push(gameUrl);
        
        return shareLines.join('\n');
    }, [simpleModeData, hardModeData]);

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

    // Determine the main title based on completion status
    const bothCompleted = simpleModeData?.levelCompleted && hardModeData?.levelCompleted;
    const title = bothCompleted ? "Daily Challenge Complete!" : "Today's Results";
    
    // Helper component to render results for one level (excluding share section)
    const renderLevelResult = (
        mode: 'simple' | 'hard', 
        data: LevelResultData | null | undefined
    ) => {
        if (!data) return null; // Don't render if no data for this mode

        const { history, score, maxScore, playerWords, optimalPathWords, levelCompleted } = data;
        const sortedPlayerWords = [...playerWords].sort();
        const modeName = mode.charAt(0).toUpperCase() + mode.slice(1);
        const titleColor = mode === 'simple' ? 'text-blue-700 dark:text-blue-400' : 'text-purple-700 dark:text-purple-400';
        const bgColor = mode === 'simple' ? 'bg-blue-50 dark:bg-blue-900' : 'bg-purple-50 dark:bg-purple-900';
        const borderColor = mode === 'simple' ? 'border-blue-200 dark:border-blue-700' : 'border-purple-200 dark:border-purple-700';
        const foundWordsColor = 'text-green-700 dark:text-green-400'; 
        const optimalWordsColor = 'text-orange-700 dark:text-orange-400'; 

        return (
            <div className={`flex-1 border rounded-lg p-4 ${bgColor} ${borderColor} min-w-0`}>
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
                {/* Share section removed from here */}
            </div>
        );
    };

    // --- Render Logic ---
    const hasSimpleData = simpleModeData != null;
    const hasHardData = hardModeData != null;
    const showComeBackMessage = bothCompleted; 
    const canShare = (simpleModeData && simpleModeData.maxScore > 0) || (hardModeData && hardModeData.maxScore > 0);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center z-20 p-4 font-sans">
            <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-lg shadow-xl text-center w-full max-w-4xl max-h-[90vh] overflow-y-auto"> 
                <h2 className="text-3xl font-bold mb-6 text-gray-800 dark:text-gray-100">{title}</h2>

                {/* Container for the two result sections */}
                <div className="flex flex-col md:flex-row justify-around gap-6 mb-6">
                    {renderLevelResult('simple', simpleModeData)}
                    {renderLevelResult('hard', hardModeData)}
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


                {/* Message if neither level provided data */}
                {!hasSimpleData && !hasHardData && (
                    <p className="text-lg text-gray-500 dark:text-gray-400 mb-6">No results available to display.</p>
                )}

                {/* Bottom Section */}
                <div className="mt-8 pt-4 border-t dark:border-gray-600">
                    {showComeBackMessage && (
                        <p className="text-xl font-semibold text-green-600 dark:text-green-400 my-4">
                            You've completed both challenges! Come back tomorrow!
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
