/* ═══════════════════════════════════════════════════════════
   FANTASY — rules that are pure functions of their inputs.
   No DOM, no network, no State. Everything here can be run
   with made-up arguments and checked, which is the point:
   these are the bits where being subtly wrong costs someone
   their squad.
   ═══════════════════════════════════════════════════════════ */

const Fantasy = {

  /* Move a squad from one formation to another without emptying it.
   *
   *   picks  {slotIndex: playerId}  against `from`
   *   from   formation name, e.g. '4-3-3'
   *   to     formation name, e.g. '5-3-2'
   *
   * Returns { picks, dropped, kept } where picks is the new
   * {slotIndex: playerId} against `to`, and dropped is
   * [{ player_id, pos }] for everyone who had nowhere to go.
   *
   * The rules, in the order they matter:
   *   - a keeper is a keeper. GK always survives.
   *   - each line (DEF, MID, ATT) keeps its players IN SLOT ORDER, so a
   *     back four moving to a back five keeps all four and leaves the new
   *     slot empty.
   *   - when a line shrinks, the drop comes off the END of that line. That
   *     is the most recently filled slot, and it is deterministic: the same
   *     switch always drops the same player, so Undo can put it back and
   *     switching there and back is a no-op.
   */
  remapFormation(picks, from, to) {
    const fromDef = CONFIG.FORMATIONS[from] || [];
    const toDef   = CONFIG.FORMATIONS[to]   || [];

    // Players of each line, in the slot order they were picked in.
    const byLine = { GK: [], DEF: [], MID: [], ATT: [] };
    fromDef.forEach((slot, i) => {
      const pid = picks[i];
      if (pid && byLine[slot.pos]) byLine[slot.pos].push(pid);
    });

    const taken = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
    const next  = {};

    toDef.forEach((slot, i) => {
      const line = byLine[slot.pos];
      if (!line) return;
      const pid = line[taken[slot.pos]];
      if (pid) {
        next[i] = pid;
        taken[slot.pos]++;
      }
      // No player left for this slot: it stays empty, which is what a
      // line that grew should look like.
    });

    // Whatever the new shape had no room for, in line order.
    const dropped = [];
    ['GK', 'DEF', 'MID', 'ATT'].forEach(pos => {
      byLine[pos].slice(taken[pos]).forEach(pid => dropped.push({ player_id: pid, pos }));
    });

    return { picks: next, dropped, kept: Object.keys(next).length };
  },

  /* Changing formation on a squad that has already been saved.
   * Unlike remapFormation (the free builder, where the end of a line just
   * drops off), here the manager chooses who leaves and who joins, and
   * every one of those pairs is a transfer.
   *
   * Only the formations in CONFIG.FORMATIONS exist, so the shape is always
   * a real one: no three-at-the-back-and-five-strikers.
   */

  // How many more (or fewer) of each position `to` needs than `from`.
  lineDelta(from, to) {
    const count = f => {
      const c = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
      (CONFIG.FORMATIONS[f] || []).forEach(s => { if (s.pos in c) c[s.pos]++; });
      return c;
    };
    const a = count(from), b = count(to);
    return { GK: b.GK - a.GK, DEF: b.DEF - a.DEF, MID: b.MID - a.MID, ATT: b.ATT - a.ATT };
  },

  /* The new {slotIndex: playerId} once `leaving` are out and `joining`
   * ({DEF: [ids], ...}) are in. Each line keeps its remaining players in
   * their old slot order and the newcomers fill in after them. Returns null
   * if the numbers don't add up to the new shape, so a half-made choice can
   * never be saved. */
  reshape(bySlot, from, to, leaving = [], joining = {}) {
    const fromDef = CONFIG.FORMATIONS[from] || [];
    const toDef   = CONFIG.FORMATIONS[to]   || [];
    const out = new Set(leaving);
    const lines = { GK: [], DEF: [], MID: [], ATT: [] };
    fromDef.forEach((slot, i) => {
      const pid = bySlot[i];
      if (pid && !out.has(pid) && lines[slot.pos]) lines[slot.pos].push(pid);
    });
    Object.entries(joining).forEach(([pos, ids]) => { if (lines[pos]) lines[pos].push(...ids); });

    const need = this.lineDelta(to, to);   // all zero, just the shape of the object
    toDef.forEach(slot => { need[slot.pos]++; });
    if (Object.keys(lines).some(pos => lines[pos].length !== need[pos])) return null;

    const taken = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
    const next = {};
    toDef.forEach((slot, i) => { next[i] = lines[slot.pos][taken[slot.pos]++]; });
    return next;
  },

  /* Streak bonus for a match, given how many in a row he was on.
   * Mirrors fantasy_streak_bonus() in the database (migration 015). */
  streakBonus(run) {
    if (run < 3) return 0;
    return run % 10 === 0 ? 5 : 2;
  },

  /* Where one player's points in one match came from, line by line, the
   * way the database scores it (fantasy_player_fixture_points).
   *
   *   pos        'GK' | 'DEF' | 'MID' | 'ATT'
   *   ev         { goal, assist, clean_sheet, motm, yellow, red, own_goal }
   *   played     on the result sheet
   *   friendly   pays half, rounded the way Postgres rounds (half away from 0)
   *   streak     { run, bonus }
   *
   * Returns { rows: [{ key, label, qty, pts }], total }. */
  breakdown(pos, ev = {}, played = false, friendly = false, streak = { run: 0, bonus: 0 }) {
    const per = {
      goal:   { GK: 20, DEF: 7, MID: 5, ATT: 4 },
      assist: { GK:  8, DEF: 5, MID: 4, ATT: 2 },
      cs:     { GK:  4, DEF: 4, MID: 2, ATT: 1 },
    };
    const n = k => ev[k] || 0;
    const rows = [
      { key: 'played', label: 'Played',          qty: played ? 1 : 0, pts: played ? 2 : 0 },
      { key: 'goal',   label: 'Goals',           qty: n('goal'),   pts: n('goal') * (per.goal[pos] ?? 4) },
      { key: 'assist', label: 'Assists',         qty: n('assist'), pts: n('assist') * (per.assist[pos] ?? 2) },
      { key: 'cs',     label: 'Clean sheet',     qty: n('clean_sheet'), pts: n('clean_sheet') * (per.cs[pos] ?? 1) },
      { key: 'motm',   label: 'Man of the match', qty: n('motm'),  pts: n('motm') * 3 },
      { key: 'hat',    label: 'Hat-trick bonus', qty: n('goal') >= 3 ? 1 : 0, pts: n('goal') >= 3 ? 3 : 0 },
      { key: 'yellow', label: 'Yellow card',     qty: n('yellow'), pts: -2 * n('yellow') },
      { key: 'red',    label: 'Red card',        qty: n('red'),    pts: -8 * n('red') },
      { key: 'og',     label: 'Own goal',        qty: n('own_goal'), pts: -2 * n('own_goal') },
    ];
    const base = rows.reduce((a, r) => a + r.pts, 0);
    if (friendly && base) {
      const half = Math.sign(base) * Math.round(Math.abs(base) / 2);
      rows.push({ key: 'friendly', label: 'Friendly, half points', qty: null, pts: half - base });
    }
    if (streak.bonus) {
      rows.push({ key: 'streak', label: `Streak, ${streak.run} in a row`, qty: streak.run, pts: streak.bonus });
    }
    return { rows, total: rows.reduce((a, r) => a + r.pts, 0) };
  },

  // What to call each line in a sentence.
  LINE_NAME: { GK: 'goal', DEF: 'defence', MID: 'midfield', ATT: 'attack' },

  /* The one-line summary under the formation pills.
   * "Switched to 5-3-2. Dropped Yuri from attack."
   * nameOf is injected so this stays pure and testable. */
  switchNotice(to, dropped, nameOf) {
    if (!dropped.length) return `Switched to ${to}. Everyone kept.`;

    // Group by line so two attackers read as one clause, not two.
    const order = ['GK', 'DEF', 'MID', 'ATT'];
    const byPos = {};
    dropped.forEach(d => (byPos[d.pos] ||= []).push(nameOf(d.player_id)));

    const clauses = order.filter(p => byPos[p]).map(p =>
      `${this._list(byPos[p])} from ${this.LINE_NAME[p]}`);

    return `Switched to ${to}. Dropped ${this._list(clauses)}.`;
  },

  _list(items) {
    if (items.length <= 1) return items[0] || '';
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  },
};
