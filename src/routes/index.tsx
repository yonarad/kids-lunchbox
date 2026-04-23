import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/app" });
  }, [user, loading, navigate]);

  const signIn = async () => {
    setSigning(true);
    try {
      const res = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/app",
      });
      if (res.error) toast.error("שגיאה בהתחברות");
    } catch {
      toast.error("שגיאה בהתחברות");
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero relative overflow-hidden">
      {/* floating decorations */}
      <div className="absolute top-10 right-10 text-6xl animate-float">🥪</div>
      <div className="absolute top-32 left-16 text-5xl animate-float" style={{ animationDelay: "0.5s" }}>🍎</div>
      <div className="absolute bottom-32 right-20 text-6xl animate-float" style={{ animationDelay: "1s" }}>🥕</div>
      <div className="absolute bottom-16 left-10 text-5xl animate-float" style={{ animationDelay: "1.5s" }}>🧃</div>
      <div className="absolute top-1/2 right-1/3 text-4xl animate-float" style={{ animationDelay: "0.8s" }}>🍪</div>

      <div className="relative z-10 container mx-auto px-6 py-20 flex flex-col items-center text-center max-w-3xl">
        <div className="text-8xl mb-6 animate-pop-in">🍱</div>
        <h1 className="text-5xl md:text-7xl mb-6 text-foreground">קופסת האוכל שלי</h1>
        <p className="text-xl md:text-2xl text-foreground/80 mb-10 leading-relaxed">
          הילדים בוחרים בעצמם מה ייכנס לקופסה, <br />
          וההורים מקבלים רשימת הכנה מסודרת בבוקר 🌞
        </p>

        <Button
          size="lg"
          onClick={signIn}
          disabled={signing}
          className="rounded-2xl px-10 py-7 text-lg font-bold shadow-pop hover:scale-105 transition-transform"
        >
          <svg viewBox="0 0 24 24" className="w-6 h-6 ml-2">
            <path fill="#fff" d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z"/>
          </svg>
          התחברות עם Google
        </Button>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          <FeatureCard emoji="👨‍👩‍👧" title="לכל המשפחה" desc="ניהול משותף לשני הורים" />
          <FeatureCard emoji="🎮" title="כיף לילדים" desc="ממשק משחקי וצבעוני" />
          <FeatureCard emoji="📋" title="סדר להורים" desc="רשימת הכנה מוכנה בבוקר" />
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <div className="bg-card/80 backdrop-blur-sm rounded-3xl p-6 shadow-card">
      <div className="text-5xl mb-3">{emoji}</div>
      <h3 className="text-lg font-bold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
