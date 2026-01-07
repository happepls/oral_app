# Frontend Flow Verification Test Cases

## Pre-requisites
- Ensure frontend is running at `http://localhost:5001`.
- Ensure backend services are healthy (`docker compose ps`).
- Browser console should be open to check for errors.

## Test Case 1: New User Onboarding Flow
**Goal**: Verify that a new user is correctly guided through profile setup and goal setting before accessing the main app.

1.  **Register New User**:
    -   Navigate to `/register`.
    -   Enter new email (e.g., `test_new_user@example.com`) and password.
    -   Click "Register".
    -   **Expected**: Redirect to `/onboarding`.

2.  **Complete Onboarding (Profile)**:
    -   **Page**: `/onboarding`
    -   Fill in Nickname: `TestUser`.
    -   Select Gender: `Male`.
    -   Select Native Language: `Chinese` (Critical for InfoCollector prompt).
    -   Select Learning Language: `English`.
    -   Set Proficiency slider to `50`.
    -   Enter Interests: `Travel, Tech`.
    -   Click "Next".
    -   **Expected**: Redirect to `/goal-setting`.

3.  **Set Goal**:
    -   **Page**: `/goal-setting`
    -   Select Type: `Business Meeting`.
    -   Select Level: `Intermediate`.
    -   Enter Description: `I want to practice leading a daily standup meeting.`.
    -   Click "Start Practice".
    -   **Expected**: Redirect to `/conversation`.

4.  **Verify Backend State**:
    -   Check database (or use curl) to confirm `user_goals` table has the new goal and `users` table has updated profile.

## Test Case 2: Discovery Page Redirects
**Goal**: Verify that accessing the Discovery page enforces profile/goal completion.

1.  **Login with Incomplete Profile**:
    -   (If possible, manually clear `native_language` in DB for a test user).
    -   Login and try to navigate to `/discovery`.
    -   **Expected**: Redirect to `/onboarding`.

2.  **Login with No Active Goal**:
    -   (Manually set `user_goals` status to 'completed' or 'abandoned' for test user).
    -   Login and try to navigate to `/discovery`.
    -   **Expected**: Redirect to `/goal-setting`.

## Test Case 3: Conversation & Role Switching
**Goal**: Verify real-time interaction and UI updates.

1.  **Start Conversation**:
    -   Navigate to `/conversation` (after completing Goal Setting).
    -   **Check**: Header should show "AI 导师" or "OralTutor".
    -   **Check**: Connection status dot should be Green ("在线").

2.  **Voice Interaction**:
    -   Click Microphone button.
    -   Speak: "Hello, I am ready to start my practice."
    -   Click Stop button.
    -   **Expected**:
        -   User message appears (Transcription).
        -   AI thinking indicator appears.
        -   AI message appears.
        -   Audio plays automatically.
        -   "AI Speaking" indicator shows animation.

3.  **Barge-in (Interruption)**:
    -   Wait for AI to start a long sentence.
    -   **Action**: Click Microphone button *while AI is speaking*.
    -   **Expected**:
        -   AI Audio stops **immediately**.
        -   "AI Speaking" indicator disappears.
        -   Console logs "Interruption triggered!".
        -   New recording starts.

## Test Case 4: Audio Device Control
**Goal**: Verify `RealTimeRecorder` control logic.

1.  **Permission Denied Handling**:
    -   (Temporarily block Microphone permission in browser).
    -   Click Microphone button.
    -   **Expected**: Alert "无法启动录音，请检查麦克风权限".

2.  **State Consistency**:
    -   Start recording -> Navigate back (`/discovery`) -> Navigate return (`/conversation`).
    -   **Expected**: Recording should stop cleanly on unmount (no "AudioContext" errors in console).
