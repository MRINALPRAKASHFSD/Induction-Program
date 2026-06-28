import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

export const Route = createFileRoute('/terms')({
  component: TermsOfService,
});

function TermsOfService() {
  return (
    <div className="min-h-screen bg-[#faf8f6]">
      <header className="bg-white/80 backdrop-blur-md border-b border-[#8a4a22]/10 sticky top-0 z-40">
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

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-[#8a4a22]/10 p-8 md:p-12">
          <h1 className="text-3xl font-bold text-[#2c1208] mb-2">Terms of Service</h1>
          <p className="text-sm text-[#7a4020]/60 mb-8">Last Updated: {new Date().toLocaleDateString()}</p>
          
          <div className="prose prose-orange max-w-none text-[#5a2c14] space-y-6">
            <p>Please read these Terms of Service ("Terms") carefully before using the EOZKA platform.</p>
            
            <h2 className="text-xl font-bold text-[#2c1208] mt-8 mb-4">1. Acceptance of Terms</h2>
            <p>By accessing or using our platform, you agree to be bound by these Terms. If you disagree with any part of the terms, then you may not access the service.</p>

            <h2 className="text-xl font-bold text-[#2c1208] mt-8 mb-4">2. Description of Service</h2>
            <p>EOZKA provides a comprehensive induction and event management platform designed for educational institutions. The service includes features for attendance tracking, event scheduling, announcements, and secure document management.</p>

            <h2 className="text-xl font-bold text-[#2c1208] mt-8 mb-4">3. User Accounts</h2>
            <p>When you create an account with us, you must provide information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your account on our platform.</p>
            <p>You are responsible for safeguarding the password that you use to access the platform and for any activities or actions under your password.</p>

            <h2 className="text-xl font-bold text-[#2c1208] mt-8 mb-4">4. Intellectual Property</h2>
            <p>The platform and its original content, features, and functionality are and will remain the exclusive property of EOZKA and its licensors. The service is protected by copyright, trademark, and other laws of both the local and international jurisdictions. All rights, title, and interest in and to the platform and its components are strictly reserved by EOZKA.</p>

            <h2 className="text-xl font-bold text-[#2c1208] mt-8 mb-4">5. Termination</h2>
            <p>We may terminate or suspend access to our platform immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.</p>

            <h2 className="text-xl font-bold text-[#2c1208] mt-8 mb-4">6. Contact Us</h2>
            <p>If you have any questions about these Terms, please contact us at:</p>
            <p className="font-semibold text-[#8a4a22]">legal@eozka.com</p>
          </div>
        </div>
      </main>
    </div>
  );
}
