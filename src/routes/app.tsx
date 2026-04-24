import { createFileRoute, Outlet, useNavigate, Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { getMyChildRecord } from "@/lib/household";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LogOut, Home, Package, ChefHat, History, Users, Settings as SettingsIcon } from "lucide-react";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

const PARENT_NAV = [
  { to: "/app", label: "בית", icon: Home, exact: true },
  { to: "/app/pantry", label: "המזווה", icon: Package },
  { to: "/app/prep", label: "רשימת הכנה", icon: ChefHat },
  { to: "/app/history", label: "היסטוריה", icon: History },
  { to: "/app/family", label: "משפחה", icon: Users },
  { to: "/app/settings", label: "הגדרות", icon: SettingsIcon },
];

const KID_NAV = [
  { to: "/app/kids", label: "הקופסא שלי", icon: Package, exact: false },
  { to: "/app/history", label: "היסטוריה", icon: History, exact: false },
];

function AppLayout() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [kidMode, setKidMode] = useState(false);
  const [childRecordId, setChildRecordId] = useState<string | null>(null);
  const [isKidUser, setIsKidUser] = useState<boolean | null>(null); // null = unknown

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/" });
  }, [user, loading, navigate]);

  // Detect if this user IS a child (logged in via their own email)
  useEffect(() => {
    (async () => {
      if (!user) { setIsKidUser(null); return; }
      const child = await getMyChildRecord(user.id);
      if (child) {
        setIsKidUser(true);
        setChildRecordId(child.id);
        // If kid lands on a parent-only page, redirect to their box
        const onAllowed =
          location.pathname.startsWith("/app/kids") ||
          location.pathname.startsWith("/app/history");
        if (!onAllowed) {
          navigate({ to: "/app/kids", search: { child: child.id }, replace: true });
        } else if (location.pathname.startsWith("/app/kids")) {
          // Force the right child id in search
          const sp = new URLSearchParams(location.search);
          if (sp.get("child") !== child.id) {
            navigate({ to: "/app/kids", search: { child: child.id }, replace: true });
          }
        }
      } else {
        setIsKidUser(false);
        setChildRecordId(null);
      }
    })();
  }, [user, location.pathname]);

  // Load kid mode from localStorage (parent toggling)
  useEffect(() => {
    const saved = localStorage.getItem("kidMode");
    if (saved === "1") setKidMode(true);
  }, []);

  const toggleKid = (v: boolean) => {
    setKidMode(v);
    localStorage.setItem("kidMode", v ? "1" : "0");
    if (v) {
      navigate({ to: "/app/kids", search: { child: "" } });
    } else {
      navigate({ to: "/app", replace: true });
    }
  };

  if (loading || !user || isKidUser === null) {
    return <div className="min-h-screen flex items-center justify-center text-3xl">🍱</div>;
  }

  // Kid user (logged in via their own google account) → simplified layout
  if (isKidUser) {
    const onBox = location.pathname.startsWith("/app/kids");
    return (
      <div className="min-h-screen bg-gradient-hero flex flex-col">
        <header className="bg-card/80 backdrop-blur sticky top-0 z-40 shadow-card">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-3xl">🍱</span>
              <span className="font-display font-bold text-lg hidden sm:inline">הקופסא שלי</span>
            </div>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="w-4 h-4 ml-1" />
              <span className="hidden sm:inline">יציאה</span>
            </Button>
          </div>
          <nav className="container mx-auto px-2 pb-2 flex gap-1 justify-center">
            {KID_NAV.map((item) => {
              const Icon = item.icon;
              const active = location.pathname.startsWith(item.to);
              const linkProps = item.to === "/app/kids"
                ? { to: item.to, search: { child: childRecordId ?? "" } as never }
                : { to: item.to };
              return (
                <Link
                  key={item.to}
                  {...linkProps}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                    active ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className={`flex-1 ${onBox ? "" : "container mx-auto px-4 py-6"}`}>
          <Outlet />
        </main>
      </div>
    );
  }

  const onKidRoute = location.pathname.startsWith("/app/kids") || location.pathname.startsWith("/app/box");

  // Parent in kid mode: clean fullscreen, no nav
  if (kidMode && onKidRoute) {
    return (
      <div className="min-h-screen bg-gradient-hero">
        <div className="fixed top-3 left-3 z-50 bg-card/90 backdrop-blur rounded-full px-4 py-2 shadow-card flex items-center gap-2">
          <Label htmlFor="kid-mode" className="text-xs font-bold cursor-pointer">מצב הורה</Label>
          <Switch id="kid-mode" checked={kidMode} onCheckedChange={toggleKid} />
        </div>
        <Outlet />
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card/50 backdrop-blur sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/app" className="flex items-center gap-2">
            <span className="text-3xl">🍱</span>
            <span className="font-display font-bold text-lg hidden sm:inline">קופסת האוכל שלי</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-secondary rounded-full px-3 py-1.5">
              <Label htmlFor="kid-mode" className="text-xs font-bold cursor-pointer">מצב ילד</Label>
              <Switch id="kid-mode" checked={kidMode} onCheckedChange={toggleKid} />
            </div>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="w-4 h-4 ml-1" />
              <span className="hidden sm:inline">יציאה</span>
            </Button>
          </div>
        </div>
        <nav className="container mx-auto px-2 pb-2 flex gap-1 overflow-x-auto">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                  active ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="flex-1 container mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
