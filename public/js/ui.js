/* ═══════════════════════════════════════════════════════════
   UI HELPERS
   ═══════════════════════════════════════════════════════════ */

const esc = s => String(s ?? '').replace(/[&<>"']/g, m =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));

const UI = {

  // Thin top progress bar shown while a route loads
  progress(on) {
    let bar = document.getElementById('progressBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'progressBar';
      bar.className = 'progress-bar';
      document.body.appendChild(bar);
    }
    if (on) {
      bar.classList.remove('done');
      bar.classList.add('busy');
    } else {
      bar.classList.remove('busy');
      bar.classList.add('done');
      setTimeout(() => bar.classList.remove('done'), 300);
    }
  },

  // Sponsor marks in the footer, drawn once at boot
  renderFooterSponsors() {
    const el = document.getElementById('footerSponsors');
    if (!el || !CONFIG.SPONSORS?.length) return;
    el.innerHTML = CONFIG.SPONSORS.map(sp => `
      <a class="sponsor-mark" href="${esc(sp.url)}" target="_blank" rel="noopener"
         title="${esc(sp.name)}">
        ${sp.logo
          ? `<img src="${esc(sp.logo)}" alt="${esc(sp.name)}">`
          : `<span>${esc(sp.name)}</span>`}
      </a>`).join('');
  },

  // Copy to the clipboard. The async API needs a secure context, which
  // rules out plain-http previews, so fall back to the old selection trick.
  async copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      this.toast('Copied');
      return true;
    } catch (_) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        this.toast(ok ? 'Copied' : 'Select the link and copy it', !ok);
        return ok;
      } catch (__) {
        this.toast('Select the link and copy it', true);
        return false;
      }
    }
  },

  toast(msg, isError = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.toggle('err', isError);
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2600);
  },

  modal({ title, sub, body, footer, wide = false }) {
    const overlay = document.getElementById('modal');
    const inner   = document.getElementById('modalInner');
    inner.className = 'modal' + (wide ? ' wide' : '');
    inner.innerHTML = `
      <div class="modal-head">
        <div>
          <h3>${esc(title)}</h3>
          ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
        </div>
        <button class="modal-close" data-close>&#10005;</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    `;
    overlay.classList.add('show');
    inner.querySelector('[data-close]').onclick = () => this.closeModal();
    return inner;
  },

  closeModal() { document.getElementById('modal').classList.remove('show'); },

  /* ---------- FORMATTING ---------- */
  fmtDate(iso, opts = {}) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', {
      weekday: opts.weekday || undefined,
      day: 'numeric', month: 'short',
      year: opts.year ? 'numeric' : undefined,
    });
  },

  fmtTime(iso) {
    return new Date(iso).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  },

  fmtDateTime(iso) { return `${this.fmtDate(iso, { weekday: 'short' })} · ${this.fmtTime(iso)}`; },

  fmtRelative(iso) {
    const diff = new Date(iso) - Date.now();
    if (diff < 0) return 'Kicked off';
    const days  = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    if (days > 1)  return `${days} days`;
    if (days === 1) return `Tomorrow`;
    if (hours > 1) return `${hours} hours`;
    return 'Today';
  },

  resultLetter(fx) {
    if (fx.our_score == null || fx.their_score == null) return null;
    if (fx.our_score > fx.their_score) return 'W';
    if (fx.our_score < fx.their_score) return 'L';
    return 'D';
  },

  // The scores are always stored our way round: our_score is Riverside.
  // Anything that renders a home-v-away scoreline resolves them here, so the
  // names and the numbers can never end up swapped independently.
  matchSides(fx) {
    const away    = fx.home_away === 'away';
    const neutral = fx.home_away === 'neutral';
    return {
      homeName:  away ? fx.opponent : 'Riverside',
      awayName:  away ? 'Riverside' : fx.opponent,
      homeScore: away ? fx.their_score : fx.our_score,
      awayScore: away ? fx.our_score : fx.their_score,
      homeLabel: neutral ? 'Neutral' : 'Home',
      awayLabel: neutral ? 'Neutral' : 'Away',
    };
  },

  // Competitive only: friendlies count for nothing towards form or the record.
  isCompetitive(fx) {
    return fx.competition !== 'Friendly';
  },

  initials(name) {
    return String(name).split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  },

  // A single selectable player row inside a picker modal
  pickRow(p, attr, atLabel) {
    return `<div class="pick-row" ${attr}="${p.id}" data-search="${
      esc((p.name + ' ' + (p.nickname || '') + ' ' + p.squad_num).toLowerCase())}">
      ${this.thumb(p)}
      <span class="row-num">${p.squad_num}</span>
      <span class="pick-name">${esc(p.nickname || p.name)}</span>
      <span class="pos ${p.position}">${p.position}</span>
      ${atLabel ? `<span class="at-tag">at ${esc(atLabel)}</span>` : ''}
    </div>`;
  },

  // Live-filter a picker list. Keeps click handlers working after filtering
  // by delegating from the container rather than binding each row.
  wireSearch(inputId, listId, players, attr, onPick, atLabelFor) {
    const input = document.getElementById(inputId);
    const list  = document.getElementById(listId);
    if (!list) return;

    // Delegate clicks so filtering never detaches handlers
    list.addEventListener('click', e => {
      const row = e.target.closest(`[${attr}]`);
      if (row) onPick(row);
    });

    if (!input) return;
    input.focus();
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) {
        list.querySelectorAll('[data-search]').forEach(r => r.style.display = '');
        list.querySelectorAll('.modal-divider').forEach(d => d.style.display = '');
        return;
      }
      list.querySelectorAll('.modal-divider').forEach(d => d.style.display = 'none');
      let hits = 0;
      list.querySelectorAll('[data-search]').forEach(r => {
        const match = r.dataset.search.includes(q);
        r.style.display = match ? '' : 'none';
        if (match) hits++;
      });
      let none = list.querySelector('.no-hits');
      if (!hits && !none) {
        none = document.createElement('div');
        none.className = 'empty no-hits';
        none.textContent = 'No player matches that.';
        list.appendChild(none);
      } else if (none) {
        none.style.display = hits ? 'none' : '';
      }
    });
    // Enter picks the only visible match
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const visible = [...list.querySelectorAll('[data-search]')].filter(r => r.style.display !== 'none');
      if (visible.length === 1) onPick(visible[0]);
    });
  },

  // Small round player avatar, falls back to initials
  thumb(p) {
    if (!p) return '';
    return p.photo_url
      ? `<img class="thumb" src="${esc(p.photo_url)}" alt="" loading="lazy">`
      : `<span class="thumb-ph">${this.initials(p.name)}</span>`;
  },

  /* ---------- VIDEO EMBEDS ---------- */
  embedUrl(url) {
    // YouTube
    let m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/);
    if (m) return `https://www.youtube.com/embed/${m[1]}`;
    // Vimeo
    m = url.match(/vimeo\.com\/(\d+)/);
    if (m) return `https://player.vimeo.com/video/${m[1]}`;
    // Instagram
    m = url.match(/instagram\.com\/(?:p|reel)\/([\w-]+)/);
    if (m) return `https://www.instagram.com/p/${m[1]}/embed`;
    return url;
  },

  /* ---------- AUTH UI ---------- */
  refreshAuthUI() {
    const btn = document.getElementById('authBtn');
    const navBtn = document.getElementById('navAuthBtn');
    const navAdmin = document.getElementById('navAdmin');
    if (isSignedIn()) {
      // A guest manager has no email and may have no name until they've
      // typed one into the fantasy form.
      const name = State.profile?.display_name
        || State.session.user.email
        || (isGuest() ? 'Guest manager' : 'Account');
      const short = String(name).split('@')[0].slice(0, 14);
      btn.textContent = short;
      btn.classList.add('signed-in');
      if (navBtn) navBtn.textContent = `${short} — account`;
    } else {
      btn.textContent = 'Sign in';
      btn.classList.remove('signed-in');
      if (navBtn) navBtn.textContent = 'Sign in';
    }
    navAdmin.hidden = !isAdmin();
  },

  // What a guest manager gets instead of an account panel: their team, their
  // edit link, and the one way to turn this into a real account.
  async guestModal() {
    const team = await Data.myFantasyTeam();
    const token = team ? await Data.editToken(team.id) : null;
    const link = token ? Data.editLink(token) : null;

    this.modal({
      title: team ? team.name : 'Guest manager',
      sub: 'Playing as a guest',
      body: `
        <div class="field">
          <label>Manager</label>
          <div style="font-weight:600;">${esc(team?.manager_name || State.profile?.display_name || 'Guest')}</div>
        </div>
        ${link ? `
        <div class="field">
          <label>Your edit link</label>
          <div class="edit-link-row">
            <input class="input" id="editLinkInput" readonly value="${esc(link)}" onclick="this.select()">
            <button class="btn btn-primary" id="copyEditLink">Copy</button>
          </div>
        </div>
        <div class="note"><strong>Keep this link</strong>
          It's the only way to edit your team from another phone, and anyone
          who has it can edit the team.</div>` : `
        <div class="note"><strong>No team yet</strong>
          Head to Fantasy and create one.</div>`}
        <div class="note"><strong>Guests play fantasy only</strong>
          Photos and comments need a real account a captain has approved.</div>
      `,
      footer: `<button class="btn btn-quiet" data-x>Close</button>
               <button class="btn" id="guestGoogle">Sign in with Google</button>`,
    });

    document.querySelector('[data-x]').onclick = () => this.closeModal();

    const copy = document.getElementById('copyEditLink');
    if (copy) copy.onclick = () => this.copy(document.getElementById('editLinkInput').value);

    // Try to attach Google to this same guest account, so the team comes
    // along. Manual identity linking has to be switched on in the Supabase
    // dashboard; when it isn't, say so rather than signing them into a
    // different account and orphaning the team. The edit link covers it.
    document.getElementById('guestGoogle').onclick = async () => {
      const b = document.getElementById('guestGoogle');
      b.disabled = true; b.textContent = 'Opening Google...';
      Data.rememberReturn('#/fantasy');
      try {
        await Data.linkGoogle();
      } catch (e) {
        b.disabled = false; b.textContent = 'Sign in with Google';
        this.toast('Copy your edit link first, then sign in and open it.', true);
        console.warn('linkIdentity unavailable', e);
      }
    };
  },

  authModal() {
    // A guest fantasy manager has no account to show. Approval never applies
    // to them: fantasy doesn't ask, and media and comments are closed to
    // anonymous accounts in the database, approved or not.
    if (isSignedIn() && isGuest()) return this.guestModal();

    if (isSignedIn()) {
      this.modal({
        title: 'Account',
        sub: State.session.user.email,
        body: `
          <div class="field">
            <label>Role</label>
            <div style="font-weight:600;">${esc(State.profile?.role || 'viewer')}</div>
          </div>
          <div class="field">
            <label>Linked player</label>
            <div style="font-weight:600;">${
              State.profile?.player_id ? esc(Data.playerName(State.profile.player_id))
                                       : 'Not linked. Ask a captain to link you.'}</div>
          </div>
          <div class="field">
            <label>Status</label>
            <div style="font-weight:600;color:${isApproved() ? 'var(--green)' : 'var(--amber)'}">
              ${isApproved() ? 'Approved' : 'Waiting for a captain to approve you'}</div>
          </div>
          ${!isApproved() ? `<div class="note"><strong>Almost there</strong>
            Until a captain approves your account you can browse but not post photos or comment.</div>` : ''}
        `,
        footer: `<button class="btn btn-quiet" data-x>Close</button>
                 <button class="btn btn-red" data-out>Sign out</button>`,
      });
      document.querySelector('[data-x]').onclick = () => this.closeModal();
      document.querySelector('[data-out]').onclick = async () => {
        await Data.signOut();
        this.closeModal();
        this.toast('Signed out');
      };
      return;
    }

    this.modal({
      title: 'Sign in',
      sub: 'So the site knows who you are',
      body: `
        <button class="btn-google" id="googleBtn">
          <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
            <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1z"/>
            <path fill="#34A853" d="M24 46c6 0 11-2 14.6-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.7-3.9-12.4-9.1H4.3v5.7C7.9 41 15.4 46 24 46z"/>
            <path fill="#FBBC05" d="M11.6 28.1c-.4-1.3-.7-2.7-.7-4.1s.2-2.8.7-4.1v-5.7H4.3C2.8 17.1 2 20.4 2 24s.8 6.9 2.3 9.8l7.3-5.7z"/>
            <path fill="#EA4335" d="M24 10.8c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 4.1 30 2 24 2 15.4 2 7.9 7 4.3 14.2l7.3 5.7c1.7-5.2 6.6-9.1 12.4-9.1z"/>
          </svg>
          Continue with Google
        </button>

        <div class="or-line"><span>or use email</span></div>

        <div class="field">
          <label>Your name</label>
          <input class="input" id="authName" placeholder="e.g. Totti" autocomplete="name">
        </div>
        <div class="field">
          <label>Email</label>
          <input class="input" type="email" id="authEmail" placeholder="you@example.com" autocomplete="email">
        </div>
        <div class="note">
          <strong>New here?</strong>
          A captain approves new accounts before you can post photos or comment.
          Fixtures, results and stats are public either way.
        </div>
      `,
      footer: `<button class="btn btn-quiet" data-x>Cancel</button>
               <button class="btn btn-primary" data-go>Send link</button>`,
    });

    const emailEl = document.getElementById('authEmail');
    const nameEl  = document.getElementById('authName');

    document.getElementById('googleBtn').onclick = async () => {
      const b = document.getElementById('googleBtn');
      b.disabled = true;
      b.textContent = 'Opening Google...';
      try { await Data.signInWithGoogle(); }
      catch (e) { this.toast(e.message, true); Router.render(); }
    };

    document.querySelector('[data-x]').onclick = () => this.closeModal();
    const go = async () => {
      const email = emailEl.value.trim();
      const name  = nameEl.value.trim();
      if (!name) return this.toast('Enter your name', true);
      if (!email || !email.includes('@')) return this.toast('Enter a valid email', true);
      try {
        await Data.signIn(email, name);
        this.closeModal();
        this.toast('Check your email for the link');
      } catch (e) { this.toast(e.message || 'Sign in failed', true); }
    };
    document.querySelector('[data-go]').onclick = go;
    emailEl.onkeydown = e => { if (e.key === 'Enter') go(); };
    nameEl.onkeydown  = e => { if (e.key === 'Enter') emailEl.focus(); };
  },
};
