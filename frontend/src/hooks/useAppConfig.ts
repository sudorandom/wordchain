// src/hooks/useAppConfig.ts
import { useState, useEffect } from 'react';
// Import specific functions from the actual storage module
import { loadDarkModePreference, saveDarkModePreference } from '../core/storage';

/**
 * Manages application-level configurations like dark mode and debug mode.
 */
export const useAppConfig = () => {
    const [darkMode, setDarkMode] = useState<boolean>(() => {
        const preference = loadDarkModePreference(); // Direct call
        if (preference !== undefined) return preference;
        if (typeof window !== 'undefined') {
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        return false;
    });

    const [isDebugMode, setIsDebugMode] = useState<boolean>(false);

    // Effect to apply dark mode class to HTML element and save preference
    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        saveDarkModePreference(darkMode); // Direct call
    }, [darkMode]);

    // Effect to check for debug mode from URL parameters on initial load
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            setIsDebugMode(params.get('debug') === 'true');
        }
    }, []);

    return {
        darkMode,
        setDarkMode,
        isDebugMode,
    };
};
