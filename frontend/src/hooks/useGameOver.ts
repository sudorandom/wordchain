// src/hooks/useGameOver.ts
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    DifficultyLevel, LevelCompletionSummary, HistoryEntry, CoreGameState,
    DIFFICULTIES, LevelResultData, DailyProgressRecord, DailyProgressDifficultySummary
} from '../types/gameTypes';
import { getFriendlyDate } from '../utils/gameHelpers';
// Import specific functions from the actual storage module
import {
    loadDailyProgress as loadDailyProgressFromStorage, // Renamed to avoid conflict with local wrapper
    saveDailyProgress,
    loadAllSummariesForDate,
    loadSummaryForDifficulty,
    DailyProgressStorage // Import the type returned by the storage function
} from '../core/storage';

interface GameOverProps {
    coreGameState: CoreGameState;
    currentDate: Date | undefined;
    difficulty: DifficultyLevel;
    dailyProgressStatus: Record<DifficultyLevel, boolean>;
    setDailyProgressStatus: React.Dispatch<React.SetStateAction<Record<DifficultyLevel, boolean>>>;
    liveOptimalPathWords: string[];
    livePlayerUniqueWordsFound: Set<string>;
    isLoading: boolean;
    isCoreError: boolean | null;
    onViewSolution: (difficulty: DifficultyLevel) => void;
    onMasterReset: () => void;
}

// Helper function to ensure the loaded progress conforms to DailyProgressRecord
const ensureFullDailyProgressRecord = (partialData: DailyProgressStorage): DailyProgressRecord => {
    return {
        normal: partialData.normal, // Will be undefined if not in partialData, which is fine for DailyProgressRecord
        hard: partialData.hard,
        impossible: partialData.impossible,
    };
};


/**
 * Manages game over flow, display of summaries, and related UI state.
 */
