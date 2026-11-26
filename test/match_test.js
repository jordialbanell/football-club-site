// Per-match leaderboard and the match-by-match team breakdown.
// Everything stubbed: no network, no auth calls, no writes.
const { load } = require('./harness.js');

const S = 's1', KHI = 'p-k', ALI = 'p-a', T1 = 't-early', T2 = 't-late';
const F1 = 'fx-1', F2 = 'fx-2', F3 = 'fx-3';

const tables = () => ({
  seasons: [{ id: S, name: '2026 Season', is_active: true }],
  players: [
    { id: KHI, name: 'Khizer', nickname: null, position: 'ATT', squad_num: 9, is_guest: false, is_active: true },
    { id: ALI, name: 'Ali',    nickname: null, position: 'DEF', squad_num: 5, is_guest: false, is_active: true },
  ],
  venues: [], profiles: [], season_leaderboard: [],
  fixtures: [
    { id: F1, season_id: S, opponent: 'Exiles FC', kickoff_at: '2026-09-06T02:00:00+00:00', competition: 'League', status: 'played', our_score: 2, their_score: 1 },
    { id: F2, season_id: S, opponent: 'Britannia', kickoff_at: '2026-09-13T02:00:00+00:00', competition: 'League', status: 'played', our_score: 1, their_score: 1 },
    { id: F3, season_id: S, opponent: 'Hammers',   kickoff_at: '2026-09-20T02:00:00+00:00', competition: 'Friendly', status: 'played', our_score: 0, their_score: 3 },
  ],
  fantasy_player_fixture_points: [
    { fixture_id: F1, season_id: S, kickoff_at: '2026-09-06T02:00:00+00:00', competition: 'League',   player_id: KHI, points: 7,  streak_points: 1 },
    { fixture_id: F2, season_id: S, kickoff_at: '2026-09-13T02:00:00+00:00', competition: 'League',   player_id: KHI, points: 4,  streak_points: 2 },
    { fixture_id: F3, season_id: S, kickoff_at: '2026-09-20T02:00:00+00:00', competition: 'Friendly', player_id: ALI, points: 1,  streak_points: 0 },
  ],
  fantasy_team_fixture_points: [
    { fantasy_team_id: T1, season_id: S, fixture_id: F1, kickoff_at: '2026-09-06T02:00:00+00:00', points_earned: 7, streak_points: 1, transfer_cost: 0, points: 7 },
    { fantasy_team_id: T1, season_id: S, fixture_id: F2, kickoff_at: '2026-09-13T02:00:00+00:00', points_earned: 4, streak_points: 2, transfer_cost: 0, points: 4 },
    { fantasy_team_id: T1, season_id: S, fixture_id: F3, kickoff_at: '2026-09-20T02:00:00+00:00', points_earned: 1, streak_points: 0, transfer_cost: 4, points: -3 },
    { fantasy_team_id: T2, season_id: S, fixture_id: F3, kickoff_at: '2026-09-20T02:00:00+00:00', points_earned: 0, streak_points: 0, transfer_cost: 0, points: 0 },
  ],
  fantasy_standings: [
    { fantasy_team_id: T1, season_id: S, team_name: 'Early Birds', owner_name: 'Ann', squad_size: 11, total_points: 8,  gameweek_points: 1, catch_up_points: 0 },
    { fantasy_team_id: T2, season_id: S, team_name: 'Late Show',   owner_name: 'Bob', squad_size: 11, total_points: 20, gameweek_points: 0, catch_up_points: 20 },
  ],
  fantasy_teams: [], fantasy_picks: [], fantasy_settings: [], fantasy_team_secrets: [], fantasy_transfers: [],
  appearances: [ { fixture_id: F1, player_id: KHI }, { fixture_id: F2, player_id: KHI }, { fixture_id: F3, player_id: ALI } ],
  match_events: [ { fixture_id: F1, player_id: KHI, type: 'goal', qty: 1 } ],
});

