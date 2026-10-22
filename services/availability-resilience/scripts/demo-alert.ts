import { FailedLoginMonitor } from '../src/logging/failedLoginAlert';

const monitor = new FailedLoginMonitor();
for (let i = 1; i <= 6; i++) {
  const alerted = monitor.record(1);
  console.log(`Failed login #${i} -> alert raised: ${alerted}`);
}