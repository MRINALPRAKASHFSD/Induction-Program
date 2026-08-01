import React from 'react';
import type { HelpArticle } from './help-center-data';

/**
 * Filter articles by category ID and optional search query.
 */
export function filterArticles(
  articles: HelpArticle[],
  categoryId: string | null,
  searchQuery: string
): HelpArticle[] {
  const query = searchQuery.trim().toLowerCase();

  return articles.filter((article) => {
    // 1. Check category filter (unless null or 'all')
    const matchesCategory =
      !categoryId || categoryId === 'all' || article.categoryId === categoryId;
    if (!matchesCategory) return false;

    // 2. Check search query filter
    if (!query) return true;

    const inTitle = article.title.toLowerCase().includes(query);
    const inSummary = article.summary.toLowerCase().includes(query);
    const inKeywords = article.keywords.some((kw) =>
      kw.toLowerCase().includes(query)
    );
    const inSteps = article.steps.some(
      (step) =>
        step.title.toLowerCase().includes(query) ||
        step.description.toLowerCase().includes(query)
    );

    return inTitle || inSummary || inKeywords || inSteps;
  });
}

/**
 * Highlights matching search terms inside a text string using React nodes (<mark> tag).
 */
export function highlightMatches(
  text: string,
  query: string
): React.ReactNode {
  const cleanQuery = query.trim();
  if (!cleanQuery) return text;

  // Escape special regex characters in the query
  const escapedQuery = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (part.toLowerCase() === cleanQuery.toLowerCase()) {
      return React.createElement(
        'mark',
        {
          key: index,
          className:
            'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 px-0.5 py-0.5 rounded font-medium',
        },
        part
      );
    }
    return part;
  });
}

/**
 * Retrieves related articles based on explicit relatedIds or falls back to same category.
 */
export function getRelatedArticles(
  article: HelpArticle,
  allArticles: HelpArticle[],
  limit = 3
): HelpArticle[] {
  const related: HelpArticle[] = [];
  const addedIds = new Set<string>([article.id]);

  // 1. Explicit related IDs
  if (article.relatedIds && article.relatedIds.length > 0) {
    for (const relId of article.relatedIds) {
      const found = allArticles.find((a) => a.id === relId);
      if (found && !addedIds.has(found.id)) {
        related.push(found);
        addedIds.add(found.id);
        if (related.length >= limit) return related;
      }
    }
  }

  // 2. Fallback to same category
  for (const item of allArticles) {
    if (item.categoryId === article.categoryId && !addedIds.has(item.id)) {
      related.push(item);
      addedIds.add(item.id);
      if (related.length >= limit) return related;
    }
  }

  return related;
}

/**
 * Calculates article counts per category ID.
 */
export function getCategoryCounts(
  articles: HelpArticle[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const article of articles) {
    counts[article.categoryId] = (counts[article.categoryId] || 0) + 1;
  }
  return counts;
}

/**
 * Suggested search keywords for empty search states.
 */
export function getSuggestedKeywords(_query?: string): string[] {
  return [
    'attendance',
    'password',
    'verification',
    'hostel',
    'QR',
    'schedule',
    'clubs',
    'wifi',
  ];
}

/**
 * Copies a deep link to an article to the user's clipboard.
 */
export async function copyArticleLink(articleId: string): Promise<boolean> {
  try {
    const url = `${window.location.origin}${window.location.pathname}#article-${articleId}`;
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses deep link hash from window.location (e.g. '#article-ATTENDANCE_SCAN_QR')
 */
export function parseDeepLink(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  if (hash && hash.startsWith('#article-')) {
    return hash.replace('#article-', '');
  }
  return null;
}
