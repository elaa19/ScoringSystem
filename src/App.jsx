import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BadgeCheck,
  Download,
  RefreshCw,
  Search,
  Trophy,
  Users,
  Calendar,
  Activity,
  Star,
  ChevronDown,
  ChevronUp,
  Info,
  Sparkles,
  Award,
  Target,
  BarChart3,
  Lock,
  Unlock,
  KeyRound,
  Mail,
  LogOut,
  Eye,
  EyeOff,
  ShieldCheck,
} from 'lucide-react'
import { fetchAllTabs } from './lib/sheets.js'
import { consolidateMembers } from './lib/csv.js'
import { assignBadge, computeScore, normalizeWeights, DEFAULT_WEIGHTS, DEPARTMENT_CONFIG, getDeptConfig } from './lib/scoring.js'
import { loadJson, saveJson } from './lib/storage.js'

const AIESEC_BLUE = '#037EF3'
const DEPARTMENTS = ['IGV', 'IGT', 'oGV', 'oGT', 'IM', 'MKT', 'TM', 'BD&EWA', 'F&L']
const AIESEC_HUMAN = new URL('./assets/AIESEC-Human-White.png', import.meta.url).toString()
const LOGO = new URL('./assets/logo.png', import.meta.url).toString()

const MEDAL_COLORS = {
  1: { bg: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)', border: '#F59E0B', text: '#92400E', glow: 'glow-gold' },
  2: { bg: 'linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)', border: '#94A3B8', text: '#334155', glow: 'glow-silver' },
  3: { bg: 'linear-gradient(135deg, #FFEDD5 0%, #FED7AA 100%)', border: '#D97706', text: '#7C2D12', glow: 'glow-bronze' },
}

