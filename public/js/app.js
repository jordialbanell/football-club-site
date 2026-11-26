/* ═══════════════════════════════════════════════════════════
   ROUTER + BOOTSTRAP
   ═══════════════════════════════════════════════════════════ */

const Router = {
  // One-shot state handed to the next render. Used once, by the fantasy
  // sign-up, to show a brand new edit link on the squad picker without
  // putting the token in the URL where it would end up in history.
  flash: null,

  async render(flash = null) {
    this.flash = flash;
    const app  = document.getElementById('app');
    const hash = location.hash.replace(/^#\/?/, '') || '';
    const [seg, a, b, c] = hash.split('/');

    // Nav highlight. Several routes share one nav item now.
    const NAV_GROUP = {
      '':        'home',
      fixtures:  'matches', results: 'matches', table: 'matches', fixture: 'matches',
      squad:     'team',    stats:   'team',
      fantasy:   'fantasy', media:   'media',   sponsors: 'sponsors',
      admin:     'admin',
    };
    const group = NAV_GROUP[seg] ?? seg;
    document.querySelectorAll('[data-nav]').forEach(el =>
      el.classList.toggle('active', el.dataset.nav === group));
    document.getElementById('siteNav').classList.remove('open');
    document.getElementById('navToggle').classList.remove('open');

    // Don't blank the page. Leave the current view up and show a thin
    // progress bar; the incoming view swaps its own content in when ready.
    // Only the very first load gets the full ball loader.
    const first = !app.dataset.painted;
    if (first) {
      app.innerHTML = `<div class="loading-screen">
        <img class="loading-ball" src="images/ball.png" alt=""><div class="loading-text">Loading</div></div>`;
    }
    UI.progress(true);

    try {
      switch (seg) {
        case '':         await Views.home(app); break;
        case 'fixtures': await Views.fixtures(app); break;
        case 'results':  await Views.results(app); break;
        case 'table':    await Views.table(app); break;
        case 'fixture':  await Views.fixture(app, a); break;
        case 'squad':    await Views.squad(app); break;
        case 'stats':    await Views.stats(app); break;
        case 'media':    await Views.media(app); break;
        case 'sponsors': await Views.sponsors(app); break;
        case 'fantasy':
          switch (a) {
            case 'claim': await Views.fantasyClaim(app, b); break;
            case 'team':  await Views.fantasyTeam(app, b, c); break;
            default:      await Views.fantasy(app, a || ''); break;
          }
          break;

        case 'admin':
          switch (a) {
            case undefined:
            case '':        await Admin.home(app); break;
            case 'lineup':  await Admin.lineup(app, b); break;
            case 'rsvp':    await Admin.rsvp(app, b); break;
            case 'result':  await Admin.result(app, b); break;
            case 'report':  await Admin.report(app, b); break;
            case 'media':   await Admin.media(app, b || null); break;
            case 'squad':   await Admin.squad(app); break;
            case 'people':  await Admin.people(app); break;
            case 'table':   await Admin.table(app); break;
            case 'fantasy': await Admin.fantasy(app); break;
            default:        await Admin.home(app);
          }
          break;

        default: await Views.home(app);
      }
    } catch (err) {
      console.error(err);
      app.innerHTML = `<section class="section"><div class="wrap">
        <h1 class="h1">Something broke</h1>
        <div class="note"><strong>${esc(err.message || 'Unknown error')}</strong>
          If this is the first run, check your Supabase URL and key in js/config.js,
          and make sure schema.sql has been run.</div>
      </div></section>`;
    }

    UI.progress(false);
    this.flash = null;
    app.dataset.painted = '1';
    window.scrollTo({ top: 0, behavior: 'instant' });
  },
};

/* ─────────── BOOT ─────────── */
(async function boot() {
  if (CONFIG.SUPABASE_URL.includes('YOUR-PROJECT-REF')) {
    document.getElementById('app').innerHTML = `
      <section class="section"><div class="wrap-narrow">
        <div class="label label-red">Setup needed</div>
        <h1 class="h1">Almost there</h1>
        <div class="note" style="margin-top:20px">
          <strong>1. Create a Supabase project</strong>
          Go to supabase.com, create a free project, then open SQL Editor and run
          <code>supabase/schema.sql</code> followed by <code>supabase/seed.sql</code>.
        </div>
        <div class="note">
          <strong>2. Add your keys</strong>
          Open <code>public/js/config.js</code> and paste your Project URL and anon key
          from Project Settings &gt; API.
        </div>
        <div class="note">
          <strong>3. Make yourself an admin</strong>
          Sign in once, then run the commented-out block at the bottom of seed.sql with your email.
        </div>
        <p class="lede" style="margin-top:20px">Full steps are in README.md.</p>
      </div></section>`;
    return;
  }

  await Data.initAuth();
  await Data.loadCore();
  UI.refreshAuthUI();
  UI.renderFooterSponsors();

  // Google and magic links land back on the site root. If we were in the
  // middle of something, pick it up again instead of showing the home page.
  const back = Data.takeReturn();
  if (back && location.hash !== back) {
    location.hash = back;      // fires hashchange, which renders
    return;
  }

  await Router.render();
})();

/* ─────────── EVENTS ─────────── */
window.addEventListener('hashchange', () => Router.render());

document.getElementById('authBtn').onclick = () => UI.authModal();
document.getElementById('navAuthBtn').onclick = () => {
  document.getElementById('siteNav').classList.remove('open');
  document.getElementById('navToggle').classList.remove('open');
  UI.authModal();
};

document.getElementById('navToggle').onclick = () => {
  document.getElementById('siteNav').classList.toggle('open');
  document.getElementById('navToggle').classList.toggle('open');
};

document.getElementById('modal').addEventListener('click', e => {
  if (e.target.id === 'modal') UI.closeModal();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') UI.closeModal();
});
