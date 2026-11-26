// Shared stub harness: loads the client bundle with a fake Supabase so the
// real render paths can be driven without touching the network.
const fs = require('fs'), vm = require('vm');

const FILES = ['config.js','data.js','ui.js','lineup.js','fantasy.js','views.js','admin.js','app.js'];

// ---- a tiny PostgREST-shaped query builder over in-memory tables ----
function makeDb(tables, opts = {}) {
  const log = [];
  function builder(table) {
    const filters = [];
    let single = false, ord = null, lim = null, write = null;
    const self = {
      select() { return self; },
      // Writes are applied to the in-memory tables and logged, so a test can
      // check both the order of operations and the end state.
      update(v) { write = { op: 'update', v }; return self; },
      insert(v) { write = { op: 'insert', v }; return self; },
      eq(col, v)  { filters.push(r => String(r[col]) === String(v)); return self; },
      is(col, v)  { filters.push(r => (v === null ? r[col] == null : r[col] === v)); return self; },
      in(col, vs) { filters.push(r => vs.includes(r[col])); return self; },
      gte(col, v) { filters.push(r => r[col] >= v); return self; },
      neq(col, v) { filters.push(r => String(r[col]) !== String(v)); return self; },
      order(col, o) { ord = { col, asc: o?.ascending !== false }; return self; },
      limit(n) { lim = n; return self; },
      maybeSingle() { single = true; return self; },
      then(res, rej) { return self._run().then(res, rej); },
      async _run() {
        log.push(table);
        if (opts.delay) await new Promise(r => setTimeout(r, opts.delay[table] || 0));
        if (write) {
          tables[table] ||= [];
          if (write.op === 'insert') {
            const add = (Array.isArray(write.v) ? write.v : [write.v]).map(r => ({ ...r }));
            tables[table].push(...add);
            log.push({ table, op: 'insert', rows: add });
            return { data: add, error: null };
          }
          const hit = tables[table].filter(r => filters.every(f => f(r)));
          hit.forEach(r => Object.assign(r, write.v));
          log.push({ table, op: 'update', set: write.v, n: hit.length });
          return { data: hit, error: null };
        }
        let rows = (tables[table] || []).filter(r => filters.every(f => f(r)));
        if (ord) rows = [...rows].sort((a, b) =>
          (a[ord.col] > b[ord.col] ? 1 : a[ord.col] < b[ord.col] ? -1 : 0) * (ord.asc ? 1 : -1));
        if (lim != null) rows = rows.slice(0, lim);
        return single ? { data: rows[0] || null, error: null } : { data: rows, error: null };
      },
    };
    return self;
  }
  return { builder, log };
}

function load({ tables = {}, session = null, delay = null, authEvents = [] } = {}) {
  const src = Object.fromEntries(FILES.map(f => [f, fs.readFileSync('public/js/' + f, 'utf8')]));
  const db = makeDb(tables, { delay });
  const painted = [];

  const noop = () => {};
  const mkEl = () => {
    let html = '';
    const e = {
      get innerHTML() { return html; },
      set innerHTML(v) { html = v; painted.push(v); },
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      dataset: {}, style: {}, appendChild: noop, addEventListener: noop,
      querySelectorAll: () => [], querySelector: () => mkEl(), remove: noop, focus: noop,
      insertAdjacentHTML: noop, setAttribute: noop, getAttribute: () => null,
      addEventListener: noop, removeEventListener: noop, closest: () => null,
      children: [], parentNode: null, textContent: '',
    };
    return e;
  };
  const els = {};
  const getEl = id => (els[id] ||= mkEl());

  let authCb = null;
  const sbStub = {
    from: t => db.builder(t),
    rpc: async () => ({ data: null, error: null }),
    auth: {
      getSession: async () => {
        if (delay?.__session) await new Promise(r => setTimeout(r, delay.__session));
        return { data: { session } };
      },
      onAuthStateChange: cb => { authCb = cb; return { data: { subscription: { unsubscribe: noop } } }; },
      signInAnonymously: async () => ({ data: { session }, error: null }),
      signOut: async () => ({ error: null }),
    },
  };

  const ctx = {
    console,
    document: {
      getElementById: getEl, querySelector: () => mkEl(), querySelectorAll: () => [],
      createElement: () => mkEl(), addEventListener: noop, body: mkEl(),
    },
    window: {
      supabase: { createClient: () => sbStub },
      location: { origin: 'http://localhost:5174', hash: '' },
      addEventListener: noop, scrollTo: noop, matchMedia: () => ({ matches: false }),
    },
    location: { origin: 'http://localhost:5174', hash: '' },
    navigator: { clipboard: { writeText: async () => {} } },
    localStorage: {
      _m: {}, getItem(k) { return this._m[k] ?? null; },
      setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; },
    },
    setTimeout, clearTimeout, Promise, Date, JSON, Math, URL: { createObjectURL: noop },
    Image: function () {},
  };
  ctx.window.localStorage = ctx.localStorage;
  vm.createContext(ctx);

  // Strip app.js's boot IIFE and DOM wiring; drive the router by hand.
  const bundle = FILES.map(f =>
    f === 'app.js' ? src[f].split('/* ─────────── BOOT ─────────── */')[0] : src[f]
  ).join('\n;\n');

  const ns = vm.runInContext(
    bundle + '\n;\n({ Views, Data, UI, Lineup, Fantasy, Admin, Router, CONFIG, State })',
    ctx, { filename: 'bundle.js' });

  return { ...ns, ctx, els, getEl, painted, dbLog: db.log,
           fireAuth: (ev, s) => authCb && authCb(ev, s) };
}

module.exports = { load, FILES };
