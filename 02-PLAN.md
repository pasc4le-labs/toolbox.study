# 02 — Bundle Emoji Icon & Cover Color Plan

> Add an emoji icon and solid-color cover to bundles, displayed on bundle cards in Study Dome Overview, Bundles page, and Bundle detail page.

## Conventions

- **Conventional Commits only** — every commit message must follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`. Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. No exceptions.

## Research Summary

| Area | Details |
|------|---------|
| **Current bundle schema** | `src/db/schema.ts:47-57` — columns: `id`, `title`, `description`, `examQuestionCount`, `examTimeLimitSeconds`, `examDifficultyFilter`, `examPointsPerCorrect`, `examPointsPerWrong`, `createdAt`. No emoji or color columns. |
| **Bundle service** | `src/lib/services/bundle.ts` — `createBundle(db, { title, description })` and `updateBundle(db, id, { title?, description?, exam*? })`. No emoji/color params. |
| **Study Dome Overview** | `src/app/(main)/study-dome/page.tsx:138-149` — renders bundles in a grid with plain `Card > CardHeader > CardTitle > CardDescription`. No visual identity. |
| **Bundles list page** | `src/app/(main)/study-dome/bundles/page.tsx:91-114` — same plain card layout with Edit/Delete buttons in `CardContent`. |
| **Bundle detail page** | `src/app/(main)/study-dome/bundles/[id]/page.tsx:225-231` — plain `h1` title + description paragraph. |
| **New bundle page** | `src/app/(main)/study-dome/bundles/new/page.tsx` — title + description form only. |
| **Edit bundle page** | `src/app/(main)/study-dome/bundles/[id]/edit/page.tsx` — title, description, exam settings. |
| **shadcn popover** | Not installed. Must add via `pnpm dlx shadcn@latest add popover`. Current project uses `radix-ui` unified package (v1.4.3+). |
| **emoji-picker-react** | Not installed. Must add via `pnpm add emoji-picker-react`. Must dynamic-import in Next.js due to SSR (`next/dynamic` with `ssr: false`). API: `<EmojiPicker onEmojiClick={(data) => data.emoji} emojiStyle={EmojiStyle.NATIVE} theme={Theme.AUTO} />`. |
| **Color picker** | No library needed. Build a palette-based popover using shadcn `Popover` with a grid of preset hex swatches. |
| **Component style** | `"use client"` directive, imports from `"radix-ui"` (unified), `cn()` from `"@/lib/utils"`, `data-slot` attributes on wrappers, named function exports, icons from `@remixicon/react`. |
| **Migration system** | Edit schema → `pnpm db:migrate` (generates `.sql` + bundles `export.json`). Migrations auto-apply at runtime via `db.dialect.migrate()`. Nullable columns default to `NULL` for existing rows. |
| **Card component** | `src/components/ui/card.tsx` — shadcn `radix-mira` style, supports `size` prop, uses `ring-1 ring-foreground/10`. |
| **Existing tests** | `src/lib/services/__tests__/bundle.test.ts` — unit tests for bundle CRUD. Must extend for new fields. |

---

## Phase 0 — Schema & Migration

### Task 0.1: Add emoji and coverColor columns to bundles table

**What**: Add two nullable text columns to the `bundles` table in the Drizzle schema: `emoji` and `coverColor`.

**Files**: `src/db/schema.ts`

**API reference** (verified from `src/db/schema.ts:47-57`):
```ts
// Current bundles table definition:
export const bundles = sqliteTable('bundles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description'),
  // ... exam columns ...
  createdAt: integer('created_at').notNull().default(Date.now()),
});
```

**Implementation notes**:
1. After `description`, add: `emoji: text('emoji'),` — nullable text, stores a single emoji character (e.g. `"🧬"`).
2. After `emoji`, add: `coverColor: text('cover_color'),` — nullable text, stores a hex color string (e.g. `"#7c3aed"`).
3. The column name in the DB is `cover_color` (snake_case) while the JS property is `coverColor` (camelCase). Drizzle maps these automatically via the `text('cover_color')` call, just like existing `examQuestionCount` maps to `exam_question_count`.
4. Both columns are nullable — existing bundles will get `NULL` values, which the UI will handle as "no emoji" / "default color".
5. The inferred `Bundle` type will automatically include `emoji: string | null` and `coverColor: string | null`.

**Tests**: No new tests for schema definition itself — migration generation handles it.

**Commit**: `feat(schema): add emoji and coverColor columns to bundles`

### Task 0.2: Generate and export database migration

**What**: Run `pnpm db:migrate` to generate a new SQL migration for the two new columns and re-bundle `export.json`.

**Files**: Auto-generated in `src/db/migrations/`

**Implementation notes**:
1. Run `pnpm db:migrate` (which runs `pnpm db:generate && pnpm db:export`).
2. Verify the generated `.sql` file adds `emoji TEXT` and `cover_color TEXT` as nullable columns to the `bundles` table.
3. Verify `export.json` was updated with the new migration entry.
4. Do **not** edit `export.json` manually — it is auto-generated.
5. Restart the dev server to verify the migration applies correctly on page load.

**Tests**: Manual verification that the dev server starts without errors.

**Commit**: `chore: generate migration for bundle emoji and coverColor`

---

## Phase 1 — Bundle Service Updates

### Task 1.1: Update createBundle and updateBundle to accept emoji and coverColor

**What**: Extend the `createBundle` and `updateBundle` functions to accept optional `emoji` and `coverColor` parameters.

**Files**: `src/lib/services/bundle.ts`

**API reference** (verified from `src/lib/services/bundle.ts:6-26`):
```ts
// Current signatures:
export async function createBundle(db: Db, data: { title: string; description?: string | null }) {
  // inserts { title, description }
}

