// src/hooks/useGameSession.ts
import { useState, useEffect, useCallback } from 'react';
import { DifficultyLevel, DIFFICULTIES, storage } from '../types/gameTypes'; // Using declared namespace

/**
 * Manages game session parameters like current date, difficulty, and daily progress.
 */
export const useGameSession = (initialDifficulty: DifficultyLevel = 'normal') => {
    const [currentDate, setCurrentDate] = useState<Date>(new Date());
    const [difficulty, setDifficulty] = useState<DifficultyLevel>(initialDifficulty);
    const [dailyProgress, setDailyProgress] = useState<Record<DifficultyLevel, boolean>>({
        normal: false,
        hard: false,
        impossible: false,
    });
    const [reloadTrigger, setReloadTrigger] = useState<number>(0); // To force-reload level data

    // Effect to initialize date, difficulty from URL or storage, and daily progress
    useEffect(() => {
        const today = new Date();
        setCurrentDate(today);

        const params = new URLSearchParams(window.location.search);
        const urlDifficulty = params.get('difficulty') as DifficultyLevel | null;

        const currentDailyProgressState = storage.loadDifficultyCompletionStatus(today, DIFFICULTIES);
        setDailyProgress(currentDailyProgressState);

        let determinedDifficulty: DifficultyLevel = initialDifficulty;
        if (urlDifficulty && DIFFICULTIES.includes(urlDifficulty)) {
            determinedDifficulty = urlDifficulty;
        } else if (currentDailyProgressState.normal && !currentDailyProgressState.hard) {
            determinedDifficulty = 'hard';
        } else if (currentDailyProgressState.normal && currentDailyProgressState.hard && !currentDailyProgressState.impossible) {
            determinedDifficulty = 'impossible';
        }
        setDifficulty(determinedDifficulty);
    }, [initialDifficulty]); // Runs once on mount, or if initialDifficulty prop changes

    const changeDifficulty = useCallback((newDifficulty: DifficultyLevel) => {
        if (difficulty === newDifficulty) return false;

        if (newDifficulty === 'hard' && !dailyProgress.normal) {
            // console.warn("Complete Normal mode first to unlock Hard.");
            return { success: false, message: "Complete Normal mode first!" };
        }
        if (newDifficulty === 'impossible' && (!dailyProgress.normal || !dailyProgress.hard)) {
            // console.warn("Complete Normal & Hard modes first to unlock Impossible.");
            return { success: false, message: "Complete Normal & Hard modes first!" };
        }

        setDifficulty(newDifficulty);
        setReloadTrigger(prev => prev + 1); // Trigger level reload
        return { success: true };
    }, [difficulty, dailyProgress]);

    const refreshDailyProgress = useCallback(() => {
        if (currentDate) {
            const currentDailyProgressState = storage.loadDifficultyCompletionStatus(currentDate, DIFFICULTIES);
            setDailyProgress(currentDailyProgressState);
        }
    }, [currentDate]);

    // Function to manually trigger a reload of the current level
    const forceReloadLevel = useCallback(() => {
        setReloadTrigger(prev => prev + 1);
    }, []);


    return {
        currentDate,
        difficulty,
        setDifficulty: changeDifficulty, // expose the guarded setter
        dailyProgress,
        setDailyProgress, // Allow external updates, e.g., after completing a level
        refreshDailyProgress,
        reloadTrigger,
        forceReloadLevel,
    };
};
