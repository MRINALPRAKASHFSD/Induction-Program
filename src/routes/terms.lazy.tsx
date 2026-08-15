import { createLazyFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

export const Route = createLazyFileRoute('/terms')({
  component: TermsOfService,
});

function TermsOfService() {
  return (
    <div className="min-h-screen bg-[#faf8f6] flex flex-col">
      <header className="glass-premium-v2 rounded-none border-x-0 border-t-0 border-b border-[#8a4a22]/10 sticky top-0 z-40 flex-none bg-background/80 backdrop-blur-xl">
        <div className="max-w-[900px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center gap-2 text-[#7a4020] hover:text-[#8a4a22] transition-colors">
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm font-semibold">Back to Home</span>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#8a4a22] to-[#5a2c14] flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-lg leading-none">e</span>
              </div>
              <span className="font-bold text-lg tracking-tight text-[#2c1208]">eOzka</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[900px] mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[#2c1208] mb-4" style={{ fontFamily: 'Georgia, serif' }}>
            Terms of Service
          </h1>
          <p className="text-lg md:text-xl text-[#7a4020]/80 font-medium mb-5">
            Aarambh 2026 Digital Induction Platform
          </p>
          <div className="h-1 w-16 bg-gradient-to-r from-[#d4af37] to-[#8a4a22] mx-auto rounded-full mb-5"></div>
          <p className="text-sm text-[#7a4020]/60 font-medium uppercase tracking-widest">
            Last Updated: 15 August 2026
          </p>
        </div>
        
        <div className="space-y-8">
          <SectionCard title="1. Introduction">
            <p>Welcome to the eOzka Induction Management Platform. eOzka is a comprehensive, secure system developed for K.R. Mangalam University to streamline the student induction process, manage digital attendance, distribute official documents, and facilitate university communications.</p>
          </SectionCard>
          
          <SectionCard title="2. Eligibility">
            <p>Access to this platform is restricted to authorized individuals. Students must use their official university credentials where required to register and access platform features. All accounts created on this platform are personal, non-transferable, and strictly tied to the individual student's identity.</p>
          </SectionCard>

          <SectionCard title="3. User Responsibilities">
            <p className="mb-4">By accessing and using this platform, students agree to adhere to the following responsibilities:</p>
            <ul className="list-disc pl-5 space-y-3">
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
          </SectionCard>

          <SectionCard title="4. Platform Usage">
            <p className="mb-4">The eOzka platform exists solely to facilitate university operations. Permitted uses include:</p>
            <ul className="list-disc pl-5 space-y-3 mb-4">
              <li>Induction program management and participation</li>
              <li>Academic onboarding and orientation</li>
              <li>Official communication between administration and students</li>
              <li>Distribution and access of university documents</li>
              <li>Club registrations and extracurricular engagement</li>
              <li>Official event attendance tracking</li>
            </ul>
            <p><strong>No commercial usage:</strong> Any commercial, promotional, or unauthorized use of this platform is strictly prohibited.</p>
          </SectionCard>

          <SectionCard title="5. Attendance Policy">
            <p className="mb-4">Digital attendance tracking is a core component of this platform. Please note:</p>
            <ul className="list-disc pl-5 space-y-3">
              <li>QR attendance can only be marked during the designated official session windows.</li>
              <li>Fraudulent attendance attempts (including proxy scanning or location spoofing) may result in severe disciplinary action by the university.</li>
              <li>The system actively logs multiple scans, anomalies, and spoofing attempts to maintain integrity.</li>
            </ul>
          </SectionCard>

          <SectionCard title="6. Documents">
            <p className="mb-4">The platform hosts sensitive administrative and academic documents.</p>
            <ul className="list-disc pl-5 space-y-3">
              <li>All documents available on the platform remain the exclusive intellectual property of the university.</li>
              <li>Students may download provided materials solely for personal academic use.</li>
              <li>Redistribution, publication, or unauthorized sharing of these documents without explicit permission is strictly prohibited.</li>
            </ul>
          </SectionCard>

          <SectionCard title="7. Announcements">
            <p>All official announcements broadcasted through the eOzka platform are considered valid and binding university communications. Students are solely responsible for checking their notifications regularly to stay informed about schedules, updates, and requirements.</p>
          </SectionCard>

          <SectionCard title="8. Security">
            <p className="mb-4">eOzka employs enterprise-grade security measures to protect the platform and its users. These include, but are not limited to:</p>
            <ul className="list-disc pl-5 space-y-3">
              <li>End-to-end data encryption</li>
              <li>Secure OTP-based authentication</li>
              <li>Strict Firebase Security Rules governing data access</li>
              <li>Comprehensive audit logging of critical actions</li>
              <li>Rate limiting to prevent abuse</li>
              <li>Signed URLs for secure document delivery</li>
              <li>Secure, robust cloud storage infrastructure</li>
            </ul>
          </SectionCard>

          <SectionCard title="9. Reporting Security Issues">
            <p>If you discover a security vulnerability, please report it responsibly to eOzka. Do not publicly disclose vulnerabilities before they are investigated.</p>
          </SectionCard>

          <SectionCard title="10. Prohibited Activities">
            <p className="mb-4">Users are strictly prohibited from engaging in the following activities:</p>
            <ul className="list-disc pl-5 space-y-3">
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
          </SectionCard>

          <SectionCard title="11. Intellectual Property">
            <p className="mb-4"><strong>eOzka owns:</strong> The platform infrastructure, UI/UX design, branding, software architecture, and source code.</p>
            <p><strong>The University owns:</strong> All official documents, event schedules, administrative announcements, and academic material hosted on the platform.</p>
          </SectionCard>

          <SectionCard title="12. Limitation of Liability">
            <p className="mb-4">While eOzka provides a highly secure and reliable infrastructure, we are not responsible or liable for:</p>
            <ul className="list-disc pl-5 space-y-3">
              <li>Internet outages, connectivity issues, or carrier disruptions</li>
              <li>Compromise of user devices or personal networks</li>
              <li>Forgotten passwords or lost access to registered email accounts</li>
              <li>Student negligence resulting in missed deadlines or attendance</li>
            </ul>
          </SectionCard>

          <SectionCard title="13. Account Suspension">
            <p className="mb-4">eOzka and authorized university administrators reserve the right to suspend or terminate accounts immediately for the following reasons:</p>
            <ul className="list-disc pl-5 space-y-3">
              <li>Academic or behavioral misconduct</li>
              <li>Security violations or attempts to breach platform integrity</li>
              <li>Fake registrations or use of falsified credentials</li>
              <li>Attendance fraud or proxy scanning</li>
              <li>Any violation of these Terms or broader university policies</li>
            </ul>
          </SectionCard>

          <SectionCard title="14. Changes to Terms">
            <p>eOzka reserves the right to update or modify these policies at any time to reflect changes in legal requirements or platform functionality. Continued use of the platform after any such updates constitutes formal acceptance of the revised Terms.</p>
          </SectionCard>
        </div>
      </main>

      <footer className="w-full text-center py-8 border-t border-[#8a4a22]/10 mt-auto flex-none bg-[#faf8f6]">
        <p className="text-xs text-[#7a4020]/60 font-medium">
          &copy; 2026 eOzka Technologies. Developed for K.R. Mangalam University. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#fffff8] rounded-3xl p-8 md:p-10 border border-[#d4af37]/30 shadow-[0_4px_20px_rgba(138,74,34,0.03)] hover:shadow-[0_8px_30px_rgba(138,74,34,0.06)] transition-shadow duration-300">
      <h2 className="text-2xl font-bold text-[#2c1208] mb-5 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
        {title}
      </h2>
      <div className="text-[16px] leading-[1.8] text-[#5a2c14]/90 font-medium">
        {children}
      </div>
    </section>
  );
}
