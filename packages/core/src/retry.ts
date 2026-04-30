/**
 * Tiny retry-with-backoff helper for transient errors. Used to wrap raw
 * GraphQL calls — the @octokit/plugin-retry plugin only attaches to the
 * REST client; GraphQL has no equivalent, so this fills the gap.
 *
 * Retried error classes:
 *   - HTTP 5xx (server)
 *   - HTTP 429 (rate limit)
 *   - HTTP 408 (request timeout)
 *   - Node net errors: ECONNRESET, ETIMEDOUT, ENOTFOUND, EAI_AGAIN
 *   - Octokit GraphqlResponseError whose message contains 502/503/504
 *     (some GitHub failures surface as GraphQL errors with HTML in the
 *     message rather than as proper HTTP errors)
 *
 * NOT retried:
 *   - 4xx other than 408/429 (auth / not-found / validation are caller bugs)
 *   - Plain Error with no status / code (probably a code bug, not transient)
 */

const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BASE_DELAY_MS = 500;
const RETRYABLE_NET_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN']);
const RETRYABLE_STATUS = new Set([408, 429]);

export interface RetryOptions {
  /** 1 + N retries. Default 4 (1 initial + 3 retries). */
  maxAttempts?: number;
  /** First retry delay in ms; doubles each attempt. Default 500. */
  baseDelayMs?: number;
  /** Optional sleep override — pass a fake-timer-friendly setter in tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Called with (err, attempt, nextDelayMs) before each retry. */
  onRetry?: (err: unknown, attempt: number, nextDelayMs: number) => void;
}

export function isRetryableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;

  const status = (err as { status?: number }).status;
  if (typeof status === 'number') {
    if (status >= 500 && status < 600) return true;
    if (RETRYABLE_STATUS.has(status)) return true;
    return false;
  }

  const code = (err as { code?: string }).code;
  if (typeof code === 'string' && RETRYABLE_NET_CODES.has(code)) return true;

  const name = (err as { name?: string }).name;
  if (name === 'GraphqlResponseError' || name === 'GraphQLError') {
    const msg = String((err as { message?: string }).message ?? '');
    if (/\b(502|503|504)\b|bad gateway|gateway timeout|service unavailable/i.test(msg)) {
      return true;
    }
  }

  return false;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn`, retrying on transient errors. Throws the last error after
 * exhausting attempts. Non-retryable errors propagate immediately.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const sleep = opts.sleep ?? defaultSleep;

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isLastAttempt = attempt === maxAttempts - 1;
      if (isLastAttempt || !isRetryableError(err)) throw err;
      // Exponential backoff with jitter. The jitter (0-100ms) avoids
      // synchronized retries when many runs hit a brief outage at once.
      const delayMs = baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 100);
      opts.onRetry?.(err, attempt + 1, delayMs);
      await sleep(delayMs);
    }
  }
  throw lastErr;
}
