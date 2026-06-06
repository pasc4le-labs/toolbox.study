"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RiAddLine, RiDeleteBinLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { getDb } from "@/db";
import {
  createCard,
  updateCard,
  getAllTags,
  getAllBundles,
  getOrCreateTag,
  getCardTags,
  getCardBundles,
  getCardById,
} from "@/lib/services";
import { toast } from "sonner";

type CardType = "multi_radio" | "multi_select" | "open" | "knowledge";

interface CardFormProps {
  cardId?: number; // if editing
  onSuccess?: () => void;
}

export function CardForm({ cardId, onSuccess }: CardFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(cardId != null);
  const [allTags, setAllTags] = useState<Awaited<ReturnType<typeof getAllTags>>>([]);
  const [allBundles, setAllBundles] = useState<Awaited<ReturnType<typeof getAllBundles>>>([]);
  const [type, setType] = useState<CardType>("knowledge");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [explanation, setExplanation] = useState("");
  const [options, setOptions] = useState<string[]>([""]);
  const [correctIndices, setCorrectIndices] = useState<number[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [selectedBundleIds, setSelectedBundleIds] = useState<number[]>([]);
  const [newTagInput, setNewTagInput] = useState("");

  useEffect(() => {
    async function loadInitial() {
      try {
        const { db } = await getDb();
        const [tags, bundles] = await Promise.all([
          getAllTags(db),
          getAllBundles(db),
        ]);
        setAllTags(tags);
        setAllBundles(bundles);

        if (cardId) {
          const card = await getCardById(db, cardId);
          if (card) {
            setType(card.type as CardType);
            setFront(card.front);
            setBack(card.back);
            setExplanation(card.explanation ?? "");
            if (card.options) {
              setOptions(JSON.parse(card.options));
            }
            if (card.correctIndices) {
              setCorrectIndices(JSON.parse(card.correctIndices));
            }
            const cardTags = await getCardTags(db, cardId);
            setSelectedTagIds(cardTags.map((t) => t.id));
            const cardBundles = await getCardBundles(db, cardId);
            setSelectedBundleIds(cardBundles.map((b) => b.id));
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setInitialLoading(false);
      }
    }
    loadInitial();
  }, [cardId]);

  const handleTypeChange = (newType: CardType) => {
    setType(newType);
    if (newType === "open" || newType === "knowledge") {
      setOptions([""]);
      setCorrectIndices([]);
    }
  };

  const addOption = () => setOptions([...options, ""]);
  const removeOption = (i: number) => {
    const newOpts = options.filter((_, idx) => idx !== i);
    setOptions(newOpts);
    setCorrectIndices(
      correctIndices
        .filter((idx) => idx !== i)
        .map((idx) => (idx > i ? idx - 1 : idx)),
    );
  };
  const updateOption = (i: number, val: string) => {
    const newOpts = [...options];
    newOpts[i] = val;
    setOptions(newOpts);
  };

  const toggleCorrectIndex = (idx: number) => {
    if (type === "multi_radio") {
      setCorrectIndices([idx]);
    } else {
      setCorrectIndices(
        correctIndices.includes(idx)
          ? correctIndices.filter((i) => i !== idx)
          : [...correctIndices, idx],
      );
    }
  };

  const addNewTag = async () => {
    const name = newTagInput.trim();
    if (!name) return;
    try {
      const { db } = await getDb();
      const tag = await getOrCreateTag(db, name);
      if (tag) {
        setSelectedTagIds((prev) => (prev.includes(tag.id) ? prev : [...prev, tag.id]));
        setAllTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
      }
      setNewTagInput("");
    } catch {
      toast.error("Failed to create tag");
    }
  };

  const handleSubmit = async () => {
    if (!front.trim() || !back.trim()) {
      toast.error("Front and Back are required");
      return;
    }
    if ((type === "multi_radio" || type === "multi_select") && options.some((o) => !o.trim())) {
      toast.error("All options must be filled");
      return;
    }
    if (correctIndices.length === 0 && (type === "multi_radio" || type === "multi_select")) {
      toast.error("Select at least one correct answer");
      return;
    }

    setLoading(true);
    try {
      const { db } = await getDb();
      const data = {
        type,
        front: front.trim(),
        back: back.trim(),
        explanation: explanation.trim() || null,
        options: type === "multi_radio" || type === "multi_select" ? options.filter((o) => o.trim()) : null,
        correctIndices: type === "multi_radio" || type === "multi_select" ? correctIndices : null,
        tagIds: selectedTagIds,
        bundleIds: selectedBundleIds,
      };

      if (cardId) {
        await updateCard(db, cardId, data);
        toast.success("Card updated");
      } else {
        await createCard(db, data);
        toast.success("Card created");
      }

      if (onSuccess) onSuccess();
      else router.push("/study-dome/cards");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save card");
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  const isMulti = type === "multi_radio" || type === "multi_select";

  return (
    <div className="space-y-6">
      {/* Card Type */}
      <div className="space-y-2">
        <Label>Card Type</Label>
        <RadioGroup
          value={type}
          onValueChange={(v) => handleTypeChange(v as CardType)}
          className="flex flex-wrap gap-4"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="knowledge" id="type-knowledge" />
            <Label htmlFor="type-knowledge">Knowledge</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="open" id="type-open" />
            <Label htmlFor="type-open">Open Answer</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="multi_radio" id="type-multi-radio" />
            <Label htmlFor="type-multi-radio">Multiple Choice (Single)</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="multi_select" id="type-multi-select" />
            <Label htmlFor="type-multi-select">Multiple Choice (Multi)</Label>
          </div>
        </RadioGroup>
      </div>

      {/* Front */}
      <div className="space-y-2">
        <Label htmlFor="front">Front (Question / Prompt)</Label>
        <Textarea
          id="front"
          value={front}
          onChange={(e) => setFront(e.target.value)}
          placeholder="Enter the question or prompt..."
          rows={3}
        />
      </div>

      {/* Back */}
      <div className="space-y-2">
        <Label htmlFor="back">Back (Answer / Response)</Label>
        <Textarea
          id="back"
          value={back}
          onChange={(e) => setBack(e.target.value)}
          placeholder="Enter the answer or response..."
          rows={3}
        />
      </div>

      {/* Explanation */}
      <div className="space-y-2">
        <Label htmlFor="explanation">Explanation (Optional)</Label>
        <Textarea
          id="explanation"
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          placeholder="Optional explanation..."
          rows={2}
        />
      </div>

      {/* Options (for multi_radio / multi_select) */}
      {isMulti && (
        <div className="space-y-3">
          <Label>Options</Label>
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              {type === "multi_radio" ? (
                <input
                  type="radio"
                  checked={correctIndices.includes(i)}
                  onChange={() => toggleCorrectIndex(i)}
                  className="h-4 w-4"
                />
              ) : (
                <Checkbox
                  checked={correctIndices.includes(i)}
                  onCheckedChange={() => toggleCorrectIndex(i)}
                />
              )}
              <Input
                value={opt}
                onChange={(e) => updateOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                className="flex-1"
              />
              {options.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeOption(i)}
                  type="button"
                >
                  <RiDeleteBinLine className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addOption} type="button">
            <RiAddLine className="mr-1 h-4 w-4" />
            Add Option
          </Button>
          <p className="text-xs text-muted-foreground">
            {type === "multi_radio"
              ? "Select the correct option via radio button."
              : "Check all correct options."}
          </p>
        </div>
      )}

      {/* Tags */}
      <div className="space-y-2">
        <Label>Tags</Label>
        <div className="flex flex-wrap gap-2">
          {allTags.map((tag) => (
            <Badge
              key={tag.id}
              variant={selectedTagIds.includes(tag.id) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() =>
                setSelectedTagIds((prev) =>
                  prev.includes(tag.id)
                    ? prev.filter((id) => id !== tag.id)
                    : [...prev, tag.id],
                )
              }
            >
              {tag.name}
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="New tag name..."
            value={newTagInput}
            onChange={(e) => setNewTagInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNewTag())}
          />
          <Button variant="outline" size="sm" onClick={addNewTag} type="button">
            Add
          </Button>
        </div>
      </div>

      {/* Bundle assignment */}
      <div className="space-y-2">
        <Label>Bundles</Label>
        <div className="flex flex-wrap gap-2">
          {allBundles.map((bundle) => (
            <Badge
              key={bundle.id}
              variant={selectedBundleIds.includes(bundle.id) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() =>
                setSelectedBundleIds((prev) =>
                  prev.includes(bundle.id)
                    ? prev.filter((id) => id !== bundle.id)
                    : [...prev, bundle.id],
                )
              }
            >
              {bundle.title}
            </Badge>
          ))}
          {allBundles.length === 0 && (
            <p className="text-sm text-muted-foreground">No bundles yet.</p>
          )}
        </div>
      </div>

      {/* Submit */}
      <div className="flex gap-2">
        <Button onClick={handleSubmit} disabled={loading}>
          {loading ? "Saving..." : cardId ? "Update Card" : "Create Card"}
        </Button>
        <Button variant="outline" onClick={() => router.back()} type="button">
          Cancel
        </Button>
      </div>
    </div>
  );
}
