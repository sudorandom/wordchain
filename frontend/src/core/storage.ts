// src/core/storage.ts
import { SavedProgressState } from './gameLogic'; // Assuming this is the correct import path
import { getFormattedDate, HistoryEntry, DifficultyLevel } from '../utils/gameHelpers';

// --- Types related to storage ---

export interface LevelCompletionSummary {
    history: HistoryEntry[];
    score: number;
    playerWords: string[];
    maxScore: number;
    optimalPathWords: string[];
    difficultyForSummary: DifficultyLevel;
    finalGrid: string[][];
}

export type DailyProgressStorage = Partial<Record<DifficultyLevel, {
    completed: boolean;
    summary?: LevelCompletionSummary;
}>>;

export interface StoredProgressWithHash {
    jsonFileHash: number;
    sourceDifficultyAtSave: DifficultyLevel;
    progress: SavedProgressState;
}

// --- Utility Functions ---
export const simpleHash = (str: string): number => {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
};

// --- Dark Mode ---
const DARK_MODE_KEY = 'darkMode';
export const loadDarkModePreference = (): boolean | undefined => {
    if (typeof window !== 'undefined') {
        try {
            const savedMode = localStorage.getItem(DARK_MODE_KEY);
            if (savedMode !== null) return JSON.parse(savedMode);
        } catch (e) {
            console.error("Failed to parse darkMode from localStorage.", e);
            localStorage.removeItem(DARK_MODE_KEY); // Clean up corrupted item
        }
    }
    return undefined;
};
export const saveDarkModePreference = (isDark: boolean): void => {
    if (typeof window !== 'undefined') {
        try {
            localStorage.setItem(DARK_MODE_KEY, JSON.stringify(isDark));
        } catch (e) {
            console.error("Error setting dark mode in localStorage:", e);
        }
    }
};

// --- Daily Progress (Completion and Summaries) ---
const getDailyProgressKey = (date: Date): string => `wordChainsProgress-${getFormattedDate(date)}`;

export const loadDailyProgress = (date: Date): DailyProgressStorage => {
    if (typeof window === 'undefined') return {};
    const progressKey = getDailyProgressKey(date);
    const savedProgressString = localStorage.getItem(progressKey);
    if (savedProgressString) {
        try {
            return JSON.parse(savedProgressString) as DailyProgressStorage;
        } catch (e) {
            console.error(`Failed to parse daily progress from localStorage for key ${progressKey}:`, e);
            // localStorage.removeItem(progressKey); // Non-destructive: Do not remove on parse error
        }
    }
    return {};
};

export const saveDailyProgress = (date: Date, dailyProgressDataToSave: DailyProgressStorage): void => {
    if (typeof window === 'undefined') return;

    // Validate the integrity of the dailyProgressDataToSave before saving
    let isValidToSave = true;
    for (const key in dailyProgressDataToSave) {
        if (Object.prototype.hasOwnProperty.call(dailyProgressDataToSave, key)) {
            const difficultyKey = key as DifficultyLevel;
            const entry = dailyProgressDataToSave[difficultyKey];

            // Check if the summary exists and if its internal difficultyForSummary matches the key
            if (entry?.summary && entry.summary.difficultyForSummary !== difficultyKey) {
                console.error(
                    `[Storage] CRITICAL MISMATCH in saveDailyProgress for date ${getFormattedDate(date)}! ` +
                    `Attempting to save a summary under key '${difficultyKey}' but its internal 'difficultyForSummary' is '${entry.summary.difficultyForSummary}'. ` +
                    `This indicates a problem in the logic that constructed the DailyProgressStorage object. ABORTING SAVE of entire DailyProgressStorage to prevent corruption.`
                );
                isValidToSave = false;
                break; // Stop checking on first error
            }
        }
    }

    if (!isValidToSave) {
        console.warn(`[Storage] Daily progress save aborted for date ${getFormattedDate(date)} due to data inconsistency.`);
        return; // Do not save if data is inconsistent
    }

    const progressKey = getDailyProgressKey(date);
    try {
        // Log a snippet for brevity, full data can be large
        const dataString = JSON.stringify(dailyProgressDataToSave);
        console.log(`[Storage] Saving daily progress for key ${progressKey}. Data snippet:`, dataString.substring(0, 300) + (dataString.length > 300 ? "..." : ""));
        localStorage.setItem(progressKey, dataString);
    } catch (e) {
        console.error(`Failed to save daily progress to localStorage for key ${progressKey}:`, e);
    }
};

export const loadDifficultyCompletionStatus = (date: Date, difficulties: DifficultyLevel[]): Record<DifficultyLevel, boolean> => {
    const dailyProgress = loadDailyProgress(date);
    const completionStatus: Record<DifficultyLevel, boolean> = {} as Record<DifficultyLevel, boolean>;
    difficulties.forEach(diff => {
        completionStatus[diff] = dailyProgress[diff]?.completed || false;
    });
    return completionStatus;
};

export const loadAllSummariesForDate = (date: Date, difficulties: DifficultyLevel[]): Partial<Record<DifficultyLevel, LevelCompletionSummary | null>> => {
    const dailyProgress = loadDailyProgress(date);
    const summaries: Partial<Record<DifficultyLevel, LevelCompletionSummary | null>> = {};
    difficulties.forEach(diff => {
        summaries[diff] = dailyProgress[diff]?.summary || null;
    });
    return summaries;
};

