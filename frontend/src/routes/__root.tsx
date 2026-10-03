import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-page px-4">
      <div className="max-w-md text-center space-y-4">
        <h1 className="t-h1 text-text">404</h1>
        <h2 className="t-title text-text">
          Page Not Found
        </h2>
        <p className="t-body text-text-muted">
          The requested page does not exist or has been moved.
        </p>
        <div className="pt-2">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-[10px] bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error("Application error:", error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-page px-4">
      <div className="max-w-md text-center space-y-4">
        <h1 className="t-title text-text">
          Application Error
        </h1>
        <p className="t-body text-text-muted">
          An unexpected error occurred. Please try refreshing or return to the
          dashboard.
        </p>
        <div className="pt-2 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-[10px] bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-600 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Retry
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-[10px] border border-v-border bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-bg-page cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Return to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { property: "og:type", content: "website" },
        {
          property: "og:title",
          content:
            "Nadar Saraswathi College of Engineering and Technology — Face Attendance",
        },
        {
          name: "description",
          content: "Official Biometric Face Attendance System for NSCET",
        },
      ],
      links: [
        {
          rel: "stylesheet",
          href: appCss,
        },
        { rel: "icon", href: "/favicon.png", type: "image/png" },
        { rel: "shortcut icon", href: "/favicon.ico" },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossOrigin: "anonymous",
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap",
        },
      ],
    }),
    shellComponent: RootShell,
    component: RootComponent,
    notFoundComponent: NotFoundComponent,
    errorComponent: ErrorComponent,
  },
);

function RootShell({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={150}>
        <Outlet />
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
