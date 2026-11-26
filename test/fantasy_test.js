// Regression tests for the four fantasy fixes. Everything is stubbed:
// no network, no auth calls, no writes.
const { load } = require('./harness.js');

const SEASON = 's1', YUK = 'p-y', SYN = 'p-s';
const UID = 'user-signed-in';
const SESSION = { user: { id: UID, email: 'me@example.com', is_anonymous: false } };

const base = () => ({
  seasons: [{ id: SEASON, name: '2026 Season', is_active: true }],
  players: [
    { id: YUK, name: 'Yuri',      nickname: null,     position: 'MID', squad_num: 32, is_guest: false, is_active: true },
    { id: SYN, name: 'Sam Lim', nickname: 'Sam', position: 'MID', squad_num: 13, is_guest: false, is_active: true },
  ],
  venues: [], profiles: [{ id: UID, display_name: 'Me', role: 'member' }], fixtures: [],
  season_leaderboard: [
    { player_id: YUK, name: 'Yuri',      position: 'MID', season_id: SEASON, appearances: 5, goals: 2, assists: 0, yellows: 0, reds: 1, motm: 1, fantasy_points: 15 },
    { player_id: SYN, name: 'Sam Lim', position: 'MID', season_id: SEASON, appearances: 4, goals: 0, assists: 2, yellows: 0, reds: 0, motm: 2, fantasy_points: 23 },
  ],
  fantasy_player_fixture_points: [
    { fixture_id: 'fx-brit', season_id: SEASON, kickoff_at: '2026-09-20T10:30:00+00:00', player_id: YUK, points: -1 },
    { fixture_id: 'fx-brit', season_id: SEASON, kickoff_at: '2026-09-20T10:30:00+00:00', player_id: SYN, points: 9 },
    { fixture_id: 'fx-exil', season_id: SEASON, kickoff_at: '2026-09-13T10:30:00+00:00', player_id: YUK, points: 10 },
    { fixture_id: 'fx-exil', season_id: SEASON, kickoff_at: '2026-09-13T10:30:00+00:00', player_id: SYN, points: 6 },
  ],
  fantasy_standings: [
    { fantasy_team_id: 't-playing', season_id: SEASON, team_name: 'Playing XI', owner_name: 'Ann',
      squad_size: 11, points_earned: 40, transfer_cost: 0, transfers_made: 0, catch_up_points: 0, total_points: 40, gameweek_points: 8 },
    { fantasy_team_id: 't-empty', season_id: SEASON, team_name: 'No Picks Yet', owner_name: 'Bob',
      squad_size: 0, points_earned: 0, transfer_cost: 0, transfers_made: 0, catch_up_points: 12, total_points: 12, gameweek_points: 0 },
    { fantasy_team_id: 't-part', season_id: SEASON, team_name: 'Half Built', owner_name: 'Cid',
      squad_size: 7, points_earned: 3, transfer_cost: 0, transfers_made: 0, catch_up_points: 12, total_points: 15, gameweek_points: 1 },
  ],
  fantasy_teams: [], fantasy_picks: [], fantasy_settings: [], fantasy_team_secrets: [], fantasy_transfers: [],
});

