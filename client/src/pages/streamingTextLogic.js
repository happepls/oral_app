// Pure text-cleaning for streaming AI text deltas (`ai_text_delta` WS frames).
//
// The model emits control markers inline with the visible reply text — e.g.
// [TASK_1_COMPLETE], [MAGIC_SENTENCE: ...], [MAGIC_PASS], [DAILY_QA_PASSED],
// [NATIVE: ...]. During streaming, a marker can also arrive split across two
// deltas, so the accumulated content may end with a partially-received marker
// like "...great job [TASK_" that must be hidden until its closing bracket
// arrives (otherwise the user briefly sees marker fragments).
//
// `cleanStreamingText` is applied to the *accumulated* content before display:
//   1. strip every fully-closed marker (both [ ] and < > bracket variants),
//   2. hide any trailing unclosed marker by truncating from the last
//      unclosed opening bracket.
//
// It intentionally mirrors the marker set stripped elsewhere in Conversation.js
// (stripAIMarkers + the per-render strip chain) so streamed and final text look
// identical. The authoritative full text still replaces the streamed content
// when the final `ai_message`/`ai_response` frame arrives.

// Marker content may itself contain nested brackets that the LLM generated as
// part of the visible text — e.g. `[MAGIC_SENTENCE: use [brackets]] now`. A
// naive `[^\]]*` character class stops at the first inner `]`, so the closing
// bracket(s) of the marker leak into the display text (`say ] now`). The
// `MARKER_BODY` fragment below matches a marker body that permits balanced
// nested `[...]` / `<...>` pairs one level deep, plus any run of non-bracket
// chars, so the match extends to the marker's true outermost closer. One level
// of nesting covers every real case the model emits; deeper nesting is not
// something the prompt ever produces.
//
// Expansion of the body (for `[ ]` variant): (?:[^\][]|\[[^\]]*\])*
//   [^\][]        — any char that is neither `[` nor `]`
//   \[[^\]]*\]    — a complete nested `[...]` pair
// The `< >` variant mirrors this with angle brackets. Because both bracket
// styles can open a marker, each pattern accepts either closer at the top level.

// Body allowing one level of nested [ ] pairs; consumes up to (not including)
// the outermost `]`.
const SQ_BODY = '(?:[^\\][]|\\[[^\\]]*\\])*';
// Body allowing one level of nested < > pairs.
const NG_BODY = '(?:[^<>]|<[^>]*>)*';

// Fully-closed marker patterns (order-independent; each is global).
const CLOSED_MARKER_PATTERNS = [
  new RegExp(`\\[TASK_\\d+_COMPLETE${SQ_BODY}\\]`, 'gi'),
  // MAGIC_SENTENCE accepts either bracket style; match the matching closer.
  new RegExp(`\\[MAGIC_SENTENCE:${SQ_BODY}\\]`, 'gi'),
  new RegExp(`<MAGIC_SENTENCE:${NG_BODY}>`, 'gi'),
  new RegExp(`\\[MAGIC_PASS${SQ_BODY}\\]`, 'gi'),
  /\[DAILY_QA_PASSED\]/gi,
  new RegExp(`\\[\\s*NATIVE:\\s*${SQ_BODY}\\]`, 'gi'),
];

// Additional markers stripped in Conversation.js render/history paths. Kept
// here so all marker regexes live in one module (single definition point).
const EXTRA_MARKER_PATTERNS = [
  new RegExp(`\\[TASK_COMPLET\\w*${SQ_BODY}\\]`, 'gi'),
  new RegExp(`\\[TASK_SWITCH${SQ_BODY}\\]`, 'gi'),
  new RegExp(`\\[TASK_READY${SQ_BODY}\\]`, 'gi'),
  new RegExp(`\\[PHASE_START${SQ_BODY}\\]`, 'gi'),
];

// Strip all fully-closed markers from `text`.
function stripClosedMarkers(text) {
  let out = text;
  for (const re of CLOSED_MARKER_PATTERNS) {
    out = out.replace(re, '');
  }
  return out;
}

