/* ═══════════════════════════════════════════════════════════
   LINEUP — pitch rendering, drag to reposition, sub assignment.
   Used read-only on the public fixture page, editable in admin.
   ═══════════════════════════════════════════════════════════ */

const PITCH_SVG = `
<svg class="pitch-svg" viewBox="0 0 520 800" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="grassGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2d6e35"/><stop offset="50%" stop-color="#2a6532"/>
      <stop offset="100%" stop-color="#2d6e35"/>
    </linearGradient>
    <pattern id="stripes" width="80" height="80" patternUnits="userSpaceOnUse">
      <rect width="40" height="80" fill="rgba(255,255,255,0.04)"/>
    </pattern>
  </defs>
  <rect width="520" height="800" fill="url(#grassGrad)"/>
  <rect width="520" height="800" fill="url(#stripes)"/>
  <rect x="28" y="28" width="464" height="744" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="2.5" rx="2"/>
  <line x1="28" y1="400" x2="492" y2="400" stroke="rgba(255,255,255,.85)" stroke-width="2.5"/>
  <circle cx="260" cy="400" r="72" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="2.5"/>
  <circle cx="260" cy="400" r="5" fill="rgba(255,255,255,.9)"/>
  <rect x="110" y="28" width="300" height="130" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="2.5"/>
  <rect x="180" y="28" width="160" height="54" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="2"/>
  <circle cx="260" cy="123" r="5" fill="rgba(255,255,255,.9)"/>
  <path d="M 175 158 A 90 90 0 0 0 345 158" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="2"/>
  <rect x="110" y="642" width="300" height="130" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="2.5"/>
  <rect x="180" y="718" width="160" height="54" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="2"/>
  <circle cx="260" cy="677" r="5" fill="rgba(255,255,255,.9)"/>
  <path d="M 175 642 A 90 90 0 0 1 345 642" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="2"/>
  <rect x="200" y="14" width="120" height="16" fill="rgba(255,255,255,.18)" stroke="rgba(255,255,255,.9)" stroke-width="2" rx="2"/>
  <rect x="200" y="770" width="120" height="16" fill="rgba(255,255,255,.18)" stroke="rgba(255,255,255,.9)" stroke-width="2" rx="2"/>
  <path d="M 28 50 A 22 22 0 0 0 50 28" fill="none" stroke="rgba(255,255,255,.65)" stroke-width="2"/>
  <path d="M 492 50 A 22 22 0 0 1 470 28" fill="none" stroke="rgba(255,255,255,.65)" stroke-width="2"/>
  <path d="M 28 750 A 22 22 0 0 1 50 772" fill="none" stroke="rgba(255,255,255,.65)" stroke-width="2"/>
  <path d="M 492 750 A 22 22 0 0 0 470 772" fill="none" stroke="rgba(255,255,255,.65)" stroke-width="2"/>
</svg>`;

const isDark = hex => {
  if (!hex || hex.length < 7) return false;
  const c = hex.replace('#','');
  const [r,g,b] = [0,2,4].map(i => parseInt(c.substr(i,2),16));
  return (r*299 + g*587 + b*114) / 1000 < 140;
};
const gkColour = hex => isDark(hex) ? '#f4b400' : '#16150f';

