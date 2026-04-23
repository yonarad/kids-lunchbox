import { createFileRoute, Outlet, useNavigate, Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LogOut, Home, Package, ChefHat, History, Users, Settings as SettingsIcon } from "lucide-react";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

const NAV = [
  { to: "/app", label: "בית", icon: Home, exact: true },
  { to: "/app/pantry", label: "המזווה", icon: Package },
  { to: "/app/prep", label: "רשימת הכנה", icon: ChefHat },
  { to: "/app/history", label: "היסטוריה", icon: History },
  { to: "/app/family", label: "משפחה", icon: Users },
  { to: "/app/settings", label: "הגדרות", icon: SettingsIcon },
];

function AppLayout() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [kidMode, setKidMode] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/" });
  }, [user, loading, navigate]);

  // Load kid mode from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("kidMode");
    if (saved === "1") setKidMode(true);
  }, []);

  const toggleKid = (v: boolean) => {
    setKidMode(v);
    localStorage.setItem("kidMode", v ? "1" : "0");
    if (v) navigate({ to: "/app/kids", search: { child: "" } });
    else navigate({ to: "/app" });
  };

  if (loading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-3xl">🍱</div>;
  }

  // Kid mode: clean fullscreen, no nav
  if (kidMode || location.pathname.startsWith("/app/kids") || location.pathname.startsWith("/app/box")) {
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
