import { useWindowDimensions } from 'react-native';

export const TABLET_BREAKPOINT = 768;

export function useIsTablet(): boolean {
  const { width } = useWindowDimensions();
  return width >= TABLET_BREAKPOINT;
}

export function useColumns(phone: number, tablet: number): number {
  return useIsTablet() ? tablet : phone;
}
