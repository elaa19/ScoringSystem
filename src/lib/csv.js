// ─── Low-level CSV helpers ────────────────────────────────────────────────────

/**
 * Full RFC-4180-ish CSV parser that handles:
 *  - quoted fields with commas
 *  - quoted fields with embedded newlines (\r\n, \n, \r)
 *  - escaped quotes (doubled "")
 */
export function parseCSVText(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        row.push(field)
        field = ''
      } else if (ch === '\r' && text[i + 1] === '\n') {
        row.push(field)
        rows.push(row)
        row = []
        field = ''
        i++ // skip \n
      } else if (ch === '\n' || ch === '\r') {
        row.push(field)
        rows.push(row)
        row = []
        field = ''
      } else {
        field += ch
      }
    }
  }
  // flush last row
  row.push(field)
  if (row.some((c) => c.replace(/\s/g, '') !== '')) rows.push(row)

  return rows
}

/** Clean member names: trim whitespace/newlines, collapse spaces */
function cleanName(raw) {
  return (raw ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Normalize a name for matching (lowercase, no accents, no extra spaces) */
function normName(name) {
  return cleanName(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function toNum(v) {
  if (v == null) return 0
  const s = String(v).trim().replace('%', '')
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

// ─── Attendance tab parser (LCM / Dep Meetings / Working Hours) ──────────────

/**
 * Parse an attendance tab. These have the structure:
 *   Row 0: legend row (dates, links, etc.)
 *   Row 1: secondary legend (DA, JA, counts)
 *   Row 2+: data rows → [Department, Name, Status1, Notes1, Status2, Notes2, ...]
 *
 * Department is only in col 0 for the first member of each group.
 * Empty-name rows with numbers in col 2+ are separator/count rows → skip.
 */
export function parseAttendanceTab(csvText) {
  const rows = parseCSVText(csvText)
  if (rows.length < 3) return []

  const members = []
  let currentDept = ''

  // Skip first 2 rows (legend + secondary header)
  for (let r = 2; r < rows.length; r++) {
    const cols = rows[r]
    const dept = cleanName(cols[0])
    const name = cleanName(cols[1])

    // Skip empty-name rows (separators / count rows)
    if (!name) {
      if (dept) currentDept = dept
      continue
    }

    if (dept) currentDept = dept

    // Parse attendance/status pairs starting from col 2
    const sessions = []
    for (let c = 2; c < cols.length; c += 2) {
      const raw = cleanName(cols[c])
      const notes = cleanName(cols[c + 1] ?? '')
      if (!raw && !notes) continue

      const lower = raw.toLowerCase()
      let status = 'unknown'
      if (lower.includes('attended') && !lower.includes("didn't")) status = 'attended'
      else if (lower.includes("didn't") || lower === 'da') status = 'absent'
      else if (lower.includes('justified') || lower === 'ja') status = 'justified'
      else if (lower === 'fired' || notes.toUpperCase() === 'FIRED') status = 'fired'
      else if (lower === 'resigned' || notes.toUpperCase() === 'RESIGNED') status = 'resigned'
      else if (raw && /^\d+$/.test(raw)) continue // numeric count row

      sessions.push({ status, notes })
    }

    // Detect fired/resigned from notes
    const isFired = sessions.some(
      (s) => s.status === 'fired' || s.notes.toUpperCase().includes('FIRED')
    )
    const isResigned = sessions.some(
      (s) => s.status === 'resigned' || s.notes.toUpperCase().includes('RESIGNED')
    )

    const activeSessions = sessions.filter(
      (s) => s.status !== 'fired' && s.status !== 'resigned'
    )
    const attended = activeSessions.filter((s) => s.status === 'attended').length
    const justified = activeSessions.filter((s) => s.status === 'justified').length
    const absent = activeSessions.filter((s) => s.status === 'absent').length
    const total = attended + justified + absent
    const warnings = sessions.filter((s) => s.notes.toUpperCase().includes('WARNING')).length
    const blames = sessions.filter(
      (s) => s.notes.toUpperCase().includes('BLAME') && !s.notes.toUpperCase().includes('OTHER')
    ).length

    members.push({
      name,
      department: currentDept,
      attended,
      justified,
      absent,
      total,
      rate: total > 0 ? Math.round(((attended + justified * 0.5) / total) * 100) : 0,
      warnings,
      blames,
      memberStatus: isFired ? 'fired' : isResigned ? 'resigned' : 'active',
    })
  }

  return members
}

// ─── Membership tab parser (IGT / IGV / OGV / OGT) ──────────────────────────

/**
 * Parse a membership/performance tab. Structure:
 *   Row 0: headers with "WEEK N ..." markers + metric names repeating per week
 *   Row 1+: [Department, Name, ...week1 metrics..., ...week2 metrics..., ...]
 *
 * Columns per week:
 *   iCX (IGT/IGV): 8 cols → Attendance, Cold Calls, IR Call, Meetings Booked,
 *                              Meetings Attended, Interviews, # APDs, Score
 *   oGX (OGV/OGT): 7 cols → Attendance, Cold Calls, IR Call, Meeting w/ EP,
 *                              # Applicants, # APDs, Score
 */
export function parseMembershipTab(csvText, type = 'icx') {
  const rows = parseCSVText(csvText)
  if (rows.length < 2) return []

  const colsPerWeek = type === 'icx' ? 8 : 7
  const members = []
  let currentDept = ''

  // Skip header row (row 0)
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r]
    const dept = cleanName(cols[0])
    const name = cleanName(cols[1])

    if (!name) {
      if (dept) currentDept = dept
      continue
    }
    if (dept) currentDept = dept

    const weeks = []
    for (let w = 0; w < 4; w++) {
      const base = 2 + w * colsPerWeek
      if (base >= cols.length) break

      const attRaw = cleanName(cols[base] ?? '')
      const attendance = attRaw.toLowerCase() === 'true'

      if (type === 'icx') {
        weeks.push({
          attendance,
          coldCalls: toNum(cols[base + 1]),
          irCalls: toNum(cols[base + 2]),
          meetingsBooked: toNum(cols[base + 3]),
          meetingsAttended: toNum(cols[base + 4]),
          interviews: toNum(cols[base + 5]),
          apds: toNum(cols[base + 6]),
          score: toNum(cols[base + 7]),
        })
      } else {
        weeks.push({
          attendance,
          coldCalls: toNum(cols[base + 1]),
          irCalls: toNum(cols[base + 2]),
          meetingsWithEP: toNum(cols[base + 3]),
          applicants: toNum(cols[base + 4]),
          apds: toNum(cols[base + 5]),
          score: toNum(cols[base + 6]),
        })
      }
    }

    // Aggregate across weeks
    const totalColdCalls = weeks.reduce((s, w) => s + (w.coldCalls || 0), 0)
    const totalIRCalls = weeks.reduce((s, w) => s + (w.irCalls || 0), 0)
    const totalMeetings = weeks.reduce(
      (s, w) => s + (w.meetingsBooked || 0) + (w.meetingsAttended || 0) + (w.meetingsWithEP || 0),
      0
    )
    const totalAPDs = weeks.reduce((s, w) => s + (w.apds || 0), 0)
    const totalInterviews = weeks.reduce((s, w) => s + (w.interviews || 0), 0)
    const totalApplicants = weeks.reduce((s, w) => s + (w.applicants || 0), 0)
    const totalWeeklyScore = weeks.reduce((s, w) => s + (w.score || 0), 0)
    const whAttended = weeks.filter((w) => w.attendance).length
    const whTotal = weeks.length

    members.push({
      name,
      department: currentDept,
      weeks,
      totalColdCalls,
      totalIRCalls,
      totalMeetings,
      totalAPDs,
      totalInterviews,
      totalApplicants,
      totalWeeklyScore,
      whAttended,
      whTotal,
    })
  }

  return members
}

// ─── Cross-functional tab parser (#Class Shouts, #Booths, #Outings) ─────────

/**
 * Parse the cross-functional metrics tab. Structure:
 *   Row 0: headers → DEPARTMENT, MEMBER NAME, Position, #CLASS SHOUTS, #BOOTHS ATTENDED, #OUTINGS WITH EPS
 *   Row 1+: [Department, Name, Position, classShouts, booths, outings]
 *
 * Department is only in col 0 for the first member of each group.
 */
export function parseCrossFunctionalTab(csvText) {
  const rows = parseCSVText(csvText)
  if (rows.length < 2) return []

  const members = []
  let currentDept = ''

  // Skip header row (row 0)
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r]
    const dept = cleanName(cols[0])
    const name = cleanName(cols[1])

    if (!name) {
      if (dept) currentDept = dept
      continue
    }
    if (dept) currentDept = dept

    const position = cleanName(cols[2]) || ''

    members.push({
      name,
      department: currentDept,
      position,
      classShouts: toNum(cols[3]),
      booths: toNum(cols[4]),
      outings: toNum(cols[5]),
    })
  }

  return members
}

// ─── Support department membership tab parser ────────────────────────────────

/**
 * Parse a support department membership tab (IM, MKT, F&L, BD&EWA, TM).
 * Structure:
 *   Row 0: headers repeating per week → [Dept, Name, DepMeetingAtt, WHAtt, ...metrics..., Score, ...]
 *   Row 1+: data rows
 *
 * Different departments have different metrics per week:
 *   MKT:   6 cols/week → DepAtt, WHAtt, #SUPs, #PostsMade, #ClassShouts, Score
 *   IM:    5 cols/week → DepAtt, WHAtt, #ToolsDeveloped, #ToolsManaged, Score
 *   TM:    6 cols/week → DepAtt, WHAtt, %NECImpl, #Campaigns, %RRNMS, Score
 *   F&L:   7 cols/week → DepAtt, WHAtt, %EPAccom, %ProofsCol, %CostsExec, %RevExec, Score
 *   BD&EWA: 6 cols/week → DepAtt, WHAtt, $Rev/#Tools, #Partners/#ToolsUpd, #Contracts/DataCentr, Score
 *
 * We auto-detect colsPerWeek from the header row by finding how many columns
 * appear until the pattern repeats.
 */
export function parseSupportMembershipTab(csvText) {
  const rows = parseCSVText(csvText)
  if (rows.length < 2) return []

  // Auto-detect columns per week from header row
  // Headers start at col 2, find where the pattern (first header) repeats
  const headers = rows[0]
  const firstMetricHeader = cleanName(headers[2]).toUpperCase()
  let colsPerWeek = 0
  for (let c = 3; c < headers.length; c++) {
    if (cleanName(headers[c]).toUpperCase() === firstMetricHeader) {
      colsPerWeek = c - 2
      break
    }
  }
  if (colsPerWeek <= 0) colsPerWeek = headers.length - 2 // fallback: single week

  // Extract metric header names from the first week (cols between DepAtt/WHAtt and Score)
  const metricHeaders = []
  for (let c = 4; c < 2 + colsPerWeek - 1 && c < headers.length; c++) {
    const h = cleanName(headers[c])
    if (h) metricHeaders.push(h)
  }

  const members = []
  let currentDept = ''

  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r]
    const dept = cleanName(cols[0])
    const name = cleanName(cols[1])

    if (!name) {
      if (dept) currentDept = dept
      continue
    }
    if (dept) currentDept = dept

    // Parse weekly scores
    const weeklyScores = []
    const weeklyDepAtt = []
    const weeklyWhAtt = []
    const weeklyMetrics = []

    for (let w = 0; w < 20; w++) { // up to 20 weeks
      const base = 2 + w * colsPerWeek
      if (base >= cols.length) break

      const depAttRaw = cleanName(cols[base] ?? '').toUpperCase()
      const whAttRaw = cleanName(cols[base + 1] ?? '').toUpperCase()

      weeklyDepAtt.push(depAttRaw === 'TRUE')
      weeklyWhAtt.push(whAttRaw === 'TRUE')

      // Collect all intermediate metrics (between att columns and score)
      const metricVals = []
      for (let c = base + 2; c < base + colsPerWeek - 1 && c < cols.length; c++) {
        metricVals.push(toNum(cols[c]))
      }
      weeklyMetrics.push(metricVals)

      // Last column of the week is the score
      const scoreIdx = base + colsPerWeek - 1
      weeklyScores.push(scoreIdx < cols.length ? toNum(cols[scoreIdx]) : 0)
    }

    const totalWeeklyScore = weeklyScores.reduce((s, v) => s + v, 0)
    const depAttended = weeklyDepAtt.filter(Boolean).length
    const depTotal = weeklyDepAtt.length
    const whAttended = weeklyWhAtt.filter(Boolean).length
    const whTotal = weeklyWhAtt.length

    // Sum all weekly metrics across weeks (each position corresponds to a different metric)
    const metricSums = []
    for (const wm of weeklyMetrics) {
      for (let i = 0; i < wm.length; i++) {
        metricSums[i] = (metricSums[i] || 0) + wm[i]
      }
    }

    members.push({
      name,
      department: currentDept,
      totalWeeklyScore,
      depAttended,
      depTotal,
      whAttended,
      whTotal,
      metricHeaders, // names of department-specific metrics
      metricSums,    // department-specific metrics summed across weeks
    })
  }

  return members
}