const Lineup = {

  /* Renders a pitch. opts:
     { formation, jerseyColor, slots:[{slot_index,slot_label,player_id,x,y,sub_player_id}],
       editable, availablePlayers, onChange } */
  render(container, opts) {
    const {
      formation = '4-4-2',
      jerseyColor = '#c8102e',
      slots = [],
      editable = false,
      availablePlayers = [],
      onChange = () => {},
    } = opts;

    const def = CONFIG.FORMATIONS[formation] || CONFIG.FORMATIONS['4-4-2'];
    const slotByIndex = {};
    slots.forEach(s => { slotByIndex[s.slot_index] = s; });

    container.innerHTML = `
      <div class="pitch-shell">
        <div class="pitch-container">
          ${PITCH_SVG}
          <div class="pitch-formation-label">${esc(formation)}</div>
          <div class="pitch-players"></div>
        </div>
        ${editable ? `<div class="pitch-toolbar">
          <button class="btn btn-sm btn-quiet" data-reset hidden>&#8635; Reset positions</button>
        </div>` : ''}
      </div>`;

    const layer = container.querySelector('.pitch-players');
    const txt   = isDark(jerseyColor) ? '#fff' : '#0a0a0a';
    const gk    = gkColour(jerseyColor);
    const gkTxt = isDark(gk) ? '#fff' : '#000';

    let moved = false;

    def.forEach((base, i) => {
      const s = slotByIndex[i];

      if (s && s.player_id) {
        const p  = Data.player(s.player_id);
        const x  = s.x ?? base.x, y = s.y ?? base.y;
        if (Math.abs(x - base.x) > 0.5 || Math.abs(y - base.y) > 0.5) moved = true;

        const sub  = s.sub_player_id ? Data.player(s.sub_player_id) : null;
        const bg   = base.pos === 'GK' ? gk  : jerseyColor;
        const fg   = base.pos === 'GK' ? gkTxt : txt;

        const tok = document.createElement('div');
        tok.className = 'pitch-token';
        tok.style.left = x + '%';
        tok.style.top  = y + '%';
        tok.innerHTML = `
          <div class="tok-shirt ${base.pos === 'GK' ? 'gk' : ''}" style="background:${bg};color:${fg}">
            ${p ? p.squad_num : '?'}
            ${editable ? `<span class="tok-x" data-remove="${i}">&#10005;</span>` : ''}
          </div>
          <div class="tok-name">${esc(p ? (p.nickname || p.name) : 'Unknown')}</div>
          ${(sub || editable) ? `<div class="tok-sub ${sub ? '' : 'empty'}" data-sub="${i}"
            title="${sub ? 'Change sub' : 'Assign a sub'}">${
            sub ? `&#8593; ${esc(sub.nickname || sub.name)}` : '+'
          }</div>` : ''}
        `;

        if (editable) {
          this._drag(tok, container, i, slotByIndex, onChange);
          tok.querySelector('[data-remove]')?.addEventListener('pointerdown', e => {
            e.stopPropagation(); e.preventDefault();
            delete slotByIndex[i];
            onChange(Object.values(slotByIndex));
          });
        }
        tok.querySelector('[data-sub]')?.addEventListener('pointerdown', e => e.stopPropagation());
        tok.querySelector('[data-sub]')?.addEventListener('click', e => {
          e.stopPropagation();
          if (editable) this._subPicker(i, base, slotByIndex, availablePlayers, onChange);
        });

        layer.appendChild(tok);

      } else {
        const dz = document.createElement('div');
        dz.className = 'pitch-slot';
        dz.style.left = base.x + '%';
        dz.style.top  = base.y + '%';
        dz.innerHTML = `<span>${base.label}</span>`;

        if (editable) {
          dz.addEventListener('click', () =>
            this._playerPicker(i, base, slotByIndex, availablePlayers, onChange));
          dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
          dz.addEventListener('dragleave', () => dz.classList.remove('over'));
          dz.addEventListener('drop', e => {
            e.preventDefault(); dz.classList.remove('over');
            const pid = e.dataTransfer.getData('playerId');
            if (pid) this._place(i, base, pid, slotByIndex, onChange);
          });
        }
        layer.appendChild(dz);
      }
    });

    if (editable) {
      const btn = container.querySelector('[data-reset]');
      if (btn) {
        btn.hidden = !moved;
        btn.onclick = () => {
          Object.values(slotByIndex).forEach(s => {
            const b = def[s.slot_index];
            if (b) { s.x = b.x; s.y = b.y; }
          });
          onChange(Object.values(slotByIndex));
        };
      }
    }
  },

  _place(i, base, playerId, slotByIndex, onChange) {
    Object.keys(slotByIndex).forEach(k => {
      if (slotByIndex[k].player_id === playerId) delete slotByIndex[k];
    });
    slotByIndex[i] = {
      slot_index: i, slot_label: base.label,
      player_id: playerId, x: base.x, y: base.y, sub_player_id: null,
    };
    onChange(Object.values(slotByIndex));
  },

  _drag(token, container, i, slotByIndex, onChange) {
    let on = false, pid = null;
    token.addEventListener('pointerdown', e => {
      if (e.target.closest('.tok-x') || e.target.closest('.tok-sub')) return;
      e.preventDefault();
      on = true; pid = e.pointerId;
      token.setPointerCapture(pid);
      token.classList.add('moving');
    });
    token.addEventListener('pointermove', e => {
      if (!on || e.pointerId !== pid) return;
      e.preventDefault();
      const rect = container.querySelector('.pitch-container').getBoundingClientRect();
      const x = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100));
      token.style.left = x + '%'; token.style.top = y + '%';
      token._x = x; token._y = y;
    });
    const end = e => {
      if (!on || e.pointerId !== pid) return;
      on = false;
      token.classList.remove('moving');
      try { token.releasePointerCapture(pid); } catch (_) {}
      if (token._x != null && slotByIndex[i]) {
        slotByIndex[i].x = token._x;
        slotByIndex[i].y = token._y;
        onChange(Object.values(slotByIndex));
      }
    };
    token.addEventListener('pointerup', end);
    token.addEventListener('pointercancel', end);
  },

  _playerPicker(i, base, slotByIndex, pool, onChange) {
    const used = new Set(Object.values(slotByIndex).map(s => s.player_id));
    const free = pool.filter(p => !used.has(p.id))
      .sort((a, b) => (a.position === base.pos ? 0 : 1) - (b.position === base.pos ? 0 : 1)
                      || a.squad_num - b.squad_num);

    UI.modal({
      title: `Pick ${base.label}`,
      sub: `${free.length} available`,
      body: free.length
        ? `<input class="input search-box" id="pickSearch" placeholder="Search name or number" autocomplete="off">
           <div id="pickResults">${free.map(p => UI.pickRow(p, 'data-p')).join('')}</div>`
        : `<div class="empty">Nobody available. Mark players as In on the fixture page first.</div>`,
    });

    const choose = el => {
      this._place(i, base, el.dataset.p, slotByIndex, onChange);
      UI.closeModal();
    };
    UI.wireSearch('pickSearch', 'pickResults', free, 'data-p', choose);
  },

  _subPicker(i, base, slotByIndex, pool, onChange) {
    const slot = slotByIndex[i];
    if (!slot) return;

    const onPitch = new Set(Object.values(slotByIndex).map(s => s.player_id));
    const slotOf  = {};
    Object.values(slotByIndex).forEach(s => { slotOf[s.player_id] = s.slot_label; });

    const others  = pool.filter(p => p.id !== slot.player_id);
    const bench   = others.filter(p => !onPitch.has(p.id));
    const starters = others.filter(p => onPitch.has(p.id));

    const row = (p, at) => UI.pickRow(p, 'data-s', at);

    const ordered = [
      ...bench.sort((a,b) => (a.position === base.pos ? 0:1) - (b.position === base.pos ? 0:1) || a.squad_num - b.squad_num),
      ...starters.sort((a,b) => a.squad_num - b.squad_num),
    ];

    UI.modal({
      title: `Sub for ${base.label}`,
      sub: `Who plays ${base.label} after the change?`,
      body: `
        <input class="input search-box" id="subSearch" placeholder="Search name or number" autocomplete="off">
        <div id="subResults">
          ${bench.length ? `<div class="modal-divider">From the bench</div>${bench.map(p => row(p)).join('')}` : ''}
          ${starters.length ? `<div class="modal-divider">Positional swap</div>${starters.map(p => row(p, slotOf[p.id])).join('')}` : ''}
        </div>`,
      footer: slot.sub_player_id
        ? `<button class="btn btn-quiet" data-clear>Remove sub</button>`
        : '',
    });

    document.querySelector('[data-clear]')?.addEventListener('click', () => {
      slotByIndex[i].sub_player_id = null;
      onChange(Object.values(slotByIndex));
      UI.closeModal();
    });

    const chooseSub = el => {
      const pid = el.dataset.s || null;
      // one player can only be the after-sub for one slot
      if (pid) Object.values(slotByIndex).forEach(s => {
        if (s.sub_player_id === pid) s.sub_player_id = null;
      });
      slotByIndex[i].sub_player_id = pid;
      onChange(Object.values(slotByIndex));
      UI.closeModal();
    };
    UI.wireSearch('subSearch', 'subResults', ordered, 'data-s', chooseSub,
      pid => slotOf[pid] || null);
  },
};


