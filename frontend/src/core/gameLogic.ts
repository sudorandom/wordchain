// src/core/gameLogic.ts
import {
    areAdjacent,
    findWordCoordinates,
} from '../utils/gameHelpers';
import {
    CellCoordinates,
    GameData,
    HistoryEntry,
    ExplorationNodeData,
    GameMove,
    PathStep,
} from '../types/gameTypes';

export interface CoreGameState {
    grid: string[][];
    currentPossibleMoves: ExplorationNodeData[];
    currentDepth: number;
    history: HistoryEntry[];
    hasDeviated: boolean;
    turnFailedAttempts: number;
    isGameOver: boolean;
    gameData: GameData | null;
    maxDepthAttainable: number; // This should be the global max depth for the level
    wordLength: number;
}

export interface SavedProgressState {
    lastGrid: string[][];
    history: HistoryEntry[];
    currentDepth: number;
    turnFailedAttempts: number;
    hasDeviated: boolean;
}

export class GameLogic {
    private grid: string[][];
    private currentPossibleMoves: ExplorationNodeData[];
    private currentDepth: number;
    private history: HistoryEntry[];
    private hasDeviated: boolean;
    private turnFailedAttempts: number;
    private isGameOver: boolean;
    private gameData: GameData | null;

    constructor() {
        this.gameData = null;
        this.grid = [[]];
        this.currentPossibleMoves = [];
        this.currentDepth = 0;
        this.history = [];
        this.hasDeviated = false;
        this.turnFailedAttempts = 0;
        this.isGameOver = false;
    }

    public loadLevel(
        gameData: GameData,
        savedState?: SavedProgressState
    ): CoreGameState {
        this.gameData = gameData;

        if (savedState) {
            this.grid = savedState.lastGrid.map(r => [...r]);
            this.history = savedState.history.map(h => ({ ...h })); 
            this.currentDepth = savedState.currentDepth;
            this.turnFailedAttempts = savedState.turnFailedAttempts;
            this.hasDeviated = savedState.hasDeviated;

            if (this.history.length > 0 && this.gameData.explorationTree) {
                let currentNodeSet = [...this.gameData.explorationTree];
                let historyPathFound = true;
                for (const histEntry of this.history) {
                    if (!histEntry.moveMade || !currentNodeSet || currentNodeSet.length === 0) {
                        historyPathFound = false;
                        break;
                    }
                    const { from: histFrom, to: histTo } = histEntry.moveMade;
                    const matchedNode = currentNodeSet.find(n => {
                        if (!n.move) return false;
                        // Ensure n.move.from and n.move.to are treated as [number, number]
                        const nodeFrom = n.move.from as [number, number];
                        const nodeTo = n.move.to as [number, number];
                        const opt1 = nodeFrom[0] === histFrom.row && nodeFrom[1] === histFrom.col && nodeTo[0] === histTo.row && nodeTo[1] === histTo.col;
                        const opt2 = nodeFrom[0] === histTo.row && nodeFrom[1] === histTo.col && nodeTo[0] === histFrom.row && nodeTo[1] === histFrom.col;
                        return opt1 || opt2;
                    });
                    if (matchedNode && matchedNode.nextMoves) {
                        currentNodeSet = matchedNode.nextMoves;
                    } else {
                        historyPathFound = false;
                        break;
                    }
                }
                this.currentPossibleMoves = historyPathFound ? currentNodeSet : [];
            } else {
                this.currentPossibleMoves = this.gameData.explorationTree ? [...this.gameData.explorationTree] : [];
            }
        } else {
            this.grid = this.gameData.initialGrid.map(r => [...r]);
            this.currentPossibleMoves = this.gameData.explorationTree ? [...this.gameData.explorationTree] : [];
            this.currentDepth = 0;
            this.history = [];
            this.hasDeviated = false;
            this.turnFailedAttempts = 0;
        }
        this.isGameOver = false; 
        this.checkAndUpdateGameOver();
        return this.getCurrentGameState();
    }

    public resetLevel(): CoreGameState | null {
        if (!this.gameData) return null;

        this.grid = this.gameData.initialGrid.map(r => [...r]);
        this.currentPossibleMoves = this.gameData.explorationTree ? [...this.gameData.explorationTree] : [];
        this.currentDepth = 0;
        this.history = [];
        this.hasDeviated = false;
        this.turnFailedAttempts = 0;
        this.isGameOver = false;
        this.checkAndUpdateGameOver();
        return this.getCurrentGameState();
    }

