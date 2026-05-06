'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const monitorPath = path.join(repoRoot, 'backend', 'src', 'monitoring', 'updateMonitor.js');

function freshMonitor() {
  jest.resetModules();
  delete process.env.UPDATE_MONITOR_ENABLED;
  delete process.env.UPDATE_MONITOR_INTERVAL_MS;
  delete process.env.UPDATE_FEED_URL;
  return require('../src/monitoring/updateMonitor');
}

describe('Phase 12 update monitor', () => {
  afterEach(() => {
    try {
      require('../src/monitoring/updateMonitor').stop();
    } catch {}
    delete process.env.UPDATE_MONITOR_ENABLED;
    delete process.env.UPDATE_MONITOR_INTERVAL_MS;
    delete process.env.UPDATE_FEED_URL;
  });

  test('updateMonitor.js exists', () => {
    expect(fs.existsSync(monitorPath)).toBe(true);
  });

  test('exports start, stop, runOnce, and getStatus', () => {
    const monitor = freshMonitor();

    expect(typeof monitor.start).toBe('function');
    expect(typeof monitor.stop).toBe('function');
    expect(typeof monitor.runOnce).toBe('function');
    expect(typeof monitor.getStatus).toBe('function');
  });

  test('start does not create a timer when UPDATE_MONITOR_ENABLED is absent or false', () => {
    const monitor = freshMonitor();

    expect(monitor.start().running).toBe(false);

    process.env.UPDATE_MONITOR_ENABLED = 'false';
    expect(monitor.start().running).toBe(false);
  });

  test('getStatus returns enabled and running', () => {
    const monitor = freshMonitor();
    const status = monitor.getStatus();

    expect(status).toHaveProperty('enabled');
    expect(status).toHaveProperty('running');
    expect(status.enabled).toBe(false);
    expect(status.running).toBe(false);
  });

  test('runOnce without UPDATE_FEED_URL returns local result without update', async () => {
    const monitor = freshMonitor();
    const result = await monitor.runOnce();

    expect(result.updateAvailable).toBe(false);
    expect(result.feedAvailable).toBe(false);
    expect(result.currentVersion).toBeTruthy();
  });

  test('stop does not throw', () => {
    const monitor = freshMonitor();

    expect(() => monitor.stop()).not.toThrow();
  });

  test('code does not include automatic installation behavior', () => {
    const content = fs.readFileSync(monitorPath, 'utf8');

    expect(content).not.toMatch(/Expand-Archive/i);
    expect(content).not.toMatch(/Get-FileHash/i);
    expect(content).not.toMatch(/child_process/i);
    expect(content).not.toMatch(/\bexec(File|Sync)?\b/);
    expect(content).not.toMatch(/update-install\.ps1/i);
  });
});
