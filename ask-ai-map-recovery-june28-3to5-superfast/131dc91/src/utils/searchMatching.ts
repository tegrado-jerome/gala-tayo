import { CATEGORY_KEYWORDS, SEARCH_STOP_WORDS } from "./categoryKeywords";

const stopWordSet = new Set(SEARCH_STOP_WORDS.map((word) => normalizeSearchText(word)));

export function normalizeSearchText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_/.,!?()[\]{}'"`~:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getSearchTerms(input: string): string[] {
  return normalizeSearchText(input)
    .split(" ")
    .filter((term) => term.length >= 2 && !stopWordSet.has(term));
}

export function removeStopWords(input: string): string {
  return getSearchTerms(input).join(" ");
}

function hasKeywordMatch(normalizedInput: string, keyword: string): boolean {
  const normalizedKeyword = normalizeSearchText(keyword);

  if (!normalizedKeyword || stopWordSet.has(normalizedKeyword)) {
    return false;
  }

  if (normalizedKeyword.includes(" ")) {
    return normalizedInput.includes(normalizedKeyword);
  }

  return new RegExp(`(^|\\s)${escapeRegExp(normalizedKeyword)}($|\\s)`).test(
    normalizedInput
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function inferCategoryIdsFromQuery(query: string): string[] {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return [];
  }

  return Object.entries(CATEGORY_KEYWORDS)
    .filter(([, keywords]) =>
      keywords.some((keyword) => hasKeywordMatch(normalizedQuery, keyword))
    )
    .map(([categoryId]) => categoryId);
}

export function matchCategoryKeywords(query: string, categoryId: string): boolean {
  const keywords = CATEGORY_KEYWORDS[categoryId];

  if (!keywords) {
    return false;
  }

  const normalizedQuery = normalizeSearchText(query);

  return keywords.some((keyword) => hasKeywordMatch(normalizedQuery, keyword));
}
