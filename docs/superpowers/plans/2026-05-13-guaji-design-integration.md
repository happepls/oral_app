# Guaji AI Design System Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the entire frontend visual layer with the Guaji AI Design System, using image-based mascot assets for the AI tutor, while preserving all business logic.

**Architecture:** Component-first migration in 4 phases: (1) design infrastructure (CSS + assets), (2) shared components, (3) page-level replacements, (4) build verification. Each component references `figma_app_template/Guaji AI_Design_System/` as the design source-of-truth.

**Tech Stack:** React 19 (CRA via react-app-rewired), Tailwind CSS, Framer Motion (`motion/react`), Lucide React, Material Symbols, CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-05-13-guaji-design-system-integration.md`

---

## File Structure

### New Files
```
client/public/mascot/           # Cropped mascot expression/scenario images
  happy.png
  excited.png
  surprised.png
  thinking.png
  winking.png
  loving.png
  sleepy.png
  confused.png
  proud.png
  speaking.png
  listening.png
  thumbsup.png
  correct.png
  tryagain.png
  guiding.png
client/public/guaji-logo.svg    # Brand logo SVG
client/public/guaji-icon.jpg    # App icon (avatar)
client/src/guaji-design.css     # Design system CSS variables + utility classes
client/src/components/GuajiMascot.jsx   # Image-based mascot (CC mode)
client/src/components/GuajiAvatar.jsx   # Small round avatar (chat bubbles)
client/src/components/MicBar.jsx        # Recording button bar
client/src/components/VoiceBubble.jsx   # Waveform audio playback widget
client/src/components/ConvHeader.jsx    # Conversation page header
client/src/components/HintBanner.jsx    # Tip/hint banner
client/src/components/DiffBadge.jsx     # Difficulty badge (beginner/intermediate/advanced)
```

### Modified Files
```
client/src/index.js                 # Add guaji-design.css import
client/public/index.html            # Update meta theme-color, favicon ref
client/src/components/BottomNav.js   # Redesign to 3-tab (home/goals/profile)
client/src/components/StatCard.jsx   # Replace with StatMini design
client/src/components/StreakRing.jsx  # Replace with DS StreakRing
client/src/components/ScenarioCard.jsx # Replace with 2-col grid card
client/src/components/MessageBubble.jsx # Add GuajiAvatar, VoiceBubble
client/src/components/AiAvatar.jsx   # Replace with GuajiMascot
client/src/pages/Discovery.js       # Full layout replacement
client/src/pages/Conversation.js    # Add CC mode, task tray, MicBar
client/src/pages/Landing.js         # Replace with guajiguaji.top design
client/src/pages/GoalSetting.js     # Visual update to DS layout
client/src/pages/Profile.js         # Visual update to DS layout
client/src/pages/Subscription.js    # Visual update to DS layout
```

### Deleted Files
```
client/src/components/DashScenarioCard.jsx  # Merged into ScenarioCard
```

---

## Phase 1: Design Infrastructure

### Task 1: CSS Design Tokens

**Files:**
- Create: `client/src/guaji-design.css`
- Modify: `client/src/index.js`

- [ ] **Step 1: Create the design system CSS file**

Copy the CSS variables and utility classes from the design system source. The file path for reference is `figma_app_template/Guaji AI_Design_System/colors_and_type.css`.

Create `client/src/guaji-design.css` with the full content of the design system CSS. Key sections:
1. `:root` block with all `--primary`, `--secondary`, `--success`, `--warning`, `--error`, `--background`, `--card`, `--foreground-*`, `--border-*`, `--gradient-*`, `--shadow-*`, `--radius-*`, `--space-*`, `--font-*` variables
2. Semantic typography classes: `.text-h1` through `.text-caption`, `.text-label`
3. Utility classes: `.text-primary`, `.bg-primary`, `.border-default`, `.rounded-*`, `.shadow-*`
4. Component base styles: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.card`, `.input`, `.badge`, `.badge-*`
5. Mascot keyframe animations: `mascot-bob`, `mascot-blink`, `mascot-think-dot`, `mascot-arm`

Do NOT include the `@import url()` for fonts (already in `index.html`) or the base reset (already in `index.css`).

- [ ] **Step 2: Import the CSS in index.js**

Add to `client/src/index.js` **before** the existing `./index.css` import:

```js
import './guaji-design.css';
```

The import order should be: `guaji-design.css` → `index.css` → `i18n` → `App`.

