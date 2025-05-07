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

// Interface for the summary data stored in localStorage and used by the panel
interface LevelCompletionSummary {
    history: HistoryEntry[];
    score: number;
    playerWords: string[]; // Stored as string array in localStorage
    maxScore: number;
    optimalPathWords: string[];
    difficultyForSummary: 'simple' | 'hard';
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


// Interface for the structure of the daily progress object in localStorage
interface DailyProgressStorage {
    simple?: {
        completed: boolean;
        summary?: LevelCompletionSummary;
    };
    hard?: {
        completed: boolean;
        summary?: LevelCompletionSummary;
    };
}


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
    const [difficulty, setDifficulty] = useState<'simple' | 'hard'>('simple');
    const [dailyProgress, setDailyProgress] = useState<{ simpleCompleted: boolean, hardCompleted: boolean }>({ simpleCompleted: false, hardCompleted: false });
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
    // State to hold summary data loaded from localStorage for the panel override view
    const [combinedSummaryData, setCombinedSummaryData] = useState<{
        simple?: LevelCompletionSummary | null;
        hard?: LevelCompletionSummary | null;
    } | null>(null);


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
        const hardParam = params.get('hard') === 'true';
        
        const progressKey = `wordChainsProgress-${getFormattedDate(today)}`;
        const savedProgressString = localStorage.getItem(progressKey);
        let currentDailyProgressState = { simpleCompleted: false, hardCompleted: false };
        if (savedProgressString) {
            const parsedProgress: DailyProgressStorage = JSON.parse(savedProgressString);
            if (parsedProgress.simple) currentDailyProgressState.simpleCompleted = parsedProgress.simple.completed;
            if (parsedProgress.hard) currentDailyProgressState.hardCompleted = parsedProgress.hard.completed;
        }
        setDailyProgress(currentDailyProgressState);

