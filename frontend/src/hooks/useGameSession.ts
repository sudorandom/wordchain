// src/hooks/useGameSession.ts
import { useState, useEffect, useCallback } from 'react';
import { DifficultyLevel, DIFFICULTIES } from '../types/gameTypes';
import { loadDifficultyCompletionStatus } from '../core/storage';

/**
 * Manages game session parameters like current date, difficulty, and daily progress.
 * Also signals when the session's initial state (especially difficulty) is determined.
 */
export const useGameSession = (initialDifficultyProp: DifficultyLevel = 'normal') => {
    const [currentDate, setCurrentDate] = useState<Date | undefined>(undefined); // Initialize as undefined
    const [difficulty, setDifficulty] = useState<DifficultyLevel>(initialDifficultyProp);
    const [dailyProgress, setDailyProgress] = useState<Record<DifficultyLevel, boolean>>({
        normal: false,
        hard: false,
        impossible: false,
    });
    const [reloadTrigger, setReloadTrigger] = useState<number>(0);
    const [isSessionInitialized, setIsSessionInitialized] = useState<boolean>(false); // New state

    // Effect to initialize date, difficulty from URL or storage, and daily progress
    useEffect(() => {
        console.log("[GameSession] Initializing session...");
        const today = new Date();
        setCurrentDate(today);

        const params = new URLSearchParams(window.location.search);
        const urlDifficulty = params.get('difficulty') as DifficultyLevel | null;

        const currentDailyProgressState = loadDifficultyCompletionStatus(today, DIFFICULTIES);
        setDailyProgress(currentDailyProgressState);

        let determinedDifficulty: DifficultyLevel = initialDifficultyProp;
        if (urlDifficulty && DIFFICULTIES.includes(urlDifficulty)) {
            determinedDifficulty = urlDifficulty;
            console.log(`[GameSession] Difficulty from URL: ${determinedDifficulty}`);
        } else if (currentDailyProgressState.normal && currentDailyProgressState.hard && !currentDailyProgressState.impossible) {
            determinedDifficulty = 'impossible';
            console.log(`[GameSession] Progress suggests 'impossible': N=true, H=true, I=false`);
        } else if (currentDailyProgressState.normal && !currentDailyProgressState.hard) {
            determinedDifficulty = 'hard';
            console.log(`[GameSession] Progress suggests 'hard': N=true, H=false`);
        } else {
            // Default to initialDifficultyProp if no other conditions met, or if normal is also incomplete
            console.log(`[GameSession] Defaulting to initial prop or normal: ${determinedDifficulty}`);
        }
        
        setDifficulty(determinedDifficulty);
        setIsSessionInitialized(true); // Signal that session initialization is complete
        console.log(`[GameSession] Session initialized. Final difficulty: ${determinedDifficulty}`);

     
    }, [initialDifficultyProp]); // Rerun if initialDifficultyProp changes, though typically it's static.

    const changeDifficulty = useCallback((newDifficulty: DifficultyLevel) => {
        if (difficulty === newDifficulty) {
            // If trying to set to the same difficulty, still allow reload trigger for a manual refresh.
            // Or, you might want to prevent reload if it's truly the same.
            // For now, let's assume a "change" implies a desire to potentially reload.
            // setReloadTrigger(prev => prev + 1); // Consider if this is desired on same difficulty
            return { success: true };
        }

        if (newDifficulty === 'hard' && !dailyProgress.normal) {
            return { success: false, message: "Complete Normal mode first!" };
        }
        if (newDifficulty === 'impossible' && (!dailyProgress.normal || !dailyProgress.hard)) {
            return { success: false, message: "Complete Normal & Hard modes first!" };
        }

        setDifficulty(newDifficulty);
        setIsSessionInitialized(false); // Reset initialization flag when difficulty changes, core will wait
        setReloadTrigger(prev => prev + 1); // Trigger level reload in useGameCore
        // Session will re-initialize with the new difficulty, then set isSessionInitialized to true
        // For a direct change like this, we can immediately set it to true after setting difficulty
        // because the "initialization" logic for this path is complete.
        // However, to be safe and consistent with the effect above, let the effect handle it,
        // OR, if this function is the SOLE way to change difficulty AFTER initial load,
        // then we can manage isSessionInitialized more directly here.
        // For now, let's assume the reloadTrigger will cause useGameCore to wait.
        // A better approach might be to have useGameCore's load effect also depend on `difficulty`
        // and re-evaluate when `isSessionInitialized` is true.

        // Let's simplify: when difficulty is changed *after* initial load, the session is still "initialized"
        // in the sense that a deliberate choice has been made. The key is the *first* load.
        // So, we might not need to set isSessionInitialized back to false here.
        // The reloadTrigger should be sufficient.

        return { success: true };
    }, [difficulty, dailyProgress]);

    // This effect will run after difficulty changes from `changeDifficulty`
    // and re-set isSessionInitialized to true, ensuring useGameCore can proceed.
    useEffect(() => {
        if (difficulty && currentDate) { // Ensure difficulty and date are set
            setIsSessionInitialized(true);
            console.log(`[GameSession] Session re-initialized for difficulty: ${difficulty}`);
        }
    }, [difficulty, currentDate]);


    const refreshDailyProgress = useCallback(() => {
        if (currentDate) {
            const currentDailyProgressState = loadDifficultyCompletionStatus(currentDate, DIFFICULTIES);
            setDailyProgress(currentDailyProgressState);
        }
    }, [currentDate]);

    const forceReloadLevel = useCallback(() => {
        // It might be useful to set isSessionInitialized to false here, then true after a short delay
        // or let useGameCore's dependencies handle it.
        // For now, just triggering reload.
        setReloadTrigger(prev => prev + 1);
    }, []);


    return {
        currentDate,
        difficulty,
        setDifficulty: changeDifficulty,
        dailyProgress,
        setDailyProgress,
        refreshDailyProgress,
        reloadTrigger,
        forceReloadLevel,
        isSessionInitialized, // Expose the new flag
    };
};
