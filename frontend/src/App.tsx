// src/App.tsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import WordGrid from './components/WordGrid';
import ProgressBar from './components/ProgressBar';
import EndGamePanel from './components/EndGamePanel';
import DebugView from './components/DebugView';
import {
    getFriendlyDate,
    getFormattedDate,
    getDataFilePath,
    findLongestWordChain,
    areAdjacent,
    findWordCoordinates,
    getInitialGameState,
    CellCoordinates,
    GameData,
    HistoryEntry,
    ExplorationNodeData,
    DifficultyLevel
} from './utils/gameHelpers';

// Define Difficulty Levels
const difficulties: DifficultyLevel[] = ['normal', 'hard', 'impossible']; // For iteration

// Interface for the summary data stored in localStorage and used by the panel
interface LevelCompletionSummary {
    history: HistoryEntry[];
    score: number;
    playerWords: string[]; // Stored as string array in localStorage
    maxScore: number;
    optimalPathWords: string[];
    difficultyForSummary: DifficultyLevel; // Use the type alias
}

// Interface for the data structure passed to EndGamePanel component
interface LevelResultData {
    history: HistoryEntry[];
    score: number;
    maxScore: number;
    optimalPathWords: string[];
    levelCompleted: boolean;
}

// Refactored structure for daily progress in localStorage
type DailyProgressStorage = Partial<Record<DifficultyLevel, {
    completed: boolean;
    summary?: LevelCompletionSummary;
}>>;


