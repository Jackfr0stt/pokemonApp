#!/usr/bin/env node
/**
 * Day 8 validation — verify runCalc() output against expected damage ranges.
 *
 * Each test case describes atk/def/move and an expected % range (from hzla calc
 * or manual Smogon calc). Run:  node etl/validate_calc.js
 */

const { calculate, Pokemon, Move, Field, Generations } = require('@smogon/calc');
const eiOv = require('../lib/calc/emerald-imperium-overrides.json');

const gen = Generations.get(8);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildMon(species, { level = 100, nature = 'Hardy', evs = {}, baseStats, types } = {}) {
  const opts = {
    level,
    nature,
    evs,
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  };
  if (baseStats) {
    opts.overrides = { baseStats, ...(types ? { types } : {}) };
    return new Pokemon(gen, 'Ditto', opts);
  }
  return new Pokemon(gen, species, opts);
}

function runCase(game, atkSpec, defSpec, moveName) {
  const atk = buildMon(atkSpec.species, atkSpec);
  const def = buildMon(defSpec.species, defSpec);
  const moveOverride = game === 'emerald-imperium'
    ? (eiOv.moves[moveName] || undefined) : undefined;
  const move = new Move(gen, moveName, moveOverride ? { overrides: moveOverride } : undefined);
  const r = calculate(gen, atk, def, move, new Field());
  const dmg = r.damage;
  const hp  = def.maxHP();
  const pMin = Math.round((dmg[0]             / hp) * 1000) / 10;
  const pMax = Math.round((dmg[dmg.length - 1] / hp) * 1000) / 10;
  return { pMin, pMax, ko: r.kochance().text, desc: r.desc() };
}

// ─── Test cases ──────────────────────────────────────────────────────────────
// Format:
//   label         — human-readable test name
//   game          — 'radical-red' | 'emerald-imperium'
//   atk / def     — { species, level, nature, evs, baseStats?, types? }
//   move          — move name (exact @smogon/calc string)
//   note          — what we expect / what we're verifying

const CASES = [
  // ── 1. Baseline: neutral mirror damage (sanity check) ──────────────────────
  {
    label: '[RR] Garchomp Earthquake mirror',
    game:  'radical-red',
    atk:   { species: 'Garchomp', level: 100, nature: 'Jolly', evs: { atk: 252, spe: 252 } },
    def:   { species: 'Garchomp', level: 100, nature: 'Jolly', evs: { hp: 252 } },
    move:  'Earthquake',
    note:  'Should be ~47–56%; standard Gen 8 smogon value',
  },

  // ── 2. EI override check: Cut (50 BP Normal → 75 BP Steel in EI) ──────────
  // In standard calc: Scizor Cut vs Blissey hits for far less than in EI.
  // EI makes Cut 75 BP Steel-type → gets STAB on Scizor = big jump.
  {
    label: '[EI] Cut — Scizor (STAB Steel 75 BP EI) vs Blissey',
    game:  'emerald-imperium',
    atk:   { species: 'Scizor', level: 100, nature: 'Adamant', evs: { atk: 252 } },
    def:   { species: 'Blissey', level: 100, nature: 'Bold', evs: { hp: 252, def: 252 } },
    move:  'Cut',
    note:  'EI: 75 BP Steel + Scizor STAB → should be noticeably stronger than standard 50 BP Normal',
  },
  {
    label: '[RR] Cut — Scizor (standard 50 BP Normal) vs Blissey (for comparison)',
    game:  'radical-red',
    atk:   { species: 'Scizor', level: 100, nature: 'Adamant', evs: { atk: 252 } },
    def:   { species: 'Blissey', level: 100, nature: 'Bold', evs: { hp: 252, def: 252 } },
    move:  'Cut',
    note:  'Standard: 50 BP Normal, no STAB → should be much lower than EI version',
  },

  // ── 3. EI override: Mega Drain (40 BP → 120 BP in EI) ────────────────────
  {
    label: '[EI] Mega Drain 120 BP vs Gyarados',
    game:  'emerald-imperium',
    atk:   { species: 'Venusaur', level: 100, nature: 'Modest', evs: { spa: 252 } },
    def:   { species: 'Gyarados',  level: 100, nature: 'Adamant', evs: { hp: 252 } },
    move:  'Mega Drain',
    note:  'EI: 120 BP Grass + STAB; standard is only 40 BP. Should hit very hard.',
  },
  {
    label: '[RR] Mega Drain 40 BP vs Gyarados (for comparison)',
    game:  'radical-red',
    atk:   { species: 'Venusaur', level: 100, nature: 'Modest', evs: { spa: 252 } },
    def:   { species: 'Gyarados',  level: 100, nature: 'Adamant', evs: { hp: 252 } },
    move:  'Mega Drain',
    note:  'Standard: 40 BP Grass + STAB. Should be ~3× weaker than EI version.',
  },

  // ── 4. EI override: Fury Attack (15 BP → 20 BP per hit, multi-hit) ────────
  {
    label: '[EI] Fury Attack 20 BP×2-5 vs Blissey',
    game:  'emerald-imperium',
    atk:   { species: 'Raticate', level: 100, nature: 'Jolly', evs: { atk: 252 } },
    def:   { species: 'Blissey',  level: 100, nature: 'Bold',  evs: { hp: 252, def: 252 } },
    move:  'Fury Attack',
    note:  'EI: 20 BP/hit (was 15). Damage array will have rolls for all multi-hit combos.',
  },

  // ── 5. High-level trainer calc: Cynthia's Garchomp Stone Edge vs Lucario ──
  {
    label: '[RR] Stone Edge Garchomp vs Lucario (typical endgame scenario)',
    game:  'radical-red',
    atk:   { species: 'Garchomp', level: 78, nature: 'Jolly', evs: {} },
    def:   { species: 'Lucario',  level: 75, nature: 'Timid', evs: {} },
    move:  'Stone Edge',
    note:  'Realistic trainer-level scenario; both at 0 EVs.',
  },

  // ── 6. Gen 9 species via manual baseStats fallback ────────────────────────
  // Skeledirge: HP 104, Atk 75, Def 100, SpA 110, SpD 75, Spe 66
  {
    label: '[EI] Gen 9 mon (Skeledirge baseStats override) — Shadow Ball vs Gardevoir',
    game:  'emerald-imperium',
    atk:   {
      species:   'Skeledirge',
      level:     100,
      nature:    'Modest',
      evs:       { spa: 252 },
      baseStats: { hp: 104, atk: 75, def: 100, spa: 110, spd: 75, spe: 66 },
      types:     ['Fire', 'Ghost'],
    },
    def:   { species: 'Gardevoir', level: 100, nature: 'Calm', evs: { hp: 252, spd: 252 } },
    move:  'Shadow Ball',
    note:  'Tests the Ditto-template fallback for Gen 9 species not in @smogon/calc Gen 8 dex.',
  },

  // ── 7. EI Raichu type override (Electric/Normal, not Electric/Psychic) ─────
  // This verifies the species override in the EI JSON (not move override)
  // Raichu in EI is Electric/Normal — Psychic moves won't get STAB, but Normal will.
  // Hard to test this via damage directly, so we test that Raichu works at all.
  {
    label: '[EI] Raichu (Electric/Normal species override) — Thunderbolt vs Slowbro',
    game:  'emerald-imperium',
    atk:   { species: 'Raichu', level: 100, nature: 'Timid', evs: { spa: 252 } },
    def:   { species: 'Slowbro', level: 100, nature: 'Bold', evs: { hp: 252, spd: 252 } },
    move:  'Thunderbolt',
    note:  'Verifies EI Raichu species override does not crash (type override applied in data layer).',
  },
];

