# Football club website

Built by [Jordi Albanell](https://jordialbanell.com/projects) for his own eleven-a-side team. This copy is a made-up club, Riverside FC, with a sample squad, matches and sponsors. More on [jordialbanell.com](https://jordialbanell.com/projects).

Club website. Public fixtures, results and stats. Captains-only lineup builder with a publish and comment flow. Season-long fantasy league.

No build step. Plain HTML, CSS and JavaScript with the Supabase JS client from a CDN.

---

## Setup, about 20 minutes

### 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free project. Pick the region closest to you.
2. Open **SQL Editor** and run `supabase/schema.sql` in full.
3. Run `supabase/seed.sql`. This loads a made-up squad of 15, two venues, the season, the fantasy scoring rules, and a few sample matches and results so the site has something to show. Swap in your own from the admin panel.

Already ran an earlier version of `schema.sql`? Run `supabase/migrations/001_fantasy_transfers.sql` instead of starting over. It is safe to run twice and backdates existing squads to the season start so nobody loses points.

### 2. Wire up the front-end

Open `public/js/config.js` and replace the two placeholders:

```js
SUPABASE_URL:      'https://xxxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJhb...',
```

Both are in **Project Settings > API**. The anon key is designed to be public. Row Level Security in `schema.sql` is what actually protects the data.

### 3. Turn on email sign-in

**Authentication > Providers > Email**. Enable it and turn ON "Confirm email". Magic links only, no passwords.

Under **Authentication > URL Configuration**, add your Vercel domain to Site URL and Redirect URLs.

### 4. Deploy

```bash
npm i -g vercel
cd riverside-fc
vercel
```

Point it at the `public` directory when asked for the output directory. Or connect the repo to Vercel through the dashboard.

### 5. Make yourself an admin

Sign in on the live site once with your email. Then in the Supabase SQL Editor:

```sql
update profiles
  set role = 'admin',
      player_id = (select id from players where squad_num = 2)
  where id = (select id from auth.users where email = 'your@email.com');
```

After that you can promote everyone else from the site itself: **Admin > People & Roles**. Do that for the other captains.

---

## How it works

### Roles

| Role | Can do |
|---|---|
| **public** (not signed in) | See fixtures, results, published lineups, stats, squad, media, the fantasy leaderboard and any manager's team |
| **guest manager** (anonymous sign-in) | The above, plus create and run one fantasy team. Nothing else: no media, no comments, no approval queue |
| **viewer** | The above, plus a real account a captain can approve |
| **player** | The above, plus set their own availability and comment on lineups |
| **admin** (captains) | Everything. Create fixtures, build and publish lineups, enter results, write reports, upload media, manage the squad and roles |

Linking a profile to a squad player is what unlocks availability. Do it in
**Admin > People**, where captains can also rename anyone inline and delete an
account outright.

Deleting takes the sign-in, the profile and their fantasy team, squad and
transfer history. It leaves photos, comments and match reports on the site with
no name on them: losing a season of pictures because someone left would be far
worse than an unattributed caption. There is no undo, and you cannot delete the
account you are signed in as.

Guest fantasy managers get their own list on that page rather than sitting in
the approval queue. There is nothing to approve about them, but a captain can
name one and link it to a squad player.

### Weekly rhythm

1. A captain adds the fixture in **Admin**.
2. Players open the fixture page and tap In, Maybe or Out.
3. A captain opens **Edit Lineup**. Only players marked In appear in the picker. Drag them onto the pitch, assign subs, save as a draft.
4. Other captains open the same lineup and comment. Drafts are visible to anyone signed in, hidden from the public.
5. Publish. Now everyone including the public sees it.
6. After the match, **Enter Result**. Tick who played, add goals, assists and cards, pick a man of the match.
7. Stats, leaderboards and fantasy points all recalculate from that one form.

### Fantasy scoring

Each manager picks 8 players. The first squad is free.

| Event | Points |
|---|---|
| Appearance | +2 |
| Goal (MID / ATT) | +5 |
| Goal (GK / DEF) | +7 |
| Assist | +3 |
| Clean sheet (GK / DEF) | +4 |
| Man of the match | +3 |
| Yellow card | -1 |
| Red card | -3 |
| Own goal | -2 |

No minute tracking. Everything comes off the result form.

Clean sheets are awarded automatically to every GK and DEF who played when the opposition scored zero.

### Transfers

**2 free transfers per season, then 4 points each.** Both numbers live on the season row:

```sql
update seasons set free_transfers = 3, transfer_cost = 6 where is_active;
```

Change them mid-season if you want. No redeploy.

**How ownership works.** A pick is not a permanent row, it is a window with an `acquired_at` and a `released_at`. You only bank a player's points for fixtures that kicked off inside your window.

Worked example. You own Nico from the start of the season and he scores 9, then 7. You transfer him out. He scores 12 the following week.

| | |
|---|---|
| Nico, matches 1 and 2, while you owned him | +16 |
| Nico, match 3, after you sold him | 0 |
| Max, match 3, after you signed him | +15 |
| Transfer hit | -4 |
| **Net** | **27** |

You keep everything a player earned for you. You get nothing he does after you sell him, and nothing a signing did before you bought him. This is the bit a naive implementation gets wrong: swapping to whoever is top of the scoring chart would otherwise hand you all their earlier points for free.

The league table shows three columns so the maths is visible: **Earned**, **Hits**, and **Net**.

Re-signing someone you previously sold works fine and creates a second window.

**If you change the points values, change them in three places:** the `fantasy_player_points` view and the `fantasy_player_fixture_points` view in `schema.sql`, plus `FANTASY_RULES` in `config.js`. The two views do the maths (season totals and per-fixture totals), the config only draws the table on screen.

### Media

Photos upload to a Supabase Storage bucket called `team-media`. The free tier gives you 1 GB, which is a few hundred match photos.

Videos are embedded, not uploaded. Paste a YouTube, Vimeo or Instagram link. Costs no storage and loads faster.

---

## Known gaps

Things deliberately left rough in this first version:

- **Fixtures are entered by hand.** The league site we built this for is a client-rendered SPA with no public API, so nothing can be scraped from it. If it exposes a JSON endpoint, an importer is easy to add.
- **Player positions are yours to set.** Fix them in **Admin > Manage Squad** before anyone picks a fantasy squad, because position changes the points a goal is worth.
### Fantasy without accounts

Anyone can run a team without a Google account. The Fantasy page's create form
signs them in anonymously (Supabase **Authentication > Sign In / Providers >
Anonymous sign-ins** must be on), then `create_fantasy_team()` writes the team
and a private row holding their email and a 64-character **edit link**.

- The email is what makes it one team per person, case-insensitively.
- **Signing in with that email recovers the team** on any device.
  `claim_fantasy_team_by_email()` runs once per sign-in, reads the verified
  address off the token and hands the team over. Someone already running a
  team this season keeps it; two squads are never merged.
- The edit link, `.../#/fantasy/claim/<token>`, is the backup route in, for
  when the email doesn't reach them. Opening one **moves ownership** to
  whoever opened it;
  the previous browser loses edit access until it claims back with the same
  link. Nothing about scoring moves, because points key on the team.
- Email and token live in `fantasy_team_secrets`, readable only by the team's
  current owner and by captains. Nothing public selects either column.
- Captains can look a link up in **Admin > Fantasy teams**. Treat it as a
  password: whoever has it can edit that team.

Google and magic-link sign-in still work, and use the same create form.

### Joining late

A team created after `fantasy_settings.relaunch_date` gets a one-off credit so
it isn't starting from nothing against teams that have been scoring for weeks.

It is a share of what the **established** teams have averaged, never of the
players the new manager picks: crediting their own picks would pay them for
hindsight, rewarding them twice for looking up who is in form. It decays with
every competitive fixture played since the relaunch (50% / 25% / nothing), and
friendlies don't count, the same as everywhere else on the site.

`create_fantasy_team` works it out and stores it on the team, so the client
never names a number and the credit never moves afterwards. It counts towards
`total_points` but never `gameweek_points`, which answers "what did your XI do
last Sunday" — and a joining bonus didn't happen last Sunday.

The rule lives in one `fantasy_settings` row that both the RPC and the browser
read, so the offer shown on the sign-up screen and the credit actually granted
cannot drift apart.

- **Fantasy squads never lock.** The `is_locked` column exists but nothing sets it. Set it by hand when you want the market shut: `update fantasy_teams set is_locked = true where season_id = ...`.
- **No transfer deadline.** Transfers apply from the moment you make them, so in theory someone could swap a player in the hour before kick off once they know the lineup. Fine for a Sunday league on the honour system. If it becomes a problem, block transfers within N hours of the next fixture.
- **No MOTM voting.** Man of the match is set by a captain on the result form. A player vote would need a new table.
- **No notifications.** Nobody gets nudged to RSVP. A Supabase Edge Function on a cron could post to WhatsApp or send email.
- **Match reports are plain text.** Line breaks are preserved, markdown is not rendered.

---

## File map

```
supabase/
  schema.sql        Tables, RLS policies, stats and fantasy views, storage bucket
  seed.sql          Sample squad, venues, season, scoring rules, fixtures and results
  migrations/
    001_fantasy_transfers.sql   Only if you ran the pre-transfer schema
    ...
    010_fantasy_without_accounts.sql   Guest managers, edit links, leaderboard
    011_claim_team_by_email.sql        Recover a team by signing in with its email
    012_delete_user_account.sql        Captains can delete an account outright
    013_catch_up_points.sql            One-off credit for joining after the relaunch
public/
  index.html        Shell, nav, footer
  styles.css        Everything visual
  js/
    config.js       Supabase keys, formations, fantasy rules   <- EDIT THIS
    data.js         Every Supabase query
    ui.js           Toast, modal, date formatting, auth modal
    lineup.js       Pitch rendering, drag to move, sub picker
    fantasy.js      Fantasy rules that are pure functions (formation remap)
    views.js        Public pages
    admin.js        Captain pages
    app.js          Router and bootstrap
test/
  remap_test.js     Formation carry-over, every pair of formations
  xcheck.js         Every Views/Data/UI/Lineup/Fantasy/Admin call site resolves
vercel.json
```

Adding a page: write the function in `views.js`, add a case in the switch in `app.js`, add a link in the nav in `index.html`.

---

## Licence and credit

The sample team photo (`public/images/team-2026.jpg`) is a stock image and is not covered by the MIT licence: replace it with your own team's photo.


MIT licence, copyright (c) 2026 Jordi Albanell. See [LICENSE](LICENSE).

In plain words: you can use this code, change it, share it and build on it, including for paid work. The one legal condition is that **every copy keeps the copyright line and the LICENSE file**, so the code always says where it came from. Removing them breaks the licence.

If you put something live that's built on it, a "Based on the club site by [Jordi Albanell](https://jordialbanell.com)" link is appreciated.
