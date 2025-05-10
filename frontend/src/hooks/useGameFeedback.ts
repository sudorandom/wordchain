// src/hooks/useGameFeedback.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import {
    CellCoordinates,
    AnimationState,
    DifficultyLevel,
    GameMove 
} from '../types/gameTypes'; 
import { findWordCoordinates } from '../utils/gameHelpers'; 

interface GameFeedbackProps {
    turnFailedAttempts: number;
    isUiGameOver: boolean;
    isLoading: boolean;
    difficulty: DifficultyLevel;
    grid: string[][];
    calculateHintCoords: () => CellCoordinates[];
    onSwapSuccess: (
        wordsFormed: string[],
        moveDetails: { from: CellCoordinates; to: CellCoordinates } | GameMove, 
        newGrid: string[][]
    ) => void;
}

const HINT_DURATION_MS = 5000; 
const SWAP_ANIMATION_DURATION_MS = 300;
const HIGHLIGHT_DURATION_MS = 1500;
const WIGGLE_DURATION_MS = 500;
const UNDO_ANIMATION_DURATION_MS = 300;


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
        }, WIGGLE_DURATION_MS);
    }, []);

    const triggerSwapAnimationAndHighlight = useCallback(
        (
            fromCell: CellCoordinates, 
            toCell: CellCoordinates,   
            wordsFormed: string[],
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
                allFoundCoords.forEach(coord => { 
                    if (coord) uniqueHighlightedCellsMap.set(`${coord.row}-${coord.col}`, coord); 
                });
                setHighlightedCells(Array.from(uniqueHighlightedCellsMap.values()));
                
                setAnimationState({ animating: false, from: null, to: null });
                animationTimeoutRef.current = null;

                highlightTimeoutRef.current = window.setTimeout(() => {
                    setHighlightedCells([]);
                    highlightTimeoutRef.current = null;
                }, HIGHLIGHT_DURATION_MS);
                
                onSwapSuccess(wordsFormed, { from: fromCell, to: toCell }, newGrid);

            }, SWAP_ANIMATION_DURATION_MS); 
        },
        [onSwapSuccess] 
    );
    

    const triggerUndoAnimation = useCallback((from: CellCoordinates, to: CellCoordinates, callback?: () => void) => {
        setAnimationState({ animating: true, from, to }); 
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current); setHighlightedCells([]);
        if (wiggleTimeoutRef.current) clearTimeout(wiggleTimeoutRef.current); setWiggleCells([]);
        if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current); setHintCells([]);

        animationTimeoutRef.current = window.setTimeout(() => {
            setAnimationState({ animating: false, from: null, to: null });
            animationTimeoutRef.current = null;
            if (callback) callback();
        }, UNDO_ANIMATION_DURATION_MS); 
    }, []);


    // Effect for showing hints based on failed attempts
    useEffect(() => {
        // High-priority clear conditions (game over, loading, impossible difficulty, invalid grid)
        if (difficulty === 'impossible' || isLoading || isUiGameOver || !grid || grid.length === 0 || (grid[0] && grid[0].length === 0)) {
            if (hintCells.length > 0) { // Only update state if necessary to avoid extra renders
                console.log('[GameFeedback] Clearing hint due to high-priority condition (e.g., loading, game over).');
                setHintCells([]); 
            }
            if (hintTimeoutRef.current) {
                clearTimeout(hintTimeoutRef.current);
                hintTimeoutRef.current = null;
            }
            return; // Exit early if any of these conditions are met
        }

        // Logic to show hints based on failed attempts
        if (turnFailedAttempts >= 3) {
            // Only trigger a new hint if no hint is currently being displayed.
            // This prevents this effect from interfering with a hint shown by the button click
            // or from re-triggering itself if other dependencies change while a hint is active.
            if (hintCells.length === 0) { 
                const coordinates = calculateHintCoords();
                if (coordinates.length > 0) {
                    console.log('[GameFeedback] Showing hint due to failed attempts.');
                    setHintCells(coordinates);
                    // Ensure any previous timeout is cleared before setting a new one.
                    // This is a safeguard, though hintCells.length === 0 should mean no active timer.
                    if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current); 
                    hintTimeoutRef.current = window.setTimeout(() => {
                        console.log('[GameFeedback] Clearing hint after timeout (from failed attempts).');
                        setHintCells([]);
                        hintTimeoutRef.current = null;
                    }, HINT_DURATION_MS);
                }
            }
        } 
        // No 'else' block here to clear hints if turnFailedAttempts < 3.
        // Hints are cleared by their own timeout or by the high-priority conditions above.
        // This prevents this effect from prematurely clearing a hint set by the hint button.

    // Dependencies: React to changes in these values.
    // hintCells.length is included so if hints are cleared externally (e.g. clearAllFeedbacks)
    // and turnFailedAttempts is still >=3, this effect can re-show the hint.
    }, [turnFailedAttempts, isUiGameOver, isLoading, difficulty, calculateHintCoords, grid, hintCells.length]);

    const handleHintButtonClick = useCallback(() => {
        // Conditions to prevent showing hint (e.g., game over, impossible, already showing, etc.)
        if (isUiGameOver || difficulty === 'impossible' || animationState.animating || isLoading || !grid || grid.length === 0 || (grid[0] && grid[0].length === 0) || hintCells.length > 0) {
            return;
        }
        
        const coordinates = calculateHintCoords();
        if (coordinates.length > 0) {
            console.log('[GameFeedback] Showing hint due to button click.');
            setHintCells(coordinates);
            // Clear any existing hint timeout (e.g., from a previous failed attempt hint) before starting a new one.
            if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current); 
            hintTimeoutRef.current = window.setTimeout(() => {
                console.log('[GameFeedback] Clearing hint after timeout (from button click).');
                setHintCells([]);
                hintTimeoutRef.current = null;
            }, HINT_DURATION_MS); 
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
        setHintCells([]); // This will also trigger the useEffect if turnFailedAttempts is high
        console.log('[GameFeedback] All feedbacks cleared.');
    }, []);


    return {
        animationState,
        highlightedCells,
        wiggleCells,
        hintCells,
        setHintCells, // Exposing setHintCells might be useful for direct control if needed

        triggerWiggle,
        triggerSwapAnimationAndHighlight, 
        triggerUndoAnimation,
        handleHintButtonClick,
        clearAllFeedbacks,
    };
};
