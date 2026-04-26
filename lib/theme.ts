export const colors = {
  bg:         '#0f0f1a',
  surface:    '#1a1a2e',
  card:       '#16213e',
  border:     '#2a2a4a',
  primary:    '#e8b4b8',   // soft pink — Pokéball accent
  accent:     '#f4c430',   // yellow — level/speed highlight
  text:       '#f0f0f8',
  textMuted:  '#8888aa',
  textDim:    '#555577',

  // Type colors (standard palette)
  types: {
    normal:   '#9ea0a1', fire:     '#f96d21', water:    '#4d90d5',
    electric: '#f3d23b', grass:    '#63bb5b', ice:      '#74cfc0',
    fighting: '#ce4265', poison:   '#ab6ac8', ground:   '#d97845',
    flying:   '#8fa9de', psychic:  '#f97176', bug:      '#92a212',
    rock:     '#c9bb8a', ghost:    '#5269ac', dragon:   '#0b6dc3',
    dark:     '#5a5369', steel:    '#5a8ea2', fairy:    '#ec8fe6',
  } as Record<string, string>,
};

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32,
} as const;

export const radius = {
  sm: 6, md: 10, lg: 16, full: 999,
} as const;

export const font = {
  // Weights only — no custom fonts required for launch; add Sora later via expo-font
  regular: '400' as const,
  medium:  '500' as const,
  bold:    '700' as const,
};
