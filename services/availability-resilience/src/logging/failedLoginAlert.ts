import { logEvent } from './logger';

export class FailedLoginMonitor {
  private attempts: number[] = [];

  constructor(private windowMs = 60_000, private threshold = 5) {}


  record(userId?: string | number, now: number = Date.now()): boolean {
    this.attempts.push(now);
    this.attempts = this.attempts.filter((t) => now - t < this.windowMs);

    logEvent({ event: 'login_failed', outcome: 'failure', userId });

    if (this.attempts.length > this.threshold) {
      logEvent({
        level: 'WARNING',
        event: 'failed_login_threshold_exceeded',
        outcome: 'failure',
        details: { attempts: this.attempts.length, windowSeconds: this.windowMs / 1000 },
      });
      return true;
    }
    return false;
  }
}

export const failedLoginMonitor = new FailedLoginMonitor();