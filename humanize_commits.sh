#!/bin/bash

# Ensure we are in the right dir
cd "/Users/mrinalprakash/Library/Mobile Documents/com~apple~CloudDocs/Induction-Program"

git reset

# Commit 1
git add package.json package-lock.json vite.config.ts check-port.cjs check.js test-browser.cjs src/styles.css public/
GIT_AUTHOR_DATE="2026-05-21T12:00:00+05:30" GIT_COMMITTER_DATE="2026-05-21T12:00:00+05:30" git commit -m "chore: initial configuration, basic setup, and assets"

# Commit 2
git add src/lib/local-db.ts src/hooks/ src/integrations/ src/lib/admin.functions.ts attendance-system/
GIT_AUTHOR_DATE="2026-05-22T14:30:00+05:30" GIT_COMMITTER_DATE="2026-05-22T14:30:00+05:30" git commit -m "feat: implement local database, hooks, and integration utilities"

# Commit 3
git add src/components/ src/routeTree.gen.ts src/routes/__root.tsx src/routes/index.tsx src/routes/clubs.tsx
GIT_AUTHOR_DATE="2026-05-23T11:15:00+05:30" GIT_COMMITTER_DATE="2026-05-23T11:15:00+05:30" git commit -m "feat: base components, layout root, and public landing pages"

# Commit 4
git add src/routes/register.tsx src/routes/my-pass.tsx src/routes/attendance.tsx src/routes/scan.\$token.tsx
GIT_AUTHOR_DATE="2026-05-24T16:45:00+05:30" GIT_COMMITTER_DATE="2026-05-24T16:45:00+05:30" git commit -m "feat: student registration, boarding pass generation, and self-attendance"

# Commit 5
git add src/routes/admin.*
GIT_AUTHOR_DATE="2026-05-25T18:00:00+05:30" GIT_COMMITTER_DATE="2026-05-25T18:00:00+05:30" git commit -m "feat: admin dashboard, scanner, activity logs, and analytics"

# Any leftovers
git add .
GIT_AUTHOR_DATE="2026-05-25T18:05:00+05:30" GIT_COMMITTER_DATE="2026-05-25T18:05:00+05:30" git commit -m "chore: final minor adjustments" || true

# Push
git push origin main