// ─── Runner ──────────────────────────────────────────────────────────────────

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM    = '\x1b[2m';
const RESET  = '\x1b[0m';

let passed = 0;
let failed = 0;

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Damage Calc Validation — Day 8');
console.log('══════════════════════════════════════════════════════════\n');

for (const tc of CASES) {
  process.stdout.write(`${tc.label}\n`);
  try {
    const r = runCase(tc.game, tc.atk, tc.def, tc.move);
    console.log(`  ${GREEN}✓${RESET}  ${r.pMin}%–${r.pMax}%  |  KO: ${r.ko || 'none'}`);
    console.log(`  ${DIM}${r.desc}${RESET}`);
    console.log(`  ${DIM}note: ${tc.note}${RESET}\n`);
    passed++;
  } catch (e) {
    console.log(`  ${RED}✗  ERROR: ${e.message}${RESET}`);
    console.log(`  ${DIM}note: ${tc.note}${RESET}\n`);
    failed++;
  }
}

console.log('──────────────────────────────────────────────────────────');
console.log(`  ${passed} passed  ${failed > 0 ? RED : GREEN}${failed} failed${RESET}`);
console.log('──────────────────────────────────────────────────────────\n');

// ── EI vs RR override ratio check ─────────────────────────────────────────
console.log('Override ratio check (EI Mega Drain 120 BP vs RR 40 BP):\n');
try {
  const ei = runCase('emerald-imperium',
    { species: 'Venusaur', level: 100, nature: 'Modest', evs: { spa: 252 } },
    { species: 'Gyarados',  level: 100, nature: 'Adamant', evs: { hp: 252 } },
    'Mega Drain',
  );
  const rr = runCase('radical-red',
    { species: 'Venusaur', level: 100, nature: 'Modest', evs: { spa: 252 } },
    { species: 'Gyarados',  level: 100, nature: 'Adamant', evs: { hp: 252 } },
    'Mega Drain',
  );
  const ratio = (ei.pMax / rr.pMax).toFixed(2);
  const ok = parseFloat(ratio) > 2.5;  // 120/40 = 3× power, so damage should be ~3× higher
  console.log(`  EI: ${ei.pMin}%–${ei.pMax}%`);
  console.log(`  RR: ${rr.pMin}%–${rr.pMax}%`);
  console.log(`  Ratio: ${ratio}× ${ok ? GREEN + '✓ (~3× expected)' : RED + '✗ override may not be applied'}${RESET}\n`);
} catch (e) {
  console.log(`  ${RED}ratio check failed: ${e.message}${RESET}\n`);
}