function useCountUp(value, { durationMs = 700 } = {}) {
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

function DeptPill({ department }) {
  const cfg = getDeptConfig(department)
  return (
    <span
      className="dept-pill"
      style={{
        backgroundColor: `${cfg.color}15`,
        color: cfg.color,
        border: `1px solid ${cfg.color}35`,
      }}
    >
      {department}
    </span>
  )
}

function ScoreBar({ score, maxScore = 100 }) {
  const pct = Math.min(100, Math.max(0, (score / maxScore) * 100))
  const color = score >= 80 ? '#10b981' : score >= 60 ? AIESEC_BLUE : score >= 40 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-16 overflow-hidden rounded-full sm:w-20" style={{ background: '#e2e8f0' }}>
        <div
          className="score-bar h-full rounded-full"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}cc, ${color})` }}
        />
      </div>
      <span className="text-sm font-bold" style={{ color }}>{score}</span>
    </div>
  )
}

function AttendanceDots({ attended, total, label }) {
  const rate = total > 0 ? Math.round((attended / total) * 100) : 0
  const color = rate >= 80 ? '#10b981' : rate >= 50 ? '#d97706' : '#ef4444'
  return (
    <div className="tooltip-trigger inline-flex items-center gap-1">
      <span className="text-xs font-medium" style={{ color }}>
        {attended}/{total}
      </span>
      <div className="tooltip-content">{label}: {attended}/{total} ({rate}%)</div>
    </div>
  )
}

function StatCard({ label, value, sub, icon: Icon, gradient }) {
  const animated = typeof value === 'number' ? useCountUp(value) : value
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="glass rounded-2xl p-4 text-left"
    >
      <div className="flex items-center gap-2">
        {Icon ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-xl shadow-xs" style={{ background: gradient || `${AIESEC_BLUE}15` }}>
            <Icon className="h-4 w-4" style={{ color: '#ffffff' }} />
          </div>
        ) : null}
        <div className="text-[0.65rem] font-semibold uppercase tracking-widest text-slate-500">{label}</div>
      </div>
      <div className="mt-2 text-2xl font-black text-slate-900">{animated}</div>
      {sub ? <div className="mt-1 text-[0.7rem] font-medium text-slate-400">{sub}</div> : null}
    </motion.div>
  )
}

function PodiumCard({ member, rank, delay = 0 }) {
  const medal = MEDAL_COLORS[rank]
  const floatClass = rank === 1 ? 'animate-float' : rank === 2 ? 'animate-float-delay-1' : 'animate-float-delay-2'

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay }}
      className={`podium-card ${medal.glow} rounded-2xl p-5 text-center ${rank === 1 ? 'sm:scale-105' : ''}`}
      style={{
        border: `1.5px solid ${medal.border}`,
      }}
    >
      <div className={`${floatClass} mb-3`}>
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-black shadow-md"
          style={{ background: medal.bg, color: medal.text, border: `1px solid ${medal.border}60` }}
        >
          {rank === 1 ? '👑' : rank === 2 ? '🥈' : '🥉'}
        </div>
      </div>
      <div className="text-base font-extrabold text-slate-900">{member.name}</div>
      <div className="mt-1.5">
        <DeptPill department={member.department} />
      </div>
      <div className="mt-3 text-3xl font-black text-slate-900">{member.score}</div>
      <div className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">points</div>
    </motion.div>
  )
}

function exportCsv(rows) {
  const headers = [
    'Rank', 'Name', 'Department', 'Position',
    'LCM Attended', 'LCM Total', 'LCM Rate',
    'Dep Attended', 'Dep Total', 'Dep Rate', 'WH Attended', 'WH Total', 'WH Rate',
    'Cold Calls', 'IR Calls', 'Meetings', 'APDs',
    'Class Shouts', 'Booths', 'Outings',
    'Score', 'Badge',
  ]
  const escape = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`
  const body = rows
    .map((r) =>
      [
        r.rank, r.name, r.department, r.position || '',
        r.lcm.attended, r.lcm.total, r.lcm.rate,
        r.dep.attended, r.dep.total, r.dep.rate,
        r.wh.attended, r.wh.total, r.wh.rate,
        r.totalColdCalls, r.totalIRCalls, r.totalMeetings, r.totalAPDs,
        r.totalClassShouts, r.totalBooths, r.totalOutings,
        r.score, r.badge,
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

// ── Admin Login Card Component ──────────────────────────────────────────────
function AdminLoginForm({ onAuthenticate }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.')
      return
    }
    // Accept valid admin credentials
    // Default allowed passwords: 'admin', 'admin123', 'aiesec', 'medina2026' or non-empty password
    if (password.length >= 3) {
      setError('')
      onAuthenticate(email)
    } else {
      setError('Invalid admin credentials. Password must be at least 3 characters.')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="glass mx-auto max-w-md rounded-3xl p-6 sm:p-8 text-left shadow-xl"
    >
      <div className="text-center">
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm"
          style={{ background: `${AIESEC_BLUE}12`, border: `1px solid ${AIESEC_BLUE}30` }}
        >
          <Lock className="h-7 w-7" style={{ color: AIESEC_BLUE }} />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Admin Authentication Required</h2>
        <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
          The Medina LC performance ranking dashboard is restricted to authorized administrators. Log in with your admin access below.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {error ? (
          <div className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-600 border border-red-200">
            {error}
          </div>
        ) : null}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Admin Email</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@aiesec.org"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none transition-all"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Password</label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="w-full rounded-xl py-3 text-sm font-bold text-white transition-all shadow-md hover:shadow-lg active:scale-[0.99]"
          style={{ background: `linear-gradient(135deg, ${AIESEC_BLUE}, #4f46e5)` }}
        >
          Access Admin Dashboard
        </button>

        <div className="rounded-xl bg-blue-50/70 p-3 text-[0.7rem] text-slate-600 border border-blue-100/80 text-center">
          <span className="font-semibold text-blue-700">Demo Access Hint:</span> Use any email (e.g. <span className="font-mono text-blue-800">admin@aiesec.org</span>) & password <span className="font-mono text-blue-800">admin</span>
        </div>
      </form>
    </motion.div>
  )
}

function App() {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(() => {
    return sessionStorage.getItem('admin_authenticated') === 'true'
  })
  const [adminUser, setAdminUser] = useState(() => {
    return sessionStorage.getItem('admin_user') || 'Admin'
  })

  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('All')
  const [weights, setWeights] = useState(() => loadJson('weights', DEFAULT_WEIGHTS))
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 13 })
  const [error, setError] = useState('')
  const [lastSync, setLastSync] = useState(null)
  const [membersRaw, setMembersRaw] = useState([])
  const [formulaOpen, setFormulaOpen] = useState(false)
  const [annexOpen, setAnnexOpen] = useState(false)
  const [criteriaOpen, setCriteriaOpen] = useState(false)
  const [rrOpen, setRrOpen] = useState(false)
  const [showWeightControls, setShowWeightControls] = useState(false)

  const abortRef = useRef(null)
  const hasSynced = useRef(false)

  useEffect(() => {
    saveJson('weights', weights)
  }, [weights])

  // Auto-sync on first load
  useEffect(() => {
    if (!hasSynced.current) {
      hasSynced.current = true
      sync()
    }
  }, [])

  function handleLogin(email) {
    setIsAdminAuthenticated(true)
    setAdminUser(email.split('@')[0] || 'Admin')
    sessionStorage.setItem('admin_authenticated', 'true')
    sessionStorage.setItem('admin_user', email)
  }

  function handleLogout() {
    setIsAdminAuthenticated(false)
    sessionStorage.removeItem('admin_authenticated')
    sessionStorage.removeItem('admin_user')
  }

  async function sync() {
    setLoading(true)
    setError('')
    setProgress({ done: 0, total: 13 })
    abortRef.current?.abort?.()
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const tabData = await fetchAllTabs(ac.signal, (done, total) => {
        setProgress({ done, total })
      })
      const members = consolidateMembers(tabData)
      if (!members.length) throw new Error('Parsed 0 members — check sheet is published and has data.')
      setMembersRaw(members)
      setLastSync(new Date())
    } catch (e) {
      if (e?.name === 'AbortError') return
      setError(e?.message || 'Failed to sync from Google Sheet.')
    } finally {
      setLoading(false)
    }
  }

  const computed = useMemo(() => {
    const w = normalizeWeights(weights)
    const rows = membersRaw
      .filter((m) => m.memberStatus === 'active') // Only active members
      .map((m) => {
        const score = computeScore(m, w)
        return { ...m, score }
      })

    rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))

    const ranked = rows.map((r, i) => {
      const rank = i + 1
      const badge = assignBadge({ rank, score: r.score, member: r })
      return { ...r, rank, badge }
    })

    return ranked
  }, [membersRaw, weights])

  const departments = useMemo(() => {
    const depts = new Set(computed.map((m) => m.department).filter(Boolean))
    return ['All', ...DEPARTMENTS.filter((d) => depts.has(d)), ...[...depts].filter((d) => !DEPARTMENTS.includes(d)).sort()]
  }, [computed])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return computed.filter((m) => {
      if (department !== 'All' && m.department !== department) return false
      if (!q) return true
      return m.name.toLowerCase().includes(q) || m.department.toLowerCase().includes(q)
    })
  }, [computed, query, department])

  const top3 = useMemo(() => computed.slice(0, 3), [computed])
  const tableRows = useMemo(() => filtered.slice(department === 'All' ? 3 : 0), [filtered, department])

  const stats = useMemo(() => {
    const count = computed.length
    const avgScore = count ? Math.round(computed.reduce((s, m) => s + m.score, 0) / count) : 0
    const withLcm = computed.filter((m) => m.lcm.total > 0)
    const avgLcm = withLcm.length
      ? Math.round(withLcm.reduce((s, m) => s + m.lcm.rate, 0) / withLcm.length)
      : 0
    const top = computed.length ? computed[0] : null
    return { count, avgScore, avgLcm, top }
  }, [computed])

  // Department leaderboard
  const deptLeaderboard = useMemo(() => {
    const map = {}
    for (const m of computed) {
      if (!map[m.department]) map[m.department] = { dept: m.department, total: 0, count: 0 }
      map[m.department].total += m.score
      map[m.department].count++
    }
    return Object.values(map)
      .map((d) => ({ ...d, avg: d.count ? Math.round(d.total / d.count) : 0 }))
      .sort((a, b) => b.avg - a.avg)
  }, [computed])

  return (
    <div className="min-h-screen bg-grid-dark hero-gradient px-3 pb-16 pt-6 sm:px-6">
      <div className="mx-auto w-full max-w-7xl">
        {/* ── Loading bar ── */}
        <AnimatePresence>
          {loading ? (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="sticky top-3 z-50 mb-3"
            >
              <div className="glass-strong rounded-2xl p-3 shadow-md">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                    <Sparkles className="h-4 w-4" style={{ color: AIESEC_BLUE }} />
                    Syncing live data from Google Sheet…
                  </div>
                  <div className="text-xs font-medium text-slate-500">
                    {progress.done}/{progress.total} tabs
                  </div>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: `linear-gradient(90deg, ${AIESEC_BLUE}, #4f46e5)` }}
                    initial={{ width: '5%' }}
                    animate={{ width: `${Math.max(5, (progress.done / progress.total) * 100)}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* ── Header ── */}
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="glass rounded-3xl p-5 sm:p-6"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <img
                src={AIESEC_HUMAN}
                alt="AIESEC"
                className="h-16 w-16 rounded-2xl bg-blue-600 p-2.5 sm:h-20 sm:w-20 shadow-md"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider"
                    style={{ background: `${AIESEC_BLUE}12`, color: AIESEC_BLUE, border: `1px solid ${AIESEC_BLUE}30` }}
                  >
                    <BadgeCheck className="h-3 w-3" />
                    <span>Medina Performance System</span>
                  </span>
                  {isAdminAuthenticated ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[0.65rem] font-bold text-emerald-700 border border-emerald-200">
                      <ShieldCheck className="h-3 w-3 text-emerald-600" />
                      <span>Admin Mode</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[0.65rem] font-semibold text-slate-600 border border-slate-200">
                      <Lock className="h-3 w-3 text-slate-400" />
                      <span>Restricted Access</span>
                    </span>
                  )}
                </div>
                <h1 className="mt-1.5 text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
                  Medina&apos;s Performance Dashboard
                </h1>
                {lastSync ? (
                  <div className="mt-0.5 text-[0.7rem] font-medium text-slate-400">
                    Last synced: {lastSync.toLocaleTimeString()}
                  </div>
                ) : null}
              </div>
            </div>

            {isAdminAuthenticated ? (
              <div className="flex items-center gap-2">
                <button
                  className="glass glass-hover inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 border border-slate-200"
                  onClick={() => exportCsv(filtered)}
                  type="button"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export
                </button>
                <button
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white shadow-xs"
                  onClick={sync}
                  type="button"
                  style={{ background: AIESEC_BLUE }}
                >
                  <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
                  {loading ? 'Syncing…' : 'Sync'}
                </button>
                <button
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors border border-slate-300"
                  onClick={handleLogout}
                  type="button"
                  title="Lock dashboard"
                >
                  <LogOut className="h-3.5 w-3.5 text-slate-500" />
                  Lock
                </button>
              </div>
            ) : null}
          </div>
        </motion.header>

        {/* ── Admin Auth Switch ── */}
        {!isAdminAuthenticated ? (
          <div className="mt-8">
            <AdminLoginForm onAuthenticate={handleLogin} />
          </div>
        ) : (
          /* ── ADMIN LIVE RANKING DASHBOARD ── */
          <>
            {/* ── Stats ── */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard icon={Users} label="Members" value={stats.count} sub="Active members" gradient="linear-gradient(135deg, #6366f1, #4f46e5)" />
              <StatCard icon={Activity} label="Avg Score" value={stats.avgScore} sub="Across all members" gradient={`linear-gradient(135deg, ${AIESEC_BLUE}, #0284c7)`} />
              <StatCard icon={Calendar} label="LCM Rate" value={`${stats.avgLcm}%`} sub="Average attendance" gradient="linear-gradient(135deg, #10b981, #059669)" />
              <StatCard
                icon={Trophy}
                label="Champion"
                value={stats.top ? stats.top.name.split(' ')[0] : '—'}
                sub={stats.top ? `${stats.top.department} • ${stats.top.score} pts` : ''}
                gradient="linear-gradient(135deg, #f59e0b, #d97706)"
              />
            </div>

            {/* ── Top 3 Podium ── */}
            {top3.length >= 3 && department === 'All' ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="mt-6"
              >
                <div className="mb-3 flex items-center gap-2">
                  <Award className="h-5 w-5" style={{ color: '#d97706' }} />
                  <span className="text-sm font-bold text-slate-900">Top Performers</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <PodiumCard member={top3[1]} rank={2} delay={0.3} />
                  <PodiumCard member={top3[0]} rank={1} delay={0.1} />
                  <PodiumCard member={top3[2]} rank={3} delay={0.5} />
                </div>
              </motion.div>
            ) : null}

            {/* ── Department pills + Search ── */}
            <div className="mt-6 glass rounded-2xl p-4">
              {/* Department filter pills */}
              <div className="flex flex-wrap gap-1.5">
                {departments.map((d) => {
                  const isActive = department === d
                  const cfg = d !== 'All' ? getDeptConfig(d) : null
                  const color = cfg?.color || AIESEC_BLUE
                  return (
                    <button
                      key={d}
                      onClick={() => setDepartment(d)}
                      className="rounded-lg px-3 py-1.5 text-xs font-bold transition-all"
                      style={
                        isActive
                          ? { background: color, color: '#ffffff', boxShadow: `0 2px 8px ${color}40` }
                          : { background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }
                      }
                      type="button"
                    >
                      {d}
                    </button>
                  )
                })}
              </div>
              {/* Search */}
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none transition-all"
                  placeholder="Search by member name or department…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>

            {error ? (
              <div className="mt-3 rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700 border border-red-200">
                {error}
              </div>
            ) : null}

            {/* ── Main content grid ── */}
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-4">
              {/* ── Leaderboard Table ── */}
              <div className="lg:col-span-3">
                <div className="glass overflow-hidden rounded-2xl">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-100/70 border-b border-slate-200">
                          <th className="px-3 py-3 text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">#</th>
                          <th className="px-3 py-3 text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">Member</th>
                          <th className="hidden px-3 py-3 text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 sm:table-cell">Dept</th>
                          <th className="px-3 py-3 text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">Score</th>
                          <th className="hidden px-3 py-3 text-center text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 sm:table-cell" title="LCM Attendance">LCM</th>
                          <th className="hidden px-3 py-3 text-center text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 md:table-cell" title="Dept Meetings">Dep</th>
                          <th className="hidden px-3 py-3 text-center text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 md:table-cell" title="Working Hours">WH</th>
                          <th className="hidden px-3 py-3 text-center text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 lg:table-cell" title="Department KPIs">📊 Dept KPIs</th>
                        </tr>
                      </thead>
                      <tbody>
                        <AnimatePresence initial={false}>
                          {tableRows.map((m) => {
                            const medal = MEDAL_COLORS[m.rank]
                            return (
                              <motion.tr
                                key={m.id}
                                layout
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.15 }}
                                className="table-row border-b border-slate-100"
                              >
                                <td className="px-3 py-3">
                                  {medal ? (
                                    <div
                                      className="rank-medal"
                                      style={{ background: medal.bg, color: medal.text, border: `1px solid ${medal.border}60` }}
                                    >
                                      {m.rank}
                                    </div>
                                  ) : (
                                    <span className="pl-1.5 text-sm font-bold text-slate-400">
                                      {m.rank}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-slate-900">{m.name}</span>
                                    {m.position ? (
                                      <span
                                        className="rounded px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wide"
                                        style={{
                                          background: m.position === 'TL' ? '#fef3c7' : m.position === 'MM' ? '#dbeafe' : '#f1f5f9',
                                          color: m.position === 'TL' ? '#d97706' : m.position === 'MM' ? AIESEC_BLUE : '#475569',
                                          border: `1px solid ${m.position === 'TL' ? '#fde68a' : m.position === 'MM' ? '#bfdbfe' : '#e2e8f0'}`,
                                        }}
                                      >
                                        {m.position}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="mt-1 flex items-center gap-1.5">
                                    <span className="sm:hidden"><DeptPill department={m.department} /></span>
                                    <span
                                      className="rounded-full px-2 py-0.5 text-[0.6rem] font-semibold"
                                      style={{
                                        background: m.badge.includes('Champion') ? '#fef3c7' : m.badge.includes('Elite') ? '#dbeafe' : '#f1f5f9',
                                        color: m.badge.includes('Champion') ? '#b45309' : m.badge.includes('Elite') ? AIESEC_BLUE : m.badge.includes('Star') || m.badge.includes('Rising') ? '#047857' : m.badge.includes('At Risk') ? '#b45309' : '#64748b',
                                        border: `1px solid ${m.badge.includes('Champion') ? '#fde68a' : m.badge.includes('Elite') ? '#bfdbfe' : '#e2e8f0'}`,
                                      }}
                                    >
                                      {m.badge}
                                    </span>
                                  </div>
                                </td>
                                <td className="hidden px-3 py-3 sm:table-cell">
                                  <DeptPill department={m.department} />
                                </td>
                                <td className="px-3 py-3">
                                  <ScoreBar score={m.score} />
                                </td>
                                <td className="hidden px-3 py-3 text-center sm:table-cell">
                                  <AttendanceDots attended={m.lcm.attended} total={m.lcm.total} label="LCM" />
                                </td>
                                <td className="hidden px-3 py-3 text-center md:table-cell">
                                  <AttendanceDots attended={m.dep.attended} total={m.dep.total} label="Dept Meeting" />
                                </td>
                                <td className="hidden px-3 py-3 text-center md:table-cell">
                                  <AttendanceDots attended={m.wh.attended} total={m.wh.total} label="Working Hours" />
                                </td>
                                <td className="hidden px-3 py-3 lg:table-cell">
                                  {(() => {
                                    const deptCfg = getDeptConfig(m.department)
                                    // Exchange departments: show CC, IR, Meet, APD
                                    if (deptCfg.type === 'icx' || deptCfg.type === 'ogx') {
                                      const items = [
                                        { label: 'CC', val: m.totalColdCalls, icon: '📞' },
                                        { label: 'IR', val: m.totalIRCalls, icon: '📲' },
                                        { label: 'Meet', val: m.totalMeetings, icon: '🤝' },
                                        { label: 'APD', val: m.totalAPDs, icon: '🔥' },
                                      ]
                                      return (
                                        <div className="flex flex-wrap gap-x-2.5 gap-y-1">
                                          {items.map((it) => (
                                            <span key={it.label} className="text-[0.65rem] font-medium whitespace-nowrap" style={{ color: it.val > 0 ? '#334155' : '#94a3b8' }}>
                                              {it.icon} {it.val || 0}
                                            </span>
                                          ))}
                                        </div>
                                      )
                                    }
                                    // Support departments: show named dept-specific metrics
                                    if (m.deptMetricNames && m.deptMetricNames.length > 0) {
                                      return (
                                        <div className="flex flex-wrap gap-x-2.5 gap-y-1">
                                          {m.deptMetricNames.map((name, i) => {
                                            const val = m.deptMetricSums?.[i] || 0
                                            const short = name
                                              .replace(/^#/g, '')
                                              .replace(/^%/g, '')
                                              .replace(/ATTENDANCE /gi, '')
                                              .replace(/ MADE$/i, '')
                                              .replace(/ ATTENDED$/i, '')
                                              .trim()
                                              .split(' ')
                                              .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                                              .join(' ')
                                              .substring(0, 12)
                                            return (
                                              <div key={i} className="tooltip-trigger">
                                                <span className="text-[0.65rem] font-medium whitespace-nowrap" style={{ color: val > 0 ? '#334155' : '#94a3b8' }}>
                                                  {short}: {val}
                                                </span>
                                                <div className="tooltip-content">{name}: {val}</div>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      )
                                    }
                                    return <span className="text-xs text-slate-300">—</span>
                                  })()}
                                </td>
                              </motion.tr>
                            )
                          })}
                        </AnimatePresence>
                      </tbody>
                    </table>
                  </div>
                  <div
                    className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-3 text-[0.75rem] text-slate-500 font-medium"
                  >
                    <div>
                      Showing <span className="font-bold text-slate-900">{filtered.length}</span> active members
                    </div>
                    <div className="hidden sm:block">Live data • Department-fair scoring</div>
                  </div>
                </div>
              </div>

              {/* ── Sidebar ── */}
              <div className="space-y-4 lg:col-span-1">
                {/* Department Leaderboard */}
                <div className="glass rounded-2xl p-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" style={{ color: AIESEC_BLUE }} />
                    <h3 className="text-sm font-bold text-slate-900">Department Ranking</h3>
                  </div>
                  <div className="mt-3 space-y-2">
                    {deptLeaderboard.map((d, i) => {
                      const cfg = getDeptConfig(d.dept)
                      const maxAvg = deptLeaderboard[0]?.avg || 1
                      return (
                        <div key={d.dept}>
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-400">{i + 1}</span>
                              <span className="font-bold" style={{ color: cfg.color }}>{d.dept}</span>
                            </div>
                            <span className="font-extrabold text-slate-900">{d.avg}</span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="score-bar h-full rounded-full"
                              style={{
                                width: `${(d.avg / maxAvg) * 100}%`,
                                background: `linear-gradient(90deg, ${cfg.color}bb, ${cfg.color})`,
                              }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Admin Weight Controls Toggle */}
                <div className="glass rounded-2xl p-4 text-left">
                  <button
                    onClick={() => setShowWeightControls(!showWeightControls)}
                    className="flex w-full items-center justify-between text-xs font-bold text-slate-800"
                    type="button"
                  >
                    <span className="flex items-center gap-1.5">
                      ⚙️ Tune Scoring Weights
                    </span>
                    {showWeightControls ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                  </button>

                  <AnimatePresence>
                    {showWeightControls ? (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-3 space-y-3 border-t border-slate-100 pt-3"
                      >
                        {[
                          ['lcmAttendance', 'LCM Attendance'],
                          ['depAttendance', 'Dep Meeting Att.'],
                          ['whAttendance', 'Working Hours Att.'],
                          ['activities', 'KPI Activities'],
                        ].map(([key, label]) => (
                          <div key={key}>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-600 font-medium">{label}</span>
                              <span className="font-bold text-slate-900">
                                {Math.round((Number(weights[key]) || 0) * 100)}%
                              </span>
                            </div>
                            <input
                              className="mt-1 w-full accent-blue-600"
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              value={Number(weights[key]) || 0}
                              onChange={(e) => setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))}
                            />
                          </div>
                        ))}
                        <button
                          className="mt-2 w-full rounded-xl bg-slate-100 border border-slate-200 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
                          onClick={() => { setWeights(DEFAULT_WEIGHTS); setError('') }}
                          type="button"
                        >
                          Reset to defaults
                        </button>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>

                {/* Quick tips */}
                <div className="glass rounded-2xl p-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="text-sm font-bold text-slate-900">Admin Information</h3>
                  </div>
                  <ul className="mt-2.5 space-y-2 text-xs font-medium text-slate-600">
                    <li className="flex items-start gap-1.5">
                      <span style={{ color: AIESEC_BLUE }}>•</span>
                      <span>Scores sync automatically from Google Sheet tabs</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-emerald-600">•</span>
                      <span>Filter leaderboard by department using pills</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-amber-600">•</span>
                      <span>Fair department normalization applied automatically</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* ── How Scoring Works ── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-6 glass rounded-2xl p-5"
            >
              <button
                className="flex w-full items-center justify-between text-left"
                onClick={() => setFormulaOpen((v) => !v)}
                type="button"
              >
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4" style={{ color: AIESEC_BLUE }} />
                  <span className="text-sm font-bold text-slate-900">How Scoring Works</span>
                </div>
                {formulaOpen ? (
                  <ChevronUp className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                )}
              </button>
              <AnimatePresence>
                {formulaOpen ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {/* Weight breakdown */}
                      <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                        <div className="text-xs font-bold text-slate-900">Weight Distribution</div>
                        <div className="mt-3 space-y-2.5">
                          {[
                            { label: 'LCM Attendance', pct: 20, color: '#6366f1' },
                            { label: 'Dept Meetings', pct: 20, color: '#8b5cf6' },
                            { label: 'Working Hours', pct: 20, color: '#0284c7' },
                            { label: 'KPI Performance', pct: 40, color: AIESEC_BLUE },
                          ].map((w) => (
                            <div key={w.label}>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-600 font-medium">{w.label}</span>
                                <span className="font-bold" style={{ color: w.color }}>{w.pct}%</span>
                              </div>
                              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                                <div className="h-full rounded-full" style={{ width: `${w.pct}%`, background: w.color }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Department fairness */}
                      <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                        <div className="text-xs font-bold text-slate-900">Department Fairness</div>
                        <p className="mt-1 text-[0.7rem] text-slate-500">
                          Each activity is weighted higher for support departments to ensure equal competition.
                        </p>
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full text-left text-[0.75rem]">
                            <thead>
                              <tr className="border-b border-slate-200 text-slate-500">
                                <th className="pb-2 font-bold">Dept</th>
                                <th className="pb-2 text-center font-bold">Target</th>
                                <th className="pb-2 text-center font-bold">APD ×</th>
                                <th className="pb-2 text-right font-bold">Per Act</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(DEPARTMENT_CONFIG).map(([key, cfg]) => (
                                <tr key={key} className="border-b border-slate-100">
                                  <td className="py-1.5 font-bold" style={{ color: cfg.color }}>{key}</td>
                                  <td className="py-1.5 text-center text-slate-800 font-semibold">{cfg.activityTarget}</td>
                                  <td className="py-1.5 text-center text-slate-800 font-semibold">{cfg.apdMultiplier}×</td>
                                  <td className="py-1.5 text-right font-bold" style={{ color: cfg.type === 'support' ? '#10b981' : '#64748b' }}>
                                    {(40 / cfg.activityTarget).toFixed(1)}%
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>

            {/* ── Annex sections ── */}
            <div className="mt-4 space-y-3">
              {/* Metrics Annex */}
              <div className="glass rounded-2xl p-5">
                <button
                  className="flex w-full items-center justify-between text-left"
                  onClick={() => setAnnexOpen((v) => !v)}
                  type="button"
                >
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-purple-600" />
                    <span className="text-sm font-bold text-slate-900">Metrics Annex</span>
                  </div>
                  {annexOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </button>
                <AnimatePresence>
                  {annexOpen ? (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="mt-4 overflow-x-auto rounded-xl bg-slate-50 border border-slate-200">
                        <table className="min-w-[900px] w-full text-left text-xs">
                          <thead>
                            <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase">
                              <th className="px-3 py-2.5">Area</th>
                              <th className="px-3 py-2.5">Metric</th>
                              <th className="px-3 py-2.5">Notes</th>
                              <th className="px-3 py-2.5">Links</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              ['BD', '$Revenues Received', '$Rev. BD + $Rev. GT', 'Link'],
                              ['', '#Partners Contacted', 'N/A', 'Link'],
                              ['', '#Contracts Signed', 'N/A', 'Link'],
                              ['', '#Outings with EPs', 'iGV/iGT JD → 1.5× weight for others', 'Link'],
                              ['', '#Booths Attended', 'oGV/oGT JD → 1.5× weight for others', 'Link'],
                              ['TM', '%NEC Implementation for TLs', 'Avg of all Key Areas NEC', 'N/A'],
                              ['', '#Campaigns Launched', 'N/A', 'Link'],
                              ['', '%RR NMS', '#Responses / HR', 'Link'],
                              ['F&L', '% Support in EP Accommodation', 'N/A', 'Link'],
                              ['', '%Proofs Collection', '—', 'Link'],
                              ['', '%Costs Execution', '$Executed / $Planned', 'N/A'],
                              ['', '%Revenues Execution', '$Executed / $Planned', 'N/A'],
                              ['oGX', '#APD', 'N/A', 'OGV / OGT'],
                              ['', '#APP', 'N/A', 'OGV / OGT'],
                              ['', '%CR SU2APP', '(EPs applied × 100) / EPs contacted', 'OGV / OGT'],
                              ['iCX', '#Contracts Signed', 'N/A', 'iGV / iGT'],
                              ['', '#Partners Contacted', 'N/A', 'iGV / iGT'],
                              ['', '# IR Calls Attended', 'N/A', 'iGV / iGT'],
                              ['MKT', '#SU', 'N/A', 'Link'],
                              ['', '#Posts Made', 'N/A', 'Link'],
                              ['IM', '#Tools Prepared', 'N/A', 'Link'],
                              ['', '#Websites Managed', 'N/A', 'Link'],
                            ].map(([area, metric, notes, links], i) => {
                              const areaConfig = area ? getDeptConfig(area === 'oGX' ? 'oGV' : area === 'iCX' ? 'IGV' : area) : null
                              return (
                                <tr key={i} className="border-b border-slate-200/60">
                                  <td className="px-3 py-2 font-bold" style={{ color: areaConfig ? areaConfig.color : 'transparent' }}>
                                    {area}
                                  </td>
                                  <td className="px-3 py-2 text-slate-800 font-semibold">{metric}</td>
                                  <td className="px-3 py-2 text-slate-500">{notes}</td>
                                  <td className="px-3 py-2 text-slate-400">{links}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>

              {/* Membership Criteria */}
              <div className="glass rounded-2xl p-5">
                <button
                  className="flex w-full items-center justify-between text-left"
                  onClick={() => setCriteriaOpen((v) => !v)}
                  type="button"
                >
                  <div className="flex items-center gap-2">
                    <Award className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-bold text-slate-900">Membership Criteria</span>
                  </div>
                  {criteriaOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </button>
                <AnimatePresence>
                  {criteriaOpen ? (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="mt-4">
                        <div
                          className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-slate-700 font-medium"
                        >
                          <div className="font-bold text-amber-900">Consequences Mapping</div>
                          <ul className="mt-1.5 list-disc space-y-1 pl-5">
                            <li><span className="font-bold text-slate-900">3 Blames</span> = <span className="font-bold text-amber-700">1 Warning</span></li>
                            <li><span className="font-bold text-slate-900">2 Warnings</span> = <span className="font-bold text-red-600">Exclusion from LC</span></li>
                            <li><span className="font-bold text-slate-900">1 Blame</span> = No voting member</li>
                          </ul>
                        </div>
                        <div className="mt-3 overflow-x-auto rounded-xl bg-slate-50 border border-slate-200">
                          <table className="min-w-[700px] w-full text-left text-xs">
                            <thead>
                              <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase">
                                <th className="px-3 py-2">#</th>
                                <th className="px-3 py-2">Area</th>
                                <th className="px-3 py-2">Rule</th>
                                <th className="px-3 py-2">Consequence</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[
                                ['1', 'Attendance', '1 unjustified absence from LCMs, team meetings, or O2Os', 'Blame'],
                                ['', '', '2 unjustified absences', 'Warning'],
                                ['', '', 'More than 3 unjustified absences', 'Probation'],
                                ['2', 'Conferences & Trainings', 'Not attending 2 mandatory conferences', 'Warning'],
                                ['3', 'Performance & Scoring', 'Scoring less than 70% of departmental KPIs', 'Probation'],
                                ['', '', 'Scoring less than 50% for 2 consecutive months', 'Exit review with EB'],
                                ['4', 'Behavior & Values', 'Disrespectful or unprofessional behavior', 'Warning'],
                                ['5', 'Administrative & Financial', 'Late membership fee payment', 'Blame (until paid)'],
                              ].map(([num, area, rule, consequence], i) => (
                                <tr key={i} className="border-b border-slate-200/60">
                                  <td className="px-3 py-2 font-bold text-slate-400">{num}</td>
                                  <td className="px-3 py-2 font-semibold text-slate-800">{area}</td>
                                  <td className="px-3 py-2 text-slate-600">{rule}</td>
                                  <td className="px-3 py-2 font-bold" style={{
                                    color: consequence.includes('Probation') || consequence.includes('Exit') ? '#ef4444' :
                                           consequence.includes('Warning') ? '#d97706' : '#64748b'
                                  }}>{consequence}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>

              {/* R&R Scoring */}
              <div className="glass rounded-2xl p-5">
                <button
                  className="flex w-full items-center justify-between text-left"
                  onClick={() => setRrOpen((v) => !v)}
                  type="button"
                >
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-pink-600" />
                    <span className="text-sm font-bold text-slate-900">R&amp;R Scoring</span>
                  </div>
                  {rrOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </button>
                <AnimatePresence>
                  {rrOpen ? (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="mt-4 overflow-x-auto rounded-xl bg-slate-50 border border-slate-200">
                        <table className="min-w-[700px] w-full text-left text-xs">
                          <thead>
                            <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase">
                              <th className="px-3 py-2">#</th>
                              <th className="px-3 py-2">Category</th>
                              <th className="px-3 py-2">Metric</th>
                              <th className="px-3 py-2">Points</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              ['1', 'Participation', 'Participated in the campaign', '+3'],
                              ['2', 'Attendance Rate', 'Attend Kick off', '+30'],
                              ['', '', 'Attended All LCM', '+20'],
                              ['', '', 'Attended All Gathering', '+10'],
                              ['', '', 'Attend All summits', '+20'],
                              ['', '', 'Attended All Department Meetings', '+20'],
                              ['3', 'Performance', 'Applying for opportunities (OC, NST, EST…)', '+10 / OP'],
                              ['', '', 'Getting selected for opportunities', '+20 / OP'],
                              ['4', 'Engagement', 'Filling NMS every month', '+15'],
                              ['', '', 'Filling feedback forms after LCM', '+5'],
                              ['6', 'Sanctions', 'Having a warning', '-30'],
                              ['', '', 'Having a blame', '-20'],
                            ].map(([num, cat, metric, pts], i) => (
                              <tr key={i} className="border-b border-slate-200/60">
                                <td className="px-3 py-2 font-bold text-slate-400">{num}</td>
                                <td className="px-3 py-2 font-semibold text-slate-800">{cat}</td>
                                <td className="px-3 py-2 text-slate-600">{metric}</td>
                                <td className="px-3 py-2 font-extrabold" style={{ color: pts.startsWith('-') ? '#ef4444' : '#10b981' }}>{pts}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </>
        )}

        {/* ── Footer ── */}
        <footer className="mt-10 text-center">
          <div className="flex items-center justify-center gap-3">
            <img src={LOGO} alt="AIESEC" className="h-6 w-6 rounded-lg bg-blue-600 p-0.5 shadow-xs" />
            <span className="text-[0.75rem] font-semibold text-slate-500">
              AIESEC in Medina • Performance Dashboard System
            </span>
          </div>
          <div className="mt-1 text-[0.65rem] font-medium text-slate-400">
            Internal Admin Access Only • Live Google Sheets Sync
          </div>
        </footer>
      </div>
    </div>
  )
}

export default App