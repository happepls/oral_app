# Guaji AI Design System Integration

**Date**: 2026-05-13
**Approach**: B — Component-First Migration
**Scope**: Full frontend replacement using Guaji AI Design System

---

## 1. Source of Truth

All design assets are in `figma_app_template/Guaji AI_Design_System/`:

| File | Purpose |
|---|---|
| `colors_and_type.css` | CSS variables, typography, component base styles |
| `components.jsx` | BottomNav, Card, PrimaryBtn, GhostBtn, StatMini, SectionHeader, DiffBadge, Bubble, StreakRing |
| `screens.jsx` | DiscoveryScreen, ConversationScreen (scenario/daily_qa/recall), GoalSettingScreen, ProfileScreen |
| `ui_kits/mobile_app/screens-extra.jsx` | LandingScreen, PaywallScreen |
| `mascot.jsx` | SVG Mascot component (reference only — using image assets instead) |
| `guajiguaji.top/index.html` | Marketing landing page (guajiguaji.top) |
| `assets/logo.svg` | Brand logo SVG |
| `assets/logo-app-icon.jpg` | App icon (used as chat avatar) |
| `preview/brand-logo.html` | Logo system reference |

Mascot expression/scenario images (to be cropped into individual assets):
- `figma_app_template/expression_variations.jpg` — 10 expressions
- `figma_app_template/GuaJi_Bird_Interactive_Scenarios.png` — 15 interactive scenarios

---

## 2. Design Tokens

From `colors_and_type.css`:

```css
--primary: #637FF1;
--primary-light: #c3cef8;
--primary-dark: #2d44ca;
--secondary: #a47af6;
--success: #10B981;
--warning: #F59E0B;
--error: #e2412e;
--background: #f6f7f8;
--card: #ffffff;
--foreground: #1a1a1a;
--gradient-brand: linear-gradient(135deg, #637FF1, #a47af6);
--font-display: 'Lexend', 'Arial Unicode', -apple-system, sans-serif;
--radius-sm: 10px;
--radius-md: 13px;
--radius-lg: 20px;
--radius-xl: 29px;
--shadow-brand: 0 10px 23px rgba(137,171,241,0.18);
```

Icons: Material Symbols Outlined + Lucide React (both already in use).

---

## 3. Mascot System — Image-Based

### Asset Preparation

Crop composite images into individual PNGs at `client/public/mascot/`:

**Expressions** (from expression_variations.jpg):
- `happy.png`, `excited.png`, `surprised.png`, `thinking.png`, `winking.png`
- `loving.png`, `sleepy.png`, `confused.png`, `proud.png`

**Interactive Scenarios** (from GuaJi_Bird_Interactive_Scenarios.png):
- `speaking.png`, `listening.png`, `thumbsup.png`, `correct.png`
- `breaking.png`, `tryagain.png`, `recording.png`, `practicing.png`
- `achievement.png`, `guiding.png`

### State-to-Image Mapping

| AI State | Primary Image | Fallback Expression |
|---|---|---|
| `idle` | `happy.png` | — |
| `speaking` | `speaking.png` | `excited.png` |
| `listening` | `listening.png` | `thinking.png` |
| `thinking` | `thinking.png` | `confused.png` |
| Task complete | `correct.png` / `thumbsup.png` | `proud.png` |
| Error / retry | `tryagain.png` | `confused.png` |

### Avatar

All chat bubble AI avatars use `logo-app-icon.jpg` (the round GuaJi owl icon) at 36-40px.

---

## 4. Component Migration Map

### 4.1 New Shared Components (create in `client/src/components/`)

| Component | Source | Key Props |
|---|---|---|
| `GuajiMascot.jsx` | Image-based | `state`, `mood`, `size` — renders `<img>` from mascot assets |
| `MicBar.jsx` | `screens.jsx` MicBar | `recording`, `onMic`, `onRestart`, `ccToggle` |
| `VoiceBubble.jsx` | `screens.jsx` VoiceBubble | `duration`, `dark`, `bars`, `accent` |
| `ConvHeader.jsx` | `screens.jsx` ConvHeader | `onBack`, `title`, `dots`, `online` |
| `HintBanner.jsx` | `screens.jsx` HintBanner | `text`, `onSkip` |

### 4.2 Existing Components to Replace

| Current | Design System Source | Changes |
|---|---|---|
| `AiAvatar.jsx` | `GuajiMascot.jsx` (new) | Remove Keevx references, use image switching |
| `MessageBubble.jsx` | `Bubble` + `VoiceBubble` | Add waveform bars, translate button, MascotAvatar |
| `BottomNav.js` | `BottomNav` | 3 tabs (home/goals/profile), Material Symbols icons |
| `StatCard.jsx` | `StatMini` | Emoji + value + label compact layout |
| `StreakRing.jsx` | `StreakRing` | SVG progress ring + checkin button |
| `ScenarioCard.jsx` | 2-col grid card | Emoji header, progress bar, lock overlay, DiffBadge |
| `DashScenarioCard.jsx` | Merge into ScenarioCard | Remove, unify with ScenarioCard |

---

## 5. Page Migration Map

### 5.1 Discovery.js (Home)

