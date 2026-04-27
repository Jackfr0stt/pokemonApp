import type { CalcMon } from './calc';

// Module-level bridge: trainer detail screen deposits a mon here,
// CalcScreen picks it up on next focus and clears the slot.
let _pending: CalcMon | null = null;

export function setPendingDefender(mon: CalcMon): void {
  _pending = mon;
}

export function takePendingDefender(): CalcMon | null {
  const mon = _pending;
  _pending = null;
  return mon;
}
