"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageTitle } from "@/components/page-title";
import { Boxed } from "@/components/boxed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { BundleEmojiPicker } from "@/components/bundle-emoji-picker";
import { BundleColorPicker } from "@/components/bundle-color-picker";
import { getDb } from "@/db";
import { createBundle } from "@/lib/services";
import { toast } from "sonner";

export default function NewBundlePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [coverColor, setCoverColor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      const { db } = await getDb();
      const bundle = await createBundle(db, {
        title: title.trim(),
        description: description.trim() || null,
        emoji,
        coverColor,
      });
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
      <PageTitle>New Bundle</PageTitle>
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
        <div className="space-y-2">
          <Label>Icon (Optional)</Label>
          <BundleEmojiPicker emoji={emoji} onEmojiChange={setEmoji} />
        </div>
        <div className="space-y-2">
          <Label>Cover Color (Optional)</Label>
          <BundleColorPicker color={coverColor} onColorChange={setCoverColor} />
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
