package main

import (
	"bytes"         // Needed for grid string representation
	"encoding/json" // Needed for JSON output
	"fmt"
	"math/rand/v2" // Using v2 rand
	"os"           // Needed for file writing
	"path/filepath"
	"sort" // To print found words consistently
	"strings"
	"time" // For status updates and timeout

	_ "embed" // Needed for //go:embed
	"maps"
)

//go:embed data/dictionary.txt
var wordlistString string // Embed the word list file

//go:embed data/top-1000.txt
var simpleWordlistString string // Embed the word list file

// --- Game Configuration ---
const gridRows = 2 // Grid dimensions
const gridCols = 4
const minWordLength = 4 // Minimum length of a word to be considered valid
const requiredMinTurns = 4
const requiredMaxTurns = 10 // Maximum depth to explore

// --- Core Data Structures ---

// Grid represents the game board as a 2D slice of runes.
type Grid [][]rune

// JsonGrid is used for converting the Grid to a JSON-friendly format (slice of string slices).
type JsonGrid [][]string

// Coordinates represents the (Row, Col) of a cell in the grid.
type Coordinates struct {
	Row int `json:"-"` // Excluded from JSON output as it's internal logic
	Col int `json:"-"` // Excluded from JSON output
}

// Move represents a swap between two adjacent cells.
type Move struct {
	Cell1 Coordinates `json:"-"` // The first cell in the swap
	Cell2 Coordinates `json:"-"` // The second cell in the swap
}

// Dictionary stores the valid words from the wordlist for quick lookup.
type Dictionary map[string]struct{}

// FoundWordsSet keeps track of words already found in a particular game state.
type FoundWordsSet map[string]struct{}

// GameState represents the current state of the game, including the grid and found words.
type GameState struct {
	Grid       Grid
	FoundWords FoundWordsSet
}

// --- Structs for Nested JSON Output ---

// MoveOutput defines the structure for a single move in the JSON output.
type MoveOutput struct {
	From [2]int `json:"from"` // [Row, Col] of the first cell
	To   [2]int `json:"to"`   // [Row, Col] of the second cell
}

// ExplorationNode represents a node in the exploration tree for JSON output.
type ExplorationNode struct {
	Move            *MoveOutput       `json:"move"`                // Pointer to distinguish root level (nil) from actual moves
	WordsFormed     []string          `json:"wordsFormed"`         // Words newly formed by this move
	MaxDepthReached int               `json:"maxDepthReached"`     // Max depth reachable FROM THE *NEXT* MOVE (i.e., depth returned by recursive call)
	NextMoves       []ExplorationNode `json:"nextMoves,omitempty"` // Recursive structure for subsequent moves, omitted if empty
}

// FullExplorationOutput defines the top-level structure for the JSON file.
type FullExplorationOutput struct {
	InitialGrid      JsonGrid          `json:"initialGrid"`      // The starting grid configuration
	MinWordLength    int               `json:"minWordLength"`    // Configuration: Minimum valid word length
	RequiredMinTurns int               `json:"requiredMinTurns"` // Configuration: Target minimum tree depth
	RequiredMaxTurns int               `json:"requiredMaxTurns"` // Configuration: Maximum exploration depth
	MaxDepthReached  int               `json:"maxDepthReached"`  // The overall maximum depth achieved for the initialGrid
	ExplorationTree  []ExplorationNode `json:"explorationTree"`  // The root level of possible first moves
}

// --- Helper Functions ---

// String provides a human-readable representation of a Move (for console debugging).
func (m Move) String() string {
	return fmt.Sprintf("Swap (%d, %d) <-> (%d, %d)", m.Cell1.Row, m.Cell1.Col, m.Cell2.Row, m.Cell2.Col)
}

// gridToString converts a grid into a unique string representation.
// This is used as a key in the pathVisited map to detect cycles.
func gridToString(grid Grid) string {
	if grid == nil {
		return ""
	}
	var buf bytes.Buffer
	for _, row := range grid {
		buf.WriteString(string(row))
		buf.WriteRune('|') // Use a separator unlikely to be in the grid letters
	}
	return buf.String()
}

