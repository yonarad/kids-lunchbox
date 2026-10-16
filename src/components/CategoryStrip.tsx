import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface Category {
  id: string;
  name: string;
  emoji: string;
  max_selections: number;
}

export function CategoryStrip({ categories, activeId, countForCategory, onSelect }: {
  categories: Category[];
  activeId: string | null;
  countForCategory: (id: string) => number;
  onSelect: (id: string) => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const update = () => {
      const bounds = strip.getBoundingClientRect();
      const children = Array.from(strip.children);
      setEdges({
        left: children.some((item) => item.getBoundingClientRect().left < bounds.left - 2),
        right: children.some((item) => item.getBoundingClientRect().right > bounds.right + 2),
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(strip);
    strip.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      observer.disconnect();
      strip.removeEventListener("scroll", update);
    };
  }, [categories]);

  const select = (id: string, element: HTMLButtonElement) => {
    onSelect(id);
    const strip = stripRef.current;
    if (!strip) return;
    const bounds = strip.getBoundingClientRect();
    const tab = element.getBoundingClientRect();
    strip.scrollBy({
      left: tab.left + tab.width / 2 - (bounds.left + bounds.width / 2),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  };

  return (
    <div className="relative max-w-5xl mx-auto mb-4">
      <div ref={stripRef} role="group" aria-label="קטגוריות מזון" className="category-strip flex gap-2 overflow-x-auto py-2">
        {categories.map((category) => (
          <Button
            key={category.id}
            variant="ghost"
            aria-pressed={category.id === activeId}
            onClick={(event) => select(category.id, event.currentTarget)}
            className={`category-tab h-auto min-w-0 shrink-0 flex-col gap-0 rounded-2xl px-2 py-3 whitespace-normal transition-colors ${category.id === activeId ? "bg-primary text-primary-foreground shadow-pop hover:bg-primary" : "bg-card shadow-card hover:bg-secondary"}`}
          >
            <span className="text-3xl" aria-hidden="true">{category.emoji}</span>
            <span className="text-sm font-bold w-full truncate">{category.name}</span>
            <span className="text-xs opacity-80">{countForCategory(category.id)}/{category.max_selections}</span>
          </Button>
        ))}
      </div>
      {edges.left && <div aria-hidden="true" className="category-fade-left pointer-events-none absolute inset-y-0 left-0 w-5" />}
      {edges.right && <div aria-hidden="true" className="category-fade-right pointer-events-none absolute inset-y-0 right-0 w-5" />}
    </div>
  );
}