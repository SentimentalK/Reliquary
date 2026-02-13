/**
 * Quality Check Utility
 * Analyzes the difference between raw ASR output and fixed pipeline output
 * to detect potential errors like hallucinations, critical content changes, etc.
 */

export type QualityStatus = 'ok' | 'yellow' | 'red'

export interface QualityResult {
    status: QualityStatus
    msg: string
    similarity?: number
}

/**
 * Calculates Levenshtein edit distance between two strings
 * Standard algorithm, O(n*m)
 */
const getEditDistance = (a: string, b: string): number => {
    if (a.length === 0) return b.length
    if (b.length === 0) return a.length

    const matrix: number[][] = []

    // increment along the first column of each row
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i]
    }

    // increment each column in the first row
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1]
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                )
            }
        }
    }

    return matrix[b.length][a.length]
}

/**
 * Core analysis logic based on multi-tiered checks
 */
export const analyzeQuality = (raw: string, fixed: string): QualityResult => {
    if (!raw || !fixed) return { status: 'ok', msg: '' }

    const rawClean = raw.trim()
    const fixedClean = fixed.trim()

    // --- 1. RED FLAG CHECKS (CRITICAL) ---

    // A. Number Consistency Check (Safety Check)
    // Extract number sequences. If they don't match, it's a critical safety issue.
    const rawNums = rawClean.match(/\d+/g) || []
    const fixNums = fixedClean.match(/\d+/g) || []

    // Sort and join to compare set of numbers (ignoring order)
    if (rawNums.sort().join(',') !== fixNums.sort().join(',')) {
        return { status: 'red', msg: 'Numbers Mismatch' }
    }

    // B. Structural Rewrite Check (Levenshtein)
    const distance = getEditDistance(rawClean, fixedClean)
    const maxLen = Math.max(rawClean.length, fixedClean.length)

    // Similarity score (0 to 1)
    const similarity = maxLen === 0 ? 1 : 1 - (distance / maxLen)

    // If similarity is below 40%, assume the content was rewritten too aggressively
    if (similarity < 0.4) {
        return {
            status: 'red',
            msg: `Content Rewritten (${Math.round(similarity * 100)}% match)`,
            similarity
        }
    }

    // --- 2. YELLOW FLAG CHECKS (WARNING) ---

    // C. Asymmetric Length Threshold Check
    const diff = fixedClean.length - rawClean.length
    // Avoid division by zero
    const ratio = rawClean.length > 0 ? diff / rawClean.length : 0
    const percent = Math.round(Math.abs(ratio) * 100)

    // Case 1: Addition > 20% (Likely Hallucination / Chatter)
    if (ratio > 0.2) {
        return {
            status: 'yellow',
            msg: `Length +${percent}% (Hallucination?)`,
            similarity
        }
    }

    // Case 2: Deletion > 35% (Likely Aggressive Cleaning, Cutoff)
    // Relaxed threshold compared to addition because cleaning usually removes filler words
    if (ratio < -0.35) {
        return {
            status: 'yellow',
            msg: `Cutoff -${percent}%`,
            similarity
        }
    }

    // --- 3. PASS ---
    return { status: 'ok', msg: '', similarity }
}
