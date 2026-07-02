# 🎓 KRMU Induction Management System

A **premium, enterprise-grade** web application built to manage university induction events at scale. Designed for **KRMU (K.R. Mangalam University)**, it handles real-time student attendance via QR scanning, secure document management, club registrations, analytics, and coordinator management — all backed by a serverless Firebase stack.

Built to handle **5,000+ concurrent students** with a Liquid Glass UI, RBAC authentication, signed URL document security, and a full audit trail.

---

## ✨ Feature Overview

### 🏠 Student-Facing
| Feature | Description |
| :--- | :--- |
| **QR Code Registration** | Students register and receive a unique QR boarding pass |
| **Self-Attendance Scanning** | Scan QR at event gates for instant attendance capture |
| **Club Showcase** | Browse and register for clubs with tag filtering |
| **Schedule Viewer** | View induction day-wise event schedules |
| **Help & Support** | Dedicated help, privacy policy, and terms pages |

### 🔐 Admin Panel (Role-Based Access Control)
| Feature | Access |
| :--- | :--- |
| **Dashboard** | Super Admin |
| **Student Management** | Super Admin |
| **Club & Event Management** | Super Admin |
| **Announcements** | Super Admin |
| **Analytics & Heatmaps** | Super Admin |
| **Activity Logs** | Super Admin |
| **Document Vault (Upload)** | Coordinator + Super Admin |
| **Document Vault (View/Download/Delete)** | Super Admin only |
| **User Management** | Super Admin only |

---

## 🗄️ Document Vault — Enterprise Security

The Document Vault is the flagship feature — a fully secured, audit-logged file management system.

### Key Security Features
- **🔒 RBAC Authentication** — Coordinators can upload; Super Admins can view/download/delete
- **⏱️ Auto-Lock** — Vault auto-locks after 5 minutes of inactivity
- **🔗 Signed URLs** — All file access uses short-lived (30-second) Firebase signed URLs — no direct public storage access
- **🔍 Magic Byte Validation** — Server-side file type verification (prevents extension spoofing)
- **#️⃣ SHA-256 Deduplication** — Duplicate file uploads blocked using hash comparison
- **⏳ Rate Limiting** — 5-second upload cooldown per user enforced on the backend
- **📋 Full Audit Log** — Every INITIATE_UPLOAD, DOWNLOAD, VIEW, SOFT_DELETE, RESTORE, HARD_DELETE, ASSIGN_ROLE is logged with IP, device, country, and timestamp

### Storage Path Structure (Bifurcated)
```
Firebase Storage
├── documents/
│   └── {YYYY}/
│       └── {category}/
│           └── {timestamp}_{filename}
└── images/
    ├── geo-tagged/
    │   └── {YYYY}/
    │       └── {category}/
    │           └── {timestamp}_{filename}
    └── non-geo-tagged/
        └── {YYYY}/
            └── {category}/
                └── {timestamp}_{filename}
```

### Upload Categories
- Orientation
- Induction Day 1 → Day 5
- Other

### Trash & Recovery
- **Soft Delete** → moves to trash (kept 30 days)
- **Restore** → moves back to active
- **Hard Delete** → permanently removes from Firestore database

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | TanStack Start (React 19 + TypeScript) | Full-stack SSR, type-safe routing |
| **Styling** | Tailwind CSS v4 | CSS-first utility engine |
| **Animations** | Framer Motion | Spring transitions, micro-animations |
| **UI Components** | Shadcn/UI + Radix UI | Accessible, headless component library |
| **Database & Auth** | Firebase Firestore + Firebase Auth | Real-time database, custom claims RBAC |
| **File Storage** | Firebase Storage (Blaze Plan) | Secure file hosting with signed URLs |
| **Backend APIs** | Vercel Serverless Functions (TypeScript) | Auth, upload, download, role management |
| **Charts** | Recharts | Responsive SVG charts |
| **QR Engine** | HTML5-QRCode | Camera-based QR scanning |
| **Toast Notifications** | Sonner | Clean notification stack |

---

## 🔑 User Roles

| Role | Permissions |
| :--- | :--- |
| `coordinator` | Upload documents & images to the vault |
| `super_admin` | Full access — view, download, delete, manage users, analytics |
| Both roles | Can be assigned simultaneously to a single user |

Roles are set via **Firebase Auth Custom Claims** and verified server-side on every API call.

---

## 📡 API Endpoints

