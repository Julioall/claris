/**
 * Parser for Microsoft Teams attendance CSV reports.
 * Teams exports these as UTF-16LE tab-separated files with BOM.
 */

export interface TeamsParticipant {
  name: string;
  firstJoin: string;
  lastLeave: string;
  duration: string;
  email: string;
  upn: string;
  role: string;
}

export interface TeamsAttendanceReport {
  meetingTitle: string;
  attendeesCount: number;
  startTime: string;
  endTime: string;
  meetingDuration: string;
  meetingDate: string; // YYYY-MM-DD extracted from startTime
  participants: TeamsParticipant[];
}

/**
 * Decode a Teams CSV file (UTF-16LE with BOM, or UTF-8) into a string.
 */
function decodeFileBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  // Check for UTF-16LE BOM (FF FE)
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer);
  }

  // Check for UTF-8 BOM (EF BB BF)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buffer);
  }

  // Default to UTF-8
  return new TextDecoder('utf-8').decode(buffer);
}

/**
 * Parse date from Teams format like "3/12/26, 7:09:07 AM" or "1/30/26, 7:01:36 AM"
 * Returns ISO date string YYYY-MM-DD
 */
function parseTeamsDate(dateStr: string): string {
  const cleaned = dateStr.trim();
  // Format: M/D/YY, H:MM:SS AM/PM
  const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) return '';

  const month = match[1].padStart(2, '0');
  const day = match[2].padStart(2, '0');
  let year = match[3];
  if (year.length === 2) {
    const num = parseInt(year, 10);
    year = num >= 50 ? `19${year}` : `20${year}`;
  }

  return `${year}-${month}-${day}`;
}

/**
 * Parse a Teams attendance CSV file into structured data.
 */
export function parseTeamsAttendanceCsv(buffer: ArrayBuffer): TeamsAttendanceReport {
  const text = decodeFileBuffer(buffer);

  // Split into lines and clean
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  let meetingTitle = '';
  let attendeesCount = 0;
  let startTime = '';
  let endTime = '';
  let meetingDuration = '';
  let meetingDate = '';

  // Parse summary section (lines before "2. Participantes")
  let participantHeaderIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cols = line.split('\t').map(c => c.trim());

    if (cols[0]?.includes('Título da reunião') || cols[0]?.includes('Titulo da reuniao')) {
      meetingTitle = cols[1] || '';
    } else if (cols[0]?.includes('Participantes Atendidos')) {
      attendeesCount = parseInt(cols[1] || '0', 10);
    } else if (cols[0]?.includes('Hora de início') || cols[0]?.includes('Hora de inicio')) {
      startTime = cols[1] || '';
      meetingDate = parseTeamsDate(startTime);
    } else if (cols[0]?.includes('Hora de término') || cols[0]?.includes('Hora de termino')) {
      endTime = cols[1] || '';
    } else if (cols[0]?.includes('Duração da reunião') || cols[0]?.includes('Duracao da reuniao')) {
      meetingDuration = cols[1] || '';
    }

    // Find the participant header row (contains "Nome" and "Email")
    if (cols[0] === 'Nome' && cols.some(c => c === 'Email' || c.includes('Email'))) {
      participantHeaderIndex = i;
      break;
    }
  }

  const participants: TeamsParticipant[] = [];

  if (participantHeaderIndex >= 0) {
    for (let i = participantHeaderIndex + 1; i < lines.length; i++) {
      const cols = lines[i].split('\t').map(c => c.trim());
      if (!cols[0] || cols[0].startsWith('1.') || cols[0].startsWith('2.')) continue;

      participants.push({
        name: cols[0] || '',
        firstJoin: cols[1] || '',
        lastLeave: cols[2] || '',
        duration: cols[3] || '',
        email: cols[4] || '',
        upn: cols[5] || '',
        role: cols[6] || '',
      });
    }
  }

  return {
    meetingTitle,
    attendeesCount,
    startTime,
    endTime,
    meetingDuration,
    meetingDate,
    participants,
  };
}

/**
 * Normalize a name for fuzzy matching: lowercase, remove accents, collapse whitespace
 */
function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface MatchResult {
  studentId: string;
  studentName: string;
  matched: boolean;
  matchedParticipantName?: string;
  matchedBy?: 'name' | 'email';
}

/**
 * Match Teams participants to course students by name or email.
 */
export function matchParticipantsToStudents(
  participants: TeamsParticipant[],
  students: { id: string; full_name: string; email: string | null }[],
): MatchResult[] {
  const normalizedParticipants = participants.map(p => ({
    ...p,
    normalizedName: normalizeName(p.name),
    normalizedEmail: p.email?.toLowerCase().trim() || '',
  }));

  return students.map(student => {
    const normalizedStudentName = normalizeName(student.full_name);
    const normalizedStudentEmail = student.email?.toLowerCase().trim() || '';

    // Try exact email match first
    if (normalizedStudentEmail) {
      const emailMatch = normalizedParticipants.find(
        p => p.normalizedEmail === normalizedStudentEmail || p.upn?.toLowerCase().trim() === normalizedStudentEmail,
      );
      if (emailMatch) {
        return {
          studentId: student.id,
          studentName: student.full_name,
          matched: true,
          matchedParticipantName: emailMatch.name,
          matchedBy: 'email' as const,
        };
      }
    }

    // Try name match (exact normalized)
    const nameMatch = normalizedParticipants.find(p => p.normalizedName === normalizedStudentName);
    if (nameMatch) {
      return {
        studentId: student.id,
        studentName: student.full_name,
        matched: true,
        matchedParticipantName: nameMatch.name,
        matchedBy: 'name' as const,
      };
    }

    // Try partial name match (student name contains participant or vice versa)
    const partialMatch = normalizedParticipants.find(
      p =>
        normalizedStudentName.includes(p.normalizedName) ||
        p.normalizedName.includes(normalizedStudentName),
    );
    if (partialMatch) {
      return {
        studentId: student.id,
        studentName: student.full_name,
        matched: true,
        matchedParticipantName: partialMatch.name,
        matchedBy: 'name' as const,
      };
    }

    return {
      studentId: student.id,
      studentName: student.full_name,
      matched: false,
    };
  });
}
