// Player card transfer buttons: out if he's yours, in if he isn't, with
// the right cost. All stubbed: no network, no auth calls, no writes.
const { load } = require('./harness.js');

let fails = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond || !extra ? '' : '\n        ' + extra}`);
};

const UID = 'me', S = 's1', T = 't1';
const SESSION = { user: { id: UID, email: 'me@example.com', is_anonymous: false } };
const lines = { GK: ['g1'], DEF: ['d1','d2','d3','d4','d5'], MID: ['m1','m2','m3','m4','m5'], ATT: ['a1','a2','a3'] };
const players = Object.entries(lines).flatMap(([pos, ids]) =>
  ids.map((id, i) => ({ id, name: id.toUpperCase(), nickname: null, position: pos, squad_num: 10 + i, is_guest: false, is_active: true })));
players.push({ id: 'guest', name: 'Ringer', position: 'ATT', squad_num: 900, is_guest: true, is_active: true });

const build = made => {
  const xi = { GK: ['g1'], DEF: ['d1','d2','d3','d4'], MID: ['m1','m2','m3','m4'], ATT: ['a1','a2'] };
  return {
    seasons: [{ id: S, name: 'S', is_active: true, free_transfers: 2, transfer_cost: 4 }],
    players, venues: [], fixtures: [], season_leaderboard: [],
    profiles: [{ id: UID, display_name: 'Me', role: 'player', is_approved: true }],
    fantasy_teams: [{ id: T, owner_id: UID, season_id: S, formation: '4-4-2', is_locked: false, picks: [] }],
    fantasy_standings: [{ fantasy_team_id: T, season_id: S, squad_size: 11, transfers_made: made, total_points: 0 }],
    fantasy_player_fixture_points: [], fantasy_team_fixture_points: [], appearances: [], match_events: [],
    _xi: xi,
  };
};

(async () => {
  for (const [made, label] of [[0, 'free'], [2, 'costs 4']]) {
    const tables = build(made);
    const H = load({ tables, session: SESSION });
    await H.Data.initAuth();
    await H.Data.loadCore();
    // Fill picks against the real 4-4-2 slot order.
    const taken = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
    tables.fantasy_teams[0].picks = H.CONFIG.FORMATIONS['4-4-2'].map((s, i) => ({
      player_id: tables._xi[s.pos][taken[s.pos]++], slot_index: i,
      acquired_at: '2026-09-01T00:00:00+00:00', released_at: null }));

    console.log(`\n${made} transfers made (${label})`);
    await H.Views._cardActions(H.Data.player('m2'), {});
    let act = H.getEl('pcAct').innerHTML;
    ok('your own player gets "transfer out"', act.includes('Transfer M2 out') && !act.includes(' in <'));
    ok('it says what it costs', made ? act.includes('costs 4 points') : act.includes('free, 2 left'), act);

    H.getEl('pcAct').innerHTML = '';
    await H.Views._cardActions(H.Data.player('m5'), {});
    act = H.getEl('pcAct').innerHTML;
    ok('someone else’s player gets "transfer in"', act.includes('Transfer M5 in'));

    H.getEl('pcAct').innerHTML = '';
    await H.Views._cardActions(H.Data.player('guest'), {});
    ok('a guest ringer gets no button', H.getEl('pcAct').innerHTML === '');

    const team = await H.Data.myFantasyTeam();
    H.Views._fantasyTransferIn(team, H.Data.player('d5'), {}, made ? 4 : 0);
    const modal = H.getEl('modalInner').innerHTML;
    const outs = (modal.match(/data-outslot="\d+"/g) || []).length;
    ok('transfer in offers only your players in his position (4 defenders)', outs === 4, `${outs}`);
    ok('nothing is swapped until you pick who goes', /id="tiGo" disabled>Pick who goes/.test(modal));
  }

  {
    const tables = build(0);
    const H = load({ tables, session: SESSION });
    await H.Data.initAuth(); await H.Data.loadCore();
    tables.fantasy_teams[0].picks = [{ player_id: 'g1', slot_index: 0, acquired_at: '2026-09-01T00:00:00+00:00', released_at: null }];
    await H.Views._cardActions(H.Data.player('m5'), {});
    ok('no buttons while your XI is still being picked', H.getEl('pcAct').innerHTML === '');
  }

  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})();
