import React, { useState, useMemo } from 'react';

interface ExplorationNodeData {
    move?: { from: number[]; to: number[] };
    maxDepthReached?: number;
    wordsFormed: string[];
    nextMoves?: ExplorationNodeData[];
}

interface ExplorationTreeViewProps {
    treeData?: ExplorationNodeData[] | null;
    optimalPathWords: string[];
}

// Helper component for rendering a single node and its children recursively
const TreeNode: React.FC<{ node: ExplorationNodeData; level: number; isOptimalPath: boolean }> = ({ node, level, isOptimalPath }) => {
    const [isOpen, setIsOpen] = useState(false); // State to toggle children visibility
    const hasChildren = node.nextMoves && node.nextMoves.length > 0;
    const indent = level * 2;

    // Sort children by maxDepthReached (descending) before rendering
    const sortedChildren = useMemo(() => {
        if (!hasChildren) return [];
        return [...node.nextMoves!].sort((a, b) => {
            const depthA = a.maxDepthReached ?? -1;
            const depthB = b.maxDepthReached ?? -1;
            return depthB - depthA;
        });
    }, [node.nextMoves, hasChildren]);

    const formatMove = (move: { from: number[]; to: number[] } | undefined): string => {
        if (!move) return 'Initial';
        return `(${move.from.join(',')})->(${move.to.join(',')})`;
    };

    return (
        <div style={{ marginLeft: `${indent}px` }} className="my-2">
            <div
                className="flex items-center cursor-pointer group"
                onClick={() => hasChildren && setIsOpen(!isOpen)}
            >
                {hasChildren && (
                    <span className="text-xs mr-2 transition-transform duration-150 group-hover:scale-110">
                        {isOpen ? '▼' : '▶'}
                    </span>
                )}
                <span className={`text-sm font-mono p-2 rounded border border-gray-300 ${isOptimalPath ? 'bg-green-100 dark:bg-green-700' : 'bg-gray-100 dark:bg-gray-700'} dark:border-gray-600`}>
                    {formatMove(node.move)} |
                    <span className="font-semibold ml-2">depth</span>={node.maxDepthReached ?? 'N/A'} |
                    <span className="font-semibold ml-2"></span>
                    <span className={`font-semibold ml-1 ${isOptimalPath ? 'text-green-800 dark:text-green-200' : 'text-gray-600 dark:text-gray-400'}`}>{node.wordsFormed.join(', ')}</span>
                </span>
            </div>
            {isOpen && hasChildren && (
                <div className="mt-2 border-l-2 border-gray-300 dark:border-gray-600 pl-4">
                    {sortedChildren.map((childNode, index) => {
                        // Determine if this child is on the optimal path (for simplicity, assume the first child is optimal)
                        const isChildOptimal = isOptimalPath && index === 0;
                        return (
                            <TreeNode
                                key={`${formatMove(node.move)}-${index}`}
                                node={childNode}
                                level={level + 1}
                                isOptimalPath={isChildOptimal}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// Main Tree View component
const ExplorationTreeView: React.FC<ExplorationTreeViewProps> = ({ treeData, optimalPathWords }) => {
    if (!treeData || treeData.length === 0) {
        return (
            <div className="text-gray-500 dark:text-gray-400 italic mt-4">
                No exploration tree data available.
            </div>
        );
    }

    // Sort the top-level nodes by maxDepthReached (descending)
    const sortedTopLevelNodes = useMemo(() => {
        return [...treeData].sort((a, b) => {
            const depthA = a.maxDepthReached ?? -1;
            const depthB = b.maxDepthReached ?? -1;
            return depthB - depthA;
        });
    }, [treeData]);

    const clearLocalStorage = () => {
        localStorage.clear();
        alert('Local storage has been cleared. Please refresh the page.'); // Provide user feedback
    };

    return (
        <div className="mt-6 p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 w-full max-w-4xl mx-auto">
            <h3 className="text-xl font-semibold mb-3 text-gray-800 dark:text-gray-100 flex justify-between items-center">
                Debug View
                <button
                    onClick={clearLocalStorage}
                    className="bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded text-sm" // Adjusted button size
                >
                    Clear Local Storage
                </button>
            </h3>
            <div className="mb-4">
                <h4 className="text-md font-semibold mb-2 text-blue-600 dark:text-blue-400">Optimal Path:</h4>
                <div className="flex flex-wrap gap-2">
                    {optimalPathWords.map((word, index) => (
                        <span
                            key={`optimal-word-${index}`}
                            className="px-2 py-1 rounded-md bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 font-medium text-sm"
                        >
                            {word}
                        </span>
                    ))}
                </div>
            </div>
            <div className="max-h-96 overflow-y-auto text-sm text-gray-700 dark:text-gray-300">
                {sortedTopLevelNodes.map((node, index) => {
                    // For simplicity, assume the first node is on the deepest path
                    const isOptimalPath = index === 0;
                    return (
                        <TreeNode key={index} node={node} level={0} isOptimalPath={isOptimalPath} />
                    );
                })}
            </div>
        </div>
    );
};

export default ExplorationTreeView;

