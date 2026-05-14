# Guaji AI Design System

**Guaji AI** (also marketed as "Oral AI") is a 24/7 AI-powered language speaking practice platform. Users set learning goals, receive personalized scenario-based conversation tasks, and practice speaking with an AI tutor in real-time. The brand voice is encouraging, professional, and approachable — designed to reduce language anxiety.

---

## Sources

| Resource | Location / Reference |
|---|---|
| Figma Design System | `https://www.figma.com/make/ZxUos3TyBDMjH9rAJHCB6B/Oral-AI-Design-System--Copy-` |
| Figma App Screens | `https://www.figma.com/make/DP23MGjdgnqVvJOUVfjxA3/Oral-AI-Desi` |
| Codebase | `oral_app/` (attached via File System Access) |
| GitHub Repo | `happepls/oral_app` (also: `happepls/guaji_flutter` for Flutter mobile client) |

---

## Product Overview

**Core product**: Mobile-first React web app (with a Flutter native client in progress).

### Key Screens
- **Landing/Welcome** — Marketing page + auth entry points
- **Onboarding** — Language profile setup (native language, learning goal)
- **Goal Setting** — Language selection, proficiency quiz, level & scenario generation
- **Discovery (Home)** — Streak ring, daily stats, Daily QA card, Retelling task, Scenario grid
- **Conversation** — Real-time AI voice chat; message bubbles, score popups, task tracking
- **Profile** — Streak calendar, session history, settings, subscription status
- **Subscription** — Freemium paywall (Free / Weekly / Annual)

### Architecture
- **Frontend**: React 19, Tailwind CSS, Material Symbols, Lucide icons, Framer Motion (motion/react)
- **Backend**: Node.js microservices (api-gateway, user-service, comms-service, ai-omni-service, etc.)
- **AI**: Qwen3-Omni via DashScope SDK
- **Database**: PostgreSQL + MongoDB + Redis

---

## Content Fundamentals

### Tone & Voice
- **Encouraging but professional**: "太棒了！你已完成所有场景" / "Keep going!"
- **Low-anxiety framing**: Never shame the user; celebrate small wins with achievements and streaks
- **Bilingual**: UI is Chinese-primary; English translations available. Copy is in Simplified Chinese for app surfaces, English for marketing/landing pages.
- **Direct CTAs**: "开始练习" (Start Practice), "开始回答" (Start Answering), "立即升级" (Upgrade Now)
- **Contextual greetings**: Time-of-day greetings — "早上好" / "下午好" / "晚上好"
- **Emoji in content** (not as icons): Scenario emojis (💼✈️☕), achievement emojis (🏆✅🎯), paywall teasers (👑🔒)
- **No emoji as functional UI icons** — icon system handles those

### Casing
- Chinese: Sentence case with fullwidth punctuation
- English: Title Case for navigation; Sentence case for body copy
- Numbers: Arabic numerals throughout (not Chinese 一二三)

### Copy Examples
- "24/7 AI 口语陪练" — short tagline
- "说出来的速度不需要追求完美，意思准确是第一步。" — tips copy
- "Pro 会员可无限次再次回答与换题" — paywall copy
- "太棒了！你已完成所有 N 个场景，成功达到 X 水平目标！" — achievement

---

## Visual Foundations

### Colors
See `colors_and_type.css` for full CSS variables.

| Token | Value | Usage |
|---|---|---|
| `--primary` | `#637FF1` | Buttons, links, active states, brand accent |
| `--primary-light` | `#c3cef8` | Light tints, hover backgrounds |
| `--primary-dark` | `#2d44ca` | Pressed states, dark variant |
| `--secondary` | `#a47af6` | AI avatar, gradient pair, accent |
| `--success` | `#10B981` | Completion, correct, streak indicators |
| `--warning` | `#F59E0B` | Intermediate difficulty, caution |
| `--error` | `#e2412e` | Error states, advanced difficulty, delete |
| `--background-light` | `#f6f7f8` | App background (light mode) |
| `--background-dark` | `#101922` | App background (dark mode) |
| `--card` | `#ffffff` | Card surfaces |
| `--muted` | `#ececf0` | Dividers, skeleton loaders |
| `--muted-foreground` | `#717182` | Secondary text, placeholders |
| `--border` | `rgba(0,0,0,0.1)` | Subtle borders |

**Gradient**: `linear-gradient(135deg, #637FF1, #a47af6)` — used on FAB, hero elements, CTAs, avatar initials