export const useGameOver = ({
    coreGameState,
    currentDate,
    difficulty,
    dailyProgressStatus,
    setDailyProgressStatus,
    liveOptimalPathWords,
    livePlayerUniqueWordsFound,
    isLoading,
    isCoreError,
    onViewSolution,
    onMasterReset 
}: GameOverProps) => {
    const [isDisplayGameOver, setIsDisplayGameOver] = useState<boolean>(false);
    const [hasAcknowledgedGameOver, setHasAcknowledgedGameOver] = useState<boolean>(false);
    const [showEndGamePanelOverride, setShowEndGamePanelOverride] = useState<boolean>(false);
    const [combinedSummaryData, setCombinedSummaryData] = useState<Partial<Record<DifficultyLevel, LevelCompletionSummary | null>>>({});
    
    const [transientMessage, setTransientMessage] = useState<string>('');
    const transientMessageTimeoutRef = useRef<number | null>(null);

    const displayTransientMessage = useCallback((message: string, duration: number = 3000) => {
        setTransientMessage(message);
        if (transientMessageTimeoutRef.current) clearTimeout(transientMessageTimeoutRef.current);
        transientMessageTimeoutRef.current = window.setTimeout(() => {
            setTransientMessage('');
        }, duration);
    }, []);

    useEffect(() => {
        return () => {
            if (transientMessageTimeoutRef.current) clearTimeout(transientMessageTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        if (showEndGamePanelOverride || isLoading || !coreGameState.gameData || coreGameState.isGameOver === undefined || isCoreError) {
            if (coreGameState.isGameOver && !isDisplayGameOver && !isLoading && !isCoreError) {
                 setIsDisplayGameOver(true);
            }
            return;
        }

        if (coreGameState.isGameOver) {
            if (!isDisplayGameOver) {
                setIsDisplayGameOver(true);
                if(currentDate) { 
                    const dailyProgressLoaded = ensureFullDailyProgressRecord(loadDailyProgressFromStorage(currentDate)); 
                    if (dailyProgressLoaded[difficulty]?.completed) {
                        setHasAcknowledgedGameOver(true);
                    } else {
                        setHasAcknowledgedGameOver(false);
                    }
                } else {
                     setHasAcknowledgedGameOver(false); 
                }
            }
        } else {
            if (isDisplayGameOver && !showEndGamePanelOverride) {
                setIsDisplayGameOver(false);
                setHasAcknowledgedGameOver(false);
            }
        }
    }, [coreGameState.isGameOver, coreGameState.gameData, showEndGamePanelOverride, isLoading, isDisplayGameOver, isCoreError, currentDate, difficulty]);

    useEffect(() => {
        const canSaveSummary = isDisplayGameOver &&
            !hasAcknowledgedGameOver &&
            !showEndGamePanelOverride &&
            coreGameState.currentDepth === coreGameState.gameData?.maxDepthReached &&
            (coreGameState.gameData?.maxDepthReached || 0) > 0 &&
            currentDate &&
            coreGameState.gameData &&
            coreGameState.grid.length > 0 && coreGameState.grid[0].length > 0 &&
            !isLoading && !isCoreError;

        if (canSaveSummary) {
            // Load as DailyProgressStorage (Partial) first
            const loadedProgressPartial: DailyProgressStorage = loadDailyProgressFromStorage(currentDate!); 
            // Create a mutable full record for modification
            const dailyProgressDataToSave: DailyProgressRecord = {
                normal: loadedProgressPartial.normal,
                hard: loadedProgressPartial.hard,
                impossible: loadedProgressPartial.impossible,
            };


            if (dailyProgressDataToSave[difficulty]?.completed && dailyProgressDataToSave[difficulty]?.summary) {
                if (!dailyProgressStatus[difficulty]) {
                    setDailyProgressStatus(prev => ({ ...prev, [difficulty]: true }));
                }
                return;
            }

            const summaryToSave: LevelCompletionSummary = {
                history: coreGameState.history,
                score: coreGameState.currentDepth,
                playerWords: Array.from(livePlayerUniqueWordsFound),
                maxScore: coreGameState.gameData!.maxDepthReached,
                optimalPathWords: liveOptimalPathWords,
                difficultyForSummary: difficulty,
                finalGrid: coreGameState.grid,
            };

            // Ensure the difficulty entry exists before assigning to its properties
            if (!dailyProgressDataToSave[difficulty]) {
                dailyProgressDataToSave[difficulty] = { completed: false, summary: undefined };
            }
            
            const currentDifficultyProgress = dailyProgressDataToSave[difficulty];
            if(currentDifficultyProgress){ 
                currentDifficultyProgress.completed = true;
                currentDifficultyProgress.summary = summaryToSave;
            }

            setDailyProgressStatus(prev => ({ ...prev, [difficulty]: true }));
            // Pass the potentially modified full record (which is compatible with DailyProgressStorage for saving)
            saveDailyProgress(currentDate!, dailyProgressDataToSave);
        }
    }, [
        isDisplayGameOver, hasAcknowledgedGameOver, showEndGamePanelOverride, coreGameState,
        currentDate, difficulty, livePlayerUniqueWordsFound, liveOptimalPathWords,
        isLoading, isCoreError, dailyProgressStatus, setDailyProgressStatus
    ]);
    
    const handleCloseGameOverPanel = useCallback(() => {
        setHasAcknowledgedGameOver(true);
        setShowEndGamePanelOverride(false);
    }, []);

    const handleShowGameSummary = useCallback(() => {
        if (!currentDate || isLoading || isCoreError) {
            displayTransientMessage("Summary not available yet.");
            return;
        }
        // loadAllSummariesForDate already returns the correct Partial type for combinedSummaryData
        const loadedSummaries = loadAllSummariesForDate(currentDate, DIFFICULTIES);
        if (Object.values(loadedSummaries).some(s => s !== null)) {
            setCombinedSummaryData(loadedSummaries);
            setShowEndGamePanelOverride(true);
            setHasAcknowledgedGameOver(true);
            setIsDisplayGameOver(true);
        } else {
            displayTransientMessage(`No summaries available for ${getFriendlyDate(currentDate)}.`);
        }
    }, [currentDate, isLoading, isCoreError, displayTransientMessage]);

    const handleViewMySolutionForDifficulty = useCallback((targetDifficulty: DifficultyLevel) => {
        if (!currentDate || isLoading || isCoreError) {
            displayTransientMessage("Cannot view solution now.");
            return;
        }
        const summary = loadSummaryForDifficulty(currentDate, targetDifficulty);
        if (summary && summary.finalGrid && Array.isArray(summary.finalGrid)) {
            onViewSolution(targetDifficulty);
            setIsDisplayGameOver(true);
            setHasAcknowledgedGameOver(true);
            setShowEndGamePanelOverride(false);
        } else {
            displayTransientMessage(`No solution data found for ${targetDifficulty}.`);
        }
    }, [currentDate, isLoading, isCoreError, onViewSolution, displayTransientMessage]);

    const panelData = useMemo(() => {
        let normal: LevelResultData | null = null;
        let hard: LevelResultData | null = null;
        let impossible: LevelResultData | null = null;

        const processSummary = (s: LevelCompletionSummary | null | undefined): LevelResultData | null => {
            if (!s) return null;
            return {
                history: s.history,
                score: s.score,
                maxScore: s.maxScore,
                optimalPathWords: s.optimalPathWords,
                levelCompleted: s.score === s.maxScore && s.maxScore > 0,
            };
        };
        
        if (showEndGamePanelOverride && combinedSummaryData && Object.keys(combinedSummaryData).length > 0) {
            normal = processSummary(combinedSummaryData.normal);
            hard = processSummary(combinedSummaryData.hard);
            impossible = processSummary(combinedSummaryData.impossible);
        } else if (isDisplayGameOver && !hasAcknowledgedGameOver && coreGameState.gameData && currentDate && !isCoreError) {
            const liveDataForCurrentDifficulty: LevelResultData = {
                history: coreGameState.history,
                score: coreGameState.currentDepth,
                maxScore: coreGameState.gameData.maxDepthReached,
                optimalPathWords: liveOptimalPathWords,
                levelCompleted: coreGameState.currentDepth === coreGameState.gameData.maxDepthReached && coreGameState.gameData.maxDepthReached > 0,
            };

            const allSavedSummaries = ensureFullDailyProgressRecord(loadDailyProgressFromStorage(currentDate));
            DIFFICULTIES.forEach(diffLevel => {
                let dataToSet: LevelResultData | null = null;
                if (diffLevel === difficulty) {
                    dataToSet = liveDataForCurrentDifficulty;
                } else if (allSavedSummaries[diffLevel]?.summary) {
                    dataToSet = processSummary(allSavedSummaries[diffLevel]!.summary!);
                }

                if (diffLevel === 'normal') normal = dataToSet;
                else if (diffLevel === 'hard') hard = dataToSet;
                else if (diffLevel === 'impossible') impossible = dataToSet;
            });
        }
        else if (isDisplayGameOver && hasAcknowledgedGameOver && coreGameState.gameData && currentDate && !isCoreError) {
             const allSavedSummaries = ensureFullDailyProgressRecord(loadDailyProgressFromStorage(currentDate));
             DIFFICULTIES.forEach(diffLevel => {
                let dataToSet: LevelResultData | null = null;
                if (allSavedSummaries[diffLevel]?.summary) {
                    dataToSet = processSummary(allSavedSummaries[diffLevel]!.summary!);
                }
                if (diffLevel === 'normal') normal = dataToSet;
                else if (diffLevel === 'hard') hard = dataToSet;
                else if (diffLevel === 'impossible') impossible = dataToSet;
             });
        }

        return { normalDataForPanel: normal, hardDataForPanel: hard, impossibleDataForPanel: impossible };
    }, [
        showEndGamePanelOverride, combinedSummaryData, isDisplayGameOver, hasAcknowledgedGameOver,
        coreGameState, currentDate, difficulty, liveOptimalPathWords, isCoreError
    ]);
    
    const resetGameOverStates = useCallback(() => {
        setIsDisplayGameOver(false);
        setHasAcknowledgedGameOver(false);
        setShowEndGamePanelOverride(false);
        setCombinedSummaryData({});
    }, []);

    return {
        isDisplayGameOver,
        isActuallyGameOver: coreGameState.isGameOver,
        hasAcknowledgedGameOver,
        showEndGamePanelOverride,
        combinedSummaryData,
        transientMessage,
        panelData,
        handleCloseGameOverPanel,
        handleShowGameSummary,
        handleViewMySolutionForDifficulty,
        displayTransientMessage,
        resetGameOverStates,
    };
};
