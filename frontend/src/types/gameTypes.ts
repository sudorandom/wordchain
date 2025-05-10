// src/types/gameTypes.ts

// --- Types from gameHelpers.ts ---
export type DifficultyLevel = 'normal' | 'hard' | 'impossible';
export const DIFFICULTIES: DifficultyLevel[] = ['normal', 'hard', 'impossible'];

export interface CellCoordinates {
    row: number;
    col: number;
}

export interface GameMove {
    from: [number, number]; // Assuming [row, col] tuple
    to: [number, number];   // Assuming [row, col] tuple
}

export interface PathStep {
    from: [number, number];
    to: [number, number];
    wordsFormed: string[];
}

export interface ExplorationNodeData {
    move?: GameMove; // Optional move that leads to this node
    wordsFormed: string[]; // Words formed by taking the move to this node
    maxDepthReached: number; // Max depth achievable from this node onwards
    nextMoves?: ExplorationNodeData[]; // Further possible moves/nodes
}

export interface GameData {
    initialGrid: string[][];
    minWordLength: number;
    wordLength: number;
    requiredMinTurns: number; // This might be deprecated if maxDepthReached is primary
    maxDepthReached: number; // Max possible score/depth for this level
    explorationTree: ExplorationNodeData[]; // Root nodes of the exploration tree
}

export interface HistoryEntry {
    grid: string[][]; // State of the grid after the move
    currentPossibleMoves: ExplorationNodeData[]; // Possible moves from this state (can be complex if not used)
    currentDepth: number; // Depth/score at this point in history
    moveMade: { from: CellCoordinates; to: CellCoordinates }; // The specific move taken
    wordsFormedByMove: string[]; // Words formed by this specific move
    turnFailedAttempts: number; // Failed attempts at the turn this move was made (or leading to it)
    isDeviated: boolean; // Whether the player has deviated from an optimal path
}

export interface AnimationState {
    animating: boolean;
    from: CellCoordinates | null;
    to: CellCoordinates | null;
}

// --- Core Game State (consumed by useGameCore and GameLogic) ---
export interface CoreGameState {
    grid: string[][];
    currentPossibleMoves: ExplorationNodeData[]; // Possible next optimal moves from current state
    currentDepth: number; // Player's current score/depth
    history: HistoryEntry[]; // Player's move history
    hasDeviated: boolean; // Is player currently off an optimal path shown by currentPossibleMoves
    turnFailedAttempts: number; // Failed attempts for the current turn
    isGameOver: boolean; // Is the game logically over
    gameData: GameData | null; // The loaded level data (contains optimal paths, etc.)
}

// --- Storage Related Types ---
export interface SavedProgressState {
    history: HistoryEntry[]; // Saved history
    currentDepth: number; // Saved depth/score
    hasDeviated: boolean; // Saved deviation status
    turnFailedAttempts: number; // Saved failed attempts for the state history is at
    // Note: The grid itself can be reconstructed from the last history entry's grid or initialGrid + history.
    // If you save the grid separately, add it here.
}

export interface LevelCompletionSummary {
    history: HistoryEntry[]; // Full history of the completed game
    score: number; // Final score
    maxScore: number; // Max possible score for the level
    optimalPathWords: string[]; // An example of an optimal word sequence
    playerWords: string[]; // Unique words found by the player
    difficultyForSummary: DifficultyLevel;
    finalGrid: string[][]; // Grid state at the end of the game
    // Potentially timestamp, date, etc.
}

// Structure for daily progress storage
export interface DailyProgressDifficultySummary {
    completed: boolean;
    summary?: LevelCompletionSummary;
}
export type DailyProgressRecord = Record<DifficultyLevel, DailyProgressDifficultySummary | undefined>;


// For loadDifficultyCompletionStatus
export type DailyCompletionStatus = Record<DifficultyLevel, boolean>;


// --- UI Specific Types (e.g., for summary panels) ---
export interface LevelResultData {
    history: HistoryEntry[];
    score: number;
    maxScore: number;
    optimalPathWords: string[];
    levelCompleted: boolean;
}

