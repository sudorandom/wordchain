// src/App.tsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import WordGrid from './components/WordGrid';
import ProgressBar from './components/ProgressBar';
import EndGamePanel from './components/EndGamePanel';
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
    ExplorationNodeData // Added this import
} from './utils/gameHelpers';

function App() {
    // State Variables
    const [darkMode, setDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            const savedMode = localStorage.getItem('darkMode');
            if (savedMode) return JSON.parse(savedMode);
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        return false;
    });
    const [gameData, setGameData] = useState<GameData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentDate, setCurrentDate] = useState<Date>();
    const [difficulty, setDifficulty] = useState<'simple' | 'hard'>('simple');
    const [dailyProgress, setDailyProgress] = useState({ simpleCompleted: false, hardCompleted: false });
    const [isDebugMode, setIsDebugMode] = useState(false);

    const initialStates = useMemo(() => getInitialGameState(gameData), [gameData]);

    const [grid, setGrid] = useState<string[][] | null>(initialStates.grid);
    const [currentPossibleMoves, setCurrentPossibleMoves] = useState<ExplorationNodeData[]>(initialStates.currentPossibleMoves);
    const [currentDepth, setCurrentDepth] = useState<number>(initialStates.currentDepth);
    const [selectedCell, setSelectedCell] = useState<CellCoordinates | null>(initialStates.selectedCell);
    const [draggedCell, setDraggedCell] = useState<CellCoordinates | null>(initialStates.draggedCell);
    const [hoveredCell, setHoveredCell] = useState<CellCoordinates | null>(initialStates.hoveredCell);
    const [isInvalidMove, setIsInvalidMove] = useState<boolean>(initialStates.isInvalidMove);
    const [invalidMoveMessage, setInvalidMoveMessage] = useState<string>(initialStates.invalidMoveMessage);
    const [hasDeviated, setHasDeviated] = useState<boolean>(initialStates.hasDeviated);
    const [animationState, setAnimationState] = useState(initialStates.animationState);
    const animationTimeoutRef = useRef<number | null>(null);
    const [history, setHistory] = useState<HistoryEntry[]>(initialStates.history);
    const [highlightedCells, setHighlightedCells] = useState<CellCoordinates[]>([]);
    const highlightTimeoutRef = useRef<number | null>(null);
    const [isGameOver, setIsGameOver] = useState<boolean>(initialStates.isGameOver);
    const [wiggleCells, setWiggleCells] = useState<CellCoordinates[]>([]);
    const wiggleTimeoutRef = useRef<number | null>(null);
    const [turnFailedAttempts, setTurnFailedAttempts] = useState(0);
    const [hintCells, setHintCells] = useState<CellCoordinates[]>([]);
    const hintTimeoutRef = useRef<number | null>(null);

    // Helper function to calculate hint coordinates
    const calculateHintCoordinates = useCallback((
        possibleMoves: ExplorationNodeData[] | null,
        currentGrid: string[][] | null
    ): CellCoordinates[] => {
        if (!currentGrid || !possibleMoves || possibleMoves.length === 0) {
            return [];
        }

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
            const charFrom = tempGrid[fromCell.row][fromCell.col];
            const charTo = tempGrid[toCell.row][toCell.col];
            tempGrid[fromCell.row][fromCell.col] = charTo;
            tempGrid[toCell.row][toCell.col] = charFrom;

            const wordCoordinates = findWordCoordinates(tempGrid, wordToHighlight, moveDetails);
            return wordCoordinates || []; // Ensure it always returns an array
        }
        return [];
    }, []); // findWordCoordinates is imported and stable.

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

    // Effect to get current date and load initial daily progress
    useEffect(() => {
        const today = new Date();
        setCurrentDate(today);

        const params = new URLSearchParams(window.location.search);
        const debugParam = params.get('debug');
        setIsDebugMode(debugParam === 'true');
        const hardParam = params.get('hard') === 'true'; // Check if 'hard=true' is in URL
        // Load daily progress
        const savedProgressData = localStorage.getItem(`wordChainsProgress-${getFormattedDate(today)}`);
        let currentDailyProgress = { simpleCompleted: false, hardCompleted: false };
        if (savedProgressData) {
            currentDailyProgress = JSON.parse(savedProgressData);
        }
        setDailyProgress(currentDailyProgress); // Update dailyProgress state regardless of initial difficulty chosen
        // Determine initial difficulty: URL param 'hard=true' takes precedence
        let initialDifficultyValue: 'simple' | 'hard';
        if (hardParam) {
            initialDifficultyValue = 'hard';
        } else {
            // If no 'hard' URL param, determine by progress
            if (currentDailyProgress.simpleCompleted && !currentDailyProgress.hardCompleted) {
                initialDifficultyValue = 'hard';
            } else {
                initialDifficultyValue = 'simple';
            }
        }
        setDifficulty(initialDifficultyValue);

    }, []);

    // Effect to load level data when currentDate or difficulty changes
    useEffect(() => {
        const loadLevelData = async (date: Date, diff: 'simple' | 'hard') => {
            if (!date) return;
            setLoading(true); setError(null);
            const initial = getInitialGameState();
            setGameData(null); setGrid(initial.grid); setCurrentPossibleMoves(initial.currentPossibleMoves);
            setCurrentDepth(initial.currentDepth); setHistory(initial.history); setHasDeviated(initial.hasDeviated);
            setIsInvalidMove(initial.isInvalidMove); setInvalidMoveMessage(initial.invalidMoveMessage);
            setSelectedCell(initial.selectedCell); setHoveredCell(initial.hoveredCell); setDraggedCell(initial.draggedCell);
            setWiggleCells([]);
            setTurnFailedAttempts(0);
            setHintCells([]);
            setAnimationState(initial.animationState); // Reset animation state too

            try {
                const basePath = '';
                const response = await fetch(`${basePath}/levels/${diff}/${getDataFilePath(date)}`);
                if (!response.ok) {
                    if (response.status === 404) {
                        throw new Error(`Today's ${diff} level is not available yet. Please check back later!`);
                    } else { throw new Error(`Failed to fetch ${diff} level for ${date} (HTTP ${response.status})`); }
                }
                const contentType = response.headers.get("content-type");
                if (!contentType || !contentType.includes("application/json")) {
                    const textResponse = await response.text();
                    console.error("Received non-JSON content type:", contentType, "Response text:", textResponse);
                    throw new Error(`Received non-JSON response for ${diff} level ${date}.`);
                }
                const data = await response.json();
                setGameData(data); setGrid(data.initialGrid); setCurrentPossibleMoves(data.explorationTree || []);

                const savedGameState = localStorage.getItem(`wordChainsState-${date}-${diff}`);
                if (savedGameState) {
                    const { lastGrid: lastGrid, history: savedHistory, currentDepth: savedDepth, turnFailedAttempts: savedTurnFails, hasDeviated: savedDeviation } = JSON.parse(savedGameState);
                    if (lastGrid) {
                        setGrid(lastGrid);
                    }
                    setHistory(savedHistory || []);
                    setCurrentDepth(savedDepth || 0);
                    setTurnFailedAttempts(savedTurnFails || 0);
                    setHasDeviated(savedDeviation || false);
                } else {
                    setHistory([]); setCurrentDepth(0);
                    setTurnFailedAttempts(0); setHasDeviated(false);
                }
            } catch (err: any) {
                setError(err.message); setGameData(null); setGrid(null); setCurrentPossibleMoves([]);
            } finally {
                setLoading(false);
            }
        };

        if (currentDate) {
            loadLevelData(currentDate, difficulty);
        }
    }, [currentDate, difficulty]);

    // Effect to save game state
    useEffect(() => {
        if (!loading && gameData && currentDate && difficulty) {
            const gameStateToSave = { lastGrid: grid, history, currentDepth, turnFailedAttempts, hasDeviated };
            localStorage.setItem(`wordChainsState-${getFormattedDate(currentDate)}-${difficulty}`, JSON.stringify(gameStateToSave));
        }
    }, [history, currentDepth, turnFailedAttempts, hasDeviated, currentDate, difficulty, gameData, loading]);


    // Memoized Calculations
    const optimalPathWords = useMemo(() => gameData ? findLongestWordChain(gameData.explorationTree) : [], [gameData]);
    const playerUniqueWordsFound = useMemo(() => {
        const words = new Set<string>();
        history.forEach(state => { if (Array.isArray(state.wordsFormedByMove)) { state.wordsFormedByMove.forEach(word => words.add(word)); } });
        return words;
    }, [history]);
    const maxDepthAttainable = gameData ? gameData.maxDepthReached : 0;
    const wordLength = gameData ? gameData.wordLength : 4;

    // Effects
    useEffect(() => {
        if (gameData && !animationState.animating && currentDepth > 0) {
            const levelCompleted = currentDepth === maxDepthAttainable;
            if (levelCompleted || (currentPossibleMoves && currentPossibleMoves.length === 0)) {
                setIsGameOver(true);
                if (levelCompleted && difficulty === 'simple' && !dailyProgress.simpleCompleted) {
                    const newProgress = { ...dailyProgress, simpleCompleted: true };
                    setDailyProgress(newProgress);
                    localStorage.setItem(`wordChainsProgress-${getFormattedDate(currentDate)}`, JSON.stringify(newProgress));
                } else if (levelCompleted && difficulty === 'hard' && !dailyProgress.hardCompleted) {
                    const newProgress = { ...dailyProgress, hardCompleted: true };
                    setDailyProgress(newProgress);
                    localStorage.setItem(`wordChainsProgress-${getFormattedDate(currentDate)}`, JSON.stringify(newProgress));
                }
            } else {
                setIsGameOver(false);
            }
        }
    }, [gameData, currentPossibleMoves, currentDepth, animationState.animating, maxDepthAttainable, difficulty, dailyProgress, currentDate]);

    useEffect(() => {
        if (turnFailedAttempts >= 3) { // grid and currentPossibleMoves will be checked by the helper
            const coordinates = calculateHintCoordinates(currentPossibleMoves, grid);
            if (coordinates.length > 0) {
                setHintCells(coordinates);
                if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
                hintTimeoutRef.current = window.setTimeout(() => { setHintCells([]); hintTimeoutRef.current = null; }, 3000);
            }
        }
    }, [turnFailedAttempts, currentPossibleMoves, grid, calculateHintCoordinates]);

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

    const incrementFailedAttempts = useCallback(() => {
        setTurnFailedAttempts(prev => prev + 1);
    }, []);

    const performSwap = useCallback((cell1: CellCoordinates, cell2: CellCoordinates) => {
        if (!cell1 || !cell2 || animationState.animating || isGameOver || !gameData || !grid) return;
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
                if (validNodes.length > 0) maxDepthPossibleFromCurrentState = Math.max(...validNodes.map(node => node.maxDepthReached));
            }
            if (typeof matchedNode.maxDepthReached === 'number' && matchedNode.maxDepthReached < maxDepthPossibleFromCurrentState) {
                isDeviatedMove = true;
            }
            setHasDeviated(isDeviatedMove);
            setTurnFailedAttempts(0);
            setHintCells([]);
            if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);

            setHistory(prevHistory => [...prevHistory, { grid: grid!, currentPossibleMoves, currentDepth, moveMade: moveMadeCoords, wordsFormedByMove, turnFailedAttempts }]);
            setAnimationState({ animating: true, from: cell1, to: cell2 });
            setIsInvalidMove(false); setInvalidMoveMessage('');
            if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
            if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
            setHighlightedCells([]);

            animationTimeoutRef.current = window.setTimeout(() => {
                const newGrid = grid!.map(r => [...r]);
                const temp = newGrid[cell1.row][cell1.col];
                newGrid[cell1.row][cell1.col] = newGrid[cell2.row][cell2.col];
                newGrid[cell2.row][cell2.col] = temp;
                const nextDepth = currentDepth + 1;
                setGrid(newGrid);
                setCurrentPossibleMoves(matchedNode!.nextMoves || []);
                setCurrentDepth(nextDepth);
                setAnimationState({ animating: false, from: null, to: null });
                animationTimeoutRef.current = null;
                let allCoords: CellCoordinates[] = [];
                wordsFormedByMove.forEach((word: string)  => { const coords = findWordCoordinates(newGrid, word, matchedNode!.move!); allCoords = [...allCoords, ...coords]; });
                const uniqueCoords = Array.from(new Map(allCoords.map(item => [`${item.row}-${item.col}`, item])).values());
                setHighlightedCells(uniqueCoords);
                highlightTimeoutRef.current = window.setTimeout(() => { setHighlightedCells([]); highlightTimeoutRef.current = null; }, 1500);
            }, 300);
        } else {
            setIsInvalidMove(true);
            setInvalidMoveMessage('Invalid Move! No new word found!');
            triggerWiggle(cell1, cell2);
            incrementFailedAttempts();
        }
    }, [grid, currentPossibleMoves, currentDepth, animationState.animating, isGameOver, gameData, history, triggerWiggle, incrementFailedAttempts, maxDepthAttainable]);

    const handleDragStart = useCallback((cellCoords: CellCoordinates) => {
        if (animationState.animating || isGameOver || !gameData) return;
        setDraggedCell(cellCoords); setSelectedCell(null);
        setIsInvalidMove(false);
        setInvalidMoveMessage('');
        setHoveredCell(null);
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current); setHighlightedCells([]);
        if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current); setWiggleCells([]);
        if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current); setHintCells([]);
    }, [animationState.animating, isGameOver, gameData]);

    const handleDragEnter = useCallback((cellCoords: CellCoordinates) => {
        if (draggedCell && (draggedCell.row !== cellCoords.row || draggedCell.col !== cellCoords.col)) {
            if (areAdjacent(draggedCell, cellCoords)) setHoveredCell(cellCoords);
            else setHoveredCell(null);
        }
    }, [draggedCell]);

    const handleDragLeave = useCallback((cellCoords: CellCoordinates) => {
        if (hoveredCell && hoveredCell.row === cellCoords.row && hoveredCell.col === cellCoords.col) setHoveredCell(null);
    }, [hoveredCell]);

    const handleDragEnd = useCallback(() => {
        setDraggedCell(null); setHoveredCell(null);
    }, []);

    const handleDrop = useCallback((targetCellCoords: CellCoordinates) => {
        if (!draggedCell) return;
        const sourceCell = draggedCell;
        setHoveredCell(null);
        if (sourceCell.row === targetCellCoords.row && sourceCell.col === targetCellCoords.col) return;
        if (!areAdjacent(sourceCell, targetCellCoords)) {
            setIsInvalidMove(true); setInvalidMoveMessage('Must swap adjacent cells.');
            triggerWiggle(sourceCell, targetCellCoords);
            incrementFailedAttempts();
            return;
        }
        performSwap(sourceCell, targetCellCoords);
    }, [draggedCell, performSwap, triggerWiggle, incrementFailedAttempts]);

    const handleCellClick = useCallback((cellCoords: CellCoordinates) => {
        if (animationState.animating || isGameOver || !gameData || draggedCell) return;
        setIsInvalidMove(false);
        setInvalidMoveMessage('');
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current); setHighlightedCells([]);
        if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current); setWiggleCells([]);
        if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current); setHintCells([]);

        if (!selectedCell) {
            setSelectedCell(cellCoords);
        } else {
            const firstCell = selectedCell;
            if (firstCell.row === cellCoords.row && firstCell.col === cellCoords.col) {
                setSelectedCell(null); // Deselect
            } else if (areAdjacent(firstCell, cellCoords)) {
                performSwap(firstCell, cellCoords); // Attempt swap
            } else {
                setSelectedCell(cellCoords); // Select new cell
            }
        }
    }, [selectedCell, animationState.animating, isGameOver, gameData, performSwap, draggedCell]);

    const handleReset = useCallback(() => {
        if (!gameData && !error) { console.warn("Cannot reset: Game not loaded yet."); return; }
        if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current);
        if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);

        const initial = getInitialGameState(gameData || undefined);
        setGrid(initial.grid); setCurrentPossibleMoves(initial.currentPossibleMoves);
        setCurrentDepth(initial.currentDepth);
        setHistory(initial.history);
        setHasDeviated(initial.hasDeviated);
        setIsInvalidMove(initial.isInvalidMove);
        setInvalidMoveMessage(initial.invalidMoveMessage);
        setIsGameOver(initial.isGameOver);
        setSelectedCell(initial.selectedCell);
        setHoveredCell(initial.hoveredCell); setDraggedCell(initial.draggedCell);
        setWiggleCells([]);
        setTurnFailedAttempts(0);
        setHintCells([]);
        setAnimationState(initial.animationState);
    }, [gameData, currentDate, difficulty, error]);

    const handleBack = useCallback(() => {
        if (history.length === 0 || animationState.animating || isGameOver || !gameData) return;
        if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current);
        if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);

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
                const validNodes = movesFromBeforePrevious.filter((node: { maxDepthReached: any; }) => typeof node.maxDepthReached === 'number');
                if (validNodes.length > 0) {
                    const maxDepthPossibleBeforePrevious = Math.max(...validNodes.map((node: { maxDepthReached: any; }) => node.maxDepthReached));
                    if (typeof nodeOfPreviousMove.maxDepthReached === 'number' && nodeOfPreviousMove.maxDepthReached < maxDepthPossibleBeforePrevious) {
                        previousStateWasDeviated = true;
                    }
                }
            }
        }

        setAnimationState({ animating: true, from: moveToundo.to, to: moveToundo.from });
        setIsInvalidMove(false);
        setInvalidMoveMessage('');
        setHighlightedCells([]);
        setIsGameOver(false);
        setSelectedCell(null);
        setDraggedCell(null);
        setHoveredCell(null);
        setWiggleCells([]);
        setHintCells([]);

        animationTimeoutRef.current = window.setTimeout(() => {
            setGrid(previousState.grid);
            setCurrentPossibleMoves(previousState.currentPossibleMoves);
            setCurrentDepth(previousState.currentDepth);
            setHistory(prevHistory => prevHistory.slice(0, -1));
            setAnimationState({ animating: false, from: null, to: null });
            setHasDeviated(previousStateWasDeviated);
            setTurnFailedAttempts(previousTurnFailedAttempts);
            animationTimeoutRef.current = null;
        }, 300);

    }, [history, animationState.animating, isGameOver, handleReset, gameData]);

    const handleCloseGameOver = useCallback(() => {
        setIsGameOver(false);
    }, []);

    const handlePlayHardMode = useCallback(() => {
        setIsGameOver(false);
        const initial = getInitialGameState();
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
        setWiggleCells([]);
        setTurnFailedAttempts(0);
        setHintCells([]);
        setAnimationState(initial.animationState);
        setDifficulty('hard');
    }, []);

    const handlePlaySimpleMode = useCallback(() => {
        setIsGameOver(false);
        const initial = getInitialGameState();
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
        setWiggleCells([]);
        setTurnFailedAttempts(0);
        setHintCells([]);
        setAnimationState(initial.animationState);
        setDifficulty('simple');
    }, []);

    const handleHintButtonClick = useCallback(() => {
        // animationState is checked here, grid and currentPossibleMoves will be checked by the helper
        if (!animationState.animating) {
            const coordinates = calculateHintCoordinates(currentPossibleMoves, grid);
            if (coordinates.length > 0) {
                setHintCells(coordinates);
                if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
                hintTimeoutRef.current = window.setTimeout(() => { setHintCells([]); hintTimeoutRef.current = null; }, 3000);
            }
        }
    }, [currentPossibleMoves, animationState.animating, grid, calculateHintCoordinates]);


    // Render Helper for Word Chain
    const renderWordChain = () => {
        if (history.length === 0) return <div className="min-h-[2rem] mt-4"></div>;
        return (
            <div className="flex flex-wrap items-center justify-center mt-4 space-x-2 text-lg px-4 pb-2">
                {history.map((histEntry, index) => (
                    <React.Fragment key={index}>
                        <span className="px-2 py-1 bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200 rounded font-medium">
                            {histEntry.wordsFormedByMove?.[0]?.toUpperCase() || '???'}
                            {histEntry.wordsFormedByMove?.length > 1 ? '...' : ''}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400 font-bold mx-1">→</span>
                    </React.Fragment>
                ))}
                <span className="px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded font-medium">Current</span>
            </div>
        );
    };

    // --- Conditional Rendering for Loading/Error States ---
    if (loading) return <div className="flex justify-center items-center min-h-screen text-gray-700 dark:text-gray-300">Loading {difficulty} level for {getFormattedDate(currentDate)}...</div>;
    if (error) return (
        <div className="flex flex-col justify-center items-center min-h-screen text-center px-4">
            <p className="text-red-600 dark:text-red-400 text-xl font-semibold">Error</p>
            <p className="text-gray-700 dark:text-gray-300 mt-2">{error}</p>
            <button onClick={() => { setCurrentDate(new Date()); setDifficulty('simple'); }} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600">Try Again</button>
        </div>
    );
    if (!gameData) return <div className="flex justify-center items-center min-h-screen text-gray-500 dark:text-gray-400">Game data could not be loaded.</div>;

    const currentLevelCompleted = (
        (difficulty === 'simple' && dailyProgress.simpleCompleted) ||
        (difficulty === 'hard' && dailyProgress.hardCompleted)
    )

    // --- Main Render ---
    return (
        <div className={`flex flex-col items-center justify-start min-h-screen p-4 font-sans pt-8 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
            <button
                onClick={() => setDarkMode(!darkMode)}
                className="absolute top-4 right-4 p-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
                {darkMode ? (
                    <i className="fas fa-sun"></i>
                ) : (
                    <i className="fas fa-moon"></i>
                )}
            </button>

            <h1 className="text-5xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-gradient-flow font-bungee">
                <a href="/">Word Chain</a>
            </h1>
            <h2 className="text-2xl mb-1 text-gray-700 dark:text-gray-300">
                {getFriendlyDate(currentDate)} <span className="capitalize">{difficulty != 'simple' && <i>({difficulty} difficulty) </i>}</span>
                {currentLevelCompleted && <i className="fas fa-check text-green-600"></i>}
            </h2>

            <div className="text-center max-w-xl mb-2 text-sm text-gray-600 dark:text-gray-400">
                {difficulty === 'simple' &&
                    <p><span className="font-semibold mb-1">How to Play: </span>Click adjacent cells or drag-and-drop letters to swap them. Find the optimal move sequence to win! Every move <i>must</i> make a new {wordLength}-letter word. Click the light bulb button <i className="fas fa-lightbulb"></i> to get a hint about the next move.</p>}
                {difficulty === 'hard' &&
                    <p><span className="font-semibold mb-1">How to Play: </span>This is hard mode. It is the same rules as simple mode, just with a bigger grid. This means words can be made vertically or horizontally. Also, no hints. You still need to find the optimal move sequence to win. Remember that every move <i>must</i> make a new <i>{wordLength}-letter</i> word.</p>}
            </div>

            <div className="h-6 mb-2 text-center">
                {isInvalidMove && <p className="text-red-600 dark:text-red-400 font-semibold">{invalidMoveMessage}</p>}
            </div>
            <div className="h-6 mb-2 text-center">
                <p className={`text-sm ${hasDeviated ? 'text-red-600 dark:text-red-400 font-bold' : 'text-green-600 dark:text-green-400 font-semibold'}`}>
                    {hasDeviated && "Deviated from optimal path!"}
                </p>
            </div>

            <div className="relative inline-flex flex-col items-center mb-1">
                {turnFailedAttempts > 0 && (
                    <div
                        className="absolute top-0 left-0 z-10 px-2.5 py-1 bg-red-500 text-white text-xs font-bold rounded-full shadow-md transform -translate-x-1/4 -translate-y-1/4"
                        title={`Failed Attempts: ${turnFailedAttempts}`}
                    >
                        {turnFailedAttempts}
                    </div>
                )}
                <div
                    className="absolute top-0 right-0 z-10 px-2.5 py-1 bg-blue-600 dark:bg-blue-500 text-white text-xs font-bold rounded-full shadow-md transform translate-x-1/4 -translate-y-1/4"
                    title="Current Depth / Max Depth Attainable"
                >
                    {currentDepth}/{maxDepthAttainable}
                </div>

                <WordGrid
                    grid={grid}
                    selectedCell={selectedCell}
                    draggedCell={draggedCell}
                    hoveredCell={hoveredCell}
                    animationState={animationState}
                    highlightedCells={highlightedCells}
                    hintCells={hintCells}
                    wiggleCells={wiggleCells}
                    onCellClick={handleCellClick}
                    onDragStart={handleDragStart}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragEnd={handleDragEnd}
                    onDrop={handleDrop}
                />
                <div className="w-full flex items-center mt-2">
                    <ProgressBar currentScore={currentDepth} maxScore={maxDepthAttainable} />
                    <div className="flex space-x-1 ml-2">
                        <button onClick={handleBack} disabled={history.length === 0 || animationState.animating || isGameOver} className={`p-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md shadow hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed`} title="Back (Undo last move)">
                            <i className="fas fa-step-backward"></i>
                        </button>
                        <button onClick={handleReset} disabled={animationState.animating} className={`p-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md shadow hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:focus:ring-indigo-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed`} title="Reset Game">
                            <i className="fas fa-redo"></i>
                        </button>
                        {difficulty === 'simple' &&
                            <button onClick={handleHintButtonClick} disabled={animationState.animating || isGameOver || (currentPossibleMoves && currentPossibleMoves.length === 0)} className={`p-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md shadow hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400 dark:focus:ring-yellow-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed`} title="Get a Hint">
                                <i className="fas fa-lightbulb"></i>
                            </button>
                        }
                    </div>
                </div>
            </div>

            {renderWordChain()}

            {difficulty === 'hard' && (
                <div>
                    <div className="text-center max-w-xl mb-2 text-sm text-gray-600 dark:text-gray-400">
                        <p><strong>You have completed both level for today!</strong> Come back tomorrow for another challenge.</p>
                        <button
                            onClick={handlePlaySimpleMode}
                            className="mt-4 px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md shadow focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:ring-offset-gray-900"
                        >
                            Back to normal mode
                        </button>
                    </div>
                </div>
            )}
            {dailyProgress.simpleCompleted && difficulty === 'simple' && (
                <div>
                    <div className="text-center max-w-xl mb-2 text-sm text-gray-600 dark:text-gray-400">
                        <p><strong>You have completed the first level.</strong> <i>Maybe try hard mode next?</i></p>
                        <button
                            onClick={handlePlayHardMode}
                            className="mt-4 px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md shadow focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:ring-offset-gray-900"
                        >
                            Play Hard Mode
                        </button>
                    </div>
                </div>
            )}
            {isDebugMode && <ExplorationTreeView treeData={gameData?.explorationTree} />}
            {isGameOver && <EndGamePanel history={history}
                score={currentDepth}
                maxScore={maxDepthAttainable}
                playerWords={playerUniqueWordsFound}
                optimalPathWords={optimalPathWords}
                onClose={handleCloseGameOver}
                onPlayHardMode={handlePlayHardMode}
                onResetGame={handleReset}
                difficulty={difficulty}
                levelJustCompleted={currentDepth === maxDepthAttainable}
            />}
        </div>
    );
}

export default App;