/* ═══════════════════════════════════════════════════════════
   FANTASY PITCH — same pitch, different rules.
   No dragging, no subs. Each slot only accepts a player whose
   position matches the slot, so the formation you pick decides
   how many keepers, defenders, midfielders and attackers you need.
   ═══════════════════════════════════════════════════════════ */
/* A shirt, not a circle, so the squad number reads as a shirt number and
   can't be mistaken for points (which sit in the pill underneath, with
   "pts" on them). Club orange outfield, the usual dark keeper kit. */
const fantasyJersey = (num, isGk) => {
  const fill = isGk ? gkColour('#f18f1b') : 'var(--accent)';
  const txt  = isGk && !isDark(gkColour('#f18f1b')) ? '#16150f' : '#fff';
  const n = String(num ?? '');
  return `<svg class="fantasy-jersey" viewBox="0 0 40 40" aria-hidden="true">
    <path d="M14 4 L8 6.5 L2.5 12 L6.5 18.5 L10.5 16.5 L10.5 37 L29.5 37 L29.5 16.5 L33.5 18.5 L37.5 12 L32 6.5 L26 4 Q20 8.5 14 4 Z"
      fill="${fill}" stroke="rgba(255,255,255,0.92)" stroke-width="1.6" stroke-linejoin="round"/>
    <text x="20" y="${n.length > 2 ? 26.5 : 27.5}" text-anchor="middle" fill="${txt}"
      font-size="${n.length > 2 ? 10 : 12.5}"${n.length > 2 ? ' textLength="16" lengthAdjust="spacingAndGlyphs"' : ''}>${esc(n)}</text>
  </svg>`;
};

