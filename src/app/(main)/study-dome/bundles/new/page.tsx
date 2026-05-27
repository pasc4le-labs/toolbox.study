"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boxed } from "@/components/boxed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getDb } from "@/db";
import { createBundle } from "@/lib/db-queries";
import { toast } from "sonner";

export default function NewBundlePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      const { db } = await getDb();
      const bundle = await createBundle(db, { title: title.trim(), description: description.trim() || null });
      if (bundle) {
        toast.success("Bundle created");
        router.push(`/study-dome/bundles/${bundle.id}`);
      }
    } catch {
      toast.error("Failed to create bundle");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Boxed className="py-8">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">Create Bundle</h1>
      <div className="max-w-md space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Biology Chapter 5"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="desc">Description (Optional)</Label>
          <Textarea
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description..."
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Creating..." : "Create Bundle"}
          </Button>
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </div>
    </Boxed>
  );
}
