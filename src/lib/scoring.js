export function clamp01(n) {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

export function computeScore(member, weights) {
  const w = normalizeWeights(weights)

  const attendance = clamp01((member.attendance ?? 0) / 100)
  const tasks = clamp01((member.taskCompletion ?? 0) / 100)
  const peer = clamp01((member.peerReview ?? 0) / 5)

  const score01 = attendance * w.attendance + tasks * w.taskCompletion + peer * w.peerReview
  return Math.round(score01 * 100)
}

export function normalizeWeights(weights) {
  const a = Number(weights?.attendance ?? 0.3)
  const t = Number(weights?.taskCompletion ?? 0.4)
  const p = Number(weights?.peerReview ?? 0.3)
  const sum = (Number.isFinite(a) ? a : 0) + (Number.isFinite(t) ? t : 0) + (Number.isFinite(p) ? p : 0)
  if (sum <= 0) return { attendance: 0.3, taskCompletion: 0.4, peerReview: 0.3 }
  return { attendance: a / sum, taskCompletion: t / sum, peerReview: p / sum }
}

export function assignBadge({ rank, previousRank, score }) {
  if (rank === 1) return 'Champion'
  if (previousRank != null && previousRank - rank >= 3) return 'Rising Star'
  if (score >= 90) return 'Elite'
  if (rank <= 5) return 'Top Performer'
  return 'Team Player'
}