Lineup.renderFantasy = function (container, opts) {
  const {
    formation = '4-4-2',
    picks = {},          // slot_index -> player_id
    pts = {},            // player_id -> season points
    editable = true,
    onSlot = () => {},
    onPlayer = null,     // read-only pitches: tap a player to see his card
    pill = null,         // pid -> { text, dim, title }: a single match's view
  } = opts;

  const def = CONFIG.FORMATIONS[formation] || CONFIG.FORMATIONS['4-4-2'];

  container.innerHTML = `
    <div class="pitch-shell">
      <div class="pitch-container">
        ${PITCH_SVG}
        <div class="pitch-formation-label">${esc(formation)}</div>
        <div class="pitch-players"></div>
      </div>
    </div>`;

  const layer = container.querySelector('.pitch-players');

  def.forEach((base, i) => {
    const pid = picks[i];
    const p = pid ? Data.player(pid) : null;

    if (p) {
      const tok = document.createElement('div');
      tok.className = 'pitch-token fantasy-token';
      tok.style.left = base.x + '%';
      tok.style.top  = base.y + '%';
      tok.innerHTML = `
        ${fantasyJersey(p.squad_num, base.pos === 'GK')}
        <div class="tok-name">${esc(p.nickname || p.name)}</div>
        ${(() => {
          const o = pill ? pill(p.id) : null;
          return `<div class="tok-pts${o?.dim ? ' off' : ''}"${o?.title ? ` title="${esc(o.title)}"` : ''}>${
            o ? o.text : `${pts[p.id] ?? 0} pts`}</div>`;
        })()}`;
      if (pill && pill(p.id)?.dim) tok.classList.add('dim');
      if (editable) {
        tok.style.cursor = 'pointer';
        tok.onclick = () => onSlot(i, base, p);
      } else if (onPlayer) {
        tok.style.cursor = 'pointer';
        tok.onclick = () => onPlayer(p);
      }
      layer.appendChild(tok);
    } else {
      const dz = document.createElement('div');
      dz.className = 'pitch-slot fantasy-slot';
      dz.style.left = base.x + '%';
      dz.style.top  = base.y + '%';
      dz.innerHTML = `<span>${base.pos}</span>`;
      if (editable) dz.onclick = () => onSlot(i, base, null);
      layer.appendChild(dz);
    }
  });
};

/* How many of each position a formation needs */
Lineup.formationShape = function (formation) {
  const def = CONFIG.FORMATIONS[formation] || [];
  const c = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  def.forEach(s => c[s.pos]++);
  return c;
};
