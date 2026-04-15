import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BadgeCheck,
  Download,
  RefreshCw,
  Search,
  Trophy,
  Flame,
  Phone,
  Users,
  Calendar,
  Activity,
  Star,
  TrendingUp,
  Target,
  ChevronDown,
  ChevronUp,
  Info,
  Sparkles,
  Award,
  Zap,
  BarChart3,
  Gift,
  X,
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
  1: { bg: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)', border: '#FFD700', text: '#1a1a1a', glow: 'glow-gold' },
  2: { bg: 'linear-gradient(135deg, #E8E8E8 0%, #B0B0B0 100%)', border: '#C0C0C0', text: '#1a1a1a', glow: 'glow-silver' },
  3: { bg: 'linear-gradient(135deg, #CD9B5A 0%, #CD7F32 100%)', border: '#CD7F32', text: '#1a1a1a', glow: 'glow-bronze' },
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
        backgroundColor: `${cfg.color}18`,
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
      <div className="h-2 w-16 overflow-hidden rounded-full sm:w-20" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div
          className="score-bar h-full rounded-full"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}90, ${color})` }}
        />
      </div>
      <span className="text-sm font-bold" style={{ color }}>{score}</span>
    </div>
  )
}

function AttendanceDots({ attended, total, label }) {
  const rate = total > 0 ? Math.round((attended / total) * 100) : 0
  const color = rate >= 80 ? '#10b981' : rate >= 50 ? '#f59e0b' : '#ef4444'
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
          <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: gradient || `${AIESEC_BLUE}20` }}>
            <Icon className="h-3.5 w-3.5" style={{ color: '#fff' }} />
          </div>
        ) : null}
        <div className="text-[0.65rem] font-medium uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</div>
      </div>
      <div className="mt-2 text-2xl font-bold text-white">{animated}</div>
      {sub ? <div className="mt-1 text-[0.7rem]" style={{ color: 'rgba(255,255,255,0.35)' }}>{sub}</div> : null}
    </motion.div>
  )
}

function PodiumCard({ member, rank, delay = 0 }) {
  const medal = MEDAL_COLORS[rank]
  const cfg = getDeptConfig(member.department)
  const floatClass = rank === 1 ? 'animate-float' : rank === 2 ? 'animate-float-delay-1' : 'animate-float-delay-2'
  const glowClass = medal.glow

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay }}
      className={`podium-card ${glowClass} rounded-2xl p-5 text-center ${rank === 1 ? 'sm:scale-110' : ''}`}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${medal.border}30`,
      }}
    >
      <div className={`${floatClass} mb-3`}>
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-black"
          style={{ background: medal.bg, color: medal.text }}
        >
          {rank === 1 ? '👑' : rank === 2 ? '🥈' : '🥉'}
        </div>
      </div>
      <div className="text-base font-bold text-white">{member.name}</div>
      <div className="mt-1.5">
        <DeptPill department={member.department} />
      </div>
      <div className="mt-3 text-3xl font-black text-white">{member.score}</div>
      <div className="text-[0.65rem] font-medium uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.35)' }}>points</div>
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