**Layout** (from DiscoveryScreen):
1. Header: greeting + Pro badge + avatar initial
2. StreakRing card
3. Stats grid (4x StatMini)
4. Today's Tasks card (MascotAvatar header + recall row + daily QA row)
5. Scenario section (filter chips + 2-col grid)
6. BottomNav (3 tabs)

**Business logic preserved**: `useAuth`, `userAPI`, `historyAPI`, `aiAPI` calls, scenario data from backend.

### 5.2 Conversation.js

**Layout** (from ScenarioConversationScreen / DailyQAScreen / RecallScreen):
- ConvHeader with close + title + online pill
- Task tray (gradient collapsible, progress bar, task checklist)
- Messages area (AIMessage with MascotAvatar + UserVoiceMessage)
- CC immersive overlay (GuajiMascot centered + subtitle overlay)
- MicBar (recording button + CC toggle + restart)

**Business logic preserved**: All WebSocket handling, audio playback, phase management, score popups. Only visual layer changes.

**CC Mode integration**:
- Toggle button shows/hides immersive overlay
- GuajiMascot switches image based on AI state (speaking/listening/thinking/idle)
- Subtitle auto-fades after 2s

### 5.3 Landing.js

**Layout** (from guajiguaji.top/index.html):
- Sticky nav with GuaJi logo + links + language picker
- Dark navy hero section with headline + CTA + social proof stats
- Feature grid section
- How-it-works steps
- Pricing cards (Free/Weekly/Annual)
- FAQ accordion
- Footer with links

**Business logic preserved**: Auth redirect, i18n, Google OAuth.

### 5.4 GoalSetting.js

**Layout** (from GoalSettingScreen):
- Progress bar header (3 segments)
- Step 0: Language grid (2-col, flag + label)
- Step 1: Proficiency quiz (single-choice cards)
- Step 2: Level selection + "Start" CTA

**Business logic preserved**: All existing 5-step wizard logic, API calls, voice selection. Visual update only.

### 5.5 Profile.js

**Layout** (from ProfileScreen):
- User hero card (avatar + name + Pro badge + stats row)
- Streak calendar (10-col grid, colored squares)
- Settings rows (Material Symbols icon + label + value + chevron)

**Business logic preserved**: Profile API calls, logout, subscription status.

### 5.6 Subscription.js

**Layout** (from PaywallScreen):
- Feature comparison cards
- Pricing tiers (Free/Weekly/Annual)
- Stripe integration unchanged

---

## 6. CSS Integration Strategy

1. Copy `colors_and_type.css` content into `client/src/guaji-design.css`
2. Import in `client/src/index.js` (before other CSS)
3. Add Lexend font import to `client/public/index.html`
4. Add Material Symbols font import to `client/public/index.html`
5. Keep Bootstrap for any pages not yet migrated (graceful coexistence)
6. Remove Bootstrap imports once all pages are migrated

---

## 7. Files NOT Changed

- All backend services (`services/`)
- `docker-compose.yml`
- `api-gateway/`
- `client/src/contexts/AuthContext.js`
- `client/src/services/api.js`
- `client/src/i18n/`
- All test files

---

## 8. API Endpoint Verification Plan

Post-integration checklist to validate backend connectivity:

### Auth Flow
- [ ] `POST /api/users/register` — Registration works, cookie set
- [ ] `POST /api/users/login` — Login works, cookie set
- [ ] `POST /api/users/google-auth` — Google OAuth flow
- [ ] `POST /api/users/logout` — Cookie cleared
- [ ] `GET /api/users/profile` — Profile data loads on Discovery/Profile pages

### Goal & Scenario
- [ ] `POST /api/users/goals` — Create goal from GoalSetting
- [ ] `GET /api/users/goals` — Goals load on Discovery page
- [ ] `POST /api/ai/generate-scenarios` — Scenarios generated for goal
- [ ] `GET /api/users/tasks` — Tasks load per scenario

### Conversation (WebSocket)
- [ ] `ws://*/ws/ai?scenario=X&voice=Y` — WebSocket connects
- [ ] Audio streaming works (speech → AI response)
- [ ] `proficiency_update` messages received and displayed
- [ ] `task_completed` messages trigger score popup
- [ ] CC mode: GuajiMascot state transitions (idle→listening→thinking→speaking)
- [ ] Recall mode: `mode=recall` forwarded correctly

### Daily QA
- [ ] Daily QA question loads from backend
- [ ] Voice recording and submission works
- [ ] AI response plays back

### History & Stats
- [ ] `GET /api/history/sessions` — Session history loads on Profile
- [ ] `GET /api/users/daily-progress` — Stats load on Discovery
- [ ] Streak count accurate

### Subscription
- [ ] `POST /api/users/create-checkout-session` — Stripe checkout starts
- [ ] Subscription status reflected in UI (Pro badge, unlock states)

### Health
- [ ] `GET /health` on all services returns 200
- [ ] `docker compose logs` shows no errors after page loads

---

## 9. Deployment Note

After integration verified locally, deploy to `guajiguaji.top` via:
1. `cd client && npm run build`
2. Deploy `client/build/` to production server
3. Configure Nginx for the domain
