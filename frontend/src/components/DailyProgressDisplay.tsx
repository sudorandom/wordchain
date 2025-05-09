import React from 'react';
import { difficulties, DifficultyLevel, GameData } from '../utils/gameHelpers';

interface DailyProgressDisplayProps {
    dailyProgress: Record<DifficultyLevel, boolean>;
    difficulty: DifficultyLevel;
    onPlayMode: (diff: DifficultyLevel) => void;
    onShowSummary: () => void;
    loading: boolean;
    showEndGamePanelOverride: boolean;
    animationStateAnimating: boolean;
    gameData: GameData | null;
}
export const DailyProgressDisplay: React.FC<DailyProgressDisplayProps> = ({ dailyProgress, difficulty, onPlayMode, onShowSummary, loading, showEndGamePanelOverride, animationStateAnimating, gameData }) => {
    const summaryButton = (
        <button
            onClick={(e) => { e.stopPropagation(); onShowSummary(); }}
            disabled={showEndGamePanelOverride || loading || animationStateAnimating || (!dailyProgress.normal && !dailyProgress.hard && !dailyProgress.impossible)}
            className="cursor-pointer mt-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center self-center transition-opacity"
            title={(!dailyProgress.normal && !dailyProgress.hard && !dailyProgress.impossible) ? 'No summaries to show yet' : 'View All Summaries'}
        >
            <i className="fas fa-list-alt mr-1.5"></i> View Summaries
        </button>
    );

    if (gameData && dailyProgress.normal) { // Show "Today's Progress" only if normal is done and not all are done
        return (
            <div className="text-center max-w-2xl w-full my-4 p-4 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-800 shadow-sm">
                <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100">Today's Progress</h3>
                {dailyProgress.normal && dailyProgress.hard && dailyProgress.impossible &&
                    <div className="text-center my-2 p-3 rounded-md bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700">
                        <p className="text-md font-semibold text-green-700 dark:text-green-300"><strong>Awesome! You've conquered all levels for today!</strong></p>
                        <p className="text-sm text-green-600 dark:text-green-400">Check back tomorrow for new challenges.</p>
                    </div>}
                <div className="flex flex-col sm:flex-row justify-around items-stretch gap-2 mb-4">
                    {difficulties.map(diffLevel => {
                        const isCompleted = dailyProgress[diffLevel];
                        const isCurrent = difficulty === diffLevel;
                        const canPlay = diffLevel === 'normal' ||
                            (diffLevel === 'hard' && dailyProgress.normal) ||
                            (diffLevel === 'impossible' && dailyProgress.normal && dailyProgress.hard);

                        const isDisabled = isCurrent || !canPlay || loading || showEndGamePanelOverride || animationStateAnimating;
                        const isClickable = !isDisabled && !isCurrent;

                        let title = `Switch to ${diffLevel.charAt(0).toUpperCase() + diffLevel.slice(1)} Mode`;
                        if (isCurrent) title = "Current Mode";
                        else if (!canPlay) title = `Complete ${diffLevel === 'hard' ? 'Normal' : 'Normal & Hard'} Mode first`;
                        else if (isDisabled && !isCurrent) title = "Action temporarily unavailable";
                        else if (isDisabled) title = "Current Mode";

                        return (
                            <div
                                key={diffLevel}
                                className={`flex-1 text-center p-3 border rounded-lg min-w-[100px] sm:min-w-[120px] flex flex-col justify-between transition-all duration-200
                                    ${isCurrent ? 'border-indigo-500 dark:border-indigo-400 bg-indigo-50 dark:bg-gray-700 ring-2 ring-indigo-300 dark:ring-indigo-600' :
                                        (canPlay ? 'border-gray-300 dark:border-gray-600 bg-slate-50 dark:bg-slate-700'
                                            : 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 opacity-60')}
                                    ${isClickable && !isCurrent ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 hover:shadow-md' : (isCurrent ? '' : 'cursor-not-allowed')}`}
                                onClick={isClickable && !isCurrent ? () => onPlayMode(diffLevel) : undefined}
                                title={title}
                            >
                                <div>
                                    <p className={`font-medium capitalize ${isCurrent ? 'text-indigo-700 dark:text-indigo-300' : (canPlay ? 'text-gray-700 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400')}`}>{diffLevel}</p>
                                    {isCompleted ? (
                                        <p className="text-green-600 dark:text-green-400 font-bold my-1 text-sm">Completed <i className="fas fa-check"></i></p>
                                    ) : (canPlay ?
                                        <p className="text-gray-500 dark:text-gray-400 my-1 italic text-sm">Not Completed</p>
                                        : <p className="text-gray-400 dark:text-gray-500 my-1 text-xs">Locked</p>
                                    )}
                                </div>
                                {!canPlay && !isCurrent && (
                                    <div className="mt-auto self-center text-gray-400 dark:text-gray-500 pt-1"><i className="fas fa-lock"></i></div>
                                )}
                            </div>
                        );
                    })}
                </div>
                {summaryButton}
            </div>
        );
    }
    return null;
};
