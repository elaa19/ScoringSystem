import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Download,
  Filter,
  RefreshCw,
  Search,
  Settings,
  Trophy,
} from 'lucide-react'
import { mockMembers, SHEET_CSV_URL } from './data.js'
import { parseMembersCsv } from './lib/csv.js'
import { assignBadge, computeScore, normalizeWeights } from './lib/scoring.js'
import { loadJson, saveJson } from './lib/storage.js'

const DEFAULT_WEIGHTS = { attendance: 0.3, taskCompletion: 0.4, peerReview: 0.3 }
const AIESEC_BLUE = '#037EF3'
const DEPARTMENTS = ['IGV', 'IGT', 'OGV', 'OGT', 'IM', 'MKT', 'TM', 'BD&EWA', 'F&L']
const LOGO = new URL('./assets/logo.png', import.meta.url).toString()
const AIESEC_HUMAN = new URL('./assets/AIESEC-Human-White.png', import.meta.url).toString()

function useCountUp(value, { durationMs = 650 } = {}) {
  const [display, setDisplay] = useState(value)
  const rafRef = useRef(0)
  const fromRef = useRef(value)
  const startRef = useRef(0)

  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    const from = Number(fromRef.current || 0)
    const to = Number(value || 0)
    if (!Number.isFinite(from) || !Number.isFinite(to) || durationMs <= 0) {
      fromRef.current = value
      setDisplay(value)
      return
    }
    startRef.current = performance.now()
    const tick = (t) => {
      const p = Math.min(1, (t - startRef.current) / durationMs)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(from + (to - from) * eased))
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
      else fromRef.current = to
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value, durationMs])

  return display
}

function pillTone(badge) {
  // Keep palette strictly white/blue/grey.
  if (badge === 'Champion') return 'bg-white/10 text-white ring-1 ring-white/20'
  if (badge === 'Elite') return 'bg-white/10 text-white ring-1 ring-white/20'
  if (badge === 'Rising Star') return 'bg-white/10 text-white ring-1 ring-white/20'
  if (badge === 'Top Performer') return 'bg-white/10 text-white ring-1 ring-white/20'
  return 'bg-white/5 text-slate-100 ring-1 ring-white/10'
}

function StatCard({ label, value, sub }) {
  const animated = typeof value === 'number' ? useCountUp(value) : value
  return (
    <div className="card-3d rounded-2xl bg-white p-4 text-left ring-1 ring-slate-200">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{animated}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  )
}

