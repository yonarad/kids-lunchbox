# Architecture rules
- Keep child category scrolling in a dedicated browser-safe component using element bounds for RTL overflow detection; this avoids browser-specific scroll offset assumptions.