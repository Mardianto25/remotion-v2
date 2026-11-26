# Three.js + Remotion Animated Shorts Engine

This branch integrates the 3D animated storytelling renderer into the existing
`remotion-v2` project while preserving the existing YouTube image-based pipeline.

## Main character

- The original procedural character in `src/animated/AnimatedWorld.jsx` is the
  active main character again.
- It retains the established visual design: complete light-colored outfit,
  dark peci, expressive face, and frame-driven body posing.
- The character is rendered directly in the scene. There is no external GLB
  mannequin dependency or model download step.
- Story actions such as walking, sitting, dua, looking up, crying, ruku and
  sujud are represented by procedural poses. These are stylized approximations,
  not motion-captured or religiously validated prayer animations.

## Scene environments

The animated world includes reusable settings such as mosque interior, mosque,
wudu area, home, kitchen, office, hospital, school, market, beach, mountain,
garden and cemetery. Storyboard settings and mood determine the environment,
lighting and atmosphere.

## Preview render

```bash
npm install
npm run render:animated
```

The preview uses the existing Remotion composition and the GitHub Actions
workflow. No external character model download is required.

## Facebook Reels workflow

Run **Actions → Generate and Publish Independent Facebook Reels**. It generates
the script and Gemini narration, builds the 3D storyboard, renders the Reel,
generates metadata and publishes to Facebook Page Reels using the existing
Facebook secrets. The existing publishing flow is retained.

## Next visual-quality improvements

- Improve the procedural character's facial expressions, cloth folds, hands
  and proportions without changing its established identity.
- Refine each action pose and transitions so the acting feels less mechanical.
- Add richer scene props, cinematic camera movement, depth and lighting.
- If a rigged character is introduced later, it must preserve this character's
  visual identity rather than replacing it with a generic mannequin.

The existing image-based YouTube composition and upload workflow are not
replaced.
