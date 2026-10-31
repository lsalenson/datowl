import type { Theme } from '@glideapps/glide-data-grid';

// Glide blends text against the cell colour, so cells must be opaque: the grid is a
// dark inset sheet inside the glass panel.
export const gridTheme: Partial<Theme> = {
  accentColor: '#d98af5',
  accentFg: '#ffffff',
  accentLight: 'rgba(217, 138, 245, 0.18)',
  textDark: '#f4f0eb',
  textMedium: '#a8a39e',
  textLight: '#6f6a67',
  textBubble: '#f4f0eb',
  bgIconHeader: '#8a8580',
  fgIconHeader: '#1c1a20',
  textHeader: '#a8a39e',
  textHeaderSelected: '#ffffff',
  textGroupHeader: '#a8a39e',
  bgCell: '#16141a',
  bgCellMedium: '#1a181e',
  bgHeader: '#1b1920',
  bgHeaderHasFocus: '#2a2030',
  bgHeaderHovered: '#24212a',
  bgBubble: '#26232c',
  bgBubbleSelected: '#3a2848',
  bgSearchResult: 'rgba(245, 194, 107, 0.3)',
  borderColor: '#2a272f',
  horizontalBorderColor: '#211f26',
  drilldownBorder: 'rgba(0, 0, 0, 0)',
  linkColor: '#d98af5',
  cellHorizontalPadding: 10,
  cellVerticalPadding: 3,
  headerFontStyle: '600 12px',
  baseFontStyle: '12.5px',
  markerFontStyle: '11px',
  fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
  editorFontSize: '13px',
  lineHeight: 1.4,
};

export const NULL_COLOR = '#5f5a58';
export const NUMBER_COLOR = '#ff9a8c';
