# The brief: what you are promoting, truthfully

Everything downstream (format, hooks, footage, captions) comes from the brief. A vague brief makes
vague reels. A made-up brief makes reels that get the user in trouble.

## Where the truth lives

Read before you ask. Stop when you can fill the brief.

| Source | What to pull |
| --- | --- |
| The user's message and files | the product, the audience, any hooks or references they already like |
| `README*` (root first, then the user-facing app in `apps/*`, `packages/*`) | one-line pitch, features, audience, screenshots |
| `package.json` / `pyproject.toml` / `app.json` / `Info.plist` | name, description, homepage, keywords, store URL |
| `fastlane/metadata/**` (`name`, `subtitle`, `promotional_text`, `description`, `keywords`) | the store listing, usually the best-written copy in a repo |
| Landing pages (`app/page.*`, `pages/index.*`, `index.html`, `site/`, `landing/`) | hero headline, feature bullets, FAQ, public pricing |
| `docs/`, `CHANGELOG.md`, `llms.txt`, `public/og*` | positioning, recent features |
| The live site (when you can browse) | current public claims |

Search copy fast (`rg -i "tagline|headline|hero|subtitle" --max-count 3`) and skip `node_modules`,
build output and lockfiles. Not an app? The same brief works for a creator, a shop, a service or a
personal brand: read their bio, site or past posts instead.

## The brief

```
What:  one plain sentence a 12-year-old would get
For:   a specific person in a specific moment
Pain:  the one painful problem, in that person's words
Aha:   the moment it clicks, as it looks on screen (what the demo/footage shows)
Proof: only real facts you found, with where ("4.8★, fastlane/metadata"), or "none found"
Tone:  how the product talks: playful, deadpan, clinical, hype, soft
Do not claim: anything risky the copy must avoid (user counts, "clinically proven", prices…)
```

Example (a habit-tracker app):

```
What:  an iPhone habit tracker that locks distracting apps until today's habits are done
For:   college students who open TikTok "for 5 minutes" and lose the evening
Pain:  willpower-only habit apps are easy to ignore
Aha:   tapping Instagram and getting a "do 10 pushups first" screen
Proof: none found in repo
Tone:  playful, self-aware, a little savage
Do not claim: user counts, "clinically proven", pricing
```

Show it to the user in 4–6 lines and ask at most one question, with your best guess filled in
("I think this is for freelance designers, right?").

## Truthfulness rules

- State only what you found or what the user told you, and say where proof points came from.
- No invented prices, discounts, free trials, user counts, ratings, rankings, testimonials,
  endorsements, "as seen on", or medical / financial / body outcomes.
- Numbers in hooks must come from the repo, the footage on screen, or the user.
- Pre-launch or no copy at all? Say so, write the brief from what the product actually does (its
  screens and features), and ask the user to confirm the audience.
- If a hook only works with a claim nobody backed up, drop the hook, not the rule.
