import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { getMyHouseholdId } from "@/lib/household";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Pencil, Image as ImageIcon, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/pantry")({
  component: Pantry,
});

interface Category { id: string; name: string; emoji: string; color: string; max_selections: number; sort_order: number }
interface FoodItem { id: string; category_id: string; name: string; image_url: string | null; emoji: string | null; is_active: boolean }

const FOOD_EMOJIS = ["🍎","🍌","🍇","🍓","🥕","🥒","🍅","🥑","🥪","🥯","🍞","🧀","🥚","🍪","🍫","🍿","🍇","🥨","🧃","🥛","🍵","🍊","🍑","🍒","🌽","🥦","🍠","🥜"];

function Pantry() {
  const { user } = useAuth();
  const [hid, setHid] = useState<string | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [items, setItems] = useState<FoodItem[]>([]);
  // itemId -> categoryIds[]
  const [itemCats, setItemCats] = useState<Record<string, string[]>>({});
  const [catDialog, setCatDialog] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catName, setCatName] = useState("");
  const [catEmoji, setCatEmoji] = useState("🍽️");
  const [catMax, setCatMax] = useState(1);
  const [itemDialog, setItemDialog] = useState<{ open: boolean; categoryId: string | null; editing: FoodItem | null }>({ open: false, categoryId: null, editing: null });
  const [itemName, setItemName] = useState("");
  const [itemEmoji, setItemEmoji] = useState("🍎");
  const [itemImage, setItemImage] = useState<string | null>(null);
  const [itemSelectedCats, setItemSelectedCats] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    if (!user) return;
    const id = await getMyHouseholdId(user.id);
    setHid(id);
    if (!id) return;
    const [{ data: c }, { data: f }, { data: fic }] = await Promise.all([
      supabase.from("categories").select("*").eq("household_id", id).order("sort_order"),
      supabase.from("food_items").select("*").eq("household_id", id).order("created_at"),
      supabase.from("food_item_categories").select("food_item_id, category_id").eq("household_id", id),
    ]);
    setCats(c ?? []);
    setItems(f ?? []);
    const map: Record<string, string[]> = {};
    for (const row of fic ?? []) {
      map[row.food_item_id] = [...(map[row.food_item_id] ?? []), row.category_id];
    }
    for (const it of f ?? []) {
      if (!map[it.id] && it.category_id) map[it.id] = [it.category_id];
    }
    setItemCats(map);
  };
  useEffect(() => { load(); }, [user]);

  const openNewCat = () => { setEditingCat(null); setCatName(""); setCatEmoji("🍽️"); setCatMax(1); setCatDialog(true); };
  const openEditCat = (c: Category) => { setEditingCat(c); setCatName(c.name); setCatEmoji(c.emoji); setCatMax(c.max_selections); setCatDialog(true); };

  const saveCat = async () => {
    if (!hid || !catName.trim()) return;
    if (editingCat) {
      await supabase.from("categories").update({ name: catName.trim(), emoji: catEmoji, max_selections: catMax }).eq("id", editingCat.id);
    } else {
      await supabase.from("categories").insert({ household_id: hid, name: catName.trim(), emoji: catEmoji, max_selections: catMax, sort_order: cats.length + 1 });
    }
    setCatDialog(false); load();
  };
  const removeCat = async (id: string) => {
    if (!confirm("למחוק את הקטגוריה וכל המנות שבתוכה?")) return;
    await supabase.from("categories").delete().eq("id", id);
    load();
  };


  const moveCat = async (cat: Category, dir: -1 | 1) => {
    const sorted = [...cats].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((c) => c.id === cat.id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    // optimistic
    setCats((prev) => prev.map((c) => {
      if (c.id === cat.id) return { ...c, sort_order: other.sort_order };
      if (c.id === other.id) return { ...c, sort_order: cat.sort_order };
      return c;
    }));
    await Promise.all([
      supabase.from("categories").update({ sort_order: other.sort_order }).eq("id", cat.id),
      supabase.from("categories").update({ sort_order: cat.sort_order }).eq("id", other.id),
    ]);
    load();
  };

  const openNewItem = (categoryId: string) => {
    setItemDialog({ open: true, categoryId, editing: null });
    setItemName(""); setItemEmoji("🍎"); setItemImage(null);
    setItemSelectedCats([categoryId]);
  };
  const openEditItem = (it: FoodItem) => {
    setItemDialog({ open: true, categoryId: it.category_id, editing: it });
    setItemName(it.name); setItemEmoji(it.emoji ?? "🍎"); setItemImage(it.image_url);
    setItemSelectedCats(itemCats[it.id] ?? [it.category_id]);
  };

  const toggleItemCat = (cid: string) => {
    setItemSelectedCats((prev) => prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]);
  };

  const handleUpload = async (file: File) => {
    if (!hid) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${hid}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("food-images").upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("food-images").getPublicUrl(path);
      setItemImage(data.publicUrl);
    } catch (e: any) {
      toast.error("שגיאה בהעלאת תמונה: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  const saveItem = async () => {
    if (!hid || !itemDialog.categoryId || !itemName.trim()) return;
    if (itemSelectedCats.length === 0) {
      toast.error("צריך לבחור לפחות קטגוריה אחת");
      return;
    }
    const primaryCat = itemSelectedCats[0];
    let itemId: string;
    if (itemDialog.editing) {
      itemId = itemDialog.editing.id;
      await supabase.from("food_items")
        .update({ name: itemName.trim(), emoji: itemEmoji, image_url: itemImage, category_id: primaryCat })
        .eq("id", itemId);
    } else {
      const { data, error } = await supabase.from("food_items").insert({
        household_id: hid, category_id: primaryCat,
        name: itemName.trim(), emoji: itemEmoji, image_url: itemImage,
      }).select("id").single();
      if (error || !data) { toast.error(error?.message ?? "שגיאה בשמירה"); return; }
      itemId = data.id;
    }
    // Sync junction table
    await supabase.from("food_item_categories").delete().eq("food_item_id", itemId);
    const rows = itemSelectedCats.map((cid) => ({ food_item_id: itemId, category_id: cid, household_id: hid }));
    const { error: ficErr } = await supabase.from("food_item_categories").insert(rows);
    if (ficErr) { toast.error(ficErr.message); return; }
    setItemDialog({ open: false, categoryId: null, editing: null });
    load();
  };
  const removeItem = async (id: string) => {
    if (!confirm("למחוק את הפריט?")) return;
    await supabase.from("food_items").delete().eq("id", id);
    load();
  };
  const toggleActive = async (it: FoodItem) => {
    await supabase.from("food_items").update({ is_active: !it.is_active }).eq("id", it.id);
    load();
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">המזווה 🥫</h1>
          <p className="text-muted-foreground">נהלו את האוכל שיש בבית — הילד יוכל לבחור רק מהפריטים שהפעלתם.</p>
        </div>
        <Button onClick={openNewCat} className="rounded-2xl"><Plus className="w-4 h-4 ml-1" /> קטגוריה חדשה</Button>
      </div>

      <div className="space-y-5">
        {cats.map((cat) => {
          const catItems = items.filter((i) => (itemCats[i.id] ?? [i.category_id]).includes(cat.id));
          return (
            <Card key={cat.id} className="p-5 shadow-card">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{cat.emoji}</span>
                  <div>
                    <h2 className="text-xl font-bold">{cat.name}</h2>
                    <p className="text-xs text-muted-foreground">מותר לבחור עד {cat.max_selections} פריטים</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => openEditCat(cat)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => removeCat(cat.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  <Button size="sm" onClick={() => openNewItem(cat.id)} className="rounded-xl"><Plus className="w-4 h-4 ml-1" /> פריט</Button>
                </div>
              </div>
              {catItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">אין פריטים בקטגוריה הזו עדיין</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {catItems.map((it) => {
                    const otherCats = (itemCats[it.id] ?? []).filter((cid) => cid !== cat.id);
                    return (
                      <div key={it.id} className={`relative rounded-2xl border-2 p-3 transition-all ${it.is_active ? "bg-card border-border" : "bg-muted/50 border-dashed opacity-60"}`}>
                        <div className="aspect-square rounded-xl overflow-hidden bg-secondary flex items-center justify-center mb-2">
                          {it.image_url ? (
                            <img src={it.image_url} alt={it.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-5xl">{it.emoji}</span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-center truncate">{it.name}</p>
                        {otherCats.length > 0 && (
                          <p className="text-[10px] text-muted-foreground text-center truncate mt-0.5">
                            גם ב: {otherCats.map((cid) => cats.find((c) => c.id === cid)?.emoji).filter(Boolean).join(" ")}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-2 gap-2">
                          <Switch checked={it.is_active} onCheckedChange={() => toggleActive(it)} className="shrink-0" />
                          <div className="flex gap-1">
                            <button onClick={() => openEditItem(it)} className="p-1 hover:bg-secondary rounded"><Pencil className="w-3 h-3" /></button>
                            <button onClick={() => removeItem(it.id)} className="p-1 hover:bg-destructive/10 rounded"><Trash2 className="w-3 h-3 text-destructive" /></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Category dialog */}
      <Dialog open={catDialog} onOpenChange={setCatDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingCat ? "עריכת קטגוריה" : "קטגוריה חדשה"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1">שם</label>
              <Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="למשל: ממרחים" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">אייקון</label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {["🥪","🥗","🥕","🍎","🍪","🧃","🥛","🥚","🧀","🥯","🍞","🍫","🥨","🌽","🥑","🍳","🍱"].map((e) => (
                  <button key={e} type="button" onClick={() => setCatEmoji(e)}
                    className={`text-3xl w-12 h-12 rounded-xl flex items-center justify-center ${catEmoji === e ? "ring-4 ring-primary" : "bg-secondary"}`}>{e}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">מקסימום פריטים לבחירה ({catMax})</label>
              <Input type="number" min={1} max={10} value={catMax} onChange={(e) => setCatMax(Number(e.target.value))} />
            </div>
          </div>
          <DialogFooter><Button onClick={saveCat} disabled={!catName.trim()}>שמירה</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item dialog */}
      <Dialog open={itemDialog.open} onOpenChange={(v) => setItemDialog({ ...itemDialog, open: v })}>
        <DialogContent>
          <DialogHeader><DialogTitle>{itemDialog.editing ? "עריכת פריט" : "פריט חדש"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1">שם</label>
              <Input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="למשל: תפוח אדום" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">קטגוריות (אפשר לבחור כמה — ייספר בכולן)</label>
              <div className="flex flex-wrap gap-2">
                {cats.map((c) => {
                  const on = itemSelectedCats.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleItemCat(c.id)}
                      className={`px-3 py-2 rounded-xl text-sm flex items-center gap-1 transition-all ${on ? "bg-primary text-primary-foreground ring-2 ring-primary shadow-pop" : "bg-secondary"}`}
                    >
                      <span className="text-lg">{c.emoji}</span> {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">תמונה (אופציונלי)</label>
              <div className="flex items-center gap-3">
                <div className="w-20 h-20 rounded-xl bg-secondary overflow-hidden flex items-center justify-center shrink-0">
                  {itemImage ? <img src={itemImage} alt="" className="w-full h-full object-cover" /> : <span className="text-4xl">{itemEmoji}</span>}
                </div>
                <div className="flex-1 space-y-2">
                  <label className="cursor-pointer block">
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                    <div className="border-2 border-dashed rounded-xl p-3 text-center text-sm hover:bg-secondary transition-colors">
                      <ImageIcon className="w-4 h-4 inline ml-1" />
                      {uploading ? "מעלה..." : "העלאת תמונה"}
                    </div>
                  </label>
                  {itemImage && <Button size="sm" variant="ghost" onClick={() => setItemImage(null)}>הסרה</Button>}
                </div>
              </div>
              <div className="mt-2">
                <Input
                  type="url"
                  dir="ltr"
                  placeholder="או הדביקו קישור לתמונה (https://...)"
                  value={itemImage && itemImage.startsWith("http") && !itemImage.includes("/storage/v1/") ? itemImage : ""}
                  onChange={(e) => setItemImage(e.target.value || null)}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">או בחרו אייקון</label>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {FOOD_EMOJIS.map((e) => (
                  <button key={e} type="button" onClick={() => setItemEmoji(e)}
                    className={`text-2xl w-10 h-10 rounded-lg flex items-center justify-center ${itemEmoji === e ? "ring-4 ring-primary" : "bg-secondary"}`}>{e}</button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter><Button onClick={saveItem} disabled={!itemName.trim() || itemSelectedCats.length === 0}>שמירה</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
