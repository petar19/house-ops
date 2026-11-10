import { distance } from 'fastest-levenshtein';
import { normalizeText, tokenize } from './normalize';
import type { Category } from '../types';

export interface CategorySuggestion {
  categoryId: string;
  score: number;
}

const EXACT_TOKEN_SCORE = 3;
const SUBSTRING_SCORE = 2;
const FUZZY_SCORE = 1;
const SUGGEST_THRESHOLD = 1;
// One exact keyword is enough to pick a category by itself ("Konzum" with
// the keyword "konzum"); a partial or fuzzy match is only suggested.
export const AUTO_CHECK_THRESHOLD = EXACT_TOKEN_SCORE;

function keywordScore(keyword: string, normalizedText: string, tokens: string[]): number {
  const normalizedKeyword = normalizeText(keyword);
  if (normalizedKeyword === '') return 0;

  // The whole text counts too, so a several-word keyword learnt from an
  // expense name ("zoo city") matches that name exactly.
  if (tokens.includes(normalizedKeyword) || normalizedText === normalizedKeyword) return EXACT_TOKEN_SCORE;

  if (normalizedText.includes(normalizedKeyword) || normalizedKeyword.includes(normalizedText)) {
    return SUBSTRING_SCORE;
  }

  const maxDistance = normalizedKeyword.length > 6 ? 2 : 1;
  for (const token of tokens) {
    if (distance(token, normalizedKeyword) <= maxDistance) return FUZZY_SCORE;
  }

  return 0;
}

/** Scores every category against free text, best-per-keyword summed. */
export function suggestCategories(
  text: string,
  categories: Category[],
): CategorySuggestion[] {
  const normalizedText = normalizeText(text);
  const tokens = tokenize(text);
  if (tokens.length === 0) return [];

  const suggestions: CategorySuggestion[] = [];
  for (const category of categories) {
    let score = 0;
    for (const keyword of category.keywords) {
      score += keywordScore(keyword, normalizedText, tokens);
    }
    if (score >= SUGGEST_THRESHOLD) {
      suggestions.push({ categoryId: category.id, score });
    }
  }

  return suggestions.sort((a, b) => b.score - a.score);
}
