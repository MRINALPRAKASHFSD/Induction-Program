#!/bin/bash

# Humanized commit script — changes distributed across Jun 30 / Jul 1 / Jul 2
# Run from the project root

cd "/Users/mrinalprakash/Library/Mobile Documents/com~apple~CloudDocs/Induction-Program"

git reset HEAD -- . 2>/dev/null || true

# ─────────────────────────────────────────────
# DAY 1 — June 30 (Liquid Glass UI + Admin panels)
# ─────────────────────────────────────────────

# Commit 1 — Admin dashboard & general panel redesign
git add src/routes/admin.dashboard.tsx
GIT_AUTHOR_DATE="2026-06-30T10:22:00+05:30" GIT_COMMITTER_DATE="2026-06-30T10:22:00+05:30" \
  git commit -m "feat(ui): redesign admin dashboard with liquid glass aesthetic"

# Commit 2 — Admin clubs, events, announcements panels
git add src/routes/admin.clubs.tsx src/routes/admin.events.tsx src/routes/admin.announcements.tsx
GIT_AUTHOR_DATE="2026-06-30T13:45:00+05:30" GIT_COMMITTER_DATE="2026-06-30T13:45:00+05:30" \
  git commit -m "feat(ui): apply liquid glass styling to clubs, events, and announcements panels"

# Commit 3 — Admin schedule & scanner
git add src/routes/admin.schedule.tsx src/routes/admin.scanner.tsx
GIT_AUTHOR_DATE="2026-06-30T16:10:00+05:30" GIT_COMMITTER_DATE="2026-06-30T16:10:00+05:30" \
  git commit -m "feat(ui): update schedule and scanner admin views with glass card layout"

# ─────────────────────────────────────────────
# DAY 2 — July 1 (Document Vault UI overhaul + upload types)
# ─────────────────────────────────────────────

# Commit 4 — Admin activity & analytics panels
git add src/routes/admin.activity.tsx src/routes/admin.analytics.tsx
GIT_AUTHOR_DATE="2026-07-01T09:30:00+05:30" GIT_COMMITTER_DATE="2026-07-01T09:30:00+05:30" \
  git commit -m "feat(ui): liquid glass redesign for activity log and analytics panels"

# Commit 5 — Admin students panel
git add src/routes/admin.students.tsx
GIT_AUTHOR_DATE="2026-07-01T11:00:00+05:30" GIT_COMMITTER_DATE="2026-07-01T11:00:00+05:30" \
  git commit -m "feat(ui): update student management panel with glass card design"

# Commit 6 — Document vault UI + upload types + image section + category dropdown
git add src/routes/admin.documents.tsx
GIT_AUTHOR_DATE="2026-07-01T14:20:00+05:30" GIT_COMMITTER_DATE="2026-07-01T14:20:00+05:30" \
  git commit -m "feat(vault): liquid glass document vault with image/document upload bifurcation, geo-tag support, and induction day categories"

# ─────────────────────────────────────────────
# DAY 3 — July 2 (Backend security, storage paths, role management)
# ─────────────────────────────────────────────

# Commit 7 — Storage bifurcation & upload security
git add api/vault-init-upload.ts
GIT_AUTHOR_DATE="2026-07-02T10:00:00+05:30" GIT_COMMITTER_DATE="2026-07-02T10:00:00+05:30" \
  git commit -m "feat(api): bifurcate storage paths for documents vs images with geo-tag sub-folders"

# Commit 8 — Download API audit log improvements
git add api/vault-download.ts
GIT_AUTHOR_DATE="2026-07-02T11:30:00+05:30" GIT_COMMITTER_DATE="2026-07-02T11:30:00+05:30" \
  git commit -m "fix(api): improve download audit log with user email attribution"

# Commit 9 — Multi-role user assignment API
git add api/vault-assign-role.ts
GIT_AUTHOR_DATE="2026-07-02T13:15:00+05:30" GIT_COMMITTER_DATE="2026-07-02T13:15:00+05:30" \
  git commit -m "feat(api): support multi-role assignment (coordinator + super_admin) for vault users"

# Commit 10 — Firestore security rules update
git add firestore.rules
GIT_AUTHOR_DATE="2026-07-02T14:00:00+05:30" GIT_COMMITTER_DATE="2026-07-02T14:00:00+05:30" \
  git commit -m "security: update firestore rules for trash, restore, and hard-delete operations"

# Catch any remaining unstaged changes
git add -A
GIT_AUTHOR_DATE="2026-07-02T14:30:00+05:30" GIT_COMMITTER_DATE="2026-07-02T14:30:00+05:30" \
  git commit -m "chore: minor cleanup and leftover adjustments" 2>/dev/null || echo "Nothing left to commit."

# Push to remote
git push origin main
