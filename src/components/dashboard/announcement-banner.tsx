import { Newspaper, X, ArrowRight } from "lucide-react";
import { useState } from "react";
import { m, AnimatePresence } from "framer-motion";

interface AnnouncementBannerProps {
  message?: string;
  link?: string;
}

export function AnnouncementBanner({ message, link }: AnnouncementBannerProps) {
  const [isVisible, setIsVisible] = useState(() => {
    if (!message) return false;
    const dismissed = sessionStorage.getItem(`krmu_announcement_dismissed_${message.substring(0, 20)}`);
    return !dismissed;
  });

  const handleDismiss = () => {
    setIsVisible(false);
    if (message) {
      sessionStorage.setItem(`krmu_announcement_dismissed_${message.substring(0, 20)}`, "true");
    }
  };

  if (!message) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <m.div
          initial={{ opacity: 0, y: -20, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -20, height: 0 }}
          className="overflow-hidden"
        >
          <div className="bg-[#1a1714] text-[#f8f5f2] rounded-[24px] p-6 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden group">
            
            {/* Background Texture */}
            <div className="absolute inset-0 opacity-[0.05] mix-blend-overlay pointer-events-none" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')" }} />
            <div className="absolute -left-12 -top-12 w-48 h-48 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-start md:items-center gap-5 relative z-10">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center shrink-0 border border-white/10 shadow-inner group-hover:scale-110 transition-transform duration-500">
                <Newspaper className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400/80 mb-1">
                  Official Announcement
                </p>
                <p className="text-base font-serif font-medium text-white leading-snug max-w-2xl">
                  {message}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 relative z-10 w-full md:w-auto">
              {link && (
                <a 
                  href={link} 
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-white text-black font-bold text-xs hover:bg-amber-400 transition-colors duration-300 uppercase tracking-widest"
                >
                  Read Story <ArrowRight className="w-3.5 h-3.5" />
                </a>
              )}
              <button 
                onClick={handleDismiss}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/50 hover:text-white transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
