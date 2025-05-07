package main

// isOnlySimpleWords checks if all words found in the exploration tree exist in the simpleWordMap.
func isOnlySimpleWords(simpleWordMap Dictionary, wordSet map[string]struct{}) bool {
	for word := range wordSet {
		if _, ok := simpleWordMap[word]; !ok {
			return false
		}
	}
	return true
}
