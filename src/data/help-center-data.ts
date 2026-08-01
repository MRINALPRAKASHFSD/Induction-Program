import {
  Key,
  ShieldCheck,
  Calendar,
  MapPin,
  CalendarDays,
  Users,
  Wrench,
  User,
  type LucideIcon,
} from 'lucide-react';

export interface HelpStep {
  title: string;
  description: string;
  expectedResult?: string;
  mistake?: string;
}

export interface HelpArticle {
  id: string; // Immutable identifier e.g. 'ATTENDANCE_SCAN_QR'
  title: string;
  categoryId: string; // Matches HelpCategory.id
  summary: string;
  difficulty: 'Easy' | 'Medium';
  readTime: string;
  keywords: string[];
  steps: HelpStep[];
  tips?: string[];
  warnings?: string[];
  relatedIds?: string[]; // Immutable IDs of related articles
}

export interface HelpCategory {
  id: string;
  title: string;
  icon: LucideIcon;
  description: string;
}

export interface HelpFAQ {
  id: string;
  question: string;
  answerSummary: string;
  targetArticleId: string; // Links to HelpArticle.id
}

/**
 * 8 Core Knowledge Base Categories
 */
export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: 'registration',
    title: 'Registration & Login',
    icon: Key,
    description: 'Account creation, portal sign-in, password reset, and email verification',
  },
  {
    id: 'verification',
    title: 'Student Verification',
    icon: ShieldCheck,
    description: 'Identity verification, QR badge scanning, and location permission rules',
  },
  {
    id: 'attendance',
    title: 'Attendance',
    icon: Calendar,
    description: 'How to scan QR codes, attendance tracking, and resolving camera/GPS issues',
  },
  {
    id: 'campus',
    title: 'Campus Navigation',
    icon: MapPin,
    description: 'Interactive map, block locations, hostel guidance, and campus facilities',
  },
  {
    id: 'schedule',
    title: 'Orientation Schedule',
    icon: CalendarDays,
    description: 'Timetables, block timings, keynote sessions, and check-in procedures',
  },
  {
    id: 'clubs',
    title: 'Clubs & Societies',
    icon: Users,
    description: 'Exploring clubs, selecting up to two societies, and registration dates',
  },
  {
    id: 'technical',
    title: 'Technical Issues',
    icon: Wrench,
    description: 'Website loading, browser compatibility, camera permissions, and app errors',
  },
  {
    id: 'account',
    title: 'Account & Profile',
    icon: User,
    description: 'Editing student profile, email address management, and password reset',
  },
];

/**
 * Comprehensive Knowledge Base Articles with Immutable IDs
 */
