package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

func main() {
	// --- Configuration ---
	// Path to your dictionary text file (one word per line)
	dictionaryWordsFile := "cmd/generate-map/data/en.txt"

	// Path to your wordlist text file (one word per line, to be checked against the dictionary)
	wordlistToCheckFile := "cmd/generate-map/data/usable.txt"

	// Path for the new output file that will contain only the valid words
	validWordsOutputFile := "valid_words_output.txt"
	// --- End Configuration ---

	fmt.Printf("Attempting to load dictionary words from: %s\n", dictionaryWordsFile)
	fmt.Printf("Words to check will be read from: %s\n", wordlistToCheckFile)
	fmt.Printf("Valid words found will be written to: %s\n\n", validWordsOutputFile)

	// 1. Load words from the dictionaryWordsFile into a set for efficient lookup.
	dictionarySet := make(map[string]struct{})

	dictFile, err := os.Open(dictionaryWordsFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error opening dictionary words file '%s': %v\n", dictionaryWordsFile, err)
		os.Exit(1)
	}
	defer dictFile.Close()

	dictScanner := bufio.NewScanner(dictFile)
	for dictScanner.Scan() {
		word := strings.TrimSpace(dictScanner.Text())
		if word != "" {
			dictionarySet[word] = struct{}{}
		}
	}

	if err := dictScanner.Err(); err != nil {
		fmt.Fprintf(os.Stderr, "Error reading from dictionary words file '%s': %v\n", dictionaryWordsFile, err)
		os.Exit(1) // Exit if the dictionary file can't be fully read.
	}
	fmt.Printf("Successfully loaded %d unique words into the dictionary set from '%s'.\n\n", len(dictionarySet), dictionaryWordsFile)

	// 2. Create/Open the output file for writing valid words.
	// os.Create will create the file if it doesn't exist, or truncate it if it does.
	outputFile, err := os.Create(validWordsOutputFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error creating output file '%s': %v\n", validWordsOutputFile, err)
		os.Exit(1)
	}
	defer outputFile.Close() // Ensure the file is closed when main function exits.

	// Use a buffered writer for potentially better performance.
	outputWriter := bufio.NewWriter(outputFile)
	// Ensure any buffered data is written to the file before outputFile.Close() is called.
	defer outputWriter.Flush()

	// 3. Open and scan the wordlistToCheckFile.
	fmt.Printf("Scanning wordlist '%s', reporting missing words, and writing valid words to '%s':\n", wordlistToCheckFile, validWordsOutputFile)
	checkFile, err := os.Open(wordlistToCheckFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error opening wordlist file '%s': %v\n", wordlistToCheckFile, err)
		os.Exit(1)
	}
	defer checkFile.Close()

	checkScanner := bufio.NewScanner(checkFile)
	missingWordsCount := 0
	validWordsWrittenCount := 0
	wordsScannedCount := 0

	for checkScanner.Scan() {
		wordsScannedCount++
		wordToCheck := strings.TrimSpace(checkScanner.Text())

		if wordToCheck == "" {
			// Skip empty lines in the wordlist
			continue
		}

		// Check if the word exists in the dictionary set.
		// This check is case-sensitive.
		_, found := dictionarySet[wordToCheck]

		if found {
			// Word is valid (found in dictionary), write it to the output file.
			_, err := outputWriter.WriteString(wordToCheck + "\n")
			if err != nil {
				// Report error writing to output file but continue processing other words.
				fmt.Fprintf(os.Stderr, "Error writing word '%s' to output file '%s': %v\n", wordToCheck, validWordsOutputFile, err)
			} else {
				validWordsWrittenCount++
			}
		} else {
			// Word is not found in the dictionary.
			fmt.Printf("Missing: '%s'\n", wordToCheck)
			missingWordsCount++
		}
	}

	if err := checkScanner.Err(); err != nil {
		fmt.Fprintf(os.Stderr, "\nError reading from wordlist file '%s': %v\n", wordlistToCheckFile, err)
	}

	// Explicitly flush the buffer before printing the final summary to ensure all writes are attempted.
	// The defer statement for outputWriter.Flush() will also handle this at exit, but an explicit
	// flush here ensures it happens before the summary messages if that ordering is critical.
	if err := outputWriter.Flush(); err != nil {
		fmt.Fprintf(os.Stderr, "Error flushing output writer for '%s': %v\n", validWordsOutputFile, err)
	}

	fmt.Printf("\n--- Scan Complete ---\n")
	fmt.Printf("Total words scanned from '%s': %d\n", wordlistToCheckFile, wordsScannedCount)
	fmt.Printf("Total words reported as missing (not in '%s'): %d\n", dictionaryWordsFile, missingWordsCount)
	fmt.Printf("Total valid words written to '%s': %d\n", validWordsOutputFile, validWordsWrittenCount)
}
