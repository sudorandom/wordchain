package main

import (
	"bytes"
	"fmt"
	"maps"
	"sort"
	"strings"
)

// --- Core Data Structures ---
type Grid [][]rune
type JsonGrid [][]string
type Coordinates struct {
	Row int `json:"-"`
	Col int `json:"-"`
}
type Move struct {
	Cell1 Coordinates `json:"-"`
	Cell2 Coordinates `json:"-"`
}
type Dictionary map[string]struct{}
type FoundWordsSet map[string]struct{}
type GameState struct {
	Grid       Grid
	FoundWords FoundWordsSet
}
type ExplorationCacheEntry struct {
	Children []ExplorationNode
	MaxDepth int
}

// --- Structs for Nested JSON Output ---
type MoveOutput struct {
	From [2]int `json:"from"`
	To   [2]int `json:"to"`
}
type ExplorationNode struct {
	Move            *MoveOutput       `json:"move"`
	WordsFormed     []string          `json:"wordsFormed"`
	MaxDepthReached int               `json:"maxDepthReached"`
	NextMoves       []ExplorationNode `json:"nextMoves,omitempty"`
}
type FullExplorationOutput struct {
	InitialGrid      JsonGrid          `json:"initialGrid"`
	WordLength       int               `json:"wordLength"`
	RequiredMinTurns int               `json:"requiredMinTurns"`
	RequiredMaxTurns int               `json:"requiredMaxTurns"`
	MaxDepthReached  int               `json:"maxDepthReached"`
	ExplorationTree  []ExplorationNode `json:"explorationTree"`
}

// WorkerResult is used to send processed grid data from workers to the main goroutine.
type WorkerResult struct {
	Grid            Grid
	ExplorationTree []ExplorationNode
	MaxDepth        int
}

// --- Helper Functions ---
func (m Move) String() string {
	return fmt.Sprintf("Swap (%d, %d) <-> (%d, %d)", m.Cell1.Row, m.Cell1.Col, m.Cell2.Row, m.Cell2.Col)
}

func gridToString(grid Grid) string {
	if grid == nil {
		return ""
	}
	var buf bytes.Buffer
	for _, row := range grid {
		buf.WriteString(string(row))
		buf.WriteRune('|')
	}
	return buf.String()
}

func convertGridToJsonGrid(grid Grid) JsonGrid {
	if grid == nil {
		return nil
	}
	jsonGrid := make(JsonGrid, len(grid))
	for r, row := range grid {
		jsonGrid[r] = make([]string, len(row))
		for c, cell := range row {
			jsonGrid[r][c] = string(cell)
		}
	}
	return jsonGrid
}

func copyFoundWords(foundWords FoundWordsSet) FoundWordsSet {
	newSet := make(FoundWordsSet, len(foundWords))
	maps.Copy(newSet, foundWords)
	return newSet
}

func generateGrid(rows, cols int) Grid {
	if rows <= 0 || cols <= 0 {
		return nil
	}
	grid := make(Grid, rows)
	for r := range grid {
		grid[r] = make([]rune, cols)
		for c := range grid[r] {
			grid[r][c] = getRandomLetterByFrequency()
		}
	}
	return grid
}

func printGrid(grid Grid) {
	if grid == nil {
		fmt.Println("Grid is empty or nil.")
		return
	}
	fmt.Println("--- Grid ---")
	for _, row := range grid {
		for _, cell := range row {
			fmt.Printf("%c ", cell)
		}
		fmt.Println()
	}
	fmt.Println("------------")
}

func copyGrid(grid Grid) Grid {
	if grid == nil {
		return nil
	}
	rows := len(grid)
	if rows == 0 {
		return Grid{}
	}
	if len(grid[0]) == 0 {
		newGrid := make(Grid, rows)
		for r := range newGrid {
			newGrid[r] = make([]rune, 0)
		}
		return newGrid
	}
	cols := len(grid[0])
	newGrid := make(Grid, rows)
	for r := range grid {
		newGrid[r] = make([]rune, cols)
		copy(newGrid[r], grid[r])
	}
	return newGrid
}

func applyMove(grid Grid, move Move) Grid {
	newGrid := copyGrid(grid)
	if newGrid == nil {
		return nil
	}
	c1, c2 := move.Cell1, move.Cell2
	rows := len(newGrid)
	if rows == 0 || len(newGrid[0]) == 0 {
		return newGrid
	}
	cols := len(newGrid[0])
	if !(c1.Row >= 0 && c1.Row < rows && c1.Col >= 0 && c1.Col < cols &&
		c2.Row >= 0 && c2.Row < rows && c2.Col >= 0 && c2.Col < cols) {
		return nil
	}
	newGrid[c1.Row][c1.Col], newGrid[c2.Row][c2.Col] = newGrid[c2.Row][c2.Col], newGrid[c1.Row][c1.Col]
	return newGrid
}

