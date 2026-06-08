# 04 — Settings Page Plan

> Consolidate all app settings (database stats/nuke, about, theme/relay preferences, device sync) into a single `/settings` route with tabbed navigation, and clean up the top navbar by removing the standalone sync icon.

## Conventions

- **Conventional Commits only** — every commit message must follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`. Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. No exceptions.

## Research Summary

| Area | Details |
|------|---------|
| **Routing** | Next.js App Router. Route group `(main)` in `src/app/(main)/` provides shared `Navbar` + `Footer` layout via `layout.tsx`. Sub-pages (study-dome, factory, exchange-center) each have their own sub-nav components. |
| **Navbar** | `src/components/navbar.tsx` — top sticky bar with desktop nav links (Study Dome, Factory, Exchange Center, Sync icon) and `<ModeToggle />`. Mobile uses `MobileNav` sheet drawer with the same links plus a theme toggle at the bottom. |
| **Existing sync page** | `src/app/(main)/sync/page.tsx` — full page with BIP39 mnemonic key management, sync status indicator, progress bars. Uses `useSync()` hook from `src/hooks/use-sync.ts`. |
| **Theme** | `next-themes` v0.4.6 with `ThemeProvider` in root layout (`src/app/layout.tsx`). `ModeToggle` component (`src/components/mode-toggle.tsx`) provides light/dark/system dropdown. Config: `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`. |
| **DB** | Client-side SQLite via `sql.js` persisted to IndexedDB. `getDb()` from `src/db/index.ts` initializes and returns `{ db, sqlDb }`. `nukeDb()` clears everything. `persistNow()` forces IndexedDB save. `exportFullSnapshot()` in `src/lib/sync-serialize.ts` exports all tables. |
| **Services** | `src/lib/services/` exports typed Drizzle queries: `getAllBundles`, `getAllCards`, `getAllExams`, `getAllTags`, `getTagStats`, etc. Type `Db = SQLJsDatabase<typeof schema>`. |
| **Relay URL** | Hard-coded as `process.env.NEXT_PUBLIC_RELAY_URL ?? "ws://localhost:8080/ws"` in `src/hooks/use-sync-signaling.ts:21` and `src/hooks/use-signaling.ts:21`. Not configurable at runtime. Default production relay should be `wss://r.toolbox.study/ws`. |
| **UI components** | shadcn/ui under `src/components/ui/`: tabs, dialog, button, input, badge, card, progress, select, separator, tooltip, etc. Uses `radix-ui` v1.4.3 primitives with `@remixicon/react` for icons. |
| **Boxed component** | `src/components/boxed.tsx` — max-width wrapper (`max-w-7xl mx-auto px-4 md:px-8`). Used on every page. |
| **sub-nav pattern** | Each applet has a `_components/xxx-nav.tsx` that renders a horizontal tab bar with `usePathname()` active highlighting (e.g. `StudyDomeNav`, `FactoryNav`, `ExchangeCenterNav`). |
| **Package version** | `"version": "0.1.0"` in `package.json`. Can be imported at build time via `process.env.NEXT_PUBLIC_APP_VERSION` or read from `package.json`. |
| **License** | EUPL v1.2 in `LICENSE` file. |
| **Env vars** | `NEXT_PUBLIC_RELAY_URL`, `NEXT_PUBLIC_GEMINI_UQF_GEM`, `NEXT_PUBLIC_GEMINI_JSON_GEM` — read at build time. Gemini Gem links shown conditionally on the factory import page. |

---

## Phase 1 — Settings Stats Service

### Task 1.1: Create DB stats service
**What**: Add a `getStats()` function to `src/lib/services/stats.ts` that queries the DB for counts of all major entities and computes approximate DB size.
**Files**: `src/lib/services/stats.ts`, `src/lib/services/index.ts`
**API reference**: Existing service pattern from `src/lib/services/card.ts` — all services take `(db: Db)` as first arg and use `schema.*` tables. `Db` type from `src/lib/services/types.ts`.
**Implementation notes**:
- Create `src/lib/services/stats.ts` with:
  ```ts
  import { sql } from 'drizzle-orm';
  import * as schema from '@/db/schema';
  import type { Db } from './types';

  export type AppStats = {
    cards: number;
    bundles: number;
    tags: number;
    exams: number;
    examAttempts: number;
    reviewLogs: number;
    aiProviders: number;
    dbSizeKB: number | null; // approximate IndexedDB size, null if not measurable
  };

  export async function getStats(db: Db): Promise<AppStats> { ... }
  ```
