# Phase 7B - Alerts and Scheduled Admin Reports

Phase 7B extends the Phase 7 observability surface with a persistent Alert Center.

## Scope

- Alert rule CRUD under `/api/admin/alert-rules`.
- Persistent notifications stored in the `notifications` collection.
- Alert evaluation with per-rule cooldown.
- WebSocket events:
  - `alert:created`
  - `alert:read`
- Scheduled admin report configuration and manual trigger.
- Backup inclusion for `alert_rules.json` and `notifications.json`.
- Single-user compatibility through the existing `requireAuth` / `requireRole` behavior.

## Alert Rules

Rules compare a named metric from the admin health report snapshot against a numeric threshold.

Supported operators:

- `>`
- `>=`
- `<`
- `<=`
- `==`
- `!=`

Supported metrics include:

- `warningsCount`
- `heapUsedRatio`
- `heapUsedMb`
- `rssMb`
- `desyncAlerts`
- `activeSessions`
- `blacklistCount`
- `memoryItems`
- `embeddingsCount`
- `schedulesCount`

Each rule has `cooldownMs`; if the condition remains true, a new notification is not created until the cooldown has elapsed.

## Endpoints

- `GET /api/admin/alert-rules`
- `POST /api/admin/alert-rules`
- `GET /api/admin/alert-rules/:id`
- `PUT /api/admin/alert-rules/:id`
- `DELETE /api/admin/alert-rules/:id`
- `POST /api/admin/alerts/evaluate`
- `GET /api/admin/alerts`
- `PATCH /api/admin/alerts/:id/read`
- `POST /api/admin/alerts/mark-all-read`
- `GET /api/admin/report-schedule`
- `PUT /api/admin/report-schedule`
- `POST /api/admin/report-schedule/trigger`

## Security

Alert notification messages are sanitized before persistence. Sensitive keywords such as authorization, cookie, password, and token are redacted. Backup includes alert rules and notifications, but no raw credentials or secrets are added by this phase.

## Scheduled Reports

The scheduled report config is stored as `admin_report_schedule.json` through the storage record API.

The background runner starts with the backend server and checks due reports every `ADMIN_REPORT_SCHEDULER_INTERVAL_MS` milliseconds, defaulting to 60000. Set this env var to `0` to disable the background checker while keeping manual endpoints available.

## UI

The Alert Center view is available for admins in multi-user mode and remains API-compatible in `AUTH_MODE=single`. It supports rule creation, pausing, deletion, manual evaluation, notification read state, and scheduled report configuration.
