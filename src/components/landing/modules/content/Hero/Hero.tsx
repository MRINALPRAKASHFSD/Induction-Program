import React, { useState, useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, QrCode } from 'lucide-react';
import { m, AnimatePresence } from 'framer-motion';
import { HeroConfig } from './schema';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';



const getThemeClasses = (theme?: string) => {
  switch (theme) {
    case 'royal-gold': return 'bg-[#d4af37] hover:bg-[#b5952f] text-white';
    case 'midnight-gold': return 'bg-[#0f172a] hover:bg-[#020617] text-[#d4af37] border border-[#d4af37]';
    case 'royal-cream': return 'bg-[#fdfbf7] hover:bg-[#f3ead3] text-[#1e293b]';
    case 'glass': return 'bg-white/20 hover:bg-white/30 backdrop-blur-md text-white border border-white/40';
    case 'institutional-dark': return 'bg-[#1e293b] hover:bg-[#0f172a] text-white';
    case 'krmu-red':
    default:
      return 'bg-[#d2232a] hover:bg-[#b01c22] text-white';
  }
};

export default function HeroComponent({ config }: { config: HeroConfig }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const slides = config.slides || [];

  useEffect(() => {
    if (slides.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [slides.length]);

  if (!slides.length) return null;

  return (
    <section className="relative w-full min-h-[100svh] overflow-hidden bg-black flex items-center justify-center">
      
      {/* Slides Backgrounds */}
      <AnimatePresence initial={false}>
        <m.div
          key={currentSlide}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
          className="absolute inset-0 z-0"
        >
          {slides[currentSlide]?.desktopImage?.url && (
            <img 
              src={slides[currentSlide].desktopImage.url} 
              alt={slides[currentSlide]?.altText || "Hero Background"} 
              className="w-full h-full object-cover"
            />
          )}
        </m.div>
      </AnimatePresence>

      {/* Cinematic Overlays */}
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-black/30 pointer-events-none" />
      <div className="absolute inset-0 z-10 bg-black/20 pointer-events-none mix-blend-multiply" />
      
      {/* Content */}
      <div className="relative z-20 container mx-auto px-6 h-full flex flex-col justify-center pt-24 md:pt-32 pb-40 md:pb-52">
        <div className="max-w-4xl">
          
          <AnimatePresence mode="wait">
            <m.div
              key={currentSlide}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            >
              {(() => {
                const typo = slides[currentSlide]?.heroTypography;
                const hasNewTypo = typo && (typo.eyebrow || typo.year || typo.headline?.prefix || typo.headline?.script || typo.headline?.suffix || typo.smallNote || typo.caption);
                
                if (hasNewTypo) {
                  const alignClass = typo.layoutStyle === 'CENTERED' ? 'items-center text-center mx-auto' : 'items-start text-left';
                  return (
                    <div className={`flex flex-col gap-3 mb-10 ${alignClass}`}>
                      {typo.eyebrow && <div className="text-sm tracking-[0.3em] uppercase font-bold text-white/80">{typo.eyebrow}</div>}
                      {(typo.title || slides[currentSlide]?.title) && <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif text-white font-bold leading-tight drop-shadow-lg">{typo.title || slides[currentSlide]?.title}</h1>}
                      {typo.year && <div className="text-xl md:text-2xl font-serif italic text-white/90">{typo.year}</div>}
                      
                      {typo.headline && (typo.headline.prefix || typo.headline.script || typo.headline.suffix) && (
                        <div className="text-2xl md:text-4xl font-serif leading-tight text-white mt-2">
                          {typo.headline.prefix && <span>{typo.headline.prefix} </span>}
                          {typo.headline.script && <span className="font-serif italic text-3xl md:text-5xl mx-2 text-[#d2232a] drop-shadow-md">{typo.headline.script}</span>}
                          {typo.headline.suffix && <span> {typo.headline.suffix}</span>}
                        </div>
                      )}
                      
                      {typo.smallNote && <div className="text-lg text-white/70 italic mt-3">{typo.smallNote}</div>}
                      {typo.caption && <p className="text-lg md:text-xl text-white/80 font-light max-w-2xl leading-relaxed drop-shadow-md whitespace-pre-line mt-2">{typo.caption}</p>}
                    </div>
                  );
                } else {
                  return (
                    <>
                      {slides[currentSlide]?.calligraphy && (
                        <div className="text-6xl md:text-8xl text-white/20 font-serif absolute -top-10 -left-4 -z-10 select-none pointer-events-none">
                          {slides[currentSlide]?.calligraphy}
                        </div>
                      )}
                      <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif text-white font-bold leading-tight drop-shadow-lg mb-6 relative">
                        {slides[currentSlide]?.title}
                      </h1>
                      
                      {slides[currentSlide]?.subtitle && (
                        <p className="text-lg md:text-2xl text-white/90 font-light mb-10 max-w-2xl leading-relaxed drop-shadow-md">
                          {slides[currentSlide]?.subtitle}
                        </p>
                      )}
                    </>
                  );
                }
              })()}

              <div className="flex flex-col sm:flex-row gap-4 relative z-30">
                {slides[currentSlide]?.primaryCTA && (
                  <Button size="lg" asChild className={`rounded-none px-8 h-14 font-bold uppercase tracking-wider text-sm shadow-xl transition-all hover:scale-105 ${getThemeClasses(slides[currentSlide]?.theme)}`}>
                    {slides[currentSlide]?.primaryCTALink?.startsWith('http') ? (
                      <a href={slides[currentSlide]?.primaryCTALink} target="_blank" rel="noopener noreferrer">
                        {slides[currentSlide]?.primaryCTA} <ArrowRight className="ml-2 h-5 w-5" />
                      </a>
                    ) : (
                      <Link to={slides[currentSlide]?.primaryCTALink || "/register"}>
                        {slides[currentSlide]?.primaryCTA} <ArrowRight className="ml-2 h-5 w-5" />
                      </Link>
                    )}
                  </Button>
                )}
                {slides[currentSlide]?.secondaryCTA && (
                  <Button variant="outline" asChild className="rounded-none border-white text-white hover:bg-white hover:text-black px-8 h-14 font-bold uppercase tracking-wider text-sm shadow-xl transition-colors bg-transparent backdrop-blur-sm">
                    {slides[currentSlide]?.secondaryCTALink?.startsWith('http') ? (
                      <a href={slides[currentSlide]?.secondaryCTALink} target="_blank" rel="noopener noreferrer">
                        {slides[currentSlide]?.secondaryCTA}
                      </a>
                    ) : (
                      <Link to={slides[currentSlide]?.secondaryCTALink || "/attendance"}>
                        {slides[currentSlide]?.secondaryCTA}
                      </Link>
                    )}
                  </Button>
                )}
              </div>
            </m.div>
          </AnimatePresence>

        </div>
      </div>

      {/* Slide Indicators Container */}
      <div className="absolute bottom-0 left-0 w-full z-20 pb-16 md:pb-[120px] pt-24 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none">
        <div className="container mx-auto px-6 flex justify-center md:justify-end pointer-events-auto">
          {/* Slide Indicators */}
          {slides.length > 1 && (
            <div className="flex gap-3 mb-2 md:mb-6">
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentSlide(idx)}
                  className={`h-1 transition-all duration-500 rounded-full ${currentSlide === idx ? 'w-12 bg-[#d2232a]' : 'w-6 bg-white/40 hover:bg-white/70'}`}
                  aria-label={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

    </section>
  );
}
