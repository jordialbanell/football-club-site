/* ═══════════════════════════════════════════════════════════
   ADMIN — captains only
   ═══════════════════════════════════════════════════════════ */

const Admin = {

  guard(app) {
    if (!isAdmin()) {
      app.innerHTML = `<section class="section"><div class="wrap">
        <h1 class="h1">Admin</h1>
        <div class="note"><strong>Captains only</strong>
          ${isSignedIn()
            ? 'Your account is not an admin. Another captain can promote you.'
            : 'Sign in with a captain account to continue.'}</div>
      </div></section>`;
      return false;
    }
    return true;
  },

  /* ─────────── DASHBOARD ─────────── */
  async home(app) {
    if (!this.guard(app)) return;
    const [upcoming, played] = await Promise.all([
      Data.fixtures({ status: 'upcoming' }),
      Data.fixtures({ status: 'played', order: 'desc', limit: 8 }),
    ]);

    app.innerHTML = `
      <section class="section">
        <div class="wrap reveal">
          <div class="label label-red">Captains</div>
          <h1 class="h1">Admin</h1>

          <div class="btn-row" style="margin-top:20px">
            <button class="btn btn-primary" id="newFx">+ New Fixture</button>
            <a class="btn" href="#/admin/squad">Manage Squad</a>
            <a class="btn" href="#/admin/media">Media</a>
            <a class="btn" href="#/admin/people">People &amp; approvals<span id="pendingDot"></span></a>
            <a class="btn" href="#/admin/fantasy">Fantasy teams</a>
            <a class="btn" href="#/admin/table">League table</a>
          </div>

          <div class="section-head" style="margin-top:34px"><h2>Upcoming</h2></div>
          ${upcoming.length ? `<div class="fx-list">${upcoming.map(fx => this._adminRow(fx)).join('')}</div>`
                            : '<div class="empty">No upcoming fixtures.</div>'}

          <div class="section-head" style="margin-top:34px"><h2>Played</h2></div>
          ${played.length ? `<div class="fx-list">${played.map(fx => this._adminRow(fx, true)).join('')}</div>`
                          : '<div class="empty">No results yet.</div>'}
        </div>
      </section>`;

    // Badge the People link if anything is waiting
    Promise.all([Data.pendingProfiles(), Data.pendingMedia()]).then(([p, m]) => {
      const n = p.length + m.length;
      const dot = document.getElementById('pendingDot');
      if (dot && n) dot.outerHTML = `<span class="badge">${n}</span>`;
    });

    document.getElementById('newFx').onclick = () => this.fixtureModal();
    document.querySelectorAll('[data-edit-fx]').forEach(el => {
      el.onclick = async e => {
        e.stopPropagation();
        const fx = await Data.fixture(el.dataset.editFx);
        this.fixtureModal(fx);
      };
    });
    Views._bindRows();
  },

  _adminRow(fx, played = false) {
    const letter = UI.resultLetter(fx);
    return `<div class="fx-row" data-fx="${fx.id}">
      <div class="fx-date"><strong>${UI.fmtDate(fx.kickoff_at)}</strong>${UI.fmtTime(fx.kickoff_at)}</div>
      <div class="fx-body">
        <div class="fx-opp">${esc(fx.opponent)}</div>
        <div class="fx-sub">${esc(fx.venue?.name || fx.venue_name || 'Venue TBC')}</div>
      </div>
      ${played && letter ? `<div class="fx-result ${letter}">${fx.our_score}-${fx.their_score}</div>`
                         : `<span class="fx-badge ${fx.home_away}">${fx.home_away}</span>`}
      <button class="btn btn-sm btn-quiet" data-edit-fx="${fx.id}">Edit</button>
    </div>`;
  },

  /* ─────────── FIXTURE MODAL ─────────── */
  fixtureModal(fx = null) {
    const local = iso => {
      if (!iso) return '';
      const d = new Date(iso);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 16);
    };

    UI.modal({
      title: fx ? 'Edit fixture' : 'New fixture',
      body: `
        <div class="field">
          <label>Opponent</label>
          <input class="input" id="fOpp" value="${esc(fx?.opponent || '')}" placeholder="Team name">
        </div>
        <div class="frow">
          <div class="field">
            <label>Kick off</label>
            <input class="input" type="datetime-local" id="fWhen" value="${local(fx?.kickoff_at)}">
          </div>
          <div class="field">
            <label>Home / Away</label>
            <select class="input" id="fHA">
              ${['home','away','neutral'].map(v =>
                `<option value="${v}" ${fx?.home_away === v ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field">
          <label>Venue</label>
          <select class="input" id="fVenue">
            <option value="">TBC</option>
            ${State.venues.map(v =>
              `<option value="${v.id}" ${fx?.venue_id === v.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}
            <option value="custom" ${!fx?.venue_id && fx?.venue_name ? 'selected' : ''}>Other ground (type it)</option>
          </select>
        </div>
        <div id="customVenue" ${(!fx?.venue_id && fx?.venue_name) ? '' : 'hidden'}>
          <div class="field">
            <label>Ground name</label>
            <input class="input" id="fVName" value="${esc(fx?.venue_name || '')}" placeholder="e.g. Turf City Pitch 4">
          </div>
          <div class="field">
            <label>Address</label>
            <input class="input" id="fVAddr" value="${esc(fx?.venue_address || '')}" placeholder="Street, postcode">
          </div>
        </div>
        <div class="frow">
          <div class="field">
            <label>Competition</label>
            <select class="input" id="fComp">
              ${['League','Cup','Friendly'].map(v =>
                `<option value="${v}" ${(fx?.competition || 'League') === v ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Status</label>
            <select class="input" id="fStatus">
              ${['upcoming','played','cancelled','postponed'].map(v =>
                `<option value="${v}" ${fx?.status === v ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </div>
        </div>`,
      footer: `${fx ? '<button class="btn btn-red btn-sm" data-del>Delete</button>' : ''}
               <button class="btn btn-quiet" data-x>Cancel</button>
               <button class="btn btn-primary" data-save>Save</button>`,
    });

    const venueSel = document.getElementById('fVenue');
    venueSel.onchange = () => {
      document.getElementById('customVenue').hidden = venueSel.value !== 'custom';
    };

    document.querySelector('[data-x]').onclick = () => UI.closeModal();
    document.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (!confirm(`Delete the ${fx.opponent} fixture? This removes its lineup, availability and stats.`)) return;
      try { await Data.deleteFixture(fx.id); UI.closeModal(); UI.toast('Deleted'); Router.render(); }
      catch (e) { UI.toast(e.message, true); }
    });
    document.querySelector('[data-save]').onclick = async () => {
      const vSel = document.getElementById('fVenue').value;
      const custom = vSel === 'custom';
      const payload = {
        opponent:   document.getElementById('fOpp').value.trim(),
        kickoff_at: new Date(document.getElementById('fWhen').value).toISOString(),
        home_away:  document.getElementById('fHA').value,
        venue_id:   custom ? null : (vSel || null),
        venue_name:    custom ? (document.getElementById('fVName').value.trim() || null) : null,
        venue_address: custom ? (document.getElementById('fVAddr').value.trim() || null) : null,
        competition:document.getElementById('fComp').value,
        status:     document.getElementById('fStatus').value,
        season_id:  State.season?.id || null,
      };
      if (!payload.opponent) return UI.toast('Opponent required', true);
      if (fx) payload.id = fx.id;
      try { await Data.saveFixture(payload); UI.closeModal(); UI.toast('Saved'); Router.render(); }
      catch (e) { UI.toast(e.message, true); }
    };
  },

  /* ─────────── LINEUP EDITOR ─────────── */
  async lineup(app, fixtureId) {
    if (!this.guard(app)) return;
    const fx = await Data.fixture(fixtureId);
    if (!fx) return;

    const [existing, avail] = await Promise.all([
      Data.lineupForFixture(fixtureId),
      Data.availability(fixtureId),
    ]);

    // Who's playing today. Stored on the fixture, so it survives a reload.
    const squadIn = new Set(avail.filter(a => a.status === 'in').map(a => a.player_id));

    const model = {
      id: existing?.id || null,
      fixture_id: fixtureId,
      formation: existing?.formation || '4-4-2',
      jersey_color: existing?.jersey_color || '#b8232f',
      is_published: existing?.is_published || false,
      slots: existing?.slots || [],
    };

    // Anyone already on the pitch counts as playing, even if the
    // squad was picked before this feature existed.
    model.slots.forEach(sl => {
      if (sl.player_id) squadIn.add(sl.player_id);
      if (sl.sub_player_id) squadIn.add(sl.sub_player_id);
    });

    app.innerHTML = `
      <section class="section" style="padding-top:22px">
        <div class="wrap-wide">

          <div class="sticky-bar">
            <div class="sticky-left">
              <a class="btn btn-sm btn-quiet" id="backLink" href="#/fixture/${fixtureId}">&#8592; Back</a>
              <span class="sticky-title">vs ${esc(fx.opponent)}</span>
              <span id="pubTag"></span>
            </div>
            <div class="sticky-mid">
              <div class="pill-row" id="formBtns"></div>
              <div class="swatch-row" id="jerseyRow"></div>
            </div>
            <div class="sticky-right">
              <span class="xi-count" id="xiCount"></span>
              <button class="btn btn-sm btn-quiet" data-clear>Clear</button>
              <button class="btn btn-sm" data-save>Save draft</button>
              <button class="btn btn-sm btn-red" data-publish></button>
            </div>
          </div>

          <div class="lineup-grid">
            <div id="pitchMount"></div>
            <div class="bench-col">
              <div class="squad-head">
                <span class="label">Playing today &middot; <span id="benchCount">0</span></span>
                <button class="btn btn-sm" id="pickSquad">+ Who's playing</button>
              </div>
              <div id="squadHint"></div>
              <div class="rows scroll-list" id="benchList"></div>
            </div>
          </div>
        </div>
      </section>`;

    const mount = document.getElementById('pitchMount');
    const bench = document.getElementById('benchList');

    /* ── Autosave ──────────────────────────────────────────────
       This editor used to block every way out until you saved. Chrome
       suppresses a confirm() that keeps firing and then answers it
       false on your behalf, which read here as "cancel" — so it blocked
       every link without ever showing a dialog. Nothing is blocked any
       more: each change schedules a write ~1.5s later, and you can
       leave whenever you like.

       beforeunload stays. Closing or reloading the tab is the one exit
       the browser drives itself, so it cannot trap anyone.
       ───────────────────────────────────────────────────────────── */
    const AUTOSAVE_MS = 1500;

    let dirty     = false;
    let saveState = null;   // null | 'saving' | 'saved'
    let editGen   = 0;      // bumped per edit, so a write knows if it landed stale
    let inFlight  = false;
    let saveTimer = null;

    window.addEventListener('beforeunload', e => {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });

    const rowsFor = () => model.slots.filter(s => s.player_id).map(s => ({
      slot_index: s.slot_index, slot_label: s.slot_label,
      player_id: s.player_id, x: s.x, y: s.y,
      sub_player_id: s.sub_player_id || null,
    }));

    const badge = () =>
        saveState === 'saving' ? '<span class="tag draft">Saving&hellip;</span>'
      : dirty                  ? '<span class="tag unsaved">Unsaved</span>'
      : saveState === 'saved'  ? '<span class="tag live">Saved</span>'
      : model.is_published     ? '<span class="tag live">Published</span>'
                               : '<span class="tag draft">Draft</span>';

    // Repaint only the badge: a save landing mid-drag must not yank the
    // pitch out from under the pointer the way a full paint() would.
    const paintBadge = () => {
      const el = document.getElementById('pubTag');
      if (el) el.innerHTML = badge();
    };

    const scheduleSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(autosave, AUTOSAVE_MS);
    };

    const autosave = async () => {
      if (!dirty) return;
      if (inFlight) return scheduleSave();   // let the current write land first
      const gen = editGen;
      inFlight = true;
      saveState = 'saving';
      paintBadge();
      try {
        model.id = await Data.saveLineup(model, rowsFor());
        if (gen === editGen) { dirty = false; saveState = 'saved'; }
        else { saveState = null; scheduleSave(); }   // edited while we were writing
      } catch (e) {
        saveState = null;          // leaves the amber Unsaved badge showing
        UI.toast(e.message, true); // ...but never blocks the way out
      }
      inFlight = false;
      paintBadge();
    };

    const markDirty = () => {
      dirty = true;
      saveState = null;
      editGen++;
      scheduleSave();
      paint();
    };

    const paint = () => {
      const pool = State.players.filter(p => squadIn.has(p.id));

      Lineup.render(mount, {
        formation: model.formation,
        jerseyColor: model.jersey_color,
        slots: model.slots,
        editable: true,
        availablePlayers: pool,
        onChange: next => { model.slots = next; markDirty(); },
      });

      const onPitch = new Set(model.slots.filter(s => s.player_id).map(s => s.player_id));
      const notYetOn = pool.filter(p => !onPitch.has(p.id));

      // Bench players already lined up to come on: show which shirt they take
      const comingOnFor = {};
      model.slots.forEach(sl => {
        if (sl.sub_player_id) comingOnFor[sl.sub_player_id] = sl.slot_label;
      });

      document.getElementById('benchCount').textContent = squadIn.size;
      document.getElementById('xiCount').textContent = `${onPitch.size} / 11`;

      document.getElementById('squadHint').innerHTML = squadIn.size
        ? (squadIn.size < 11
            ? `<div class="note" style="font-size:.76rem"><strong>Only ${squadIn.size} marked in</strong>
                You need at least 11 to fill the pitch.</div>`
            : '')
        : `<div class="note" style="font-size:.76rem">
             <strong>Nobody marked in yet</strong>
             Tap <em>Who's playing</em> to pick the matchday squad, then drag them onto the pitch.
           </div>`;

      const lined  = notYetOn.filter(p => comingOnFor[p.id]);
      const spare  = notYetOn.filter(p => !comingOnFor[p.id]);
      const ordered = [...lined, ...spare];

      bench.innerHTML = ordered.length
        ? (lined.length ? `<div class="list-sep">Coming on &middot; ${lined.length}</div>` : '')
          + ordered.map((p, i) => (i === lined.length && lined.length
              ? `<div class="list-sep">Bench &middot; ${spare.length}</div>` : '') + `
            <div class="row" draggable="true" data-drag="${p.id}"
                 data-search="${esc((p.name + ' ' + (p.nickname || '') + ' ' + p.squad_num).toLowerCase())}">
              ${UI.thumb(p)}
              <span class="row-num">${p.squad_num}</span>
              <span class="row-name">${esc(p.nickname || p.name)}</span>
              ${comingOnFor[p.id]
                ? `<span class="tag live">&#8593; ${esc(comingOnFor[p.id])}</span>`
                : `<span class="pos ${p.position}">${p.position}</span>`}
              <button class="mini red" data-out="${p.id}" title="Not playing">&#10005;</button>
            </div>`).join('')
        : (squadIn.size
            ? '<div class="empty" style="padding:16px">Everyone available is on the pitch.</div>'
            : '');

      bench.querySelectorAll('[data-drag]').forEach(el => {
        el.addEventListener('dragstart', e => {
          e.dataTransfer.setData('playerId', el.dataset.drag);
          e.dataTransfer.effectAllowed = 'move';
        });
      });

      // Drop someone from the matchday squad
      bench.querySelectorAll('[data-out]').forEach(b => b.onclick = async e => {
        e.stopPropagation();
        const pid = b.dataset.out;
        squadIn.delete(pid);
        model.slots = model.slots.filter(sl => sl.player_id !== pid);
        model.slots.forEach(sl => { if (sl.sub_player_id === pid) sl.sub_player_id = null; });
        try { await Data.clearAvailability(fixtureId, pid); } catch (_) {}
        paint();
      });

      document.getElementById('formBtns').innerHTML =
        Object.keys(CONFIG.FORMATIONS).map(f =>
          `<button class="pill ${f === model.formation ? 'on' : ''}" data-form="${f}">${f}</button>`).join('');
      document.querySelectorAll('[data-form]').forEach(b => b.onclick = () => {
        if (model.slots.length && !confirm('Changing formation clears the XI. Continue?')) return;
        model.formation = b.dataset.form; model.slots = []; markDirty();
      });

      document.getElementById('jerseyRow').innerHTML =
        CONFIG.JERSEY_SWATCHES.map(c => `
          <span class="swatch sm ${c.toLowerCase() === model.jersey_color.toLowerCase() ? 'on' : ''}"
            style="background:${c}" data-jersey="${c}"></span>`).join('');
      document.querySelectorAll('[data-jersey]').forEach(sw => sw.onclick = () => {
        model.jersey_color = sw.dataset.jersey; markDirty();
      });

      document.getElementById('pubTag').innerHTML = badge();
      document.querySelector('[data-publish]').textContent =
        model.is_published ? 'Update' : 'Publish';
    };

    paint();

    /* Pick the matchday squad */
    document.getElementById('pickSquad').onclick = () => {
      const render = () => {
        const inList  = State.players.filter(p => squadIn.has(p.id));
        const outList = State.players.filter(p => !squadIn.has(p.id));

        UI.modal({
          title: "Who's playing",
          sub: `${squadIn.size} marked in`,
          wide: true,
          body: `
            <input class="input search-box" id="sqSearch" placeholder="Search the squad" autocomplete="off">
            <div id="sqList">
              ${inList.length ? `<div class="modal-divider">Playing &middot; ${inList.length}</div>
                ${inList.map(p => row(p, true)).join('')}` : ''}
              <div class="modal-divider">Rest of the squad &middot; ${outList.length}</div>
              ${outList.map(p => row(p, false)).join('')}
            </div>`,
          footer: `<button class="btn btn-quiet" id="addGuest">+ Add a guest</button>
                   <button class="btn btn-quiet" data-x>Done</button>`,
        });

        document.getElementById('addGuest').onclick = () => {
          const name = prompt("Guest's name?");
          if (!name || !name.trim()) return;
          const pos = (prompt('Position? GK, DEF, MID or ATT', 'MID') || 'MID')
            .trim().toUpperCase();
          if (!['GK','DEF','MID','ATT'].includes(pos))
            return UI.toast('Use GK, DEF, MID or ATT', true);
          (async () => {
            try {
              const g = await Data.addGuest(name, pos);
              squadIn.add(g.id);
              await Data.setAvailability(fixtureId, g.id, 'in');
              UI.toast(`${g.name} added as a guest`);
              render();
            } catch (e) { UI.toast(e.message, true); }
          })();
        };

        const search = document.getElementById('sqSearch');
        search.oninput = () => {
          const q = search.value.trim().toLowerCase();
          document.querySelectorAll('#sqList [data-search]').forEach(r => {
            r.style.display = !q || r.dataset.search.includes(q) ? '' : 'none';
          });
          document.querySelectorAll('#sqList .modal-divider')
            .forEach(d => d.style.display = q ? 'none' : '');
        };

        document.getElementById('sqList').addEventListener('click', async e => {
          const r = e.target.closest('[data-toggle]');
          if (!r) return;
          const pid = r.dataset.toggle;
          try {
            if (squadIn.has(pid)) {
              squadIn.delete(pid);
              model.slots = model.slots.filter(sl => sl.player_id !== pid);
              model.slots.forEach(sl => { if (sl.sub_player_id === pid) sl.sub_player_id = null; });
              await Data.clearAvailability(fixtureId, pid);
            } else {
              squadIn.add(pid);
              await Data.setAvailability(fixtureId, pid, 'in');
            }
          } catch (err) { UI.toast(err.message, true); }
          render();
        });

        document.querySelector('[data-x]').onclick = () => { UI.closeModal(); paint(); };
      };

      const row = (p, on) => `
        <div class="pick-row ${on ? 'picked' : ''}" data-toggle="${p.id}"
             data-search="${esc((p.name + ' ' + (p.nickname || '') + ' ' + p.squad_num).toLowerCase())}">
          <span class="pick-check">&#10003;</span>
          ${UI.thumb(p)}
          <span class="row-num">${p.squad_num}</span>
          <span class="pick-name">${esc(p.nickname || p.name)}</span>
          ${p.is_guest ? '<span class="tag draft">guest</span>' : ''}
          <span class="pos ${p.position}">${p.position}</span>
        </div>`;

      render();
    };

    document.querySelector('[data-clear]').onclick = () => {
      if (!model.slots.length) return;
      model.slots = []; markDirty();
    };

    const persist = async publish => {
      clearTimeout(saveTimer);          // this write supersedes any pending autosave
      if (publish) model.is_published = true;
      const btn = document.querySelector(publish ? '[data-publish]' : '[data-save]');
      const was = btn.textContent;
      const gen = editGen;
      btn.textContent = 'Saving...'; btn.disabled = true;
      inFlight = true;
      try {
        model.id = await Data.saveLineup(model, rowsFor());
        UI.toast(publish ? 'Published to the team' : 'Draft saved');
        if (gen === editGen) { dirty = false; saveState = null; }
        else scheduleSave();            // edited while we were writing
      } catch (e) {
        UI.toast(e.message, true);
      }
      inFlight = false;
      btn.textContent = was; btn.disabled = false;
      paint();
    };
    document.querySelector('[data-save]').onclick    = () => persist(false);
    document.querySelector('[data-publish]').onclick = () => persist(true);
  },

  /* ─────────── FANTASY TEAMS ─────────── */
  async fantasy(app) {
    if (!this.guard(app)) return;
    const [teams, standings] = await Promise.all([
      Data.allFantasyTeams(),
      Data.fantasyStandings(),
    ]);
    const pts = {};
    standings.forEach(s => { pts[s.fantasy_team_id] = s; });

    app.innerHTML = `
      <section class="section" style="padding-top:22px">
        <div class="wrap">
          <div class="sticky-bar">
            <div class="sticky-left">
              <a class="btn btn-sm btn-quiet" href="#/admin">&#8592; Admin</a>
              <span class="sticky-title">Fantasy teams</span>
            </div>
            <div class="sticky-right">
              <a class="btn btn-sm btn-quiet" href="#/fantasy">View the league</a>
            </div>
          </div>

          <div class="note">
            <strong>Deleting a team cannot be undone</strong>
            It removes their squad, their transfer history and their edit link.
            Locking one stops the manager making any more transfers.
          </div>
          <div class="note">
            <strong>Edit links are keys</strong>
            Whoever opens one takes over editing that team. Only send one to
            the manager it belongs to.
          </div>

          ${teams.length ? `
          <div class="rows">
            ${teams.map(t => {
              const s = pts[t.id];
              return `<div class="row" style="flex-wrap:wrap;gap:10px;align-items:flex-start">
                <span style="flex:1;min-width:200px">
                  <span class="row-name" style="display:block">${esc(t.name)}</span>
                  <span style="color:var(--ink-3);font-size:.74rem">
                    ${esc(t.manager || 'Unknown manager')}
                    ${t.email ? ` &middot; ${esc(t.email)}` : ' &middot; no email on file'}
                    &middot; joined ${UI.fmtDate(t.created_at, { year: true })}
                  </span>
                </span>
                <span class="tag draft">${esc(t.formation || '4-4-2')}</span>
                <span class="tag draft">${t.squad_size}/11 picked</span>
                ${t.is_guest_manager ? '<span class="tag draft">guest</span>' : ''}
                ${s ? `<span class="tag ${s.total_points >= 0 ? 'live' : 'cost'}">${s.total_points} pts</span>` : ''}
                ${t.is_locked ? '<span class="tag cost">Locked</span>' : ''}
                <span style="margin-left:auto;display:flex;gap:6px">
                  ${t.edit_token ? `<button class="mini" data-copylink="${esc(Data.editLink(t.edit_token))}">Copy edit link</button>` : ''}
                  <button class="mini" data-lock="${t.id}" data-on="${t.is_locked ? 1 : 0}">
                    ${t.is_locked ? 'Unlock' : 'Lock'}</button>
                  <button class="mini red" data-delft="${t.id}" data-name="${esc(t.name)}">Delete</button>
                </span>
              </div>`;
            }).join('')}
          </div>` : '<div class="empty">Nobody has built a fantasy team yet.</div>'}
        </div>
      </section>`;

    document.querySelectorAll('[data-copylink]').forEach(b => b.onclick = () => {
      UI.copy(b.dataset.copylink);
    });

    document.querySelectorAll('[data-delft]').forEach(b => b.onclick = async () => {
      if (!confirm(`Delete "${b.dataset.name}"?\n\nTheir squad and transfer history go with it. Cannot be undone.`)) return;
      try { await Data.deleteFantasyTeam(b.dataset.delft); UI.toast('Team deleted'); Router.render(); }
      catch (e) { UI.toast(e.message, true); }
    });

    document.querySelectorAll('[data-lock]').forEach(b => b.onclick = async () => {
      const on = b.dataset.on === '1';
      try {
        await Data.setFantasyLock(b.dataset.lock, !on);
        UI.toast(on ? 'Unlocked' : 'Locked');
        Router.render();
      } catch (e) { UI.toast(e.message, true); }
    });
  },

  /* ─────────── LEAGUE TABLE EDITOR ─────────── */
  async table(app) {
    if (!this.guard(app)) return;
    let rows = (await Data.leagueTable()).map(r => ({ ...r }));

    // Seed from the fixture list so the team names are already there
    if (!rows.length) {
      const fx = await Data.fixtures({});
      const names = [...new Set(fx.filter(f => f.competition === 'League').map(f => f.opponent))];
      rows = ['Riverside', ...names].map(team => ({
        team, played: 0, won: 0, drawn: 0, lost: 0,
        goals_for: 0, goals_against: 0, points: 0,
      }));
    }

    const num = (r, k) => `<input class="input cell" type="number" min="0"
      value="${r[k]}" data-i="${rows.indexOf(r)}" data-k="${k}">`;

    const paint = () => {
      app.innerHTML = `
        <section class="section" style="padding-top:22px">
          <div class="wrap">
            <div class="sticky-bar">
              <div class="sticky-left">
                <a class="btn btn-sm btn-quiet" href="#/table">&#8592; Back</a>
                <span class="sticky-title">League table</span>
              </div>
              <div class="sticky-right">
                <button class="btn btn-sm btn-quiet" id="addRow">+ Team</button>
                <button class="btn btn-sm btn-quiet" id="autoSort">Sort by points</button>
                <button class="btn btn-primary" id="saveTable">Save</button>
              </div>
            </div>

            <div class="note">
              <strong>Copy the numbers off the EFL site</strong>
              Points fill in automatically from wins and draws, but you can overwrite them
              if there have been deductions.
              <a href="${esc(CONFIG.LEAGUE_URL)}" target="_blank" rel="noopener"
                 style="color:var(--accent)">Open the EFL table &#8599;</a>
            </div>

            <!-- Header and data rows are the same grid: .lt-row sets the
                 columns once, from a single custom property, so a header
                 cannot end up sitting over the wrong input. -->
            <div class="lt-scroll">
              <div class="lt-edit">
                <div class="lt-row lt-head">
                  <span></span>
                  <span class="lt-team">Team</span>
                  <span>P</span><span>W</span><span>D</span><span>L</span>
                  <span>GF</span><span>GA</span><span>Pts</span>
                  <span></span>
                </div>
                ${rows.map((r, i) => `
                  <div class="lt-row">
                    <span class="lt-rk">${i + 1}</span>
                    <input class="input cell wide" value="${esc(r.team)}" data-i="${i}" data-k="team">
                    ${num(r, 'played')}
                    ${num(r, 'won')}
                    ${num(r, 'drawn')}
                    ${num(r, 'lost')}
                    ${num(r, 'goals_for')}
                    ${num(r, 'goals_against')}
                    ${num(r, 'points')}
                    <button class="mini red" data-del="${i}" aria-label="Remove team">&#10005;</button>
                  </div>`).join('')}
              </div>
            </div>
          </div>
        </section>`;

      document.querySelectorAll('.cell').forEach(el => el.oninput = () => {
        const i = +el.dataset.i, k = el.dataset.k;
        rows[i][k] = k === 'team' ? el.value : (parseInt(el.value) || 0);
        // Keep points in step with W and D unless they've been typed over
        if (k === 'won' || k === 'drawn') {
          rows[i].points = rows[i].won * 3 + rows[i].drawn;
          const pts = document.querySelector(`.cell[data-i="${i}"][data-k="points"]`);
          if (pts) pts.value = rows[i].points;
        }
      });

      document.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
        rows.splice(+b.dataset.del, 1); paint();
      });
      document.getElementById('addRow').onclick = () => {
        rows.push({ team: '', played: 0, won: 0, drawn: 0, lost: 0,
                    goals_for: 0, goals_against: 0, points: 0 });
        paint();
      };
      document.getElementById('autoSort').onclick = () => {
        rows.sort((a, b) => b.points - a.points
          || (b.goals_for - b.goals_against) - (a.goals_for - a.goals_against)
          || b.goals_for - a.goals_for);
        paint();
      };
      document.getElementById('saveTable').onclick = async () => {
        const clean = rows.filter(r => r.team.trim());
        const btn = document.getElementById('saveTable');
        btn.textContent = 'Saving...'; btn.disabled = true;
        try {
          await Data.saveLeagueTable(clean.map(r => ({
            team: r.team.trim(), played: r.played, won: r.won, drawn: r.drawn,
            lost: r.lost, goals_for: r.goals_for, goals_against: r.goals_against,
            points: r.points,
          })));
          UI.toast('League table saved');
          location.hash = '#/table';
        } catch (e) {
          btn.textContent = 'Save'; btn.disabled = false;
          UI.toast(e.message, true);
        }
      };
    };

    paint();
  },

  /* ─────────── MANUAL RSVP (captains mark the WhatsApp replies) ─────────── */
  async rsvp(app, fixtureId) {
    if (!this.guard(app)) return;
    const fx = await Data.fixture(fixtureId);
    if (!fx) return;

    let avail = await Data.availability(fixtureId);
    const statusOf = {};
    avail.forEach(a => { statusOf[a.player_id] = a.status; });

    const paint = () => {
      const n = s => State.players.filter(p => statusOf[p.id] === s).length;
      const none = State.players.filter(p => !statusOf[p.id]).length;

      app.innerHTML = `
        <section class="section">
          <div class="wrap">
            <div class="label label-red">${UI.fmtDate(fx.kickoff_at, { weekday: 'long' })}</div>
            <h1 class="h1" style="margin:8px 0 14px">Availability vs ${esc(fx.opponent)}</h1>
            <div class="btn-row" style="margin-bottom:22px">
              <a class="btn btn-sm btn-quiet" href="#/fixture/${fixtureId}">&#8592; Match Centre</a>
              <a class="btn btn-sm btn-quiet" href="#/admin/lineup/${fixtureId}">Edit lineup</a>
            </div>

            <div class="note">
              <strong>Mark the WhatsApp replies here</strong>
              Whatever you set counts the same as a player tapping it themselves.
              Only players marked In appear in the lineup picker.
            </div>

            <div class="stats-row" style="margin-bottom:20px">
              <div class="stat"><div class="stat-n w">${n('in')}</div><div class="stat-k">In</div></div>
              <div class="stat"><div class="stat-n" style="color:var(--amber)">${n('maybe')}</div><div class="stat-k">Maybe</div></div>
              <div class="stat"><div class="stat-n l">${n('out')}</div><div class="stat-k">Out</div></div>
              <div class="stat"><div class="stat-n">${none}</div><div class="stat-k">No reply</div></div>
            </div>

            <input class="input search-box" id="rsvpSearch" placeholder="Search the squad" autocomplete="off">

            <div class="rows" id="rsvpRows">
              ${State.players.map(p => {
                const st = statusOf[p.id] || '';
                return `<div class="row rsvp-line" data-search="${
                  esc((p.name + ' ' + (p.nickname || '') + ' ' + p.squad_num).toLowerCase())}">
                  ${UI.thumb(p)}
                  <span class="row-num">${p.squad_num}</span>
                  <span class="row-name">${esc(p.nickname || p.name)}</span>
                  <span class="pos ${p.position}">${p.position}</span>
                  <span class="seg">
                    <button class="seg-b ${st === 'in' ? 'on in' : ''}" data-set="${p.id}:in">In</button>
                    <button class="seg-b ${st === 'maybe' ? 'on maybe' : ''}" data-set="${p.id}:maybe">Maybe</button>
                    <button class="seg-b ${st === 'out' ? 'on out' : ''}" data-set="${p.id}:out">Out</button>
                  </span>
                </div>`;
              }).join('')}
            </div>

            <div class="btn-row" style="margin-top:22px">
              <button class="btn btn-quiet btn-sm" id="allIn">Mark everyone In</button>
              <button class="btn btn-quiet btn-sm" id="allClear">Clear all</button>
            </div>
          </div>
        </section>`;

      document.getElementById('rsvpRows').addEventListener('click', async e => {
        const b = e.target.closest('[data-set]');
        if (!b) return;
        const [pid, status] = b.dataset.set.split(':');
        const next = statusOf[pid] === status ? null : status;
        try {
          if (next) await Data.setAvailability(fixtureId, pid, next);
          else      await Data.clearAvailability(fixtureId, pid);
          if (next) statusOf[pid] = next; else delete statusOf[pid];
          paint();
        } catch (err) { UI.toast(err.message, true); }
      });

      const search = document.getElementById('rsvpSearch');
      search.oninput = () => {
        const q = search.value.trim().toLowerCase();
        document.querySelectorAll('.rsvp-line').forEach(r => {
          r.style.display = !q || r.dataset.search.includes(q) ? '' : 'none';
        });
      };

      document.getElementById('allIn').onclick = async () => {
        if (!confirm('Mark all ' + State.players.length + ' players as In?')) return;
        try {
          for (const p of State.players) {
            await Data.setAvailability(fixtureId, p.id, 'in');
            statusOf[p.id] = 'in';
          }
          UI.toast('Everyone marked In'); paint();
        } catch (e) { UI.toast(e.message, true); }
      };
      document.getElementById('allClear').onclick = async () => {
        if (!confirm('Clear every response for this fixture?')) return;
        try {
          for (const p of State.players) {
            if (statusOf[p.id]) { await Data.clearAvailability(fixtureId, p.id); delete statusOf[p.id]; }
          }
          UI.toast('Cleared'); paint();
        } catch (e) { UI.toast(e.message, true); }
      };
    };

    paint();
  },

  /* ─────────── RESULT ENTRY ─────────── */
  async result(app, fixtureId) {
    if (!this.guard(app)) return;
    const fx = await Data.fixture(fixtureId);
    if (!fx) return;

    const [existingApps, existingEvents, lineup] = await Promise.all([
      Data.appearances(fixtureId),
      Data.matchEvents(fixtureId),
      Data.lineupForFixture(fixtureId),
    ]);

    // Who played: previous entry wins, else the published lineup
    let playedIds = new Set(existingApps.map(a => a.player_id));
    if (!playedIds.size && lineup?.slots) {
      lineup.slots.forEach(s => {
        if (s.player_id) playedIds.add(s.player_id);
        if (s.sub_player_id) playedIds.add(s.sub_player_id);
      });
    }

    const tally = {};
    State.players.forEach(p => {
      tally[p.id] = { goal: 0, assist: 0, yellow: 0, red: 0, own_goal: 0 };
    });
    existingEvents.forEach(e => { if (tally[e.player_id] && e.type in tally[e.player_id]) tally[e.player_id][e.type] = e.qty; });
    let motmId = existingEvents.find(e => e.type === 'motm')?.player_id || null;

    let ourScore   = fx.our_score ?? '';
    let theirScore = fx.their_score ?? '';

    /* ---- Validation ---- */
    const check = () => {
      const goals   = [...playedIds].reduce((a, id) => a + tally[id].goal, 0);
      const assists = [...playedIds].reduce((a, id) => a + tally[id].assist, 0);
      const us = parseInt(ourScore);
      const problems = [];
      const warnings = [];

      if (isNaN(us) || isNaN(parseInt(theirScore))) problems.push('Enter both scores.');
      if (!isNaN(us)) {
        if (goals > us) problems.push(`${goals} goals credited but Riverside scored ${us}. Too many.`);
        else if (goals < us) warnings.push(`${us - goals} goal${us - goals === 1 ? '' : 's'} unaccounted for. Fine if it was an own goal by them.`);
      }
      if (assists > goals) problems.push(`${assists} assists but only ${goals} goals. Too many.`);
      if (!playedIds.size) problems.push('Nobody is marked as having played.');
      if (!motmId) problems.push('Pick a man of the match.');
      return { problems, warnings, goals, assists };
    };

    const paint = () => {
      const { problems, warnings, goals, assists } = check();
      const squadIn  = State.players.filter(p => playedIds.has(p.id));
      const ok = problems.length === 0;

      app.innerHTML = `
        <section class="section" style="padding-top:22px">
          <div class="wrap">

            <div class="sticky-bar">
              <div class="sticky-left">
                <a class="btn btn-sm btn-quiet" href="#/fixture/${fixtureId}">&#8592; Back</a>
                <span class="sticky-title">vs ${esc(fx.opponent)}</span>
                <span class="tag draft">${esc(fx.competition)}</span>
              </div>
              <div class="score-entry">
                <label>Riverside</label>
                <input class="input score-box" type="number" min="0" id="rUs" value="${ourScore}">
                <span class="score-dash">&ndash;</span>
                <input class="input score-box" type="number" min="0" id="rThem" value="${theirScore}">
                <label>${esc(fx.opponent)}</label>
              </div>
              <button class="btn btn-primary" id="saveResult" ${ok ? '' : 'disabled'}>Save result</button>
            </div>

            ${problems.length ? `<div class="alert bad">
              ${problems.map(p => `<div>${esc(p)}</div>`).join('')}
            </div>` : ''}
            ${warnings.length ? `<div class="alert warn">
              ${warnings.map(w => `<div>${esc(w)}</div>`).join('')}
            </div>` : ''}

            <div class="section-head" style="margin-top:24px">
              <h2 class="h2">Who played</h2>
              <span class="side">${squadIn.length} player${squadIn.length === 1 ? '' : 's'}
                &middot; ${goals} goal${goals === 1 ? '' : 's'} &middot; ${assists} assist${assists === 1 ? '' : 's'}</span>
            </div>

            <button class="btn btn-sm" id="addPlayers" style="margin-bottom:14px">+ Add players</button>

            <div class="rows stat-rows">
              ${squadIn.length ? squadIn.map(p => `
                <div class="row stat-row">
                  <button class="mini red drop" data-drop="${p.id}" title="Remove">&#10005;</button>
                  ${UI.thumb(p)}
                  <span class="row-num">${p.squad_num}</span>
                  <span class="row-name">${esc(p.nickname || p.name)}</span>
                  <span class="pos ${p.position}">${p.position}</span>
                  <span class="counters">
                    ${[['goal','G'],['assist','A'],['yellow','Y'],['red','R']].map(([k,l]) => `
                      <span class="counter">
                        <span class="counter-k">${l}</span>
                        <button class="counter-b" data-dec="${p.id}:${k}">&minus;</button>
                        <span class="counter-n ${tally[p.id][k] ? 'on' : ''}">${tally[p.id][k]}</span>
                        <button class="counter-b" data-inc="${p.id}:${k}">+</button>
                      </span>`).join('')}
                    <button class="btn btn-sm ${motmId === p.id ? 'btn-red' : 'btn-quiet'} motm-b"
                      data-motm="${p.id}">MOTM</button>
                  </span>
                </div>`).join('')
                : '<div class="empty">Nobody added yet. Use + Add players.</div>'}
            </div>
          </div>
        </section>`;

      /* Score inputs */
      const us = document.getElementById('rUs'), them = document.getElementById('rThem');
      us.oninput   = () => { ourScore   = us.value;   refreshValidation(); };
      them.oninput = () => { theirScore = them.value; refreshValidation(); };

      // Update only the alerts and the save button, so typing doesn't lose focus
      const refreshValidation = () => {
        const { problems, warnings } = check();
        document.getElementById('saveResult').disabled = problems.length > 0;
        const wrap = document.querySelector('.wrap');
        wrap.querySelectorAll('.alert').forEach(a => a.remove());
        const bar = document.querySelector('.sticky-bar');
        if (warnings.length) bar.insertAdjacentHTML('afterend',
          `<div class="alert warn">${warnings.map(w => `<div>${esc(w)}</div>`).join('')}</div>`);
        if (problems.length) bar.insertAdjacentHTML('afterend',
          `<div class="alert bad">${problems.map(p => `<div>${esc(p)}</div>`).join('')}</div>`);
      };

      /* Counters */
      document.querySelectorAll('[data-inc]').forEach(b => b.onclick = () => {
        const [pid, k] = b.dataset.inc.split(':');
        tally[pid][k]++; paint();
      });
      document.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => {
        const [pid, k] = b.dataset.dec.split(':');
        tally[pid][k] = Math.max(0, tally[pid][k] - 1); paint();
      });
      document.querySelectorAll('[data-motm]').forEach(b => b.onclick = () => {
        motmId = motmId === b.dataset.motm ? null : b.dataset.motm; paint();
      });
      document.querySelectorAll('[data-drop]').forEach(b => b.onclick = () => {
        const pid = b.dataset.drop;
        playedIds.delete(pid);
        if (motmId === pid) motmId = null;
        tally[pid] = { goal: 0, assist: 0, yellow: 0, red: 0, own_goal: 0 };
        paint();
      });

      /* Add players */
      document.getElementById('addPlayers').onclick = () => {
        const avail = State.players.filter(p => !playedIds.has(p.id));
        UI.modal({
          title: 'Add players',
          sub: `${avail.length} not yet added`,
          body: avail.length
            ? `<input class="input search-box" id="apSearch" placeholder="Search name or number" autocomplete="off">
               <div id="apResults">${avail.map(p => `
                 <div class="pick-row" data-ap="${p.id}" data-search="${
                   esc((p.name + ' ' + (p.nickname || '') + ' ' + p.squad_num).toLowerCase())}">
                   ${UI.thumb(p)}
                   <span class="row-num">${p.squad_num}</span>
                   <span class="pick-name">${esc(p.nickname || p.name)}</span>
                   <span class="pos ${p.position}">${p.position}</span>
                 </div>`).join('')}</div>`
            : '<div class="empty">Everyone is already added.</div>',
          footer: `<button class="btn btn-quiet" data-x>Done</button>`,
        });
        document.querySelector('[data-x]').onclick = () => { UI.closeModal(); paint(); };
        UI.wireSearch('apSearch', 'apResults', avail, 'data-ap', el => {
          playedIds.add(el.dataset.ap);
          el.style.display = 'none';   // stay open so several can be added
        });
      };

      /* Save */
      document.getElementById('saveResult').onclick = async () => {
        const { problems } = check();
        if (problems.length) return UI.toast(problems[0], true);
        const usN = parseInt(ourScore), themN = parseInt(theirScore);

        const events = [];
        playedIds.forEach(pid => {
          const t = tally[pid];
          ['goal','assist','yellow','red','own_goal'].forEach(k => {
            if (t[k] > 0) events.push({ player_id: pid, type: k, qty: t[k] });
          });
          if (themN === 0) events.push({ player_id: pid, type: 'clean_sheet', qty: 1 });
        });
        if (motmId) events.push({ player_id: motmId, type: 'motm', qty: 1 });

        const btn = document.getElementById('saveResult');
        btn.textContent = 'Saving...'; btn.disabled = true;
        try {
          await Data.saveMatchResult(fixtureId, {
            ourScore: usN, theirScore: themN,
            appearances: [...playedIds], events,
          });
          UI.toast('Result saved');
          location.hash = `#/fixture/${fixtureId}`;
        } catch (e) {
          btn.textContent = 'Save result'; btn.disabled = false;
          UI.toast(e.message, true);
        }
      };
    };

    paint();
  },

  /* ─────────── MATCH REPORT ─────────── */
  async report(app, fixtureId) {
    if (!this.guard(app)) return;
    const [fx, existing] = await Promise.all([Data.fixture(fixtureId), Data.report(fixtureId)]);
    if (!fx) return;

    app.innerHTML = `
      <section class="section">
        <div class="wrap-narrow reveal">
          <div class="label label-red">${UI.fmtDate(fx.kickoff_at, { year: true })}</div>
          <h1 class="h1">Match Report</h1>
          <a class="btn btn-sm btn-quiet" href="#/fixture/${fixtureId}" style="margin-top:12px">&#8592; Match Centre</a>

          <div class="field" style="margin-top:24px">
            <label>Headline</label>
            <input class="input" id="repTitle" value="${esc(existing?.title || '')}"
              placeholder="e.g. Riverside nick it late at the park">
          </div>
          <div class="field">
            <label>Report</label>
            <textarea class="input" id="repBody" style="min-height:340px"
              placeholder="Write it how you'd tell it in the group chat.">${esc(existing?.body || '')}</textarea>
          </div>
          <div class="btn-row">
            <button class="btn" id="repDraft">Save Draft</button>
            <button class="btn btn-red" id="repPub">
              ${existing?.is_published ? 'Update Published' : 'Publish'}</button>
          </div>
        </div>
      </section>`;

    const save = async pub => {
      const body = document.getElementById('repBody').value.trim();
      if (!body) return UI.toast('Write something first', true);
      try {
        await Data.saveReport({
          fixture_id: fixtureId,
          title: document.getElementById('repTitle').value.trim(),
          body,
          is_published: pub,
          author_id: State.profile.id,
        });
        UI.toast(pub ? 'Published' : 'Draft saved');
      } catch (e) { UI.toast(e.message, true); }
    };
    document.getElementById('repDraft').onclick = () => save(false);
    document.getElementById('repPub').onclick   = () => save(true);
  },

  /* ─────────── MEDIA ─────────── */
  async media(app, fixtureId = null) {
    if (!this.guard(app)) return;
    const [items, fixtures] = await Promise.all([
      Data.media(fixtureId),
      Data.fixtures({ order: 'desc' }),
    ]);

    app.innerHTML = `
      <section class="section">
        <div class="wrap reveal">
          <h1 class="h1">Media</h1>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:22px;margin-top:24px">
            <div style="border:1.5px solid var(--rule);border-radius:4px;padding:18px">
              <div class="label">Upload photos</div>
              <input class="input" type="file" id="upFile" accept="image/*" multiple style="padding:8px">
              <div class="field" style="margin-top:10px">
                <label>Link to fixture</label>
                <select class="input" id="upFx">
                  <option value="">General gallery</option>
                  ${fixtures.map(f => `<option value="${f.id}" ${fixtureId === f.id ? 'selected' : ''}>
                    ${UI.fmtDate(f.kickoff_at)} vs ${esc(f.opponent)}</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label>Caption</label>
                <input class="input" id="upCap" placeholder="Optional">
              </div>
              <button class="btn btn-primary btn-block" id="doUpload">Upload</button>
            </div>

            <div style="border:1.5px solid var(--rule);border-radius:4px;padding:18px">
              <div class="label">Embed a video</div>
              <div class="note" style="font-size:.78rem">
                <strong>Paste a link, don't upload</strong>
                YouTube, Vimeo or Instagram. Embedding costs no storage.
              </div>
              <div class="field">
                <label>Video URL</label>
                <input class="input" id="vidUrl" placeholder="https://youtube.com/watch?v=...">
              </div>
              <div class="field">
                <label>Link to fixture</label>
                <select class="input" id="vidFx">
                  <option value="">General gallery</option>
                  ${fixtures.map(f => `<option value="${f.id}">
                    ${UI.fmtDate(f.kickoff_at)} vs ${esc(f.opponent)}</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label>Caption</label>
                <input class="input" id="vidCap" placeholder="Optional">
              </div>
              <button class="btn btn-primary btn-block" id="doEmbed">Add Video</button>
            </div>
          </div>

          <div class="section-head" style="margin-top:34px"><h2>Library</h2>
            <span class="side">${items.length} items</span></div>
          ${items.length ? `<div class="media-grid">${items.map(m => `
            <div style="position:relative">
              ${Views._media(m)}
              <button class="btn btn-sm btn-red" data-delm="${m.id}"
                style="position:absolute;top:8px;right:8px;padding:3px 9px;min-height:0;font-size:.7rem">Delete</button>
            </div>`).join('')}</div>` : '<div class="empty">Nothing yet.</div>'}
        </div>
      </section>`;

    document.getElementById('doUpload').onclick = async () => {
      const files = document.getElementById('upFile').files;
      if (!files.length) return UI.toast('Choose a file', true);
      const fxId = document.getElementById('upFx').value || null;
      const cap  = document.getElementById('upCap').value.trim() || null;
      let n = 0;
      try {
        for (const f of files) {
          UI.toast(`Uploading ${++n} of ${files.length}...`);
          const url = await Data.uploadImage(f);
          await Data.addMedia({ type: 'image', url, caption: cap, fixture_id: fxId });
        }
        UI.toast(`${files.length} uploaded`);
        Router.render();
      } catch (e) { UI.toast(e.message, true); }
    };

    document.getElementById('doEmbed').onclick = async () => {
      const url = document.getElementById('vidUrl').value.trim();
      if (!url) return UI.toast('Paste a URL', true);
      try {
        await Data.addMedia({
          type: 'video', url,
          caption: document.getElementById('vidCap').value.trim() || null,
          fixture_id: document.getElementById('vidFx').value || null,
        });
        UI.toast('Video added');
        Router.render();
      } catch (e) { UI.toast(e.message, true); }
    };

    document.querySelectorAll('[data-delm]').forEach(b => b.onclick = async () => {
      if (!confirm('Delete this item?')) return;
      try { await Data.deleteMedia(b.dataset.delm); UI.toast('Deleted'); Router.render(); }
      catch (e) { UI.toast(e.message, true); }
    });
  },

  /* ─────────── SQUAD MANAGEMENT ─────────── */
  async squad(app) {
    if (!this.guard(app)) return;
    const withPhoto = State.players.filter(p => p.photo_url).length;

    app.innerHTML = `
      <section class="section">
        <div class="wrap reveal">
          <div class="label label-red">Captains</div>
          <h1 class="h1" style="margin:8px 0 0">Squad</h1>

          <div class="note" style="margin-top:22px">
            <strong>Positions were guessed from the WhatsApp list</strong>
            Fix them here. Position changes fantasy scoring: a defender's goal is worth 7, a midfielder's 5.
          </div>

          <div class="section-head" style="margin-top:30px">
            <h2 class="h2">Players</h2>
            <span class="side">${withPhoto} of ${State.players.length} have photos</span>
          </div>

          <button class="btn btn-sm btn-primary" id="addP" style="margin-bottom:16px">+ Add player</button>

          <div class="rows">
            ${squadOnly().map(p => `
              <div class="row">
                ${UI.thumb(p)}
                <span class="row-num">${p.squad_num}</span>
                <span class="row-name">${esc(p.name)}${p.nickname
                  ? `<span style="color:var(--ink-3);font-weight:400"> &middot; ${esc(p.nickname)}</span>` : ''}</span>
                <span class="pos ${p.position}">${p.position}</span>
                ${!p.photo_url ? '<span class="tag draft">No photo</span>' : ''}
                <button class="mini" data-editp="${p.id}">Edit</button>
              </div>`).join('')}
          </div>

          ${guestsOnly().length ? `
          <div class="section-head" style="margin-top:34px">
            <h2 class="h2">Guests</h2>
            <span class="side">${guestsOnly().length} &middot; one-off ringers</span>
          </div>
          <div class="note">
            Guests can play and score, but they stay off the Squad page and out of fantasy.
            Promote one to the squad if they start turning up regularly.
          </div>
          <div class="rows">
            ${guestsOnly().map(p => `
              <div class="row">
                <span class="row-name">${esc(p.name)}</span>
                <span class="pos ${p.position}">${p.position}</span>
                <button class="mini" data-promote="${p.id}">Make a squad member</button>
                <button class="mini" data-editp="${p.id}">Edit</button>
              </div>`).join('')}
          </div>` : ''}
        </div>
      </section>

      <section class="section">
        <div class="wrap reveal">
          <div class="section-head"><h2 class="h2">Home page photo</h2></div>
          <p class="lede" style="margin-bottom:18px">
            The big image behind the club name. A wide team shot works best.
            Leave it alone to keep the 2026 squad photo that ships with the site.
          </p>
          <div class="photo-drop" style="max-width:520px">
            <div id="heroBox"><div class="photo-preview-ph">BP</div></div>
            <div style="flex:1">
              <input type="file" id="heroFile" accept="image/*" style="font-size:.72rem;width:100%">
              <div class="btn-row" style="margin-top:9px">
                <button class="btn btn-sm btn-primary" id="heroSave">Upload</button>
                <button class="btn btn-sm" id="heroReset">Reset to default</button>
              </div>
            </div>
          </div>
        </div>
      </section>`;

    document.getElementById('addP').onclick = () => this.playerModal();
    document.querySelectorAll('[data-editp]').forEach(b =>
      b.onclick = () => this.playerModal(Data.player(b.dataset.editp)));

    document.querySelectorAll('[data-promote]').forEach(b => b.onclick = async () => {
      const p = Data.player(b.dataset.promote);
      const num = prompt(`Shirt number for ${p.name}?`);
      const n = parseInt(num);
      if (!n) return;
      if (State.players.some(x => x.squad_num === n && x.id !== p.id))
        return UI.toast('That number is taken', true);
      try {
        await Data.savePlayer({ id: p.id, squad_num: n, name: p.name,
          nickname: p.nickname, position: p.position, photo_url: p.photo_url,
          is_guest: false });
        await Data.loadCore();
        UI.toast(`${p.name} is in the squad`);
        Router.render();
      } catch (e) { UI.toast(e.message, true); }
    });

    // Hero preview of whatever is currently set
    const current = await Data.setting('hero_image');
    document.getElementById('heroBox').innerHTML =
      `<img class="photo-preview" src="${esc(current || 'images/team-2026.jpg')}" alt="">`;

    const heroFile = document.getElementById('heroFile');
    heroFile.onchange = () => {
      const f = heroFile.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = e => {
        document.getElementById('heroBox').innerHTML =
          `<img class="photo-preview" src="${e.target.result}" alt="">`;
      };
      r.readAsDataURL(f);
    };

    document.getElementById('heroSave').onclick = async () => {
      const f = heroFile.files[0];
      if (!f) return UI.toast('Choose an image first', true);
      const btn = document.getElementById('heroSave');
      btn.textContent = 'Uploading...'; btn.disabled = true;
      try {
        const url = await Data.uploadImage(f, 'club');
        await Data.setSetting('hero_image', url);
        UI.toast('Home page photo updated');
        Router.render();
      } catch (e) {
        btn.textContent = 'Upload'; btn.disabled = false;
        UI.toast(e.message, true);
      }
    };

    document.getElementById('heroReset').onclick = async () => {
      try {
        await Data.setSetting('hero_image', '');
        UI.toast('Back to the default photo');
        Router.render();
      } catch (e) { UI.toast(e.message, true); }
    };
  },

  playerModal(p = null) {
    let photoUrl = p?.photo_url || '';

    UI.modal({
      title: p ? 'Edit player' : 'Add player',
      body: `
        <div class="photo-drop">
          <div id="photoBox">
            ${photoUrl
              ? `<img class="photo-preview" src="${esc(photoUrl)}" alt="">`
              : `<div class="photo-preview-ph">${p ? UI.initials(p.name) : '?'}</div>`}
          </div>
          <div style="flex:1;min-width:0">
            <div class="label" style="margin-bottom:6px">Player photo</div>
            <input type="file" id="pFile" accept="image/*" style="font-size:.72rem;width:100%">
            <div style="font-size:.68rem;color:var(--ink-3);margin-top:5px">
              Square-ish headshots work best. Uploads on save.
            </div>
            ${photoUrl ? `<button class="mini red" id="pClearPhoto" style="margin-top:7px">Remove photo</button>` : ''}
          </div>
        </div>

        <div class="frow">
          <div class="field" style="max-width:92px">
            <label>Number</label>
            <input class="input" type="number" id="pNum" min="1" max="99" value="${p?.squad_num ?? ''}">
          </div>
          <div class="field">
            <label>Full name</label>
            <input class="input" id="pName" value="${esc(p?.name || '')}">
          </div>
        </div>
        <div class="frow">
          <div class="field">
            <label>Nickname</label>
            <input class="input" id="pNick" value="${esc(p?.nickname || '')}" placeholder="Shown on the pitch">
          </div>
          <div class="field" style="max-width:110px">
            <label>Position</label>
            <select class="input" id="pPos">
              ${['GK','DEF','MID','ATT'].map(v =>
                `<option value="${v}" ${p?.position === v ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </div>
        </div>`,
      footer: `${p ? '<button class="btn btn-sm" data-retire style="color:var(--red);border-color:var(--red)">Retire</button>' : ''}
               <button class="btn" data-x>Cancel</button>
               <button class="btn btn-primary" data-save>Save</button>`,
    });

    // Live preview when a file is chosen
    const fileEl = document.getElementById('pFile');
    fileEl.onchange = () => {
      const f = fileEl.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = e => {
        document.getElementById('photoBox').innerHTML =
          `<img class="photo-preview" src="${e.target.result}" alt="">`;
      };
      r.readAsDataURL(f);
    };

    document.getElementById('pClearPhoto')?.addEventListener('click', () => {
      photoUrl = '';
      fileEl.value = '';
      document.getElementById('photoBox').innerHTML =
        `<div class="photo-preview-ph">${p ? UI.initials(p.name) : '?'}</div>`;
      UI.toast('Photo will be removed on save');
    });

    document.querySelector('[data-x]').onclick = () => UI.closeModal();

    document.querySelector('[data-retire]')?.addEventListener('click', async () => {
      if (!confirm(`Retire ${p.name}? Their past stats stay on record.`)) return;
      try {
        await Data.retirePlayer(p.id);
        await Data.loadCore();
        UI.closeModal(); UI.toast('Retired'); Router.render();
      } catch (e) { UI.toast(e.message, true); }
    });

    document.querySelector('[data-save]').onclick = async () => {
      const name = document.getElementById('pName').value.trim();
      const num  = parseInt(document.getElementById('pNum').value);
      if (!name || !num) return UI.toast('Number and name required', true);

      const btn = document.querySelector('[data-save]');
      btn.textContent = 'Saving...';
      btn.disabled = true;

      try {
        // Upload the new photo first, if one was chosen.
        // Data.uploadImage resizes in the browser before sending.
        const f = fileEl.files[0];
        if (f) {
          btn.textContent = f.size > 1_000_000 ? 'Compressing...' : 'Uploading...';
          photoUrl = await Data.uploadImage(f, 'players');
        }

        const payload = {
          squad_num: num,
          name,
          nickname: document.getElementById('pNick').value.trim() || null,
          position: document.getElementById('pPos').value,
          photo_url: photoUrl || null,
          is_guest: p ? !!p.is_guest : false,   // editing must not silently promote a guest
        };
        if (p) payload.id = p.id;

        await Data.savePlayer(payload);
        await Data.loadCore();
        UI.closeModal();
        UI.toast('Saved');
        Router.render();
      } catch (e) {
        btn.textContent = 'Save';
        btn.disabled = false;
        UI.toast(e.message, true);
      }
    };
  },

  /* ─────────── PEOPLE & ROLES ─────────── */
  async people(app) {
    if (!this.guard(app)) return;
    const [{ data: profiles }, pendingMedia] = await Promise.all([
      sb.from('profiles').select('*').order('created_at'),
      Data.pendingMedia(),
    ]);

    // Guest fantasy managers are anonymous accounts. They are never
    // approved and never will be, so they don't belong in a queue that
    // means "decide about this person". They get their own list, where a
    // captain can name them and link them to a squad player.
    const all      = profiles || [];
    const guests   = all.filter(p => p.is_anonymous);
    const real     = all.filter(p => !p.is_anonymous);
    const pending  = real.filter(p => !p.is_approved);
    const approved = real.filter(p => p.is_approved);

    const nameInput = pr => `<input class="input" data-name="${pr.id}"
      value="${esc(pr.display_name || '')}" placeholder="Unnamed"
      style="min-width:140px;flex:1;padding:5px 7px;font-size:.78rem">`;

    const linkSelect = pr => `<select class="input" data-link="${pr.id}"
      style="width:170px;padding:5px 7px;font-size:.78rem">
      <option value="">Not linked</option>
      ${State.players.map(p =>
        `<option value="${p.id}" ${pr.player_id === p.id ? 'selected' : ''}>#${p.squad_num} ${esc(p.name)}</option>`).join('')}
    </select>`;

    const delButton = pr => `<button class="mini red" data-delacct="${pr.id}"
      data-who="${esc(pr.display_name || 'this account')}"
      data-admin="${pr.role === 'admin' ? 1 : 0}">Delete account</button>`;

    app.innerHTML = `
      <section class="section" style="padding-top:22px">
        <div class="wrap">
          <div class="label label-red">Captains</div>
          <h1 class="h1" style="margin:8px 0 0">People</h1>

          ${pending.length ? `
          <div class="section-head" style="margin-top:30px">
            <h2 class="h2">Waiting for approval</h2>
            <span class="side">${pending.length} new</span>
          </div>
          <div class="note">
            <strong>Nobody gets in automatically</strong>
            Until you approve someone they can browse the site but not post photos or comment.
          </div>
          <div class="rows">
            ${pending.map(pr => `
              <div class="row" style="flex-wrap:wrap;gap:8px">
                ${nameInput(pr)}
                <button class="btn btn-sm btn-primary" data-approve="${pr.id}">Approve</button>
                <button class="mini" data-reject="${pr.id}">Leave pending</button>
                ${delButton(pr)}
              </div>`).join('')}
          </div>` : ''}

          ${pendingMedia.length ? `
          <div class="section-head" style="margin-top:34px">
            <h2 class="h2">Photos waiting</h2>
            <span class="side">${pendingMedia.length} to review</span>
          </div>
          <div class="media-grid">
            ${pendingMedia.map(m => `
              <div>
                ${Views._media(m)}
                <div class="btn-row" style="margin-top:8px">
                  <button class="btn btn-sm btn-primary" data-okmedia="${m.id}">Publish</button>
                  <button class="mini red" data-nomedia="${m.id}">Bin it</button>
                </div>
                <div class="card-sub">From ${esc(m.submitter?.display_name || 'someone')}</div>
              </div>`).join('')}
          </div>` : ''}

          <div class="section-head" style="margin-top:34px">
            <h2 class="h2">Everyone</h2>
            <span class="side">${approved.length} approved</span>
          </div>
          <div class="note">
            Link each account to a squad player so their name shows up properly.
            Promote the other captains to admin so they can edit lineups.
          </div>
          <div class="rows">
            ${approved.length ? approved.map(pr => `
              <div class="row" style="flex-wrap:wrap;gap:8px">
                ${nameInput(pr)}
                <select class="input" data-role="${pr.id}" style="width:110px;padding:5px 7px;font-size:.78rem">
                  ${['viewer','player','admin'].map(r =>
                    `<option value="${r}" ${pr.role === r ? 'selected' : ''}>${r}</option>`).join('')}
                </select>
                ${linkSelect(pr)}
                ${delButton(pr)}
              </div>`).join('') : '<div class="empty">Nobody approved yet.</div>'}
          </div>

          ${guests.length ? `
          <div class="section-head" style="margin-top:34px">
            <h2 class="h2">Guest managers</h2>
            <span class="side">${guests.length} playing fantasy</span>
          </div>
          <div class="note">
            <strong>Fantasy only</strong>
            These signed up without an account. They can never post photos or
            comment, approved or not, so there is nothing to decide here.
            Name them and link them to a squad player if you know who they are.
          </div>
          <div class="rows">
            ${guests.map(pr => `
              <div class="row" style="flex-wrap:wrap;gap:8px">
                ${nameInput(pr)}
                <span class="tag draft">guest</span>
                ${linkSelect(pr)}
                ${delButton(pr)}
              </div>`).join('')}
          </div>` : ''}

          <div class="note" style="margin-top:28px">
            <strong>Deleting an account cannot be undone</strong>
            It removes the sign-in, the profile and their fantasy team, squad
            and transfer history. Photos, comments and match reports they
            added stay on the site, without their name on them.
          </div>
        </div>
      </section>`;

    // .select() so we can tell a blocked write from a real one: row-level
    // security makes a forbidden update match zero rows, which PostgREST
    // reports as a success with an empty array. These handlers don't catch,
    // so a blocked write is toasted rather than thrown.
    const upd = async (id, patch) => {
      const { data, error } = await sb.from('profiles').update(patch).eq('id', id).select();
      if (error) UI.toast(error.message, true);
      else if (!data || !data.length) UI.toast('Update blocked, check permissions', true);
      else UI.toast('Updated');
    };
    document.querySelectorAll('[data-role]').forEach(sel =>
      sel.onchange = () => upd(sel.dataset.role, { role: sel.value }));
    document.querySelectorAll('[data-link]').forEach(sel =>
      sel.onchange = () => upd(sel.dataset.link, { player_id: sel.value || null }));

    // Names save on the way out of the field, and on Enter. Tracking the
    // last saved value means tabbing through the list writes nothing.
    // input[...] rather than a bare attribute selector: other admin pages
    // use data-name on buttons, and this one shouldn't care.
    document.querySelectorAll('input[data-name]').forEach(input => {
      let saved = input.value;
      const save = async () => {
        if (input.value === saved) return;
        const attempt = input.value;
        try {
          await Data.saveProfileName(input.dataset.name, attempt);
          saved = attempt;
          UI.toast('Name updated');
        } catch (e) {
          input.value = saved;      // put the old name back rather than lie
          UI.toast(e.message, true);
        }
      };
      input.onblur = save;
      input.onkeydown = e => { if (e.key === 'Enter') input.blur(); };
    });

    document.querySelectorAll('[data-delacct]').forEach(b => b.onclick = async () => {
      const who  = b.dataset.who;
      const warn = b.dataset.admin === '1'
        ? `\n\n${who} is a CAPTAIN. They lose admin access and their sign-in.` : '';
      if (!confirm(
        `Delete ${who}?${warn}\n\n` +
        'This removes their sign-in, their profile and their fantasy team, ' +
        'squad and transfer history.\n\n' +
        'Photos, comments and reports they added stay on the site without ' +
        'their name.\n\nThis cannot be undone.')) return;
      try {
        const res = await Data.deleteUserAccount(b.dataset.delacct);
        UI.toast(res?.teams_deleted ? `Deleted ${who} and their fantasy team` : `Deleted ${who}`);
        Router.render();
      } catch (e) { UI.toast(e.message, true); }
    });

    document.querySelectorAll('[data-approve]').forEach(b => b.onclick = async () => {
      try { await Data.approveProfile(b.dataset.approve, true); UI.toast('Approved'); Router.render(); }
      catch (e) { UI.toast(e.message, true); }
    });
    document.querySelectorAll('[data-reject]').forEach(b => b.onclick = async () => {
      if (!confirm('Leave this account pending? They can browse but never post.')) return;
      try { await Data.approveProfile(b.dataset.reject, false); UI.toast('Left pending'); Router.render(); }
      catch (e) { UI.toast(e.message, true); }
    });
    document.querySelectorAll('[data-okmedia]').forEach(b => b.onclick = async () => {
      try { await Data.approveMedia(b.dataset.okmedia, true); UI.toast('Published'); Router.render(); }
      catch (e) { UI.toast(e.message, true); }
    });
    document.querySelectorAll('[data-nomedia]').forEach(b => b.onclick = async () => {
      if (!confirm('Delete this submission?')) return;
      try { await Data.deleteMedia(b.dataset.nomedia); UI.toast('Deleted'); Router.render(); }
      catch (e) { UI.toast(e.message, true); }
    });
  },
};
