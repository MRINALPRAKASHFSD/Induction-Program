import { BaseModuleConfig } from '../types';

/**
 * Core interface for data access. 
 * Separates UI logic from the data source (Firestore, Mock, Redis, etc.)
 */
export interface LandingRepository {
  /** Retrieves all configured modules for a specific event */
  getModules(eventId: string): Promise<BaseModuleConfig[]>;
}

// Temporary Mock Data for testing the pipeline
export const mockAarambhModules: BaseModuleConfig[] = [
  {
    id: 'hero_1',
    type: 'hero',
    order: 0,
    enabled: true,
    schema_version: 1,
    // Note: TypeScript will flag this because we haven't typed it as `HeroSection` yet,
    // but the `LandingRepository` just returns `BaseModuleConfig[]` which gets parsed later.
    // We add dynamic config using spread for the mock
    ...({
      config: {
        schema_version: 1,
        settings: {
          autoplay: true,
          loop: true,
          defaultTransition: 'fade',
          defaultDuration: 5000,
          heroHeight: "100vh",
          navbarOverlay: true,
          showScrollIndicator: true,
          showCountdown: true,
          showSlideIndicators: true
        },
        slides: [
          {
            id: 'slide_placeholder',
            schema_version: 1,
            desktopImage: {
              assetId: '1',
              url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
              width: 1920,
              height: 1080,
              dominantColor: '#000000',
              blurhash: '',
              filesize: 1000
            },
            tabletImage: null,
            mobileImage: null,
            thumbnailUrl: '',
            altText: '',
            eyebrow: '',
            title: '',
            calligraphy: '',
            subtitle: '',
            description: '',
            textAlignment: 'left',
            primaryCTA: '',
            primaryCTALink: '',
            secondaryCTA: '',
            secondaryCTALink: '',
            theme: 'midnightGold',
            overlayStyle: 'dark',
            overlayColor: '',
            overlayOpacity: 60,
            transition: 'fade',
            animation: 'none',
            duration: 5000,
            order: 0,
            status: 'PUBLISHED',
            scheduleType: 'always',
            startDate: null,
            endDate: null,
            analytics: { impressions: 0, clicksPrimaryCTA: 0, clicksSecondaryCTA: 0 }
          }
        ]
      }
    })
  } as any
];

export class MockLandingRepository implements LandingRepository {
  async getModules(eventId: string): Promise<BaseModuleConfig[]> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    if (eventId === 'aarambh-2026') {
      return mockAarambhModules;
    }
    return [];
  }
}
