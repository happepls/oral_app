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

// Fully-closed marker patterns (order-independent; each is global).
const CLOSED_MARKER_PATTERNS = [
  /\[TASK_\d+_COMPLETE[^\]]*\]/gi,
  /[[<]MAGIC_SENTENCE:[^\]>]*[\]>]/gi,
  /\[MAGIC_PASS[^\]]*\]/gi,
  /\[DAILY_QA_PASSED\]/gi,
  /\[\s*NATIVE:\s*[^\]]*\]/gi,
];

// Strip all fully-closed markers from `text`.
function stripClosedMarkers(text) {
  let out = text;
  for (const re of CLOSED_MARKER_PATTERNS) {
    out = out.replace(re, '');
  }
  return out;
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
