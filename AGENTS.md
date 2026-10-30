# Architecture rules
- Keep child category scrolling in a dedicated browser-safe component using element bounds for RTL overflow detection; this avoids browser-specific scroll offset assumptions.
- Define content-page metadata through a shared browser-safe helper; this keeps page titles and social metadata consistent without duplicating markup.
- Store weekly schedules separately from children, with parent-authorized atomic saving and idempotent daily application in database functions; this preserves manual edits and keeps opt-out children unchanged.
- Materialize enabled schedules hourly in Israel time and before daily selection reads through getResetHour; this supports unattended filling and immediate read consistency without replacing existing date semantics.
- Run authenticated weekly-schedule integration checks with isolated temporary fixtures and guaranteed cleanup; this verifies real persistence without altering existing children's lunchboxes.