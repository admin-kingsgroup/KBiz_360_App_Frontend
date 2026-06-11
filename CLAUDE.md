# CLAUDE.md — KBiz360 Smart Connect (React Native)

Guidance for AI assistants and developers working in this repo. Read this before making changes.

## What this is
**KBiz360 Smart Connect** is the team communication + attendance app for **Travkings** (part of King's Group Companies). It started as a single-file React PWA (`kb360-find.jsx`, ~4,600 lines) and was migrated phase-by-phase to **Expo / React Native + TypeScript**. It is currently a **faithful front-end** of the original: all data is mocked and persistence is minimal — there is **no backend yet**.

Core features: branch-scoped team chat (DMs + groups), a six-tier role/access model with "View as" preview, role-aware reminders with approval flow, and Wi-Fi/geofence auto-attendance with a biometric face fallback.

## Tech stack
- **Expo** (SDK 56) + **expo-router** (file-based routing, typed routes)
- **TypeScript** (strict)
- **NativeWind v4** (Tailwind classes) + a small theme token layer
- **Zustand** stores (7) — no UI/RN imports inside stores
- **lucide-react-native** icons
- Native: `expo-location` (geofence), `expo-local-authentication` (biometric punch), `expo-notifications` (local), `@react-native-community/netinfo` (offline)
- **Jest** + ts-jest for the pure logic/store layer

## Commands
```
npm install
npm run typecheck   # tsc --noEmit
npm run lint        # eslint . --ext .ts,.tsx
npm test            # jest (76 tests, 16 suites)
npx expo start      # use a dev build for native features (not Expo Go)
```
All three checks must stay green. Native features (geofence, Face ID, notifications) require a dev/EAS build on a real device — they cannot run in Expo Go or CI.

### Running: Expo Go vs development build
```
npx expo start -c        # Expo Go — UI/logic iteration only (-c clears the Metro cache)
npx expo run:android     # local dev build (needs Android SDK/emulator)
npx expo run:ios         # local dev build (needs Xcode)
eas build --profile development   # cloud dev build
```
- **Expo Go is for UI/logic only.** Since SDK 53, `expo-notifications` **throws at import on Android in Expo Go** (remote push was removed from it). So `src/services/notifications/index.ts` does NOT import it statically — it lazy-`require`s `expo-notifications` only outside Expo Go (`isRunningInExpoGo()` from `expo`) and **no-ops in Expo Go** (`scheduleLocal` → `null`, permission requests → `false`, tap listener inert). The app boots in Expo Go; notifications just don't fire.
  - **Don't reintroduce a top-level `import … from 'expo-notifications'`** anywhere — it will hard-crash the whole app in Expo Go (a single throw cascades into bogus "Route … is missing the required default export" warnings and an `ErrorBoundary of undefined` from expo-router). Route all access through the service.
- **Use a dev build** to actually exercise notifications, geofence, and Face ID. expo-location (foreground) and netinfo work in Expo Go; background geofencing and notification delivery do not.
- After dependency or route changes, restart Metro with `-c`; expo-router regenerates `.expo/types` (typed routes) on `expo start`, so a typecheck that passed before a run can surface new `Href`/route-type errors after one.

## Project layout
```
app/                       # expo-router routes
  _layout.tsx              # root: providers, ErrorBoundary, OfflineBanner, gate, route registry
  (auth)/                  # login, permissions
  (tabs)/                  # index(Home/Chats), reminders, call, email, profile
  chat/[id].tsx            # chat detail (DM + group)
  attendance.tsx           # attendance
  admin/                   # users, roles, user-form (modal), businesses
  business/[id], department/[id], alert/[id]
  reminder/new (modal), reminder/archive
  view-as.tsx (modal)
src/
  types/                   # domain types (locked)
  constants/               # roles, modules, departments, filters, countries, permissions
  data/                    # MOCK data: businesses, users, chats, reminders, pulse, team
  logic/                   # PURE functions (access, canSee, grouping, attendance, geo, validation) — tested
  store/                   # zustand: auth, access, attendance, ui, chat, reminders, pulse
  services/                # storage (AsyncStorage prefs), notifications
  hooks/                   # useGeoFence, useNetwork, useNotificationRouting
  components/              # ui/, common/, forms/, chat/, home/, reminders/
  theme/                   # colors, shadows, typography, spacing
  utils/                   # time helpers
  __tests__/               # jest specs
```

## Architecture rules (please preserve)
1. **Layered, one direction:** `types → constants/data → logic → store → components → routes`. Pure logic never imports RN or stores; stores never import UI.
2. **Foundation is stable.** Types, pure logic, and existing store *behavior* are treated as locked. Add new files rather than refactoring; if you must change foundation, prove a bug first and add a test.
3. **Faithful to source.** Behavior was ported 1:1 from `kb360-find.jsx`. Don't "improve" behavior silently — flag deviations.
4. **Access control is centralized.** All visibility flows through `logic/access.deriveAccess` + `logic/accessFilters.makeAccessFilters` (`bizOK/brOK/grpOK/deptOK/alertOK`) and `logic/canSee`. Don't reinvent filtering in components.
5. **Test the logic, not the pixels.** New business logic goes in `src/logic` or a store and gets a Jest test. Keep data files import-pure (import `theme/colors`, not the theme barrel, so tests don't pull in RN).
6. **NativeWind typing quirk:** `nativewind-env.d.ts` augments RN with `className`. Use `import type { ReactNode } from 'react'` (not `React.ReactNode`) to avoid a duplicate-`@types/react` namespace mismatch.

## Known design facts (don't be surprised)
- **Three identity systems coexist by design** and must be unified by the backend, not in the client:
  - `adminUsers` (`a1…a8`) — the canonical app user / admin lists.
  - `PERSON_META` (`a, fa, p, f, m, r, sn, ko, an`) — the reminders/canSee space; `CURRENT_USER_ID = 'a'`.
  - DM ids (`u1…u7`) — the chat list.
- **"View as"** is store state (`accessStore.viewAsUser`), never route state; access-driven UI re-derives automatically. The Reminders screen has its *own local* role view-as, independent of the global one.
- **Chat DM list is intentionally NOT access-filtered** (source behavior): it only excludes the signed-in user and sorts unread-first/recent.
- **Wi-Fi presence is a simulated toggle** (no native router detection exists); geofence is real via `expo-location`. Attendance "Here/Away" buttons simulate GPS for testing.
- **State is session-only** (resets on reload) except permissions/consent (AsyncStorage). Chat unread, pulse read-state, reminders, and the daily punch do not persist.
- A lot of display copy is **hardcoded from source** (role counts, "54 people", `businessUserIds`, group subtitles).

## Everything tagged [NEEDS BACKEND]
Chat realtime + delivery/read receipts + presence; push notification delivery (Expo push tokens → APNs/FCM); real authentication; persistence of users/reminders/attendance/messages; a single canonical identity. Stores are deliberately transport-agnostic so a real API can slot in behind them.

---

## Future improvements & enhancements

### 1. Backend integration (highest priority)
- Stand up an API (auth, users/roles, chat, reminders, attendance, system alerts).
- **Unify the three identity systems** into one canonical `User` with a stable id; map `PERSON_META`/DM ids onto it.
- Replace each `src/data/*` mock with API calls behind the existing stores (minimal component changes).
- Real auth: replace the simulated login with token-based sign-in + `expo-secure-store`; persist the session (currently login shows every launch).

### 2. Persistence & offline-first
- Promote session stores (chat unread, pulse read, reminders, attendance) to AsyncStorage-backed or server-synced state.
- Build a real sync layer behind `OfflineBanner`/`useNetwork`: optimistic writes, a queue, and conflict resolution.
- Persist the daily attendance punch so it survives reloads.

### 3. Realtime chat
- WebSocket/SSE transport; true delivery/read receipts (the `✓✓` is cosmetic today); typing indicators and live presence.
- Real group membership + messages (group chats currently reuse the DM detail with mock starter messages).
- Build the deferred sheets: attach/media, call, conference.

### 4. Notifications (server side)
- Register Expo push tokens; deliver remote pushes (reminder due, new message, attendance anomaly, system alerts).
- Deep-link routing already exists (`services/notifications/routes.ts`) — wire server payloads to it.
- Schedule reminder notifications from the real `when` time (today it fires a confirmation a couple seconds after create).

### 5. Attendance hardening
- Decide biometric strictness (today it falls through to success when no biometric is enrolled — see `app/attendance.tsx`).
- Consider background geofencing (`expo-task-manager`) so check-in/out works without the app foregrounded.
- Real office Wi-Fi/SSID detection to replace the simulated toggle (needs native module + platform constraints).
- Server-side attendance rules/payroll feed.

### 6. Admin & detail screens (CRUD)
- Turn the toast-only edit/add actions into real flows: add/edit branches, departments, users; alert-channel settings; re-assign reminders.
- Decide whether DM and department-detail lists should be access-filtered (currently faithful-to-source = not filtered) — see risk R5 in the final report.

### 7. Performance
- Convert the Home segment lists and the admin/users list to `FlatList` once data is paginated (avoid nested VirtualizedList warnings — likely restructure Home so each segment owns its scroll container).
- `getItemLayout` + windowing for long chat threads; image/avatar caching when avatars become remote.

### 8. Quality & DX
- Add component/integration tests (React Native Testing Library) and E2E (Maestro/Detox) for the gate → punch → notification-tap flows; UI is currently under-tested vs logic.
- Wire crash/analytics reporting into `ErrorBoundary.componentDidCatch`.
- Resolve the duplicate `@types/react`/NativeWind hoisting at the dependency level so the `ReactNode` workaround is no longer needed.
- Accessibility sweep (labels, hit targets, contrast); the source had known a11y gaps.

### 9. Polish
- Safe-area-pad the `OfflineBanner` (it can sit under the notch).
- Replace hardcoded counts/copy with live data once the backend exists.
- Localization (the group serves DRC/Kenya/Tanzania/Dubai/India — consider i18n + RTL readiness).

## When adding a feature (quick checklist)
- [ ] Pure logic in `src/logic` (or a store action) + a Jest test.
- [ ] Mock data in `src/data` (import `theme/colors`, keep import-pure).
- [ ] UI in `src/components/<area>`; route in `app/…`; register non-tab routes in `app/_layout.tsx`.
- [ ] Visibility via `makeAccessFilters` / `canSee` — never ad-hoc.
- [ ] `npm run typecheck && npm run lint && npm test` all green.
- [ ] Note any deviation from source behavior in the PR.
