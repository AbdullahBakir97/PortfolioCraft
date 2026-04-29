import type { FilterRules, Repository } from './schemas.js';

export interface FilterDecision {
  repository: Repository;
  kept: boolean;
  reasons: string[];
}

const TUTORIAL_HINTS = ['tutorial', 'learning', 'practice', 'exercise', 'homework', 'sandbox'];

export function applyFilters(repos: Repository[], rules: FilterRules): FilterDecision[] {
  return repos.map((repository) => {
    const reasons: string[] = [];

    if (rules.exclude_archived && repository.isArchived) reasons.push('archived');
    if (rules.exclude_forks && repository.isFork) reasons.push('fork');
    if (repository.stargazerCount < rules.min_stars) {
      reasons.push(`stars<${rules.min_stars}`);
    }

    const lowerTopics = repository.topics.map((t) => t.toLowerCase());
    const excludedHits = rules.exclude_topics
      .map((t) => t.toLowerCase())
      .filter((t) => lowerTopics.includes(t));
    for (const hit of excludedHits) reasons.push(`topic:${hit}`);

    const lowerName = repository.name.toLowerCase();
    if (TUTORIAL_HINTS.some((hint) => lowerName.includes(hint))) {
      reasons.push('tutorial-shaped-name');
    }

    return { repository, kept: reasons.length === 0, reasons };
  });
}

export function keptRepos(decisions: FilterDecision[]): Repository[] {
  return decisions.filter((d) => d.kept).map((d) => d.repository);
}