    public performSwap(cell1: CellCoordinates, cell2: CellCoordinates): {
        success: boolean;
        message?: string;
        newState?: CoreGameState;
        wordsFormed?: string[];
        isDeviatedMove?: boolean;
        moveDetails?: GameMove; // GameMove is { from: [number,number], to: [number,number] }
    } {
        if (!this.gameData) {
            return { success: false, message: "Game data not loaded." };
        }
        if (this.isGameOver) {
            return { success: false, message: "Game is over." };
        }

        if (!areAdjacent(cell1, cell2)) {
            this.turnFailedAttempts++;
            return { success: false, message: "Must swap adjacent cells.", newState: this.getCurrentGameState() };
        }

        let matchedNode: ExplorationNodeData | null = null;
        const moveOption1 = { from: [cell1.row, cell1.col], to: [cell2.row, cell2.col] } as GameMove;
        const moveOption2 = { from: [cell2.row, cell2.col], to: [cell1.row, cell1.col] } as GameMove;

        if (this.currentPossibleMoves && this.currentPossibleMoves.length > 0) {
            for (const node of this.currentPossibleMoves) {
                if (!node.move) continue;
                const nodeMove = node.move as GameMove; // Cast to GameMove
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

        if (matchedNode && matchedNode.move) {
            const originalGridForHistory = this.grid.map(r => [...r]);
            const historyEntry: HistoryEntry = {
                grid: originalGridForHistory,
                currentPossibleMoves: [...this.currentPossibleMoves],
                currentDepth: this.currentDepth,
                moveMade: { // Using CellCoordinates for HistoryEntry
                    from: { row: (matchedNode.move.from as [number,number])[0], col: (matchedNode.move.from as [number,number])[1] },
                    to: { row: (matchedNode.move.to as [number,number])[0], col: (matchedNode.move.to as [number,number])[1] }
                },
                wordsFormedByMove: matchedNode.wordsFormed || [],
                turnFailedAttempts: this.turnFailedAttempts,
                isDeviated: this.hasDeviated, 
            };
            this.history.push(historyEntry);

            const newGrid = this.grid.map(r => [...r]);
            const temp = newGrid[cell1.row][cell1.col];
            newGrid[cell1.row][cell1.col] = newGrid[cell2.row][cell2.col];
            newGrid[cell2.row][cell2.col] = temp;
            this.grid = newGrid;

            this.currentDepth++;
            this.currentPossibleMoves = matchedNode.nextMoves || [];
            
            const isMoveInherentlySubOptimal = (this.currentDepth + (matchedNode.maxDepthReached || 0)) < this.getMaxDepthAttainable();
            this.hasDeviated = this.hasDeviated || isMoveInherentlySubOptimal;
            this.turnFailedAttempts = 0; 
            this.checkAndUpdateGameOver(); 

            return {
                success: true,
                newState: this.getCurrentGameState(),
                wordsFormed: matchedNode.wordsFormed || [],
                isDeviatedMove: this.hasDeviated, 
                moveDetails: matchedNode.move as GameMove // Cast to GameMove
            };
        } else {
            this.turnFailedAttempts++;
            return { success: false, message: "Invalid Move! No new word found!", newState: this.getCurrentGameState() };
        }
    }

    public undoLastMove(): { success: boolean; newState?: CoreGameState, undoneMove?: {from: CellCoordinates, to: CellCoordinates} } {
        if (this.history.length === 0) {
            return { success: false };
        }
        const prevState = this.history.pop();
        if (!prevState) return { success: false }; 

        this.grid = prevState.grid.map(r => [...r]);
        this.currentPossibleMoves = [...prevState.currentPossibleMoves];
        this.currentDepth = prevState.currentDepth;
        this.hasDeviated = prevState.isDeviated; 
        this.turnFailedAttempts = prevState.turnFailedAttempts; 
        this.isGameOver = false; 
        this.checkAndUpdateGameOver(); 

        const undoneMoveAnimated = {
            from: prevState.moveMade.to, 
            to: prevState.moveMade.from   
        };
        return { success: true, newState: this.getCurrentGameState(), undoneMove: undoneMoveAnimated };
    }

    private checkAndUpdateGameOver(): void {
        if (!this.gameData) {
            this.isGameOver = false;
            return;
        }
        const maxDepth = this.getMaxDepthAttainable();
        const levelCompleted = this.currentDepth === maxDepth && maxDepth > 0;

        if (levelCompleted) {
            this.isGameOver = true; 
        } else {
            const noMoreMoves = this.currentPossibleMoves.length === 0 && this.currentDepth > 0;
            if (noMoreMoves) {
                this.isGameOver = !this.hasDeviated; // Game over if stuck on optimal, not if stuck on deviated
            } else {
                this.isGameOver = false;
            }
        }
    }
    
    public forceGameOver(): void {
        this.isGameOver = true;
    }

    public getPlayerUniqueWordsFound(): Set<string> { /* ... (same as before) ... */ 
        const words = new Set<string>();
        this.history.forEach(state => {
            if (Array.isArray(state.wordsFormedByMove)) {
                state.wordsFormedByMove.forEach(word => words.add(word));
            }
        });
        return words;
    }
    public getMaxDepthAttainable(): number { /* ... (same as before) ... */ 
        return this.gameData ? this.gameData.maxDepthReached : 0;
    }
    public getWordLength(): number { /* ... (same as before) ... */ 
        return this.gameData ? this.gameData.wordLength : 4;
    }
    public getCurrentGameState(): CoreGameState { /* ... (same as before) ... */ 
        return {
            grid: this.grid.map(r => [...r]),
            currentPossibleMoves: [...this.currentPossibleMoves],
            currentDepth: this.currentDepth,
            history: [...this.history], 
            hasDeviated: this.hasDeviated,
            turnFailedAttempts: this.turnFailedAttempts,
            isGameOver: this.isGameOver,
            gameData: this.gameData, 
            maxDepthAttainable: this.getMaxDepthAttainable(),
            wordLength: this.getWordLength(),
        };
    }
    public getGameStateForSaving(): SavedProgressState | null { /* ... (same as before) ... */ 
        if (!this.gameData) return null;
        return {
            lastGrid: this.grid.map(r => [...r]),
            history: [...this.history], 
            currentDepth: this.currentDepth,
            turnFailedAttempts: this.turnFailedAttempts,
            hasDeviated: this.hasDeviated,
        };
    }
    public calculateHintCoordinates(): CellCoordinates[] { /* ... (same as before) ... */ 
        if (!this.grid || this.grid.length === 0 || this.grid[0].length === 0 || !this.currentPossibleMoves || this.currentPossibleMoves.length === 0) return [];
        let optimalMoveNode: ExplorationNodeData | null = null;
        let highestDepth = -1;
        for (const node of this.currentPossibleMoves) {
            if (typeof node.maxDepthReached === 'number' && node.maxDepthReached > highestDepth) {
                highestDepth = node.maxDepthReached;
                optimalMoveNode = node;
            }
        }
        if (optimalMoveNode && optimalMoveNode.move && optimalMoveNode.wordsFormed && optimalMoveNode.wordsFormed.length > 0) {
            const wordToHighlight = optimalMoveNode.wordsFormed[0];
            const moveDetails = optimalMoveNode.move as GameMove; // Cast to GameMove
            const tempGrid = this.grid.map(r => [...r]);
            const charFrom = tempGrid[moveDetails.from[0]][moveDetails.from[1]];
            const charTo = tempGrid[moveDetails.to[0]][moveDetails.to[1]];
            tempGrid[moveDetails.from[0]][moveDetails.from[1]] = charTo;
            tempGrid[moveDetails.to[0]][moveDetails.to[1]] = charFrom;
            const wordCoordinates = findWordCoordinates(tempGrid, wordToHighlight, moveDetails);
            return wordCoordinates || [];
        }
        return [];
    }
    public setStateForSolutionView(grid: string[][], history: HistoryEntry[], score: number): CoreGameState { /* ... (same as before) ... */ 
        this.grid = grid.map(r => [...r]);
        this.history = history.map(h => ({...h}));
        this.currentDepth = score;
        this.currentPossibleMoves = []; 
        this.hasDeviated = false; 
        this.turnFailedAttempts = 0;
        this.isGameOver = true; 
        return this.getCurrentGameState();
    }

    // --- NEW METHODS FOR PATH FINDING ---

    /**
     * Generates a string representation of a path for deduplication.
     * @param path An array of PathStep objects.
     * @returns A string representation of the path.
     */
    private stringifyPath(path: PathStep[]): string {
        return path.map(step => 
            `${step.from.join(',')}_${step.to.join(',')}_${(step.wordsFormed || []).join(',')}`
        ).join('|');
    }

    /**
     * Finds all unique optimal paths (paths that reach the globalMaxDepth).
     * An optimal path is a sequence of moves leading to the maximum possible game depth.
     * @returns An array of paths, where each path is an array of PathStep objects.
     */
    public getAllOptimalPaths(): PathStep[][] {
        if (!this.gameData || !this.gameData.explorationTree || this.gameData.explorationTree.length === 0) {
            return [];
        }

        const globalMaxDepth = this.gameData.maxDepthReached;
        if (globalMaxDepth <= 0) return []; // No meaningful paths if max depth is 0 or less

        const collectedPaths: PathStep[][] = [];

        const findOptimalPathsRecursive = (
            currentNode: ExplorationNodeData,
            pathSoFar: PathStep[]
        ): void => {
            // Create the PathStep for the current node (move leading to this node)
            // The move and wordsFormed are from the currentNode itself.
            if (!currentNode.move) { // Should not happen for non-conceptual root nodes
                console.warn("[GameLogic.getAllOptimalPaths] Node encountered without a move:", currentNode);
                return;
            }
            const currentStep: PathStep = {
                from: currentNode.move.from as [number, number],
                to: currentNode.move.to as [number, number],
                wordsFormed: currentNode.wordsFormed || [],
            };
            const newPath = [...pathSoFar, currentStep];
            const currentPathLength = newPath.length;

            // Pruning: If the longest path from this node + current path length < globalMaxDepth,
            // this branch cannot reach the global maximum depth.
            if (currentPathLength + (currentNode.maxDepthReached ?? 0) < globalMaxDepth) {
                return;
            }

            // Base Case: If this node is a terminal node for its own longest sequence
            if ((currentNode.maxDepthReached ?? -1) === 0) {
                // And this path's length is exactly the globalMaxDepth
                if (currentPathLength === globalMaxDepth) {
                    collectedPaths.push(newPath);
                }
                return; // End of this branch
            }

            // Recursive Step: Explore next moves
            if (currentNode.nextMoves && currentNode.nextMoves.length > 0) {
                for (const childNode of currentNode.nextMoves) {
                    findOptimalPathsRecursive(childNode, newPath);
                }
            }
        };

        // Start recursion for each root node in the exploration tree
        for (const rootNode of this.gameData.explorationTree) {
            // Only start from root nodes that can potentially lead to an optimal path.
            // The length of the path starting with this rootNode is 1 (for the rootNode itself) + rootNode.maxDepthReached.
            if (1 + (rootNode.maxDepthReached ?? 0) === globalMaxDepth) {
                 findOptimalPathsRecursive(rootNode, []);
            } else if (this.gameData.explorationTree.length === 1 && (rootNode.maxDepthReached ?? 0) === globalMaxDepth && globalMaxDepth === 0) {
                // Handle edge case: tree has one node, maxDepthReached is 0 (e.g. no moves possible from start)
                // This case might not produce a "path" in the traditional sense of moves,
                // but if globalMaxDepth is 0, an empty path or a path with initial words might be considered.
                // For now, if globalMaxDepth is 0, the main loop won't run.
                // If globalMaxDepth is 0, it means no moves. An empty array of paths is correct.
            }
        }
        
        // Deduplicate paths
        const uniquePathStrings = new Set(collectedPaths.map(this.stringifyPath));
        return Array.from(uniquePathStrings).map(s => {
            return s.split('|').map(stepStr => {
                const parts = stepStr.split('_');
                const fromCoords = parts[0].split(',').map(Number) as [number, number];
                const toCoords = parts[1].split(',').map(Number) as [number, number];
                const words = parts[2] ? parts[2].split(',') : [];
                return { from: fromCoords, to: toCoords, wordsFormed: words };
            });
        });
    }

    /**
     * Finds all unique paths to any terminal node in the exploration tree.
     * A terminal node is one with no further moves or where maxDepthReached is 0.
     * @returns An array of paths, where each path is an array of PathStep objects.
     */
    public getAllUniqueTerminalPaths(): PathStep[][] {
        if (!this.gameData || !this.gameData.explorationTree || this.gameData.explorationTree.length === 0) {
            return [];
        }
        const collectedPaths: PathStep[][] = [];

        const findAllTerminalPathsRecursive = (
            currentNode: ExplorationNodeData,
            pathSoFar: PathStep[]
        ): void => {
            if (!currentNode.move) {
                console.warn("[GameLogic.getAllUniqueTerminalPaths] Node encountered without a move:", currentNode);
                return;
            }
            const currentStep: PathStep = {
                from: currentNode.move.from as [number, number],
                to: currentNode.move.to as [number, number],
                wordsFormed: currentNode.wordsFormed || [],
            };
            const newPath = [...pathSoFar, currentStep];

            const isTerminal = (!currentNode.nextMoves || currentNode.nextMoves.length === 0) ||
                               (typeof currentNode.maxDepthReached === 'number' && currentNode.maxDepthReached === 0);

            if (isTerminal) {
                if (newPath.length > 0) { // Ensure we add non-empty paths
                    collectedPaths.push(newPath);
                }
                return; // End of this branch
            }

            if (currentNode.nextMoves && currentNode.nextMoves.length > 0) {
                for (const childNode of currentNode.nextMoves) {
                    findAllTerminalPathsRecursive(childNode, newPath);
                }
            }
        };

        for (const rootNode of this.gameData.explorationTree) {
            findAllTerminalPathsRecursive(rootNode, []);
        }

        // Deduplicate paths
        const uniquePathStrings = new Set(collectedPaths.map(this.stringifyPath));
        return Array.from(uniquePathStrings).map(s => {
            return s.split('|').map(stepStr => {
                const parts = stepStr.split('_');
                const fromCoords = parts[0].split(',').map(Number) as [number, number];
                const toCoords = parts[1].split(',').map(Number) as [number, number];
                const words = parts[2] ? parts[2].split(',') : [];
                return { from: fromCoords, to: toCoords, wordsFormed: words };
            });
        });
    }
}