function exportCsv(rows) {
  const headers = ['Rank', 'Name', 'Department', 'Attendance', 'TaskCompletion', 'PeerReview', 'Score', 'Badge']
  const escape = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`
  const body = rows
    .map((r) =>
      [
        r.rank,
        r.name,
        r.department,
        r.attendance,
        r.taskCompletion,
        r.peerReview,
        r.score,
        r.badge,
      ].map(escape).join(',')
    )
    .join('\n')
  const csv = `${headers.join(',')}\n${body}\n`

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `leaderboard-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function App() {
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('All')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [csvUrl, setCsvUrl] = useState(() => loadJson('csvUrl', SHEET_CSV_URL || ''))
  const [weights, setWeights] = useState(() => loadJson('weights', DEFAULT_WEIGHTS))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [membersRaw, setMembersRaw] = useState(() => {
    return mockMembers.map((m, idx) => ({
      id: `${m.name}:${m.department}:${idx}`,
      name: m.name,
      department: m.department,
      attendance: m.attendance,
      taskCompletion: m.taskCompletion,
      peerReview: m.peerReview,
      previousRank: m.previousRank ?? null,
    }))
  })

  const abortRef = useRef(null)

  useEffect(() => {
    saveJson('csvUrl', csvUrl)
  }, [csvUrl])

  useEffect(() => {
    saveJson('weights', weights)
  }, [weights])

  async function sync() {
    const url = (csvUrl || '').trim()
    if (!url) {
      setError('Add a published Google Sheet CSV URL in Settings to enable live sync.')
      return
    }
    setLoading(true)
    setError('')
    abortRef.current?.abort?.()
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const res = await fetch(url, { signal: ac.signal })
      if (!res.ok) throw new Error(`Fetch failed (${res.status})`)
      const text = await res.text()
      const parsed = parseMembersCsv(text)
      if (!parsed.length) throw new Error('CSV parsed but produced 0 rows (check headers/format).')
      setMembersRaw(parsed)
    } catch (e) {
      if (e?.name === 'AbortError') return
      setError(e?.message || 'Failed to sync CSV.')
    } finally {
      setLoading(false)
    }
  }

  const computed = useMemo(() => {
    const w = normalizeWeights(weights)
    const rows = membersRaw.map((m) => {
      const score = computeScore(m, w)
      return { ...m, score }
    })

    rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))

    const ranked = rows.map((r, i) => {
      const rank = i + 1
      const badge = assignBadge({ rank, previousRank: r.previousRank, score: r.score })
      return { ...r, rank, badge }
    })

    return ranked
  }, [membersRaw, weights])

  const departments = useMemo(() => {
    return ['All', ...DEPARTMENTS]
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return computed.filter((m) => {
      if (department !== 'All' && m.department !== department) return false
      if (!q) return true
      return m.name.toLowerCase().includes(q) || m.department.toLowerCase().includes(q)
    })
  }, [computed, query, department])

  const stats = useMemo(() => {
    const count = computed.length
    const avg = count ? Math.round(computed.reduce((s, m) => s + m.score, 0) / count) : 0
    const top = computed[0]
    const rising = computed.filter((m) => m.previousRank != null && m.previousRank - m.rank >= 3).length
    return { count, avg, top, rising }
  }, [computed])

  return (
    <div className="min-h-screen bg-white px-4 pb-16 pt-8 sm:px-6 bg-grid">
      <div className="mx-auto w-full max-w-6xl">
        <AnimatePresence>
          {loading ? (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="sticky top-3 z-50"
            >
              <div className="card-3d rounded-2xl border border-slate-200 bg-white/80 p-3 backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-medium text-slate-700">Syncing…</div>
                  <div className="text-xs text-slate-500">Fetching department tabs</div>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
                  <motion.div
                    className="h-full"
                    style={{ backgroundColor: AIESEC_BLUE }}
                    initial={{ width: '12%' }}
                    animate={{ width: '92%' }}
                    transition={{ duration: 1.1, ease: 'easeInOut', repeat: Infinity, repeatType: 'reverse' }}
                  />
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <motion.header
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="card-3d rounded-3xl border border-slate-200 bg-white p-5"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <img
                src={AIESEC_HUMAN}
                alt="AIESEC Human"
                className="h-18 w-18 sm:h-28 sm:w-28 rounded-3xl bg-slate-50 p-3 ring-1 ring-slate-200"
              />
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-xs text-slate-600 ring-1 ring-slate-200">
                  <BadgeCheck className="h-4 w-4" style={{ color: AIESEC_BLUE }} />
                  <span>Live scoring • CSV sync</span>
                </div>
                <h1 className="mt-3 text-balance text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                  Medina&apos;s Performance Dashboard
                </h1>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
              onClick={() => exportCsv(filtered)}
              type="button"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
              onClick={sync}
              type="button"
              style={{ backgroundColor: `${AIESEC_BLUE}12`, borderColor: `${AIESEC_BLUE}55` }}
            >
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              {loading ? 'Syncing…' : 'Sync'}
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
              onClick={() => setSettingsOpen((v) => !v)}
              type="button"
            >
              <Settings className="h-4 w-4" />
              Settings
            </button>
          </div>
          </div>
        </motion.header>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Members" value={stats.count} sub="Rows currently loaded" />
          <StatCard label="Average score" value={stats.avg} sub="Across all departments" />
          <StatCard label="Rising stars" value={stats.rising} sub="Improved by ≥ 3 ranks" />
          <StatCard
            label="Top member"
            value={stats.top ? stats.top.name : '—'}
            sub={stats.top ? `${stats.top.department} • ${stats.top.score}/100` : ''}
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full rounded-xl bg-slate-50 py-2 pl-10 pr-3 text-sm text-slate-900 ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none"
                  placeholder="Search by name or department…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-500" />
                <select
                  className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-200 focus:outline-none"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                >
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error ? (
              <div
                className="mt-3 rounded-2xl p-4 text-sm text-slate-900 ring-1"
                style={{ backgroundColor: `${AIESEC_BLUE}10`, borderColor: `${AIESEC_BLUE}55` }}
              >
                {error}
              </div>
            ) : null}

            <div className="mt-3 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Rank</th>
                      <th className="px-4 py-3">Member</th>
                      <th className="px-4 py-3">Department</th>
                      <th className="px-4 py-3">Metrics</th>
                      <th className="px-4 py-3 text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <AnimatePresence initial={false}>
                      {filtered.map((m) => {
                        const improved = m.previousRank != null ? m.previousRank - m.rank : 0
                        return (
                          <motion.tr
                            key={m.id}
                            layout
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.15 }}
                            className="hover:bg-slate-50"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {m.rank === 1 ? <Trophy className="h-4 w-4" style={{ color: AIESEC_BLUE }} /> : null}
                                <span className="font-medium text-slate-900">#{m.rank}</span>
                                {m.previousRank != null ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                                    {improved > 0 ? (
                                      <ArrowUpRight className="h-3.5 w-3.5" style={{ color: AIESEC_BLUE }} />
                                    ) : improved < 0 ? (
                                      <ArrowDownRight className="h-3.5 w-3.5 text-slate-400" />
                                    ) : (
                                      <span className="h-3.5 w-3.5" />
                                    )}
                                    <span>
                                      {improved > 0 ? `+${improved}` : improved < 0 ? `${improved}` : '0'}
                                    </span>
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-900">{m.name}</div>
                              <div className="mt-1 inline-flex rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ring-white/10">
                                <span
                                  className={pillTone(m.badge) + ' rounded-full px-2 py-0.5'}
                                  style={{ borderColor: `${AIESEC_BLUE}55`, backgroundColor: `${AIESEC_BLUE}18` }}
                                >
                                  {m.badge}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{m.department}</td>
                            <td className="px-4 py-3 text-slate-700">
                              <div className="flex flex-wrap gap-2">
                                <span className="rounded-full bg-slate-50 px-2 py-0.5 ring-1 ring-slate-200">
                                  Attendance: <span className="text-slate-900">{m.attendance}%</span>
                                </span>
                                <span className="rounded-full bg-slate-50 px-2 py-0.5 ring-1 ring-slate-200">
                                  Tasks: <span className="text-slate-900">{m.taskCompletion}%</span>
                                </span>
                                <span className="rounded-full bg-slate-50 px-2 py-0.5 ring-1 ring-slate-200">
                                  Peer: <span className="text-slate-900">{m.peerReview}/5</span>
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span
                                className="inline-flex items-center justify-end rounded-xl px-3 py-1 font-semibold text-slate-900 ring-1"
                                style={{ backgroundColor: `${AIESEC_BLUE}12`, borderColor: `${AIESEC_BLUE}55` }}
                              >
                                {m.score}
                              </span>
                            </td>
                          </motion.tr>
                        )
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
                <div>
                  Showing <span className="text-slate-900">{filtered.length}</span> of{' '}
                  <span className="text-slate-900">{computed.length}</span>
                </div>
                <div className="hidden sm:block">Weights are normalized automatically to sum to 1.</div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-left text-sm font-semibold text-slate-900">Annex</h2>
                <img src={LOGO} alt="AIESEC logo" className="h-8 w-8 rounded-xl bg-slate-50 p-1.5 ring-1 ring-slate-200" />
              </div>
              <p className="mt-1 text-left text-xs text-slate-600">
                Keep these definitions aligned with the sheet headers and how you evaluate performance.
              </p>

              <div className="mt-4 space-y-3 text-left">
                <details className="group rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200" open>
                  <summary className="cursor-pointer select-none text-sm font-semibold text-slate-900">
                    Metrics Annex
                  </summary>
                  <div className="mt-2 text-sm text-slate-700">
                    <div className="text-xs uppercase tracking-wider text-slate-500">Area • Metric • Notes • Links</div>
                    <div className="mt-2 overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
                      <table className="min-w-[1100px] w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-600">
                          <tr>
                            <th className="px-3 py-2">Area</th>
                            <th className="px-3 py-2">Metric</th>
                            <th className="px-3 py-2">Notes</th>
                            <th className="px-3 py-2">Links</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">BD</td>
                            <td className="px-3 py-2 text-slate-700">$Revenues Received</td>
                            <td className="px-3 py-2 text-slate-700">$Rev. BD + $Rev. GT</td>
                            <td className="px-3 py-2 text-slate-500">Link</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">#Partners Contacted</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-500">Link</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">#Contracts Signed</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-500">Link</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">#Outings with EPs</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-500">Link</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">#Booths Attended</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-500">Link</td>
                          </tr>

                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">TM</td>
                            <td className="px-3 py-2 text-slate-700">%NEC Implementation for TLs</td>
                            <td className="px-3 py-2 text-slate-700">Average of all Key Areas NEC Implementation</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">#Campaigns Launched</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-500">Link</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">%RR NMS</td>
                            <td className="px-3 py-2 text-slate-700">#Responses / HR</td>
                            <td className="px-3 py-2 text-slate-500">Link</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">#Outings with EPs</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-500">Link</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">#Booths Attended</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-500">Link</td>
                          </tr>

                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">F&amp;L</td>
                            <td className="px-3 py-2 text-slate-700">% Support in EP Accommodation</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-500">Link</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">%Proofs Collection</td>
                            <td className="px-3 py-2 text-slate-700">—</td>
                            <td className="px-3 py-2 text-slate-500">Link</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">%Costs Execution</td>
                            <td className="px-3 py-2 text-slate-700">$Executed / $Planned</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">%Revenues Execution</td>
                            <td className="px-3 py-2 text-slate-700">$Executed / $Planned</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">#Outings with EPs</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-500">Link</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">#Booths Attended</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-500">Link</td>
                          </tr>

                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">oGX</td>
                            <td className="px-3 py-2 text-slate-700">#APD</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-700">OGV / OGT</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">#APP</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-700">OGV / OGT</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">%CR SU2APP</td>
                            <td className="px-3 py-2 text-slate-700">
                              (Number of EPs applied × 100) / Number of EPs contacted
                            </td>
                            <td className="px-3 py-2 text-slate-700">OGV / OGT</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">%FIN-CO</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-700">OGV / OGT</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">#Booths Attended</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-700">OGV / OGT</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">#Outings with EPs</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-700">OGV / OGT</td>
                          </tr>

                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">iCX</td>
                            <td className="px-3 py-2 text-slate-700">#Contracts Signed</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-700">iGV / iGT</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">#Partners Contacted</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-700">iGV / iGT</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700"># IR Calls Attended</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-700">iGV / iGT</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">#APD</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-700">iGV / iGT</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">#Booths Attended</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-700">iGV / iGT</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">#Outings with EPs</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-700">iGV / iGT</td>
                          </tr>

                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">MKT</td>
                            <td className="px-3 py-2 text-slate-700">#SU</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-500">Link</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">#Posts Made</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-500">Link</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700"># Physical Attractions</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-500">Link</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">#Outings with EPs</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-500">Link</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">#Booths Attended</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-500">Link</td>
                          </tr>

                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">IM</td>
                            <td className="px-3 py-2 text-slate-700">#Tools Prepared</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-500">Link</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">#Websites Managed or Updated</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-500">Link</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">%Data Centralized and Updated</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-500">Link</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">#Booths Attended</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-500">Link</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">#Outings with EPs</td>
                            <td className="px-3 py-2 text-slate-700">N/A</td>
                            <td className="px-3 py-2 text-slate-500">Link</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Replace “Link” with real URLs when you have them.
                    </p>
                  </div>
                </details>

                <details className="group rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <summary className="cursor-pointer select-none text-sm font-semibold text-slate-900">
                    Metrics Weights
                  </summary>
                  <div className="mt-2 text-sm text-slate-700">
                    <div className="text-xs uppercase tracking-wider text-slate-500">Key Area → parameters</div>
                    <div className="mt-2 overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
                      <table className="min-w-[1100px] w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-600">
                          <tr>
                            <th className="px-3 py-2">Key Area</th>
                            <th className="px-3 py-2">Dept</th>
                            <th className="px-3 py-2">Primary Metric</th>
                            <th className="px-3 py-2">Metric 2</th>
                            <th className="px-3 py-2">Metric 3</th>
                            <th className="px-3 py-2">Metric 4</th>
                            <th className="px-3 py-2">Metric 5</th>
                            <th className="px-3 py-2">Metric 6</th>
                            <th className="px-3 py-2">Metric 7</th>
                            <th className="px-3 py-2">Weight</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">HDI</td>
                            <td className="px-3 py-2 text-slate-700">BD</td>
                            <td className="px-3 py-2 text-slate-700">$Revenues Received</td>
                            <td className="px-3 py-2 text-slate-700">#Partners Contacted</td>
                            <td className="px-3 py-2 text-slate-700">#Contracts Signed LT</td>
                            <td className="px-3 py-2 text-slate-700">#Outings with EPs</td>
                            <td className="px-3 py-2 text-slate-700">#Booths Attended</td>
                            <td className="px-3 py-2 text-slate-400">—</td>
                            <td className="px-3 py-2 text-slate-400">—</td>
                            <td className="px-3 py-2 font-medium text-slate-900">20 per 1000 • 4 • 7 • 4 • 4</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">HDI</td>
                            <td className="px-3 py-2 text-slate-700">TM</td>
                            <td className="px-3 py-2 text-slate-700">%NEC Implementation for TLs</td>
                            <td className="px-3 py-2 text-slate-700">#Campaigns Launched</td>
                            <td className="px-3 py-2 text-slate-700">%RR NMS</td>
                            <td className="px-3 py-2 text-slate-700">#Outings with EPs</td>
                            <td className="px-3 py-2 text-slate-700">#Booths Attended</td>
                            <td className="px-3 py-2 text-slate-400">—</td>
                            <td className="px-3 py-2 text-slate-400">—</td>
                            <td className="px-3 py-2 font-medium text-slate-900">15 if 100% • 6 • 10 if 100% • 4 • 4</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">HDI</td>
                            <td className="px-3 py-2 text-slate-700">Fin</td>
                            <td className="px-3 py-2 text-slate-700">%Proofs Collection</td>
                            <td className="px-3 py-2 text-slate-700">#Support in EP Accommodation</td>
                            <td className="px-3 py-2 text-slate-700">%Costs Execution</td>
                            <td className="px-3 py-2 text-slate-700">%Revenues Execution</td>
                            <td className="px-3 py-2 text-slate-700">#Outings with EPs</td>
                            <td className="px-3 py-2 text-slate-700">#Booths Attended</td>
                            <td className="px-3 py-2 text-slate-400">—</td>
                            <td className="px-3 py-2 font-medium text-slate-900">7 if 100% • 5 • 10 &gt;90% • 10 &gt;90% • 4 • 4</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">HDI</td>
                            <td className="px-3 py-2 text-slate-700">IM</td>
                            <td className="px-3 py-2 text-slate-700">#Tools Prepared</td>
                            <td className="px-3 py-2 text-slate-700">#Websites Managed or Updated</td>
                            <td className="px-3 py-2 text-slate-700">%Data Centralized and Updated</td>
                            <td className="px-3 py-2 text-slate-700">#Booths Attended</td>
                            <td className="px-3 py-2 text-slate-700">#Outings with EPs</td>
                            <td className="px-3 py-2 text-slate-400">—</td>
                            <td className="px-3 py-2 text-slate-400">—</td>
                            <td className="px-3 py-2 font-medium text-slate-900">10 • 8 • 8 • 4 • 4</td>
                          </tr>

                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">PDI</td>
                            <td className="px-3 py-2 text-slate-700">oGV</td>
                            <td className="px-3 py-2 text-slate-700">#APD</td>
                            <td className="px-3 py-2 text-slate-700">#APP</td>
                            <td className="px-3 py-2 text-slate-700">%CR SU2APP</td>
                            <td className="px-3 py-2 text-slate-700">%FIN-CO</td>
                            <td className="px-3 py-2 text-slate-700">#Booths Attended</td>
                            <td className="px-3 py-2 text-slate-700">#Outings with EPs</td>
                            <td className="px-3 py-2 text-slate-400">—</td>
                            <td className="px-3 py-2 font-medium text-slate-900">5 • 1.5 • 12 if 100% • 12 if 100% • 3 • 4</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">PDI</td>
                            <td className="px-3 py-2 text-slate-700">oGTa</td>
                            <td className="px-3 py-2 text-slate-700">#APD</td>
                            <td className="px-3 py-2 text-slate-700">#APP</td>
                            <td className="px-3 py-2 text-slate-700">%CR SU2APP</td>
                            <td className="px-3 py-2 text-slate-700">%FIN-CO</td>
                            <td className="px-3 py-2 text-slate-700">#Booths Attended</td>
                            <td className="px-3 py-2 text-slate-700">#Outings with EPs</td>
                            <td className="px-3 py-2 text-slate-400">—</td>
                            <td className="px-3 py-2 font-medium text-slate-900">7 • 3 • 20 if 100% • 12 if 100% • 3 • 4</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">PDI</td>
                            <td className="px-3 py-2 text-slate-700">oGTe</td>
                            <td className="px-3 py-2 text-slate-700">#APD</td>
                            <td className="px-3 py-2 text-slate-700">#APP</td>
                            <td className="px-3 py-2 text-slate-700">%ACC-APD</td>
                            <td className="px-3 py-2 text-slate-700">%FIN-CO</td>
                            <td className="px-3 py-2 text-slate-700">#Booths Attended</td>
                            <td className="px-3 py-2 text-slate-700">#Outings with EPs</td>
                            <td className="px-3 py-2 text-slate-400">—</td>
                            <td className="px-3 py-2 font-medium text-slate-900">7 • 3 • 20 if 100% • 12 if 100% • 3 • 4</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">PDI</td>
                            <td className="px-3 py-2 text-slate-700">iGV</td>
                            <td className="px-3 py-2 text-slate-700">#APD</td>
                            <td className="px-3 py-2 text-slate-700">#Contracts Signed</td>
                            <td className="px-3 py-2 text-slate-700">#Partners Contacted</td>
                            <td className="px-3 py-2 text-slate-700">#IR Calls Attended</td>
                            <td className="px-3 py-2 text-slate-700">#Booths Attended</td>
                            <td className="px-3 py-2 text-slate-700">#Outings with EPs</td>
                            <td className="px-3 py-2 text-slate-400">—</td>
                            <td className="px-3 py-2 font-medium text-slate-900">3.5 • 5 • 1.5 • 1 • 4 • 3</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">PDI</td>
                            <td className="px-3 py-2 text-slate-700">iGTa</td>
                            <td className="px-3 py-2 text-slate-700">#APD</td>
                            <td className="px-3 py-2 text-slate-700">#Contracts Signed</td>
                            <td className="px-3 py-2 text-slate-700">#Partners Contacted</td>
                            <td className="px-3 py-2 text-slate-700">#IR Calls Attended</td>
                            <td className="px-3 py-2 text-slate-700">#Booths Attended</td>
                            <td className="px-3 py-2 text-slate-700">#Outings with EPs</td>
                            <td className="px-3 py-2 text-slate-400">—</td>
                            <td className="px-3 py-2 font-medium text-slate-900">7 • 6 • 1.5 • 1 • 4 • 3</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">PDI</td>
                            <td className="px-3 py-2 text-slate-700">iGTe</td>
                            <td className="px-3 py-2 text-slate-700">#APD</td>
                            <td className="px-3 py-2 text-slate-700">#Contracts Signed</td>
                            <td className="px-3 py-2 text-slate-700">#Partners Contacted</td>
                            <td className="px-3 py-2 text-slate-700">#IR Calls Attended</td>
                            <td className="px-3 py-2 text-slate-700">#Booths Attended</td>
                            <td className="px-3 py-2 text-slate-700">#Outings with EPs</td>
                            <td className="px-3 py-2 text-slate-400">—</td>
                            <td className="px-3 py-2 font-medium text-slate-900">7 • 6 • 1.5 • 1 • 4 • 3</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">PDI</td>
                            <td className="px-3 py-2 text-slate-700">MKT</td>
                            <td className="px-3 py-2 text-slate-700">#SU</td>
                            <td className="px-3 py-2 text-slate-700">#Posts Made</td>
                            <td className="px-3 py-2 text-slate-700">#Physical Attractions</td>
                            <td className="px-3 py-2 text-slate-700">#Outings with EPs</td>
                            <td className="px-3 py-2 text-slate-700">#Booths Attended</td>
                            <td className="px-3 py-2 text-slate-400">—</td>
                            <td className="px-3 py-2 text-slate-400">—</td>
                            <td className="px-3 py-2 font-medium text-slate-900">7 each 100 • 6 • 1 • 4 • 3</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Note: “if 100%” and “&gt;90%” thresholds are kept as-is from your sheet.
                    </p>
                  </div>
                </details>

                <details className="group rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <summary className="cursor-pointer select-none text-sm font-semibold text-slate-900">
                    Membership Criteria
                  </summary>
                  <div className="mt-2 text-sm text-slate-700">
                    <div className="text-xs uppercase tracking-wider text-slate-500">Membership Criteria Rules</div>

                    <div
                      className="mt-2 rounded-xl bg-white p-3 text-xs text-slate-700 ring-1 ring-slate-200"
                      style={{ borderColor: `${AIESEC_BLUE}55`, backgroundColor: `${AIESEC_BLUE}08` }}
                    >
                      <div className="font-semibold text-slate-900">Consequences mapping</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        <li><span className="font-medium">3 Blame</span> = <span className="font-medium">1 Warning</span></li>
                        <li><span className="font-medium">2 Warnings</span> = Exclusion from LC</li>
                        <li><span className="font-medium">1 Blame</span> = No voting member</li>
                      </ul>
                    </div>

                    <div className="mt-3 overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
                      <table className="min-w-[860px] w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-600">
                          <tr>
                            <th className="px-3 py-2">#</th>
                            <th className="px-3 py-2">Area</th>
                            <th className="px-3 py-2">Rule</th>
                            <th className="px-3 py-2">Consequence</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">1</td>
                            <td className="px-3 py-2 text-slate-700">Attendance</td>
                            <td className="px-3 py-2 text-slate-700">
                              1 unjustified absence from LCMs, team meetings, or O2Os
                            </td>
                            <td className="px-3 py-2 font-medium text-slate-900">Blame</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">2 unjustified absences</td>
                            <td className="px-3 py-2 font-medium text-slate-900">Warning</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">More than 3 unjustified absences</td>
                            <td className="px-3 py-2 font-medium text-slate-900">
                              Probation (review with VP/EB to decide continuation)
                            </td>
                          </tr>

                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">2</td>
                            <td className="px-3 py-2 text-slate-700">Conferences &amp; Trainings</td>
                            <td className="px-3 py-2 text-slate-700">
                              Not attending 2 mandatory conferences (Local/National)
                            </td>
                            <td className="px-3 py-2 font-medium text-slate-900">Warning</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">Not attending 3 conferences</td>
                            <td className="px-3 py-2 font-medium text-slate-900">Probation</td>
                          </tr>

                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">3</td>
                            <td className="px-3 py-2 text-slate-700">Performance &amp; Scoring</td>
                            <td className="px-3 py-2 text-slate-700">
                              Scoring less than 70% of departmental and general KPIs
                            </td>
                            <td className="px-3 py-2 font-medium text-slate-900">
                              Probation (recovery plan with TL/VP)
                            </td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">
                              Scoring less than 50% for 2 consecutive months
                            </td>
                            <td className="px-3 py-2 font-medium text-slate-900">Exit review with EB</td>
                          </tr>

                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">4</td>
                            <td className="px-3 py-2 text-slate-700">Behavior &amp; Values</td>
                            <td className="px-3 py-2 text-slate-700">
                              Disrespectful or unprofessional behavior (towards members, partners, EPs)
                            </td>
                            <td className="px-3 py-2 font-medium text-slate-900">Warning</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">Repeated misconduct</td>
                            <td className="px-3 py-2 font-medium text-slate-900">
                              Probation or Membership Termination (severity-based)
                            </td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">
                              Violation of AIESEC values or LC/MC policies
                            </td>
                            <td className="px-3 py-2 font-medium text-slate-900">Direct EB Review</td>
                          </tr>

                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">5</td>
                            <td className="px-3 py-2 text-slate-700">Administrative &amp; Financial Compliance</td>
                            <td className="px-3 py-2 text-slate-700">Late membership fee payment</td>
                            <td className="px-3 py-2 font-medium text-slate-900">Blame (until paid)</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">
                              Not submitting required proofs or reports twice in a row
                            </td>
                            <td className="px-3 py-2 font-medium text-slate-900">Avertissement</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </details>

                <details className="group rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <summary className="cursor-pointer select-none text-sm font-semibold text-slate-900">
                    General Metrics
                  </summary>
                  <div className="mt-2 text-sm text-slate-700">
                    <div className="text-xs uppercase tracking-wider text-slate-500">R&amp;R Scoring</div>
                    <div className="mt-2 overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
                      <table className="min-w-[860px] w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-600">
                          <tr>
                            <th className="px-3 py-2">#</th>
                            <th className="px-3 py-2">Category</th>
                            <th className="px-3 py-2">Metric</th>
                            <th className="px-3 py-2">Points</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">1</td>
                            <td className="px-3 py-2 text-slate-700">Participation</td>
                            <td className="px-3 py-2 text-slate-700">Participated in the campaign</td>
                            <td className="px-3 py-2 font-medium text-slate-900">+3</td>
                          </tr>

                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">2</td>
                            <td className="px-3 py-2 text-slate-700">Attendance Rate</td>
                            <td className="px-3 py-2 text-slate-700">Attend Kick off</td>
                            <td className="px-3 py-2 font-medium text-slate-900">+30</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">Attended All LCM</td>
                            <td className="px-3 py-2 font-medium text-slate-900">+20</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">Attended All Gathering</td>
                            <td className="px-3 py-2 font-medium text-slate-900">+10</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">Attend All summits</td>
                            <td className="px-3 py-2 font-medium text-slate-900">+20</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">Attended All Department Meetings/Team meetings</td>
                            <td className="px-3 py-2 font-medium text-slate-900">+20</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">Attended Every Calibration Meeting (only for MMs)</td>
                            <td className="px-3 py-2 font-medium text-slate-900">+10</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">Attended EPs activities</td>
                            <td className="px-3 py-2 font-medium text-slate-900">+10</td>
                          </tr>

                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">3</td>
                            <td className="px-3 py-2 text-slate-700">Performance Rate</td>
                            <td className="px-3 py-2 text-slate-700">Applying for opportunities (OC, NST, EST, LST, ECB…)</td>
                            <td className="px-3 py-2 font-medium text-slate-900">+10 / OP</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">Getting selected for opportunities (OC, NST, EST, ECB…)</td>
                            <td className="px-3 py-2 font-medium text-slate-900">+20 / OP</td>
                          </tr>

                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">4</td>
                            <td className="px-3 py-2 text-slate-700">Engagement Rate</td>
                            <td className="px-3 py-2 text-slate-700">Filling NMS every month</td>
                            <td className="px-3 py-2 font-medium text-slate-900">+15</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">Filling feedback forms after LCM</td>
                            <td className="px-3 py-2 font-medium text-slate-900">+5</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">Filling feedback forms after capacity buildings (only for MMs)</td>
                            <td className="px-3 py-2 font-medium text-slate-900">+5</td>
                          </tr>

                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">5</td>
                            <td className="px-3 py-2 text-slate-700">MMs</td>
                            <td className="px-3 py-2 text-slate-700">
                              Best Performance Management &amp; PDP tool user (bonus for TLs)
                            </td>
                            <td className="px-3 py-2 font-medium text-slate-900">+5</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">Attend LnL</td>
                            <td className="px-3 py-2 font-medium text-slate-900">+10</td>
                          </tr>

                          <tr>
                            <td className="px-3 py-2 font-medium text-slate-900">6</td>
                            <td className="px-3 py-2 text-slate-700">Sanctions</td>
                            <td className="px-3 py-2 text-slate-700">Having a warning (avertissement)</td>
                            <td className="px-3 py-2 font-medium text-slate-900">-30</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-slate-700">Having a blame</td>
                            <td className="px-3 py-2 font-medium text-slate-900">-20</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </details>

                <details className="group rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <summary className="cursor-pointer select-none text-sm font-semibold text-slate-900">
                    Sanctions
                  </summary>
                  <div className="mt-2 text-sm text-slate-700">
                    <p className="text-sm text-slate-700">
                      Sanctions are included in the <span className="font-medium">R&amp;R Scoring</span> table above (category #6).
                    </p>
                  </div>
                </details>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <AnimatePresence initial={false}>
              {settingsOpen ? (
                <motion.aside
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                  className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"
                >
                  <h2 className="text-left text-sm font-semibold text-slate-900">Settings</h2>
                  <p className="mt-1 text-left text-xs text-slate-600">
                    Paste a <span className="text-slate-900">published CSV</span> link and tune scoring weights.
                  </p>

                  <label className="mt-4 block text-left text-xs text-slate-600">Google Sheet CSV URL</label>
                  <input
                    className="mt-2 w-full rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none"
                    placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
                    value={csvUrl}
                    onChange={(e) => setCsvUrl(e.target.value)}
                  />

                  <div className="mt-4 text-left text-xs text-slate-600">Scoring weights</div>
                  <div className="mt-2 space-y-3">
                    {[
                      ['attendance', 'Attendance'],
                      ['taskCompletion', 'Task completion'],
                      ['peerReview', 'Peer review'],
                    ].map(([key, label]) => (
                      <div key={key}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-600">{label}</span>
                          <span className="font-medium text-slate-900">
                            {Math.round((Number(weights[key]) || 0) * 100)}%
                          </span>
                        </div>
                        <input
                          className="mt-1 w-full"
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          style={{ accentColor: AIESEC_BLUE }}
                          value={Number(weights[key]) || 0}
                          onChange={(e) => setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-200">
                    Normalized weights:{' '}
                    <span className="text-slate-900">
                      {(() => {
                        const n = normalizeWeights(weights)
                        return `A ${Math.round(n.attendance * 100)}% • T ${Math.round(n.taskCompletion * 100)}% • P ${Math.round(
                          n.peerReview * 100
                        )}%`
                      })()}
                    </span>
                  </div>

                  <button
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
                    onClick={sync}
                    type="button"
                    style={{ backgroundColor: `${AIESEC_BLUE}12`, borderColor: `${AIESEC_BLUE}55` }}
                  >
                    <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                    Sync now
                  </button>

                  <button
                    className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
                    onClick={() => {
                      setCsvUrl(SHEET_CSV_URL || '')
                      setWeights(DEFAULT_WEIGHTS)
                      setError('')
                    }}
                    type="button"
                  >
                    Reset
                  </button>
                </motion.aside>
              ) : (
                <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <h2 className="text-left text-sm font-semibold text-slate-900">Quick tips</h2>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-left text-xs text-slate-600">
                    <li>Publish your Google Sheet to web as CSV, then paste the link in Settings.</li>
                    <li>Keep headers like “Name”, “Department”, “Attendance %”, “Task Completion”, “Peer Review Score”.</li>
                    <li>Use previous rank to highlight improvements (header: “Previous Rank”).</li>
                  </ul>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <footer className="mt-8 text-center text-xs text-slate-500">
          Built for fast iteration: local settings saved in your browser • CSV sync on demand
        </footer>
      </div>
    </div>
  )
}

export default App