- Use `db.select({ count: sql<number>\`count(*)\` }).from(schema.cards)` style for each table count.
- For `dbSizeKB`, use the `sqlDb.export()` approach: get `{ sqlDb }` from `getDb()` and compute `sqlDb.export().byteLength / 1024`. This should be computed client-side since `getDb()` is async.
- Re-export from `src/lib/services/index.ts`: add `export { getStats } from './stats';` and `export type { AppStats } from './stats';`.
**Tests**: `src/__tests__/stats.test.ts`
- Test that `getStats` returns correct counts when DB is empty (all zeros).
- Test that `getStats` returns correct counts after inserting some cards and bundles.
**Commit**: `feat(settings): add DB stats service`

---

## Phase 2 — Relay Hostname Preference

### Task 2.1: Create relay URL preference module
**What**: Create `src/lib/relay-prefs.ts` that stores/retrieves the relay hostname in `localStorage`, with a default of `r.toolbox.study`. The signaling hooks should read from this module instead of hard-coding the URL.
**Files**: `src/lib/relay-prefs.ts`, `src/hooks/use-sync-signaling.ts`, `src/hooks/use-signaling.ts`
**Implementation notes**:
- Create `src/lib/relay-prefs.ts`:
  ```ts
  const RELAY_HOSTNAME_KEY = 'relay-hostname';
  const DEFAULT_RELAY_HOSTNAME = 'r.toolbox.study';

  export function loadRelayHostname(): string {
    if (typeof window === 'undefined') return DEFAULT_RELAY_HOSTNAME;
    return localStorage.getItem(RELAY_HOSTNAME_KEY) || DEFAULT_RELAY_HOSTNAME;
  }

  export function storeRelayHostname(hostname: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(RELAY_HOSTNAME_KEY, hostname);
  }

  export function buildRelayUrl(hostname: string): string {
    const protocol = hostname === 'localhost' || hostname === '127.0.0.1' ? 'ws' : 'wss';
    return `${protocol}://${hostname}/ws`;
  }
  ```
- Update `src/hooks/use-sync-signaling.ts`: Replace the hard-coded `WS_URL` const with a function that calls `loadRelayHostname()` → `buildRelayUrl()`. Since `WS_URL` is used inside hook callbacks, compute it lazily:
  ```ts
  function getRelayUrl(): string {
    const hostname = loadRelayHostname();
    return buildRelayUrl(hostname);
  }
  ```
  Then in the `connect` callback, use `const ws = new WebSocket(getRelayUrl());` instead of `new WebSocket(WS_URL)`.
- Update `src/hooks/use-signaling.ts` the same way.
- Keep the `NEXT_PUBLIC_RELAY_URL` env var as an override: if `process.env.NEXT_PUBLIC_RELAY_URL` is set, use it directly without going through `relay-prefs.ts`. This preserves backward compatibility for self-hosted instances.
**Tests**: `src/__tests__/relay-prefs.test.ts`
- Test `loadRelayHostname` returns default when localStorage is empty.
- Test `storeRelayHostname` then `loadRelayHostname` returns stored value.
- Test `buildRelayUrl` produces `wss://r.toolbox.study/ws` for the default hostname.
- Test `buildRelayUrl` produces `ws://localhost/ws` for `localhost`.
**Commit**: `feat(settings): add relay hostname preference with localStorage persistence`

---

## Phase 3 — Settings Page Routes & Navigation

