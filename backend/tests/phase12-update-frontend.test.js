'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Phase 12 update frontend static wiring', () => {
  const apiJs = read('frontend/js/api.js');
  const appJs = read('frontend/js/app.js');
  const indexHtml = read('frontend/index.html');

  test('api.js exposes update API methods', () => {
    expect(apiJs).toContain('checkUpdate');
    expect(apiJs).toContain('dismissUpdate');
    expect(apiJs).toContain('getUpdateHistory');
    expect(apiJs).toContain('/update/check');
    expect(apiJs).toContain('/update/dismiss');
    expect(apiJs).toContain('/update/history');
  });

  test('index.html contains update banner and update center view', () => {
    expect(indexHtml).toContain('id="update-banner"');
    expect(indexHtml).toContain('id="update-banner-message"');
    expect(indexHtml).toContain('id="update-view-details"');
    expect(indexHtml).toContain('id="update-dismiss"');
    expect(indexHtml).toMatch(/id="(?:update-center-view|about-view)"/);
    expect(indexHtml).toContain('id="current-version"');
    expect(indexHtml).toContain('id="latest-version"');
    expect(indexHtml).toContain('id="update-status"');
    expect(indexHtml).toContain('id="update-history-list"');
  });

  test('app.js contains update UI functions and API calls', () => {
    expect(appJs).toContain('initUpdateCheck');
    expect(appJs).toContain('showUpdateBanner');
    expect(appJs).toContain('dismissUpdateBanner');
    expect(appJs).toContain('loadUpdateCenterView');
    expect(appJs).toContain('API.checkUpdate');
    expect(appJs).toContain('API.dismissUpdate');
    expect(appJs).toContain('API.getUpdateHistory');
  });

  test('app.js does not contain automatic installer execution logic', () => {
    expect(appJs).not.toMatch(/child_process|powershell|cmd\.exe/i);
  });
});
