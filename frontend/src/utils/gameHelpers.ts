// src/utils/gameHelpers.ts

export interface CellCoordinates {
    row: number;
    col: number;
  }
  
  export interface GameMove {
    from: [number, number];
    to: [number, number];
  }
  
  export interface ExplorationNodeData {
    move?: GameMove;
    wordsFormed: string[];
    maxDepthReached: number;
    nextMoves?: ExplorationNodeData[];
  }
  
  export interface GameData {
    initialGrid: string[][];
    minWordLength: number;
    requiredMinTurns: number; // This might be deprecated if maxDepthReached is primary
    maxDepthReached: number; // Max depth for the current level (simple or hard)
    explorationTree: ExplorationNodeData[];
  }
  
  export interface HistoryEntry {
    grid: string[][];
    currentPossibleMoves: ExplorationNodeData[];
    currentDepth: number;
    moveMade: { from: CellCoordinates; to: CellCoordinates };
    wordsFormedByMove: string[];
    turnFailedAttempts: number; // Persist turn fails for back button
  }
  
  export const getFriendlyDate = (
    date: Date | undefined | null,
    options: { includeWeekday?: boolean; locale?: string } = {}
): string => {
    // Destructure options with default values
    const { locale = undefined } = options;

    // Check if the date is valid and is an instance of Date
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        console.warn("getFriendlyDate was called with an invalid date:", date);
        return "Invalid Date"; // Or return an empty string, or throw an error
    }

    try {
        // Define formatting options for Intl.DateTimeFormat
        const intlOptions: Intl.DateTimeFormatOptions = {
            year: 'numeric',  // "2025"
            month: 'long',    // "May"
            day: 'numeric',   // "7"
            weekday: 'long', // "Wednesday"
        };

        // Create a formatter and format the date
        // If locale is undefined, Intl.DateTimeFormat uses the runtime's default locale.
        return new Intl.DateTimeFormat(locale, intlOptions).format(date);

    } catch (error) {
        console.error("Error formatting date:", error);
        // Fallback for any unexpected errors during formatting
        // You might want a simpler fallback like date.toDateString() if Intl fails
        return date.toDateString(); // Example: "Wed May 07 2025"
    }
};
  
  export const getFormattedDate = (date: Date): string => {
    if (date === undefined) {
        return '';
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  export const getDataFilePath = (date: Date): string => {
    if (date === undefined) {
        return '';
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}.json`;
  };
  
  export const findLongestWordChain = (nodes?: ExplorationNodeData[]): string[] => {
      if (!nodes || nodes.length === 0) return [];
  
      let startingNodeOfLongestPath: ExplorationNodeData | null = null;
      let overallMaxDepth = -1;
  
      const validNodes = nodes.filter(n => typeof n.maxDepthReached === 'number');
      if (validNodes.length > 0) {
          overallMaxDepth = Math.max(...validNodes.map(n => n.maxDepthReached));
          startingNodeOfLongestPath = validNodes.find(n => n.maxDepthReached === overallMaxDepth) || null;
      }
  
      const tracePath = (startNode: ExplorationNodeData | null): string[] => {
          if (!startNode) return [];
          const currentPathWords = startNode.wordsFormed || [];
          let nextNode: ExplorationNodeData | null = null;
          if (startNode.nextMoves && startNode.nextMoves.length > 0) {
               const validNextNodes = startNode.nextMoves.filter(n => typeof n.maxDepthReached === 'number');
               if (validNextNodes.length > 0) {
                  const maxDepthBelow = Math.max(...validNextNodes.map(n => n.maxDepthReached));
                  nextNode = validNextNodes.find(n => n.maxDepthReached === maxDepthBelow) || null;
               }
          }
          if (nextNode) {
              return [...currentPathWords, ...tracePath(nextNode)];
          } else {
              return currentPathWords;
          }
      };
      return tracePath(startingNodeOfLongestPath);
  };
  
  export const areAdjacent = (cell1: CellCoordinates | null, cell2: CellCoordinates | null): boolean => {
    if (!cell1 || !cell2) return false;
    const rowDiff = Math.abs(cell1.row - cell2.row);
    const colDiff = Math.abs(cell1.col - cell2.col);
    return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
  };
  
  export const findWordCoordinates = (grid: string[][], word: string, moveCoords: GameMove): CellCoordinates[] => {
      if (!word || !grid || !moveCoords || !moveCoords.from || !moveCoords.to) return [];
      const affectedRows = new Set([moveCoords.from[0], moveCoords.to[0]]);
      const affectedCols = new Set([moveCoords.from[1], moveCoords.to[1]]);
      const rows = grid.length;
      const cols = grid[0]?.length || 0;
  
      for (const r of affectedRows) {
          if (r < 0 || r >= rows) continue;
          const rowStr = grid[r].join('');
          let index = rowStr.indexOf(word);
          while (index !== -1) {
              const currentCoords: CellCoordinates[] = [];
              for (let i = 0; i < word.length; i++) {
                  if (index + i >= 0 && index + i < cols) currentCoords.push({ row: r, col: index + i });
                  else { console.warn(`Coord calc error: col ${index + i} out of bounds.`); return []; }
              }
              if (currentCoords.length === word.length) return currentCoords;
              index = rowStr.indexOf(word, index + 1);
          }
      }
      for (const c of affectedCols) {
          if (c < 0 || c >= cols) continue;
          let colStr = '';
          for (let rIdx = 0; rIdx < rows; rIdx++) {
              if (grid[rIdx] && grid[rIdx][c]) colStr += grid[rIdx][c];
              else { console.warn(`Grid structure issue at row ${rIdx}, col ${c}`); colStr += '?'; }
          }
          let index = colStr.indexOf(word);
           while (index !== -1) {
               const currentCoords: CellCoordinates[] = [];
              for (let i = 0; i < word.length; i++) {
                   if (index + i >= 0 && index + i < rows) currentCoords.push({ row: index + i, col: c });
                   else { console.warn(`Coord calc error: row ${index + i} out of bounds.`); return []; }
              }
               if (currentCoords.length === word.length) return currentCoords;
               index = colStr.indexOf(word, index + 1);
          }
      }
      console.warn(`Coords for word "${word}" not found after move.`, {grid, moveCoords});
      return [];
  };
  
  export const getInitialGameState = (data?: GameData | null) => ({
      grid: data ? data.initialGrid : null,
      currentPossibleMoves: data ? (data.explorationTree || []) : [],
      currentDepth: 0,
      history: [],
      hasDeviated: false,
      isInvalidMove: false,
      invalidMoveMessage: '',
      foundWordsDisplay: [],
      isGameOver: false,
      selectedCell: null,
      draggedCell: null,
      hoveredCell: null,
      wiggleCells: [],
      turnFailedAttempts: 0,
      hintCells: [],
      animationState: { animating: false, from: null, to: null },
      // overallFailedAttempts is managed separately as it persists across resets within a day/difficulty
  });
  