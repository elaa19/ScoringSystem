// Google Sheet configuration – all tab GIDs for the published spreadsheet
export const SPREADSHEET_ID = '1rLEtpiP75cYz00rea_mUHTHp8giNx5gk21l0-fL5B2k'

export const TABS = {
  lcmAttendance:  { gid: '0',          label: 'LCM Attendance' },
  depMeetings:    { gid: '1216902383',  label: 'Dep Meetings' },
  workingHours:   { gid: '1996632349',  label: 'Working Hours' },
  igtMembership:  { gid: '1962470379',  label: 'IGT Membership' },
  igvMembership:  { gid: '1585765661',  label: 'IGV Membership' },
  ogvMembership:  { gid: '177420064',   label: 'OGV Membership' },
  ogtMembership:  { gid: '210933617',   label: 'OGT Membership' },
  crossFunctional:{ gid: '157466425',   label: 'Generic Metrics' },
  // ── Support Department Membership Tabs ──
  imMembership:   { gid: '529544650',   label: 'IM Membership' },
  mktMembership:  { gid: '1152505835',  label: 'MKT Membership' },
  flMembership:   { gid: '1653278752',  label: 'F&L Membership' },
  bdewaMembership:{ gid: '1318997583',  label: 'BD&EWA Membership' },
  tmMembership:   { gid: '862939971',   label: 'TM Membership' },
}

function csvUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`
}

/**
 * Fetch all tabs in parallel. Returns { tabKey: csvText, ... }
 * @param {AbortSignal} [signal]
 * @param {(done: number, total: number) => void} [onProgress]
 */
export async function fetchAllTabs(signal, onProgress) {
  const entries = Object.entries(TABS)
  const total = entries.length
  let done = 0

  const results = await Promise.all(
    entries.map(async ([key, { gid }]) => {
      const res = await fetch(csvUrl(gid), { signal })
      if (!res.ok) throw new Error(`Tab "${key}" fetch failed (${res.status})`)
      const text = await res.text()
      done++
      onProgress?.(done, total)
      return [key, text]
    })
  )

  return Object.fromEntries(results)
}
