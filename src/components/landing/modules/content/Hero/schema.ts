import { z } from 'zod';

export const heroTypographySchema = z.object({
  layoutStyle: z.enum(['CLASSIC', 'EDITORIAL', 'CENTERED', 'MINIMAL', 'CUSTOM']).optional(),
  titleVariant: z.enum(['Display', 'Heading XL', 'Editorial', 'Luxury Serif', 'Minimal', 'Institutional']).optional(),
  eyebrow: z.string().optional(),
  title: z.string().optional(),
  year: z.string().optional(),
  headline: z.object({
    prefix: z.string().optional(),
    script: z.string().optional(),
    suffix: z.string().optional(),
  }).optional(),
  smallNote: z.string().optional(),
  caption: z.string().optional(),
});

export const mediaAssetSchema = z.object({
  assetId: z.string(),
  url: z.string().url(),
  width: z.number(),
  height: z.number(),
  dominantColor: z.string(),
  blurhash: z.string(),
  filesize: z.number(),
});

export const landingSlideSchema = z.object({
  id: z.string(),
  schema_version: z.literal(1).default(1),

  // Media
  desktopImage: mediaAssetSchema,
  tabletImage: mediaAssetSchema.nullable(),
  mobileImage: mediaAssetSchema.nullable(),
  thumbnailUrl: z.string(),
  altText: z.string(),

  // Typography & Content
  eyebrow: z.string(),
  title: z.string(),
  calligraphy: z.string(),
  subtitle: z.string(),
  description: z.string(),
  textAlignment: z.enum(['left', 'center', 'right']),

  // Calls to Action
  primaryCTA: z.string(),
  primaryCTALink: z.string().url().or(z.string().startsWith('/')),
  secondaryCTA: z.string(),
  secondaryCTALink: z.string().url().or(z.string().startsWith('/')).or(z.literal('')),

  // Visuals & Theming
  theme: z.string(),
  overlayStyle: z.enum(['dark', 'luxury', 'gold', 'gradient', 'custom']),
  overlayColor: z.string(), // Used if style is custom
  overlayOpacity: z.number().min(0).max(100),

  // Motion & Lifecycle
  transition: z.enum(['fade', 'slide', 'zoom', 'ken-burns']),
  animation: z.enum(['none', 'subtle', 'dynamic']),
  duration: z.number().min(1000), // in milliseconds
  order: z.number(),

  // Visibility & Scheduling
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  scheduleType: z.enum(['always', 'scheduled']),
  startDate: z.string().nullable(), // ISO string
  endDate: z.string().nullable(),   // ISO string

  // Analytics Reservation
  analytics: z.object({
    impressions: z.number(),
    clicksPrimaryCTA: z.number(),
    clicksSecondaryCTA: z.number(),
  }),

  // Advanced Typography (Editorial)
  heroTypography: heroTypographySchema.optional(),
}).refine(data => {
  if (data.scheduleType === 'scheduled') {
    if (data.startDate && data.endDate) {
      return new Date(data.startDate) < new Date(data.endDate);
    }
  }
  return true;
}, {
  message: "Start date must be before end date",
  path: ["endDate"],
});

export const landingHeroSettingsSchema = z.object({
  schema_version: z.literal(1).default(1),
  settings: z.object({
    autoplay: z.boolean(),
    loop: z.boolean(),
    defaultTransition: z.enum(['fade', 'slide', 'zoom', 'ken-burns']),
    defaultDuration: z.number().min(1000),
    heroHeight: z.string(),
    navbarOverlay: z.boolean(),
    showScrollIndicator: z.boolean(),
    showCountdown: z.boolean(),
    showSlideIndicators: z.boolean(),
  }),
  slides: z.array(landingSlideSchema),
});

export type MediaAsset = z.infer<typeof mediaAssetSchema>;
export type HeroTypography = z.infer<typeof heroTypographySchema>;
export type LandingSlide = z.infer<typeof landingSlideSchema>;
export type HeroConfig = z.infer<typeof landingHeroSettingsSchema>;
