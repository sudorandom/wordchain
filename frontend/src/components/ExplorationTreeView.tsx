// src/components/ExplorationTreeView.tsx
import React, { useState } from 'react';
import { ExplorationNodeData } from '../utils/gameHelpers'; // Assuming types are here

interface ExplorationTreeNodeProps {
  node: ExplorationNodeData;
  level?: number;
}

const ExplorationTreeNode: React.FC<ExplorationTreeNodeProps> = ({ node, level = 0 }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const handleToggle = () => setIsCollapsed(!isCollapsed);
    const hasChildren = node.nextMoves && node.nextMoves.length > 0;

    return (
        <div style={{ marginLeft: `${level * 5}px` }} className="my-1">
            <div className={`flex items-center p-1 rounded ${hasChildren ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700' : ''} ${level === 0 ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700' : ''}`} onClick={hasChildren ? handleToggle : undefined}>
                {hasChildren && <span className="text-xs mr-1 w-4 text-center text-gray-600 dark:text-gray-400">{isCollapsed ? '▶' : '▼'}</span>}
                {!hasChildren && <span className="w-4 mr-1"></span>}
                <span className="text-xs font-mono mr-2 text-purple-700 dark:text-purple-400">{node.move ? `[${node.move.from.join(',')}]↔[${node.move.to.join(',')}]` : 'Start'}</span>
                <span className="text-xs font-semibold mr-2 text-green-700 dark:text-green-400">[{node.wordsFormed?.join(', ').toUpperCase() || ''}]</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">(Depth Left: {node.maxDepthReached})</span>
            </div>
            {!isCollapsed && hasChildren && (
                <div className="border-l-2 border-gray-300 dark:border-gray-600 pl-2 ml-2">
                    {node.nextMoves?.map((childNode, index) => <ExplorationTreeNode key={`${childNode.move?.from?.join('-')}-${childNode.move?.to?.join('-')}-${index}-${level}-${Math.random()}`} node={childNode} level={level + 1} />)}
                </div>
            )}
        </div>
    );
};

interface ExplorationTreeViewProps {
  treeData?: ExplorationNodeData[];
}

const ExplorationTreeView: React.FC<ExplorationTreeViewProps> = ({ treeData }) => {
    const [isVisible, setIsVisible] = useState(false);
    if (!treeData) return null;

    return (
        <div className="w-full max-w-2xl mt-6 border rounded p-3 bg-white dark:bg-gray-800 shadow dark:border-gray-700">
             <button onClick={() => setIsVisible(!isVisible)} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold mb-2 w-full text-left">
                {isVisible ? 'Hide' : 'Show'} Full Move Tree {isVisible ? '▼' : '▶'}
            </button>
             {isVisible && <div className="mt-2 max-h-80 overflow-y-auto border-t pt-2 dark:border-gray-700">{treeData.map((rootNode, index) => <ExplorationTreeNode key={`${rootNode.move?.from?.join('-')}-${rootNode.move?.to?.join('-')}-${index}-root`} node={rootNode} level={0} />)}</div>}
        </div>
    );
};

export default ExplorationTreeView;
