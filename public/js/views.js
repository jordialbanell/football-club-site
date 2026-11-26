/* ═══════════════════════════════════════════════════════════
   PUBLIC VIEWS
   ═══════════════════════════════════════════════════════════ */

const Views = {

  /* ─────────── HOME ─────────── */
  async home(app) {
    const [next, recent, board, hero] = await Promise.all([
      Data.nextFixture(),
      Data.fixtures({ status: 'played', limit: 5, order: 'desc' }),
      Data.leaderboard(),
      Data.setting('hero_image'),
    ]);

    const allPlayed = await Data.fixtures({ status: 'played' });
    // Friendlies don't count towards the record, the form guide or anything else
    const played = allPlayed.filter(f => UI.isCompetitive(f));
    const friendlies = allPlayed.length - played.length;
    const w = played.filter(f => UI.resultLetter(f) === 'W').length;
    const d = played.filter(f => UI.resultLetter(f) === 'D').length;
    const l = played.filter(f => UI.resultLetter(f) === 'L').length;
    const gf = played.reduce((a, f) => a + (f.our_score || 0), 0);
    const ga = played.reduce((a, f) => a + (f.their_score || 0), 0);
    const gd = gf - ga;
    const leaguePts = w * 3 + d;
    const winPct = played.length ? Math.round((w / played.length) * 100) : 0;

    // Most recent five competitive results, oldest first, as a form guide
    const form = [...played]
      .sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at))
      .slice(-5)
      .map(f => ({ r: UI.resultLetter(f), opp: f.opponent, score: `${f.our_score}-${f.their_score}` }));

    const scorer = [...board].sort((a, b) => b.goals - a.goals)[0];
    const asst   = [...board].sort((a, b) => b.assists - a.assists)[0];
    const apps   = [...board].sort((a, b) => b.appearances - a.appearances)[0];

    app.innerHTML = `
      <section class="hero">
        <img class="hero-img" src="${esc(hero || 'images/team-2026.jpg')}" alt="Riverside FC">

        <div class="hero-sponsors">
          <span class="hero-sponsors-label">Sponsored by</span>
          <div class="hero-sponsor-marks">
            ${CONFIG.SPONSORS.map(sp => `
              <a href="${esc(sp.url)}" target="_blank" rel="noopener" title="${esc(sp.name)}">
                ${sp.logo
                  ? `<img src="${esc(sp.logo)}" alt="${esc(sp.name)}">`
                  : `<span class="sponsor-wordmark">${esc(sp.name)}</span>`}
              </a>`).join('')}
          </div>
        </div>

        <div class="hero-inner">
          <div class="label">Singapore &middot; 11-a-side</div>
          <h1 class="display">Riverside</h1>
          <p class="hero-sub">${esc(State.season?.name || '')}${played.length ? ` &middot; ${w}W ${d}D ${l}L` : ''}</p>
        </div>
      </section>

      ${next ? await this._nextMatch(next) : ''}

      <section class="section">
        <div class="wrap reveal">
          <div class="section-head">
            <h2 class="h2">Season</h2>
            <span class="side">${esc(State.season?.name || '')}</span>
          </div>

          ${played.length ? `
          <div class="card-row">
            <div class="card">
              <div class="card-top"><span class="card-label">League points</span></div>
              <div class="card-n">${leaguePts}</div>
              <div class="card-sub">${played.length} played &middot; ${w}W ${d}D ${l}L${
                friendlies ? ` &middot; ${friendlies} friendly` : ''}</div>
            </div>

            <div class="card">
              <div class="card-top"><span class="card-label">Win rate</span></div>
              <div class="card-n">${winPct}<span class="card-unit">%</span></div>
              <div class="card-sub">
                <span class="bar"><span class="bar-fill" style="width:${winPct}%"></span></span>
              </div>
            </div>

            <div class="card">
              <div class="card-top"><span class="card-label">Goals</span></div>
              <div class="card-n">${gf}</div>
              <div class="card-sub">${ga} conceded &middot;
                <span class="delta ${gd >= 0 ? 'up' : 'down'}">${gd >= 0 ? '+' : ''}${gd} GD</span>
              </div>
            </div>

            <div class="card">
              <div class="card-top"><span class="card-label">Form</span></div>
              <div class="form-row">
                ${form.map(f => `<span class="form-pill ${f.r}" title="${esc(f.opp)} ${f.score}">${f.r}</span>`).join('')}
              </div>
              <div class="card-sub">Last ${form.length} ${form.length === 1 ? 'match' : 'matches'}</div>
            </div>
          </div>` : `
          <div class="card-row">
            <div class="card empty-card">
              <div class="card-sub">No matches played yet. Add a result and this fills in.</div>
            </div>
          </div>`}

          ${board.length ? `
          <div class="card-row" style="margin-top:14px">
            <div class="card">
              <div class="card-top"><span class="card-label">Top scorer</span></div>
              <div class="card-name">${esc(scorer?.name ?? '&mdash;')}</div>
              <div class="card-sub">${scorer?.goals ?? 0} goal${scorer?.goals === 1 ? '' : 's'}</div>
            </div>
            <div class="card">
              <div class="card-top"><span class="card-label">Most assists</span></div>
              <div class="card-name">${esc(asst?.name ?? '&mdash;')}</div>
              <div class="card-sub">${asst?.assists ?? 0} assist${asst?.assists === 1 ? '' : 's'}</div>
            </div>
            <div class="card">
              <div class="card-top"><span class="card-label">Most appearances</span></div>
              <div class="card-name">${esc(apps?.name ?? '&mdash;')}</div>
              <div class="card-sub">${apps?.appearances ?? 0} game${apps?.appearances === 1 ? '' : 's'}</div>
            </div>
            <div class="card">
              <div class="card-top"><span class="card-label">Squad</span></div>
              <div class="card-n">${squadOnly().length}</div>
              <div class="card-sub"><a href="#/squad">See everyone &#8594;</a></div>
            </div>
          </div>` : ''}
        </div>
      </section>

      ${recent.length ? `
      <section class="section">
        <div class="wrap reveal">
          <div class="section-head">
            <h2 class="h2">Recent Results</h2>
            <span class="side"><a href="#/results">All results &#8594;</a></span>
          </div>
          ${this._fxList(recent, true)}
        </div>
      </section>` : ''}
    `;
    this._bindRows();
  },

  async _nextMatch(fx) {
    const side = UI.matchSides(fx);

    return `
      <section class="match-strip">
        <div class="wrap match-inner">
          <div class="label label-red" style="margin-bottom:18px">Next Match &middot; ${esc(fx.competition || 'League')}</div>
          <div class="match-line">
            <div class="match-team">
              <div class="match-club">${esc(side.homeName)}</div>
              <div class="match-side">${side.homeLabel}</div>
            </div>
            <div class="match-mid"><span class="match-vs">v</span></div>
            <div class="match-team right">
              <div class="match-club">${esc(side.awayName)}</div>
              <div class="match-side">${side.awayLabel}</div>
            </div>
          </div>

          <div class="meta-grid">
            <div class="meta-item">
              <span class="label">Kick Off</span>
              <div class="meta-val">${UI.fmtDateTime(fx.kickoff_at)}</div>
            </div>
            <div class="meta-item">
              <span class="label">Venue</span>
              ${this._venue(fx)}
            </div>
            <div class="meta-item">
              <span class="label">Countdown</span>
              <div class="countdown">${UI.fmtRelative(fx.kickoff_at)}</div>
            </div>
          </div>

          <div class="avail-line">
            <a href="#/fixture/${fx.id}" class="btn btn-sm btn-primary" style="margin-left:auto">Match Centre</a>
          </div>
        </div>
      </section>`;
  },

  /* ─────────── FIXTURES ─────────── */
  async fixtures(app) {
    const list = await Data.fixtures({ status: 'upcoming' });
    app.innerHTML = `
      <section class="section">
        <div class="wrap reveal">
          <div class="label label-red">${esc(State.season?.name || 'Season')}</div>
          <h1 class="h1" style="margin:8px 0 20px">Matches</h1>
          ${this._matchTabs('fixtures')}
          <p class="lede">Tap a fixture to see the lineup once it is published.</p>
          <div style="margin-top:26px">
            ${list.length ? this._fxList(list) : '<div class="empty">No upcoming fixtures.</div>'}
          </div>
        </div>
      </section>`;
    this._bindRows();
  },

  /* ─────────── RESULTS ─────────── */
  async results(app) {
    const [list, h2h] = await Promise.all([
      Data.fixtures({ status: 'played', order: 'desc' }),
      Data.headToHead(),
    ]);
    app.innerHTML = `
      <section class="section">
        <div class="wrap reveal">
          <div class="label label-red">${esc(State.season?.name || 'Season')}</div>
          <h1 class="h1" style="margin:8px 0 20px">Matches</h1>
          ${this._matchTabs('results')}
          <div style="margin-top:26px">
            ${list.length ? this._fxList(list, true) : '<div class="empty">No results recorded yet.</div>'}
          </div>
        </div>
      </section>

      ${h2h.length ? `
      <section class="section">
        <div class="wrap reveal">
          <div class="section-head"><h2 class="h2">Head to Head</h2></div>
          <table class="tbl">
            <thead><tr>
              <th>Opponent</th><th class="r">P</th><th class="r">W</th><th class="r">D</th>
              <th class="r">L</th><th class="r">GF</th><th class="r">GA</th>
            </tr></thead>
            <tbody>${h2h.map(r => `
              <tr>
                <td class="strong">${esc(r.opponent)}</td>
                <td class="r">${r.played}</td>
                <td class="r" style="color:var(--green)">${r.won}</td>
                <td class="r">${r.drawn}</td>
                <td class="r" style="color:var(--red)">${r.lost}</td>
                <td class="r">${r.goals_for}</td>
                <td class="r">${r.goals_against}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>` : ''}`;
    this._bindRows();
  },

  /* ─────────── FIXTURE DETAIL ─────────── */
  async fixture(app, id) {
    const fx = await Data.fixture(id);
    if (!fx) { app.innerHTML = '<section class="section"><div class="wrap"><div class="empty">Fixture not found.</div></div></section>'; return; }

    const [lineup, events, media, report] = await Promise.all([
      Data.lineupForFixture(id),
      Data.matchEvents(id),
      Data.media(id),
      Data.report(id),
    ]);

    const played = fx.status === 'played';
    const showLineup = lineup && (lineup.is_published || isSignedIn());
    const side = UI.matchSides(fx);

    const goals = events.filter(e => e.type === 'goal');
    const assts = events.filter(e => e.type === 'assist');
    const cards = events.filter(e => ['yellow','red'].includes(e.type));
    const motm  = events.find(e => e.type === 'motm');

    app.innerHTML = `
      <section class="match-strip" style="border-top:none">
        <div class="wrap match-inner">
          <div class="label label-red" style="margin-bottom:18px">
            ${played ? 'Full Time' : UI.fmtDate(fx.kickoff_at, { weekday: 'long', year: true })}
            &middot; ${esc(fx.competition || 'League')}
          </div>
          <div class="match-line">
            <div class="match-team">
              <div class="match-club">${esc(side.homeName)}</div>
              <div class="match-side">${side.homeLabel}</div>
            </div>
            <div class="match-mid">
              ${played
                ? `<div class="match-score">${side.homeScore}&ndash;${side.awayScore}</div>`
                : `<span class="match-vs">v</span>`}
            </div>
            <div class="match-team right">
              <div class="match-club">${esc(side.awayName)}</div>
              <div class="match-side">${side.awayLabel}</div>
            </div>
          </div>

          <div class="meta-grid">
            <div class="meta-item">
              <span class="label">Kick Off</span>
              <div class="meta-val">${UI.fmtDateTime(fx.kickoff_at)}</div>
            </div>
            <div class="meta-item">
              <span class="label">Venue</span>
              ${this._venue(fx)}
            </div>
            ${!played ? `<div class="meta-item">
              <span class="label">Countdown</span>
              <div class="countdown">${UI.fmtRelative(fx.kickoff_at)}</div>
            </div>` : ''}
          </div>
        </div>
      </section>

      ${showLineup ? `
      <section class="section">
        <div class="wrap reveal">
          <div class="section-head">
            <h2 class="h2">${played ? 'Team' : 'Lineup'}</h2>
            <span class="side">${esc(lineup.formation)}
              ${!lineup.is_published ? '<span class="tag draft" style="margin-left:8px">Draft</span>' : ''}</span>
          </div>
          <div class="lineup-layout">
            <div id="pitchMount"></div>
            <div>
              <div class="label" style="margin-bottom:10px">Starting XI</div>
              <div class="rows" id="xiList"></div>
              ${isSignedIn() ? `
                <div class="label" style="margin:26px 0 8px">Discussion</div>
                <div id="comments"></div>
                <div class="field" style="margin-top:12px">
                  <textarea class="input" id="commentBox" placeholder="Suggest a change" style="min-height:72px"></textarea>
                </div>
                <button class="btn btn-sm btn-primary btn-block" id="postComment">Post</button>` : ''}
            </div>
          </div>
        </div>
      </section>` : ''}

      ${played && (goals.length || assts.length || cards.length || motm) ? `
      <section class="section">
        <div class="wrap reveal">
          <div class="section-head"><h2 class="h2">Match Facts</h2></div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:28px">
            ${this._facts('Goals', goals)}
            ${this._facts('Assists', assts)}
            ${this._facts('Cards', cards, true)}
            ${motm ? `<div>
              <div class="label" style="margin-bottom:8px">Man of the Match</div>
              <div style="font-size:1.1rem;font-weight:700;letter-spacing:-.03em">${esc(Data.playerName(motm.player_id))}</div>
            </div>` : ''}
          </div>
        </div>
      </section>` : ''}

      ${report && (report.is_published || isAdmin()) ? `
      <section class="section">
        <div class="wrap-narrow reveal">
          <div class="label label-red">Match Report</div>
          <h2 class="h1" style="margin:8px 0 22px">${esc(report.title || 'Report')}
            ${!report.is_published ? '<span class="tag draft" style="vertical-align:middle;margin-left:8px">Draft</span>' : ''}</h2>
          <div class="prose">${esc(report.body)}</div>
        </div>
      </section>` : ''}

      ${media.length ? `
      <section class="section">
        <div class="wrap reveal">
          <div class="section-head"><h2 class="h2">Gallery</h2></div>
          <div class="media-grid">${media.map(m => this._media(m)).join('')}</div>
        </div>
      </section>` : ''}

      ${isAdmin() ? `
      <section class="section">
        <div class="wrap reveal">
          <div class="section-head">
            <h2 class="h2">Captain tools</h2>
            <span class="side">Only captains see this</span>
          </div>
          <div class="tool-grid">
            <a class="tool ${lineup ? '' : 'next'}" href="#/admin/lineup/${fx.id}">
              <span class="tool-step">1</span>
              <span class="tool-body">
                <strong>${lineup ? 'Edit the lineup' : 'Pick the lineup'}</strong>
                <span>Choose a formation, tap positions to drop players in, assign subs.
                  ${lineup
                    ? (lineup.is_published ? 'Published, the squad can see it.' : 'Saved as a draft, not visible to the squad.')
                    : 'Nothing picked yet.'}</span>
              </span>
            </a>
            <a class="tool ${!played && lineup?.is_published ? 'next' : ''}" href="#/admin/result/${fx.id}">
              <span class="tool-step">2</span>
              <span class="tool-body">
                <strong>${played ? 'Edit the result' : 'Enter the result'}</strong>
                <span>Score, who played, goals, assists, cards, man of the match.
                  ${played ? 'Recorded.' : 'Do this after the final whistle.'}</span>
              </span>
            </a>
            <a class="tool" href="#/admin/report/${fx.id}">
              <span class="tool-step">3</span>
              <span class="tool-body">
                <strong>${report ? 'Edit the match report' : 'Write a match report'}</strong>
                <span>${report
                  ? (report.is_published ? 'Published.' : 'Draft saved, not published.')
                  : 'Optional. Tell everyone what happened.'}</span>
              </span>
            </a>
            <a class="tool" href="#/admin/media/${fx.id}">
              <span class="tool-step">4</span>
              <span class="tool-body">
                <strong>Photos and video</strong>
                <span>${media.length ? `${media.length} already added.` : 'Upload shots or paste a YouTube link.'}</span>
              </span>
            </a>
          </div>
          <div class="btn-row" style="margin-top:20px">
            <button class="btn btn-sm btn-quiet" id="editFx">Edit fixture details</button>
            <button class="btn btn-sm" id="delFx" style="color:var(--red);border-color:var(--red)">
              Delete this fixture</button>
          </div>
        </div>
      </section>` : ''}`;

    document.getElementById('editFx')?.addEventListener('click', async () => {
      Admin.fixtureModal(await Data.fixture(id));
    });
    document.getElementById('delFx')?.addEventListener('click', async () => {
      if (!confirm(`Delete the ${fx.opponent} fixture?\n\nThis also removes its lineup, result and stats. Cannot be undone.`)) return;
      try {
        await Data.deleteFixture(id);
        UI.toast('Fixture deleted');
        location.hash = '#/fixtures';
      } catch (e) { UI.toast(e.message, true); }
    });

    if (showLineup) {
      Lineup.render(document.getElementById('pitchMount'), {
        formation: lineup.formation,
        jerseyColor: lineup.jersey_color,
        slots: lineup.slots || [],
        editable: false,
      });

      const def = CONFIG.FORMATIONS[lineup.formation] || [];
      document.getElementById('xiList').innerHTML = def.map((base, i) => {
        const s = (lineup.slots || []).find(x => x.slot_index === i);
        const p = s?.player_id ? Data.player(s.player_id) : null;
        const sub = s?.sub_player_id ? Data.player(s.sub_player_id) : null;
        return `<div class="row">
          <span class="row-slot">${base.label}</span>
          ${p ? UI.thumb(p) : ''}
          <span class="row-name">${p ? esc(p.nickname || p.name) : '&mdash;'}</span>
          ${sub ? `<span class="tag draft">&#8593; ${esc(sub.nickname || sub.name)}</span>` : ''}
        </div>`;
      }).join('');

      if (isSignedIn()) {
        const cs = await Data.lineupComments(lineup.id);
        document.getElementById('comments').innerHTML = cs.length ? cs.map(c => `
          <div class="comment">
            <div class="comment-head">
              <span class="comment-author">${esc(c.author?.display_name || 'Someone')}</span>
              <span class="comment-time">${UI.fmtDate(c.created_at)}</span>
            </div>
            <div class="comment-body">${esc(c.body)}</div>
          </div>`).join('') : '<div class="empty" style="padding:16px;text-align:left">No comments yet.</div>';

        document.getElementById('postComment').onclick = async () => {
          const body = document.getElementById('commentBox').value.trim();
          if (!body) return;
          try { await Data.addComment(lineup.id, body); UI.toast('Posted'); Router.render(); }
          catch (e) { UI.toast(e.message, true); }
        };
      }
    }
  },

  _facts(label, evts, isCards = false) {
    if (!evts.length) return '';
    const agg = {};
    evts.forEach(e => {
      const k = e.player_id + (isCards ? '|' + e.type : '');
      agg[k] = (agg[k] || 0) + e.qty;
    });
    return `<div>
      <div class="label" style="margin-bottom:8px">${label}</div>
      ${Object.entries(agg).map(([k, n]) => {
        const [pid, type] = k.split('|');
        return `<div style="font-size:.86rem;font-weight:700;letter-spacing:-.02em;margin-bottom:4px">
          ${esc(Data.playerName(pid))}${n > 1 ? ` <span style="color:var(--red)">&times;${n}</span>` : ''}
          ${type ? `<span class="tag" style="margin-left:6px;background:${type === 'red' ? 'var(--red)' : 'var(--amber)'};color:#fff">${type}</span>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  },

  /* ─────────── LEAGUE TABLE ─────────── */
  async table(app) {
    const [rows, updated] = await Promise.all([
      Data.leagueTable(),
      Data.setting('league_table_updated'),
    ]);

    const stamp = updated
      ? UI.fmtDate(updated, { weekday: 'short', year: true }) + ' at ' + UI.fmtTime(updated)
      : null;

    app.innerHTML = `
      <section class="section">
        <div class="wrap reveal">
          <div class="label label-red">${esc(State.season?.name || 'Season')}</div>
          <h1 class="h1" style="margin:8px 0 20px">Matches</h1>
          ${this._matchTabs('table')}

          <div class="note" style="margin-top:6px">
            <strong>${stamp ? `Updated ${esc(stamp)}` : 'Not filled in yet'}</strong>
            Kept up to date by hand, so it may lag behind.
            The live table is on the
            <a href="${esc(CONFIG.LEAGUE_URL)}" target="_blank" rel="noopener"
               style="color:var(--accent)">EFL site &#8599;</a>.
          </div>

          ${rows.length ? `
          <table class="tbl league-tbl">
            <thead><tr>
              <th style="width:30px"></th><th>Team</th>
              <th class="r">P</th><th class="r">W</th><th class="r">D</th><th class="r">L</th>
              <th class="r hide-sm">GF</th><th class="r hide-sm">GA</th>
              <th class="r">GD</th><th class="r">Pts</th>
            </tr></thead>
            <tbody>${rows.map((r, i) => {
              const gd = r.goals_for - r.goals_against;
              const us = /big\s*poppa/i.test(r.team);
              return `<tr ${us ? 'class="us"' : ''}>
                <td class="rk">${i + 1}</td>
                <td class="strong">${esc(r.team)}</td>
                <td class="r">${r.played}</td>
                <td class="r">${r.won}</td>
                <td class="r">${r.drawn}</td>
                <td class="r">${r.lost}</td>
                <td class="r hide-sm">${r.goals_for}</td>
                <td class="r hide-sm">${r.goals_against}</td>
                <td class="r" style="color:${gd > 0 ? 'var(--green)' : gd < 0 ? 'var(--red)' : 'var(--ink-3)'}">
                  ${gd > 0 ? '+' : ''}${gd}</td>
                <td class="r big">${r.points}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>` : '<div class="empty">Nothing here yet. A captain can fill it in from Admin.</div>'}

          ${isAdmin() ? `<div class="btn-row" style="margin-top:22px">
            <a class="btn btn-primary" href="#/admin/table">Edit the table</a></div>` : ''}
        </div>
      </section>`;
  },

  /* ─────────── SQUAD ─────────── */
  async squad(app) {
    const board = await Data.leaderboard();
    const stats = {};
    board.forEach(r => { stats[r.player_id] = r; });

    const groups = { GK: [], DEF: [], MID: [], ATT: [] };
    squadOnly().forEach(p => groups[p.position]?.push(p));
    const titles = { GK: 'Goalkeepers', DEF: 'Defenders', MID: 'Midfielders', ATT: 'Attackers' };

    app.innerHTML = `
      <section class="section">
        <div class="wrap reveal">
          <div class="label label-red">${squadOnly().length} players</div>
          <h1 class="h1" style="margin:8px 0 20px">Squad</h1>
          ${this._squadTabs('squad')}
          ${Object.entries(groups).map(([pos, list]) => !list.length ? '' : `
            <div style="margin-top:44px">
              <div class="section-head">
                <h2 class="h2">${titles[pos]}</h2>
                <span class="side">${list.length}</span>
              </div>
              <div class="squad-grid">
                ${list.map(p => {
                  const s = stats[p.id] || {};
                  return `
                  <div class="pcard" data-player="${p.id}">
                    <div class="pcard-photo ${p.photo_url ? '' : 'no-img'}">
                      ${p.photo_url
                        ? `<img src="${esc(p.photo_url)}" alt="${esc(p.name)}" loading="lazy">`
                        : `<span class="pcard-initials">${UI.initials(p.name)}</span>`}
                      <span class="pcard-n">${p.squad_num}</span>
                    </div>
                    <div class="pcard-body">
                      <div class="pcard-name">${esc(p.nickname || p.name)}</div>
                      <div class="pcard-meta">${p.nickname ? esc(p.name) : `<span class="pos ${p.position}">${p.position}</span>`}</div>
                      ${s.appearances ? `<div class="pcard-line">${s.appearances} app${s.appearances > 1 ? 's' : ''} &middot; ${s.goals}g &middot; ${s.assists}a</div>` : ''}
                    </div>
                  </div>`;
                }).join('')}
              </div>
            </div>`).join('')}
        </div>
      </section>`;

    document.querySelectorAll('[data-player]').forEach(el => {
      el.onclick = () => this._playerModal(el.dataset.player, stats[el.dataset.player]);
    });
  },

  _playerModal(pid, s = {}) {
    const p = Data.player(pid);
    if (!p) return;
    UI.modal({
      title: p.nickname || p.name,
      // Plain text: UI.modal escapes sub, so an entity would print literally.
      sub: `#${p.squad_num} \u00b7 ${p.position}${p.nickname ? ` \u00b7 ${p.name}` : ''}`,
      body: `
        ${p.photo_url ? `<img src="${esc(p.photo_url)}" alt="${esc(p.name)}"
          style="width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:5px;margin-bottom:18px">` : ''}
        <div class="stats-row compact">
          <div class="stat"><div class="stat-n">${s.appearances ?? 0}</div><div class="stat-k">Apps</div></div>
          <div class="stat"><div class="stat-n">${s.goals ?? 0}</div><div class="stat-k">Goals</div></div>
          <div class="stat"><div class="stat-n">${s.assists ?? 0}</div><div class="stat-k">Assists</div></div>
          <div class="stat"><div class="stat-n">${s.clean_sheets ?? 0}</div><div class="stat-k">Clean sh.</div></div>
        </div>
        <div class="stats-row compact" style="margin-top:18px">
          <div class="stat"><div class="stat-n">${s.motm ?? 0}</div><div class="stat-k">MOTM</div></div>
          <div class="stat"><div class="stat-n" style="color:var(--amber)">${s.yellows ?? 0}</div><div class="stat-k">Yellow</div></div>
          <div class="stat"><div class="stat-n l">${s.reds ?? 0}</div><div class="stat-k">Red</div></div>
          <div class="stat"><div class="stat-n" style="color:var(--red)">${s.fantasy_points ?? 0}</div><div class="stat-k">Pts</div></div>
        </div>
        ${isAdmin() ? `<button class="btn btn-sm btn-block" style="margin-top:18px" onclick="UI.closeModal();Admin.playerModal(Data.player('${pid}'))">Edit player</button>` : ''}`,
    });
  },

  /* A row of matches to pick from, oldest on the left, like the jornada
     strip in LaLiga Fantasy. items: [{ id, top, pts, off, title }].
     `off` greys a tile (didn't play, or wasn't in this squad yet). */
  _fixtureStrip(items, selected, attr) {
    const max = Math.max(1, ...items.filter(i => typeof i.pts === 'number' && !i.total).map(i => Math.abs(i.pts)));
    return `<div class="fx-strip" role="tablist">${items.map(i => {
      const n = typeof i.pts === 'number' ? i.pts : null;
      const h = n === null || i.total ? 0 : Math.max(n ? 12 : 0, Math.round(Math.abs(n) / max * 100));
      return `<button class="fx-tile${i.id === selected ? ' on' : ''}${i.off ? ' off' : ''}" ${attr}="${i.id}"
          role="tab" aria-selected="${i.id === selected}"${i.title ? ` title="${esc(i.title)}"` : ''}>
        <span class="fx-top">${esc(i.top)}</span>
        <span class="fx-n${n < 0 ? ' neg' : ''}">${n === null ? '&ndash;' : n}</span>
        <span class="fx-bar"><i style="width:${h}%"${n < 0 ? ' class="neg"' : ''}></i></span>
      </button>`;
    }).join('')}</div>`;
  },

  // Keep the selected tile in view (the newest is on the right).
  _scrollStrip(root) {
    const on = root?.querySelector('.fx-tile.on');
    const strip = root?.querySelector('.fx-strip');
    if (on && strip) {
      strip.style.scrollBehavior = 'auto';
      strip.scrollLeft = on.offsetLeft - strip.clientWidth + on.offsetWidth + 24;
      strip.style.scrollBehavior = '';
    }
  },

  // "6 Sep" for a strip tile.
  _shortDate(iso) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  },

  /* The player card. Season totals at the top, then every match this
     season as a strip; pick one and see exactly how he scored in it, line
     by line. A match he didn't play shows 0. */
  async _fantasyPlayerCard(pid, stats) {
    const p = Data.player(pid);
    if (!p) return;
    const s = stats[pid] || {};

    const [rows, fixtures, record] = await Promise.all([
      Data.playerMatchPoints(), Data.playedThisSeason(), Data.playerRecord(pid),
    ]).catch(() => [[], [], { events: {}, played: new Set() }]);

    const byFx = {};
    rows.filter(r => r.player_id === pid).forEach(r => { byFx[r.fixture_id] = r; });
    const games = [...fixtures].reverse();              // oldest first
    const lastComp = fixtures.find(f => UI.isCompetitive(f));
    const runNow = lastComp ? (byFx[lastComp.id]?.streak_run || 0) : 0;
    const streakPts = Object.values(byFx).reduce((a, r) => a + (r.streak_points || 0), 0);
    const nextBonus = Fantasy.streakBonus(runNow + 1);

    let sel = games.length ? games[games.length - 1].id : null;

    const panel = () => {
      const f = games.find(g => g.id === sel);
      if (!f) return '<div class="empty">No matches played yet.</div>';
      const r = byFx[f.id];
      const played = record.played.has(f.id);
      const head = `<div class="fx-head">
          <span class="strong">vs ${esc(f.opponent)}</span>
          <span class="mbm-note">${UI.fmtDate(f.kickoff_at)}${f.competition !== 'League' ? ` &middot; ${esc(f.competition)}` : ''}${
            f.our_score != null ? ` &middot; ${f.our_score}&ndash;${f.their_score}` : ''}</span>
        </div>`;
      if (!r && !played) return `${head}<div class="fx-none">Didn't play. <b>0</b> points.</div>`;

      const bd = Fantasy.breakdown(p.position, record.events[f.id] || {}, played,
        f.competition === 'Friendly', { run: r?.streak_run || 0, bonus: r?.streak_points || 0 });
      const always = new Set(['played', 'goal', 'assist']);
      const total = r ? r.points : bd.total;     // the database is the referee
      return `${head}
        <table class="tbl fx-table">
          <thead><tr><th>What</th><th class="r">Qty</th><th class="r">Pts</th></tr></thead>
          <tbody>${bd.rows.filter(x => always.has(x.key) || x.pts).map(x => `
            <tr><td>${esc(x.label)}</td>
              <td class="r" style="color:var(--ink-3)">${x.qty ?? ''}</td>
              <td class="r ${x.pts < 0 ? 'n' : x.pts > 0 ? 'p' : ''}">${x.pts > 0 ? '+' : ''}${x.pts}</td></tr>`).join('')}
          </tbody>
          <tfoot><tr><td>Match total</td><td></td><td class="r big">${total}</td></tr></tfoot>
        </table>`;
    };

    const strip = () => this._fixtureStrip(games.map(g => {
      const r = byFx[g.id];
      const played = r || record.played.has(g.id);
      return {
        id: g.id, top: this._shortDate(g.kickoff_at),
        pts: played ? (r?.points ?? 0) : 0, off: !played,
        title: `vs ${g.opponent}${played ? '' : ', didn’t play'}`,
      };
    }), sel, 'data-pfx');

    UI.modal({
      title: p.nickname || p.name,
      sub: `#${p.squad_num} · ${p.position}${p.nickname ? ` · ${p.name}` : ''}`,
      body: `
        <div class="pc-season">
          <div><b>${s.fantasy_points ?? 0}</b><span>Pts</span></div>
          <div><b>${s.appearances ?? 0}</b><span>Apps</span></div>
          <div><b>${s.goals ?? 0}</b><span>Goals</span></div>
          <div><b>${s.assists ?? 0}</b><span>Assists</span></div>
          <div><b>${s.clean_sheets ?? 0}</b><span>Clean sh.</span></div>
          <div><b>${s.motm ?? 0}</b><span>MOTM</span></div>
          <div><b>${runNow}</b><span>In a row</span></div>
          <div><b>${streakPts}</b><span>Streak pts</span></div>
        </div>
        ${runNow ? `<div class="card-sub" style="margin:-6px 0 18px">On a run of ${runNow}. Next match is worth ${
          nextBonus ? `+${nextBonus} streak` : 'no streak bonus yet'} if he turns up${
          nextBonus ? '' : `; it starts paying at 3 in a row`}.</div>` : ''}
        <div id="pcStrip">${strip()}</div>
        <div id="pcPanel">${panel()}</div>
        <div id="pcAct"></div>
        ${isAdmin() ? `<button class="btn btn-sm btn-block" style="margin-top:18px" onclick="UI.closeModal();Admin.playerModal(Data.player('${pid}'))">Edit player</button>` : ''}`,
    });

    const wire = () => {
      document.querySelectorAll('#pcStrip [data-pfx]').forEach(b => {
        b.onclick = () => {
          sel = b.dataset.pfx;
          const host = document.getElementById('pcStrip');
          const x = host.querySelector('.fx-strip')?.scrollLeft || 0;
          host.innerHTML = strip();
          const st = host.querySelector('.fx-strip');
          if (st) { st.style.scrollBehavior = 'auto'; st.scrollLeft = x; st.style.scrollBehavior = ''; }
          document.getElementById('pcPanel').innerHTML = panel();
          wire();
        };
      });
    };
    wire();
    this._scrollStrip(document.getElementById('pcStrip'));
    this._cardActions(p, stats);
  },

  /* Transfer buttons on a player card, for whoever has a finished squad.
     In your XI: transfer him out. Not in it: transfer him in, then pick who
     he replaces. Nothing for a locked squad, a half-built one, or a guest. */
  async _cardActions(p, stats) {
    const host = document.getElementById('pcAct');
    if (!host || p.is_guest) return;
    const [team, standings] = await Promise.all([
      Data.myFantasyTeam(), Data.fantasyStandings(),
    ]).catch(() => [null, []]);
    if (!team || team.is_locked || team.squad.length < CONFIG.FANTASY_SQUAD_SIZE) return;
    if (host.isConnected === false) return;     // card closed while loading

    const made = standings.find(r => r.fantasy_team_id === team.id)?.transfers_made ?? 0;
    const cost = Data.nextTransferCost(made);
    const left = Math.max(0, Data.freeTransfers() - made);
    const pts = {};
    Object.values(stats).forEach(r => { pts[r.player_id] = r.fantasy_points; });
    const what = cost ? `costs ${cost} points` : `free, ${left} left`;

    const def = CONFIG.FORMATIONS[team.formation] || [];
    const slot = Object.keys(team.bySlot).find(i => team.bySlot[i] === p.id);
    if (slot != null) {
      host.innerHTML = `<button class="btn btn-block" id="pcOut" style="margin-top:18px">
        Transfer ${esc(p.nickname || p.name)} out <span style="opacity:.6">(${what})</span></button>`;
      document.getElementById('pcOut').onclick = () =>
        this._fantasyTransfer(team, +slot, def[+slot], p, pts, cost);
    } else {
      host.innerHTML = `<button class="btn btn-primary btn-block" id="pcIn" style="margin-top:18px">
        Transfer ${esc(p.nickname || p.name)} in <span style="opacity:.7">(${what})</span></button>`;
      document.getElementById('pcIn').onclick = () => this._fantasyTransferIn(team, p, pts, cost);
    }
  },

  /* Bring a player in from anywhere: pick which of your players in the same
     position makes way. Two steps inside the modal, no browser confirm(). */
  _fantasyTransferIn(team, inP, pts, cost) {
    const def = CONFIG.FORMATIONS[team.formation] || [];
    const options = def.map((base, i) => ({ i, base, p: Data.player(team.bySlot[i]) }))
      .filter(o => o.base.pos === inP.position && o.p);
    let pick = null;
    const inName = esc(inP.nickname || inP.name);

    const paint = () => {
      UI.modal({
        title: `Transfer ${inP.nickname || inP.name} in`,
        sub: cost ? `This swap costs ${cost} points` : 'This one is free',
        body: `
          <div class="note"><strong>Who makes way?</strong>
            ${inName} plays ${inP.position}, so he replaces one of your ${inP.position === 'GK' ? 'keepers' : {
              DEF: 'defenders', MID: 'midfielders', ATT: 'attackers' }[inP.position]}.
            You keep everything the player leaving has earned you; ${inName} scores from the next match.</div>
          ${options.length ? options.map(o => `
            <div class="pick-row ${pick === o.i ? 'picked' : ''}" data-outslot="${o.i}">
              <span class="pick-check">&#10003;</span>
              ${UI.thumb(o.p)}
              <span class="row-num">${o.p.squad_num}</span>
              <span class="pick-name">${esc(o.p.nickname || o.p.name)}</span>
              <span class="mbm-note">${o.base.label}</span>
              <span class="pick-pts">${pts[o.p.id] ?? 0}</span>
            </div>`).join('') : `<div class="empty">Your formation has no ${inP.position} slot. Change formation first.</div>`}`,
        footer: `<button class="btn btn-quiet" data-x>Cancel</button>
          <button class="btn btn-primary" id="tiGo" ${pick == null ? 'disabled' : ''}>${pick == null ? 'Pick who goes'
            : `Swap ${esc(Data.player(team.bySlot[pick]).nickname || Data.player(team.bySlot[pick]).name)} for ${inName}${cost ? ` (&minus;${cost})` : ''}`}</button>`,
      });
      document.querySelector('[data-x]').onclick = () => UI.closeModal();
      document.querySelectorAll('[data-outslot]').forEach(el => {
        el.onclick = () => { pick = +el.dataset.outslot; paint(); };
      });
      const go = document.getElementById('tiGo');
      if (go && pick != null) go.onclick = async () => {
        go.disabled = true;
        try {
          await Data.makeTransfer(team.id, team.bySlot[pick], inP.id, cost, pick);
          UI.closeModal();
          UI.toast(cost ? `${inName} is in. &minus;${cost} points.` : `${inName} is in. Free transfer.`);
          if ((location.hash || '').startsWith('#/fantasy')) Router.render();
        } catch (e) { go.disabled = false; UI.toast(e.message, true); }
      };
    };
    paint();
  },

  /* A team's pitch and XI list, for the whole season or one match. One
     match shows what each player scored THAT day: 0 if he didn't play,
     greyed with a dash if he wasn't in this squad yet. Shared by your own
     team page (pitch still taps to transfer) and everyone else's. */
  async _teamRounds(team, { pts, stats, editable = false, onSlot = null, fixtureId = null, seasonTotal = null }) {
    const [teamRows, playerRows, fixtures] = await Promise.all([
      Data.teamMatchPoints(), Data.playerMatchPoints(), Data.playedThisSeason(),
    ]).catch(() => [[], [], []]);
    const fx = {};
    fixtures.forEach(f => { fx[f.id] = f; });
    const mine = teamRows.filter(r => r.fantasy_team_id === team.id && fx[r.fixture_id])
      .sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at));
    const scored = {};
    playerRows.forEach(r => { scored[`${r.fixture_id}|${r.player_id}`] = r; });
    const picks = team.picks || [];
    const ownedAt = (pid, ko) => picks.some(k => k.player_id === pid
      && new Date(k.acquired_at) <= ko && (!k.released_at || ko < new Date(k.released_at)));

    let sel = (fixtureId && mine.some(m => m.fixture_id === fixtureId)) ? fixtureId
            : mine.length ? mine[mine.length - 1].fixture_id : 'season';

    const view = () => {
      if (sel === 'season') return { pill: null, ptsOf: id => pts[id] ?? 0, note: () => '' };
      const ko = new Date(fx[sel].kickoff_at);
      const info = id => {
        if (!ownedAt(id, ko)) return { text: '&ndash;', dim: true, title: 'Not in this squad for this match', n: null, why: 'Not his yet' };
        const r = scored[`${sel}|${id}`];
        if (!r) return { text: '0 pts', dim: true, title: 'Didn’t play', n: 0, why: 'Didn’t play' };
        return { text: `${r.points} pts`, dim: false, n: r.points, why: r.streak_points ? `${r.streak_run} in a row` : '' };
      };
      return { pill: info, ptsOf: id => info(id).n, note: id => info(id).why, dim: id => info(id).dim };
    };

    const paint = () => {
      const v = view();
      const host = document.getElementById('roundStrip');
      const x = host.querySelector?.('.fx-strip')?.scrollLeft || 0;
      host.innerHTML = this._fixtureStrip([
        ...mine.map(m => ({ id: m.fixture_id, top: this._shortDate(m.kickoff_at), pts: m.points,
                            title: `vs ${fx[m.fixture_id].opponent}` })),
        { id: 'season', top: 'Season', pts: seasonTotal, total: true, title: 'Season total, catch-up and transfers included' },
      ], sel, 'data-round');
      // Re-rendering the strip would snap it back to the start; put it
      // back where the person had scrolled it.
      const st = host.querySelector?.('.fx-strip');
      if (st) { st.style.scrollBehavior = 'auto'; st.scrollLeft = x; st.style.scrollBehavior = ''; }
      const f = fx[sel];
      const m = mine.find(x => x.fixture_id === sel);
      document.getElementById('roundHead').innerHTML = sel === 'season'
        ? `<span class="strong">Whole season</span><span class="mbm-note">each player's total this season</span>${
            seasonTotal != null ? `<span class="fx-sum">${seasonTotal} pts</span>` : ''}`
        : `<span class="strong">vs ${esc(f.opponent)}</span><span class="mbm-note">${UI.fmtDate(f.kickoff_at)}${
            m?.transfer_cost ? ` &middot; &minus;${m.transfer_cost} transfer` : ''}</span><span class="fx-sum">${m?.points ?? 0} pts</span>`;

      Lineup.renderFantasy(document.getElementById('fantasyPitch'), {
        formation: team.formation, picks: team.bySlot, pts, editable,
        onSlot: onSlot || (() => {}),
        onPlayer: p => this._fantasyPlayerCard(p.id, stats),
        pill: v.pill,
      });

      const def = CONFIG.FORMATIONS[team.formation] || [];
      document.getElementById('fantasyList').innerHTML = def.map((base, i) => {
        const p = team.bySlot[i] ? Data.player(team.bySlot[i]) : null;
        const n = p ? v.ptsOf(p.id) : null;
        return `<div class="row${p && v.dim?.(p.id) ? ' dim' : ''}"${p ? ` data-fplayer="${p.id}"` : ''}>
          <span class="row-slot">${base.label}</span>
          ${p ? UI.thumb(p) : ''}
          <span class="row-name">${p ? esc(p.nickname || p.name) : '&mdash;'}</span>
          ${p && v.note(p.id) ? `<span class="mbm-note">${v.note(p.id)}</span>` : ''}
          <span class="pick-pts">${p ? (n === null ? '&ndash;' : n) : ''}</span>
        </div>`;
      }).join('');

      this._wireFantasyPlayers(stats);
      document.querySelectorAll('#roundStrip [data-round]').forEach(b => {
        b.onclick = () => { sel = b.dataset.round; paint(); };
      });
    };

    paint();
    this._scrollStrip(document.getElementById('roundStrip'));
  },

  _wireFantasyPlayers(stats) {
    document.querySelectorAll('[data-fplayer]').forEach(el => {
      el.style.cursor = 'pointer';
      el.onclick = () => this._fantasyPlayerCard(el.dataset.fplayer, stats);
    });
  },

  /* ─────────── STATS ─────────── */
  async stats(app) {
    const board = await Data.leaderboard();
    const tab = location.hash.split('/')[2] || 'goals';
    const sorters = {
      goals:   (a,b) => b.goals - a.goals || b.assists - a.assists,
      assists: (a,b) => b.assists - a.assists || b.goals - a.goals,
      apps:    (a,b) => b.appearances - a.appearances,
      cards:   (a,b) => (b.yellows + b.reds * 2) - (a.yellows + a.reds * 2),
      points:  (a,b) => b.fantasy_points - a.fantasy_points,
    };
    const rows = [...board].sort(sorters[tab] || sorters.goals);
    // MOTM comes off the same result form as everything else (a motm match
    // event), and already pays fantasy points, so this column only counts them.
    const showMotm = tab === 'points';

    app.innerHTML = `
      <section class="section">
        <div class="wrap reveal">
          <div class="label label-red">${esc(State.season?.name || 'Season')}</div>
          <h1 class="h1" style="margin:8px 0 20px">Squad</h1>
          ${this._squadTabs('stats')}

          <div class="sub-tabs">
            ${[['goals','Goals'],['assists','Assists'],['apps','Appearances'],
               ['cards','Discipline'],['points','Fantasy']]
              .map(([k,l]) => `<a class="sub-tab ${tab===k?'active':''}" href="#/stats/${k}">${l}</a>`).join('')}
          </div>

          ${rows.length ? `
          <table class="tbl">
            <thead><tr>
              <th style="width:30px"></th><th>Player</th>
              <th class="r">Apps</th><th class="r">G</th><th class="r">A</th>
              <th class="r">Y</th><th class="r">R</th>
              ${showMotm ? '<th class="r">MOTM</th>' : ''}<th class="r">Pts</th>
            </tr></thead>
            <tbody>${rows.map((r, i) => {
              const p = Data.player(r.player_id);
              return `<tr>
                <td class="rk">${i + 1}</td>
                <td><div style="display:flex;align-items:center;gap:9px">
                  ${p ? UI.thumb(p) : ''}
                  <span class="strong">${esc(r.name)}</span>
                  ${p?.is_guest ? '<span class="tag draft">guest</span>' : ''}
                  <span class="pos ${r.position}">${r.position}</span>
                </div></td>
                <td class="r">${r.appearances}</td>
                <td class="r strong">${r.goals}</td>
                <td class="r strong">${r.assists}</td>
                <td class="r" style="color:var(--amber)">${r.yellows || ''}</td>
                <td class="r" style="color:var(--red)">${r.reds || ''}</td>
                ${showMotm ? `<td class="r">${r.motm || ''}</td>` : ''}
                <td class="r big">${r.fantasy_points}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>` : '<div class="empty">No stats yet. Enter a result first.</div>'}
        </div>
      </section>`;
  },

  /* ─────────── SPONSORS ─────────── */
  async sponsors(app) {
    const lead = CONFIG.SPONSORS.find(s => s.lead) || CONFIG.SPONSORS[0];
    const rest = CONFIG.SPONSORS.filter(s => s !== lead);

    app.innerHTML = `
      <section class="section">
        <div class="wrap reveal">
          <div class="label label-red">Sponsors</div>
          <h1 class="h1" style="margin:8px 0 26px">A quick hello from our sponsors</h1>

          <a class="sponsor-hero" href="${esc(lead.url)}" target="_blank" rel="noopener">
            <img src="${esc(lead.logo)}" alt="${esc(lead.name)}">
          </a>

          <div class="sponsor-letter">
            ${(lead.letter || [lead.blurb]).map(p => `<p>${esc(p)}</p>`).join('')}
            <p class="sponsor-sign">${esc(lead.name)}</p>
          </div>

          <div class="section-head" style="margin-top:44px">
            <h2 class="h2">The family</h2>
          </div>

          <div class="sponsor-rows">
            ${CONFIG.SPONSORS.map(sp => `
              <a class="sponsor-row" href="${esc(sp.url)}" target="_blank" rel="noopener">
                <span class="sponsor-row-mark">
                  ${sp.logo
                    ? `<img src="${esc(sp.logo)}" alt="${esc(sp.name)}">`
                    : `<span class="sponsor-wordmark">${esc(sp.name)}</span>`}
                </span>
                <span class="sponsor-row-body">
                  <strong>${esc(sp.name)}</strong>
                  <span class="sponsor-row-blurb">${esc(sp.blurb || '')}</span>
                </span>
                <span class="sponsor-row-link">${esc(sp.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))} &#8599;</span>
              </a>`).join('')}
          </div>
        </div>
      </section>`;
  },

  /* ─────────── MEDIA ─────────── */
  async media(app) {
    const items = await Data.media();
    app.innerHTML = `
      <section class="section">
        <div class="wrap reveal">
          <div class="label label-red">Photos and video</div>
          <h1 class="h1" style="margin:8px 0 0">Media</h1>
          ${isAdmin() ? `<div class="btn-row" style="margin-top:18px">
            <a class="btn btn-sm btn-primary" href="#/admin/media">Upload</a></div>` : ''}
          <div style="margin-top:34px">
            ${items.length
              ? `<div class="media-grid">${items.map(m => this._media(m)).join('')}</div>`
              : '<div class="empty">Nothing uploaded yet.</div>'}
          </div>
        </div>
      </section>`;
  },

  _media(m) {
    if (m.type === 'video') {
      return `<div class="media-item">
        <div class="vid"><iframe src="${esc(UI.embedUrl(m.url))}" allowfullscreen loading="lazy"></iframe></div>
        ${m.caption ? `<div class="media-cap">${esc(m.caption)}</div>` : ''}
      </div>`;
    }
    return `<div class="media-item">
      <img src="${esc(m.url)}" alt="${esc(m.caption || 'Riverside FC')}" loading="lazy">
      ${m.caption ? `<div class="media-cap">${esc(m.caption)}</div>` : ''}
    </div>`;
  },

  // Renders the venue for a fixture, whether it's a saved home ground
  // or an address typed in for an away game.
  _venue(fx, withNote = true) {
    const name = fx.venue?.name || fx.venue_name;
    if (!name) return '<div class="meta-val">TBC</div>';
    const addr = fx.venue?.map_url
      ? null
      : (fx.venue?.address || fx.venue_address);
    const link = fx.venue?.map_url
      || (addr ? `https://maps.google.com/?q=${encodeURIComponent(addr)}` : null);
    const note = fx.venue?.notes || fx.venue_address;
    return `<div class="meta-val">${link
        ? `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(name)}</a>`
        : esc(name)}</div>
      ${withNote && note ? `<div class="meta-val soft">${esc(note)}</div>` : ''}`;
  },

  // One page per nav item, several views inside it.
  _matchTabs(active) {
    const t = [['fixtures','Fixtures'],['results','Results'],['table','Table']];
    return `<div class="tabs">${t.map(([k,l]) =>
      `<a class="tab ${k === active ? 'active' : ''}" href="#/${k}">${l}</a>`).join('')}</div>`;
  },

  _squadTabs(active) {
    const t = [['squad','Players'],['stats','Stats']];
    return `<div class="tabs">${t.map(([k,l]) =>
      `<a class="tab ${k === active ? 'active' : ''}" href="#/${k}">${l}</a>`).join('')}</div>`;
  },

  /* ─────────── SHARED ─────────── */
  _fxList(list, showResult = false) {
    if (!list.length) return '<div class="empty">Nothing here yet.</div>';
    return `<div class="fx-list">${list.map(fx => {
      const L = UI.resultLetter(fx);
      return `<div class="fx-row" data-fx="${fx.id}">
        <div class="fx-date">
          <strong>${UI.fmtDate(fx.kickoff_at)}</strong>${UI.fmtTime(fx.kickoff_at)}
        </div>
        <div>
          <div class="fx-opp">${esc(fx.opponent)}</div>
          <div class="fx-sub">${esc(fx.venue?.name || fx.venue_name || 'Venue TBC')} &middot; ${fx.home_away}${
            fx.competition && fx.competition !== 'League' ? ` &middot; <span class="comp-tag ${fx.competition.toLowerCase()}">${esc(fx.competition)}</span>` : ''}</div>
        </div>
        <div class="fx-right">
          ${showResult && L
            ? `<span class="fx-score">${fx.our_score}&ndash;${fx.their_score}</span><span class="fx-wdl ${L}">${L}</span>`
            : `<span class="fx-tag">${fx.home_away}</span>`}
        </div>
      </div>`;
    }).join('')}</div>`;
  },

  _bindRows() {
    document.querySelectorAll('[data-fx]').forEach(el => {
      el.onclick = () => { location.hash = `#/fixture/${el.dataset.fx}`; };
    });
  },

  /* ═══════════════════════════════════════════════════════════
     FANTASY
     Three ways in, one game. A guest signs in anonymously and owns
     their team by auth.uid() like anyone else; a Google or magic-link
     account fills in the same form. Scoring keys on the team, never on
     who owns it, so an edit link can move a team between phones
     without touching a single point.
     ═══════════════════════════════════════════════════════════ */

  async fantasy(app, tab = '') {
    // Nothing on this page can be decided early. The guest sign-up form and
    // My team occupy the same slot, so branching before the session is known
    // flashes the wrong one at a signed-in manager; and an empty leaderboard
    // reads as a real answer rather than as "not loaded yet". So: hold a
    // quiet shell until the session has settled AND the first fetch is back,
    // then paint once.
    if (!State.authReady || !State.ready) app.innerHTML = this._fantasyWaiting();
    await Promise.all([Data.whenAuthSettled(), Data.whenBooted()]);

    // Someone who just signed in with the address they used at sign-up gets
    // their team handed back here. Has to settle BEFORE myFantasyTeam(),
    // or we'd read ownership a moment before it moves.
    await Data.claimTeamByEmail();

    const [board, standings, myTeam] = await Promise.all([
      Data.leaderboard(), Data.fantasyStandings(), Data.myFantasyTeam(),
    ]);

    const pts = {};
    board.forEach(r => { pts[r.player_id] = r.fantasy_points; });

    const free = Data.freeTransfers();
    const cost = Data.transferCost();

    // Public, so it comes before the no-team bail-out below.
    if (tab === 'players') return this._fantasyPlayers(app, board, free, cost, !!myTeam);

    // No team at all: the leaderboard is the page, with a way in above it.
    if (!myTeam) {
      const offer = await Data.catchUpOffer().catch(() => null);
      return this._fantasyJoin(app, pts, standings, free, cost, offer);
    }

    if (tab === 'leaderboard') {
      app.innerHTML = `
        ${this._fantasyHeader(free, cost)}
        <section class="section-tight"><div class="wrap reveal">
          ${this._fantasyTabs('leaderboard')}
        </div></section>
        ${this._fantasyTable(standings, myTeam.id)}
        ${this._fantasyRules(free, cost)}`;
      this._wireTeamRows();
      this._wireBoard(standings, myTeam.id);
      return;
    }

    // A team exists but its XI was never picked: finish signing up.
    if (!myTeam.squad.length) return this._fantasyBuild(app, myTeam, pts, standings, free, cost);

    const myRow = standings.find(s => s.fantasy_team_id === myTeam.id);
    // Rank is counted over the teams the leaderboard actually shows, so the
    // two can't disagree about how many managers there are.
    const onBoard = this._onBoard(standings);
    const made  = myRow?.transfers_made ?? 0;
    const left  = Math.max(0, free - made);
    const next  = Data.nextTransferCost(made);

    const shape = Lineup.formationShape(myTeam.formation);
    app.innerHTML = `
      ${this._fantasyHeader(free, cost)}

      <section class="section-tight">
        <div class="wrap reveal">
          ${this._fantasyTabs('team')}

          <div class="section-head">
            <h2 class="h2">${esc(myTeam.name)}</h2>
            <span class="side">${esc(myTeam.formation)} &middot; ${shape.GK}-${shape.DEF}-${shape.MID}-${shape.ATT}</span>
          </div>

          <div class="card-row" style="margin-bottom:24px">
            <div class="card">
              <div class="card-top"><span class="card-label">Net points</span></div>
              <div class="card-n">${myRow?.total_points ?? 0}</div>
              <div class="card-sub">${myRow?.points_earned ?? 0} earned &middot; ${myRow?.transfer_cost ?? 0} spent</div>
            </div>
            <div class="card">
              <div class="card-top"><span class="card-label">Last match</span></div>
              <div class="card-n">${myRow?.gameweek_points ?? 0}</div>
              <div class="card-sub">points, latest game</div>
            </div>
            <div class="card">
              <div class="card-top"><span class="card-label">Free transfers</span></div>
              <div class="card-n">${left}</div>
              <div class="card-sub">of ${free} this season</div>
            </div>
            <div class="card">
              <div class="card-top"><span class="card-label">Rank</span></div>
              <div class="card-n">${onBoard.findIndex(s => s.fantasy_team_id === myTeam.id) + 1 || '&mdash;'}</div>
              <div class="card-sub">of ${onBoard.length} manager${onBoard.length === 1 ? '' : 's'}</div>
            </div>
          </div>
          ${this._catchUpLine(myRow)}
          ${this._pickXiLine(myTeam)}

          ${myTeam.is_locked ? '<div class="note"><strong>Squad locked</strong>No more transfers this season.</div>' : `
          <div class="note"><strong>Tap a player to see his points or transfer him out</strong>
            Or find someone on the Players tab and transfer him in. Swaps are like for like by position.
            ${next ? `Your next transfer costs ${next} points.` : `You have ${left} free transfer${left === 1 ? '' : 's'} left.`}</div>
          <div style="margin:-8px 0 24px"><button class="btn btn-sm" id="changeFormation">Change formation</button></div>`}

          <div id="roundStrip"></div>
          <div class="fx-head round-head" id="roundHead"></div>
          <div class="two-col">
            <div id="fantasyPitch"></div>
            <aside class="aside">
              <div class="label" style="margin-bottom:10px">Your XI</div>
              <div class="rows" id="fantasyList"></div>
              ${await this._transferHistory(myTeam.id)}
            </aside>
          </div>

          <div id="teamSettings" style="margin-top:44px"></div>
        </div>
      </section>

      ${this._fantasyRules(free, cost)}`;

    if (!myTeam.is_locked) {
      const btn = document.getElementById('changeFormation');
      if (btn) btn.onclick = () => this._fantasyFormation(myTeam, made, pts);
    }

    const stats = {};
    board.forEach(r => { stats[r.player_id] = r; });

    // Every tap opens the player's card; transfers start from there.
    await this._teamRounds(myTeam, {
      pts, stats, seasonTotal: myRow?.total_points ?? null,
    });

    // The edit link, findable again on the same browser. Fetched rather than
    // rendered inline because only the owner's session can read that row.
    this._renderTeamSettings(myTeam);
  },

  // Who the leaderboard shows: a full XI, nothing less. A half-built squad
  // isn't playing the game yet, and a catch-up credit would carry it up the
  // table on the strength of players it hasn't picked.
  _onBoard(standings) {
    return standings.filter(s => (s.squad_size ?? 0) === CONFIG.FANTASY_SQUAD_SIZE);
  },

  // Shown to a manager who is short of a full XI. The leaderboard leaves
  // them out until every position is filled, so say so here rather than let
  // them wonder why a team with points on it isn't on the board.
  _pickXiLine(team) {
    const size = team?.squad?.length ?? 0;
    const need = CONFIG.FANTASY_SQUAD_SIZE - size;
    if (need <= 0) return '';
    return `<div class="note" style="margin-bottom:22px"><strong>Pick your XI to appear on the leaderboard.</strong>
      ${size ? `${need} more to go &mdash; fill` : 'Fill'} all eleven positions below and your team joins the table.</div>`;
  },

  // One line under the points summary, on a team that was credited.
  _catchUpLine(row) {
    const n = row?.catch_up_points || 0;
    if (!n) return '';
    return `<p class="card-sub" style="margin:-10px 0 22px">
      Includes ${n} catch-up point${n === 1 ? '' : 's'} for joining after the relaunch.</p>`;
  },

  /* The offer, in words, above the sign-up form. Computed live from the
     same settings row and the same fixture list the database uses, so it
     never promises a number the RPC won't grant. Hidden once the credit
     has decayed to nothing — there is no offer left to make. */
  _catchUpOfferLine(offer) {
    if (!offer || !offer.credit) return '';

    const rest = offer.remaining.length
      ? ' ' + (offer.remaining[0]
          ? `After that it's ${offer.remaining[0]}` +
            (offer.remaining.slice(1).some(n => n === 0) ? ', then nothing.' : '.')
          : 'After that, nothing.')
      : '';

    const when = offer.nextFixture
      ? `${new Date(offer.nextFixture.kickoff_at)
            .toLocaleDateString('en-GB', { weekday: 'long' })}'s game`
      : 'the next game';

    return `<div class="note" style="margin-bottom:22px"><strong>Joining late?</strong>
      Join before ${esc(when)} and you start on ${offer.credit} points.${esc(rest)}</div>`;
  },

  /* ─────────── NO TEAM YET: CREATE, OR JUST WATCH ─────────── */
  _fantasyJoin(app, pts, standings, free, cost, offer = null) {
    app.innerHTML = `
      ${this._fantasyHeader(free, cost)}
      <section class="section-tight">
        <div class="wrap-narrow reveal">
          ${this._catchUpOfferLine(offer)}
          ${this._createForm()}
        </div>
      </section>
      <section class="section-tight" style="padding-bottom:0">
        <div class="wrap reveal">${this._fantasyTabs('leaderboard', false)}</div>
      </section>
      ${this._fantasyTable(standings)}
      ${this._fantasyRules(free, cost)}`;

    this._wireCreateForm();
    this._wireTeamRows();
    this._wireBoard(standings);
  },

  /* The whole sign-up. No account needed; Google and email are alternatives
     to the anonymous path, not extra steps in front of it. */
  _createForm() {
    const signedIn = isSignedIn() && !isGuest();
    return `
      <div class="section-head"><h2 class="h2">Create your team</h2>
        <span class="side">${signedIn ? 'Signed in' : 'No account needed'}</span></div>

      <div class="field">
        <label>Your name</label>
        <input class="input" id="ctManager" placeholder="e.g. Totti" autocomplete="name"
          value="${esc(signedIn ? (State.profile?.display_name || '') : '')}">
      </div>
      <div class="field">
        <label>Team name</label>
        <input class="input" id="ctTeam" placeholder="e.g. Poppa Bears" autocomplete="off">
      </div>
      <div class="field">
        <label>Email</label>
        <input class="input" type="email" id="ctEmail" placeholder="you@example.com" autocomplete="email"
          value="${esc(signedIn ? (State.session?.user?.email || '') : '')}">
        <div class="card-sub">Sign in with this email on any device to get your team back.</div>
      </div>

      <button class="btn btn-primary btn-block" id="ctGo" style="margin-top:4px">Create my team</button>

      ${signedIn ? '' : `
      <div class="or-line"><span>or sign in first</span></div>
      <div class="btn-row">
        <button class="btn" id="ctGoogle">Continue with Google</button>
        <button class="btn" id="ctMagic">Sign in with email</button>
      </div>
      <div class="note" style="margin-top:20px">
        <strong>Signing in is optional</strong>
        Create a team without an account and we'll give you a private edit
        link instead. Keep that link and your team follows you to any phone.
      </div>`}

      <div id="ctError"></div>`;
  },

  _wireCreateForm() {
    const manager = document.getElementById('ctManager');
    const team    = document.getElementById('ctTeam');
    const email   = document.getElementById('ctEmail');
    const go      = document.getElementById('ctGo');
    if (!go) return;

    const submit = async () => {
      const managerName = manager.value.trim();
      const teamName    = team.value.trim();
      const addr        = email.value.trim();
      if (!managerName) return UI.toast('Enter your name', true);
      if (!teamName)    return UI.toast('Give your team a name', true);
      if (!addr || !addr.includes('@')) return UI.toast('Enter a valid email', true);

      go.disabled = true;
      go.textContent = 'Creating...';
      let created = null;
      try {
        created = await Data.createTeamAccount({ managerName, teamName, email: addr });
      } catch (e) {
        this._createError(e, addr);
      } finally {
        // In finally, not in the catch: the button has to come back whatever
        // failed, including a sign-in that never returned a session. On the
        // success path the render below replaces the whole form anyway, so
        // writing to a detached node costs nothing.
        go.disabled = false;
        go.textContent = 'Create my team';
      }

      if (!created) return;
      UI.refreshAuthUI();
      // Straight into the squad picker, with the edit link pinned above it.
      await Router.render({ editToken: created.edit_token });
    };

    go.onclick = submit;
    [manager, team, email].forEach(el => el.onkeydown = e => { if (e.key === 'Enter') submit(); });

    const g = document.getElementById('ctGoogle');
    if (g) g.onclick = async () => {
      g.disabled = true; g.textContent = 'Opening Google...';
      Data.rememberReturn('#/fantasy');
      try { await Data.signInWithGoogle(); }
      catch (e) { g.disabled = false; g.textContent = 'Continue with Google'; UI.toast(e.message, true); }
    };

    const m = document.getElementById('ctMagic');
    if (m) m.onclick = async () => {
      const addr = email.value.trim();
      if (!addr || !addr.includes('@')) return UI.toast('Enter your email first', true);
      m.disabled = true; m.textContent = 'Sending...';
      Data.rememberReturn('#/fantasy');
      try {
        await Data.signIn(addr, manager.value.trim() || null);
        UI.toast('Check your email for the link');
        m.textContent = 'Link sent';
      } catch (e) {
        m.disabled = false; m.textContent = 'Sign in with email';
        UI.toast(e.message || 'Could not send that link', true);
      }
    };
  },

  // Failures worth spelling out under the form rather than in a toast.
  // "That email already has a team" is the useful one: it usually means the
  // same person coming back on a new phone, so it offers the way in rather
  // than just refusing.
  _createError(e, addr = '') {
    const box = document.getElementById('ctError');
    const msg = e?.code === 'BPE01'
      ? `<div class="note"><strong>That email already has a team.</strong>
           Sign in with it and we'll hand the team straight back.</div>
         <button class="btn btn-primary btn-block" id="ctRecover"
           style="margin-top:12px">Send me a sign-in link</button>`
      : e?.code === 'BPE02'
      ? `<div class="note"><strong>You already have a team this season.</strong>
           Reload the page to open it.</div>`
      : `<div class="note"><strong>That didn't work</strong>${esc(e?.message || 'Please try again.')}</div>`;

    if (!box) return UI.toast(e?.message || 'That did not work', true);
    box.innerHTML = `<div style="margin-top:20px">${msg}</div>`;

    const rec = document.getElementById('ctRecover');
    if (rec) rec.onclick = async () => {
      rec.disabled = true;
      rec.textContent = 'Sending...';
      // On the way back, Views.fantasy calls claim_fantasy_team_by_email()
      // and the team is theirs again before the page paints.
      Data.rememberReturn('#/fantasy');
      try {
        await Data.signIn(addr, null);
        rec.textContent = 'Link sent — check your email';
      } catch (err) {
        rec.disabled = false;
        rec.textContent = 'Send me a sign-in link';
        UI.toast(err.message || 'Could not send that link', true);
      }
    };
  },

  /* ─────────── EDIT LINK ─────────── */
  _editLinkPanel(token, { fresh = false } = {}) {
    const url = Data.editLink(token);
    return `
      <div class="edit-link ${fresh ? 'fresh' : ''}">
        <div class="label label-red">Your edit link</div>
        <p class="edit-link-lede">Backup if email doesn't reach you.
          Signing in with your email works too.</p>
        <div class="edit-link-row">
          <input class="input" id="editLinkInput" readonly value="${esc(url)}"
            onclick="this.select()">
          <button class="btn btn-primary" id="copyEditLink">Copy</button>
        </div>
        ${fresh ? '' : `<div class="card-sub" style="margin-top:8px">Anyone who opens this link
          takes over editing your team, so keep it to yourself.</div>`}
      </div>`;
  },

  _wireEditLink() {
    const btn = document.getElementById('copyEditLink');
    if (!btn) return;
    btn.onclick = async () => {
      const ok = await UI.copy(document.getElementById('editLinkInput').value);
      btn.textContent = ok ? 'Copied' : 'Select it';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1800);
    };
  },

  async _renderTeamSettings(team) {
    const host = document.getElementById('teamSettings');
    if (!host) return;
    const token = await Data.editToken(team.id);
    if (!token) return;            // not the owner, nothing to show
    host.innerHTML = `
      <div class="section-head"><h2 class="h2">Team settings</h2>
        <span class="side">Only you can see this</span></div>
      ${this._editLinkPanel(token)}
      ${isGuest() ? `<div class="note" style="margin-top:18px">
        <strong>You're playing as a guest</strong>
        This team lives in this browser. Clear your data, or switch phone, and
        the edit link above is how you get back in.</div>` : ''}`;
    this._wireEditLink();
  },

  /* ─────────── CLAIM: #/fantasy/claim/&lt;token&gt; ─────────── */
  async fantasyClaim(app, token) {
    app.innerHTML = `<section class="section"><div class="wrap-narrow">
      <div class="label label-red">Fantasy</div>
      <h1 class="h1" style="margin:8px 0 16px">Opening your team</h1>
      <p class="lede">One moment.</p>
    </div></section>`;

    if (!token) return this._claimFailed(app, 'That link is missing its code.');

    try {
      await Data.claimTeam(token);
      UI.refreshAuthUI();
      UI.toast('Team opened');
      // Ownership moved; go and draw it as the owner's page.
      location.hash = '#/fantasy';
    } catch (e) {
      const msg = e?.code === 'BPT01'
        ? "That edit link isn't valid. It may have been mistyped, or the team was deleted."
        : e?.code === 'BPE02'
        ? 'This browser already runs another team this season. Open the link in a private window, or sign out first.'
        : (e?.message || 'That link could not be opened.');
      this._claimFailed(app, msg);
    }
  },

  _claimFailed(app, msg) {
    app.innerHTML = `
      <section class="section"><div class="wrap-narrow reveal">
        <div class="label label-red">Fantasy</div>
        <h1 class="h1" style="margin:8px 0 16px">That link didn't work</h1>
        <div class="note"><strong>${esc(msg)}</strong>
          Ask a captain to look it up, or start a new team.</div>
        <a class="btn btn-primary" href="#/fantasy">Back to Fantasy</a>
      </div></section>`;
  },

  /* ─────────── ANY TEAM, READ-ONLY: #/fantasy/team/&lt;id&gt; ─────────── */
  async fantasyTeam(app, id, fixtureId = null) {
    const [team, board, standings] = await Promise.all([
      Data.publicFantasyTeam(id), Data.leaderboard(), Data.fantasyStandings(),
    ]);

    if (!team) {
      app.innerHTML = `<section class="section"><div class="wrap-narrow reveal">
        <div class="label label-red">Fantasy</div>
        <h1 class="h1" style="margin:8px 0 16px">No such team</h1>
        <div class="note"><strong>That team isn't here</strong>It may have been deleted.</div>
        <a class="btn btn-primary" href="#/fantasy/leaderboard">Back to the leaderboard</a>
      </div></section>`;
      return;
    }

    const pts = {};
    board.forEach(r => { pts[r.player_id] = r.fantasy_points; });
    const row   = standings.find(s => s.fantasy_team_id === team.id);
    const rank  = standings.findIndex(s => s.fantasy_team_id === team.id) + 1;
    const mine  = isSignedIn() && team.owner_id === State.session.user.id;
    const shape = Lineup.formationShape(team.formation);
    const who   = team.manager_name || row?.owner_name || 'this manager';

    app.innerHTML = `
      <section class="section-tight">
        <div class="wrap reveal">
          <div class="label label-red">${esc(State.season?.name || 'Season')}</div>
          <h1 class="h1" style="margin:8px 0 6px">${esc(team.name)}</h1>
          <p class="lede">This is ${esc(who)}'s team.
            ${mine ? '' : 'Read only: only its manager can change it.'}</p>

          <div class="sub-tabs">
            <a class="sub-tab" href="#/fantasy/leaderboard">&#8592; Leaderboard</a>
            ${mine ? '<a class="sub-tab active" href="#/fantasy">Edit my team</a>' : ''}
          </div>

          <div class="card-row" style="margin-bottom:24px">
            <div class="card">
              <div class="card-top"><span class="card-label">Net points</span></div>
              <div class="card-n">${row?.total_points ?? 0}</div>
              <div class="card-sub">${row?.points_earned ?? 0} earned &middot; ${row?.transfer_cost ?? 0} spent</div>
            </div>
            <div class="card">
              <div class="card-top"><span class="card-label">Last match</span></div>
              <div class="card-n">${row?.gameweek_points ?? 0}</div>
              <div class="card-sub">points, latest game</div>
            </div>
            <div class="card">
              <div class="card-top"><span class="card-label">Rank</span></div>
              <div class="card-n">${rank || '&mdash;'}</div>
              <div class="card-sub">of ${standings.length} manager${standings.length === 1 ? '' : 's'}</div>
            </div>
            <div class="card">
              <div class="card-top"><span class="card-label">Shape</span></div>
              <div class="card-n" style="font-size:1.5rem">${esc(team.formation)}</div>
              <div class="card-sub">${shape.GK} keeper, ${shape.DEF} at the back, ${shape.ATT} up top</div>
            </div>
          </div>
          ${this._catchUpLine(row)}

          <div id="roundStrip"></div>
          <div class="fx-head round-head" id="roundHead"></div>
          <div class="two-col">
            <div id="fantasyPitch"></div>
            <aside class="aside">
              <div class="label" style="margin-bottom:10px">The XI</div>
              <div class="rows" id="fantasyList"></div>
            </aside>
          </div>
        </div>
      </section>`;

    const stats = {};
    board.forEach(r => { stats[r.player_id] = r; });

    // Read only: tapping a player opens his card. Defaults to the latest
    // match, or the one the leaderboard link pointed at.
    await this._teamRounds(team, { pts, stats, fixtureId, seasonTotal: row?.total_points ?? null });
  },

  /* ─────────── PLAYERS: THE MARKET ───────────
     Who is worth having, and who everybody already has. Public: you
     don't need a team to look at it. */
  async _fantasyPlayers(app, board, free, cost, hasTeam) {
    const [owned, gw, perMatch, played, standings] = await Promise.all([
      Data.ownershipCounts(), Data.lastGameweekPoints(),
      Data.playerMatchPoints(), Data.playedThisSeason(), Data.fantasyStandings(),
    ]);
    const last = this._lastHeader(played[0]);
    const nTeams = standings.length;

    const filter = location.hash.split('/')[3] || 'all';
    const stats  = {};
    board.forEach(r => { stats[r.player_id] = r; });

    // Streaks, from the same per-match rows the scoring uses. "Now" is the
    // run he's on: alive only if he made the latest league or cup match.
    const lastComp = played.find(f => UI.isCompetitive(f));
    const streakPts = {}, streakNow = {};
    perMatch.forEach(r => {
      streakPts[r.player_id] = (streakPts[r.player_id] || 0) + (r.streak_points || 0);
      if (lastComp && r.fixture_id === lastComp.id) streakNow[r.player_id] = r.streak_run || 0;
    });

    // Guests are ringers, not squad members, and can't be picked.
    const rows = squadOnly()
      .map(p => {
        const s = stats[p.id] || {};
        return {
          p,
          pts: s.fantasy_points ?? 0, last: gw[p.id] ?? 0,
          streak: streakNow[p.id] || 0, spts: streakPts[p.id] || 0,
          apps: s.appearances ?? 0, goals: s.goals ?? 0, assists: s.assists ?? 0,
          cs: s.clean_sheets ?? 0, motm: s.motm ?? 0, yel: s.yellows ?? 0, red: s.reds ?? 0,
          owners: owned[p.id] ?? 0,
        };
      })
      .filter(r => filter === 'all' || r.p.position === filter);

    const teams = Object.values(owned).length
      ? Math.max(...Object.values(owned)) : 0;

    // [key, header, tooltip]. Pts first after the name so it stays in view
    // on a phone; everything else scrolls sideways inside the table.
    const COLS = [
      ['pts',     'Pts',    'Fantasy points this season'],
      ['last',    last.label, last.tip],
      ['streak',  'Streak', 'Matches in a row he has turned up to, right now'],
      ['spts',    'Str pts','Points earned from streaks this season'],
      ['apps',    'Apps',   'Appearances'],
      ['goals',   'G',      'Goals'],
      ['assists', 'A',      'Assists'],
      ['cs',      'CS',     'Clean sheets'],
      ['motm',    'MOTM',   'Man of the match'],
      ['yel',     'YC',     'Yellow cards'],
      ['red',     'RC',     'Red cards'],
      ['owners',  'Owned by', 'How many fantasy teams have him right now'],
    ];
    let sortKey = 'pts';

    const cell = (r, k) => {
      const v = r[k];
      if (k === 'pts') return `<td class="r big">${v}</td>`;
      if (k === 'last') return `<td class="r" style="color:${v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--ink-3)'}">${v || '&ndash;'}</td>`;
      if (k === 'red' || k === 'yel') return `<td class="r" style="color:${v ? (k === 'red' ? 'var(--red)' : 'var(--amber)') : 'var(--ink-3)'}">${v || '&ndash;'}</td>`;
      if (k === 'owners') return `<td class="r" style="color:var(--ink-3)">${
        v ? `${v}${nTeams ? `<span style="opacity:.6">/${nTeams}</span>` : ''}` : '&ndash;'}</td>`;
      return `<td class="r" style="${v ? '' : 'color:var(--ink-3)'}">${v || '&ndash;'}</td>`;
    };

    const body = () => {
      const sorted = [...rows].sort((a, b) =>
        b[sortKey] - a[sortKey] || b.pts - a.pts || a.p.squad_num - b.p.squad_num);
      return sorted.map((r, i) => `
              <tr data-fplayer="${r.p.id}" style="cursor:pointer">
                <td class="rk">${i + 1}</td>
                <td><div style="display:flex;align-items:center;gap:9px">
                  ${UI.thumb(r.p)}
                  <span class="strong">${esc(r.p.nickname || r.p.name)}</span>
                  <span class="pos ${r.p.position}">${r.p.position}</span>
                </div></td>
                ${COLS.map(([k]) => cell(r, k)).join('')}
              </tr>`).join('');
    };

    app.innerHTML = `
      ${this._fantasyHeader(free, cost)}

      <section class="section-tight">
        <div class="wrap reveal">
          ${this._fantasyTabs('players', hasTeam)}

          <div class="section-head">
            <h2 class="h2">Players</h2>
            <span class="side">${rows.length} player${rows.length === 1 ? '' : 's'}</span>
          </div>

          <div class="sub-tabs">
            ${[['all', 'All'], ['GK', 'Keepers'], ['DEF', 'Defenders'],
               ['MID', 'Midfielders'], ['ATT', 'Attackers']]
              .map(([k, label]) => `<a class="sub-tab ${filter === k ? 'active' : ''}"
                href="#/fantasy/players/${k}">${label}</a>`).join('')}
          </div>

          ${rows.length ? `
          <div class="lt-scroll">
          <table class="tbl players-tbl">
            <thead><tr>
              <th style="width:30px"></th><th>Player</th>
              ${COLS.map(([k, label, tip]) =>
                `<th class="r sortable${k === sortKey ? ' on' : ''}" data-sort="${k}" title="${tip}">${label}</th>`).join('')}
            </tr></thead>
            <tbody id="playersBody">${body()}</tbody>
          </table>
          </div>
          <div class="card-sub" style="margin-top:12px">
            Tap a column to sort by it, or a player to see where his points came from.
            The ${esc(last.label)} column is his score in the most recent match. Streak is how many league or cup
            matches in a row he's turned up to right now; Str pts is what streaks have earned him this season.
            Owned by is how many of the ${nTeams || ''} fantasy teams have him${teams ? '' : '; nobody has picked a squad yet'}.
          </div>`
          : '<div class="empty">Nobody in the squad plays there.</div>'}
        </div>
      </section>

      ${this._fantasyRules(free, cost)}`;

    const wireRows = () => {
      document.querySelectorAll('[data-fplayer]').forEach(el => {
        el.onclick = () => this._fantasyPlayerCard(el.dataset.fplayer, stats);
      });
    };
    document.querySelectorAll('[data-sort]').forEach(th => {
      th.onclick = () => {
        sortKey = th.dataset.sort;
        document.querySelectorAll('[data-sort]').forEach(x =>
          x.classList.toggle('on', x.dataset.sort === sortKey));
        document.getElementById('playersBody').innerHTML = body();
        wireRows();
      };
    });
    wireRows();
  },

  /* ─────────── BUILD THE XI ───────────
     The team row already exists by the time we get here: signing up
     creates it, picking the squad fills it in. */
  async _fantasyBuild(app, team, pts, standings, free, cost) {
    let formation = team.formation || '4-4-2';
    let picks = {};
    // The last formation switch, so it can be taken back. Cleared the
    // moment a pick changes, because by then "undo" would throw away work
    // the manager has done since.
    let notice = null;
    // Straight from sign-up it arrives in hand; on a reload we fetch it, so
    // refreshing mid-pick never loses sight of the only key to the team.
    const flashToken = Router.flash?.editToken || null;
    const token = flashToken || await Data.editToken(team.id);

    const render = () => {
      const shape  = Lineup.formationShape(formation);
      const filled = Object.keys(picks).length;
      const total  = (CONFIG.FORMATIONS[formation] || []).length;

      app.innerHTML = `
        ${this._fantasyHeader(free, cost)}

        <section class="section-tight">
          <div class="wrap reveal">
            ${flashToken ? this._editLinkPanel(flashToken, { fresh: true }) : ''}
            ${this._fantasyTabs('team')}

            <div class="section-head">
              <h2 class="h2">${esc(team.name)}</h2>
              <span class="side" id="fillCount">${filled} / ${total}</span>
            </div>

            <div class="note"><strong>Your first squad is free</strong>
              Pick a formation, then fill every position. After that you get
              ${free} free transfers, and each swap beyond those costs ${cost} points.</div>

            <div class="field">
              <label>Formation</label>
              <div class="form-grid" id="fFormation">
                ${Object.keys(CONFIG.FORMATIONS).map(f =>
                  `<button class="btn btn-sm ${f === formation ? 'btn-primary' : ''}" data-f="${f}">${f}</button>`).join('')}
              </div>
              <div class="card-sub" style="margin-top:6px">
                Needs ${shape.GK} keeper, ${shape.DEF} defenders, ${shape.MID} midfielders, ${shape.ATT} attacker${shape.ATT === 1 ? '' : 's'}
              </div>
              ${notice ? `<div class="switch-notice">
                <span>${esc(notice.text)}</span>
                <button class="mini" id="undoSwitch">Undo</button>
              </div>` : ''}
            </div>

            <div class="two-col" style="margin-top:20px">
              <div id="fantasyPitch"></div>
              <aside class="aside">
                <div class="label" style="margin-bottom:10px">Your XI</div>
                <div class="rows" id="fantasyList"></div>
                <button class="btn btn-primary btn-block" id="saveFt" style="margin-top:16px">
                  Confirm squad</button>
              </aside>
            </div>

            ${token && !flashToken ? `
            <div class="section-head" style="margin-top:48px">
              <h2 class="h2">Team settings</h2>
              <span class="side">Only you can see this</span>
            </div>
            ${this._editLinkPanel(token)}` : ''}
          </div>
        </section>

        ${this._fantasyRules(free, cost)}`;

      if (token) this._wireEditLink();

      // Any change to the squad retires the undo: restoring the old picks
      // from here would silently bin whatever was chosen since the switch.
      const afterPick = () => { notice = null; render(); };

      Lineup.renderFantasy(document.getElementById('fantasyPitch'), {
        formation, picks, pts, editable: true,
        onSlot: (i, base) => this._fantasyPick(i, base, picks, pts, afterPick),
      });

      const def = CONFIG.FORMATIONS[formation] || [];
      document.getElementById('fantasyList').innerHTML = def.map((base, i) => {
        const p = picks[i] ? Data.player(picks[i]) : null;
        return `<div class="row" data-slot="${i}" style="cursor:pointer">
          <span class="row-slot">${base.label}</span>
          ${p ? UI.thumb(p) : `<span class="thumb-ph">${base.pos[0]}</span>`}
          <span class="row-name ${p ? '' : 'muted'}">${p ? esc(p.nickname || p.name) : 'Pick a ' + base.pos}</span>
          <span class="pick-pts">${p ? (pts[p.id] ?? 0) : ''}</span>
        </div>`;
      }).join('');

      document.querySelectorAll('[data-slot]').forEach(el => el.onclick = () => {
        const i = parseInt(el.dataset.slot);
        this._fantasyPick(i, def[i], picks, pts, afterPick);
      });

      // Switching shape carries the squad across instead of emptying it, so
      // there is nothing to warn about and nothing to confirm. Whatever the
      // new shape has no room for is named in the notice, and Undo puts the
      // old formation and the old picks back exactly as they were.
      //
      // Nothing here costs a transfer: this is the first squad, and it is
      // not saved until Confirm.
      document.querySelectorAll('[data-f]').forEach(b => b.onclick = () => {
        const to = b.dataset.f;
        if (to === formation) return;
        const before = { formation, picks: { ...picks } };
        const res = Fantasy.remapFormation(picks, formation, to);
        formation = to;
        picks = res.picks;
        notice = {
          text: Fantasy.switchNotice(to, res.dropped, id => Data.playerName(id)),
          before,
        };
        render();
      });

      const undo = document.getElementById('undoSwitch');
      if (undo) undo.onclick = () => {
        formation = notice.before.formation;
        picks     = notice.before.picks;
        notice    = null;
        render();
      };

      const save = document.getElementById('saveFt');
      save.onclick = async () => {
        if (Object.keys(picks).length !== total)
          return UI.toast(`Fill all ${total} positions`, true);
        save.textContent = 'Saving...'; save.disabled = true;
        try {
          await Data.saveFirstSquad(team.id, formation, picks);
          UI.toast('Squad locked in. Good luck.');
          Router.render();
        } catch (e) {
          save.textContent = 'Confirm squad'; save.disabled = false;
          UI.toast(e.message, true);
        }
      };
    };
    render();
  },

  /* Pick a player for one slot. Only shows players of that position. */
  _fantasyPick(i, base, picks, pts, done) {
    const taken = new Set(Object.values(picks));
    const eligible = squadOnly()
      .filter(p => p.position === base.pos && !taken.has(p.id))
      .sort((a, b) => (pts[b.id] ?? 0) - (pts[a.id] ?? 0) || a.squad_num - b.squad_num);

    const names = { GK: 'goalkeeper', DEF: 'defender', MID: 'midfielder', ATT: 'attacker' };

    UI.modal({
      title: `Pick a ${names[base.pos]}`,
      sub: `${base.label} &middot; ${eligible.length} available`,
      body: eligible.length
        ? `<input class="input search-box" id="fSearch" placeholder="Search name or number" autocomplete="off">
           <div id="fResults">${eligible.map(p => `
             <div class="pick-row" data-fp="${p.id}" data-search="${
               esc((p.name + ' ' + (p.nickname || '') + ' ' + p.squad_num).toLowerCase())}">
               ${UI.thumb(p)}
               <span class="row-num">${p.squad_num}</span>
               <span class="pick-name">${esc(p.nickname || p.name)}</span>
               <span class="pick-pts">${pts[p.id] ?? 0}</span>
             </div>`).join('')}</div>`
        : `<div class="empty">No ${names[base.pos]}s left to pick.</div>`,
      footer: picks[i] ? `<button class="btn btn-quiet" data-clear>Remove</button>` : '',
    });

    document.querySelector('[data-clear]')?.addEventListener('click', () => {
      delete picks[i]; UI.closeModal(); done();
    });

    UI.wireSearch('fSearch', 'fResults', eligible, 'data-fp', el => {
      picks[i] = el.dataset.fp;
      UI.closeModal();
      done();
    });
  },

  /* Transfer a player out of an existing squad, same position only */
  /* Change formation on a saved squad. Pick a shape from the club's list,
     then who makes way in every line that shrinks and who comes in for
     every line that grows. Each of those swaps is a transfer and costs
     exactly what a normal transfer would: the free ones first, then the
     season's per-transfer cost. A same-numbers switch (4-5-1 to 4-2-3-1)
     moves nobody and is free. */
  _fantasyFormation(team, made, pts) {
    const LINE = { GK: 'goal', DEF: 'defence', MID: 'midfield', ATT: 'attack' };
    const PLURAL = { GK: 'keeper', DEF: 'defender', MID: 'midfielder', ATT: 'attacker' };
    const st = { to: null, leaving: {}, joining: {} };
    const taken = new Set(Object.values(team.bySlot));
    const name = p => esc(p.nickname || p.name);
    const def = CONFIG.FORMATIONS[team.formation] || [];
    const current = pos => def.map((s, i) => s.pos === pos ? team.bySlot[i] : null)
      .filter(Boolean).map(id => Data.player(id)).filter(Boolean);

    const paint = () => {
      const delta = st.to ? Fantasy.lineDelta(team.formation, st.to) : {};
      const shrink = Object.keys(LINE).filter(k => delta[k] < 0);
      const grow   = Object.keys(LINE).filter(k => delta[k] > 0);
      const n = grow.reduce((a, k) => a + delta[k], 0);
      const costs = Array.from({ length: n }, (_, i) => Data.nextTransferCost(made + i));
      const total = costs.reduce((a, c) => a + c, 0);
      const ready = st.to
        && shrink.every(k => (st.leaving[k] || []).length === -delta[k])
        && grow.every(k => (st.joining[k] || []).length === delta[k]);

      const row = (p, on, attr) => `
        <div class="pick-row ${on ? 'picked' : ''}" ${attr}="${p.id}">
          <span class="pick-check">&#10003;</span>
          ${UI.thumb(p)}
          <span class="row-num">${p.squad_num}</span>
          <span class="pick-name">${name(p)}</span>
          <span class="pick-pts">${pts[p.id] ?? 0}</span>
        </div>`;

      const body = `
        <div class="form-grid" id="ffPick">
          ${Object.keys(CONFIG.FORMATIONS).filter(f => f !== team.formation).map(f =>
            `<button class="btn btn-sm ${f === st.to ? 'btn-primary' : ''}" data-f="${f}">${f}</button>`).join('')}
        </div>
        ${!st.to ? `<div class="card-sub" style="margin-top:12px">You're playing ${esc(team.formation)}. Pick the shape you want.</div>` : `
          ${!n ? `<div class="note" style="margin-top:16px"><strong>Nobody has to move</strong>
              Same number in every line, so this one is free.</div>` : ''}
          ${shrink.map(k => `
            <div class="label" style="margin:20px 0 6px">Who leaves ${LINE[k]}? Pick ${-delta[k]}</div>
            ${current(k).map(p => row(p, (st.leaving[k] || []).includes(p.id), 'data-out')).join('')}`).join('')}
          ${grow.map(k => {
            const pool = squadOnly().filter(p => p.position === k && !taken.has(p.id))
              .sort((a, b) => (pts[b.id] ?? 0) - (pts[a.id] ?? 0) || a.squad_num - b.squad_num);
            return `
            <div class="label" style="margin:20px 0 6px">Who joins ${LINE[k]}? Pick ${delta[k]} ${PLURAL[k]}${delta[k] > 1 ? 's' : ''}</div>
            ${pool.length ? pool.map(p => row(p, (st.joining[k] || []).includes(p.id), 'data-in')).join('')
              : `<div class="empty">No ${PLURAL[k]}s left to pick.</div>`}`;
          }).join('')}
          ${n ? `<div class="note" style="margin-top:18px"><strong>${n} transfer${n > 1 ? 's' : ''}, ${
              total ? `&minus;${total} points` : 'free'}</strong>
            ${costs.map((c, i) => `Swap ${i + 1}: ${c ? `&minus;${c}` : 'free'}`).join(' &middot; ')}.
            You keep everything the players leaving have earned you.</div>` : ''}`}`;

      UI.modal({
        title: 'Change formation', sub: `Currently ${team.formation}`, wide: true, body,
        footer: `<button class="btn btn-quiet" data-x>Cancel</button>
                 <button class="btn btn-primary" id="ffSave" ${ready ? '' : 'disabled'}>${
                   !st.to ? 'Switch' : `Switch to ${st.to}${total ? ` (&minus;${total})` : ''}`}</button>`,
      });

      document.querySelector('[data-x]').onclick = () => UI.closeModal();
      document.querySelectorAll('#ffPick [data-f]').forEach(b => {
        b.onclick = () => { st.to = b.dataset.f; st.leaving = {}; st.joining = {}; paint(); };
      });
      const toggle = (bag, pos, id, max) => {
        const list = bag[pos] ||= [];
        const at = list.indexOf(id);
        if (at >= 0) list.splice(at, 1);
        else { if (list.length >= max) list.shift(); list.push(id); }
        paint();
      };
      document.querySelectorAll('[data-out]').forEach(el => {
        const p = Data.player(el.dataset.out);
        el.onclick = () => toggle(st.leaving, p.position, p.id, -delta[p.position]);
      });
      document.querySelectorAll('[data-in]').forEach(el => {
        const p = Data.player(el.dataset.in);
        el.onclick = () => toggle(st.joining, p.position, p.id, delta[p.position]);
      });

      const save = document.getElementById('ffSave');
      if (save && ready) save.onclick = async () => {
        const leaving = shrink.flatMap(k => st.leaving[k]);
        const joining = grow.flatMap(k => st.joining[k]);
        const next = Fantasy.reshape(team.bySlot, team.formation, st.to, leaving, st.joining);
        if (!next) return UI.toast('Those picks don’t fit the new shape.', true);
        const pairs = leaving.map((out, i) => ({ out, in: joining[i], cost: costs[i] }));
        save.disabled = true;
        try {
          await Data.changeFormation(team.id, st.to, next, pairs);
          UI.closeModal();
          UI.toast(`Now playing ${st.to}${total ? `. &minus;${total} points.` : '.'}`);
          Router.render();
        } catch (e) { save.disabled = false; UI.toast(e.message, true); }
      };
    };

    paint();
  },

  _fantasyTransfer(team, i, base, outPlayer, pts, cost) {
    const taken = new Set(Object.values(team.bySlot));
    const eligible = squadOnly()
      .filter(p => p.position === base.pos && !taken.has(p.id))
      .sort((a, b) => (pts[b.id] ?? 0) - (pts[a.id] ?? 0) || a.squad_num - b.squad_num);
    const outName = esc(outPlayer.nickname || outPlayer.name);
    let pick = null;

    const paint = () => {
      const inP = pick ? Data.player(pick) : null;
      UI.modal({
        title: `Transfer ${outPlayer.nickname || outPlayer.name} out`,
        sub: cost ? `This swap costs ${cost} points` : 'This one is free',
        body: `
          <div class="note">
            <strong>${cost ? `&minus;${cost} points` : 'Free transfer'}</strong>
            You keep the ${pts[outPlayer.id] ?? 0} points he has already earned you.
            Whoever comes in only scores from the next match onwards, and must be a ${base.pos}.
          </div>
          ${eligible.length
            ? `<input class="input search-box" id="tSearch" placeholder="Search name or number" autocomplete="off">
               <div id="tResults">${eligible.map(p => `
                 <div class="pick-row ${pick === p.id ? 'picked' : ''}" data-tp="${p.id}" data-search="${
                   esc((p.name + ' ' + (p.nickname || '') + ' ' + p.squad_num).toLowerCase())}">
                   <span class="pick-check">&#10003;</span>
                   ${UI.thumb(p)}
                   <span class="row-num">${p.squad_num}</span>
                   <span class="pick-name">${esc(p.nickname || p.name)}</span>
                   <span class="pick-pts">${pts[p.id] ?? 0}</span>
                 </div>`).join('')}</div>`
            : `<div class="empty">Nobody else plays ${base.pos}.</div>`}`,
        footer: `<button class="btn btn-quiet" data-x>Cancel</button>
          <button class="btn btn-primary" id="toGo" ${inP ? '' : 'disabled'}>${inP
            ? `Swap ${outName} for ${esc(inP.nickname || inP.name)}${cost ? ` (&minus;${cost})` : ''}` : 'Pick who comes in'}</button>`,
      });
      document.querySelector('[data-x]').onclick = () => UI.closeModal();
      UI.wireSearch('tSearch', 'tResults', eligible, 'data-tp', el => { pick = el.dataset.tp; paint(); });
      const go = document.getElementById('toGo');
      if (go && inP) go.onclick = async () => {
        go.disabled = true;
        try {
          await Data.makeTransfer(team.id, outPlayer.id, inP.id, cost, i);
          UI.closeModal();
          UI.toast(cost ? `Done. &minus;${cost} points.` : 'Transfer complete');
          Router.render();
        } catch (e) { go.disabled = false; UI.toast(e.message, true); }
      };
    };
    paint();
  },

  async _transferHistory(teamId) {
    const ts = await Data.myTransfers(teamId);
    if (!ts.length) return '';
    return `<div class="label" style="margin:24px 0 8px">Transfers</div>
      <div class="rows">${ts.map(t => `
        <div class="row" style="font-size:.78rem">
          <span style="flex:1;min-width:0">
            <span style="color:var(--red)">${esc(Data.playerName(t.out_player_id))}</span>
            &#8594; <strong>${esc(Data.playerName(t.in_player_id))}</strong>
          </span>
          <span class="tag ${t.points_cost ? 'cost' : 'live'}">${
            t.points_cost ? '&minus;' + t.points_cost : 'Free'}</span>
        </div>`).join('')}</div>`;
  },

  /* The page while it waits. Deliberately not a spinner: the header is the
     real one, and a hairline stands in for whatever comes next, so the
     layout doesn't jump when the answer arrives. Nothing below it commits
     to an answer we don't have yet. */
  _fantasyWaiting() {
    return `
      <section class="section-tight">
        <div class="wrap reveal">
          <div class="label label-red">${esc(State.season?.name || 'Season')}</div>
          <h1 class="h1" style="margin:8px 0 12px">Fantasy Poppas</h1>
          <p class="lede">Pick a formation and fill all eleven positions with real Riverside players.</p>
          <div class="fantasy-wait" aria-hidden="true"></div>
        </div>
      </section>`;
  },

  _fantasyTabs(active, hasTeam = true) {
    const tabs = [
      ...(hasTeam ? [['team', 'My team', '#/fantasy']] : []),
      ['leaderboard', 'Leaderboard', '#/fantasy/leaderboard'],
      ['players',     'Players',     '#/fantasy/players'],
    ];
    return `<div class="sub-tabs">${tabs.map(([k, label, href]) =>
      `<a class="sub-tab ${active === k ? 'active' : ''}" href="${href}">${label}</a>`).join('')}</div>`;
  },

  _fantasyHeader(free, cost) {
    return `
      <section class="section-tight">
        <div class="wrap reveal">
          <div class="label label-red">${esc(State.season?.name || 'Season')}</div>
          <h1 class="h1" style="margin:8px 0 12px">Fantasy Poppas</h1>
          <p class="lede">Pick a formation and fill all eleven positions with real Riverside players.
            You score when they play, score, assist or take man of the match, and lose points when they get booked.
            ${free} free transfers, then ${cost} points a swap.</p>
        </div>
      </section>`;
  },

  _fantasyRules(free, cost) {
    const row = (label, gk, def, mid, att) => `
      <tr>
        <td class="sc-what">${label}</td>
        <td class="sc-v ${gk >= 0 ? 'p' : 'n'}">${gk > 0 ? '+' : ''}${gk}</td>
        <td class="sc-v ${def >= 0 ? 'p' : 'n'}">${def > 0 ? '+' : ''}${def}</td>
        <td class="sc-v ${mid >= 0 ? 'p' : 'n'}">${mid > 0 ? '+' : ''}${mid}</td>
        <td class="sc-v ${att >= 0 ? 'p' : 'n'}">${att > 0 ? '+' : ''}${att}</td>
      </tr>`;

    return `
      <section class="section">
        <div class="wrap reveal">
          <div class="section-head"><h2 class="h2">How points work</h2>
            <span class="side">Same for every manager</span></div>

          <div class="scoring-wrap">
            <table class="scoring">
              <thead>
                <tr>
                  <th class="sc-what"></th>
                  <th>Keeper</th><th>Defender</th><th>Midfielder</th><th>Attacker</th>
                </tr>
              </thead>
              <tbody>
                ${row('Scores a goal', 20, 7, 5, 4)}
                ${row('Sets one up',    8, 5, 4, 2)}
                ${row('Keeps a clean sheet', 4, 4, 2, 1)}
              </tbody>
            </table>

            <div class="scoring-flat">
              <div class="sc-flat"><span>Turns up and plays</span><b class="p">+2</b></div>
              <div class="sc-flat"><span>Turn-up streak, from 3 in a row</span><b class="p">+2</b></div>
              <div class="sc-flat"><span>Every 10th in a row</span><b class="p">+5</b></div>
              <div class="sc-flat"><span>Man of the match</span><b class="p">+3</b></div>
              <div class="sc-flat"><span>Hat-trick bonus</span><b class="p">+3</b></div>
              <div class="sc-flat"><span>Yellow card</span><b class="n">&minus;2</b></div>
              <div class="sc-flat"><span>Red card</span><b class="n">&minus;8</b></div>
              <div class="sc-flat"><span>Own goal</span><b class="n">&minus;2</b></div>
            </div>
          </div>

          <div class="scoring-notes">
            <p><strong>Friendlies pay half.</strong> League and cup matches count in full.</p>
            <p><strong>Streaks.</strong> Turn up to three league or cup matches in a row and every match
              from the third on pays +2 on top. The 10th in a row pays +5 instead, and so does the 20th.
              Miss one and the run starts again from nothing. Turning up means being on the result sheet,
              subs included. Friendlies don't add to a run and missing one doesn't break it.</p>
            <p><strong>No minutes tracked.</strong> Everything comes off the form the captains fill in after each match.</p>
            <p><strong>Transfers.</strong> ${free} free per season, then ${cost} points each. You keep whatever a player
              earned while he was yours, and a new signing only scores from his next match onwards.
              A transfer that costs points comes off your score for the next match played.</p>
            <p><strong>Changing formation.</strong> Pick any of the club's formations. Everyone who has to
              make way is a transfer, so 4-4-2 to 5-3-2 is one swap: a midfielder out, a defender in.</p>
            <p><strong>Joining late.</strong> Start after the relaunch and you get a one-off credit:
              half of what the teams already here average, a quarter if a match has been played
              since, and nothing after that. It is worked out from their scores, never from the
              players you pick, so there is no advantage in waiting to see who is in form.</p>
          </div>
        </div>
      </section>`;
  },

  /* The league table. Every team is public, so every row opens.

     Only a full XI ranks. A catch-up credit is granted at sign-up, before
     anybody chooses a player, so without this a squad that isn't playing
     yet could sit above managers who are. Teams that are short get a line
     on their own team page telling them how to appear. */
  _fantasyTable(standings, myTeamId = null) {
    const rows = this._onBoard(standings);
    if (!rows.length) {
      return `<section class="section-tight"><div class="wrap reveal">
        <div class="section-head"><h2 class="h2">Leaderboard</h2></div>
        <div class="empty">${standings.length
          ? 'No one has finished an XI yet. Be first.'
          : 'Nobody has built a team yet. Be first.'}</div>
      </div></section>`;
    }
    // #boardPick is filled by _wireBoard once the played matches are known.
    // Until then (and if that fetch fails) this is the season table, as before.
    return `
      <section class="section-tight">
        <div class="wrap reveal">
          <div class="section-head"><h2 class="h2">Leaderboard</h2>
            <span class="side">${rows.length} manager${rows.length > 1 ? 's' : ''}</span></div>
          <div id="boardPick"></div>
          <div id="boardBody">${this._seasonBoard(rows, myTeamId)}</div>
          <div class="card-sub" style="margin-top:12px">Matches is how many of the league and cup games
            played so far each team has been around for, so 4/6 means it joined after the first two and
            couldn't score in them. Teams that joined after the relaunch also carry a one-off catch-up
            credit, the small + number next to their name.</div>
        </div>
      </section>`;
  },

  /* `played` (optional): { teamId: n } league and cup matches each team
     has been around for, and `of` how many have been played in all. Fills
     in once the match data has loaded; until then the column is blank. */
  _seasonBoard(rows, myTeamId, played = null, of = 0) {
    return `
          <table class="tbl">
            <thead><tr>
              <th style="width:30px"></th><th>Team</th><th>Manager</th>
              <th class="r" title="League and cup matches this team has been around for, out of all played so far">Matches</th>
              <th class="r" title="Points in the last match played">Last match</th><th class="r">Total</th>
            </tr></thead>
            <tbody>${rows.map((s, i) => `
              <tr data-team="${s.fantasy_team_id}" style="cursor:pointer${
                  s.fantasy_team_id === myTeamId ? ';background:rgba(241,143,27,.07)' : ''}">
                <td class="rk">${i + 1}</td>
                <td class="strong">${esc(s.team_name)}${s.catch_up_points ? `
                  <span class="catch-up" title="Catch-up points for joining late"
                    >+${s.catch_up_points}</span>` : ''}</td>
                <td style="color:var(--ink-3)">${esc(s.owner_name || 'Guest manager')}</td>
                <td class="r" style="color:${played && (played[s.fantasy_team_id] || 0) < of ? 'var(--ink-3)' : 'var(--ink)'}">${
                  played ? `${played[s.fantasy_team_id] || 0}/${of}` : ''}</td>
                <td class="r">${s.gameweek_points ?? 0}</td>
                <td class="r big">${s.total_points}</td>
              </tr>`).join('')}
            </tbody>
          </table>`;
  },

  /* One match on its own. Everyone on the board who existed for that match,
     ranked on what their XI did that day minus any transfer hit charged to
     it. Catch-up credit is never in a match score, so a late joiner can see
     exactly how they stack up from the day they arrived. Ties share a rank. */
  _matchBoard(rows, matchRows, myTeamId) {
    const byTeam = {};
    matchRows.forEach(r => { byTeam[r.fantasy_team_id] = r; });
    const ranked = rows
      .filter(s => byTeam[s.fantasy_team_id])
      .map(s => ({ s, m: byTeam[s.fantasy_team_id] }))
      .sort((a, b) => b.m.points - a.m.points);
    if (!ranked.length) {
      return `<div class="empty">No team on the board was around for this one.</div>`;
    }
    let rank = 0, last = null;
    return `
          <table class="tbl">
            <thead><tr>
              <th style="width:30px"></th><th>Team</th><th>Manager</th>
              <th class="r">Pts</th>
            </tr></thead>
            <tbody>${ranked.map(({ s, m }, i) => {
              if (m.points !== last) { rank = i + 1; last = m.points; }
              return `
              <tr data-team="${s.fantasy_team_id}" data-fixture="${m.fixture_id}" style="cursor:pointer${
                  s.fantasy_team_id === myTeamId ? ';background:rgba(241,143,27,.07)' : ''}">
                <td class="rk">${rank}</td>
                <td class="strong">${esc(s.team_name)}${m.transfer_cost ? `
                  <span class="catch-up" title="Transfer hit charged to this match"
                    >&minus;${m.transfer_cost}</span>` : ''}</td>
                <td style="color:var(--ink-3)">${esc(s.owner_name || 'Guest manager')}</td>
                <td class="r big">${m.points}</td>
              </tr>`;
            }).join('')}
            </tbody>
          </table>`;
  },

  // Column header for the latest match: "vs Casuals", with the full name
  // and date in the tooltip. Clearer than a match number, which depends on
  // whether friendlies and cup games are being counted.
  _lastHeader(fx) {
    if (!fx) return { label: 'Last match', tip: 'Points in the last match played' };
    const short = String(fx.opponent).split(/\s+/)[0];
    return { label: `vs ${short}`, tip: `Points vs ${fx.opponent}, ${UI.fmtDate(fx.kickoff_at)}` };
  },

  // A short name for a match in a picker: "vs Exiles FC · 13 Sep".
  _matchLabel(fx) {
    return `vs ${fx.opponent} · ${UI.fmtDate(fx.kickoff_at)}${
      fx.competition === 'Friendly' ? ' · friendly' : ''}`;
  },

  /* Turns the season table into a table you can flip to any single match.
     Loaded after first paint: the season table is the answer most people
     want, and it shouldn't wait on two more fetches. */
  async _wireBoard(standings, myTeamId = null) {
    const pick = document.getElementById('boardPick');
    const body = document.getElementById('boardBody');
    if (!pick || !body) return;
    const [matches, fixtures] = await Promise.all([
      Data.teamMatchPoints(), Data.playedThisSeason(),
    ]).catch(() => [[], []]);
    const withScores = fixtures.filter(f => matches.some(m => m.fixture_id === f.id));
    // isConnected: the user may have navigated away while this loaded.
    if (!withScores.length || pick.isConnected === false) return;

    const rows = this._onBoard(standings);

    // How many official (league and cup) matches each team has been around for.
    const official = new Set(fixtures.filter(f => UI.isCompetitive(f)).map(f => f.id));
    const played = {};
    matches.forEach(m => {
      if (official.has(m.fixture_id)) played[m.fantasy_team_id] = (played[m.fantasy_team_id] || 0) + 1;
    });
    const season = () => this._seasonBoard(rows, myTeamId, played, official.size);
    body.innerHTML = season();
    this._wireTeamRows();

    pick.innerHTML = `
      <label class="board-pick">
        <span>Showing</span>
        <select id="boardSelect">
          <option value="">Whole season</option>
          ${withScores.map(f => `<option value="${f.id}">${esc(this._matchLabel(f))}</option>`).join('')}
        </select>
      </label>`;

    document.getElementById('boardSelect').onchange = e => {
      const id = e.target.value;
      body.innerHTML = id
        ? this._matchBoard(rows, matches.filter(m => m.fixture_id === id), myTeamId)
        : season();
      this._wireTeamRows();
    };
  },

  _wireTeamRows() {
    document.querySelectorAll('[data-team]').forEach(el => {
      el.onclick = () => {
        location.hash = `#/fantasy/team/${el.dataset.team}${el.dataset.fixture ? '/' + el.dataset.fixture : ''}`;
      };
    });
  },
};
