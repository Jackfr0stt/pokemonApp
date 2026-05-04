import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, FlatList,
  StyleSheet, Modal, Pressable, KeyboardAvoidingView, Platform, SectionList, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useGame, type GameId } from '@/lib/GameContext';
import { runCalc, isKnownSpecies, getBaseStats, getSpeciesAbilities, getAllAbilities, getAllMoves, getAllItems, getAllSpecies, getSpeciesTypes, getBaseSpeciesName, getSpeciesForms, getComputedSpeed, getComputedStats, getAbilityStatMods, getSpeciesAbility, type CalcMon, type CalcResult, type CalcField } from '@/lib/calc';
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

// Maps CalcMon stat key → the label used in NATURE_BUFF/NATURE_NERF
const STAT_TO_NAT: Record<string, string> = {
  hp: '', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe',
};

const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
type StatKey = typeof STAT_KEYS[number];

const BOOST_STAT_KEYS = ['atk', 'def', 'spa', 'spd', 'spe'] as const;

const STATUS_OPTIONS = [
  { label: 'None', value: '' },
  { label: 'BRN',  value: 'brn' },
  { label: 'PAR',  value: 'par' },
  { label: 'PSN',  value: 'psn' },
  { label: 'TOX',  value: 'tox' },
  { label: 'FRZ',  value: 'frz' },
  { label: 'SLP',  value: 'slp' },
] as const;

const TYPES = [
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice',
  'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug',
  'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
] as const;

const WEATHER_OPTIONS: { label: string; value: NonNullable<CalcField['weather']> }[] = [
  { label: 'Sun',        value: 'Sun'           },
  { label: 'Rain',       value: 'Rain'          },
  { label: 'Sand',       value: 'Sand'          },
  { label: 'Snow',       value: 'Snow'          },
  { label: 'Hail',       value: 'Hail'          },
  { label: 'Harsh Sun',  value: 'Harsh Sunshine'},
  { label: 'Heavy Rain', value: 'Heavy Rain'    },
  { label: 'Winds',      value: 'Strong Winds'  },
];
const TERRAIN_OPTIONS = ['Electric', 'Grassy', 'Misty', 'Psychic'] as const;

const EMPTY_MON = (): CalcMon => ({ species: '', level: 100, nature: 'Hardy', evs: {} });

// ─── Weather inference ────────────────────────────────────────────────────────

const LOCATION_WEATHER: Record<string, Pick<CalcField, 'weather' | 'terrain'>> = {
  'route-12-snow': { weather: 'Snow' },
  'route-13-sun':  { weather: 'Sun'  },
  'route-16-sand': { weather: 'Sand' },
  'route-18-rain': { weather: 'Rain' },
};

const ABILITY_WEATHER: Record<string, NonNullable<CalcField['weather']>> = {
  'Drought':        'Sun',
  'Drizzle':        'Rain',
  'Sand Stream':    'Sand',
  'Snow Warning':   'Snow',
  'Primordial Sea': 'Heavy Rain',
  'Desolate Land':  'Harsh Sunshine',
  'Delta Stream':   'Strong Winds',
};

