# HOMEWORK-02: Gallery Image Import for Homework Capture

**Date:** 2026-04-10
**Status:** Approved
**Finding:** `flow-improvements.md` HOMEWORK-02

## Problem

Camera-only homework capture is painful for screenshots, LMS exports, and already-taken photos. Users must re-photograph content they already have digitally.

## Solution

Add `expo-image-picker` as a secondary input path alongside the existing camera. Gallery-picked images feed into the identical OCR pipeline — no backend changes needed.

## Scope

**Phase 1 (this spec): Gallery images only** (JPEG, PNG, WebP). PDF support deferred — it requires multi-page handling, no on-device OCR path, and a different UI for page selection. The 90% use case (screenshots, photos, LMS images) is covered by gallery import alone.

## UI Changes — `camera.tsx`

**Viewfinder phase**: Add a gallery icon button (bottom-left, opposite the flash toggle) that calls `ImagePicker.launchImageLibraryAsync()`. On Galaxy S10e (5.8"), the button needs to be thumb-reachable in the bottom bar.

**Flow after gallery pick:**

1. User taps gallery icon → system image picker opens
2. User selects image → returns URI
3. Dispatch `PHOTO_TAKEN` with the gallery URI → skip to **preview** phase (same as camera capture)
4. User confirms → existing `handleConfirmPhoto()` → OCR pipeline processes the URI
5. Everything downstream (problem cards, subject classification, session launch) is unchanged

**Flow if user cancels picker:** No-op, stay on viewfinder. No error state needed.

## Camera Reducer Changes — `camera-reducer.ts`

Add `source: 'camera' | 'gallery'` to state. The `PHOTO_TAKEN` action already accepts a URI — just need to track the source for analytics. No new phases needed; gallery images enter the same `preview → processing → result` flow.

## OCR Hook — `use-homework-ocr.ts`

**No changes to the core pipeline.** The `process(uri)` function already:

1. Copies to cache (`copyToCache`)
2. Resizes to 1600px JPEG (`resizeImage`)
3. Runs ML Kit → Gemini fallback

Gallery images work identically. The resize step handles oversized images. The JPEG conversion normalizes format.

## Image Picker Configuration

```typescript
const result = await ImagePicker.launchImageLibraryAsync({
  mediaTypes: ImagePicker.MediaTypeOptions.Images,
  quality: 1,        // no pre-compression — our pipeline handles resize
  allowsEditing: false,  // no cropping UI — user sees preview phase for that
});
```

## Permissions

`expo-image-picker` requires `NSPhotoLibraryUsageDescription` on iOS (already needed for any gallery access). On Android 13+, `READ_MEDIA_IMAGES` is auto-granted for picker-only access. No new permission prompt screen needed — the OS handles it inline.

Add the iOS plist string in `app.config.ts` plugin config.

## Dependencies

- Add `expo-image-picker` to `apps/mobile/package.json`
- **This is a native dependency** — requires a new EAS build (not OTA-deployable)

## Analytics

Track `source: 'camera' | 'gallery'` in the `syncHomeworkMetadata` call so we can measure adoption.

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Picker cancelled | User backs out of system picker | Nothing — stays on viewfinder | Tap gallery again or use camera |
| Picker error | OS denies access or picker crashes | Toast: "Couldn't open your photos" | Retry or use camera |
| Oversized image | Gallery image > 5MB after resize | Same error as camera oversized | Retake or choose different image |
| Corrupt/unreadable image | Damaged file selected | OCR error → manual text entry fallback | Same as existing camera OCR error flow |
| Permission denied (iOS) | User previously denied photo access | Alert with "Open Settings" button | User enables in iOS Settings |

## Files Touched

- `apps/mobile/package.json` — add `expo-image-picker`
- `apps/mobile/app.config.ts` — add `NSPhotoLibraryUsageDescription` plugin config
- `apps/mobile/src/app/(app)/homework/camera.tsx` — gallery button + picker integration
- `apps/mobile/src/app/(app)/homework/camera-reducer.ts` — add `source` to state
- `apps/mobile/src/app/(app)/homework/camera.test.tsx` — tests for gallery pick, cancel, error