// convertGridToJsonGrid converts the internal Grid (rune slice) to JsonGrid (string slice)
// suitable for JSON marshalling.
func convertGridToJsonGrid(grid Grid) JsonGrid {
	if grid == nil {
		return nil
	}
	jsonGrid := make(JsonGrid, len(grid))
	for r, row := range grid {
		jsonGrid[r] = make([]string, len(row))
		for c, cell := range row {
			jsonGrid[r][c] = string(cell) // Convert each rune to a string
		}
	}
	return jsonGrid
}

// copyFoundWords creates a deep copy of the found words set.
// This is necessary because maps are reference types, and we need independent sets for different game states.
func copyFoundWords(foundWords FoundWordsSet) FoundWordsSet {
	newSet := make(FoundWordsSet, len(foundWords))
	maps.Copy(newSet, foundWords) // Use maps.Copy for efficiency
	return newSet
}

// generateGrid creates a grid of the specified size filled with random lowercase letters ('a' to 'z').
func generateGrid(rows, cols int) Grid {
	if rows <= 0 || cols <= 0 {
		fmt.Println("Warning: generateGrid called with non-positive dimensions.")
		return nil
	}
	grid := make(Grid, rows)
	for r := range grid {
		grid[r] = make([]rune, cols)
		for c := range grid[r] {
			grid[r][c] = rune(rand.IntN(26) + 'a') // Generate random lowercase letter
		}
	}
	return grid
}

// printGrid displays the grid in a readable format to the console.
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

// copyGrid creates a deep copy of the grid.
// Necessary because slices are reference types, and applying a move should not modify the original grid.
func copyGrid(grid Grid) Grid {
	if grid == nil {
		return nil
	}
	rows := len(grid)
	if rows == 0 {
		return Grid{} // Return an empty grid, not nil
	}
	// Check if grid[0] exists before accessing its length
	if len(grid[0]) == 0 {
		// Handle case of rows with zero columns
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
		copy(newGrid[r], grid[r]) // Efficiently copy row contents
	}
	return newGrid
}

// applyMove creates a *new* grid with the specified move (swap) applied.
// Returns nil if the move is invalid (e.g., out of bounds).
func applyMove(grid Grid, move Move) Grid {
	newGrid := copyGrid(grid)
	if newGrid == nil {
		return nil // Propagate nil if copy failed
	}
	c1 := move.Cell1
	c2 := move.Cell2

	// Bounds check for both coordinates
	rows := len(newGrid)
	if rows == 0 {
		return newGrid // Return the empty grid copy
	}
	// Check if newGrid[0] exists before accessing its length
	if len(newGrid[0]) == 0 {
		return newGrid // Return the grid copy if columns are empty
	}
	cols := len(newGrid[0])

	if !(c1.Row >= 0 && c1.Row < rows && c1.Col >= 0 && c1.Col < cols &&
		c2.Row >= 0 && c2.Row < rows && c2.Col >= 0 && c2.Col < cols) {
		fmt.Printf("Warning: Attempted swap with out-of-bounds coordinates: %v\n", move)
		return nil // Indicate invalid move by returning nil
	}

	// Perform the swap
	newGrid[c1.Row][c1.Col], newGrid[c2.Row][c2.Col] = newGrid[c2.Row][c2.Col], newGrid[c1.Row][c1.Col]
	return newGrid
}

