# Setup AI Content Performance Analyzer

Analyzer runs separately from video rendering and publishing.

## GitHub Actions secrets

Make sure these repository secrets exist:

| Secret | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Generate content recommendations |
| `YOUTUBE_CLIENT_ID_3N` | Google OAuth client ID |
| `YOUTUBE_CLIENT_SECRET_3N` | Google OAuth client secret |
| `YOUTUBE_ANALYTICS_REFRESH_TOKEN` | Google refresh token with YouTube Analytics read access |
| `FB_PAGE_ACCESS_TOKEN` | Page token used to read Facebook post insights |

The collector falls back to `YOUTUBE_REFRESH_TOKEN_3N` when `YOUTUBE_ANALYTICS_REFRESH_TOKEN` is not set. That token may only have upload permissions, so the Analytics API can still return an insufficient-scope error.

## YouTube Analytics OAuth scope

The OAuth grant used to create `YOUTUBE_ANALYTICS_REFRESH_TOKEN` must include:

`https://www.googleapis.com/auth/yt-analytics.readonly`

Use the same Google Cloud OAuth client configured for the YouTube channel. Generate a new refresh token with this scope and save it as the GitHub Actions secret `YOUTUBE_ANALYTICS_REFRESH_TOKEN`. Keep the existing upload refresh token unchanged.

## Facebook Page Insights permission

The Page access token needs `read_insights` in addition to the Page permissions already used for publishing. The collector tries to read `post_impressions` and `post_engaged_users` for each stored Feed/Reels object ID. Meta can restrict available metrics depending on the object type, Graph API version, Page eligibility, and app access level; those failures are recorded in the report rather than treated as zero views.

## Run the workflow

1. Merge the feature pull request into `main`.
2. Open **Actions → AI Content Performance Analyzer**.
3. Select **Run workflow** for the first manual run.
4. Open the run summary for the report, or download the `ai-content-performance-report` artifact.
5. Later runs are scheduled daily at 08:00 WIB.

New YouTube uploads are registered after the Facebook publishing workflow completes. The registry is stored in `data/analytics/videos.json`; snapshots are appended to `data/analytics/snapshots.json`.

## Metric windows and limitations

- YouTube day-1 and day-7 figures use the first calendar day and first seven calendar days reported by YouTube Analytics. They are not rolling 24-hour windows.
- The current totals include all available reporting dates from the publication date through the collection date.
- Facebook Insights is best-effort and depends on the Page token's `read_insights` permission and the metrics exposed for each post object.
- Facebook personal-profile analytics are not collected by this Page-token workflow.
- The first meaningful report appears after a video is registered and the relevant platform APIs return metrics.
