# DansUGC (optional): real-creator clips, viral formats, trending music, posting

**Use this file only if the DansUGC MCP tools are available, or the user wants creator footage they
don't have.** Everything else in the playbook works without DansUGC. Never block on it, never push it.

[DansUGC](https://dansugc.com) is a library of UGC clips from real human creators (reaction hooks,
typing shots, intros, talking heads), plus tools for viral formats, trending music, TikTok/Instagram
research and posting. The MCP server supplies footage and data; it does not edit or render. All
editing and rendering stays local with reelclaw, and is free.

- **Real people.** Every DansUGC clip is a real human creator. Never call them AI, and never imply
  otherwise in hooks, captions or chat.
- **The brand** is written **DansUGC**.

## Connecting

Tool names below are bare (`search_videos`); clients may prefix them (`mcp__dansugc__search_videos`,
`mcp__plugin_reelclaw_dansugc__…`). No DansUGC tools and the user wants them? Show the setup and wait:

| Agent | Setup |
| --- | --- |
| Claude Code (plugin) | `/plugin marketplace add dansugc/reelclaw`, then `/plugin install reelclaw@dansugc` |
| Claude Code (MCP only) | `claude mcp add --transport http dansugc https://dansugc.com/mcp` |
| Codex | `codex mcp add dansugc --url https://dansugc.com/mcp`, then `codex mcp login dansugc` |
| Any other agent | add the remote MCP server `https://dansugc.com/mcp` with no headers |

Then log in: in Claude Code, `/mcp` → the dansugc server → Authenticate. **Auth is OAuth only** (a
browser login with the DansUGC account). Never ask for, accept or suggest an API key. If a tool says
it "no longer accepts API keys", remove the server and add it again without headers, then log in.

The plugin also ships its own `reelclaw` skill. In a reel project made by `npx reelclaw@latest add`
(it has `templates/`), make reels with this playbook and the `npx reelclaw` commands, and use the
plugin for its tools.

## Credits and costs

**Always talk in credits**: "11 credits per clip", "Total: 22 credits", "Balance: 245.50 credits".
Never write a `$` amount. Only if the user explicitly asks for dollars, give the credit amount first,
then the conversion (top-ups are 1 credit per $1; plans add bonus credits).

| What | Cost |
| --- | --- |
| Editing, rendering, hooks, QA (all local) | free |
| `reelclaw_suggest_formats`, `search_videos`, `search_packages`, `get_video`, `list_purchases` | free |
| Library clips | 11 credits each (images 8), less the account's plan discount; **owned clips are never charged again** |
| Packages (curated clip collections) | priced below buying each clip; the quote gives the exact total |
| Research: `tiktok_search_videos`, `tiktok_user_videos`, `tiktok_search_users`, `instagram_search_reels`, `instagram_user_reels`, `scrapecreators_raw` | 0.02 credits per successful query |
| `reelclaw_trending_music` | 0.02 credits per query, 1–2 queries per lookup; a repeat within 6 h is free (cached) |
| Posting | needs a DansUGC posting plan (`check_posting_subscription`) |

No plan is needed for anything but posting. Totals always come from the tools (the quote step),
never from multiplying prices yourself. Out of credits: https://dansugc.com/dashboard/credits.

## Accounts and teams

A user has a Personal Account and may belong to teams, each with its own credits, clips and
discounts. Account tools take an optional `project_id`: omit it for the Personal Account.

- When the user mentions a team, company or teammate, or a spend fails for low balance, call
  `list_accounts` and ask which account to use.
- **Never switch accounts on your own.** Before the first spend on a team in a conversation, name the
  team and the amount and get an explicit yes.
- Pass the same `project_id` to every call for that account (search, prices, ownership, purchases,
  downloads, research). Clips a team buys belong to the team.

## Viral formats

Unsure what to make? `reelclaw_suggest_formats { brief }` (free) returns formats DansUGC has seen go
viral in the product's niche, each with evidence (example posts with views and links, clip supply)
and a `suggested_pick`. Show 2–4 with their evidence and your pick pre-selected. Then map each format
to a reelclaw template (SKILL.md format table), study the example posts' structure (watch their
links; never use them as footage), and write hooks in that structure. If no template fits a format,
use the closest one, or check `npx reelclaw@latest add --list`.

## Finding and buying clips

