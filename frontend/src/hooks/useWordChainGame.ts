// src/hooks/useWordChainGame.ts
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    getFriendlyDate,
    getFormattedDate,
    getDataFilePath,
    findLongestWordChain,
    areAdjacent, 
    findWordCoordinates, 
    CellCoordinates,
    GameData,
    HistoryEntry,
    ExplorationNodeData,
    DifficultyLevel,
    GameMove,
} from '../utils/gameHelpers';
import { WordChainGameLogic, CoreGameState, SavedProgressState } from '../core/gameLogic';

export const difficulties: DifficultyLevel[] = ['normal', 'hard', 'impossible'];

export interface LevelCompletionSummary {
    history: HistoryEntry[];
    score: number;
    playerWords: string[];
    maxScore: number;
    optimalPathWords: string[];
    difficultyForSummary: DifficultyLevel;
    finalGrid: string[][];
}

export interface LevelResultData {
    history: HistoryEntry[];
    score: number;
    maxScore: number;
    optimalPathWords: string[];
    levelCompleted: boolean;
}

export type DailyProgressStorage = Partial<Record<DifficultyLevel, {
    completed: boolean;
    summary?: LevelCompletionSummary;
}>>;

export const useWordChainGame = () => {
    // --- UI and App State ---
    const [darkMode, setDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            try {
                const savedMode = localStorage.getItem('darkMode');
                if (savedMode !== null) return JSON.parse(savedMode);
            } catch (e) { console.error("Failed to parse darkMode from localStorage.", e); }
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        return false;
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentDate, setCurrentDate] = useState<Date>();
    const [difficulty, setDifficulty] = useState<DifficultyLevel>('normal');
    const [dailyProgress, setDailyProgress] = useState<Record<DifficultyLevel, boolean>>({ normal: false, hard: false, impossible: false });
    const [isDebugMode, setIsDebugMode] = useState(false);
    const [reloadTrigger, setReloadTrigger] = useState(0); 

    // --- Core Game Logic Instance ---
    const gameLogicRef = useRef<WordChainGameLogic>(new WordChainGameLogic());

    // --- React State reflecting Core Game Logic ---
    const [grid, setGrid] = useState<string[][]>([[]]);
    const [currentPossibleMoves, setCurrentPossibleMoves] = useState<ExplorationNodeData[]>([]);
    const [currentDepth, setCurrentDepth] = useState<number>(0);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [hasDeviated, setHasDeviated] = useState<boolean>(false);
    const [turnFailedAttempts, setTurnFailedAttempts] = useState<number>(0);
    const [isCoreGameOver, setIsCoreGameOver] = useState<boolean>(false); 
    const [coreGameData, setCoreGameData] = useState<GameData | null>(null); 

    // --- UI Interaction State ---
    const [selectedCell, setSelectedCell] = useState<CellCoordinates | null>(null);
    const [draggedCell, setDraggedCell] = useState<CellCoordinates | null>(null);
    const [hoveredCell, setHoveredCell] = useState<CellCoordinates | null>(null);
    const [isInvalidMove, setIsInvalidMove] = useState<boolean>(false); 
    const [invalidMoveMessage, setInvalidMoveMessage] = useState<string>('');

    // --- Animation & Feedback State ---
    const [animationState, setAnimationState] = useState<{ animating: boolean, from: CellCoordinates | null, to: CellCoordinates | null }>({ animating: false, from: null, to: null });
    const animationTimeoutRef = useRef<number | null>(null);
    const [highlightedCells, setHighlightedCells] = useState<CellCoordinates[]>([]);
    const highlightTimeoutRef = useRef<number | null>(null);
    const [wiggleCells, setWiggleCells] = useState<CellCoordinates[]>([]);
    const wiggleTimeoutRef = useRef<number | null>(null);
    const [hintCells, setHintCells] = useState<CellCoordinates[]>([]);
    const hintTimeoutRef = useRef<number | null>(null);

    // --- Game Over Flow & Summary State ---
    const [isDisplayGameOver, setIsDisplayGameOver] = useState<boolean>(false); 
    const [hasAcknowledgedGameOver, setHasAcknowledgedGameOver] = useState<boolean>(false);
    const [showEndGamePanelOverride, setShowEndGamePanelOverride] = useState<boolean>(false); 
    const [combinedSummaryData, setCombinedSummaryData] = useState<Partial<Record<DifficultyLevel, LevelCompletionSummary | null>>>({});

    const updateReactStateFromCore = useCallback((coreState: CoreGameState | null) => {
        if (coreState) {
            setGrid(coreState.grid);
            setCurrentPossibleMoves(coreState.currentPossibleMoves);
            setCurrentDepth(coreState.currentDepth);
            setHistory(coreState.history);
            setHasDeviated(coreState.hasDeviated);
            setTurnFailedAttempts(coreState.turnFailedAttempts);
            setIsCoreGameOver(coreState.isGameOver);
            setCoreGameData(coreState.gameData); 
        } else {
            setGrid([[]]);
            setCurrentPossibleMoves([]);
            setCurrentDepth(0);
            setHistory([]);
            setHasDeviated(false);
            setTurnFailedAttempts(0);
            setIsCoreGameOver(false);
            setCoreGameData(null);
        }
    }, []);
    
    const liveOptimalPathWords = useMemo(() => {
        if (coreGameData) {
            return findLongestWordChain(coreGameData.explorationTree, history);
        }
        return [];
    }, [coreGameData, history]);

    const livePlayerUniqueWordsFound = useMemo(() => {
        const words = new Set<string>();
        history.forEach(state => { if (Array.isArray(state.wordsFormedByMove)) { state.wordsFormedByMove.forEach(word => words.add(word)); } });
        return words;
    }, [history]);

    const liveMaxDepthAttainable = useMemo(() => coreGameData?.maxDepthReached || 0, [coreGameData]);
    const wordLength = useMemo(() => coreGameData?.wordLength || 4, [coreGameData]);

    const triggerWiggle = useCallback((cell1: CellCoordinates, cell2: CellCoordinates) => {
        if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current);
        setWiggleCells([cell1, cell2]);
        wiggleTimeoutRef.current = window.setTimeout(() => {
            setWiggleCells([]);
            wiggleTimeoutRef.current = null;
        }, 500);
    }, []);

    useEffect(() => {
        try {
            if (darkMode) {
                document.documentElement.classList.add('dark');
                localStorage.setItem('darkMode', JSON.stringify(true));
            } else {
                document.documentElement.classList.remove('dark');
                localStorage.setItem('darkMode', JSON.stringify(false));
            }
        } catch (e) { console.error("Error setting dark mode in localStorage:", e); }
    }, [darkMode]);

    useEffect(() => {
        try {
            const today = new Date();
            setCurrentDate(today);
            const params = new URLSearchParams(window.location.search);
            setIsDebugMode(params.get('debug') === 'true');
            const urlDifficulty = params.get('difficulty') as DifficultyLevel | null;

            const progressKey = `wordChainsProgress-${getFormattedDate(today)}`;
            const savedProgressString = localStorage.getItem(progressKey);
            let currentDailyProgressState: Record<DifficultyLevel, boolean> = { normal: false, hard: false, impossible: false };
            if (savedProgressString) {
                try {
                    const parsedProgress: DailyProgressStorage = JSON.parse(savedProgressString);
                    difficulties.forEach(diff => {
                        if (parsedProgress[diff]?.completed) {
                            currentDailyProgressState[diff] = true;
                        }
                    });
                } catch (e) {
                    console.error("Failed to parse daily progress from localStorage:", e);
                    localStorage.removeItem(progressKey);
                }
            }
            setDailyProgress(currentDailyProgressState);

            let initialDifficultyValue: DifficultyLevel = 'normal';
            if (urlDifficulty && difficulties.includes(urlDifficulty)) {
                initialDifficultyValue = urlDifficulty;
            } else if (currentDailyProgressState.normal && !currentDailyProgressState.hard) {
                initialDifficultyValue = 'hard';
            } else if (currentDailyProgressState.normal && currentDailyProgressState.hard && !currentDailyProgressState.impossible) {
                initialDifficultyValue = 'impossible';
            }
            setDifficulty(initialDifficultyValue);
        } catch (e) {
            console.error("Error in initial date/difficulty/progress load useEffect:", e);
            setError("Failed to initialize game settings. Please refresh.");
        }
    }, []); 

    const masterResetGameStates = useCallback(() => {
        try {
            if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
            if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
            if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current);
            if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
            updateReactStateFromCore(null); 
            setIsInvalidMove(false);
            setInvalidMoveMessage('');
            setSelectedCell(null);
            setHoveredCell(null);
            setDraggedCell(null);
            setWiggleCells([]);
            setHintCells([]);
            setAnimationState({ animating: false, from: null, to: null });
            setIsDisplayGameOver(false);
            setHasAcknowledgedGameOver(false);
            setShowEndGamePanelOverride(false);
            setCombinedSummaryData({});
            setReloadTrigger(prev => prev + 1); 
        } catch (e) {
            console.error("Error in masterResetGameStates:", e);
            setError("Failed to reset game state. Please refresh.");
        }
    }, [updateReactStateFromCore]);

    useEffect(() => {
        const loadLevelDataInternal = async (date: Date, diff: DifficultyLevel) => {
            console.log(`[loadLevelDataInternal] Starting for difficulty: ${diff}, date: ${getFormattedDate(date)}`);
            if (!date) {
                setError("Date not available for loading level.");
                setLoading(false); 
                return;
            }
            setLoading(true);
            setError(null);
            updateReactStateFromCore(null); 
            setIsInvalidMove(false);
            setInvalidMoveMessage('');
            setSelectedCell(null);
            setHoveredCell(null);
            setDraggedCell(null);
            setWiggleCells([]);
            setHintCells([]);
            setAnimationState({ animating: false, from: null, to: null });
            setIsDisplayGameOver(false);
            setHasAcknowledgedGameOver(false);
            setShowEndGamePanelOverride(false);

            try {
                const basePath = ''; 
                const response = await fetch(`${basePath}/levels/${diff}/${getDataFilePath(date)}`);
                if (!response.ok) {
                    if (response.status === 404) throw new Error(`Today's ${diff} level is not available yet. Please check back later!`);
                    throw new Error(`Failed to fetch ${diff} level for ${getFormattedDate(date)} (HTTP ${response.status})`);
                }
                const fetchedGameData: GameData = await response.json();
                if (!fetchedGameData || !fetchedGameData.initialGrid || !Array.isArray(fetchedGameData.initialGrid)) {
                    throw new Error(`Level data for ${diff} is corrupted.`);
                }
                
                let savedProgressForLevel: SavedProgressState | undefined = undefined;
                const inProgressStateKey = `wordChainsState-${getFormattedDate(date)}-${diff}`;
                const inProgressStateString = localStorage.getItem(inProgressStateKey);
                console.log(`[loadLevelDataInternal] In-progress state string for ${diff} ('${inProgressStateKey}'):`, inProgressStateString ? "Found" : "Not Found");
                if (inProgressStateString) {
                    try {
                        savedProgressForLevel = JSON.parse(inProgressStateString);
                        if (!savedProgressForLevel?.lastGrid || !Array.isArray(savedProgressForLevel.lastGrid)) {
                            console.warn("[loadLevelDataInternal] Saved lastGrid is invalid, ignoring saved state.");
                            savedProgressForLevel = undefined;
                            localStorage.removeItem(inProgressStateKey);
                        }
                    } catch (e) {
                        console.error("[loadLevelDataInternal] Failed to parse saved game state, resetting to initial for this level:", e);
                        localStorage.removeItem(inProgressStateKey);
                    }
                }
                
                const initialCoreStateLoaded = gameLogicRef.current.loadLevel(fetchedGameData, savedProgressForLevel);
                updateReactStateFromCore(initialCoreStateLoaded); 

                // --- Game Over Override Logic ---
                let finalCoreStateForThisLoad = initialCoreStateLoaded;
                let shouldBeInitiallyGameOver = finalCoreStateForThisLoad.isGameOver;
                let shouldAcknowledge = false;

                const dailyProgressKey = `wordChainsProgress-${getFormattedDate(date)}`;
                const savedDailyProgressString = localStorage.getItem(dailyProgressKey);

                if (savedDailyProgressString) {
                    try {
                        const dailyProgressDataStore: DailyProgressStorage = JSON.parse(savedDailyProgressString);
                        const isDailyCompleted = dailyProgressDataStore[diff]?.completed || false;

                        if (isDailyCompleted) {
                            const isLoadingInProgressNonResetState = savedProgressForLevel && (savedProgressForLevel.currentDepth > 0 || savedProgressForLevel.history.length > 0);
                            
                            // If daily says completed:
                            // Force game over IF we are loading an actual in-progress (non-reset) state,
                            // OR if the core logic itself determined game over from the loaded state.
                            // Otherwise (e.g., daily completed but no in-progress state, or in-progress is just a reset state), allow fresh play.
                            if (isLoadingInProgressNonResetState || finalCoreStateForThisLoad.isGameOver) {
                                if (!finalCoreStateForThisLoad.isGameOver) { 
                                    gameLogicRef.current.forceGameOver();
                                    finalCoreStateForThisLoad = gameLogicRef.current.getCurrentGameState(); 
                                    updateReactStateFromCore(finalCoreStateForThisLoad); 
                                }
                                shouldBeInitiallyGameOver = true; 
                                shouldAcknowledge = true; 
                            } else {
                                shouldBeInitiallyGameOver = false; 
                            }
                        }
                    } catch (e) { console.error("[loadLevelDataInternal] Failed to parse daily progress for game over check:", e); }
                }

                if (shouldBeInitiallyGameOver) {
                    setIsDisplayGameOver(true);
                    setHasAcknowledgedGameOver(shouldAcknowledge);
                } else {
                    setIsDisplayGameOver(false);
                    setHasAcknowledgedGameOver(false);
                }

            } catch (err: any) {
                console.error(`[loadLevelDataInternal] Error loading level data for ${diff}:`, err);
                setError(err.message || `Failed to load ${diff} level.`);
                updateReactStateFromCore(null); 
                setIsDisplayGameOver(false);
                setHasAcknowledgedGameOver(false);
            } finally {
                setLoading(false);
                console.log(`[loadLevelDataInternal] Finished for difficulty: ${diff}. Loading state: false.`);
            }
        };

        if (currentDate && difficulty) {
            loadLevelDataInternal(currentDate, difficulty);
        } else {
            if (!currentDate) console.warn("[loadLevelDataInternal] Skipped: currentDate not set.");
            if (!difficulty) console.warn("[loadLevelDataInternal] Skipped: difficulty not set.");
            setLoading(false); 
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentDate, difficulty, reloadTrigger, updateReactStateFromCore]); 

    useEffect(() => {
        if (!loading && !error && coreGameData && currentDate && difficulty && grid.length > 0 && grid[0].length > 0) { 
            const gameStateToSave = gameLogicRef.current.getGameStateForSaving();
            if (gameStateToSave) {
                try {
                    localStorage.setItem(
                        `wordChainsState-${getFormattedDate(currentDate)}-${difficulty}`,
                        JSON.stringify(gameStateToSave)
                    );
                } catch (e) { console.error("Failed to save game state to localStorage:", e); }
            }
        }
    }, [grid, history, currentDepth, turnFailedAttempts, hasDeviated, currentDate, difficulty, coreGameData, loading, error]);

    useEffect(() => {
        if (showEndGamePanelOverride || loading || !coreGameData || animationState.animating || error) {
            return;
        }
        if (isCoreGameOver) { 
            if (!isDisplayGameOver) {
                setIsDisplayGameOver(true); 
                setHasAcknowledgedGameOver(false); 
            }
        } else {
            if (isDisplayGameOver) {
                setIsDisplayGameOver(false); 
                setHasAcknowledgedGameOver(false);
            }
        }
    }, [coreGameData, animationState.animating, showEndGamePanelOverride, isCoreGameOver, isDisplayGameOver, loading, error]);

    useEffect(() => {
        const canSaveSummary = isDisplayGameOver && 
                             !hasAcknowledgedGameOver && 
                             !showEndGamePanelOverride &&
                             currentDepth === liveMaxDepthAttainable && 
                             liveMaxDepthAttainable > 0 && 
                             currentDate && 
                             coreGameData && 
                             grid.length > 0 && grid[0].length > 0 && 
                             !loading && !error;

        if (canSaveSummary) {
            const progressKey = `wordChainsProgress-${getFormattedDate(currentDate!)}`;
            const existingProgressString = localStorage.getItem(progressKey);
            let dailyProgressDataFromStorage: DailyProgressStorage = {};
            if (existingProgressString) {
                try {
                    dailyProgressDataFromStorage = JSON.parse(existingProgressString);
                } catch (e) {
                    console.error("[SaveSummaryEffect] Failed to parse daily progress for summary saving, resetting.", e);
                    dailyProgressDataFromStorage = {}; localStorage.removeItem(progressKey);
                }
            }


            if (dailyProgressDataFromStorage[difficulty]?.completed && dailyProgressDataFromStorage[difficulty]?.summary) {
                 if (!dailyProgress[difficulty]) { 
                    setDailyProgress((prev) => ({ ...prev, [difficulty]: true }));
                }
                return; 
            }

            const summaryToSave: LevelCompletionSummary = {
                history: history, 
                score: currentDepth,
                playerWords: Array.from(livePlayerUniqueWordsFound),
                maxScore: liveMaxDepthAttainable,
                optimalPathWords: liveOptimalPathWords,
                difficultyForSummary: difficulty,
                finalGrid: grid, 
            };
            console.log(`[SaveSummaryEffect] Saving summary for ${difficulty}:`, summaryToSave);

            dailyProgressDataFromStorage[difficulty] = { completed: true, summary: summaryToSave };
            setDailyProgress((prev) => ({ ...prev, [difficulty]: true })); 
            try {
                localStorage.setItem(progressKey, JSON.stringify(dailyProgressDataFromStorage));
            } catch (e) { console.error("[SaveSummaryEffect] Failed to save summary to localStorage:", e); }
        } else {
            // Optional detailed logging for why summary save was skipped
            // if (isDisplayGameOver && currentDepth === liveMaxDepthAttainable && liveMaxDepthAttainable > 0) {
            //      console.log(`[SaveSummaryEffect] Conditions NOT MET. isDisplayGameOver:${isDisplayGameOver}, hasAckGameOver:${hasAcknowledgedGameOver}, showEndGamePanelOverride:${showEndGamePanelOverride}, depth:${currentDepth} vs max:${liveMaxDepthAttainable}, date:${!!currentDate}, coreData:${!!coreGameData}, gridValid:${grid.length > 0 && grid[0].length > 0}, loading:${loading}, error:${!!error}`);
            // }
        }
    }, [
        isDisplayGameOver, hasAcknowledgedGameOver, showEndGamePanelOverride, currentDepth,
        liveMaxDepthAttainable, currentDate, coreGameData, difficulty, history, grid,
        livePlayerUniqueWordsFound, liveOptimalPathWords, loading, dailyProgress, error 
    ]);

    useEffect(() => {
        if (difficulty === 'impossible' || error || !coreGameData) {
            setHintCells([]);
            if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
            return;
        }
        if (turnFailedAttempts >= 3 && !isDisplayGameOver && !showEndGamePanelOverride && !loading && grid.length > 0 && grid[0].length > 0) {
            const coordinates = gameLogicRef.current.calculateHintCoordinates(); 
            if (coordinates.length > 0) {
                setHintCells(coordinates);
                if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
                hintTimeoutRef.current = window.setTimeout(() => {
                    setHintCells([]); hintTimeoutRef.current = null;
                }, 3000);
            }
        }
    }, [turnFailedAttempts, grid, isDisplayGameOver, showEndGamePanelOverride, loading, difficulty, error, coreGameData]);

    useEffect(() => {
        return () => {
            if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
            if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
            if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current);
            if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
        };
    }, []);

    const performSwap = useCallback(
        (cell1: CellCoordinates, cell2: CellCoordinates) => {
            if (showEndGamePanelOverride) return; 
            if (isDisplayGameOver) return;      
            if (!coreGameData || animationState.animating || loading || error) return; 

            setSelectedCell(null);
            setDraggedCell(null);
            setHoveredCell(null);

            const result = gameLogicRef.current.performSwap(cell1, cell2);
            updateReactStateFromCore(result.newState || gameLogicRef.current.getCurrentGameState()); 

            if (result.success && result.newState && result.wordsFormed && result.moveDetails) {
                setAnimationState({ animating: true, from: cell1, to: cell2 });
                setIsInvalidMove(false);
                setInvalidMoveMessage('');
                if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
                setHighlightedCells([]); 

                animationTimeoutRef.current = window.setTimeout(() => {
                    let allFoundCoords: CellCoordinates[] = [];
                    if (result.wordsFormed && result.moveDetails) {
                         result.wordsFormed.forEach((word: string) => {
                            if (result.newState?.grid && result.newState.grid.length > 0 && result.newState.grid[0].length > 0) {
                                const coordsAttempt = findWordCoordinates(result.newState.grid, word, result.moveDetails!);
                                if (coordsAttempt && coordsAttempt.length > 0) {
                                    allFoundCoords.push(...coordsAttempt);
                                }
                            }
                        });
                    }
                    const uniqueHighlightedCellsMap = new Map<string, CellCoordinates>();
                    allFoundCoords.forEach(coord => { if (coord) uniqueHighlightedCellsMap.set(`${coord.row}-${coord.col}`, coord); });
                    setHighlightedCells(Array.from(uniqueHighlightedCellsMap.values()));
                    
                    setAnimationState({ animating: false, from: null, to: null });
                    animationTimeoutRef.current = null;

                    highlightTimeoutRef.current = window.setTimeout(() => {
                        setHighlightedCells([]); highlightTimeoutRef.current = null;
                    }, 1500);

                }, 300); 
            } else { 
                if (!isCoreGameOver) { 
                    setIsInvalidMove(true);
                    setInvalidMoveMessage(result.message || 'Invalid Move!');
                    if (result.message !== "Game is over.") { 
                         triggerWiggle(cell1, cell2);
                    }
                }
            }
        },
        [coreGameData, animationState.animating, isDisplayGameOver, loading, error, triggerWiggle, updateReactStateFromCore, isCoreGameOver, showEndGamePanelOverride]
    );

    const handleDragStart = useCallback((cellCoords: CellCoordinates) => {
        if (showEndGamePanelOverride) return;
        if (isDisplayGameOver) return;
        if (animationState.animating || !coreGameData || loading || error) return;
        
        setDraggedCell(cellCoords);
        setSelectedCell(null);
        setIsInvalidMove(false);
        setInvalidMoveMessage('');
        setHoveredCell(null);
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current); setHighlightedCells([]);
        if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current); setWiggleCells([]);
        if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current); setHintCells([]);
    }, [animationState.animating, isDisplayGameOver, coreGameData, loading, error, showEndGamePanelOverride]);

    const handleDragEnter = useCallback((cellCoords: CellCoordinates) => {
        if (isDisplayGameOver || showEndGamePanelOverride || animationState.animating) return;
        if (draggedCell && (draggedCell.row !== cellCoords.row || draggedCell.col !== cellCoords.col)) {
            if (areAdjacent(draggedCell, cellCoords)) setHoveredCell(cellCoords);
            else setHoveredCell(null);
        }
    }, [draggedCell, isDisplayGameOver, showEndGamePanelOverride, animationState.animating]);

    const handleDragLeave = useCallback((cellCoords: CellCoordinates) => {
        if (isDisplayGameOver || showEndGamePanelOverride || animationState.animating) return;
        if (hoveredCell && hoveredCell.row === cellCoords.row && hoveredCell.col === cellCoords.col) {
            setHoveredCell(null);
        }
    }, [hoveredCell, isDisplayGameOver, showEndGamePanelOverride, animationState.animating]);

    const handleDragEnd = useCallback(() => {
        if (isDisplayGameOver || showEndGamePanelOverride || animationState.animating) return;
        setDraggedCell(null);
        setHoveredCell(null);
    }, [isDisplayGameOver, showEndGamePanelOverride, animationState.animating]);

    const handleDrop = useCallback((targetCellCoords: CellCoordinates) => {
        if (showEndGamePanelOverride) return;
        if (isDisplayGameOver) return; 
        if (!draggedCell || loading || animationState.animating || error) { 
            setDraggedCell(null); setHoveredCell(null); return;
        }

        const sourceCell = draggedCell;
        setHoveredCell(null);
        if (sourceCell.row === targetCellCoords.row && sourceCell.col === targetCellCoords.col) {
            setDraggedCell(null); return;
        }
        if (!areAdjacent(sourceCell, targetCellCoords)) { 
            if (!isCoreGameOver) { 
                setIsInvalidMove(true);
                setInvalidMoveMessage('Must swap adjacent cells.');
                triggerWiggle(sourceCell, targetCellCoords);
            }
            setDraggedCell(null);
            return;
        }
        performSwap(sourceCell, targetCellCoords); 
        setDraggedCell(null);
    }, [draggedCell, performSwap, triggerWiggle, loading, animationState.animating, error, isDisplayGameOver, isCoreGameOver, showEndGamePanelOverride]);

    const handleCellClick = useCallback((cellCoords: CellCoordinates) => {
        if (showEndGamePanelOverride) return; 
        if (isDisplayGameOver) return;      
        if (animationState.animating || !coreGameData || draggedCell || loading || error) return; 
        
        if(!isCoreGameOver) { 
            setIsInvalidMove(false); 
            setInvalidMoveMessage('');
        }

        if (!selectedCell) {
            setSelectedCell(cellCoords);
        } else {
            const firstCell = selectedCell;
            if (firstCell.row === cellCoords.row && firstCell.col === cellCoords.col) {
                setSelectedCell(null); 
            } else if (areAdjacent(firstCell, cellCoords)) {
                performSwap(firstCell, cellCoords); 
                setSelectedCell(null);
            } else {
                setSelectedCell(cellCoords); 
            }
        }
    }, [selectedCell, animationState.animating, isDisplayGameOver, coreGameData, performSwap, draggedCell, loading, error, isCoreGameOver, showEndGamePanelOverride]);

    const handleReset = useCallback(() => {
        if (!currentDate || !coreGameData || showEndGamePanelOverride || animationState.animating || error) {
            console.warn("[handleReset] Reset blocked: Conditions not met."); return;
        }
        if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current);
        if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);

        const coreStateAfterReset = gameLogicRef.current.resetLevel();
        updateReactStateFromCore(coreStateAfterReset);
        
        setSelectedCell(null); setDraggedCell(null); setHoveredCell(null);
        setIsInvalidMove(false); setInvalidMoveMessage('');
        setAnimationState({ animating: false, from: null, to: null });
        setHighlightedCells([]); setWiggleCells([]); setHintCells([]);
        setIsDisplayGameOver(false); 
        setHasAcknowledgedGameOver(false);

        const inProgressStateKey = `wordChainsState-${getFormattedDate(currentDate!)}-${difficulty}`;
        try { 
            localStorage.removeItem(inProgressStateKey); 
        }
        catch (e) { console.error("[handleReset] Failed to remove item from localStorage during reset:", e); }
        
    }, [currentDate, difficulty, coreGameData, showEndGamePanelOverride, animationState.animating, error, updateReactStateFromCore]);

    const handleBack = useCallback(() => {
        if (history.length === 0 || animationState.animating || loading || error ) return;
        if (showEndGamePanelOverride) return;

        if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current);
        if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);

        const result = gameLogicRef.current.undoLastMove();
        if (result.success && result.newState && result.undoneMove) {
            if(isDisplayGameOver) { 
                setIsDisplayGameOver(false);
                setHasAcknowledgedGameOver(false);
            }
            setIsInvalidMove(false); 
            setInvalidMoveMessage('');

            setAnimationState({ animating: true, from: result.undoneMove.from, to: result.undoneMove.to });
            setHighlightedCells([]); setSelectedCell(null); setDraggedCell(null); setHoveredCell(null);
            setWiggleCells([]); setHintCells([]);

            animationTimeoutRef.current = window.setTimeout(() => {
                updateReactStateFromCore(result.newState!); 
                setAnimationState({ animating: false, from: null, to: null });
                animationTimeoutRef.current = null;
            }, 300);
        } else if (!result.success) {
            console.warn("Undo operation failed in core logic despite history being present.");
        }
    }, [history.length, animationState.animating, isDisplayGameOver, loading, error, updateReactStateFromCore, showEndGamePanelOverride]);

    const handleCloseGameOver = useCallback(() => {
        setHasAcknowledgedGameOver(true);
        setShowEndGamePanelOverride(false); 
    }, []);

    const handlePlayMode = useCallback((newDifficulty: DifficultyLevel) => {
        if (showEndGamePanelOverride || difficulty === newDifficulty || animationState.animating || error) return; 

        if (newDifficulty === 'hard' && !dailyProgress.normal) {
            console.log("Normal mode must be completed before playing Hard mode.");
            return;
        }
        if (newDifficulty === 'impossible' && (!dailyProgress.normal || !dailyProgress.hard)) {
            console.log("Normal and Hard modes must be completed before playing Impossible mode.");
            return;
        }
        
        setLoading(true); 
        setDifficulty(newDifficulty); 
        masterResetGameStates(); 

    }, [showEndGamePanelOverride, difficulty, animationState.animating, error, dailyProgress, masterResetGameStates]);

    const handleHintButtonClick = useCallback(() => {
        if (showEndGamePanelOverride) return;
        if (isDisplayGameOver) return;
        if (difficulty === 'impossible' || animationState.animating || loading || !grid || grid.length === 0 || grid[0].length === 0 || hintCells.length > 0 || error || !coreGameData) {
            return;
        }
        const coordinates = gameLogicRef.current.calculateHintCoordinates();
        if (coordinates.length > 0) {
            setHintCells(coordinates);
            if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
            hintTimeoutRef.current = window.setTimeout(() => { setHintCells([]); hintTimeoutRef.current = null; }, 3000);
        }
    }, [coreGameData, grid, difficulty, animationState.animating, showEndGamePanelOverride, isDisplayGameOver, loading, hintCells.length, error]);

    const handleShowGameSummary = useCallback(() => {
        if (!currentDate || loading || error) { console.warn("Cannot show summary: Conditions not met."); return; }
        
        const progressKey = `wordChainsProgress-${getFormattedDate(currentDate)}`;
        const savedProgressString = localStorage.getItem(progressKey);
        let loadedSummaries: Partial<Record<DifficultyLevel, LevelCompletionSummary | null>> = {};

        if (savedProgressString) {
            try {
                const parsedProgress: DailyProgressStorage = JSON.parse(savedProgressString);
                difficulties.forEach(diff => {
                    loadedSummaries[diff] = parsedProgress[diff]?.summary || null;
                });
            } catch (e) { console.error("Failed to parse saved progress for summary view:", e); }
        }

        if (Object.values(loadedSummaries).some(s => s !== null)) {
            setCombinedSummaryData(loadedSummaries);
            setShowEndGamePanelOverride(true);
            setHasAcknowledgedGameOver(true); 
            setIsDisplayGameOver(true); 
        } else {
            console.warn(`No saved summaries found for ${getFormattedDate(currentDate)}. Cannot show combined summary.`);
            setInvalidMoveMessage(`No summaries available for ${getFriendlyDate(currentDate)}.`);
            setIsInvalidMove(true); 
            setTimeout(() => {setIsInvalidMove(false); setInvalidMoveMessage('');}, 3000);
        }
    }, [currentDate, loading, error]);

    const handleViewMySolution = useCallback(() => {
        if (!currentDate || !coreGameData || animationState.animating || showEndGamePanelOverride || isDisplayGameOver || error) { 
        } else if (!isDisplayGameOver && (loading || !coreGameData)) { 
            return;
        }

        const progressKey = `wordChainsProgress-${getFormattedDate(currentDate)}`;
        const savedProgressString = localStorage.getItem(progressKey);
        if (savedProgressString) {
            try {
                const parsedProgress: DailyProgressStorage = JSON.parse(savedProgressString);
                const summary = parsedProgress[difficulty]?.summary;

                if (summary && summary.finalGrid && Array.isArray(summary.finalGrid)) {
                    if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
                    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
                    if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current);
                    if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
                    setHighlightedCells([]); setWiggleCells([]); setHintCells([]);
                    setSelectedCell(null); setDraggedCell(null); setHoveredCell(null);
                    setInvalidMoveMessage(''); setIsInvalidMove(false);
                    setAnimationState({ animating: false, from: null, to: null });

                    const solutionState = gameLogicRef.current.setStateForSolutionView(summary.finalGrid, summary.history, summary.score);
                    updateReactStateFromCore(solutionState);
                    
                    setIsDisplayGameOver(true); 
                    setHasAcknowledgedGameOver(true); 
                    setShowEndGamePanelOverride(false); 
                    console.log(`Loaded solution for ${difficulty}. Grid and history updated.`);
                } else {
                    console.warn(`No final grid or summary found in localStorage for ${difficulty} to view solution.`);
                }
            } catch (e) { console.error("Failed to parse saved progress for viewing solution:", e); }
        } else {
            console.warn(`No saved progress found for ${getFormattedDate(currentDate)} to view solution.`);
        }
    }, [currentDate, difficulty, coreGameData, animationState.animating, showEndGamePanelOverride, isDisplayGameOver, error, updateReactStateFromCore, loading]);

    const { normalDataForPanel, hardDataForPanel, impossibleDataForPanel } = useMemo(() => {
        let normalData: LevelResultData | null = null;
        let hardData: LevelResultData | null = null;
        let impossibleData: LevelResultData | null = null;

        if (showEndGamePanelOverride && combinedSummaryData && Object.keys(combinedSummaryData).length > 0) {
            normalData = combinedSummaryData.normal ? { ...combinedSummaryData.normal, levelCompleted: combinedSummaryData.normal.score === combinedSummaryData.normal.maxScore } : null;
            hardData = combinedSummaryData.hard ? { ...combinedSummaryData.hard, levelCompleted: combinedSummaryData.hard.score === combinedSummaryData.hard.maxScore } : null;
            impossibleData = combinedSummaryData.impossible ? { ...combinedSummaryData.impossible, levelCompleted: combinedSummaryData.impossible.score === combinedSummaryData.impossible.maxScore } : null;
        } else if (isDisplayGameOver && !hasAcknowledgedGameOver && coreGameData && currentDate && !error) {
            const liveDataForCurrentDifficulty: LevelResultData = {
                history: history, 
                score: currentDepth,
                maxScore: liveMaxDepthAttainable,
                optimalPathWords: liveOptimalPathWords,
                levelCompleted: currentDepth === liveMaxDepthAttainable && liveMaxDepthAttainable > 0,
            };

            const progressKey = `wordChainsProgress-${getFormattedDate(currentDate)}`;
            const savedProgressString = localStorage.getItem(progressKey);
            let allSavedSummaries: DailyProgressStorage = {};
            if (savedProgressString) {
                try { allSavedSummaries = JSON.parse(savedProgressString); }
                catch (e) { console.error("Failed to parse saved progress for panel data:", e); }
            }

            difficulties.forEach(diffLevel => {
                let dataToSet: LevelResultData | null = null;
                if (diffLevel === difficulty) { 
                    dataToSet = liveDataForCurrentDifficulty;
                } else if (allSavedSummaries[diffLevel]?.summary) { 
                    const summary = allSavedSummaries[diffLevel]!.summary!;
                    dataToSet = {
                        history: summary.history, score: summary.score, maxScore: summary.maxScore,
                        optimalPathWords: summary.optimalPathWords, levelCompleted: summary.score === summary.maxScore,
                    };
                }
                if (diffLevel === 'normal') normalData = dataToSet;
                else if (diffLevel === 'hard') hardData = dataToSet;
                else if (diffLevel === 'impossible') impossibleData = dataToSet;
            });
        }
        return { normalDataForPanel: normalData, hardDataForPanel: hardData, impossibleDataForPanel: impossibleData };
    }, [showEndGamePanelOverride, combinedSummaryData, isDisplayGameOver, hasAcknowledgedGameOver, coreGameData, currentDate, history, currentDepth, liveMaxDepthAttainable, liveOptimalPathWords, difficulty, error]);


    return {
        darkMode, loading, error, currentDate, difficulty, dailyProgress, isDebugMode,
        grid, currentPossibleMoves, currentDepth, history, hasDeviated, turnFailedAttempts,
        coreGameData, 
        selectedCell, draggedCell, hoveredCell, isInvalidMove, invalidMoveMessage,
        animationState, highlightedCells, wiggleCells, hintCells,
        isGameOver: isDisplayGameOver, 
        hasAcknowledgedGameOver, showEndGamePanelOverride, combinedSummaryData,
        liveOptimalPathWords, livePlayerUniqueWordsFound, liveMaxDepthAttainable, wordLength,
        normalDataForPanel, hardDataForPanel, impossibleDataForPanel,
        setDarkMode, 
        handleCellClick, handleDragStart, handleDragEnter, handleDragLeave, handleDragEnd, handleDrop,
        handleReset, handleBack, handleCloseGameOver, handlePlayMode, handleHintButtonClick,
        handleShowGameSummary, handleViewMySolution, masterResetGameStates
    };
};