function App() {
    // State Variables for UI and basic game flow
    const [darkMode, setDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            const savedMode = localStorage.getItem('darkMode');
            if (savedMode) return JSON.parse(savedMode);
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        return false;
    });
    const [gameData, setGameData] = useState<GameData | null>(null);
    const [loading, setLoading] = useState(true); // Start in loading state
    const [error, setError] = useState<string | null>(null);
    const [currentDate, setCurrentDate] = useState<Date>();
    const [difficulty, setDifficulty] = useState<DifficultyLevel>('normal'); // Use DifficultyLevel type
    // Use Record for dailyProgress state
    const [dailyProgress, setDailyProgress] = useState<Record<DifficultyLevel, boolean>>({ normal: false, hard: false, impossible: false });
    const [isDebugMode, setIsDebugMode] = useState(false);
    const [reloadTrigger, setReloadTrigger] = useState(0);

    // Core Game State (live play)
    const [grid, setGrid] = useState<string[][] | null>(null); // Initialize as null
    const [currentPossibleMoves, setCurrentPossibleMoves] = useState<ExplorationNodeData[]>([]);
    const [currentDepth, setCurrentDepth] = useState<number>(0);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [hasDeviated, setHasDeviated] = useState<boolean>(false);
    const [turnFailedAttempts, setTurnFailedAttempts] = useState<number>(0);

    // UI Interaction State
    const [selectedCell, setSelectedCell] = useState<CellCoordinates | null>(null);
    const [draggedCell, setDraggedCell] = useState<CellCoordinates | null>(null);
    const [hoveredCell, setHoveredCell] = useState<CellCoordinates | null>(null);
    const [isInvalidMove, setIsInvalidMove] = useState<boolean>(false);
    const [invalidMoveMessage, setInvalidMoveMessage] = useState<string>('');

    // Animation & Feedback State
    const [animationState, setAnimationState] = useState<{animating: boolean, from: CellCoordinates | null, to: CellCoordinates | null}>({ animating: false, from: null, to: null });
    const animationTimeoutRef = useRef<number | null>(null);
    const [highlightedCells, setHighlightedCells] = useState<CellCoordinates[]>([]);
    const highlightTimeoutRef = useRef<number | null>(null);
    const [wiggleCells, setWiggleCells] = useState<CellCoordinates[]>([]);
    const wiggleTimeoutRef = useRef<number | null>(null);
    const [hintCells, setHintCells] = useState<CellCoordinates[]>([]);
    const hintTimeoutRef = useRef<number | null>(null);

    // Game Over & Summary Panel State
    const [isGameOver, setIsGameOver] = useState<boolean>(false);
    const [hasAcknowledgedGameOver, setHasAcknowledgedGameOver] = useState<boolean>(false);
    const [showEndGamePanelOverride, setShowEndGamePanelOverride] = useState<boolean>(false);
    // Use Record for combined summary data state
    const [combinedSummaryData, setCombinedSummaryData] = useState<Partial<Record<DifficultyLevel, LevelCompletionSummary | null>>>({});


    // Helper function to calculate hint coordinates
    const calculateHintCoordinates = useCallback((
        possibleMoves: ExplorationNodeData[] | null,
        currentGrid: string[][] | null
    ): CellCoordinates[] => {
        if (!currentGrid || !possibleMoves || possibleMoves.length === 0) return [];
        let optimalMoveNode: ExplorationNodeData | null = null;
        let highestDepth = -1;
        for (const node of possibleMoves) {
            if (typeof node.maxDepthReached === 'number' && node.maxDepthReached > highestDepth) {
                highestDepth = node.maxDepthReached;
                optimalMoveNode = node;
            }
        }
        if (optimalMoveNode && optimalMoveNode.move && optimalMoveNode.wordsFormed && optimalMoveNode.wordsFormed.length > 0) {
            const wordToHighlight = optimalMoveNode.wordsFormed[0];
            const moveDetails = optimalMoveNode.move;
            // Create a temporary grid to simulate the move for coordinate finding
            const tempGrid = currentGrid.map(r => [...r]);
            const fromCellChar = tempGrid[moveDetails.from[0]][moveDetails.from[1]];
            const toCellChar = tempGrid[moveDetails.to[0]][moveDetails.to[1]];
            tempGrid[moveDetails.from[0]][moveDetails.from[1]] = toCellChar;
            tempGrid[moveDetails.to[0]][moveDetails.to[1]] = fromCellChar;
            const wordCoordinates = findWordCoordinates(tempGrid, wordToHighlight, moveDetails);
            return wordCoordinates || [];
        }
        return [];
    }, []);

    // Effect for Dark Mode
    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('darkMode', JSON.stringify(true));
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('darkMode', JSON.stringify(false));
        }
    }, [darkMode]);

    // Effect to set current date and initial difficulty/progress on mount
    useEffect(() => {
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
                localStorage.removeItem(progressKey); // Clear corrupted data
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

    }, []); 
    
    // Master reset game states, typically used for new level loading or critical errors
    const masterResetGameStates = useCallback(() => {
        // Clear any running timers
        if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current);
        if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);

        const initial = getInitialGameState(null); // Get pure default initial states
        setGrid(initial.grid);
        setCurrentPossibleMoves(initial.currentPossibleMoves);
        setCurrentDepth(initial.currentDepth);
        setHistory(initial.history);
        setHasDeviated(initial.hasDeviated);
        setIsInvalidMove(initial.isInvalidMove);
        setInvalidMoveMessage(initial.invalidMoveMessage);
        setSelectedCell(initial.selectedCell);
        setHoveredCell(initial.hoveredCell);
        setDraggedCell(initial.draggedCell);
        setWiggleCells([]); // Ensure this is an empty array
        setTurnFailedAttempts(0);
        setHintCells([]); // Ensure this is an empty array
        setAnimationState(initial.animationState);

        // Reset game over and panel states
        setIsGameOver(false);
        setHasAcknowledgedGameOver(false);
        setShowEndGamePanelOverride(false);
        setCombinedSummaryData({}); // Clear any combined summary data
        
        setGameData(null); // Critical: Set gameData to null to ensure loadLevelDataInternal fetches fresh
        setReloadTrigger(prev => prev + 1); // Trigger the useEffect for loading data
    }, []);


    // Effect to load level data when currentDate, difficulty, or reloadTrigger changes
    useEffect(() => {
        const loadLevelDataInternal = async (date: Date, diff: DifficultyLevel) => {
            if (!date) return;

            // Reset states before loading new level data
            const freshInitialStates = getInitialGameState(null);
            setGrid(freshInitialStates.grid); 
            setCurrentPossibleMoves(freshInitialStates.currentPossibleMoves);
            setCurrentDepth(freshInitialStates.currentDepth);
            setHistory(freshInitialStates.history);
            setHasDeviated(false);
            setIsInvalidMove(freshInitialStates.isInvalidMove);
            setInvalidMoveMessage(freshInitialStates.invalidMoveMessage);
            setSelectedCell(freshInitialStates.selectedCell);
            setHoveredCell(freshInitialStates.hoveredCell);
            setDraggedCell(freshInitialStates.draggedCell);
            setWiggleCells([]);
            setTurnFailedAttempts(0);
            setHintCells([]);
            setAnimationState(freshInitialStates.animationState);
            setIsGameOver(false); 
            setHasAcknowledgedGameOver(false); 
            
            if (!loading) setLoading(true); 
            setError(null); 
            setShowEndGamePanelOverride(false); 

            try {
                const basePath = ''; 
                const response = await fetch(`${basePath}/levels/${diff}/${getDataFilePath(date)}`);
                if (!response.ok) {
                    if (response.status === 404) throw new Error(`Today's ${diff} level is not available yet. Please check back later!`);
                    throw new Error(`Failed to fetch ${diff} level for ${getFormattedDate(date)} (HTTP ${response.status})`);
                }
                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    const textResponse = await response.text();
                    console.error('Received non-JSON content type:', contentType, 'Response text:', textResponse);
                    throw new Error(`Received non-JSON response for ${diff} level ${getFormattedDate(date)}.`);
                }
                const fetchedGameData: GameData = await response.json();
                setGameData(fetchedGameData); 

                const savedGameStateString = localStorage.getItem(`wordChainsState-${getFormattedDate(date)}-${diff}`);
                
                let currentGridToSet: string[][] = fetchedGameData.initialGrid.map(r => [...r]);
                let currentHistoryToSet: HistoryEntry[] = [];
                let loadedDepth = 0;
                let currentTurnFailedAttempts = 0;
                let currentHasDeviated = false;
                let currentPossibleMovesToSet: ExplorationNodeData[] = fetchedGameData.explorationTree ? [...fetchedGameData.explorationTree] : [];
                
                let initialGameOver = false;
                let initialAcknowledged = false;


                if (savedGameStateString) {
                    try {
                        const savedState = JSON.parse(savedGameStateString);
                        currentGridToSet = savedState.lastGrid || fetchedGameData.initialGrid.map(r => [...r]);
                        currentHistoryToSet = savedState.history || [];
                        loadedDepth = savedState.currentDepth || 0;
                        currentTurnFailedAttempts = savedState.turnFailedAttempts || 0;
                        currentHasDeviated = savedState.hasDeviated || false;

                        if (currentHistoryToSet.length > 0 && fetchedGameData.explorationTree) {
                            let currentNodeSet = fetchedGameData.explorationTree ? [...fetchedGameData.explorationTree] : [];
                            let historyPathFound = true;
                            for (const histEntry of currentHistoryToSet) {
                                if (!histEntry.moveMade || !currentNodeSet || currentNodeSet.length === 0) {
                                    historyPathFound = false; break;
                                }
                                const { from: histFrom, to: histTo } = histEntry.moveMade;
                                if (typeof histFrom?.row !== 'number' || typeof histFrom?.col !== 'number' ||
                                    typeof histTo?.row !== 'number' || typeof histTo?.col !== 'number') {
                                    historyPathFound = false; break;
                                }
                                const matchedNode = currentNodeSet.find(n => {
                                    if (!n.move) return false;
                                    const opt1 = n.move.from[0] === histFrom.row && n.move.from[1] === histFrom.col && n.move.to[0] === histTo.row && n.move.to[1] === histTo.col;
                                    const opt2 = n.move.from[0] === histTo.row && n.move.from[1] === histTo.col && n.move.to[0] === histFrom.row && n.move.to[1] === histFrom.col;
                                    return opt1 || opt2;
                                });
                                if (matchedNode && matchedNode.nextMoves) currentNodeSet = matchedNode.nextMoves;
                                else { historyPathFound = false; break; }
                            }
                            if (historyPathFound) currentPossibleMovesToSet = currentNodeSet;
                            else {
                                console.warn("History traversal failed during load. Possible moves might be incorrect.");
                                currentPossibleMovesToSet = []; 
                            }
                        } else if (currentHistoryToSet.length === 0) {
                             currentPossibleMovesToSet = fetchedGameData.explorationTree ? [...fetchedGameData.explorationTree] : [];
                        }
                    } catch (e) {
                        console.error("Failed to parse saved game state, resetting to initial for this level:", e);
                        localStorage.removeItem(`wordChainsState-${getFormattedDate(date)}-${diff}`);
                        currentGridToSet = fetchedGameData.initialGrid.map(r => [...r]);
                        currentHistoryToSet = [];
                        loadedDepth = 0;
                        currentTurnFailedAttempts = 0;
                        currentHasDeviated = false;
                        currentPossibleMovesToSet = fetchedGameData.explorationTree ? [...fetchedGameData.explorationTree] : [];
                    }
                }
                
                const progressKey = `wordChainsProgress-${getFormattedDate(date)}`;
                const savedProgress = localStorage.getItem(progressKey);
                if (savedProgress) {
                    try {
                        const progressData: DailyProgressStorage = JSON.parse(savedProgress);
                        if (progressData[diff]?.completed) {
                            initialGameOver = true;
                            initialAcknowledged = true; 
                        }
                    } catch (e) { console.error("Failed to parse daily progress for game over check:", e); }
                }
                if (!initialGameOver && loadedDepth === fetchedGameData.maxDepthReached && loadedDepth > 0) {
                    initialGameOver = true;
                    initialAcknowledged = false; 
                }
                
                setGrid(currentGridToSet);
                setHistory(currentHistoryToSet);
                setCurrentDepth(loadedDepth);
                setTurnFailedAttempts(currentTurnFailedAttempts);
                setHasDeviated(currentHasDeviated);
                setCurrentPossibleMoves(currentPossibleMovesToSet);
                setIsGameOver(initialGameOver);
                setHasAcknowledgedGameOver(initialAcknowledged);

            } catch (err: any) {
                setError(err.message);
                setGameData(null); 
                setGrid(null); 
                setCurrentPossibleMoves([]);
                setIsGameOver(false); 
                setHasAcknowledgedGameOver(false);
            } finally {
                setLoading(false); 
            }
        };

        if (currentDate) {
            loadLevelDataInternal(currentDate, difficulty);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentDate, difficulty, reloadTrigger]); 

    // Memoized live game values
    const liveOptimalPathWords = useMemo(() => {
        if (gameData) {
            try {
                return findLongestWordChain(gameData.explorationTree, history);
            } catch (error) {
                console.error("Error in findLongestWordChain:", error);
                return [];
            }
        }
        return [];
    }, [gameData, history]); 

    const livePlayerUniqueWordsFound = useMemo(() => {
        const words = new Set<string>();
        history.forEach(state => { if (Array.isArray(state.wordsFormedByMove)) { state.wordsFormedByMove.forEach(word => words.add(word)); } });
        return words;
    }, [history]);
    const liveMaxDepthAttainable = gameData ? gameData.maxDepthReached : 0;
    const wordLength = gameData ? gameData.wordLength : 4; 

    // Effect to save game state to localStorage (for resuming current play)
    useEffect(() => {
        if (!loading && gameData && currentDate && difficulty && grid && history) { 
            const gameStateToSave = {
                lastGrid: grid,
                history,
                currentDepth,
                turnFailedAttempts,
                hasDeviated,
            };
            localStorage.setItem(
                `wordChainsState-${getFormattedDate(currentDate)}-${difficulty}`,
                JSON.stringify(gameStateToSave)
            );
        }
    }, [grid, history, currentDepth, turnFailedAttempts, hasDeviated, currentDate, difficulty, gameData, loading]);

    // Effect to determine natural game over state (stuck or completed)
    useEffect(() => {
        if (showEndGamePanelOverride || loading || !gameData || animationState.animating) {
            return;
        }

        const levelCompleted = currentDepth === liveMaxDepthAttainable && liveMaxDepthAttainable > 0;
        const stuck = !levelCompleted && currentDepth > 0 && currentPossibleMoves && currentPossibleMoves.length === 0;
        const shouldBeGameOver = levelCompleted || stuck;

        if (shouldBeGameOver) {
            if (!isGameOver) {
                setIsGameOver(true);
                setHasAcknowledgedGameOver(false); 
            }
        } else {
            if (isGameOver) {
                setIsGameOver(false);
                setHasAcknowledgedGameOver(false); 
            }
        }
    }, [
        gameData, animationState.animating, showEndGamePanelOverride, currentDepth,
        liveMaxDepthAttainable, currentPossibleMoves, isGameOver, loading, 
    ]);

    // Effect to save detailed summary on level completion
    useEffect(() => {
        if (
            isGameOver && 
            !hasAcknowledgedGameOver && 
            !showEndGamePanelOverride && 
            currentDepth === liveMaxDepthAttainable && 
            liveMaxDepthAttainable > 0 && 
            currentDate &&
            gameData &&
            !loading
        ) {
            const progressKey = `wordChainsProgress-${getFormattedDate(currentDate)}`;
            const existingProgressString = localStorage.getItem(progressKey);
            let dailyProgressDataFromStorage: DailyProgressStorage = {};
            if (existingProgressString) {
                try {
                    dailyProgressDataFromStorage = JSON.parse(existingProgressString);
                } catch (e) {
                    console.error("Failed to parse daily progress for summary saving, resetting.", e);
                    dailyProgressDataFromStorage = {}; 
                    localStorage.removeItem(progressKey);
                }
            }

            // Check if this specific difficulty is already marked completed in storage
            if (dailyProgressDataFromStorage[difficulty]?.completed) {
                // If it is, but our React state `dailyProgress` doesn't reflect it (e.g., after a quick refresh), update React state.
                if (!dailyProgress[difficulty]) {
                    setDailyProgress((prev) => ({ ...prev, [difficulty]: true }));
                }
                return; // Don't re-save if already in localStorage
            }

            const summaryToSave: LevelCompletionSummary = {
                history: history, 
                score: currentDepth,
                playerWords: Array.from(livePlayerUniqueWordsFound),
                maxScore: liveMaxDepthAttainable,
                optimalPathWords: liveOptimalPathWords, 
                difficultyForSummary: difficulty,
            };

            dailyProgressDataFromStorage[difficulty] = { completed: true, summary: summaryToSave };
            setDailyProgress((prev) => ({ ...prev, [difficulty]: true })); // Update React state for immediate UI feedback
            localStorage.setItem(progressKey, JSON.stringify(dailyProgressDataFromStorage)); // Save to localStorage
        }
    }, [
        isGameOver, hasAcknowledgedGameOver, showEndGamePanelOverride, currentDepth, 
        liveMaxDepthAttainable, currentDate, gameData, difficulty, history, 
        livePlayerUniqueWordsFound, liveOptimalPathWords, loading, dailyProgress 
    ]);


    // Effect to show hint after 3 failed attempts
    useEffect(() => {
        if (difficulty === 'impossible') {
            setHintCells([]); 
            if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
            return;
        }
        if (turnFailedAttempts >= 3 && !isGameOver && !showEndGamePanelOverride && !loading && grid) { 
            const coordinates = calculateHintCoordinates(currentPossibleMoves, grid);
            if (coordinates.length > 0) {
                setHintCells(coordinates);
                if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
                hintTimeoutRef.current = window.setTimeout(() => {
                    setHintCells([]);
                    hintTimeoutRef.current = null;
                }, 3000);
            }
        }
    }, [turnFailedAttempts, currentPossibleMoves, grid, calculateHintCoordinates, isGameOver, showEndGamePanelOverride, loading, difficulty]);

    // Effect for cleanup
    useEffect(() => {
        return () => {
            if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
            if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
            if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current);
            if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
        };
    }, []);

    // Event Handlers
    const triggerWiggle = useCallback((cell1: CellCoordinates, cell2: CellCoordinates) => {
        if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current);
        setWiggleCells([cell1, cell2]);
        wiggleTimeoutRef.current = window.setTimeout(() => {
            setWiggleCells([]);
            wiggleTimeoutRef.current = null;
        }, 500);
    }, []);

    const incrementFailedAttempts = useCallback(() => {
        setTurnFailedAttempts((prev) => prev + 1);
    }, []);

    const performSwap = useCallback(
        (cell1: CellCoordinates, cell2: CellCoordinates) => {
            if (
                !cell1 || !cell2 || animationState.animating ||
                (isGameOver && !hasAcknowledgedGameOver) || 
                !gameData || !grid || showEndGamePanelOverride || loading
            ) return;

            setSelectedCell(null);
            setDraggedCell(null);
            setHoveredCell(null);

            let matchedNode: ExplorationNodeData | null = null;
            const moveOption1 = { from: [cell1.row, cell1.col], to: [cell2.row, cell2.col] };
            const moveOption2 = { from: [cell2.row, cell2.col], to: [cell1.row, cell1.col] };

            if (currentPossibleMoves && currentPossibleMoves.length > 0) {
                for (const node of currentPossibleMoves) {
                    if (!node.move) continue;
                    const nodeMove = node.move;
                    const fromMatch1 = nodeMove.from[0] === moveOption1.from[0] && nodeMove.from[1] === moveOption1.from[1];
                    const toMatch1 = nodeMove.to[0] === moveOption1.to[0] && nodeMove.to[1] === moveOption1.to[1];
                    const fromMatch2 = nodeMove.from[0] === moveOption2.from[0] && nodeMove.from[1] === moveOption2.from[1];
                    const toMatch2 = nodeMove.to[0] === moveOption2.to[0] && nodeMove.to[1] === moveOption2.to[1];
                    if ((fromMatch1 && toMatch1) || (fromMatch2 && toMatch2)) {
                        matchedNode = node;
                        break;
                    }
                }
            }

            if (matchedNode) {
                const wordsFormedByMove = matchedNode.wordsFormed || [];
                const isDeviatedMove = (currentDepth + 1 + (matchedNode.maxDepthReached || 0)) < liveMaxDepthAttainable;

                setHasDeviated(prevHasDeviated => prevHasDeviated || isDeviatedMove);
                setTurnFailedAttempts(0);
                setHintCells([]);
                if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
                
                setHistory((prevHistory) => [
                    ...prevHistory,
                    {
                        grid: grid!, 
                        currentPossibleMoves, 
                        currentDepth,         
                        moveMade: { 
                            from: {row: matchedNode!.move!.from[0], col: matchedNode!.move!.from[1]},
                            to: {row: matchedNode!.move!.to[0], col: matchedNode!.move!.to[1]}
                        },
                        wordsFormedByMove,
                        turnFailedAttempts,   
                        isDeviated: hasDeviated, 
                    },
                ]);

                setAnimationState({ animating: true, from: cell1, to: cell2 });
                setIsInvalidMove(false);
                setInvalidMoveMessage('');
                if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
                setHighlightedCells([]);

                animationTimeoutRef.current = window.setTimeout(() => {
                    const newGrid = grid!.map((r) => [...r]); 
                    const temp = newGrid[cell1.row][cell1.col];
                    newGrid[cell1.row][cell1.col] = newGrid[cell2.row][cell2.col];
                    newGrid[cell2.row][cell2.col] = temp;
                    
                    const nextDepth = currentDepth + 1;
                    setGrid(newGrid); 

                    const nextPossibleMoves = matchedNode!.nextMoves || [];
                    setCurrentPossibleMoves(nextPossibleMoves);
                    setCurrentDepth(nextDepth);
                    setAnimationState({ animating: false, from: null, to: null });
                    animationTimeoutRef.current = null;

                    let allFoundCoords: CellCoordinates[] = [];
                    if (matchedNode && matchedNode.move && Array.isArray(wordsFormedByMove)) {
                        wordsFormedByMove.forEach((word: string) => {
                            const coordsAttempt = findWordCoordinates(newGrid, word, matchedNode!.move!);
                            if (coordsAttempt && coordsAttempt.length > 0) {
                                allFoundCoords.push(...coordsAttempt); 
                            } else {
                                console.warn(`findWordCoordinates did not return valid coordinates for word "${word}".`, {
                                    searchDetails: {
                                        wordToFind: word,
                                        gridSearched: newGrid.map(r => r.join('')), 
                                        moveContextUsedForSearch: matchedNode!.move!, 
                                    },
                                    appContext: {
                                        appWordLength: gameData?.wordLength,
                                        gameDataIsAvailable: !!gameData,
                                        currentDepthAfterMove: nextDepth,
                                        difficulty: difficulty,
                                    },
                                    rawReturnedCoords: coordsAttempt 
                                });
                            }
                        });
                    }
                    
                    const uniqueHighlightedCellsMap = new Map<string, CellCoordinates>();
                    allFoundCoords.forEach(coord => {
                        if (coord && typeof coord.row === 'number' && typeof coord.col === 'number') {
                            uniqueHighlightedCellsMap.set(`${coord.row}-${coord.col}`, coord);
                        }
                    });
                    const finalUniqueHighlightedCells = Array.from(uniqueHighlightedCellsMap.values());
                    setHighlightedCells(finalUniqueHighlightedCells);

                    highlightTimeoutRef.current = window.setTimeout(() => {
                        setHighlightedCells([]);
                        highlightTimeoutRef.current = null;
                    }, 1500);
                }, 300);
            } else {
                setIsInvalidMove(true);
                setInvalidMoveMessage('Invalid Move! No new word found!');
                triggerWiggle(cell1, cell2);
                incrementFailedAttempts();
            }
        },
        [
            grid, currentPossibleMoves, currentDepth, animationState.animating, isGameOver, hasAcknowledgedGameOver,
            gameData, triggerWiggle, incrementFailedAttempts, showEndGamePanelOverride, loading,
            liveMaxDepthAttainable, hasDeviated, difficulty 
        ]
    );

    const handleDragStart = useCallback(
        (cellCoords: CellCoordinates) => {
            if (animationState.animating || (isGameOver && !hasAcknowledgedGameOver) || !gameData || showEndGamePanelOverride || loading) return;
            setDraggedCell(cellCoords);
            setSelectedCell(null); 
            setIsInvalidMove(false);
            setInvalidMoveMessage('');
            setHoveredCell(null);
            if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
            setHighlightedCells([]);
            if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current);
            setWiggleCells([]);
            if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
            setHintCells([]);
        },
        [animationState.animating, isGameOver, hasAcknowledgedGameOver, gameData, showEndGamePanelOverride, loading]
    );

    const handleDragEnter = useCallback(
        (cellCoords: CellCoordinates) => {
            if (draggedCell && (draggedCell.row !== cellCoords.row || draggedCell.col !== cellCoords.col)) {
                if (areAdjacent(draggedCell, cellCoords)) setHoveredCell(cellCoords);
                else setHoveredCell(null);
            }
        },
        [draggedCell]
    );

    const handleDragLeave = useCallback(
        (cellCoords: CellCoordinates) => {
            if (hoveredCell && hoveredCell.row === cellCoords.row && hoveredCell.col === cellCoords.col) {
                setHoveredCell(null);
            }
        },
        [hoveredCell]
    );

    const handleDragEnd = useCallback(() => {
        setDraggedCell(null);
        setHoveredCell(null);
    }, []);

    const handleDrop = useCallback(
        (targetCellCoords: CellCoordinates) => {
            if (!draggedCell || showEndGamePanelOverride || loading || (isGameOver && !hasAcknowledgedGameOver)) {
                setDraggedCell(null); 
                setHoveredCell(null);
                return;
            }
            const sourceCell = draggedCell;
            setHoveredCell(null); 
            if (sourceCell.row === targetCellCoords.row && sourceCell.col === targetCellCoords.col) {
                setDraggedCell(null); 
                return;
            }
            if (!areAdjacent(sourceCell, targetCellCoords)) {
                setIsInvalidMove(true);
                setInvalidMoveMessage('Must swap adjacent cells.');
                triggerWiggle(sourceCell, targetCellCoords);
                incrementFailedAttempts();
                setDraggedCell(null); 
                return;
            }
            performSwap(sourceCell, targetCellCoords);
            setDraggedCell(null); 
        },
        [draggedCell, performSwap, triggerWiggle, incrementFailedAttempts, showEndGamePanelOverride, loading, isGameOver, hasAcknowledgedGameOver]
    );

    const handleCellClick = useCallback(
        (cellCoords: CellCoordinates) => {
            if (animationState.animating || (isGameOver && !hasAcknowledgedGameOver) || !gameData || draggedCell || showEndGamePanelOverride || loading) return;

            setIsInvalidMove(false);
            setInvalidMoveMessage('');
            if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
            setHighlightedCells([]);
            if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current);
            setWiggleCells([]);
            if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
            setHintCells([]);

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
        },
        [selectedCell, animationState.animating, isGameOver, hasAcknowledgedGameOver, gameData, performSwap, draggedCell, showEndGamePanelOverride, loading]
    );
    
    const handleReset = useCallback(() => {
        if (!currentDate || !gameData || showEndGamePanelOverride || animationState.animating) {
            console.warn("Reset blocked: Conditions not met (no game data, panel override, or animation in progress).");
            return;
        }
    
        if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current);
        if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
    
        setGrid(gameData.initialGrid.map(row => [...row])); 
        setCurrentPossibleMoves(gameData.explorationTree ? [...gameData.explorationTree] : []); 
        setCurrentDepth(0);
        setHistory([]); 
        setHasDeviated(false); 
        setTurnFailedAttempts(0); 
    
        setSelectedCell(null);
        setDraggedCell(null);
        setHoveredCell(null);
        setIsInvalidMove(false);
        setInvalidMoveMessage('');
    
        setAnimationState({ animating: false, from: null, to: null }); 
        setHighlightedCells([]);
        setWiggleCells([]);
        setHintCells([]);
    
        setIsGameOver(false);
        setHasAcknowledgedGameOver(false); 
    
        if (difficulty && currentDate) { 
             localStorage.removeItem(`wordChainsState-${getFormattedDate(currentDate)}-${difficulty}`);
        }
    
    }, [currentDate, difficulty, gameData, showEndGamePanelOverride, animationState.animating]);


    const handleBack = useCallback(() => {
        if (history.length === 0 || animationState.animating || (isGameOver && !hasAcknowledgedGameOver) || showEndGamePanelOverride || loading) return;

        if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current);
        if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);

        setShowEndGamePanelOverride(false); 

        const previousState = history[history.length - 1];
        const moveToundo = previousState.moveMade;

        if (!moveToundo || !previousState.grid) {
            console.error("Cannot undo: Critical history data missing.", previousState);
            handleReset(); 
            return;
        }

        const previousTurnFailedAttempts = previousState.turnFailedAttempts ?? 0;
        const previousStateWasDeviated = previousState.isDeviated || false;
        
        const fromUndoCell: CellCoordinates | null = (moveToundo.to && typeof moveToundo.to.row === 'number') ? moveToundo.to : null;
        const toUndoCell: CellCoordinates | null = (moveToundo.from && typeof moveToundo.from.row === 'number') ? moveToundo.from : null;

        if (!fromUndoCell || !toUndoCell) {
            console.error("Cannot undo: move coordinates in history are invalid.", moveToundo);
            handleReset();
            return;
        }

        setAnimationState({ animating: true, from: fromUndoCell, to: toUndoCell });

        setIsInvalidMove(false);
        setInvalidMoveMessage("");
        setHighlightedCells([]);
        setSelectedCell(null);
        setDraggedCell(null);
        setHoveredCell(null);
        setWiggleCells([]);
        setHintCells([]);

        animationTimeoutRef.current = window.setTimeout(() => {
            setGrid(previousState.grid!.map(r => [...r])); 
            setCurrentPossibleMoves(previousState.currentPossibleMoves ? [...previousState.currentPossibleMoves] : (gameData?.explorationTree || [])); 
            setCurrentDepth(previousState.currentDepth); 
            setHistory((prevHistory) => prevHistory.slice(0, -1)); 
            setAnimationState({ animating: false, from: null, to: null });
            setHasDeviated(previousStateWasDeviated); 
            setTurnFailedAttempts(previousTurnFailedAttempts); 
            
            const levelCompletedAfterUndo = previousState.currentDepth === liveMaxDepthAttainable && liveMaxDepthAttainable > 0;
            const stuckAfterUndo = !levelCompletedAfterUndo && previousState.currentDepth > 0 && 
                                 (previousState.currentPossibleMoves && previousState.currentPossibleMoves.length === 0);
            
            if (!(levelCompletedAfterUndo || stuckAfterUndo) && isGameOver) {
                setIsGameOver(false);
                setHasAcknowledgedGameOver(false);
            }

            animationTimeoutRef.current = null;
        }, 300);
    }, [
        history, animationState.animating, isGameOver, hasAcknowledgedGameOver, showEndGamePanelOverride, loading, 
        handleReset, liveMaxDepthAttainable, gameData 
    ]);

    const handleCloseGameOver = useCallback(() => {
        setHasAcknowledgedGameOver(true); 
        setShowEndGamePanelOverride(false); 
    }, []);

    const handlePlayMode = useCallback(
        (newDifficulty: DifficultyLevel) => {
            if (loading || showEndGamePanelOverride || difficulty === newDifficulty || animationState.animating) return; 

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
        },
        [masterResetGameStates, loading, showEndGamePanelOverride, difficulty, dailyProgress, animationState.animating]
    );


    const handleHintButtonClick = useCallback(() => {
        if (difficulty === 'impossible' || animationState.animating || showEndGamePanelOverride || isGameOver || loading || !grid || hintCells.length > 0) {
            return;
        }
        const coordinates = calculateHintCoordinates(currentPossibleMoves, grid);
        if (coordinates.length > 0) {
            setHintCells(coordinates);
            if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
            hintTimeoutRef.current = window.setTimeout(() => { setHintCells([]); hintTimeoutRef.current = null; }, 3000);
        }
    }, [currentPossibleMoves, grid, calculateHintCoordinates, difficulty, animationState.animating, showEndGamePanelOverride, isGameOver, loading, hintCells.length]);

    const handleShowGameSummary = useCallback(() => { 
        if (!currentDate || loading) {
            console.warn("Cannot show summary: Current date not set or app is loading.");
            return;
        }
        const progressKey = `wordChainsProgress-${getFormattedDate(currentDate)}`;
        const savedProgressString = localStorage.getItem(progressKey);
        let loadedNormalSummary: LevelCompletionSummary | null = null;
        let loadedHardSummary: LevelCompletionSummary | null = null;
        let loadedImpossibleSummary: LevelCompletionSummary | null = null; 

        if (savedProgressString) {
            try {
                const parsedProgress: DailyProgressStorage = JSON.parse(savedProgressString);
                loadedNormalSummary = parsedProgress.normal?.summary || null;
                loadedHardSummary = parsedProgress.hard?.summary || null;
                loadedImpossibleSummary = parsedProgress.impossible?.summary || null; 
            } catch (e) {
                console.error("Failed to parse saved progress for summary view:", e);
            }
        }

        if (loadedNormalSummary || loadedHardSummary || loadedImpossibleSummary) {
            setCombinedSummaryData({
                normal: loadedNormalSummary,
                hard: loadedHardSummary,
                impossible: loadedImpossibleSummary, 
            });
            setShowEndGamePanelOverride(true);
            setHasAcknowledgedGameOver(true); 
        } else {
            console.warn(`No saved summaries found for ${getFormattedDate(currentDate)}. Cannot show combined summary.`);
        }
    }, [currentDate, loading]); 


    const renderWordChain = () => {
        const displayHistory = (!showEndGamePanelOverride && history) ? history : []; 

        if (displayHistory.length === 0) return <div className="min-h-[2rem] mt-4"></div>; 
        return (
            <div className="flex flex-wrap items-center justify-center mt-4 gap-x-2 gap-y-1 text-lg px-4 pb-2">
                {displayHistory.map((histEntry, index) => (
                    <div key={`hist-${index}`} className="inline-flex items-baseline">
                        <span className={`px-2 py-1 rounded font-medium text-sm sm:text-base
                                         ${histEntry.isDeviated ? 'bg-orange-100 dark:bg-orange-800 text-orange-800 dark:text-orange-200' 
                                                              : 'bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200'}`}>
                            {histEntry.wordsFormedByMove?.[0]?.toUpperCase() || '???'}
                            {histEntry.wordsFormedByMove && histEntry.wordsFormedByMove.length > 1 ? '...' : ''}
                        </span>
                        {index < displayHistory.length - 1 && 
                            <span className="text-gray-500 dark:text-gray-400 font-bold mx-1">→</span>
                        }
                    </div>
                ))}
            </div>
        );
    };

    // --- Conditional Rendering for Loading/Error States ---
    if (loading && !gameData) return <div className={`flex justify-center items-center min-h-screen text-gray-700 dark:text-gray-300 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>Loading {difficulty} level for {currentDate ? getFormattedDate(currentDate) : 'today'}...</div>;
    if (error) return (
        <div className="flex flex-col justify-center items-center min-h-screen text-center px-4">
            <p className="text-red-600 dark:text-red-400 text-xl font-semibold">Error</p>
            <p className="text-gray-700 dark:text-gray-300 mt-2">{error}</p>
            <button onClick={() => { setLoading(true); masterResetGameStates(); setDifficulty('normal'); setCurrentDate(new Date()); }} className="cursor-pointer mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600">Try Again</button>
        </div>
    );
    if (!gameData && !loading) return <div className="flex justify-center items-center min-h-screen text-gray-500 dark:text-gray-400">Game data could not be loaded. Please ensure levels are available or try again later.</div>;

    // Determine props for EndGamePanel
    let normalDataForPanel: LevelResultData | null = null;
    let hardDataForPanel: LevelResultData | null = null;
    let impossibleDataForPanel: LevelResultData | null = null; 

    const shouldShowEndGamePanel = (isGameOver && !hasAcknowledgedGameOver && !loading) || (showEndGamePanelOverride && !loading) ;

    if (shouldShowEndGamePanel) {
        if (showEndGamePanelOverride && combinedSummaryData) {
            // If panel is shown via "View Summaries" button, use combinedSummaryData
            normalDataForPanel = combinedSummaryData.normal ? { ...combinedSummaryData.normal, levelCompleted: combinedSummaryData.normal.score === combinedSummaryData.normal.maxScore } : null;
            hardDataForPanel = combinedSummaryData.hard ? { ...combinedSummaryData.hard, levelCompleted: combinedSummaryData.hard.score === combinedSummaryData.hard.maxScore } : null;
            impossibleDataForPanel = combinedSummaryData.impossible ? { ...combinedSummaryData.impossible, levelCompleted: combinedSummaryData.impossible.score === combinedSummaryData.impossible.maxScore } : null;
        } else if (isGameOver && !hasAcknowledgedGameOver && gameData && currentDate) {
            // If panel is shown due to natural game completion (or being stuck)
            const liveDataForCurrentDifficulty: LevelResultData = {
                history: history,
                score: currentDepth,
                maxScore: liveMaxDepthAttainable,
                optimalPathWords: liveOptimalPathWords,
                levelCompleted: currentDepth === liveMaxDepthAttainable && liveMaxDepthAttainable > 0,
            };

            // Fetch all saved summaries from localStorage for other difficulties
            const progressKey = `wordChainsProgress-${getFormattedDate(currentDate)}`;
            const savedProgressString = localStorage.getItem(progressKey);
            let allSavedSummaries: DailyProgressStorage = {};
            if (savedProgressString) {
                try {
                    allSavedSummaries = JSON.parse(savedProgressString);
                } catch (e) {
                    console.error("Failed to parse saved progress for panel data:", e);
                }
            }

            // Populate panel data for each difficulty
            difficulties.forEach(diffLevel => {
                let dataToSet: LevelResultData | null = null;
                if (diffLevel === difficulty) { // Current difficulty uses live data
                    dataToSet = liveDataForCurrentDifficulty;
                } else if (allSavedSummaries[diffLevel]?.summary) { // Other difficulties use saved summary if available
                    const summary = allSavedSummaries[diffLevel]!.summary!;
                    dataToSet = {
                        history: summary.history,
                        score: summary.score,
                        maxScore: summary.maxScore,
                        optimalPathWords: summary.optimalPathWords,
                        levelCompleted: summary.score === summary.maxScore,
                    };
                }

                if (diffLevel === 'normal') normalDataForPanel = dataToSet;
                else if (diffLevel === 'hard') hardDataForPanel = dataToSet;
                else if (diffLevel === 'impossible') impossibleDataForPanel = dataToSet;
            });
        }
    }


    const levelActuallyCompleted = currentDepth === liveMaxDepthAttainable && liveMaxDepthAttainable > 0;
    const noMoreValidMoves = gameData && currentPossibleMoves && currentPossibleMoves.length === 0 && !levelActuallyCompleted && currentDepth > 0; 
    
    const showNoMoreValidMovesMessage = noMoreValidMoves && !levelActuallyCompleted && !showEndGamePanelOverride && !loading;
    const showDeviatedMessage = hasDeviated && !levelActuallyCompleted && !showNoMoreValidMovesMessage && !loading; 
    const isCurrentlyOptimal = !hasDeviated && currentDepth > 0; 
    const showOptimalMessage = isCurrentlyOptimal && !levelActuallyCompleted && !showNoMoreValidMovesMessage && !showDeviatedMessage && !loading;


    return (
        <div className={`flex flex-col items-center justify-start min-h-screen p-4 font-sans pt-8 transition-colors duration-300 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
            <button
                onClick={() => setDarkMode(!darkMode)}
                className="cursor-pointer absolute top-4 right-4 p-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors duration-200"
                title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
                {darkMode ? <i className="fas fa-sun"></i> : <i className="fas fa-moon"></i>}
            </button>

            <h1 className="text-4xl sm:text-5xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-gradient-flow font-bungee">
                <a href="/">Word Chain 🔗</a>
            </h1>
            <h2 className="text-xl sm:text-2xl mb-1 text-gray-700 dark:text-gray-300">
                {currentDate ? getFriendlyDate(currentDate) : 'Loading date...'}
                <span className="capitalize text-lg sm:text-xl"> ({difficulty}) </span>
                {dailyProgress.normal && dailyProgress.hard && dailyProgress.impossible && <i className="fas fa-trophy text-yellow-500 ml-2" title="All levels completed for today!"></i>}
            </h2>

            <div className="text-center max-w-xl mb-2 text-sm text-gray-600 dark:text-gray-400 px-2">
                {difficulty === 'normal' &&
                    <p><span className="font-semibold mb-1">How to Play:</span> Swap adjacent letters. Every swap <i>must</i> make a new {wordLength}-letter word (horizontally or vertically). Find the longest sequence of swaps! Tap <i className="fas fa-lightbulb"></i> for a hint.</p>}
                {difficulty === 'hard' &&
                    <p><span className="font-semibold mb-1">Hard Mode:</span> A larger grid and more complex chains! Swaps must form a new <strong>{wordLength}-letter</strong> word (horizontally or vertically). Tap <i className="fas fa-lightbulb"></i> for a hint.</p>}
                {difficulty === 'impossible' &&
                    <p><span className="font-semibold mb-1">Impossible Mode:</span> The ultimate test on a sprawling grid! <strong>No hints.</strong> Swaps must form a new <i>{wordLength}-letter</i> word. Good luck!</p>}
            </div>

            {dailyProgress.normal && dailyProgress.hard && dailyProgress.impossible && (
                <div className="text-center max-w-xl my-2 p-3 rounded-md bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700">
                    <p className="text-md font-semibold text-green-700 dark:text-green-300"><strong>Awesome! You've conquered all levels for today!</strong></p>
                    <p className="text-sm text-green-600 dark:text-green-400">Check back tomorrow for new challenges.</p>
                </div>
            )}

            {/* "Today's Progress" section - shows if normal is completed AND not all levels are completed AND gameData is loaded */}
            {gameData && dailyProgress.normal && !(dailyProgress.normal && dailyProgress.hard && dailyProgress.impossible) &&
                <div className="text-center max-w-2xl w-full my-4 p-4 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-800 shadow-sm">
                    <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100">Today's Progress</h3>
                    <div className="flex flex-col sm:flex-row justify-around items-stretch gap-2 mb-4">
                        {difficulties.map(diffLevel => {
                            const isCompleted = dailyProgress[diffLevel];
                            const isCurrent = difficulty === diffLevel;
                            const canPlay =
                                diffLevel === 'normal' ||
                                (diffLevel === 'hard' && dailyProgress.normal) ||
                                (diffLevel === 'impossible' && dailyProgress.normal && dailyProgress.hard);
                            
                            const isDisabled = isCurrent || !canPlay || loading || showEndGamePanelOverride || animationState.animating;
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
                                    onClick={isClickable && !isCurrent ? () => handlePlayMode(diffLevel) : undefined}
                                    title={title}
                                >
                                    <div> 
                                        <p className={`font-medium capitalize ${isCurrent ? 'text-indigo-700 dark:text-indigo-300' : (canPlay ? 'text-gray-700 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400')}`}>{diffLevel}</p>
                                        {isCompleted ? (
                                            <p className="text-green-600 dark:text-green-400 font-bold my-1 text-sm">
                                                Completed <i className="fas fa-check"></i>
                                            </p>
                                        ) : ( canPlay ?
                                            <p className="text-gray-500 dark:text-gray-400 my-1 italic text-sm">Not Completed</p>
                                            : <p className="text-gray-400 dark:text-gray-500 my-1 text-xs">Locked</p>
                                        )}
                                    </div>
                                    {!canPlay && !isCurrent && ( 
                                        <div className="mt-auto self-center text-gray-400 dark:text-gray-500 pt-1">
                                            <i className="fas fa-lock"></i>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                     <button
                        onClick={(e) => { e.stopPropagation(); handleShowGameSummary(); }}
                        disabled={showEndGamePanelOverride || loading || animationState.animating || (!dailyProgress.normal && !dailyProgress.hard && !dailyProgress.impossible)}
                        className="cursor-pointer mt-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center self-center transition-opacity"
                        title={(!dailyProgress.normal && !dailyProgress.hard && !dailyProgress.impossible) ? 'No summaries to show yet' : 'View All Summaries'}
                    >
                        <i className="fas fa-list-alt mr-1.5"></i> View Summaries
                    </button>
                </div>
            }

            <div className="h-6 mb-2 text-center px-2">
                {isInvalidMove && <p className="text-red-500 dark:text-red-400 font-semibold animate-shake">{invalidMoveMessage}</p>}
            </div>
            
            <div className="h-6 mb-2 text-center px-2">
                {showNoMoreValidMovesMessage && (
                    <div className="text-center text-lg font-semibold text-red-500 dark:text-red-400">
                        No more valid moves! You can <a onClick={handleBack} className="italic underline hover:text-red-400 dark:hover:text-red-500 cursor-pointer">undo</a> or reset.
                    </div>
                )}
                {showDeviatedMessage && (
                    <p className="text-sm text-orange-600 dark:text-orange-400 font-semibold">
                        Deviated from an optimal path! You can <a onClick={handleBack} className="italic underline hover:text-orange-400 dark:hover:text-orange-500 cursor-pointer">undo</a>.
                    </p>
                )}
                {showOptimalMessage && (
                     <p className="text-sm text-green-600 dark:text-green-400 font-semibold">
                        On an optimal path! Keep going!
                    </p>
                )}
            </div>

            {levelActuallyCompleted && !showEndGamePanelOverride && !loading && (
                <div className="text-center text-lg font-semibold text-green-500 dark:text-green-400 mb-2 animate-pulse">
                    🎉 Longest Word Chain Found! 🎉
                </div>
            )}


            <div className="relative inline-flex flex-col items-center mb-1">
                {turnFailedAttempts > 0 && !shouldShowEndGamePanel && !isInvalidMove && ( 
                    <div
                        className="absolute top-0 left-0 z-10 px-2 py-0.5 bg-yellow-500 text-white text-xs font-bold rounded-full shadow-md transform -translate-x-1/3 -translate-y-1/3"
                        title={`Failed Attempts on current turn: ${turnFailedAttempts}`}
                    >
                        {turnFailedAttempts}
                    </div>
                )}
                {grid && gameData &&
                    <WordGrid
                        grid={grid} selectedCell={selectedCell} draggedCell={draggedCell}
                        animationState={animationState} highlightedCells={highlightedCells} hintCells={hintCells}
                        wiggleCells={wiggleCells} onCellClick={handleCellClick} onDragStart={handleDragStart}
                        onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragEnd={handleDragEnd} onDrop={handleDrop}
                    />
                }
                <div className="w-full flex items-center mt-3">
                    <ProgressBar
                        currentScore={currentDepth}
                        maxScore={liveMaxDepthAttainable}
                    />
                    <div className="flex space-x-1.5 ml-2.5">
                        <button onClick={handleBack} disabled={history.length === 0 || animationState.animating || (isGameOver && !hasAcknowledgedGameOver) || showEndGamePanelOverride || loading} className={`cursor-pointer p-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md shadow hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity`} title="Undo last move">
                            <i className="fas fa-step-backward"></i>
                        </button>
                        <button onClick={handleReset} disabled={animationState.animating || showEndGamePanelOverride || loading || !gameData} className={`cursor-pointer p-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md shadow hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-red-400 dark:focus:ring-red-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity`} title="Reset Game">
                            <i className="fas fa-redo-alt"></i>
                        </button>
                        {difficulty !== 'impossible' &&
                            <button onClick={handleHintButtonClick} disabled={animationState.animating || isGameOver || (currentPossibleMoves && currentPossibleMoves.length === 0) || showEndGamePanelOverride || loading || hintCells.length > 0} className={`cursor-pointer p-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md shadow hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400 dark:focus:ring-yellow-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity`} title="Get a Hint">
                                <i className="fas fa-lightbulb"></i>
                            </button>
                        }
                    </div>
                </div>
            </div>

            {renderWordChain()}

            {isDebugMode && gameData && <DebugView treeData={gameData.explorationTree} optimalPathWords={liveOptimalPathWords} />}
            
            {shouldShowEndGamePanel && (normalDataForPanel || hardDataForPanel || impossibleDataForPanel) && (
                <EndGamePanel
                    normalModeData={normalDataForPanel}
                    hardModeData={hardDataForPanel}
                    impossibleModeData={impossibleDataForPanel}
                    onClose={handleCloseGameOver}
                />
            )}
        </div>
    );
}

export default App;