function inferWeatherFromTrainer(ft: { trainer: Trainer; locationId: string }): Pick<CalcField, 'weather' | 'terrain'> {
  const name  = (ft.trainer.name ?? '').toLowerCase();

  // 1. Explicit name tags — "(Permanent X)" or "(Starting X)"
  if (/permanent snow|starting snow/.test(name))             return { weather: 'Snow' };
  if (/permanent rain|starting rain/.test(name))             return { weather: 'Rain' };
  if (/permanent sun|starting sun|starting sunlight/.test(name)) return { weather: 'Sun' };
  if (/permanent sand|starting sand/.test(name))             return { weather: 'Sand' };
  if (/permanent misty terrain/.test(name))                  return { terrain: 'Misty' };
  if (/permanent electric terrain/.test(name))               return { terrain: 'Electric' };
  if (/permanent grassy terrain/.test(name))                 return { terrain: 'Grassy' };
  if (/permanent psychic terrain/.test(name))                return { terrain: 'Psychic' };

  // 2. Location-wide weather (RR named routes)
  const fromLoc = LOCATION_WEATHER[ft.locationId];
  if (fromLoc) return fromLoc;

  // 3. Ability inference — first Pokémon with a weather-setting ability
  for (const mon of ft.trainer.team) {
    const w = mon.ability ? ABILITY_WEATHER[mon.ability] : undefined;
    if (w) return { weather: w };
  }

  return {};
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface FlatTrainer {
  trainer:      Trainer;
  locationId:   string;
  locationName: string;
}

function boxMonToCalcMon(mon: BoxMon): CalcMon {
  return {
    species: mon.species,
    level:   mon.level,
    nature:  mon.nature,
    evs:     mon.evs,
    ivs:     mon.ivs,
    ...(mon.ability ? { ability: mon.ability } : {}),
    ...(mon.item    ? { item:    mon.item    } : {}),
  };
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
    ivs:     allMax ? undefined : rawIvs,
    ...(mon.ability ? { ability: mon.ability } : {}),
    ...(mon.item    ? { item:    mon.item    } : {}),
    ...(mon.stats?.hp != null && mon.stats?.atk != null && mon.stats?.def != null &&
        mon.stats?.spa != null && mon.stats?.spd != null && mon.stats?.spe != null
      ? { baseStats: mon.stats as { hp: number; atk: number; def: number; spa: number; spd: number; spe: number } }
      : {}),
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

// ─── Ability picker modal ─────────────────────────────────────────────────────

function AbilityPicker({
  visible, species, current, onSelect, onClose,
}: {
  visible:  boolean;
  species:  string;
  current:  string | undefined;
  onSelect: (a: string) => void;
  onClose:  () => void;
}) {
  const [q, setQ] = useState('');
  useEffect(() => { if (!visible) setQ(''); }, [visible]);

  const speciesAbilities = useMemo(() => getSpeciesAbilities(species), [species]);
  const allAbilities     = useMemo(() => getAllAbilities(), []);

  const sections = useMemo(() => {
    const qLow = q.toLowerCase().trim();
    if (qLow) {
      const filtered = allAbilities.filter(a => a.toLowerCase().includes(qLow));
      return [{ title: 'Abilities', data: filtered }];
    }
    if (speciesAbilities.length > 0) {
      const rest = allAbilities.filter(a => !speciesAbilities.includes(a));
      return [
        { title: 'Species Abilities', data: speciesAbilities },
        { title: 'All Abilities', data: rest },
      ];
    }
    return [{ title: 'All Abilities', data: allAbilities }];
  }, [q, speciesAbilities, allAbilities]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <View style={[styles.sheet, { maxHeight: 520 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Ability</Text>
          <TextInput
            style={styles.sheetSearch}
            placeholder="Filter…"
            placeholderTextColor={colors.textDim}
            value={q}
            onChangeText={setQ}
            autoFocus
          />
          <SectionList
            sections={sections}
            keyExtractor={(item, i) => `${item}-${i}`}
            keyboardShouldPersistTaps="handled"
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => (
              <Text style={pickerSt.sectionHeader}>{section.title}</Text>
            )}
            renderItem={({ item: a }) => (
              <TouchableOpacity
                style={[styles.natRow, a === current && styles.natRowActive]}
                onPress={() => { onSelect(a); onClose(); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.natText, a === current && styles.natTextActive]}>{a}</Text>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={pickerSt.sep} />}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Move picker modal ────────────────────────────────────────────────────────

function MovePicker({
  visible, current, onSelect, onClose,
}: {
  visible:  boolean;
  current:  string;
  onSelect: (m: string) => void;
  onClose:  () => void;
}) {
  const [q, setQ] = useState('');
  useEffect(() => { if (!visible) setQ(''); }, [visible]);

  const allMoves = useMemo(() => getAllMoves(), []);
  const filtered = useMemo(() => {
    const qLow = q.toLowerCase().trim();
    return qLow ? allMoves.filter(m => m.toLowerCase().includes(qLow)) : allMoves;
  }, [q, allMoves]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <View style={[styles.sheet, { maxHeight: 520 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Move</Text>
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
            keyExtractor={m => m}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: m }) => (
              <TouchableOpacity
                style={[styles.natRow, m.toLowerCase() === current.toLowerCase() && styles.natRowActive]}
                onPress={() => { onSelect(m); onClose(); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.natText, m.toLowerCase() === current.toLowerCase() && styles.natTextActive]}>
                  {m}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Item picker modal ────────────────────────────────────────────────────────

function ItemPicker({
  visible, current, onSelect, onClose,
}: {
  visible:  boolean;
  current:  string | undefined;
  onSelect: (item: string) => void;
  onClose:  () => void;
}) {
  const [q, setQ] = useState('');
  useEffect(() => { if (!visible) setQ(''); }, [visible]);

  const allItems = useMemo(() => getAllItems(), []);
  const filtered = useMemo(() => {
    const qLow = q.toLowerCase().trim();
    return qLow ? allItems.filter(i => i.toLowerCase().includes(qLow)) : allItems;
  }, [q, allItems]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <View style={[styles.sheet, { maxHeight: 520 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Item</Text>
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
            keyExtractor={i => i}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.natRow, item === current && styles.natRowActive]}
                onPress={() => { onSelect(item); onClose(); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.natText, item === current && styles.natTextActive]}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Species picker modal ─────────────────────────────────────────────────────

function SpeciesPicker({
  visible, current, onSelect, onClose,
}: {
  visible:  boolean;
  current:  string;
  onSelect: (species: string) => void;
  onClose:  () => void;
}) {
  const [q, setQ] = useState('');
  useEffect(() => { if (!visible) setQ(''); }, [visible]);

  const allSpecies = useMemo(() => getAllSpecies(), []);
  const filtered   = useMemo(() => {
    const qLow = q.toLowerCase().trim();
    return qLow ? allSpecies.filter(s => s.toLowerCase().includes(qLow)) : allSpecies;
  }, [q, allSpecies]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <View style={[styles.sheet, { maxHeight: 560 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Species</Text>
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
            keyExtractor={s => s}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={30}
            maxToRenderPerBatch={30}
            windowSize={10}
            renderItem={({ item: s }) => (
              <TouchableOpacity
                style={[spSt.row, s === current && styles.natRowActive]}
                onPress={() => { onSelect(s); onClose(); }}
                activeOpacity={0.7}
              >
                <Sprite species={s} size={36} />
                <Text style={[styles.natText, s === current && styles.natTextActive]}>{s}</Text>
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

// ─── Move slots type ─────────────────────────────────────────────────────────

type MoveSlots = [string, string, string, string];
type CritSlots = [boolean, boolean, boolean, boolean];
const NO_CRITS: CritSlots = [false, false, false, false];

// ─── Field swap helper ────────────────────────────────────────────────────────

function swapFieldSides(f: CalcField): CalcField {
  return {
    ...f,
    atkTailwind:    f.defTailwind,
    atkHelpingHand: undefined,
    atkFlowerGift:  f.defFlowerGift,
    atkBattery:     undefined,
    atkPowerSpot:   undefined,
    atkReflect:     f.defReflect,
    atkLightScreen: f.defLightScreen,
    atkAuroraVeil:  f.defAuroraVeil,
    atkSR:          f.defSR,
    atkSpikes:      f.defSpikes,
    atkSteelsurge:  f.defSteelsurge,
    atkVineLash:    f.defVineLash,
    atkWildfire:    f.defWildfire,
    atkCannonade:   f.defCannonade,
    atkVolcalith:   f.defVolcalith,
    defTailwind:    f.atkTailwind,
    defFlowerGift:  f.atkFlowerGift,
    defFriendGuard: undefined,
    defForesight:   undefined,
    defProtect:     undefined,
    defLeechSeed:   undefined,
    defSwitching:   undefined,
    defReflect:     f.atkReflect,
    defLightScreen: f.atkLightScreen,
    defAuroraVeil:  f.atkAuroraVeil,
    defSR:          f.atkSR,
    defSpikes:      f.atkSpikes,
    defSteelsurge:  f.atkSteelsurge,
    defVineLash:    f.atkVineLash,
    defWildfire:    f.atkWildfire,
    defCannonade:   f.atkCannonade,
    defVolcalith:   f.atkVolcalith,
  };
}

// ─── Moves list ───────────────────────────────────────────────────────────────

function MovesList({
  side, slots, crits, results, selectedRow, onSelectRow, onOpenPicker, onToggleCrit,
}: {
  side:          'atk' | 'def';
  slots:         MoveSlots;
  crits:         CritSlots;
  results:       (CalcResult | null)[];
  selectedRow:   number | null;
  onSelectRow:   (row: number) => void;
  onOpenPicker:  (row: number) => void;
  onToggleCrit:  (row: number) => void;
}) {
  return (
    <View style={mlSt.container}>
      {([0, 1, 2, 3] as const).map(i => {
        const mv     = slots[i];
        const isCrit = crits[i];
        const res    = results[i] ?? null;
        const active = selectedRow === i;

        const pMin = res?.percentMin ?? null;
        const pMax = res?.percentMax ?? null;
        const pctText = pMin !== null && pMax !== null ? `${pMin}–${pMax}%` : '—';
        const pctColor =
          pMax === null ? colors.textDim :
          pMax >= 100   ? '#f97176'      :
          pMax >= 50    ? colors.accent  :
                          '#63bb5b';

        const moveBtn = (
          <TouchableOpacity
            style={mlSt.moveBtn}
            onPress={() => onOpenPicker(i)}
            activeOpacity={0.7}
          >
            <Text style={[mlSt.moveName, !mv && mlSt.movePlaceholder]} numberOfLines={1}>
              {mv || `Move ${i + 1}`}
            </Text>
            <Ionicons name="chevron-down" size={9} color={colors.textDim} />
          </TouchableOpacity>
        );

        const critBtn = (
          <TouchableOpacity
            style={[mlSt.critBtn, isCrit && mlSt.critBtnActive]}
            onPress={() => onToggleCrit(i)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            activeOpacity={0.7}
          >
            <Text style={[mlSt.critLabel, isCrit && mlSt.critLabelActive]}>C</Text>
          </TouchableOpacity>
        );

        const pctLabel = (
          <Text style={[mlSt.pct, { color: pctColor }]}>{pctText}</Text>
        );

        return (
          <TouchableOpacity
            key={i}
            style={[mlSt.row, active && mlSt.rowActive]}
            onPress={() => onSelectRow(i)}
            activeOpacity={0.8}
          >
            {side === 'atk'
              ? <>{moveBtn}{critBtn}{pctLabel}</>
              : <>{pctLabel}{critBtn}{moveBtn}</>}
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
  const [draft, setDraft]             = useState<BoxMon>(emptyBoxMon());
  const [showSpecies, setShowSpecies] = useState(false);
  const [showNature, setShowNature]   = useState(false);
  const [showAbility, setShowAbility] = useState(false);
  const [showItem,    setShowItem]    = useState(false);
  const [movePickerIdx, setMovePickerIdx] = useState<0|1|2|3|null>(null);

  useEffect(() => {
    setDraft(initial ? { ...initial } : emptyBoxMon());
    setShowSpecies(false);
    setShowNature(false);
    setShowAbility(false);
    setShowItem(false);
    setMovePickerIdx(null);
  }, [visible, initial]);

  function selectSpecies(sp: string) {
    setDraft(d => ({
      ...d,
      species: sp,
      // Auto-fill first ability when none set yet
      ability: d.ability || (getSpeciesAbility(sp) ?? ''),
    }));
    setShowSpecies(false);
  }

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
          <TouchableOpacity
            style={[styles.input, spSt.selectBtn]}
            onPress={() => setShowSpecies(true)}
            activeOpacity={0.7}
          >
            {draft.species ? <Sprite species={draft.species} size={28} /> : null}
            <Text style={[spSt.selectBtnText, !draft.species && { color: colors.textDim }]} numberOfLines={1}>
              {draft.species || 'Select species…'}
            </Text>
            <Ionicons name="chevron-down" size={12} color={colors.textDim} />
          </TouchableOpacity>

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

          {/* Ability */}
          <Text style={styles.fieldLabel}>Ability</Text>
          <TouchableOpacity
            style={[styles.input, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}
            onPress={() => setShowAbility(true)}
            activeOpacity={0.7}
          >
            <Text style={[{ flex: 1, fontSize: 14 }, draft.ability ? { color: colors.text } : { color: colors.textDim }]} numberOfLines={1}>
              {draft.ability || (getSpeciesAbility(draft.species.trim()) ?? 'Ability…')}
            </Text>
            <Ionicons name="chevron-down" size={12} color={colors.textDim} />
          </TouchableOpacity>

          {/* Item */}
          <Text style={styles.fieldLabel}>Item</Text>
          <TouchableOpacity
            style={[styles.input, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}
            onPress={() => setShowItem(true)}
            activeOpacity={0.7}
          >
            <Text style={[{ flex: 1, fontSize: 14 }, draft.item ? { color: colors.text } : { color: colors.textDim }]} numberOfLines={1}>
              {draft.item || 'Item…'}
            </Text>
            {draft.item ? (
              <TouchableOpacity
                onPress={e => { e.stopPropagation?.(); setDraft(d => ({ ...d, item: '' })); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={14} color={colors.textDim} />
              </TouchableOpacity>
            ) : null}
            <Ionicons name="chevron-down" size={12} color={colors.textDim} />
          </TouchableOpacity>

          {/* Moves */}
          <Text style={styles.fieldLabel}>Moves</Text>
          <View style={editSt.movesGrid}>
            {([0, 1, 2, 3] as const).map(i => (
              <TouchableOpacity
                key={i}
                style={[styles.input, editSt.moveInput, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}
                onPress={() => setMovePickerIdx(i)}
                activeOpacity={0.7}
              >
                <Text style={[{ flex: 1, fontSize: 13 }, draft.moves[i] ? { color: colors.text } : { color: colors.textDim }]} numberOfLines={1}>
                  {draft.moves[i] || `Move ${i + 1}`}
                </Text>
                {draft.moves[i] ? (
                  <TouchableOpacity
                    onPress={e => { e.stopPropagation?.(); setMove(i, ''); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={13} color={colors.textDim} />
                  </TouchableOpacity>
                ) : (
                  <Ionicons name="chevron-down" size={12} color={colors.textDim} />
                )}
              </TouchableOpacity>
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

        <SpeciesPicker
          visible={showSpecies}
          current={draft.species}
          onSelect={selectSpecies}
          onClose={() => setShowSpecies(false)}
        />
        <NaturePicker
          visible={showNature}
          current={draft.nature}
          onSelect={n => setDraft(d => ({ ...d, nature: n }))}
          onClose={() => setShowNature(false)}
        />
        <AbilityPicker
          visible={showAbility}
          species={draft.species.trim()}
          current={draft.ability}
          onSelect={a => setDraft(d => ({ ...d, ability: a }))}
          onClose={() => setShowAbility(false)}
        />
        <ItemPicker
          visible={showItem}
          current={draft.item || undefined}
          onSelect={item => setDraft(d => ({ ...d, item }))}
          onClose={() => setShowItem(false)}
        />
        <MovePicker
          visible={movePickerIdx !== null}
          current={movePickerIdx !== null ? draft.moves[movePickerIdx] : ''}
          onSelect={mv => {
            if (movePickerIdx !== null) setMove(movePickerIdx, mv);
            setMovePickerIdx(null);
          }}
          onClose={() => setMovePickerIdx(null)}
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

// ─── Field panel ─────────────────────────────────────────────────────────────

function FieldPanel({ field, onChange }: { field: CalcField; onChange: (f: CalcField) => void }) {
  const [showMore, setShowMore] = useState(false);

  function toggle(key: keyof CalcField) {
    onChange({ ...field, [key]: !field[key] });
  }

  const hasExtra =
    !!field.gravity || !!field.wonderRoom || !!field.magicRoom ||
    !!field.tabletsOfRuin || !!field.vesselOfRuin || !!field.swordOfRuin || !!field.beadsOfRuin ||
    !!field.atkTailwind || !!field.atkHelpingHand || !!field.atkFlowerGift ||
    !!field.atkBattery  || !!field.atkPowerSpot   ||
    !!field.atkReflect  || !!field.atkLightScreen  || !!field.atkAuroraVeil ||
    !!field.atkSR || !!field.atkSpikes || !!field.atkSteelsurge ||
    !!field.atkVineLash || !!field.atkWildfire || !!field.atkCannonade || !!field.atkVolcalith ||
    !!field.defTailwind || !!field.defFlowerGift || !!field.defFriendGuard ||
    !!field.defForesight || !!field.defProtect || !!field.defLeechSeed || !!field.defSwitching ||
    !!field.defReflect || !!field.defLightScreen || !!field.defAuroraVeil ||
    !!field.defSR || !!field.defSpikes || !!field.defSteelsurge ||
    !!field.defVineLash || !!field.defWildfire || !!field.defCannonade || !!field.defVolcalith;

  function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
    return (
      <TouchableOpacity
        style={[fpSt.chip, active && fpSt.chipActive]}
        onPress={onPress} activeOpacity={0.7}
      >
        <Text style={[fpSt.chipLabel, active && fpSt.chipLabelActive]}>{label}</Text>
      </TouchableOpacity>
    );
  }

  function SideChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
    return (
      <TouchableOpacity
        style={[fpSt.sideChip, active && fpSt.sideChipActive]}
        onPress={onPress} activeOpacity={0.7}
      >
        <Text style={[fpSt.sideChipLabel, active && fpSt.sideChipLabelActive]}>{label}</Text>
      </TouchableOpacity>
    );
  }

  function SideSpikes({ value, onPress }: { value: 0|1|2|3; onPress: (n: 0|1|2|3) => void }) {
    return (
      <View style={fpSt.spikesRow}>
        <Text style={fpSt.spikesLabel}>Spikes</Text>
        <View style={fpSt.spikesChips}>
          {([0, 1, 2, 3] as const).map(n => (
            <TouchableOpacity
              key={n}
              style={[fpSt.spikesChip, value === n && fpSt.sideChipActive]}
              onPress={() => onPress(n)} activeOpacity={0.7}
            >
              <Text style={[fpSt.sideChipLabel, value === n && fpSt.sideChipLabelActive]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={fpSt.card}>
      <View style={fpSt.titleRow}>
        <Ionicons name="partly-sunny-outline" size={12} color={colors.textDim} />
        <Text style={fpSt.title}>Field</Text>
      </View>

      <View style={fpSt.body}>

        {/* Format */}
        <View style={fpSt.centeredRow}>
          {(['Singles', 'Doubles'] as const).map(fmt => (
            <Chip key={fmt} label={fmt}
              active={(field.format ?? 'Singles') === fmt}
              onPress={() => onChange({ ...field, format: fmt })}
            />
          ))}
        </View>

        {/* Terrain */}
        <Text style={fpSt.rowLabel}>Terrain</Text>
        <View style={fpSt.centeredRow}>
          {TERRAIN_OPTIONS.map(opt => (
            <Chip key={opt} label={opt}
              active={field.terrain === opt}
              onPress={() => onChange({ ...field, terrain: field.terrain === opt ? undefined : opt })}
            />
          ))}
        </View>

        {/* Weather */}
        <Text style={fpSt.rowLabel}>Weather</Text>
        <View style={fpSt.centeredRow}>
          {WEATHER_OPTIONS.map(({ label, value }) => (
            <Chip key={value} label={label}
              active={field.weather === value}
              onPress={() => onChange({ ...field, weather: field.weather === value ? undefined : value })}
            />
          ))}
        </View>

        {/* Show More / Show Less */}
        <TouchableOpacity
          style={fpSt.showMoreBtn}
          onPress={() => setShowMore(m => !m)}
          activeOpacity={0.7}
        >
          <Text style={fpSt.showMoreLabel}>{showMore ? 'Show Less' : 'Show More'}</Text>
          {hasExtra && !showMore && <View style={fpSt.activeDot} />}
        </TouchableOpacity>

        {showMore && (
          <>
            {/* Global */}
            <Text style={fpSt.rowLabel}>Global</Text>
            <View style={fpSt.centeredRow}>
              <Chip label="Gravity"     active={!!field.gravity}    onPress={() => toggle('gravity')}    />
              <Chip label="Wonder Room" active={!!field.wonderRoom} onPress={() => toggle('wonderRoom')} />
              <Chip label="Magic Room"  active={!!field.magicRoom}  onPress={() => toggle('magicRoom')}  />
            </View>

            {/* Ruin */}
            <Text style={fpSt.rowLabel}>Ruin</Text>
            <View style={fpSt.centeredRow}>
              <Chip label="Tablets" active={!!field.tabletsOfRuin} onPress={() => toggle('tabletsOfRuin')} />
              <Chip label="Vessel"  active={!!field.vesselOfRuin}  onPress={() => toggle('vesselOfRuin')}  />
              <Chip label="Sword"   active={!!field.swordOfRuin}   onPress={() => toggle('swordOfRuin')}   />
              <Chip label="Beads"   active={!!field.beadsOfRuin}   onPress={() => toggle('beadsOfRuin')}   />
            </View>

            {/* ATK / DEF two-column section */}
            <View style={fpSt.sidesRow}>

              {/* Attacker column */}
              <View style={fpSt.sideCol}>
                <Text style={fpSt.sideColHeader}>Attacker</Text>
                <SideChip label="Tailwind"     active={!!field.atkTailwind}    onPress={() => toggle('atkTailwind')}    />
                <SideChip label="Helping Hand" active={!!field.atkHelpingHand} onPress={() => toggle('atkHelpingHand')} />
                <SideChip label="Flower Gift"  active={!!field.atkFlowerGift}  onPress={() => toggle('atkFlowerGift')}  />
                <SideChip label="Battery"      active={!!field.atkBattery}     onPress={() => toggle('atkBattery')}     />
                <SideChip label="Power Spot"   active={!!field.atkPowerSpot}   onPress={() => toggle('atkPowerSpot')}   />
                <Text style={fpSt.sideSubSection}>Screens</Text>
                <SideChip label="Reflect"      active={!!field.atkReflect}     onPress={() => toggle('atkReflect')}     />
                <SideChip label="Light Screen" active={!!field.atkLightScreen} onPress={() => toggle('atkLightScreen')} />
                <SideChip label="Aurora Veil"  active={!!field.atkAuroraVeil}  onPress={() => toggle('atkAuroraVeil')}  />
                <Text style={fpSt.sideSubSection}>Hazards</Text>
                <SideChip label="SR"           active={!!field.atkSR}          onPress={() => toggle('atkSR')}          />
                <SideChip label="Steelsurge"   active={!!field.atkSteelsurge}  onPress={() => toggle('atkSteelsurge')}  />
                <SideChip label="Vine Lash"    active={!!field.atkVineLash}    onPress={() => toggle('atkVineLash')}    />
                <SideChip label="Wildfire"     active={!!field.atkWildfire}    onPress={() => toggle('atkWildfire')}    />
                <SideChip label="Cannonade"    active={!!field.atkCannonade}   onPress={() => toggle('atkCannonade')}   />
                <SideChip label="Volcalith"    active={!!field.atkVolcalith}   onPress={() => toggle('atkVolcalith')}   />
                <SideSpikes value={field.atkSpikes ?? 0} onPress={n => onChange({ ...field, atkSpikes: n })} />
              </View>

              <View style={fpSt.colDivider} />

              {/* Defender column */}
              <View style={fpSt.sideCol}>
                <Text style={fpSt.sideColHeader}>Defender</Text>
                <SideChip label="Tailwind"     active={!!field.defTailwind}    onPress={() => toggle('defTailwind')}    />
                <SideChip label="Flower Gift"  active={!!field.defFlowerGift}  onPress={() => toggle('defFlowerGift')}  />
                <SideChip label="Friend Guard" active={!!field.defFriendGuard} onPress={() => toggle('defFriendGuard')} />
                <SideChip label="Foresight"    active={!!field.defForesight}   onPress={() => toggle('defForesight')}   />
                <SideChip label="Protect"      active={!!field.defProtect}     onPress={() => toggle('defProtect')}     />
                <SideChip label="Leech Seed"   active={!!field.defLeechSeed}   onPress={() => toggle('defLeechSeed')}   />
                <SideChip label="Switching"    active={!!field.defSwitching}   onPress={() => toggle('defSwitching')}   />
                <Text style={fpSt.sideSubSection}>Screens</Text>
                <SideChip label="Reflect"      active={!!field.defReflect}     onPress={() => toggle('defReflect')}     />
                <SideChip label="Light Screen" active={!!field.defLightScreen} onPress={() => toggle('defLightScreen')} />
                <SideChip label="Aurora Veil"  active={!!field.defAuroraVeil}  onPress={() => toggle('defAuroraVeil')}  />
                <Text style={fpSt.sideSubSection}>Hazards</Text>
                <SideChip label="SR"           active={!!field.defSR}          onPress={() => toggle('defSR')}          />
                <SideChip label="Steelsurge"   active={!!field.defSteelsurge}  onPress={() => toggle('defSteelsurge')}  />
                <SideChip label="Vine Lash"    active={!!field.defVineLash}    onPress={() => toggle('defVineLash')}    />
                <SideChip label="Wildfire"     active={!!field.defWildfire}    onPress={() => toggle('defWildfire')}    />
                <SideChip label="Cannonade"    active={!!field.defCannonade}   onPress={() => toggle('defCannonade')}   />
                <SideChip label="Volcalith"    active={!!field.defVolcalith}   onPress={() => toggle('defVolcalith')}   />
                <SideSpikes value={field.defSpikes ?? 0} onPress={n => onChange({ ...field, defSpikes: n })} />
              </View>

            </View>
          </>
        )}

      </View>
    </View>
  );
}

// ─── Mon panel ───────────────────────────────────────────────────────────────

function MonPanel({
  title, mon, onChange, field,
}: {
  title: string; mon: CalcMon; onChange: (m: CalcMon) => void; field?: CalcField;
}) {
  const [showNature, setShowNature] = useState(false);
  const trimmed = mon.species.trim();
  const speciesState: 'known' | 'unknown' | 'empty' =
    trimmed === ''           ? 'empty'   :
    isKnownSpecies(trimmed)  ? 'known'   :
                               'unknown';

  const knownBase  = speciesState === 'known' ? getBaseStats(trimmed) : null;
  const computed   = speciesState !== 'empty' ? getComputedStats(mon) : null;
  const abMods     = getAbilityStatMods(mon, field);
  const buff       = NATURE_BUFF[mon.nature];
  const nerf       = NATURE_NERF[mon.nature];

  function setEvs(stat: StatKey, val: string) {
    onChange({ ...mon, evs: { ...mon.evs, [stat]: Math.min(252, Number(val) || 0) } });
  }

  function setIvs(stat: StatKey, val: string) {
    const n = val === '' ? 31 : Math.min(31, Math.max(0, Number(val) || 0));
    const next = { ...(mon.ivs ?? {}), [stat]: n };
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

  function setBoost(stat: typeof BOOST_STAT_KEYS[number], delta: number) {
    const cur = mon.boosts?.[stat] ?? 0;
    const n = Math.min(6, Math.max(-6, cur + delta));
    onChange({ ...mon, boosts: { ...mon.boosts, [stat]: n } });
  }

  const [showAbility, setShowAbility] = useState(false);
  const [showItem,    setShowItem]    = useState(false);

  // Form/mega selector data
  const forms          = useMemo(() => speciesState === 'known' ? getSpeciesForms(trimmed) : [], [trimmed, speciesState]);
  const baseSpecies    = useMemo(() => speciesState === 'known' ? getBaseSpeciesName(trimmed) : trimmed, [trimmed, speciesState]);
  const defaultTypes   = useMemo(() => speciesState === 'known' ? getSpeciesTypes(trimmed)    : [], [trimmed, speciesState]);
  const activeTypes    = mon.types ?? defaultTypes;
  const typesOverridden = mon.types !== undefined;

  function formLabel(formName: string): string {
    if (formName === baseSpecies) return 'Base';
    const prefix = baseSpecies.toLowerCase() + '-';
    if (formName.toLowerCase().startsWith(prefix))
      return formName.slice(baseSpecies.length + 1).replace(/-/g, ' ');
    return formName;
  }

  function toggleType(type: string) {
    const cur = mon.types ?? [];
    const low = type.toLowerCase();
    if (cur.some(t => t.toLowerCase() === low)) {
      const next = cur.filter(t => t.toLowerCase() !== low);
      onChange({ ...mon, types: next.length > 0 ? next : undefined });
    } else {
      // max 2 types; drop oldest if at cap
      const next = cur.length >= 2 ? [cur[1], type] : [...cur, type];
      onChange({ ...mon, types: next });
    }
  }

  return (
    <View style={[styles.panel, { padding: spacing.sm }]}>
      <Text style={styles.panelTitle}>{title}</Text>

      {/* Species + Level — flat row */}
      <View style={stSt.topRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={mon.species}
          onChangeText={v => onChange({ ...mon, species: v, baseStats: undefined, types: undefined })}
          placeholder="Garchomp…"
          placeholderTextColor={colors.textDim}
          autoCapitalize="words"
          autoCorrect={false}
        />
        {speciesState !== 'empty' && (
          <View style={[styles.statusDot, speciesState === 'known' ? styles.dotGreen : styles.dotRed]} />
        )}
        <View style={stSt.levelWrap}>
          <Text style={stSt.hdrText}>Lv</Text>
          <TextInput
            style={[styles.input, stSt.levelInput]}
            keyboardType="numeric"
            value={String(mon.level)}
            onChangeText={v => onChange({ ...mon, level: Math.min(100, Math.max(1, Number(v) || 1)) })}
            maxLength={3}
          />
        </View>
      </View>

      {/* Form / Mega selector */}
      {forms.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={mpSt.formStrip}>
          {forms.map(f => (
            <TouchableOpacity
              key={f}
              style={mpSt.formChip}
              onPress={() => onChange({ ...mon, species: f, types: undefined })}
              activeOpacity={0.7}
            >
              <Sprite species={f} size={28} />
              <Text style={mpSt.formChipLabel} numberOfLines={1}>{formLabel(f)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Type override */}
      {speciesState !== 'empty' && (
        <View style={mpSt.typeSection}>
          <View style={mpSt.typeSectionHeader}>
            <Text style={styles.fieldLabel}>Type</Text>
            {typesOverridden && (
              <TouchableOpacity onPress={() => onChange({ ...mon, types: undefined })} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons name="close-circle" size={13} color={colors.textDim} />
              </TouchableOpacity>
            )}
          </View>
          <View style={mpSt.typeGrid}>
            {TYPES.map(type => {
              const key = type.toLowerCase();
              const isActive = activeTypes.some(t => t.toLowerCase() === key);
              const typeColor = colors.types[key];
              return (
                <TouchableOpacity
                  key={type}
                  style={[
                    mpSt.typeChip,
                    isActive
                      ? { backgroundColor: typeColor, borderColor: typeColor }
                      : typesOverridden
                      ? { backgroundColor: colors.surface, borderColor: colors.border }
                      : { backgroundColor: typeColor + '28', borderColor: typeColor + '66' },
                  ]}
                  onPress={() => toggleType(type)}
                  activeOpacity={0.7}
                >
                  <Text style={[mpSt.typeChipLabel, isActive && { color: '#fff' }]}>{type}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Stats table: stat | Base | EV | IV | Stat | Boost */}
      <View style={stSt.table}>
        <View style={stSt.tableHeader}>
          <View style={stSt.col} />
          <View style={stSt.col}><Text style={stSt.hdrText}>Base</Text></View>
          <View style={stSt.col}><Text style={stSt.hdrText}>EV</Text></View>
          <View style={stSt.col}><Text style={stSt.hdrText}>IV</Text></View>
          <View style={stSt.col}><Text style={stSt.hdrText}>Stat</Text></View>
          <View style={stSt.col}><Text style={stSt.hdrText}>Boost</Text></View>
        </View>
        {STAT_KEYS.map((s, idx) => {
          const natKey     = STAT_TO_NAT[s];
          const finalColor = natKey && natKey === buff ? '#63bb5b'
                           : natKey && natKey === nerf ? '#f97176'
                           : colors.text;
          const rawStat    = computed?.[s] ?? null;
          const boostStat  = s as typeof BOOST_STAT_KEYS[number];
          const userBoost  = s !== 'hp' ? (mon.boosts?.[boostStat] ?? 0) : 0;
          const bColor     = userBoost > 0 ? '#63bb5b' : userBoost < 0 ? '#f97176' : colors.textDim;
          // Combine user-set boost with any ability-granted stage bonus
          const effStage   = Math.min(6, Math.max(-6,
            userBoost
            + (s === 'atk' ? (abMods.atkStage ?? 0) : 0)
            + (s === 'def' ? (abMods.defStage ?? 0) : 0)
          ));
          const dispStat   = rawStat !== null ? (() => {
            let v = effStage !== 0
              ? Math.round(rawStat * (effStage > 0 ? (2 + effStage) / 2 : 2 / (2 - effStage)))
              : rawStat;
            if (s === 'atk' && abMods.atkMult) v = Math.floor(v * abMods.atkMult);
            if (s === 'def' && abMods.defMult) v = Math.floor(v * abMods.defMult);
            if (s === 'spa' && abMods.spaMult) v = Math.floor(v * abMods.spaMult);
            if (s === 'spe' && abMods.speMult) v = Math.floor(v * abMods.speMult);
            return v;
          })() : null;

          return (
            <View key={s} style={[stSt.tableRow, idx % 2 === 1 && stSt.tableRowAlt]}>
              <View style={stSt.col}>
                <Text style={stSt.rowStatLabel}>{s.toUpperCase()}</Text>
              </View>

              <View style={stSt.col}>
                {speciesState === 'unknown' ? (
                  <TextInput
                    style={stSt.cellInput}
                    keyboardType="numeric"
                    value={mon.baseStats?.[s] ? String(mon.baseStats[s]) : ''}
                    onChangeText={v => setBase(s, v)}
                    placeholder="–"
                    placeholderTextColor={colors.textDim}
                    maxLength={3}
                  />
                ) : (
                  <Text style={stSt.baseVal}>{knownBase?.[s] ?? '–'}</Text>
                )}
              </View>

              <View style={stSt.col}>
                <TextInput
                  style={stSt.cellInput}
                  keyboardType="numeric"
                  value={mon.evs[s] ? String(mon.evs[s]) : ''}
                  onChangeText={v => setEvs(s, v)}
                  placeholder="0"
                  placeholderTextColor={colors.textDim}
                  maxLength={3}
                />
              </View>

              <View style={stSt.col}>
                <TextInput
                  style={stSt.cellInput}
                  keyboardType="numeric"
                  value={mon.ivs?.[s] !== undefined ? String(mon.ivs[s]) : ''}
                  onChangeText={v => setIvs(s, v)}
                  placeholder="31"
                  placeholderTextColor={colors.textDim}
                  maxLength={2}
                />
              </View>

              <View style={stSt.col}>
                <Text style={[stSt.statVal, { color: finalColor }]}>{dispStat ?? '–'}</Text>
              </View>

              <View style={[stSt.col, stSt.boostCol]}>
                {s !== 'hp' && (
                  <>
                    <TouchableOpacity onPress={() => setBoost(boostStat, 1)} style={stSt.boostArrow} activeOpacity={0.7}>
                      <Ionicons name="chevron-up" size={9} color={colors.textDim} />
                    </TouchableOpacity>
                    <Text style={[stSt.boostVal, { color: bColor }]}>
                      {userBoost > 0 ? `+${userBoost}` : String(userBoost)}
                    </Text>
                    <TouchableOpacity onPress={() => setBoost(boostStat, -1)} style={stSt.boostArrow} activeOpacity={0.7}>
                      <Ionicons name="chevron-down" size={9} color={colors.textDim} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* Nature */}
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

      {/* Ability: picker button + ignore toggle */}
      <View style={stSt.abilityRow}>
        <TouchableOpacity
          style={[styles.input, stSt.abilityBtn, mon.abilityIgnored && stSt.abilityBtnIgnored]}
          onPress={() => setShowAbility(true)}
          activeOpacity={0.7}
        >
          <Text
            style={[stSt.abilityText, !mon.ability && { color: colors.textDim }, mon.abilityIgnored && { color: colors.textDim, textDecorationLine: 'line-through' }]}
            numberOfLines={1}
          >
            {mon.ability || (getSpeciesAbility(trimmed) ?? 'Ability…')}
          </Text>
          <Ionicons name="chevron-down" size={12} color={colors.textDim} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[stSt.abilityToggle, !mon.abilityIgnored && stSt.abilityToggleOn]}
          onPress={() => onChange({ ...mon, abilityIgnored: !mon.abilityIgnored })}
          activeOpacity={0.7}
        >
          <Ionicons
            name={mon.abilityIgnored ? 'flash-off-outline' : 'flash'}
            size={14}
            color={mon.abilityIgnored ? colors.textDim : colors.accent}
          />
        </TouchableOpacity>
      </View>

      {/* Item */}
      <TouchableOpacity
        style={[styles.input, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}
        onPress={() => setShowItem(true)}
        activeOpacity={0.7}
      >
        <Text style={[{ flex: 1, fontSize: 14 }, mon.item ? { color: colors.text } : { color: colors.textDim }]} numberOfLines={1}>
          {mon.item || 'Item…'}
        </Text>
        {mon.item && (
          <TouchableOpacity
            onPress={e => { e.stopPropagation?.(); onChange({ ...mon, item: undefined }); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={14} color={colors.textDim} />
          </TouchableOpacity>
        )}
        <Ionicons name="chevron-down" size={12} color={colors.textDim} />
      </TouchableOpacity>

      {/* Status chips */}
      <View style={mpSt.chipRow}>
        {STATUS_OPTIONS.map(({ label, value }) => {
          const active = value === '' ? !mon.status : mon.status === value;
          return (
            <TouchableOpacity
              key={label}
              style={[mpSt.statusChip, active && mpSt.statusChipActive]}
              onPress={() => onChange({
                ...mon,
                status: value === '' || mon.status === value ? undefined : value as CalcMon['status'],
              })}
              activeOpacity={0.7}
            >
              <Text style={[mpSt.statusLabel, active && mpSt.statusLabelActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Current HP */}
      <View style={mpSt.hpRow}>
        <Text style={[styles.fieldLabel, { flex: 1 }]}>Current HP %</Text>
        <TextInput
          style={[styles.statInput, mpSt.hpInput]}
          keyboardType="numeric"
          value={mon.curHP !== undefined ? String(mon.curHP) : ''}
          onChangeText={v => {
            if (v === '') { onChange({ ...mon, curHP: undefined }); return; }
            const n = Math.min(100, Math.max(1, Number(v) || 1));
            onChange({ ...mon, curHP: n });
          }}
          placeholder="100"
          placeholderTextColor={colors.textDim}
          maxLength={3}
        />
      </View>

      <NaturePicker
        visible={showNature}
        current={mon.nature}
        onSelect={n => onChange({ ...mon, nature: n })}
        onClose={() => setShowNature(false)}
      />
      <AbilityPicker
        visible={showAbility}
        species={trimmed}
        current={mon.ability}
        onSelect={a => onChange({ ...mon, ability: a, abilityIgnored: false })}
        onClose={() => setShowAbility(false)}
      />
      <ItemPicker
        visible={showItem}
        current={mon.item}
        onSelect={item => onChange({ ...mon, item })}
        onClose={() => setShowItem(false)}
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

  const [atk,   setAtk]   = useState<CalcMon>(EMPTY_MON());
  const [def,   setDef]   = useState<CalcMon>(EMPTY_MON());
  const [field, setField] = useState<CalcField>({});

  const [atkSlots,     setAtkSlots]     = useState<MoveSlots>(['', '', '', '']);
  const [defSlots,     setDefSlots]     = useState<MoveSlots>(['', '', '', '']);
  const [atkCrits,     setAtkCrits]     = useState<CritSlots>([...NO_CRITS]);
  const [defCrits,     setDefCrits]     = useState<CritSlots>([...NO_CRITS]);
  const [selected,     setSelected]     = useState<{ side: 'atk' | 'def'; row: number } | null>(null);
  const [movePickerFor, setMovePickerFor] = useState<{ side: 'atk' | 'def'; row: number } | null>(null);

  const [selectedTrainer, setSelectedTrainer] = useState<FlatTrainer | null>(null);
  const [selectedMonIdx,  setSelectedMonIdx]  = useState<number>(-1);
  const [showPicker,      setShowPicker]      = useState(false);

  // My Box
  const [box,          setBox]          = useState<BoxMon[]>([]);
  const [activeBoxIdx, setActiveBoxIdx] = useState<number>(-1);
  const [editTarget,   setEditTarget]   = useState<{ mon: BoxMon | null; idx: number | null } | null>(null);

  useEffect(() => { loadBox().then(setBox); }, []);

  function persistBox(next: BoxMon[]) { setBox(next); saveBox(next); }

  function openAdd()                          { setEditTarget({ mon: null, idx: null }); }
  function openEdit(mon: BoxMon, idx: number) { setEditTarget({ mon, idx }); }
  function closeEdit()                        { setEditTarget(null); }

  function handleSaveMon(saved: BoxMon) {
    const idx  = editTarget!.idx;
    const next = idx !== null ? box.map((m, i) => i === idx ? saved : m) : [...box, saved];
    persistBox(next);
    const newIdx = idx ?? next.length - 1;
    setActiveBoxIdx(newIdx);
    setAtk(boxMonToCalcMon(next[newIdx]));
    closeEdit();
  }

  function handleDeleteMon() {
    const idx  = editTarget!.idx!;
    const next = box.filter((_, i) => i !== idx);
    persistBox(next);
    if (idx === activeBoxIdx)      setActiveBoxIdx(-1);
    else if (idx < activeBoxIdx)   setActiveBoxIdx(activeBoxIdx - 1);
    closeEdit();
  }

  function handleClearBox() {
    persistBox([]);
    setActiveBoxIdx(-1);
    setAtk(EMPTY_MON());
    setAtkSlots(['', '', '', '']);
  }

  function applyBoxMon(mon: BoxMon, idx: number) {
    setActiveBoxIdx(idx);
    setAtk(boxMonToCalcMon(mon));
  }

  const activeBoxMon = activeBoxIdx >= 0 ? box[activeBoxIdx] : null;
  const trainerTeam  = selectedTrainer?.trainer.team.filter(m => m.species) ?? [];
  const activeMon    = selectedMonIdx >= 0 ? trainerTeam[selectedMonIdx] : null;

  // Sync box moves → atkSlots when active box mon changes
  useEffect(() => {
    if (activeBoxMon) {
      const m = activeBoxMon.moves;
      setAtkSlots([m[0] || '', m[1] || '', m[2] || '', m[3] || '']);
      setAtkCrits([...NO_CRITS]);
    }
  }, [activeBoxIdx, box]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Sync trainer mon moves → defSlots when trainer mon changes
  useEffect(() => {
    if (activeMon?.moves) {
      const m = activeMon.moves;
      setDefSlots([m[0] || '', m[1] || '', m[2] || '', m[3] || '']);
      setDefCrits([...NO_CRITS]);
    }
  }, [selectedMonIdx, selectedTrainer]);  // eslint-disable-line react-hooks/exhaustive-deps

  function applyTrainer(ft: FlatTrainer) {
    setSelectedTrainer(ft);
    const team = ft.trainer.team.filter(m => m.species);
    if (team.length > 0) {
      setSelectedMonIdx(0);
      setDef(pokemonToCalcMon(team[0]));
    }
    const hint = inferWeatherFromTrainer(ft);
    if (hint.weather !== undefined || hint.terrain !== undefined) {
      setField(f => ({
        ...f,
        weather: hint.weather,
        terrain: hint.terrain,
      }));
    }
  }

  function applyTeamMon(mon: Pokemon, idx: number) {
    setSelectedMonIdx(idx);
    setDef(pokemonToCalcMon(mon));
  }

  // Pick up any defender pre-filled from the trainer detail screen
  useFocusEffect(
    useCallback(() => {
      const pending = takePendingDefender();
      if (pending) {
        setDef(pending);
        setSelectedTrainer(null);
        setSelectedMonIdx(-1);
        setSelected(null);
      }
    }, []),
  );

  // Computed results — atk → def
  const atkResults = useMemo<(CalcResult | null)[]>(() =>
    atkSlots.map((mv, i) =>
      atk.species.trim() && def.species.trim() && mv.trim()
        ? runCalc(game, atk, def, mv, { ...field, isCrit: atkCrits[i] || field.isCrit })
        : null
    ),
    [game, atk, def, field, atkSlots, atkCrits],
  );

  // Computed results — def → atk (field sides swapped)
  const swappedField = useMemo(() => swapFieldSides(field), [field]);
  const defResults   = useMemo<(CalcResult | null)[]>(() =>
    defSlots.map((mv, i) =>
      atk.species.trim() && def.species.trim() && mv.trim()
        ? runCalc(game, def, atk, mv, { ...swappedField, isCrit: defCrits[i] || field.isCrit })
        : null
    ),
    [game, atk, def, swappedField, defSlots, defCrits, field.isCrit],
  );

  // Auto-select the atk slot with highest damage (functional update avoids stale closure)
  useEffect(() => {
    setSelected(prev => {
      if (prev?.side === 'def') return prev;
      const best = atkResults.reduce<{ pctMax: number; row: number } | null>((acc, r, i) => {
        if (!r) return acc;
        if (!acc || r.percentMax > acc.pctMax) return { pctMax: r.percentMax, row: i };
        return acc;
      }, null);
      return best ? { side: 'atk', row: best.row } : null;
    });
  }, [atkResults]);

  const selectedResult = useMemo(() => {
    if (!selected) return null;
    const results = selected.side === 'atk' ? atkResults : defResults;
    return results[selected.row] ?? null;
  }, [selected, atkResults, defResults]);

  function swapMonsters() {
    setAtk(def);      setDef(atk);
    setAtkSlots(defSlots); setDefSlots(atkSlots);
    setAtkCrits(defCrits); setDefCrits(atkCrits);
    setSelectedTrainer(null); setSelectedMonIdx(-1);
    setSelected(null);
  }

  function onMoveSelected(mv: string) {
    if (!movePickerFor) return;
    const { side, row } = movePickerFor;
    if (side === 'atk') {
      setAtkSlots(prev => { const next = [...prev] as MoveSlots; next[row] = mv; return next; });
      setSelected({ side: 'atk', row });
    } else {
      setDefSlots(prev => { const next = [...prev] as MoveSlots; next[row] = mv; return next; });
      setSelected({ side: 'def', row });
    }
    setMovePickerFor(null);
  }

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, isTablet && styles.contentTablet]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={colSt.threeColRow}>

        {/* ── Left: Attacker column ── */}
        <View style={colSt.colMon}>
          <MyBoxBar
            box={box}
            activeIdx={activeBoxIdx}
            onAdd={openAdd}
            onLongPress={openEdit}
            onClear={handleClearBox}
            onSelectMon={applyBoxMon}
          />
          <MovesList
            side="atk"
            slots={atkSlots}
            crits={atkCrits}
            results={atkResults}
            selectedRow={selected?.side === 'atk' ? selected.row : null}
            onSelectRow={row => setSelected({ side: 'atk', row })}
            onOpenPicker={row => setMovePickerFor({ side: 'atk', row })}
            onToggleCrit={row => setAtkCrits(prev => { const n = [...prev] as CritSlots; n[row] = !n[row]; return n; })}
          />
          <MonPanel
            title="⚔ Attacker"
            mon={atk}
            onChange={m => { setAtk(m); setActiveBoxIdx(-1); }}
            field={field}
          />
        </View>

        {/* ── Middle: Field column ── */}
        <View style={colSt.colField}>
          <FieldPanel field={field} onChange={setField} />

          <TouchableOpacity style={colSt.swapBtn} onPress={swapMonsters} activeOpacity={0.7}>
            <Ionicons name="swap-horizontal" size={16} color={colors.textMuted} />
            <Text style={styles.swapLabel}>Swap</Text>
          </TouchableOpacity>

          {atk.species.trim() && def.species.trim() && <SpeedBar atk={atk} def={def} />}

          {selectedResult ? (
            <ResultCard result={selectedResult} />
          ) : (
            <View style={mlSt.emptyDesc}>
              <Text style={mlSt.emptyDescText}>
                {selected ? 'Unknown move or species' : 'Select a move to see damage'}
              </Text>
            </View>
          )}
        </View>

        {/* ── Right: Defender column ── */}
        <View style={colSt.colMon}>
          <TrainerBar
            trainer={selectedTrainer}
            monIdx={selectedMonIdx}
            onChangeTrainer={() => setShowPicker(true)}
            onSelectMon={applyTeamMon}
          />
          <MovesList
            side="def"
            slots={defSlots}
            crits={defCrits}
            results={defResults}
            selectedRow={selected?.side === 'def' ? selected.row : null}
            onSelectRow={row => setSelected({ side: 'def', row })}
            onOpenPicker={row => setMovePickerFor({ side: 'def', row })}
            onToggleCrit={row => setDefCrits(prev => { const n = [...prev] as CritSlots; n[row] = !n[row]; return n; })}
          />
          <MonPanel
            title="🛡 Defender"
            mon={def}
            onChange={m => setDef(m)}
            field={field}
          />
        </View>

      </View>

      <View style={{ height: spacing.xxl }} />

      <BoxMonEditModal
        visible={editTarget !== null}
        initial={editTarget?.mon ?? null}
        onSave={handleSaveMon}
        onDelete={editTarget?.idx !== null ? handleDeleteMon : null}
        onClose={closeEdit}
      />

      <TrainerPickerSheet
        visible={showPicker}
        game={game}
        onSelect={applyTrainer}
        onClose={() => setShowPicker(false)}
      />

      <MovePicker
        visible={movePickerFor !== null}
        current={movePickerFor
          ? (movePickerFor.side === 'atk' ? atkSlots[movePickerFor.row] : defSlots[movePickerFor.row])
          : ''}
        onSelect={onMoveSelected}
        onClose={() => setMovePickerFor(null)}
      />
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll:         { flex: 1, backgroundColor: colors.bg },
  content:        { padding: spacing.sm, gap: spacing.sm },
  contentTablet:  { padding: spacing.md },

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

// ── Field panel styles ────────────────────────────────────────────────────────

const fpSt = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  titleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingTop: spacing.sm, paddingBottom: 2,
  },
  title:    { color: colors.textDim, fontSize: 10, fontWeight: font.bold, textTransform: 'uppercase', letterSpacing: 0.6 },
  body:     { padding: spacing.sm, gap: spacing.xs },
  rowLabel: {
    color: colors.textDim, fontSize: 10,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: spacing.xs,
  },
  chipRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  centeredRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
  chip:             {
    paddingHorizontal: 7, paddingVertical: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive:      { backgroundColor: colors.primary, borderColor: colors.primary },
  chipLabel:       { color: colors.text, fontSize: 11 },
  chipLabelActive: { color: colors.bg },

  showMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    marginTop: spacing.xs,
    paddingVertical: 5,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  showMoreLabel: { color: colors.textMuted, fontSize: 11, fontWeight: font.medium },
  activeDot:     { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },

  // Two-column ATK / DEF layout
  sidesRow:         { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  sideCol:          { flex: 1, gap: 3 },
  sideColHeader:    {
    color: colors.textDim, fontSize: 10, fontWeight: font.bold,
    textTransform: 'uppercase', letterSpacing: 0.5,
    textAlign: 'center', marginBottom: 2,
  },
  colDivider:       { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  sideChip:         {
    paddingVertical: 5, paddingHorizontal: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center',
  },
  sideChipActive:      { backgroundColor: colors.accent + '22', borderColor: colors.accent },
  sideChipLabel:       { color: colors.text, fontSize: 11, textAlign: 'center' },
  sideChipLabelActive: { color: colors.accent, fontWeight: font.medium },
  sideSubSection: {
    color: colors.textDim, fontSize: 9,
    textTransform: 'uppercase', letterSpacing: 0.4,
    textAlign: 'center', marginTop: 4,
  },
  spikesRow:   { marginTop: 2 },
  spikesLabel: {
    color: colors.textDim, fontSize: 9,
    textTransform: 'uppercase', letterSpacing: 0.4,
    textAlign: 'center', marginBottom: 2,
  },
  spikesChips: { flexDirection: 'row', gap: 2 },
  spikesChip:  {
    flex: 1, paddingVertical: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center',
  },
});

// ── Stats table styles ────────────────────────────────────────────────────────

const TBL_GAP = 4;  // gap between table cells

const stSt = StyleSheet.create({
  // Species + Level row
  topRow:     { flexDirection: 'row', gap: spacing.xs, alignItems: 'center' },
  levelWrap:  { gap: 2 },
  levelInput: { width: 44, textAlign: 'center', paddingHorizontal: 4, paddingVertical: 6 },
  hdrText:    {
    color: colors.textDim, fontSize: 9,
    textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5,
  },

  // Each column cell is a flex:1 View — the only reliable flex unit across Text/TextInput/View
  col:      { flex: 1 },
  boostCol: { alignItems: 'center' },

  // Table shell
  table: {
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row', alignItems: 'center', gap: TBL_GAP,
    backgroundColor: colors.surface,
    paddingVertical: 5, paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  tableRow: {
    flexDirection: 'row', alignItems: 'center', gap: TBL_GAP,
    paddingVertical: 3, paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border + '44',
  },
  tableRowAlt: { backgroundColor: colors.surface + '55' },

  // Cell content styles (width is applied via colW* above)
  rowStatLabel: {
    color: colors.textDim, fontSize: 9,
    fontWeight: font.medium, letterSpacing: 0.5,
    textAlign: 'center',
  },
  baseVal: {
    color: colors.textMuted, fontSize: 12,
    textAlign: 'center',
  },
  cellInput: {
    backgroundColor: colors.bg,
    borderWidth: 1, borderColor: colors.border, borderRadius: 4,
    textAlign: 'center', paddingVertical: 4, paddingHorizontal: 2,
    color: colors.text, fontSize: 12,
  },
  statVal: {
    fontSize: 13, fontWeight: font.bold,
    textAlign: 'center',
  },

  // Boost control (stacked ▲ value ▼)
  boostArrow: { padding: 1 },
  boostVal:   { fontSize: 10, fontWeight: font.bold, textAlign: 'center' },

  // Ability row
  abilityRow:        { flexDirection: 'row', gap: spacing.xs, alignItems: 'center' },
  abilityBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  abilityBtnIgnored: { opacity: 0.55 },
  abilityText:       { flex: 1, color: colors.text, fontSize: 14 },
  abilityToggle:     {
    width: 32, height: 32, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  abilityToggleOn: { borderColor: colors.accent + '88', backgroundColor: colors.accent + '18' },
});

// ── Mon panel extra styles ────────────────────────────────────────────────────

const mpSt = StyleSheet.create({
  chipRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  statusChip:     {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border,
  },
  statusChipActive:  { backgroundColor: colors.accent, borderColor: colors.accent },
  statusLabel:       { color: colors.text, fontSize: 11 },
  statusLabelActive: { color: '#fff', fontWeight: font.medium },

  hpRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hpInput: { width: 52, textAlign: 'center' },

  // Form / Mega strip
  formStrip: {
    flexDirection: 'row', gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  formChip: {
    alignItems: 'center', gap: 2,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    minWidth: 56,
  },
  formChipLabel: { color: colors.textMuted, fontSize: 9, fontWeight: font.medium, textAlign: 'center' },

  // Type override
  typeSection:       { gap: 4 },
  typeSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  typeGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  typeChip:          {
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  typeChipLabel: { color: colors.text, fontSize: 10, fontWeight: font.medium },
});

// ── 3-column layout styles ────────────────────────────────────────────────────

const colSt = StyleSheet.create({
  threeColRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
  },
  col: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 0,
  },
  colMon: {
    flex: 2,
    gap: spacing.sm,
    minWidth: 0,
  },
  colField: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 0,
  },
  swapBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border,
  },
});

// ── Species picker styles ─────────────────────────────────────────────────────

const spSt = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 8, paddingHorizontal: spacing.md,
  },
  selectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  selectBtnText: { flex: 1, color: colors.text, fontSize: 14 },
});

// ── Moves list styles ─────────────────────────────────────────────────────────

const mlSt = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 6,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  rowActive: {
    backgroundColor: colors.primary + '18',
    borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  moveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 6, paddingVertical: 5,
    minWidth: 0,
  },
  moveName:        { flex: 1, color: colors.text, fontSize: 11, fontWeight: font.medium },
  movePlaceholder: { color: colors.textDim },
  pct:             { fontSize: 11, fontWeight: font.bold, width: 72, textAlign: 'center' },
  critBtn: {
    paddingHorizontal: 5, paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  critBtnActive: {
    borderColor: '#f5c542',
    backgroundColor: '#f5c54222',
  },
  critLabel:        { fontSize: 10, fontWeight: font.bold, color: colors.textDim },
  critLabelActive:  { color: '#f5c542' },

  emptyDesc: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center', justifyContent: 'center',
    minHeight: 60,
  },
  emptyDescText: { color: colors.textDim, fontSize: 12, textAlign: 'center' },
});
