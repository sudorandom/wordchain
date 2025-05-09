// src/App.tsx
import React from 'react'; // Removed unused imports like useState, useEffect etc.
import EndGamePanel from './components/EndGamePanel';
import DebugView from './components/DebugView';
import GameBoardArea from './components/GameBoardArea';
import {
    getFriendlyDate,
    getFormattedDate,
    // Removed game logic specific helpers, they are now internal to the hook or imported by it
    // CellCoordinates, GameData, HistoryEntry, ExplorationNodeData are used by the hook
    DifficultyLevel // Keep if used directly by App, otherwise hook exports it
} from './utils/gameHelpers';
import { WordChainDisplay } from './components/WordChainDisplay';
import { StatusMessages } from './components/StatusMessages';
import { DailyProgressDisplay } from './components/DailyProgressDisplay';
import {
    useWordChainGame,
} from './hooks/useWordChainGame'; // Adjusted import path

// GameHeader, Instructions components remain the same, so they are not repeated here for brevity.
// Assume they are defined as in the original App.tsx or imported from their own files.

interface GameHeaderProps {
    currentDate: Date | undefined;
    difficulty: DifficultyLevel;
    dailyProgress: Record<DifficultyLevel, boolean>;
    darkMode: boolean;
    onToggleDarkMode: () => void;
}
const GameHeader: React.FC<GameHeaderProps> = ({ currentDate, difficulty, dailyProgress, darkMode, onToggleDarkMode }) => (
    <>
        <button
            onClick={onToggleDarkMode}
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
    </>
);

interface InstructionsProps {
    difficulty: DifficultyLevel;
    wordLength: number;
}
const Instructions: React.FC<InstructionsProps> = ({ difficulty, wordLength }) => (
    <div className="text-center max-w-xl mb-2 text-sm text-gray-600 dark:text-gray-400 px-2">
        {difficulty === 'normal' &&
            <p><span className="font-semibold mb-1">How to Play:</span> Swap adjacent letters. Every swap <i>must</i> make a new {wordLength}-letter word (horizontally or vertically). Find the longest sequence of swaps! Tap <i className="fas fa-lightbulb"></i> for a hint.</p>}
        {difficulty === 'hard' &&
            <p><span className="font-semibold mb-1">Hard Mode:</span> A larger grid and more complex chains! Swaps must form a new <strong>{wordLength}-letter</strong> word (horizontally or vertically). Tap <i className="fas fa-lightbulb"></i> for a hint.</p>}
        {difficulty === 'impossible' &&
            <p><span className="font-semibold mb-1">Impossible Mode:</span> The ultimate test on a sprawling grid! Larger words. More paths. <strong class="whitespace-nowrap">No hints.</strong> Swaps must form a new <i>{wordLength}-letter</i> word. Good luck!</p>}
    </div>
);


