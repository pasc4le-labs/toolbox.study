"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { PageTitle } from "@/components/page-title";
import { Boxed } from "@/components/boxed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { BundleEmojiPicker } from "@/components/bundle-emoji-picker";
import { BundleColorPicker } from "@/components/bundle-color-picker";
import { getDb } from "@/db";
import { getBundleById, updateBundle } from "@/lib/services";
import { toast } from "sonner";

export default function EditBundlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const bundleId = parseInt(id);
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [coverColor, setCoverColor] = useState<string | null>(null);
  const [examQuestionCount, setExamQuestionCount] = useState<number>(5);
  const [examTimeLimitMinutes, setExamTimeLimitMinutes] = useState<number>(0);
  const [examDifficultyFilter, setExamDifficultyFilter] = useState<number>(0);
  const [examPointsPerCorrect, setExamPointsPerCorrect] = useState<number>(1);
  const [examPointsPerWrong, setExamPointsPerWrong] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const { db } = await getDb();
        const bundle = await getBundleById(db, bundleId);
        if (bundle) {
          setTitle(bundle.title);
          setDescription(bundle.description ?? "");
          setEmoji(bundle.emoji);
          setCoverColor(bundle.coverColor);
          setExamQuestionCount(bundle.examQuestionCount ?? 5);
          setExamTimeLimitMinutes(bundle.examTimeLimitSeconds ? Math.round(bundle.examTimeLimitSeconds / 60) : 0);
          setExamDifficultyFilter(Math.round((bundle.examDifficultyFilter ?? 0) * 100));
          setExamPointsPerCorrect(bundle.examPointsPerCorrect ?? 1);
          setExamPointsPerWrong(bundle.examPointsPerWrong ?? 0);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [bundleId]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      const { db } = await getDb();
      await updateBundle(db, bundleId, {
        title: title.trim(),
        description: description.trim() || null,
        emoji,
        coverColor,
        examQuestionCount: examQuestionCount || null,
        examTimeLimitSeconds: examTimeLimitMinutes > 0 ? examTimeLimitMinutes * 60 : null,
        examDifficultyFilter: examDifficultyFilter / 100,
        examPointsPerCorrect: examPointsPerCorrect,
        examPointsPerWrong: examPointsPerWrong,
      });
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
      <PageTitle>Edit Bundle</PageTitle>
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
        <div className="space-y-2">
          <Label>Icon (Optional)</Label>
          <BundleEmojiPicker emoji={emoji} onEmojiChange={setEmoji} />
        </div>
        <div className="space-y-2">
          <Label>Cover Color (Optional)</Label>
          <BundleColorPicker color={coverColor} onColorChange={setCoverColor} />
        </div>
      </div>

      <div className="mt-8 max-w-md space-y-4">
        <h2 className="text-lg font-semibold">Default Exam Settings</h2>
        <p className="text-sm text-muted-foreground">These values pre-fill when starting an exam from this bundle.</p>

        <div className="space-y-2">
          <Label>Default questions</Label>
          <Input type="number" min={1} value={examQuestionCount} onChange={(e) => setExamQuestionCount(parseInt(e.target.value) || 5)} />
        </div>

        <div className="space-y-2">
          <Label>Default time limit (minutes, 0 = no limit)</Label>
          <Input type="number" min={0} value={examTimeLimitMinutes} onChange={(e) => setExamTimeLimitMinutes(parseInt(e.target.value) || 0)} />
        </div>

        <div className="space-y-2">
          <Label>Points per correct answer</Label>
          <Input type="number" min={0} step={0.5} value={examPointsPerCorrect} onChange={(e) => setExamPointsPerCorrect(parseFloat(e.target.value) || 1)} />
        </div>

        <div className="space-y-2">
          <Label>Negative points per wrong answer</Label>
          <Input type="number" max={0} step={0.25} value={examPointsPerWrong} onChange={(e) => setExamPointsPerWrong(parseFloat(e.target.value) || 0)} />
        </div>

        <div className="space-y-2">
          <Label>Focus on weak cards: {examDifficultyFilter}%</Label>
          <Slider value={[examDifficultyFilter]} onValueChange={([v]) => setExamDifficultyFilter(v)} min={0} max={100} step={10} />
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </Boxed>
  );
}
