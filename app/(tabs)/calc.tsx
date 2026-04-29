import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, FlatList,
  StyleSheet, Modal, Pressable, KeyboardAvoidingView, Platform, SectionList, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useGame, type GameId } from '@/lib/GameContext';
import { runCalc, isKnownSpecies, getComputedSpeed, type CalcMon, type CalcResult } from '@/lib/calc';
import { takePendingDefender } from '@/lib/calcStore';
import { getGameData, type Pokemon, type Trainer } from '@/lib/data';
import { useIsTablet } from '@/lib/layout';
import { colors, spacing, radius, font } from '@/lib/theme';
import Sprite from '@/components/Sprite';
import TrainerAvatar from '@/components/TrainerAvatar';
import { loadBox, saveBox, emptyBoxMon, type BoxMon } from '@/lib/myBox';

// ─── Constants ───────────────────────────────────────────────────────────────

const NATURES = [
  'Hardy','Lonely','Brave','Adamant','Naughty',
  'Bold','Docile','Relaxed','Impish','Lax',
  'Timid','Hasty','Serious','Jolly','Naive',
  'Modest','Mild','Quiet','Bashful','Rash',
  'Calm','Gentle','Sassy','Careful','Quirky',
];

const NATURE_BUFF: Record<string, string> = {
  Lonely:'Atk', Brave:'Atk', Adamant:'Atk', Naughty:'Atk',
  Bold:'Def',   Relaxed:'Def', Impish:'Def', Lax:'Def',
  Timid:'Spe',  Hasty:'Spe',  Jolly:'Spe',  Naive:'Spe',
  Modest:'SpA', Mild:'SpA',   Quiet:'SpA',  Rash:'SpA',
  Calm:'SpD',   Gentle:'SpD', Sassy:'SpD',  Careful:'SpD',
};

const NATURE_NERF: Record<string, string> = {
  Lonely:'Def', Brave:'Spe', Adamant:'SpA', Naughty:'SpD',
  Bold:'Atk',   Relaxed:'Spe', Impish:'SpA', Lax:'SpD',
  Timid:'Atk',  Hasty:'Def',  Jolly:'SpA',  Naive:'SpD',
  Modest:'Atk', Mild:'Def',   Quiet:'Spe',  Rash:'SpD',
  Calm:'Atk',   Gentle:'Def', Sassy:'Spe',  Careful:'SpA',
};

const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
type StatKey = typeof STAT_KEYS[number];

const EMPTY_MON = (): CalcMon => ({ species: '', level: 100, nature: 'Hardy', evs: {} });

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface FlatTrainer {
  trainer:      Trainer;
  locationId:   string;
  locationName: string;
}

function boxMonToCalcMon(mon: BoxMon): CalcMon {
  return { species: mon.species, level: mon.level, nature: mon.nature, evs: mon.evs, ivs: mon.ivs };
}

function pokemonToCalcMon(mon: Pokemon): CalcMon {
  const evs = {
    hp:  mon.evs?.hp  ?? 0,
    atk: mon.evs?.atk ?? 0,
    def: mon.evs?.def ?? 0,
    spa: mon.evs?.spa ?? 0,
    spd: mon.evs?.spd ?? 0,
    spe: mon.evs?.spe ?? 0,
  };

  const rawIvs = {
    hp:  mon.ivs?.hp  ?? 31,
    atk: mon.ivs?.atk ?? 31,
    def: mon.ivs?.def ?? 31,
    spa: mon.ivs?.spa ?? 31,
    spd: mon.ivs?.spd ?? 31,
    spe: mon.ivs?.spe ?? 31,
  };
  const allMax = STAT_KEYS.every(s => rawIvs[s] === 31);

  return {
    species: mon.species,
    level:   typeof mon.level === 'number' ? mon.level : (parseInt(String(mon.level)) || 50),
    nature:  mon.nature || 'Hardy',
    evs,
    ivs: allMax ? undefined : rawIvs,
  };
}

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
                  ? (
                    <View style={styles.natStatRow}>
                      <Text style={styles.natBuff}>{NATURE_BUFF[n]}+</Text>
                      <Text style={styles.natNerf}>{NATURE_NERF[n]}−</Text>
                    </View>
                  )
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

// ─── Trainer picker sheet ────────────────────────────────────────────────────

