import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, FlatList,
  StyleSheet, Modal, Pressable, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useGame } from '@/lib/GameContext';
import { runCalc, isKnownSpecies, getComputedSpeed, type CalcMon, type CalcResult } from '@/lib/calc';
import { takePendingDefender } from '@/lib/calcStore';
import { useIsTablet } from '@/lib/layout';
import { colors, spacing, radius, font } from '@/lib/theme';

// ─── Constants ───────────────────────────────────────────────────────────────

const NATURES = [
  'Hardy','Lonely','Brave','Adamant','Naughty',
  'Bold','Docile','Relaxed','Impish','Lax',
  'Timid','Hasty','Serious','Jolly','Naive',
  'Modest','Mild','Quiet','Bashful','Rash',
  'Calm','Gentle','Sassy','Careful','Quirky',
];

const NATURE_BUFF: Record<string, string> = {
  Lonely:'Atk+', Brave:'Atk+', Adamant:'Atk+', Naughty:'Atk+',
  Bold:'Def+',   Relaxed:'Def+', Impish:'Def+', Lax:'Def+',
  Timid:'Spe+',  Hasty:'Spe+',   Jolly:'Spe+',  Naive:'Spe+',
  Modest:'SpA+', Mild:'SpA+',    Quiet:'SpA+',   Rash:'SpA+',
  Calm:'SpD+',   Gentle:'SpD+',  Sassy:'SpD+',   Careful:'SpD+',
};

const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
type StatKey = typeof STAT_KEYS[number];

const EMPTY_MON = (): CalcMon => ({ species: '', level: 100, nature: 'Hardy', evs: {} });

// ─── Nature picker modal ─────────────────────────────────────────────────────

function NaturePicker({
  visible, current, onSelect, onClose,
}: {
  visible: boolean; current: string;
  onSelect: (n: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  useEffect(() => { if (!visible) setQ(''); }, [visible]);

  const filtered = q
    ? NATURES.filter(n => n.toLowerCase().includes(q.toLowerCase()))
    : NATURES;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Nature</Text>
          <TextInput
            style={styles.sheetSearch}
            placeholder="Filter…"
            placeholderTextColor={colors.textDim}
            value={q}
            onChangeText={setQ}
            autoFocus
          />
          <FlatList
            data={filtered}
            keyExtractor={n => n}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: n }) => (
              <TouchableOpacity
                style={[styles.natRow, n === current && styles.natRowActive]}
                onPress={() => { onSelect(n); onClose(); }}
              >
                <Text style={[styles.natText, n === current && styles.natTextActive]}>{n}</Text>
                {NATURE_BUFF[n]
                  ? <Text style={styles.natBuff}>{NATURE_BUFF[n]}</Text>
                  : <Text style={styles.natNeutral}>neutral</Text>
                }
              </TouchableOpacity>
            )}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Mon panel ───────────────────────────────────────────────────────────────

