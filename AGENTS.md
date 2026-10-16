# Architecture rules
- Keep child category scrolling in a dedicated browser-safe component using element bounds for RTL overflow detection; this avoids browser-specific scroll offset assumptions.
- Define content-page metadata through a shared browser-safe helper; this keeps page titles and social metadata consistent without duplicating markup.