export const HELP_ARTICLES: HelpArticle[] = [
  // --- REGISTRATION & LOGIN ---
  {
    id: 'REGISTRATION_CREATE_ACCOUNT',
    title: 'How to create your Aarambh account',
    categoryId: 'registration',
    summary: 'Step-by-step guide to registering for the Class of 2026 induction portal using your university email.',
    difficulty: 'Easy',
    readTime: '2 mins',
    keywords: ['register', 'create account', 'new student', 'email', 'signup', 'onboarding'],
    steps: [
      {
        title: 'Open the Registration Page',
        description: 'Navigate to the top right navigation bar on Aarambh and click "Register Now" or open /register directly.',
        expectedResult: 'You will see the Class of 2026 student registration form.',
      },
      {
        title: 'Enter your Official Student Details',
        description: 'Provide your full legal name, student ID / enrollment number, and official K.R. Mangalam University email address.',
        mistake: 'Do not use a personal Gmail or Yahoo account if your university email has already been issued.',
      },
      {
        title: 'Create a Secure Password',
        description: 'Set a password with at least 8 characters, including a number and symbol, and click "Submit Registration".',
        expectedResult: 'Your account is created and a verification email is sent.',
      },
    ],
    tips: [
      'Check your spam or junk folder if the verification email does not arrive within 3 minutes.',
      'Double-check your enrollment number typo before submitting.',
    ],
    warnings: [
      'Each enrollment number can only be registered once. Do not create duplicate accounts.',
    ],
    relatedIds: ['REGISTRATION_LOGIN_ISSUES', 'REGISTRATION_EMAIL_VERIFY'],
  },
  {
    id: 'REGISTRATION_LOGIN_ISSUES',
    title: 'Troubleshooting portal login issues',
    categoryId: 'registration',
    summary: 'What to do if you cannot sign into your Aarambh account or see an authentication error.',
    difficulty: 'Easy',
    readTime: '2 mins',
    keywords: ['login', 'signin', 'cant login', 'password error', 'authentication', 'access denied'],
    steps: [
      {
        title: 'Verify your email address is spelled correctly',
        description: 'Ensure there are no leading or trailing spaces around your email in the login field.',
      },
      {
        title: 'Use the Password Reset link',
        description: 'If you forgot your password, click "Forgot Password?" on the login card to receive a secure reset link.',
        expectedResult: 'A password reset link will be sent to your registered email address.',
      },
      {
        title: 'Clear browser cache or try Incognito',
        description: 'Old session tokens can occasionally block sign-in. Press Ctrl+Shift+R (Cmd+Shift+R on Mac) or open an incognito window.',
      },
    ],
    tips: [
      'Ensure caps lock is turned off when typing your password.',
    ],
    relatedIds: ['REGISTRATION_CREATE_ACCOUNT', 'ACCOUNT_PASSWORD_RESET'],
  },
  {
    id: 'REGISTRATION_EMAIL_VERIFY',
    title: 'How to verify your email address',
    categoryId: 'registration',
    summary: 'Instructions for verifying your email address after registration to activate full portal features.',
    difficulty: 'Easy',
    readTime: '1 min',
    keywords: ['verify email', 'email verification', 'activation link', 'spam folder', 'verification code'],
    steps: [
      {
        title: 'Check your inbox for the activation email',
        description: 'Search for an email titled "Verify your Aarambh account" from the KRMU induction team.',
      },
      {
        title: 'Click the verification button inside the email',
        description: 'Tap "Verify Email Address" to confirm ownership of your inbox.',
        expectedResult: 'You will be redirected to Aarambh with an "Email Verified Successfully" banner.',
      },
    ],
    tips: [
      'If the link expires after 24 hours, click "Resend Verification Email" on your student profile page.',
    ],
    relatedIds: ['REGISTRATION_CREATE_ACCOUNT'],
  },
  {
    id: 'REGISTRATION_DUPLICATE_ERROR',
    title: 'Resolving "Enrollment Number Already Registered" errors',
    categoryId: 'registration',
    summary: 'Steps to take if the system reports that your student ID or email is already registered.',
    difficulty: 'Medium',
    readTime: '2 mins',
    keywords: ['duplicate account', 'already registered', 'enrollment error', 'student id exists'],
    steps: [
      {
        title: 'Check if you previously signed up',
        description: 'Try logging in using "Forgot Password" with your primary university email address.',
      },
      {
        title: 'Contact your Platform Coordinator',
        description: 'If someone else registered with your student ID by mistake, click "Contact Support" below with your admission letter.',
        expectedResult: 'The platform team will verify your identity and release the enrollment number within 15 minutes.',
      },
    ],
    warnings: [
      'Never attempt to register with a fake enrollment number, as it will cause failure during physical QR verification.',
    ],
    relatedIds: ['REGISTRATION_LOGIN_ISSUES'],
  },

  // --- STUDENT VERIFICATION ---
  {
    id: 'VERIFICATION_QR_IDENTITY',
    title: 'Understanding your Student QR Badge & Identity Verification',
    categoryId: 'verification',
    summary: 'How your digital student badge works and how to present it for campus check-ins.',
    difficulty: 'Easy',
    readTime: '2 mins',
    keywords: ['qr badge', 'student pass', 'digital pass', 'identity verification', 'my pass', 'qr code'],
    steps: [
      {
        title: 'Open your Digital Student Pass',
        description: 'After logging in, click "My Pass" or the QR badge icon in the navigation bar.',
        expectedResult: 'Your personalized QR code card with your name, enrollment number, and course will appear.',
      },
      {
        title: 'Present your QR code at campus entry points',
        description: 'Show your screen with brightness set to maximum when entering orientation halls or classrooms.',
      },
    ],
    tips: [
      'Take a screenshot of your QR Badge on your mobile device in case campus Wi-Fi or cellular signal is temporary weak.',
    ],
    warnings: [
      'Do not share your personal QR pass screenshot with classmates. Each pass is tied to your student attendance record.',
    ],
    relatedIds: ['ATTENDANCE_SCAN_QR', 'VERIFICATION_GPS_PERMISSIONS'],
  },
  {
    id: 'VERIFICATION_GPS_PERMISSIONS',
    title: 'Enabling GPS & Location permissions for verification',
    categoryId: 'verification',
    summary: 'Why location services are required for campus check-in and how to enable them on iOS and Android.',
    difficulty: 'Medium',
    readTime: '3 mins',
    keywords: ['gps permission', 'location service', 'enable gps', 'location denied', 'geofence', 'campus checkin'],
    steps: [
      {
        title: 'Allow location access when prompted by the browser',
        description: 'When opening the attendance or verification scanner, tap "Allow While Visiting Site" on the browser popup.',
      },
      {
        title: 'Check iOS Safari Location Settings',
        description: 'Go to Settings > Privacy & Security > Location Services > Safari Websites, and set to "While Using the App".',
      },
      {
        title: 'Check Android Chrome Location Settings',
        description: 'Tap the lock icon in the Chrome URL address bar, tap "Permissions", and turn "Location" toggle ON.',
        expectedResult: 'The scanner will display a green indicator confirming you are inside the KRMU campus geofence.',
      },
    ],
    tips: [
      'Ensure "Precise Location" is toggled on so the geofencing check confirms you are in the correct block.',
    ],
    warnings: [
      'Attendance check-ins will be automatically rejected if your device GPS reports a location outside the K.R. Mangalam University campus boundary.',
    ],
    relatedIds: ['ATTENDANCE_LOCATION_PROBLEM', 'TECHNICAL_CAMERA_PERMISSIONS'],
  },
  {
    id: 'VERIFICATION_STATUS_EXPLAINED',
    title: 'What do "Verified", "Pending", and "Flagged" statuses mean?',
    categoryId: 'verification',
    summary: 'Explanation of student verification statuses on your Aarambh dashboard.',
    difficulty: 'Easy',
    readTime: '2 mins',
    keywords: ['status', 'verified', 'pending status', 'flagged', 'verification badge'],
    steps: [
      {
        title: 'Verified (Green Badge)',
        description: 'Your enrollment number and university records have been validated by the induction team. Full access is granted.',
      },
      {
        title: 'Pending (Amber Badge)',
        description: 'Your account is active, but physical document check-in at the orientation desk is scheduled.',
      },
      {
        title: 'Flagged (Red Badge)',
        description: 'A discrepancy was found in your enrollment ID or duplicate check-in attempt. Speak to an orientation coordinator.',
      },
    ],
    relatedIds: ['VERIFICATION_QR_IDENTITY'],
  },
  {
    id: 'VERIFICATION_OFFLINE_PASS',
    title: 'Using your student pass when offline',
    categoryId: 'verification',
    summary: 'How offline verification works using cached QR cryptographically signed badges.',
    difficulty: 'Easy',
    readTime: '1 min',
    keywords: ['offline', 'no network', 'wifi down', 'cached qr', 'offline pass'],
    steps: [
      {
        title: 'Load your pass once while connected to internet',
        description: 'Open Aarambh on your phone before leaving for campus so the pass is stored in your local browser cache.',
      },
      {
        title: 'Open Aarambh even without signal',
        description: 'The digital pass card will load offline with your cryptographic signature intact for scanners.',
      },
    ],
    relatedIds: ['VERIFICATION_QR_IDENTITY'],
  },

  // --- ATTENDANCE ---
  {
    id: 'ATTENDANCE_SCAN_QR',
    title: 'How to scan attendance QR codes at orientation sessions',
    categoryId: 'attendance',
    summary: 'Step-by-step instructions for marking session attendance using the Aarambh scanner.',
    difficulty: 'Easy',
    readTime: '2 mins',
    keywords: ['scan qr', 'mark attendance', 'how to scan', 'qr scanner', 'session attendance', 'attendance check'],
    steps: [
      {
        title: 'Navigate to "Mark Attendance" on the mobile menu',
        description: 'Open the navigation drawer and tap "Mark Attendance" or click the scanner icon.',
      },
      {
        title: 'Point your camera at the session QR code displayed in the hall',
        description: 'Hold your phone steady 1 to 2 meters away from the projector screen or desk QR stand.',
        expectedResult: 'A green checkmark modal will appear reading: "Attendance Recorded Successfully".',
      },
      {
        title: 'Verify your session appears in your Attendance History',
        description: 'Scroll down on your dashboard to see timestamped confirmation of your session check-in.',
      },
    ],
    tips: [
      'Wipe your camera lens if the scanner takes longer than 3 seconds to detect the QR code.',
    ],
    warnings: [
      'Attendance QR codes rotate dynamically. Never attempt to scan a photo of an old QR code.',
    ],
    relatedIds: ['ATTENDANCE_NOT_MARKING', 'ATTENDANCE_LOCATION_PROBLEM'],
  },
  {
    id: 'ATTENDANCE_NOT_MARKING',
    title: 'Why is my attendance not marking when I scan?',
    categoryId: 'attendance',
    summary: 'Troubleshooting common reasons why scanning a session QR code fails to mark attendance.',
    difficulty: 'Medium',
    readTime: '3 mins',
    keywords: ['not marking', 'attendance failed', 'scan error', 'qr error', 'checkin failed'],
    steps: [
      {
        title: 'Check if you have already checked into this session',
        description: 'The system prevents duplicate attendance markings for the same keynote or workshop.',
      },
      {
        title: 'Check session time window',
        description: 'Attendance windows close 20 minutes after the session start time. Ensure the session is currently active.',
      },
      {
        title: 'Verify your GPS location is inside campus',
        description: 'If you see "Outside Geofence Error", move away from indoor basements toward a window or open area and retry.',
      },
    ],
    tips: [
      'If the issue persists, show your digital QR pass to the volunteer desk at the hall entrance for manual check-in.',
    ],
    relatedIds: ['ATTENDANCE_SCAN_QR', 'ATTENDANCE_LOCATION_PROBLEM', 'TECHNICAL_CAMERA_PERMISSIONS'],
  },
  {
    id: 'ATTENDANCE_LOCATION_PROBLEM',
    title: 'Resolving GPS and Location Geofence errors during attendance',
    categoryId: 'attendance',
    summary: 'How to fix location inaccuracy when the scanner says you are outside the university boundary.',
    difficulty: 'Medium',
    readTime: '2 mins',
    keywords: ['geofence error', 'outside campus', 'gps error', 'location denied', 'inaccurate gps'],
    steps: [
      {
        title: 'Turn Wi-Fi ON even if using mobile data',
        description: 'Turning on Wi-Fi assists your phone GPS chip in triangulating your exact indoor block coordinates.',
      },
      {
        title: 'Disable VPN or Private Relay services',
        description: 'VPN apps and iCloud Private Relay can mask your real location, causing geofence rejection.',
      },
      {
        title: 'Refresh the scanner page after 10 seconds',
        description: 'Allow your device GPS 10 seconds to acquire high-accuracy satellite lock before tapping scan.',
      },
    ],
    warnings: [
      'Attendance cannot be marked from hostel rooms outside the academic block during academic hours.',
    ],
    relatedIds: ['VERIFICATION_GPS_PERMISSIONS', 'ATTENDANCE_SCAN_QR'],
  },
  {
    id: 'ATTENDANCE_LATE_CHECKIN',
    title: 'What happens if I arrive late to an orientation session?',
    categoryId: 'attendance',
    summary: 'Rules regarding late arrivals, grace periods, and attendance criteria for induction.',
    difficulty: 'Easy',
    readTime: '1 min',
    keywords: ['late attendance', 'late arrival', 'grace period', 'session closed', 'missed session'],
    steps: [
      {
        title: 'Scan within the 15-minute grace period',
        description: 'Most sessions allow attendance scanning for up to 15 minutes after the scheduled start time.',
      },
      {
        title: 'Report to the Faculty Coordinator if the QR has expired',
        description: 'If the projector QR is closed, speak to the faculty coordinator in the hall at the end of the session.',
      },
    ],
    relatedIds: ['ATTENDANCE_SCAN_QR', 'SCHEDULE_TIMETABLE_EXPLAINED'],
  },
  {
    id: 'ATTENDANCE_MINIMUM_CRITERIA',
    title: 'Minimum attendance requirements for Aarambh Induction 2026',
    categoryId: 'attendance',
    summary: 'Understanding mandatory keynote attendance requirements for certificate eligibility.',
    difficulty: 'Easy',
    readTime: '2 mins',
    keywords: ['minimum attendance', 'mandatory attendance', '75 percent', 'certificate', 'induction requirement'],
    steps: [
      {
        title: 'Attend all Mandatory Keynote Sessions',
        description: 'Keynotes marked with an amber "Mandatory" badge on the schedule are required for induction completion.',
      },
      {
        title: 'Track your attendance percentage on the dashboard',
        description: 'Your student dashboard displays your overall attendance progress meter in real time.',
      },
    ],
    relatedIds: ['ATTENDANCE_SCAN_QR', 'SCHEDULE_TIMETABLE_EXPLAINED'],
  },

  // --- CAMPUS NAVIGATION ---
  {
    id: 'CAMPUS_INTERACTIVE_MAP',
    title: 'How to use the interactive KRMU Campus Map',
    categoryId: 'campus',
    summary: 'Guide to exploring academic blocks, auditoriums, cafeterias, and landmarks on campus.',
    difficulty: 'Easy',
    readTime: '2 mins',
    keywords: ['campus map', 'where is block a', 'find auditorium', 'navigation', 'campus locations'],
    steps: [
      {
        title: 'Open Campus Navigation from the main menu',
        description: 'Click "Campus" in the navigation drawer to open the interactive map of K.R. Mangalam University.',
      },
      {
        title: 'Filter by category (Academic, Auditorium, Dining)',
        description: 'Use the category filter pills at the top to highlight specific blocks or facilities.',
      },
      {
        title: 'Tap any landmark for walking directions and block details',
        description: 'Clicking a building card displays the floor layout and orientation halls inside.',
      },
    ],
    relatedIds: ['CAMPUS_BLOCK_LOCATIONS'],
  },
  {
    id: 'CAMPUS_BLOCK_LOCATIONS',
    title: 'Key academic blocks and auditorium locations at KRMU',
    categoryId: 'campus',
    summary: 'Quick reference guide for A-Block, B-Block, C-Block, and Central Auditorium entrances.',
    difficulty: 'Easy',
    readTime: '2 mins',
    keywords: ['a block', 'b block', 'c block', 'auditorium', 'room numbers', 'building'],
    steps: [
      {
        title: 'A-Block (Administrative & Engineering Block)',
        description: 'Located at the main campus plaza entrance. Houses the Central Auditorium on the ground floor.',
      },
      {
        title: 'B-Block (Management & Law Block)',
        description: 'Adjacent to the central library. Seminar Halls B-101 and B-204 are located on floors 1 and 2.',
      },
      {
        title: 'C-Block (Sciences & Design Block)',
        description: 'Located near the sports arena. Houses design studios and innovation labs.',
      },
    ],
    relatedIds: ['CAMPUS_INTERACTIVE_MAP', 'SCHEDULE_TIMETABLE_EXPLAINED'],
  },
  {
    id: 'CAMPUS_DINING_FACILITIES',
    title: 'Cafeterias, dining courts, and hydration stations on campus',
    categoryId: 'campus',
    summary: 'Where to find meals, coffee shops, and drinking water during orientation breaks.',
    difficulty: 'Easy',
    readTime: '1 min',
    keywords: ['cafeteria', 'food', 'lunch block', 'dining court', 'coffee', 'water'],
    steps: [
      {
        title: 'Central Dining Hall',
        description: 'Located behind B-Block. Serves complimentary induction lunch for registered Class of 2026 students.',
      },
      {
        title: 'Campus Café & Juice Bars',
        description: 'Available on the ground floor of A-Block and C-Block courtyard.',
      },
    ],
    relatedIds: ['CAMPUS_INTERACTIVE_MAP'],
  },
  {
    id: 'CAMPUS_HOSTEL_GUIDELINES',
    title: 'Hostel check-in and luggage drop-off during induction',
    categoryId: 'campus',
    summary: 'Guidance for residential students arriving at KRMU hostels during Aarambh week.',
    difficulty: 'Easy',
    readTime: '2 mins',
    keywords: ['hostel', 'luggage', 'dorm', 'residential', 'checkin hostel'],
    steps: [
      {
        title: 'Report to the Hostel Reception Desk first',
        description: 'Show your admission letter and Aarambh verified badge to receive your room keys.',
      },
      {
        title: 'Complete biometric enrollment',
        description: 'Hostel gates require fingerprint or facial recognition check-in after 8:00 PM.',
      },
    ],
    relatedIds: ['CAMPUS_INTERACTIVE_MAP'],
  },

  // --- SCHEDULE ---
  {
    id: 'SCHEDULE_TIMETABLE_EXPLAINED',
    title: 'How to read your Orientation Schedule and filter by day',
    categoryId: 'schedule',
    summary: 'Understanding day-by-day induction timetables, keynote markers, and parallel workshops.',
    difficulty: 'Easy',
    readTime: '2 mins',
    keywords: ['schedule', 'timetable', 'orientation schedule', 'when is session', 'day 1', 'day 2'],
    steps: [
      {
        title: 'Open the Schedule route (/schedule)',
        description: 'Use the top date tabs (Day 1, Day 2, Day 3) to switch between induction days.',
      },
      {
        title: 'Check the venue block and room number',
        description: 'Each session card lists the exact auditorium or seminar hall location.',
      },
      {
        title: 'Add sessions to your personal calendar',
        description: 'Click "Add to Calendar" on any session card to download an .ics file for Apple or Google Calendar.',
      },
    ],
    relatedIds: ['ATTENDANCE_SCAN_QR', 'CAMPUS_BLOCK_LOCATIONS'],
  },
  {
    id: 'SCHEDULE_MANDATORY_VS_OPTIONAL',
    title: 'Difference between Mandatory Keynotes and Elective Workshops',
    categoryId: 'schedule',
    summary: 'How to know which sessions require mandatory attendance versus elective participation.',
    difficulty: 'Easy',
    readTime: '1 min',
    keywords: ['mandatory session', 'elective', 'optional workshop', 'keynote', 'required'],
    steps: [
      {
        title: 'Mandatory Keynotes (Amber Badge)',
        description: 'These sessions are required for all students and count toward induction completion percentage.',
      },
      {
        title: 'Elective Workshops (Burgundy Badge)',
        description: 'Choose any elective workshop that interests you during parallel afternoon slots.',
      },
    ],
    relatedIds: ['SCHEDULE_TIMETABLE_EXPLAINED', 'ATTENDANCE_MINIMUM_CRITERIA'],
  },
  {
    id: 'SCHEDULE_CHANGE_NOTIFICATIONS',
    title: 'How to receive live announcements and schedule updates',
    categoryId: 'schedule',
    summary: 'Stay informed about sudden venue changes or session timing updates during orientation.',
    difficulty: 'Easy',
    readTime: '1 min',
    keywords: ['announcements', 'schedule change', 'venue change', 'live updates', 'notifications'],
    steps: [
      {
        title: 'Check the Announcements megaphone icon in header',
        description: 'Red indicator badges alert you to new broadcasts from the logistics team.',
      },
      {
        title: 'Enable browser push notifications',
        description: 'When prompted, allow Aarambh to send notifications for real-time room changes.',
      },
    ],
    relatedIds: ['SCHEDULE_TIMETABLE_EXPLAINED'],
  },

  // --- CLUBS & SOCIETIES ---
  {
    id: 'CLUBS_SOCIETY_SELECTION',
    title: 'How to explore clubs and select up to two societies',
    categoryId: 'clubs',
    summary: 'Guide to browsing university societies and registering for your two preferred student clubs.',
    difficulty: 'Easy',
    readTime: '2 mins',
    keywords: ['clubs', 'societies', 'join club', 'how many clubs', 'two societies', 'cultural clubs'],
    steps: [
      {
        title: 'Open the Clubs & Societies portal (/clubs)',
        description: 'Browse all active KRMU clubs filtered by category (Technical, Cultural, Literary, Sports).',
      },
      {
        title: 'Review club commitments and event schedules',
        description: 'Click any club card to read its full description, leadership details, and meeting frequency.',
      },
      {
        title: 'Click "Join Society" on up to two clubs',
        description: 'You may register for a maximum of two student societies during the induction window.',
      },
    ],
    tips: [
      'You can filter clubs by available seats to find societies that are currently accepting new registrations.',
    ],
    warnings: [
      'Once the registration deadline closes on 22 August, society selections become locked for the semester.',
    ],
    relatedIds: ['CLUBS_CHANGE_SELECTION', 'CLUBS_REGISTRATION_DATES'],
  },
  {
    id: 'CLUBS_CHANGE_SELECTION',
    title: 'Can I change my club selection after registering?',
    categoryId: 'clubs',
    summary: 'Policy on modifying or canceling a club registration before the deadline.',
    difficulty: 'Medium',
    readTime: '1 min',
    keywords: ['change club', 'leave club', 'cancel registration', 'switch society'],
    steps: [
      {
        title: 'Check if the registration window is still open',
        description: 'Before 22 August, you may cancel an active club registration from your dashboard and select a different society.',
      },
      {
        title: 'After deadline closing',
        description: 'Once registrations close, club changes must be requested through the respective Club Faculty Advisor.',
      },
    ],
    relatedIds: ['CLUBS_SOCIETY_SELECTION', 'CLUBS_REGISTRATION_DATES'],
  },
  {
    id: 'CLUBS_REGISTRATION_DATES',
    title: 'Important club registration dates and seat limits',
    categoryId: 'clubs',
    summary: 'When club registrations open, when they close, and how seat allocation works.',
    difficulty: 'Easy',
    readTime: '1 min',
    keywords: ['club deadline', 'last date', '22 august', 'seats full', 'club seats'],
    steps: [
      {
        title: 'Registration Open Date',
        description: 'Club registrations open immediately after the Day 1 Student Societies Keynote.',
      },
      {
        title: 'Registration Deadline',
        description: 'The portal closes automatically on 22 August at midnight IST.',
      },
      {
        title: 'Seat Allocation',
        description: 'Most clubs operate on a first-come, first-served seat allocation basis.',
      },
    ],
    relatedIds: ['CLUBS_SOCIETY_SELECTION'],
  },
  {
    id: 'CLUBS_START_NEW_CLUB',
    title: 'How to propose a new student club or society at KRMU',
    categoryId: 'clubs',
    summary: 'Information for students interested in founding a new special interest society on campus.',
    difficulty: 'Medium',
    readTime: '2 mins',
    keywords: ['start club', 'new society', 'founder club', 'propose society'],
    steps: [
      {
        title: 'Gather 15 interested founding members',
        description: 'New clubs require a founding roster of at least 15 registered KRMU students.',
      },
      {
        title: 'Submit a proposal to the Student Welfare Office',
        description: 'Download the Club Proposal Form from the documents section and submit to the Dean of Student Welfare.',
      },
    ],
    relatedIds: ['CLUBS_SOCIETY_SELECTION'],
  },

  // --- TECHNICAL ISSUES ---
  {
    id: 'TECHNICAL_CAMERA_PERMISSIONS',
    title: 'Fixing camera permission denied errors in QR scanner',
    categoryId: 'technical',
    summary: 'How to enable mobile camera access for iOS Safari and Android Chrome when scanning QR codes.',
    difficulty: 'Easy',
    readTime: '2 mins',
    keywords: ['camera permission', 'camera denied', 'scanner black screen', 'enable camera', 'safari camera'],
    steps: [
      {
        title: 'iOS Safari Camera Reset',
        description: 'Go to Settings > Safari > Camera, and select "Allow" or "Ask". Reload the scanner page.',
      },
      {
        title: 'Android Chrome Camera Reset',
        description: 'Tap the three dots menu > Settings > Site Settings > Camera, and ensure Aarambh is allowed.',
      },
      {
        title: 'Ensure no other app is using the camera',
        description: 'Close background apps like Instagram, Snapchat, or Zoom that might be holding the camera hardware lock.',
      },
    ],
    tips: [
      'If your screen stays black, tap the "Switch Camera" button to toggle between front and rear lenses.',
    ],
    relatedIds: ['ATTENDANCE_SCAN_QR', 'VERIFICATION_GPS_PERMISSIONS'],
  },
  {
    id: 'TECHNICAL_BROWSER_COMPATIBILITY',
    title: 'Recommended web browsers and device compatibility',
    categoryId: 'technical',
    summary: 'Best browsers for running the Aarambh portal smoothly on mobile and laptop devices.',
    difficulty: 'Easy',
    readTime: '1 min',
    keywords: ['browser', 'safari', 'chrome', 'supported browser', 'website not working', 'compatibility'],
    steps: [
      {
        title: 'Use Google Chrome, Apple Safari, or Mozilla Firefox',
        description: 'Aarambh is optimized for all modern ES6-compatible web browsers on iOS, Android, macOS, and Windows.',
      },
      {
        title: 'Avoid in-app embedded browsers',
        description: 'Do not open Aarambh inside Instagram, WhatsApp, or LinkedIn in-app browsers, as they restrict camera and GPS APIs.',
      },
    ],
    tips: [
      'Always tap "Open in Safari" or "Open in Chrome" from three dots menu if you clicked a link inside a messaging app.',
    ],
    relatedIds: ['TECHNICAL_CAMERA_PERMISSIONS', 'VERIFICATION_GPS_PERMISSIONS'],
  },
  {
    id: 'TECHNICAL_CLEAR_CACHE',
    title: 'How to clear application cache and reset local storage',
    categoryId: 'technical',
    summary: 'Fixing persistent glitches or stale schedules by clearing your browser cache.',
    difficulty: 'Easy',
    readTime: '2 mins',
    keywords: ['clear cache', 'reset app', 'stale data', 'hard refresh', 'glitch', 'clear storage'],
    steps: [
      {
        title: 'Perform a Hard Refresh on Desktop',
        description: 'Press Ctrl+F5 (Windows/Linux) or Cmd+Shift+R (macOS) to reload all application scripts.',
      },
      {
        title: 'Clear Website Data on iOS Safari',
        description: 'Go to Settings > Safari > Advanced > Website Data, search for the university domain, and delete data.',
      },
      {
        title: 'Clear Site Storage on Android Chrome',
        description: 'Tap lock icon in address bar > Cookies and site data > Delete data.',
      },
    ],
    relatedIds: ['REGISTRATION_LOGIN_ISSUES', 'TECHNICAL_BROWSER_COMPATIBILITY'],
  },
  {
    id: 'TECHNICAL_OFFLINE_PWA',
    title: 'Installing Aarambh as a mobile app (PWA)',
    categoryId: 'technical',
    summary: 'How to add Aarambh to your iPhone or Android home screen for instant full-screen app access.',
    difficulty: 'Easy',
    readTime: '1 min',
    keywords: ['install app', 'pwa', 'add to home screen', 'mobile app', 'download app'],
    steps: [
      {
        title: 'iPhone (Safari)',
        description: 'Tap the Share icon at the bottom of Safari and select "Add to Home Screen".',
      },
      {
        title: 'Android (Chrome)',
        description: 'Tap the three dots menu in Chrome and select "Install App" or "Add to Home screen".',
      },
    ],
    tips: [
      'Installing as an app provides quicker access to your digital QR pass and full-screen attendance scanning.',
    ],
    relatedIds: ['VERIFICATION_OFFLINE_PASS'],
  },

  // --- ACCOUNT & PROFILE ---
  {
    id: 'ACCOUNT_PASSWORD_RESET',
    title: 'How to change or reset your Aarambh password',
    categoryId: 'account',
    summary: 'Instructions for updating your account password or recovering a forgotten password.',
    difficulty: 'Easy',
    readTime: '1 min',
    keywords: ['change password', 'reset password', 'forgot password', 'new password', 'security'],
    steps: [
      {
        title: 'If you are logged out: Use "Forgot Password"',
        description: 'Click "Forgot Password?" on the login screen and follow the instructions sent to your university inbox.',
      },
      {
        title: 'If you are logged in: Go to Account Settings',
        description: 'Open your Profile Dropdown in the top right, select "Security Settings", and enter your new password.',
      },
    ],
    relatedIds: ['REGISTRATION_LOGIN_ISSUES'],
  },
  {
    id: 'ACCOUNT_EDIT_PROFILE',
    title: 'Can I edit my student profile details after registration?',
    categoryId: 'account',
    summary: 'Which profile fields can be modified by students and which require coordinator assistance.',
    difficulty: 'Medium',
    readTime: '2 mins',
    keywords: ['edit profile', 'change name', 'update phone', 'change course', 'student details'],
    steps: [
      {
        title: 'Editable Fields (Phone number, Emergency contact, Bio)',
        description: 'You can update your mobile number and emergency contact anytime from your Profile Settings page.',
      },
      {
        title: 'Locked Fields (Name, Enrollment Number, Course, Official Email)',
        description: 'Official academic details are locked after registration to preserve attendance integrity.',
      },
      {
        title: 'Requesting an official name or enrollment correction',
        description: 'If there is a spelling error in your legal name, contact the Platform Lead with your admission letter.',
      },
    ],
    relatedIds: ['REGISTRATION_CREATE_ACCOUNT', 'VERIFICATION_STATUS_EXPLAINED'],
  },
  {
    id: 'ACCOUNT_EMAIL_CHANGE',
    title: 'How to update your registered email address',
    categoryId: 'account',
    summary: 'What to do if you registered with a personal email and need to switch to your university email.',
    difficulty: 'Medium',
    readTime: '2 mins',
    keywords: ['change email', 'university email', 'wrong email', 'update email'],
    steps: [
      {
        title: 'Contact the Platform Team before Day 1',
        description: 'Email address migrations require verification of both the old and new email addresses by support.',
      },
      {
        title: 'Verify the new university inbox',
        description: 'A confirmation link will be sent to your new @krmangalam.edu.in email address once processed.',
      },
    ],
    relatedIds: ['REGISTRATION_EMAIL_VERIFY', 'ACCOUNT_EDIT_PROFILE'],
  },
];

