// src/utils/gameHelpers.ts
import type {
    DifficultyLevel,
    CellCoordinates,
    GameMove,
    ExplorationNodeData,
    GameData,
    HistoryEntry,
    AnimationState,
    InitialGameStateUI // Imported for getInitialGameState
} from '../types/gameTypes'; // Assuming types are now centralized

// Re-export if these are still defined here and used directly by other modules,
// otherwise, they should primarily be imported from gameTypes.ts by consuming modules.
export type {
    DifficultyLevel,
    CellCoordinates,
    GameMove,
    ExplorationNodeData,
    GameData,
    HistoryEntry,
    AnimationState,
    InitialGameStateUI
};

export const difficulties: DifficultyLevel[] = ['normal', 'hard', 'impossible'];

/**
 * Formats a date into a user-friendly string.
 * Example: "Wednesday, May 7, 2025"
 * @param date The date to format.
 * @param options Formatting options.
 * @returns A string representation of the date, or "Invalid Date" if input is invalid.
 */
export const getFriendlyDate = (
    date: Date | undefined | null,
    options: { includeWeekday?: boolean; locale?: string } = {}
): string => {
    const { locale = undefined } = options; // includeWeekday is part of default intlOptions

    if (!(date instanceof Date) || isNaN(date.getTime())) {
        console.warn("getFriendlyDate was called with an invalid date:", date);
        return "Invalid Date";
    }

    try {
        const intlOptions: Intl.DateTimeFormatOptions = {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long', // includeWeekday is effectively true by default here
        };
        return new Intl.DateTimeFormat(locale, intlOptions).format(date);
    } catch (error) {
        console.error("Error formatting date in getFriendlyDate:", error);
        return date.toDateString(); // Fallback
    }
};

/**
 * Formats a date into YYYY-MM-DD string.
 * @param date The date to format.
 * @returns A string representation of the date in YYYY-MM-DD format, or an empty string if date is undefined.
 */
