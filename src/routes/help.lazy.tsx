import { createLazyFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

export const Route = createLazyFileRoute('/help')({
  component: HelpCenter,
});

function HelpCenter() {
  return (
    <div className="min-h-screen bg-[#faf8f6]">
      {/* Basic Header */}
      <header className="glass-premium-v2 rounded-none border-x-0 border-t-0 border-b border-[#8a4a22]/10 sticky top-0 z-40">
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

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="glass-premium-v2 rounded-3xl p-8 md:p-12">
          <h1 className="text-hero-heading text-primary font-bold mb-6">Help Center</h1>
          <div className="prose prose-orange max-w-none text-body-primary text-secondary">
            <p className="lead text-lg mb-6">Welcome to the EOZKA Help Center. We are here to assist you with any questions or issues you may have while using our platform.</p>
            
            <h2 className="text-heading text-primary font-bold mt-8 mb-4">Frequently Asked Questions</h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-card-title text-primary font-bold mb-2">How do I access my induction pass?</h3>
                <p>You can access your induction pass by logging in with your registered email and navigating to the "My Pass" section from the homepage.</p>
              </div>
              <div>
                <h3 className="text-card-title text-primary font-bold mb-2">What if I forget my password?</h3>
                <p>Please contact your university administrator to reset your password. The induction platform relies on secure, pre-configured credentials.</p>
              </div>
              <div>
                <h3 className="text-card-title text-primary font-bold mb-2">Who should I contact for technical support?</h3>
                <p>For technical support regarding the platform, please reach out to the EOZKA support team at support@eozka.com.</p>
              </div>
            </div>

            <div className="mt-12 p-6 glass-premium-v2 rounded-2xl">
              <h3 className="text-heading text-primary font-bold mb-2">Need further assistance?</h3>
              <p className="mb-4">Our dedicated support team is available to help you with any platform-related inquiries.</p>
              <a href="mailto:support@eozka.com" className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-sm font-medium rounded-xl text-white bg-[#8a4a22] hover:bg-[#7a4020] transition-colors">
                Contact Support
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
