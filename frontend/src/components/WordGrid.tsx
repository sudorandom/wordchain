// src/components/WordGrid.tsx
import React, { useRef } from 'react';
import GridCell from './GridCell';
import { CellCoordinates, areAdjacent } from '../utils/gameHelpers';

interface WordGridProps {
  grid: string[][] | null;
  selectedCell: CellCoordinates | null;
  draggedCell: CellCoordinates | null;
  hoveredCell: CellCoordinates | null;
  animationState: { animating: boolean; from: CellCoordinates | null; to: CellCoordinates | null };
  highlightedCells: CellCoordinates[];
  hintCells: CellCoordinates[];
  wiggleCells: CellCoordinates[];
  onCellClick: (coords: CellCoordinates) => void;
  onDragStart: (coords: CellCoordinates) => void;
  onDragEnter: (coords: CellCoordinates) => void;
  onDragLeave: (coords: CellCoordinates) => void;
  onDragEnd: () => void;
  onDrop: (coords: CellCoordinates) => void;
}

const WordGrid: React.FC<WordGridProps> = ({
    grid,
    selectedCell,
    draggedCell,
    hoveredCell,
    animationState,
    highlightedCells,
    hintCells,
    wiggleCells,
    onCellClick,
    onDragStart,
    onDragEnter,
    onDragLeave,
    onDragEnd,
    onDrop
}) => {
   const gridRef = useRef<HTMLDivElement>(null);
   const cellSize = 64; // w-16
   const gapSize = 4;   // gap-1
   const totalCellSize = cellSize + gapSize;

   const getCellStyle = (r: number, c: number) => {
        if (!animationState.animating || !gridRef.current || !animationState.from || !animationState.to) return {};
       if (animationState.from.row === r && animationState.from.col === c) {
           const dx = (animationState.to.col - c) * totalCellSize;
           const dy = (animationState.to.row - r) * totalCellSize;
           return { transform: `translate(${dx}px, ${dy}px)`, transition: 'transform 0.3s ease-in-out', zIndex: 10 };
       } else if (animationState.to.row === r && animationState.to.col === c) {
           const dx = (animationState.from.col - c) * totalCellSize;
           const dy = (animationState.from.row - r) * totalCellSize;
           return { transform: `translate(${dx}px, ${dy}px)`, transition: 'transform 0.3s ease-in-out', zIndex: 10 };
       }
       return { transition: 'transform 0.3s ease-in-out' };
   };

   if (!grid) return <div className="p-2 text-center text-gray-500 dark:text-gray-400">Loading Grid...</div>;

   return (
    <div ref={gridRef} className="relative inline-grid gap-1 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg shadow-md" style={{ gridTemplateColumns: `repeat(${grid[0]?.length || 0}, minmax(0, 1fr))` }} onDragOver={(e) => e.preventDefault()}>
      {grid.map((row, r) => row.map((letter, c) => {
          const isDraggingSource = draggedCell?.row === r && draggedCell?.col === c;
          const isSelected = selectedCell?.row === r && selectedCell?.col === c && !isDraggingSource;
          const sourceCellForAdjacency = isDraggingSource ? draggedCell : selectedCell;
          const isPotentialDropTarget = sourceCellForAdjacency && !(sourceCellForAdjacency.row === r && sourceCellForAdjacency.col === c) && areAdjacent(sourceCellForAdjacency, {row: r, col: c});
          const isHighlighted = highlightedCells.some(cell => cell.row === r && cell.col === c);
          const isWiggling = wiggleCells.some(cell => cell.row === r && cell.col === c);
          const isHintHighlighted = hintCells.some(cell => cell.row === r && cell.col === c);

          return (
              <div key={`${r}-${c}`} style={getCellStyle(r, c)} className="relative">
                  <GridCell
                    letter={letter} row={r} col={c}
                    onClick={onCellClick}
                    isDraggingSource={isDraggingSource}
                    isSelected={isSelected}
                    isPotentialDropTarget={isPotentialDropTarget}
                    isHighlighted={isHighlighted}
                    isWiggling={isWiggling}
                    isHintHighlighted={isHintHighlighted}
                    onDragStart={onDragStart}
                    onDragEnter={onDragEnter}
                    onDragLeave={onDragLeave}
                    onDragEnd={onDragEnd}
                    onDrop={onDrop}
                  />
              </div>
           );
      }))}
    </div>
  );
}

export default WordGrid;
