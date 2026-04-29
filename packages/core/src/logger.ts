import { type Logger, pino, stdTimeFunctions } from 'pino';

export type { Logger };

export interface LoggerOptions {
  level?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  pretty?: boolean;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? 'info';
  const transport = options.pretty
    ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
    : undefined;

  return pino({
    level,
    base: { app: 'devportfolio' },
    timestamp: stdTimeFunctions.isoTime,
    ...(transport ? { transport } : {}),
  });
}