let fails = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond || !extra ? '' : '\n        ' + extra}`);
};
const ptsOf = html => {
  const out = {};
  const re = /<span class="strong">([^<]*)<\/span>[\s\S]*?<td class="r big">([^<]*)<\/td>\s*<td class="r"[^>]*>([^<]*)<\/td>/g;
  let m; while ((m = re.exec(html))) out[m[1]] = { pts: m[2], gw: m[3] };
  return out;
};

(async () => {
  /* ── 1. PTS survives a render that beats the bootstrap ── */
  console.log('\n1. Players tab PTS is not poisoned by an early render');
  {
    const H = load({ tables: base(), session: null });
    // A render fires before loadCore() has a season — the old code cached [].
    await H.Data.leaderboard();
    await H.Data.lastGameweekPoints();
    await H.Data.loadCore();
    H.Data._settleAuth();

    const board = await H.Data.leaderboard();
    ok('leaderboard recovers after boot', board.length === 2, `got ${board.length} rows`);

    H.ctx.location.hash = '#/fantasy/players';
    const app = H.getEl('app');
    await H.Views.fantasy(app, 'players');
    const t = ptsOf(app.innerHTML);
    ok('Sam PTS = 23 (matches Squad > Stats > Fantasy)', t.Sam?.pts === '23', JSON.stringify(t.Sam));
    ok('Yuri  PTS = 15 (matches Squad > Stats > Fantasy)', t.Yuri?.pts === '15', JSON.stringify(t.Yuri));
    ok('GW still right (Sam 9, Yuri -1)', t.Sam?.gw === '9' && t.Yuri?.gw === '-1');
  }

  /* ── 2. GW resolves to the most recent fixture that paid points ── */
  console.log('\n2. GW resolves to the latest played fixture');
  {
    const H = load({ tables: base(), session: null });
    await H.Data.loadCore();
    const gw = await H.Data.lastGameweekPoints();
    ok('uses British Club 20 Sep, not Exiles 13 Sep',
       gw[YUK] === -1 && gw[SYN] === 9, JSON.stringify(gw));
  }

  /* ── 3. No guest-form flash, no empty leaderboard ── */
  console.log('\n3. Fantasy page waits for the session and the first fetch');
  {
    const tables = base();
    tables.fantasy_teams = [{ id: 't-mine', season_id: SEASON, owner_id: UID, name: 'My Team',
                              manager_name: 'Me', formation: '4-4-2', is_locked: false, catch_up_points: 0 }];
    tables.fantasy_picks = [{ id: 'pk1', fantasy_team_id: 't-mine', player_id: YUK, slot_index: 5, acquired_at: '2026-09-01', released_at: null }];
    tables.fantasy_standings.push({ fantasy_team_id: 't-mine', season_id: SEASON, team_name: 'My Team',
      owner_name: 'Me', squad_size: 1, points_earned: 10, transfer_cost: 0, transfers_made: 0,
      catch_up_points: 0, total_points: 10, gameweek_points: 2 });

    // Session and core both arrive LATE.
    const H = load({ tables, session: SESSION, delay: { __session: 120, seasons: 120, fantasy_teams: 80 } });
    const app = H.getEl('app');

    const boot = (async () => { await H.Data.initAuth(); await H.Data.loadCore(); })();
    const render = H.Views.fantasy(app, '');      // races the boot, as a hashchange would
    await Promise.all([boot, render]);

    const painted = H.painted.filter(h => h && h.includes('Fantasy Poppas'));
    const flashed = painted.some(h => /Create your team|name your team/i.test(h));
    ok('guest "Create your team" form never painted', !flashed);
    ok('a quiet loading shell was shown first', painted[0]?.includes('fantasy-wait'), painted[0]?.slice(0, 120));
    ok('final paint shows My team', /My Team/.test(app.innerHTML));

    const emptyBoard = painted.some(h => /Nobody has built a team yet/.test(h));
    ok('leaderboard never rendered empty while teams exist', !emptyBoard);
  }

  /* ── 3b. onAuthStateChange only re-renders on a uid change ── */
  console.log('\n3b. Auth listener re-renders only when the user id changes');
  {
    const H = load({ tables: base(), session: SESSION });
    await H.Data.initAuth();
    await H.Data.loadCore();
    let renders = 0;
    H.Router.render = async () => { renders++; };

    await H.fireAuth('TOKEN_REFRESHED', SESSION);
    ok('token refresh does not re-render', renders === 0, `renders=${renders}`);
    await H.fireAuth('SIGNED_IN', SESSION);
    ok('same user signing in again does not re-render', renders === 0, `renders=${renders}`);
    await H.fireAuth('SIGNED_OUT', null);
    ok('signing out does re-render', renders === 1, `renders=${renders}`);
  }

  /* ── 4. Only a full XI ranks ── */
  console.log('\n4. Only a complete XI appears on the leaderboard');
  {
    const H = load({ tables: base(), session: null });
    await H.Data.loadCore();
    H.Data._settleAuth();
    const standings = await H.Data.fantasyStandings();
    const html = H.Views._fantasyTable(standings);

    ok('team with a full XI is shown', html.includes('Playing XI'));
    ok('team with 0 picks is hidden', !html.includes('No Picks Yet'));
    ok('team with 7 of 11 picks is hidden', !html.includes('Half Built'));
    ok('a catch-up credit alone does not put you on the board', !html.includes('+12'));
    ok('manager count matches the visible rows', /1 manager<\/span>/.test(html),
       (html.match(/\d+ managers?<\/span>/) || [])[0]);

    const squadOf = n => Array.from({ length: n }, (_, i) => ({ player_id: 'p' + i }));
    ok('empty squad gets the prompt',
       H.Views._pickXiLine({ squad: [] }).includes('Pick your XI to appear on the leaderboard'));
    ok('part-built squad gets the prompt too',
       H.Views._pickXiLine({ squad: squadOf(7) }).includes('Pick your XI to appear on the leaderboard'));
    ok('part-built prompt counts what is left', /4 more to go/.test(H.Views._pickXiLine({ squad: squadOf(7) })),
       H.Views._pickXiLine({ squad: squadOf(7) }));
    ok('a full XI does not get the prompt', H.Views._pickXiLine({ squad: squadOf(11) }) === '');
  }

  console.log(`\n${fails ? fails + ' FAILED' : 'all checks passed'}`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
