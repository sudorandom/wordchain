package main

import (
	"bytes"         // Needed for grid string representation
	"encoding/json" // Needed for JSON output
	"fmt"
	"math/rand/v2" // Using v2 rand
	"os"           // Needed for file writing
	"path/filepath"
	"runtime" // For NumCPU
	"sort"    // To print found words consistently
	"strings"
	"sync"        // For WaitGroup and Mutex (though Mutex not strictly needed for current cache)
	"sync/atomic" // For atomic counters
	"time"        // For status updates and timeout

	_ "embed" // Needed for //go:embed
	"maps"
)

//go:embed data/dictionary.txt
var wordlistString string // Embed the word list file

//go:embed data/top-1000.txt
var simpleWordlistString string // Embed the word list file

// --- Game Configuration ---
const gridRows = 4   // Grid dimensions
const gridCols = 4   // Adjusted from previous version in thought process
const wordLength = 4 // The exact length of a word to be considered valid
const requiredMinTurns = 7
const requiredMaxTurns = 10
const maxUniqueWords = 15
const maxGridsToGenerate = 10000000 // Overall limit for attempts
// const targetValidGrids = 10 // Optional: Stop after finding this many valid grids (-1 to disable)

// --- Letter Frequencies (Approximate for English) ---
var letterFrequencies = map[rune]float64{
	'a': 8.167, 'b': 1.492, 'c': 2.782, 'd': 4.253, 'e': 12.702,
	'f': 2.228, 'g': 2.015, 'h': 6.094, 'i': 6.966, 'j': 0.153,
	'k': 0.772, 'l': 4.025, 'm': 2.406, 'n': 6.749, 'o': 7.507,
	'p': 1.929, 'q': 0.095, 'r': 5.987, 's': 6.327, 't': 9.056,
	'u': 2.758, 'v': 0.978, 'w': 2.360, 'x': 0.150, 'y': 1.974,
	'z': 0.074,
}

var weightedLetters []rune

func init() {
	var totalWeight float64
	for _, freq := range letterFrequencies {
		totalWeight += freq
	}
	const scaleFactor = 1000
	weightedLetters = make([]rune, 0, int(totalWeight*scaleFactor/100))
	for letter, freq := range letterFrequencies {
		count := int((freq / totalWeight) * float64(len(letterFrequencies)*scaleFactor))
		if count == 0 && freq > 0 {
			count = 1
		}
		for i := 0; i < count; i++ {
			weightedLetters = append(weightedLetters, letter)
		}
	}
	if len(weightedLetters) == 0 {
		fmt.Println("Warning: weightedLetters is empty, falling back to uniform random letters.")
		for r := 'a'; r <= 'z'; r++ {
			weightedLetters = append(weightedLetters, r)
		}
	}
}

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

