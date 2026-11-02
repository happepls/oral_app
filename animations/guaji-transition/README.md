# Guaji transition — local Rive example

A script-free 500 × 500 badge fades in for 1 second, holds for 1 second,
fades out for 1 second, then remains hidden for 1 second. The 240-frame
timeline repeats at 60 fps. Edit `scene.rml` to change shapes, colours or timing.

Validated locally on Apple Silicon with **Rive CLI 1.8.0**. The existing CLI
installation was reused. `rive doctor` passed CLI/update/live-link checks;
Android adb and Xcode were absent. Generated `AGENTS.md` and `CLAUDE.md`
are preserved in this directory; repository-root instructions are untouched.

From the repository root:

```sh
rive --version
rive doctor
rive animations/guaji-transition                      # live local preview
rive animations/guaji-transition --verify
rive inspect animations/guaji-transition --summary
rive animations/guaji-transition --once               # unsigned local .riv
rive animations/guaji-transition --screenshot=animations/guaji-transition/build/half.png --advance=30
rive animations/guaji-transition --screenshot=animations/guaji-transition/build/visible.png --advance=90
rive animations/guaji-transition --screenshot=animations/guaji-transition/build/hidden.png --advance=210
```

Screenshot paths are relative to the shell's working directory. When running
inside this project, use `rive .` and `--screenshot=build/visible.png`.
Build output and logs are ignored by Git; rerun these commands to reproduce them.

The scene uses one Node opacity track, five keyframes, one animation and one
default state machine. No scripts, remote assets, runtime dependency or business
page integration. RML sibling order is front to back: pupils precede the face
and background. Verify/inspect alone cannot catch a hidden foreground, so
inspect the captures too.

Actual checks on 2026-11-02: verify passed with zero errors/warnings; inspect
reported zero problems. Captures at 0.5s, 1.5s and 3.5s were opened and visually
checked for partial, full and zero opacity. The live preview was started and
rebuilt successfully after editing the scene. No upload or publishing command
was run.

Local preview, validation, unsigned build and screenshots do not need login.
The workstation already had an account session; it was not changed or needed
for these commands. Signed publishing and editor `.rev` export are separate
account workflows, outside this example. See the
[official CLI getting started guide](https://rive.app/docs/cli/getting-started),
or the version-matched local `rive docs getting-started`, `rive docs format`
and `rive docs transforms`.
