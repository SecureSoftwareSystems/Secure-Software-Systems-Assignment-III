import fs from 'fs';
import os from 'os';
import path from 'path';
import { logEvent } from '../src/logging/logger';
import { FailedLoginMonitor } from '../src/logging/failedLoginAlert';

let dir: string;
let logFile: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-'));
  logFile = path.join(dir, 'app.log');
  process.env.LOG_FILE = logFile;
});

afterEach(() => {
  delete process.env.LOG_FILE;
  fs.rmSync(dir, { recursive: true, force: true });
});

export const readLog = (file: string) =>
  fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

describe('logger', () => {
  it('writes valid JSON with the expected fields', () => {
    logEvent({ event: 'exclusion_created', outcome: 'success', userId: 3 });
    const [entry] = readLog(logFile);
    expect(entry).toMatchObject({ level: 'INFO', event: 'exclusion_created', outcome: 'success', userId: 3 });
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
  });

  it('redacts passwords and tokens', () => {
    logEvent({
      event: 'login_failed',
      outcome: 'failure',
      details: { username: 'bob', password: 'hunter2', jwt: 'abc.def.ghi' },
    });
    const raw = fs.readFileSync(logFile, 'utf8');
    expect(raw).not.toContain('hunter2');
    expect(raw).not.toContain('abc.def.ghi');
    expect(readLog(logFile)[0].details.password).toBe('[REDACTED]');
  });

  it('does not throw when the log file cannot be written', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fs.writeFileSync(path.join(dir, 'blocker'), 'x');
    process.env.LOG_FILE = path.join(dir, 'blocker', 'app.log'); // parent is a file
    expect(() => logEvent({ event: 'x', outcome: 'success' })).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('failed login alert', () => {
  const base = 1_000_000;
  const warnings = () =>
    readLog(logFile).filter((e) => e.level === 'WARNING' && e.event === 'failed_login_threshold_exceeded');

  it('does not warn at 5 failures within a minute', () => {
    const m = new FailedLoginMonitor();
    for (let i = 0; i < 5; i++) expect(m.record(1, base + i * 1000)).toBe(false);
    expect(warnings()).toHaveLength(0);
  });

  it('warns on the 6th failure within a minute', () => {
    const m = new FailedLoginMonitor();
    for (let i = 0; i < 5; i++) m.record(1, base + i * 1000);
    expect(m.record(1, base + 5000)).toBe(true);
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0].details).toMatchObject({ attempts: 6, windowSeconds: 60 });
  });

  it('does not warn when failures are spread beyond the window', () => {
    const m = new FailedLoginMonitor();
    for (let i = 0; i < 8; i++) m.record(1, base + i * 20_000);
    expect(warnings()).toHaveLength(0);
  });
});