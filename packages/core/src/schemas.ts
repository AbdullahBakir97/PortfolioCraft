import { z } from 'zod';
import { AuditConfig, Severity } from './audit/schemas.js';

export const Locale = z.enum(['en', 'ar']);
export type Locale = z.infer<typeof Locale>;

export const SectionId = z.enum(['header', 'stack', 'projects', 'activity']);
export type SectionId = z.infer<typeof SectionId>;

export const Domain = z.enum(['backend', 'frontend', 'devops', 'ml', 'mobile', 'unknown']);
export type Domain = z.infer<typeof Domain>;

export const ScoreWeights = z
  .object({
    loc: z.number().min(0).max(1).default(0.5),
    recency: z.number().min(0).max(1).default(0.3),
    maturity: z.number().min(0).max(1).default(0.2),
  })
  .refine((w) => Math.abs(w.loc + w.recency + w.maturity - 1) < 1e-6, {
    message: 'weights must sum to 1.0',
  });
export type ScoreWeights = z.infer<typeof ScoreWeights>;

export const FilterRules = z.object({
  exclude_archived: z.boolean().default(true),
  exclude_forks: z.boolean().default(true),
  exclude_topics: z.array(z.string()).default(['tutorial', 'exercise', 'homework']),
  min_stars: z.number().int().nonnegative().default(0),
});
export type FilterRules = z.infer<typeof FilterRules>;

export const ProjectsConfig = z.object({
  pinned_first: z.boolean().default(true),
  max: z.number().int().positive().max(50).default(6),
});
export type ProjectsConfig = z.infer<typeof ProjectsConfig>;

export const PortfolioConfig = z.object({
  sections: z.array(SectionId).default(['header', 'stack', 'projects', 'activity']),
  locale: Locale.default('en'),
  filters: FilterRules.default({
    exclude_archived: true,
    exclude_forks: true,
    exclude_topics: ['tutorial', 'exercise', 'homework'],
    min_stars: 0,
  }),
  weights: ScoreWeights.default({ loc: 0.5, recency: 0.3, maturity: 0.2 }),
  projects: ProjectsConfig.default({ pinned_first: true, max: 6 }),
  // Backward compatible: existing configs without `audit:` validate by
  // falling through to the AuditConfig defaults.
  audit: AuditConfig.default(AuditConfig.parse({})),
});
export type PortfolioConfig = z.infer<typeof PortfolioConfig>;

export const ActionInputs = z.object({
  token: z.string().min(1, 'token is required'),
  user: z.string().default(''),
  sections: z.string().default('header,stack,projects,activity'),
  locale: Locale.default('en'),
  outputReadme: z.string().default('README.md'),
  outputJson: z.string().default('profile.json'),
  outputPdf: z.string().default('cv.pdf'),
  outputSvgDir: z.string().default('assets/cards'),
  configFile: z.string().default('.portfoliocraft.yml'),
  commit: z.boolean().default(true),
  commitMessage: z.string().default('chore: refresh portfolio'),
  dryRun: z.boolean().default(false),
  explain: z.boolean().default(false),
  // v0.2 audit-mode inputs. `mode` defaults to 'portfolio' so existing v0.1
  // workflows are unaffected. v0.4 widens the enum with 'summary' (run only
  // the application-summary phase) and 'all' (portfolio + audit + summary).
  // 'both' is preserved verbatim — portfolio + audit only — so v0.2/v0.3
  // workflows keep their exact behaviour.
  mode: z.enum(['portfolio', 'audit', 'both', 'summary', 'all']).default('portfolio'),
  auditOutputMd: z.string().default('audit.md'),
  auditOutputJson: z.string().default('audit.json'),
  auditFailOn: z.union([Severity, z.literal('')]).default(''),
  // v0.4 audit-check-run input: post a GitHub Checks API summary for the
  // audit phase. Defaults true; tolerated as a no-op when the workflow lacks
  // `permissions: checks: write` (warns and continues).
  auditCheckRun: z.boolean().default(true),
  // v0.4 summary-mode inputs. Defaults are chosen so that turning `mode` to
  // 'summary' or 'all' renders all three artifacts at sensible paths without
  // any further configuration.
  summaryFormat: z.enum(['cv', 'uni', 'case-studies', 'all']).default('all'),
  summaryOutputCv: z.string().default('summary-cv.md'),
  summaryOutputUni: z.string().default('summary-uni.md'),
  summaryOutputCaseStudies: z.string().default('summary-case-studies.md'),
  summaryProjectsMax: z.number().int().positive().max(20).default(6),
});
export type ActionInputs = z.infer<typeof ActionInputs>;

export const RepoLanguage = z.object({
  name: z.string(),
  bytes: z.number().int().nonnegative(),
});
export type RepoLanguage = z.infer<typeof RepoLanguage>;

export const Repository = z.object({
  name: z.string(),
  nameWithOwner: z.string(),
  description: z.string().nullable(),
  url: z.string().url(),
  homepageUrl: z.string().url().nullable(),
  primaryLanguage: z.string().nullable(),
  languages: z.array(RepoLanguage),
  topics: z.array(z.string()),
  stargazerCount: z.number().int().nonnegative(),
  forkCount: z.number().int().nonnegative(),
  isFork: z.boolean(),
  isArchived: z.boolean(),
  isPrivate: z.boolean(),
  pushedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  isPinned: z.boolean().default(false),
});
export type Repository = z.infer<typeof Repository>;

export const UserProfile = z.object({
  login: z.string(),
  name: z.string().nullable(),
  bio: z.string().nullable(),
  company: z.string().nullable(),
  location: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  avatarUrl: z.string().url(),
  followers: z.number().int().nonnegative(),
  publicRepos: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export type UserProfile = z.infer<typeof UserProfile>;

export const ContributionSummary = z.object({
  totalCommits: z.number().int().nonnegative(),
  totalPRs: z.number().int().nonnegative(),
  totalIssues: z.number().int().nonnegative(),
  totalReviews: z.number().int().nonnegative(),
  reposContributedTo: z.number().int().nonnegative(),
});
export type ContributionSummary = z.infer<typeof ContributionSummary>;

export const Snapshot = z.object({
  fetchedAt: z.string().datetime(),
  user: UserProfile,
  repositories: z.array(Repository),
  contributions: ContributionSummary,
});
export type Snapshot = z.infer<typeof Snapshot>;

export const StackEntry = z.object({
  language: z.string(),
  score: z.number().nonnegative(),
  loc: z.number().int().nonnegative(),
  recency: z.number().min(0).max(1),
  maturity: z.number().min(0).max(1),
  tier: z.enum(['expert', 'proficient', 'familiar', 'exposed']),
});
export type StackEntry = z.infer<typeof StackEntry>;

export const ProjectEntry = z.object({
  repository: Repository,
  significance: z.number().nonnegative(),
  domain: Domain,
  reasons: z.array(z.string()),
});
export type ProjectEntry = z.infer<typeof ProjectEntry>;

export const PortfolioReport = z.object({
  generatedAt: z.string().datetime(),
  config: PortfolioConfig,
  snapshot: Snapshot,
  stack: z.array(StackEntry),
  projects: z.array(ProjectEntry),
  summary: z.string(),
});
export type PortfolioReport = z.infer<typeof PortfolioReport>;