function MonPanel({
  title, mon, onChange,
}: {
  title: string; mon: CalcMon; onChange: (m: CalcMon) => void;
}) {
  const [showNature, setShowNature] = useState(false);

  const trimmed = mon.species.trim();
  const speciesState: 'known' | 'unknown' | 'empty' =
    trimmed === ''           ? 'empty'   :
    isKnownSpecies(trimmed)  ? 'known'   :
                               'unknown';

  function setEvs(stat: StatKey, val: string) {
    onChange({ ...mon, evs: { ...mon.evs, [stat]: Math.min(252, Number(val) || 0) } });
  }

  function setBase(stat: StatKey, val: string) {
    onChange({
      ...mon,
      baseStats: {
        hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0,
        ...(mon.baseStats ?? {}),
        [stat]: Number(val) || 0,
      },
    });
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>

      {/* Species */}
      <Text style={styles.fieldLabel}>Species</Text>
      <View style={styles.speciesRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={mon.species}
          onChangeText={v => onChange({ ...mon, species: v, baseStats: undefined })}
          placeholder="Garchomp, Greninja…"
          placeholderTextColor={colors.textDim}
          autoCapitalize="words"
          autoCorrect={false}
        />
        {speciesState !== 'empty' && (
          <View style={[
            styles.statusDot,
            speciesState === 'known' ? styles.dotGreen : styles.dotRed,
          ]} />
        )}
      </View>

      {/* Unknown species → base stat inputs */}
      {speciesState === 'unknown' && (
        <View style={styles.baseBox}>
          <Text style={styles.fieldLabel}>Base Stats (not in Gen 8 dex)</Text>
          <View style={styles.statRow}>
            {STAT_KEYS.map(s => (
              <View key={s} style={styles.statCell}>
                <Text style={styles.statLabel}>{s.toUpperCase()}</Text>
                <TextInput
                  style={styles.statInput}
                  keyboardType="numeric"
                  value={mon.baseStats?.[s] ? String(mon.baseStats[s]) : ''}
                  onChangeText={v => setBase(s, v)}
                  placeholder="–"
                  placeholderTextColor={colors.textDim}
                  maxLength={3}
                />
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Level + Nature */}
      <View style={styles.levelNatureRow}>
        <View style={styles.levelWrap}>
          <Text style={styles.fieldLabel}>Level</Text>
          <TextInput
            style={[styles.input, styles.levelInput]}
            keyboardType="numeric"
            value={String(mon.level)}
            onChangeText={v => onChange({ ...mon, level: Math.min(100, Math.max(1, Number(v) || 1)) })}
            maxLength={3}
          />
        </View>
        <View style={styles.natureWrap}>
          <Text style={styles.fieldLabel}>Nature</Text>
          <TouchableOpacity
            style={[styles.input, styles.natureBtn]}
            onPress={() => setShowNature(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.natureBtnText}>{mon.nature}</Text>
            {NATURE_BUFF[mon.nature] && (
              <Text style={styles.natureBuff}>{NATURE_BUFF[mon.nature]}</Text>
            )}
            <Ionicons name="chevron-down" size={12} color={colors.textDim} />
          </TouchableOpacity>
        </View>
      </View>

      {/* EVs */}
      <Text style={styles.fieldLabel}>EVs</Text>
      <View style={styles.statRow}>
        {STAT_KEYS.map(s => (
          <View key={s} style={styles.statCell}>
            <Text style={styles.statLabel}>{s.toUpperCase()}</Text>
            <TextInput
              style={styles.statInput}
              keyboardType="numeric"
              value={mon.evs[s] ? String(mon.evs[s]) : ''}
              onChangeText={v => setEvs(s, v)}
              placeholder="0"
              placeholderTextColor={colors.textDim}
              maxLength={3}
            />
          </View>
        ))}
      </View>

      <NaturePicker
        visible={showNature}
        current={mon.nature}
        onSelect={n => onChange({ ...mon, nature: n })}
        onClose={() => setShowNature(false)}
      />
    </View>
  );
}

// ─── Result card ─────────────────────────────────────────────────────────────

function ResultCard({ result }: { result: CalcResult }) {
  const { percentMin: pMin, percentMax: pMax, koChance, desc, damage, defHp } = result;
  const fillW = Math.min(pMax, 100);
  const minW  = Math.min(pMin, 100);

  const koColor =
    koChance.toLowerCase().includes('guaranteed') || koChance === '100%'
      ? '#f97176'
      : koChance.includes('%')
      ? colors.accent
      : colors.textMuted;

  return (
    <View style={styles.resultCard}>
      <Text style={styles.resultDesc} numberOfLines={4}>{desc}</Text>

      <View style={styles.resultNumRow}>
        <Text style={styles.resultPct}>{pMin}% – {pMax}%</Text>
        <View style={[styles.koBadge, { borderColor: koColor }]}>
          <Text style={[styles.koText, { color: koColor }]}>{koChance || 'No KO'}</Text>
        </View>
      </View>

      {/* Damage range bar */}
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${fillW}%` as any }]} />
        <View style={[styles.barMarker, { left: `${minW}%` as any }]} />
      </View>
      <View style={styles.barAxisLabels}>
        <Text style={styles.barAxisLabel}>0%</Text>
        <Text style={styles.barAxisLabel}>50%</Text>
        <Text style={styles.barAxisLabel}>100%</Text>
      </View>

      <Text style={styles.rawDmg}>
        {damage[0]}–{damage[damage.length - 1]} / {defHp} HP
      </Text>
    </View>
  );
}

// ─── Speed bar ───────────────────────────────────────────────────────────────

function SpeedBar({ atk, def }: { atk: CalcMon; def: CalcMon }) {
  const atkSpe = getComputedSpeed(atk);
  const defSpe = getComputedSpeed(def);
  if (!atkSpe || !defSpe) return null;

  const faster  = atkSpe > defSpe ? 'atk' : atkSpe < defSpe ? 'def' : 'tie';
  const delta   = Math.abs(atkSpe - defSpe);
  const label   =
    faster === 'atk' ? `Attacker outspeeds by ${delta}` :
    faster === 'def' ? `Defender outspeeds by ${delta}` :
                       'Speed tie';
  const color   =
    faster === 'atk' ? '#63bb5b' :
    faster === 'def' ? '#f97176' :
                       colors.textMuted;

  const max = Math.max(atkSpe, defSpe);

  return (
    <View style={styles.speedCard}>
      <View style={styles.speedRow}>
        <Text style={styles.speedLabel}>⚡ Speed</Text>
        <Text style={[styles.speedVerdict, { color }]}>{label}</Text>
      </View>
      <View style={styles.speedBars}>
        <View style={styles.speedBarWrap}>
          <Text style={styles.speedStat}>{atkSpe}</Text>
          <View style={styles.speedTrack}>
            <View style={[
              styles.speedFill,
              { width: `${(atkSpe / max) * 100}%` as any, backgroundColor: '#63bb5b88' },
            ]} />
          </View>
        </View>
        <View style={styles.speedBarWrap}>
          <Text style={styles.speedStat}>{defSpe}</Text>
          <View style={styles.speedTrack}>
            <View style={[
              styles.speedFill,
              { width: `${(defSpe / max) * 100}%` as any, backgroundColor: '#f9717688' },
            ]} />
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function CalcScreen() {
  const { game }  = useGame();
  const isTablet  = useIsTablet();

  const [atk, setAtk] = useState<CalcMon>(EMPTY_MON());
  const [def, setDef] = useState<CalcMon>(EMPTY_MON());
  const [move,    setMove]    = useState('');
  const [result,  setResult]  = useState<CalcResult | null>(null);
  const [errored, setErrored] = useState(false);

  function clearResult() {
    setResult(null);
    setErrored(false);
  }

  // Pick up any defender pre-filled from the trainer detail screen
  useFocusEffect(
    useCallback(() => {
      const pending = takePendingDefender();
      if (pending) {
        setDef(pending);
        setResult(null);
        setErrored(false);
      }
    }, []),
  );

  const canCalc = Boolean(atk.species.trim() && def.species.trim() && move.trim());

  const onCalc = useCallback(() => {
    if (!canCalc) return;
    const r = runCalc(game, atk, def, move.trim());
    if (r) { setResult(r); setErrored(false); }
    else   { setResult(null); setErrored(true); }
  }, [game, atk, def, move, canCalc]);

  function swapMonsters() {
    setAtk(def);
    setDef(atk);
    setResult(null);
    setErrored(false);
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, isTablet && styles.contentTablet]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Panels */}
      <View style={[styles.panelsRow, isTablet && styles.panelsRowTablet]}>
        <MonPanel
          title="Attacker ⚔"
          mon={atk}
          onChange={m => { setAtk(m); clearResult(); }}
        />

        {/* Swap button (centered between panels) */}
        <TouchableOpacity style={styles.swapBtn} onPress={swapMonsters} activeOpacity={0.7}>
          <Ionicons
            name={isTablet ? 'swap-horizontal' : 'swap-vertical'}
            size={18}
            color={colors.textMuted}
          />
        </TouchableOpacity>

        <MonPanel
          title="Defender 🛡"
          mon={def}
          onChange={m => { setDef(m); clearResult(); }}
        />
      </View>

      {/* Speed comparison — visible as soon as both species are entered */}
      {atk.species.trim() && def.species.trim() && (
        <SpeedBar atk={atk} def={def} />
      )}

      {/* Move input */}
      <View style={styles.section}>
        <Text style={styles.fieldLabel}>Move</Text>
        <TextInput
          style={styles.input}
          value={move}
          onChangeText={v => { setMove(v); clearResult(); }}
          placeholder="Earthquake, Ice Beam, Play Rough…"
          placeholderTextColor={colors.textDim}
          autoCapitalize="words"
          autoCorrect={false}
          onSubmitEditing={onCalc}
          returnKeyType="go"
        />
      </View>

      {/* Calc button */}
      <TouchableOpacity
        style={[styles.calcBtn, !canCalc && styles.calcBtnOff]}
        onPress={onCalc}
        activeOpacity={0.8}
        disabled={!canCalc}
      >
        <Text style={[styles.calcBtnLabel, !canCalc && { color: colors.textDim }]}>
          Calculate Damage
        </Text>
      </TouchableOpacity>

      {/* Error */}
      {errored && (
        <View style={styles.errorBox}>
          <Ionicons name="warning-outline" size={15} color={colors.types.fire} />
          <Text style={styles.errorText}>
            Unknown move or species — check spelling and try again.
          </Text>
        </View>
      )}

      {/* Result */}
      {result && <ResultCard result={result} />}

      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll:          { flex: 1, backgroundColor: colors.bg },
  content:         { padding: spacing.md, gap: spacing.md },
  contentTablet:   { maxWidth: 1000, alignSelf: 'center', width: '100%' },

  // Panels layout
  panelsRow:       { gap: spacing.md },
  panelsRowTablet: { flexDirection: 'row', alignItems: 'flex-start' },

  panel:           {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
    gap: spacing.sm,
  },
  panelTitle:      { color: colors.text, fontSize: 15, fontWeight: font.bold },

  swapBtn:         {
    alignSelf: 'center',
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border,
  },

  // Fields
  fieldLabel:      {
    color: colors.textDim, fontSize: 10,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  input:           {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.sm, paddingVertical: 8,
    color: colors.text, fontSize: 14,
  },

  speciesRow:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusDot:       { width: 8, height: 8, borderRadius: 4 },
  dotGreen:        { backgroundColor: '#63bb5b' },
  dotRed:          { backgroundColor: '#f97176' },

  // Base stats box (unknown species)
  baseBox:         {
    backgroundColor: colors.surface,
    borderRadius: radius.md, padding: spacing.sm,
    borderWidth: 1, borderColor: colors.types.fire + '55',
    gap: spacing.xs,
  },

  // Stat row (EVs and base stats share the same grid)
  statRow:         { flexDirection: 'row', gap: spacing.xs },
  statCell:        { flex: 1, alignItems: 'center', gap: 2 },
  statLabel:       { color: colors.textDim, fontSize: 9, letterSpacing: 0.4 },
  statInput:       {
    backgroundColor: colors.bg,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    width: '100%', textAlign: 'center',
    paddingVertical: 5, paddingHorizontal: 2,
    color: colors.text, fontSize: 12,
  },

  // Level + Nature row
  levelNatureRow:  { flexDirection: 'row', gap: spacing.sm },
  levelWrap:       { width: 72, gap: spacing.xs },
  levelInput:      { textAlign: 'center' },
  natureWrap:      { flex: 1, gap: spacing.xs },
  natureBtn:       {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
  },
  natureBtnText:   { color: colors.text, fontSize: 14, flex: 1 },
  natureBuff:      { color: colors.accent, fontSize: 10, fontWeight: font.bold },

  // Nature modal
  overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheetWrap:       { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet:           {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.md, maxHeight: 460,
  },
  sheetHandle:     {
    alignSelf: 'center', width: 40, height: 4,
    backgroundColor: colors.border, borderRadius: 2, marginBottom: spacing.sm,
  },
  sheetTitle:      { color: colors.text, fontSize: 16, fontWeight: font.bold, marginBottom: spacing.sm },
  sheetSearch:     {
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.sm, paddingVertical: 8,
    color: colors.text, fontSize: 14, marginBottom: spacing.xs,
  },
  natRow:          {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.sm,
  },
  natRowActive:    { backgroundColor: colors.primary + '22' },
  natText:         { color: colors.text, fontSize: 15 },
  natTextActive:   { color: colors.primary, fontWeight: font.bold },
  natBuff:         { color: colors.accent, fontSize: 11, fontWeight: font.bold },
  natNeutral:      { color: colors.textDim, fontSize: 11 },

  // Move section
  section:         { gap: spacing.xs },

  // Calc button
  calcBtn:         {
    backgroundColor: colors.primary,
    borderRadius: radius.md, paddingVertical: spacing.md,
    alignItems: 'center',
  },
  calcBtnOff:      {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  calcBtnLabel:    { color: colors.bg, fontSize: 15, fontWeight: font.bold },

  // Error
  errorBox:        {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.types.fire + '55',
  },
  errorText:       { color: colors.textMuted, fontSize: 13, flex: 1 },

  // Result card
  resultCard:      {
    backgroundColor: colors.card, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  resultDesc:      { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  resultNumRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultPct:       { color: colors.text, fontSize: 22, fontWeight: font.bold },
  koBadge:         {
    borderWidth: 1, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: 4,
  },
  koText:          { fontSize: 13, fontWeight: font.bold },

  barTrack:        {
    height: 10, backgroundColor: colors.surface,
    borderRadius: radius.full, overflow: 'hidden',
  },
  barFill:         {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    backgroundColor: colors.primary + '88', borderRadius: radius.full,
  },
  barMarker:       {
    position: 'absolute', top: 0, bottom: 0,
    width: 2, backgroundColor: colors.primary,
  },
  barAxisLabels:   { flexDirection: 'row', justifyContent: 'space-between' },
  barAxisLabel:    { color: colors.textDim, fontSize: 9 },
  rawDmg:          { color: colors.textDim, fontSize: 11 },

  // Speed bar
  speedCard:       {
    backgroundColor: colors.card, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  speedRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  speedLabel:      { color: colors.textDim, fontSize: 11, fontWeight: font.bold, letterSpacing: 0.5 },
  speedVerdict:    { fontSize: 12, fontWeight: font.bold },
  speedBars:       { gap: spacing.xs },
  speedBarWrap:    { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  speedStat:       { color: colors.text, fontSize: 13, fontWeight: font.medium, width: 36, textAlign: 'right' },
  speedTrack:      { flex: 1, height: 8, backgroundColor: colors.surface, borderRadius: radius.full, overflow: 'hidden' },
  speedFill:       { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radius.full },
});