// ── Free TULDS Popup Component ──────────────────────────────────────────────
function FreeTuldsPopup({ member, onClose, isRevealDay }) {
  const CONFETTI_COLORS = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE']

  // Calculate days remaining until the 20th
  const today = new Date()
  const day = today.getDate()
  const daysLeft = day <= 20 ? 20 - day : (() => {
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 20)
    return Math.ceil((nextMonth - today) / (1000 * 60 * 60 * 24))
  })()

  return (
    <div className="tulds-overlay" onClick={onClose}>
      {/* Confetti particles — only on reveal day */}
      {isRevealDay ? Array.from({ length: 30 }).map((_, i) => (
        <div
          key={i}
          className="tulds-confetti"
          style={{
            left: `${Math.random() * 100}%`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${Math.random() * 2}s`,
            animationDuration: `${2 + Math.random() * 2}s`,
            width: `${6 + Math.random() * 6}px`,
            height: `${6 + Math.random() * 6}px`,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          }}
        />
      )) : null}

      <div className="tulds-popup" onClick={(e) => e.stopPropagation()}>
        <button className="tulds-close" onClick={onClose} type="button" aria-label="Close">✕</button>

        {/* Trophy */}
        <div className="tulds-trophy">{isRevealDay ? '🏆' : '⏳'}</div>

        {/* Badge */}
        <div
          className="mx-auto mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
          style={{ background: '#FFD70018', color: '#FFD700', border: '1px solid #FFD70035' }}
        >
          <Gift className="h-3.5 w-3.5" />
          FREE TULDS
        </div>

        {isRevealDay && member ? (
          /* ── REVEAL MODE: show the winner ── */
          <>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'white', marginBottom: '0.5rem', lineHeight: 1.3 }}>
              Congratulations!
            </h2>
            <div
              className="mx-auto mb-2 inline-block rounded-xl px-4 py-2"
              style={{ background: 'linear-gradient(135deg, #FFD70015, #FFA50015)', border: '1px solid #FFD70025' }}
            >
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#FFD700' }}>
                {member.name}
              </div>
              <div className="flex items-center justify-center gap-2 mt-1">
                <DeptPill department={member.department} />
                {member.position ? (
                  <span
                    className="rounded px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wide"
                    style={{
                      background: member.position === 'TL' ? '#f59e0b18' : `${AIESEC_BLUE}15`,
                      color: member.position === 'TL' ? '#f59e0b' : AIESEC_BLUE,
                      border: `1px solid ${member.position === 'TL' ? '#f59e0b30' : `${AIESEC_BLUE}25`}`,
                    }}
                  >
                    {member.position}
                  </span>
                ) : null}
              </div>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#10b981', marginBottom: '0.25rem' }}>
              {member.score} pts
            </div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginBottom: '1rem' }}>
              Top Performer This Period
            </div>
            <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, maxWidth: '360px', margin: '0 auto 1.5rem' }}>
              As the highest-scoring member, <span style={{ color: '#FFD700', fontWeight: 700 }}>{member.name.split(' ')[0]}</span> has earned
              a <span style={{ color: '#10b981', fontWeight: 700 }}>Free TULDS</span> reward! 🎉
            </p>
          </>
        ) : (
          /* ── TEASER MODE: counting still in progress ── */
          <>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'white', marginBottom: '0.5rem', lineHeight: 1.3 }}>
              Free TULDS Awaits!
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, maxWidth: '360px', margin: '0 auto 1rem' }}>
              The scoring period is still in progress. The <span style={{ color: '#10b981', fontWeight: 700 }}>Free TULDS</span> winner
              will be announced on the <span style={{ color: '#FFD700', fontWeight: 700 }}>20th</span>!
            </p>
            <div
              className="mx-auto mb-4 inline-block rounded-xl px-5 py-3"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#FFD700', lineHeight: 1 }}>
                {daysLeft}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginTop: '4px' }}>
                {daysLeft === 1 ? 'day remaining' : 'days remaining'}
              </div>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.5, maxWidth: '320px', margin: '0 auto 1.5rem' }}>
              Keep performing! The top scorer by the 20th wins a Free TULDS.
            </p>
          </>
        )}

        <button
          onClick={onClose}
          type="button"
          className="rounded-xl px-6 py-2.5 text-sm font-bold text-white transition-all"
          style={{
            background: `linear-gradient(135deg, ${AIESEC_BLUE}, #6366f1)`,
            boxShadow: `0 4px 15px ${AIESEC_BLUE}40`,
          }}
          onMouseEnter={(e) => { e.target.style.transform = 'scale(1.05)'; e.target.style.boxShadow = `0 6px 20px ${AIESEC_BLUE}50` }}
          onMouseLeave={(e) => { e.target.style.transform = 'scale(1)'; e.target.style.boxShadow = `0 4px 15px ${AIESEC_BLUE}40` }}
        >
          {isRevealDay ? 'Awesome! 🎊' : 'Got it! 💪'}
        </button>
      </div>
    </div>
  )
}

function App() {
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
  const [adminMode, setAdminMode] = useState(false)
  const [showTuldsPopup, setShowTuldsPopup] = useState(false)
  const adminClickCount = useRef(0)
  const adminTimer = useRef(null)
  const tuldsShownRef = useRef(false)

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

  // Secret admin access: triple-click the logo
  function handleLogoClick() {
    adminClickCount.current++
    clearTimeout(adminTimer.current)
    if (adminClickCount.current >= 5) {
      setAdminMode((v) => !v)
      adminClickCount.current = 0
      return
    }
    adminTimer.current = setTimeout(() => {
      adminClickCount.current = 0
    }, 800)
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
      // Show TULDS popup on first successful sync
      if (!tuldsShownRef.current) {
        tuldsShownRef.current = true
        setTimeout(() => setShowTuldsPopup(true), 800)
      }
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

  // Top performer for TULDS popup
  const tuldsWinner = useMemo(() => {
    if (!computed.length) return null
    return computed[0]
  }, [computed])

  return (
    <div className="min-h-screen bg-grid-dark hero-gradient px-3 pb-16 pt-6 sm:px-6">
      {/* ── Free TULDS Popup ── */}
      <AnimatePresence>
        {showTuldsPopup ? (
          <FreeTuldsPopup
            member={tuldsWinner}
            onClose={() => setShowTuldsPopup(false)}
            isRevealDay={new Date().getDate() === 20}
          />
        ) : null}
      </AnimatePresence>

      <div className="mx-auto w-full max-w-7xl">
        {/* ── Loading bar ── */}
        <AnimatePresence>
          {loading ? (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="sticky top-3 z-50"
            >
              <div className="glass-strong rounded-2xl p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-white">
                    <Sparkles className="h-3.5 w-3.5" style={{ color: AIESEC_BLUE }} />
                    Syncing from Google Sheet…
                  </div>
                  <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {progress.done}/{progress.total} tabs
                  </div>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: `linear-gradient(90deg, ${AIESEC_BLUE}, #6366f1)` }}
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
              <button onClick={handleLogoClick} className="focus:outline-none" type="button">
                <img
                  src={AIESEC_HUMAN}
                  alt="AIESEC"
                  className="h-16 w-16 rounded-2xl p-2.5 sm:h-20 sm:w-20"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                />
              </button>
              <div>
                <div
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.65rem] font-medium"
                  style={{ background: `${AIESEC_BLUE}15`, color: AIESEC_BLUE, border: `1px solid ${AIESEC_BLUE}30` }}
                >
                  <BadgeCheck className="h-3 w-3" />
                  <span>Live Data • Auto-sync</span>
                </div>
                <h1 className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
                  Medina&apos;s Performance Dashboard
                </h1>
                {lastSync ? (
                  <div className="mt-0.5 text-[0.7rem]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    Last synced: {lastSync.toLocaleTimeString()}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="glass glass-hover inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-white"
                onClick={() => exportCsv(filtered)}
                type="button"
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </button>
              <button
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-white"
                onClick={sync}
                type="button"
                style={{ background: `${AIESEC_BLUE}20`, border: `1px solid ${AIESEC_BLUE}40` }}
              >
                <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
                {loading ? 'Syncing…' : 'Sync'}
              </button>
            </div>
          </div>
        </motion.header>

        {/* ── Stats ── */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={Users} label="Members" value={stats.count} sub="Active members" gradient="linear-gradient(135deg, #6366f1, #8b5cf6)" />
          <StatCard icon={Activity} label="Avg Score" value={stats.avgScore} sub="Across all members" gradient={`linear-gradient(135deg, ${AIESEC_BLUE}, #06b6d4)`} />
          <StatCard icon={Calendar} label="LCM Rate" value={`${stats.avgLcm}%`} sub="Average attendance" gradient="linear-gradient(135deg, #10b981, #14b8a6)" />
          <StatCard
            icon={Trophy}
            label="Champion"
            value={stats.top ? stats.top.name.split(' ')[0] : '—'}
            sub={stats.top ? `${stats.top.department} • ${stats.top.score} pts` : ''}
            gradient="linear-gradient(135deg, #f59e0b, #f97316)"
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
              <Award className="h-4 w-4" style={{ color: '#FFD700' }} />
              <span className="text-sm font-semibold text-white">Top Performers</span>
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
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
                  style={
                    isActive
                      ? { background: `${color}25`, color, border: `1px solid ${color}50` }
                      : { background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.06)' }
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
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.25)' }} />
            <input
              className="w-full rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-white/25 focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
              placeholder="Search by name or department…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {error ? (
          <div
            className="mt-3 rounded-2xl p-4 text-sm"
            style={{ background: '#ef444415', border: '1px solid #ef444440', color: '#fca5a5' }}
          >
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
                    <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <th className="px-3 py-3 text-[0.65rem] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>#</th>
                      <th className="px-3 py-3 text-[0.65rem] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Member</th>
                      <th className="hidden px-3 py-3 text-[0.65rem] font-semibold uppercase tracking-wider sm:table-cell" style={{ color: 'rgba(255,255,255,0.35)' }}>Dept</th>
                      <th className="px-3 py-3 text-[0.65rem] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Score</th>
                      <th className="hidden px-3 py-3 text-center text-[0.65rem] font-semibold uppercase tracking-wider sm:table-cell" style={{ color: 'rgba(255,255,255,0.35)' }} title="LCM Attendance">LCM</th>
                      <th className="hidden px-3 py-3 text-center text-[0.65rem] font-semibold uppercase tracking-wider md:table-cell" style={{ color: 'rgba(255,255,255,0.35)' }} title="Dept Meetings">Dep</th>
                      <th className="hidden px-3 py-3 text-center text-[0.65rem] font-semibold uppercase tracking-wider md:table-cell" style={{ color: 'rgba(255,255,255,0.35)' }} title="Working Hours">WH</th>
                      <th className="hidden px-3 py-3 text-center text-[0.65rem] font-semibold uppercase tracking-wider lg:table-cell" style={{ color: 'rgba(255,255,255,0.35)' }} title="Department KPIs">📊 Dept KPIs</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence initial={false}>
                      {tableRows.map((m) => {
                        const medal = MEDAL_COLORS[m.rank]
                        const cfg = getDeptConfig(m.department)
                        return (
                          <motion.tr
                            key={m.id}
                            layout
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.15 }}
                            className="table-row"
                            style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                          >
                            <td className="px-3 py-3">
                              {medal ? (
                                <div
                                  className="rank-medal"
                                  style={{ background: medal.bg, color: medal.text }}
                                >
                                  {m.rank}
                                </div>
                              ) : (
                                <span className="pl-1.5 text-sm font-bold" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                  {m.rank}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-white">{m.name}</span>
                                {m.position ? (
                                  <span
                                    className="rounded px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wide"
                                    style={{
                                      background: m.position === 'TL' ? '#f59e0b18' : m.position === 'MM' ? `${AIESEC_BLUE}15` : 'rgba(255,255,255,0.04)',
                                      color: m.position === 'TL' ? '#f59e0b' : m.position === 'MM' ? AIESEC_BLUE : 'rgba(255,255,255,0.35)',
                                      border: `1px solid ${m.position === 'TL' ? '#f59e0b30' : m.position === 'MM' ? `${AIESEC_BLUE}25` : 'rgba(255,255,255,0.06)'}`,
                                    }}
                                  >
                                    {m.position}
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-1 flex items-center gap-1.5">
                                <span className="sm:hidden"><DeptPill department={m.department} /></span>
                                <span
                                  className="rounded-full px-2 py-0.5 text-[0.6rem] font-medium"
                                  style={{
                                    background: m.badge.includes('Champion') ? '#FFD70015' : m.badge.includes('Elite') ? `${AIESEC_BLUE}12` : 'rgba(255,255,255,0.04)',
                                    color: m.badge.includes('Champion') ? '#FFD700' : m.badge.includes('Elite') ? AIESEC_BLUE : m.badge.includes('Star') || m.badge.includes('Rising') ? '#10b981' : m.badge.includes('At Risk') ? '#f59e0b' : 'rgba(255,255,255,0.4)',
                                    border: `1px solid ${m.badge.includes('Champion') ? '#FFD70030' : m.badge.includes('Elite') ? `${AIESEC_BLUE}25` : 'rgba(255,255,255,0.06)'}`,
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
                                        <span key={it.label} className="text-[0.65rem] font-medium whitespace-nowrap" style={{ color: it.val > 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)' }}>
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
                                        // Shorten long header names
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
                                            <span className="text-[0.65rem] font-medium whitespace-nowrap" style={{ color: val > 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)' }}>
                                              {short}: {val}
                                            </span>
                                            <div className="tooltip-content">{name}: {val}</div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )
                                }
                                return <span className="text-xs" style={{ color: 'rgba(255,255,255,0.15)' }}>—</span>
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
                className="flex items-center justify-between px-4 py-3 text-[0.7rem]"
                style={{ borderTop: '1px solid rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.3)' }}
              >
                <div>
                  Showing <span className="font-medium text-white">{filtered.length}</span> active members
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
                <h3 className="text-sm font-semibold text-white">Department Ranking</h3>
              </div>
              <div className="mt-3 space-y-2">
                {deptLeaderboard.map((d, i) => {
                  const cfg = getDeptConfig(d.dept)
                  const maxAvg = deptLeaderboard[0]?.avg || 1
                  return (
                    <div key={d.dept}>
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold" style={{ color: 'rgba(255,255,255,0.25)' }}>{i + 1}</span>
                          <span className="font-medium" style={{ color: cfg.color }}>{d.dept}</span>
                        </div>
                        <span className="font-bold text-white">{d.avg}</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <div
                          className="score-bar h-full rounded-full"
                          style={{
                            width: `${(d.avg / maxAvg) * 100}%`,
                            background: `linear-gradient(90deg, ${cfg.color}70, ${cfg.color})`,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Admin weight controls (hidden by default) */}
            <AnimatePresence>
              {adminMode ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="glass rounded-2xl p-4"
                >
                  <h3 className="text-sm font-semibold text-white">⚙️ Admin — Weights</h3>
                  <p className="mt-1 text-[0.65rem]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    Tune scoring weights (hidden from members).
                  </p>
                  <div className="mt-3 space-y-3">
                    {[
                      ['lcmAttendance', 'LCM Attendance'],
                      ['depAttendance', 'Dep Meeting Att.'],
                      ['whAttendance', 'Working Hours Att.'],
                      ['activities', 'KPI Activities'],
                    ].map(([key, label]) => (
                      <div key={key}>
                        <div className="flex items-center justify-between text-xs">
                          <span style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
                          <span className="font-bold text-white">
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
                  <button
                    className="mt-3 w-full rounded-xl px-3 py-2 text-xs font-medium text-white"
                    style={{ background: `${AIESEC_BLUE}20`, border: `1px solid ${AIESEC_BLUE}40` }}
                    onClick={() => { setWeights(DEFAULT_WEIGHTS); setError('') }}
                    type="button"
                  >
                    Reset to defaults
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* Quick tips */}
            <div className="glass rounded-2xl p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" style={{ color: '#eab308' }} />
                <h3 className="text-sm font-semibold text-white">Quick Tips</h3>
              </div>
              <ul className="mt-2 space-y-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                <li className="flex items-start gap-1.5">
                  <span style={{ color: AIESEC_BLUE }}>•</span>
                  <span>Data syncs live from Google Sheets on page load</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span style={{ color: '#10b981' }}>•</span>
                  <span>Filter by department using the pills above</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span style={{ color: '#f59e0b' }}>•</span>
                  <span>Scoring is weighted fairly per department (see formula below)</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span style={{ color: '#ec4899' }}>•</span>
                  <span>Cross-functional activities count MORE for support departments</span>
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
              <span className="text-sm font-semibold text-white">How Scoring Works</span>
            </div>
            {formulaOpen ? (
              <ChevronUp className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
            ) : (
              <ChevronDown className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
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
                  <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="text-xs font-semibold text-white">Weight Distribution</div>
                    <div className="mt-3 space-y-2.5">
                      {[
                        { label: 'LCM Attendance', pct: 20, color: '#6366f1' },
                        { label: 'Dept Meetings', pct: 20, color: '#8b5cf6' },
                        { label: 'Working Hours', pct: 20, color: '#06b6d4' },
                        { label: 'KPI Performance', pct: 40, color: AIESEC_BLUE },
                      ].map((w) => (
                        <div key={w.label}>
                          <div className="flex items-center justify-between text-xs">
                            <span style={{ color: 'rgba(255,255,255,0.5)' }}>{w.label}</span>
                            <span className="font-bold" style={{ color: w.color }}>{w.pct}%</span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }}>
                            <div className="h-full rounded-full" style={{ width: `${w.pct}%`, background: w.color }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Department fairness */}
                  <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="text-xs font-semibold text-white">Department Fairness</div>
                    <p className="mt-1 text-[0.65rem]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      Each activity is worth <span className="font-bold text-white">more</span> for support departments 
                      since activities aren&apos;t their primary JD.
                    </p>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-[0.7rem]">
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <th className="pb-2 font-semibold" style={{ color: 'rgba(255,255,255,0.35)' }}>Dept</th>
                            <th className="pb-2 text-center font-semibold" style={{ color: 'rgba(255,255,255,0.35)' }}>Target</th>
                            <th className="pb-2 text-center font-semibold" style={{ color: 'rgba(255,255,255,0.35)' }}>APD ×</th>
                            <th className="pb-2 text-right font-semibold" style={{ color: 'rgba(255,255,255,0.35)' }}>Per Act</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(DEPARTMENT_CONFIG).map(([key, cfg]) => (
                            <tr key={key} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                              <td className="py-1.5 font-medium" style={{ color: cfg.color }}>{key}</td>
                              <td className="py-1.5 text-center text-white">{cfg.activityTarget}</td>
                              <td className="py-1.5 text-center text-white">{cfg.apdMultiplier}×</td>
                              <td className="py-1.5 text-right font-medium" style={{ color: cfg.type === 'support' ? '#10b981' : 'rgba(255,255,255,0.5)' }}>
                                {(40 / cfg.activityTarget).toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                <div
                  className="mt-3 rounded-xl p-3 text-[0.7rem]"
                  style={{ background: `${AIESEC_BLUE}08`, border: `1px solid ${AIESEC_BLUE}20`, color: 'rgba(255,255,255,0.5)' }}
                >
                  <span className="font-semibold text-white">Penalties:</span> Each warning = <span className="font-bold text-[#f59e0b]">−5 pts</span>, each blame = <span className="font-bold text-[#ef4444]">−3 pts</span>
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
                <Info className="h-4 w-4" style={{ color: '#8b5cf6' }} />
                <span className="text-sm font-semibold text-white">Metrics Annex</span>
              </div>
              {annexOpen ? <ChevronUp className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} /> : <ChevronDown className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} />}
            </button>
            <AnimatePresence>
              {annexOpen ? (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="mt-4 overflow-x-auto rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <table className="min-w-[900px] w-full text-left text-sm">
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <th className="px-3 py-2.5 text-[0.65rem] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Area</th>
                          <th className="px-3 py-2.5 text-[0.65rem] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Metric</th>
                          <th className="px-3 py-2.5 text-[0.65rem] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Notes</th>
                          <th className="px-3 py-2.5 text-[0.65rem] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Links</th>
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
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                              <td className="px-3 py-2 font-semibold" style={{ color: areaConfig ? areaConfig.color : 'transparent' }}>
                                {area}
                              </td>
                              <td className="px-3 py-2 text-white/70">{metric}</td>
                              <td className="px-3 py-2 text-white/40">{notes}</td>
                              <td className="px-3 py-2 text-white/30">{links}</td>
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
                <Award className="h-4 w-4" style={{ color: '#f59e0b' }} />
                <span className="text-sm font-semibold text-white">Membership Criteria</span>
              </div>
              {criteriaOpen ? <ChevronUp className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} /> : <ChevronDown className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} />}
            </button>
            <AnimatePresence>
              {criteriaOpen ? (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="mt-4">
                    <div
                      className="rounded-xl p-3 text-xs"
                      style={{ background: `${AIESEC_BLUE}08`, border: `1px solid ${AIESEC_BLUE}20`, color: 'rgba(255,255,255,0.6)' }}
                    >
                      <div className="font-semibold text-white">Consequences Mapping</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        <li><span className="font-medium text-white">3 Blame</span> = <span className="font-medium text-[#f59e0b]">1 Warning</span></li>
                        <li><span className="font-medium text-white">2 Warnings</span> = <span className="font-medium text-[#ef4444]">Exclusion from LC</span></li>
                        <li><span className="font-medium text-white">1 Blame</span> = No voting member</li>
                      </ul>
                    </div>
                    <div className="mt-3 overflow-x-auto rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <table className="min-w-[700px] w-full text-left text-sm">
                        <thead>
                          <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <th className="px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>#</th>
                            <th className="px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Area</th>
                            <th className="px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Rule</th>
                            <th className="px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Consequence</th>
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
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                              <td className="px-3 py-2 font-bold" style={{ color: num ? 'rgba(255,255,255,0.5)' : 'transparent' }}>{num}</td>
                              <td className="px-3 py-2 font-medium text-white/60">{area}</td>
                              <td className="px-3 py-2 text-white/50">{rule}</td>
                              <td className="px-3 py-2 font-semibold" style={{
                                color: consequence.includes('Probation') || consequence.includes('Exit') ? '#ef4444' :
                                       consequence.includes('Warning') ? '#f59e0b' : '#64748b'
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
                <Star className="h-4 w-4" style={{ color: '#ec4899' }} />
                <span className="text-sm font-semibold text-white">R&amp;R Scoring</span>
              </div>
              {rrOpen ? <ChevronUp className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} /> : <ChevronDown className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} />}
            </button>
            <AnimatePresence>
              {rrOpen ? (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="mt-4 overflow-x-auto rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <table className="min-w-[700px] w-full text-left text-sm">
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <th className="px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>#</th>
                          <th className="px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Category</th>
                          <th className="px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Metric</th>
                          <th className="px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Points</th>
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
                          <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <td className="px-3 py-2 font-bold" style={{ color: num ? 'rgba(255,255,255,0.5)' : 'transparent' }}>{num}</td>
                            <td className="px-3 py-2 text-white/60">{cat}</td>
                            <td className="px-3 py-2 text-white/50">{metric}</td>
                            <td className="px-3 py-2 font-bold" style={{ color: pts.startsWith('-') ? '#ef4444' : '#10b981' }}>{pts}</td>
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

        {/* ── Footer ── */}
        <footer className="mt-10 text-center">
          <div className="flex items-center justify-center gap-3">
            <img src={LOGO} alt="AIESEC" className="h-6 w-6 rounded-lg p-0.5" style={{ background: 'rgba(255,255,255,0.04)' }} />
            <span className="text-[0.7rem] font-medium" style={{ color: 'rgba(255,255,255,0.2)' }}>
              AIESEC in Medina • Performance Dashboard
            </span>
          </div>
          <div className="mt-1 text-[0.6rem]" style={{ color: 'rgba(255,255,255,0.12)' }}>
            Live data from Google Sheet • Department-fair scoring • Weights auto-normalize to 100%
          </div>
        </footer>
      </div>
    </div>
  )
}

export default App