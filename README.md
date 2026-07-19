# KRMU Induction Management System

A web app for managing university induction events at K.R. Mangalam University (KRMU). It handles QR-based attendance, document management, club registrations, analytics, and coordinator access. Runs on a serverless Firebase stack.

Supports up to 5,000 concurrent students with role-based auth, signed URL document security, and a full audit trail.

---

## Features

```mermaid
mindmap
  root((KRMU IMS))
    Student Portal
      QR Registration
      Boarding Pass
      Self Attendance
      Club Showcase
      Schedule Viewer
    Admin Panel
      Dashboard
      Student Management
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
    Security
      RBAC Custom Claims
      Signed URLs
      Magic Byte Validation
      SHA-256 Dedup
      Rate Limiting
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
| Backend APIs | Vercel Serverless Functions (TypeScript) | Auth, upload, download, and role management |
| Charts | Recharts | SVG charts |
| QR Engine | HTML5-QRCode | Camera-based QR scanning |

---

## Mobile

The app is built for mobile so students can register or mark attendance on their phones.

- **Responsive layouts:** Scaled hero text, adaptive grids, and fluid container padding.
- **Touch controls:** Full-width buttons, oversized touch targets, and dynamic dropdown widths.
- **Performance:** 95+ desktop and 85-90+ mobile Lighthouse scores via lazy-loaded admin chunks, WebP images, preloaded fonts, and GPU-accelerated CSS animations.
- **Vercel API:** ESM (.js extensions) and glob routing support.

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
    D --> D4[Manage Users & Roles]
    D --> D5[Analytics & Audit Logs]
    D --> D6[Student & Club Management]

    E --> C1
    E --> D2
    E --> D3
    E --> D4
```

---

## Attendance Security (v3)

QR codes are generated server-side only and never sent to the student client. Each QR is signed with HMAC-SHA256 and rotates every 30 seconds.

Every scan goes through 13 server-side checks:

1. Firebase JWT auth
2. Rate limiting (Redis, 5 req/min)
3. QR payload structure
4. HMAC-SHA256 signature
5. QR expiry (rotation window)
6. Nonce single-use (Redis SETNX, atomic)
7. Session is active
8. Student is registered
9. Account not suspended
10. Programme match
11. Duplicate scan (Redis + Firestore)
12. Geofence (250m campus radius, 40m GPS tolerance)

Each attendance record stores a full audit log: IP, browser, OS, GPS coordinates, distance from campus, QR nonce, and request ID. Admins can view this. Students cannot.

---

## Document Vault Security Flow

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant API as API (Serverless)
    participant FB as Firebase Auth
    participant GCS as Firebase Storage
    participant FS as Firestore

    U->>FE: Select file + fill form
    FE->>FE: SHA-256 hash + Magic Byte check
    FE->>API: POST /vault-init-upload (Bearer token)
    API->>FB: verifyIdToken()
    FB-->>API: decoded role
    API->>API: Role check + Rate limit + Dedup hash
    API->>GCS: Generate 15-min signed PUT URL
    API->>FS: Log INITIATE_UPLOAD audit
    API-->>FE: { uploadUrl, filePath }
    FE->>GCS: PUT file directly to Storage
    FE->>FS: Save document metadata
    U->>FE: Request download
    FE->>API: POST /vault-download (Bearer token)
    API->>FB: verifyIdToken() (super_admin only)
    API->>GCS: Generate 30-sec signed GET URL
    API->>FS: Log DOWNLOAD audit
    API-->>FE: { url }
    FE->>U: Opens file in new tab
```

---

## Storage Layout

```mermaid
graph LR
    Root["Firebase Storage"] --> Docs["documents/"]
    Root --> Images["images/"]

    Docs --> DY["2026/"]
    DY --> DC1["orientation/"]
    DY --> DC2["induction-day-1/"]
    DY --> DC3["induction-day-2/ ..."]
    DC1 --> DF["timestamp_file.pdf"]

    Images --> Geo["geo-tagged/"]
    Images --> NonGeo["non-geo-tagged/"]

    Geo --> GY["2026/"]
    GY --> GC["orientation/"]
    GC --> GF["timestamp_photo.jpg"]

    NonGeo --> NY["2026/"]
    NY --> NC["induction-day-1/"]
    NC --> NF["timestamp_photo.png"]
```

---

## Firestore Data Model

```mermaid
erDiagram
    STUDENTS ||--o{ ATTENDANCE : "scans"
    EVENTS ||--o{ ATTENDANCE : "records"
    CLUBS ||--o{ CLUB_REGISTRATIONS : "lists"
    STUDENTS ||--o{ CLUB_REGISTRATIONS : "joins"
    USERS ||--o{ SECURE_DOCUMENTS : "uploads"
    SECURE_DOCUMENTS ||--o{ AUDIT_LOGS : "tracked by"

    STUDENTS {
        string id PK
        string enrollment_no UK
        string full_name
        string email
        string department
        string branch
        timestamp created_at
    }

    SECURE_DOCUMENTS {
        string id PK
        string name
        string filePath
        string category
        string uploadType
        string imageLocation
        string status
        string fileHash
        number size
        timestamp uploadedAt
        timestamp deletedAt
    }

    USERS {
        string uid PK
        string email
        string name
        string role
        array roles
        timestamp createdAt
    }

    AUDIT_LOGS {
        string id PK
        string action
        string user
        string documentId
        string ip
        string country
        timestamp time
    }
```

---

## API Overview

```mermaid
graph LR
    FE[Frontend] -->|Bearer Token| A1[/vault-init-upload/]
    FE -->|Bearer Token| A2[/vault-download/]
    FE -->|Bearer Token| A3[/vault-assign-role/]
    FE -->|Bearer Token| A7[/attendance-mark/]
    FE -->|Admin Only| A8[/attendance-session/]
    FE -->|Admin Only| A9[/attendance-qr/]
    FE -->|Admin Only| A10[/attendance-export/]
    FE -->|Public| A4[/send-otp/]
    FE -->|Public| A5[/verify-otp/]
    FE -->|Public| A6[/live-impact/]

    A1 -->|coordinator or super_admin| G1[Generate signed PUT URL]
    A2 -->|super_admin only| G2[Generate 30s signed GET URL]
    A3 -->|super_admin only| G3[Create Firebase user + set claims]
    A7 -->|Authenticated student| G7[13-point server validation + record]
    A8 -->|Admin only| G8[Create / update session state]
    A9 -->|Admin only| G9[Generate + rotate signed QR]
    A10 -->|Admin only| G10[Export attendance CSV]
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
