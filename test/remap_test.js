const fs = require('fs'), vm = require('vm');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('public/js/config.js','utf8') + '\n' +
                fs.readFileSync('public/js/fantasy.js','utf8'), ctx);
const { Fantasy, CONFIG } = vm.runInContext('({ Fantasy, CONFIG })', ctx);

const NAMES = { p1:'Danny', p2:'Leo', p3:'Tom', p4:'Ben', p5:'Max',
                p6:'Sam', p7:'Shota', p8:'Yuri', p9:'Nil', p10:'Zach', p11:'Jon' };
const nameOf = id => NAMES[id] || id;
const shape = f => { const c={GK:0,DEF:0,MID:0,ATT:0}; CONFIG.FORMATIONS[f].forEach(s=>c[s.pos]++); return c; };
const lineOf = (picks, f) => {
  const out = {GK:[],DEF:[],MID:[],ATT:[]};
  CONFIG.FORMATIONS[f].forEach((s,i)=>{ if(picks[i]) out[s.pos].push(nameOf(picks[i])); });
  return out;
};
const full = f => { const p={}; CONFIG.FORMATIONS[f].forEach((s,i)=>p[i]='p'+(i+1)); return p; };

let fails = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        got  ${g}\n        want ${w}`);
};

// ---- the scenario named in the brief ----
console.log('4-3-3 (all 11 picked) -> 5-3-2   [shape ' +
  JSON.stringify(shape('4-3-3')) + ' -> ' + JSON.stringify(shape('5-3-2')) + ']');
const a = full('4-3-3');
console.log('  before:', JSON.stringify(lineOf(a, '4-3-3')));
const r = Fantasy.remapFormation(a, '4-3-3', '5-3-2');
console.log('  after :', JSON.stringify(lineOf(r.picks, '5-3-2')));

eq('GK kept',              lineOf(r.picks,'5-3-2').GK,  ['Danny']);
eq('4 defenders kept',     lineOf(r.picks,'5-3-2').DEF, ['Leo','Tom','Ben','Max']);
eq('one DEF slot empty',   Object.keys(r.picks).length, 10);
eq('3 midfielders kept',   lineOf(r.picks,'5-3-2').MID, ['Sam','Shota','Yuri']);
eq('2 attackers kept',     lineOf(r.picks,'5-3-2').ATT, ['Nil','Zach']);
eq('third attacker dropped', r.dropped.map(d=>nameOf(d.player_id)), ['Jon']);
eq('notice', Fantasy.switchNotice('5-3-2', r.dropped, nameOf),
   'Switched to 5-3-2. Dropped Jon from attack.');

// ---- round trip is a no-op ----
const back = Fantasy.remapFormation(r.picks, '5-3-2', '4-3-3');
eq('switching back restores the 10 that survived',
   lineOf(back.picks,'4-3-3'),
   { GK:['Danny'], DEF:['Leo','Tom','Ben','Max'],
     MID:['Sam','Shota','Yuri'], ATT:['Nil','Zach'] });
eq('nothing dropped on the way back', back.dropped, []);

// ---- determinism ----
eq('same switch drops the same player every time',
   Fantasy.remapFormation(full('4-3-3'),'4-3-3','5-3-2').dropped,
   Fantasy.remapFormation(full('4-3-3'),'4-3-3','5-3-2').dropped);

// ---- growing a line ----
const g = Fantasy.remapFormation(full('4-4-2'), '4-4-2', '3-4-3');
eq('4-4-2 -> 3-4-3 drops one defender', g.dropped.map(d=>d.pos), ['DEF']);
eq('   and the new ATT slot is empty', Object.keys(g.picks).length, 10);

// ---- partial squad ----
const partial = { 0:'p1', 1:'p2' };            // GK + one DEF in 4-4-2
const pr = Fantasy.remapFormation(partial, '4-4-2', '3-5-2');
eq('partial squad survives', lineOf(pr.picks,'3-5-2'), {GK:['Danny'],DEF:['Leo'],MID:[],ATT:[]});
eq('partial squad drops nobody', pr.dropped, []);

// ---- empty + identity ----
eq('empty stays empty', Fantasy.remapFormation({}, '4-4-2','5-3-2').picks, {});
eq('same formation is identity', Fantasy.remapFormation(full('4-4-2'),'4-4-2','4-4-2').picks, full('4-4-2'));

// ---- multi-line drop wording ----
const m = Fantasy.remapFormation(full('3-4-3'), '3-4-3', '4-5-1');
console.log('\n3-4-3 -> 4-5-1 notice:', Fantasy.switchNotice('4-5-1', m.dropped, nameOf));

// ---- every pair of formations: never invents or duplicates a player ----
const names = Object.keys(CONFIG.FORMATIONS);
let bad = 0;
for (const f1 of names) for (const f2 of names) {
  const src = full(f1);
  const res = Fantasy.remapFormation(src, f1, f2);
  const out = Object.values(res.picks);
  if (new Set(out).size !== out.length) { console.log(`DUP ${f1}->${f2}`); bad++; }
  const srcSet = new Set(Object.values(src));
  if (out.some(p => !srcSet.has(p))) { console.log(`INVENTED ${f1}->${f2}`); bad++; }
  if (out.length + res.dropped.length !== Object.keys(src).length) { console.log(`LOST ${f1}->${f2}`); bad++; }
  // every kept player is still in his own line
  CONFIG.FORMATIONS[f2].forEach((slot,i) => {
    const pid = res.picks[i];
    if (!pid) return;
    const srcSlot = CONFIG.FORMATIONS[f1].findIndex((s,j) => src[j] === pid);
    if (CONFIG.FORMATIONS[f1][srcSlot].pos !== slot.pos) { console.log(`WRONG LINE ${f1}->${f2}`); bad++; }
  });
}
console.log(`\nall ${names.length * names.length} formation pairs: ${bad} problems`);
console.log(fails + bad === 0 ? '\nALL GREEN' : `\n${fails + bad} FAILURES`);
process.exit(fails + bad ? 1 : 0);
