// src/hooks/useGameFeedback.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import {
    CellCoordinates,
    AnimationState,
    DifficultyLevel,
    GameMove // Added GameMove for moveDetails type consistency
} from '../types/gameTypes'; // Core types
import { findWordCoordinates } from '../utils/gameHelpers'; // Import from actual location

interface GameFeedbackProps {
    turnFailedAttempts: number;
    isUiGameOver: boolean;
    isLoading: boolean;
    difficulty: DifficultyLevel;
    grid: string[][];
    calculateHintCoords: () => CellCoordinates[];
    // Callback to notify that swap animation and highlight logic has completed.
    onSwapSuccess: (
        wordsFormed: string[],
        // Ensure moveDetails here matches the type expected by findWordCoordinates (GameMove)
        // and the type provided by SwapResult from GameLogic
        moveDetails: { from: CellCoordinates; to: CellCoordinates } | GameMove, // Allow either for flexibility or ensure consistency
        newGrid: string[][]
    ) => void;
}

/**
 * Manages visual feedback like animations (swap), highlights, wiggles, and hints.
 */
export const useGameFeedback = ({
    turnFailedAttempts,
    isUiGameOver,
    isLoading,
    difficulty,
    grid,
    calculateHintCoords,
    onSwapSuccess,
}: GameFeedbackProps) => {
    const [animationState, setAnimationState] = useState<AnimationState>({ animating: false, from: null, to: null });
    const animationTimeoutRef = useRef<number | null>(null);

    const [highlightedCells, setHighlightedCells] = useState<CellCoordinates[]>([]);
    const highlightTimeoutRef = useRef<number | null>(null);

    const [wiggleCells, setWiggleCells] = useState<CellCoordinates[]>([]);
    const wiggleTimeoutRef = useRef<number | null>(null);

    const [hintCells, setHintCells] = useState<CellCoordinates[]>([]);
    const hintTimeoutRef = useRef<number | null>(null);

    // Cleanup timeouts on unmount
    useEffect(() => {
        return () => {
            if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
            if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
            if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current);
            if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
        };
    }, []);

    const triggerWiggle = useCallback((cell1: CellCoordinates, cell2: CellCoordinates) => {
        if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current);
        setWiggleCells([cell1, cell2]);
        wiggleTimeoutRef.current = window.setTimeout(() => {
            setWiggleCells([]);
            wiggleTimeoutRef.current = null;
        }, 500);
    }, []);

    // This function is called by performSwapWithFeedback in useGame.ts
    // It receives the necessary data to trigger animations and find word coordinates.
    const triggerSwapAnimationAndHighlight = useCallback(
        (
            fromCell: CellCoordinates, // The cell the drag/click started from
            toCell: CellCoordinates,   // The cell the drag/click ended on (target of swap)
            wordsFormed: string[],
            // This moveDetails should be the GameMove object {from: [r,c], to: [r,c]}
            // that represents the state *after* the swap for findWordCoordinates.
            // The SwapResult from GameLogic should provide this.
            moveDetailsForHighlight: GameMove,
            newGrid: string[][]
        ) => {
            setAnimationState({ animating: true, from: fromCell, to: toCell });
            if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
            setHighlightedCells([]);

            animationTimeoutRef.current = window.setTimeout(() => {
                const allFoundCoords: CellCoordinates[] = [];
                if (wordsFormed && moveDetailsForHighlight && newGrid) {
                    wordsFormed.forEach((word: string) => {
                        const coordsAttempt = findWordCoordinates(newGrid, word, moveDetailsForHighlight);
                        if (coordsAttempt) allFoundCoords.push(...coordsAttempt);
                    });
                }
                const uniqueHighlightedCellsMap = new Map<string, CellCoordinates>();
                allFoundCoords.forEach(coord => { if (coord) uniqueHighlightedCellsMap.set(`${coord.row}-${coord.col}`, coord); });
                setHighlightedCells(Array.from(uniqueHighlightedCellsMap.values()));
                
                setAnimationState({ animating: false, from: null, to: null });
                animationTimeoutRef.current = null;

                highlightTimeoutRef.current = window.setTimeout(() => {
                    setHighlightedCells([]);
                    highlightTimeoutRef.current = null;
                }, 1500);
                
                // Notify useGame that the feedback process for this swap is complete.
                // Pass the original fromCell/toCell if the consumer (useGame) needs that specific format for moveDetails.
                onSwapSuccess(wordsFormed, { from: fromCell, to: toCell }, newGrid);

            }, 300); // Swap animation duration
        },
        [onSwapSuccess] // findWordCoordinates is stable
    );
    

    const triggerUndoAnimation = useCallback((from: CellCoordinates, to: CellCoordinates, callback?: () => void) => {
        setAnimationState({ animating: true, from, to }); // Cells are swapped back
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current); setHighlightedCells([]);
        if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current); setWiggleCells([]);
        if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current); setHintCells([]);

        animationTimeoutRef.current = window.setTimeout(() => {
            setAnimationState({ animating: false, from: null, to: null });
            animationTimeoutRef.current = null;
            if (callback) callback();
        }, 300); // Undo animation duration
    }, []);


    // Effect for showing hints based on failed attempts
    useEffect(() => {
        if (difficulty === 'impossible' || isLoading || isUiGameOver || grid.length === 0 || grid[0].length === 0) {
            setHintCells([]);
            if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
            return;
        }

        if (turnFailedAttempts >= 3) {
            const coordinates = calculateHintCoords();
            if (coordinates.length > 0) {
                setHintCells(coordinates);
                if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
                hintTimeoutRef.current = window.setTimeout(() => {
                    setHintCells([]);
                    hintTimeoutRef.current = null;
                }, 3000); // Hint display duration
            }
        } else {
            if (hintCells.length > 0) setHintCells([]);
            if (hintTimeoutRef.current) { clearTimeout(hintTimeoutRef.current); hintTimeoutRef.current = null;}
        }
    }, [turnFailedAttempts, grid, isUiGameOver, isLoading, difficulty, calculateHintCoords, hintCells.length]);

    const handleHintButtonClick = useCallback(() => {
        if (isUiGameOver || difficulty === 'impossible' || animationState.animating || isLoading || !grid || grid.length === 0 || grid[0].length === 0 || hintCells.length > 0) return;
        
        const coordinates = calculateHintCoords();
        if (coordinates.length > 0) {
            setHintCells(coordinates);
            if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
            hintTimeoutRef.current = window.setTimeout(() => {
                setHintCells([]);
                hintTimeoutRef.current = null;
            }, 3000);
        }
    }, [grid, difficulty, animationState.animating, isUiGameOver, isLoading, hintCells.length, calculateHintCoords]);

    const clearAllFeedbacks = useCallback(() => {
        if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
        setAnimationState({ animating: false, from: null, to: null });
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        setHighlightedCells([]);
        if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current);
        setWiggleCells([]);
        if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
        setHintCells([]);
    }, []);


    return {
        animationState,
        highlightedCells,
        wiggleCells,
        hintCells,
        setHintCells,

        triggerWiggle,
        // This is the function useGame's performSwapWithFeedback should call
        triggerSwapAnimationAndHighlight, 
        triggerUndoAnimation,
        handleHintButtonClick,
        clearAllFeedbacks,
    };
};