### Task 3.1: Create settings page route with tabbed layout
**What**: Create the `/settings` route under `src/app/(main)/settings/` with a `SettingsNav` sub-component and a `page.tsx` that renders a tabbed layout using Radix Tabs. Add a `SettingsProvider` context to share stats across tabs.
**Files**:
- `src/app/(main)/settings/page.tsx`
- `src/app/(main)/settings/_components/settings-nav.tsx`
- `src/app/(main)/settings/_components/settings-provider.tsx`

**Implementation notes**:
- Follow the sub-nav pattern from `StudyDomeNav` but use a vertical sidebar on desktop (like a settings panel) and the horizontal tab pattern on mobile. However, since the existing codebase uses horizontal tab navigation and the `Boxed` component for max-width, stay consistent and use the same pattern — a horizontal tab bar under the page header.
- The `SettingsProvider` should:
  - Call `getDb()` on mount and fetch stats via `getStats()`.
  - Store stats in state, re-fetch on demand (e.g., after nuking DB).
  - Expose `stats`, `loading`, `refetchStats()`, `nukeDb()`.
- `page.tsx` should be a `"use client"` component that renders:
  ```tsx
  <SettingsProvider>
    <Boxed className="py-8 md:py-12">
      <h1>Settings</h1>
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="syncing">Syncing</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
        </TabsList>
        <TabsContent value="general"><GeneralTab /></TabsContent>
        <TabsContent value="preferences"><PreferencesTab /></TabsContent>
        <TabsContent value="syncing"><SyncingTab /></TabsContent>
        <TabsContent value="about"><AboutTab /></TabsContent>
      </Tabs>
    </Boxed>
  </SettingsProvider>
  ```
- Use `@remixicon/react` icons: `RiSettings3Line` for settings, `RiDatabase2Line` for general, `RiPaintBrushLine` for preferences, `RiLoopLeftLine` for syncing, `RiInformationLine` for about.
**Commit**: `feat(settings): create settings page with tabbed layout`

### Task 3.2: Update navbar to link to settings instead of sync
**What**: Replace the standalone sync icon link in the navbar with a settings gear icon that links to `/settings`. Remove the "Sync" text link from desktop nav and mobile nav. Add a "Settings" link instead.
**Files**: `src/components/navbar.tsx`, `src/components/mobile-nav.tsx`
**Implementation notes**:
- In `navbar.tsx`: Replace the `<Link href="/sync">` block with:
  ```tsx
  <Link href="/settings" className="text-muted-foreground transition-colors hover:text-foreground" aria-label="Settings">
    <RiSettings3Line className="h-5 w-5" />
  </Link>
  ```
- In `mobile-nav.tsx`: Replace `{ label: "Sync", href: "/sync" }` in `navLinks` with `{ label: "Settings", href: "/settings" }`. Import `RiSettings3Line` isn't needed here since the mobile nav just shows text labels.
**Tests**: No unit tests needed for simple link changes. E2E tests will cover navigation later.
**Commit**: `feat(settings): add settings link to navbar, remove standalone sync link`

### Task 3.3: Remove or redirect the old `/sync` route
**What**: Replace the `/sync` page content with a redirect to `/settings` (syncing tab). Keep the file to avoid 404s for anyone with a bookmarked URL.
**Files**: `src/app/(main)/sync/page.tsx`
**Implementation notes**:
- Replace the entire page with a Next.js redirect:
  ```tsx
  import { redirect } from 'next/navigation';
  export default function SyncPage() {
    redirect('/settings?tab=syncing');
  }
  ```
- This uses Next.js server-side redirect. The URL hash query approach ensures the syncing tab is auto-selected.
- Update the `SettingsProvider` and `page.tsx` to read the `tab` search param and set it as the default active tab.
**Commit**: `feat(settings): redirect /sync to /settings?tab=syncing`

---

## Phase 4 — General Tab (Stats & DB Management)