// findNewWords identifies the specific *new* words formed by applying a move.
// It checks only the rows and columns affected by the swap for efficiency.
// Returns a sorted slice of newly found words.
func findNewWords(newGrid Grid, move Move, dict Dictionary, foundWordsBeforeMove FoundWordsSet) []string {
	if newGrid == nil {
		return nil // Cannot find words in a nil grid
	}
	rows := len(newGrid)
	if rows == 0 {
		return []string{} // No words in an empty grid
	}
	// Check if newGrid[0] exists before accessing its length
	if len(newGrid[0]) == 0 {
		return []string{} // No words if columns are empty
	}
	cols := len(newGrid[0])

	c1 := move.Cell1
	c2 := move.Cell2
	newlyFound := make(map[string]struct{}) // Use a map to automatically handle duplicates

	// Helper function to check if a potential word is valid (in dictionary, long enough) and not already found.
	isNewWord := func(word string) bool {
		if len(word) < minWordLength {
			return false
		}
		_, inDict := dict[word]
		_, alreadyFound := foundWordsBeforeMove[word]
		return inDict && !alreadyFound
	}

	// --- Check Rows affected by the swap ---
	// Use a map to avoid checking the same row twice if the swap is vertical
	rowsToCheck := map[int]struct{}{c1.Row: {}}
	if c1.Row != c2.Row {
		rowsToCheck[c2.Row] = struct{}{}
	}

	for r := range rowsToCheck {
		// Basic bounds check for the row index
		if r < 0 || r >= rows {
			continue
		}
		// Ensure the row itself is valid before accessing it
		if r >= len(newGrid) {
			continue
		}
		rowStr := string(newGrid[r])
		// Iterate through all possible substring lengths and starting positions
		for length := minWordLength; length <= cols; length++ {
			for start := 0; start <= cols-length; start++ {
				// Boundary check for substring slice
				if start+length <= len(rowStr) {
					sub := rowStr[start : start+length]
					if isNewWord(sub) {
						newlyFound[sub] = struct{}{}
					}
				}
			}
		}
	}

	// --- Check Columns affected by the swap ---
	// Use a map to avoid checking the same column twice if the swap is horizontal
	colsToCheck := map[int]struct{}{c1.Col: {}}
	if c1.Col != c2.Col {
		colsToCheck[c2.Col] = struct{}{}
	}

	for c := range colsToCheck {
		// Basic bounds check for the column index
		if c < 0 || c >= cols {
			continue
		}
		// Build the column string safely
		var colBuilder strings.Builder
		colBuilder.Grow(rows)                // Pre-allocate approximate size
		for rIdx := 0; rIdx < rows; rIdx++ { // Iterate using index up to rows
			// Double-check indices are valid before accessing newGrid
			if rIdx < len(newGrid) && c < len(newGrid[rIdx]) {
				colBuilder.WriteRune(newGrid[rIdx][c])
			} else {
				// This indicates an inconsistent grid structure or out-of-bounds access.
				fmt.Printf("Warning: Grid inconsistency detected accessing [%d][%d] while building column string.\n", rIdx, c)
				// Decide how to handle: break, continue, or return error? Breaking seems safest.
				colBuilder.Reset() // Reset builder as the string is incomplete/invalid
				break
			}
		}

		// If the builder was reset due to error, skip checking this column
		if colBuilder.Len() == 0 && rows > 0 {
			continue
		}

		colStr := colBuilder.String()

		// Check substrings only if the column string is long enough
		if len(colStr) >= minWordLength {
			for length := minWordLength; length <= len(colStr); length++ {
				for start := 0; start <= len(colStr)-length; start++ {
					// Boundary check for substring slice
					if start+length <= len(colStr) {
						sub := colStr[start : start+length]
						if isNewWord(sub) {
							newlyFound[sub] = struct{}{}
						}
					}
				}
			}
		}
	}

	// Convert the map of found words into a sorted slice for consistent output.
	result := make([]string, 0, len(newlyFound))
	for word := range newlyFound {
		result = append(result, word)
	}
	sort.Strings(result) // Sort alphabetically
	return result
}

// --- Recursive Exploration Function ---

