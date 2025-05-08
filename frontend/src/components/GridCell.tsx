// src/components/GridCell.tsx
import React from 'react';
import { CellCoordinates } from '../utils/gameHelpers';

interface GridCellProps {
  letter: string;
  row: number;
  col: number;
  gridRows: number; // Total number of rows in the grid
  gridCols: number; // Total number of columns in the grid
  onClick: (coords: CellCoordinates) => void;
  onDragStart: (coords: CellCoordinates) => void;
  onDrop: (coords: CellCoordinates) => void;
  onDragEnter: (coords: CellCoordinates) => void;
  onDragLeave: (coords: CellCoordinates) => void;
  onDragEnd: () => void;
  isDraggingSource: boolean;
  isHighlighted: boolean;
  isSelected: boolean;
  isWiggling: boolean;
  isHintHighlighted: boolean;
}

const GridCell: React.FC<GridCellProps> = ({
  letter,
  row,
  col,
  gridRows,
  gridCols,
  onClick,
  onDragStart,
  onDrop,
  onDragEnter,
  onDragLeave,
  onDragEnd,
  isDraggingSource,
  isHighlighted,
  isSelected,
  isWiggling,
  isHintHighlighted
}) => {
  // Drag event handlers
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    onDragStart({ row, col });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${row}-${col}`);
    e.currentTarget.style.opacity = '0.6';
    e.currentTarget.classList.add('cursor-grabbing');
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    onDrop({ row, col });
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    onDragEnter({ row, col });
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    onDragLeave({ row, col });
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.style.opacity = '1';
    e.currentTarget.classList.remove('cursor-grabbing');
    onDragEnd();
  };

  // Click handler
  const handleClick = () => {
    onClick({ row, col });
  };

  // Base cell classes
  // Removed overflow-hidden to allow arrows to be visible outside the cell bounds
  let cellClasses = `border w-16 h-16 flex items-center justify-center
                   text-2xl font-bold select-none rounded-md shadow-sm
                   transition-all duration-200 ease-in-out relative`;

  // Theme-dependent classes
  cellClasses += ' border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100';

  // State-dependent classes
  if (isDraggingSource) {
    cellClasses += ' bg-blue-200 dark:bg-blue-700 ring-2 ring-blue-500 dark:ring-blue-400 scale-105 z-10';
  } else if (isSelected) {
    cellClasses += ' bg-indigo-100 dark:bg-indigo-800 ring-2 ring-indigo-500 dark:ring-indigo-400 cursor-pointer';
  } else {
    cellClasses += ' bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-grab';
  }

  // Wiggle animation for invalid moves
  if (isWiggling) {
    cellClasses += ' animate-wiggle';
  }

  // Arrow SVG components (strokeWidth adjusted for better visibility if smaller)
  const UpArrow = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-4 h-4 text-indigo-600 dark:text-indigo-400">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19.5v-15m0 0l-6.75 6.75M12 4.5l6.75 6.75" />
    </svg>
  );
  const DownArrow = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-4 h-4 text-indigo-600 dark:text-indigo-400">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l6.75-6.75M12 19.5l-6.75-6.75" />
    </svg>
  );
  const LeftArrow = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-4 h-4 text-indigo-600 dark:text-indigo-400">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15m0 0l6.75 6.75M4.5 12l6.75-6.75" />
    </svg>
  );
  const RightArrow = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-4 h-4 text-indigo-600 dark:text-indigo-400">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
    </svg>
  );

  return (
    <div
      draggable
      onClick={handleClick}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragEnd={handleDragEnd}
      className={cellClasses}
      role="button"
      aria-pressed={isSelected}
      aria-label={`Cell ${row}, ${col} containing letter ${letter}`}
    >
      {/* Highlight for successfully formed words */}
      {isHighlighted && <div className="absolute inset-0 bg-green-300 dark:bg-green-500 opacity-70 animate-pulse-fade-out-short pointer-events-none"></div>}
      {/* Highlight for hints */}
      {isHintHighlighted && <div className="absolute inset-0 bg-blue-300 dark:bg-blue-600 opacity-70 animate-pulse-fade-out-long pointer-events-none"></div>}

      {/* Arrows for selected cell, pointing to valid adjacent cells */}
      {isSelected && !isDraggingSource && (
        <>
          {/* Up Arrow: only if not in the first row */}
          {row > 0 && (
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 p-1 rounded-full bg-indigo-100 dark:bg-indigo-800 shadow-md z-20">
              <UpArrow />
            </div>
          )}
          {/* Down Arrow: only if not in the last row */}
          {row < gridRows - 1 && (
            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 p-1 rounded-full bg-indigo-100 dark:bg-indigo-800 shadow-md z-20">
              <DownArrow />
            </div>
          )}
          {/* Left Arrow: only if not in the first column */}
          {col > 0 && (
            <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-1/2 p-1 rounded-full bg-indigo-100 dark:bg-indigo-800 shadow-md z-20">
              <LeftArrow />
            </div>
          )}
          {/* Right Arrow: only if not in the last column */}
          {col < gridCols - 1 && (
            <div className="absolute right-0 top-1/2 transform -translate-y-1/2 translate-x-1/2 p-1 rounded-full bg-indigo-100 dark:bg-indigo-800 shadow-md z-20">
              <RightArrow />
            </div>
          )}
        </>
      )}

      {/* Letter displayed in the cell */}
      <span className="relative z-10">{letter.toUpperCase()}</span>
    </div>
  );
}

export default GridCell;