### Task 4.1: Implement GeneralTab component
**What**: Create the General settings tab showing DB stats (card count, bundle count, tag count, exam count, attempt count, review log count, DB size) and a "Nuke Database" button with a confirmation dialog.
**Files**: `src/app/(main)/settings/_components/general-tab.tsx`
**Implementation notes**:
- Use `useSettings()` context from `SettingsProvider` to access `stats`, `loading`, `nukeDb()`.
- Import `RiDeleteBinLine` from `@remixicon/react` for the nuke icon.
- Display stats in a grid of cards:
  ```tsx
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <StatCard icon={RiFileTextLine} label="Cards" value={stats.cards} />
    <StatCard icon={RiFolderLine} label="Bundles" value={stats.bundles} />
    <StatCard icon={RiPriceTag3Line} label="Tags" value={stats.tags} />
    <StatCard icon={RiFileListLine} label="Exams" value={stats.exams} />
    <StatCard icon={RiCheckDoubleLine} label="Exam Attempts" value={stats.examAttempts} />
    <StatCard icon={RiRefreshLine} label="Reviews" value={stats.reviewLogs} />
  </div>
  ```
- Stat cards should be rounded containers with an icon, label, and numeric value.
- Show DB size if available (`stats.dbSizeKB ? `${stats.dbSizeKB.toFixed(1)} KB` : '—'`).
- The nuke button should open a `Dialog` with a confirmation step. On confirm, call `nukeDb()` from `SettingsProvider` (which internally calls `nukeDb()` from `@/db` and then `window.location.reload()` to re-initialize).
- After nuking, show a success toast via `sonner`.
**Tests**: Manual testing suffices here (DB destruction is hard to unit test). E2E test will cover this in Phase 7.
**Commit**: `feat(settings): add general tab with DB stats and nuke button`

---

## Phase 5 — Preferences Tab (Theme & Relay)

### Task 5.1: Implement PreferencesTab component
**What**: Create the Preferences settings tab with a theme selector (light/dark/system) and a relay hostname input field.
**Files**: `src/app/(main)/settings/_components/preferences-tab.tsx`
**Implementation notes**:
- Import `useTheme` from `next-themes` for theme control. Currently it returns `{ theme, setTheme }`. The `ModeToggle` component already shows how to use it.
- Create a radio group or segmented control for theme: Light / Dark / System. Use the existing `RadioGroup` from `src/components/ui/radio-group.tsx` or the `Tabs` component styled as a selector.
- For relay hostname, use `Input` from `src/components/ui/input.tsx`. Load initial value via `loadRelayHostname()` from `src/lib/relay-prefs.ts`. On blur (or on explicit "Save" button), call `storeRelayHostname(value)`.
- Show a preview of the computed WebSocket URL next to the hostname input using `buildRelayUrl()`.
- Add a note: "Changes take effect on next sync connection."
**Tests**: `src/__tests__/relay-prefs.test.ts` already covers relay preference logic.
**Commit**: `feat(settings): add preferences tab with theme and relay settings`

---

## Phase 6 — About Tab & Syncing Tab

### Task 6.1: Implement AboutTab component
**What**: Create the About settings tab showing app name, version, license, links to GitHub/Discord, and links to the JSON import schema and Gemini Gems.
**Files**: `src/app/(main)/settings/_components/about-tab.tsx`
**Implementation notes**:
- Read version from `package.json` at build time. Create a small module `src/lib/version.ts` that exports:
  ```ts
  export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0';
  ```
  And add to `.env.example`: `NEXT_PUBLIC_APP_VERSION=` (empty = fallback to package.json).
- Display:
  - App name: "StudyToolbox"
  - Version: `APP_VERSION`
  - License: "EUPL v1.2" with link to `https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12`
  - Links section:
    - GitHub: `https://github.com/giuseppepascale/studytoolbox` (reuse from footer)
    - Discord: (TBD — add a placeholder `"https://discord.gg/..."` constant that can be updated later)
  - Resources section:
    - "JSON Import Schema" — link to the docs or the factory import page `/factory/import`
    - "Gemini UQF Gem" — conditionally shown if `process.env.NEXT_PUBLIC_GEMINI_UQF_GEM` is set
    - "Gemini JSON Gem" — conditionally shown if `process.env.NEXT_PUBLIC_GEMINI_JSON_GEM` is set
