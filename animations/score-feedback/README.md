# Practice feedback accent

Original script-free Rive accent inspired by the charge, highlight and reveal
rhythm of the user-supplied battery demo. The reference export contains fixed
percentages and unrelated branding, so those are not used as task progress.
This scene is decorative: authoritative delta/total/reason remain accessible
DOM text. No user text is sent to Rive services.

Rive CLI 1.8.0, 112 × 112 artboard, state machine `Feedback`, one 90-frame
animation at 60 fps. It appears, charges and holds the final frame. The React
wrapper pauses playback after settling; the card stays until manually hidden.
The card's DOM entrance/exit uses Motion so variable-length localized feedback
stays readable and keyboard accessible. Reduced motion uses a static icon.

From repository root:

```sh
rive animations/score-feedback
rive animations/score-feedback --verify
rive inspect animations/score-feedback --summary
rive animations/score-feedback --once
cp animations/score-feedback/build/score-feedback.riv client/src/assets/score-feedback.riv
rive animations/score-feedback --screenshot=animations/score-feedback/build/settled.png --advance=90
```

The generated local agent guides are preserved. No scripts, remote assets,
account login, upload, publishing or signed export are needed. The checked-in
client asset is the CLI output; rebuild and copy it after changing the RML.

React uses `@rive-app/react-webgl2`; the dependency's matching WASM is bundled
as a fingerprinted same-origin asset. CDN fallback is disabled. Nginx must serve
the updated `wasm-unsafe-eval` CSP directive for WebAssembly compilation (no
general JavaScript `unsafe-eval` permission). Asset/load failure leaves the DOM
feedback and hide control usable with a static icon.
