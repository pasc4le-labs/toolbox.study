"use client";

import { useEffect } from "react";
import { eq, inArray } from "drizzle-orm";
import { getDb, nukeDb } from "@/db";
import * as schema from "@/db/schema";

/**
 * Exposes database helpers for E2E testing in development mode.
 */
export function DbReset() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      (window as unknown as Record<string, unknown>).__nukeDb = nukeDb;

      // Expose DB access for E2E tests
      (window as unknown as Record<string, unknown>).__getDb = getDb;

      // Expose FSRS state reader for E2E tests
      (window as unknown as Record<string, unknown>).__getFsrsStates = async (cardIds: number[]) => {
        const { db } = await getDb();
        const rows = await db
          .select()
          .from(schema.cardFsrs)
          .where(inArray(schema.cardFsrs.cardId, cardIds));
        return rows.map((r) => ({
          cardId: r.cardId,
          state: r.state,
          due: r.due,
          stability: r.stability,
          difficulty: r.difficulty,
          reps: r.reps,
          lapses: r.lapses,
        }));
      };

      // Expose exam attempt answers with FSRS states for E2E tests
      (window as unknown as Record<string, unknown>).__getAttemptResults = async (attemptId: number) => {
        const { db } = await getDb();
        const answers = await db
          .select()
          .from(schema.examAnswers)
          .where(eq(schema.examAnswers.attemptId, attemptId));

        const cardIds = answers.map((a) => a.cardId);
        const fsrsRows = cardIds.length > 0
          ? await db
              .select()
              .from(schema.cardFsrs)
              .where(inArray(schema.cardFsrs.cardId, cardIds))
          : [];

        return {
          answers: answers.map((a) => ({
            id: a.id,
            cardId: a.cardId,
            isCorrect: a.isCorrect,
          })),
          fsrsStates: fsrsRows.map((r) => ({
            cardId: r.cardId,
            state: r.state,
            due: r.due,
            stability: r.stability,
            difficulty: r.difficulty,
            reps: r.reps,
            lapses: r.lapses,
          })),
        };
      };
    }
  }, []);

  return null;
}
