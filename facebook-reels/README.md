# Independent Facebook Reels workflow

This workflow creates original Islamic reflection videos independently from the existing Instagram URL, episode, YouTube, and Facebook publishing workflows.

## Run

GitHub Actions -> **Generate and Publish Independent Facebook Reels** -> Run workflow.

Enter a topic. Set publish to false to render only, or true to schedule the finished Reel on the Facebook Page.

## Required repository secrets

- GEMINI_API_KEY - script, metadata, and Gemini TTS.
- CF_ACCOUNT_ID - Cloudflare account ID for FLUX scene images.
- CF_API_TOKEN - Cloudflare AI permission for FLUX.
- FB_PAGE_ID - Facebook Page ID.
- FB_PAGE_ACCESS_TOKEN - Page access token with video publishing permissions.

## Voice

Primary: gemini-3.8-flash-tts, fallback: gemini-2.5-flash-preview-tts.
Voice: Orus (adult male voice profile), delivery: emotional Indonesian reflection.
The model is selected from the Gemini API free tier where available. Free-tier quotas and availability are controlled by Google and may change. Google states free-tier prompts/audio may be used to improve its products; avoid sending sensitive personal information.

## Character and visuals

character.json is the canonical character description. The generated character master is cached by GitHub Actions and generated only on a cache miss. FLUX Schnell is text-to-image, so each scene repeats the same canonical character description; it does not use true image-to-image identity conditioning. Visual identity is therefore prompt-consistent, not guaranteed pixel-identical.

All new assets are isolated under public/facebook-reels/ and out/facebook-reels/. The existing public/audio.mp3, public/subtitles.json, public/transcript.txt, public/images/, existing Remotion composition, YouTube workflow, and existing Facebook publisher are not used or modified.

## Caption timing

Gemini TTS does not return word-level timestamps in this pipeline. Subtitle scene boundaries are estimated proportionally from each segment's word count against the final audio duration. Review the rendered video for precise caption timing when needed.

## Facebook publishing

Only the Facebook Page Reels endpoint is used. The upload is scheduled for the next Jakarta slot (05:00, 11:30, or 18:30) at least 15 minutes in the future. It does not publish to a personal Facebook profile; a separate personal-profile caption is included in the artifact for manual sharing.
