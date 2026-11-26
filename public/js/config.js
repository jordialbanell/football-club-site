/* ═══════════════════════════════════════════════════════════
   CONFIG — put your Supabase project details here.
   Find them at: Supabase Dashboard > Project Settings > API
   The anon key is safe to expose publicly. Row Level Security
   in schema.sql is what actually protects your data.
   ═══════════════════════════════════════════════════════════ */

const CONFIG = {
  SUPABASE_URL:      'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-KEY',

  CLUB_NAME: 'Riverside',
  LEAGUE_URL: 'https://example.com',

  // Fantasy scoring. Mirrors the SQL view in schema.sql.
  // Change both if you change one.
  FANTASY_RULES: [
    { key: 'appearance', label: 'Appearance',            pts:  2 },
    { key: 'goal_gk',    label: 'Goal (GK)',             pts: 20 },
    { key: 'goal_def',   label: 'Goal (DEF)',            pts:  7 },
    { key: 'goal_mid',   label: 'Goal (MID)',            pts:  5 },
    { key: 'goal_att',   label: 'Goal (ATT)',            pts:  4 },
    { key: 'hat_trick',  label: 'Hat-trick bonus',       pts:  3 },
    { key: 'ast_gk',     label: 'Assist (GK)',           pts:  8 },
    { key: 'ast_def',    label: 'Assist (DEF)',          pts:  5 },
    { key: 'ast_mid',    label: 'Assist (MID)',          pts:  4 },
    { key: 'ast_att',    label: 'Assist (ATT)',          pts:  2 },
    { key: 'cs_gkdef',   label: 'Clean sheet (GK/DEF)',  pts:  4 },
    { key: 'cs_mid',     label: 'Clean sheet (MID)',     pts:  2 },
    { key: 'cs_att',     label: 'Clean sheet (ATT)',     pts:  1 },
    { key: 'motm',       label: 'Man of the match',      pts:  3 },
    { key: 'yellow',     label: 'Yellow card',           pts: -2 },
    { key: 'red',        label: 'Red card',              pts: -8 },
    { key: 'own_goal',   label: 'Own goal',              pts: -2 },
  ],

  FANTASY_SQUAD_SIZE: 11,  // a full XI: the formation decides the position split

  // Transfers. Defaults, overridden by the season row in the database
  // (seasons.free_transfers and seasons.transfer_cost) if set.
  FANTASY_FREE_TRANSFERS: 2,   // free swaps per manager per season
  FANTASY_TRANSFER_COST:  4,   // points deducted per transfer after the free ones

  // Sponsors. Drop a logo into images/sponsors/ and reference it here.
  // Leave `logo` out and the name renders as a wordmark instead.
  SPONSORS: [
    {
      name: 'Corner Café',
      url:  'https://example.com',
      logo: 'images/sponsors/corner-cafe.png',
      blurb: 'The café on the corner of the park, and where the team goes after every home game.',
      // The letter on the Sponsors page, one paragraph per line. Optional: falls back to the blurb.
      letter: [
        'We are a small neighbourhood café and we have backed Riverside FC since its first season.',
        'Come by after the match: the first round of coffees for anyone in a Riverside shirt is on us.',
      ],
      lead: true,
    },
    {
      name: 'Northline Physio',
      url:  'https://example.com',
      logo: 'images/sponsors/northline.png',
      blurb: 'Sports physiotherapy, and the reason half the squad can still walk on Mondays.',
    },
  ],

  FORMATIONS: {
    '4-4-2': [
      { label:'GK', x:50, y:90, pos:'GK' },
      { label:'RB', x:82, y:75, pos:'DEF' }, { label:'RCB', x:63, y:72, pos:'DEF' },
      { label:'LCB', x:37, y:72, pos:'DEF' }, { label:'LB', x:18, y:75, pos:'DEF' },
      { label:'RM', x:80, y:52, pos:'MID' }, { label:'RCM', x:60, y:48, pos:'MID' },
      { label:'LCM', x:40, y:48, pos:'MID' }, { label:'LM', x:20, y:52, pos:'MID' },
      { label:'RS', x:63, y:24, pos:'ATT' }, { label:'LS', x:37, y:24, pos:'ATT' },
    ],
    '4-3-3': [
      { label:'GK', x:50, y:90, pos:'GK' },
      { label:'RB', x:82, y:74, pos:'DEF' }, { label:'RCB', x:63, y:71, pos:'DEF' },
      { label:'LCB', x:37, y:71, pos:'DEF' }, { label:'LB', x:18, y:74, pos:'DEF' },
      { label:'RCM', x:70, y:50, pos:'MID' }, { label:'CM', x:50, y:46, pos:'MID' },
      { label:'LCM', x:30, y:50, pos:'MID' },
      { label:'RW', x:79, y:22, pos:'ATT' }, { label:'ST', x:50, y:16, pos:'ATT' },
      { label:'LW', x:21, y:22, pos:'ATT' },
    ],
    '4-5-1': [
      { label:'GK', x:50, y:90, pos:'GK' },
      { label:'RB', x:82, y:74, pos:'DEF' }, { label:'RCB', x:63, y:71, pos:'DEF' },
      { label:'LCB', x:37, y:71, pos:'DEF' }, { label:'LB', x:18, y:74, pos:'DEF' },
      { label:'RM', x:82, y:52, pos:'MID' }, { label:'RCM', x:65, y:47, pos:'MID' },
      { label:'CM', x:50, y:44, pos:'MID' }, { label:'LCM', x:35, y:47, pos:'MID' },
      { label:'LM', x:18, y:52, pos:'MID' },
      { label:'ST', x:50, y:20, pos:'ATT' },
    ],
    '3-5-2': [
      { label:'GK', x:50, y:90, pos:'GK' },
      { label:'RCB', x:70, y:73, pos:'DEF' }, { label:'CB', x:50, y:71, pos:'DEF' },
      { label:'LCB', x:30, y:73, pos:'DEF' },
      { label:'RWB', x:84, y:53, pos:'MID' }, { label:'RCM', x:65, y:49, pos:'MID' },
      { label:'CM', x:50, y:46, pos:'MID' }, { label:'LCM', x:35, y:49, pos:'MID' },
      { label:'LWB', x:16, y:53, pos:'MID' },
      { label:'RS', x:63, y:24, pos:'ATT' }, { label:'LS', x:37, y:24, pos:'ATT' },
    ],
    '3-4-3': [
      { label:'GK', x:50, y:90, pos:'GK' },
      { label:'RCB', x:70, y:73, pos:'DEF' }, { label:'CB', x:50, y:71, pos:'DEF' },
      { label:'LCB', x:30, y:73, pos:'DEF' },
      { label:'RWB', x:80, y:52, pos:'MID' }, { label:'RCM', x:62, y:48, pos:'MID' },
      { label:'LCM', x:38, y:48, pos:'MID' }, { label:'LWB', x:20, y:52, pos:'MID' },
      { label:'RW', x:76, y:22, pos:'ATT' }, { label:'ST', x:50, y:17, pos:'ATT' },
      { label:'LW', x:24, y:22, pos:'ATT' },
    ],
    '4-2-3-1': [
      { label:'GK', x:50, y:90, pos:'GK' },
      { label:'RB', x:82, y:75, pos:'DEF' }, { label:'RCB', x:63, y:72, pos:'DEF' },
      { label:'LCB', x:37, y:72, pos:'DEF' }, { label:'LB', x:18, y:75, pos:'DEF' },
      { label:'RDM', x:63, y:58, pos:'MID' }, { label:'LDM', x:37, y:58, pos:'MID' },
      { label:'RM', x:76, y:40, pos:'MID' }, { label:'CAM', x:50, y:37, pos:'MID' },
      { label:'LM', x:24, y:40, pos:'MID' },
      { label:'ST', x:50, y:20, pos:'ATT' },
    ],
    '5-3-2': [
      { label:'GK', x:50, y:90, pos:'GK' },
      { label:'RWB', x:88, y:73, pos:'DEF' }, { label:'RCB', x:70, y:70, pos:'DEF' },
      { label:'CB', x:50, y:69, pos:'DEF' }, { label:'LCB', x:30, y:70, pos:'DEF' },
      { label:'LWB', x:12, y:73, pos:'DEF' },
      { label:'RCM', x:68, y:49, pos:'MID' }, { label:'CM', x:50, y:46, pos:'MID' },
      { label:'LCM', x:32, y:49, pos:'MID' },
      { label:'RS', x:63, y:24, pos:'ATT' }, { label:'LS', x:37, y:24, pos:'ATT' },
    ],
    '4-1-4-1': [
      { label:'GK', x:50, y:90, pos:'GK' },
      { label:'RB', x:82, y:75, pos:'DEF' }, { label:'RCB', x:63, y:72, pos:'DEF' },
      { label:'LCB', x:37, y:72, pos:'DEF' }, { label:'LB', x:18, y:75, pos:'DEF' },
      { label:'DM', x:50, y:60, pos:'MID' },
      { label:'RM', x:80, y:46, pos:'MID' }, { label:'RCM', x:62, y:43, pos:'MID' },
      { label:'LCM', x:38, y:43, pos:'MID' }, { label:'LM', x:20, y:46, pos:'MID' },
      { label:'ST', x:50, y:20, pos:'ATT' },
    ],
  },

  JERSEY_SWATCHES: ['#c8102e','#16150f','#ffffff','#0a4d8c','#f4b400','#0e7a3e','#7c2d92','#e87820'],
};
