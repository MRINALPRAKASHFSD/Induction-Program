import { createLazyFileRoute, Link } from '@tanstack/react-router';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, Key, Calendar, ShieldAlert, Phone, ChevronRight, ShieldCheck
} from 'lucide-react';

export const Route = createLazyFileRoute('/help')({
  component: HelpCenter,
});

function HelpCenter() {
  return (
    <div className="min-h-screen bg-[#fdfbf9] text-[#2c1208] font-sans selection:bg-[#8a4a22]/20">
      {/* Decorative Background */}
      <div className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center overflow-hidden">
        <div className="absolute w-[100vw] h-[100vw] max-w-[1200px] max-h-[1200px] bg-gradient-to-tr from-[#c87038]/5 to-[#8a4a22]/5 rounded-full blur-[120px] opacity-70"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[40rem] md:text-[60rem] font-['Great_Vibes'] text-[#8a4a22] opacity-[0.015] leading-none select-none tracking-tighter">
          Help
        </div>
      </div>

      <div className="container mx-auto max-w-4xl px-6 py-24 relative z-10">
        
        {/* Navigation */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-16"
        >
          <Link to="/" className="inline-flex items-center text-sm font-semibold text-[#8a4a22] hover:text-[#5a2c14] transition-colors group">
            <ArrowLeft className="w-4 h-4 mr-2 transition-transform duration-300 group-hover:-translate-x-1" />
            Back to Home
          </Link>
        </motion.div>

        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
          className="mb-20"
        >
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-[#2c1208]">
            Aarambh Support Hub
          </h1>
          <p className="text-lg text-[#5a2c14]/70">
            Official support and onboarding resources for K.R. Mangalam University's Class of 2026.
          </p>
        </motion.div>

        {/* Support Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-24">
          
          {/* Registration & Login */}
          <SupportCard 
            icon={<Key className="w-6 h-6" />}
            title="Registration & Login"
            delay={0.2}
            items={["Account creation", "Login issues", "Password reset", "Email verification"]}
          />

          {/* Student Verification */}
          <SupportCard 
            icon={<ShieldCheck className="w-6 h-6" />}
            title="Student Verification"
            delay={0.3}
            items={["Identity verification", "QR code scanning", "Attendance verification", "GPS/location permission", "Verification status"]}
          />

          {/* Orientation */}
          <SupportCard 
            icon={<Calendar className="w-6 h-6" />}
            title="Orientation"
            delay={0.4}
            items={["Event schedule", "Campus navigation", "Clubs & societies", "Session check-in"]}
          />

          {/* Technical Support */}
          <SupportCard 
            icon={<ShieldAlert className="w-6 h-6" />}
            title="Technical Support"
            delay={0.5}
            items={["Website issues", "Browser compatibility", "Loading problems", "Contact technical team"]}
          />
        </div>

        {/* Contact Coordinators */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-20"
        >
          <div className="flex flex-col items-center mb-12 text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-[#2c1208] tracking-tight mb-3">
              Platform Coordinators
            </h2>
            <p className="text-[#5a2c14]/70 max-w-xl text-sm md:text-base">
              If you require immediate assistance regarding the induction program or technical issues, our core team is here to help.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ContactCard 
              name="Mrinal Prakash"
              designation="Platform Lead & Technical Head"
              phone="+91 89203 80253"
              delay={0.1}
            />
            <ContactCard 
              name="Aman Chapadia"
              designation="Logistics & Operations Head"
              phone="+91 82879 95636"
              delay={0.2}
            />
            <ContactCard 
              name="Harsh Dev Jha"
              designation="eOzka Head"
              phone="+91 82879 98676"
              delay={0.3}
            />
          </div>
        </motion.div>

        {/* Signature */}
        <motion.div 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, delay: 0.5, ease: "easeOut" }}
          className="flex flex-col items-center justify-center w-full pt-20 border-t border-[#8a4a22]/10 opacity-95 transition-opacity duration-700 hover:opacity-100"
        >
          <p className="text-[11px] font-bold text-[#5a2c14]/60 uppercase tracking-[0.15em] mb-3">
            &copy; 2026 Aarambh Platform
          </p>
          <p className="text-[10px] font-bold text-[#5a2c14]/40 uppercase tracking-[0.25em] mb-5">
            Crafted by
          </p>
          <img 
            src="/eozka-logo-transparent.png" 
            alt="eOzka - Augmenting Sentient" 
            loading="lazy" 
            className="w-[210px] md:w-[250px] h-auto object-contain opacity-[0.97] transition-transform duration-700 hover:scale-105" 
          />
        </motion.div>
      </div>
    </div>
  );
}

function SupportCard({ icon, title, items, delay }: { icon: React.ReactNode, title: string, items: string[], delay: number }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.8, delay, ease: "easeOut" }}
      className="bg-white/60 backdrop-blur-md border border-[#8a4a22]/10 rounded-3xl p-8 shadow-xl shadow-[#8a4a22]/5 hover:shadow-2xl hover:shadow-[#8a4a22]/10 transition-all duration-500 group"
    >
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#8a4a22]/10 to-[#5a2c14]/10 flex items-center justify-center text-[#8a4a22] group-hover:scale-110 group-hover:bg-[#8a4a22] group-hover:text-white transition-all duration-500">
          {icon}
        </div>
        <h3 className="text-xl font-bold tracking-tight text-[#2c1208]">{title}</h3>
      </div>
      <ul className="space-y-3">
        {items.map((item, idx) => (
          <li key={idx} className="flex items-center text-sm font-medium text-[#5a2c14]/80 group/item cursor-pointer">
            <span className="w-1.5 h-1.5 rounded-full bg-[#c87038]/50 mr-3 group-hover/item:bg-[#8a4a22] transition-colors duration-300 group-hover/item:scale-150"></span>
            <span className="group-hover/item:text-[#8a4a22] transition-colors duration-300">{item}</span>
            <ChevronRight className="w-3 h-3 ml-auto opacity-0 -translate-x-2 group-hover/item:opacity-100 group-hover/item:translate-x-0 transition-all duration-300 text-[#8a4a22]" />
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

function ContactCard({ name, designation, phone, delay }: { name: string, designation: string, phone: string, delay: number }) {
  const getInitials = (n: string) => {
    return n.split(' ').map(part => part[0]).join('').substring(0, 2);
  };

  const phoneLink = `tel:${phone.replace(/\s+/g, '')}`;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.8, delay, ease: "easeOut" }}
      className="bg-white/60 backdrop-blur-md border border-[#8a4a22]/10 rounded-3xl p-6 shadow-lg shadow-[#8a4a22]/5 flex flex-col items-center text-center group hover:shadow-xl hover:shadow-[#8a4a22]/15 hover:-translate-y-1 transition-all duration-500"
    >
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#c87038] to-[#8a4a22] flex items-center justify-center text-white font-bold text-xl shadow-inner mb-4 overflow-hidden relative">
        <span className="relative z-10">{getInitials(name)}</span>
        <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      </div>
      <h3 className="text-lg font-bold text-[#2c1208] mb-1 tracking-tight">{name}</h3>
      <p className="text-[10px] md:text-xs font-semibold text-[#8a4a22]/80 tracking-wider mb-5 h-8 flex items-center justify-center text-center px-2">
        {designation}
      </p>
      
      <a 
        href={phoneLink}
        className="mt-auto w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-[#fdfbf9] border border-[#8a4a22]/15 text-[#5a2c14] rounded-full text-sm font-semibold transition-all duration-300 hover:bg-[#8a4a22] hover:text-white hover:border-[#8a4a22] group-hover:shadow-md"
      >
        <Phone className="w-4 h-4" />
        {phone}
      </a>
    </motion.div>
  );
}