| Endpoint | Method | Auth | Description |
| :--- | :--- | :--- | :--- |
| `/api/vault-init-upload` | POST | coordinator / super_admin | Validates file, generates signed GCS upload URL |
| `/api/vault-download` | POST | super_admin | Generates 30-second signed download/view URL |
| `/api/vault-assign-role` | POST | super_admin | Creates Firebase user and assigns role(s) |
| `/api/send-otp` | POST | Public | Sends OTP for student verification |
| `/api/verify-otp` | POST | Public | Verifies OTP token |
| `/api/live-impact` | GET | Public | Returns live attendance impact stats |

---

## 🚀 Local Setup & Installation

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/MRINALPRAKASHFSD/Induction-Program.git
cd Induction-Program
npm install
```

### 2. Firebase Setup
1. Create a project on [Firebase Console](https://console.firebase.google.com)
2. Enable **Firestore**, **Firebase Auth**, and **Firebase Storage** (Blaze plan for Storage)
3. Go to **Project Settings → Service Accounts → Generate new private key**
4. Download the JSON — you'll use it for the environment variables below

### 3. Setup Environment Variables
Create a `.env` file in the project root:
```ini
# Firebase Client SDK (Vite)
VITE_FIREBASE_API_KEY="your_api_key"
VITE_FIREBASE_AUTH_DOMAIN="your_project.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your_project_id"
VITE_FIREBASE_STORAGE_BUCKET="your_project.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="your_sender_id"
VITE_FIREBASE_APP_ID="your_app_id"

# Firebase Admin SDK (Server/API)
FIREBASE_PROJECT_ID="your_project_id"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxx@your_project.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET="your_project.appspot.com"
```

### 4. Deploy Firestore & Storage Rules
```bash
# Install Firebase CLI if needed
npm install -g firebase-tools
firebase login

# Deploy rules
firebase deploy --only firestore:rules
firebase deploy --only storage
```

### 5. Start the Development Server
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 📁 Project Structure

```
Induction-Program/
├── api/                          # Vercel serverless functions
│   ├── vault-init-upload.ts      # Secure upload initiation
│   ├── vault-download.ts         # Signed download URL generation
│   ├── vault-assign-role.ts      # User creation & role assignment
│   ├── send-otp.ts               # OTP delivery
│   ├── verify-otp.ts             # OTP verification
│   └── live-impact.ts            # Live stats endpoint
├── src/
│   ├── components/               # Shared UI components
│   │   ├── admin-shell.tsx       # Admin layout wrapper
│   │   ├── ui/                   # Shadcn components
│   │   └── ...
│   ├── routes/                   # TanStack Router pages
│   │   ├── index.tsx             # Landing page
│   │   ├── register.tsx          # Student registration
│   │   ├── admin.dashboard.tsx   # Admin dashboard
│   │   ├── admin.documents.tsx   # Document vault
│   │   ├── admin.students.tsx    # Student management
│   │   ├── admin.analytics.tsx   # Analytics & charts
│   │   └── ...
│   ├── lib/
│   │   └── firebase/config.ts    # Firebase initialization
│   └── styles.css                # Global Liquid Glass styles
├── attendance-system/            # Legacy standalone attendance HTML/JS
├── firestore.rules               # Firestore security rules
├── storage.rules                 # Firebase Storage security rules
└── vite.config.ts                # Vite + TanStack configuration
```

---

## 🎨 Design System — Liquid Glass

The entire admin panel uses a **Liquid Glass** aesthetic inspired by Apple's modern UI:

- **Frosted glass cards** — `bg-white/40 backdrop-blur-xl`
- **Soft translucent panels** — `bg-white/30 backdrop-blur-md`
- **Glass input fields** — `bg-white/50 backdrop-blur-md`
- **Rounded corners** — 18–24px throughout
- **Smooth hover animations** — Framer Motion spring physics
- **Maroon accent palette** — KRMU brand colors (`#8a2c14`, `#5a2c14`)

---

## 🏛️ Firestore Collections

| Collection | Purpose |
| :--- | :--- |
| `students` | Student registration records |
| `events` | Induction event definitions |
| `attendance` | QR scan attendance records |
| `clubs` | Club listings |
| `club_registrations` | Student-club join records |
| `announcements` | Admin announcements |
| `secure_documents` | Document vault metadata |
| `audit_logs` | Full system audit trail |
| `users` | Vault user profiles with roles |
| `rate_limits` | Per-user upload rate limiting |
| `otp_requests` | OTP verification records |

---

## 📄 License

This project is proprietary software built for **K.R. Mangalam University** internal use.  
© 2026 KRMU. All rights reserved.