// explorePaths recursively explores all valid move paths from a given game state.
// It builds the exploration tree structure for JSON output.
// Returns the list of child ExplorationNodes and the maximum depth found *from this state*.
// pathVisited keeps track of grid states visited *within the current recursive path* to prevent cycles.
// currentDepth tracks the depth of the current node in the search tree (root is 0).
func explorePaths(currentState GameState, wordMap Dictionary, pathVisited map[string]struct{}, currentDepth int) ([]ExplorationNode, int) {
	var children []ExplorationNode
	maxDepthFromCurrentState := 0 // Tracks the max depth found *starting from this specific call* (relative depth)

	// --- Check Max Depth Limit ---
	// Check BEFORE exploring neighbors. If we are already at the max allowed depth,
	// we cannot make another move, so the depth from this state is 0.
	if currentDepth >= requiredMaxTurns {
		return nil, 0 // Return 0 depth achieved from this point
	}

	// --- Check for Cycles ---
	currentGridStr := gridToString(currentState.Grid)
	if _, visited := pathVisited[currentGridStr]; visited {
		// fmt.Printf("Cycle detected at depth %d: %s\n", currentDepth, currentGridStr) // Optional debug log
		return nil, 0 // Cycle detected in this path, return depth 0.
	}
	pathVisited[currentGridStr] = struct{}{} // Mark current state as visited *for this path*
	// Ensure cleanup happens before returning
	defer delete(pathVisited, currentGridStr)

	// --- Basic Grid Validity Check ---
	rows := len(currentState.Grid)
	if rows == 0 {
		return nil, 0
	}
	// Check if currentState.Grid[0] exists before accessing its length
	if len(currentState.Grid[0]) == 0 {
		return nil, 0 // Cannot explore if columns are empty
	}
	cols := len(currentState.Grid[0])

	// --- Explore Neighbors ---
	// Iterate through all possible adjacent swaps (horizontal and vertical).
	// Only check right and down neighbors to avoid duplicate swaps (e.g., (0,0)<->(0,1) and (0,1)<->(0,0)).
	for r := 0; r < rows; r++ { // Use explicit loop condition
		for c := 0; c < cols; c++ { // Use explicit loop condition
			currentCell := Coordinates{Row: r, Col: c}
			neighbors := []Coordinates{}
			// Check right neighbor
			if c+1 < cols {
				neighbors = append(neighbors, Coordinates{Row: r, Col: c + 1})
			}
			// Check down neighbor
			if r+1 < rows {
				neighbors = append(neighbors, Coordinates{Row: r + 1, Col: c})
			}

			for _, neighbor := range neighbors {
				potentialMoveInternal := Move{Cell1: currentCell, Cell2: neighbor}
				nextGrid := applyMove(currentState.Grid, potentialMoveInternal)
				if nextGrid == nil {
					continue // Skip invalid moves (e.g., out of bounds - though applyMove should handle)
				}

				newlyFoundWords := findNewWords(nextGrid, potentialMoveInternal, wordMap, currentState.FoundWords)

				// Only proceed if this move creates at least one new word
				if len(newlyFoundWords) > 0 {
					moveOut := MoveOutput{
						From: [2]int{potentialMoveInternal.Cell1.Row, potentialMoveInternal.Cell1.Col},
						To:   [2]int{potentialMoveInternal.Cell2.Row, potentialMoveInternal.Cell2.Col},
					}

					// Prepare the next state for the recursive call
					newFoundSet := copyFoundWords(currentState.FoundWords)
					for _, word := range newlyFoundWords {
						newFoundSet[word] = struct{}{}
					}
					nextState := GameState{Grid: nextGrid, FoundWords: newFoundSet}

					// --- Recursive Call ---
					// Create a *copy* of pathVisited for the recursive call to isolate path tracking
					nextPathVisited := make(map[string]struct{}, len(pathVisited)+1)
					maps.Copy(nextPathVisited, pathVisited)

					// Recurse, incrementing the depth
					subMoves, depthFromSubMove := explorePaths(nextState, wordMap, nextPathVisited, currentDepth+1)

					// The maximum depth achievable *down this specific branch* is 1 (for the current move)
					// plus the maximum depth found from the subsequent state.
					currentBranchTotalDepth := 1 + depthFromSubMove

					// Update the overall maximum depth found *starting from this function call*
					if currentBranchTotalDepth > maxDepthFromCurrentState {
						maxDepthFromCurrentState = currentBranchTotalDepth
					}

					// Create the node for the JSON output
					node := ExplorationNode{
						Move:        &moveOut,
						WordsFormed: newlyFoundWords,
						// MaxDepthReached stores the max depth achievable *starting from the next state*
						// which is exactly what the recursive call returned (depthFromSubMove).
						MaxDepthReached: depthFromSubMove,
						NextMoves:       subMoves,
					}
					children = append(children, node)
				}
			}
		}
	}

	// --- Sort Children (Optional, for consistent JSON output) ---
	sort.Slice(children, func(i, j int) bool {
		// Basic nil check for safety, though Move should always be non-nil for children
		if children[i].Move == nil {
			return false
		}
		if children[j].Move == nil {
			return true
		}

		m1 := children[i].Move
		m2 := children[j].Move
		// Sort primarily by 'from' cell (row then col), then by 'to' cell (row then col)
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

	// Return the list of child nodes and the maximum depth found *from this state*.
	return children, maxDepthFromCurrentState
}

func main() {

	// --- Load Dictionary ---
	fmt.Println("Loading dictionary...")
	wordList := strings.Fields(wordlistString)
	wordlistString = "" // Free memory early

	simpleWordList := strings.Fields(simpleWordlistString)
	simpleWordlistString = "" // Free memory early

	wordMap := make(Dictionary, len(wordList)/2) // Pre-allocate approximate size
	validWordCount := 0
	for _, word := range wordList {
		lowerWord := strings.ToLower(word)
		if len(lowerWord) >= minWordLength {
			wordMap[lowerWord] = struct{}{}
			validWordCount++
		}
	}

	simpleWordMap := make(Dictionary, len(simpleWordList)/2) // Pre-allocate approximate size
	for _, word := range simpleWordList {
		lowerWord := strings.ToLower(word)
		if len(lowerWord) >= minWordLength {
			simpleWordMap[lowerWord] = struct{}{}
		}
	}

	fmt.Printf("Dictionary loaded with %d words (length >= %d).\n", validWordCount, minWordLength)
	fmt.Printf("Grid size: %d x %d\n", gridRows, gridCols)
	fmt.Printf("Minimum word length: %d\n", minWordLength)
	fmt.Printf("Required minimum game tree depth: %d\n", requiredMinTurns)
	fmt.Printf("Maximum exploration depth: %d\n", requiredMaxTurns)

	// --- Grid Generation and Search Loop ---
	gridAttempts := 0
	validGridsFound := 0           // Count how many grids meet the criteria
	maxGridsToGenerate := 10000000 // Limit the number of attempts
	startTime := time.Now()
	foundSuitable := false // Flag to indicate if *any* grid met the criteria
	// Create a dummy move that doesn't change the grid, used for initial word check
	noopMove := Move{Cell1: Coordinates{Row: 0, Col: 0}, Cell2: Coordinates{Row: 0, Col: 0}}

	fmt.Printf("Attempting to find grids meeting criteria (max attempts: %d)...\n", maxGridsToGenerate)

	for range maxGridsToGenerate {
		gridAttempts++
		if gridAttempts%1000 == 0 && gridAttempts > 0 { // Less frequent updates for faster loops
			fmt.Printf("...checked %d grids (found %d valid, elapsed: %v)\n",
				gridAttempts, validGridsFound, time.Since(startTime).Round(time.Second))
		}

		initialGrid := generateGrid(gridRows, gridCols)
		if initialGrid == nil {
			fmt.Println("Error generating grid, skipping attempt.")
			continue
		}

		// --- Check if the generated grid *starts* with any words ---
		// Use an empty FoundWordsSet for this initial check
		initialWordsCheck := findNewWords(initialGrid, noopMove, wordMap, make(FoundWordsSet))
		if len(initialWordsCheck) > 0 {
			// If words are found in the initial state, skip this grid and try generating another.
			// fmt.Printf("Skipping grid starting with words: %v\n", initialWordsCheck) // Optional debug log
			continue
		}
		// --- Grid is initially word-free, proceed with exploration ---

		// Initial state for exploration starts with an empty FoundWords set
		initialState := GameState{Grid: initialGrid, FoundWords: make(FoundWordsSet)}

		// Explore the full game tree starting from this initial state
		pathVisited := make(map[string]struct{}) // Fresh visited map for each grid
		// Initial call to explorePaths with currentDepth = 0
		explorationTree, maxDepth := explorePaths(initialState, wordMap, pathVisited, 0)

		// Check if this grid meets the minimum depth requirement
		if maxDepth < requiredMinTurns {
			continue // Skip if max depth is not met
		}

		// Check if only simple words are used throughout the exploration
		if !isOnlySimpleWords(simpleWordMap, explorationTree) {
			continue // Skip if non-simple words are found
		}

		// --- Grid meets all criteria ---
		foundSuitable = true // Mark that we found at least one suitable grid
		// Write output for this valid grid
		WriteOutput(validGridsFound, initialGrid, explorationTree, maxDepth)
		validGridsFound++ // Increment the counter for valid grids found

	} // End Grid Generation Loop

	// --- Process Results ---
	elapsedTime := time.Since(startTime).Round(time.Second)
	if !foundSuitable {
		fmt.Printf("\nSearch finished after %v (%d attempts). No grid meeting all criteria (min depth %d, initial word check, simple words) was found.\n",
			elapsedTime, gridAttempts, requiredMinTurns)
	} else {
		fmt.Printf("\nSearch finished after %v (%d attempts).\n", elapsedTime, gridAttempts)
		fmt.Printf("Found and saved %d grids meeting all criteria.\n", validGridsFound)
	}
}

// isOnlySimpleWords checks if all words found in the exploration tree exist in the simpleWordMap.
func isOnlySimpleWords(simpleWordMap Dictionary, explorationTree []ExplorationNode) bool {
	allWordsSet := make(FoundWordsSet)
	collectAllWords(explorationTree, allWordsSet) // Collect all unique words from the tree

	// Check each collected word against the simple dictionary
	for word := range allWordsSet {
		if _, ok := simpleWordMap[word]; !ok {
			// If any word is not found in the simple map, return false
			// fmt.Printf("Grid rejected due to non-simple word: %s\n", word) // Optional debug log
			return false
		}
	}
	// If all words were found in the simple map, return true
	return true
}

// collectAllWords recursively traverses the exploration tree and gathers all unique words.
func collectAllWords(nodes []ExplorationNode, allWords FoundWordsSet) {
	if allWords == nil { // Should not happen, but safety check
		return
	}
	for i := range nodes { // Iterate safely using index
		node := nodes[i] // Get the node by index
		// Add words formed at this node
		for _, word := range node.WordsFormed {
			allWords[word] = struct{}{}
		}
		// Recursively collect words from children
		if len(node.NextMoves) > 0 {
			collectAllWords(node.NextMoves, allWords)
		}
	}
}

// WriteOutput handles formatting and writing the JSON data for a single valid grid.
func WriteOutput(gridIndex int, grid Grid, explorationTree []ExplorationNode, maxDepth int) {
	// --- Prepare JSON Output Data ---
	outputData := FullExplorationOutput{
		InitialGrid:      convertGridToJsonGrid(grid),
		MinWordLength:    minWordLength,
		RequiredMinTurns: requiredMinTurns,
		RequiredMaxTurns: requiredMaxTurns, // Include max turns limit in output
		MaxDepthReached:  maxDepth,         // Overall max depth achieved for this grid
		ExplorationTree:  explorationTree,
	}

	// --- Marshal to JSON ---
	jsonData, err := json.MarshalIndent(outputData, "", "  ") // Use indentation for readability
	if err != nil {
		fmt.Printf("Error marshaling JSON for grid index %d: %v\n", gridIndex, err)
		return // Don't proceed if marshalling fails
	}

	// --- Prepare Output File ---
	outputDir := "output"
	// Ensure filename uses gridIndex correctly
	outputFilename := filepath.Join(outputDir, fmt.Sprintf("%d.json", gridIndex))

	// Create the output directory if it doesn't exist
	if err := os.MkdirAll(outputDir, 0755); err != nil { // Use 0755 for directory permissions
		fmt.Printf("Error creating directory '%s': %v\n", outputDir, err)
		return
	}

	// --- Write JSON to File ---
	// Use WriteFile for simplicity (handles file creation/truncation)
	err = os.WriteFile(outputFilename, jsonData, 0644) // Standard file permissions
	if err != nil {
		fmt.Printf("Error writing JSON to file '%s': %v\n", outputFilename, err)
		return
	}

	// --- Collect All Found Words ---
	allWordsSet := make(FoundWordsSet)
	collectAllWords(explorationTree, allWordsSet) // Populate the set

	// Convert set to sorted slice
	allWordsList := make([]string, 0, len(allWordsSet))
	for word := range allWordsSet {
		allWordsList = append(allWordsList, word)
	}
	sort.Strings(allWordsList) // Sort alphabetically

	// --- Print Summary to Console ---
	fmt.Printf("\n--- Found Valid Grid (%d) ---\n", gridIndex)
	printGrid(grid) // Display the grid itself
	fmt.Printf("  File Path:                %s\n", outputFilename)
	fmt.Printf("  Grid Dimensions:          %d x %d\n", gridRows, gridCols)
	fmt.Printf("  Min Word Length:          %d\n", minWordLength)
	fmt.Printf("  Required Min Tree Depth:  %d\n", requiredMinTurns)
	fmt.Printf("  Max Exploration Depth:    %d\n", requiredMaxTurns)
	fmt.Printf("  Actual Max Depth Reached: %d\n", maxDepth) // Overall depth for this grid
	fmt.Printf("  Total Unique Words Found: %d\n", len(allWordsList))
	// Print the words, potentially wrapped for readability
	if len(allWordsList) > 0 {
		fmt.Printf("  Words Found:              %s\n", strings.Join(allWordsList, ", "))
	}
	fmt.Println("---------------------------")
}