// --- MAIN APP COMPONENT ---
function App() {
    const game = useWordChainGame();

    // --- LOADING / ERROR STATES ---
    // Display loading message if game data is not yet available but loading is in progress
    if (game.loading && !game.coreGameData) { // Changed game.gameData to game.coreGameData for clarity if that's what you intended from the hook
        return (
            <div className={`flex justify-center items-center min-h-screen text-gray-700 dark:text-gray-300 ${game.darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                Loading {game.difficulty} level for {game.currentDate ? getFormattedDate(game.currentDate) : 'today'}...
            </div>
        );
    }

    // Display error message if an error occurred
    if (game.error) {
        return (
            <div className="flex flex-col justify-center items-center min-h-screen text-center px-4">
                <p className="text-red-600 dark:text-red-400 text-xl font-semibold">Error</p>
                <p className="text-gray-700 dark:text-gray-300 mt-2">{game.error}</p>
                <button 
                    onClick={() => { 
                        // This comment block explains the reasoning behind the error recovery strategy.
                        // The goal is to retry loading the current difficulty.
                        // The hook's `masterResetGameStates` function is designed to:
                        // 1. Reset various UI states (animations, selections, etc.).
                        // 2. Trigger a `reloadTrigger` state change.
                        // This `reloadTrigger` is a dependency in the `useEffect` hook that loads level data.
                        // Therefore, calling `masterResetGameStates` will cause that effect to run again,
                        // attempting to fetch and load the data for the *current* `game.difficulty`.

                        // If the intention were to always reset to 'normal' difficulty upon any error,
                        // the call would be `game.handlePlayMode('normal')`.
                        // `handlePlayMode` internally sets the difficulty and then calls `masterResetGameStates`,
                        // ensuring a full reset and reload for the specified difficulty.

                        // Current strategy: Retry the current difficulty.
                        game.masterResetGameStates(); 
                    }} 
                    className="cursor-pointer mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                >
                    Try Again
                </button>
            </div>
        );
    }

    // Display message if game data failed to load for other reasons (e.g., not available)
    if (!game.coreGameData && !game.loading) { // Changed game.gameData to game.coreGameData
        return (
            <div className="flex justify-center items-center min-h-screen text-gray-500 dark:text-gray-400">
                Game data could not be loaded. Please ensure levels are available or try again later.
            </div>
        );
    }

    // --- DERIVED VALUES FOR RENDERING ---
    // These values are derived from the game state provided by the hook.
    const levelActuallyCompleted = game.currentDepth === game.liveMaxDepthAttainable && game.liveMaxDepthAttainable > 0;
    // Check if there are no more valid moves, the level isn't completed, and the game has started (currentDepth > 0)
    const noMoreValidMoves = game.coreGameData && game.currentPossibleMoves && game.currentPossibleMoves.length === 0 && !levelActuallyCompleted && game.currentDepth > 0;
    
    // Determine when to show specific status messages
    const showNoMoreValidMovesMessage = noMoreValidMoves && !levelActuallyCompleted && !game.showEndGamePanelOverride && !game.loading;
    const showDeviatedMessage = game.hasDeviated && !levelActuallyCompleted && !showNoMoreValidMovesMessage && !game.loading;
    const isCurrentlyOptimal = !game.hasDeviated && game.currentDepth > 0;
    const showOptimalMessage = isCurrentlyOptimal && !levelActuallyCompleted && !showNoMoreValidMovesMessage && !showDeviatedMessage && !game.loading;

    // Determine if the end game panel should be displayed
    const shouldShowEndGamePanel = (game.isGameOver && !game.hasAcknowledgedGameOver && !game.loading) || (game.showEndGamePanelOverride && !game.loading);

    return (
        <div className={`flex flex-col items-center justify-start min-h-screen p-4 font-sans pt-8 transition-colors duration-300 ${game.darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
            {/* Game Header: Displays date, difficulty, dark mode toggle */}
            <GameHeader
                currentDate={game.currentDate}
                difficulty={game.difficulty}
                dailyProgress={game.dailyProgress}
                darkMode={game.darkMode}
                onToggleDarkMode={() => game.setDarkMode(!game.darkMode)}
            />

            {/* Instructions: Provides game instructions based on difficulty */}
            <Instructions difficulty={game.difficulty} wordLength={game.wordLength} />

            {/* Daily Progress: Shows progress for different difficulties and allows mode switching */}
            <DailyProgressDisplay
                dailyProgress={game.dailyProgress}
                difficulty={game.difficulty}
                onPlayMode={game.handlePlayMode}
                onShowSummary={game.handleShowGameSummary}
                loading={game.loading}
                showEndGamePanelOverride={game.showEndGamePanelOverride}
                animationStateAnimating={game.animationState.animating}
                gameData={game.coreGameData} // Pass coreGameData
            />
            
            {/* Status Messages: Displays feedback like invalid moves, optimal path, etc. */}
            <StatusMessages
                isInvalidMove={game.isInvalidMove}
                invalidMoveMessage={game.invalidMoveMessage}
                showNoMoreValidMovesMessage={showNoMoreValidMovesMessage}
                showDeviatedMessage={showDeviatedMessage}
                showOptimalMessage={showOptimalMessage}
                onBack={game.handleBack}
                levelActuallyCompleted={levelActuallyCompleted}
            />

            {/* Game Board Area: Renders the main game grid and interaction elements */}
            {game.grid && game.coreGameData && ( // Check for coreGameData before rendering
                <GameBoardArea
                    grid={game.grid}
                    gameData={game.coreGameData} // Use coreGameData
                    selectedCell={game.selectedCell}
                    draggedCell={game.draggedCell}
                    animationState={game.animationState}
                    highlightedCells={game.highlightedCells}
                    hintCells={game.hintCells}
                    wiggleCells={game.wiggleCells}
                    onCellClick={game.handleCellClick}
                    onDragStart={game.handleDragStart}
                    onDragEnter={game.handleDragEnter}
                    onDragLeave={game.handleDragLeave}
                    onDragEnd={game.handleDragEnd}
                    onDrop={game.handleDrop}
                    noMoreValidMoves={noMoreValidMoves} 
                    loading={game.loading}
                    currentDepth={game.currentDepth}
                    liveMaxDepthAttainable={game.liveMaxDepthAttainable}
                    historyLength={game.history.length}
                    isGameOver={game.isGameOver} // This is the UI-controlled game over state
                    hasAcknowledgedGameOver={game.hasAcknowledgedGameOver}
                    showEndGamePanelOverride={game.showEndGamePanelOverride}
                    difficulty={game.difficulty}
                    currentPossibleMovesLength={game.currentPossibleMoves.length}
                    onBack={game.handleBack}
                    onReset={game.handleReset}
                    onHint={game.handleHintButtonClick}
                    onViewMySolution={game.handleViewMySolution}
                    turnFailedAttempts={game.turnFailedAttempts}
                    dailyProgressForDifficulty={game.dailyProgress[game.difficulty]}
                    isInvalidMove={game.isInvalidMove}
                />
            )}

            {/* Word Chain Display: Shows the sequence of words formed by the player */}
            <WordChainDisplay history={game.history} showEndGamePanelOverride={game.showEndGamePanelOverride} />

            {/* Debug View: Optionally shown if debug mode is active */}
            {game.isDebugMode && game.coreGameData && game.coreGameData.explorationTree && <DebugView treeData={game.coreGameData.explorationTree} optimalPathWords={game.liveOptimalPathWords} />}
            
            {/* End Game Panel: Shown when the game is over or a summary is requested */}
            {shouldShowEndGamePanel && (game.normalDataForPanel || game.hardDataForPanel || game.impossibleDataForPanel) && (
                <EndGamePanel
                    normalModeData={game.normalDataForPanel}
                    hardModeData={game.hardDataForPanel}
                    impossibleModeData={game.impossibleDataForPanel}
                    onClose={game.handleCloseGameOver}
                />
            )}
        </div>
    );
}

export default App;