- [ ] **Step 3: Verify build succeeds**

```bash
cd client && npm run build 2>&1 | tail -5
```

Expected: `Compiled successfully.`

- [ ] **Step 4: Commit**

```bash
git add client/src/guaji-design.css client/src/index.js
git commit -m "feat: add Guaji design system CSS tokens and utility classes"
```

---

### Task 2: Static Assets (Logo, Favicon, Mascot Images)

**Files:**
- Create: `client/public/guaji-logo.svg`, `client/public/guaji-icon.jpg`, `client/public/mascot/*.png`
- Modify: `client/public/index.html`

- [ ] **Step 1: Copy brand assets**

```bash
cp "figma_app_template/Guaji AI_Design_System/assets/logo.svg" client/public/guaji-logo.svg
cp "figma_app_template/Guaji AI_Design_System/assets/logo-app-icon.jpg" client/public/guaji-icon.jpg
```

- [ ] **Step 2: Create mascot directory and crop expression images**

Create `client/public/mascot/` directory. The source images are composites — each expression/scenario is arranged in a grid. Use ImageMagick or a Python script to crop each individual character into separate PNGs.

For `expression_variations.jpg` (2 rows × 5 columns):
```bash
mkdir -p client/public/mascot
# Use Python PIL to crop — the image is ~1200×600 with 5 cols × 2 rows
python3 -c "
from PIL import Image
import os

img = Image.open('figma_app_template/expression_variations.jpg')
w, h = img.size
cols, rows = 5, 2
cw, ch = w // cols, h // rows

names = [
  ['happy', 'excited', 'surprised', 'thinking', 'winking'],
  ['loving', 'sleepy', 'confused', 'confused2', 'proud']
]

for r in range(rows):
  for c in range(cols):
    box = (c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)
    crop = img.crop(box)
    name = names[r][c]
    crop.save(f'client/public/mascot/{name}.png')
    print(f'  saved {name}.png ({crop.size})')
"
```

For `GuaJi_Bird_Interactive_Scenarios.png` (3 rows × 5 columns):
```bash
python3 -c "
from PIL import Image

img = Image.open('figma_app_template/GuaJi_Bird_Interactive_Scenarios.png')
w, h = img.size
cols, rows = 5, 3
cw, ch = w // cols, h // rows

names = [
  ['speaking', 'listening', 'listening2', 'thumbsup', 'correct'],
  ['correct2', 'breaking', 'tryagain', 'recording', 'enticing'],
  ['practicing', 'practicing2', 'achievement', 'guiding', 'guiding2']
]

for r in range(rows):
  for c in range(cols):
    box = (c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)
    crop = img.crop(box)
    name = names[r][c]
    crop.save(f'client/public/mascot/{name}.png')
    print(f'  saved {name}.png ({crop.size})')
"
```

If PIL is not installed, run `pip3 install Pillow` first.

- [ ] **Step 3: Update index.html meta**

In `client/public/index.html`, change the theme-color meta tag:

```html
<meta name="theme-color" content="#637FF1" />
```

And update the description:

```html
<meta name="description" content="GuaJi AI - 24/7 AI口语练习伙伴" />
```

- [ ] **Step 4: Verify assets are accessible**

```bash
ls client/public/mascot/*.png | wc -l
ls client/public/guaji-logo.svg client/public/guaji-icon.jpg
```

Expected: At least 15 mascot PNGs, plus logo.svg and icon.jpg.

- [ ] **Step 5: Commit**

```bash
git add client/public/mascot/ client/public/guaji-logo.svg client/public/guaji-icon.jpg client/public/index.html
git commit -m "feat: add GuaJi mascot assets, brand logo, and app icon"
```

---

## Phase 2: Shared Components

### Task 3: GuajiMascot + GuajiAvatar Components

**Files:**
- Create: `client/src/components/GuajiMascot.jsx`
- Create: `client/src/components/GuajiAvatar.jsx`

- [ ] **Step 1: Create GuajiMascot component**

This is the large mascot used in CC (immersive) mode. It renders an `<img>` tag that switches based on `state` and `mood` props. It replaces the old `AiAvatar.jsx`.

Create `client/src/components/GuajiMascot.jsx`:

