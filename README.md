# KRMU Induction Management System

A web app for managing university induction events at K.R. Mangalam University (KRMU). It handles QR-based attendance, document management, fast-track registration, analytics, and coordinator access. Runs on a highly scalable serverless Vercel + Firebase stack.

Supports **10,000+ concurrent students** with role-based auth, Redis-backed rate limiting, QStash background queuing, and signed URL document security.

---

## Features

```mermaid
mindmap
  root((KRMU IMS))
    Student Portal
      Fast Track Registration
      Boarding Pass
      Self Attendance
      Club Showcase
      Schedule Viewer
    Admin Panel
      Dashboard
      Student & Dataset Mgmt
      Club & Event Mgmt
      Announcements
      Analytics & Heatmaps
      Activity Logs
    Document Vault
      Upload (Docs & Images)
      Geo-tagged Images
      Trash & Restore
      Hard Delete
      Audit Trail
    Security & Scale
      RBAC Custom Claims
      Signed URLs
      Redis Rate Limiting
      QStash Background Queues
      SHA-256 Dedup
      Auto Lock
```

---

## Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| Framework | TanStack Start (React 19 + TypeScript) | Full-stack SSR and routing |
| Styling | Tailwind CSS v4 | Utility CSS |
| Animations | Framer Motion | Transitions and animations |
| UI Components | Shadcn/UI + Radix UI | Headless component library |
| Database & Auth | Firebase Firestore + Firebase Auth | Database and custom claims RBAC |
| File Storage | Firebase Storage (Blaze Plan) | File hosting with signed URLs |
| Security | Upstash Redis | Rate limiting, nonce tracking, IP protection |
| Queuing | Upstash QStash | Background job processing for high concurrency |
| Backend APIs | Vercel Serverless Functions | Auth, upload, registration, and attendance logic |

---

## High Concurrency & Mobile

The app is built for mobile so students can register or mark attendance on their phones, even when thousands connect simultaneously.

- **Serverless Scaling:** Vercel Edge functions instantly scale to handle 10,000+ concurrent hits.
- **Queued Writes:** Upstash QStash buffers database writes to prevent Firebase from crashing during massive QR scanning waves.
- **DDoS Protection:** Upstash Redis blocks bots and spam requests at the edge.
- **Responsive UI:** Scaled hero text, adaptive grids, fluid container padding, and oversized touch targets for mobile.
- **Performance:** GPU-accelerated CSS animations, lazy-loaded chunks, and highly optimized bundle sizes.

---

## Fast Track Registration Flow

```mermaid
sequenceDiagram
    participant S as Student
    participant FE as Frontend
    participant V as Vercel API
    participant R as Upstash Redis
    participant FS as Firestore

    S->>FE: Enter App Number & DOB
    FE->>V: POST /induction-lookup
    V->>R: Check Rate Limit (IP/Device)
    V->>FS: Query `induction_participants`
    FS-->>V: Return Student Data
    V-->>FE: Match Found
    S->>FE: Enter Mobile & Email
    FE->>V: POST /send-otp
    V->>R: Rate Limit (3/hr per email)
    V->>FS: Generate & Save OTP
    V-->>FE: OTP Sent
    S->>FE: Verify OTP & Password
    FE->>V: POST /induction-register
    V->>R: Rate Limit Check
    V->>FS: Create Account & Mark Registered
    V-->>FE: Success & Redirect
```

---

## Attendance Security & Scale (v4)

QR codes are generated server-side only and never sent to the student client. Each QR is signed with HMAC-SHA256 and rotates every 30 seconds.

When 10,000 students scan a QR code simultaneously, the system uses a **Queue-Based Architecture**:

1. **Edge Validation:** Vercel checks the QR signature, expiry, and student session.
2. **Redis Bouncer:** Upstash Redis checks rate limits (5 scans/min) and blocks duplicate scans instantly in memory.
3. **QStash Handoff:** Instead of waiting for Firestore to save the record, Vercel sends the verified scan to Upstash QStash.
4. **Instant Response:** The student instantly sees a "Success" checkmark on their phone.
5. **Background Processing:** QStash safely delivers the records to Firebase at a manageable speed, updating the database and awarding points without any database locking or crashing.

