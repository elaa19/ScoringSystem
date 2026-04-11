// Mock data — replace the SHEET_CSV_URL with your published Google Sheet CSV link
// To get it: Google Sheet → File → Share → Publish to web → CSV
export const SHEET_CSV_URL = '';

export const mockMembers = [
  {
    name: 'Sara BenAyed',
    department: 'Marketing',
    attendance: 97,
    taskCompletion: 95,
    peerReview: 4.8,
    totalRank: 1,
    previousRank: 3,
    badge: 'Rising Star',
  },
  {
    name: 'Elaa',
    department: 'IM',
    attendance: 94,
    taskCompletion: 92,
    peerReview: 4.7,
    totalRank: 2,
    previousRank: 2,
    badge: 'Consistency King',
  },
  {
    name: 'Eya',
    department: 'IM',
    attendance: 96,
    taskCompletion: 90,
    peerReview: 4.9,
    totalRank: 3,
    previousRank: 5,
    badge: 'Rising Star',
  },

  {
    name: 'Eya',
    department: 'IM',
    attendance: 89,
    taskCompletion: 91,
    peerReview: 4.4,
    totalRank: 5,
    previousRank: 8,
    
  },

];

// Helper: compute a 0-100 performance score from raw metrics
export function computeScore(member) {
  // weighted: 30% attendance, 40% task completion, 30% peer review (scaled to 100)
  return Math.round(
    member.attendance * 0.3 +
    member.taskCompletion * 0.4 +
    (member.peerReview / 5) * 100 * 0.3
  );
}

// Helper: parse CSV text from Google Sheets into member objects
export function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

  return lines.slice(1).map((line, idx) => {
    const values = line.split(',').map(v => v.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i]; });

    return {
      name: row['member name'] || row['name'] || `Member ${idx + 1}`,
      department: row['department'] || 'General',
      attendance: parseFloat(row['attendance %'] || row['attendance']) || 0,
      taskCompletion: parseFloat(row['task completion'] || row['taskcompletion']) || 0,
      peerReview: parseFloat(row['peer review score'] || row['peerreview']) || 0,
      totalRank: parseInt(row['total performance rank'] || row['totalrank']) || idx + 1,
      previousRank: parseInt(row['previous rank'] || row['previousrank']) || idx + 1,
      badge: assignBadge(
        parseInt(row['total performance rank'] || row['totalrank']) || idx + 1,
        parseInt(row['previous rank'] || row['previousrank']) || idx + 1
      ),
    };
  });
}

function assignBadge(currentRank, previousRank) {
  const improvement = previousRank - currentRank;
  if (improvement >= 3) return 'Rising Star';
  if (improvement <= 0 && currentRank <= 5) return 'Consistency King';
  return 'Team Player';
}
