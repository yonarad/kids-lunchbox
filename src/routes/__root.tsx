import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="text-8xl mb-4">🍱</div>
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">הדף לא נמצא</h2>
        <p className="mt-2 text-sm text-muted-foreground">הדף שחיפשת לא קיים או הוסר.</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-all hover:scale-105 shadow-pop"
          >
            חזרה הביתה
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1" },
      { title: "קופסת האוכל שלי" },
      { name: "description", content: "אפליקציה משחקית לבחירת תוכן קופסת האוכל של הילדים" },
      { name: "theme-color", content: "#FF8A65" },
      { property: "og:title", content: "קופסת האוכל שלי" },
      { property: "og:description", content: "אפליקציה משחקית לבחירת תוכן קופסת האוכל של הילדים" },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "קופסת האוכל שלי" },
      { name: "twitter:description", content: "אפליקציה משחקית לבחירת תוכן קופסת האוכל של הילדים" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/eec18768-c323-42fa-8e52-95e84f3199f4/id-preview-947f8b12--a9763436-b85d-459f-9285-ec89e0290548.lovable.app-1776975535560.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/eec18768-c323-42fa-8e52-95e84f3199f4/id-preview-947f8b12--a9763436-b85d-459f-9285-ec89e0290548.lovable.app-1776975535560.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Heebo:wght@400;500;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <Outlet />
      <Toaster richColors position="top-center" />
    </AuthProvider>
  );
}
