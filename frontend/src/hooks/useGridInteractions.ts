// src/hooks/useGridInteractions.ts
import { useState, useCallback } from 'react';
import { CellCoordinates, SwapResult } from '../types/gameTypes'; // Core types
import { areAdjacent } from '../utils/gameHelpers'; // Import 'areAdjacent' from its actual location

interface GridInteractionProps {
    performSwapAction: (cell1: CellCoordinates, cell2: CellCoordinates) => SwapResult;
    isInteractionAllowed: () => boolean; // e.g., not game over, not animating
    triggerWiggleFeedback: (cell1: CellCoordinates, cell2: CellCoordinates) => void;
    clearActiveFeedbacks: () => void; // Clears highlights, wiggles, hints
    isCoreGameActuallyOver: boolean; // Direct flag from core game logic
}

/**
 * Manages user interactions with the game grid (clicks, drag-and-drop).
 */
export const useGridInteractions = ({
    performSwapAction,
    isInteractionAllowed,
    triggerWiggleFeedback,
    clearActiveFeedbacks,
    isCoreGameActuallyOver
}: GridInteractionProps) => {
    const [selectedCell, setSelectedCell] = useState<CellCoordinates | null>(null);
    const [draggedCell, setDraggedCell] = useState<CellCoordinates | null>(null);
    const [hoveredCell, setHoveredCell] = useState<CellCoordinates | null>(null);
    const [isInvalidMove, setIsInvalidMove] = useState<boolean>(false);
    const [invalidMoveMessage, setInvalidMoveMessage] = useState<string>('');

    const resetInteractionState = useCallback(() => {
        setSelectedCell(null);
        setDraggedCell(null);
        setHoveredCell(null);
        setIsInvalidMove(false);
        setInvalidMoveMessage('');
    }, []);

    const handleCellClick = useCallback((cellCoords: CellCoordinates) => {
        if (!isInteractionAllowed() || draggedCell) return;

        if (!isCoreGameActuallyOver) {
            setIsInvalidMove(false);
            setInvalidMoveMessage('');
        }
        clearActiveFeedbacks();

        if (!selectedCell) {
            setSelectedCell(cellCoords);
        } else {
            if (selectedCell.row === cellCoords.row && selectedCell.col === cellCoords.col) {
                setSelectedCell(null);
            } else if (areAdjacent(selectedCell, cellCoords)) { // Using imported areAdjacent
                const result = performSwapAction(selectedCell, cellCoords);
                if (!result.success && result.message && result.message !== "Game is over." && !isCoreGameActuallyOver) {
                    setIsInvalidMove(true);
                    setInvalidMoveMessage(result.message || 'Invalid Move!');
                    triggerWiggleFeedback(selectedCell, cellCoords);
                }
                setSelectedCell(null);
            } else {
                setSelectedCell(cellCoords);
            }
        }
    }, [selectedCell, draggedCell, isInteractionAllowed, performSwapAction, triggerWiggleFeedback, clearActiveFeedbacks, isCoreGameActuallyOver]);

    const handleDragStart = useCallback((cellCoords: CellCoordinates) => {
        if (!isInteractionAllowed()) return;
        clearActiveFeedbacks();
        setDraggedCell(cellCoords);
        setSelectedCell(null);
        setIsInvalidMove(false);
        setInvalidMoveMessage('');
        setHoveredCell(null);
    }, [isInteractionAllowed, clearActiveFeedbacks]);

    const handleDragEnter = useCallback((cellCoords: CellCoordinates) => {
        if (!isInteractionAllowed() || !draggedCell) return;
        if (draggedCell.row !== cellCoords.row || draggedCell.col !== cellCoords.col) {
            if (areAdjacent(draggedCell, cellCoords)) { // Using imported areAdjacent
                setHoveredCell(cellCoords);
            } else {
                setHoveredCell(null);
            }
        }
    }, [draggedCell, isInteractionAllowed]);

    const handleDragLeave = useCallback((cellCoords: CellCoordinates) => {
        if (!isInteractionAllowed()) return;
        if (hoveredCell && hoveredCell.row === cellCoords.row && hoveredCell.col === cellCoords.col) {
            setHoveredCell(null);
        }
    }, [hoveredCell, isInteractionAllowed]);

    const handleDrop = useCallback((targetCellCoords: CellCoordinates) => {
        if (!isInteractionAllowed() || !draggedCell) {
            setDraggedCell(null);
            setHoveredCell(null);
            return;
        }

        const sourceCell = draggedCell;
        setHoveredCell(null);

        if (sourceCell.row === targetCellCoords.row && sourceCell.col === targetCellCoords.col) {
            setDraggedCell(null);
            return;
        }

        if (!areAdjacent(sourceCell, targetCellCoords)) { // Using imported areAdjacent
            if (!isCoreGameActuallyOver) {
                setIsInvalidMove(true);
                setInvalidMoveMessage('Must swap adjacent cells.');
                triggerWiggleFeedback(sourceCell, targetCellCoords);
            }
            setDraggedCell(null);
            return;
        }

        const result = performSwapAction(sourceCell, targetCellCoords);
        if (!result.success && result.message && result.message !== "Game is over." && !isCoreGameActuallyOver) {
            setIsInvalidMove(true);
            setInvalidMoveMessage(result.message || 'Invalid Move!');
            // Wiggle is typically triggered by performSwap itself or by the feedback hook
        }
        setDraggedCell(null);
    }, [draggedCell, isInteractionAllowed, performSwapAction, triggerWiggleFeedback, isCoreGameActuallyOver]);

    const handleDragEnd = useCallback(() => {
        if (!isInteractionAllowed()) return;
        setDraggedCell(null);
        setHoveredCell(null);
    }, [isInteractionAllowed]);
    
    const clearInvalidMove = useCallback(() => {
        setIsInvalidMove(false);
        setInvalidMoveMessage('');
    }, []);


    return {
        selectedCell,
        draggedCell,
        hoveredCell,
        isInvalidMove,
        invalidMoveMessage,
        setSelectedCell,
        
        handleCellClick,
        handleDragStart,
        handleDragEnter,
        handleDragLeave,
        handleDrop,
        handleDragEnd,
        
        resetInteractionState,
        clearInvalidMove,
    };
};
