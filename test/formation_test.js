// Changing formation on a saved squad: who moves, what it costs, and that
// the database ends up with a full, correctly slotted XI. All stubbed.
const { load } = require('./harness.js');

let fails = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond || !extra ? '' : '\n        ' + extra}`);
};

const T = 't1';
const pos = { GK: ['g1'], DEF: ['d1','d2','d3','d4','d5'], MID: ['m1','m2','m3','m4','m5'], ATT: ['a1','a2','a3'] };
const players = Object.entries(pos).flatMap(([p, ids]) =>
  ids.map((id, i) => ({ id, name: id.toUpperCase(), position: p, squad_num: 10 + i, is_guest: false, is_active: true })));

(async () => {
  const H = load({ tables: { players, seasons: [{ id: 's1', is_active: true }] } });
  const F = H.Fantasy, CONFIG = H.CONFIG;

  // A 4-4-2 squad: g1 | d1 d2 d3 d4 | m1 m2 m3 m4 | a1 a2
  const fill = (f, lines) => {
    const out = {}, taken = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
    CONFIG.FORMATIONS[f].forEach((s, i) => { out[i] = lines[s.pos][taken[s.pos]++]; });
    return out;
  };
  const bySlot = fill('4-4-2', { GK: ['g1'], DEF: ['d1','d2','d3','d4'], MID: ['m1','m2','m3','m4'], ATT: ['a1','a2'] });

  console.log('\n1. What a switch asks for');
  const d = F.lineDelta('4-4-2', '5-3-2');
  ok('4-4-2 to 5-3-2: one defender in, one midfielder out', d.DEF === 1 && d.MID === -1 && d.ATT === 0 && d.GK === 0);
  const d2 = F.lineDelta('4-5-1', '4-2-3-1');
  ok('4-5-1 to 4-2-3-1 moves nobody', Object.values(d2).every(v => v === 0));
  const shapes = Object.keys(CONFIG.FORMATIONS);
  ok('every formation on offer is a real one: 1 keeper, 3-5 at the back, 1-3 up top',
     shapes.every(f => { const c = F.lineDelta('4-4-2', f); return c.GK === 0 && 4 + c.DEF >= 3 && 4 + c.DEF <= 5 && 2 + c.ATT >= 1 && 2 + c.ATT <= 3; }),
     shapes.join(' '));

  console.log('\n2. Reshaping the squad');
  const next = F.reshape(bySlot, '4-4-2', '5-3-2', ['m3'], { DEF: ['d5'] });
  const vals = Object.values(next);
  ok('full XI after the switch', vals.length === 11 && vals.every(Boolean));
  ok('the midfielder chosen to leave has gone', !vals.includes('m3'));
  ok('the new defender is in', vals.includes('d5'));
  ok('every player sits in a slot of his own position',
     CONFIG.FORMATIONS['5-3-2'].every((s, i) => players.find(p => p.id === next[i]).position === s.pos));
  ok('a half-made choice is refused, not saved', F.reshape(bySlot, '4-4-2', '5-3-2', ['m3'], {}) === null);
  ok('picking the wrong position is refused', F.reshape(bySlot, '4-4-2', '5-3-2', ['m3'], { ATT: ['a3'] }) === null);

  console.log('\n3. The writes');
  const picks = Object.entries(bySlot).map(([slot, pid]) => ({ fantasy_team_id: T, player_id: pid, slot_index: +slot, released_at: null }));
  const tables = { players, seasons: [{ id: 's1', is_active: true }],
    fantasy_teams: [{ id: T, formation: '4-4-2' }], fantasy_picks: picks, fantasy_transfers: [] };
  const H2 = load({ tables });
  await H2.Data.changeFormation(T, '5-3-2', next, [{ out: 'm3', in: 'd5', cost: 4 }]);
  const writes = H2.dbLog.filter(x => typeof x === 'object');
  ok('formation is written first, before any player moves', writes[0].table === 'fantasy_teams' && writes[0].set.formation === '5-3-2');
  ok('team now says 5-3-2', tables.fantasy_teams[0].formation === '5-3-2');
  const active = tables.fantasy_picks.filter(p => !p.released_at);
  ok('11 active picks', active.length === 11, `${active.length}`);
  ok('m3 released, not deleted', tables.fantasy_picks.some(p => p.player_id === 'm3' && p.released_at));
  ok('every active pick is in the slot reshape gave it',
     active.every(p => next[p.slot_index] === p.player_id));
  ok('logged as one transfer with its cost',
     tables.fantasy_transfers.length === 1 && tables.fantasy_transfers[0].points_cost === 4
     && tables.fantasy_transfers[0].out_player_id === 'm3' && tables.fantasy_transfers[0].in_player_id === 'd5');

  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})();