export const getFormattedDate = (date: Date | undefined): string => {
    if (date === undefined) {
        return '';
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Generates a file path string for a given date.
 * Example: for Date object representing 2025-05-07, returns "2025/05/07.json"
 * @param date The date to generate the path for.
 * @returns A string representing the file path, or an empty string if date is undefined.
 */
export const getDataFilePath = (date: Date): string => {
    // Removed undefined check as gameTypes.ts declares `date: Date`
    // if (date === undefined) {
    //     return '';
    // }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}.json`;
};

/**
 * Finds the longest chain of words from exploration nodes, optionally guided by player history.
 * @param nodes Array of root ExplorationNodeData.
 * @param history Array of player's HistoryEntry.
 * @returns An array of strings representing the words in the longest chain found.
 */
export const findLongestWordChain = (
    nodes: ExplorationNodeData[] | undefined,
    history: HistoryEntry[] | undefined
): string[] => {
    if (!nodes || nodes.length === 0) return [];

    let longestPath: string[] = [];
    let bestStartingMatchCount = -1; // Tracks how well a path matches the start of the player's history

    // Helper to count how many initial words in a path match the player's history
    const calculateInitialMatch = (path: string[]): number => {
        if (!history || history.length === 0) return 0;
        let matchCount = 0;
        for (let i = 0; i < Math.min(path.length, history.length); i++) {
            // Assuming wordsFormedByMove in history contains the relevant word(s) for that step
            const historyWord = history[i]?.wordsFormedByMove?.[0]; // Taking the first word for comparison
            if (historyWord && path[i]?.toUpperCase() === historyWord?.toUpperCase()) {
                matchCount++;
            } else {
                break;
            }
        }
        return matchCount;
    };

    // Recursive function to trace paths through the exploration tree
    const tracePath = (
        node: ExplorationNodeData | undefined,
        currentPathWords: string[]
    ): { path: string[]; matchCount: number } => {
        if (!node) {
            // Base case: end of a branch
            const matchCount = calculateInitialMatch(currentPathWords);
            return { path: currentPathWords, matchCount };
        }

        // Add words from the current node to the path
        const newPathWords = [...currentPathWords, ...(node.wordsFormed || [])];
        let bestResultForBranch = { path: newPathWords, matchCount: calculateInitialMatch(newPathWords) };

        if (node.nextMoves && node.nextMoves.length > 0) {
            for (const nextNode of node.nextMoves) {
                const resultFromNext = tracePath(nextNode, newPathWords);
                // Prioritize longer paths, then paths that better match history
                if (
                    resultFromNext.path.length > bestResultForBranch.path.length ||
                    (resultFromNext.path.length === bestResultForBranch.path.length &&
                     resultFromNext.matchCount > bestResultForBranch.matchCount)
                ) {
                    bestResultForBranch = resultFromNext;
                }
            }
        }
        return bestResultForBranch;
    };

    // Iterate through all starting nodes in the exploration tree
    for (const startNode of nodes) {
        const result = tracePath(startNode, []);
        if (
            result.path.length > longestPath.length ||
            (result.path.length === longestPath.length && result.matchCount > bestStartingMatchCount)
        ) {
            longestPath = result.path;
            bestStartingMatchCount = result.matchCount;
        }
    }

    return longestPath;
};

/**
 * Checks if two cells are adjacent (not diagonally).
 * @param cell1 The first cell's coordinates.
 * @param cell2 The second cell's coordinates.
 * @returns True if cells are adjacent, false otherwise.
 */
export const areAdjacent = (cell1: CellCoordinates | null, cell2: CellCoordinates | null): boolean => {
    if (!cell1 || !cell2) return false;
    const rowDiff = Math.abs(cell1.row - cell2.row);
    const colDiff = Math.abs(cell1.col - cell2.col);
    return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
};

/**
 * Finds the coordinates of a word in the grid, focusing on rows/columns affected by a move.
 * @param grid The game grid.
 * @param word The word to find.
 * @param moveCoords The coordinates of the move that just occurred.
 * @returns An array of CellCoordinates for the found word, or null if not found.
 */
export const findWordCoordinates = (
    grid: string[][],
    word: string,
    moveCoords: GameMove
): CellCoordinates[] | null => {
    if (!word || !grid || !moveCoords || !moveCoords.from || !moveCoords.to) return null;

    // Determine the rows and columns that were affected by the swap
    const affectedRows = new Set([moveCoords.from[0], moveCoords.to[0]]);
    const affectedCols = new Set([moveCoords.from[1], moveCoords.to[1]]);

    const numRows = grid.length;
    const numCols = grid[0]?.length || 0;

    // Check horizontally in affected rows
    for (const r of affectedRows) {
        if (r < 0 || r >= numRows) continue; // Should not happen with valid moveCoords
        const rowStr = grid[r].join('');
        let index = rowStr.indexOf(word);
        while (index !== -1) {
            const currentCoords: CellCoordinates[] = [];
            for (let i = 0; i < word.length; i++) {
                // Ensure column index is within bounds
                if (index + i < numCols) {
                    currentCoords.push({ row: r, col: index + i });
                } else {
                     // This should ideally not happen if word was found by indexOf
                    console.warn(`findWordCoordinates: Column index out of bounds during horizontal check. Word: ${word}, Row: ${r}, StartCol: ${index}, Offset: ${i}`);
                    break; // Break inner loop, continue search
                }
            }
            if (currentCoords.length === word.length) return currentCoords; // Word found
            index = rowStr.indexOf(word, index + 1); // Search for next occurrence
        }
    }

    // Check vertically in affected columns
    for (const c of affectedCols) {
        if (c < 0 || c >= numCols) continue; // Should not happen
        let colStr = '';
        for (let rIdx = 0; rIdx < numRows; rIdx++) {
            colStr += grid[rIdx][c];
        }
        let index = colStr.indexOf(word);
        while (index !== -1) {
            const currentCoords: CellCoordinates[] = [];
            for (let i = 0; i < word.length; i++) {
                 // Ensure row index is within bounds
                if (index + i < numRows) {
                    currentCoords.push({ row: index + i, col: c });
                } else {
                    console.warn(`findWordCoordinates: Row index out of bounds during vertical check. Word: ${word}, Col: ${c}, StartRow: ${index}, Offset: ${i}`);
                    break; // Break inner loop, continue search
                }
            }
            if (currentCoords.length === word.length) return currentCoords; // Word found
            index = colStr.indexOf(word, index + 1); // Search for next occurrence
        }
    }

    // console.warn(`Coordinates for word "${word}" not found after move.`, { grid, moveCoords });
    return null; // Word not found in affected rows/columns
};

/**
 * Creates an initial state object for the game UI.
 * @param data Optional GameData to initialize the grid and possible moves.
 * @returns An InitialGameStateUI object.
 */
export const getInitialGameState = (data?: GameData | null): InitialGameStateUI => ({
    grid: data ? data.initialGrid : null, // Grid can be null initially if no data
    currentPossibleMoves: data ? (data.explorationTree || []) : [],
    currentDepth: 0,
    history: [],
    hasDeviated: false,
    isInvalidMove: false,
    invalidMoveMessage: '',
    foundWordsDisplay: [], // Assuming this is for UI display of words found in a turn
    isGameOver: false,
    selectedCell: null,
    draggedCell: null,
    hoveredCell: null,
    wiggleCells: [],
    turnFailedAttempts: 0,
    hintCells: [],
    animationState: { animating: false, from: null, to: null },
});