// Strip the full marker set (streaming markers + the extra TASK_*/PHASE_START
// markers stripped in Conversation.js). Used by the shared display-cleaning
// helper so streamed, final, history, and render text all strip identically.
export function stripAllMarkers(text) {
  if (!text) return text || '';
  let out = text;
  for (const re of CLOSED_MARKER_PATTERNS) {
    out = out.replace(re, '');
  }
  for (const re of EXTRA_MARKER_PATTERNS) {
    out = out.replace(re, '');
  }
  return out;
}

// Extract the MAGIC_SENTENCE body from `text` (or '' if absent). Accepts both
// `[ ]` and `< >` bracket styles and tolerates a missing closer (streaming tail
// / truncated marker). Uses the nested-bracket-aware body so a sentence like
// `[MAGIC_SENTENCE: say [hi]]` yields `say [hi]`, not `say [hi`.
const MAGIC_SENTENCE_EXTRACT = new RegExp(
  `\\[MAGIC_SENTENCE:\\s*(${SQ_BODY})\\]|` +
  `<MAGIC_SENTENCE:\\s*(${NG_BODY})>|` +
  // Unclosed tail: grab everything after the colon to end of line.
  `[[<]MAGIC_SENTENCE:\\s*([^\\]>]*)$`,
  's'
);

export function extractMagicSentence(text) {
  if (!text) return '';
  const m = text.match(MAGIC_SENTENCE_EXTRACT);
  if (!m) return '';
  return (m[1] ?? m[2] ?? m[3] ?? '').trim();
}

// Hide a trailing, not-yet-closed marker. During streaming the tail may be a
// partial marker such as "[TASK_" or "<MAGIC_SENTENCE: hel" — an opening
// bracket with no matching closer after it. We only truncate when the bracket
// plausibly starts a marker (next non-space char is a letter or another
// bracket), so ordinary text like "cost is [about" or "see (note)" is not
// swallowed. A closed "( )" or "[ ]" earlier in the string is left intact.
function hideTrailingPartialMarker(text) {
  // Scan from the end for the last opening bracket that has no closer after it.
  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === '[' || ch === '<') {
      const rest = text.slice(i + 1);
      const closer = ch === '[' ? ']' : '>';
      if (rest.includes(closer)) {
        // This bracket is closed; nothing unclosed to its right matters.
        return text;
      }
      // Unclosed opening bracket. Only treat it as a partial marker if what
      // follows looks like the start of one (upper/lowercase letter after an
      // optional space, or empty tail immediately after the bracket).
      if (rest === '' || /^\s*[A-Za-z]/.test(rest)) {
        return text.slice(0, i);
      }
      // Otherwise it's ordinary punctuation — leave it and keep scanning left.
    }
  }
  return text;
}

// Clean accumulated streaming AI text for display.
export function cleanStreamingText(text) {
  if (!text) return text || '';
  const withoutClosed = stripClosedMarkers(text);
  const withoutPartial = hideTrailingPartialMarker(withoutClosed);
  return withoutPartial;
}

// Reducer for an incoming `ai_text_delta`: given the previous accumulated raw
// content and a new delta, return the new raw accumulated content. Kept trivial
// but centralized so the accumulation semantics live next to the cleaner.
export function appendDelta(prevContent, delta) {
  return (prevContent || '') + (delta || '');
}

// Decide the MessageBubble render state ('text' | 'dots') for an AI bubble.
//
// The old state machine showed the loading dots whenever `!isFinal`, and also
// while `isFinal` but audio hadn't arrived (`!audioUrl && audioPlayed !== true`).
// With streaming text (`ai_text_delta`), that hid the visible reply behind dots
// for the whole streaming window, and made the text flash back to dots the
// instant the final frame set `isFinal:true` before `audioUrl` arrived.
//
// New rule: content wins. As soon as there is any displayable text, show it.
// Dots only appear while there is genuinely nothing to display yet:
//   - streaming with no text yet (delta bubble created but first char pending),
//   - final-but-empty waiting states.
// `hasContent` is the already-cleaned/displayable string's non-emptiness so the
// caller strips markers first (matching the render path).
export function aiBubbleRenderState({ isFinal, hasContent, audioUrl, audioPlayed }) {
  if (hasContent) return 'text';
  // No content to show — fall back to the legacy loading conditions.
  if (!isFinal) return 'dots';
  if (!audioUrl && audioPlayed !== true) return 'dots';
  return 'text';
}
