# Three.js + Remotion Animated Shorts Engine

This branch adds an optional animated composition to the existing Remotion project.
The current image-based `ShortsVideo` composition remains unchanged.

## Technology

- `three` + `@react-three/fiber`: 3D world and characters.
- `@remotion/three`: `ThreeCanvas`, synchronized to Remotion frames.
- Remotion: vertical video composition, subtitles, audio, and final MP4 render.

## Preview render

Install dependencies with `npm install`, then run:

```bash
npm run render:animated
```

The renderer uses `--gl=swangle`, which is suitable for GitHub Actions runners without a dedicated GPU.

## Current scope

The first implementation is an isolated proof-of-integration composition named
`AnimatedStoryShort`. It demonstrates a 3D storybook environment, a simple
animated character, camera movement, Indonesian subtitle segments, and an
optional audio track.

It does not replace the existing image-based pipeline or publish automatically.
The next integration stage is to make the content generator output a structured
storyboard (characters, locations, actions, camera cues, and subtitle timings),
then feed that JSON into this composition. Existing YouTube/Facebook upload
workflows remain separate and unchanged.

## Important rendering note

The original Claude skill documents large render temp usage and slow 2K renders.
This implementation starts at 1080x1920 and uses a lightweight procedural scene.
Quality checks and GitHub Actions render time should be measured before scaling
to 1440x2560 or adding detailed post-processing.
