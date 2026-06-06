import { createCard } from "@/lib/services/card";
import { createTag, getOrCreateTag } from "@/lib/services/tag";
import { createBundle } from "@/lib/services/bundle";
import { createExam } from "@/lib/services/exam";
import { createAiProvider } from "@/lib/services/ai-provider";
import type { Db } from "@/lib/services/types";
import type { Card } from "@/db/schema";

export interface SeedCardOverrides {
  type?: "multi_radio" | "multi_select" | "open" | "knowledge";
  front?: string;
  back?: string;
  explanation?: string | null;
  options?: string[] | null;
  correctIndices?: number[] | null;
  tagIds?: number[];
  bundleIds?: number[];
}

export async function seedCard(
  db: Db,
  overrides: SeedCardOverrides = {},
): Promise<Card> {
  return createCard(db, {
    type: overrides.type ?? "knowledge",
    front: overrides.front ?? "Test question",
    back: overrides.back ?? "Test answer",
    explanation: overrides.explanation ?? null,
    options: overrides.options ?? null,
    correctIndices: overrides.correctIndices ?? null,
    tagIds: overrides.tagIds,
    bundleIds: overrides.bundleIds,
  });
}

export async function seedTag(db: Db, name = "test-tag") {
  return createTag(db, name);
}

export async function seedOrGetTag(db: Db, name = "test-tag") {
  return getOrCreateTag(db, name);
}

export async function seedBundle(
  db: Db,
  title = "Test Bundle",
  description: string | null = null,
) {
  return createBundle(db, { title, description });
}

export interface SeedExamOverrides {
  title?: string;
  questionCount?: number;
  timeLimitSeconds?: number | null;
  difficultyFilter?: number | null;
  pointsPerCorrect?: number;
  pointsPerWrong?: number;
}

export async function seedExam(
  db: Db,
  bundleId: number,
  overrides: SeedExamOverrides = {},
) {
  return createExam(db, {
    title: overrides.title ?? "Test Exam",
    bundleId,
    questionCount: overrides.questionCount ?? 5,
    timeLimitSeconds: overrides.timeLimitSeconds,
    difficultyFilter: overrides.difficultyFilter,
    pointsPerCorrect: overrides.pointsPerCorrect,
    pointsPerWrong: overrides.pointsPerWrong,
  });
}

export interface SeedAiProviderOverrides {
  name?: string;
  providerType?: "openai-compatible" | "google" | "anthropic";
  baseUrl?: string;
  apiKey?: string | null;
  modelId?: string;
  isDefault?: boolean;
}

export async function seedAiProvider(
  db: Db,
  overrides: SeedAiProviderOverrides = {},
) {
  return createAiProvider(db, {
    name: overrides.name ?? "Test Provider",
    providerType: overrides.providerType ?? "openai-compatible",
    baseUrl: overrides.baseUrl ?? "https://api.example.com/v1",
    apiKey: overrides.apiKey ?? null,
    modelId: overrides.modelId ?? "test-model",
    isDefault: overrides.isDefault ?? false,
  });
}