let fails = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond || !extra ? '' : '\n        ' + extra}`);
};

(async () => {
  const H = load({ tables: tables(), session: null });
  await H.Data.loadCore();
  H.Data._settleAuth();
  const standings = await H.Data.fantasyStandings();
  const matches   = await H.Data.teamMatchPoints();
  const rows      = H.Views._onBoard(standings);

  console.log('\n1. Single-match leaderboard');
  {
    const m1 = H.Views._matchBoard(rows, matches.filter(m => m.fixture_id === F1), null);
    ok('a team created after the match is left out', m1.includes('Early Birds') && !m1.includes('Late Show'));
    ok('catch-up credit never shows on a match board', !m1.includes('+20'));

    const m3 = H.Views._matchBoard(rows, matches.filter(m => m.fixture_id === F3), null);
    ok('late joiner appears for matches after it joined', m3.includes('Late Show'));
    ok('transfer hit is shown against the match it was charged to', m3.includes('&minus;4'));
    ok('ranked on the match, not the season: 0 beats -3',
       m3.indexOf('Late Show') < m3.indexOf('Early Birds'));
    ok('rows link to that match on the team page', m3.includes(`data-fixture="${F3}"`));
  }

  console.log('\n2. Season table unchanged by default');
  {
    const html = H.Views._fantasyTable(standings);
    ok('season table still renders totals', html.includes('<td class="r big">20</td>') && html.includes('>Last match<'));
    ok('picker slot is there for the match selector', html.includes('id="boardPick"'));
  }

  console.log('\n2b. Season table says how many matches each team has had');
  {
    const html = H.Views._seasonBoard(rows, null, { [T1]: 2, [T2]: 0 }, 2);
    ok('Matches column, out of the official games played', html.includes('>Matches<') && html.includes('2/2') && html.includes('0/2'));
    ok('blank until the match data has loaded', !/\d\/\d/.test(H.Views._seasonBoard(rows, null)));
  }

  console.log('\n3. Scoring rules, line by line');
  {
    const F = H.Fantasy;
    ok('streak: nothing for 1st and 2nd in a row', F.streakBonus(1) === 0 && F.streakBonus(2) === 0);
    ok('streak: +2 from the 3rd', F.streakBonus(3) === 2 && F.streakBonus(9) === 2);
    ok('streak: +5 on the 10th and 20th', F.streakBonus(10) === 5 && F.streakBonus(20) === 5 && F.streakBonus(11) === 2);
    ok('striker brace = 2 + 8', F.breakdown('ATT', { goal: 2 }, true).total === 10);
    ok('keeper hat-trick = 2 + 60 + 3', F.breakdown('GK', { goal: 3 }, true).total === 65);
    ok('friendly halves, rounding 3.5 up to 4', F.breakdown('MID', { goal: 1 }, true, true).total === 4);
    ok('friendly red rounds away from zero: -6 to -3', F.breakdown('DEF', { red: 1 }, true, true).total === -3);
    const st = F.breakdown('DEF', {}, true, false, { run: 6, bonus: 2 });
    ok('streak shows as its own line', st.rows.some(r => r.key === 'streak' && r.label.includes('6 in a row') && r.pts === 2) && st.total === 4);
  }

  console.log('\n4. Player card: a strip of matches, the latest one open');
  {
    await H.Views._fantasyPlayerCard(KHI, {});
    const html = H.getEl('modalInner').innerHTML;
    ok('a tile for every match, oldest first',
       html.indexOf('data-pfx="fx-1"') > -1 && html.indexOf('data-pfx="fx-1"') < html.indexOf('data-pfx="fx-3"'));
    ok('latest match is selected', /fx-tile on[^"]*" data-pfx="fx-3"/.test(html));
    ok('a match he missed shows 0, greyed', /fx-tile on off" data-pfx="fx-3"[\s\S]*?fx-n">0</.test(html));
    ok('panel says he didn’t play', html.includes("Didn't play. <b>0</b> points."));
    ok('his played matches carry their points', /data-pfx="fx-1"[\s\S]*?fx-n">7</.test(html));
  }

  console.log('\n5. Team page: points for the match picked, not the season');
  {
    // Ali in the XI now, Khizer sold before the friendly.
    const team = { id: T1, formation: '4-4-2', bySlot: { 1: ALI },
      picks: [
        { player_id: KHI, acquired_at: '2026-09-01T00:00:00+00:00', released_at: '2026-09-15T00:00:00+00:00' },
        { player_id: ALI, acquired_at: '2026-09-15T00:00:00+00:00', released_at: null },
      ] };
    await H.Views._teamRounds(team, { pts: { [ALI]: 99 }, stats: {} });
    let list = H.getEl('fantasyList').innerHTML;
    ok('defaults to the latest match', /fx-tile on[^"]*" data-round="fx-3"/.test(H.getEl('roundStrip').innerHTML));
    ok('shows his points for that match, not his season total',
       list.includes('<span class="pick-pts">1</span>') && !list.includes('>99<'));
    ok('match header carries the team score and the transfer hit',
       H.getEl('roundHead').innerHTML.includes('&minus;4 transfer') && H.getEl('roundHead').innerHTML.includes('-3 pts'));
    ok('a Season tile is there for the totals', H.getEl('roundStrip').innerHTML.includes('data-round="season"'));

    await H.Views._teamRounds(team, { pts: {}, stats: {}, fixtureId: F1 });
    list = H.getEl('fantasyList').innerHTML;
    ok('a player bought after the match shows a dash, not points',
       list.includes('Not his yet') && list.includes('<span class="pick-pts">&ndash;</span>'));

    const keeper = { id: T1, formation: '4-4-2', bySlot: { 9: KHI },
      picks: [{ player_id: KHI, acquired_at: '2026-09-01T00:00:00+00:00', released_at: null }] };
    await H.Views._teamRounds(keeper, { pts: { [KHI]: 34 }, stats: {} });
    list = H.getEl('fantasyList').innerHTML;
    ok('owned but didn’t play: 0, not his season 34',
       list.includes('Didn’t play') && list.includes('<span class="pick-pts">0</span>') && !list.includes('>34<'));
  }

  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})();
