"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { RiAddLine, RiMagicLine, RiDeleteBinLine, RiEditLine } from "@remixicon/react";
import { Boxed } from "@/components/boxed";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getDb } from "@/db";
import {
  getAllAiProviders,
  createAiProvider,
  updateAiProvider,
  deleteAiProvider,
} from "@/lib/services";
import { toast } from "sonner";

const PROVIDER_TYPES = [
  { value: "openai-compatible", label: "OpenAI-compatible (Generic)", needsBaseUrl: true },
  { value: "google", label: "Google Gemini (Native)", needsBaseUrl: false },
  { value: "anthropic", label: "Anthropic Claude (Native)", needsBaseUrl: false },
] as const;

const MODEL_SUGGESTIONS: Record<string, string[]> = {
  "openai-compatible": ["gpt-4o-mini", "gpt-4o", "llama-3.1-70b", "mixtral-8x7b"],
  google: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.5-flash", "gemini-2.5-pro"],
  anthropic: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
};

const DEFAULT_BASE_URLS: Record<string, string> = {
  "openai-compatible": "https://api.openai.com/v1",
  google: "",
  anthropic: "",
};

export default function FactoryPage() {
  const [providers, setProviders] = useState<Awaited<ReturnType<typeof getAllAiProviders>>>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    providerType: "openai-compatible" as "openai-compatible" | "google" | "anthropic",
    baseUrl: "",
    apiKey: "",
    modelId: "",
    isDefault: false,
  });
  const [saving, setSaving] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);

  const load = useCallback(async () => {
    try {
      const { db } = await getDb();
      const p = await getAllAiProviders(db);
      setProviders(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setForm({
      name: "",
      providerType: "openai-compatible",
      baseUrl: DEFAULT_BASE_URLS["openai-compatible"],
      apiKey: "",
      modelId: "",
      isDefault: false,
    });
    setEditing(null);
    setFetchedModels([]);
  };

  const selectedType = PROVIDER_TYPES.find((t) => t.value === form.providerType);
  const needsBaseUrl = selectedType?.needsBaseUrl ?? true;

  const handleSave = async () => {
    if (!form.name.trim() || !form.modelId.trim()) {
      toast.error("Name and Model ID are required");
      return;
    }
    if (needsBaseUrl && !form.baseUrl.trim()) {
      toast.error("Base URL is required for OpenAI-compatible providers");
      return;
    }
    setSaving(true);
    try {
      const { db } = await getDb();
      const payload = {
        name: form.name.trim(),
        providerType: form.providerType,
        baseUrl: needsBaseUrl ? form.baseUrl.trim() : form.baseUrl.trim() || "",
        apiKey: form.apiKey.trim() || null,
        modelId: form.modelId.trim(),
        isDefault: form.isDefault,
      };
      if (editing) {
        await updateAiProvider(db, editing, payload);
        toast.success("Provider updated");
      } else {
        await createAiProvider(db, payload);
        toast.success("Provider added");
      }
      setDialogOpen(false);
      resetForm();
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save provider");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this provider?")) return;
    try {
      const { db } = await getDb();
      await deleteAiProvider(db, id);
      toast.success("Provider deleted");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const handleEdit = (p: (typeof providers)[number]) => {
    setForm({
      name: p.name,
      providerType: (p.providerType as any) || "openai-compatible",
      baseUrl: p.baseUrl,
      apiKey: p.apiKey ?? "",
      modelId: p.modelId,
      isDefault: p.isDefault,
    });
    setEditing(p.id);
    setFetchedModels([]);
    setDialogOpen(true);
  };

  const fetchAvailableModels = async () => {
    if (!form.apiKey.trim()) {
      toast.error("API Key is required to fetch models");
      return;
    }
    if (needsBaseUrl && !form.baseUrl.trim()) {
      toast.error("Base URL is required to fetch models");
      return;
    }
    setFetchingModels(true);
    setFetchedModels([]);
    try {
      let models: string[] = [];
      if (form.providerType === "google") {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(form.apiKey.trim())}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Google API error: ${res.status}`);
        const data = await res.json();
        models = (data.models ?? [])
          .map((m: any) => m.name?.replace(/^models\//, ""))
          .filter((id: string) => id && id.startsWith("gemini"));
      } else if (form.providerType === "anthropic") {
        const url = "https://api.anthropic.com/v1/models";
        const res = await fetch(url, {
          headers: {
            "x-api-key": form.apiKey.trim(),
            "anthropic-version": "2023-06-01",
          },
        });
        if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
        const data = await res.json();
        models = (data.data ?? []).map((m: any) => m.id);
      } else {
        const url = `${form.baseUrl.replace(/\/$/, "")}/models`;
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${form.apiKey.trim()}`,
          },
        });
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        models = (data.data ?? []).map((m: any) => m.id);
      }
      setFetchedModels(models);
      if (models.length === 0) {
        toast.info("No models found");
      } else {
        toast.success(`Loaded ${models.length} models`);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to fetch models");
    } finally {
      setFetchingModels(false);
    }
  };

  return (
    <Boxed className="py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Factory</h1>
          <p className="mt-1 text-muted-foreground">
            Configure AI providers, generate, import and export flashcards
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/factory/generate">
              <RiMagicLine className="mr-2 h-4 w-4" />
              Generate Cards
            </Link>
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <RiAddLine className="mr-2 h-4 w-4" />
                Add Provider
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Provider" : "Add Provider"}</DialogTitle>
                <DialogDescription>
                  Configure an AI provider for card generation.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="providerType">Provider Type</Label>
                  <Select
                    value={form.providerType}
                    onValueChange={(v) => {
                      const type = v as typeof form.providerType;
                      setForm({
                        ...form,
                        providerType: type,
                        baseUrl: DEFAULT_BASE_URLS[type],
                      });
                      setFetchedModels([]);
                    }}
                  >
                    <SelectTrigger id="providerType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROVIDER_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Display Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g. OpenAI, Google, Ollama"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>

                {needsBaseUrl && (
                  <div className="space-y-2">
                    <Label htmlFor="baseUrl">Base URL</Label>
                    <Input
                      id="baseUrl"
                      placeholder="https://api.openai.com/v1"
                      value={form.baseUrl}
                      onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      The OpenAI-compatible chat completions endpoint base URL.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="apiKey">API Key</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    placeholder={form.providerType === "google" ? "AIzaSy..." : form.providerType === "anthropic" ? "sk-ant-..." : "sk-..."}
                    value={form.apiKey}
                    onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="modelId">Model ID</Label>
                    <div className="flex items-center gap-2">
                      {fetchedModels.length === 0 && MODEL_SUGGESTIONS[form.providerType] && (
                        <div className="flex flex-wrap gap-1">
                          {MODEL_SUGGESTIONS[form.providerType].map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setForm({ ...form, modelId: m })}
                              className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={fetchAvailableModels}
                        disabled={fetchingModels || !form.apiKey.trim() || (needsBaseUrl && !form.baseUrl.trim())}
                      >
                        {fetchingModels ? "Loading..." : "Load models"}
                      </Button>
                    </div>
                  </div>
                  {fetchedModels.length > 0 ? (
                    <Select
                      value={form.modelId}
                      onValueChange={(v) => setForm({ ...form, modelId: v })}
                    >
                      <SelectTrigger id="modelId">
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {fetchedModels.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="modelId"
                      placeholder="e.g. gpt-4o-mini"
                      value={form.modelId}
                      onChange={(e) => setForm({ ...form, modelId: e.target.value })}
                    />
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="isDefault"
                    checked={form.isDefault}
                    onCheckedChange={(checked) => setForm({ ...form, isDefault: checked === true })}
                  />
                  <Label htmlFor="isDefault">Set as default provider</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : editing ? "Update" : "Add"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : providers.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <RiMagicLine className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-4 text-muted-foreground">
              No AI providers configured. Add a provider to start generating cards.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {providers.map((provider) => (
            <Card key={provider.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      {provider.name}
                      {provider.isDefault && (
                        <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          Default
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1">{provider.modelId}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-3 flex flex-wrap gap-1">
                  <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {(provider.providerType ?? "openai-compatible").replace("-", " ")}
                  </span>
                </div>
                <p className="mb-3 truncate text-sm text-muted-foreground">
                  {provider.baseUrl || "—"}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleEdit(provider)}>
                    <RiEditLine className="mr-1 h-4 w-4" />
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDelete(provider.id)}>
                    <RiDeleteBinLine className="mr-1 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Boxed>
  );
}
