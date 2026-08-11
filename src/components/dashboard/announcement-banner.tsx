import { Megaphone, X } from "lucide-react";
import { useState } from "react";
import { m, AnimatePresence } from "framer-motion";

interface AnnouncementBannerProps {
  message?: string;
  link?: string;
}

export function AnnouncementBanner({ message, link }: AnnouncementBannerProps) {
  const [isVisible, setIsVisible] = useState(!!message);

  if (!message) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <m.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <div className="bg-[#8a4a22]/10 dark:bg-[#f4a261]/10 border border-[#8a4a22]/20 rounded-2xl p-4 flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#8a4a22]/20 flex items-center justify-center flex-shrink-0 text-[#8a4a22] dark:text-[#f4a261]">
                <Megaphone className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-foreground">
                {message}
                {link && (
                  <a href={link} className="ml-2 text-[#8a4a22] dark:text-[#f4a261] hover:underline font-semibold">
                    Learn more &rarr;
                  </a>
                )}
              </p>
            </div>
            <button 
              onClick={() => setIsVisible(false)}
              className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors flex-shrink-0 text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