### Typography
- **Display font**: [Lexend](https://fonts.google.com/specimen/Lexend) — `font-family: 'Lexend', sans-serif`
  - Used for all UI text (headings, body, buttons)
  - ⚠️ Font is loaded from Google Fonts CDN; no local font files in codebase
- **Monospace**: `source-code-pro, Menlo, Monaco, Consolas` (code blocks only)
- **Scale**: H1 36px/600, H2 30px/600, H3 24px/500, Body-lg 18px/400, Body 16px/400, Body-sm 14px/400, Caption 12px/400

### Spacing
Scale (Tailwind): 8, 12, 16, 24, 32, 48, 64px

### Border Radius
| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | `10px` | Chips, tags, small elements |
| `--radius-md` | `13px` | Input fields, cards |
| `--radius-lg` | `20px` | Large cards, scenario cards |
| `--radius-xl` | `29px` | Modals, containers |
| `9999px` | `full` | Pills, avatars, FAB |

### Shadows
| Name | Value | Usage |
|---|---|---|
| `shadow-brand` | `0 10px 23px rgba(137,171,241,0.18)` | Cards, floating elements |
| `shadow-brand-lg` | `0 16px 32px rgba(137,171,241,0.24)` | Modals, elevated elements |
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle depth |
| `shadow-md` | `0 4px 6px -1px rgba(0,0,0,0.1)` | Buttons, inputs |
| `shadow-lg` | `0 10px 15px -3px rgba(0,0,0,0.1)` | Modals, popovers |

### Motion & Animation
- **Library**: Framer Motion (`motion/react`)
- **Card hover**: `whileHover={{ y: -4 }}` with `duration: 0.25, ease: [0.4, 0, 0.2, 1]`
- **Modal enter**: `scale: 0.9 → 1, opacity: 0 → 1`
- **Sheet/drawer**: slides up from bottom `y: 40 → 0, opacity: 0 → 1`
- **Banner**: `slideUpBanner` keyframe animation (CSS)
- **Loading**: `animate-spin`, `animate-pulse`
- **Press states**: `active:scale-95` (Tailwind)

### Cards
- Background: `#ffffff`
- Border: `1px solid #E5E7EB` or `1px solid rgba(0,0,0,0.1)`
- Border radius: `rounded-2xl` (20px) for scenario cards; `rounded-3xl` (24px) for modals
- Shadow: `shadow-sm` or `shadow-brand`
- Hover: card lifts `y: -4px`

### Backgrounds
- App BG: solid `#f6f7f8` (light), `#101922` (dark)
- No full-bleed images; no repeating patterns
- Gradient used sparingly on CTAs and FAB
- Scenario card image area: `linear-gradient(to bottom-right, indigo-50, purple-100)` as placeholder

### Hover / Press States
- Hover: `hover:border-primary/40`, `hover:bg-slate-50`, card lift (`y: -4`)
- Press: `active:scale-95`, button darkens slightly
- Links: `hover:text-primary`

### Iconography
See ICONOGRAPHY section below.

### Dark Mode
Full dark mode support via Tailwind `dark:` class variants and `darkMode: "class"`. Background switches to `#101922`, cards to `slate-800`, text to white/slate-100.

---

## Iconography

**Two icon systems are used in combination:**

1. **Material Symbols Outlined** — loaded from Google CDN
   - Used in bottom navigation: `home`, `target`, `person`, `mic`
   - Usage: `<span class="material-symbols-outlined">icon_name</span>`
   - Font variation: `'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24`
   - CDN: `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined`

2. **Lucide React** — imported as React components
   - Used throughout app for feature icons
   - Key icons: `Play`, `Clock`, `Star`, `Lock`, `Bot`, `Languages`, `ArrowLeft`, `Settings`, `Flame`, `Crown`, `ChevronRight`, etc.
   - CDN (for static HTML): `https://unpkg.com/lucide@latest/dist/umd/lucide.js`

**Emoji in content**: Scenario emojis (💼✈️☕🏥), achievement emojis (🏆✅🎯👑), used as decorative content elements — not functional icons.

**No custom SVG icon set** — the app relies entirely on Material Symbols + Lucide.

---

## Files

| Path | Description |
|---|---|
| `README.md` | This file — product context, design system overview |
| `colors_and_type.css` | CSS custom properties for all tokens |
| `assets/` | Visual assets (logos extracted from Figma) |
| `preview/` | Design system preview cards (registered in Design System tab) |
| `ui_kits/mobile_app/` | Mobile app UI kit — interactive click-thru prototype |
| `SKILL.md` | Agent skill manifest |

---

## UI Kits

| Kit | Path | Description |
|---|---|---|
| Mobile App | `ui_kits/mobile_app/index.html` | Interactive click-thru: Home, Conversation, Goal Setting, Profile |

---

## Index / Manifest

```
Guaji AI Design System/
├── README.md                       # This file — context, foundations, guidelines
├── SKILL.md                        # Agent skill manifest
├── colors_and_type.css             # CSS variables + base styles
├── preview/                        # Design System tab preview cards
│   ├── colors-brand.html
│   ├── colors-semantic.html
│   ├── colors-surfaces.html
│   ├── type-scale.html
│   ├── type-family.html
│   ├── spacing-tokens.html
│   ├── spacing-radius.html
│   ├── spacing-shadows.html
│   ├── components-buttons.html
│   ├── components-inputs.html
│   ├── components-badges.html
│   ├── components-messages.html
│   ├── components-scenario-card.html
│   ├── components-bottom-nav.html
│   └── brand-identity.html
└── ui_kits/
    └── mobile_app/
        ├── index.html              # Entry point
        ├── components.jsx          # Shared building blocks (Card, Btn, Bubble, …)
        ├── screens.jsx             # Discovery, Conversation, GoalSetting, Profile
        └── ios-frame.jsx           # iPhone bezel starter
```

## Quick Reference

**To use this design system in a new file:**
```html
<link rel="stylesheet" href="colors_and_type.css">
```

**Most-used CSS variables:**
- Backgrounds: `var(--background)`, `var(--card)`
- Brand: `var(--primary)`, `var(--gradient-brand)`
- Text: `var(--foreground)`, `var(--foreground-muted)`
- Spacing: `var(--space-2)` through `var(--space-16)`
- Radius: `var(--radius-md)` (inputs), `var(--radius-lg)` (cards)
- Shadow: `var(--shadow-brand)` (cards/CTAs), `var(--shadow-card)` (subtle)
