# USA Animated Mystery & Horror

Isolated workflow for a separate English-language YouTube Shorts channel targeting US viewers. It does not reuse Indonesian channel credentials or overwrite the existing `horror/` project.

## Current implementation

Phase 1 generates an original English story package (hook, narration, scene prompts, sound cues, title, description, hashtags) and stores it at `data/story.json`. Visual generation, English TTS, Remotion rendering, YouTube upload, and analytics are intentionally separate follow-on stages.

## Local run

```bash
cd usa-mystery
npm install
cp .env.example .env
# Add GEMINI_API_KEY to .env
npm run generate:story -- "The Last Train Had One Extra Passenger"
```

## GitHub Actions

Run **USA Mystery — Generate Story** manually. It produces a JSON artifact only; it does not publish anything to YouTube. Configure `GEMINI_API_KEY` as a GitHub Actions secret.

## Safety / separation

- English (US) only.
- Fictional stories; never label generated stories as true events.
- No automatic publishing until the separate US channel OAuth credentials are configured and tested.
- Never use the Indonesian channel's refresh token for this workflow.


## Full video workflow

GitHub Actions > **USA Mystery - Generate Video** > Run workflow. Enter an English topic. The workflow:
1. Generates a fictional US-English mystery story with Gemini.
2. Generates 6-8 cinematic 3D scene images using Cloudflare Workers AI FLUX.
3. Generates English narration and VTT subtitles using Edge TTS (`en-US-GuyNeural`).
4. Builds a Remotion composition at 1080x1920 / 30 FPS.
5. Renders an MP4 and uploads it with story/manifest JSON as a 7-day artifact.

### Required GitHub Actions secrets

- `GEMINI_API_KEY` — Gemini story generation.
- `CF_ACCOUNT_ID_V2` — Cloudflare account ID.
- `CF_API_TOKEN_V2` — Cloudflare Workers AI token with permission to run the selected model.

Optional repository variable:
- `USA_GEMINI_MODEL` — defaults to `gemini-2.5-flash`.

No YouTube upload is performed. Review the rendered MP4 first. This workflow does not use the Indonesian channel's YouTube OAuth credentials.
