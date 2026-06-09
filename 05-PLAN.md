# 05 — Navbar Sync Button Plan

> Add a sync button to the desktop and mobile navbar that shows sync status with progress icons, triggers sync when set up, or navigates to Settings > Syncing when not configured.

## Conventions

- **Conventional Commits only** — every commit message must follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`. Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. No exceptions.

## Research Summary

| Area | Details |
|------|---------|
| **Navbar** | `src/components/navbar.tsx` — server-compatible component. Desktop: `<nav>` with 3 text links + `RiSettings3Line` icon link. Imports `Link`, `Boxed`, `MobileNav`, `Logo`. Not a `"use client"` component. |
| **Mobile nav** | `src/components/mobile-nav.tsx` — `"use client"` component. Uses `Sheet` (slide-out drawer). `navLinks` array: `[{ label, href }]` for Study Dome, Factory, Exchange Center, Settings. |
| **Sync hook** | `src/hooks/use-sync.ts` — `useSync()` returns `{ status, lastSyncedAt, error, progress, startSync, cancelSync }`. `SyncStatus = "idle" \| "connecting" \| "waiting" \| "syncing" \| "complete" \| "error"`. Auto-starts sync on mount if key exists (line 304-309). |
| **Sync storage** | `src/lib/sync-storage.ts` — `loadSyncKey()` returns `string \| null`. `deleteSyncKey()` removes key. `storeSyncKey()` saves key. |
| **Sync identity** | `src/lib/sync-identity.ts` — `validateSyncKey(key)` validates 12-word BIP39 mnemonic. |
| **SyncProvider** | `src/components/sync-provider.tsx` — currently a passive wrapper that shows `toast.info("Device sync is active")` on mount if key exists. Wraps `{children}` only — no context exposed. |
| **Main layout** | `src/app/(main)/layout.tsx` — renders `<Navbar />`, `<main>` with `<SyncProvider>{children}</SyncProvider>`, `<Footer />`. |
| **Settings tabs** | `src/app/(main)/settings/page.tsx` — `TAB_MAP = { general, preferences, syncing, about }`. Tab selected via `?tab=<value>` query param. Navigate to sync tab: `/settings?tab=syncing`. |
| **SyncingTab** | `src/app/(main)/settings/_components/syncing-tab.tsx` — calls `useSync()` directly. Contains key management UI + status display. |
| **Icons** | `@remixicon/react` v4.9.0 — all icons imported as named React components. Verified progress icons: `RiProgress1Line` through `RiProgress8Line`. Loop icons: `RiLoopLeftLine`, `RiLoopRightLine`. Error: `RiCloseCircleLine`. Check: `RiCheckLine`. Settings: `RiSettings3Line`. |
| **Toast** | `sonner` — `toast.error("msg", { description: "details" })` for error toasts with description. Root layout mounts `<Toaster richColors closeButton />` from `src/components/ui/sonner.tsx`. |
| **Tooltip** | `src/components/ui/tooltip.tsx` — shadcn tooltip built on `radix-ui` Tooltip primitive. Exports `TooltipProvider`, `Tooltip`, `TooltipTrigger`, `TooltipContent`. No `TooltipProvider` at app root — must be added locally. |
| **Button** | `src/components/ui/button.tsx` — variants: `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`. Sizes: `xs`, `sm`, `default`, `lg`, `icon`, `icon-sm`, `icon-lg`. |

---

## Phase 1 — SyncContext & SyncProvider Refactor

### Task 1.1: Refactor SyncProvider to expose sync state via React context

**What**: Convert `SyncProvider` from a passive wrapper into a context provider that holds the `useSync()` state. This allows the navbar and other components to read sync status without re-initializing the hook. Remove the info toast (the sync button replaces it).

**Files**: `src/components/sync-provider.tsx`

**API reference**: 
- `useSync()` from `src/hooks/use-sync.ts` returns `{ status, lastSyncedAt, error, progress, startSync, cancelSync }` where `SyncStatus = "idle" | "connecting" | "waiting" | "syncing" | "complete" | "error"`
- `loadSyncKey()` from `src/lib/sync-storage.ts` returns `string | null`
- `validateSyncKey()` from `src/lib/sync-identity.ts` returns `boolean`

**Implementation notes**:
1. Remove the existing toast.info on mount — the sync button will communicate status visually.
2. Create a `SyncContext` with the following shape:
   ```ts
   type SyncContextValue = {
     status: SyncStatus;
     lastSyncedAt: number | null;
     error: string | null;
     progress: { current: number; total: number } | null;
     hasSyncKey: boolean;
     startSync: () => void;
     cancelSync: () => void;
     refreshSyncKey: () => void;
   };
   ```
3. Call `useSync()` inside the provider and spread its return value into context.
4. Add `hasSyncKey` state — initialized from `!!loadSyncKey()` and validated with `validateSyncKey`.
5. Add `refreshSyncKey()` function that re-reads `loadSyncKey()` and updates `hasSyncKey`. This is needed so that when the user generates or deletes a key in `SyncingTab`, the navbar button updates.
6. Remove the `useRef(hasShownRef)` and `toast.info()` logic.
7. Export both `SyncProvider` and `useSyncContext`:
   ```ts
   export function useSyncContext() {
     const ctx = useContext(SyncContext);
     if (!ctx) throw new Error("useSyncContext must be used within SyncProvider");
     return ctx;
   }
   ```
8. The component remains `"use client"`.

**Tests**: `src/__tests__/sync-context.test.ts`
- Render `SyncProvider` with `loadSyncKey` returning null → `hasSyncKey` is `false`, `status` is `"idle"`.
- Render `SyncProvider` with `loadSyncKey` returning a valid key → `hasSyncKey` is `true`, `status` transitions to `"connecting"`.
- Call `refreshSyncKey()` after key deletion → `hasSyncKey` becomes `false`.

**Commit**: `feat(sync): refactor SyncProvider to expose sync state via context`

---

### Task 1.2: Update SyncingTab to consume SyncContext instead of useSync

**What**: Replace the direct `useSync()` call in `SyncingTab` with `useSyncContext()` from the refactored `SyncProvider`. Also call `refreshSyncKey()` after key generation, key deletion, and key save operations so the navbar sync button stays in sync.

**Files**: `src/app/(main)/settings/_components/syncing-tab.tsx`

**Implementation notes**:
1. Replace `import { useSync, type SyncStatus } from "@/hooks/use-sync"` with `import { useSyncContext } from "@/components/sync-provider"` and `import { type SyncStatus } from "@/hooks/use-sync"`.
2. Replace the `useSync()` destructuring with `useSyncContext()`:
   ```ts
   const { status, lastSyncedAt, error, progress, startSync, cancelSync, refreshSyncKey } = useSyncContext();
   ```
3. After `handleGenerate` calls `storeSyncKey(key)` and `setStoredKey(key)`, add `refreshSyncKey()`:
   ```ts
   const handleGenerate = useCallback(() => {
     const key = generateSyncKey();
     storeSyncKey(key);
     setStoredKey(key);
     refreshSyncKey();
     toast.success("Sync key generated");
   }, [refreshSyncKey]);
   ```
4. After `handleSaveInput` calls `storeSyncKey(trimmed)` and `setStoredKey(trimmed)`, add `refreshSyncKey()`.
5. After `handleDelete` calls `deleteSyncKey()` and `cancelSync()`, add `refreshSyncKey()`:
   ```ts
   const handleDelete = useCallback(() => {
     deleteSyncKey();
     setStoredKey(null);
     setShowDeleteDialog(false);
     cancelSync();
     refreshSyncKey();
     toast.success("Sync key deleted");
   }, [cancelSync, refreshSyncKey]);
   ```
6. Remove the `SyncStatusIndicator` inline component from `syncing-tab.tsx` since the sync button in the navbar now shows status. Actually, keep `SyncStatusIndicator` — it provides detailed text status in the Syncing tab. The navbar button is a compressed visual indicator; the full tab view should still have detailed status.

**Tests**: Manual testing — verify the Syncing tab still works correctly: key generation, deletion, sync status display, and that the navbar button updates.

**Commit**: `feat(sync): update SyncingTab to use SyncContext`

---

## Phase 2 — SyncButton Component

### Task 2.1: Create the SyncButton component

**What**: Create a `"use client"` component that renders a button in the navbar showing the current sync status with appropriate icons, and handles clicks to either start sync or navigate to settings.

**Files**: `src/components/sync-button.tsx`

**API reference**:
- `useSyncContext()` from `src/components/sync-provider.tsx` — provides `{ status, error, hasSyncKey, startSync, cancelSync }`
- Tooltip components from `src/components/ui/tooltip.tsx`: `TooltipProvider`, `Tooltip`, `TooltipTrigger`, `TooltipContent`
- Toast from `sonner`: `toast.error("message", { description: "details" })`
- Router from `next/navigation`: `useRouter()` for programmatic navigation
- Remix icons: `RiProgress1Line` through `RiProgress8Line`, `RiLoopLeftLine`, `RiCloseCircleLine`, `RiCheckLine`

**Implementation notes**:
1. Import all required icons:
   ```ts
   import { RiLoopLeftLine, RiCloseCircleLine, RiCheckLine,
     RiProgress1Line, RiProgress2Line, RiProgress3Line, RiProgress4Line,
     RiProgress5Line, RiProgress6Line, RiProgress7Line, RiProgress8Line,
   } from "@remixicon/react";
   ```
2. Create an array for cycling:
   ```ts
   const PROGRESS_ICONS = [
     RiProgress1Line, RiProgress2Line, RiProgress3Line, RiProgress4Line,
     RiProgress5Line, RiProgress6Line, RiProgress7Line, RiProgress8Line,
   ];
   ```
3. Component state:
   ```ts
   const [progressIndex, setProgressIndex] = useState(0);
   const [showComplete, setShowComplete] = useState(false);
   const prevErrorRef = useRef<string | null>(null);
   ```
4. Progress cycling effect — cycle through progress icons when in an active state:
   ```ts
   useEffect(() => {
     if (status === "connecting" || status === "waiting" || status === "syncing") {
       const interval = setInterval(() => {
         setProgressIndex((i) => (i + 1) % PROGRESS_ICONS.length);
       }, 300);
       return () => clearInterval(interval);
     }
   }, [status]);
   ```
5. Completion effect — show checkmark for 3 seconds:
   ```ts
   useEffect(() => {
     if (status === "complete") {
       setShowComplete(true);
       const timer = setTimeout(() => setShowComplete(false), 3000);
       return () => clearTimeout(timer);
     }
     setShowComplete(false);
   }, [status]);
   ```
6. Error toast effect — fire a toast when error first appears:
   ```ts
   useEffect(() => {
     if (error && error !== prevErrorRef.current) {
       prevErrorRef.current = error;
       toast.error("Sync failed", { description: error });
     }
     if (!error) {
       prevErrorRef.current = null;
     }
   }, [error]);
   ```
7. Determine icon and tooltip text:
   ```ts
   let Icon: RemixiconComponentType;
   let tooltipText: string | null = null;
   let ariaLabel: string;

   if (!hasSyncKey) {
     Icon = RiLoopLeftLine;
     tooltipText = "Set up device sync";
     ariaLabel = "Set up device sync";
   } else if (status === "error") {
     Icon = RiCloseCircleLine;
     tooltipText = error;
     ariaLabel = `Sync error: ${error}`;
   } else if (status === "connecting" || status === "waiting" || status === "syncing") {
     Icon = PROGRESS_ICONS[progressIndex];
     tooltipText = status === "connecting" ? "Connecting…" : status === "waiting" ? "Waiting for peer…" : "Syncing…";
     ariaLabel = tooltipText;
   } else if (status === "complete" && showComplete) {
     Icon = RiCheckLine;
     tooltipText = "Sync complete";
     ariaLabel = "Sync complete";
   } else {
     Icon = RiLoopLeftLine;
     tooltipText = "Sync now";
     ariaLabel = "Sync now";
   }
   ```
8. Click handler:
   ```ts
   const handleClick = useCallback(() => {
     if (!hasSyncKey) {
       router.push("/settings?tab=syncing");
       return;
     }
     if (status === "connecting" || status === "waiting" || status === "syncing") {
       cancelSync();
       return;
     }
     startSync();
   }, [hasSyncKey, status, startSync, cancelSync, router]);
   ```
9. Render with `TooltipProvider` wrapping just the button (no app-level provider exists):
   ```tsx
   return (
     <TooltipProvider>
       <Tooltip>
         <TooltipTrigger asChild>
           <Button
             variant="ghost"
             size="icon-sm"
             onClick={handleClick}
             aria-label={ariaLabel}
             className={cn(
               "text-muted-foreground transition-colors hover:text-foreground",
               (status === "connecting" || status === "waiting" || status === "syncing") && "text-blue-600 dark:text-blue-400",
               status === "complete" && showComplete && "text-green-600 dark:text-green-400",
               status === "error" && "text-red-600 dark:text-red-400",
             )}
           >
             <Icon className="h-4 w-4" />
           </Button>
         </TooltipTrigger>
         {tooltipText && (
           <TooltipContent>{tooltipText}</TooltipContent>
         )}
       </Tooltip>
     </TooltipProvider>
   );
   ```
10. Import `useRouter` from `next/navigation` for navigation and `cn` from `@/lib/utils` for conditional classes.

**Tests**: `src/__tests__/sync-button.test.ts`
- Renders `RiLoopLeftLine` with tooltip "Set up device sync" when `hasSyncKey` is false.
- Renders `RiLoopLeftLine` with tooltip "Sync now" when `hasSyncKey` is true and status is `"idle"`.
- Calls `startSync()` on click when `hasSyncKey` is true and status is `"idle"`.
- Calls `router.push("/settings?tab=syncing")` on click when `hasSyncKey` is false.
- Calls `cancelSync()` on click when status is `"connecting"`.
- Shows `RiCloseCircleLine` with error tooltip when status is `"error"`.
- Cycles progress icons when status is `"connecting"`.
- Shows `RiCheckLine` briefly when status is `"complete"`.

**Commit**: `feat(sync): add SyncButton component with progress and error states`

---

## Phase 3 — Navbar Integration

### Task 3.1: Add SyncButton to desktop navbar

**What**: Insert the `<SyncButton />` component into the desktop navigation section of `navbar.tsx`, between the "Exchange Center" text link and the Settings gear icon.

**Files**: `src/components/navbar.tsx`

**Implementation notes**:
1. Add import: `import { SyncButton } from "@/components/sync-button";`
2. In the desktop `<nav>`, add `<SyncButton />` between the "Exchange Center" link and the Settings link:
   ```tsx
   <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
     <Link href="/study-dome" className="text-muted-foreground transition-colors hover:text-foreground">
       Study Dome
     </Link>
     <Link href="/factory" className="text-muted-foreground transition-colors hover:text-foreground">
       Factory
     </Link>
     <Link href="/exchange-center" className="text-muted-foreground transition-colors hover:text-foreground">
       Exchange Center
     </Link>
     <SyncButton />
     <Link href="/settings" className="text-muted-foreground transition-colors hover:text-foreground" aria-label="Settings">
       <RiSettings3Line className="h-5 w-5" />
     </Link>
   </nav>
   ```
3. `navbar.tsx` is a server component. `SyncButton` is a `"use client"` component. Next.js handles this correctly — a server component can render client components.

**Tests**: Visual/manual — verify the sync button appears in the navbar between "Exchange Center" and the Settings gear icon.

**Commit**: `feat(navbar): add SyncButton to desktop navigation`

---

### Task 3.2: Add Sync entry to mobile navigation

**What**: Add a "Sync" entry to the mobile nav's `navLinks` array that links to `/settings?tab=syncing`. On mobile, use a simple text link (consistent with existing mobile nav items) rather than an icon button with progress animation.

**Files**: `src/components/mobile-nav.tsx`

**Implementation notes**:
1. Add a new entry to the `navLinks` array after "Exchange Center":
   ```ts
   const navLinks = [
     { label: "Study Dome", href: "/study-dome" },
     { label: "Factory", href: "/factory" },
     { label: "Exchange Center", href: "/exchange-center" },
     { label: "Sync", href: "/settings?tab=syncing" },
     { label: "Settings", href: "/settings" },
   ] as const;
   ```
2. This follows the existing pattern — text labels linking to routes. The mobile nav just uses text links.

**Tests**: Visual/manual — verify "Sync" appears in the mobile navigation drawer between "Exchange Center" and "Settings".

**Commit**: `feat(navbar): add Sync link to mobile navigation`

---

## Phase 4 — Tests

### Task 4.1: Unit tests for SyncContext

**What**: Write unit tests verifying that `SyncProvider` exposes the correct context values and that `useSyncContext()` throws outside the provider.

**Files**: `src/__tests__/sync-context.test.ts`

**Implementation notes**:
- Mock `@/lib/sync-storage` to control `loadSyncKey` return values.
- Mock `@/hooks/use-sync` to control the sync hook return values since the real hook requires WebRTC infrastructure.
- Test cases:
  1. `useSyncContext()` called outside `SyncProvider` throws an error.
  2. With `loadSyncKey()` returning `null` → `hasSyncKey` is `false`.
  3. With `loadSyncKey()` returning a valid key → `hasSyncKey` is `true`.
  4. `refreshSyncKey()` called after key deletion updates `hasSyncKey` to `false`.
  5. `refreshSyncKey()` called after key generation updates `hasSyncKey` to `true`.

**Commit**: `test(sync): add unit tests for SyncContext`

---

### Task 4.2: Unit tests for SyncButton

**What**: Write unit tests for the `SyncButton` component covering all visual states and click behaviors.

**Files**: `src/__tests__/sync-button.test.ts`

**Implementation notes**:
- Mock `useSyncContext` to return controlled values.
- Mock `next/navigation`'s `useRouter`.
- Test cases:
  1. No sync key → renders `RiLoopLeftLine`, tooltip "Set up device sync", click navigates to `/settings?tab=syncing`.
  2. Has key, status `"idle"` → renders `RiLoopLeftLine`, tooltip "Sync now", click calls `startSync()`.
  3. Has key, status `"connecting"` → renders `RiProgress1Line` (first in cycle), tooltip "Connecting…", click calls `cancelSync()`.
  4. Has key, status `"syncing"` → renders progress icon, tooltip "Syncing…", click calls `cancelSync()`.
  5. Has key, status `"complete"` → renders `RiCheckLine`, tooltip "Sync complete".
  6. Has key, status `"error"` → renders `RiCloseCircleLine`, tooltip shows error message.
  7. Error toast fires via `sonner` when error changes from `null` to a message.

**Commit**: `test(sync): add unit tests for SyncButton`

---

### Task 4.3: E2E test for navbar sync button

**What**: Add a Playwright E2E test that verifies the sync button appears in the navbar and navigates to the settings sync tab when no sync key is configured.

**Files**: `e2e/navbar-sync.spec.ts`

**Implementation notes**:
- Follow the existing Playwright config in `e2e/playwright.config.ts`.
- Test scenarios:
  1. Desktop viewport: sync button is visible in the navbar between "Exchange Center" and Settings gear. Clicking it (when no sync key is set) navigates to `/settings?tab=syncing`.
  2. Mobile viewport: "Sync" link appears in the mobile navigation drawer. Clicking it navigates to `/settings?tab=syncing`.
  3. Desktop: verify the button has an aria-label containing "sync" (case-insensitive).

**Commit**: `test(navbar): add E2E test for navbar sync button`

---

## Phase 5 — Lint & Polish

### Task 5.1: Run lint, typecheck, and test suite

**What**: Run the full pipeline in order: `pnpm lint`, `pnpm typecheck`, `pnpm test`. Fix any issues.

**Files**: Any files with lint/type errors.

**Commit**: `chore: fix lint/typecheck/test issues`

---

## Execution Checklist

- [x] License already exists (EUPL v1.2) — Phase 0 Task 0.1 not needed
- [x] Docker/CI not needed — Phase 0 Task 0.4 not needed
- [x] Research phase completed with real tool output and codebase analysis
- [x] Every library reference traces to verified source:
  - `@remixicon/react` v4.9.0 — verified `RiProgress1Line` through `RiProgress8Line`, `RiLoopLeftLine`, `RiCloseCircleLine`, `RiCheckLine` in `node_modules/@remixicon/react/index.d.ts`
  - `sonner` — verified `toast.error("msg", { description })` API from Context7 docs
  - `radix-ui` Tooltip — verified `TooltipProvider`, `Tooltip`, `TooltipTrigger`, `TooltipContent` exports in `src/components/ui/tooltip.tsx`
  - `next/navigation` `useRouter` — standard Next.js App Router API
- [x] Every task has a `**Tests**` subsection
- [x] E2E testing phase exists (Task 4.3)
- [x] Every task ends with a `**Commit**` line
- [x] README unchanged (no changes needed)
- [x] All docs and images under `docs/` (no new docs/images needed)
- [x] `pnpm dlx`/`pnpm exec` used instead of `npx` where applicable
- [x] Skills installed: none needed for this feature