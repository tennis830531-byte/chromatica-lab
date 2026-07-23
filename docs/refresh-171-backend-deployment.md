# refresh-171 backend deployment checklist

This release must not be deployed until an operator has reviewed the migration and supplied the external Firebase configuration. No credential belongs in Git.

## Required Edge Function secrets

- `FCM_SERVICE_ACCOUNT_JSON`: the production Firebase service-account JSON for the Android app.
- `LEADERBOARD_NOTIFICATION_CRON_SECRET`: a new high-entropy value shared only by the scheduler and `process-leaderboard-notifications`.

The repository intentionally contains neither a service-account file nor `google-services.json`.

## Required Vault values

Create these through the production Supabase dashboard or another approved secret-management path:

- `leaderboard_notification_function_url`: the exact deployed URL of `process-leaderboard-notifications`.
- `leaderboard_notification_cron_secret`: the same value as `LEADERBOARD_NOTIFICATION_CRON_SECRET`.

The migration schedules weekly finalization at UTC Saturday 16:00 (Asia/Taipei Sunday 00:00) and, when `pg_cron` is available, dispatches pending notifications once per minute. Missing Vault values make dispatch return `false`; accepted practice scores remain committed and the queue remains available for later processing.

## Admin bootstrap

`app_admins` is the only announcement-administration authority. Bootstrap an existing, verified account by inserting its authenticated user ID through a restricted operator session. Never hard-code an email or user ID in a migration, browser bundle, or Edge Function. Remove access by setting `revoked_at`; the QA password only reveals the entry point and grants no backend authority.

The local integration suite proves both the allowed and denied paths by granting a local-only `example.invalid` fixture through `app_admins`; the fixture and grant are deleted after the test. Production admin access is still pending: after the migration is deployed, an authorized operator must look up the already verified production account inside a restricted server-side session and insert its ID into `app_admins`. Do not perform that lookup or insert from the browser and do not commit the resulting UUID.

## Functions and migration

Deploy only after local reset, lint, integration tests, and function tests pass:

- migration `202607210002_create_weekly_leaderboard_announcements.sql`
- `upload-announcement-image` with gateway JWT verification enabled
- `process-leaderboard-notifications` with custom cron-secret verification

Production deployment, secret creation, Firebase console setup, and admin bootstrap are deliberately outside the implementation commit and require an authorized release operation.
