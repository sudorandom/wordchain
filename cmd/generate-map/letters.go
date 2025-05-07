package main

import (
	"fmt"
	"math/rand/v2"
)

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

func getRandomLetterByFrequency() rune {
	if len(weightedLetters) == 0 {
		return rune(rand.IntN(26) + 'a')
	}
	return weightedLetters[rand.IntN(len(weightedLetters))]
}
