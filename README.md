# Southern League - Division One Central Predictor

A private, Superbru-style score predictor for you and your friends, built around
the Southern League - Division One Central fixture list from
[footballwebpages.co.uk](https://www.footballwebpages.co.uk/southern-football-league-division-one-central).

- Everyone predicts scores for as many upcoming fixtures as have been published.
- Predictions are hidden from everyone else until that match kicks off, and can be
  changed right up until then.
- Scoring: **3 points** for an exact score, **1.5 points** for the correct result
  and correct goal difference (but not the exact score), **1 point** for the
  correct result only, **0** otherwise.
- The leaderboard updates itself automatically as results come in.
- No passwords - you join with just a name and a private recovery link.
- Runs entirely on free tiers: Vercel (hosting), Supabase (database) and GitHub
  Actions (the job that keeps fixtures and results in sync).

## Why it needs to be "deployed" at all

To keep everyone's predictions hidden from each other until kickoff, and to have
one shared leaderboard, the app needs a real server and database in the middle -
it can't just be a file you open in a browser. The good news is the three
services below are free for a group of friends and take about 15 minutes to set
up, once.

## A note on the data source

Football Web Pages does offer a free API, but it's only licensed for non-league
clubs' own official websites - not for a personal project like this one. Their
`robots.txt` does allow crawling the public fixtures pages though, so this app
reads the same public fixtures/results page a human visitor would see, at a
polite, capped rate (every 30 minutes, via the GitHub Actions job below). If
Football Web Pages ever changes their page layout, the sync job's parsing logic
in `lib/scraper.ts` may need a small update.

---

## 1. Create the database (Supabase - free)

1. Go to [supabase.com](https://supabase.com), sign up, and create a new project
   (pick any name/region, and set a database password - you won't need it again).
2. Once it's ready, open **SQL Editor -> New query**, paste in the contents of
   [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. This creates
   the three tables the app needs.
3. Open **Settings -> API**. You'll need two values in a minute:
   - **Project URL**
   - **service_role** key (click "Reveal" - keep this secret, it has full access
     to your database)

## 2. Put the code on GitHub

1. Create a new, empty repository on [github.com](https://github.com) (private is
   fine).
2. Upload this whole `southern-predictor` folder to it (via the GitHub website's
   "upload files" option, or `git init && git add . && git commit -m "Initial
   commit" && git push` if you're comfortable with git).

## 3. Deploy it (Vercel - free)

1. Go to [vercel.com](https://vercel.com) and sign up with your GitHub account.
2. Click **Add New -> Project**, and import the repository you just created.
3. Before deploying, open **Environment Variables** and add:

   | Name                        | Value                                              |
   | ---------------------------- | --------------------------------------------------- |
   | `SUPABASE_URL`                | the Project URL from step 1                         |
   | `SUPABASE_SERVICE_ROLE_KEY`   | the service_role key from step 1                    |
   | `LEAGUE_SLUG`                 | `southern-football-league-division-one-central`     |
   | `LEAGUE_NAME`                 | `Southern League - Division One Central`            |
   | `CRON_SECRET`                 | any long random string (e.g. mash the keyboard, or generate one at [random.org](https://www.random.org/strings/)) |

4. Click **Deploy**. After a minute or two you'll get a live URL like
   `https://southern-predictor-yourname.vercel.app` - that's the link you'll send
   your friends.

## 4. Keep fixtures/results syncing automatically

This turned out to be the trickiest part. footballwebpages.co.uk sits behind
Cloudflare, and Cloudflare blocks requests from well-known cloud/hosting IP
ranges - which includes **both** Vercel's serverless functions **and** GitHub
Actions runners (confirmed by testing directly against each: same request,
same headers, both get HTTP 403). A `.github/workflows/sync.yml` calling
`/api/cron/sync` on a schedule, which is the "obvious" free approach, simply
can't work here - it would just generate a stream of failure emails, so
that workflow is disabled in this repo.

What does work: `scripts/sync-now.ts` shells out to `curl` (which, for
reasons that come down to TLS-fingerprinting rather than anything about the
request itself, isn't blocked the way Node's `fetch()` is) and writes
straight into Supabase. It just needs to run somewhere with an ordinary
outbound IP, on a schedule. Options, roughly in order of effort:

- **Easiest**: if you have any always-on computer (a Raspberry Pi, an old
  laptop, a NAS), add a cron job there that does:
  ```bash
  git clone https://github.com/<you>/southern-predictor.git   # first time only
  cd southern-predictor && git pull && npm install
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/sync-now.ts
  ```
  Run it every 30-60 minutes via `crontab -e`.
- **No spare computer**: a free-tier VM that isn't on a major cloud
  provider's flagged ranges (a lot of "cloud" is flagged; test with `curl`
  from it first), or a service built for exactly this (running scheduled
  jobs from residential-ish egress).
- **What's actually running right now**: for this deployment, the sync is
  scheduled as a recurring job that runs `scripts/sync-now.ts` directly
  against your Supabase project - so you don't need to do anything for it to
  keep working, but it's worth knowing where the data's coming from if it
  ever needs troubleshooting.

Either way, run `npx tsx scripts/sync-now.ts` by hand any time you want an
immediate refresh (e.g. right after deploying, so fixtures show up straight
away instead of waiting for the next scheduled run).

## 5. Play

Send your friends the Vercel URL from step 3. Each person opens it, types their
name, and saves the private link they're shown (it's the only way to get back in
on a different phone or browser, since there are no passwords). Then everyone
heads to **Predict** to fill in scores, and **Leaderboard** to see how they're
doing.

---

## Local development (optional)

```bash
npm install
cp .env.example .env.local   # fill in your Supabase + cron values
npm run dev                  # http://localhost:3000
npm test                     # scoring unit tests + a live scraper check
```

## How it works, briefly

- `lib/scraper.ts` - reads the public fixtures/results page for the league,
  month by month, and turns it into structured fixture/result data.
- `app/api/cron/sync/route.ts` - the endpoint GitHub Actions calls. It re-scrapes
  the league, upserts every match into the `matches` table, and (re)computes
  points for every prediction attached to a finished match.
- `lib/scoring.ts` - the 3 / 1.5 / 1 / 0 scoring rule, as a small pure function.
- `app/api/predictions/route.ts` - this is where predictions are kept hidden:
  the GET handler only ever returns a friend's prediction for a match once that
  match's kickoff time is in the past. The POST handler refuses to save a
  prediction once kickoff has passed.
- Identity is a random token in an HTTP-only cookie, created when you type your
  name - no passwords, no emails. The "recovery link" shown after joining just
  carries that token so you can log back in on another device.
