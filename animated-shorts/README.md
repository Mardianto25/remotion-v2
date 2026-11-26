# Three.js + Remotion Animated Shorts Engine

This branch integrates the 3D animated storytelling renderer into the existing
`remotion-v2` project while preserving the image-based YouTube pipeline.

## Character and animation

- The main animated scene now loads a skinned humanoid GLB with a 65-bone
  Mixamo-compatible skeleton and 36 embedded animation clips.
- `src/animated/RiggedCharacter.jsx` clones the skinned model, selects a clip
  from the Gemini storyboard action, and drives its AnimationMixer from the
  Remotion frame number for deterministic rendering.
- The previous procedural character remains only as a Suspense loading fallback.
- Current action mapping: walking → Walk; standing → Idle; looking_up → Look
  Around; sitting/reading/prayer_sitting → sitting clips; ruku → Bow;
  kneeling/sujud → Kneeling; dua/working → Thinking. Several story actions are
  approximated by the closest available clip because the asset does not contain
  dedicated washing, embracing, dua, ruku or sujud performances. Do not treat
  the approximations as validated salah movements.

### Character asset and attribution

The rigged model is the Mannequin Man GLB by vinish.dev:
https://vinish.dev/free-3d-models/character-animations

Licence: Creative Commons Attribution 4.0 (CC BY 4.0). Required credit:
"Mannequin Man" by vinish.dev (https://vinish.dev/free-3d-models/), CC BY 4.0.

The GLB is downloaded during the preview and Facebook Reels workflows to
`public/models/mannequin-man.glb` or the Facebook workflow's custom public
directory. It is intentionally not checked into Git because it is a binary asset.

## Preview render

```bash
npm install
mkdir -p public/models
curl -fL https://models.vinish.dev/animations/mannequin-man.glb -o public/models/mannequin-man.glb
npm run render:animated
```

The preview uses `--gl=swangle`, suitable for standard GitHub Actions runners.

## Facebook Reels workflow

Run **Actions → Generate and Publish Independent Facebook Reels**. It downloads
the rigged model, generates the script and Gemini narration, builds the 3D
storyboard, renders the Reel and publishes to Facebook Page Reels using the
existing Facebook secrets.

## Remaining work

- The selected source character is a segmented mannequin, not yet the final
  clothed recurring Muslim character. Replace it with a custom, consistently
  styled skinned character when that asset is ready.
- The available animation pack does not provide authentic prayer or all
  narrative gestures. Dedicated clips or carefully reviewed custom animation
  are needed for wudu, dua, ruku and sujud.
- Environment modules are reusable starting points, not finished photorealistic
  assets. Scene props, materials, interactions and visual QA still need work.
- Subtitle timing is estimated by scene word count, not aligned word-by-word to
  the TTS waveform.
- End-to-end render duration and WebGL stability must be verified in Actions.

The existing image-based YouTube composition and upload workflow are not
replaced. The animated model is currently used by the dedicated Facebook Reels
workflow and the optional animated preview composition.