        let initialDifficultyValue: 'simple' | 'hard' = 'simple';
        if (hardParam) initialDifficultyValue = 'hard';
        else if (currentDailyProgressState.simpleCompleted && !currentDailyProgressState.hardCompleted) initialDifficultyValue = 'hard';
        setDifficulty(initialDifficultyValue);
        // setLoading(false); // Removed: Loading stops when data effect finishes
    }, []); // Runs once on mount

    // Effect to load level data when currentDate, difficulty, or reloadTrigger changes
    useEffect(() => {
        const loadLevelDataInternal = async (date: Date, diff: 'simple' | 'hard') => {
            if (!date) return; 
            
            // Ensure loading state is true at the start of the load process
            if (!loading) setLoading(true); 

            setError(null); 
            setShowEndGamePanelOverride(false); 
            setCombinedSummaryData(null); // Clear combined summary data on new load
            setHasAcknowledgedGameOver(false);

            // Reset states based on pure defaults
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
            setIsGameOver(freshInitialStates.isGameOver); // Start as not game over

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
                
                // Set game data first
                setGameData(fetchedGameData); 
                
                // Then apply saved state or defaults based on fetched data
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
                // Always use exploration tree from fetched data
                setCurrentPossibleMoves(fetchedGameData.explorationTree || []);

                // If the loaded state represents a completed game, mark it as acknowledged immediately
                if (fetchedGameData && loadedDepth === fetchedGameData.maxDepthReached && loadedDepth > 0) {
                    setHasAcknowledgedGameOver(true);
                    setIsGameOver(true); // Also set game over if loading a completed state
                }

            } catch (err: any) {
                setError(err.message); 
                setGameData(null); 
                setGrid(null); 
                setCurrentPossibleMoves([]);
            } finally {
                setLoading(false); // Stop loading indicator regardless of success/error
            }
        };
        
        if (currentDate) {
            loadLevelDataInternal(currentDate, difficulty);
        }

    }, [currentDate, difficulty, reloadTrigger]); // Removed `loading` dependency

    // Memoized live game values
    const liveOptimalPathWords = useMemo(() => gameData ? findLongestWordChain(gameData.explorationTree) : [], [gameData]);
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
        // Skip if manually showing summary, loading, no data, or animating
        if (showEndGamePanelOverride || loading || !gameData || animationState.animating) return; 
        
        // Skip if just started (depth 0)
        if (currentDepth === 0 && history.length === 0) {
             if (isGameOver) setIsGameOver(false); 
             // Don't reset acknowledgement here; loadLevelData handles it for loaded completed states
             return;
        }

        const levelCompleted = currentDepth === liveMaxDepthAttainable;
        const stuck = !levelCompleted && currentDepth > 0 && currentPossibleMoves && currentPossibleMoves.length === 0;
        const shouldBeGameOver = levelCompleted || stuck;

        if (shouldBeGameOver) {
            if (!isGameOver) { // Transitioning TO game over
                // console.log("Setting isGameOver = true, hasAcknowledgedGameOver = false");
                setIsGameOver(true);
                setHasAcknowledgedGameOver(false); // Require acknowledgement
            }
        } else {
             if (isGameOver) { // Transitioning FROM game over (e.g., undo)
                 // console.log("Setting isGameOver = false, hasAcknowledgedGameOver = false");
                 setIsGameOver(false);
                 setHasAcknowledgedGameOver(false); // Reset acknowledgement
             }
        }
    }, [
        gameData, animationState.animating, showEndGamePanelOverride, 
        currentDepth, history.length, 
        liveMaxDepthAttainable, currentPossibleMoves, 
        isGameOver, loading 
        // Removed hasAcknowledgedGameOver as direct dependency to prevent potential loops
    ]);

    // Effect to save detailed summary on level completion
    useEffect(() => {
        // Save only if naturally game over, not acknowledged yet, not overridden, completed, date/data exist, and not loading
        if (isGameOver && !hasAcknowledgedGameOver && !showEndGamePanelOverride && currentDepth === liveMaxDepthAttainable && currentDate && gameData && !loading) {
            const progressKey = `wordChainsProgress-${getFormattedDate(currentDate)}`;
            const existingProgressString = localStorage.getItem(progressKey);
            let dailyProgressData: DailyProgressStorage = {};
            if (existingProgressString) dailyProgressData = JSON.parse(existingProgressString);

            const summaryToSave: LevelCompletionSummary = {
                history: history, 
                score: currentDepth,
                playerWords: Array.from(livePlayerUniqueWordsFound),
                maxScore: liveMaxDepthAttainable,
                optimalPathWords: liveOptimalPathWords,
                difficultyForSummary: difficulty
            };

            let updated = false;
            if (difficulty === 'simple') {
                if (!dailyProgressData.simple?.completed) { 
                    dailyProgressData.simple = { completed: true, summary: summaryToSave };
                    setDailyProgress(prev => ({ ...prev, simpleCompleted: true }));
                    updated = true;
                }
            } else if (difficulty === 'hard') {
                 if (!dailyProgressData.hard?.completed) { 
                    dailyProgressData.hard = { completed: true, summary: summaryToSave };
                    setDailyProgress(prev => ({ ...prev, hardCompleted: true }));
                    updated = true;
                 }
            }
            if (updated) {
                localStorage.setItem(progressKey, JSON.stringify(dailyProgressData));
            }
        }
    }, [
        isGameOver, hasAcknowledgedGameOver, showEndGamePanelOverride, currentDepth, liveMaxDepthAttainable, currentDate, gameData, 
        difficulty, history, livePlayerUniqueWordsFound, liveOptimalPathWords, loading
    ]);


    // Effect to show hint after 3 failed attempts
    useEffect(() => {
        if (turnFailedAttempts >= 3 && !isGameOver && !showEndGamePanelOverride && !loading) {
            const coordinates = calculateHintCoordinates(currentPossibleMoves, grid);
            if (coordinates.length > 0) {
                setHintCells(coordinates);
                if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
                hintTimeoutRef.current = window.setTimeout(() => { setHintCells([]); hintTimeoutRef.current = null; }, 3000);
            }
        }
    }, [turnFailedAttempts, currentPossibleMoves, grid, calculateHintCoordinates, isGameOver, showEndGamePanelOverride, loading]);

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
        // Prevent swap if animating, game over (and not acknowledged), panel shown, loading, or no data/grid
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
    }, [grid, currentPossibleMoves, currentDepth, animationState.animating, isGameOver, gameData, history, triggerWiggle, incrementFailedAttempts, showEndGamePanelOverride, loading, hasAcknowledgedGameOver]); // Added hasAcknowledgedGameOver dependency

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
        console.log(`Removed saved state: ${stateKey}`); // Keep for debugging

        setLoading(true); 
        masterResetGameStates();
        setReloadTrigger(prev => prev + 1); // Trigger data load for current difficulty
    }, [currentDate, difficulty, masterResetGameStates, loading, showEndGamePanelOverride]); // Added difficulty dependency

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

    // Handles switching to Hard mode
    const handlePlayHardMode = useCallback(() => {
        if (loading || showEndGamePanelOverride) return; // Prevent action if loading or panel shown
        setLoading(true); 
        masterResetGameStates();
        setDifficulty('hard'); 
    }, [masterResetGameStates, loading, showEndGamePanelOverride]);

    // Handles switching to Simple mode
    const handlePlaySimpleMode = useCallback(() => {
        if (loading || showEndGamePanelOverride) return; // Prevent action if loading or panel shown
        setLoading(true); 
        masterResetGameStates();
        setDifficulty('simple');
    }, [masterResetGameStates, loading, showEndGamePanelOverride]);

    // Handles the hint button click
    const handleHintButtonClick = useCallback(() => {
        if (!animationState.animating && !showEndGamePanelOverride && !isGameOver && !loading) {
            const coordinates = calculateHintCoordinates(currentPossibleMoves, grid);
            if (coordinates.length > 0) {
                setHintCells(coordinates);
                if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
                hintTimeoutRef.current = window.setTimeout(() => { setHintCells([]); hintTimeoutRef.current = null; }, 3000);
            }
        }
    }, [currentPossibleMoves, animationState.animating, grid, calculateHintCoordinates, showEndGamePanelOverride, isGameOver, loading]);

    // Handles showing the game summary manually
    const handleShowGameSummary = useCallback(() => { // Removed summaryDifficulty param
        if (!currentDate || loading) { 
            console.warn("Cannot show summary: Current date not set or app is loading.");
            return;
        }
        const progressKey = `wordChainsProgress-${getFormattedDate(currentDate)}`;
        const savedProgressString = localStorage.getItem(progressKey);
        let loadedSimpleSummary: LevelCompletionSummary | null = null;
        let loadedHardSummary: LevelCompletionSummary | null = null;

        if (savedProgressString) {
            const parsedProgress: DailyProgressStorage = JSON.parse(savedProgressString);
            loadedSimpleSummary = parsedProgress.simple?.summary || null;
            loadedHardSummary = parsedProgress.hard?.summary || null;
        }

        // If neither summary exists in storage, potentially show live data as fallback?
        // For now, only show the panel if at least one summary exists.
        if (loadedSimpleSummary || loadedHardSummary) {
            setCombinedSummaryData({
                simple: loadedSimpleSummary,
                hard: loadedHardSummary,
            });
            setShowEndGamePanelOverride(true);
            setHasAcknowledgedGameOver(true); // Acknowledge any current game over state when viewing summary
        } else {
             console.warn(`No saved summaries found for ${getFormattedDate(currentDate)}. Cannot show combined summary.`);
             // Optionally, could show live data here if desired, but requires more complex prop mapping
        }
    }, [currentDate, loading]); // Removed dependencies related to live data for simplicity


    // Render Helper for Word Chain
    const renderWordChain = () => {
        // Show live history if not showing override panel
        const displayHistory = (!showEndGamePanelOverride) ? history : []; // Don't show chain when viewing summary panel
        
        if (displayHistory.length === 0) return <div className="min-h-[2rem] mt-4"></div>;
        return (
            <div className="flex flex-wrap items-center justify-center mt-4 space-x-2 text-lg px-4 pb-2">
                {displayHistory.map((histEntry, index) => (
                    <React.Fragment key={`hist-${index}`}>
                        <span className="px-2 py-1 bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200 rounded font-medium">
                            {histEntry.wordsFormedByMove?.[0]?.toUpperCase() || '???'}
                            {histEntry.wordsFormedByMove && histEntry.wordsFormedByMove.length > 1 ? '...' : ''}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400 font-bold mx-1">→</span>
                    </React.Fragment>
                ))}
                <span className="px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded font-medium">Current</span>
            </div>
        );
    };

    // --- Conditional Rendering for Loading/Error States ---
    if (loading) return <div className="flex justify-center items-center min-h-screen text-gray-700 dark:text-gray-300">Loading {difficulty} level for {currentDate ? getFormattedDate(currentDate) : 'today'}...</div>;
    if (error) return (
        <div className="flex flex-col justify-center items-center min-h-screen text-center px-4">
            <p className="text-red-600 dark:text-red-400 text-xl font-semibold">Error</p>
            <p className="text-gray-700 dark:text-gray-300 mt-2">{error}</p>
            <button onClick={() => { setLoading(true); masterResetGameStates(); setDifficulty('simple'); setCurrentDate(new Date()); }} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600">Try Again</button>
        </div>
    );
    if (!gameData && !loading) return <div className="flex justify-center items-center min-h-screen text-gray-500 dark:text-gray-400">Game data could not be loaded. Please ensure levels are available.</div>;


    const currentLevelOverallCompleted = (difficulty === 'simple' && dailyProgress.simpleCompleted) || (difficulty === 'hard' && dailyProgress.hardCompleted);

    // Determine props for EndGamePanel
    // Prepare data for the panel, converting loaded summary or using live data
    let simpleDataForPanel: LevelResultData | null = null;
    let hardDataForPanel: LevelResultData | null = null;

    const shouldShowEndGamePanel = (isGameOver && !hasAcknowledgedGameOver) || showEndGamePanelOverride;

    if (shouldShowEndGamePanel) {
        if (showEndGamePanelOverride && combinedSummaryData) {
            // Use loaded summary data
            if (combinedSummaryData.simple) {
                simpleDataForPanel = {
                    ...combinedSummaryData.simple,
                    playerWords: new Set(combinedSummaryData.simple.playerWords),
                    levelCompleted: combinedSummaryData.simple.score === combinedSummaryData.simple.maxScore,
                };
            }
            if (combinedSummaryData.hard) {
                 hardDataForPanel = {
                    ...combinedSummaryData.hard,
                    playerWords: new Set(combinedSummaryData.hard.playerWords),
                    levelCompleted: combinedSummaryData.hard.score === combinedSummaryData.hard.maxScore,
                };
            }
        } else if (isGameOver && !hasAcknowledgedGameOver && gameData) {
            // Use live data for the mode that just ended
            // And try to load the *other* mode's summary from localStorage
            const liveData: LevelResultData = {
                history: history,
                score: currentDepth,
                maxScore: liveMaxDepthAttainable,
                playerWords: livePlayerUniqueWordsFound,
                optimalPathWords: liveOptimalPathWords,
                levelCompleted: currentDepth === liveMaxDepthAttainable,
            };

            if (difficulty === 'simple') {
                simpleDataForPanel = liveData;
                // Try to load hard summary
                 const progressKey = `wordChainsProgress-${getFormattedDate(currentDate)}`;
                 const savedProgressString = localStorage.getItem(progressKey);
                 if (savedProgressString) {
                     const parsedProgress: DailyProgressStorage = JSON.parse(savedProgressString);
                     if (parsedProgress.hard?.summary) {
                         hardDataForPanel = {
                             ...parsedProgress.hard.summary,
                             playerWords: new Set(parsedProgress.hard.summary.playerWords),
                             levelCompleted: parsedProgress.hard.summary.score === parsedProgress.hard.summary.maxScore,
                         };
                     }
                 }
            } else { // difficulty === 'hard'
                hardDataForPanel = liveData;
                 // Try to load simple summary
                 const progressKey = `wordChainsProgress-${getFormattedDate(currentDate)}`;
                 const savedProgressString = localStorage.getItem(progressKey);
                 if (savedProgressString) {
                     const parsedProgress: DailyProgressStorage = JSON.parse(savedProgressString);
                     if (parsedProgress.simple?.summary) {
                         simpleDataForPanel = {
                             ...parsedProgress.simple.summary,
                             playerWords: new Set(parsedProgress.simple.summary.playerWords),
                             levelCompleted: parsedProgress.simple.summary.score === parsedProgress.simple.summary.maxScore,
                         };
                     }
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
                <a href="/">Word Chain</a>
            </h1>
            <h2 className="text-2xl mb-1 text-gray-700 dark:text-gray-300">
                {currentDate ? getFriendlyDate(currentDate) : 'Loading date...'} <span className="capitalize">{difficulty !== 'simple' && <i>({difficulty} difficulty) </i>}</span>
                {currentLevelOverallCompleted && <i className="fas fa-check text-green-600 ml-2"></i>}
            </h2>

            <div className="text-center max-w-xl mb-2 text-sm text-gray-600 dark:text-gray-400">
                {difficulty === 'simple' &&
                    <p><span className="font-semibold mb-1">How to Play: </span>Click adjacent cells or drag-and-drop letters to swap them. Find the optimal move sequence to win! Every move <i>must</i> make a new {wordLength}-letter word. Click the light bulb button <i className="fas fa-lightbulb"></i> to get a hint about the next move.</p>}
                {difficulty === 'hard' &&
                    <p><span className="font-semibold mb-1">How to Play: </span>This is hard mode. It is the same rules as simple mode, just with a bigger grid. This means words can be made vertically or horizontally. Also, no hints. You still need to find the optimal move sequence to win. Remember that every move <i>must</i> make a new <i>{wordLength}-letter</i> word.</p>}
            </div>

            {/* Messages for Daily Progress */}
            {difficulty === 'hard' && dailyProgress.hardCompleted && (
                <div className="text-center max-w-xl mb-2 text-lg text-blue-600 dark:text-blue-400">
                    <p><strong>You have completed both levels for today!</strong></p>
                    <p>Come back tomorrow for another challenge.</p>
                </div>
            )}
            {dailyProgress.simpleCompleted && difficulty === 'simple' && (
                 <div className="text-center max-w-xl mb-2 text-lg text-blue-600 dark:text-blue-400">
                    <p>
                        <strong>You have completed the first level.</strong>{' '}
                        Maybe try <a onClick={handlePlayHardMode} className="italic underline hover:text-purple-600 dark:hover:text-purple-400 cursor-pointer">hard mode</a> next?
                    </p>
                </div>
            )}

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
                    <ProgressBar currentScore={showEndGamePanelOverride && combinedSummaryData ? (difficulty === 'simple' ? combinedSummaryData.simple?.score : combinedSummaryData.hard?.score) ?? currentDepth : currentDepth} 
                                 maxScore={showEndGamePanelOverride && combinedSummaryData ? (difficulty === 'simple' ? combinedSummaryData.simple?.maxScore : combinedSummaryData.hard?.maxScore) ?? liveMaxDepthAttainable : liveMaxDepthAttainable} />
                    <div className="flex space-x-1 ml-2">
                        <button onClick={handleBack} disabled={history.length === 0 || animationState.animating || (isGameOver && !hasAcknowledgedGameOver) || showEndGamePanelOverride || loading } className={`p-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md shadow hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed`} title="Back (Undo last move)">
                            <i className="fas fa-step-backward"></i>
                        </button>
                        <button onClick={handleReset} disabled={animationState.animating || showEndGamePanelOverride || loading} className={`p-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md shadow hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:focus:ring-indigo-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed`} title="Reset Game">
                            <i className="fas fa-redo"></i>
                        </button>
                        {difficulty === 'simple' &&
                            <button onClick={handleHintButtonClick} disabled={animationState.animating || isGameOver || (currentPossibleMoves && currentPossibleMoves.length === 0) || showEndGamePanelOverride || loading} className={`p-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md shadow hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400 dark:focus:ring-yellow-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed`} title="Get a Hint">
                                <i className="fas fa-lightbulb"></i>
                            </button>
                        }
                    </div>
                </div>
            </div>

            {renderWordChain()}


            {/* Combined Daily Status & Navigation Section */}
            <div className="text-center max-w-xl w-full my-4 p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 shadow-sm">
                <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100">Today's Status</h3>
                <div className="flex flex-col sm:flex-row justify-around items-center gap-4">
                    {/* Normal Mode Status */}
                    <div className="flex-1 text-center p-2 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 min-w-[150px]">
                        <p className="font-medium text-gray-700 dark:text-gray-300">Normal Mode</p>
                        {dailyProgress.simpleCompleted ? (
                            <>
                                <p className="text-green-600 dark:text-green-400 font-bold my-1">Completed <i className="fas fa-check"></i></p>
                            </>
                        ) : (
                            <p className="text-gray-500 dark:text-gray-400 my-1 italic">Not Completed</p>
                        )}
                    </div>

                    {/* Hard Mode Status */}
                    <div className="flex-1 text-center p-2 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 min-w-[150px]">
                        <p className="font-medium text-gray-700 dark:text-gray-300">Hard Mode</p>
                        {dailyProgress.hardCompleted ? (
                            <>
                                <p className="text-green-600 dark:text-green-400 font-bold my-1">Completed <i className="fas fa-check"></i></p>
                            </>
                        ) : (
                            <p className="text-gray-500 dark:text-gray-400 my-1 italic">Not Completed</p>
                        )}
                    </div>
                </div>
                {/* Difficulty Switch Buttons (Contextual) */}
                <div className="mt-4 flex justify-center gap-3">
                    {(dailyProgress.simpleCompleted || dailyProgress.hardCompleted) &&
                        <button
                            onClick={() => handleShowGameSummary()} // Updated: No difficulty param needed
                            disabled={showEndGamePanelOverride || loading}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="View summary for completed Hard level"
                        >
                            <i className="fas fa-eye mr-1"></i> View Summary
                        </button>}
                {difficulty == 'hard' && (
                    <button
                        onClick={handlePlaySimpleMode}
                        disabled={showEndGamePanelOverride || loading}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-md shadow focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Back to Normal Mode
                    </button>
                )}
                {dailyProgress.simpleCompleted && difficulty === 'simple' && (
                    <button
                        onClick={handlePlayHardMode}
                        disabled={showEndGamePanelOverride || loading}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-md shadow focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Play Hard Mode
                    </button>
                )}
                </div>
            </div>

            {isDebugMode && gameData && <ExplorationTreeView treeData={gameData.explorationTree} />}
            {shouldShowEndGamePanel && (simpleDataForPanel || hardDataForPanel) && ( // Ensure at least one set of data exists
                <EndGamePanel 
                    difficulty={difficulty}
                    simpleModeData={simpleDataForPanel}
                    hardModeData={hardDataForPanel}
                    handlePlayHardMode={handlePlayHardMode}
                    onClose={handleCloseGameOver}
                />
            )}
        </div>
    );
}

export default App;
