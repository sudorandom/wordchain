# Word Chain

A web-based word game where players swap adjacent letters on a grid to form words and follow an optimal path to achieve the maximum game depth.

## Description

This game presents players with a grid of letters. By swapping adjacent letters (horizontally or vertically), players aim to form valid words of a minimum length (typically 4 letters) in the affected rows or columns. The game includes pre-calculated optimal move sequences (levels), and the player's goal is to follow this sequence to find all the words along the longest possible chain and reach the maximum depth. The game provides visual feedback for valid moves, word formation, and deviation from the optimal path.

## Features

* **Interactive Grid:** Drag-and-drop interface for swapping letters.
* **Word Validation:** Checks if swaps create valid words based on level data.
* **Optimal Path Guidance:** Tracks player progress against a pre-calculated best path.
* **Deviation Detection:** Indicates when the player makes a valid move that isn't part of the optimal path.
* **Dynamic Level Loading:** Loads different game levels based on a URL query parameter (`?level=N`).
* **Visual Feedback:** Animations for swaps and highlighting for newly formed words.
* **Static Site Deployment:** Configured for easy deployment to static hosting platforms like GitHub Pages.

## Tech Stack

* **Frontend:** React 19 (using Vite)
* **Styling:** Tailwind CSS 4
* **Language:** TypeScript
* **Build Tool:** Vite
* **Linting:** ESLint

## Getting Started

### Prerequisites

* Node.js (v20 or later recommended)
* A Node package manager (npm, yarn, or pnpm)

### Installation & Running Locally

1.  **Clone the repository:**
    ```bash
    git clone git@github.com:sudorandom/wordchain.git
    cd wordchain
    ```
2.  **Install dependencies:**
    ```bash
    # Using npm
    npm install
    ```
3.  **Run the development server:**
    ```bash
    npm run dev
    ```
    This will start the Vite development server, typically available at `http://localhost:5173` (or another port if 5173 is busy). The app will automatically reload when you make changes to the code.

## Building for Production

To create an optimized static build of the application:

```bash
npm run build
```
