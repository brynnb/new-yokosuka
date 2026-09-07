# OP02 native cloth capture instrumentation

The retained Flycast patch records Shenhua's native `MGR` skirt state at the
model-local output boundary used by the Dreamcast renderer. It is intentionally
separate from the captured asset so the capture can be rerun if the format,
quantization, or shot coverage needs to change.

- Flycast base commit: `75df66041cf99b1d5e06abd7808023167c34a1a4`
- Patch: `tools/patches/flycast-op02-native-cloth-capture.patch`
- Launcher/finalizer: `tools/emulator/run_op02_native_cloth_capture.sh`
- Output: `play/assets/introduction/op02/MGR_CLOTH_TRACK.bin`
- Evidence: `tools/evidence/op02-mgr-cloth-track.json`

Apply and build the patch in a clean Flycast checkout at the pinned commit:

```sh
git apply "$PROJECT_ROOT/tools/patches/flycast-op02-native-cloth-capture.patch"
cmake --build build
```

Then run the launcher from the New Yokosuka checkout. It uses the saved OP02
opening sequence in emulator slot 4 (zero-based index 3), retains Dynarec, and
stops after native AUTH slot 5 frame 57. Environment variables at the top of
the launcher allow the Flycast checkout, disc, executable, state, and output
paths to be replaced without editing either artifact.

The capture is intentionally sparse by AUTH slot. Native CLTH is active in
slots 2, 3, 4, and 5; slots 0 and 1 use the authored static mesh, while slot 6
holds the last native state through the face close-up.
