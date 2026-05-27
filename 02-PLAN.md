# 02 — Layout & Homepage Redesign

> Transform StudyToolbox into a true local-first desktop/mobile app with a sticky footer, appealing homepage, and native app aesthetic.

## Conventions

- **Conventional Commits only** — every commit message must follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`. Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. No exceptions.

---

## Research Summary

### Key Findings

#### 1. **Sticky Footer with Flexbox** ✓
Modern approach: Wrap root layout in `flex flex-col min-h-screen`, set `main` to `flex-1` (grows to fill space), footer naturally stays at bottom. Avoids `position:sticky` complexity.

**Source:** DEV Community, Metaphore, React Hustle — tested pattern across Next.js 16+ projects.

#### 2. **Safe Area Insets (Mobile App Feel)** ✓
Use `env(safe-area-inset-*)` for notch/home-indicator safety on iOS. Requires:
- Meta viewport: `viewport-fit=cover`
- CSS: `padding: env(safe-area-inset-*)`
- Tailwind: extend config with `padding-safe` class

**Source:** Polypane, Medium — baseline widely supported (all modern browsers).

#### 3. **Homepage Hero & Spacing** ✓
- Hero section: Large heading (5xl on desktop, 4xl mobile), gradient accent, descriptive subtitle
- Spacing: Multiples of 4px or 8px (4, 8, 16, 24, 32px)
- CTA hierarchy: Card-based entry points with hover effects
- Whitespace: 24–32px margins for breathing room

**Source:** Figma, Chop Dawg, Justinmind — 2025 trends emphasize minimalism + visual depth.

#### 4. **Local-First App Container** ✓
Bounded main content with safe side margins (like a native app):
- Desktop: max-width container with centered padding
- Mobile: full-width with side padding (16–24px)
- Creates "app in a web browser" feel

**Source:** Multiple 2025 mobile-first design guides.

#### 5. **Mobile-First Navigation** ✓
- Sticky top navbar (responsive, collapses on mobile)
- Consider fixed bottom nav for mobile (drawer on desktop)
- Touch-friendly tap targets (48px minimum)

### Technologies & APIs Verified

| Item | Version | Source |
|------|---------|--------|
| Tailwind CSS | 4.x | `tailwind.config.ts` in project |
| Next.js | 16.x | `package.json` |
| shadcn/ui | Latest | `components.json` present |
| Flexbox layout | CSS3 | All modern browsers |
| `env()` safe-area-inset | Standard | Baseline widely available |

### Installed Skills

None needed beyond standard tools (Tailwind, TypeScript, React).

---

## Phase 1 — Layout Architecture

### Task 1.1: Fix Root Layout for Sticky Footer

**What**: Update `src/app/layout.tsx` and `src/app/(main)/layout.tsx` to implement flexbox-based sticky footer architecture.

**Files**:
- `src/app/layout.tsx` (root)
- `src/app/(main)/layout.tsx` (main layout)
- `src/app/globals.css` (add safe-area support)

**API Reference**: [MDN Flexbox Layout](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Flexible_Box_Layout), [Tailwind min-h-screen](https://tailwindcss.com/docs/min-height)

**Implementation notes**:

1. **Root layout (`src/app/layout.tsx`)**:
   - Wrap HTML in `min-h-screen` (already set)
   - Wrap body in `flex flex-col min-h-screen` to establish flex container
   - This ensures the HTML + body + children fill viewport

   ```tsx
   <html ... className="h-full antialiased ...">
     <body className="flex flex-col min-h-screen">
       {children}  {/* This includes the (main) layout */}
       <Toaster ... />
       <DbReset />
     </body>
   </html>
   ```

2. **Main layout (`src/app/(main)/layout.tsx`)**:
   - Keep navbar + main + footer structure
   - Set `main` to `flex-1` — grows to fill available space
   - Footer automatically pushed to bottom
   - Remove any `min-h-screen` from this layout (inherited from root)

   ```tsx
   <div className="flex flex-1 flex-col">
     <Navbar />
     <main className="flex-1 overflow-y-auto">{children}</main>
     <Footer />
   </div>
   ```

3. **globals.css**: Add viewport-fit for safe areas:
   ```css
   @supports (padding: max(0px)) {
     body {
       padding-left: env(safe-area-inset-left);
       padding-right: env(safe-area-inset-right);
     }
   }
   ```

4. **Next.js meta tag** (in root layout): Ensure viewport includes `viewport-fit=cover`:
   ```tsx
   <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
   ```

**Tests**:
- Footer stays at bottom on pages with minimal content (e.g., homepage)
- Footer at bottom on pages with overflow (scrollable content)
- On iOS with notch/home indicator: safe areas respected
- Responsive: footer position maintained on mobile, tablet, desktop

**Commit**: `style: fix sticky footer with flexbox layout`

---

### Task 1.2: Add Safe Area Insets to Navbar & Footer

**What**: Apply safe-area-inset padding to navbar and footer for true mobile app feel (respects notches, home indicators, rounded corners).

**Files**:
- `src/components/navbar.tsx`
- `src/components/footer.tsx`

**API Reference**: [CSS env()](https://developer.mozilla.org/en-US/docs/Web/CSS/env), [Polypane safe-area guide](https://polypane.app/blog/using-safe-area-inset-to-build-mobile-safe-layouts/)

**Implementation notes**:

1. **Navbar** (`src/components/navbar.tsx`):
   - Add padding-left and padding-right to handle side notches
   - Add padding-top to handle top notch (Dynamic Island, etc.)
   
   ```tsx
   <header className="sticky top-0 z-40 border-b bg-background/60 backdrop-blur-xl">
     <Boxed className="flex h-14 items-center justify-between [padding-left:calc(1rem+env(safe-area-inset-left))] [padding-right:calc(1rem+env(safe-area-inset-right))] [padding-top:calc(0.5rem+env(safe-area-inset-top))]">
       {/* nav content */}
     </Boxed>
   </header>
   ```
   
   Or better: Create a CSS helper class in `globals.css`:
   ```css
   .safe-area-x {
     padding-left: calc(1rem + env(safe-area-inset-left));
     padding-right: calc(1rem + env(safe-area-inset-right));
   }
   .safe-area-y {
     padding-top: calc(0.5rem + env(safe-area-inset-top));
     padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));
   }
   ```

2. **Footer** (`src/components/footer.tsx`):
   - Add padding-left, padding-right, padding-bottom for home indicator
   
   ```tsx
   <footer className="border-t bg-muted/30 [padding-left:calc(1rem+env(safe-area-inset-left))] [padding-right:calc(1rem+env(safe-area-inset-right))] [padding-bottom:calc(1rem+env(safe-area-inset-bottom))]">
     {/* footer content */}
   </footer>
   ```

**Tests**:
- On desktop: no visible change (safe-area insets = 0)
- On iPhone with notch: navbar doesn't hide behind Dynamic Island
- On iPhone with home indicator: footer not obscured by gesture bar
- Test in Chrome DevTools with device emulation (notch)

**Commit**: `style: add safe-area-inset support to navbar & footer`

---

## Phase 2 — Homepage Redesign

### Task 2.1: Enhance Hero Section

**What**: Redesign the homepage hero to be more visually striking with better typography hierarchy, improved spacing, and a compelling gradient background.

**Files**:
- `src/app/(main)/page.tsx`
- `src/app/globals.css` (add hero gradient utility)

**Implementation notes**:

1. **Update hero structure** in `src/app/(main)/page.tsx`:
   - Keep existing "Welcome to StudyToolbox" heading
   - Enhance gradient background (from primary to transparent)
   - Improve subtitle visibility and spacing
   - Add more visual breathing room

   ```tsx
   return (
     <Boxed className="py-24 md:py-32">
       {/* Hero gradient background */}
       <div className="relative mb-20 md:mb-32">
         <div className="pointer-events-none absolute -inset-4 -top-16 rounded-3xl bg-gradient-to-b from-primary/10 via-primary/5 to-transparent blur-3xl" />
         
         <div className="relative space-y-6">
           <h1 className="font-heading text-5xl md:text-6xl font-bold tracking-tight text-foreground">
             Welcome to{" "}
             <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
               StudyToolbox
             </span>
           </h1>
           
           <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
             Your local-first study companion. Review flashcards, take exams, 
             generate cards with AI — all stored securely in your browser.
           </p>
         </div>
       </div>

       {/* CTA Cards */}
       <div className="grid gap-6 md:grid-cols-2 mt-12">
         {/* Card 1: Study Dome */}
         {/* Card 2: AI Factory */}
       </div>
     </Boxed>
   );
   ```

2. **Improve card styling**:
   - Add subtle hover scale and shadow effects
   - Ensure cards are touch-friendly (min 48px tap target)
   - Use consistent spacing (gap-6 = 24px)

   ```tsx
   <Link href="/study-dome" className="group">
     <Card className="h-full transition-all duration-200 hover:shadow-lg hover:border-primary/50 hover:-translate-y-1">
       <CardHeader>
         <div className="mb-4">
           <RiBookOpenLine className="h-10 w-10 text-primary" />
         </div>
         <CardTitle className="text-2xl">Study Dome</CardTitle>
         <CardDescription className="text-base leading-relaxed">
           Review cards, take exams, track progress with spaced repetition.
         </CardDescription>
       </CardHeader>
       <CardContent>
         <span className="inline-flex items-center gap-2 text-sm font-medium text-primary group-hover:underline">
           Enter Study Dome
           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
           </svg>
         </span>
       </CardContent>
     </Card>
   </Link>
   ```

**Tests**:
- Hero section responsive on mobile (4xl text) and desktop (6xl text)
- Spacing: verify 24px gaps, 32px vertical margins
- Gradient visibility: test in light and dark mode
- Cards: hover effects work on both mouse and touch
- Touch targets: cards and links >= 48px

**Commit**: `feat: redesign homepage hero with improved typography & spacing`

---

### Task 2.2: Enhance Card Navigation CTAs

**What**: Improve the visual and interactive design of the Study Dome and AI Factory cards to feel more like native app launchers.

**Files**:
- `src/app/(main)/page.tsx` (continue from Task 2.1)

**Implementation notes**:

1. **Card refinement**:
   - Add icon box with background (rounded, subtle color)
   - Increase icon size (from 10x10 to 12x12)
   - Better visual separation between content areas
   - Improved hover state (color shift, scale, shadow)

   ```tsx
   <Card className="group h-full cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-primary/50 hover:shadow-primary/10">
     <CardHeader className="pb-4">
       {/* Icon box */}
       <div className="mb-4 inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
         <RiBookOpenLine className="h-6 w-6 text-primary" />
       </div>
       <CardTitle className="text-2xl">Study Dome</CardTitle>
       <CardDescription className="text-base text-muted-foreground/90">
         Review cards, take exams, and track your progress with spaced repetition.
       </CardDescription>
     </CardHeader>
     <CardContent className="flex items-center">
       <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary group-hover:gap-3 transition-all">
         Enter Study Dome
         <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
         </svg>
       </span>
     </CardContent>
   </Card>
   ```

2. **Spacing consistency**:
   - CardHeader padding: top=24px, bottom=16px, left/right=24px
   - CardContent padding: 24px
   - Card gap between cards: 24px (md: 24px)

**Tests**:
- Card icons render with correct background color
- Hover states smooth (no jumps)
- Arrow animation on hover works in both light/dark mode
- Cards stack single column on mobile, 2-column on md+
- Touch feedback (slight scale/shadow) on mobile tap

**Commit**: `feat: enhance card navigation design with icon boxes and improved hover states`

---

## Phase 3 — Mobile App Aesthetic

### Task 3.1: Add App-Like Container Structure

**What**: Introduce a visual "app frame" on desktop and mobile — bounded max-width container with safe padding, making the interface feel like a true native app.

**Files**:
- `src/components/boxed.tsx` (update)
- `src/app/globals.css` (add container utilities)

**Implementation notes**:

1. **Update `Boxed` component** to support app-like padding:
   ```tsx
   export function Boxed({ className, children }: { className?: string; children: React.ReactNode }) {
     return (
       <div className={cn(
         "mx-auto w-full max-w-7xl px-4 md:px-8", // responsive padding
         className
       )}>
         {children}
       </div>
     );
   }
   ```

2. **Add to globals.css** for visual app frame (optional, but enhances effect):
   ```css
   /* App container visual (subtle border on larger screens) */
   @media (min-width: 1024px) {
     body {
       background-color: var(--color-background-secondary, #f5f5f5);
     }
     
     .app-frame {
       background-color: var(--color-background);
       border-radius: 12px;
       box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
     }
   }
   ```

3. **Navbar and Footer** should extend full width (no max-width) for visual grounding.

**Tests**:
- Desktop: content has max-width, centered with breathing room on sides
- Mobile: full-width with 16px padding
- Tablet: responsive padding scales appropriately
- Dark mode: background colors clear

**Commit**: `style: implement app-like container structure with responsive padding`

---

### Task 3.2: Polish Spacing & Alignment

**What**: Ensure all spacing follows 4px/8px grid (4, 8, 12, 16, 20, 24, 28, 32px), improving visual hierarchy and consistency across the app.

**Files**:
- `src/app/(main)/page.tsx` (update spacing values)
- Review all component spacing in `src/components/`

**Implementation notes**:

1. **Spacing scale** (update all components to follow this):
   - xs: 4px (`gap-1`, `p-1`)
   - sm: 8px (`gap-2`, `p-2`)
   - md: 12px (`gap-3`, `p-3`)
   - lg: 16px (`gap-4`, `p-4`)
   - xl: 20px (`gap-5`, `p-5`)
   - 2xl: 24px (`gap-6`, `p-6`)
   - 3xl: 32px (`gap-8`, `p-8`)
   - 4xl: 40px (`gap-10`, `p-10`)

2. **Review homepage** (`src/app/(main)/page.tsx`):
   - Hero padding: `py-24 md:py-32` (96px to 128px vertical)
   - Hero margin bottom: `mb-20 md:mb-32` (80px to 128px)
   - Card gap: `gap-6` (24px)
   - Spacing in hero text section: `space-y-6` (24px between h1 and p)

3. **Navbar & Footer**:
   - Horizontal padding: 24px (md: 32px)
   - Vertical padding: 16px (fixed height 56px)

**Tests**:
- No odd spacing values (not 7, 13, 18, etc.)
- All padding/margin/gap use Tailwind scale
- Visual alignment consistent across pages
- Cards, buttons, forms follow 8px baseline grid

**Commit**: `style: standardize spacing to 4px/8px grid across homepage & components`

---

## Phase 4 — Responsive Polish & Testing

### Task 4.1: Responsive Breakpoint Testing

**What**: Verify layout, footer, and hero rendering correctly at key breakpoints (mobile 375px, tablet 768px, desktop 1024px+).

**Files**:
- All updated files from Phases 1–3

**Implementation notes**:

1. **Mobile (375px)** — iPhone SE:
   - Hero: 4xl heading, single-column cards
   - Navbar: logo only (text hidden)
   - Footer: stacked layout, single column
   - Safe areas: respected on notched devices

2. **Tablet (768px)** — iPad:
   - Hero: 5xl heading, 2-column cards side-by-side
   - Navbar: logo + nav links visible
   - Footer: flex row, justify-between

3. **Desktop (1024px+)**:
   - Hero: 6xl heading, 2-column cards with max-width container
   - Full navbar + footer layout
   - App frame visible (optional subtle border)

4. **Test in Chrome DevTools**:
   - Toggle device emulation for each breakpoint
   - Test iOS 15+ (iPhone 13/14 with notch)
   - Test landscape orientation on mobile

**Tests**:
- No horizontal scroll on any device
- Footer always at bottom (not floating mid-page)
- Typography scales smoothly (no jumping)
- Touch targets >= 48px on mobile
- Safe areas (notch, home indicator) respected

**Commit**: `test: verify responsive layout at mobile/tablet/desktop breakpoints`

---

### Task 4.2: Cross-Browser & Dark Mode Testing

**What**: Verify layout, safe areas, and hero styling in Chrome, Safari, Firefox, and both light/dark color schemes.

**Implementation notes**:

1. **Browsers**:
   - Chrome/Edge (latest): baseline
   - Safari (iOS 15+): safe-area-inset rendering
   - Firefox: flexbox + env() support
   - Safari desktop: dark mode toggle

2. **Dark mode**:
   - Navbar/footer readability (border-t contrast)
   - Card hover states (shadow, border colors)
   - Gradient text in hero (should be visible in both modes)
   - Background colors in safe-area CSS

3. **Test devices** (actual or emulated):
   - iPhone with notch (Dynamic Island)
   - iPhone with home indicator
   - Android with status bar
   - Desktop with notched monitor (rare, but safe-area-inset should handle)

**Tests**:
- No FOUC (flash of unstyled content)
- Safe areas applied correctly on iOS
- Colors meet WCAG AA contrast ratios
- Footer not flickering when scrolling
- Hero gradient visible in light and dark mode

**Commit**: `test: verify cross-browser and dark mode compatibility`

---

## Phase 5 — Documentation & Polish

### Task 5.1: Update README with Layout Info

**What**: Document the new layout architecture and how to customize safe areas / spacing.

**Files**:
- `README.md`
- `docs/architecture.md` (optional)

**Implementation notes**:

1. **README update** — add a "Design & Layout" section:
   ```markdown
   ## Design & Layout

   StudyToolbox is built with a **local-first, mobile-first approach**:

   - **Safe-area aware**: Respects iOS notches, Dynamic Islands, and home indicators
   - **Sticky footer**: Footer always stays at the bottom using flexbox
   - **Responsive**: Optimized for mobile (375px), tablet (768px), and desktop (1024px+)
   - **Touch-friendly**: All interactive elements >= 48px tap targets

   ### Spacing Grid
   Built on a consistent 4px/8px grid. See [tailwind.config.ts](./tailwind.config.ts) for the spacing scale.

   ### Customizing Padding
   Safe areas are automatically applied via CSS `env()` variables. No changes needed for default behavior.
   ```

2. **Keep README slim** — link to `docs/` for full architecture details if needed.

**Commit**: `docs: add layout and design documentation to README`

---

### Task 5.2: Visual Polish & Final Tweaks

**What**: Final refinements to colors, hover effects, transitions, and visual polish. Ensure the app feels cohesive and professional.

**Files**:
- `src/components/navbar.tsx`
- `src/components/footer.tsx`
- `src/app/(main)/page.tsx`
- `src/app/globals.css`

**Implementation notes**:

1. **Transitions & animations**:
   - Navbar: smooth border-color transition on scroll (if sticky)
   - Cards: `transition-all duration-200` for hover scale + shadow
   - Icons: `transition-transform` for arrow animation
   - No janky repaints

2. **Color polish**:
   - Primary color consistency (border-primary, text-primary, bg-primary/10)
   - Muted colors for secondary text (text-muted-foreground)
   - Use semantic color tokens (from theme), never raw hex

3. **Final visual check**:
   - Gradients smooth and visually cohesive
   - No color clashing between light/dark mode
   - Icons properly aligned (vertical/horizontal centering)
   - Footer text wraps cleanly on mobile

**Tests**:
- Hover states smooth and responsive
- Transitions don't cause layout shift (CLS = 0)
- Color contrast passes WCAG AA on all text
- Animations feel natural (no easing jank)

**Commit**: `style: final visual polish — transitions, colors, alignment`

---

## Phase 6 — Final Testing & Verification

### Task 6.1: Full E2E Visual Regression Testing

**What**: Verify the entire redesigned layout with manual testing across all pages and breakpoints.

**Implementation notes**:

1. **Desktop (1440px)**:
   - Visit homepage → hero, cards render correctly
   - Visit /study-dome → layout maintains footer at bottom
   - Visit /ai-factory → same footer behavior
   - Test light and dark mode

2. **Mobile (375px)**:
   - Homepage hero stacks properly
   - Cards single-column
   - Navbar logo visible, nav links hidden
   - Footer readable, not overlapped by safe areas

3. **Tablet (768px)**:
   - Cards 2-column
   - Navbar nav links visible
   - Footer flex layout works

4. **Specific checks**:
   - Scroll to bottom on page with minimal content → footer at bottom
   - Scroll on page with overflow → footer stays at bottom after scroll
   - Check safe areas on iOS emulation (DevTools)
   - Test on actual device if possible

**Tests**:
- No visual regressions compared to current design
- Footer position correct on all pages
- Responsive breakpoints working as designed
- Safe areas applied without layout breaking
- All links/buttons functional

**Commit**: `test: comprehensive visual regression testing across all pages & breakpoints`

---

### Task 6.2: Accessibility Audit

**What**: Ensure the redesigned layout meets WCAG AA accessibility standards (focus states, color contrast, semantic HTML, screen reader support).

**Implementation notes**:

1. **Keyboard navigation**:
   - Tab through navbar links → all focusable
   - Tab through cards → focus ring visible
   - Tab to footer links → all reachable
   - No keyboard traps

2. **Color contrast**:
   - Navbar text vs background: >= 4.5:1
   - Footer text vs background: >= 4.5:1
   - Card heading vs background: >= 4.5:1
   - Run [WebAIM Color Contrast Checker](https://webaim.org/resources/contrastchecker/)

3. **Screen reader** (test with NVDA or VoiceOver):
   - Navbar landmark announced (nav)
   - Main landmark announced (main)
   - Footer landmark announced (contentinfo)
   - Card titles and descriptions readable

4. **Semantic HTML**:
   - Navbar wrapped in `<header>` (implicit nav via links)
   - Main content in `<main>`
   - Footer in `<footer>`
   - Cards: Card components use `<article>` or div with proper roles

**Tests**:
- Tab order logical (top to bottom)
- Focus indicators visible (no `outline-none` without replacement)
- Color contrast >= WCAG AA on all text
- Screen reader announces structure correctly
- No ARIA misuse (only use when needed)

**Commit**: `test: accessibility audit — keyboard nav, contrast, semantic HTML`

---

## Execution Checklist

Before submitting, verify:

- [ ] Root layout uses `flex flex-col min-h-screen` (Task 1.1)
- [ ] Navbar and footer have safe-area-inset padding (Task 1.2)
- [ ] Meta viewport includes `viewport-fit=cover` (Task 1.2)
- [ ] Homepage hero redesigned with improved spacing (Task 2.1)
- [ ] Cards have icon boxes and improved hover effects (Task 2.2)
- [ ] Spacing follows 4px/8px grid consistently (Task 3.2)
- [ ] Responsive testing passed on mobile/tablet/desktop (Task 4.1)
- [ ] Cross-browser and dark mode testing passed (Task 4.2)
- [ ] README updated with layout documentation (Task 5.1)
- [ ] Visual polish applied (transitions, colors) (Task 5.2)
- [ ] Full E2E visual regression testing passed (Task 6.1)
- [ ] Accessibility audit passed (Task 6.2)
- [ ] Every commit follows Conventional Commits format
- [ ] No uncommitted changes before handing off

---

## Notes for Implementation

1. **Safe areas on desktop**: Will be 0px (no effect) — this is expected. iOS notches/home indicators will automatically apply.
2. **Flexbox layout**: Once implemented, footer will never float mid-page — it's mathematically guaranteed by flex-grow behavior.
3. **Spacing refactor**: May touch many component files — group related changes (e.g., "spacing updates to navbar, footer, cards") into single commits.
4. **Testing order**: Mobile first, then tablet, then desktop — catch layout issues early.
5. **Git workflow**: Commit after each task. Don't push until the entire plan is complete.
