"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { Boxed } from "@/components/boxed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getDb } from "@/db";
import { getBundleById, updateBundle } from "@/lib/db-queries";
import { toast } from "sonner";

export default function EditBundlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const bundleId = parseInt(id);
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { db } = await getDb();
      const bundle = await getBundleById(db, bundleId);
      if (bundle) {
        setTitle(bundle.title);
        setDescription(bundle.description ?? "");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [bundleId]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      const { db } = await getDb();
      await updateBundle(db, bundleId, { title: title.trim(), description: description.trim() || null });
      toast.success("Bundle updated");
      router.push(`/study-dome/bundles/${bundleId}`);
    } catch {
      toast.error("Failed to update bundle");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Boxed className="py-8">
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </Boxed>
    );
  }

  return (
    <Boxed className="py-8">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">Edit Bundle</h1>
      <div className="max-w-md space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="desc">Description</Label>
          <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </div>
    </Boxed>
  );
}
