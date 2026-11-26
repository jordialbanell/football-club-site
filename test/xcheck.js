// Cross-module check: every Views.* / Data.* / UI.* / Lineup.* / Admin.* /
// Router.* / CONFIG.* reference in the client must resolve to something the
// loaded scripts actually define. Loads all seven files into one scope, the
// way index.html does, then walks every member reference in the source.
const fs = require('fs');
const vm = require('vm');
const files = ['config.js','data.js','ui.js','lineup.js','fantasy.js','views.js','admin.js','app.js'];
const src = Object.fromEntries(files.map(f => [f, fs.readFileSync('public/js/'+f,'utf8')]));

const noop = () => {};
const el = new Proxy({}, {
  get: (t, k) => {
    if (k === 'classList') return { add: noop, remove: noop, toggle: noop, contains: () => false };
    if (k === 'dataset' || k === 'style') return {};
    return noop;
  },
  set: () => true,
});

const ctx = {
  console,
  document: {
    getElementById: () => el, querySelector: () => el, querySelectorAll: () => [],
    createElement: () => el, addEventListener: noop, body: el,
  },
  window: {
    supabase: { createClient: () => new Proxy({}, { get: () => () => ({}) }) },
    location: { origin: 'http://x', hash: '' },
    addEventListener: noop, scrollTo: noop,
  },
  location: { origin: 'http://x', hash: '' },
  navigator: { clipboard: { writeText: async () => {} } },
  setTimeout: noop, clearTimeout: noop, Image: function () {}, URL: { createObjectURL: noop },
};
vm.createContext(ctx);

// app.js's boot IIFE and DOM wiring are runtime, not definitions.
const bundle = files.map(f =>
  f === 'app.js' ? src[f].split('/* ─────────── BOOT ─────────── */')[0] : src[f]
).join('\n;\n');

const CAPTURE = `({ ns: { Views, Data, UI, Lineup, Fantasy, Admin, Router, CONFIG, State },
                   free: { esc, isAdmin, isApproved, isSignedIn, isGuest,
                           squadOnly, guestsOnly, myPlayerId, cached, bust } })`;

let loaded;
try {
  loaded = vm.runInContext(bundle + '\n;\n' + CAPTURE, ctx, { filename: 'bundle.js' });
} catch (e) {
  console.log('BUNDLE FAILED TO LOAD: ' + e.message);
  process.exit(1);
}

const NS = loaded.ns;
const FREE = loaded.free;
for (const [n, o] of Object.entries(NS)) if (!o) console.log(`MISSING NAMESPACE ${n}`);
for (const [n, o] of Object.entries(FREE)) if (!o) console.log(`MISSING HELPER ${n}`);

let bad = 0, checked = 0;
const re = /\b(Views|Data|UI|Lineup|Fantasy|Admin|Router|CONFIG|State)\.([A-Za-z_$][\w$]*)/g;
for (const f of files) {
  for (const m of src[f].matchAll(re)) {
    const [full, ns, prop] = m;
    checked++;
    const obj = NS[ns];
    if (!obj || prop in obj) continue;
    console.log(`UNRESOLVED  ${f}:${src[f].slice(0, m.index).split('\n').length}  ${full}`);
    bad++;
  }
}
console.log(`\nchecked ${checked} member references across ${files.length} files — ${bad} unresolved`);
