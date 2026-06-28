import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

export const Route = createFileRoute('/privacy')({
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
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
          <h1 className="text-3xl font-bold text-[#2c1208] mb-2">Privacy Policy</h1>
          <p className="text-sm text-[#7a4020]/60 mb-8">Last Updated: {new Date().toLocaleDateString()}</p>
          
          <div className="prose prose-orange max-w-none text-[#5a2c14] space-y-6">
            <p>At EOZKA, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform.</p>
            
            <h2 className="text-xl font-bold text-[#2c1208] mt-8 mb-4">1. Information We Collect</h2>
            <p>We may collect information about you in a variety of ways. The information we may collect on the platform includes:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Personal Data:</strong> Personally identifiable information, such as your name, email address, and student ID, that you voluntarily give to us when you register with the platform.</li>
              <li><strong>Derivative Data:</strong> Information our servers automatically collect when you access the platform, such as your IP address, your browser type, your operating system, your access times, and the pages you have viewed directly before and after accessing the platform.</li>
            </ul>

            <h2 className="text-xl font-bold text-[#2c1208] mt-8 mb-4">2. Use of Your Information</h2>
            <p>Having accurate information about you permits us to provide you with a smooth, efficient, and customized experience. Specifically, we may use information collected about you via the platform to:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Create and manage your account.</li>
              <li>Facilitate your university induction process.</li>
              <li>Generate secure QR codes for event attendance.</li>
              <li>Improve platform security and prevent fraudulent activities.</li>
            </ul>

            <h2 className="text-xl font-bold text-[#2c1208] mt-8 mb-4">3. Data Security</h2>
            <p>We use administrative, technical, and physical security measures to help protect your personal information. While we have taken reasonable steps to secure the personal information you provide to us, please be aware that despite our efforts, no security measures are perfect or impenetrable, and no method of data transmission can be guaranteed against any interception or other type of misuse.</p>

            <h2 className="text-xl font-bold text-[#2c1208] mt-8 mb-4">4. Contact Us</h2>
            <p>If you have questions or comments about this Privacy Policy, please contact us at:</p>
            <p className="font-semibold text-[#8a4a22]">privacy@eozka.com</p>
          </div>
        </div>
      </main>
    </div>
  );
}
