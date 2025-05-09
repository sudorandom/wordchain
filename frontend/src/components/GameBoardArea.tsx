// src/App.tsx
import WordGrid from './WordGrid';
import ProgressBar from './ProgressBar';
import {
    CellCoordinates,
    GameData,
    DifficultyLevel
} from '../utils/gameHelpers';

interface GameBoardAreaProps {
    grid: string[][];
    gameData: GameData;
    selectedCell: CellCoordinates | null;
    draggedCell: CellCoordinates | null;
    animationState: { animating: boolean, from: CellCoordinates | null, to: CellCoordinates | null };
    highlightedCells: CellCoordinates[];
    hintCells: CellCoordinates[];
    wiggleCells: CellCoordinates[];
    onCellClick: (coords: CellCoordinates) => void;
    onDragStart: (coords: CellCoordinates) => void;
    onDragEnter: (coords: CellCoordinates) => void;
    onDragLeave: (coords: CellCoordinates) => void;
    onDragEnd: () => void;
    onDrop: (coords: CellCoordinates) => void;
    noMoreValidMoves: boolean | null;
    loading: boolean;
    currentDepth: number;
    liveMaxDepthAttainable: number;
    historyLength: number;
    isGameOver: boolean;
    hasAcknowledgedGameOver: boolean;
    showEndGamePanelOverride: boolean;
    difficulty: DifficultyLevel;
    currentPossibleMovesLength: number;
    onBack: () => void;
    onReset: () => void;
    onHint: () => void;
    onViewMySolution: () => void;
    turnFailedAttempts: number;
    dailyProgressForDifficulty: boolean;
    isInvalidMove: boolean | null;
}
const GameBoardArea: React.FC<GameBoardAreaProps> = (props) => (
    <div className="relative inline-flex flex-col items-center mb-1">
        {props.turnFailedAttempts > 0 && !props.showEndGamePanelOverride && !props.isInvalidMove && (
            <div
                className="absolute top-0 left-0 z-10 px-2 py-0.5 bg-yellow-500 text-white text-xs font-bold rounded-full shadow-md transform -translate-x-1/3 -translate-y-1/3"
                title={`Failed Attempts on current turn: ${props.turnFailedAttempts}`}
            >
                {props.turnFailedAttempts}
            </div>
        )}
        <WordGrid
            grid={props.grid} selectedCell={props.selectedCell} draggedCell={props.draggedCell}
            animationState={props.animationState} highlightedCells={props.highlightedCells} hintCells={props.hintCells}
            wiggleCells={props.wiggleCells} onCellClick={props.onCellClick} onDragStart={props.onDragStart}
            onDragEnter={props.onDragEnter} onDragLeave={props.onDragLeave} onDragEnd={props.onDragEnd} onDrop={props.onDrop}
            isDisabled={props.noMoreValidMoves && !props.loading}
        />
        <div className="w-full flex items-center mt-3">
            <ProgressBar currentScore={props.currentDepth} maxScore={props.liveMaxDepthAttainable} />
            <div className="flex space-x-1.5 ml-2.5">
                <button onClick={props.onReset} disabled={props.animationState.animating || props.showEndGamePanelOverride || props.loading || !props.gameData} className={`cursor-pointer p-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md shadow hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-red-400 dark:focus:ring-red-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity`} title="Reset Game">
                    <i className="fas fa-backward-fast"></i>
                </button>
                <button onClick={props.onBack} disabled={props.historyLength === 0 || props.animationState.animating || (props.isGameOver && !props.hasAcknowledgedGameOver) || props.showEndGamePanelOverride || props.loading} className={`cursor-pointer p-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md shadow hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity`} title="Undo last move">
                    <i className="fas fa-step-backward"></i>
                </button>
                {props.difficulty !== 'impossible' &&
                    <button onClick={props.onHint} disabled={props.animationState.animating || props.isGameOver || props.currentPossibleMovesLength === 0 || props.showEndGamePanelOverride || props.loading || props.hintCells.length > 0} className={`cursor-pointer p-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md shadow hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400 dark:focus:ring-yellow-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity`} title="Get a Hint">
                        <i className="fas fa-lightbulb"></i>
                    </button>}
                {props.dailyProgressForDifficulty && props.gameData && (
                    <button onClick={props.onViewMySolution} disabled={props.animationState.animating || props.showEndGamePanelOverride || (props.isGameOver && !props.hasAcknowledgedGameOver) || props.loading} className={`cursor-pointer p-2.5 bg-blue-200 dark:bg-blue-700 text-blue-700 dark:text-blue-200 rounded-md shadow hover:bg-blue-300 dark:hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity`} title="View My Completed Solution">
                        <i className="fas fa-trophy"></i>
                    </button>
                )}
            </div>
        </div>
    </div>
);

export default GameBoardArea
