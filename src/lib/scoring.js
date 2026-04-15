export function clamp01(n) {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

/* ─────────────────────────────────────────────────────────────
 * Department Configuration — Fair, department-aware scoring
 *
 * APD WEIGHTS (per user spec):
 *   iGV / oGV → 1×   (GV exchanges are standard)
 *   iGT / oGT → 1.5× (GT exchanges are harder, worth more)
 *   Support   → 0×   (APDs are NOT a metric for support depts)
 *
 * CROSS-FUNCTIONAL FAIRNESS:
 *   • Outings with EPs = iGV/iGT JD → ×1 for them, ×2 for others
 *   • Class shouts & booths = oGV/oGT JD → ×1 for them, ×2 for others
 *   • Support depts have lower activity targets → each activity
 *     is worth proportionally more per unit
 * ───────────────────────────────────────────────────────────── */

export const DEPARTMENT_CONFIG = {
  // ── Core Exchange Departments ──
  'IGV':    { activityTarget: 45, apdWeight: 1,   outingWeight: 1,   csBoothWeight: 1.5, type: 'icx',     color: '#10b981', label: 'Incoming GV' },
  'IGT':    { activityTarget: 45, apdWeight: 1.5, outingWeight: 1,   csBoothWeight: 1.5, type: 'icx',     color: '#14b8a6', label: 'Incoming GT' },
  'oGV':    { activityTarget: 40, apdWeight: 1,   outingWeight: 1.5, csBoothWeight: 1,   type: 'ogx',     color: '#f97316', label: 'Outgoing GV' },
  'oGT':    { activityTarget: 40, apdWeight: 1.5, outingWeight: 1.5, csBoothWeight: 1,   type: 'ogx',     color: '#ef4444', label: 'Outgoing GT' },
  // ── Support & Enabling Departments ──
  'BD&EWA': { activityTarget: 20, apdWeight: 0,   outingWeight: 2,   csBoothWeight: 2,   type: 'support', color: '#8b5cf6', label: 'BD & EWA' },
  'MKT':    { activityTarget: 18, apdWeight: 0,   outingWeight: 2,   csBoothWeight: 2,   type: 'support', color: '#ec4899', label: 'Marketing' },
  'TM':     { activityTarget: 18, apdWeight: 0,   outingWeight: 2,   csBoothWeight: 2,   type: 'support', color: '#06b6d4', label: 'Talent Mgmt' },
  'IM':     { activityTarget: 15, apdWeight: 0,   outingWeight: 2,   csBoothWeight: 2,   type: 'support', color: '#6366f1', label: 'Info Mgmt' },
  'F&L':    { activityTarget: 15, apdWeight: 0,   outingWeight: 2,   csBoothWeight: 2,   type: 'support', color: '#eab308', label: 'Finance & Legal' },
}

const DEFAULT_DEPT = { activityTarget: 30, apdWeight: 1, outingWeight: 1, csBoothWeight: 1, type: 'unknown', color: '#64748b', label: 'Other' }

export function getDeptConfig(department) {
  return DEPARTMENT_CONFIG[department] || DEFAULT_DEPT
}

/**
 * Default weights — 60% attendance (equal across all depts),
 * 40% department-specific KPI activity.
 */
export const DEFAULT_WEIGHTS = {
  lcmAttendance: 0.20,
  depAttendance: 0.20,
  whAttendance:  0.20,
  activities:    0.40,
}

/**
 * Compute a 0-100 composite score with department-aware activity weighting.
 *
 * Activity components:
 *   - Cold Calls, IR Calls, Meetings → count 1× for all
 *   - APDs → apdWeight per department (0 for support, 1 for GV, 1.5 for GT)
 *   - Outings with EPs → outingWeight (1× for iCX JD, 1.5-2× for others)
 *   - Class shouts + Booths → csBoothWeight (1× for oGX JD, 1.5-2× for others)
 */
export function computeScore(member, weights) {
  const w = normalizeWeights(weights)
  const dept = getDeptConfig(member.department)

  // Attendance rates (already 0-100 in member data → normalize to 0-1)
  const lcmRate = clamp01((member.lcm?.rate ?? 0) / 100)
  const depRate = clamp01((member.dep?.rate ?? 0) / 100)
  const whRate  = clamp01((member.wh?.rate ?? 0) / 100)

  // Activity score with department-aware weights
  const activitySum =
    (member.totalColdCalls || 0) +
    (member.totalIRCalls || 0) +
    (member.totalMeetings || 0) +
    (member.totalAPDs || 0) * dept.apdWeight +
    (member.totalOutings || 0) * dept.outingWeight +
    ((member.totalClassShouts || 0) + (member.totalBooths || 0)) * dept.csBoothWeight

  const activityRate = clamp01(activitySum / dept.activityTarget)

  const raw = (
    lcmRate * w.lcmAttendance +
    depRate * w.depAttendance +
    whRate  * w.whAttendance +
    activityRate * w.activities
  ) * 100

  // Sanctions penalty
  const penalty = (member.warnings || 0) * 5 + (member.blames || 0) * 3

  return Math.max(0, Math.round(raw - penalty))
}

export function normalizeWeights(weights) {
  const keys = ['lcmAttendance', 'depAttendance', 'whAttendance', 'activities']
  const vals = keys.map((k) => {
    const v = Number(weights?.[k] ?? DEFAULT_WEIGHTS[k])
    return Number.isFinite(v) ? Math.max(0, v) : DEFAULT_WEIGHTS[k]
  })
  const sum = vals.reduce((s, v) => s + v, 0)
  if (sum <= 0) return { ...DEFAULT_WEIGHTS }
  return Object.fromEntries(keys.map((k, i) => [k, vals[i] / sum]))
}

export function assignBadge({ rank, score, member }) {
  if (member?.memberStatus === 'fired') return 'Fired'
  if (member?.memberStatus === 'resigned') return 'Resigned'
  if (rank === 1) return '🏆 Champion'
  if (rank === 2) return '⭐ Elite'
  if (rank === 3) return '⭐ Elite'
  if (score >= 90) return '🔥 Star'
  if (rank <= 5) return '💎 Top 5'
  if (score >= 70) return '🚀 Rising'
  if ((member?.warnings || 0) >= 2) return '⚠️ At Risk'
  return '✦ Member'
}
