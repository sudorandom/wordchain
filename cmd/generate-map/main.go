package main

import (
	// Needed for grid string representation
	_ "embed" // Needed for //go:embed
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/alecthomas/kong"
)

//go:embed data/en.txt
var wordlistString string // Embed the word list file

//go:embed data/usable.txt
var simpleWordlistString string // Embed the word list file

var cli CLI

type CLI struct {
	GridRows         int             `kong:"name='grid-rows',short='r',default:'5',help='Number of rows in the grid.'"`
	GridCols         int             `kong:"name='grid-cols',short='c',default:'5',help='Number of columns in the grid.'"`
	WordLength       int             `kong:"name='word-length',short='l',default:'5',help='The exact length of a word to be considered valid.'"`
	RequiredMinTurns int             `kong:"name='min-turns',short='t',default:'7',help='Minimum number of turns required for a solvable puzzle.'"`
	RequiredMaxTurns int             `kong:"name='max-turns',short='T',default:'15',help='Maximum number of turns allowed for a solvable puzzle.'"`
	MaxUniqueWords   int             `kong:"name='max-unique-words',short='u',default:'15',help='Maximum number of unique words to target in a puzzle solution.'"`
	NumGrids         int             `kong:"name='num-grids',short='n',default:'100',help='Number of grids to generate.'"`
	Output           string          `kong:"name='output',short='o',default:'output',help='Directory to output files to'"`
	StartDate        DefaultableDate `kong:"name='start-date',short='s',help='Date to start at',format='2006-01-02'"`

	Help bool `kong:"name='help',short='h',help='Show help'"`
}

type DefaultableDate struct {
	Time *time.Time
}

func (d *DefaultableDate) UnmarshalText(text []byte) error {
	s := string(text)
	now := time.Now()
	defaultDate := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	if s == "" {
		d.Time = &defaultDate
		return nil
	}

	parsedTime, err := time.Parse("2006-01-02", s)
	if err != nil {
		return fmt.Errorf("invalid date format for '%s': expected YYYY-MM-DD. Error: %w", s, err)
	}
	d.Time = &parsedTime
	return nil
}

