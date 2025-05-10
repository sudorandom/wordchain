// src/App.tsx
import React from 'react';
import EndGamePanel from './components/EndGamePanel';
import DebugView from './components/DebugView'; // Ensure this import is correct
import GameBoardArea from './components/GameBoardArea';
import {
    getFriendlyDate,
    getFormattedDate,
    DifficultyLevel
} from './utils/gameHelpers'; 
import { WordSequenceDisplay } from './components/WordSequenceDisplay';
import { StatusMessages } from './components/StatusMessages'; // Ensure this import is correct
import { DailyProgressDisplay } from './components/DailyProgressDisplay';
import { useGame } from './hooks/useGame'; 

interface GameHeaderProps {
    currentDate: Date | undefined;
    difficulty: DifficultyLevel;
    dailyProgress: Record<DifficultyLevel, boolean>;
}

const GameHeader: React.FC<GameHeaderProps> = ({ currentDate, difficulty, dailyProgress }) => (
    <>
        <h1 className="text-4xl sm:text-5xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-gradient-flow font-bungee">
            <a href="/" className="inline-flex items-center">wordseq</a>
        </h1>
        <h2 className="text-xl sm:text-2xl mb-1 text-gray-700 dark:text-gray-300">
            {currentDate ? getFriendlyDate(currentDate) : 'Loading date...'}
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
            <p><span className="font-semibold mb-1">How to Play:</span> Swap adjacent letters. Every swap <i>must</i> make a new {wordLength}-letter word (horizontally or vertically). Find the longest word sequence! Tap <i className="fas fa-lightbulb"></i> for a hint.</p>}
        {difficulty === 'hard' &&
            <p><span className="font-semibold mb-1">Hard Mode:</span> A larger grid and more complex chains! Swaps must form a new <strong>{wordLength}-letter</strong> word (horizontally or vertically). Tap <i className="fas fa-lightbulb"></i> for a hint.</p>}
        {difficulty === 'impossible' &&
            <p><span className="font-semibold mb-1">Impossible Mode:</span> The ultimate test on a sprawling grid! Larger words. More paths. <strong className="whitespace-nowrap">No hints.</strong> Swaps must form a new <i>{wordLength}-letter</i> word. Good luck! <span className="animate-text-glitch-subtle">You will need it.</span></p>}
    </div>
);


