import React from 'react';

interface StatusMessagesProps {
    isInvalidMove: boolean | null;
    invalidMoveMessage: string;
    showNoMoreValidMovesMessage: boolean | null;
    showDeviatedMessage: boolean;
    showOptimalMessage: boolean;
    levelActuallyCompleted: boolean;
    onBack: () => void;
}
export const StatusMessages: React.FC<StatusMessagesProps> = ({
    isInvalidMove, invalidMoveMessage, showNoMoreValidMovesMessage, showDeviatedMessage, showOptimalMessage, levelActuallyCompleted, onBack,
}) => {
    let statusContent: React.ReactNode = null;
    if (levelActuallyCompleted) {
        statusContent = <div className="text-center text-lg font-semibold text-green-500 dark:text-green-400 mb-2 animate-pulse">
                            🎉 Longest Word Chain Found! 🎉
                        </div>
    } else if (isInvalidMove) {
        statusContent = <p className="text-red-500 dark:text-red-400 font-semibold animate-shake">{invalidMoveMessage}</p>;
    } else if (showNoMoreValidMovesMessage) {
        statusContent = (
            <div className="text-center text-lg font-semibold text-red-500 dark:text-red-400">
                No more valid moves! You can{' '}
                <a onClick={onBack} className="italic underline hover:text-red-400 dark:hover:text-red-500 cursor-pointer">
                    undo
                </a>{' '}
                or reset.
            </div>
        );
    } else if (showDeviatedMessage) {
        statusContent = (
            <p className="text-sm text-orange-600 dark:text-orange-400 font-semibold">
                Deviated from an optimal path! You can{' '}
                <a onClick={onBack} className="italic underline hover:text-orange-400 dark:hover:text-orange-500 cursor-pointer">
                    undo
                </a>.
            </p>
        );
    } else if (showOptimalMessage) {
        statusContent = (
            <p className="text-sm text-green-600 dark:text-green-400 font-semibold">
                On an optimal path! Keep going!
            </p>
        );
    }

    return (
        <div className="h-6 mb-2 text-center px-2">
            {statusContent}
        </div>
    );
};
export default StatusMessages;
