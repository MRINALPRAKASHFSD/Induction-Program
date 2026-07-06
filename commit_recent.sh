#!/bin/bash

# Navigate to project root
cd "/Users/mrinalprakash/Library/Mobile Documents/com~apple~CloudDocs/Induction-Program"

# ─────────────────────────────────────────────
# DAY 1 — July 5 (Announcements & UI updates)
# ─────────────────────────────────────────────

# Commit 1
git add api/announcements.ts src/routes/admin.announcements.tsx src/routes/announcements.tsx
GIT_AUTHOR_DATE="2026-07-05T11:20:00+05:30" GIT_COMMITTER_DATE="2026-07-05T11:20:00+05:30" \
  git commit -m "add announcements api and update admin panel"

# Commit 2
git add src/components/admin-shell.tsx src/components/site-header.tsx
GIT_AUTHOR_DATE="2026-07-05T15:45:00+05:30" GIT_COMMITTER_DATE="2026-07-05T15:45:00+05:30" \
  git commit -m "update site header and admin shell navigation"

# ─────────────────────────────────────────────
# DAY 2 — July 6 (Resend integration & config)
# ─────────────────────────────────────────────

# Commit 3
git add package.json package-lock.json api/send-otp.ts src/components/emails/
GIT_AUTHOR_DATE="2026-07-06T10:30:00+05:30" GIT_COMMITTER_DATE="2026-07-06T10:30:00+05:30" \
  git commit -m "swap nodemailer for resend and add react email template"

# Commit 4
git add firestore.rules vite.config.ts scratch/set-super-admin.ts
GIT_AUTHOR_DATE="2026-07-06T14:15:00+05:30" GIT_COMMITTER_DATE="2026-07-06T14:15:00+05:30" \
  git commit -m "update firestore security rules and vite config"

# Catch any remaining
git add -A
GIT_AUTHOR_DATE="2026-07-06T17:00:00+05:30" GIT_COMMITTER_DATE="2026-07-06T17:00:00+05:30" \
  git commit -m "minor config tweaks" 2>/dev/null || echo "Nothing left to commit."

# Push to remote
git push origin main