- Use the same card pattern as the General tab for visual consistency.
**Commit**: `feat(settings): add about tab with app info and links`

### Task 6.2: Implement SyncingTab component by extracting from existing sync page
**What**: Create the Syncing settings tab by migrating the content from `src/app/(main)/sync/page.tsx` into a reusable tab component. The logic stays the same; only the layout changes (no page-level heading, since the tab is inside the settings page).
**Files**: `src/app/(main)/settings/_components/syncing-tab.tsx`
**Implementation notes**:
- Extract the core UI from `src/app/(main)/sync/page.tsx` into `syncing-tab.tsx`.
- Remove the outer `<Boxed>` wrapper and the `<h1>` heading since those are handled by the settings page.
- Keep all imports: `useState`, `useCallback`, `useEffect`, `toast` from `sonner`, Remix icons, `Input`, `Button`, `Dialog`, `Progress`, `generateSyncKey`, `validateSyncKey`, `storeSyncKey`, `loadSyncKey`, `deleteSyncKey`, `loadLastSyncedAt`, `useSync`.
- The `WordDisplay` helper component can stay inside the tab file or be extracted to a shared component — keep it inline for simplicity.
- The page at `/sync` already redirects to `/settings?tab=syncing` (from Task 3.3).
**Commit**: `feat(settings): add syncing tab migrated from sync page`

---

## Phase 7 — Settings Provider & State Wiring

### Task 7.1: Implement SettingsProvider context
**What**: Create the `SettingsProvider` React context that loads DB stats, exposes nuke/reload, and shares state across tabs.
**Files**: `src/app/(main)/settings/_components/settings-provider.tsx`
**Implementation notes**:
- Create a React context:
  ```tsx
  "use client";
  import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
  import { getDb, nukeDb } from "@/db";
  import { getStats, type AppStats } from "@/lib/services";
  import { toast } from "sonner";

  type SettingsContextValue = {
    stats: AppStats | null;
    loading: boolean;
    refetchStats: () => Promise<void>;
    handleNukeDb: () => Promise<void>;
  };

  const SettingsContext = createContext<SettingsContextValue | null>(null);

  export function SettingsProvider({ children }: { children: ReactNode }) {
    const [stats, setStats] = useState<AppStats | null>(null);
    const [loading, setLoading] = useState(true);

    const loadStats = useCallback(async () => {
      setLoading(true);
      const { db, sqlDb } = await getDb();
      const s = await getStats(db);
      const byteLength = sqlDb.export().byteLength;
      setStats({ ...s, dbSizeKB: byteLength / 1024 });
      setLoading(false);
    }, []);

    useEffect(() => { loadStats(); }, [loadStats]);

    const handleNukeDb = useCallback(async () => {
      await nukeDb();
      window.location.reload();
    }, []);

    return (
      <SettingsContext.Provider value={{ stats, loading, refetchStats: loadStats, handleNukeDb }}>
        {children}
      </SettingsContext.Provider>
    );
  }

  export function useSettings() {
    const ctx = useContext(SettingsContext);
    if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
    return ctx;
  }
  ```
**Commit**: `feat(settings): add SettingsProvider context for shared state`

### Task 7.2: Wire SettingsProvider into settings page with tab param support
**What**: Update the settings `page.tsx` to use `SettingsProvider`, read the `tab` search param, and pass it to Tabs.
**Files**: `src/app/(main)/settings/page.tsx`
**Implementation notes**:
- The page must be `"use client"` to use `useSearchParams`.
- Use `useSearchParams()` from `next/navigation` to read `tab` param.
- Map tab param to Tabs value: `{ syncing: "syncing", preferences: "preferences", about: "about" }` defaulting to `"general"`.
- Wrap everything in `<SettingsProvider>`.
**Commit**: `feat(settings): wire SettingsProvider and search param tab selection`

---

## Phase 8 — Unit & Integration Tests

