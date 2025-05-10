// src/hooks/useGameCore.ts
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    GameData, CoreGameState, DifficultyLevel, CellCoordinates, HistoryEntry,
    SwapResult, UndoResult, GameMove // Ensure GameMove is defined if used by GameLogic
} from '../types/gameTypes';
// Import the actual GameLogic class
import { GameLogic } from '../core/gameLogic';
// Import helper functions from their actual implementation file
import {
    getDataFilePath,
    getFormattedDate,
    findLongestWordChain
} from '../utils/gameHelpers';
// Import specific functions from the actual storage module
import {
    simpleHash,
    loadInProgressState,
    saveInProgressState,
    removeInProgressState,
    loadDailyProgress,
    DailyProgressStorage, 
    LevelCompletionSummary 
} from '../core/storage';

const initialCoreGameState: CoreGameState = {
    grid: [[]],
    currentPossibleMoves: [],
    currentDepth: 0,
    history: [],
    hasDeviated: false,
    turnFailedAttempts: 0,
    isGameOver: false,
    gameData: null,
};

interface StabilitySignal {
    opId: number;
    isStable: boolean;
}

/**
 * Manages the GameLogic instance, core game state, level loading,
 * saving progress, and core game actions.
 */
export const useGameCore = (
    currentDate: Date | undefined,
    difficulty: DifficultyLevel | undefined,
    reloadTrigger: number
) => {
    const gameLogicRef = useRef<GameLogic>(new GameLogic());
    const [coreState, setCoreState] = useState<CoreGameState>(initialCoreGameState);
    const [loading, setLoading] = useState<boolean>(true); 
    const [error, setError] = useState<string | null>(null);

    const loadOperationIdRef = useRef(0);
    const [stabilitySignal, setStabilitySignal] = useState<StabilitySignal>({ opId: 0, isStable: false });

    const updateReactStateFromCore = useCallback((newCoreState: CoreGameState | null) => {
        if (newCoreState) {
            setCoreState(newCoreState);
        } else {
            setCoreState(initialCoreGameState);
        }
    }, []); 

    useEffect(() => {
        const currentLoadId = ++loadOperationIdRef.current;
        const logPrefix = `[LoadEffect ID: ${currentLoadId}, Diff: ${difficulty || 'N/A'}]`;

        console.log(`${logPrefix} Fired. Date: ${currentDate ? getFormattedDate(currentDate) : 'N/A'}, Reload: ${reloadTrigger}`);

        if (!currentDate || !difficulty) {
            console.log(`${logPrefix} Waiting for valid date/difficulty.`);
            setLoading(true);
            setError(null);
            setStabilitySignal({ opId: currentLoadId, isStable: false });
            if (coreState.gameData !== null) {
                updateReactStateFromCore(null);
            }
            return;
        }

        console.log(`${logPrefix} STARTING load.`);
        setLoading(true);
        setError(null);
        setStabilitySignal({ opId: currentLoadId, isStable: false });

        const loadLevelDataInternal = async (date: Date, diff: DifficultyLevel) => {
            console.log(`${logPrefix} loadLevelDataInternal started.`);
            gameLogicRef.current = new GameLogic();
            console.log(`${logPrefix} New GameLogic instance created.`);

            try {
                const basePath = '';
                const filePath = `${basePath}/levels/${diff}/${getDataFilePath(date)}`;
                const response = await fetch(`${filePath}?v=${Date.now()}`); 
                console.log(`${logPrefix} Fetched from ${filePath}, status: ${response.status}`);

                if (loadOperationIdRef.current !== currentLoadId) {
                    console.log(`${logPrefix} Stale operation (after fetch). Aborting.`);
                    return;
                }

                if (!response.ok) {
                    if (response.status === 404) throw new Error(`Today's ${diff} level is not available yet. Please check back later! (Path: ${filePath})`);
                    throw new Error(`Failed to fetch ${diff} level for ${getFormattedDate(date)} (HTTP ${response.status}, Path: ${filePath})`);
                }
                const fetchedGameData: GameData = await response.json();
                console.log(`${logPrefix} Fetched GameData.`); 

                if (loadOperationIdRef.current !== currentLoadId) {
                    console.log(`${logPrefix} Stale operation (after JSON parse). Aborting.`);
                    return;
                }
                if (!fetchedGameData || !fetchedGameData.initialGrid || !Array.isArray(fetchedGameData.initialGrid)) {
                    throw new Error(`Level data for ${diff} is corrupted.`);
                }

                const fetchedGameDataString = JSON.stringify(fetchedGameData);
                const currentJsonFileHash = simpleHash(fetchedGameDataString);
                const savedProgressForLevel = loadInProgressState(date, diff, currentJsonFileHash);
                
                let currentLogicState = gameLogicRef.current.loadLevel(fetchedGameData, savedProgressForLevel);
                
                const dailyProgressDataStore: DailyProgressStorage = loadDailyProgress(date);
                const isDailyCompleted = dailyProgressDataStore[diff]?.completed || false;

                if (isDailyCompleted) {
                    console.log(`${logPrefix} Level '${diff}' is marked as completed in daily progress.`);
                    const summary: LevelCompletionSummary | undefined = dailyProgressDataStore[diff]?.summary;
                    
                    if (summary && summary.finalGrid && summary.history && summary.finalGrid.length > 0) {
                        console.log(`${logPrefix} Valid summary found. Summary's internal difficulty ('difficultyForSummary'): ${summary.difficultyForSummary || 'N/A'}. Current difficulty: '${diff}'.`);
                        
                        if (summary.difficultyForSummary === diff) {
                            console.log(`${logPrefix} Summary difficulty matches. Setting state to solution view.`);
                            currentLogicState = gameLogicRef.current.setStateForSolutionView(summary.finalGrid, summary.history, summary.score);
                            if (!currentLogicState.isGameOver) {
                                console.warn(`${logPrefix} setStateForSolutionView did not set isGameOver for ${diff}. Forcing.`);
                                gameLogicRef.current.forceGameOver();
                                currentLogicState = gameLogicRef.current.getCurrentGameState();
                           }
                        } else {
                            console.warn(`${logPrefix} MISMATCH! Summary's internal difficulty ('${summary.difficultyForSummary}') does NOT match current difficulty ('${diff}'). Ignoring this summary and loading as a new/in-progress game.`);
                        }
                    } else { 
                        console.log(`${logPrefix} Level '${diff}' completed but no valid summary/grid found in daily progress. Forcing game over if not already.`);
                        if (!currentLogicState.isGameOver) { 
                            gameLogicRef.current.forceGameOver();
                            currentLogicState = gameLogicRef.current.getCurrentGameState();
                        }
                    }
                }
                
                if (loadOperationIdRef.current === currentLoadId) {
                    updateReactStateFromCore(currentLogicState);
                    console.log(`${logPrefix} Updated React coreState.`);
                } else {
                    console.log(`${logPrefix} Stale operation before final state update. Aborting state update.`);
                }
            } catch (err: any) {
                if (loadOperationIdRef.current === currentLoadId) {
                    console.error(`${logPrefix} Error during loadLevelDataInternal:`, err);
                    setError(err.message || `Failed to load ${diff} level.`);
                    updateReactStateFromCore(null);
                } else {
                     console.log(`${logPrefix} Error in STALE operation's try-catch. Ignoring.`);
                }
                throw err; 
            }
        }; 

        loadLevelDataInternal(currentDate, difficulty)
            .then(() => {
                if (loadOperationIdRef.current === currentLoadId) {
                    if (!error) { 
                        setStabilitySignal({ opId: currentLoadId, isStable: true });
                        console.log(`${logPrefix} State marked STABLE.`);
                    } else {
                        setStabilitySignal({ opId: currentLoadId, isStable: false });
                        console.log(`${logPrefix} State remains UNSTABLE due to error during load: ${error}`);
                    }
                }
            })
            .catch((promiseErr) => {
                if (loadOperationIdRef.current === currentLoadId) {
                    console.error(`${logPrefix} Unhandled promise error in load chain:`, promiseErr);
                    if (!error) { 
                        setError(promiseErr.message || 'An unexpected error occurred during loading.');
                    }
                    updateReactStateFromCore(null); 
                    setStabilitySignal({ opId: currentLoadId, isStable: false });
                    console.log(`${logPrefix} State marked UNSTABLE due to promise error.`);
                }
            })
            .finally(() => {
                if (loadOperationIdRef.current === currentLoadId) {
                    setLoading(false);
                    console.log(`${logPrefix} FINISHED load attempt. Loading: false.`);
                    if (error) { 
                        setStabilitySignal(prev => {
                            if (prev.opId === currentLoadId) { 
                                return { opId: currentLoadId, isStable: false };
                            }
                            return prev;
                        });
                    }
                } else {
                    console.log(`${logPrefix} Finally block of STALE operation. Not changing loading/stability state.`);
                }
            });

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentDate, difficulty, reloadTrigger, updateReactStateFromCore]); 

    useEffect(() => {
        const saveLogPrefix = `[SaveEffect D:${difficulty || 'N/A'}, OpId:${loadOperationIdRef.current}]`;
        const isCurrentlyStable = stabilitySignal.opId === loadOperationIdRef.current && stabilitySignal.isStable;

        if (!loading && !error && coreState.gameData && currentDate && difficulty && isCurrentlyStable && coreState.grid.length > 0 && coreState.grid[0].length > 0) {
            console.log(`${saveLogPrefix} Conditions MET. GameData available.`); 
            const gameStateToSave = gameLogicRef.current.getGameStateForSaving();
            if (gameStateToSave) {
                try {
                    const jsonForHashing = JSON.stringify(coreState.gameData);
                    const currentJsonFileHashForSave = simpleHash(jsonForHashing);
                    console.log(`${saveLogPrefix} Saving. Hash: ${currentJsonFileHashForSave}. History length: ${gameStateToSave.history?.length}. Source Difficulty to be saved: ${difficulty}`);
                    saveInProgressState(currentDate, difficulty, gameStateToSave, currentJsonFileHashForSave, difficulty);
                } catch (e) {
                    console.error(`${saveLogPrefix} Failed to save game state:`, e);
                }
            } else {
                console.log(`${saveLogPrefix} getGameStateForSaving returned null/undefined. Not saving.`);
            }
        }
    }, [
        coreState.grid, coreState.history, coreState.currentDepth,
        coreState.turnFailedAttempts, coreState.hasDeviated, coreState.gameData,
        currentDate, difficulty,
        loading, error, stabilitySignal 
    ]);

    const isGameActiveAndStable = useCallback(() => {
        return stabilitySignal.opId === loadOperationIdRef.current && stabilitySignal.isStable;
    }, [stabilitySignal]); 

    const performSwap = useCallback((cell1: CellCoordinates, cell2: CellCoordinates): SwapResult => {
        if (loading || error || !coreState.gameData || coreState.isGameOver || !isGameActiveAndStable()) {
            return { success: false, message: "Cannot perform swap: game not ready or unstable." };
        }
        
        const logicResult = gameLogicRef.current.performSwap(cell1, cell2);

        let moveDetailsForSwapResult: { from: CellCoordinates, to: CellCoordinates, [key: string]: any } | undefined = undefined;
        
        if (logicResult.moveDetails) {
            if (Array.isArray(logicResult.moveDetails.from) && logicResult.moveDetails.from.length === 2 &&
                Array.isArray(logicResult.moveDetails.to) && logicResult.moveDetails.to.length === 2) {
                
                moveDetailsForSwapResult = {
                    ...(logicResult.moveDetails as Omit<GameMove, 'from' | 'to'>), 
                    from: { row: logicResult.moveDetails.from[0], col: logicResult.moveDetails.from[1] },
                    to: { row: logicResult.moveDetails.to[0], col: logicResult.moveDetails.to[1] },
                };
            } else {
                console.warn("[useGameCore.performSwap] logicResult.moveDetails.from/to were not [number,number] tuples as expected by the error. Attempting to use as is or it might be undefined if incompatible.");
                // **FIXED**: Use 'unknown' for a safer cast if types are truly unrelated or structure is uncertain.
                moveDetailsForSwapResult = logicResult.moveDetails as unknown as { from: CellCoordinates, to: CellCoordinates }; 
            }
        }

        const resultToReturn: SwapResult = {
            success: logicResult.success,
            message: logicResult.message, 
            newState: logicResult.newState,
            wordsFormed: logicResult.wordsFormed,
            // **FIXED**: Removed isDeviatedMove as it's not in SwapResult type.
            // isDeviatedMove: logicResult.isDeviatedMove, // Add to SwapResult interface if needed
            moveDetails: moveDetailsForSwapResult, 
        };
        
        updateReactStateFromCore(logicResult.newState || gameLogicRef.current.getCurrentGameState());
        return resultToReturn;
    }, [loading, error, coreState.gameData, coreState.isGameOver, updateReactStateFromCore, isGameActiveAndStable]);

    const resetLevel = useCallback(() => {
        if (!currentDate || !coreState.gameData || loading || error || !difficulty || !isGameActiveAndStable()) {
            return;
        }
        const coreStateAfterReset = gameLogicRef.current.resetLevel();
        updateReactStateFromCore(coreStateAfterReset);
        removeInProgressState(currentDate, difficulty);
        setStabilitySignal({ opId: loadOperationIdRef.current, isStable: true });
    }, [currentDate, difficulty, coreState.gameData, loading, error, updateReactStateFromCore, isGameActiveAndStable]);

    const undoLastMove = useCallback((): UndoResult => {
        if (coreState.history.length === 0 || loading || error || !isGameActiveAndStable()) {
            return { success: false, message: "Cannot undo: game not ready or unstable." };
        }
        const result = gameLogicRef.current.undoLastMove(); 
        if (result.success && result.newState) { 
            updateReactStateFromCore(result.newState);
        }
        return result; 
    }, [coreState.history.length, loading, error, updateReactStateFromCore, isGameActiveAndStable]);

    const calculateHintCoordinates = useCallback((): CellCoordinates[] => {
        if (loading || error || !coreState.gameData || coreState.isGameOver || difficulty === 'impossible' || !isGameActiveAndStable()) {
            return [];
        }
        return gameLogicRef.current.calculateHintCoordinates();
    }, [loading, error, coreState.gameData, coreState.isGameOver, difficulty, isGameActiveAndStable]);
    
    const viewSolutionState = useCallback((solutionGrid: string[][], solutionHistory: HistoryEntry[], solutionScore: number) => {
        if (!coreState.gameData || loading || error) { 
            return;
        }
        const solutionCoreState = gameLogicRef.current.setStateForSolutionView(solutionGrid, solutionHistory, solutionScore);
        updateReactStateFromCore(solutionCoreState);
        setStabilitySignal({ opId: loadOperationIdRef.current, isStable: true });
    }, [coreState.gameData, updateReactStateFromCore, difficulty, loading, error]); 

    const liveOptimalPathWords = useMemo(() => {
        if (coreState.gameData && coreState.gameData.explorationTree) {
            return findLongestWordChain(coreState.gameData.explorationTree, coreState.history.length > 0 ? coreState.history : undefined) || [];
        }
        return [];
    }, [coreState.gameData, coreState.history]);

    const livePlayerUniqueWordsFound = useMemo(() => {
        const words = new Set<string>();
        coreState.history.forEach(state => {
            if (Array.isArray(state.wordsFormedByMove)) {
                state.wordsFormedByMove.forEach(word => words.add(word));
            }
        });
        return words; 
    }, [coreState.history]);

    const liveMaxDepthAttainable = useMemo(() => coreState.gameData?.maxDepthReached || 0, [coreState.gameData]);
    const wordLength = useMemo(() => coreState.gameData?.wordLength || 4, [coreState.gameData]);

    return {
        ...coreState,
        loading,
        error,
        setError,
        isStable: isGameActiveAndStable(), 
        liveOptimalPathWords,
        livePlayerUniqueWordsFound,
        liveMaxDepthAttainable,
        wordLength,
        performSwap,
        resetLevel,
        undoLastMove,
        calculateHintCoordinates,
        viewSolutionState,
    };
};