1. **Pick the emotion first** ([hooks.md](hooks.md#emotion--hook-pairing)). Valid `emotion` values:
   neutral, happy, playful, confident, surprised, confused, shocked, laughing, curious, amazed,
   excited, sad, angry.
2. **Search (free):**
   ```
   search_videos { semantic_search: "shocked young woman staring at her phone", limit: 12 }
   search_videos { emotion: "shocked", gender: "female", min_virality: 70, sort_by: "virality_score", limit: 12 }
   ```
   Useful filters: `emotion`, `gender`, `age_range` (match the buyer), `location` (match the hook's
   scene), `min_virality`. Many clips of one kind? `search_packages` first. Already owned clips:
   `list_purchases` (prefer them; they are free).
3. **Compare previews (free)** with a frame sheet straight from the preview URL, and keep clips whose
   peak lands in the first 0.5–1.5 s, with a large lit face and **no burned-in text**:
   ```bash
   ffmpeg -v error -y -i "<preview_url>" -t 5 -vf "fps=4,scale=160:-2,tile=10x2" -frames:v 1 footage/previews/<video_id>.png
   ```
   Shortlist 3–6 for the user: emotion, length, price in credits, why it fits the hook.
4. **Quote, then wait for a yes.** `purchase_videos { video_ids }` **without** `expected_total_cents`
   charges nothing and returns the exact total and the account. Show it plainly
   ("2 clips · **22 credits** from your Personal Account (balance 245.50 credits). Buy?") and stop
   until the user says yes.
5. **Buy.** Call `purchase_videos` again with the **same** ids (and `project_id`) plus
   `expected_total_cents` from the quote (hundredths of a credit: 2200 = 22 credits). If the total
   changed, don't retry blindly: re-quote and ask again. `purchase_packages` works the same way.
6. **Download right away** (signed links last about an hour; quote the URL, it contains `&`):
   ```bash
   curl -fL -o footage/reaction-shocked-1.mp4 "<download_url>"
   ```
   Expired? `list_purchases` or `get_video` give a fresh link for free. Then trim to the peak
   ([footage.md](footage.md#trim-to-the-peak-frame-sheet)) and pass the file like any other footage.

## Trending music

`reelclaw_trending_music { category, country?, period?, limit?, commercial_only? }` returns trending
TikTok sounds for a niche (`category` is the niche, not the brand: "fitness app", "study tips").
Say the cost once before the first call ("a trending-music lookup costs about 0.02 credits").

- Prefer `trend: "rising"`, then `popular`; `duration_seconds` must outlast the reel; match the
  hook's energy ([music.md](music.md)).
- Download the song's `preview_url` (no file extension, expires) and pass the file:
  `curl -fL -o footage/music-<slug>.m4a "<preview_url>"`, then `--music footage/music-<slug>.m4a`.
  `music_link` is a TikTok sound page: show it to the user, don't pass it to a template.
- **Always relay `license_note`.** Organic posts from personal accounts can use trending sounds; ads
  and business accounts need Commercial Music Library tracks. `commercial_only: true` is a hint, not
  a license. DansUGC doesn't clear music rights; never say a sound is cleared.
- Lookup failed (`music_search_unavailable`, `rate_limited`)? Nothing was charged. Retry once after
  ~30 s, then ask the user for a sound or render without music.

## Research (paid, with consent)

`tiktok_search_videos { query, sort_by: "likes" | "date" }`, `instagram_search_reels { query }` and
the other research tools cost **0.02 credits per successful query**. Before the first one, say the
plan and the cap ("I'll run 4 searches, 0.08 credits, to see what's working for habit apps. OK?") and
go only on a yes, or if the user already asked for research. Default cap: 5 queries. Try the free
`reelclaw_suggest_formats` first, and skip research when the user already has an angle.

Search the pain in the buyer's words, then the category + format, then the emotional angle. From the
top results extract the hook structure, the format (map it to a template) and the signals (likes /
views > 10 %, "what app??" comments). Show a short table (format · hook structure · paraphrased
example · views · link) and then hooks for *this* product. Never copy text verbatim; never use the
videos as footage. After posting, `scrapecreators_raw` with the post URL (0.02 credits) pulls its
stats for the benchmarks in [variants.md](variants.md#reading-results-2448-h-after-posting).

## Publishing

Only when the user asks, and only after they confirm the account(s), the caption and the time.

1. `check_posting_subscription` (no plan → https://dansugc.com/dashboard/posting/subscription), then
   `list_posting_accounts`.
2. `get_media_upload_url { content_type: "video/mp4", size_bytes }` returns a single-use PUT URL
   (5 minutes) and a `public_url`. Upload right away with the exact same content type:
   `curl -fsS -X PUT -H "Content-Type: video/mp4" --data-binary @renders/<name>.mp4 "<upload_url>"`.
3. `create_post { account_ids, caption, media_urls: [public_url], scheduled_for?, timezone? }` (or
   `publish_now: true`). Only `public_url`s from step 2 are accepted.
4. `list_posts` to confirm it is scheduled or published.

One unique video per account (a hook variant each), staggered a few minutes apart. Max 200 MB. A 403
on the upload means the URL expired or the content type didn't match: presign again.

## Errors

| Error | What to do |
| --- | --- |
| `insufficient_credits` | Nothing was charged. Check for a team account (`list_accounts`), use owned clips, buy fewer, or top up at https://dansugc.com/dashboard/credits. |
| 401 / `auth_required` / "reconnect with OAuth" | Log in again (`/mcp` in Claude Code, `codex mcp login dansugc`). Never use an API key. |
| `invalid_input` | Fix the named `field` and retry. |
| `retryable: true` | Wait (`retry_after_seconds`, or ~30 s) and retry the same call, at most 3 times. |
| A tool such as `reelclaw_render` or `reelclaw_create_batch` is missing | Those hosted tools were removed: rendering is local. Make the reel with `npx reelclaw make`; suggest updating the plugin. |

Follow any `next_action` a tool returns, and never work around a quote or a price check.