export const loadSummaryForDifficulty = (date: Date, difficulty: DifficultyLevel): LevelCompletionSummary | undefined => {
    const dailyProgress = loadDailyProgress(date);
    return dailyProgress[difficulty]?.summary;
};

// --- In-Progress Game State ---

const getInProgressStateKey = (date: Date, difficulty: DifficultyLevel): string =>
    `wordChainsState-${getFormattedDate(date)}-${difficulty}`;

export const loadInProgressState = (
    date: Date,
    difficulty: DifficultyLevel, 
    currentJsonFileHash: number 
): SavedProgressState | undefined => {
    if (typeof window === 'undefined') return undefined;
    const inProgressStateKey = getInProgressStateKey(date, difficulty);
    const inProgressStateString = localStorage.getItem(inProgressStateKey);
    
    console.log(`[Storage] loadInProgressState for key '${inProgressStateKey}' (difficulty: ${difficulty}). Current JSON hash for this difficulty: ${currentJsonFileHash}.`);
    console.log(`[Storage] In-progress state string from localStorage:`, inProgressStateString ? "Found" : "Not Found");

    if (inProgressStateString) {
        try {
            const storedData: StoredProgressWithHash = JSON.parse(inProgressStateString);

            if (typeof storedData.sourceDifficultyAtSave === 'undefined') {
                console.warn(`[Storage] 'sourceDifficultyAtSave' is missing in stored data for key '${inProgressStateKey}'. Considering it invalid for loading but NOT REMOVING.`);
                return undefined;
            }

            if (storedData.sourceDifficultyAtSave !== difficulty) {
                console.warn(`[Storage] Source difficulty mismatch! Stored for '${storedData.sourceDifficultyAtSave}', but loading for '${difficulty}'. Considering invalid for loading but NOT REMOVING item for key '${inProgressStateKey}'.`);
                return undefined;
            }

            if (storedData.jsonFileHash === currentJsonFileHash) {
                if (!storedData.progress?.lastGrid || !Array.isArray(storedData.progress.lastGrid) ||
                    !storedData.progress.history || !Array.isArray(storedData.progress.history)) {
                    console.warn("[Storage] Saved progress data (e.g. lastGrid, history) is structurally invalid. Considering invalid for loading but NOT REMOVING item.");
                    return undefined;
                }
                console.log(`[Storage] JSON hash (${storedData.jsonFileHash}) and source difficulty ('${storedData.sourceDifficultyAtSave}') match. Attempting to load saved progress.`);
                return storedData.progress;
            } else {
                console.warn(`[Storage] JSON hash mismatch. Stored hash: ${storedData.jsonFileHash}, Current hash for '${difficulty}': ${currentJsonFileHash}. Considering invalid for loading but NOT REMOVING item for key '${inProgressStateKey}'.`);
                return undefined;
            }
        } catch (e) {
            console.error(`[Storage] Failed to parse saved game state for key '${inProgressStateKey}' (or structure is old/invalid). CONSIDERING INVALID FOR LOADING BUT NOT REMOVING ITEM. Error:`, e);
        }
    }
    return undefined;
};

export const saveInProgressState = (
    date: Date,
    difficulty: DifficultyLevel, 
    gameStateToSave: SavedProgressState,
    currentJsonFileHash: number,
    sourceDifficulty: DifficultyLevel | undefined 
): void => {
    if (typeof window === 'undefined') return;
    const inProgressStateKey = getInProgressStateKey(date, difficulty);

    if (typeof sourceDifficulty === 'undefined') {
        console.error(`[Storage] CRITICAL ERROR during save! The 'sourceDifficulty' argument provided to saveInProgressState was undefined. Aborting save for key '${inProgressStateKey}'. This indicates an issue in the calling code (e.g., useGameCore.ts).`);
        return;
    }

    if (difficulty !== sourceDifficulty) {
        console.error(`[Storage] CRITICAL MISMATCH during save! Attempting to save under key for difficulty '${difficulty}' but source data is explicitly for difficulty '${sourceDifficulty}'. Aborting save to prevent corruption for key '${inProgressStateKey}'.`);
        return;
    }

    const dataToStore: StoredProgressWithHash = {
        jsonFileHash: currentJsonFileHash,
        sourceDifficultyAtSave: sourceDifficulty, 
        progress: gameStateToSave
    };

    try {
        console.log(`[Storage] Saving in-progress state for key '${inProgressStateKey}'. Hash: ${currentJsonFileHash}, SourceDiff: ${sourceDifficulty}`);
        localStorage.setItem(inProgressStateKey, JSON.stringify(dataToStore));
    } catch (e) {
        console.error(`Failed to save game state to localStorage for key ${inProgressStateKey}:`, e);
    }
};

export const removeInProgressState = (date: Date, difficulty: DifficultyLevel): void => {
    if (typeof window === 'undefined') return;
    const inProgressStateKey = getInProgressStateKey(date, difficulty);
    try {
        localStorage.removeItem(inProgressStateKey);
        console.log(`[Storage] EXPLICITLY REMOVED in-progress state for key '${inProgressStateKey}' (difficulty: ${difficulty}) via removeInProgressState.`);
    } catch (e) {
        console.error(`[Storage] Failed to remove item from localStorage during explicit reset for key ${inProgressStateKey}:`, e);
    }
};
