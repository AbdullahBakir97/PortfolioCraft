import { describe, expect, it } from 'vitest';
import { isRetryableError, withRetry } from '../src/retry.js';

/** Throw something octokit-shaped: { status, message }. */
function httpError(status: number, message = 'kaboom'): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

/** Throw something net-error-shaped: { code }. */
function netError(code: string): Error & { code: string } {
  const err = new Error(code) as Error & { code: string };
  err.code = code;
  return err;
}

/** Throw something graphql-error-shaped: { name }. */
function gqlError(message: string): Error & { name: string } {
  const err = new Error(message) as Error & { name: string };
  err.name = 'GraphqlResponseError';
  return err;
}

/** A callable that resolves on the Nth call, failing with the given error before that. */
function failNTimes<T>(
  n: number,
  err: () => unknown,
  finalValue: T,
): {
  fn: () => Promise<T>;
  calls: () => number;
} {
  let calls = 0;
  const fn = async (): Promise<T> => {
    calls += 1;
    if (calls <= n) throw err();
    return finalValue;
  };
  return { fn, calls: () => calls };
}

const noSleep = async (_ms: number): Promise<void> => {
  // Tests don't actually wait; backoff is mathematically verified separately.
};

describe('isRetryableError', () => {
  it('retries 5xx server errors', () => {
    expect(isRetryableError(httpError(500))).toBe(true);
    expect(isRetryableError(httpError(502))).toBe(true);
    expect(isRetryableError(httpError(503))).toBe(true);
    expect(isRetryableError(httpError(504))).toBe(true);
    expect(isRetryableError(httpError(599))).toBe(true);
  });

  it('retries 408 (timeout) and 429 (rate limit)', () => {
    expect(isRetryableError(httpError(408))).toBe(true);
    expect(isRetryableError(httpError(429))).toBe(true);
  });

  it('does NOT retry 4xx auth/not-found/validation', () => {
    expect(isRetryableError(httpError(400))).toBe(false);
    expect(isRetryableError(httpError(401))).toBe(false);
    expect(isRetryableError(httpError(403))).toBe(false);
    expect(isRetryableError(httpError(404))).toBe(false);
    expect(isRetryableError(httpError(422))).toBe(false);
  });

  it('retries known transient net errors', () => {
    expect(isRetryableError(netError('ECONNRESET'))).toBe(true);
    expect(isRetryableError(netError('ETIMEDOUT'))).toBe(true);
    expect(isRetryableError(netError('ENOTFOUND'))).toBe(true);
    expect(isRetryableError(netError('EAI_AGAIN'))).toBe(true);
  });

  it('does NOT retry unknown net codes', () => {
    expect(isRetryableError(netError('EWHATEVER'))).toBe(false);
  });

  it('retries GraphqlResponseError when message hints at 5xx', () => {
    expect(isRetryableError(gqlError('upstream said 502 Bad Gateway'))).toBe(true);
    expect(isRetryableError(gqlError('Service Unavailable'))).toBe(true);
    expect(isRetryableError(gqlError('Gateway Timeout (504)'))).toBe(true);
  });

  it('does NOT retry GraphqlResponseError without 5xx hint', () => {
    expect(isRetryableError(gqlError('Variable $login of type String! was not provided'))).toBe(
      false,
    );
  });

  it('does NOT retry plain errors with no status / code', () => {
    expect(isRetryableError(new Error('something blew up'))).toBe(false);
    expect(isRetryableError('string error')).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});

describe('withRetry', () => {
  it('returns the value when fn succeeds on first try', async () => {
    const { fn, calls } = failNTimes(0, () => httpError(502), 'ok');
    expect(await withRetry(fn, { sleep: noSleep })).toBe('ok');
    expect(calls()).toBe(1);
  });

  it('retries through transient errors and returns the eventual value', async () => {
    const { fn, calls } = failNTimes(2, () => httpError(502), 'finally');
    expect(await withRetry(fn, { sleep: noSleep, maxAttempts: 4 })).toBe('finally');
    expect(calls()).toBe(3);
  });

  it('gives up after maxAttempts and throws the last error', async () => {
    const { fn, calls } = failNTimes(99, () => httpError(503), 'never');
    await expect(withRetry(fn, { sleep: noSleep, maxAttempts: 3 })).rejects.toMatchObject({
      status: 503,
    });
    expect(calls()).toBe(3);
  });

  it('does NOT retry non-retryable errors — single attempt', async () => {
    const { fn, calls } = failNTimes(99, () => httpError(401), 'never');
    await expect(withRetry(fn, { sleep: noSleep, maxAttempts: 5 })).rejects.toMatchObject({
      status: 401,
    });
    expect(calls()).toBe(1);
  });

  it('calls onRetry once per retry attempt with monotonically increasing delays', async () => {
    const events: Array<{ attempt: number; delay: number }> = [];
    const { fn } = failNTimes(2, () => httpError(502), 'ok');
    await withRetry(fn, {
      sleep: noSleep,
      maxAttempts: 4,
      baseDelayMs: 100,
      onRetry: (_err, attempt, delay) => events.push({ attempt, delay }),
    });
    expect(events).toHaveLength(2);
    expect(events[0]?.attempt).toBe(1);
    expect(events[1]?.attempt).toBe(2);
    // baseDelay * 2^attempt grows; jitter is at most 100ms so the gap holds.
    const d0 = events[0]?.delay ?? 0;
    const d1 = events[1]?.delay ?? 0;
    expect(d1).toBeGreaterThan(d0);
  });

  it('exponential backoff: delay grows roughly 2x per attempt (modulo jitter)', async () => {
    const events: number[] = [];
    const { fn } = failNTimes(99, () => httpError(503), 'never');
    await withRetry(fn, {
      sleep: noSleep,
      maxAttempts: 4,
      baseDelayMs: 1000,
      onRetry: (_err, _attempt, delay) => events.push(delay),
    }).catch(() => undefined);
    // Three retries between 4 attempts. Delays: 1000+j, 2000+j, 4000+j.
    expect(events).toHaveLength(3);
    const [a, b, c] = events;
    expect(a).toBeGreaterThanOrEqual(1000);
    expect(a).toBeLessThan(1100);
    expect(b).toBeGreaterThanOrEqual(2000);
    expect(b).toBeLessThan(2100);
    expect(c).toBeGreaterThanOrEqual(4000);
    expect(c).toBeLessThan(4100);
  });
});
