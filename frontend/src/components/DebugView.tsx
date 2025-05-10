// src/components/DebugView.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { GameData, ExplorationNodeData, PathStep } from '../types/gameTypes'; // Assuming PathStep is exported from gameLogic or gameTypes
import { GameLogic } from '../core/gameLogic'; // Import the GameLogic class

interface DebugViewProps {
    // gameData contains explorationTree and maxDepthReached (for globalMaxDepth)
    gameData?: GameData | null; 
    // This is the single optimal path calculated by useGameCore's findLongestWordChain
    optimalPathWordsFromHook: string[]; 
}

// Helper component for rendering a single node and its children recursively
interface TreeNodeProps {
    node: ExplorationNodeData;
    level: number; 
    globalMaxDepth: number; 
}

// --- LinkedWordTag (assuming this component is defined here or imported correctly) ---
interface LinkedWordTagProps {
    word: string;
    className?: string;
    style?: React.CSSProperties;
    displayTextSuffix?: string;
}

const LinkedWordTag: React.FC<LinkedWordTagProps> = ({
    word,
    className,
    style,
    displayTextSuffix = '',
}) => {
    if (!word || word === '???') {
        return (
            <span
                className={`px-1.5 py-0.5 rounded font-medium text-xs ${className || 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}
                style={style}
            >
                {word || '???'}
                {displayTextSuffix}
            </span>
        );
    }
    return (
        <a
            href={`https://dictionary.cambridge.org/dictionary/english/${word.toLowerCase()}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`px-1.5 py-0.5 rounded font-medium text-xs ${className || ''} hover:underline focus:outline-none focus:ring-1 focus:ring-blue-500`}
            style={style}
            title={`Look up "${word}" in Cambridge Dictionary`}
        >
            {word.toUpperCase()}
            {displayTextSuffix}
        </a>
    );
};
// --- End of LinkedWordTag ---


const TreeNode: React.FC<TreeNodeProps> = ({ node, level, globalMaxDepth }) => {
    const [isOpen, setIsOpen] = useState(level < 1); // Auto-open only the first level of children
    const hasChildren = node.nextMoves && node.nextMoves.length > 0;
    const indent = level * 5; 

    const sortedChildren = useMemo(() => {
        if (!hasChildren) return [];
        return [...node.nextMoves!].sort((a, b) => {
            const depthA = a.maxDepthReached ?? -1;
            const depthB = b.maxDepthReached ?? -1;
            return depthB - depthA; 
        });
    }, [node.nextMoves, hasChildren]);

    const formatMove = (move: { from: number[]; to: number[] } | undefined): string => {
        if (!move) return 'Initial State'; // Should ideally not happen for non-root nodes in tree view
        return `Swap (${move.from.join(',')})↔(${move.to.join(',')})`;
    };

    // Highlighting based on whether this node's path can reach globalMaxDepth
    const isNodePotentiallyOptimal = globalMaxDepth !== -1 && ((node.maxDepthReached ?? -1) + level) >= globalMaxDepth;

    return (
        <div style={{ marginLeft: `${indent}px` }} className="my-1">
            <div
                className="flex items-center cursor-pointer group py-1"
                onClick={() => hasChildren && setIsOpen(!isOpen)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && hasChildren && setIsOpen(!isOpen)}
                aria-expanded={isOpen}
            >
                {hasChildren && (
                    <span className="text-xs mr-2 transition-transform duration-150 group-hover:scale-110 transform">
                        {isOpen ? '▼' : '▶'}
                    </span>
                )}
                <span className={`text-xs sm:text-sm font-mono p-1.5 rounded border ${isNodePotentiallyOptimal ? 'bg-green-50 dark:bg-green-900 border-green-300 dark:border-green-700 font-bold' : 'bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600'}`}>
                    {node.move ? formatMove(node.move) : "Root Node (Implicit)"} |
                    <span className="font-semibold ml-1">d</span>={node.maxDepthReached ?? 'N/A'} |
                    <span className={`font-bold ml-1 ${isNodePotentiallyOptimal ? 'text-green-700 dark:text-green-300' : 'text-gray-700 dark:text-gray-400'}`}>
                        {node.wordsFormed.join(', ')}
                    </span>
                </span>
            </div>
            {isOpen && hasChildren && (
                <div className="mt-1 border-l-2 border-gray-200 dark:border-gray-500 pl-3">
                    {sortedChildren.map((childNode, index) => (
                        <TreeNode
                            key={`${formatMove(childNode.move)}-${level + 1}-${index}`}
                            node={childNode}
                            level={level + 1}
                            globalMaxDepth={globalMaxDepth} 
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// Main Tree View component
const DebugView: React.FC<DebugViewProps> = ({ gameData, optimalPathWordsFromHook }) => {
    const [localStorageData, setLocalStorageData] = useState<string | null>(null);
    
    const [optimalPathsFromLogic, setOptimalPathsFromLogic] = useState<PathStep[][]>([]);
    const [terminalPathsFromLogic, setTerminalPathsFromLogic] = useState<PathStep[][]>([]);

    // Memoize GameLogic instance based on gameData
    const gameLogicInstance = useMemo(() => {
        if (!gameData) return null;
        const gl = new GameLogic();
        gl.loadLevel(gameData); // Load the gameData into the instance
        return gl;
    }, [gameData]);

    useEffect(() => {
        console.log("[DebugView] Props received:", { gameDataExists: !!gameData, optimalPathWordsFromHook });
        if (gameLogicInstance) {
            console.log("[DebugView] GameLogic instance created/updated.");
            setOptimalPathsFromLogic(gameLogicInstance.getAllOptimalPaths());
            setTerminalPathsFromLogic(gameLogicInstance.getAllUniqueTerminalPaths());
        } else {
            setOptimalPathsFromLogic([]);
            setTerminalPathsFromLogic([]);
        }
    }, [gameData, gameLogicInstance]); // Rerun when gameData (and thus gameLogicInstance) changes

    const getLocalStorageData = () => { 
        let data: Record<string, any> = {};
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key) {
                    const value = localStorage.getItem(key);
                    try { data[key] = value ? JSON.parse(value) : null; } 
                    catch (parseError) { 
                        data[key] = value; 
                        console.warn(`[DebugView] Could not parse localStorage item '${key}':`, parseError);
                    }
                }
            }
            return JSON.stringify(data, null, 2);
        } catch (e) {
            console.error(`[DebugView] Error reading localStorage:`, e);
            return `Error reading localStorage.`;
        }
    };

    useEffect(() => {
        setLocalStorageData(getLocalStorageData());
    }, []);

    const handleRefreshLocalStorageView = () => {
        setLocalStorageData(getLocalStorageData());
    };
    
    const globalMaxDepthForTreeVis = gameData?.maxDepthReached ?? -1;
    const explorationTreeForTreeVis = gameData?.explorationTree ?? [];


    if (!gameData || !explorationTreeForTreeVis || explorationTreeForTreeVis.length === 0) {
        return (
            <div className="text-gray-500 dark:text-gray-400 italic mt-4 p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 w-full max-w-4xl mx-auto">
                No game data or exploration tree available for Debug View.
                {/* ... (localStorage display can still be here) ... */}
            </div>
        );
    }

    const sortedTopLevelNodes = useMemo(() => { 
        if (!explorationTreeForTreeVis) return [];
        return [...explorationTreeForTreeVis].sort((a, b) => {
            const depthA = a.maxDepthReached ?? -1;
            const depthB = b.maxDepthReached ?? -1;
            return depthB - depthA;
        });
    }, [explorationTreeForTreeVis]);

    const clearLocalStorage = () => { 
        if (window.confirm("Are you sure you want to clear all local storage for this site? This action cannot be undone.")) {
            localStorage.clear();
            setLocalStorageData(getLocalStorageData());
            alert('Local storage has been cleared. Please refresh the page for game state to fully reset.');
        }
    };

    // Updated renderPathSteps function for better styling and wrapping
    const renderPathSteps = (paths: PathStep[][], pathType: string, baseColorClass: string, alternatingColorClass: string) => {
        if (!paths || paths.length === 0) {
            return <p className="text-sm text-gray-500 dark:text-gray-400 italic">(No {pathType} paths found by GameLogic)</p>;
        }
        return paths.map((path, pathIndex) => (
            <div 
                key={`${pathType}-path-${pathIndex}`} 
                className={`flex flex-wrap items-baseline gap-x-1 gap-y-1 mb-1 p-2 rounded ${pathIndex % 2 === 0 ? baseColorClass : alternatingColorClass} border-b border-gray-200 dark:border-gray-600 last:border-b-0`}
            >
                {path.map((step, stepIndex) => (
                    <React.Fragment key={`${pathType}-path-${pathIndex}-step-${stepIndex}`}>
                        {step.wordsFormed.map((word, wordIndex) => (
                             <LinkedWordTag
                                key={`${pathType}-path-${pathIndex}-step-${stepIndex}-word-${wordIndex}`}
                                word={word}
                                // Use a consistent styling for words within the path list, or pass specific classes
                                className="bg-white dark:bg-gray-500 text-gray-700 dark:text-gray-100 mr-1 mb-1 shadow-sm"
                            />
                        ))}
                        {stepIndex < path.length - 1 && (
                            <span className="mx-1 text-gray-500 dark:text-gray-400 font-semibold">→</span>
                        )}
                    </React.Fragment>
                ))}
            </div>
        ));
    };


    return (
        <div className="mt-6 p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 w-full max-w-4xl mx-auto">
            <h3 className="text-xl font-semibold mb-3 text-gray-800 dark:text-gray-100 flex justify-between items-center">
                <span>Debug View</span>
                <button
                    onClick={clearLocalStorage}
                    className="cursor-pointer bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded text-sm"
                >
                    Clear Local Storage
                </button>
            </h3>
            
            {/* Path Analysis Title - General Info */}
            <div className="mb-4">
                <h4 className="text-md font-semibold mb-2 text-indigo-600 dark:text-indigo-400">
                    Path Analysis (Max Depth: {globalMaxDepthForTreeVis}, Optimal: {optimalPathsFromLogic.length}, All paths: {terminalPathsFromLogic.length})
                </h4>
            </div>

            {/* All Optimal Paths (from GameLogic.getAllOptimalPaths) */}
            <div className="mb-4">
                <h5 className="text-sm font-semibold mb-1 text-green-600 dark:text-green-400">
                    All Optimal Paths (reaching Max Depth {globalMaxDepthForTreeVis}, from GameLogic - Found: {optimalPathsFromLogic.length}):
                </h5>
                <div className="p-2 rounded-md bg-gray-200 dark:bg-gray-700/50 max-h-60 overflow-y-auto">
                    {renderPathSteps(optimalPathsFromLogic, "optimal-logic", "bg-green-50 dark:bg-green-900/30", "bg-green-100 dark:bg-green-800/40")}
                </div>
            </div>

            <h4 className="text-md font-semibold mt-4 mb-2 text-gray-700 dark:text-gray-300">Tree Visualization (Nodes on a path to global max depth are highlighted green):</h4>
            <div className="max-h-96 overflow-y-auto text-sm text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 p-2 rounded-md">
                {sortedTopLevelNodes.map((node, index) => (
                    <TreeNode 
                        key={`tree-node-${index}`} 
                        node={node} 
                        level={0} 
                        globalMaxDepth={globalMaxDepthForTreeVis} 
                    />
                ))}
            </div>
            <div className="mt-4">
                {/* ... (Local Storage Display - same as before) ... */}
                <h4 className="text-md font-semibold mb-2 text-purple-600 dark:text-purple-400 flex justify-between items-center">
                    Local Storage Data:
                     <button
                        onClick={handleRefreshLocalStorageView}
                        className="cursor-pointer bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-2 rounded text-xs"
                    >
                        Refresh
                    </button>
                </h4>
                <pre className="bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 p-2 rounded-md overflow-auto max-h-48">
                    <code>{localStorageData || 'No data in localStorage or error reading.'}</code>
                </pre>
            </div>
        </div>
    );
};

export default DebugView;
