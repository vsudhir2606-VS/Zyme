export interface LockedByEntry {
  lockedBy: string;
  name: string;
  team: string;
}

export const INVENTORY_DIRECTORY_STORAGE_KEY = 'zyme_inventory_locked_by_directory_v1';

export const DEFAULT_LOCKED_BY_DIRECTORY: LockedByEntry[] = [
  { lockedBy: '401169', name: 'Patricia Flores', team: 'GDL' },
  { lockedBy: '60018652', name: 'Alberto Portillo Zepeda', team: 'GDL' },
  { lockedBy: '60038637', name: 'Hema S', team: 'BGL' },
  { lockedBy: '60052335', name: 'Jaikishan Singh', team: 'BGL' },
  { lockedBy: '71008028', name: 'Daniela', team: 'GDL' },
  { lockedBy: '71008029', name: 'Erik Martinez', team: 'GDL' },
  { lockedBy: '90004193', name: 'Sasi Kumar P', team: 'BGL' },
  { lockedBy: '90004603', name: 'Bhattacharya, Ritam', team: 'BGL' },
  { lockedBy: '90013462', name: 'Sylvia Vazquez Davalos', team: 'GDL' },
  { lockedBy: '90022455', name: 'Melissa Becerra', team: 'GDL' },
  { lockedBy: '90022680', name: 'Reddynath K', team: 'BGL' },
  { lockedBy: '90026135', name: 'Anshu Kumari', team: 'BGL' },
  { lockedBy: '90027844', name: 'Monica Gabriela Perez Carrasco', team: 'GDL' },
  { lockedBy: '90027845', name: 'Grecia Jazmine Guzman', team: 'GDL' },
  { lockedBy: '90027936', name: 'Anburaj C', team: 'BGL' },
  { lockedBy: '90027937', name: 'Dhanasekaran V', team: 'BGL' },
  { lockedBy: '90027955', name: 'Pratik Kumar Pathak', team: 'BGL' },
  { lockedBy: '90028055', name: 'Nandini G', team: 'BGL' },
  { lockedBy: '90036103', name: 'Sandra Canedo', team: 'GDL' },
  { lockedBy: '90044619', name: 'Debolina Dutta', team: 'BGL' },
  { lockedBy: '90045718', name: 'Alan Muniz', team: 'GDL' },
  { lockedBy: '90049057', name: 'Veena Hadimani', team: 'BGL' },
  { lockedBy: '90049282', name: 'Chetan Gopinath', team: 'BGL' },
  { lockedBy: '90052035', name: 'Sudhir', team: 'BGL' },
  { lockedBy: '90052038', name: 'Lija', team: 'BGL' },
  { lockedBy: '90052068', name: 'Joyajyoti', team: 'BGL' },
  { lockedBy: '90052493', name: 'Sarai Lopez', team: 'GDL' },
  { lockedBy: '90052524', name: 'Caro Mireles', team: 'GDL' },
  { lockedBy: '90057029', name: 'YENNY SETIAWATI', team: 'BGL' },
  { lockedBy: '24222580', name: 'Keerthy Reddy D', team: 'BGL' },
  { lockedBy: '24225436', name: 'N,Rekha', team: 'BGL' },
  { lockedBy: '24229735', name: 'Rashmi H M', team: 'BGL' },
  { lockedBy: '24232457', name: 'Chidanand Metri', team: 'BGL' },
  { lockedBy: '24243632', name: 'JEBARAJ S', team: 'BGL' },
  { lockedBy: '24243633', name: 'Hemanth Kumar', team: 'BGL' },
  { lockedBy: '24250396', name: 'Sindhu H M', team: 'BGL' },
  { lockedBy: '24251576', name: 'Manikanta H', team: 'BGL' },
];

export const normalizeLockedByKey = (raw: string): string => {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  // Strip trailing .0 from Excel numeric string representations (e.g. "90052035.0")
  const noDecimalZero = trimmed.replace(/^(\d+)\.0+$/, '$1');
  return noDecimalZero.toUpperCase();
};

const stripLeadingZeros = (val: string): string => {
  if (/^\d+$/.test(val)) {
    return val.replace(/^0+/, '') || '0';
  }
  return val;
};

export const buildLockedByLookupMap = (
  directory: LockedByEntry[]
): Map<string, LockedByEntry> => {
  const map = new Map<string, LockedByEntry>();
  for (const entry of directory) {
    const key = normalizeLockedByKey(entry.lockedBy);
    if (!key) continue;
    map.set(key, entry);
    const noZero = stripLeadingZeros(key);
    if (noZero !== key && !map.has(noZero)) {
      map.set(noZero, entry);
    }
  }
  return map;
};

export const resolveLockedByPerson = (
  rawValue: string,
  lookupMap: Map<string, LockedByEntry>
): { lockedBy: string; name: string; team: string; matched: boolean } => {
  const displayId = normalizeLockedByKey(rawValue);
  if (!displayId) {
    return { lockedBy: '', name: '', team: '', matched: false };
  }

  const direct = lookupMap.get(displayId) || lookupMap.get(stripLeadingZeros(displayId));
  if (direct) {
    return {
      lockedBy: displayId,
      name: direct.name,
      team: direct.team,
      matched: true,
    };
  }

  // Fallback: check embedded numeric IDs (e.g., "USER_90052035" or "90052035 (BGL)")
  const numericTokens = displayId.match(/\d{5,}/g);
  if (numericTokens) {
    for (const token of numericTokens) {
      const hit = lookupMap.get(token) || lookupMap.get(stripLeadingZeros(token));
      if (hit) {
        return {
          lockedBy: displayId,
          name: hit.name,
          team: hit.team,
          matched: true,
        };
      }
    }
  }

  return { lockedBy: displayId, name: '', team: '', matched: false };
};

export const loadLockedByDirectory = (): LockedByEntry[] => {
  try {
    const raw = localStorage.getItem(INVENTORY_DIRECTORY_STORAGE_KEY);
    if (!raw) return DEFAULT_LOCKED_BY_DIRECTORY.map(e => ({ ...e }));
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_LOCKED_BY_DIRECTORY.map(e => ({ ...e }));
    const cleaned: LockedByEntry[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const lockedBy = normalizeLockedByKey(String((item as any).lockedBy || ''));
      const name = String((item as any).name || '').trim();
      const team = String((item as any).team || '').trim().toUpperCase();
      if (!lockedBy || !name || seen.has(lockedBy)) continue;
      seen.add(lockedBy);
      cleaned.push({ lockedBy, name, team });
    }
    return cleaned.length > 0 ? cleaned : DEFAULT_LOCKED_BY_DIRECTORY.map(e => ({ ...e }));
  } catch {
    return DEFAULT_LOCKED_BY_DIRECTORY.map(e => ({ ...e }));
  }
};

export const saveLockedByDirectory = (directory: LockedByEntry[]): void => {
  try {
    localStorage.setItem(INVENTORY_DIRECTORY_STORAGE_KEY, JSON.stringify(directory));
  } catch {
    // no-op
  }
};