// ─── Position assignment ─────────────────────────────────────────────────────

/**
 * Known positions mapping.
 * First member listed per department in the LCM tab is typically the TL.
 * This function assigns positions based on order within department.
 */
function assignPositions(memberMap) {
  // Group members by department
  const deptGroups = {}
  for (const [, m] of memberMap) {
    if (!m.department || m.memberStatus !== 'active') continue
    if (!deptGroups[m.department]) deptGroups[m.department] = []
    deptGroups[m.department].push(m)
  }

  // For small departments (≤3 members), first person = TL, rest = Member
  // For large departments (>3 members), first = TL, rest = Member
  // User can override by adding a POSITION column to the sheet later
  for (const dept of Object.keys(deptGroups)) {
    const members = deptGroups[dept]
    for (let i = 0; i < members.length; i++) {
      if (!members[i].position) {
        members[i].position = i === 0 ? 'TL' : 'Member'
      }
    }
  }
}

// ─── Consolidation: merge all tabs into one member list ──────────────────────

export function consolidateMembers(tabData) {
  const {
    lcmAttendance, depMeetings, workingHours,
    igtMembership, igvMembership, ogvMembership, ogtMembership,
    crossFunctional,
    imMembership, mktMembership, flMembership, bdewaMembership, tmMembership,
  } = tabData

  // Parse each tab
  const lcm = parseAttendanceTab(lcmAttendance)
  const dep = parseAttendanceTab(depMeetings)
  const wh = parseAttendanceTab(workingHours)
  const igt = parseMembershipTab(igtMembership, 'icx')
  const igv = parseMembershipTab(igvMembership, 'icx')
  const ogv = parseMembershipTab(ogvMembership, 'ogx')
  const ogt = parseMembershipTab(ogtMembership, 'ogx')
  const cf = crossFunctional ? parseCrossFunctionalTab(crossFunctional) : []

  // Parse support department membership tabs
  const imMembers = imMembership ? parseSupportMembershipTab(imMembership) : []
  const mktMembers = mktMembership ? parseSupportMembershipTab(mktMembership) : []
  const flMembers = flMembership ? parseSupportMembershipTab(flMembership) : []
  const bdewaMembers = bdewaMembership ? parseSupportMembershipTab(bdewaMembership) : []
  const tmMembers = tmMembership ? parseSupportMembershipTab(tmMembership) : []

  // Build a lookup by normalized name
  const memberMap = new Map()

  function getOrCreate(name, department) {
    const key = normName(name)
    if (!key) return null
    if (memberMap.has(key)) {
      const m = memberMap.get(key)
      // Update department if we get a non-empty one
      if (department && !m.department) m.department = department
      return m
    }
    const m = {
      id: '',
      name: cleanName(name),
      department: department || '',
      position: '', // TL, MM, or Member — assigned after consolidation
      memberStatus: 'active',
      // LCM attendance
      lcm: { attended: 0, justified: 0, absent: 0, total: 0, rate: 0 },
      // Department meeting attendance
      dep: { attended: 0, justified: 0, absent: 0, total: 0, rate: 0 },
      // Working hours attendance (from attendance tab)
      wh: { attended: 0, justified: 0, absent: 0, total: 0, rate: 0 },
      // Weekly performance metrics (from membership tabs)
      weeks: [],
      totalColdCalls: 0,
      totalIRCalls: 0,
      totalMeetings: 0,
      totalAPDs: 0,
      totalInterviews: 0,
      totalApplicants: 0,
      totalWeeklyScore: 0,
      whAttendedMembership: 0,
      whTotalMembership: 0,
      // Cross-functional metrics
      totalClassShouts: 0,
      totalBooths: 0,
      totalOutings: 0,
      // Department-specific metrics (from support membership tabs)
      deptMetrics: null,
      deptMetricSums: [],
      // Sanctions
      warnings: 0,
      blames: 0,
    }
    memberMap.set(key, m)
    return m
  }

  // Merge LCM attendance
  for (const row of lcm) {
    const m = getOrCreate(row.name, row.department)
    if (!m) continue
    m.lcm = { attended: row.attended, justified: row.justified, absent: row.absent, total: row.total, rate: row.rate }
    m.warnings += row.warnings
    m.blames += row.blames
    if (row.memberStatus !== 'active') m.memberStatus = row.memberStatus
  }

  // Merge dep meeting attendance
  for (const row of dep) {
    const m = getOrCreate(row.name, row.department)
    if (!m) continue
    m.dep = { attended: row.attended, justified: row.justified, absent: row.absent, total: row.total, rate: row.rate }
    m.warnings += row.warnings
    m.blames += row.blames
  }

  // Merge working hours attendance
  for (const row of wh) {
    const m = getOrCreate(row.name, row.department)
    if (!m) continue
    m.wh = { attended: row.attended, justified: row.justified, absent: row.absent, total: row.total, rate: row.rate }
  }

  // Merge membership tabs
  for (const row of [...igt, ...igv, ...ogv, ...ogt]) {
    const m = getOrCreate(row.name, row.department)
    if (!m) continue
    m.weeks = row.weeks
    m.totalColdCalls += row.totalColdCalls
    m.totalIRCalls += row.totalIRCalls
    m.totalMeetings += row.totalMeetings
    m.totalAPDs += row.totalAPDs
    m.totalInterviews += row.totalInterviews
    m.totalApplicants += row.totalApplicants
    m.totalWeeklyScore += row.totalWeeklyScore
    m.whAttendedMembership = row.whAttended
    m.whTotalMembership = row.whTotal
  }

  // Merge support department membership tabs
  for (const row of [...imMembers, ...mktMembers, ...flMembers, ...bdewaMembers, ...tmMembers]) {
    const m = getOrCreate(row.name, row.department)
    if (!m) continue
    m.totalWeeklyScore += row.totalWeeklyScore
    m.deptMetricNames = row.metricHeaders || []
    m.deptMetricSums = row.metricSums || []
  }

  // Merge cross-functional metrics (including position from the sheet)
  for (const row of cf) {
    const m = getOrCreate(row.name, row.department)
    if (!m) continue
    m.totalClassShouts += row.classShouts
    m.totalBooths += row.booths
    m.totalOutings += row.outings
    // Use position from cross-functional sheet if provided
    if (row.position) m.position = row.position
  }

  // Assign positions (TL / Member) based on order within department
  assignPositions(memberMap)

  // Finalize: assign IDs, filter out empty/separator entries
  const result = []
  for (const [key, m] of memberMap) {
    if (!m.name || m.name.length < 2) continue
    m.id = `${key}:${m.department}`
    result.push(m)
  }

  return result
}

// ─── Legacy export (keep for backward compat) ────────────────────────────────

function splitCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function normHeader(h) {
  return h.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function parseMembersCsv(csvText) {
  const text = (csvText ?? '').trim()
  if (!text) return []

  const lines = text.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []

  const headers = splitCsvLine(lines[0]).map(normHeader)

  return lines.slice(1).map((line, idx) => {
    const values = splitCsvLine(line)
    const row = Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']))

    const name = row['member name'] || row['name'] || `Member ${idx + 1}`
    const department = row['department'] || row['dept'] || 'General'

    const attendance = toNum(row['attendance %'] || row['attendance'])
    const taskCompletion = toNum(row['task completion'] || row['taskcompletion'] || row['tasks'])
    const peerReview = toNum(row['peer review score'] || row['peerreview'] || row['peer review'])
    const previousRank = Math.trunc(toNum(row['previous rank'] || row['previousrank']))

    return {
      id: `${name}:${department}:${idx}`,
      name,
      department,
      attendance,
      taskCompletion,
      peerReview,
      previousRank: previousRank || null,
    }
  })
}