// --- MAIN APP COMPONENT ---
function App() {
    const game = useGame(); 

    // --- LOADING / ERROR STATES ---
    // Show loading if not stable OR (core is loading AND no game data yet for initial load)
    if (!game.isStable || (game.coreLoading && !game.gameData)) { 
        return (
            <div className={`flex justify-center items-center min-h-screen text-gray-700 dark:text-gray-300 ${game.darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                Loading {game.difficulty || 'level'} for {game.currentDate ? getFormattedDate(game.currentDate) : 'today'}...
            </div>
        );
    }

    if (game.coreError) { 
        return (
            <div className="flex flex-col justify-center items-center min-h-screen text-center px-4">
                <p className="text-red-600 dark:text-red-400 text-xl font-semibold">Error</p>
                <p className="text-gray-700 dark:text-gray-300 mt-2">{game.coreError}</p>
                <button
                    onClick={() => {
                        // Ensure game.difficulty is defined before calling masterResetGame
                        if (game.difficulty) game.masterResetGame(game.difficulty, true);
                    }}
                    className="cursor-pointer mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                >
                    Try Again
                </button>
            </div>
        );
    }

    // This condition might be hit if loading finishes, state is considered stable, but gameData is still null
    if (!game.gameData) { 
        return (
            <div className="flex justify-center items-center min-h-screen text-gray-500 dark:text-gray-400">
                Game data could not be loaded. Please ensure levels are available or try again later.
            </div>
        );
    }

    // --- DERIVED VALUES FOR RENDERING ---
    const levelActuallyCompleted = game.currentDepth === game.liveMaxDepthAttainable && game.liveMaxDepthAttainable > 0;
    const noMoreValidMoves = game.gameData && game.currentPossibleMoves && game.currentPossibleMoves.length === 0 && !levelActuallyCompleted && game.currentDepth > 0;
    
    const showNoMoreValidMovesMessage = noMoreValidMoves && !levelActuallyCompleted && !game.showEndGamePanelOverride && !game.coreLoading;
    const showDeviatedMessage = game.hasDeviated && !levelActuallyCompleted && !showNoMoreValidMovesMessage && !game.coreLoading;
    const isCurrentlyOptimal = !game.hasDeviated && game.currentDepth > 0;
    const showOptimalMessage = isCurrentlyOptimal && !levelActuallyCompleted && !showNoMoreValidMovesMessage && !showDeviatedMessage && !game.coreLoading;

    // Panel data is only considered valid if the game state is stable
    const panelDataToShow = game.isStable ? game.panelDataForEndGame : { normalDataForPanel: null, hardDataForPanel: null, impossibleDataForPanel: null };
    
    const shouldShowEndGamePanel = 
        ((game.isDisplayGameOver && !game.hasAcknowledgedGameOver) || game.showEndGamePanelOverride) &&
        !game.coreLoading && 
        game.isStable &&    
        (panelDataToShow.normalDataForPanel || panelDataToShow.hardDataForPanel || panelDataToShow.impossibleDataForPanel); 

    return (
        <div className={`flex flex-col items-center justify-start min-h-screen p-4 font-sans pt-8 transition-colors duration-300 ${game.darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
            <GameHeader
                currentDate={game.currentDate}
                difficulty={game.difficulty!} // Assert non-null: if gameData is present, difficulty should be too
                dailyProgress={game.dailyProgress}
            />

            <Instructions difficulty={game.difficulty!} wordLength={game.wordLength} />

            <DailyProgressDisplay
                dailyProgress={game.dailyProgress}
                difficulty={game.difficulty!}
                onPlayMode={game.handlePlayMode}
                onShowSummary={game.handleShowGameSummary}
                loading={game.coreLoading} 
                showEndGamePanelOverride={game.showEndGamePanelOverride}
                animationStateAnimating={game.animationState.animating}
                gameData={game.gameData} 
            />
            
            <StatusMessages
                isInvalidMove={game.isInvalidMove}
                invalidMoveMessage={game.invalidMoveMessage}
                showNoMoreValidMovesMessage={showNoMoreValidMovesMessage}
                showDeviatedMessage={showDeviatedMessage}
                showOptimalMessage={showOptimalMessage}
                onBack={game.handleBack}
                levelActuallyCompleted={levelActuallyCompleted}
            />

            {/* GameBoardArea should only render if gameData exists and state is stable */}
            {game.grid && game.gameData && game.isStable && (
                <GameBoardArea
                    grid={game.grid}
                    gameData={game.gameData} 
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
                    loading={game.coreLoading} 
                    currentDepth={game.currentDepth}
                    liveMaxDepthAttainable={game.liveMaxDepthAttainable}
                    historyLength={game.history.length}
                    isGameOver={game.isDisplayGameOver} 
                    hasAcknowledgedGameOver={game.hasAcknowledgedGameOver}
                    showEndGamePanelOverride={game.showEndGamePanelOverride}
                    difficulty={game.difficulty!}
                    currentPossibleMovesLength={game.currentPossibleMoves.length}
                    onBack={game.handleBack}
                    onReset={game.handleReset}
                    onHint={game.handleHintButtonClick}
                    onViewMySolution={game.handleViewMySolution}
                    turnFailedAttempts={game.turnFailedAttempts}
                    dailyProgressForDifficulty={game.dailyProgress[game.difficulty!]}
                    isInvalidMove={game.isInvalidMove}
                />
            )}
            {/* No separate loading placeholder for board needed if main loading condition handles !isStable */}


            <WordSequenceDisplay history={game.history} showEndGamePanelOverride={game.showEndGamePanelOverride} />

            {game.isDebugMode && game.gameData && game.gameData.explorationTree && ( 
                <DebugView 
                    gameData={game.gameData} 
                    optimalPathWordsFromHook={game.liveOptimalPathWords}
                />
            )}
            
            {shouldShowEndGamePanel && (
                <EndGamePanel
                    normalModeData={panelDataToShow.normalDataForPanel}
                    hardModeData={panelDataToShow.hardDataForPanel}
                    impossibleModeData={panelDataToShow.impossibleDataForPanel}
                    onClose={game.handleCloseGameOverPanel}
                />
            )}
        </div>
    );
}

export default App;
