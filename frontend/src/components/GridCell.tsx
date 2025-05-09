// src/components/GridCell.tsx
import React from 'react';

// Mocking these types for the example to be self-contained
interface CellCoordinates {
  row: number;
  col: number;
}

interface AnimationState {
  animating: boolean;
  from: CellCoordinates | null;
  to: CellCoordinates | null;
}

interface GridCellProps {
  letter: string;
  coords: CellCoordinates;
  gridRows: number;
  gridCols: number;
  onClick: (coords: CellCoordinates) => void;
  onDragStart: (coords: CellCoordinates) => void;
  onDrop: (coords: CellCoordinates) => void;
  onDragEnter: (coords: CellCoordinates) => void;
  onDragLeave: (coords: CellCoordinates) => void;
  onDragEnd: () => void;
  isDragged: boolean;
  isHighlighted: boolean;
  isSelected: boolean;
  isWiggling: boolean;
  isHint: boolean;
  animationState: AnimationState;
  isDisabled?: boolean;
}

const CELL_SIZE_REM = 4; 
const GAP_REM = 0.25;    
const STEP_REM = CELL_SIZE_REM + GAP_REM; 
const ANIMATION_DURATION_MS = 300;

const GridCell: React.FC<GridCellProps> = ({
  letter,
  coords,
  gridRows,
  gridCols,
  onClick,
  onDragStart,
  onDrop,
  onDragEnter,
  onDragLeave,
  onDragEnd,
  isDragged,
  isHighlighted,
  isSelected,
  isWiggling,
  isHint,
  animationState,
  isDisabled = false,
}) => {
  const { row, col } = coords;

  const [currentTransform, setCurrentTransform] = React.useState('translate(0rem, 0rem)');
  const [currentZIndex, setCurrentZIndex] = React.useState(1);

  // Ref to store the previous value of animationState.animating
  const prevAnimationAnimating = React.useRef<boolean>(animationState.animating);

  React.useEffect(() => {
    // Update the ref after each render 
    prevAnimationAnimating.current = animationState.animating;
  });

  // Effect to update cell's transform and z-index for swap animations
  React.useEffect(() => {
    let newTransform = 'translate(0rem, 0rem)';
    let newZIndex = 1;

    if (animationState.animating && animationState.from && animationState.to) {
      const isSourceCell = coords.row === animationState.from.row && coords.col === animationState.from.col;
      const isDestinationCell = coords.row === animationState.to.row && coords.col === animationState.to.col;

      if (isSourceCell) {
        const translateX = (animationState.to.col - animationState.from.col) * STEP_REM;
        const translateY = (animationState.to.row - animationState.from.row) * STEP_REM;
        newTransform = `translate(${translateX}rem, ${translateY}rem)`;
        newZIndex = 20; 
      } else if (isDestinationCell) {
        const translateX = (animationState.from.col - animationState.to.col) * STEP_REM;
        const translateY = (animationState.from.row - animationState.to.row) * STEP_REM;
        newTransform = `translate(${translateX}rem, ${translateY}rem)`;
        newZIndex = 20; 
      }
    }

    // Only update state if the values have actually changed to prevent unnecessary re-renders
    if (currentTransform !== newTransform) {
      setCurrentTransform(newTransform);
    }
    if (currentZIndex !== newZIndex) {
      setCurrentZIndex(newZIndex);
    }
  }, [
    animationState.animating,
    // Using JSON.stringify for objects in dependency array is generally okay for simple, flat objects.
    // For more complex scenarios, consider a deep comparison utility or more granular dependencies.
    JSON.stringify(animationState.from), 
    JSON.stringify(animationState.to),   
    coords.row, 
    coords.col,
    currentTransform, 
    currentZIndex   
  ]);

  const isSwapAnimationGloballyActive = animationState.animating === true;
  // Interactions are disabled if the cell is explicitly disabled, or any animation (swap/wiggle) is active.
  const interactionsDisabled = isDisabled || isSwapAnimationGloballyActive || isWiggling;

  // Event Handlers
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (interactionsDisabled) { e.preventDefault(); return; }
    onDragStart(coords);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${row}-${col}`);
    if (e.currentTarget) { // Check if currentTarget is not null
        e.currentTarget.style.opacity = '0.6'; 
        e.currentTarget.classList.add('cursor-grabbing');
    }
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (interactionsDisabled) return;
    e.preventDefault(); 
    e.dataTransfer.dropEffect = 'move';
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (interactionsDisabled) return;
    e.preventDefault(); onDrop(coords);
  };
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (interactionsDisabled) return;
    e.preventDefault(); onDragEnter(coords);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (interactionsDisabled) return;
    e.preventDefault(); onDragLeave(coords);
  };
  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget) { // Check if currentTarget is not null
        e.currentTarget.style.opacity = '1'; 
        e.currentTarget.classList.remove('cursor-grabbing');
    }
    onDragEnd();
  };
  const handleClick = () => {
    if (interactionsDisabled) return;
    onClick(coords);
  };
  
  // --- Dynamic Styles ---
  const dynamicStyles: React.CSSProperties = {
    zIndex: currentZIndex, // Apply z-index for elevation during swap
  };

  if (isWiggling) {
    
  } else {
    // Not wiggling: JavaScript handles transform for swap animations.
    dynamicStyles.transform = currentTransform; // Apply the JS-calculated transform.

    if (animationState.animating) {
      // If a swap animation is actively running, apply a smooth transition for transform.
      dynamicStyles.transition = `transform ${ANIMATION_DURATION_MS}ms ease-in-out`;
    } else if (prevAnimationAnimating.current === true && !animationState.animating) {
      // If a swap animation JUST finished, set transform transition to 'none' (or '0s') to make the cell "snap".
      dynamicStyles.transition = 'transform 0s'; 
    } else {
      // Idle state (not animating, and wasn't just animating for swap).
      // No specific transform transition needed from JS. CSS transitions for other properties (like background) will apply if defined.
      dynamicStyles.transition = 'transform 0s'; // Or 'none' if preferred for idle non-wiggling state
    }
  }

  // --- Cell Classes ---
  // Base classes applied to all cells
  let cellClasses = `border w-16 h-16 flex items-center justify-center
                   text-2xl font-bold select-none rounded-md shadow-sm
                   relative transition-colors duration-150 ease-out`; 
  
  // Base background and text colors (interactive state)
  const baseInteractiveBg = 'bg-white dark:bg-gray-700';
  const hoverInteractiveBg = 'hover:bg-gray-50 dark:hover:bg-gray-600';
  
  // Apply base styling. Specific states below will override parts of this.
  cellClasses += ` ${baseInteractiveBg} border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100`;

  if (isDragged) {
    // Style for the cell being actively dragged
    // Remove potentially conflicting background classes before adding new ones
    cellClasses = cellClasses.replace(/bg-\w+-\d+/g, '').replace(/dark:bg-\w+-\d+/g, '');
    cellClasses += ' bg-blue-200 dark:bg-blue-700 ring-2 ring-blue-500 dark:ring-blue-400 scale-105';
  } else if (isSelected) {
    // Style for a selected cell (not being dragged)
    cellClasses = cellClasses.replace(/bg-\w+-\d+/g, '').replace(/dark:bg-\w+-\d+/g, '');
    cellClasses += ' bg-indigo-100 dark:bg-indigo-800 ring-2 ring-indigo-500 dark:ring-indigo-400 cursor-pointer';
  } else if (isDisabled) { 
    // Style for a cell that is explicitly disabled by game logic (e.g., game over)
    cellClasses = cellClasses.replace(/bg-\w+-\d+/g, '').replace(/dark:bg-\w+-\d+/g, '');
    cellClasses += ' bg-gray-100 dark:bg-gray-800 opacity-70 cursor-not-allowed';
  } else if (isSwapAnimationGloballyActive || isWiggling) { 
     // Style for a cell during any animation (swap or wiggle)
     // It uses the base interactive background but with 'cursor-default' and no hover effects.
     // NO opacity change here to prevent fading during animation.
     // If it's wiggling, the specific wiggling background will be applied in the next block.
     // If it's just a swap animation, it keeps the baseInteractiveBg.
     cellClasses += ` cursor-default`; 
  } else { 
    // Style for a normal, interactive, resting cell
    cellClasses += ` ${hoverInteractiveBg} cursor-grab`;
  }

  if (isWiggling) {
    // If wiggling, add the animation class and the specific wiggling background color.
    // This ensures the red background for wiggling takes precedence.
    cellClasses = cellClasses.replace(/bg-\w+-\d+/g, '').replace(/dark:bg-\w+-\d+/g, ''); // Remove other BGs
    cellClasses += ' animate-wiggle bg-red-200 dark:bg-red-700'; 
    // Ensure cursor-default if wiggling, as it's a non-interactive animation state
    if (!cellClasses.includes('cursor-default')) {
        cellClasses += ' cursor-default';
    }
  }

  // SVG Icons for selection arrows
  const UpArrow = () => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-4 h-4 text-indigo-600 dark:text-indigo-400"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19.5v-15m0 0l-6.75 6.75M12 4.5l6.75 6.75" /></svg>);
  const DownArrow = () => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-4 h-4 text-indigo-600 dark:text-indigo-400"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l6.75-6.75M12 19.5l-6.75-6.75" /></svg>);
  const LeftArrow = () => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-4 h-4 text-indigo-600 dark:text-indigo-400"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15m0 0l6.75 6.75M4.5 12l6.75-6.75" /></svg>);
  const RightArrow = () => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-4 h-4 text-indigo-600 dark:text-indigo-400"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" /></svg>);

  return (
    <div
      // draggable={!interactionsDisabled}
      onClick={handleClick}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragEnd={handleDragEnd}
      className={cellClasses} // Apply the constructed class string
      style={dynamicStyles}   // Apply the JS-controlled inline styles
      role="button"
      tabIndex={interactionsDisabled ? -1 : 0} // Make focusable if interactive
      aria-pressed={isSelected}
      // aria-disabled={interactionsDisabled} // Accessibility: indicates if the element is disabled
      aria-label={`Cell ${row}, ${col} containing letter ${letter}`} // Accessibility: label for screen readers
    >
      {/* Highlight overlays for found words or hints */}
      {isHighlighted && <div className="absolute inset-0 bg-green-300 dark:bg-green-500 opacity-70 animate-pulse-fade-out-short pointer-events-none"></div>}
      {isHint && <div className="absolute inset-0 bg-blue-300 dark:bg-blue-600 opacity-70 animate-pulse-fade-out-long pointer-events-none"></div>}

      {/* Selection arrows: shown if cell is selected, not dragged, and not disabled */}
      {isSelected && !isDragged && !interactionsDisabled && (
        <>
          {row > 0 && (<div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 p-1 rounded-full bg-indigo-100 dark:bg-indigo-800 shadow-md z-30"><UpArrow /></div>)}
          {row < gridRows - 1 && (<div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 p-1 rounded-full bg-indigo-100 dark:bg-indigo-800 shadow-md z-30"><DownArrow /></div>)}
          {col > 0 && (<div className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-1/2 p-1 rounded-full bg-indigo-100 dark:bg-indigo-800 shadow-md z-30"><LeftArrow /></div>)}
          {col < gridCols - 1 && (<div className="absolute right-0 top-1/2 transform -translate-y-1/2 translate-x-1/2 p-1 rounded-full bg-indigo-100 dark:bg-indigo-800 shadow-md z-30"><RightArrow /></div>)}
        </>
      )}
      {/* Letter display: relative z-index to appear above highlights */}
      <span className="relative z-10">{letter.toUpperCase()}</span>
    </div>
  );
}
export default GridCell;
