// Orden del flujo guiado fluido. La navegación entre fases es libre (ir/volver);
// el gating por dependencia de datos llega con las pantallas reales (SPEC-04/05).
export const PHASES = ['capture', 'review', 'distill', 'result'] as const
export type Phase = (typeof PHASES)[number]

export const PATHS = {
  capture: '/capture',
  review: '/review',
  distill: '/distill',
  result: '/result',
  history: '/history',
  settings: '/settings',
  login: '/login',
} as const