---

## Role-Based Access Control

```mermaid
graph TD
    A[User Logs In] --> B{Firebase Auth\nCustom Claims}
    B -->|role: coordinator| C[Coordinator]
    B -->|role: super_admin| D[Super Admin]
    B -->|roles: both| E[Coordinator + Super Admin]

    C --> C1[Upload Documents]
    C --> C2[Upload Images\nGeo-tagged / Non Geo-tagged]

    D --> D1[Upload Documents & Images]
    D --> D2[View & Download Files]
    D --> D3[Trash / Restore / Hard Delete]
    D --> D4[Manage Users, Roles & Datasets]
    D --> D5[Analytics & Audit Logs]
    D --> D6[Student & Club Management]

    E --> C1
    E --> D2
    E --> D3
    E --> D4
```

---

## Document Vault Security Flow

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant API as Vercel API
    participant FB as Firebase Auth
    participant GCS as Firebase Storage
    participant FS as Firestore

    U->>FE: Select file + fill form
    FE->>FE: SHA-256 hash + Magic Byte check
    FE->>API: POST /vault-init-upload
    API->>FB: verifyIdToken()
    API->>API: Role check + Dedup hash
    API->>GCS: Generate 15-min signed PUT URL
    API->>FS: Log INITIATE_UPLOAD audit
    API-->>FE: { uploadUrl, filePath }
    FE->>GCS: PUT file directly to Storage
    FE->>FS: Save document metadata
```

---

## Firestore Data Model

```mermaid
erDiagram
    INDUCTION_DATASETS ||--o{ INDUCTION_PARTICIPANTS : "contains"
    INDUCTION_PARTICIPANTS ||--o{ USERS : "registers as"
    USERS ||--o{ ATTENDANCE : "scans"
    EVENTS ||--o{ ATTENDANCE : "records"
    USERS ||--o{ SECURE_DOCUMENTS : "uploads"

    INDUCTION_PARTICIPANTS {
        string appNumber PK
        string studentName
        string program
        string course
        string datasetId FK
        boolean isRegistered
    }

    USERS {
        string uid PK
        string email
        string name
        string role
        string enrollment_no UK
    }

    SECURE_DOCUMENTS {
        string id PK
        string name
        string fileHash
        timestamp uploadedAt
    }
```

---

## API Overview

```mermaid
graph LR
    FE[Frontend] -->|Admin| A1[/import-dataset/]
    FE -->|Public| A2[/induction-lookup/]
    FE -->|Public| A3[/send-otp/]
    FE -->|Public| A4[/induction-register/]
    FE -->|Auth| A5[/attendance-mark/]
    FE -->|Admin| A6[/vault-init-upload/]

    A1 -->|CSV parsing| G1[Save to induction_participants]
    A2 -->|Rate Limited| G2[Search appNumber + DOB]
    A4 -->|Redis + Firestore| G4[Create Student Account]
    A5 -->|Signature + Redis| G5[Send to QStash Queue]
```

---

## Design System

Glass aesthetic with interactive animations.

```mermaid
graph TD
    DS[Design System & Motion] --> Cards["Glass Cards (bg-white/40 + backdrop-blur-xl)"]
    DS --> Panels["Glass Panels (bg-white/30 + backdrop-blur-md)"]
    DS --> Motion["Dynamic Motion (Shimmer sweeps & hover scaling)"]
    DS --> Ambience["Ambient Glow (Reactive blur gradients & orbs)"]
    DS --> Radius["Modern Geometry (Rounded 24px-40px throughout)"]
    DS --> Colors["KRMU Brand Palette (#8a2c14, #5a2c14, #2c1208)"]
    DS --> Mobile["Mobile-First (Responsive layouts)"]
```

---

## License

Proprietary software built for K.R. Mangalam University internal use.
© 2026 KRMU. All rights reserved.

