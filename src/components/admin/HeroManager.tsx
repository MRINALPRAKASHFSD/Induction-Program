import React, { useState, useEffect } from "react";
import { collection, doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { HeroConfig, LandingSlide, MediaAsset } from "@/components/landing/modules/content/Hero/schema";
import HeroComponent from "@/components/landing/modules/content/Hero/Hero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Add, Trash, Image as ImageIcon, Setting2, ArrangeVertical, Edit2, Play } from "iconsax-react";
import { Archive, ArchiveRestore } from "lucide-react";
import { MediaLibraryModal } from "./MediaLibraryModal";


const TypographyPreview = ({ slide }: { slide: LandingSlide }) => {
  const typo = slide.heroTypography || {};
  return (
    <div className="bg-black/90 border border-border/50 text-white p-6 rounded-lg flex flex-col items-center justify-center text-center shadow-inner min-h-[200px] mt-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40 pointer-events-none" />
      <div className="relative z-10 flex flex-col items-center gap-3">
        {typo.eyebrow && <div className="text-[10px] tracking-[0.2em] uppercase font-bold text-white/80">{typo.eyebrow}</div>}
        {(typo.title || slide.title) && <div className="text-3xl font-serif font-bold">{typo.title || slide.title}</div>}
        {typo.year && <div className="text-sm font-serif italic text-white/90">{typo.year}</div>}
        
        {(typo.headline?.prefix || typo.headline?.script || typo.headline?.suffix) ? (
          <div className="text-xl font-serif leading-tight">
            {typo.headline.prefix && <span>{typo.headline.prefix} </span>}
            {typo.headline.script && <span className="font-serif italic text-2xl mx-1 text-[#d2232a] drop-shadow-sm">{typo.headline.script}</span>}
            {typo.headline.suffix && <span> {typo.headline.suffix}</span>}
          </div>
        ) : (
          (slide.subtitle || slide.calligraphy || slide.description) && (
            <div className="text-xl font-serif leading-tight">
               {slide.subtitle} <span className="font-serif italic text-2xl mx-1">{slide.calligraphy}</span> {slide.description}
            </div>
          )
        )}
        
        {typo.smallNote && <div className="text-xs text-white/70 italic mt-2">{typo.smallNote}</div>}
        {typo.caption && <div className="text-sm text-white/80 whitespace-pre-line mt-2">{typo.caption}</div>}
      </div>
    </div>
  );
};

export function HeroManager({ collectionId }: { collectionId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [heroConfig, setHeroConfig] = useState<HeroConfig | null>(null);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = useState<{ slideIndex: number; type: 'desktop' | 'mobile' } | null>(null);

  useEffect(() => {
    async function fetchHero() {
      if (!collectionId) return;
      setLoading(true);
      try {
        const docRef = doc(db, "landing_collections", collectionId);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data.hero) {
            setHeroConfig(data.hero);
          } else {
            // Default config if missing
            setHeroConfig({
              schema_version: 1,
              settings: {
                autoplay: true,
                loop: true,
                defaultTransition: "fade",
                defaultDuration: 5000,
                heroHeight: "100vh",
                navbarOverlay: true,
                showScrollIndicator: true,
                showCountdown: true,
                showSlideIndicators: true,
              },
              slides: [],
            });
          }
        }
      } catch (err) {
        console.error("Error fetching hero config:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchHero();
  }, [collectionId]);

  const handleSave = async () => {
    if (!heroConfig || !collectionId) return;
    setSaving(true);
    try {
      const docRef = doc(db, "landing_collections", collectionId);
      await updateDoc(docRef, { hero: heroConfig });
      alert("Hero configuration saved successfully!");
    } catch (err) {
      console.error("Error saving hero config:", err);
      alert("Failed to save hero configuration.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-10 text-center text-muted-foreground animate-pulse">Loading Hero Configuration...</div>;
  }

  if (!heroConfig) {
    return <div className="p-10 text-center text-red-500">Failed to load hero configuration.</div>;
  }

  return (
    <div className="space-y-6 relative">
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur py-4 border-b flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold">Hero Settings</h2>
          <p className="text-sm text-muted-foreground">Manage your landing page hero</p>
        </div>
        <Button onClick={handleSave} disabled={saving} size="lg" className="px-8 shadow-md">
          {saving ? "Saving..." : "Save Hero Settings"}
        </Button>
      </div>

      <MediaLibraryModal 
        open={mediaPickerOpen} 
        onOpenChange={setMediaPickerOpen}
        onSelect={(asset: MediaAsset) => {
          if (mediaPickerTarget && heroConfig) {
            const newSlides = [...heroConfig.slides];
            const targetSlide = newSlides[mediaPickerTarget.slideIndex];
            if (mediaPickerTarget.type === 'desktop') {
              targetSlide.desktopImage = asset;
            } else {
              targetSlide.mobileImage = asset;
            }
            setHeroConfig({ ...heroConfig, slides: newSlides });
          }
          setMediaPickerOpen(false);
        }}
      />

      {/* Live Preview Section */}
      <Card className="overflow-hidden border-2 border-border/60">
        <CardHeader className="border-b border-border/50 bg-muted/20 py-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2 font-semibold">
            <Play variant="TwoTone" className="h-4 w-4 text-primary" />
            Live Preview
          </CardTitle>
          <span className="text-xs text-muted-foreground">Scaled to 50%</span>
        </CardHeader>
        <CardContent className="p-0 bg-black overflow-hidden relative" style={{ height: "400px" }}>
          <div className="absolute top-0 left-0 w-[200%] h-[800px] origin-top-left scale-50 pointer-events-none">
             <HeroComponent config={heroConfig} />
          </div>
        </CardContent>
      </Card>

      {/* Settings Section */}
      <Card>
        <CardHeader className="border-b border-border/50 bg-muted/20">
          <CardTitle className="text-lg flex items-center gap-2">
            <Setting2 variant="TwoTone" className="h-5 w-5 text-primary" />
            Hero Global Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg">
            <Label>Autoplay Slides</Label>
            <Switch
              checked={heroConfig.settings.autoplay}
              onCheckedChange={(v) =>
                setHeroConfig({ ...heroConfig, settings: { ...heroConfig.settings, autoplay: v } })
              }
            />
          </div>
          <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg">
            <Label>Loop Slides</Label>
            <Switch
              checked={heroConfig.settings.loop}
              onCheckedChange={(v) =>
                setHeroConfig({ ...heroConfig, settings: { ...heroConfig.settings, loop: v } })
              }
            />
          </div>
          <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg">
            <Label>Navbar Overlay</Label>
            <Switch
              checked={heroConfig.settings.navbarOverlay}
              onCheckedChange={(v) =>
                setHeroConfig({ ...heroConfig, settings: { ...heroConfig.settings, navbarOverlay: v } })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Slides Section */}
      <Card>
        <CardHeader className="border-b border-border/50 bg-muted/20 flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <ImageIcon variant="TwoTone" className="h-5 w-5 text-primary" />
            Hero Slides ({heroConfig.slides.length})
          </CardTitle>
          <Button
            size="sm"
            onClick={() => {
              const newSlide: LandingSlide = {
                id: crypto.randomUUID(),
                schema_version: 1,
                desktopImage: { assetId: "", url: "", width: 1920, height: 1080, dominantColor: "#000000", blurhash: "", filesize: 0 },
                tabletImage: null,
                mobileImage: null,
                thumbnailUrl: "",
                altText: "New Slide",
                eyebrow: "",
                title: "New Slide",
                calligraphy: "",
                subtitle: "",
                description: "",
                heroTypography: {},
                textAlignment: "left",
                primaryCTA: "Learn More",
                primaryCTALink: "/",
                secondaryCTA: "",
                secondaryCTALink: "",
                theme: "light",
                overlayStyle: "gradient",
                overlayColor: "#000000",
                overlayOpacity: 40,
                transition: "fade",
                animation: "subtle",
                duration: 5000,
                order: heroConfig.slides.length,
                status: "DRAFT",
                scheduleType: "always",
                startDate: null,
                endDate: null,
                analytics: { impressions: 0, clicksPrimaryCTA: 0, clicksSecondaryCTA: 0 },
              };
              setHeroConfig({ ...heroConfig, slides: [...heroConfig.slides, newSlide] });
            }}
            className="gap-2"
          >
            <Add size={16} /> Add Slide
          </Button>
        </CardHeader>
        <CardContent className="pt-6">
          <Accordion type="single" collapsible className="w-full space-y-4">
            {heroConfig.slides.map((slide, index) => (
              <AccordionItem 
                key={slide.id} 
                value={slide.id} 
                className="border border-border/50 rounded-lg overflow-hidden"
                draggable
                onDragStart={(e: any) => {
                  e.dataTransfer.setData("text/plain", index.toString());
                }}
                onDragOver={(e: any) => {
                  e.preventDefault();
                  // Optional: add styling for drop target
                }}
                onDrop={(e: any) => {
                  e.preventDefault();
                  const fromIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
                  const toIndex = index;
                  if (fromIndex !== toIndex && !isNaN(fromIndex)) {
                    const newSlides = [...heroConfig.slides];
                    const [movedItem] = newSlides.splice(fromIndex, 1);
                    newSlides.splice(toIndex, 0, movedItem);
                    // Update order property to match new array index
                    newSlides.forEach((s, i) => s.order = i);
                    setHeroConfig({ ...heroConfig, slides: newSlides });
                  }
                }}
              >
                <AccordionTrigger className="px-4 py-3 hover:bg-muted/30 hover:no-underline flex gap-4">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
                      <ArrangeVertical size={16} />
                    </div>
                    <div className="w-16 h-10 bg-muted rounded overflow-hidden relative">
                      {slide.desktopImage?.url ? (
                        <img src={slide.desktopImage.url} alt="thumbnail" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ImageIcon size={16} /></div>
                      )}
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="font-semibold text-sm">{slide.title || "Untitled Slide"}</span>
                      <span className="text-xs text-muted-foreground">{slide.status} • {slide.duration}ms</span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 py-4 bg-muted/10 border-t border-border/50">
                  <div className="flex flex-col gap-8 py-2">
                    
                    {/* Status Header */}
                    <div className="flex items-center justify-between border-b pb-2">
                      <h4 className="font-semibold text-sm">Media & Configuration</h4>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs font-semibold uppercase tracking-wider">Status: {slide.status}</Label>
                        <Switch
                          checked={slide.status === "PUBLISHED"}
                          onCheckedChange={(v) => {
                            const newSlides = [...heroConfig.slides];
                            newSlides[index].status = v ? "PUBLISHED" : "DRAFT";
                            setHeroConfig({ ...heroConfig, slides: newSlides });
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Media Setup */}
                      <div className="space-y-4">
                        <h4 className="font-semibold text-sm text-muted-foreground">Media Assets</h4>
                        <div className="space-y-2">
                          <Label>Desktop Image URL</Label>
                          <div className="flex gap-2">
                            <Input
                              value={slide.desktopImage?.url || ""}
                              readOnly
                              placeholder="Select from Media Library..."
                            />
                            <Button 
                              variant="outline" 
                              size="icon"
                              onClick={() => {
                                setMediaPickerTarget({ slideIndex: index, type: 'desktop' });
                                setMediaPickerOpen(true);
                              }}
                            >
                              <ImageIcon size={18} />
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Mobile Image URL (Optional)</Label>
                          <div className="flex gap-2">
                            <Input
                              value={slide.mobileImage?.url || ""}
                              readOnly
                              placeholder="Fallback to desktop if empty..."
                            />
                            <Button 
                              variant="outline" 
                              size="icon"
                              onClick={() => {
                                setMediaPickerTarget({ slideIndex: index, type: 'mobile' });
                                setMediaPickerOpen(true);
                              }}
                            >
                              <ImageIcon size={18} />
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Settings */}
                      <div className="space-y-4">
                        <h4 className="font-semibold text-sm text-muted-foreground">Timing & Theme</h4>
                        <div className="space-y-2">
                          <Label>Countdown Date (endDate)</Label>
                          <Input
                            type="datetime-local"
                            value={slide.endDate ? new Date(slide.endDate).toISOString().slice(0, 16) : ''}
                            onChange={(e) => {
                              const newSlides = [...heroConfig.slides];
                              newSlides[index].endDate = e.target.value ? new Date(e.target.value).toISOString() : null;
                              setHeroConfig({ ...heroConfig, slides: newSlides });
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Theme</Label>
                          <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground"
                            value={slide.theme}
                            onChange={(e) => {
                              const newSlides = [...heroConfig.slides];
                              newSlides[index].theme = e.target.value;
                              setHeroConfig({ ...heroConfig, slides: newSlides });
                            }}
                          >
                            <option value="midnightGold">Midnight Gold</option>
                            <option value="royalGold">Royal Gold</option>
                            <option value="royalCream">Royal Cream</option>
                            <option value="glass">Glass</option>
                            <option value="institutionalDark">Institutional Dark</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Typography Designer */}
                    <div className="space-y-4 pt-6 border-t border-border/50">
                      <h4 className="font-semibold text-sm">Typography Designer</h4>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Layout Style</Label>
                              <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                                value={slide.heroTypography?.layoutStyle || 'CLASSIC'}
                                onChange={(e) => {
                                  const newSlides = [...heroConfig.slides];
                                  if (!newSlides[index].heroTypography) newSlides[index].heroTypography = {};
                                  newSlides[index].heroTypography.layoutStyle = e.target.value as any;
                                  setHeroConfig({ ...heroConfig, slides: newSlides });
                                }}
                              >
                                <option value="CLASSIC">Classic</option>
                                <option value="EDITORIAL">Editorial</option>
                                <option value="CENTERED">Centered</option>
                                <option value="MINIMAL">Minimal</option>
                                <option value="CUSTOM">Custom</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label>Title Variant</Label>
                              <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                                value={slide.heroTypography?.titleVariant || 'Display'}
                                onChange={(e) => {
                                  const newSlides = [...heroConfig.slides];
                                  if (!newSlides[index].heroTypography) newSlides[index].heroTypography = {};
                                  newSlides[index].heroTypography.titleVariant = e.target.value as any;
                                  setHeroConfig({ ...heroConfig, slides: newSlides });
                                }}
                              >
                                <option value="Display">Display</option>
                                <option value="Heading XL">Heading XL</option>
                                <option value="Editorial">Editorial</option>
                                <option value="Luxury Serif">Luxury Serif</option>
                                <option value="Minimal">Minimal</option>
                                <option value="Institutional">Institutional</option>
                              </select>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Eyebrow</Label>
                              <Input
                                value={slide.heroTypography?.eyebrow ?? slide.eyebrow}
                                onChange={(e) => {
                                  const newSlides = [...heroConfig.slides];
                                  if (!newSlides[index].heroTypography) newSlides[index].heroTypography = {};
                                  newSlides[index].heroTypography.eyebrow = e.target.value;
                                  setHeroConfig({ ...heroConfig, slides: newSlides });
                                }}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Year</Label>
                              <Input
                                value={slide.heroTypography?.year || ""}
                                onChange={(e) => {
                                  const newSlides = [...heroConfig.slides];
                                  if (!newSlides[index].heroTypography) newSlides[index].heroTypography = {};
                                  newSlides[index].heroTypography.year = e.target.value;
                                  setHeroConfig({ ...heroConfig, slides: newSlides });
                                }}
                              />
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <Label>Main Title</Label>
                            <Input
                              value={slide.heroTypography?.title ?? slide.title}
                              onChange={(e) => {
                                const newSlides = [...heroConfig.slides];
                                if (!newSlides[index].heroTypography) newSlides[index].heroTypography = {};
                                newSlides[index].heroTypography.title = e.target.value;
                                newSlides[index].title = e.target.value;
                                setHeroConfig({ ...heroConfig, slides: newSlides });
                              }}
                            />
                          </div>
                          
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-2">
                              <Label>Headline Prefix</Label>
                              <Input
                                value={slide.heroTypography?.headline?.prefix ?? slide.subtitle}
                                onChange={(e) => {
                                  const newSlides = [...heroConfig.slides];
                                  if (!newSlides[index].heroTypography) newSlides[index].heroTypography = {};
                                  if (!newSlides[index].heroTypography.headline) newSlides[index].heroTypography.headline = {};
                                  newSlides[index].heroTypography.headline.prefix = e.target.value;
                                  setHeroConfig({ ...heroConfig, slides: newSlides });
                                }}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Script</Label>
                              <Input
                                value={slide.heroTypography?.headline?.script ?? slide.calligraphy}
                                onChange={(e) => {
                                  const newSlides = [...heroConfig.slides];
                                  if (!newSlides[index].heroTypography) newSlides[index].heroTypography = {};
                                  if (!newSlides[index].heroTypography.headline) newSlides[index].heroTypography.headline = {};
                                  newSlides[index].heroTypography.headline.script = e.target.value;
                                  setHeroConfig({ ...heroConfig, slides: newSlides });
                                }}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Suffix</Label>
                              <Input
                                value={slide.heroTypography?.headline?.suffix ?? slide.description}
                                onChange={(e) => {
                                  const newSlides = [...heroConfig.slides];
                                  if (!newSlides[index].heroTypography) newSlides[index].heroTypography = {};
                                  if (!newSlides[index].heroTypography.headline) newSlides[index].heroTypography.headline = {};
                                  newSlides[index].heroTypography.headline.suffix = e.target.value;
                                  setHeroConfig({ ...heroConfig, slides: newSlides });
                                }}
                              />
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <Label>Small Note</Label>
                            <Input
                              value={slide.heroTypography?.smallNote || ""}
                              onChange={(e) => {
                                const newSlides = [...heroConfig.slides];
                                if (!newSlides[index].heroTypography) newSlides[index].heroTypography = {};
                                newSlides[index].heroTypography.smallNote = e.target.value;
                                setHeroConfig({ ...heroConfig, slides: newSlides });
                              }}
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <Label>Caption</Label>
                            <Textarea
                              value={slide.heroTypography?.caption || ""}
                              onChange={(e) => {
                                const newSlides = [...heroConfig.slides];
                                if (!newSlides[index].heroTypography) newSlides[index].heroTypography = {};
                                newSlides[index].heroTypography.caption = e.target.value;
                                setHeroConfig({ ...heroConfig, slides: newSlides });
                              }}
                              rows={4}
                              className="resize-none"
                            />
                          </div>
                        </div>

                        <div className="space-y-4">
                          <Label>Mini Preview</Label>
                          <TypographyPreview slide={slide} />
                        </div>

                      </div>
                    </div>

                    {/* Calls to Action */}
                    <div className="space-y-4 pt-6 border-t border-border/50">
                      <h4 className="font-semibold text-sm">Calls to Action</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Primary CTA Text</Label>
                            <Input
                              value={slide.primaryCTA}
                              onChange={(e) => {
                                const newSlides = [...heroConfig.slides];
                                newSlides[index].primaryCTA = e.target.value;
                                setHeroConfig({ ...heroConfig, slides: newSlides });
                              }}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Primary CTA Link</Label>
                            <Input
                              value={slide.primaryCTALink}
                              onChange={(e) => {
                                const newSlides = [...heroConfig.slides];
                                newSlides[index].primaryCTALink = e.target.value;
                                setHeroConfig({ ...heroConfig, slides: newSlides });
                              }}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Secondary CTA Text</Label>
                            <Input
                              value={slide.secondaryCTA}
                              onChange={(e) => {
                                const newSlides = [...heroConfig.slides];
                                newSlides[index].secondaryCTA = e.target.value;
                                setHeroConfig({ ...heroConfig, slides: newSlides });
                              }}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Secondary CTA Link</Label>
                            <Input
                              value={slide.secondaryCTALink}
                              onChange={(e) => {
                                const newSlides = [...heroConfig.slides];
                                newSlides[index].secondaryCTALink = e.target.value;
                                setHeroConfig({ ...heroConfig, slides: newSlides });
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Delete / Archive Buttons */}
                    <div className="flex justify-end pt-4 gap-2 mt-4 border-t border-border/50 pt-6">
                      {slide.status === 'ARCHIVED' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          onClick={() => {
                            const newSlides = [...heroConfig.slides];
                            newSlides[index].status = 'DRAFT';
                            setHeroConfig({ ...heroConfig, slides: newSlides });
                          }}
                        >
                          <ArchiveRestore size={16} className="mr-2" /> Unarchive Slide
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                          onClick={() => {
                            const newSlides = [...heroConfig.slides];
                            newSlides[index].status = 'ARCHIVED';
                            setHeroConfig({ ...heroConfig, slides: newSlides });
                          }}
                        >
                          <Archive size={16} className="mr-2" /> Archive Slide
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          const newSlides = heroConfig.slides.filter((_, i) => i !== index);
                          setHeroConfig({ ...heroConfig, slides: newSlides });
                        }}
                      >
                        <Trash size={16} className="mr-2" /> Delete
                      </Button>
                    </div>
                  </div>
</AccordionContent>
              </AccordionItem>
            ))}
            {heroConfig.slides.length === 0 && (
              <div className="text-center py-10 border-2 border-dashed rounded-lg text-muted-foreground">
                No slides added yet. Create your first slide!
              </div>
            )}
          </Accordion>
        </CardContent>
      </Card>

      <div className="flex justify-end mt-8 pb-10">
        <Button onClick={handleSave} disabled={saving} size="lg" className="w-full md:w-auto px-8">
          {saving ? "Saving..." : "Save Hero Settings"}
        </Button>
      </div>
    </div>
  );
}
