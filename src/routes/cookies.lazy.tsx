import { createLazyFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

export const Route = createLazyFileRoute('/cookies')({
  component: CookiePolicy,
});

function CookiePolicy() {
  return (
    <div className="min-h-screen bg-[#faf8f6] flex flex-col">
      <header className="bg-white/80 backdrop-blur-md border-b border-[#8a4a22]/10 sticky top-0 z-40 flex-none">
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
        <div className="bg-white rounded-2xl shadow-sm border border-[#8a4a22]/10 p-8 md:p-12 mb-8">
          <h1 className="text-3xl font-bold text-[#2c1208] mb-2">Cookie Policy</h1>
          <p className="text-sm text-[#7a4020]/60 mb-8">Last Updated: {new Date().toLocaleDateString()}</p>
          
          <div className="prose prose-orange max-w-none text-[#5a2c14] space-y-6">
            <p>At EOZKA, we believe in transparent, privacy-first technology. This Cookie Policy explains how and why we use cookies on the Induction Management Platform.</p>
            
            <h2 className="text-xl font-bold text-[#2c1208] mt-8 mb-4">1. What Are Cookies?</h2>
            <p>Cookies are small text files stored on your browser or device by websites you visit. They are widely used to make platforms function efficiently, as well as to provide critical security and state management during your session.</p>
            
            <h2 className="text-xl font-bold text-[#2c1208] mt-8 mb-4">2. Essential Cookies Only</h2>
            <p>We are proud to operate a <strong>privacy-first</strong> platform. We deploy <strong>only essential cookies</strong>. We strictly prohibit the use of advertising networks, cross-site trackers, or any invasive profiling technologies.</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>No advertising cookies:</strong> We do not track you to serve ads.</li>
              <li><strong>No third-party tracking cookies:</strong> Your usage data stays on the platform and is not sold or shared with data brokers.</li>
            </ul>

            <h2 className="text-xl font-bold text-[#2c1208] mt-8 mb-4">3. Types of Cookies We Use</h2>
            <p>To ensure the platform operates securely and efficiently, we utilize the following categories of essential cookies:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Authentication cookies:</strong> To identify you once you have securely logged in via OTP, ensuring you do not have to re-authenticate on every page load.</li>
              <li><strong>Session cookies:</strong> To maintain your active session state as you navigate between announcements, attendance, and documents.</li>
              <li><strong>Security cookies:</strong> To protect against malicious activity, unauthorized access attempts, and Cross-Site Request Forgery (CSRF).</li>
              <li><strong>Remember-me preferences:</strong> To store your basic UI state and preferences (such as "mark as read" statuses for notifications).</li>
              <li><strong>Performance cookies:</strong> To ensure the backend services route your requests efficiently without degrading platform speed.</li>
            </ul>

            <h2 className="text-xl font-bold text-[#2c1208] mt-8 mb-4">4. Cookie Management & Disabling Cookies</h2>
            <p>You have full control over your browser settings and can choose to block or delete cookies at any time via your browser controls.</p>
            
            <h3 className="text-lg font-semibold text-[#2c1208] mt-6 mb-3">Browser Controls</h3>
            <p>Most modern web browsers (Chrome, Safari, Firefox, Edge) allow you to manage your cookie preferences through their settings menus. You can configure your browser to refuse all cookies or to indicate when a cookie is being sent.</p>
            
            <h3 className="text-lg font-semibold text-[#2c1208] mt-6 mb-3">Effect of Disabling Cookies</h3>
            <p>Because the EOZKA platform relies solely on strictly necessary cookies, disabling them will severely impact your ability to use the system. Specifically:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Effect on login:</strong> You will be unable to maintain a logged-in state, forcing a logout immediately after authentication.</li>
              <li><strong>Effect on QR attendance:</strong> Your device will not be able to securely verify your identity during a QR scan, preventing you from logging attendance.</li>
              <li><strong>Effect on notifications:</strong> Read/unread states for announcements may fail to sync correctly.</li>
            </ul>

            <h2 className="text-xl font-bold text-[#2c1208] mt-8 mb-4">5. Future Updates</h2>
            <p>As our platform evolves to meet new security standards and university requirements, we may update this Cookie Policy. Any changes will be purely to enhance platform functionality and security, and we will never introduce advertising trackers. Continued use of the platform constitutes your acknowledgment of these practices.</p>
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
