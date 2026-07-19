import { createLazyFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

export const Route = createLazyFileRoute('/privacy')({
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
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
        <div className="glass-premium-v2 rounded-3xl p-8 md:p-12 mb-8">
          <h1 className="text-hero-heading text-primary font-bold mb-2">Privacy Policy</h1>
          <p className="text-sm text-[#7a4020]/60 mb-8">Last Updated: {new Date().toLocaleDateString()}</p>
          
          <div className="prose prose-orange max-w-none text-body-primary text-secondary space-y-6">
            <p>At EOZKA, we are deeply committed to protecting your privacy and personal data. This Privacy Policy outlines our practices regarding data collection, protection, and usage in strict alignment with privacy-first principles, the <strong>Information Technology Act, 2000</strong>, the <strong>Digital Personal Data Protection Act, 2023 (DPDP Act)</strong>, and university guidelines.</p>
            
            <h2 className="text-heading text-primary font-bold mt-8 mb-4">1. Information Collected</h2>
            <p>To provide a seamless and secure induction experience, we collect specific categories of information.</p>
            
            <h3 className="text-card-title text-primary font-bold mt-6 mb-3">Personal Information</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>Name</li>
              <li>Email Address</li>
              <li>Student ID (Roll Number)</li>
              <li>School / Faculty</li>
              <li>Department</li>
              <li>Course enrolled</li>
              <li>Semester</li>
            </ul>

            <h3 className="text-card-title text-primary font-bold mt-6 mb-3">Technical Information</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>Browser type and version</li>
              <li>Device identifiers and characteristics</li>
              <li>IP Address</li>
              <li>Login timestamps and session duration</li>
              <li>Comprehensive audit logs of critical actions</li>
              <li>Country or geographic region (for security verification)</li>
              <li>User Agent strings</li>
            </ul>

            <h3 className="text-card-title text-primary font-bold mt-6 mb-3">Usage Information</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>Attendance records (events attended, timestamps)</li>
              <li>Announcements viewed and interaction metrics</li>
              <li>Documents accessed or downloaded</li>
              <li>Club registrations and extracurricular interests</li>
              <li>QR scans (including timestamp and location context)</li>
            </ul>

            <h2 className="text-heading text-primary font-bold mt-8 mb-4">2. Why We Collect Data</h2>
            <p>We operate on a principle of minimal data collection. The data we collect is utilized strictly for the following purposes:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Authentication:</strong> Verifying user identity via secure OTP protocols.</li>
              <li><strong>Attendance:</strong> Accurate logging of presence for academic compliance.</li>
              <li><strong>Security:</strong> Monitoring for unauthorized access or suspicious behavior.</li>
              <li><strong>Notifications:</strong> Delivering timely and relevant university updates.</li>
              <li><strong>Document delivery:</strong> Ensuring students receive necessary academic materials securely.</li>
              <li><strong>Platform analytics:</strong> Monitoring system health and optimizing user experience.</li>
              <li><strong>University administration:</strong> Aiding university staff in managing induction cohorts.</li>
              <li><strong>Fraud prevention:</strong> Detecting and mitigating proxy attendance or abuse.</li>
            </ul>

            <h2 className="text-heading text-primary font-bold mt-8 mb-4">3. Data Protection</h2>
            <p>We treat your data with the highest level of security. Our enterprise-grade protection mechanisms include:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Encryption:</strong> Data is encrypted both in transit (TLS) and at rest.</li>
              <li><strong>Role-based access:</strong> Strict logical separation ensures users only see what they are authorized to see.</li>
              <li><strong>Firebase Authentication:</strong> Leveraging industry-leading secure identity management.</li>
              <li><strong>Firestore Security Rules:</strong> Granular database rules preventing unauthorized reads or writes.</li>
              <li><strong>Signed URLs:</strong> Time-limited, secure links for document downloads to prevent unauthorized sharing.</li>
              <li><strong>Rate limiting:</strong> Protection against brute-force attacks and automated scrapers.</li>
              <li><strong>Secure cloud infrastructure:</strong> Hosted on world-class, compliant cloud providers.</li>
              <li><strong>Minimal data collection:</strong> We only collect what is strictly necessary to run the platform.</li>
            </ul>

            <h2 className="text-heading text-primary font-bold mt-8 mb-4">4. Data Sharing</h2>
            <p><strong>EOZKA does NOT sell student data to any third parties, advertisers, or external brokers.</strong></p>
            <p>Your information is tightly controlled and is only accessible to:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Authorized university administrators and faculty members</li>
              <li>Platform administrators for technical support and maintenance</li>
              <li>Authorized backend services strictly required for platform functionality</li>
              <li>Legal authorities, only when explicitly required by applicable law or a valid court order</li>
            </ul>

            <h2 className="text-heading text-primary font-bold mt-8 mb-4">5. Student Rights</h2>
            <p>We respect your rights regarding your personal data. As a student, you have the right to:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Update your profile information to ensure accuracy</li>
              <li>Request corrections to any administrative errors in your record</li>
              <li>Delete your account where applicable (subject to university retention policies for academic records)</li>
              <li>Contact platform administrators regarding privacy concerns</li>
            </ul>

            <h2 className="text-heading text-primary font-bold mt-8 mb-4">6. Cookies</h2>
            <p>We respect your digital footprint. The EOZKA platform utilizes <strong>only essential cookies</strong> required for the core functionality and security of the application. <strong>We do not use advertising cookies, nor do we employ third-party tracking cookies.</strong> For detailed information, please review our <Link to="/cookies" className="text-[#8a4a22] hover:underline">Cookie Policy</Link>.</p>

            <h2 className="text-heading text-primary font-bold mt-8 mb-4">7. Data Retention</h2>
            <p>Data is retained only as long as necessary to fulfill its intended purpose and in compliance with university directives. Specific retention periods include:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Attendance records:</strong> Retained for academic compliance.</li>
              <li><strong>Registration details:</strong> Maintained for the duration of your academic life cycle.</li>
              <li><strong>Audit logs:</strong> Retained temporarily for security analysis.</li>
              <li><strong>Documents:</strong> Retained according to specific university policy and academic calendar requirements.</li>
            </ul>

            <h2 className="text-heading text-primary font-bold mt-8 mb-4">8. Contact</h2>
            <p>For any questions regarding this Privacy Policy, your data, or security concerns, please contact:</p>
            <p><strong>Support Email:</strong> privacy@eozka.com</p>
            <p><strong>Organization:</strong> EOZKA in partnership with K.R. Mangalam University</p>
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
