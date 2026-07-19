import { createLazyFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

export const Route = createLazyFileRoute('/terms')({
  component: TermsOfService,
});

function TermsOfService() {
  return (
    <div className="min-h-screen bg-[#faf8f6] flex flex-col">
      <header className="glass-premium-v2 rounded-none border-x-0 border-t-0 border-b border-[#8a4a22]/10 sticky top-0 z-40 flex-none">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center gap-2 text-[#7a4020] hover:text-[#8a4a22] transition-colors">
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm font-semibold">Back to Home</span>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#8a4a22] to-[#5a2c14] flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-lg leading-none">E</span>
              </div>
              <span className="font-bold text-lg tracking-tight text-[#2c1208]">EOZKA</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="glass-premium-v2 rounded-3xl p-8 md:p-12">
          <h1 className="text-hero-heading text-primary font-bold mb-2">Terms of Service</h1>
          <p className="text-sm text-[#7a4020]/60 mb-8">Last Updated: {new Date().toLocaleDateString()}</p>
          
          <div className="prose prose-orange max-w-none text-body-primary text-secondary space-y-6">
            <h2 className="text-heading text-primary font-bold mt-8 mb-4">1. Introduction</h2>
            <p>Welcome to the EOZKA Induction Management Platform. EOZKA is a comprehensive, secure system developed for K.R. Mangalam University to streamline the student induction process, manage digital attendance, distribute official documents, and facilitate university communications.</p>
            
            <h2 className="text-heading text-primary font-bold mt-8 mb-4">2. Eligibility</h2>
            <p>Access to this platform is restricted to authorized individuals. Students must use their official university credentials where required to register and access platform features. All accounts created on this platform are personal, non-transferable, and strictly tied to the individual student's identity.</p>

            <h2 className="text-heading text-primary font-bold mt-8 mb-4">3. User Responsibilities</h2>
            <p>By accessing and using this platform, students agree to adhere to the following responsibilities:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Provide accurate and truthful information during registration and profile updates.</li>
              <li>Protect login credentials and ensure they are not disclosed to third parties.</li>
              <li>Never share One-Time Passwords (OTPs) with anyone.</li>
              <li>Never impersonate another student or attempt to access their account.</li>
              <li>Never manipulate, forge, or bypass the digital attendance tracking system.</li>
              <li>Never misuse QR codes assigned for event check-ins.</li>
              <li>Never upload malicious files, scripts, or unauthorized content.</li>
              <li>Respect all university policies and guidelines while using the platform.</li>
              <li>Maintain discipline and professional conduct while engaging with platform features.</li>
            </ul>

            <h2 className="text-heading text-primary font-bold mt-8 mb-4">4. Platform Usage</h2>
            <p>The EOZKA platform exists solely to facilitate university operations. Permitted uses include:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Induction program management and participation</li>
              <li>Academic onboarding and orientation</li>
              <li>Official communication between administration and students</li>
              <li>Distribution and access of university documents</li>
              <li>Club registrations and extracurricular engagement</li>
              <li>Official event attendance tracking</li>
            </ul>
            <p><strong>No commercial usage:</strong> Any commercial, promotional, or unauthorized use of this platform is strictly prohibited.</p>

            <h2 className="text-heading text-primary font-bold mt-8 mb-4">5. Attendance Policy</h2>
            <p>Digital attendance tracking is a core component of this platform. Please note:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>QR attendance can only be marked during the designated official session windows.</li>
              <li>Fraudulent attendance attempts (including proxy scanning or location spoofing) may result in severe disciplinary action by the university.</li>
              <li>The system actively logs multiple scans, anomalies, and spoofing attempts to maintain integrity.</li>
            </ul>

            <h2 className="text-heading text-primary font-bold mt-8 mb-4">6. Documents</h2>
            <p>The platform hosts sensitive administrative and academic documents.</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>All documents available on the platform remain the exclusive intellectual property of the university.</li>
              <li>Students may download provided materials solely for personal academic use.</li>
              <li>Redistribution, publication, or unauthorized sharing of these documents without explicit permission is strictly prohibited.</li>
            </ul>

            <h2 className="text-heading text-primary font-bold mt-8 mb-4">7. Announcements</h2>
            <p>All official announcements broadcasted through the EOZKA platform are considered valid and binding university communications. Students are solely responsible for checking their notifications regularly to stay informed about schedules, updates, and requirements.</p>

            <h2 className="text-heading text-primary font-bold mt-8 mb-4">8. Security</h2>
            <p>EOZKA employs enterprise-grade security measures to protect the platform and its users. These include, but are not limited to:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>End-to-end data encryption</li>
              <li>Secure OTP-based authentication</li>
              <li>Strict Firebase Security Rules governing data access</li>
              <li>Comprehensive audit logging of critical actions</li>
              <li>Rate limiting to prevent abuse</li>
              <li>Signed URLs for secure document delivery</li>
              <li>Secure, robust cloud storage infrastructure</li>
            </ul>

            <h2 className="text-heading text-primary font-bold mt-8 mb-4">9. Reporting Security Issues</h2>
            <p>If you discover a security vulnerability, please report it responsibly to EOZKA. Do not publicly disclose vulnerabilities before they are investigated.</p>

            <h2 className="text-heading text-primary font-bold mt-8 mb-4">10. Prohibited Activities</h2>
            <p>Users are strictly prohibited from engaging in the following activities:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Reverse engineering, decompiling, or disassembling platform software</li>
              <li>Automated scraping, data mining, or data extraction</li>
              <li>Using bots, scripts, or automated tools to interact with the platform</li>
              <li>Credential sharing or account trading</li>
              <li>Attempting SQL injection or any form of database manipulation</li>
              <li>Cross-Site Scripting (XSS) attempts</li>
              <li>Unauthorized API usage or endpoint discovery</li>
              <li>Inspect-based tampering or client-side manipulation</li>
              <li>Uploading malware, viruses, or destructive code</li>
              <li>Bypassing authentication or authorization mechanisms</li>
            </ul>

            <h2 className="text-heading text-primary font-bold mt-8 mb-4">11. Intellectual Property</h2>
            <p><strong>EOZKA owns:</strong> The platform infrastructure, UI/UX design, branding, software architecture, and source code.</p>
            <p><strong>The University owns:</strong> All official documents, event schedules, administrative announcements, and academic material hosted on the platform.</p>

            <h2 className="text-heading text-primary font-bold mt-8 mb-4">12. Limitation of Liability</h2>
            <p>While EOZKA provides a highly secure and reliable infrastructure, we are not responsible or liable for:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Internet outages, connectivity issues, or carrier disruptions</li>
              <li>Compromise of user devices or personal networks</li>
              <li>Forgotten passwords or lost access to registered email accounts</li>
              <li>Student negligence resulting in missed deadlines or attendance</li>
            </ul>

            <h2 className="text-heading text-primary font-bold mt-8 mb-4">13. Account Suspension</h2>
            <p>EOZKA and authorized university administrators reserve the right to suspend or terminate accounts immediately for the following reasons:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Academic or behavioral misconduct</li>
              <li>Security violations or attempts to breach platform integrity</li>
              <li>Fake registrations or use of falsified credentials</li>
              <li>Attendance fraud or proxy scanning</li>
              <li>Any violation of these Terms or broader university policies</li>
            </ul>

            <h2 className="text-heading text-primary font-bold mt-8 mb-4">14. Changes to Terms</h2>
            <p>EOZKA reserves the right to update or modify these policies at any time to reflect changes in legal requirements or platform functionality. Continued use of the platform after any such updates constitutes formal acceptance of the revised Terms.</p>
          </div>
        </div>
      </main>

      <footer className="w-full text-center py-6 border-t border-[#8a4a22]/10 mt-auto flex-none">
        <p className="text-xs text-[#7a4020]/60">
          &copy; 2026 EOZKA Technologies. Developed for K.R. Mangalam University. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
