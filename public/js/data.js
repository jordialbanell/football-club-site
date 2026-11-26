/* ═══════════════════════════════════════════════════════════
   DATA LAYER — every Supabase call lives here.
   Views never touch the client directly.
   ═══════════════════════════════════════════════════════════ */

const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'pkce',        // ?code= in the query string, leaves our #/routes alone
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
});

/* ── In-memory read cache ────────────────────────────────────
   Navigating back to a page you just visited shouldn't refetch.
   Promises are stored (not results) so concurrent calls dedupe.
   Any write busts the relevant keys. */
const _cache = new Map();

function cached(key, ttlMs, fn) {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.p;
  const p = fn().catch(err => { _cache.delete(key); throw err; });
  _cache.set(key, { at: Date.now(), p });
  return p;
}

function bust(...prefixes) {
  if (!prefixes.length) return _cache.clear();
  for (const k of [..._cache.keys()])
    if (prefixes.some(p => k.startsWith(p))) _cache.delete(k);
}

const TTL = { short: 15_000, medium: 60_000, long: 300_000 };

const State = {
  session:  null,
  profile:  null,   // { id, player_id, display_name, role }
  season:   null,
  players:  [],
  venues:   [],
  ready:    false,
  // True once the session in hand is the real answer rather than a
  // provisional one. See whenAuthSettled().
  authReady: false,
  // Set while a sign-in is part of a longer flow (creating or claiming a
  // fantasy team). Stops the auth listener re-rendering the page out from
  // under a form that is still mid-submit.
  authBusy: false,
};

/* ── Readiness gates ─────────────────────────────────────────
   Two things have to land before a page that branches on them can
   paint: the bootstrap (season, players, venues) and the session.
   Both are exposed as promises so a render triggered by an auth
   event can wait for the same work the boot sequence is already
   doing instead of reading a half-filled State. */
let _bootDone, _authDone;
const _booted     = new Promise(r => { _bootDone = r; });
const _authSettled = new Promise(r => { _authDone = r; });

/* ── Season-scoped cached reads ──────────────────────────────
   Before the bootstrap has a season there is nothing to ask for, and
   caching that answer would pin the empty result in place until the TTL
   ran out. That is exactly how the Players tab came to show 0 points for
   every player while the GW column, on a shorter TTL, had already
   recovered: same race, two different expiry times. Return the empty
   shape and cache nothing, so the next call after boot asks properly. */
function seasonCached(key, ttlMs, fn, empty = []) {
  if (!State.season) return Promise.resolve(empty);
  return cached(key, ttlMs, fn);
}

const isAdmin    = () => State.profile?.role === 'admin';
const isApproved = () => !!State.profile?.is_approved || isAdmin();
// The actual squad, guests excluded
const squadOnly  = () => State.players.filter(p => !p.is_guest);
const guestsOnly = () => State.players.filter(p => p.is_guest);
const isSignedIn = () => !!State.session;
// A guest fantasy manager: signed in anonymously, no email, no real account.
// They play fantasy and nothing else.
const isGuest = () => !!State.session?.user?.is_anonymous;
const myPlayerId = () => State.profile?.player_id || null;

