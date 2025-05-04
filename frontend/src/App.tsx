import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// Function to find the sequence of words along the longest path
const findLongestWordChain = (nodes) => {
    if (!nodes) return []; // Handle null/undefined nodes

    let startingNodeOfLongestPath = null;
    if (nodes && nodes.length > 0) {
       const validNodes = nodes.filter(n => typeof n.maxDepthReached === 'number');
       if (validNodes.length > 0) {
           const overallMaxDepth = Math.max(...validNodes.map(n => n.maxDepthReached));
           // Find the first node that matches the max depth
           startingNodeOfLongestPath = validNodes.find(n => n.maxDepthReached === overallMaxDepth);
       }
    }

    const tracePath = (startNode) => {
        if (!startNode) return [];
        const currentPathWords = startNode.wordsFormed || [];
        let nextNode = null;
        if (startNode.nextMoves && startNode.nextMoves.length > 0) {
             const validNextNodes = startNode.nextMoves.filter(n => typeof n.maxDepthReached === 'number');
             if (validNextNodes.length > 0) {
                const maxDepthBelow = Math.max(...validNextNodes.map(n => n.maxDepthReached));
                // Find the first node that matches the max depth below
                nextNode = validNextNodes.find(n => n.maxDepthReached === maxDepthBelow);
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


// Helper to check if two cells are adjacent
const areAdjacent = (cell1, cell2) => {
  if (!cell1 || !cell2) return false;
  const rowDiff = Math.abs(cell1.row - cell2.row);
  const colDiff = Math.abs(cell1.col - cell2.col);
  return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
};

// Helper function to find coordinates of a word in the grid
const findWordCoordinates = (grid, word, moveCoords) => {
    if (!word || !grid || !moveCoords || !moveCoords.from || !moveCoords.to) return [];
    const affectedRows = new Set([moveCoords.from[0], moveCoords.to[0]]);
    const affectedCols = new Set([moveCoords.from[1], moveCoords.to[1]]);
    const rows = grid.length;
    const cols = grid[0]?.length || 0;

    for (const r of affectedRows) { // Check affected rows
        if (r < 0 || r >= rows) continue;
        const rowStr = grid[r].join('');
        let index = rowStr.indexOf(word);
        while (index !== -1) {
            const currentCoords = [];
            for (let i = 0; i < word.length; i++) {
                if (index + i >= 0 && index + i < cols) currentCoords.push({ row: r, col: index + i });
                else { console.warn(`Coord calc error: col ${index + i} out of bounds.`); return []; }
            }
            if (currentCoords.length === word.length) return currentCoords;
            index = rowStr.indexOf(word, index + 1);
        }
    }
    for (const c of affectedCols) { // Check affected columns
        if (c < 0 || c >= cols) continue;
        let colStr = '';
        for (let r = 0; r < rows; r++) {
            if (grid[r] && grid[r][c]) colStr += grid[r][c];
            else { console.warn(`Grid structure issue at row ${r}, col ${c}`); colStr += '?'; }
        }
        let index = colStr.indexOf(word);
         while (index !== -1) {
             const currentCoords = [];
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


// --- Grid Cell Component ---
function GridCell({ letter, row, col, onDragStart, onDrop, onDragEnter, onDragLeave, onDragEnd, isDragging, isPotentialTarget, isHighlighted }) {
  const handleDragStart = (e) => { onDragStart({ row, col }); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', `${row}-${col}`); e.currentTarget.style.opacity = '0.6'; };
  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const handleDrop = (e) => { e.preventDefault(); onDrop({ row, col }); };
  const handleDragEnter = (e) => { e.preventDefault(); onDragEnter({ row, col }); };
  const handleDragLeave = (e) => { e.preventDefault(); onDragLeave({ row, col }); };
  const handleDragEnd = (e) => { e.currentTarget.style.opacity = '1'; onDragEnd(); };

  let cellClasses = `border border-gray-400 w-16 h-16 flex items-center justify-center text-2xl font-bold cursor-move select-none rounded-md shadow-sm transition-all duration-300 ease-in-out relative overflow-hidden`;
  if (isDragging) cellClasses += ' bg-blue-200 ring-2 ring-blue-500 scale-105 z-10';
  else if (isPotentialTarget) cellClasses += ' bg-green-200 ring-2 ring-green-500';
  else cellClasses += ' bg-white hover:bg-gray-100';

  return (
    <div draggable onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={handleDrop} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragEnd={handleDragEnd} className={cellClasses}>
      {isHighlighted && <div className="absolute inset-0 bg-yellow-300 opacity-50 animate-pulse-fade-out" style={{ animationDuration: '1.5s' }}></div>}
      <span className="relative z-10">{letter.toUpperCase()}</span>
    </div>
  );
}

// --- Word Grid Component ---
function WordGrid({ grid, selectedCell, hoveredCell, animationState, highlightedCells, onDragStart, onDragEnter, onDragLeave, onDragEnd, onDrop }) {
   const gridRef = useRef(null);
   const cellSize = 64; const gapSize = 4; const totalCellSize = cellSize + gapSize;

   const getCellStyle = (r, c) => {
       if (!animationState.animating || !gridRef.current || !animationState.from || !animationState.to) return {};
       if (animationState.from.row === r && animationState.from.col === c) {
           const dx = (animationState.to.col - c) * totalCellSize; const dy = (animationState.to.row - r) * totalCellSize;
           return { transform: `translate(${dx}px, ${dy}px)`, transition: 'transform 0.3s ease-in-out', zIndex: 10 };
       } else if (animationState.to.row === r && animationState.to.col === c) {
           const dx = (animationState.from.col - c) * totalCellSize; const dy = (animationState.from.row - r) * totalCellSize;
           return { transform: `translate(${dx}px, ${dy}px)`, transition: 'transform 0.3s ease-in-out', zIndex: 10 };
       }
       return { transition: 'transform 0.3s ease-in-out' };
   };

   // Handle case where grid might be null initially
   if (!grid) {
       return <div className="p-2 text-center text-gray-500">Loading Grid...</div>;
   }

   return (
    <div ref={gridRef} className="relative inline-grid gap-1 p-2 bg-gray-200 rounded-lg shadow-md" style={{ gridTemplateColumns: `repeat(${grid[0]?.length || 0}, minmax(0, 1fr))` }} onDragOver={(e) => e.preventDefault()}>
      {grid.map((row, r) => row.map((letter, c) => {
          const isDragging = selectedCell?.row === r && selectedCell?.col === c;
          const isPotentialTarget = hoveredCell?.row === r && hoveredCell?.col === c && selectedCell && areAdjacent(selectedCell, {row: r, col: c});
          const isHighlighted = highlightedCells.some(cell => cell.row === r && cell.col === c);
          return (
              <div key={`${r}-${c}`} style={getCellStyle(r, c)} className="relative">
                  <GridCell letter={letter} row={r} col={c} isDragging={isDragging} isPotentialTarget={isPotentialTarget} isHighlighted={isHighlighted} onDragStart={onDragStart} onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragEnd={onDragEnd} onDrop={onDrop} />
              </div>
           );
      }))}
    </div>
  );
}

// --- Progress Bar Component ---
function ProgressBar({ currentScore, maxScore }) {
    const percentage = maxScore > 0 ? Math.min(100, (currentScore / maxScore) * 100) : 0;
    const greenWidth = `${percentage}%`; const greyWidth = `${100 - percentage}%`;
    return (
        <div className="w-full bg-gray-300 rounded-full h-4 overflow-hidden flex mt-2" title={`Reached depth ${currentScore} of ${maxScore}`}>
            <div className="bg-blue-500 h-full transition-all duration-500 ease-out rounded-l-full" style={{ width: greenWidth }}></div>
            <div className="bg-gray-400 h-full rounded-r-full" style={{ width: greyWidth }}></div>
        </div>
    );
}

// --- End Game Panel Component ---
function EndGamePanel({ score, maxScore, playerWords, optimalPathWords, onReset }) {
    const isMaxScore = score === maxScore;
    const sortedPlayerWords = useMemo(() => [...playerWords].sort(), [playerWords]);
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center z-20 p-4">
            <div className="bg-white p-6 md:p-8 rounded-lg shadow-xl text-center w-full max-w-2xl">
                <h2 className="text-3xl font-bold mb-4">Game Over!</h2>
                <p className="text-xl mb-4">You reached depth <span className="font-semibold">{score}</span> out of <span className="font-semibold">{maxScore}</span>.</p>
                <p className="text-lg mb-4">You found <span className="font-semibold">{playerWords.size}</span> unique words.</p>
                <div className="flex flex-col md:flex-row justify-around gap-4 mb-6 max-h-60 overflow-y-auto">
                    <div className="flex-1 border rounded p-3 bg-gray-50">
                        <h3 className="text-lg font-semibold mb-2 text-green-700">Words You Found ({sortedPlayerWords.length})</h3>
                        {sortedPlayerWords.length > 0 ? <ul className="text-left text-sm space-y-1">{sortedPlayerWords.map(word => <li key={word}>{word.toUpperCase()}</li>)}</ul> : <p className="text-sm text-gray-500 italic">None found.</p>}
                    </div>
                    <div className="flex-1 border rounded p-3 bg-gray-50">
                        <h3 className="text-lg font-semibold mb-2 text-blue-700">Optimal Path Words ({optimalPathWords.length})</h3>
                        {optimalPathWords.length > 0 ? <ol className="text-left text-sm space-y-1 list-decimal list-inside">{optimalPathWords.map((word, index) => <li key={`${word}-${index}`}>{word.toUpperCase()}</li>)}</ol> : <p className="text-sm text-gray-500 italic">No optimal path defined.</p>}
                    </div>
                </div>
                {isMaxScore && <p className="text-2xl font-bold text-green-600 mb-4 animate-pulse">Maximum Depth Reached!</p>}
                {!isMaxScore && <p className="text-xl font-bold text-gray-600 mb-4">You didn't reach the maximum possible depth.</p>}
                <button onClick={onReset} className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-md shadow hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">Close</button>
            </div>
        </div>
    );
}

// --- Exploration Tree View Component ---
function ExplorationTreeNode({ node, level = 0 }) {
    const [isExpanded, setIsExpanded] = useState(level < 1);
    const handleToggle = () => setIsExpanded(!isExpanded);
    const hasChildren = node.nextMoves && node.nextMoves.length > 0;
    return (
        <div style={{ marginLeft: `${level * 20}px` }} className="my-1">
            <div className={`flex items-center p-1 rounded ${hasChildren ? 'cursor-pointer hover:bg-gray-100' : ''} ${level === 0 ? 'bg-blue-50 border border-blue-200' : ''}`} onClick={hasChildren ? handleToggle : undefined}>
                {hasChildren && <span className="text-xs mr-1 w-4 text-center">{isExpanded ? '▼' : '▶'}</span>}
                {!hasChildren && <span className="w-4 mr-1"></span>}
                <span className="text-xs font-mono mr-2 text-purple-700">{node.move ? `[${node.move.from.join(',')}]↔[${node.move.to.join(',')}]` : 'Start'}</span>
                <span className="text-xs font-semibold mr-2 text-green-700">[{node.wordsFormed?.join(', ').toUpperCase() || ''}]</span>
                <span className="text-xs text-gray-500">(Depth Left: {node.maxDepthReached})</span>
            </div>
            {isExpanded && hasChildren && (
                <div className="border-l-2 border-gray-300 pl-2 ml-2">
                    {node.nextMoves.map((childNode, index) => <ExplorationTreeNode key={`${childNode.move?.from?.join('-')}-${childNode.move?.to?.join('-')}-${index}`} node={childNode} level={level + 1} />)}
                </div>
            )}
        </div>
    );
}

function ExplorationTreeView({ treeData }) {
    const [isVisible, setIsVisible] = useState(false);

    // Don't render if treeData is not available yet
    if (!treeData) return null;

    return (
        <div className="w-full max-w-2xl mt-6 border rounded p-3 bg-white shadow">
             <button onClick={() => setIsVisible(!isVisible)} className="text-indigo-600 hover:text-indigo-800 font-semibold mb-2 w-full text-left">{isVisible ? 'Hide' : 'Show'} Full Move Tree {isVisible ? '▼' : '▶'}</button>
             {isVisible && <div className="mt-2 max-h-80 overflow-y-auto border-t pt-2">{treeData.map((rootNode, index) => <ExplorationTreeNode key={`${rootNode.move?.from?.join('-')}-${rootNode.move?.to?.join('-')}-${index}`} node={rootNode} level={0} />)}</div>}
        </div>
    );
}


// --- Main App Component ---
function App() {
  // --- State Variables ---
  // State for the loaded game data, loading status, and potential errors
  const [gameData, setGameData] = useState(null); // Initialize gameData as null
  const [loading, setLoading] = useState(true); // Track loading state
  const [error, setError] = useState(null); // Track potential loading errors
  const [level, setLevel] = useState(0); // Store the current level number

  // Game state variables (initialized once gameData is loaded)
  const [grid, setGrid] = useState(null);
  const [currentPossibleMoves, setCurrentPossibleMoves] = useState([]);
  const [currentDepth, setCurrentDepth] = useState(0);
  const [selectedCell, setSelectedCell] = useState(null);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [isInvalidMove, setIsInvalidMove] = useState(false);
  const [foundWordsDisplay, setFoundWordsDisplay] = useState([]);
  const [hasDeviated, setHasDeviated] = useState(false);
  const [animationState, setAnimationState] = useState({ animating: false, from: null, to: null });
  const animationTimeoutRef = useRef(null);
  const [history, setHistory] = useState([]);
  const [highlightedCells, setHighlightedCells] = useState([]);
  const highlightTimeoutRef = useRef(null);
  const [isGameOver, setIsGameOver] = useState(false);

  // --- Effect to Load Game Data ---
  useEffect(() => {
    // Function to fetch and set game data
    const loadLevelData = async () => {
        setLoading(true);
        setError(null);
        // Get level from query params
        const params = new URLSearchParams(window.location.search);
        const levelParam = params.get('level');
        const requestedLevel = levelParam ? parseInt(levelParam, 10) : 0; // Default to level 0

        // Basic validation for level number
        const currentLevel = !isNaN(requestedLevel) && requestedLevel >= 0 ? requestedLevel : 0;
        setLevel(currentLevel); // Store the validated level

        try {
            const response = await fetch(`/levels/${currentLevel}.json`);
            if (!response.ok) {
                // Throw an error if the file isn't found or there's another HTTP error
                throw new Error(`Level ${currentLevel} data not found (HTTP ${response.status})`);
            }
            const data = await response.json();
            setGameData(data); // Set the loaded game data
            // Initialize game state based on loaded data
            setGrid(data.initialGrid);
            setCurrentPossibleMoves(data.explorationTree || []); // Handle potential empty tree
            setCurrentDepth(0);
            setHistory([]); // Clear history for new level
            // Reset other relevant states
            setHasDeviated(false);
            setIsInvalidMove(false);
            setFoundWordsDisplay([]);
            setIsGameOver(false);

        } catch (err) {
            console.error("Error loading level data:", err);
            setError(`Failed to load level ${currentLevel}. Please check the level number or try level 0.`);
            // Optionally load a default level or show an error state
            setGameData(null); // Ensure gameData is null on error
            setGrid(null);
            setCurrentPossibleMoves([]);
        } finally {
            setLoading(false); // Set loading to false whether success or error
        }
    };

    loadLevelData(); // Call the function on component mount

    // No dependencies needed if we only load based on initial URL params
  }, []); // Empty dependency array means this runs once on mount

  const optimalPathWords = useMemo(() => {
      return gameData ? findLongestWordChain(gameData.explorationTree) : [];
  }, [gameData]); // Re-calculate when gameData changes

  const playerUniqueWordsFound = useMemo(() => {
      const words = new Set();
      history.forEach(state => { if (Array.isArray(state.wordsFormedByMove)) { state.wordsFormedByMove.forEach(word => words.add(word)); } });
      return words;
  }, [history]); // Depends only on history

  // Get max depth from the loaded game data, provide default if not loaded
  const maxDepthAttainable = gameData ? gameData.maxDepthReached : 0;
  const minWordLength = gameData ? gameData.minWordLength : 4; // Get min word length or default


  // --- Effects ---
  useEffect(() => { // Check for game over (only if gameData is loaded)
      if (gameData && !animationState.animating && currentPossibleMoves.length === 0 && currentDepth > 0) setIsGameOver(true);
      else setIsGameOver(false);
  }, [gameData, currentPossibleMoves, currentDepth, animationState.animating]);

  useEffect(() => { // Cleanup timeouts
      return () => {
          if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
          if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      };
  }, []);

  // --- Event Handlers ---
  const handleDragStart = useCallback((cellCoords) => {
    if (animationState.animating || isGameOver || !gameData) return; // Prevent if animating, game over, or not loaded
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    setHighlightedCells([]); setSelectedCell(cellCoords); setIsInvalidMove(false);
    setFoundWordsDisplay([]); setHoveredCell(null);
  }, [animationState.animating, isGameOver, gameData]);

  const handleDragEnter = useCallback((cellCoords) => { if (selectedCell && (selectedCell.row !== cellCoords.row || selectedCell.col !== cellCoords.col)) setHoveredCell(cellCoords); }, [selectedCell]);
  const handleDragLeave = useCallback((cellCoords) => { if (hoveredCell && hoveredCell.row === cellCoords.row && hoveredCell.col === cellCoords.col) setHoveredCell(null); }, [hoveredCell]);
  const handleDragEnd = useCallback(() => { setSelectedCell(null); setHoveredCell(null); }, []);

  const handleDrop = useCallback((targetCellCoords) => {
    if (!selectedCell || animationState.animating || isGameOver || !gameData || !grid) return; // Add checks for gameData and grid
    setHoveredCell(null);
    if (selectedCell.row === targetCellCoords.row && selectedCell.col === targetCellCoords.col) { setSelectedCell(null); return; }
    if (!areAdjacent(selectedCell, targetCellCoords)) { setIsInvalidMove(true); setFoundWordsDisplay(['Must swap adjacent cells.']); setSelectedCell(null); return; }

    let matchedNode = null;
    const moveOption1 = { from: [selectedCell.row, selectedCell.col], to: [targetCellCoords.row, targetCellCoords.col] };
    const moveOption2 = { from: [targetCellCoords.row, targetCellCoords.col], to: [selectedCell.row, selectedCell.col] };

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
        const moveMadeCoords = { from: { row: selectedCell.row, col: selectedCell.col }, to: { row: targetCellCoords.row, col: targetCellCoords.col } };
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

        setHistory(prevHistory => [...prevHistory, { grid, currentPossibleMoves, currentDepth, moveMade: moveMadeCoords, wordsFormedByMove }]);
        setAnimationState({ animating: true, from: selectedCell, to: targetCellCoords });
        setFoundWordsDisplay(wordsFormedByMove);
        setIsInvalidMove(false);
        if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        setHighlightedCells([]);

        animationTimeoutRef.current = setTimeout(() => {
            const newGrid = grid.map(row => [...row]); // Use current grid state
            const temp = newGrid[selectedCell.row][selectedCell.col];
            newGrid[selectedCell.row][selectedCell.col] = newGrid[targetCellCoords.row][targetCellCoords.col];
            newGrid[targetCellCoords.row][targetCellCoords.col] = temp;

            setGrid(newGrid); // Update grid state
            setCurrentPossibleMoves(matchedNode.nextMoves || []);
            setCurrentDepth(currentDepth + 1);
            setAnimationState({ animating: false, from: null, to: null });
            setSelectedCell(null);
            animationTimeoutRef.current = null;

            let allCoords = [];
            wordsFormedByMove.forEach(word => {
                const coords = findWordCoordinates(newGrid, word, matchedNode.move); // Use the updated grid
                allCoords = [...allCoords, ...coords];
            });
            const uniqueCoords = Array.from(new Map(allCoords.map(item => [`${item.row}-${item.col}`, item])).values());
            setHighlightedCells(uniqueCoords);

            highlightTimeoutRef.current = setTimeout(() => {
                setHighlightedCells([]);
                highlightTimeoutRef.current = null;
            }, 1200);

        }, 300);

    } else {
        setIsInvalidMove(true);
        setHasDeviated(true);
        setFoundWordsDisplay(['Invalid Move! No new word found!']);
        setSelectedCell(null);
    }

  }, [selectedCell, grid, currentPossibleMoves, currentDepth, animationState.animating, isGameOver, gameData]); // Added gameData and grid dependencies


  const handleReset = useCallback(() => {
     // Reset based on the currently loaded gameData
     if (!gameData) {
         console.error("Cannot reset: Game data not loaded.");
         setError("Cannot reset game. Data failed to load.");
         return;
     }
     if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
     if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
     setGrid(gameData.initialGrid);
     setCurrentPossibleMoves(gameData.explorationTree || []);
     setCurrentDepth(0);
     setSelectedCell(null); setHoveredCell(null); setIsInvalidMove(false); setFoundWordsDisplay([]);
     setHasDeviated(false); setAnimationState({ animating: false, from: null, to: null }); setHistory([]);
     setHighlightedCells([]); setIsGameOver(false);
     setError(null); // Clear any previous errors on reset
     console.log("Game reset to initial state for level", level);
  }, [gameData, level]); // Depend on gameData and level

  const handleBack = useCallback(() => {
      if (history.length === 0 || animationState.animating || isGameOver || !gameData) return; // Add gameData check
      if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);

      const previousState = history[history.length - 1];
      const moveToundo = previousState.moveMade;
      // Add check for previousState.grid existence
      if (!moveToundo || !previousState.grid) { console.error("Cannot undo: History data missing.", previousState); handleReset(); return; }

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
              const validNodes = movesFromBeforePrevious.filter(node => typeof node.maxDepthReached === 'number');
              if (validNodes.length > 0) {
                const maxDepthPossibleBeforePrevious = Math.max(...validNodes.map(node => node.maxDepthReached));
                if (typeof nodeOfPreviousMove.maxDepthReached === 'number' && nodeOfPreviousMove.maxDepthReached < maxDepthPossibleBeforePrevious) {
                    previousStateWasDeviated = true;
                }
              }
          }
      }

      setAnimationState({ animating: true, from: moveToundo.to, to: moveToundo.from });
      setIsInvalidMove(false);
      setFoundWordsDisplay([]); setHighlightedCells([]); setIsGameOver(false);

      animationTimeoutRef.current = setTimeout(() => {
          setGrid(previousState.grid); // Use grid from history
          setCurrentPossibleMoves(previousState.currentPossibleMoves);
          setCurrentDepth(previousState.currentDepth);
          setHistory(prevHistory => prevHistory.slice(0, -1));
          setAnimationState({ animating: false, from: null, to: null });
          setSelectedCell(null); setHoveredCell(null);
          setHasDeviated(previousStateWasDeviated);
          animationTimeoutRef.current = null;
          console.log("Went back to previous state. Depth:", previousState.currentDepth, "Deviated:", previousStateWasDeviated);
      }, 300);

  }, [history, animationState.animating, isGameOver, handleReset, gameData]); // Added gameData dependency

  // --- Render Helper for Word Chain ---
  const renderWordChain = () => {
      if (history.length === 0) return <div className="h-8 mt-4"></div>;
      return (
          <div className="flex flex-wrap items-center justify-center mt-4 space-x-2 text-lg px-4 h-8 overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-200 pb-2">
              {history.map((histEntry, index) => (
                  <React.Fragment key={index}>
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded font-medium">
                          {histEntry.wordsFormedByMove?.[0]?.toUpperCase() || '???'}
                          {histEntry.wordsFormedByMove?.length > 1 ? '...' : ''}
                      </span>
                      <span className="text-gray-500 font-bold mx-1">→</span>
                  </React.Fragment>
              ))}
              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded font-medium">Current</span>
          </div>
      );
  };

  // --- Conditional Rendering for Loading/Error States ---
  if (loading) {
      return <div className="flex justify-center items-center min-h-screen">Loading Level {level}...</div>;
  }

  if (error) {
      return (
          <div className="flex flex-col justify-center items-center min-h-screen text-red-600">
              <p>Error: {error}</p>
              <a href="/" className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
                  Go to Level 0
              </a>
          </div>
      );
  }

  // Render game only if gameData is loaded successfully
  if (!gameData) {
       return <div className="flex justify-center items-center min-h-screen text-gray-500">Game data could not be loaded.</div>;
  }


  // --- Main Render ---
  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-gray-50 p-4 font-sans pt-8">
       <h1 className="text-3xl font-bold mb-2 text-gray-700">Word Chains</h1>
       <h2 className="text-2xl mb-2 text-gray-700">Level {level}</h2>
       <div className="text-center max-w-xl mb-4 text-sm text-gray-600">
            <p className="font-semibold mb-1">How to Play:</p>
            <p>Drag and drop adjacent letters to swap them. Find the optimal move sequence to win! Every move <i>must</i> make a new {minWordLength}-letter word.</p>
       </div>
       <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg shadow text-center min-w-[300px] min-h-[150px] flex flex-col justify-center">
           <div>
               <p className="text-lg">Current Depth: <span className="font-semibold">{currentDepth}</span> / {maxDepthAttainable}</p>
               <p className={`text-sm ${hasDeviated ? 'text-red-600 font-bold' : 'text-green-600 font-semibold'}`}>
                   {hasDeviated ? "Deviated from optimal path!" : "On the optimal path"}
               </p>
               <div className="h-6 mt-2">
                   {isInvalidMove && <p className="text-red-600 font-semibold">{Array.isArray(foundWordsDisplay) && foundWordsDisplay.length > 0 ? foundWordsDisplay[0] : 'Invalid Move! No new word found!'}</p>}
               </div>
               <div className="h-6">
                   {foundWordsDisplay.length > 0 && !animationState.animating && !isInvalidMove && <p className="text-green-700 font-semibold">Words Found: {foundWordsDisplay.join(', ').toUpperCase()}</p>}
               </div>
               <p className="text-sm text-gray-600 mt-1">Possible valid moves from here: <strong>{currentPossibleMoves?.length ?? 0}</strong>.</p>
               {currentPossibleMoves?.length > 1 && !hasDeviated && <p className="text-sm text-orange-600 mt-1 font-semibold">Multiple optimal moves possible!</p>}
               {currentPossibleMoves?.length > 1 && hasDeviated && <p className="text-sm text-gray-600 mt-1">There might be a better move...</p>}
           </div>
       </div>
       <div className="inline-flex flex-col items-center mb-4">
           {/* Pass grid state to WordGrid */}
           <WordGrid grid={grid} selectedCell={selectedCell} hoveredCell={hoveredCell} animationState={animationState} highlightedCells={highlightedCells} onDragStart={handleDragStart} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragEnd={handleDragEnd} onDrop={handleDrop} />
           <ProgressBar currentScore={currentDepth} maxScore={maxDepthAttainable} />
       </div>
       <div className="flex space-x-4 mt-6">
           <button onClick={handleBack} disabled={history.length === 0 || animationState.animating || isGameOver} className={`px-4 py-2 bg-gray-500 text-white rounded-md shadow hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed`}>Back</button>
           <button onClick={handleReset} disabled={animationState.animating} className={`px-4 py-2 bg-indigo-600 text-white rounded-md shadow hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed`}>Reset Game</button>
       </div>
       {renderWordChain()}
       {/* Pass explorationTree from gameData state */}
       <ExplorationTreeView treeData={gameData.explorationTree} />
       {isGameOver && <EndGamePanel score={currentDepth} maxScore={maxDepthAttainable} playerWords={playerUniqueWordsFound} optimalPathWords={optimalPathWords} onReset={handleReset} />}
       <style>{` @keyframes pulse-fade-out { 0% { opacity: 0.6; transform: scale(1); } 20% { opacity: 0.8; transform: scale(1.05); } 80% { opacity: 0.8; transform: scale(1.05); } 100% { opacity: 0; transform: scale(1); } } .animate-pulse-fade-out { animation: pulse-fade-out 1.5s ease-in-out forwards; } .scrollbar-thin { scrollbar-width: thin; scrollbar-color: #9ca3af #e5e7eb; } .scrollbar-thin::-webkit-scrollbar { height: 6px; width: 6px; } .scrollbar-thin::-webkit-scrollbar-track { background: #e5e7eb; border-radius: 3px; } .scrollbar-thin::-webkit-scrollbar-thumb { background-color: #9ca3af; border-radius: 3px; border: 1px solid #e5e7eb; } `}</style>
    </div>
  );
}

export default App;