### Task 8.1: Unit tests for stats service
**What**: Write unit tests for `getStats()` using the in-memory DB pattern already in the project.
**Files**: `src/__tests__/stats.test.ts`
**Implementation notes**:
- Follow the existing test file patterns in `src/__tests__/sync-storage.test.ts` or `src/__tests__/sync-identity.test.ts` — though those don't use DB, look at how the project initializes DB.
- Since `getDb()` creates a real sql.js DB in the browser, and vitest runs in Node/jsdom, use `initSqlJs` directly and create a test DB.
- Actually, checking the vitest config — the project uses jsdom. For unit tests, create a helper that initializes sql.js + drizzle in-memory for testing.
- Test cases:
  - Empty DB returns all zeros.
  - After `createCard(db, ...)` → `getStats(db).cards` increments.
  - After `createBundle(db, ...)` → `getStats(db).bundles` increments.
**Commit**: `test(settings): add unit tests for stats service`

### Task 8.2: Unit tests for relay-prefs
**What**: Write unit tests for `loadRelayHostname`, `storeRelayHostname`, `buildRelayUrl`.
**Files**: `src/__tests__/relay-prefs.test.ts`
**Implementation notes**:
- Mock `localStorage` via jsdom (already available in vitest jsdom environment).
- Test the default value, stored value, and URL building logic.
**Commit**: `test(settings): add unit tests for relay preferences`

---

## Phase 9 — E2E Tests

### Task 9.1: E2E test for settings page navigation
**What**: Add Playwright E2E tests that navigate to the settings page, verify each tab renders, and verify the old `/sync` URL redirects.
**Files**: `e2e/settings.spec.ts`
**Implementation notes**:
- Follow the Playwright config pattern from the existing `e2e/` directory.
- Test scenarios:
  1. Navigate to `/settings` — verify "General" tab is active and stats are visible.
  2. Click each tab (Preferences, Syncing, About) — verify content renders.
  3. Navigate to `/settings?tab=syncing` — verify syncing tab is active.
  4. Navigate to `/sync` — verify redirect to `/settings?tab=syncing`.
  5. In General tab, verify stat cards are rendered (can be zeros on fresh DB).
  6. In Preferences tab, verify theme selector is present and relay hostname input is visible.
  7. In About tab, verify version number and links are present.
**Commit**: `test(settings): add E2E tests for settings page`

---

## Phase 10 — Documentation & Polish

### Task 10.1: Update AGENTS.md with settings architecture
**What**: Add a brief entry to AGENTS.md about the settings page architecture.
**Files**: `AGENTS.md`
**Implementation notes**:
- Add under "Key directories":
  ```
  | `src/app/(main)/settings/` | Settings page (stats, preferences, syncing, about) |
  | `src/app/(main)/settings/_components/` | Settings sub-components (tabs, provider) |
  ```
- Add a note about `src/lib/relay-prefs.ts` and `src/lib/services/stats.ts`.
**Commit**: `docs: update AGENTS.md with settings page architecture`

### Task 10.2: Final lint, typecheck, and test pass
**What**: Run `pnpm lint`, `pnpm typecheck`, `pnpm test` in sequence and fix any issues.
**Files**: None (fix issues in existing files)
**Commit**: `chore: fix lint/typecheck/test issues`

---

## Execution Checklist

- [x] License already exists (EUPL v1.2) — no Phase 0 Task 0.1 needed
- [x] Docker/CI skipped per user request — no Phase 0 Task 0.4 needed
- [x] Research phase completed with real tool output
- [x] Every library reference traces to codebase analysis (next-themes, radix-ui, shadcn/ui, remixicon, sonner)
- [x] Every task has a `**Tests**` subsection (except pure scaffolding Tasks 3.1, 3.2, 3.3, 5.1, 6.1, 6.2, 7.1, 7.2)
- [x] E2E testing phase exists with concrete scenarios (Task 9.1)
- [x] Every task ends with a `**Commit**` line
- [x] README unchanged (no changes needed)
- [x] All docs and images under `docs/` (no new docs/images needed)
- [x] `pnpm dlx` not used (not applicable for this feature)
- [x] Skills installed: none needed for this feature