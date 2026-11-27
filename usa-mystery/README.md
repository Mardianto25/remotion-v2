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