const Data = {

  /* ---------- AUTH ---------- */
  async initAuth() {
    const { data: { session } } = await sb.auth.getSession();
    State.session = session;
    if (session) await this.loadProfile();

    // Supabase refreshes the token whenever the tab regains focus, which
    // fires this handler. Re-rendering on that would rebuild the current
    // page from the database and throw away anything unsaved, so only
    // re-render when WHO is signed in has actually changed.
    let lastUserId = session?.user?.id || null;

    sb.auth.onAuthStateChange(async (event, session) => {
      State.session = session;
      const uid = session?.user?.id || null;

      if (session) await this.loadProfile();
      else State.profile = null;
      UI.refreshAuthUI();
      this._settleAuth();          // whatever this event was, the answer is in

      if (uid !== lastUserId) {
        lastUserId = uid;
        // A flow that signs someone in mid-submit re-renders when it's done
        if (!State.authBusy) Router.render();
      }
    });

    // getSession() is the final answer unless the page is still carrying an
    // OAuth code or a magic-link token: supabase is then mid-exchange and the
    // SIGNED_IN that follows is the real one. Branching before that is what
    // flashed the guest sign-up form at somebody who was already signed in.
    if (this._authExchangePending()) setTimeout(() => this._settleAuth(), 8000);
    else this._settleAuth();
  },

  // A PKCE code in the query string, or an implicit-flow token in the hash.
  _authExchangePending() {
    const q = window.location.search || '';
    const h = window.location.hash   || '';
    return /[?&](code|token_hash)=/.test(q) || /[#&](access_token|refresh_token)=/.test(h);
  },

  _settleAuth() {
    if (State.authReady) return;
    State.authReady = true;
    _authDone();
  },

  // Resolves once the session is known. The timeout is a backstop: a failed
  // code exchange must not leave the page waiting for ever.
  whenAuthSettled() { return _authSettled; },

  // Resolves once the first loadCore() has filled in season, players and
  // venues. A render kicked off by an auth event waits on the same bootstrap
  // the boot sequence is already running.
  whenBooted() { return _booted; },

  async loadProfile() {
    if (!State.session) return null;
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .eq('id', State.session.user.id)
      .maybeSingle();
    if (error) console.warn('profile load', error);
    State.profile = data || null;
    return data;
  },

  // OAuth and magic links both come back to the site root, which would drop
  // someone in the middle of signing up for fantasy onto the home page.
  // Leave a note for boot to pick up.
  //
  // localStorage rather than sessionStorage: an email link usually opens a
  // NEW tab, and sessionStorage doesn't reach it. The timestamp keeps a
  // forgotten marker from hijacking an unrelated visit days later.
  // Storage can throw in a locked down browser, so none of this is allowed
  // to be load-bearing.
  rememberReturn(hash) {
    try {
      localStorage.setItem('bp_after_auth', JSON.stringify({ hash, at: Date.now() }));
    } catch (_) {}
  },

  takeReturn(maxAgeMs = 30 * 60 * 1000) {
    try {
      const raw = localStorage.getItem('bp_after_auth');
      if (!raw) return null;
      localStorage.removeItem('bp_after_auth');
      const { hash, at } = JSON.parse(raw);
      return hash && Date.now() - at < maxAgeMs ? hash : null;
    } catch (_) { return null; }
  },

  async signInWithGoogle() {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { prompt: 'select_account' },  // let people pick which Google account
      },
    });
    if (error) throw error;
  },

  // No account, no email confirmation: a real auth.uid() that owns rows like
  // any other. Everything downstream (RLS, ownership windows, transfers)
  // works unchanged because to the database this is just another user.
  async signInAnonymously() {
    const { data, error } = await sb.auth.signInAnonymously();
    if (error) throw error;
    State.session = data.session;
    return data.session;
  },

  // Turn a guest into a real Google account on the same browser, keeping the
  // same uid so the team comes with them. Needs "Manual linking" enabled in
  // the Supabase dashboard; when it isn't, this throws and the caller falls
  // back to telling them to use their edit link, which covers the same case.
  async linkGoogle() {
    if (!sb.auth.linkIdentity) throw new Error('Linking is not available');
    const { error } = await sb.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  },

  async signIn(email, name) {
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
        data: name ? { name } : undefined,
      },
    });
    if (error) throw error;
  },

  // Guest fantasy managers are anonymous accounts. They never want approving
  // and there could be hundreds of them, so they stay out of the queue.
  async pendingProfiles() {
    const { data } = await sb.from('profiles')
      .select('*').eq('is_approved', false).eq('is_anonymous', false)
      .order('created_at');
    return data || [];
  },

  async approveProfile(id, approved = true) {
    // .select() so we can tell a blocked write from a real one: row-level
    // security makes a forbidden update match zero rows, which PostgREST
    // reports as a success with an empty array.
    const { data, error } = await sb.from('profiles')
      .update({ is_approved: approved }).eq('id', id).select();
    if (error) throw error;
    if (!data || !data.length) throw new Error('Update blocked, check permissions');
  },

  // Rename anyone. Captains have an "admin manage profiles" update policy,
  // so this is an ordinary write; .select() is what tells a blocked one
  // apart from a real one.
  async saveProfileName(id, name) {
    const { data, error } = await sb.from('profiles')
      .update({ display_name: name.trim() || null }).eq('id', id).select();
    if (error) throw error;
    if (!data || !data.length) throw new Error('Update blocked, check permissions');
  },

  // Remove an account for good. The browser cannot touch auth.users, so
  // this goes through a security definer function: captains only, never
  // your own account. Their fantasy team, picks, transfers and edit link
  // go with it; photos, comments and reports they touched survive with no
  // author rather than being deleted along with them.
  async deleteUserAccount(userId) {
    bust();                       // roles, teams and standings all move
    const { data, error } = await sb.rpc('delete_user_account', { p_user_id: userId });
    if (error) throw error;
    return data;                  // { display_name, teams_deleted }
  },

  async pendingMedia() {
    const { data } = await sb.from('media')
      .select('*, submitter:profiles!media_submitted_by_fkey(display_name)')
      .eq('is_approved', false).order('created_at', { ascending: false });
    return data || [];
  },

  async approveMedia(id, approved = true) {
    bust('media:');
    const { data, error } = await sb.from('media')
      .update({ is_approved: approved }).eq('id', id).select();
    if (error) throw error;
    if (!data || !data.length) throw new Error('Update blocked, check permissions');
  },

  async signOut() { await sb.auth.signOut(); },

  /* ---------- BOOTSTRAP ---------- */
  async loadCore() {
    const [seasons, players, venues] = await Promise.all([
      sb.from('seasons').select('*').eq('is_active', true).maybeSingle(),
      sb.from('players').select('*').eq('is_active', true).order('squad_num'),
      sb.from('venues').select('*').order('name'),
    ]);
    State.season  = seasons.data || null;
    State.players = players.data || [];
    State.venues  = venues.data  || [];
    State.ready   = true;
    _bootDone();
  },

  player(id) { return State.players.find(p => p.id === id) || null; },
  playerName(id) { const p = this.player(id); return p ? (p.nickname || p.name) : 'Unknown'; },

  /* ---------- FIXTURES ---------- */
  async fixtures(opts = {}) {
    return cached(`fixtures:${JSON.stringify(opts)}`, TTL.medium, () => this._fixtures(opts));
  },

  async _fixtures({ status, limit, order = 'asc' } = {}) {
    let q = sb.from('fixtures')
      .select('*, venue:venues(*)')
      .order('kickoff_at', { ascending: order === 'asc' });
    if (status) q = q.eq('status', status);
    if (limit)  q = q.limit(limit);
    const { data, error } = await q;
    if (error) { console.error(error); return []; }
    return data || [];
  },

  async fixture(id) {
    return cached(`fixture:${id}`, TTL.medium, () => this._fixture(id));
  },

  async _fixture(id) {
    const { data } = await sb.from('fixtures')
      .select('*, venue:venues(*)')
      .eq('id', id).maybeSingle();
    return data;
  },

  async nextFixture() {
    return cached('nextFixture', TTL.medium, () => this._nextFixture());
  },

  async _nextFixture() {
    const { data } = await sb.from('fixtures')
      .select('*, venue:venues(*)')
      .eq('status', 'upcoming')
      .gte('kickoff_at', new Date(Date.now() - 6 * 3600 * 1000).toISOString())
      .order('kickoff_at', { ascending: true })
      .limit(1).maybeSingle();
    return data;
  },

  async saveFixture(fx) {
    bust('fixtures', 'fixture:', 'nextFixture', 'h2h', 'leaderboard');
    const { data, error } = fx.id
      ? await sb.from('fixtures').update(fx).eq('id', fx.id).select().maybeSingle()
      : await sb.from('fixtures').insert(fx).select().maybeSingle();
    if (error) throw error;
    return data;
  },

  async deleteFixture(id) {
    bust('fixtures', 'fixture:', 'nextFixture', 'h2h', 'leaderboard');
    const { error } = await sb.from('fixtures').delete().eq('id', id);
    if (error) throw error;
  },

  /* ---------- AVAILABILITY ---------- */
  async availability(fixtureId) {
    return cached(`avail:${fixtureId}`, TTL.short, () => this._availability(fixtureId));
  },

  async _availability(fixtureId) {
    const { data } = await sb.from('availability')
      .select('*').eq('fixture_id', fixtureId);
    return data || [];
  },

  async clearAvailability(fixtureId, playerId) {
    bust('avail:');
    const { error } = await sb.from('availability').delete()
      .eq('fixture_id', fixtureId).eq('player_id', playerId);
    if (error) throw error;
  },

  async setAvailability(fixtureId, playerId, status, note = null) {
    bust('avail:');
    const { error } = await sb.from('availability')
      .upsert({ fixture_id: fixtureId, player_id: playerId, status, note,
                updated_at: new Date().toISOString() },
              { onConflict: 'fixture_id,player_id' });
    if (error) throw error;
  },

  /* ---------- LINEUPS ---------- */
  async lineupForFixture(fixtureId) {
    return cached(`lineup:${fixtureId}`, TTL.short, () => this._lineupForFixture(fixtureId));
  },

  async _lineupForFixture(fixtureId) {
    const { data } = await sb.from('lineups')
      .select('*, slots:lineup_slots(*)')
      .eq('fixture_id', fixtureId)
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();
    return data;
  },

  async saveLineup(lineup, slots) {
    bust('lineup:');
    let lid = lineup.id;
    if (lid) {
      const { error } = await sb.from('lineups')
        .update({ formation: lineup.formation, jersey_color: lineup.jersey_color,
                  is_published: lineup.is_published, updated_at: new Date().toISOString() })
        .eq('id', lid);
      if (error) throw error;
      await sb.from('lineup_slots').delete().eq('lineup_id', lid);
    } else {
      const { data, error } = await sb.from('lineups').insert({
        fixture_id: lineup.fixture_id,
        formation: lineup.formation,
        jersey_color: lineup.jersey_color,
        is_published: lineup.is_published,
        created_by: State.profile?.id || null,
      }).select().maybeSingle();
      if (error) throw error;
      lid = data.id;
    }
    if (slots.length) {
      const rows = slots.map(s => ({ ...s, lineup_id: lid }));
      const { error } = await sb.from('lineup_slots').insert(rows);
      if (error) throw error;
    }
    return lid;
  },

  async lineupComments(lineupId) {
    const { data } = await sb.from('lineup_comments')
      .select('*, author:profiles(display_name)')
      .eq('lineup_id', lineupId)
      .order('created_at', { ascending: true });
    return data || [];
  },

  async addComment(lineupId, body) {
    bust('comments:');
    const { error } = await sb.from('lineup_comments').insert({
      lineup_id: lineupId, author_id: State.profile.id, body,
    });
    if (error) throw error;
  },

  /* ---------- MATCH EVENTS / STATS ---------- */
  async matchEvents(fixtureId) {
    const { data } = await sb.from('match_events')
      .select('*').eq('fixture_id', fixtureId);
    return data || [];
  },

  async appearances(fixtureId) {
    const { data } = await sb.from('appearances')
      .select('*').eq('fixture_id', fixtureId);
    return data || [];
  },

  async saveMatchResult(fixtureId, { ourScore, theirScore, appearances, events }) {
    bust('fixtures', 'fixture:', 'nextFixture', 'h2h', 'leaderboard', 'fstandings', 'fpfx', 'gwpoints', 'precord:');
    const up = await sb.from('fixtures')
      .update({ our_score: ourScore, their_score: theirScore, status: 'played' })
      .eq('id', fixtureId);
    if (up.error) throw up.error;

    await sb.from('appearances').delete().eq('fixture_id', fixtureId);
    await sb.from('match_events').delete().eq('fixture_id', fixtureId);

    if (appearances.length) {
      const { error } = await sb.from('appearances')
        .insert(appearances.map(pid => ({ fixture_id: fixtureId, player_id: pid, started: true })));
      if (error) throw error;
    }
    if (events.length) {
      const { error } = await sb.from('match_events')
        .insert(events.map(e => ({ fixture_id: fixtureId, ...e })));
      if (error) throw error;
    }
  },

  async leaderboard() {
    return seasonCached('leaderboard', TTL.medium, () => this._leaderboard(), []);
  },

  async _leaderboard() {
    if (!State.season) return [];
    const { data, error } = await sb.from('season_leaderboard')
      .select('*').eq('season_id', State.season.id)
      .order('fantasy_points', { ascending: false });
    if (error) { console.warn(error); return []; }
    return data || [];
  },

  async headToHead() {
    return cached('h2h', TTL.long, async () => {
      const { data } = await sb.from('head_to_head').select('*');
      return data || [];
    });
  },

  /* ---------- MEDIA ---------- */
  async media(fixtureId = null) {
    return cached(`media:${fixtureId || 'all'}`, TTL.medium, () => this._media(fixtureId));
  },

  async _media(fixtureId = null) {
    let q = sb.from('media').select('*').order('created_at', { ascending: false });
    if (fixtureId) q = q.eq('fixture_id', fixtureId);
    const { data } = await q;
    return data || [];
  },

  async addMedia(row) {
    bust('media:');
    const { error } = await sb.from('media').insert({
      ...row,
      uploaded_by: State.profile?.id || null,
      submitted_by: State.profile?.id || null,
      is_approved: isAdmin(),   // captains' uploads go live immediately
    });
    if (error) throw error;
  },

  async deleteMedia(id) {
    bust('media:');
    const { error } = await sb.from('media').delete().eq('id', id);
    if (error) throw error;
  },

  // Resize and recompress in the browser BEFORE uploading.
  // Phone photos are 3-5MB; the site never displays them above ~800px.
  // This typically cuts a 4MB upload to around 120KB, which matters
  // because Supabase's free tier caps monthly bandwidth, and every
  // page view re-downloads every image.
  async shrinkImage(file, maxPx, quality = 0.82) {
    if (!file.type.startsWith('image/')) return file;
    // Leave tiny files and SVGs alone
    if (file.type === 'image/svg+xml' || file.size < 120_000) return file;

    const bitmap = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('Could not read that image'));
      img.src = URL.createObjectURL(file);
    });

    const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    URL.revokeObjectURL(bitmap.src);

    // WebP where supported, JPEG otherwise. PNGs with transparency
    // survive as WebP; JPEG fallback flattens them, which is fine
    // for photographs.
    const type = canvas.toDataURL('image/webp').startsWith('data:image/webp')
      ? 'image/webp' : 'image/jpeg';

    const blob = await new Promise(res => canvas.toBlob(res, type, quality));
    if (!blob || blob.size >= file.size) return file;   // never make it bigger
    return new File([blob], file.name.replace(/\.\w+$/, '') + (type === 'image/webp' ? '.webp' : '.jpg'),
                    { type });
  },

  async uploadImage(file, folder = '') {
    // Different jobs need different resolutions
    const maxPx = folder === 'players' ? 900
                : folder === 'club'    ? 2000
                : 1600;

    const original = file.size;
    file = await this.shrinkImage(file, maxPx);
    if (file.size < original) {
      console.log(`Image shrunk: ${(original/1024/1024).toFixed(1)}MB -> ${(file.size/1024).toFixed(0)}KB`);
    }

    const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const base = `${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    const path = folder ? `${folder}/${base}` : base;
    const { error } = await sb.storage.from('team-media').upload(path, file, {
      cacheControl: '31536000',   // a year: these files never change
      contentType: file.type,
    });
    if (error) throw error;
    const { data } = sb.storage.from('team-media').getPublicUrl(path);
    return data.publicUrl;
  },

  /* ---------- MATCH REPORTS ---------- */
  async report(fixtureId) {
    return cached(`report:${fixtureId}`, TTL.medium, () => this._report(fixtureId));
  },

  async _report(fixtureId) {
    const { data } = await sb.from('match_reports')
      .select('*').eq('fixture_id', fixtureId).maybeSingle();
    return data;
  },

  async saveReport(r) {
    bust('report:');
    const { error } = await sb.from('match_reports')
      .upsert({ ...r, updated_at: new Date().toISOString() }, { onConflict: 'fixture_id' });
    if (error) throw error;
  },

  /* ---------- FANTASY ---------- */

  freeTransfers() {
    return State.season?.free_transfers ?? CONFIG.FANTASY_FREE_TRANSFERS;
  },
  transferCost() {
    return State.season?.transfer_cost ?? CONFIG.FANTASY_TRANSFER_COST;
  },

  // Cost of the NEXT transfer, given how many have already been made
  nextTransferCost(made) {
    return made < this.freeTransfers() ? 0 : this.transferCost();
  },

  async myFantasyTeam() {
    if (!State.session || !State.season) return null;
    const { data } = await sb.from('fantasy_teams')
      .select('*, picks:fantasy_picks(id, player_id, slot_index, acquired_at, released_at)')
      .eq('owner_id', State.session.user.id)
      .eq('season_id', State.season.id)
      .maybeSingle();
    if (!data) return null;
    data.squad = (data.picks || []).filter(p => !p.released_at);
    // slot_index -> player_id, for the pitch
    data.bySlot = {};
    data.squad.forEach(p => { if (p.slot_index != null) data.bySlot[p.slot_index] = p.player_id; });
    return data;
  },

  async myTransfers(teamId) {
    const { data } = await sb.from('fantasy_transfers')
      .select('*').eq('fantasy_team_id', teamId)
      .order('created_at', { ascending: false });
    return data || [];
  },

  /* ---------- FANTASY: SIGNING UP ---------- */

  // Where the edit link points. Falls back to wherever the page is being
  // served from, so the flow works on localhost too.
  siteUrl() {
    return (CONFIG.SITE_URL || window.location.origin).replace(/\/+$/, '');
  },

  editLink(token) { return `${this.siteUrl()}/#/fantasy/claim/${token}`; },

  // Create a team for someone with no account at all. Signs them in
  // anonymously first, so the team has a real owner_id from the start and
  // every existing ownership rule applies to them unchanged.
  //
  // The team row and the email/token row are written by one security
  // definer function, in one transaction: a duplicate email has to fail
  // both, or a clash would leave a nameless squad behind.
  async createTeamAccount({ managerName, teamName, email, formation = '4-4-2' }) {
    bust('fstandings');
    State.authBusy = true;
    try {
      if (!State.session) await this.signInAnonymously();
      const { data, error } = await sb.rpc('create_fantasy_team', {
        p_manager_name: managerName,
        p_team_name:    teamName,
        p_email:        email,
        p_formation:    formation,
      });
      if (error) throw error;
      await this.loadProfile();
      return data;        // { team_id, edit_token }
    } finally {
      State.authBusy = false;
    }
  },

  // Open an edit link. Signs in anonymously when there's no session, then
  // moves ownership of the team to whoever is now signed in.
  //
  // This takes edit access AWAY from the browser that held the team before.
  // That is the deal the link makes: it's the only way to pick a team up on
  // a new phone, and the old browser can always claim it back with the same
  // link. Nothing about scoring moves, because points key on the team.
  async claimTeam(token) {
    bust('fstandings');
    State.authBusy = true;
    try {
      if (!State.session) await this.signInAnonymously();
      const { data, error } = await sb.rpc('claim_fantasy_team', { p_token: token });
      if (error) throw error;
      await this.loadProfile();
      return data;        // the fantasy_teams row
    } finally {
      State.authBusy = false;
    }
  },

  // Signing in with the address a team was created on brings that team
  // back, on any device. Runs at most once per signed-in user per page
  // load: the answer can't change underneath us, and a token refresh
  // shouldn't mean another round trip.
  //
  // Whoever is already running a team this season keeps it — the function
  // returns their own team's id and leaves the other one alone rather than
  // trying to merge two squads.
  _emailClaimFor: null,

  async claimTeamByEmail() {
    if (!State.session || isGuest()) return null;   // guests have no email
    const uid = State.session.user.id;
    if (this._emailClaimFor === uid) return null;
    this._emailClaimFor = uid;

    const { data, error } = await sb.rpc('claim_fantasy_team_by_email');
    if (error) {
      // Nothing here is worth blocking the page for: the edit link still works.
      console.warn('email claim', error);
      return null;
    }
    if (data) bust('fstandings');
    return data || null;
  },

  // The team's edit link. Only the owner and captains can read this row,
  // so a signed-out visitor gets nothing back.
  async editToken(teamId) {
    const { data } = await sb.from('fantasy_team_secrets')
      .select('edit_token').eq('fantasy_team_id', teamId).maybeSingle();
    return data?.edit_token || null;
  },

  // Fill an empty squad. A team is created before its XI is picked now, so
  // this is the first-squad save: free, no transfer cost, every window opens
  // at the same moment.
  async saveFirstSquad(teamId, formation, picks) {
    bust('fstandings');
    const up = await sb.from('fantasy_teams')
      .update({ formation }).eq('id', teamId).select();
    if (up.error) throw up.error;
    if (!up.data || !up.data.length) throw new Error('Save blocked, check permissions');

    const rows = Object.entries(picks).map(([slot, pid]) => ({
      fantasy_team_id: teamId,
      player_id: pid,
      slot_index: parseInt(slot),
      acquired_at: new Date().toISOString(),
    }));
    if (rows.length) {
      const { error } = await sb.from('fantasy_picks').insert(rows);
      if (error) throw error;
    }
  },

  // Any team, read-only, for the leaderboard's team pages. Reads the public
  // view, which has no email and no edit token in it to leak.
  async publicFantasyTeam(id) {
    const { data } = await sb.from('fantasy_teams_public')
      .select('*, picks:fantasy_picks(player_id, slot_index, acquired_at, released_at)')
      .eq('id', id).maybeSingle();
    if (!data) return null;
    data.squad = (data.picks || []).filter(p => !p.released_at);
    data.bySlot = {};
    data.squad.forEach(p => { if (p.slot_index != null) data.bySlot[p.slot_index] = p.player_id; });
    return data;
  },

  async renameFantasyTeam(teamId, name) {
    const { error } = await sb.from('fantasy_teams').update({ name }).eq('id', teamId);
    if (error) throw error;
  },

  /* Change a saved squad's formation. `next` is the new {slot: playerId}
   * from Fantasy.reshape; `pairs` is [{ out, in, cost }], one per player who
   * had to make way, each logged as an ordinary transfer with its cost.
   *
   * The formation goes first: if the team is locked or not ours, that write
   * fails before any player moves. Then the swaps, then everyone who stayed
   * is re-slotted to the new shape. */
  async changeFormation(teamId, formation, next, pairs) {
    bust('fstandings');
    const now = new Date().toISOString();

    const up = await sb.from('fantasy_teams')
      .update({ formation }).eq('id', teamId).select();
    if (up.error) throw up.error;
    if (!up.data || !up.data.length) throw new Error('Save blocked, check permissions');

    const slotOf = {};
    Object.entries(next).forEach(([slot, pid]) => { slotOf[pid] = parseInt(slot); });

    for (const p of pairs) {
      const rel = await sb.from('fantasy_picks')
        .update({ released_at: now })
        .eq('fantasy_team_id', teamId).eq('player_id', p.out).is('released_at', null);
      if (rel.error) throw rel.error;

      const add = await sb.from('fantasy_picks').insert({
        fantasy_team_id: teamId, player_id: p.in,
        slot_index: slotOf[p.in], acquired_at: now,
      });
      if (add.error) throw add.error;

      const log = await sb.from('fantasy_transfers').insert({
        fantasy_team_id: teamId, out_player_id: p.out, in_player_id: p.in,
        points_cost: p.cost,
      });
      if (log.error) throw log.error;
    }

    const incoming = new Set(pairs.map(p => p.in));
    for (const [pid, slot] of Object.entries(slotOf)) {
      if (incoming.has(pid)) continue;
      const mv = await sb.from('fantasy_picks').update({ slot_index: slot })
        .eq('fantasy_team_id', teamId).eq('player_id', pid).is('released_at', null);
      if (mv.error) throw mv.error;
    }
  },

  // Swap one player out for one in, in the same pitch slot.
  // Stamps the ownership windows and logs the cost.
  async makeTransfer(teamId, outPlayerId, inPlayerId, cost, slotIndex) {
    bust('fstandings');
    const now = new Date().toISOString();

    // Close the outgoing player's window. Points they earned before now still count.
    const rel = await sb.from('fantasy_picks')
      .update({ released_at: now })
      .eq('fantasy_team_id', teamId)
      .eq('player_id', outPlayerId)
      .is('released_at', null);
    if (rel.error) throw rel.error;

    // Open a window for the incoming player from now on.
    const add = await sb.from('fantasy_picks').insert({
      fantasy_team_id: teamId, player_id: inPlayerId,
      slot_index: slotIndex, acquired_at: now,
    });
    if (add.error) throw add.error;

    const log = await sb.from('fantasy_transfers').insert({
      fantasy_team_id: teamId,
      out_player_id: outPlayerId,
      in_player_id: inPlayerId,
      points_cost: cost,
    });
    if (log.error) throw log.error;
  },

  // Every manager's team, for the admin panel. The email and edit token come
  // from fantasy_team_secrets, which only the owner and captains can read.
  async allFantasyTeams() {
    if (!State.season) return [];
    const { data } = await sb.from('fantasy_teams')
      .select(`*, owner:profiles(display_name, is_anonymous),
                  secrets:fantasy_team_secrets(email, edit_token),
                  picks:fantasy_picks(player_id, released_at)`)
      .eq('season_id', State.season.id)
      .order('created_at');
    return (data || []).map(t => {
      // PostgREST returns a one-to-one embed as an object, but an older
      // relationship guess can come back as a one-element array.
      const sec = Array.isArray(t.secrets) ? t.secrets[0] : t.secrets;
      return {
        ...t,
        email:      sec?.email || null,
        edit_token: sec?.edit_token || null,
        manager:    t.manager_name || t.owner?.display_name || null,
        is_guest_manager: !!t.owner?.is_anonymous,
        squad_size: (t.picks || []).filter(p => !p.released_at).length,
      };
    });
  },

  async deleteFantasyTeam(id) {
    bust('fstandings');
    // fantasy_picks and fantasy_transfers cascade on delete
    const { error } = await sb.from('fantasy_teams').delete().eq('id', id);
    if (error) throw error;
  },

  async setFantasyLock(id, locked) {
    bust('fstandings');
    const { error } = await sb.from('fantasy_teams')
      .update({ is_locked: locked }).eq('id', id);
    if (error) throw error;
  },

  async fantasyStandings() {
    return seasonCached('fstandings', TTL.short, () => this._fantasyStandings(), []);
  },

  async _fantasyStandings() {
    if (!State.season) return [];
    const { data, error } = await sb.from('fantasy_standings')
      .select('*').eq('season_id', State.season.id);
    if (error) { console.warn(error); return []; }
    return data || [];
  },

  /* ---------- FANTASY: MATCH BY MATCH ---------- */

  // Every team's score in every played match it existed for, from
  // fantasy_team_fixture_points. Keyed under 'fstandings' so anything that
  // already busts the standings (a transfer, a new team) busts this too.
  // Transfer hits land on the first match after the transfer; catch-up
  // credit is never in here.
  async teamMatchPoints() {
    return seasonCached('fstandings:match', TTL.short, () => this._teamMatchPoints(), []);
  },

  async _teamMatchPoints() {
    if (!State.season) return [];
    const { data, error } = await sb.from('fantasy_team_fixture_points')
      .select('*').eq('season_id', State.season.id);
    if (error) { console.warn('team match points', error); return []; }
    return data || [];
  },

  // What every player scored in every played match this season, streak
  // bonus included (and also broken out as streak_points). A few hundred
  // rows at most for a club this size.
  async playerMatchPoints() {
    return seasonCached('fpfx', TTL.short, async () => {
      // select('*') so this keeps working across the 015 migration, which
      // added streak_run and changed streak_points to mean the bonus paid.
      const { data, error } = await sb.from('fantasy_player_fixture_points')
        .select('*')
        .eq('season_id', State.season.id);
      if (error) { console.warn('player match points', error); return []; }
      return (data || []).map(r => r.streak_run == null
        ? { ...r, streak_run: r.streak_points || 0, streak_points: Fantasy.streakBonus(r.streak_points || 0) }
        : r);
    });
  },

  // Everything one player did, match by match: the raw events and the
  // matches he's on the result sheet for. Feeds the line-by-line
  // breakdown on his card.
  async playerRecord(pid) {
    return cached(`precord:${pid}`, TTL.short, async () => {
      const [ev, apps] = await Promise.all([
        sb.from('match_events').select('fixture_id, type, qty').eq('player_id', pid),
        sb.from('appearances').select('fixture_id').eq('player_id', pid),
      ]);
      const events = {};
      (ev.data || []).forEach(e => {
        const f = (events[e.fixture_id] ||= {});
        f[e.type] = (f[e.type] || 0) + (e.qty || 1);
      });
      return { events, played: new Set((apps.data || []).map(a => a.fixture_id)) };
    });
  },

  // Played fixtures of the current season, newest first. The labels for
  // the match picker and the match-by-match list.
  async playedThisSeason() {
    const all = await this.fixtures({ status: 'played' });
    return all
      .filter(f => !State.season || f.season_id === State.season.id)
      .sort((a, b) => new Date(b.kickoff_at) - new Date(a.kickoff_at));
  },

  /* ---------- FANTASY: CATCH-UP POINTS ---------- */

  // The rule, straight from the database. The RPC reads the same row, so
  // the offer on the sign-up screen and the credit actually granted can't
  // disagree. CONFIG is only a fallback for when the table can't be read.
  async fantasySettings() {
    return cached('fsettings', TTL.long, async () => {
      const { data } = await sb.from('fantasy_settings')
        .select('relaunch_date, catch_up_tiers').eq('id', 1).maybeSingle();
      return {
        relaunchDate: data?.relaunch_date || CONFIG.FANTASY_CATCH_UP?.relaunchDate || null,
        tiers: data?.catch_up_tiers?.map(Number)
            || CONFIG.FANTASY_CATCH_UP?.catchUp || [0.5, 0.25, 0],
      };
    });
  },

  // What someone signing up right now would be credited, and what it drops
  // to next. Mirrors fantasy_catch_up_credit() in the database step for
  // step, including the baseline being earned-minus-cost of the teams that
  // were already here — never the new manager's own picks.
  async catchUpOffer() {
    const [settings, standings, teams, played, upcoming] = await Promise.all([
      this.fantasySettings(),
      this.fantasyStandings(),
      this.fantasyTeamsPublic(),
      this.fixtures({ status: 'played' }),
      this.fixtures({ status: 'upcoming' }),
    ]);
    if (!settings.relaunchDate) return null;

    const relaunch = new Date(settings.relaunchDate + 'T00:00:00Z');
    const createdAt = {};
    teams.forEach(t => { createdAt[t.id] = t.created_at; });

    // Only the teams that existed before the relaunch set the bar.
    const base = standings.filter(r =>
      createdAt[r.fantasy_team_id] && new Date(createdAt[r.fantasy_team_id]) < relaunch);
    if (!base.length) return null;
    const avg = base.reduce((a, r) => a + (r.points_earned - r.transfer_cost), 0) / base.length;

    // Friendlies are not fixtures here, same as everywhere else on the site.
    const since = played.filter(f =>
      UI.isCompetitive(f) && f.our_score != null && new Date(f.kickoff_at) >= relaunch).length;

    const rateAt = n => settings.tiers[Math.min(n, settings.tiers.length - 1)] ?? 0;
    const creditAt = n => Math.round(avg * rateAt(n));

    const next = upcoming
      .filter(f => UI.isCompetitive(f))
      .sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at))[0] || null;

    return {
      average: avg,
      fixturesSince: since,
      credit: creditAt(since),
      remaining: settings.tiers.slice(since + 1).map((_, i) => creditAt(since + 1 + i)),
      nextFixture: next,
    };
  },

  // Public shape of every team this season, for the catch-up baseline.
  async fantasyTeamsPublic() {
    return seasonCached('fteamspublic', TTL.short, async () => {
      if (!State.season) return [];
      const { data } = await sb.from('fantasy_teams_public')
        .select('id, name, created_at, catch_up_points')
        .eq('season_id', State.season.id);
      return data || [];
    });
  },

  /* ---------- FANTASY: THE PLAYER MARKET ---------- */

  // How many teams currently own each player, this season.
  // {player_id: count}. An ownership window that has been released
  // doesn't count, so this is who is in a squad right now.
  //
  // Counted in the browser rather than in a view: it is one row per pick
  // per team, which for a club this size is a couple of hundred rows at
  // the very most. A view would be another migration to paste for no
  // measurable gain.
  async ownershipCounts() {
    return seasonCached('ownership', TTL.short, () => this._ownershipCounts(), {});
  },

  async _ownershipCounts() {
    if (!State.season) return {};
    const { data, error } = await sb.from('fantasy_picks')
      .select('player_id, fantasy_teams!inner(season_id)')
      .is('released_at', null)
      .eq('fantasy_teams.season_id', State.season.id);
    if (error) { console.warn('ownership', error); return {}; }
    const out = {};
    (data || []).forEach(r => { out[r.player_id] = (out[r.player_id] || 0) + 1; });
    return out;
  },

  // What each player scored in the most recently played fixture.
  // Same definition of "gameweek" the league table uses: the latest
  // fixture that actually paid anyone points.
  async lastGameweekPoints() {
    return seasonCached('gwpoints', TTL.short, () => this._lastGameweekPoints(), {});
  },

  async _lastGameweekPoints() {
    if (!State.season) return {};
    const { data: last } = await sb.from('fantasy_player_fixture_points')
      .select('fixture_id')
      .eq('season_id', State.season.id)
      .order('kickoff_at', { ascending: false })
      .limit(1).maybeSingle();
    if (!last) return {};

    const { data } = await sb.from('fantasy_player_fixture_points')
      .select('player_id, points').eq('fixture_id', last.fixture_id);
    const out = {};
    (data || []).forEach(r => { out[r.player_id] = r.points; });
    return out;
  },

  // Points a player has earned since a given moment. Used to show
  // managers what a signing has actually delivered for them.
  async pointsSince(playerId, sinceIso) {
    const { data } = await sb.from('fantasy_player_fixture_points')
      .select('points')
      .eq('player_id', playerId)
      .gte('kickoff_at', sinceIso);
    return (data || []).reduce((a, r) => a + r.points, 0);
  },

  /* ---------- LEAGUE TABLE (kept in sync by hand) ---------- */
  async leagueTable() {
    return seasonCached('leaguetable', TTL.medium, async () => {
      if (!State.season) return [];
      const { data } = await sb.from('league_table')
        .select('*').eq('season_id', State.season.id)
        .order('sort_order');
      return data || [];
    });
  },

  async saveLeagueTable(rows) {
    bust('leaguetable', 'setting:');
    const del = await sb.from('league_table').delete().eq('season_id', State.season.id);
    if (del.error) throw del.error;
    if (rows.length) {
      const { error } = await sb.from('league_table').insert(
        rows.map((r, i) => ({ ...r, season_id: State.season.id, sort_order: i })));
      if (error) throw error;
    }
    await this.setSetting('league_table_updated', new Date().toISOString());
  },

  /* ---------- SETTINGS (club-wide key/value) ---------- */
  async setting(key) {
    return cached(`setting:${key}`, TTL.long, () => this._setting(key));
  },

  async _setting(key) {
    const { data } = await sb.from('settings').select('value').eq('key', key).maybeSingle();
    return data?.value || null;
  },

  async setSetting(key, value) {
    bust('setting:');
    const { error } = await sb.from('settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
  },

  /* ---------- GUESTS ---------- */
  // Guests live in the players table with a flag, so lineups, results
  // and stats all work unchanged. Numbers start at 900 to stay clear
  // of real shirt numbers.
  async addGuest(name, position) {
    const used = new Set(State.players.map(p => p.squad_num));
    let num = 900;
    while (used.has(num)) num++;
    const { data, error } = await sb.from('players')
      .insert({ squad_num: num, name: name.trim(), position, is_guest: true })
      .select().maybeSingle();
    if (error) throw error;
    await this.loadCore();
    return data;
  },

  /* ---------- ADMIN: PLAYERS ---------- */
  async savePlayer(p) {
    bust('leaderboard');
    const { error } = p.id
      ? await sb.from('players').update(p).eq('id', p.id)
      : await sb.from('players').insert(p);
    if (error) throw error;
  },

  async retirePlayer(id) {
    const { error } = await sb.from('players').update({ is_active: false }).eq('id', id);
    if (error) throw error;
  },
};
