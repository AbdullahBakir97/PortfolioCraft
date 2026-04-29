import type { Repository, ScoreWeights, StackEntry } from './schemas.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const RECENCY_HALF_LIFE_DAYS = 365;
const MATURITY_FULL_AGE_DAYS = 365 * 2;

export interface ScoringContext {
  weights: ScoreWeights;
  now: Date;
}

export function recencyScore(pushedAt: string, now: Date): number {
  const ageDays = (now.getTime() - Date.parse(pushedAt)) / ONE_DAY_MS;
  if (ageDays <= 0) return 1;
  return 0.5 ** (ageDays / RECENCY_HALF_LIFE_DAYS);
}

export function maturityScore(repo: Repository, now: Date): number {
  const ageDays = (now.getTime() - Date.parse(repo.createdAt)) / ONE_DAY_MS;
  const ageFactor = Math.min(1, Math.max(0, ageDays / MATURITY_FULL_AGE_DAYS));
  const starFactor = Math.min(1, Math.log10(repo.stargazerCount + 1) / 2);
  return 0.6 * ageFactor + 0.4 * starFactor;
}

export function scoreStack(repos: Repository[], ctx: ScoringContext): StackEntry[] {
  const byLanguage = new Map<
    string,
    { loc: number; recency: number; maturity: number; weight: number }
  >();

  for (const repo of repos) {
    const recency = recencyScore(repo.pushedAt, ctx.now);
    const maturity = maturityScore(repo, ctx.now);
    for (const lang of repo.languages) {
      if (lang.bytes <= 0) continue;
      const existing = byLanguage.get(lang.name);
      const next = existing ?? { loc: 0, recency: 0, maturity: 0, weight: 0 };
      next.loc += lang.bytes;
      next.recency += recency * lang.bytes;
      next.maturity += maturity * lang.bytes;
      next.weight += lang.bytes;
      byLanguage.set(lang.name, next);
    }
  }

  const entries: StackEntry[] = [];
  for (const [language, agg] of byLanguage) {
    const w = agg.weight || 1;
    const recency = agg.recency / w;
    const maturity = agg.maturity / w;
    const locNorm = normalizeLoc(agg.loc);
    const score =
      ctx.weights.loc * locNorm + ctx.weights.recency * recency + ctx.weights.maturity * maturity;
    entries.push({
      language,
      score,
      loc: agg.loc,
      recency,
      maturity,
      tier: tierFor(score),
    });
  }

  entries.sort((a, b) => b.score - a.score);
  return entries;
}

export function normalizeLoc(bytes: number): number {
  if (bytes <= 0) return 0;
  return Math.min(1, Math.log10(bytes + 1) / 7);
}

export function tierFor(score: number): StackEntry['tier'] {
  if (score >= 0.7) return 'expert';
  if (score >= 0.5) return 'proficient';
  if (score >= 0.3) return 'familiar';
  return 'exposed';
}