/**
 * Deduplicated Frequently Asked Questions (FAQ)
 * Each FAQ links directly to an existing in-depth HelpArticle by targetArticleId
 */
export const HELP_FAQS: HelpFAQ[] = [
  {
    id: 'faq_change_club',
    question: 'Can I change my club selection after registering?',
    answerSummary: 'Yes, you can modify or cancel your society selections from your dashboard at any point before the registration deadline on 22 August.',
    targetArticleId: 'CLUBS_CHANGE_SELECTION',
  },
  {
    id: 'faq_register_twice',
    question: 'Can I register twice with different email addresses?',
    answerSummary: 'No. Each enrollment number can only be registered once. Creating duplicate accounts will flag your verification badge.',
    targetArticleId: 'REGISTRATION_DUPLICATE_ERROR',
  },
  {
    id: 'faq_how_many_clubs',
    question: 'How many clubs and societies can I join?',
    answerSummary: 'You may register for a maximum of two student societies during the Aarambh induction registration window.',
    targetArticleId: 'CLUBS_SOCIETY_SELECTION',
  },
  {
    id: 'faq_attendance_not_marking',
    question: 'Why is my attendance not marking when I scan the QR?',
    answerSummary: 'Ensure you are inside the campus geofence, your camera lens is clean, and you have not already checked into this session.',
    targetArticleId: 'ATTENDANCE_NOT_MARKING',
  },
  {
    id: 'faq_qr_wont_scan',
    question: 'What should I do if the QR code wont scan on my phone camera?',
    answerSummary: 'Check camera permissions in Safari/Chrome settings, or tap Switch Camera. You can also report to the desk volunteer.',
    targetArticleId: 'TECHNICAL_CAMERA_PERMISSIONS',
  },
  {
    id: 'faq_edit_profile',
    question: 'Can I edit my profile information after verification?',
    answerSummary: 'You can update your phone and emergency contact anytime. Enrollment number and name corrections require coordinator assistance.',
    targetArticleId: 'ACCOUNT_EDIT_PROFILE',
  },
  {
    id: 'faq_change_email',
    question: 'How do I change my registered email address?',
    answerSummary: 'To switch from a personal email to your official university email, contact our support team before induction Day 1.',
    targetArticleId: 'ACCOUNT_EMAIL_CHANGE',
  },
];