func getRandomLetterByFrequency() rune {
	if len(weightedLetters) == 0 {
		return rune(rand.IntN(26) + 'a')
	}
	return weightedLetters[rand.IntN(len(weightedLetters))]
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
		if len(word) != wordLength {
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
		if cols >= wordLength {
			for start := 0; start <= cols-wordLength; start++ {
				sub := rowStr[start : start+wordLength]
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
		if rows >= wordLength {
			for start := 0; start <= rows-wordLength; start++ {
				sub := colStr[start : start+wordLength]
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
	if currentDepth >= requiredMaxTurns {
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
	for r := 0; r < rows; r++ {
		for c := 0; c < cols; c++ {
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

// worker function processes grid generation and exploration.
func worker(
	id int,
	wg *sync.WaitGroup,
	wordMap Dictionary,
	simpleWordMap Dictionary,
	noopMove Move,
	resultsChan chan<- WorkerResult,
	doneChan <-chan struct{},
	gridAttemptsTotal *int64,
) {
	defer wg.Done()
	fmt.Printf("Worker %d started\n", id)
	for {
		select {
		case <-doneChan: // Check if we need to stop
			fmt.Printf("Worker %d stopping via doneChan\n", id)
			return
		default:
			// Continue processing
		}

		currentAttemptNum := atomic.AddInt64(gridAttemptsTotal, 1)
		if currentAttemptNum > maxGridsToGenerate {
			// Signal main that max attempts reached if this worker is the one to hit it.
			// This can be tricky; simpler if main goroutine primarily manages closing doneChan.
			// For now, worker just stops itself. Main will also close doneChan.
			// fmt.Printf("Worker %d stopping, max attempts %d reached by global counter\n", id, maxGridsToGenerate)
			return // Stop this worker if global max attempts are exceeded
		}

		// Each worker uses its own exploration cache for the grid it's currently processing
		currentGlobalCache := make(map[string]ExplorationCacheEntry)

		initialGrid := generateGrid(gridRows, gridCols)
		if initialGrid == nil {
			continue
		}

		initialWordsCheck := findNewWords(initialGrid, noopMove, wordMap, make(FoundWordsSet))
		if len(initialWordsCheck) > 0 {
			continue
		}

		initialState := GameState{Grid: initialGrid, FoundWords: make(FoundWordsSet)}
		pathVisited := make(map[string]struct{})

		explorationTree, maxDepth := explorePaths(initialState, wordMap, pathVisited, 0, currentGlobalCache)

		if maxDepth < requiredMinTurns {
			continue
		}

		wordSet := make(FoundWordsSet)
		collectAllWords(explorationTree, wordSet)
		if !isOnlySimpleWords(simpleWordMap, wordSet) {
			continue
		}

		if len(wordSet) > maxUniqueWords {
			continue
		}

		// If all checks pass, send the result
		// Need to handle potential block if resultsChan is full or main is slow
		select {
		case resultsChan <- WorkerResult{
			Grid:            initialGrid,
			ExplorationTree: explorationTree,
			MaxDepth:        maxDepth,
		}:
		case <-doneChan: // If we need to stop while trying to send
			fmt.Printf("Worker %d stopping before sending result via doneChan\n", id)
			return
		}
	}
}

func main() {
	// --- Load Dictionary ---
	fmt.Println("Loading dictionary...")
	wordList := strings.Fields(wordlistString)
	wordlistString = "" // Free memory
	simpleWordList := strings.Fields(simpleWordlistString)
	simpleWordlistString = "" // Free memory

	wordMap := make(Dictionary, len(wordList)/2)
	validWordCount := 0
	for _, word := range wordList {
		lowerWord := strings.ToLower(word)
		if len(lowerWord) == wordLength {
			wordMap[lowerWord] = struct{}{}
			validWordCount++
		}
	}
	simpleWordMap := make(Dictionary, len(simpleWordList)/2)
	for _, word := range simpleWordList {
		lowerWord := strings.ToLower(word)
		if len(lowerWord) == wordLength {
			simpleWordMap[lowerWord] = struct{}{}
		}
	}
	fmt.Printf("Dictionary loaded with %d words (length == %d).\n", validWordCount, wordLength)
	fmt.Printf("Grid size: %d x %d\n", gridRows, gridCols)
	fmt.Printf("Word length: %d\n", wordLength)
	fmt.Printf("Required minimum game tree depth: %d\n", requiredMinTurns)
	fmt.Printf("Maximum exploration depth: %d\n", requiredMaxTurns)
	fmt.Printf("Maximum unique words allowed: %d\n", maxUniqueWords)

	// --- Parallel Grid Generation and Search Loop ---
	startTime := time.Now()
	foundSuitable := false // Tracks if any suitable grid is found at all
	validGridsFound := 0   // Counter for grids that passed all filters and were written

	numWorkers := runtime.NumCPU()
	fmt.Printf("Using %d worker goroutines.\n", numWorkers)

	resultsChan := make(chan WorkerResult, numWorkers) // Buffered channel
	doneChan := make(chan struct{})
	var wg sync.WaitGroup
	var gridAttemptsTotal int64 // Atomic counter for total attempts

	noopMove := Move{Cell1: Coordinates{Row: 0, Col: 0}, Cell2: Coordinates{Row: 0, Col: 0}}

	// Launch workers
	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go worker(i, &wg, wordMap, simpleWordMap, noopMove, resultsChan, doneChan, &gridAttemptsTotal)
	}

	// Goroutine to close resultsChan once all workers are done processing and have exited.
	// This signals the results processing loop below to terminate.
	go func() {
		wg.Wait()
		close(resultsChan)
		fmt.Println("All workers finished, results channel closed.")
	}()

	// Progress ticker
	ticker := time.NewTicker(10 * time.Second) // Print progress every 10 seconds
	defer ticker.Stop()

	// Main loop to collect results and manage workers
resultsLoop:
	for {
		select {
		case result, ok := <-resultsChan:
			if !ok { // resultsChan was closed by the goroutine above
				fmt.Println("Results channel closed, exiting results loop.")
				break resultsLoop
			}
			// Process valid result
			if !foundSuitable {
				foundSuitable = true
			}
			WriteOutput(validGridsFound, result.Grid, result.ExplorationTree, result.MaxDepth)
			validGridsFound++
			// Optional: Stop if targetValidGrids is reached
			// if targetValidGrids != -1 && validGridsFound >= targetValidGrids {
			// 	fmt.Printf("Target of %d valid grids reached. Signaling workers to stop.\n", targetValidGrids)
			// 	close(doneChan) // Signal workers to stop
			//  // Note: Workers might still send a few more results if they were already in flight.
			// }

		case <-ticker.C:
			attempts := atomic.LoadInt64(&gridAttemptsTotal)
			fmt.Printf("...elapsed: %v, checked ~%d grids (found %d valid)\n",
				time.Since(startTime).Round(time.Second), attempts, validGridsFound)
			if attempts >= maxGridsToGenerate {
				fmt.Println("Max grid generation attempts reached. Signaling workers to stop.")
				close(doneChan)
			}
			// Optional: Add a timeout for the whole process
			// case <-time.After(5 * time.Minute):
			// 	fmt.Println("Total search time limit reached. Signaling workers to stop.")
			// 	close(doneChan)
			// 	break resultsLoop
		}
		// Check if doneChan is closed and resultsChan might still have items or is also closed
		// This ensures we don't get stuck if doneChan closes but resultsChan still has items.
		select {
		case <-doneChan:
			// If doneChan is closed, we still need to drain resultsChan
			// The main break condition is `resultsChan` being closed.
		default:
		}
	}

	// Final summary
	elapsedTime := time.Since(startTime).Round(time.Second)
	finalAttempts := atomic.LoadInt64(&gridAttemptsTotal)
	if !foundSuitable {
		fmt.Printf("\nSearch finished after %v (~%d attempts). No grid meeting all criteria found.\n", elapsedTime, finalAttempts)
	} else {
		fmt.Printf("\nSearch finished after %v (~%d attempts).\n", elapsedTime, finalAttempts)
		fmt.Printf("Found and saved %d grids meeting all criteria.\n", validGridsFound)
	}
}

// isOnlySimpleWords checks if all words found in the exploration tree exist in the simpleWordMap.
func isOnlySimpleWords(simpleWordMap Dictionary, wordSet map[string]struct{}) bool {
	for word := range wordSet {
		if _, ok := simpleWordMap[word]; !ok {
			return false
		}
	}
	return true
}

// collectAllWords recursively traverses the exploration tree and gathers all unique words.
func collectAllWords(nodes []ExplorationNode, allWords FoundWordsSet) {
	if allWords == nil {
		return
	}
	for i := range nodes {
		node := nodes[i]
		for _, word := range node.WordsFormed {
			allWords[word] = struct{}{}
		}
		if len(node.NextMoves) > 0 {
			collectAllWords(node.NextMoves, allWords)
		}
	}
}

// WriteOutput handles formatting and writing the JSON data for a single valid grid.
func WriteOutput(gridIndex int, grid Grid, explorationTree []ExplorationNode, maxDepth int) {
	outputData := FullExplorationOutput{
		InitialGrid:      convertGridToJsonGrid(grid),
		WordLength:       wordLength,
		RequiredMinTurns: requiredMinTurns,
		RequiredMaxTurns: requiredMaxTurns,
		MaxDepthReached:  maxDepth,
		ExplorationTree:  explorationTree,
	}
	jsonData, err := json.MarshalIndent(outputData, "", "  ")
	if err != nil {
		fmt.Printf("Error marshaling JSON for grid index %d: %v\n", gridIndex, err)
		return
	}

	outputDir := "output"
	outputFilename := filepath.Join(outputDir, fmt.Sprintf("%d.json", gridIndex))
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		fmt.Printf("Error creating directory '%s': %v\n", outputDir, err)
		return
	}
	if err = os.WriteFile(outputFilename, jsonData, 0644); err != nil {
		fmt.Printf("Error writing JSON to file '%s': %v\n", outputFilename, err)
		return
	}

	allWordsSet := make(FoundWordsSet)
	collectAllWords(explorationTree, allWordsSet)
	allWordsList := make([]string, 0, len(allWordsSet))
	for word := range allWordsSet {
		allWordsList = append(allWordsList, word)
	}
	sort.Strings(allWordsList)

	fmt.Printf("\n--- Found Valid Grid (%d) ---\n", gridIndex)
	printGrid(grid)
	fmt.Printf("  File Path:                %s\n", outputFilename)
	fmt.Printf("  Grid Dimensions:          %d x %d\n", gridRows, gridCols)
	fmt.Printf("  Word Length:              %d\n", wordLength)
	fmt.Printf("  Required Min Tree Depth:  %d\n", requiredMinTurns)
	fmt.Printf("  Max Exploration Depth:    %d\n", requiredMaxTurns)
	fmt.Printf("  Actual Max Depth Reached: %d\n", maxDepth)
	fmt.Printf("  Total Unique Words Found: %d\n", len(allWordsList))
	if len(allWordsList) > 0 {
		fmt.Printf("  Words Found:              %s\n", strings.Join(allWordsList, ", "))
	}
	fmt.Println("---------------------------")
}