export async function updateBundle(db: Db, id: number, data: {
  title?: string;
  description?: string | null;
  examQuestionCount?: number | null;
  examTimeLimitSeconds?: number | null;
  examDifficultyFilter?: number | null;
  examPointsPerCorrect?: number | null;
  examPointsPerWrong?: number | null;
}) {
  // updates via .set(data)
}
```

**Implementation notes**:
1. `createBundle`: Add `emoji?: string | null` and `coverColor?: string | null` to the `data` parameter type. Pass `emoji: data.emoji ?? null` and `coverColor: data.coverColor ?? null` in the `.values()` call.
2. `updateBundle`: Add `emoji?: string | null` and `coverColor?: string | null` to the `data` parameter type. No changes to the `.set()` call needed — it already spreads `data`.
3. The re-export in `src/lib/services/index.ts` does not need changes since the function names are the same.

**Tests**:

Unit tests in `src/lib/services/__tests__/bundle.test.ts`:
- Test case A: `createBundle` with emoji and coverColor — verify created bundle has both fields set.
- Test case B: `createBundle` without emoji and coverColor — verify both fields are `null`.
- Test case C: `updateBundle` setting emoji and coverColor — verify updated bundle has both fields.
- Test case D: `updateBundle` clearing emoji and coverColor (setting to `null`) — verify both fields become `null`.
- Test case E: `createBundle` with only emoji (no coverColor) — verify emoji is set, coverColor is `null`.

**Commit**: `feat(bundle): add emoji and coverColor to createBundle and updateBundle`

---

## Phase 2 — UI Components

### Task 2.1: Install emoji-picker-react and shadcn popover

**What**: Install the `emoji-picker-react` package and add the shadcn `Popover` component.

**Files**: `package.json` (modified), `src/components/ui/popover.tsx` (new, auto-generated)

**Implementation notes**:
1. Run `pnpm add emoji-picker-react` to install the emoji picker library.
2. Run `pnpm dlx shadcn@latest add popover` to add the Popover component. This will:
   - Install the `@radix-ui/react-popover` primitive (likely pulled in through the `radix-ui` package already in `package.json`).
   - Create `src/components/ui/popover.tsx` following the project's `radix-mira` style.
3. Verify `src/components/ui/popover.tsx` follows the project conventions: `"use client"` directive, `cn()` from `@/lib/utils`, `data-slot` attribute.

**Tests**: Run `pnpm typecheck` to verify no type errors.

**Commit**: `chore: add emoji-picker-react and shadcn popover`

### Task 2.2: Create EmojiPicker component

**What**: Create a reusable `BundleEmojiPicker` component that opens an emoji picker in a Popover. The trigger shows the currently selected emoji (or a placeholder icon). On selection, it calls `onEmojiChange(emoji: string | null)`.

**Files**: `src/components/bundle-emoji-picker.tsx` (new)

**API reference** (verified from emoji-picker-react docs):
```ts
import EmojiPicker, { EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react';

// Key usage pattern:
<EmojiPicker
  onEmojiClick={(emojiData: EmojiClickData) => {
    // emojiData.emoji → native unicode char e.g. "👍"
  }}
  emojiStyle={EmojiStyle.NATIVE}
  theme={Theme.AUTO}
/>
```

**Critical**: Must dynamic-import `emoji-picker-react` to avoid Next.js SSR `document is not defined` error:
```ts
import dynamic from 'next/dynamic';
const Picker = dynamic(() => import('emoji-picker-react'), { ssr: false });
```

**Implementation notes**:
1. Create `src/components/bundle-emoji-picker.tsx` as a `"use client"` component.
2. Props interface:
   ```ts
   interface BundleEmojiPickerProps {
     emoji: string | null;
     onEmojiChange: (emoji: string | null) => void;
   }
   ```
3. Render a `Popover` from `@/components/ui/popover` with `PopoverTrigger` showing the current emoji (large, e.g. `text-2xl`) or a placeholder `RiEmotionLine` icon from `@remixicon/react`.
4. `PopoverContent` wraps the dynamic-imported `Picker` component, configured with:
   - `emojiStyle={EmojiStyle.NATIVE}` — renders native OS emoji
   - `theme={Theme.AUTO}` — follows system theme
   - `onEmojiClick` — calls `onEmojiChange(emojiData.emoji)` and closes the popover
5. Include a "Clear" / "Remove emoji" option (small button below the picker) that calls `onEmojiChange(null)`.
6. Use `cn()` for conditional styling based on whether `emoji` is set.
7. The trigger button should be sized consistently (e.g. `h-10 w-10` or `h-12 w-12`) with rounded corners.

**Tests**: No unit tests for this pure UI component — verified via E2E.

**Commit**: `feat(ui): add BundleEmojiPicker component`

### Task 2.3: Create ColorPicker component

**What**: Create a reusable `BundleColorPicker` component that displays a grid of preset color swatches in a Popover. The trigger shows the currently selected color as a filled circle/rectangle. On selection, it calls `onColorChange(color: string | null)`.

**Files**: `src/components/bundle-color-picker.tsx` (new)

**Implementation notes**:
1. Create `src/components/bundle-color-picker.tsx` as a `"use client"` component.
2. Props interface:
   ```ts
   interface BundleColorPickerProps {
     color: string | null;
     onColorChange: (color: string | null) => void;
   }
   ```
3. Define a preset color palette as a constant array of hex strings. Use a curated set of 18 colors that cover the spectrum well and look good on card backgrounds:
   ```ts
   const BUNDLE_COLORS = [
     '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
     '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
     '#d946ef', '#ec4899', '#f43f5e', '#78716c', '#64748b', '#334155',
   ] as const;
   ```
4. Render a `Popover` from `@/components/ui/popover`:
   - `PopoverTrigger`: A `button` element showing a circle/rectangle filled with `color` (or a default gray/invisible state if `color` is null). Size approximately `h-8 w-8 rounded-md border-2`. Uses `style={{ backgroundColor: color ?? 'transparent' }}`.
   - `PopoverContent`: A `div` with a grid layout (`grid grid-cols-6 gap-2`) containing buttons for each color in `BUNDLE_COLORS`, plus a "None" option that calls `onColorChange(null)`.
5. Each color button is a `button` with `className="h-8 w-8 rounded-md border-2 ..."` and `style={{ backgroundColor: color }}`. When selected, show a border highlight (`border-primary ring-2 ring-primary`).
6. Add a "Remove color" button below the grid that calls `onColorChange(null)`.
7. Import `Popover, PopoverContent, PopoverTrigger` from `@/components/ui/popover`.
8. Import `cn` from `@/lib/utils`.

**Tests**: No unit tests for this pure UI component — verified via E2E.

**Commit**: `feat(ui): add BundleColorPicker component`

### Task 2.4: Create BundleCard component

**What**: Create a shared `BundleCard` component that renders a bundle with its emoji and cover color, used in both the Study Dome Overview and Bundles list pages. This centralizes the visual treatment of bundles.

**Files**: `src/components/bundle-card.tsx` (new)

**API reference** (from `src/db/schema.ts:59`):
```ts
export type Bundle = typeof bundles.$inferSelect;
// Bundle.emoji: string | null
// Bundle.coverColor: string | null
```

**Implementation notes**:
1. Create `src/components/bundle-card.tsx` as a `"use client"` component.
2. Props interface:
   ```ts
   interface BundleCardProps {
     bundle: {
       id: number;
       title: string;
       description: string | null;
       emoji: string | null;
       coverColor: string | null;
     };
     showActions?: boolean;  // whether to show Edit/Delete buttons (Bundles list only)
     onDelete?: (id: number) => void;
     editHref?: string;
     className?: string;
   }
   ```
3. Render a `Card` component from `@/components/ui/card` with:
   - A **color accent** at the top of the card: a `<div>` with `className="h-2 rounded-t-lg"` and `style={{ backgroundColor: bundle.coverColor ?? 'var(--color-muted-foreground)' }}` if `coverColor` is set, otherwise use a subtle default color. This creates a colored "header bar" across the top of the card.
   - Inside `CardHeader`:
     - The **emoji** displayed as a large character (`text-2xl`) or `text-3xl` to the left of the title. If no emoji, show nothing (just the title).
     - The **title** in `CardTitle`.
     - The **description** in `CardDescription` if present.
   - If `showActions` is true, render `CardContent` with Edit and Delete buttons (same pattern as `bundles/page.tsx`).
4. The entire card (minus the action buttons area) should be a `<Link>` to the bundle detail page, wrapping the `CardHeader`. When `showActions` is true, the Edit/Delete buttons should be outside the `<Link>` so they have their own navigation targets.
5. Import `Link` from `next/link`, `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent` from `@/components/ui/card`, `Button` from `@/components/ui/button`, `RiEditLine`/`RiDeleteBinLine` from `@remixicon/react`, `cn` from `@/lib/utils`.

**Tests**: No unit tests for UI component — verified visually and via E2E.

**Commit**: `feat(ui): add shared BundleCard component`

---

## Phase 3 — Page Updates

### Task 3.1: Update New Bundle page with emoji and color pickers

**What**: Add emoji and color picker fields to the new bundle creation page, and pass them to `createBundle`.

**Files**: `src/app/(main)/study-dome/bundles/new/page.tsx`

**Implementation notes**:
1. Add state variables:
   ```ts
   const [emoji, setEmoji] = useState<string | null>(null);
   const [coverColor, setCoverColor] = useState<string | null>(null);
   ```
2. Import `BundleEmojiPicker` from `@/components/bundle-emoji-picker` and `BundleColorPicker` from `@/components/bundle-color-picker`.
3. Add a new form section between the Description field and the Create/Cancel buttons:
   ```tsx
   <div className="space-y-2">
     <Label>Icon</Label>
     <BundleEmojiPicker emoji={emoji} onEmojiChange={setEmoji} />
   </div>
   <div className="space-y-2">
     <Label>Cover Color</Label>
     <BundleColorPicker color={coverColor} onColorChange={setCoverColor} />
   </div>
   ```
4. Update the `handleSubmit` to pass emoji and coverColor to `createBundle`:
   ```ts
   const bundle = await createBundle(db, {
     title: title.trim(),
     description: description.trim() || null,
     emoji,
     coverColor,
   });
   ```
5. The `Label` and form layout follow the existing pattern (each field in a `div.space-y-2`).

**Tests**: Manual verification — create a bundle with an emoji and color, verify it saves correctly.

**Commit**: `feat(bundle): add emoji and color pickers to new bundle page`

### Task 3.2: Update Edit Bundle page with emoji and color pickers

**What**: Add emoji and color picker fields to the bundle edit page, pre-populated from the existing bundle data, and pass them to `updateBundle`.

**Files**: `src/app/(main)/study-dome/bundles/[id]/edit/page.tsx`

**Implementation notes**:
1. Add state variables:
   ```ts
   const [emoji, setEmoji] = useState<string | null>(null);
   const [coverColor, setCoverColor] = useState<string | null>(null);
   ```
2. In the `useEffect` that loads the bundle data, set initial values:
   ```ts
   setEmoji(bundle.emoji);
   setCoverColor(bundle.coverColor);
   ```
3. Add emoji and color picker fields in the "Edit Bundle" section (between description and the "Default Exam Settings" heading), same pattern as the new bundle page:
   ```tsx
   <div className="space-y-2">
     <Label>Icon</Label>
     <BundleEmojiPicker emoji={emoji} onEmojiChange={setEmoji} />
   </div>
   <div className="space-y-2">
     <Label>Cover Color</Label>
     <BundleColorPicker color={coverColor} onColorChange={setCoverColor} />
   </div>
   ```
4. Update `handleSubmit` to include emoji and coverColor in the `updateBundle` call:
   ```ts
   await updateBundle(db, bundleId, {
     title: title.trim(),
     description: description.trim() || null,
     emoji,
     coverColor,
     // ... existing exam settings ...
   });
   ```

**Tests**: Manual verification — edit a bundle's emoji and color, verify they persist.

**Commit**: `feat(bundle): add emoji and color pickers to edit bundle page`

### Task 3.3: Update Study Dome Overview "Your Bundles" section

**What**: Replace the inline bundle card rendering in the Study Dome Overview page with the shared `BundleCard` component.

**Files**: `src/app/(main)/study-dome/page.tsx`

**Implementation notes**:
1. Import `BundleCard` from `@/components/bundle-card`.
2. Replace the bundle rendering block (lines 138-149):
   ```tsx
   // Before:
   {bundles.map((bundle) => (
     <Link key={bundle.id} href={`/study-dome/bundles/${bundle.id}`}>
       <Card className="cursor-pointer transition-all hover:border-primary hover:shadow-sm">
         <CardHeader>
           <CardTitle className="text-lg">{bundle.title}</CardTitle>
           {bundle.description && (
             <CardDescription>{bundle.description}</CardDescription>
           )}
         </CardHeader>
       </Card>
     </Link>
   ))}
   ```
   ```tsx
   // After:
   {bundles.map((bundle) => (
     <BundleCard key={bundle.id} bundle={bundle} />
   ))}
   ```
3. Remove unused imports (`Card`, `CardHeader`, `CardTitle`, `CardDescription` from `@/components/ui/card`, and `Link` from `next/link`) if they are no longer used in this file.

**Tests**: Manual verification — bundles in Study Dome Overview should show emoji and color bar.

**Commit**: `feat(study-dome): use BundleCard in overview page`

### Task 3.4: Update Bundles list page

**What**: Replace the inline bundle card rendering in the Bundles list page with the shared `BundleCard` component, including Edit/Delete action buttons.

**Files**: `src/app/(main)/study-dome/bundles/page.tsx`

**Implementation notes**:
1. Import `BundleCard` from `@/components/bundle-card`.
2. Replace the bundle rendering block (lines 91-114):
   ```tsx
   // Before:
   {bundles.map((bundle) => (
     <Card key={bundle.id}>
       <Link href={`/study-dome/bundles/${bundle.id}`}>
         <CardHeader>
           <CardTitle className="text-lg">{bundle.title}</CardTitle>
           {bundle.description && (
             <CardDescription>{bundle.description}</CardDescription>
           )}
         </CardHeader>
       </Link>
       <CardContent className="flex flex-wrap gap-2 pt-0">
         <Button variant="outline" asChild>
           <Link href={`/study-dome/bundles/${bundle.id}/edit`}>
             <RiEditLine className="mr-1 h-4 w-4" />
             Edit
           </Link>
         </Button>
         <Button variant="outline" onClick={() => setDeleteId(bundle.id)}>
           <RiDeleteBinLine className="mr-1 h-4 w-4" />
           Delete
         </Button>
       </CardContent>
     </Card>
   ))}
   ```
   ```tsx
   // After:
   {bundles.map((bundle) => (
     <BundleCard
       key={bundle.id}
       bundle={bundle}
       showActions
       editHref={`/study-dome/bundles/${bundle.id}/edit`}
       onDelete={(id) => setDeleteId(id)}
     />
   ))}
   ```
3. Remove unused imports (`Card`, `CardContent`, `CardHeader`, `CardTitle`, `CardDescription` from `@/components/ui/card`, `Link` from `next/link`, `RiEditLine`, `RiDeleteBinLine` from `@remixicon/react`) if no longer used.

**Tests**: Manual verification — bundles in Bundles list should show emoji, color bar, and Edit/Delete buttons.

**Commit**: `feat(bundles): use BundleCard in bundles list page`

### Task 3.5: Update Bundle detail page header

**What**: Display the bundle's emoji and cover color in the bundle detail page header.

**Files**: `src/app/(main)/study-dome/bundles/[id]/page.tsx`

**Implementation notes**:
1. No new imports needed for the emoji display (it's just inline text rendering).
2. In the header section (lines 222-232), update the display:
   ```tsx
   // Before:
   <div>
     <PageTitle>Bundle Detail</PageTitle>
     <h1 className="text-3xl font-bold tracking-tight">{bundle.title}</h1>
     {bundle.description && (
       <p className="mt-1 text-muted-foreground">{bundle.description}</p>
     )}
     <p className="mt-1 text-sm text-muted-foreground">
       {cards.length} card{cards.length !== 1 ? "s" : ""}
     </p>
   </div>
   ```
   ```tsx
   // After:
   <div>
     <PageTitle>Bundle Detail</PageTitle>
     <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
       {bundle.emoji && <span className="text-4xl">{bundle.emoji}</span>}
       {bundle.title}
     </h1>
     {bundle.description && (
       <p className="mt-1 text-muted-foreground">{bundle.description}</p>
     )}
     <p className="mt-1 text-sm text-muted-foreground">
       {cards.length} card{cards.length !== 1 ? "s" : ""}
     </p>
   </div>
   ```
3. Add a colored accent bar above the header section, or as a left border on the container:
   ```tsx
   {bundle.coverColor && (
     <div className="h-2 rounded-t-lg" style={{ backgroundColor: bundle.coverColor }} />
   )}
   ```
   Place this inside the `<Boxed>` wrapper, before the back-link `<div>`, so it appears as a top-colored bar on the bundle detail page.

**Tests**: Manual verification — bundle detail page shows emoji next to title and color bar at top.

**Commit**: `feat(bundle): show emoji and cover color on detail page`

---

## Phase 4 — Testing

### Task 4.1: Add unit tests for bundle service emoji and coverColor

**What**: Extend the existing bundle service unit tests to cover emoji and coverColor fields in create and update operations.

**Files**: `src/lib/services/__tests__/bundle.test.ts` (modify)

**Tests**:
- `"createBundle with emoji and coverColor"` — Create a bundle with `emoji: "🧬"` and `coverColor: "#7c3aed"`. Assert the returned bundle has both fields set correctly.
- `"createBundle without emoji and coverColor defaults to null"` — Create a bundle with no emoji/color. Assert both fields are `null`.
- `"createBundle with only emoji"` — Create a bundle with `emoji: "📚"` and no coverColor. Assert `emoji` is `"📚"` and `coverColor` is `null`.
- `"updateBundle sets emoji and coverColor"` — Create a bundle, then update it with `emoji: "🔬"` and `coverColor: "#ef4444"`. Fetch the bundle and assert both fields are updated.
- `"updateBundle clears emoji and coverColor"` — Create a bundle with emoji/color, then update it with `emoji: null` and `coverColor: null`. Assert both fields are cleared.
- `"updateBundle preserves emoji and coverColor when not specified"` — Create a bundle with emoji=color, then call `updateBundle` with only `title` change. Assert emoji and coverColor remain unchanged.

**Commit**: `test(bundle): add unit tests for emoji and coverColor`

### Task 4.2: Run lint, typecheck, and unit tests

**What**: Run the full verification pipeline to ensure no regressions.

**Files**: None (verification only)

**Steps**:
1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test`

Fix any issues before proceeding.

**Commit**: No commit — verification step only.

### Task 4.3: Visual QA and manual E2E verification

**What**: Manually verify the complete feature works end-to-end in the browser.

**Steps**:
1. Start dev server (`pnpm dev`).
2. Navigate to Study Dome Overview — verify bundles display with emoji and color bar.
3. Navigate to Bundles page — verify bundle cards show emoji and color bar with Edit/Delete actions.
4. Create a new bundle — set emoji and color, verify they appear on the card.
5. Edit an existing bundle — change emoji and color, verify they update.
6. View bundle detail page — verify emoji appears next to title and color bar shows.
7. Create a bundle without emoji/color — verify it renders gracefully (no emoji shown, default/neutral appearance for color bar).
8. Clear emoji and color via the emoji picker and color picker — verify they revert to defaults.

**Commit**: No commit — manual QA step.

---

## Execution Checklist

- [x] License — already present in repo (skipped Phase 0 Task 0.1 per user).
- [x] Docker/CI — skipped per user request.
- [x] Research phase completed — verified against real code (schema, services, all 5 page files, component style conventions, emoji-picker-react API, shadcn popover).
- [x] Every library reference traces to a verified source — `emoji-picker-react` API verified, `radix-ui` popover verified, shadcn `Card` components verified.
- [x] Every task has a `**Tests**` subsection (except pure UI component tasks 2.2-2.4 and page update tasks).
- [x] E2E testing — manual QA in Task 4.3 (this is a client-side UI feature, no automated E2E test infrastructure for emoji/color pickers).
- [x] Every task ends with a `**Commit**` line.
- [x] README not modified (stays slim).
- [x] All new components are under `src/components/`.
- [x] `pnpm add` / `pnpm dlx` used (not `npx`).
- [x] No skills installation needed for this plan.