// --- Game Logic Interaction Results (Interfaces for GameLogic methods) ---
export interface SwapResult {
    success: boolean;
    newState?: CoreGameState; // The new state of the game after the swap
    wordsFormed?: string[]; // Words formed by a successful swap
    moveDetails?: { from: CellCoordinates; to: CellCoordinates }; // Details of the swap
    message?: string; // Message, especially on failure
}

export interface UndoResult {
    success: boolean;
    newState?: CoreGameState; // Game state after undo
    undoneMove?: { from: CellCoordinates; to: CellCoordinates }; // The move that was undone
    message?: string; // Message, especially on failure
}

// --- Helper Function Signatures (from gameHelpers.ts) ---
// These are now more accurately typed based on gameHelpers.ts
export declare function getFriendlyDate(date: Date | undefined | null, options?: { includeWeekday?: boolean; locale?: string }): string;
export declare function getFormattedDate(date: Date | undefined): string;
export declare function getDataFilePath(date: Date): string;
export declare function findLongestWordChain(nodes: ExplorationNodeData[] | undefined, history: HistoryEntry[] | undefined): string[];
export declare function areAdjacent(cell1: CellCoordinates | null, cell2: CellCoordinates | null): boolean;
export declare function findWordCoordinates(grid: string[][], word: string, moveCoords: GameMove): CellCoordinates[] | null;

// Added declaration for getInitialGameState
export interface InitialGameStateUI {
    grid: string[][] | null;
    currentPossibleMoves: ExplorationNodeData[];
    currentDepth: number;
    history: HistoryEntry[];
    hasDeviated: boolean;
    isInvalidMove: boolean;
    invalidMoveMessage: string;
    foundWordsDisplay: string[];
    isGameOver: boolean;
    selectedCell: CellCoordinates | null;
    draggedCell: CellCoordinates | null;
    hoveredCell: CellCoordinates | null;
    wiggleCells: CellCoordinates[];
    turnFailedAttempts: number;
    hintCells: CellCoordinates[];
    animationState: AnimationState;
}
export declare function getInitialGameState(data?: GameData | null): InitialGameStateUI;


// --- Storage Function Signatures (Illustrative - define based on your core/storage.ts) ---
export declare namespace storage {
    export function loadDarkModePreference(): boolean | undefined;
    export function saveDarkModePreference(isDark: boolean): void;
    
    export function loadDifficultyCompletionStatus(date: Date, difficulties: DifficultyLevel[]): DailyCompletionStatus;
    export function simpleHash(str: string): string; // Used for comparing level data versions

    export function loadInProgressState(date: Date, difficulty: DifficultyLevel, fileHash: string): SavedProgressState | null;
    export function saveInProgressState(date: Date, difficulty: DifficultyLevel, state: SavedProgressState, fileHash: string): void;
    export function removeInProgressState(date: Date, difficulty: DifficultyLevel): void;
    
    export function loadDailyProgress(date: Date): DailyProgressRecord;
    export function saveDailyProgress(date: Date, progress: DailyProgressRecord): void;
    
    export function loadAllSummariesForDate(date: Date, difficulties: DifficultyLevel[]): Partial<Record<DifficultyLevel, LevelCompletionSummary | null>>;
    export function loadSummaryForDifficulty(date: Date, difficulty: DifficultyLevel): LevelCompletionSummary | null;
}

// --- GameLogic Class Signature (Illustrative - define based on your core/gameLogic.ts) ---
export declare class GameLogic {
    constructor();
    public loadLevel(gameData: GameData, savedProgress?: SavedProgressState | null): CoreGameState;
    public getCurrentGameState(): CoreGameState;
    public getGameStateForSaving(): SavedProgressState | null; // Should return data matching SavedProgressState
    public performSwap(cell1: CellCoordinates, cell2: CellCoordinates): SwapResult;
    public undoLastMove(): UndoResult;
    public resetLevel(): CoreGameState; // Resets to the beginning of the current gameData
    public forceGameOver(): void; // Forces the isGameOver flag in the current state
    public calculateHintCoordinates(): CellCoordinates[]; // Calculates hint based on current game state
    public setStateForSolutionView(grid: string[][], history: HistoryEntry[], score: number): CoreGameState;
}
