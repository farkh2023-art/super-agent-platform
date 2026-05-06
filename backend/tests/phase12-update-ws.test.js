'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Phase 12 update WebSocket static wiring', () => {
  const wsNotifications = read('backend/src/notifications/wsNotifications.js');
  const frontendWs = read('frontend/js/ws.js');

  test('backend notification helper broadcasts update_available', () => {
    expect(wsNotifications).toContain('updateAvailable');
    expect(wsNotifications).toContain('update_available');
  });

  test('frontend ws handles update_available and displays banner', () => {
    expect(frontendWs).toContain('update_available');
    expect(frontendWs).toMatch(/showUpdateBanner|update-banner/);
  });

  test('frontend ws does not contain automatic installation logic', () => {
    expect(frontendWs).not.toMatch(/child_process|powershell|cmd\.exe|spawn\(|exec\(/i);
  });
});
