'use strict';

const fs = require('fs');
const path = require('path');

const FRONTEND_DIR = path.resolve(__dirname, '..', '..', 'frontend');
const INDEX_HTML = path.join(FRONTEND_DIR, 'index.html');
const APP_JS = path.join(FRONTEND_DIR, 'js', 'app.js');
const API_JS = path.join(FRONTEND_DIR, 'js', 'api.js');
const WS_JS = path.join(FRONTEND_DIR, 'js', 'ws.js');

describe('Phase 7 — Frontend Smoke', () => {
  let htmlContent, appContent, apiContent, wsContent;

  beforeAll(() => {
    htmlContent = fs.readFileSync(INDEX_HTML, 'utf8');
    appContent = fs.readFileSync(APP_JS, 'utf8');
    apiContent = fs.readFileSync(API_JS, 'utf8');
    wsContent = fs.readFileSync(WS_JS, 'utf8');
  });

  describe('index.html', () => {
    test('contains nav-admin-health', () => {
      expect(htmlContent).toMatch(/nav-admin-health/);
    });

    test('contains view-admin-health', () => {
      expect(htmlContent).toMatch(/view-admin-health/);
    });

    test('contains notification-banner', () => {
      expect(htmlContent).toMatch(/notification-banner/);
    });

    test('contains health-grid for health cards', () => {
      expect(htmlContent).toMatch(/health-grid/);
    });

    test('contains Admin Health heading', () => {
      expect(htmlContent).toMatch(/Admin Health/);
    });

    test('contains Alert Center view', () => {
      expect(htmlContent).toMatch(/view-alert-center/);
      expect(htmlContent).toMatch(/alert-rules-list/);
      expect(htmlContent).toMatch(/persistent-alerts-list/);
    });

    test('contains export CSV button/link', () => {
      expect(htmlContent).toMatch(/export-audit-csv|Audit CSV/);
    });

    test('contains download report buttons', () => {
      expect(htmlContent).toMatch(/btn-download-report/);
    });

    test('contains paginated sessions in admin health view', () => {
      expect(htmlContent).toMatch(/ah-sessions/);
    });

    test('contains paginated audit in admin health view', () => {
      expect(htmlContent).toMatch(/ah-audit/);
    });
  });

  describe('api.js', () => {
    test('exports getAdminHealth', () => {
      expect(apiContent).toMatch(/getAdminHealth/);
    });

    test('exports getAdminReportJson', () => {
      expect(apiContent).toMatch(/getAdminReportJson/);
    });

    test('exports exportAuditCsv', () => {
      expect(apiContent).toMatch(/exportAuditCsv/);
    });

    test('exports getAdminReportMdUrl', () => {
      expect(apiContent).toMatch(/getAdminReportMdUrl/);
    });

    test('exports Alert Center APIs', () => {
      expect(apiContent).toMatch(/getAlertRules/);
      expect(apiContent).toMatch(/evaluateAlerts/);
      expect(apiContent).toMatch(/markAlertRead/);
      expect(apiContent).toMatch(/getAdminReportSchedule/);
    });

    test('getSessions supports pagination params', () => {
      expect(apiContent).toMatch(/getSessions.*params/s);
    });
  });

  describe('ws.js', () => {
    test('handles auth:session_revoked events', () => {
      expect(wsContent).toMatch(/auth:session_revoked/);
    });

    test('handles system:health_warning events', () => {
      expect(wsContent).toMatch(/system:health_warning/);
    });

    test('handles alert center websocket events', () => {
      expect(wsContent).toMatch(/alert:created/);
      expect(wsContent).toMatch(/alert:read/);
    });

    test('maintains notification history', () => {
      expect(wsContent).toMatch(/_notifications/);
    });

    test('dispatches ws:notification event', () => {
      expect(wsContent).toMatch(/ws:notification/);
    });
  });

  describe('app.js', () => {
    test('routes to admin-health view', () => {
      expect(appContent).toMatch(/admin-health/);
    });

    test('loadAdminHealthView function exists', () => {
      expect(appContent).toMatch(/loadAdminHealthView/);
    });

    test('clearNotifications function exists', () => {
      expect(appContent).toMatch(/clearNotifications/);
    });

    test('renderNotifications function exists', () => {
      expect(appContent).toMatch(/renderNotifications/);
    });

    test('downloadAdminReport function exists', () => {
      expect(appContent).toMatch(/downloadAdminReport/);
    });

    test('Alert Center functions exist', () => {
      expect(appContent).toMatch(/loadAlertCenterView/);
      expect(appContent).toMatch(/createAlertRuleUI/);
      expect(appContent).toMatch(/loadPersistentAlertsUI/);
      expect(appContent).toMatch(/saveReportScheduleUI/);
    });

    test('sessionsPage pagination function exists', () => {
      expect(appContent).toMatch(/sessionsPage/);
    });

    test('ahSessionsPage function exists for admin health', () => {
      expect(appContent).toMatch(/ahSessionsPage/);
    });

    test('ahAuditPage function exists for admin health', () => {
      expect(appContent).toMatch(/ahAuditPage/);
    });
  });
});