function TrainerPickerSheet({
  visible, game, onSelect, onClose,
}: {
  visible:  boolean;
  game:     GameId;
  onSelect: (ft: FlatTrainer) => void;
  onClose:  () => void;
}) {
  const [query, setQuery] = useState('');
  useEffect(() => { if (!visible) setQuery(''); }, [visible]);

  const data = getGameData(game);

  const allTrainers: FlatTrainer[] = useMemo(() =>
    data.locations.flatMap(loc =>
      loc.trainers.map(t => ({ trainer: t, locationId: loc.id, locationName: loc.name }))
    ),
    [data],
  );

  const sections = useMemo(() => {
    const q = query.toLowerCase().trim();
    const filtered = !q
      ? allTrainers
      : allTrainers.filter(ft =>
          ft.trainer.name?.toLowerCase().includes(q) ||
          ft.locationName.toLowerCase().includes(q)
        );
    const map = new Map<string, { title: string; data: FlatTrainer[] }>();
    for (const ft of filtered) {
      if (!map.has(ft.locationId)) map.set(ft.locationId, { title: ft.locationName, data: [] });
      map.get(ft.locationId)!.data.push(ft);
    }
    return Array.from(map.values());
  }, [allTrainers, query]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
      >
        <View style={[styles.sheet, pickerSt.sheet]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Select Trainer</Text>
          <TextInput
            style={styles.sheetSearch}
            placeholder="Search trainer or location…"
            placeholderTextColor={colors.textDim}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
          <SectionList
            sections={sections}
            keyExtractor={(ft, i) => `${ft.trainer.id}-${i}`}
            keyboardShouldPersistTaps="handled"
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => (
              <Text style={pickerSt.sectionHeader}>{section.title}</Text>
            )}
            renderItem={({ item: ft }) => (
              <TouchableOpacity
                style={pickerSt.row}
                onPress={() => { onSelect(ft); onClose(); }}
                activeOpacity={0.7}
              >
                <View style={pickerSt.rowBody}>
                  <Text style={pickerSt.trainerName}>{ft.trainer.name ?? 'Trainer'}</Text>
                </View>
                <View style={pickerSt.spriteRow}>
                  {ft.trainer.team.filter(m => m.species).slice(0, 5).map((m, i) => (
                    <Sprite key={i} species={m.species} size={22} />
                  ))}
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.textDim} />
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={pickerSt.sep} />}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Trainer bar + team strip ─────────────────────────────────────────────────

function TrainerBar({
  trainer, monIdx, onChangeTrainer, onSelectMon,
}: {
  trainer:        FlatTrainer | null;
  monIdx:         number;
  onChangeTrainer: () => void;
  onSelectMon:    (mon: Pokemon, idx: number) => void;
}) {
  const validTeam = trainer?.trainer.team.filter(m => m.species) ?? [];

  return (
    <View style={tbSt.container}>
      {/* Header row */}
      <TouchableOpacity
        style={tbSt.header}
        onPress={onChangeTrainer}
        activeOpacity={0.7}
      >
        <TrainerAvatar name={trainer?.trainer.name ?? null} size={36} />
        <View style={tbSt.headerText}>
          <Text style={tbSt.trainerName} numberOfLines={1}>
            {trainer ? (trainer.trainer.name ?? 'Trainer') : 'Select a trainer opponent'}
          </Text>
          {trainer && (
            <Text style={tbSt.locationName} numberOfLines={1}>{trainer.locationName}</Text>
          )}
        </View>
        <View style={tbSt.changeChip}>
          <Text style={tbSt.changeLabel}>{trainer ? 'Change' : 'Browse'}</Text>
          <Ionicons name="chevron-down" size={11} color={colors.primary} />
        </View>
      </TouchableOpacity>

      {/* Team strip */}
      {validTeam.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={tbSt.teamStrip}
        >
          {validTeam.map((mon, i) => {
            const active = i === monIdx;
            return (
              <TouchableOpacity
                key={i}
                style={[tbSt.monChip, active && tbSt.monChipActive]}
                onPress={() => onSelectMon(mon, i)}
                activeOpacity={0.75}
              >
                <Sprite species={mon.species} size={44} />
                <Text style={[tbSt.monName, active && tbSt.monNameActive]} numberOfLines={1}>
                  {mon.species}
                </Text>
                <Text style={[tbSt.monLevel, active && tbSt.monLevelActive]}>
                  Lv.{mon.level}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {!trainer && (
        <TouchableOpacity style={tbSt.emptyBanner} onPress={onChangeTrainer} activeOpacity={0.7}>
          <Ionicons name="person-add-outline" size={14} color={colors.textDim} />
          <Text style={tbSt.emptyText}>Pick a trainer to calc against their team</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Move chips ───────────────────────────────────────────────────────────────

function MoveChips({
  moves, activeMove, onSelect,
}: {
  moves:       string[];
  activeMove:  string;
  onSelect:    (move: string) => void;
}) {
  const valid = moves.filter(Boolean);
  if (valid.length === 0) return null;

  return (
    <View style={mvSt.row}>
      {valid.map(mv => {
        const active = mv.toLowerCase() === activeMove.toLowerCase();
        return (
          <TouchableOpacity
            key={mv}
            style={[mvSt.chip, active && mvSt.chipActive]}
            onPress={() => onSelect(mv)}
            activeOpacity={0.7}
          >
            <Text style={[mvSt.label, active && mvSt.labelActive]} numberOfLines={1}>
              {mv}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Box mon edit modal ───────────────────────────────────────────────────────

function BoxMonEditModal({
  visible, initial, onSave, onDelete, onClose,
}: {
  visible:  boolean;
  initial:  BoxMon | null;
  onSave:   (mon: BoxMon) => void;
  onDelete: (() => void) | null;
  onClose:  () => void;
}) {
  const [draft, setDraft]       = useState<BoxMon>(emptyBoxMon());
  const [showNature, setShowNature] = useState(false);

  useEffect(() => {
    setDraft(initial ? { ...initial } : emptyBoxMon());
    setShowNature(false);
  }, [visible, initial]);

  function setEvs(stat: StatKey, val: string) {
    setDraft(d => ({ ...d, evs: { ...d.evs, [stat]: Math.min(252, Number(val) || 0) } }));
  }

  function setIvs(stat: StatKey, val: string) {
    const n = val === '' ? 31 : Math.min(31, Math.max(0, Number(val) || 0));
    setDraft(d => {
      const next = { ...(d.ivs ?? {}), [stat]: n };
      const allMax = STAT_KEYS.every(s => (next[s] ?? 31) === 31);
      return { ...d, ivs: allMax ? undefined : next };
    });
  }

  function setMove(idx: 0 | 1 | 2 | 3, val: string) {
    setDraft(d => {
      const moves = [...d.moves] as [string, string, string, string];
      moves[idx] = val;
      return { ...d, moves };
    });
  }

  const canSave = draft.species.trim().length > 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={editSt.screen}>
        {/* Header */}
        <View style={editSt.header}>
          <TouchableOpacity onPress={onClose} style={editSt.headerSide}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </TouchableOpacity>
          <Text style={editSt.headerTitle}>{initial ? 'Edit Pokémon' : 'Add Pokémon'}</Text>
          <TouchableOpacity
            onPress={() => canSave && onSave(draft)}
            style={editSt.headerSide}
            disabled={!canSave}
          >
            <Text style={[editSt.saveLabel, !canSave && { color: colors.textDim }]}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={editSt.body} keyboardShouldPersistTaps="handled">
          {/* Species */}
          <Text style={styles.fieldLabel}>Species</Text>
          <TextInput
            style={styles.input}
            value={draft.species}
            onChangeText={v => setDraft(d => ({ ...d, species: v }))}
            placeholder="Garchomp, Greninja…"
            placeholderTextColor={colors.textDim}
            autoCapitalize="words"
            autoCorrect={false}
          />

          {/* Level + Nature */}
          <View style={styles.levelNatureRow}>
            <View style={styles.levelWrap}>
              <Text style={styles.fieldLabel}>Level</Text>
              <TextInput
                style={[styles.input, styles.levelInput]}
                keyboardType="numeric"
                value={String(draft.level)}
                onChangeText={v => setDraft(d => ({ ...d, level: Math.min(100, Math.max(1, Number(v) || 1)) }))}
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
                <Text style={styles.natureBtnText}>{draft.nature}</Text>
                {NATURE_BUFF[draft.nature] && (
                  <>
                    <Text style={styles.natureBuff}>{NATURE_BUFF[draft.nature]}+</Text>
                    <Text style={styles.natureNerf}>{NATURE_NERF[draft.nature]}−</Text>
                  </>
                )}
                <Ionicons name="chevron-down" size={12} color={colors.textDim} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Item */}
          <Text style={styles.fieldLabel}>Item</Text>
          <TextInput
            style={styles.input}
            value={draft.item}
            onChangeText={v => setDraft(d => ({ ...d, item: v }))}
            placeholder="Choice Scarf, Life Orb…"
            placeholderTextColor={colors.textDim}
            autoCapitalize="words"
            autoCorrect={false}
          />

          {/* Moves */}
          <Text style={styles.fieldLabel}>Moves</Text>
          <View style={editSt.movesGrid}>
            {([0, 1, 2, 3] as const).map(i => (
              <TextInput
                key={i}
                style={[styles.input, editSt.moveInput]}
                value={draft.moves[i]}
                onChangeText={v => setMove(i, v)}
                placeholder={`Move ${i + 1}`}
                placeholderTextColor={colors.textDim}
                autoCapitalize="words"
                autoCorrect={false}
              />
            ))}
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
                  value={draft.evs[s] ? String(draft.evs[s]) : ''}
                  onChangeText={v => setEvs(s, v)}
                  placeholder="0"
                  placeholderTextColor={colors.textDim}
                  maxLength={3}
                />
              </View>
            ))}
          </View>

          {/* IVs */}
          <Text style={styles.fieldLabel}>IVs</Text>
          <View style={styles.statRow}>
            {STAT_KEYS.map(s => (
              <View key={s} style={styles.statCell}>
                <Text style={styles.statLabel}>{s.toUpperCase()}</Text>
                <TextInput
                  style={styles.statInput}
                  keyboardType="numeric"
                  value={draft.ivs?.[s] !== undefined ? String(draft.ivs[s]) : ''}
                  onChangeText={v => setIvs(s, v)}
                  placeholder="31"
                  placeholderTextColor={colors.textDim}
                  maxLength={2}
                />
              </View>
            ))}
          </View>

          {onDelete && (
            <TouchableOpacity style={editSt.deleteBtn} onPress={onDelete} activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={15} color="#f97176" />
              <Text style={editSt.deleteBtnText}>Remove from Box</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: spacing.xxl }} />
        </ScrollView>

        <NaturePicker
          visible={showNature}
          current={draft.nature}
          onSelect={n => setDraft(d => ({ ...d, nature: n }))}
          onClose={() => setShowNature(false)}
        />
      </View>
    </Modal>
  );
}

// ─── My Box bar ───────────────────────────────────────────────────────────────

function MyBoxBar({
  box, activeIdx, onAdd, onLongPress, onClear, onSelectMon,
}: {
  box:          BoxMon[];
  activeIdx:    number;
  onAdd:        () => void;
  onLongPress:  (mon: BoxMon, idx: number) => void;
  onClear:      () => void;
  onSelectMon:  (mon: BoxMon, idx: number) => void;
}) {
  const [confirmClear, setConfirmClear] = useState(false);

  function handleClearPress() {
    if (confirmClear) {
      setConfirmClear(false);
      onClear();
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  }

  return (
    <View style={tbSt.container}>
      <View style={[tbSt.header, { borderBottomWidth: box.length > 0 ? StyleSheet.hairlineWidth : 0 }]}>
        <Image source={require('@/assets/trainers/rr-red.gif')} style={{ width: 36, height: 36 }} resizeMode="contain" />
        <Text style={[tbSt.trainerName, { flex: 1 }]}>My Box</Text>
        {box.length > 0 && (
          <TouchableOpacity onPress={handleClearPress} style={[mbSt.clearBtn, confirmClear && mbSt.clearBtnConfirm]} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={12} color={confirmClear ? '#fff' : colors.types.fire} />
            <Text style={[mbSt.clearLabel, confirmClear && mbSt.clearLabelConfirm]}>
              {confirmClear ? 'Confirm?' : 'Clear'}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onAdd} style={tbSt.changeChip} activeOpacity={0.7}>
          <Ionicons name="add" size={13} color={colors.primary} />
          <Text style={tbSt.changeLabel}>Add</Text>
        </TouchableOpacity>
      </View>

      {box.length === 0 ? (
        <TouchableOpacity style={tbSt.emptyBanner} onPress={onAdd} activeOpacity={0.7}>
          <Ionicons name="add-circle-outline" size={14} color={colors.textDim} />
          <Text style={tbSt.emptyText}>Add your Pokémon to quick-select as attacker</Text>
        </TouchableOpacity>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tbSt.teamStrip}>
          {box.map((mon, i) => {
            const active = i === activeIdx;
            return (
              <TouchableOpacity
                key={mon.id}
                style={[tbSt.monChip, active && tbSt.monChipActive]}
                onPress={() => onSelectMon(mon, i)}
                onLongPress={() => onLongPress(mon, i)}
                activeOpacity={0.75}
              >
                <Sprite species={mon.species} size={44} />
                <Text style={[tbSt.monName, active && tbSt.monNameActive]} numberOfLines={1}>
                  {mon.species}
                </Text>
                <Text style={[tbSt.monLevel, active && tbSt.monLevelActive]}>
                  Lv.{mon.level}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
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

  function setIvs(stat: StatKey, val: string) {
    const n = val === '' ? 31 : Math.min(31, Math.max(0, Number(val) || 0));
    const next = { ...(mon.ivs ?? {}), [stat]: n };
    // If all 31, drop the ivs field entirely (let the calc default)
    const allMax = STAT_KEYS.every(s => (next[s] ?? 31) === 31);
    onChange({ ...mon, ivs: allMax ? undefined : next });
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
              <>
                <Text style={styles.natureBuff}>{NATURE_BUFF[mon.nature]}+</Text>
                <Text style={styles.natureNerf}>{NATURE_NERF[mon.nature]}−</Text>
              </>
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

      {/* IVs */}
      <Text style={styles.fieldLabel}>IVs</Text>
      <View style={styles.statRow}>
        {STAT_KEYS.map(s => (
          <View key={s} style={styles.statCell}>
            <Text style={styles.statLabel}>{s.toUpperCase()}</Text>
            <TextInput
              style={styles.statInput}
              keyboardType="numeric"
              value={mon.ivs?.[s] !== undefined ? String(mon.ivs[s]) : ''}
              onChangeText={v => setIvs(s, v)}
              placeholder="31"
              placeholderTextColor={colors.textDim}
              maxLength={2}
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

  const faster = atkSpe > defSpe ? 'atk' : atkSpe < defSpe ? 'def' : 'tie';
  const delta  = Math.abs(atkSpe - defSpe);
  const label  =
    faster === 'atk' ? `Attacker outspeeds by ${delta}` :
    faster === 'def' ? `Defender outspeeds by ${delta}` :
                       'Speed tie';
  const color  =
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
            <View style={[styles.speedFill, { width: `${(atkSpe / max) * 100}%` as any, backgroundColor: '#63bb5b88' }]} />
          </View>
        </View>
        <View style={styles.speedBarWrap}>
          <Text style={styles.speedStat}>{defSpe}</Text>
          <View style={styles.speedTrack}>
            <View style={[styles.speedFill, { width: `${(defSpe / max) * 100}%` as any, backgroundColor: '#f9717688' }]} />
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function CalcScreen() {
  const { game } = useGame();
  const isTablet = useIsTablet();

  const [atk, setAtk] = useState<CalcMon>(EMPTY_MON());
  const [def, setDef] = useState<CalcMon>(EMPTY_MON());
  const [move,    setMove]    = useState('');
  const [result,  setResult]  = useState<CalcResult | null>(null);
  const [errored, setErrored] = useState(false);

  const [selectedTrainer, setSelectedTrainer] = useState<FlatTrainer | null>(null);
  const [selectedMonIdx,  setSelectedMonIdx]  = useState<number>(-1);
  const [showPicker,      setShowPicker]      = useState(false);

  // My Box
  const [box,           setBox]          = useState<BoxMon[]>([]);
  const [activeBoxIdx,  setActiveBoxIdx] = useState<number>(-1);
  const [editTarget,    setEditTarget]   = useState<{ mon: BoxMon | null; idx: number | null } | null>(null);

  useEffect(() => { loadBox().then(setBox); }, []);

  function persistBox(next: BoxMon[]) { setBox(next); saveBox(next); }

  function openAdd()                         { setEditTarget({ mon: null, idx: null }); }
  function openEdit(mon: BoxMon, idx: number){ setEditTarget({ mon, idx }); }
  function closeEdit()                       { setEditTarget(null); }

  function handleSaveMon(saved: BoxMon) {
    const idx = editTarget!.idx;
    const next = idx !== null ? box.map((m, i) => i === idx ? saved : m) : [...box, saved];
    persistBox(next);
    const newIdx = idx ?? next.length - 1;
    setActiveBoxIdx(newIdx);
    setAtk(boxMonToCalcMon(next[newIdx]));
    clearResult();
    closeEdit();
  }

  function handleDeleteMon() {
    const idx = editTarget!.idx!;
    const next = box.filter((_, i) => i !== idx);
    persistBox(next);
    if (idx === activeBoxIdx) { setActiveBoxIdx(-1); }
    else if (idx < activeBoxIdx) { setActiveBoxIdx(activeBoxIdx - 1); }
    closeEdit();
  }

  function handleClearBox() {
    persistBox([]);
    setActiveBoxIdx(-1);
    setAtk(EMPTY_MON());
    clearResult();
  }

  function applyBoxMon(mon: BoxMon, idx: number) {
    setActiveBoxIdx(idx);
    setAtk(boxMonToCalcMon(mon));
    clearResult();
  }

  const activeBoxMon = activeBoxIdx >= 0 ? box[activeBoxIdx] : null;
  const atkMoves     = activeBoxMon?.moves.filter(Boolean) ?? [];

  // The active trainer Pokemon (for move chips)
  const trainerTeam = selectedTrainer?.trainer.team.filter(m => m.species) ?? [];
  const activeMon   = selectedMonIdx >= 0 ? trainerTeam[selectedMonIdx] : null;
  const activeMoves = activeMon?.moves?.filter(Boolean) ?? [];

  function clearResult() { setResult(null); setErrored(false); }

  function applyTrainer(ft: FlatTrainer) {
    setSelectedTrainer(ft);
    const team = ft.trainer.team.filter(m => m.species);
    if (team.length > 0) {
      setSelectedMonIdx(0);
      setDef(pokemonToCalcMon(team[0]));
      clearResult();
    }
  }

  function applyTeamMon(mon: Pokemon, idx: number) {
    setSelectedMonIdx(idx);
    setDef(pokemonToCalcMon(mon));
    clearResult();
  }

  // Pick up any defender pre-filled from the trainer detail screen
  useFocusEffect(
    useCallback(() => {
      const pending = takePendingDefender();
      if (pending) {
        setDef(pending);
        setSelectedTrainer(null);
        setSelectedMonIdx(-1);
        setResult(null);
        setErrored(false);
      }
    }, []),
  );

  const canCalc = Boolean(atk.species.trim() && def.species.trim() && move.trim());

  const doCalc = useCallback((moveOverride?: string) => {
    const mv = (moveOverride ?? move).trim();
    if (!atk.species.trim() || !def.species.trim() || !mv) return;
    const r = runCalc(game, atk, def, mv);
    if (r) { setResult(r); setErrored(false); }
    else   { setResult(null); setErrored(true); }
  }, [game, atk, def, move]);

  function onMoveChipTap(mv: string) {
    setMove(mv);
    clearResult();
    // auto-calc if attacker is ready
    if (atk.species.trim() && def.species.trim()) {
      const r = runCalc(game, atk, def, mv);
      if (r) { setResult(r); setErrored(false); }
      else   { setResult(null); setErrored(true); }
    }
  }

  function swapMonsters() {
    setAtk(def); setDef(atk);
    setSelectedTrainer(null); setSelectedMonIdx(-1);
    clearResult();
  }

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, isTablet && styles.contentTablet]}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Trainer bar ── */}
      <TrainerBar
        trainer={selectedTrainer}
        monIdx={selectedMonIdx}
        onChangeTrainer={() => setShowPicker(true)}
        onSelectMon={applyTeamMon}
      />

      {/* ── Defender (trainer's Pokémon) ── */}
      <MonPanel
        title="Defender 🛡"
        mon={def}
        onChange={m => { setDef(m); clearResult(); }}
      />

      {/* ── Move chips (trainer Pokémon's moves) ── */}
      {activeMoves.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.fieldLabel}>Defender's moves — tap to calculate</Text>
          <MoveChips
            moves={activeMoves}
            activeMove={move}
            onSelect={onMoveChipTap}
          />
        </View>
      )}

      {/* ── Divider + swap ── */}
      <View style={styles.swapRow}>
        <View style={styles.dividerLine} />
        <TouchableOpacity style={styles.swapBtn} onPress={swapMonsters} activeOpacity={0.7}>
          <Ionicons name="swap-vertical" size={16} color={colors.textMuted} />
          <Text style={styles.swapLabel}>Swap</Text>
        </TouchableOpacity>
        <View style={styles.dividerLine} />
      </View>

      {/* ── My Box ── */}
      <MyBoxBar
        box={box}
        activeIdx={activeBoxIdx}
        onAdd={openAdd}
        onLongPress={openEdit}
        onClear={handleClearBox}
        onSelectMon={applyBoxMon}
      />

      {/* ── Attacker ── */}
      <MonPanel
        title="Attacker ⚔"
        mon={atk}
        onChange={m => { setAtk(m); setActiveBoxIdx(-1); clearResult(); }}
      />

      {/* ── Attacker move chips ── */}
      {atkMoves.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.fieldLabel}>Your moves — tap to calculate</Text>
          <MoveChips moves={atkMoves} activeMove={move} onSelect={onMoveChipTap} />
        </View>
      )}

      {/* ── Speed comparison ── */}
      {atk.species.trim() && def.species.trim() && (
        <SpeedBar atk={atk} def={def} />
      )}

      {/* ── Move input ── */}
      <View style={styles.sectionCard}>
        <Text style={styles.fieldLabel}>Move</Text>
        <TextInput
          style={styles.input}
          value={move}
          onChangeText={v => { setMove(v); clearResult(); }}
          placeholder="Earthquake, Ice Beam, Play Rough…"
          placeholderTextColor={colors.textDim}
          autoCapitalize="words"
          autoCorrect={false}
          onSubmitEditing={() => doCalc()}
          returnKeyType="go"
        />
      </View>

      {/* ── Calc button ── */}
      <TouchableOpacity
        style={[styles.calcBtn, !canCalc && styles.calcBtnOff]}
        onPress={() => doCalc()}
        activeOpacity={0.8}
        disabled={!canCalc}
      >
        <Text style={[styles.calcBtnLabel, !canCalc && { color: colors.textDim }]}>
          Calculate Damage
        </Text>
      </TouchableOpacity>

      {/* ── Error ── */}
      {errored && (
        <View style={styles.errorBox}>
          <Ionicons name="warning-outline" size={15} color={colors.types.fire} />
          <Text style={styles.errorText}>
            Unknown move or species — check spelling and try again.
          </Text>
        </View>
      )}

      {/* ── Result ── */}
      {result && <ResultCard result={result} />}

      <View style={{ height: spacing.xxl }} />

      {/* ── Box mon edit modal ── */}
      <BoxMonEditModal
        visible={editTarget !== null}
        initial={editTarget?.mon ?? null}
        onSave={handleSaveMon}
        onDelete={editTarget?.idx !== null ? handleDeleteMon : null}
        onClose={closeEdit}
      />

      {/* ── Trainer picker sheet ── */}
      <TrainerPickerSheet
        visible={showPicker}
        game={game}
        onSelect={applyTrainer}
        onClose={() => setShowPicker(false)}
      />
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll:         { flex: 1, backgroundColor: colors.bg },
  content:        { padding: spacing.md, gap: spacing.md },
  contentTablet:  { maxWidth: 800, alignSelf: 'center', width: '100%' },

  panel:          {
    backgroundColor: colors.card,
    borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
    gap: spacing.sm,
  },
  panelTitle:     { color: colors.text, fontSize: 15, fontWeight: font.bold },

  sectionCard:    {
    backgroundColor: colors.card,
    borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
    gap: spacing.sm,
  },

  // Swap row
  swapRow:        { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dividerLine:    { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  swapBtn:        {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border,
  },
  swapLabel:      { color: colors.textMuted, fontSize: 12 },

  // Fields
  fieldLabel:     {
    color: colors.textDim, fontSize: 10,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  input:          {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.sm, paddingVertical: 8,
    color: colors.text, fontSize: 14,
  },

  speciesRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusDot:      { width: 8, height: 8, borderRadius: 4 },
  dotGreen:       { backgroundColor: '#63bb5b' },
  dotRed:         { backgroundColor: '#f97176' },

  baseBox:        {
    backgroundColor: colors.surface,
    borderRadius: radius.md, padding: spacing.sm,
    borderWidth: 1, borderColor: colors.types.fire + '55',
    gap: spacing.xs,
  },
  statRow:        { flexDirection: 'row', gap: spacing.xs },
  statCell:       { flex: 1, alignItems: 'center', gap: 2 },
  statLabel:      { color: colors.textDim, fontSize: 9, letterSpacing: 0.4 },
  statInput:      {
    backgroundColor: colors.bg,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    width: '100%', textAlign: 'center',
    paddingVertical: 5, paddingHorizontal: 2,
    color: colors.text, fontSize: 12,
  },

  levelNatureRow: { flexDirection: 'row', gap: spacing.sm },
  levelWrap:      { width: 72, gap: spacing.xs },
  levelInput:     { textAlign: 'center' },
  natureWrap:     { flex: 1, gap: spacing.xs },
  natureBtn:      { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  natureBtnText:  { color: colors.text, fontSize: 14, flex: 1 },
  natureBuff:     { color: '#63bb5b', fontSize: 10, fontWeight: font.bold },
  natureNerf:     { color: '#f97176', fontSize: 10, fontWeight: font.bold },

  // Modals / sheets
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheetWrap:      { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet:          {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.md, maxHeight: 460,
  },
  sheetHandle:    {
    alignSelf: 'center', width: 40, height: 4,
    backgroundColor: colors.border, borderRadius: 2, marginBottom: spacing.sm,
  },
  sheetTitle:     { color: colors.text, fontSize: 16, fontWeight: font.bold, marginBottom: spacing.sm },
  sheetSearch:    {
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.sm, paddingVertical: 8,
    color: colors.text, fontSize: 14, marginBottom: spacing.xs,
  },
  natRow:         {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.sm,
  },
  natRowActive:   { backgroundColor: colors.primary + '22' },
  natText:        { color: colors.text, fontSize: 15 },
  natTextActive:  { color: colors.primary, fontWeight: font.bold },
  natStatRow:     { flexDirection: 'row', gap: spacing.xs },
  natBuff:        { color: '#63bb5b', fontSize: 11, fontWeight: font.bold },
  natNerf:        { color: '#f97176', fontSize: 11, fontWeight: font.bold },
  natNeutral:     { color: colors.textDim, fontSize: 11 },

  // Calc
  calcBtn:        {
    backgroundColor: colors.primary,
    borderRadius: radius.md, paddingVertical: spacing.md,
    alignItems: 'center',
  },
  calcBtnOff:     {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  calcBtnLabel:   { color: colors.bg, fontSize: 15, fontWeight: font.bold },

  errorBox:       {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.types.fire + '55',
  },
  errorText:      { color: colors.textMuted, fontSize: 13, flex: 1 },

  // Result
  resultCard:     {
    backgroundColor: colors.card, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  resultDesc:     { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  resultNumRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultPct:      { color: colors.text, fontSize: 22, fontWeight: font.bold },
  koBadge:        {
    borderWidth: 1, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: 4,
  },
  koText:         { fontSize: 13, fontWeight: font.bold },
  barTrack:       {
    height: 10, backgroundColor: colors.surface,
    borderRadius: radius.full, overflow: 'hidden',
  },
  barFill:        {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    backgroundColor: colors.primary + '88', borderRadius: radius.full,
  },
  barMarker:      { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.primary },
  barAxisLabels:  { flexDirection: 'row', justifyContent: 'space-between' },
  barAxisLabel:   { color: colors.textDim, fontSize: 9 },
  rawDmg:         { color: colors.textDim, fontSize: 11 },

  // Speed
  speedCard:      {
    backgroundColor: colors.card, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  speedRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  speedLabel:     { color: colors.textDim, fontSize: 11, fontWeight: font.bold, letterSpacing: 0.5 },
  speedVerdict:   { fontSize: 12, fontWeight: font.bold },
  speedBars:      { gap: spacing.xs },
  speedBarWrap:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  speedStat:      { color: colors.text, fontSize: 13, fontWeight: font.medium, width: 36, textAlign: 'right' },
  speedTrack:     { flex: 1, height: 8, backgroundColor: colors.surface, borderRadius: radius.full, overflow: 'hidden' },
  speedFill:      { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radius.full },
});

// ── Trainer bar styles ────────────────────────────────────────────────────────

const tbSt = StyleSheet.create({
  container:     {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  header:        {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  headerText:    { flex: 1 },
  trainerName:   { color: colors.text, fontSize: 14, fontWeight: font.bold },
  locationName:  { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  changeChip:    {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    backgroundColor: colors.primary + '18',
    borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.primary + '44',
  },
  changeLabel:   { color: colors.primary, fontSize: 11, fontWeight: font.medium },

  teamStrip:     {
    flexDirection: 'row', gap: spacing.xs,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
  },
  monChip:       {
    alignItems: 'center', gap: 3,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1.5, borderColor: 'transparent',
    minWidth: 68,
  },
  monChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '18',
  },
  monName:       { color: colors.textMuted, fontSize: 10, fontWeight: font.medium, textAlign: 'center' },
  monNameActive: { color: colors.primary },
  monLevel:      { color: colors.textDim, fontSize: 9, textAlign: 'center' },
  monLevelActive: { color: colors.primary + 'cc' },

  emptyBanner:   {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  emptyText:     { color: colors.textDim, fontSize: 13 },
});

// ── Trainer picker sheet styles ───────────────────────────────────────────────

const pickerSt = StyleSheet.create({
  sheet:         { maxHeight: 580 },
  sectionHeader: {
    color: colors.textDim, fontSize: 10, fontWeight: font.bold,
    textTransform: 'uppercase', letterSpacing: 0.6,
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  row:           {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, gap: spacing.sm,
  },
  rowBody:       { flex: 1 },
  trainerName:   { color: colors.text, fontSize: 14, fontWeight: font.medium },
  spriteRow:     { flexDirection: 'row', gap: 2, alignItems: 'center' },
  sep:           { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.md },
});

// ── My Box bar styles ─────────────────────────────────────────────────────────

const mbSt = StyleSheet.create({
  clearBtn:  {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    backgroundColor: colors.types.fire + '18',
    borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.types.fire + '44',
    marginRight: spacing.xs,
  },
  clearBtnConfirm: {
    backgroundColor: colors.types.fire,
    borderColor: colors.types.fire,
  },
  clearLabel:        { color: colors.types.fire, fontSize: 11, fontWeight: font.medium },
  clearLabelConfirm: { color: '#fff' },
});

// ── Box mon edit modal styles ─────────────────────────────────────────────────

const editSt = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: colors.bg },
  header:      {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerSide:  { width: 60, alignItems: 'flex-start' },
  headerTitle: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 16, fontWeight: font.bold },
  saveLabel:   { color: colors.primary, fontSize: 15, fontWeight: font.bold },
  body:        { padding: spacing.md, gap: spacing.sm },
  movesGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  moveInput:   { width: '48.5%' },
  deleteBtn:   {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: '#f97176' + '55',
  },
  deleteBtnText: { color: '#f97176', fontSize: 14, fontWeight: font.medium },
});

// ── Move chips styles ─────────────────────────────────────────────────────────

const mvSt = StyleSheet.create({
  row:        { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip:       {
    paddingHorizontal: spacing.md, paddingVertical: 7,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  label:      { color: colors.text, fontSize: 13, fontWeight: font.medium },
  labelActive: { color: colors.bg },
});
