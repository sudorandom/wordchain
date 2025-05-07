// src/components/GridCell.tsx
import React from 'react';
import { CellCoordinates } from '../utils/gameHelpers';

interface GridCellProps {
  letter: string;
  row: number;
  col: number;
  onClick: (coords: CellCoordinates) => void;
  onDragStart: (coords: CellCoordinates) => void;
  onDrop: (coords: CellCoordinates) => void;
  onDragEnter: (coords: CellCoordinates) => void;
  onDragLeave: (coords: CellCoordinates) => void;
  onDragEnd: () => void;
  isDraggingSource: boolean;
  isPotentialDropTarget: boolean;
  isHighlighted: boolean;
  isSelected: boolean;
  isWiggling: boolean;
  isHintHighlighted: boolean;
}

const GridCell: React.FC<GridCellProps> = ({
    letter,
    row,
    col,
    onClick,
    onDragStart,
    onDrop,
    onDragEnter,
    onDragLeave,
    onDragEnd,
    isDraggingSource,
    isPotentialDropTarget,
    isHighlighted,
    isSelected,
    isWiggling,
    isHintHighlighted
}) => {
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    onDragStart({ row, col });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${row}-${col}`);
    e.currentTarget.style.opacity = '0.6';
    e.currentTarget.classList.add('cursor-grabbing');
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); onDrop({ row, col }); };
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); onDragEnter({ row, col }); };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); onDragLeave({ row, col }); };
  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
      e.currentTarget.style.opacity = '1';
      e.currentTarget.classList.remove('cursor-grabbing');
      onDragEnd();
  };
  const handleClick = () => { onClick({ row, col }); };

  let cellClasses = `border w-16 h-16 flex items-center justify-center
                   text-2xl font-bold select-none rounded-md shadow-sm
                   transition-all duration-200 ease-in-out relative overflow-hidden`;

  cellClasses += ' border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100';

  if (isDraggingSource) {
    cellClasses += ' bg-blue-200 dark:bg-blue-700 ring-2 ring-blue-500 dark:ring-blue-400 scale-105 z-10';
  } else if (isSelected) {
    cellClasses += ' bg-indigo-100 dark:bg-indigo-800 ring-2 ring-indigo-500 dark:ring-indigo-400 cursor-pointer';
  } else if (isPotentialDropTarget) {
    cellClasses += ' bg-green-200 dark:bg-green-700 ring-2 ring-green-500 dark:ring-green-400 cursor-pointer';
  } else {
    cellClasses += ' bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-grab';
  }

  if (isWiggling) {
      cellClasses += ' animate-wiggle';
  }

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
    >
      {isHighlighted && <div className="absolute inset-0 bg-green-300 dark:bg-green-500 animate-pulse-fade-out-short"></div>}
      {isHintHighlighted && <div className="absolute inset-0 bg-blue-300 dark:bg-blue-600 animate-pulse-fade-out-long"></div>}
      <span className="relative z-10">{letter.toUpperCase()}</span>
    </div>
  );
}

export default GridCell;