// String returns the date in YYYY-MM-DD format. Useful for printing.
func (d DefaultableDate) String() string {
	if d.Time == nil { // Truly zero and not because it was defaulted from empty
		return "<not set>"
	}
	return d.Time.Format("2006-01-02")
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

		// Each worker uses its own exploration cache for the grid it's currently processing
		currentGlobalCache := make(map[string]ExplorationCacheEntry)
		initialGrid := generateGrid(cli.GridRows, cli.GridCols)
		if initialGrid == nil {
			continue
		}

		atomic.AddInt64(gridAttemptsTotal, 1)

		initialWordsCheck := findNewWords(initialGrid, noopMove, wordMap, make(FoundWordsSet))
		if len(initialWordsCheck) > 0 {
			continue
		}

		initialState := GameState{Grid: initialGrid, FoundWords: make(FoundWordsSet)}
		pathVisited := make(map[string]struct{})

		explorationTree, maxDepth := explorePaths(initialState, wordMap, pathVisited, 0, currentGlobalCache)

		if maxDepth < cli.RequiredMinTurns {
			continue
		}

		wordSet := make(FoundWordsSet)
		collectAllWords(explorationTree, wordSet)
		if !isOnlySimpleWords(simpleWordMap, wordSet) {
			continue
		}

		if len(wordSet) > cli.MaxUniqueWords {
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
	parser := kong.Must(&cli)
	_, err := parser.Parse(os.Args[1:])
	parser.FatalIfErrorf(err)

	fmt.Printf("Grid Dimensions: %d rows, %d columns\n", cli.GridRows, cli.GridCols)
	fmt.Printf("Word Length: %d\n", cli.WordLength)
	fmt.Printf("Required Turns: %d-%d\n", cli.RequiredMinTurns, cli.RequiredMaxTurns)
	fmt.Printf("Max Unique Words: %d\n", cli.MaxUniqueWords)
	fmt.Printf("Grids to Generate: %d\n", cli.NumGrids)

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
		if len(lowerWord) == cli.WordLength {
			wordMap[lowerWord] = struct{}{}
			validWordCount++
		}
	}
	simpleWordMap := make(Dictionary, len(simpleWordList)/2)
	for _, word := range simpleWordList {
		lowerWord := strings.ToLower(word)
		if len(lowerWord) == cli.WordLength {
			simpleWordMap[lowerWord] = struct{}{}
		}
	}
	fmt.Printf("Dictionary loaded with %d words (length == %d).\n", validWordCount, cli.WordLength)
	fmt.Printf("Grid size: %d x %d\n", cli.GridRows, cli.GridCols)
	fmt.Printf("Word length: %d\n", cli.WordLength)
	fmt.Printf("Required minimum game tree depth: %d\n", cli.RequiredMinTurns)
	fmt.Printf("Maximum exploration depth: %d\n", cli.RequiredMaxTurns)
	fmt.Printf("Maximum unique words allowed: %d\n", cli.MaxUniqueWords)

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
	for i := 0; i < numWorkers; i++ { // Corrected loop condition
		wg.Add(1)
		go worker(i, &wg, wordMap, simpleWordMap, noopMove, resultsChan, doneChan, &gridAttemptsTotal)
	}

	// Goroutine to close resultsChan once all workers are done processing and have exited.
	// This signals the results processing loop below to terminate.
	go func() {
		wg.Wait()
		close(doneChan)    // Signal workers to stop.  Important to close doneChan here.
		close(resultsChan) // Close the channel after all workers are done.
		fmt.Println("All workers finished, results channels closed.")
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
			// Optional: Stop if cli.NumGrids is reached
			if cli.NumGrids != -1 && validGridsFound >= cli.NumGrids {
				fmt.Printf("Target of %d valid grids reached. Signaling workers to stop.\n", cli.NumGrids)
				// close(doneChan) // Moved close(doneChan) to the worker shutdown goroutine.
				break resultsLoop // Exit the loop after signaling workers.
			}

		case <-ticker.C:
			attempts := atomic.LoadInt64(&gridAttemptsTotal)
			fmt.Printf("...elapsed: %v, checked ~%d grids (found %d valid)\n",
				time.Since(startTime).Round(time.Second), attempts, validGridsFound)
			// Optional: Add a timeout for the whole process
			// case <-time.After(5 * time.Minute):
			//  fmt.Println("Total search time limit reached. Signaling workers to stop.")
			//  close(doneChan)
			//  break resultsLoop
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
		WordLength:       cli.WordLength,
		RequiredMinTurns: cli.RequiredMinTurns,
		RequiredMaxTurns: cli.RequiredMaxTurns,
		MaxDepthReached:  maxDepth,
		ExplorationTree:  explorationTree,
	}
	jsonData, err := json.MarshalIndent(outputData, "", "  ")
	if err != nil {
		fmt.Printf("Error marshaling JSON for grid index %d: %v\n", gridIndex, err)
		return
	}

	gridDate := cli.StartDate.Time.Add(time.Duration(gridIndex) * 24 * time.Hour)

	outputFilename := filepath.Join(cli.Output, gridDate.Format("2006/01/02.json"))
	if err := os.MkdirAll(filepath.Dir(outputFilename), 0755); err != nil {
		fmt.Printf("Error creating directory '%s': %v\n", cli.Output, err)
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
	fmt.Printf("  Grid Dimensions:          %d x %d\n", cli.GridRows, cli.GridCols)
	fmt.Printf("  Word Length:              %d\n", cli.WordLength)
	fmt.Printf("  Required Min Tree Depth:  %d\n", cli.RequiredMinTurns)
	fmt.Printf("  Max Exploration Depth:    %d\n", cli.RequiredMaxTurns)
	fmt.Printf("  Actual Max Depth Reached: %d\n", maxDepth)
	fmt.Printf("  Total Unique Words Found: %d\n", len(allWordsList))
	if len(allWordsList) > 0 {
		fmt.Printf("  Words Found:              %s\n", strings.Join(allWordsList, ", "))
	}
	fmt.Println("---------------------------")
}