```jsx
import { motion, AnimatePresence } from 'motion/react';

const STATE_IMAGES = {
  idle: '/mascot/happy.png',
  speaking: '/mascot/speaking.png',
  listening: '/mascot/listening.png',
  thinking: '/mascot/thinking.png',
  correct: '/mascot/correct.png',
  tryagain: '/mascot/tryagain.png',
  achievement: '/mascot/achievement.png',
  guiding: '/mascot/guiding.png',
  recording: '/mascot/recording.png',
  practicing: '/mascot/practicing.png',
};

const MOOD_IMAGES = {
  happy: '/mascot/happy.png',
  excited: '/mascot/excited.png',
  surprised: '/mascot/surprised.png',
  thinking: '/mascot/thinking.png',
  winking: '/mascot/winking.png',
  loving: '/mascot/loving.png',
  sleepy: '/mascot/sleepy.png',
  confused: '/mascot/confused.png',
  proud: '/mascot/proud.png',
};

export function GuajiMascot({ state = 'idle', mood, size = 200, className = '' }) {
  const src = mood ? (MOOD_IMAGES[mood] || MOOD_IMAGES.happy) : (STATE_IMAGES[state] || STATE_IMAGES.idle);

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <AnimatePresence mode="wait">
        <motion.img
          key={src}
          src={src}
          alt={`GuaJi ${state}`}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1, y: [0, -5, 0] }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.3, y: { duration: 3, repeat: Infinity, ease: 'easeInOut' } }}
          style={{ width: size, height: size, objectFit: 'contain' }}
          draggable={false}
        />
      </AnimatePresence>

      {state === 'thinking' && (
        <div style={{
          position: 'absolute', top: 8, right: '30%',
          background: '#fff', borderRadius: 14, padding: '6px 10px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', display: 'flex', gap: 4
        }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              width: 6, height: 6, borderRadius: '50%', background: 'var(--secondary)',
              animation: `mascot-think-dot 1.2s ${i * 0.15}s infinite`
            }} />
          ))}
        </div>
      )}

      {state === 'speaking' && (
        <div style={{
          position: 'absolute', bottom: '10%', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 2, alignItems: 'center'
        }}>
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              style={{ width: 3, borderRadius: 2, background: 'var(--secondary)' }}
              animate={{ height: ['8px', '20px', '8px'] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.1 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create GuajiAvatar component**

This is the small round avatar used in message bubbles (36-40px). Uses the app icon.

Create `client/src/components/GuajiAvatar.jsx`:

```jsx
export function GuajiAvatar({ size = 36, className = '' }) {
  return (
    <div
      className={`rounded-full overflow-hidden flex-shrink-0 ${className}`}
      style={{
        width: size, height: size,
        background: 'linear-gradient(135deg, #D4C4F0, #E8DFFB)',
      }}
    >
      <img
        src="/guaji-icon.jpg"
        alt="GuaJi"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        draggable={false}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
cd client && npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/GuajiMascot.jsx client/src/components/GuajiAvatar.jsx
git commit -m "feat: add GuajiMascot and GuajiAvatar components"
```

---

### Task 4: VoiceBubble + DiffBadge Components

**Files:**
- Create: `client/src/components/VoiceBubble.jsx`
- Create: `client/src/components/DiffBadge.jsx`

- [ ] **Step 1: Create VoiceBubble**

Port from `screens.jsx` VoiceBubble. This renders a play button + waveform bars + duration label.

Create `client/src/components/VoiceBubble.jsx`:

```jsx
export function VoiceBubble({ duration = '3.4s', dark = false, bars = 24, accent, onPlay }) {
  const c = accent || 'var(--primary)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
      <button onClick={onPlay} style={{
        width: 30, height: 30, borderRadius: '50%', background: c,
        border: 'none', color: '#fff', cursor: 'pointer', fontSize: 11, padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
      }}>&#9654;</button>
      <div style={{ display: 'flex', gap: 2, alignItems: 'center', flex: 1, height: 22 }}>
        {Array.from({ length: bars }, (_, i) => {
          const h = 4 + Math.abs(Math.sin(i * 1.7)) * 14 + i % 3 * 2;
          return <div key={i} style={{ width: 2.5, height: h, background: c, opacity: dark ? 0.85 : 0.6, borderRadius: 1 }} />;
        })}
      </div>
      <span style={{ fontSize: 10, color: dark ? 'rgba(255,255,255,0.7)' : 'var(--foreground-muted)', flexShrink: 0, fontWeight: 500 }}>{duration}</span>
    </div>
  );
}
```

- [ ] **Step 2: Create DiffBadge**

Port from `components.jsx` DiffBadge. Renders a colored pill showing difficulty level.

Create `client/src/components/DiffBadge.jsx`:

```jsx
const DIFF_MAP = {
  beginner: ['#10B981', '初级'],
  intermediate: ['#F6B443', '中级'],
  advanced: ['#FB7250', '高级'],
};

export function DiffBadge({ diff }) {
  const [bg, label] = DIFF_MAP[diff] || ['#9CA3AF', diff];
  return (
    <span style={{
      background: bg, color: '#fff', borderRadius: 9999,
      fontSize: 10, fontWeight: 600, padding: '2px 8px',
      display: 'inline-block',
    }}>{label}</span>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
cd client && npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/VoiceBubble.jsx client/src/components/DiffBadge.jsx
git commit -m "feat: add VoiceBubble and DiffBadge components"
```

---

### Task 5: MicBar + ConvHeader + HintBanner Components

**Files:**
- Create: `client/src/components/MicBar.jsx`
- Create: `client/src/components/ConvHeader.jsx`
- Create: `client/src/components/HintBanner.jsx`

- [ ] **Step 1: Create MicBar**

Port from `screens.jsx` MicBar. The main voice input CTA at the bottom of conversation pages.

Create `client/src/components/MicBar.jsx`:

```jsx
export function MicBar({ recording, onMic, onRestart, label, secondary, className = '' }) {
  return (
    <div className={className} style={{
      padding: '12px 16px 18px', display: 'flex', alignItems: 'center', gap: 10,
      background: 'var(--card)', borderTop: '1px solid var(--border-solid)'
    }}>
      <button onClick={onMic} style={{
        flex: 1, height: 56, borderRadius: 28, border: 'none', cursor: 'pointer',
        background: recording ? 'linear-gradient(135deg, var(--error), #f87171)' : 'var(--gradient-brand)',
        color: '#fff', fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        boxShadow: 'var(--shadow-brand-lg)',
        transform: recording ? 'scale(0.98)' : 'scale(1)',
        transition: 'transform 120ms',
        animation: recording ? 'mic-pulse 1.2s ease-in-out infinite' : 'none',
      }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>&#127908;</span>
        {recording ? '正在录音…' : label || '点击说话'}
      </button>
      {secondary}
      {onRestart && (
        <button onClick={onRestart} aria-label="restart" style={{
          width: 48, height: 48, borderRadius: 24, border: '1.5px solid var(--warning)',
          background: 'rgba(245,158,11,0.08)', color: 'var(--warning)',
          cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontFamily: 'inherit',
        }}>&#8635;</button>
      )}
      <style>{`@keyframes mic-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(99,127,241,0.6), var(--shadow-brand-lg); }
        50% { box-shadow: 0 0 0 12px rgba(99,127,241,0), var(--shadow-brand-lg); }
      }`}</style>
    </div>
  );
}
```

- [ ] **Step 2: Create ConvHeader**

Port from `screens.jsx` ConvHeader. Close button + title + optional task dots + online pill.

Create `client/src/components/ConvHeader.jsx`:

```jsx
export function ConvHeader({ onBack, title, dots, online = true }) {
  return (
    <div style={{
      padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
      background: 'var(--card)', borderBottom: '1px solid var(--border-solid)',
    }}>
      <button onClick={onBack} aria-label="close" style={{
        width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border-solid)',
        background: 'var(--background)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--foreground-muted)', fontSize: 16, padding: 0, flexShrink: 0,
      }}>&times;</button>
      <div style={{
        flex: 1, fontSize: 16, fontWeight: 700, color: 'var(--foreground)',
        minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{title}</div>
      {dots && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {dots.map((active, i) => (
            <span key={i} style={{
              width: 6, height: 6, borderRadius: '50%',
              background: active ? 'var(--primary)' : 'var(--border-solid)',
            }} />
          ))}
        </div>
      )}
      {online && (
        <span style={{
          background: 'rgba(16,185,129,0.12)', color: 'var(--success)',
          fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 9999,
          display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
          在线
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create HintBanner**

Create `client/src/components/HintBanner.jsx`:

```jsx
export function HintBanner({ text, onSkip }) {
  return (
    <div style={{ margin: '0 14px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        flex: 1, padding: '9px 12px', borderRadius: 'var(--radius-md)',
        background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)',
        fontSize: 12, color: 'var(--foreground-secondary)', lineHeight: 1.45,
      }}>&#128161; {text}</div>
      {onSkip && (
        <button onClick={onSkip} style={{
          padding: '8px 14px', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-solid)', background: 'var(--card)',
          color: 'var(--foreground-secondary)', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
        }}>跳过 &rarr;</button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
cd client && npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add client/src/components/MicBar.jsx client/src/components/ConvHeader.jsx client/src/components/HintBanner.jsx
git commit -m "feat: add MicBar, ConvHeader, HintBanner conversation components"
```

---

### Task 6: Replace BottomNav

**Files:**
- Modify: `client/src/components/BottomNav.js`

- [ ] **Step 1: Rewrite BottomNav to match design system**

The design system uses a 3-tab bottom nav (home/goals/profile) with Material Symbols icons. The current BottomNav has 4 tabs and uses a mix of Material Symbols + Lucide. Replace the entire component body.

Key changes:
- Remove the 4th tab (achievements) and FAB variant
- Use 3 tabs: home → `/discovery`, flag → `/goals`, person → `/profile`
- Use `var(--primary)` for active state color
- Bottom-safe padding with `paddingBottom: 8`
- Background: `rgba(246,247,248,0.96)` with blur
- Height: 72px

Reference: `figma_app_template/Guaji AI_Design_System/components.jsx` BottomNav function.

Preserve the `useNavigate` import and routing logic. Remove `Trophy` import (no longer needed). Keep the `currentPage` prop name for backwards compatibility.

- [ ] **Step 2: Verify build**

```bash
cd client && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/BottomNav.js
git commit -m "feat: redesign BottomNav to 3-tab Guaji design system layout"
```

---

### Task 7: Replace StatCard, StreakRing, ScenarioCard

**Files:**
- Modify: `client/src/components/StatCard.jsx`
- Modify: `client/src/components/StreakRing.jsx`
- Modify: `client/src/components/ScenarioCard.jsx`
- Delete: `client/src/components/DashScenarioCard.jsx`

- [ ] **Step 1: Replace StatCard with StatMini design**

The new StatMini is simpler: emoji icon + large value + small label, centered in a card. Remove the `trend`, `icon` (React element), and `color` props. New props: `emoji`, `value`, `label`.

Reference: `figma_app_template/Guaji AI_Design_System/components.jsx` StatMini function.

Keep the named export `StatCard` for backwards compatibility but adopt the StatMini visual layout.

- [ ] **Step 2: Replace StreakRing with DS design**

The new StreakRing uses `var(--primary)` blue color (not orange gradient). Layout: SVG ring on left + streak info on right + checkin button. Wrapped in a Card.

Reference: `figma_app_template/Guaji AI_Design_System/components.jsx` StreakRing function.

Keep existing props: `streak`, `checkedInToday`, `onCheckin`, `monthlyCheckinDays`, `totalPracticeMinutes`. Map `monthlyCheckinDays` → progress percentage (streak/30).

- [ ] **Step 3: Replace ScenarioCard with 2-col grid card**

The new design is a compact card for 2-column grid layout:
- Top: gradient placeholder area with large emoji + play icon badge + DiffBadge
- Bottom: title (truncated) + progress bar (if in-progress) + action button
- Lock overlay for locked scenarios

Reference: `figma_app_template/Guaji AI_Design_System/screens.jsx` scenario card in DiscoveryScreen (the grid items).

Import and use `DiffBadge` from `./DiffBadge`. Keep existing props: `title`, `emoji`, `difficulty`, `progress`, `state`, `onStart`.

- [ ] **Step 4: Delete DashScenarioCard**

```bash
rm client/src/components/DashScenarioCard.jsx
```

Search for imports of `DashScenarioCard` in the codebase and replace with `ScenarioCard`:

```bash
grep -r "DashScenarioCard" client/src/ --include="*.js" --include="*.jsx"
```

Update any files that import it.

- [ ] **Step 5: Verify build**

```bash
cd client && npm run build 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
git add client/src/components/StatCard.jsx client/src/components/StreakRing.jsx client/src/components/ScenarioCard.jsx
git rm client/src/components/DashScenarioCard.jsx 2>/dev/null; true
git add -u
git commit -m "feat: replace StatCard, StreakRing, ScenarioCard with Guaji design system"
```

---

### Task 8: Replace MessageBubble + AiAvatar

**Files:**
- Modify: `client/src/components/MessageBubble.jsx`
- Modify: `client/src/components/AiAvatar.jsx`

- [ ] **Step 1: Update MessageBubble**

Key changes:
- Replace the AI avatar (currently `Bot` icon or letter) with `GuajiAvatar` component
- Keep all existing props (`type`, `message`, `timestamp`, `state`, `translation`, `footer`)
- Update bubble border-radius to match DS: user `18px 18px 6px 18px`, AI `6px 18px 18px 18px`
- Add `VoiceBubble` rendering when the message has an `audioUrl` or `duration` prop

Import `GuajiAvatar` from `./GuajiAvatar` and `VoiceBubble` from `./VoiceBubble`.

Replace the avatar section for non-user messages: instead of the colored circle with Bot icon, render `<GuajiAvatar size={36} />`.

- [ ] **Step 2: Replace AiAvatar with GuajiMascot wrapper**

The current `AiAvatar.jsx` is used in Conversation.js for the CC (immersive) mode display. Replace its implementation to delegate to `GuajiMascot`.

Key changes:
- Remove all Keevx references (imageUrl, Sparkles, Lock, upgrade overlay)
- Import `GuajiMascot` from `./GuajiMascot`
- Map `status` prop to GuajiMascot `state` prop
- Keep existing prop names (`status`, `name`) for backwards compatibility with Conversation.js
- Remove `isPremium`, `showUpgradePrompt`, `onUpgradeClick` props (paywall is handled separately now)
- The "Powered by" footer changes to "Powered by Qwen3.5-Omni"

- [ ] **Step 3: Verify build**

```bash
cd client && npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/MessageBubble.jsx client/src/components/AiAvatar.jsx
git commit -m "feat: integrate GuajiAvatar in message bubbles, replace AiAvatar with GuajiMascot"
```

---

## Phase 3: Page Migration

### Task 9: Discovery.js (Home Page)

**Files:**
- Modify: `client/src/pages/Discovery.js`

- [ ] **Step 1: Study current Discovery.js structure**

Read the full file to identify all business logic hooks and API calls that must be preserved:
- `useAuth()` for user data
- `userAPI` / `historyAPI` / `aiAPI` calls
- Navigation handlers
- Scenario data loading
- Recall/daily QA card logic

- [ ] **Step 2: Replace the layout**

Adopt the DiscoveryScreen layout from `screens.jsx`. Key sections:

1. **Header**: Time-of-day greeting + user name + Pro badge + avatar initial circle (gradient)
2. **StreakRing**: Use the updated component with real data
3. **Stats Grid**: 4x `StatCard` (emoji-based) with real data
4. **Today's Tasks Card**: Gradient header with `GuajiAvatar` + "今日任务" title + recall row + daily QA row. Wire `onNav` to existing navigation handlers.
5. **Scenario Section**: Section header + filter chips (全部/进行中/已完成/未开始) + 2-column `ScenarioCard` grid
6. **BottomNav**: `<BottomNav currentPage="home" />`

Use CSS variables (`var(--background)`, `var(--card)`, `var(--primary)`, etc.) for all colors. Use inline styles matching the design system source.

Preserve all existing `useEffect` data loading, error handling, and loading states.

- [ ] **Step 3: Verify build**

```bash
cd client && npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Visual check**

```bash
cd client && npm start
```

Open `http://localhost:3000/discovery` and verify:
- Header shows greeting + avatar
- StreakRing displays with correct streak count
- Stats show real data
- Today's Tasks card renders recall + daily QA rows
- Scenario grid shows 2-column cards
- BottomNav has 3 tabs
- No console errors

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Discovery.js
git commit -m "feat: redesign Discovery page with Guaji design system"
```

---

### Task 10: Conversation.js (CC Mode + Task Tray)

**Files:**
- Modify: `client/src/pages/Conversation.js`

This is the most complex page. Only the visual layer changes — all WebSocket, audio, phase management logic stays.

- [ ] **Step 1: Study Conversation.js to map preserved logic**

Read the full file and list every ref, state variable, useEffect, and handler that must be preserved. This file is large (1000+ lines). Do NOT delete or modify any business logic functions.

- [ ] **Step 2: Add CC mode toggle state**

Add a state variable for CC immersive mode:
```jsx
const [ccMode, setCcMode] = useState(false);
```

- [ ] **Step 3: Replace the header**

Replace the existing header with `<ConvHeader>`:
```jsx
<ConvHeader
  onBack={() => navigate(-1)}
  title={scenarioTitle}
  dots={tasks.map(t => t.done)}
  online={isConnected}
/>
```

- [ ] **Step 4: Add task tray (collapsible)**

Below the header, add the gradient task tray from the design system. It shows task progress with checkmarks. Use the existing `tasks` / `currentTask` data from state. Reference: `screens.jsx` ScenarioConversationScreen task tray section.

- [ ] **Step 5: Update message rendering**

Messages already use `MessageBubble` — the component update in Task 8 handles the visual change. Verify the AI messages now show `GuajiAvatar` and the bubble radiuses match the design.

- [ ] **Step 6: Add CC immersive overlay**

When `ccMode` is true, render an overlay on top of the messages area:
```jsx
{ccMode && (
  <div style={{
    position: 'absolute', inset: '56px 0 80px 0',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    background: `radial-gradient(ellipse at top, rgba(99,127,241,0.18), transparent 60%), var(--background)`,
    zIndex: 10,
  }}>
    <button onClick={() => setCcMode(false)} style={/* exit button styles */}>退出 CC &times;</button>
    <GuajiMascot state={aiStatus} size={200} />
    {/* subtitle overlay */}
  </div>
)}
```

Map existing `aiStatus` / WebSocket state to GuajiMascot's `state` prop.

- [ ] **Step 7: Replace bottom input area with MicBar**

Replace the existing recording button with:
```jsx
<MicBar
  recording={isRecording}
  onMic={handleMicToggle}
  onRestart={handleRestart}
  secondary={
    <button onClick={() => setCcMode(v => !v)} style={/* CC toggle styles */}>CC</button>
  }
/>
```

Wire `handleMicToggle` and `handleRestart` to the existing recording logic.

- [ ] **Step 8: Verify build**

```bash
cd client && npm run build 2>&1 | tail -5
```

- [ ] **Step 9: Visual check**

Open the conversation page, verify:
- ConvHeader shows title + online pill
- Task tray collapses/expands
- Messages render with GuajiAvatar
- CC toggle shows/hides mascot overlay
- MicBar renders at bottom
- No WebSocket or audio regressions

- [ ] **Step 10: Commit**

```bash
git add client/src/pages/Conversation.js
git commit -m "feat: add CC immersive mode with GuajiMascot, task tray, MicBar to Conversation"
```

---

### Task 11: Landing.js (Marketing Page)

**Files:**
- Modify: `client/src/pages/Landing.js`

- [ ] **Step 1: Replace layout with guajiguaji.top design**

Reference: `figma_app_template/Guaji AI_Design_System/guajiguaji.top/index.html`

Key sections to implement:
1. **Sticky nav**: GuaJi logo (svg) + nav links + language picker + login/CTA buttons
2. **Dark navy hero**: Large headline with gradient text highlight + lead text + CTA buttons + social proof stats
3. **Features grid**: 4 feature cards with icons
4. **How-it-works**: 3 numbered steps
5. **Pricing**: 3 tier cards (Free/Weekly/Annual) — reuse existing pricing logic
6. **FAQ**: Accordion with common questions
7. **Footer**: Links + copyright

Preserve:
- `useAuth()` redirect logic (if user exists, navigate to discovery/onboarding)
- `useTranslation()` i18n hooks — keep using `t()` for all text
- `LanguageSwitcher` component
- Google OAuth button/flow
- Testimonial auto-rotation

Use CSS variables from `guaji-design.css`. The navy hero background: `#1F2D5C`.

- [ ] **Step 2: Verify build**

```bash
cd client && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Visual check**

Open `http://localhost:3000/` and verify the landing page renders correctly with all sections.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Landing.js
git commit -m "feat: redesign Landing page with guajiguaji.top design"
```

---

### Task 12: GoalSetting.js

**Files:**
- Modify: `client/src/pages/GoalSetting.js`

- [ ] **Step 1: Update visual layout**

Reference: `figma_app_template/Guaji AI_Design_System/screens.jsx` GoalSettingScreen

Key visual changes:
- Progress bar: 3 colored segments instead of step dots
- Language grid: 2-column buttons with flag emoji + label, selected state with primary border
- Quiz questions: Full-width cards with emoji + text
- Level selection: Cards with emoji + title + description
- CTA buttons: Use `var(--gradient-brand)` gradient style

Preserve all existing business logic:
- 5-step wizard flow (displayStep logic)
- `QUIZ_QUESTIONS`, `calcQuizScore`, `scoreToProficiency`, `getLevel` functions
- `handleGenerateScenarios` and `handleSubmit`
- Voice selection (`VOICE_OPTIONS`)
- Custom goal type handling
- Navigation state

- [ ] **Step 2: Verify build**

```bash
cd client && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/GoalSetting.js
git commit -m "feat: redesign GoalSetting with Guaji design system layout"
```

---

### Task 13: Profile.js

**Files:**
- Modify: `client/src/pages/Profile.js`

- [ ] **Step 1: Update visual layout**

Reference: `figma_app_template/Guaji AI_Design_System/screens.jsx` ProfileScreen

Key visual changes:
- User hero: Gradient avatar circle + name + Pro badge + 3-column stats row
- Streak calendar: 10-column grid of colored squares (primary color for checked days)
- Settings rows: Material Symbols icon + label + value + chevron_right, card-style rows
- Rows: 母语设置, 学习提醒, 我的订阅 (highlight), 意见反馈, 退出登录 (danger red)

Preserve all existing business logic: profile data loading, logout handler, subscription status.

- [ ] **Step 2: Verify build + commit**

```bash
cd client && npm run build 2>&1 | tail -5
git add client/src/pages/Profile.js
git commit -m "feat: redesign Profile page with Guaji design system"
```

---

### Task 14: Subscription.js

**Files:**
- Modify: `client/src/pages/Subscription.js`

- [ ] **Step 1: Update visual layout**

Apply design system styling to the subscription/paywall page:
- Use `var(--gradient-brand)` for the recommended plan highlight
- Card styling with `var(--radius-lg)` and `var(--shadow-brand)`
- CTA buttons with gradient background
- Feature checkmarks in `var(--success)` green

Preserve all Stripe integration logic and redirect handling.

- [ ] **Step 2: Verify build + commit**

```bash
cd client && npm run build 2>&1 | tail -5
git add client/src/pages/Subscription.js
git commit -m "feat: redesign Subscription page with Guaji design system"
```

---

## Phase 4: Verification

### Task 15: Full Build + Visual Smoke Test

- [ ] **Step 1: Clean build**

```bash
cd client && rm -rf build && npm run build 2>&1 | tail -10
```

Expected: `Compiled successfully.` with no warnings about missing imports.

- [ ] **Step 2: Check for broken imports**

```bash
grep -r "DashScenarioCard\|from.*Keevx\|from.*AvatarSelector" client/src/ --include="*.js" --include="*.jsx" | grep -v node_modules
```

Expected: No results.

- [ ] **Step 3: Check unused design-tokens.json references**

```bash
grep -r "design-tokens.json" client/src/ --include="*.js" --include="*.jsx" | wc -l
```

Note how many files still import the old tokens. These should gradually migrate to CSS variables, but don't need to block this release.

- [ ] **Step 4: Start dev server and smoke test all pages**

```bash
cd client && npm start
```

Visit each page and verify no blank screens or console errors:
- `/` (Landing)
- `/discovery` (Home)
- `/conversation?scenario=test` (Conversation)
- `/goal-setting` (Goal Setting)
- `/profile` (Profile)
- `/subscription` (Subscription)

- [ ] **Step 5: Final commit**

If any fixes were needed during smoke testing, commit them:

```bash
git add -u
git commit -m "fix: smoke test fixes for Guaji design system integration"
```

---

### Task 16: API Endpoint Verification

- [ ] **Step 1: Start backend services**

```bash
docker compose up -d
```

Wait for all services to be healthy.

- [ ] **Step 2: Run through verification checklist**

Follow the API Endpoint Verification Plan from the spec document (Section 8). Test each endpoint group:

1. **Auth Flow**: Register → Login → Profile load → Logout
2. **Goal & Scenario**: Create goal → Generate scenarios → Load tasks
3. **Conversation WebSocket**: Connect → Send audio → Receive AI response → Proficiency update
4. **Daily QA**: Load question → Record answer → Get feedback
5. **History & Stats**: Session history loads → Daily progress displays → Streak accurate
6. **Subscription**: Stripe checkout initiates (test mode)

- [ ] **Step 3: Document results**

Record any failing endpoints. If backend changes are needed (unlikely — this is a frontend-only migration), create separate tasks.

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -u
git commit -m "chore: complete Guaji design system integration verification"
```
