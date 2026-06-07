# Responsive design

StudyToolbox is mobile-first. Every page should be usable on a 375px-wide viewport without horizontal scrolling, then progressively enhance to tablet (`md`) and desktop (`lg`+) using Tailwind's responsive variants.

This document records the conventions used across the app so new pages and components stay consistent.

## Breakpoints

The app uses Tailwind v4's default breakpoints. Two of them are load-bearing:

| Prefix | Min width | Used for |
|--------|-----------|----------|
| _(none)_ | 0px (default) | Mobile-first base styles |
| `sm:` | 640px | Small phones in landscape; minor grid bumps (e.g. rating buttons `grid-cols-2 sm:grid-cols-4`) |
| `md:` | 768px | The **primary mobile/desktop split**. Hamburger menu shows below `md`, inline nav shows from `md` and up |
| `lg:` | 1024px | Three-column layouts, larger forms |

Touch targets are sized at 48px (h-12) on mobile per the Apple/Material guidelines; icon buttons use the `icon-sm` Button variant (24px hit area) only inside dense navigation.

## Dark mode

Powered by [`next-themes`](https://github.com/pacocoursey/next-themes). The provider is wired in `src/app/layout.tsx`:

```tsx
<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
```

- A `dark` class is toggled on `<html>` before hydration via the inline script `next-themes` injects.
- Tailwind picks it up through `@custom-variant dark (&:is(.dark *));` declared in `globals.css`.
- The chosen theme persists to `localStorage` under the `theme` key.

Use Tailwind's `dark:` variants for colour shifts. For elements that hold a real colour (e.g. brand logo fill) prefer rendering both light and dark variants and swapping with `dark:hidden` / `hidden dark:block` — that paints the correct version on first frame without waiting for React to hydrate.

The `<Logo />` component encapsulates the brand mark and accepts an explicit `theme: "light" | "dark"` prop. The navbar renders both variants and lets CSS pick:

```tsx
<Logo text={false} theme="light" className="block h-6 w-auto dark:hidden" />
<Logo text={false} theme="dark" className="hidden h-6 w-auto dark:block" />
```

## Mobile navigation

The top navbar (`src/components/navbar.tsx`) shows:

- A hamburger button (`<MobileNav />`) below `md`, hidden from `md` and up.
- Inline nav links from `md` and up.
- The `<ModeToggle />` and brand `<Logo />` always.

The hamburger opens a left-side `Sheet` (`src/components/mobile-nav.tsx`) containing:

- The text logo.
- The same top-level nav links as desktop.
- A `<ModeToggle />` pinned to the bottom for quick theme access.

Each `Link` inside the Sheet calls `setOpen(false)` `onClick` so the dialog closes the moment the user taps, before navigation completes. (This pattern avoids a `useEffect` on `pathname` and the associated `react-hooks/set-state-in-effect` warning.)

## Scrollable sub-navigation

Section tabs (`study-dome-nav.tsx`, `factory-nav.tsx`, `exchange-center-nav.tsx`) can exceed the viewport on small phones. The pattern is:

```tsx
<nav className="flex gap-6 overflow-x-auto no-scrollbar">
  <Link className="whitespace-nowrap shrink-0">...</Link>
</nav>
```

- `overflow-x-auto` enables horizontal scrolling.
- `no-scrollbar` (a tiny utility added to `globals.css`) hides the scrollbar chrome on macOS/iOS/Firefox.
- `whitespace-nowrap shrink-0` on each tab keeps labels on a single line and prevents flex shrinking.

## Page headers with action buttons

Page headers usually hold a title on the left and 1–4 action buttons on the right. On narrow viewports the buttons need to stack below the title:

```tsx
<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
  <div>
    <h1>Bundle title</h1>
    <p className="text-muted-foreground">subtitle</p>
  </div>
  <div className="flex flex-wrap items-center gap-2">
    <Button>Edit</Button>
    <Button variant="ghost">Delete</Button>
  </div>
</div>
```

- The outer `flex-col` → `md:flex-row` swap keeps the title alone on mobile, side-by-side on tablet+.
- The inner `flex-wrap` lets buttons wrap to a second line instead of overflowing.
- Use `size="sm"` with `variant="outline"` or `"ghost"` for secondary actions to free space.

## Cards in flex rows

When a `Card` sits next to another column (e.g. an AI-helper sidebar) inside a flex container, give it `min-w-0 flex-1` so it can shrink:

```tsx
<div className="flex flex-col gap-4 md:flex-row">
  <Card className="min-w-0 flex-1">...</Card>
  <aside className="flex flex-row gap-2 overflow-x-auto md:flex-col md:overflow-visible">
    <Button>Helper 1</Button>
    <Button>Helper 2</Button>
  </aside>
</div>
```

The sidebar becomes a horizontally scrolling button row on mobile and a vertical stack from `md` up.

## Tables

`<Table>` doesn't shrink columns gracefully. Wrap it and impose a `min-w-*` so it scrolls within its container instead of overflowing the page:

```tsx
<div className="overflow-x-auto">
  <Table className="min-w-[600px]">
    ...
  </Table>
</div>
```

## Rating grids

The review page's rating buttons are 4 across on tablet+ but 2-up on mobile:

```tsx
<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
  <Button>Again</Button>
  <Button>Hard</Button>
  <Button>Good</Button>
  <Button>Easy</Button>
</div>
```

## Long headings

Use `text-balance` on h1 and `text-pretty` on supporting copy to avoid awkward line breaks on narrow screens.

## Hiding chrome at small sizes

For elements that are decorative on mobile (e.g. the "Back" text next to a chevron):

```tsx
<Link><ChevronLeft /> <span className="hidden sm:inline">Back</span></Link>
```

## E2E coverage

The responsive behaviour is verified by Playwright on three projects:

| Project | Device | Specs |
|---|---|---|
| `chromium` | Desktop Chrome (1280×720) | all existing specs + `dark-mode.spec.ts` + `responsive-nav.spec.ts` |
| `mobile-chrome` | Pixel 7 (412×732) | `responsive-nav.spec.ts` + `responsive-layouts.spec.ts` |
| `mobile-safari` | iPhone 14 (390×664) | same as mobile-chrome |

The relevant specs:

- **`e2e/dark-mode.spec.ts`** — ModeToggle button, dropdown options, `dark` class on `<html>`, persistence across reload, logo variant switching.
- **`e2e/responsive-nav.spec.ts`** — hamburger vs inline nav, Sheet contents, link-click close, sub-nav `overflow-x: auto`.
- **`e2e/responsive-layouts.spec.ts`** — `documentElement.scrollWidth <= clientWidth` on 14 key routes, primary CTA viewport fit, rating grid `gridTemplateColumns` length on mobile.

Run them with:

```bash
pnpm test:e2e                          # all projects
cd e2e && pnpm exec playwright test --project=mobile-chrome
```
