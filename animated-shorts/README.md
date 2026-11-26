# Three.js + Remotion Animated Shorts Engine

This branch integrates the core rendering approach from Claude Animated Shorts into
the existing `remotion-v2` project while preserving the image-based YouTube pipeline.

## What is integrated

- `three` + `@react-three/fiber`: procedural 3D world, props and character animation.
- `@remotion/three`: `ThreeCanvas`, synchronized to Remotion frames.
- Remotion: vertical video composition, subtitles, narration audio and MP4 rendering.
- Gemini: Indonesian Islamic reflection script, structured scene storyboard and TTS.

The new Facebook Reels workflow now uses this animated renderer instead of generating
a separate FLUX image for every scene. Gemini supplies controlled scene attributes:
setting, character action and mood. The recurring character is built from procedural
geometry and uses a fixed visual design.

## Preview render

The repository also registers an optional composition named `AnimatedStoryShort`:

```bash
npm install
npm run render:animated
```

The command uses `--gl=swangle`, which is the recommended fallback for machines
without a dedicated GPU, including standard GitHub Actions runners.

## Facebook Reels workflow

Run **Actions → Generate and Publish Independent Facebook Reels** on this branch.
It generates the script, Gemini narration, 3D storyboard, animation, metadata and
publishes to Facebook Page Reels using the existing Facebook secrets.

## What remains to be improved

- The recurring character currently uses an articulated procedural rig with frame-driven limb, head, breathing, blink and gesture animation. It is not yet a skinned GLB character with motion-capture clips.
- Scene actions and camera directions are selected per scene (walking, sitting, dua, looking up; wide, medium, close, orbit and low angles). Environment variants remain procedural and limited to a small set of settings.
- Subtitle timing is estimated by scene word count, not aligned word-by-word to the TTS waveform.
- The full 2K look, advanced ink outlines, depth-of-field and sound-effect synthesis from
  the reference skill are not yet implemented.
- GitHub Actions render duration and WebGL stability still need an end-to-end run.

The existing image-based YouTube composition and upload workflow are not replaced.
