import { eq, asc } from 'drizzle-orm';
import * as schema from '@/db/schema';
import type { Db } from './types';

export async function createAiProvider(
  db: Db,
  data: {
    name: string;
    providerType?: 'openai-compatible' | 'google' | 'anthropic';
    baseUrl: string;
    apiKey?: string | null;
    modelId: string;
    isDefault?: boolean;
  },
) {
  // If setting as default, unset all others
  if (data.isDefault) {
    await db
      .update(schema.aiProviders)
      .set({ isDefault: false })
      .where(eq(schema.aiProviders.isDefault, true));
  }

  const [provider] = await db
    .insert(schema.aiProviders)
    .values({
      name: data.name,
      providerType: data.providerType ?? 'openai-compatible',
      baseUrl: data.baseUrl,
      apiKey: data.apiKey ?? null,
      modelId: data.modelId,
      isDefault: data.isDefault ?? false,
    })
    .returning();
  return provider ?? null;
}

export async function updateAiProvider(
  db: Db,
  id: number,
  data: {
    name?: string;
    providerType?: 'openai-compatible' | 'google' | 'anthropic';
    baseUrl?: string;
    apiKey?: string | null;
    modelId?: string;
    isDefault?: boolean;
  },
) {
  if (data.isDefault) {
    await db
      .update(schema.aiProviders)
      .set({ isDefault: false })
      .where(eq(schema.aiProviders.isDefault, true));
  }

  await db
    .update(schema.aiProviders)
    .set(data)
    .where(eq(schema.aiProviders.id, id));
}

export async function deleteAiProvider(db: Db, id: number) {
  await db.delete(schema.aiProviders).where(eq(schema.aiProviders.id, id));
}

export async function getAllAiProviders(db: Db) {
  return db
    .select()
    .from(schema.aiProviders)
    .orderBy(asc(schema.aiProviders.createdAt));
}

export async function getDefaultAiProvider(db: Db) {
  const [provider] = await db
    .select()
    .from(schema.aiProviders)
    .where(eq(schema.aiProviders.isDefault, true))
    .limit(1);
  return provider ?? null;
}
