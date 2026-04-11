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

function toNum(v) {
  if (v == null) return 0
  const s = String(v).trim().replace('%', '')
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
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

