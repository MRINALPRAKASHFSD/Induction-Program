import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { LazyMotion, domAnimation } from "framer-motion";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#5a1a25" },
      { title: "KRMU Induction Management" },
      { name: "description", content: "K.R. Mangalam University 5-day induction: scan QR, register, and join clubs in seconds." },
      { property: "og:title", content: "KRMU Induction Management" },
      { property: "og:description", content: "Real-time QR attendance and event management for 10,000+ KRMU students." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://aarambh.krmu.edu.in" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "KRMU Induction Management" },
      { name: "twitter:description", content: "Real-time QR attendance and event management for 10,000+ KRMU students." },
    ],
    links: [
      { rel: "canonical", href: "https://aarambh.krmu.edu.in" },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "preload", href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Cinzel+Decorative:wght@400;700;900&family=Rozha+One&family=Gotu&family=Pinyon+Script&family=Great+Vibes&family=Tiro+Devanagari+Hindi:ital,wght@0,400;1,400&family=Noto+Serif+Devanagari:wght@400;700;900&display=swap", as: "style" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Cinzel+Decorative:wght@400;700;900&family=Rozha+One&family=Gotu&family=Pinyon+Script&family=Great+Vibes&family=Tiro+Devanagari+Hindi:ital,wght@0,400;1,400&family=Noto+Serif+Devanagari:wght@400;700;900&display=swap" },
      { rel: "dns-prefetch", href: "https://firestore.googleapis.com" },
      { rel: "dns-prefetch", href: "https://identitytoolkit.googleapis.com" },
      { rel: "dns-prefetch", href: "https://securetoken.googleapis.com" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <noscript>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "system-ui", color: "#5a1a25" }}>
            <p>JavaScript is required to run this application. Please enable JavaScript in your browser settings.</p>
          </div>
        </noscript>
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <LazyMotion features={domAnimation}>
        <Outlet />
        <Toaster richColors position="top-center" />
      </LazyMotion>
    </QueryClientProvider>
  );
}
