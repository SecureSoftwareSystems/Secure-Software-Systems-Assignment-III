import fs from 'fs';
import path from 'path';

export type LogLevel = 'INFO' | 'WARNING' | 'ERROR';

export interface LogEntry {
  event: string;
  outcome: 'success' | 'failure';
  level?: LogLevel;
  userId?: string | number;
  requestId?: string;
  details?: Record<string, unknown>;
}

const SENSITIVE = ['password', 'passwordhash', 'token', 'jwt', 'authorization', 'secret'];

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SENSITIVE.some((s) => k.toLowerCase().includes(s)) ? '[REDACTED]' : redact(v),
      ])
    );
  }
  return value;
}

export function logEvent(entry: LogEntry): void {
  const record = {
    timestamp: new Date().toISOString(),
    level: entry.level ?? 'INFO',
    event: entry.event,
    outcome: entry.outcome,
    userId: entry.userId,
    requestId: entry.requestId,
    details: entry.details ? redact(entry.details) : undefined,
  };
  try {
    const file = process.env.LOG_FILE ?? path.join('logs', 'app.log');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(record) + '\n');
  } catch (err) {
    // Logging must never crash the app.
    console.error('Logging failed:', err);
  }
}