func findNewWords(newGrid Grid, move Move, dict Dictionary, foundWordsBeforeMove FoundWordsSet) []string {
	if newGrid == nil {
		return nil
	}
	rows := len(newGrid)
	if rows == 0 || len(newGrid[0]) == 0 {
		return []string{}
	}
	cols := len(newGrid[0])
	c1, c2 := move.Cell1, move.Cell2
	newlyFound := make(map[string]struct{})
	isNewWord := func(word string) bool {
		if len(word) != cli.WordLength {
			return false
		}
		_, inDict := dict[word]
		_, alreadyFound := foundWordsBeforeMove[word]
		return inDict && !alreadyFound
	}
	rowsToCheck := map[int]struct{}{c1.Row: {}}
	if c1.Row != c2.Row {
		rowsToCheck[c2.Row] = struct{}{}
	}
	for r := range rowsToCheck {
		if r < 0 || r >= rows || r >= len(newGrid) {
			continue
		}
		rowStr := string(newGrid[r])
		if cols >= cli.WordLength {
			for start := 0; start <= cols-cli.WordLength; start++ {
				sub := rowStr[start : start+cli.WordLength]
				if isNewWord(sub) {
					newlyFound[sub] = struct{}{}
				}
			}
		}
	}
	colsToCheck := map[int]struct{}{c1.Col: {}}
	if c1.Col != c2.Col {
		colsToCheck[c2.Col] = struct{}{}
	}
	for c := range colsToCheck {
		if c < 0 || c >= cols {
			continue
		}
		var colBuilder strings.Builder
		colBuilder.Grow(rows)
		validCol := true
		for rIdx := 0; rIdx < rows; rIdx++ {
			if rIdx < len(newGrid) && c < len(newGrid[rIdx]) {
				colBuilder.WriteRune(newGrid[rIdx][c])
			} else {
				validCol = false
				break
			}
		}
		if !validCol {
			continue
		}
		colStr := colBuilder.String()
		if rows >= cli.WordLength {
			for start := 0; start <= rows-cli.WordLength; start++ {
				sub := colStr[start : start+cli.WordLength]
				if isNewWord(sub) {
					newlyFound[sub] = struct{}{}
				}
			}
		}
	}
	result := make([]string, 0, len(newlyFound))
	for word := range newlyFound {
		result = append(result, word)
	}
	sort.Strings(result)
	return result
}

// --- Recursive Exploration Function ---
func explorePaths(currentState GameState, wordMap Dictionary, pathVisited map[string]struct{}, currentDepth int, globalExplorationCache map[string]ExplorationCacheEntry) ([]ExplorationNode, int) {
	var children []ExplorationNode
	maxDepthFromCurrentState := 0
	if currentDepth >= cli.RequiredMaxTurns {
		return nil, 0
	}
	currentGridStr := gridToString(currentState.Grid)
	if _, visited := pathVisited[currentGridStr]; visited {
		return nil, 0
	}
	if cachedEntry, found := globalExplorationCache[currentGridStr]; found {
		return cachedEntry.Children, cachedEntry.MaxDepth
	}
	pathVisited[currentGridStr] = struct{}{}
	defer delete(pathVisited, currentGridStr)
	rows := len(currentState.Grid)
	if rows == 0 || len(currentState.Grid[0]) == 0 {
		return nil, 0
	}
	cols := len(currentState.Grid[0])
	for r := range rows {
		for c := range cols {
			currentCell := Coordinates{Row: r, Col: c}
			neighbors := []Coordinates{}
			if c+1 < cols {
				neighbors = append(neighbors, Coordinates{Row: r, Col: c + 1})
			}
			if r+1 < rows {
				neighbors = append(neighbors, Coordinates{Row: r + 1, Col: c})
			}
			for _, neighbor := range neighbors {
				potentialMoveInternal := Move{Cell1: currentCell, Cell2: neighbor}
				nextGrid := applyMove(currentState.Grid, potentialMoveInternal)
				if nextGrid == nil {
					continue
				}
				newlyFoundWords := findNewWords(nextGrid, potentialMoveInternal, wordMap, currentState.FoundWords)
				if len(newlyFoundWords) > 0 {
					moveOut := MoveOutput{From: [2]int{currentCell.Row, currentCell.Col}, To: [2]int{neighbor.Row, neighbor.Col}}
					newFoundSet := copyFoundWords(currentState.FoundWords)
					for _, word := range newlyFoundWords {
						newFoundSet[word] = struct{}{}
					}
					nextState := GameState{Grid: nextGrid, FoundWords: newFoundSet}
					nextPathVisited := make(map[string]struct{}, len(pathVisited)+1)
					maps.Copy(nextPathVisited, pathVisited)
					subMoves, depthFromSubMove := explorePaths(nextState, wordMap, nextPathVisited, currentDepth+1, globalExplorationCache)
					currentBranchTotalDepth := 1 + depthFromSubMove
					if currentBranchTotalDepth > maxDepthFromCurrentState {
						maxDepthFromCurrentState = currentBranchTotalDepth
					}
					node := ExplorationNode{Move: &moveOut, WordsFormed: newlyFoundWords, MaxDepthReached: depthFromSubMove, NextMoves: subMoves}
					children = append(children, node)
				}
			}
		}
	}
	sort.Slice(children, func(i, j int) bool {
		if children[i].Move == nil {
			return false
		}
		if children[j].Move == nil {
			return true
		}
		m1, m2 := children[i].Move, children[j].Move
		if m1.From[0] != m2.From[0] {
			return m1.From[0] < m2.From[0]
		}
		if m1.From[1] != m2.From[1] {
			return m1.From[1] < m2.From[1]
		}
		if m1.To[0] != m2.To[0] {
			return m1.To[0] < m2.To[0]
		}
		return m1.To[1] < m2.To[1]
	})
	globalExplorationCache[currentGridStr] = ExplorationCacheEntry{Children: children, MaxDepth: maxDepthFromCurrentState}
	return children, maxDepthFromCurrentState
}
