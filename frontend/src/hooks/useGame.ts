// src/hooks/useGame.ts
import { useCallback, useMemo, Dispatch, SetStateAction } from 'react'; // Added Dispatch, SetStateAction if setError is used directly
import { DifficultyLevel, SwapResult, CellCoordinates, HistoryEntry, GameData, CoreGameState, GameMove } from '../types/gameTypes'; // Added GameMove

import { useAppConfig } from './useAppConfig';
import { useGameSession } from './useGameSession';
import { useGameCore } from './useGameCore'; // Ensure this path is correct
import { useGridInteractions } from './useGridInteractions';
import { useGameFeedback } from './useGameFeedback';
import { useGameOver } from './useGameOver';
// Import specific storage functions needed by useGame itself
import { loadSummaryForDifficulty } from '../core/storage';


/**
 * Main composite hook for the game.
 * It integrates all other game-related hooks.
 */
export const useGame = () => {
    const { darkMode, setDarkMode, isDebugMode } = useAppConfig();

    const {
        currentDate,
        difficulty,
        setDifficulty: changeDifficultySession,
        dailyProgress,
        setDailyProgress,
        refreshDailyProgress,
        reloadTrigger,
        forceReloadLevel,
    } = useGameSession('normal'); // Assuming default difficulty is 'normal'

    // Destructure from useGameCore
    const {
        grid, currentPossibleMoves, currentDepth, history, hasDeviated, turnFailedAttempts, isGameOver: isCoreGameOver, gameData,
        loading: coreLoading, // Aliased 'loading' to 'coreLoading'
        error: coreError, 
        setError: setCoreError,
        isStable, // Assuming useGameCore returns isStable
        liveOptimalPathWords, livePlayerUniqueWordsFound, liveMaxDepthAttainable, wordLength,
        performSwap: corePerformSwap,
        resetLevel: coreResetLevel,
        undoLastMove: coreUndoLastMove,
        calculateHintCoordinates,
        viewSolutionState,
    } = useGameCore(currentDate, difficulty, reloadTrigger);

    const {
        isDisplayGameOver,
        hasAcknowledgedGameOver,
        showEndGamePanelOverride,
        panelData,
        transientMessage: gameOverTransientMessage,
        handleCloseGameOverPanel,
        handleShowGameSummary,
        handleViewMySolutionForDifficulty,
        displayTransientMessage: displayGameOverMessage,
        resetGameOverStates
    } = useGameOver({
        coreGameState: { grid, currentPossibleMoves, currentDepth, history, hasDeviated, turnFailedAttempts, isGameOver: isCoreGameOver, gameData },
        currentDate,
        difficulty,
        dailyProgressStatus: dailyProgress,
        setDailyProgressStatus: setDailyProgress,
        liveOptimalPathWords,
        livePlayerUniqueWordsFound,
        isLoading: coreLoading, // Use the aliased coreLoading
        isCoreError: !!coreError, // Ensure this is boolean if useGameOver expects boolean
        onViewSolution: (targetDifficulty) => {
            if (currentDate && targetDifficulty) { // Ensure targetDifficulty is defined
                 const summary = loadSummaryForDifficulty(currentDate, targetDifficulty);
                 if (summary && summary.finalGrid && summary.history) {
                    viewSolutionState(summary.finalGrid, summary.history, summary.score);
                    feedbackApi.clearAllFeedbacks();
                 } else {
                    displayGameOverMessage(`Could not load solution for ${targetDifficulty}.`);
                 }
            }
        },
        onMasterReset: (targetDifficulty?: DifficultyLevel) => masterResetGame(targetDifficulty || difficulty || 'normal') // Provide a fallback for difficulty
    });
    
    const onSwapSuccessFeedback = useCallback(() => {
        // console.log("Swap success feedback triggered in useGame");
    }, []);

    const feedbackApi = useGameFeedback({
        turnFailedAttempts,
        isUiGameOver: isDisplayGameOver,
        isLoading: coreLoading, // Use the aliased coreLoading
        difficulty,
        grid,
        calculateHintCoords: calculateHintCoordinates,
        onSwapSuccess: onSwapSuccessFeedback,
    });

    const isInteractionAllowed = useCallback(() => {
        return !coreLoading && !isDisplayGameOver && !feedbackApi.animationState.animating && !showEndGamePanelOverride && !coreError;
    }, [coreLoading, isDisplayGameOver, feedbackApi.animationState.animating, showEndGamePanelOverride, coreError]);

    const performSwapWithFeedback = useCallback((cell1: CellCoordinates, cell2: CellCoordinates): SwapResult => {
        const result = corePerformSwap(cell1, cell2); // corePerformSwap now returns moveDetails with CellCoordinates
        if (result.success && result.newState && result.wordsFormed && result.moveDetails) {
            // Convert CellCoordinates from result.moveDetails to [number, number] tuples for GameMove if triggerSwapAnimationAndHighlight expects that
            // Assuming triggerSwapAnimationAndHighlight's 4th argument (moveDetailsParam) expects GameMove { from: [number, number], to: [number, number] }
            const gameMoveForFeedback: GameMove = {
                from: [result.moveDetails.from.row, result.moveDetails.from.col],
                to: [result.moveDetails.to.row, result.moveDetails.to.col],
                // If GameMove has other properties that should come from result.moveDetails, map them here.
            };

            feedbackApi.triggerSwapAnimationAndHighlight(
                cell1,
                cell2,
                result.wordsFormed,
                gameMoveForFeedback, // Pass the transformed GameMove object
                result.newState.grid
            );
        }
        return result;
    }, [corePerformSwap, feedbackApi]);

    const gridInteractionApi = useGridInteractions({
        performSwapAction: performSwapWithFeedback,
        isInteractionAllowed,
        triggerWiggleFeedback: feedbackApi.triggerWiggle,
        clearActiveFeedbacks: feedbackApi.clearAllFeedbacks,
        isCoreGameActuallyOver: isCoreGameOver 
    });

    const masterResetGame = useCallback((targetDifficulty: DifficultyLevel, fullResetLogic: boolean = true) => {
        feedbackApi.clearAllFeedbacks();
        gridInteractionApi.resetInteractionState();
        resetGameOverStates();
        if (fullResetLogic) {
            // Game core reset is handled by reloadTrigger or by changing difficulty
        }
        refreshDailyProgress(); 
    }, [feedbackApi, gridInteractionApi, resetGameOverStates, refreshDailyProgress]);


    const handlePlayMode = useCallback(async (newDifficulty: DifficultyLevel) => {
        if (coreLoading || feedbackApi.animationState.animating) return;
        
        if (difficulty === newDifficulty && !coreError) {
            masterResetGame(newDifficulty, true); 
            forceReloadLevel(); 
            return;
        }

        const changeResult = changeDifficultySession(newDifficulty);
        if (changeResult.success) {
            masterResetGame(newDifficulty, true); 
        } else if (changeResult.message) {
            gridInteractionApi.clearInvalidMove(); // Assuming this method exists
            displayGameOverMessage(changeResult.message);
        }
    }, [coreLoading, feedbackApi.animationState.animating, difficulty, coreError, changeDifficultySession, masterResetGame, forceReloadLevel, gridInteractionApi, displayGameOverMessage]);


    const handleResetCurrentLevel = useCallback(() => {
        if (!isInteractionAllowed() && !(isDisplayGameOver && !showEndGamePanelOverride && !coreLoading && !feedbackApi.animationState.animating) ) {
             return;
        }
        feedbackApi.clearAllFeedbacks();
        gridInteractionApi.resetInteractionState();
        coreResetLevel(); 
        
        if (!showEndGamePanelOverride) {
            resetGameOverStates();
        }
        if(setCoreError) setCoreError(null); // Clear any existing errors on reset
    }, [isInteractionAllowed, isDisplayGameOver, showEndGamePanelOverride, coreLoading, feedbackApi.animationState.animating, feedbackApi, gridInteractionApi, coreResetLevel, resetGameOverStates, setCoreError]);

    const handleUndo = useCallback(() => {
        if (history.length === 0 || coreLoading || feedbackApi.animationState.animating || showEndGamePanelOverride) return;
        
        const result = coreUndoLastMove(); // result.undoneMove should be { from: CellCoordinates, to: CellCoordinates }
        if (result.success && result.newState && result.undoneMove) {
            gridInteractionApi.resetInteractionState(); 
            
            // **FIXED**: Convert [number, number] tuples (from previous incorrect assumption) to CellCoordinates for triggerUndoAnimation
            // The error indicates triggerUndoAnimation expects CellCoordinates for its from/to arguments.
            // Assuming result.undoneMove.from and result.undoneMove.to are already CellCoordinates as per UndoResult type.
            const fromCoords: CellCoordinates = result.undoneMove.from;
            const toCoords: CellCoordinates = result.undoneMove.to;

            // The API for triggerUndoAnimation seems to expect (to, from) based on the comment.
            feedbackApi.triggerUndoAnimation(toCoords, fromCoords, () => { 
                if (isDisplayGameOver && !result.newState?.isGameOver && !showEndGamePanelOverride) {
                    resetGameOverStates();
                }
            });
        } else if (!result.success && result.message) {
            displayGameOverMessage(result.message); 
        }
    }, [
        history.length, coreLoading, feedbackApi, showEndGamePanelOverride,
        coreUndoLastMove, gridInteractionApi, isDisplayGameOver, resetGameOverStates, displayGameOverMessage
    ]);
    
    return {
        // App Config
        darkMode, setDarkMode, isDebugMode,

        // Session
        currentDate, difficulty, dailyProgress, handlePlayMode, refreshDailyProgress,

        // Core Game State & Data
        grid, currentPossibleMoves, currentDepth, history, hasDeviated, turnFailedAttempts, isCoreGameOver, gameData,
        coreLoading, coreError, isStable, // Added isStable if returned by useGameCore
        liveOptimalPathWords, livePlayerUniqueWordsFound, liveMaxDepthAttainable, wordLength,

        // Grid Interactions
        selectedCell: gridInteractionApi.selectedCell,
        draggedCell: gridInteractionApi.draggedCell,
        hoveredCell: gridInteractionApi.hoveredCell,
        isInvalidMove: gridInteractionApi.isInvalidMove,
        invalidMoveMessage: gridInteractionApi.invalidMoveMessage,
        handleCellClick: gridInteractionApi.handleCellClick,
        handleDragStart: gridInteractionApi.handleDragStart,
        handleDragEnter: gridInteractionApi.handleDragEnter,
        handleDragLeave: gridInteractionApi.handleDragLeave,
        handleDrop: gridInteractionApi.handleDrop,
        handleDragEnd: gridInteractionApi.handleDragEnd,

        // Feedback
        animationState: feedbackApi.animationState,
        highlightedCells: feedbackApi.highlightedCells,
        wiggleCells: feedbackApi.wiggleCells,
        hintCells: feedbackApi.hintCells,
        handleHintButtonClick: feedbackApi.handleHintButtonClick,

        // Game Over & Summary
        isDisplayGameOver, 
        hasAcknowledgedGameOver,
        showEndGamePanelOverride, 
        panelDataForEndGame: panelData, 
        gameOverTransientMessage, 
        handleCloseGameOverPanel,
        handleShowGameSummary,
        handleViewMySolution: handleViewMySolutionForDifficulty, 

        // Composite Actions
        handleReset: handleResetCurrentLevel, 
        handleBack: handleUndo, 
        
        forceReloadLevel, 
        masterResetGame, 
    };
};
