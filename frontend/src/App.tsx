// src/App.tsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import WordGrid from './components/WordGrid';
import ProgressBar from './components/ProgressBar';
import EndGamePanel from './components/EndGamePanel'; // Assuming this path points to the combined panel
import ExplorationTreeView from './components/ExplorationTreeView';
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
    ExplorationNodeData
} from './utils/gameHelpers';

// Define Difficulty Levels
export type DifficultyLevel = 'normal' | 'hard' | 'impossible';
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
    playerWords: Set<string>; // Passed as Set to component
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

    // Memoized initial game states
    const initialStates = useMemo(() => getInitialGameState(gameData), [gameData]);

    // Core Game State (live play)
    const [grid, setGrid] = useState<string[][] | null>(initialStates.grid);
    const [currentPossibleMoves, setCurrentPossibleMoves] = useState<ExplorationNodeData[]>(initialStates.currentPossibleMoves);
    const [currentDepth, setCurrentDepth] = useState<number>(initialStates.currentDepth);
    const [history, setHistory] = useState<HistoryEntry[]>(initialStates.history);
    const [hasDeviated, setHasDeviated] = useState<boolean>(initialStates.hasDeviated);
    const [turnFailedAttempts, setTurnFailedAttempts] = useState(0);

    // UI Interaction State
    const [selectedCell, setSelectedCell] = useState<CellCoordinates | null>(initialStates.selectedCell);
    const [draggedCell, setDraggedCell] = useState<CellCoordinates | null>(initialStates.draggedCell);
    const [hoveredCell, setHoveredCell] = useState<CellCoordinates | null>(initialStates.hoveredCell);
    const [isInvalidMove, setIsInvalidMove] = useState<boolean>(initialStates.isInvalidMove);
    const [invalidMoveMessage, setInvalidMoveMessage] = useState<string>(initialStates.invalidMoveMessage);

    // Animation & Feedback State
    const [animationState, setAnimationState] = useState(initialStates.animationState);
    const animationTimeoutRef = useRef<number | null>(null);
    const [highlightedCells, setHighlightedCells] = useState<CellCoordinates[]>([]);
    const highlightTimeoutRef = useRef<number | null>(null);
    const [wiggleCells, setWiggleCells] = useState<CellCoordinates[]>([]);
    const wiggleTimeoutRef = useRef<number | null>(null);
    const [hintCells, setHintCells] = useState<CellCoordinates[]>([]);
    const hintTimeoutRef = useRef<number | null>(null);

    // Game Over & Summary Panel State
    const [isGameOver, setIsGameOver] = useState<boolean>(initialStates.isGameOver);
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
            const tempGrid = currentGrid.map(r => [...r]);
            const fromCell = { row: moveDetails.from[0], col: moveDetails.from[1] };
            const toCell = { row: moveDetails.to[0], col: moveDetails.to[1] };
            tempGrid[fromCell.row][fromCell.col] = tempGrid[toCell.row][toCell.col];
            tempGrid[toCell.row][toCell.col] = currentGrid[fromCell.row][fromCell.col];
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
        const urlDifficulty = params.get('difficulty') as DifficultyLevel | null; // Check URL for specific difficulty

        const progressKey = `wordChainsProgress-${getFormattedDate(today)}`;
        const savedProgressString = localStorage.getItem(progressKey);
        let currentDailyProgressState: Record<DifficultyLevel, boolean> = { normal: false, hard: false, impossible: false };
        if (savedProgressString) {
            const parsedProgress: DailyProgressStorage = JSON.parse(savedProgressString);
            difficulties.forEach(diff => {
                if (parsedProgress[diff]?.completed) {
                    currentDailyProgressState[diff] = true;
                }
            });
        }
        setDailyProgress(currentDailyProgressState);

        // Determine initial difficulty: URL param takes precedence, then check progress
        let initialDifficultyValue: DifficultyLevel = 'normal';
        if (urlDifficulty && difficulties.includes(urlDifficulty)) {
             initialDifficultyValue = urlDifficulty;
        } else if (currentDailyProgressState.normal && !currentDailyProgressState.hard) {
            initialDifficultyValue = 'hard';
        } else if (currentDailyProgressState.normal && currentDailyProgressState.hard && !currentDailyProgressState.impossible) {
             initialDifficultyValue = 'impossible'; // Suggest impossible if others done
        }
        setDifficulty(initialDifficultyValue);
        
    }, []); // Runs once on mount

    // Effect to load level data when currentDate, difficulty, or reloadTrigger changes
    useEffect(() => {
        const loadLevelDataInternal = async (date: Date, diff: DifficultyLevel) => {
            if (!date) return;

            if (!loading) setLoading(true);

            setError(null);
            setShowEndGamePanelOverride(false);
            setCombinedSummaryData({}); // Clear combined summary data
            setHasAcknowledgedGameOver(false);

            const freshInitialStates = getInitialGameState(null);
            setGrid(freshInitialStates.grid);
            setCurrentPossibleMoves(freshInitialStates.currentPossibleMoves);
            setCurrentDepth(freshInitialStates.currentDepth);
            setHistory(freshInitialStates.history);
            setHasDeviated(freshInitialStates.hasDeviated);
            setIsInvalidMove(freshInitialStates.isInvalidMove);
            setInvalidMoveMessage(freshInitialStates.invalidMoveMessage);
            setSelectedCell(freshInitialStates.selectedCell);
            setHoveredCell(freshInitialStates.hoveredCell);
            setDraggedCell(freshInitialStates.draggedCell);
            setWiggleCells([]);
            setTurnFailedAttempts(0);
            setHintCells([]);
            setAnimationState(freshInitialStates.animationState);
            setIsGameOver(freshInitialStates.isGameOver);

            try {
                const basePath = '';
                const response = await fetch(`${basePath}/levels/${diff}/${getDataFilePath(date)}`);
                if (!response.ok) {
                    if (response.status === 404) throw new Error(`Today's ${diff} level is not available yet. Please check back later!`);
                    throw new Error(`Failed to fetch ${diff} level for ${getFormattedDate(date)} (HTTP ${response.status})`);
                }
                const contentType = response.headers.get("content-type");
                if (!contentType || !contentType.includes("application/json")) {
                    const textResponse = await response.text();
                    console.error("Received non-JSON content type:", contentType, "Response text:", textResponse);
                    throw new Error(`Received non-JSON response for ${diff} level ${getFormattedDate(date)}.`);
                }
                const fetchedGameData: GameData = await response.json();
                setGameData(fetchedGameData);

                const savedGameStateString = localStorage.getItem(`wordChainsState-${getFormattedDate(date)}-${diff}`);
                let loadedDepth = 0;
                if (savedGameStateString) {
                    const savedState = JSON.parse(savedGameStateString);
                    setGrid(savedState.lastGrid || fetchedGameData.initialGrid);
                    setHistory(savedState.history || []);
                    loadedDepth = savedState.currentDepth || 0;
                    setCurrentDepth(loadedDepth);
                    setTurnFailedAttempts(savedState.turnFailedAttempts || 0);
                    setHasDeviated(savedState.hasDeviated || false);
                } else {
                    setGrid(fetchedGameData.initialGrid);
                }
                setCurrentPossibleMoves(fetchedGameData.explorationTree || []);

                if (fetchedGameData && loadedDepth === fetchedGameData.maxDepthReached && loadedDepth > 0) {
                    setHasAcknowledgedGameOver(true);
                    setIsGameOver(true);
                }

            } catch (err: any) {
                setError(err.message);
                setGameData(null);
                setGrid(null);
                setCurrentPossibleMoves([]);
            } finally {
                setLoading(false);
            }
        };

        if (currentDate) {
            loadLevelDataInternal(currentDate, difficulty);
        }

    }, [currentDate, difficulty, reloadTrigger]);

    // Memoized live game values
    const liveOptimalPathWords = useMemo(() => gameData ? findLongestWordChain(gameData.explorationTree, history) : [], [gameData, history]);
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
                lastGrid: grid, history, currentDepth, turnFailedAttempts, hasDeviated,
            };
            localStorage.setItem(`wordChainsState-${getFormattedDate(currentDate)}-${difficulty}`, JSON.stringify(gameStateToSave));
        }
    }, [grid, history, currentDepth, turnFailedAttempts, hasDeviated, currentDate, difficulty, gameData, loading]);

    // Effect to determine natural game over state
    useEffect(() => {
        if (showEndGamePanelOverride || loading || !gameData || animationState.animating) return;

        if (currentDepth === 0 && history.length === 0) {
            if (isGameOver) setIsGameOver(false);
            return;
        }

        const levelCompleted = currentDepth === liveMaxDepthAttainable;
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
        gameData, animationState.animating, showEndGamePanelOverride,
        currentDepth, history.length,
        liveMaxDepthAttainable, currentPossibleMoves,
        isGameOver, loading
    ]);

    // Effect to save detailed summary on level completion
    useEffect(() => {
        if (isGameOver && !hasAcknowledgedGameOver && !showEndGamePanelOverride && currentDepth === liveMaxDepthAttainable && currentDate && gameData && !loading) {
            const progressKey = `wordChainsProgress-${getFormattedDate(currentDate)}`;
            const existingProgressString = localStorage.getItem(progressKey);
            let dailyProgressData: DailyProgressStorage = {};
            if (existingProgressString) dailyProgressData = JSON.parse(existingProgressString);

            // Check if this difficulty is already marked completed to avoid re-saving
            if (dailyProgressData[difficulty]?.completed) {
                 return;
            }

            const summaryToSave: LevelCompletionSummary = {
                history: history,
                score: currentDepth,
                playerWords: Array.from(livePlayerUniqueWordsFound),
                maxScore: liveMaxDepthAttainable,
                optimalPathWords: liveOptimalPathWords,
                difficultyForSummary: difficulty
            };

            // Update the specific difficulty entry
            dailyProgressData[difficulty] = { completed: true, summary: summaryToSave };
            
            // Update the state for immediate UI feedback
            setDailyProgress(prev => ({ ...prev, [difficulty]: true }));
            
            // Save the updated structure back to localStorage
            localStorage.setItem(progressKey, JSON.stringify(dailyProgressData));
        }
    }, [
        isGameOver, hasAcknowledgedGameOver, showEndGamePanelOverride, currentDepth, liveMaxDepthAttainable, currentDate, gameData,
        difficulty, history, livePlayerUniqueWordsFound, liveOptimalPathWords, loading
    ]);


    // Effect to show hint after 3 failed attempts
    useEffect(() => {
        // Disable hints for impossible mode
        if (difficulty === 'impossible') {
            setHintCells([]); // Ensure hints are cleared if switching to impossible
            if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
            return;
        }
        if (turnFailedAttempts >= 3 && !isGameOver && !showEndGamePanelOverride && !loading) {
            const coordinates = calculateHintCoordinates(currentPossibleMoves, grid);
            if (coordinates.length > 0) {
                setHintCells(coordinates);
                if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
                hintTimeoutRef.current = window.setTimeout(() => { setHintCells([]); hintTimeoutRef.current = null; }, 3000);
            }
        }
    }, [turnFailedAttempts, currentPossibleMoves, grid, calculateHintCoordinates, isGameOver, showEndGamePanelOverride, loading, difficulty]); // Added difficulty

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
        wiggleTimeoutRef.current = window.setTimeout(() => { setWiggleCells([]); wiggleTimeoutRef.current = null; }, 500);
    }, []);

    const incrementFailedAttempts = useCallback(() => { setTurnFailedAttempts(prev => prev + 1); }, []);

    const performSwap = useCallback((cell1: CellCoordinates, cell2: CellCoordinates) => {
        if (!cell1 || !cell2 || animationState.animating || (isGameOver && !hasAcknowledgedGameOver) || !gameData || !grid || showEndGamePanelOverride || loading) return;

        setSelectedCell(null); setDraggedCell(null); setHoveredCell(null);
        let matchedNode: ExplorationNodeData | null = null;
        const moveOption1 = { from: [cell1.row, cell1.col], to: [cell2.row, cell2.col] };
        const moveOption2 = { from: [cell2.row, cell2.col], to: [cell1.row, cell1.col] };
        if (currentPossibleMoves && currentPossibleMoves.length > 0) {
            for (const node of currentPossibleMoves) {
                if (!node.move) continue;
                const fromMatch1 = node.move.from[0] === moveOption1.from[0] && node.move.from[1] === moveOption1.from[1];
                const toMatch1 = node.move.to[0] === moveOption1.to[0] && node.move.to[1] === moveOption1.to[1];
                const fromMatch2 = node.move.from[0] === moveOption2.from[0] && node.move.from[1] === moveOption2.from[1];
                const toMatch2 = node.move.to[0] === moveOption2.to[0] && node.move.to[1] === moveOption2.to[1];
                if ((fromMatch1 && toMatch1) || (fromMatch2 && toMatch2)) { matchedNode = node; break; }
            }
        }
        if (matchedNode) {
            const moveMadeCoords = { from: { row: cell1.row, col: cell1.col }, to: { row: cell2.row, col: cell2.col } };
            const wordsFormedByMove = matchedNode.wordsFormed || [];
            let isDeviatedMove = false;
            let maxDepthPossibleFromCurrentState = -1;
            if (currentPossibleMoves && currentPossibleMoves.length > 0) {
                const validNodes = currentPossibleMoves.filter(node => typeof node.maxDepthReached === 'number');
                if (validNodes.length > 0) maxDepthPossibleFromCurrentState = Math.max(...validNodes.map(node => node.maxDepthReached!));
            }
            if (typeof matchedNode.maxDepthReached === 'number' && matchedNode.maxDepthReached < maxDepthPossibleFromCurrentState) isDeviatedMove = true;
            setHasDeviated(isDeviatedMove); setTurnFailedAttempts(0); setHintCells([]);
            if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
            setHistory(prevHistory => [...prevHistory, { grid: grid!, currentPossibleMoves, currentDepth, moveMade: moveMadeCoords, wordsFormedByMove, turnFailedAttempts }]);
            setAnimationState({ animating: true, from: cell1, to: cell2 });
            setIsInvalidMove(false); setInvalidMoveMessage('');
            if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
            if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current); setHighlightedCells([]);
            animationTimeoutRef.current = window.setTimeout(() => {
                const newGrid = grid!.map(r => [...r]);
                const temp = newGrid[cell1.row][cell1.col];
                newGrid[cell1.row][cell1.col] = newGrid[cell2.row][cell2.col]; newGrid[cell2.row][cell2.col] = temp;
                const nextDepth = currentDepth + 1;
                setGrid(newGrid); setCurrentPossibleMoves(matchedNode!.nextMoves || []); setCurrentDepth(nextDepth);
                setAnimationState({ animating: false, from: null, to: null }); animationTimeoutRef.current = null;
                let allCoords: CellCoordinates[] = [];
                wordsFormedByMove.forEach((word: string) => { const coords = findWordCoordinates(newGrid, word, matchedNode!.move!); allCoords = [...allCoords, ...coords]; });
                const uniqueCoords = Array.from(new Map(allCoords.map(item => [`${item.row}-${item.col}`, item])).values());
                setHighlightedCells(uniqueCoords);
                highlightTimeoutRef.current = window.setTimeout(() => { setHighlightedCells([]); highlightTimeoutRef.current = null; }, 1500);
            }, 300);
        } else {
            setIsInvalidMove(true); setInvalidMoveMessage('Invalid Move! No new word found!');
            triggerWiggle(cell1, cell2); incrementFailedAttempts();
        }
    }, [grid, currentPossibleMoves, currentDepth, animationState.animating, isGameOver, gameData, history, triggerWiggle, incrementFailedAttempts, showEndGamePanelOverride, loading, hasAcknowledgedGameOver]);

    const handleDragStart = useCallback((cellCoords: CellCoordinates) => {
        if (animationState.animating || (isGameOver && !hasAcknowledgedGameOver) || !gameData || showEndGamePanelOverride || loading) return;
        setDraggedCell(cellCoords); setSelectedCell(null); setIsInvalidMove(false); setInvalidMoveMessage(''); setHoveredCell(null);
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current); setHighlightedCells([]);
        if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current); setWiggleCells([]);
        if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current); setHintCells([]);
    }, [animationState.animating, isGameOver, gameData, showEndGamePanelOverride, loading, hasAcknowledgedGameOver]);

    const handleDragEnter = useCallback((cellCoords: CellCoordinates) => {
        if (draggedCell && (draggedCell.row !== cellCoords.row || draggedCell.col !== cellCoords.col)) {
            if (areAdjacent(draggedCell, cellCoords)) setHoveredCell(cellCoords); else setHoveredCell(null);
        }
    }, [draggedCell]);

    const handleDragLeave = useCallback((cellCoords: CellCoordinates) => {
        if (hoveredCell && hoveredCell.row === cellCoords.row && hoveredCell.col === cellCoords.col) setHoveredCell(null);
    }, [hoveredCell]);

    const handleDragEnd = useCallback(() => { setDraggedCell(null); setHoveredCell(null); }, []);

    const handleDrop = useCallback((targetCellCoords: CellCoordinates) => {
        if (!draggedCell || showEndGamePanelOverride || loading || (isGameOver && !hasAcknowledgedGameOver)) return;
        const sourceCell = draggedCell; setHoveredCell(null);
        if (sourceCell.row === targetCellCoords.row && sourceCell.col === targetCellCoords.col) return;
        if (!areAdjacent(sourceCell, targetCellCoords)) {
            setIsInvalidMove(true); setInvalidMoveMessage('Must swap adjacent cells.');
            triggerWiggle(sourceCell, targetCellCoords); incrementFailedAttempts(); return;
        }
        performSwap(sourceCell, targetCellCoords);
    }, [draggedCell, performSwap, triggerWiggle, incrementFailedAttempts, showEndGamePanelOverride, loading, isGameOver, hasAcknowledgedGameOver]);

    const handleCellClick = useCallback((cellCoords: CellCoordinates) => {
        if (animationState.animating || (isGameOver && !hasAcknowledgedGameOver) || !gameData || draggedCell || showEndGamePanelOverride || loading) return;
        setIsInvalidMove(false); setInvalidMoveMessage('');
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current); setHighlightedCells([]);
        if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current); setWiggleCells([]);
        if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current); setHintCells([]);
        if (!selectedCell) setSelectedCell(cellCoords);
        else {
            const firstCell = selectedCell;
            if (firstCell.row === cellCoords.row && firstCell.col === cellCoords.col) setSelectedCell(null);
            else if (areAdjacent(firstCell, cellCoords)) performSwap(firstCell, cellCoords);
            else setSelectedCell(cellCoords);
        }
    }, [selectedCell, animationState.animating, isGameOver, gameData, performSwap, draggedCell, showEndGamePanelOverride, loading, hasAcknowledgedGameOver]);

    // Resets all volatile game states and sets gameData to null to trigger reload
    const masterResetGameStates = useCallback(() => {
        if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current);
        if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);

        const initial = getInitialGameState(null); // Get pure defaults
        setGrid(initial.grid); setCurrentPossibleMoves(initial.currentPossibleMoves);
        setCurrentDepth(initial.currentDepth); setHistory(initial.history);
        setHasDeviated(initial.hasDeviated); setIsInvalidMove(initial.isInvalidMove);
        setInvalidMoveMessage(initial.invalidMoveMessage); setSelectedCell(initial.selectedCell);
        setHoveredCell(initial.hoveredCell); setDraggedCell(initial.draggedCell);
        setWiggleCells([]); setTurnFailedAttempts(0); setHintCells([]);
        setAnimationState(initial.animationState);

        setIsGameOver(false);
        setHasAcknowledgedGameOver(false);
        setShowEndGamePanelOverride(false);
        setCombinedSummaryData(null); // Clear combined summary data on reset

        setGameData(null); // Critical: Signals the useEffect for data loading that data is stale.
    }, []); // No dependencies needed as it only uses setters and refs

    // Handles resetting the current level
    const handleReset = useCallback(() => {
        if (!currentDate || loading || showEndGamePanelOverride) return; // Prevent reset if loading or panel shown

        // Clear saved state for this specific level before resetting
        const stateKey = `wordChainsState-${getFormattedDate(currentDate)}-${difficulty}`;
        localStorage.removeItem(stateKey);

        setLoading(true);
        masterResetGameStates();
        setReloadTrigger(prev => prev + 1); // Trigger data load for current difficulty
    }, [currentDate, difficulty, masterResetGameStates, loading, showEndGamePanelOverride]);

    // Handles undoing the last move
    const handleBack = useCallback(() => {
        // Disable if history empty, animating, game over and not acknowledged, panel override active, or loading
        if (history.length === 0 || animationState.animating || (isGameOver && !hasAcknowledgedGameOver) || showEndGamePanelOverride || loading) return;

        if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current);
        if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);

        setShowEndGamePanelOverride(false); setCombinedSummaryData(null);
        setHasAcknowledgedGameOver(false); // Going back means any game over state is no longer relevant

        const previousState = history[history.length - 1];
        const moveToundo = previousState.moveMade;
        if (!moveToundo || !previousState.grid) { console.error("Cannot undo: History data missing.", previousState); handleReset(); return; }
        const previousTurnFailedAttempts = previousState.turnFailedAttempts ?? 0;
        let previousStateWasDeviated = false;
        if (history.length > 1) {
            const stateBeforePrevious = history[history.length - 2];
            const movesFromBeforePrevious = stateBeforePrevious.currentPossibleMoves;
            const moveThatLedToPrevious = previousState.moveMade;
            let nodeOfPreviousMove = null;
            if (movesFromBeforePrevious && moveThatLedToPrevious) {
                const prevMoveOpt1 = { from: [moveThatLedToPrevious.from.row, moveThatLedToPrevious.from.col], to: [moveThatLedToPrevious.to.row, moveThatLedToPrevious.to.col] };
                const prevMoveOpt2 = { from: [moveThatLedToPrevious.to.row, moveThatLedToPrevious.to.col], to: [moveThatLedToPrevious.from.row, moveThatLedToPrevious.from.col] };
                for (const node of movesFromBeforePrevious) {
                    if (!node.move) continue;
                    const fromMatch1 = node.move.from[0] === prevMoveOpt1.from[0] && node.move.from[1] === prevMoveOpt1.from[1];
                    const toMatch1 = node.move.to[0] === prevMoveOpt1.to[0] && node.move.to[1] === prevMoveOpt1.to[1];
                    const fromMatch2 = node.move.from[0] === prevMoveOpt2.from[0] && node.move.from[1] === prevMoveOpt2.from[1];
                    const toMatch2 = node.move.to[0] === prevMoveOpt2.to[0] && node.move.to[1] === prevMoveOpt2.to[1];
                    if ((fromMatch1 && toMatch1) || (fromMatch2 && toMatch2)) { nodeOfPreviousMove = node; break; }
                }
            }
            if (nodeOfPreviousMove && movesFromBeforePrevious && movesFromBeforePrevious.length > 0) {
                const validNodes = movesFromBeforePrevious.filter((node: ExplorationNodeData) => typeof node.maxDepthReached === 'number');
                if (validNodes.length > 0) {
                    const maxDepthPossibleBeforePrevious = Math.max(...validNodes.map((node: ExplorationNodeData) => node.maxDepthReached!));
                    if (typeof nodeOfPreviousMove.maxDepthReached === 'number' && nodeOfPreviousMove.maxDepthReached < maxDepthPossibleBeforePrevious) previousStateWasDeviated = true;
                }
            }
        }
        setAnimationState({ animating: true, from: moveToundo.to, to: moveToundo.from });
        setIsInvalidMove(false); setInvalidMoveMessage(''); setHighlightedCells([]);
        setIsGameOver(false); // Game is definitely not over if we are undoing
        setSelectedCell(null); setDraggedCell(null); setHoveredCell(null); setWiggleCells([]); setHintCells([]);
        animationTimeoutRef.current = window.setTimeout(() => {
            setGrid(previousState.grid); setCurrentPossibleMoves(previousState.currentPossibleMoves);
            setCurrentDepth(previousState.currentDepth); setHistory(prevHistory => prevHistory.slice(0, -1));
            setAnimationState({ animating: false, from: null, to: null });
            setHasDeviated(previousStateWasDeviated); setTurnFailedAttempts(previousTurnFailedAttempts);
            animationTimeoutRef.current = null;
        }, 300);
    }, [history, animationState.animating, isGameOver, handleReset, gameData, showEndGamePanelOverride, loading, hasAcknowledgedGameOver]);

    // Handles closing the EndGamePanel
    const handleCloseGameOver = useCallback(() => {
        setHasAcknowledgedGameOver(true); // Mark the current game over state (if any) as seen
        setShowEndGamePanelOverride(false); // Hide the panel if it was manually shown
        setCombinedSummaryData(null); // Clear combined summary data
    }, []);

    // Generalized handler for switching difficulty
    const handlePlayMode = useCallback((newDifficulty: DifficultyLevel) => {
        if (loading || showEndGamePanelOverride || difficulty === newDifficulty) return; // Prevent action if loading, panel shown, or already on this difficulty
        
        // Check prerequisites
        if (newDifficulty === 'hard' && !dailyProgress.normal) return;
        if (newDifficulty === 'impossible' && !dailyProgress.hard) return;

        setLoading(true);
        masterResetGameStates();
        setDifficulty(newDifficulty);
    }, [masterResetGameStates, loading, showEndGamePanelOverride, difficulty, dailyProgress]); // Added difficulty and dailyProgress


    // Handles the hint button click
    const handleHintButtonClick = useCallback(() => {
        // Disable hints entirely for impossible mode
        if (difficulty === 'impossible' || !animationState.animating && !showEndGamePanelOverride && !isGameOver && !loading) {
            const coordinates = calculateHintCoordinates(currentPossibleMoves, grid);
            if (coordinates.length > 0) {
                setHintCells(coordinates);
                if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
                hintTimeoutRef.current = window.setTimeout(() => { setHintCells([]); hintTimeoutRef.current = null; }, 3000);
            }
        }
    }, [currentPossibleMoves, animationState.animating, grid, calculateHintCoordinates, showEndGamePanelOverride, isGameOver, loading, difficulty]); // Added difficulty

    // Handles showing the game summary manually
    const handleShowGameSummary = useCallback(() => { // Removed summaryDifficulty param
        if (!currentDate || loading) {
            console.warn("Cannot show summary: Current date not set or app is loading.");
            return;
        }
        const progressKey = `wordChainsProgress-${getFormattedDate(currentDate)}`;
        const savedProgressString = localStorage.getItem(progressKey);
        let loadedNormalSummary: LevelCompletionSummary | null = null;
        let loadedHardSummary: LevelCompletionSummary | null = null;
        let loadedImpossibleSummary: LevelCompletionSummary | null = null; // Add impossible

        if (savedProgressString) {
            const parsedProgress: DailyProgressStorage = JSON.parse(savedProgressString);
            loadedNormalSummary = parsedProgress.normal?.summary || null;
            loadedHardSummary = parsedProgress.hard?.summary || null;
            loadedImpossibleSummary = parsedProgress.impossible?.summary || null; // Load impossible
        }

        // Only show the panel if at least one summary exists.
        if (loadedNormalSummary || loadedHardSummary || loadedImpossibleSummary) {
            setCombinedSummaryData({
                normal: loadedNormalSummary,
                hard: loadedHardSummary,
                impossible: loadedImpossibleSummary, // Include impossible
            });
            setShowEndGamePanelOverride(true);
            setHasAcknowledgedGameOver(true); // Acknowledge any current game over state when viewing summary
        } else {
            console.warn(`No saved summaries found for ${getFormattedDate(currentDate)}. Cannot show combined summary.`);
            // Optionally, fallback to showing live data (more complex)
        }
    }, [currentDate, loading]); // Removed dependencies related to live data for simplicity


    // Render Helper for Word Chain
    const renderWordChain = () => {
        // Show live history if not showing override panel
        const displayHistory = (!showEndGamePanelOverride) ? history : []; // Don't show chain when viewing summary panel

        if (displayHistory.length === 0) return <div className="min-h-[2rem] mt-4"></div>;
        return (
            // Use gap-x-2 and gap-y-1 for spacing with wrapping
            <div className="flex flex-wrap items-center justify-center mt-4 gap-x-2 gap-y-1 text-lg px-4 pb-2"> 
                {displayHistory.map((histEntry, index) => (
                    // Use inline-flex for each word/arrow pair to keep them together
                    <div key={`hist-${index}`} className="inline-flex items-baseline"> 
                        <span className="px-2 py-1 bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200 rounded font-medium">
                            {histEntry.wordsFormedByMove?.[0]?.toUpperCase() || '???'}
                            {histEntry.wordsFormedByMove && histEntry.wordsFormedByMove.length > 1 ? '...' : ''}
                        </span>
                        {/* Render arrow only if it's not the last actual history item */}
                        {index < displayHistory.length -1 && // Corrected condition: show arrow between history items
                            <span className="text-gray-500 dark:text-gray-400 font-bold mx-1">→</span>
                        }
                    </div>
                ))}
            </div>
        );
    };

    // --- Conditional Rendering for Loading/Error States ---
    if (loading) return <div className="flex justify-center items-center min-h-screen text-gray-700 dark:text-gray-300">Loading {difficulty} level for {currentDate ? getFormattedDate(currentDate) : 'today'}...</div>;
    if (error) return (
        <div className="flex flex-col justify-center items-center min-h-screen text-center px-4">
            <p className="text-red-600 dark:text-red-400 text-xl font-semibold">Error</p>
            <p className="text-gray-700 dark:text-gray-300 mt-2">{error}</p>
            <button onClick={() => { setLoading(true); masterResetGameStates(); setDifficulty('normal'); setCurrentDate(new Date()); }} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600">Try Again</button>
        </div>
    );
    if (!gameData && !loading) return <div className="flex justify-center items-center min-h-screen text-gray-500 dark:text-gray-400">Game data could not be loaded. Please ensure levels are available.</div>;

    // Determine props for EndGamePanel
    // Prepare data for the panel, converting loaded summary or using live data
    let normalDataForPanel: LevelResultData | null = null;
    let hardDataForPanel: LevelResultData | null = null;
    let impossibleDataForPanel: LevelResultData | null = null; // Add impossible

    const shouldShowEndGamePanel = (isGameOver && !hasAcknowledgedGameOver) || showEndGamePanelOverride;

    if (shouldShowEndGamePanel) {
        if (showEndGamePanelOverride && combinedSummaryData) {
            // Use loaded summary data from state
            if (combinedSummaryData.normal) {
                normalDataForPanel = {
                    ...combinedSummaryData.normal,
                    playerWords: new Set(combinedSummaryData.normal.playerWords),
                    levelCompleted: combinedSummaryData.normal.score === combinedSummaryData.normal.maxScore,
                };
            }
            if (combinedSummaryData.hard) {
                hardDataForPanel = {
                    ...combinedSummaryData.hard,
                    playerWords: new Set(combinedSummaryData.hard.playerWords),
                    levelCompleted: combinedSummaryData.hard.score === combinedSummaryData.hard.maxScore,
                };
            }
            if (combinedSummaryData.impossible) { // Handle impossible
                impossibleDataForPanel = {
                    ...combinedSummaryData.impossible,
                    playerWords: new Set(combinedSummaryData.impossible.playerWords),
                    levelCompleted: combinedSummaryData.impossible.score === combinedSummaryData.impossible.maxScore,
                };
            }
        } else if (isGameOver && !hasAcknowledgedGameOver && gameData) {
            // Natural game over: Use live data for the current difficulty
            // and try to load summaries for other difficulties
            const liveData: LevelResultData = {
                history: history,
                score: currentDepth,
                maxScore: liveMaxDepthAttainable,
                playerWords: livePlayerUniqueWordsFound,
                optimalPathWords: liveOptimalPathWords,
                levelCompleted: currentDepth === liveMaxDepthAttainable,
            };

            // Assign live data to the correct slot
            if (difficulty === 'normal') normalDataForPanel = liveData;
            else if (difficulty === 'hard') hardDataForPanel = liveData;
            else if (difficulty === 'impossible') impossibleDataForPanel = liveData;

            // Try to load summaries for other difficulties from localStorage
            const progressKey = `wordChainsProgress-${getFormattedDate(currentDate)}`;
            const savedProgressString = localStorage.getItem(progressKey);
            if (savedProgressString) {
                const parsedProgress: DailyProgressStorage = JSON.parse(savedProgressString);
                if (difficulty !== 'normal' && parsedProgress.normal?.summary) {
                    normalDataForPanel = {
                        ...parsedProgress.normal.summary,
                        playerWords: new Set(parsedProgress.normal.summary.playerWords),
                        levelCompleted: parsedProgress.normal.summary.score === parsedProgress.normal.summary.maxScore,
                    };
                }
                if (difficulty !== 'hard' && parsedProgress.hard?.summary) {
                    hardDataForPanel = {
                        ...parsedProgress.hard.summary,
                        playerWords: new Set(parsedProgress.hard.summary.playerWords),
                        levelCompleted: parsedProgress.hard.summary.score === parsedProgress.hard.summary.maxScore,
                    };
                }
                 if (difficulty !== 'impossible' && parsedProgress.impossible?.summary) { // Load impossible if not current
                    impossibleDataForPanel = {
                        ...parsedProgress.impossible.summary,
                        playerWords: new Set(parsedProgress.impossible.summary.playerWords),
                        levelCompleted: parsedProgress.impossible.summary.score === parsedProgress.impossible.summary.maxScore,
                    };
                }
            }
        }
    }


    // --- Main Render ---

    return (
        <div className={`flex flex-col items-center justify-start min-h-screen p-4 font-sans pt-8 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
            <button
                onClick={() => setDarkMode(!darkMode)}
                className="absolute top-4 right-4 p-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
                {darkMode ? <i className="fas fa-sun"></i> : <i className="fas fa-moon"></i>}
            </button>

            <h1 className="text-5xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-gradient-flow font-bungee">
                <a href="/">Word Chain 🔗</a>
            </h1>
            <h2 className="text-2xl mb-1 text-gray-700 dark:text-gray-300">
                {currentDate ? getFriendlyDate(currentDate) : 'Loading date...'} 
                <span className="capitalize text-xl"> ({difficulty}) </span>
                {/* Checkmark if ALL levels completed */}
                {dailyProgress.normal && dailyProgress.hard && dailyProgress.impossible && <i className="fas fa-check text-green-600 ml-2" title="All levels completed!"></i>} 
            </h2>

            {/* How to Play Instructions */}
            <div className="text-center max-w-xl mb-2 text-sm text-gray-600 dark:text-gray-400">
                {difficulty === 'normal' &&
                    <p><span className="font-semibold mb-1">How to Play: </span>Click adjacent cells or drag-and-drop letters to swap them. Find the optimal move sequence to win! Every move <i>must</i> make a new {wordLength}-letter word. Click the light bulb button <i className="fas fa-lightbulb"></i> to get a hint about the next move.</p>}
                {difficulty === 'hard' &&
                    <p><span className="font-semibold mb-1">How to Play: </span>This is hard mode. It is the same rules as normal mode, just with a bigger grid. This means words can be made vertically or horizontally. Also, no hints. You still need to find the optimal move sequence to win. Remember that every move <i>must</i> make a new <i>{wordLength}-letter</i> word.</p>}
                 {difficulty === 'impossible' &&
                    <p><span className="font-semibold mb-1">How to Play: </span>This is impossible mode. Bigger grid, no hints, and the optimal path might be very tricky. Good luck! Every move <i>must</i> make a new <i>{wordLength}-letter</i> word.</p>}
            </div>

            {/* Messages for Daily Progress */}
            {dailyProgress.normal && dailyProgress.hard && dailyProgress.impossible && ( // Message if all completed
                <div className="text-center max-w-xl mb-2 text-lg text-green-600 dark:text-green-400">
                    <p><strong>You have completed all levels for today!</strong></p>
                    <p>Come back tomorrow for another challenge.</p>
                </div>
            )}

            {/* Combined Daily Status & Navigation Section */}
            {Object.values(dailyProgress).some(value => value === true) &&
            <div className="text-center max-w-2xl w-full my-4 p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 shadow-sm">
                <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100">Today's Status</h3>
                {/* Status Display */}
                <div className="flex flex-col sm:flex-row justify-around items-stretch gap-2 mb-4">
                     {difficulties.map(diffLevel => {
                        const isCompleted = dailyProgress[diffLevel];
                        const isCurrentDifficulty = difficulty === diffLevel;
                        // Determine if this difficulty level can be played
                        const canPlay = 
                            diffLevel === 'normal' || 
                            (diffLevel === 'hard' && dailyProgress.normal) || 
                            (diffLevel === 'impossible' && dailyProgress.hard);
                        
                        const isDisabled = isCurrentDifficulty || !canPlay || loading || showEndGamePanelOverride;
                        const isClickable = !isDisabled; // Clickable if not disabled

                        return (
                            <div 
                                key={diffLevel} 
                                className={`flex-1 text-center p-2 border rounded min-w-[120px] flex flex-col justify-between 
                                            ${isCurrentDifficulty ? 'border-indigo-500 dark:border-indigo-400 bg-indigo-50 dark:bg-gray-800' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800'}
                                            ${isClickable ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors' : 'opacity-75 cursor-not-allowed'}`}
                                onClick={isClickable ? () => handlePlayMode(diffLevel) : undefined} 
                                title={isClickable ? `Switch to ${diffLevel.charAt(0).toUpperCase() + diffLevel.slice(1)} Mode` : (isCurrentDifficulty ? 'Current Mode' : `Complete ${diffLevel === 'hard' ? 'Normal' : 'Hard'} Mode first`)}
                            >
                                <div> {/* Inner div for content alignment */}
                                    <p className={`font-medium capitalize ${isCurrentDifficulty ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>{diffLevel}</p>
                                    {isCompleted ? (
                                        <p className="text-green-600 dark:text-green-400 font-bold my-1 text-sm">
                                            Completed <i className="fas fa-check"></i>
                                        </p>
                                    ) : (
                                        <p className="text-gray-500 dark:text-gray-400 my-1 italic text-sm">Not Completed</p>
                                    )}
                                </div>
                                {!canPlay && !isCurrentDifficulty && ( // Lock icon if prerequisite not met
                                     <div className="mt-2 self-center text-gray-400 dark:text-gray-500">
                                         <i className="fas fa-lock"></i>
                                     </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); handleShowGameSummary(); }} // Stop propagation to prevent div click
                    disabled={showEndGamePanelOverride || loading}
                    className="mt-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center self-center"
                    title={'View Summary'}
                >
                    <i className="fas fa-eye mr-1"></i> View Summary
                </button>
            </div>
            }

            <div className="h-6 mb-2 text-center">
                {isInvalidMove && <p className="text-red-600 dark:text-red-400 font-semibold">{invalidMoveMessage}</p>}
            </div>
            <div className="h-6 mb-2 text-center">
                <p className={`text-sm ${hasDeviated ? 'text-red-600 dark:text-red-400 font-bold' : 'text-green-600 dark:text-green-400 font-semibold'}`}>
                    {hasDeviated && <>Deviated from optimal path! You may want to <a onClick={handleBack} className="italic underline hover:text-red-400 dark:hover:text-red-600 cursor-pointer">undo</a>.</>}
                </p>
            </div>

            <div className="relative inline-flex flex-col items-center mb-1">
                {turnFailedAttempts > 0 && !shouldShowEndGamePanel && (
                    <div
                        className="absolute top-0 left-0 z-10 px-2.5 py-1 bg-red-500 text-white text-xs font-bold rounded-full shadow-md transform -translate-x-1/4 -translate-y-1/4"
                        title={`Failed Attempts: ${turnFailedAttempts}`}
                    >
                        {turnFailedAttempts}
                    </div>
                )}
                {/* Render WordGrid only if grid data is available */}
                {grid &&
                    <WordGrid
                        grid={grid} selectedCell={selectedCell} draggedCell={draggedCell} hoveredCell={hoveredCell}
                        animationState={animationState} highlightedCells={highlightedCells} hintCells={hintCells}
                        wiggleCells={wiggleCells} onCellClick={handleCellClick} onDragStart={handleDragStart}
                        onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragEnd={handleDragEnd} onDrop={handleDrop}
                    />
                }
                <div className="w-full flex items-center mt-2">
                    <ProgressBar 
                        currentScore={currentDepth} 
                        maxScore={liveMaxDepthAttainable} 
                    />
                    <div className="flex space-x-1 ml-2">
                        <button onClick={handleBack} disabled={history.length === 0 || animationState.animating || (isGameOver && !hasAcknowledgedGameOver) || showEndGamePanelOverride || loading} className={`p-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md shadow hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed`} title="Back (Undo last move)">
                            <i className="fas fa-step-backward"></i>
                        </button>
                        <button onClick={handleReset} disabled={animationState.animating || showEndGamePanelOverride || loading} className={`p-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md shadow hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:focus:ring-indigo-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed`} title="Reset Game">
                            <i className="fas fa-redo"></i>
                        </button>
                        {/* Hint button disabled for impossible mode */}
                        {difficulty !== 'impossible' &&
                            <button onClick={handleHintButtonClick} disabled={animationState.animating || isGameOver || (currentPossibleMoves && currentPossibleMoves.length === 0) || showEndGamePanelOverride || loading} className={`p-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md shadow hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400 dark:focus:ring-yellow-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed`} title="Get a Hint">
                                <i className="fas fa-lightbulb"></i>
                            </button>
                        }
                    </div>
                </div>
            </div>

            {renderWordChain()}

            {isDebugMode && gameData && <ExplorationTreeView treeData={gameData.explorationTree} optimalPathWords={liveOptimalPathWords} />}
            {shouldShowEndGamePanel && (normalDataForPanel || hardDataForPanel || impossibleDataForPanel) && ( // Check if any data exists for panel
                <EndGamePanel
                    normalModeData={normalDataForPanel}
                    hardModeData={hardDataForPanel}
                    impossibleModeData={impossibleDataForPanel} // Pass impossible data
                    onClose={handleCloseGameOver}
                />
            )}
        </div>
    );
}

export default App;
