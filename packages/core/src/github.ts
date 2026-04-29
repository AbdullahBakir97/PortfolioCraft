import { graphql } from '@octokit/graphql';
import { retry } from '@octokit/plugin-retry';
import { throttling } from '@octokit/plugin-throttling';
import { Octokit } from '@octokit/rest';

// The plugin-extended class keeps the same API surface as `Octokit` for our purposes;
// casting back avoids leaking pnpm-store deep import paths into emitted .d.ts.
const ThrottledOctokit = Octokit.plugin(throttling, retry) as typeof Octokit;

export interface GitHubClientOptions {
  token: string;
  userAgent?: string;
  baseUrl?: string;
}

export interface GitHubClient {
  rest: Octokit;
  graphql: typeof graphql;
}

export function createGitHubClient(options: GitHubClientOptions): GitHubClient {
  const { token, userAgent = 'devportfolio/1.0', baseUrl } = options;

  const rest = new ThrottledOctokit({
    auth: token,
    userAgent,
    ...(baseUrl ? { baseUrl } : {}),
    throttle: {
      onRateLimit: (_retryAfter, _opts, _octokit, retryCount) => retryCount < 2,
      onSecondaryRateLimit: (_retryAfter, _opts, _octokit, retryCount) => retryCount < 1,
    },
  });

  const graphqlWithAuth = graphql.defaults({
    headers: { authorization: `token ${token}`, 'user-agent': userAgent },
    ...(baseUrl ? { baseUrl } : {}),
  });

  return { rest, graphql: graphqlWithAuth };
}
