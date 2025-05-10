// src/core/gameLogic.ts
import {
    CellCoordinates,
    GameData,
    HistoryEntry,
    ExplorationNodeData,
    GameMove,
    areAdjacent,
    findWordCoordinates,
} from '../utils/gameHelpers'; // Assuming gameHelpers is in ../utils/

export interface CoreGameState {
    grid: string[][];
    currentPossibleMoves: ExplorationNodeData[];
    currentDepth: number;
    history: HistoryEntry[];
    hasDeviated: boolean;
    turnFailedAttempts: number;
    isGameOver: boolean;
    gameData: GameData | null;
    maxDepthAttainable: number;
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
                        const opt1 = n.move.from[0] === histFrom.row && n.move.from[1] === histFrom.col && n.move.to[0] === histTo.row && n.move.to[1] === histTo.col;
                        const opt2 = n.move.from[0] === histTo.row && n.move.from[1] === histTo.col && n.move.to[0] === histFrom.row && n.move.to[1] === histFrom.col;
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
        isDeviatedMove?: boolean; // This reflects the current 'hasDeviated' status
        moveDetails?: GameMove;
    } {
        // Initial checks
        if (!this.gameData) {
            return { success: false, message: "Game data not loaded." };
        }
        // If game is already determined to be over (completed, or stuck on optimal path), prevent further moves.
        // If stuck on a deviated path, this.isGameOver will be false, allowing move "attempts".
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

        if (matchedNode && matchedNode.move) {
            const originalGridForHistory = this.grid.map(r => [...r]);
            const historyEntry: HistoryEntry = {
                grid: originalGridForHistory,
                currentPossibleMoves: [...this.currentPossibleMoves],
                currentDepth: this.currentDepth,
                moveMade: {
                    from: { row: matchedNode.move.from[0], col: matchedNode.move.from[1] },
                    to: { row: matchedNode.move.to[0], col: matchedNode.move.to[1] }
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
            
            // Determine if the current path (including this move) is suboptimal
            const isMoveInherentlySubOptimal = (this.currentDepth + (matchedNode.maxDepthReached || 0)) < this.getMaxDepthAttainable();
            // Update hasDeviated: if already deviated, remains deviated. If not, becomes deviated if this move is suboptimal.
            this.hasDeviated = this.hasDeviated || isMoveInherentlySubOptimal;

            this.turnFailedAttempts = 0; 
            
            this.checkAndUpdateGameOver(); 

            return {
                success: true,
                newState: this.getCurrentGameState(),
                wordsFormed: matchedNode.wordsFormed || [],
                isDeviatedMove: this.hasDeviated, // Return the current deviation status
                moveDetails: matchedNode.move
            };
        } else {
            this.turnFailedAttempts++;
            // checkAndUpdateGameOver(); // Not strictly necessary here as an invalid move doesn't change core game progression for game over.
                                     // However, if turnFailedAttempts itself could trigger a game over (e.g. too many fails), it would be needed.
                                     // For current logic, it's fine to omit.
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
                if (this.hasDeviated) {
                    this.isGameOver = false; 
                } else {
                    this.isGameOver = true;
                }
            } else {
                this.isGameOver = false;
            }
        }
    }
    
    public forceGameOver(): void {
        this.isGameOver = true;
    }

    public getPlayerUniqueWordsFound(): Set<string> {
        const words = new Set<string>();
        this.history.forEach(state => {
            if (Array.isArray(state.wordsFormedByMove)) {
                state.wordsFormedByMove.forEach(word => words.add(word));
            }
        });
        return words;
    }
    
    public getMaxDepthAttainable(): number {
        return this.gameData ? this.gameData.maxDepthReached : 0;
    }

    public getWordLength(): number {
        return this.gameData ? this.gameData.wordLength : 4;
    }

    public getCurrentGameState(): CoreGameState {
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

    public getGameStateForSaving(): SavedProgressState | null {
        if (!this.gameData) return null;
        return {
            lastGrid: this.grid.map(r => [...r]),
            history: [...this.history], 
            currentDepth: this.currentDepth,
            turnFailedAttempts: this.turnFailedAttempts,
            hasDeviated: this.hasDeviated,
        };
    }

    public calculateHintCoordinates(): CellCoordinates[] {
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
            const moveDetails = optimalMoveNode.move;
            
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

    public setStateForSolutionView(grid: string[][], history: HistoryEntry[], score: number): CoreGameState {
        this.grid = grid.map(r => [...r]);
        this.history = history.map(h => ({...h}));
        this.currentDepth = score;
        this.currentPossibleMoves = []; 
        this.hasDeviated = false; 
        this.turnFailedAttempts = 0;
        this.isGameOver = true; 
        return this.getCurrentGameState();
    }
}
