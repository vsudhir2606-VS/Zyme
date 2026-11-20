export interface MatchEngineConfig {
  potentialMatchEnabled: boolean;
  potentialMatchThreshold: number; // strictly greater than this (default 51 -> >51%)
  ignoreCityNames: boolean;
  ignoredWords: string[];
}

export interface RplMatchEvaluation {
  isExact: boolean;
  matchPercent: number;
  isPotentialMatch: boolean;
  matchedKeywords: string[];
  customerSignificantTokens: string[];
  rplSignificantTokens: string[];
}

export interface CaseMatchSummary {
  hasExactMatch: boolean;
  hasPotentialMatch: boolean;
  isNoMatch: boolean;
  isOther: boolean;
  hasRiskKeyword: boolean;
  hasAprvCountry: boolean;
  maxMatchPercent: number;
  potentialMatchCount: number;
  exactMatchCount: number;
  matchedKeywords: string[];
  matchedKeywordsText: string;
  rplResultsByRow: Map<number, RplMatchEvaluation>;
}

export const MATCH_ENGINE_STORAGE_KEY = 'zyme_live_match_config_v3';
const PREV_MATCH_ENGINE_STORAGE_KEY_V2 = 'zyme_live_match_config_v2';
const LEGACY_MATCH_ENGINE_STORAGE_KEY = 'zyme_live_match_config_v1';
export const MATCH_ENGINE_UPDATED_EVENT = 'zyme:live-match-config-updated';

export const DEFAULT_APRV_COUNTRY_CODES: string[] = [
  'RU', 'UA', 'NI', 'VE', 'BY', 'CU', 'IR', 'KP', 'SY',
];

export const DEFAULT_HIGH_RISK_KEYWORDS: string[] = [
  'SANCTION', 'EMBARGO', 'DENIED',
  'Lockheed', 'Raytheon', 'Northrop', 'Bae', 'RTX', 'United Technologies', 'UTC', 'Rockwell',
  'Kharon', 'Alliant', 'AeroVironment', 'ViaSat', 'Data Link Solution', 'Projectina AG',
  'General Dynamic', 'LUKOIL', 'Citgo', 'Huawei', 'Nayara', 'Wintershall', 'Huntington', 'HII',
];

const APRV_COUNTRY_NAME_BY_CODE: Record<string, string[]> = {
  RU: ['russia', 'russian federation'],
  UA: ['ukraine'],
  NI: ['nicaragua'],
  VE: ['venezuela'],
  BY: ['belarus'],
  CU: ['cuba'],
  IR: ['iran'],
  KP: ['north korea', 'dprk', 'democratic peoples republic of korea'],
  SY: ['syria', 'syrian arab republic'],
};

export const DEFAULT_IGNORED_WORDS: string[] = [
  'Technology',
  'Technologies',
  'LLC',
  'Inc',
  'PVT',
  'Development',
  'Ltd',
  'Limited',
  'Co',
  'Corp',
  'Corporation',
  'Company',
  'GmbH',
  'LLP',
  'PLC',
  'Private',
  'IT',
  'Solution',
  'Solutions',
  'INDIA',
  'INSTITUTE',
  'Science',
  'SCIENTIFIC',
  'Research',
  'infotech',
  'CONG',
  'TY',
  'TNHH',
  'International',
  'system',
  'Systems',
  'constuction',
  'Construction',
  'services',
  'Service',
  'management',
];

export const DEFAULT_MATCH_ENGINE_CONFIG: MatchEngineConfig = {
  potentialMatchEnabled: false,
  potentialMatchThreshold: 51,
  ignoreCityNames: true,
  ignoredWords: [...DEFAULT_IGNORED_WORDS],
};

// Built-in single-word major world & commercial hub cities
const BUILTIN_SINGLE_CITIES: string[] = [
  // China & Greater China
  'beijing', 'shanghai', 'shenzhen', 'guangzhou', 'hangzhou', 'chengdu', 'wuhan',
  'nanjing', 'tianjin', 'suzhou', 'xian', 'chongqing', 'dongguan', 'foshan',
  'xiamen', 'qingdao', 'ningbo', 'hefei', 'changsha', 'zhengzhou', 'dalian',
  'shenyang', 'harbin', 'jinan', 'kunming', 'fuzhou', 'wuxi', 'zhuhai',
  'changchun', 'shijiazhuang', 'nanchang', 'guiyang', 'taiyuan', 'nanning',
  'haikou', 'lanzhou', 'urumqi', 'yantai', 'nantong', 'changzhou', 'quanzhou',
  'wenzhou', 'jiaxing', 'shaoxing', 'zhongshan', 'huizhou', 'weifang', 'xuzhou',
  'taipei', 'kaohsiung', 'taichung', 'tainan', 'macau', 'macao', 'hsinchu',
  // India
  'mumbai', 'delhi', 'bengaluru', 'bangalore', 'hyderabad', 'chennai', 'pune',
  'kolkata', 'ahmedabad', 'noida', 'gurgaon', 'gurugram', 'jaipur', 'surat',
  'kochi', 'cochin', 'coimbatore', 'chandigarh', 'indore', 'lucknow', 'nagpur',
  'visakhapatnam', 'vadodara', 'bhopal', 'patna', 'ludhiana', 'nashik', 'faridabad',
  'ghaziabad', 'thiruvananthapuram', 'trivandrum', 'mysore', 'mysuru', 'mangalore',
  // APJ
  'tokyo', 'osaka', 'yokohama', 'nagoya', 'kyoto', 'fukuoka', 'sapporo', 'kobe',
  'seoul', 'busan', 'incheon', 'daegu', 'daejeon', 'gwangju', 'suwon', 'ulsan',
  'singapore', 'bangkok', 'jakarta', 'surabaya', 'bandung', 'manila', 'cebu',
  'hanoi', 'saigon', 'penang', 'sydney', 'melbourne', 'brisbane', 'perth',
  'adelaide', 'canberra', 'auckland', 'wellington', 'christchurch',
  // Middle East & Africa
  'dubai', 'sharjah', 'riyadh', 'jeddah', 'dammam', 'doha', 'muscat', 'manama',
  'kuwait', 'amman', 'beirut', 'cairo', 'alexandria', 'casablanca', 'lagos',
  'nairobi', 'johannesburg', 'pretoria', 'durban', 'istanbul', 'ankara', 'izmir',
  'tehran', 'baghdad',
  // Europe
  'london', 'manchester', 'birmingham', 'leeds', 'glasgow', 'edinburgh', 'bristol',
  'liverpool', 'dublin', 'paris', 'lyon', 'marseille', 'toulouse', 'nice', 'lille',
  'berlin', 'munich', 'frankfurt', 'hamburg', 'stuttgart', 'cologne', 'dusseldorf',
  'dortmund', 'leipzig', 'dresden', 'nuremberg', 'hannover', 'bremen',
  'amsterdam', 'rotterdam', 'utrecht', 'eindhoven', 'brussels', 'antwerp', 'ghent',
  'zurich', 'geneva', 'basel', 'bern', 'lausanne', 'vienna', 'graz',
  'milan', 'rome', 'turin', 'naples', 'bologna', 'florence', 'venice', 'genoa',
  'madrid', 'barcelona', 'valencia', 'seville', 'bilbao', 'malaga', 'lisbon', 'porto',
  'prague', 'warsaw', 'krakow', 'wroclaw', 'gdansk', 'budapest', 'bucharest', 'sofia',
  'athens', 'thessaloniki', 'stockholm', 'gothenburg', 'oslo', 'copenhagen', 'helsinki',
  'moscow', 'kazan', 'novosibirsk', 'yekaterinburg', 'minsk', 'kyiv', 'kiev',
  // Americas
  'chicago', 'houston', 'phoenix', 'philadelphia', 'dallas', 'austin', 'seattle',
  'boston', 'atlanta', 'miami', 'denver', 'detroit', 'minneapolis', 'portland',
  'orlando', 'tampa', 'charlotte', 'raleigh', 'nashville', 'pittsburgh', 'cleveland',
  'cincinnati', 'columbus', 'indianapolis', 'milwaukee', 'sacramento', 'oakland',
  'irvine', 'fremont', 'cupertino', 'sunnyvale', 'palo', 'mountain', 'redmond',
  'bellevue', 'plano', 'scottsdale', 'baltimore', 'richmond', 'newark', 'brooklyn',
  'manhattan', 'queens', 'toronto', 'vancouver', 'montreal', 'calgary', 'ottawa',
  'edmonton', 'winnipeg', 'mississauga', 'markham', 'guadalajara', 'monterrey',
  'bogota', 'medellin', 'lima', 'santiago', 'caracas', 'quito', 'montevideo',
];

// Multi-word cities matched as whole phrases so generic words like "new" or "san" aren't stripped alone
const BUILTIN_MULTI_WORD_CITIES: string[] = [
  'hong kong',
  'new york',
  'los angeles',
  'san francisco',
  'san jose',
  'san diego',
  'san antonio',
  'las vegas',
  'salt lake city',
  'kansas city',
  'oklahoma city',
  'mexico city',
  'new delhi',
  'abu dhabi',
  'kuala lumpur',
  'ho chi minh',
  'sao paulo',
  'rio de janeiro',
  'buenos aires',
  'cape town',
  'tel aviv',
  'st petersburg',
  'saint petersburg',
  'the hague',
  'santa clara',
  'mountain view',
  'palo alto',
  'new jersey',
  'new orleans',
  'st louis',
  'saint louis',
  'fort worth',
  'el paso',
  'baton rouge',
  'costa mesa',
  'boca raton',
  'ann arbor',
  'grand rapids',
  'little rock',
  'des moines',
  'sioux falls',
];

const BUILTIN_SINGLE_CITY_SET = new Set<string>(BUILTIN_SINGLE_CITIES);
const GENERIC_CITY_PREFIXES = new Set<string>([
  'new', 'san', 'los', 'las', 'st', 'saint', 'santa', 'el', 'la', 'le', 'de',
  'the', 'fort', 'port', 'mount', 'north', 'south', 'east', 'west', 'old', 'grand',
]);

// Ultra-common glue words that shouldn't inflate overlap on their own
const TINY_CONNECTOR_WORDS = new Set<string>(['of', 'in', 'to', 'at', 'by', 'on', 'or', 'an', 'as']);

const dedupeWordsCaseInsensitive = (words: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const w of words) {
    const trimmed = String(w || '').trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(trimmed);
    }
  }
  return result;
};

export const loadMatchEngineConfig = (): MatchEngineConfig => {
  try {
    const rawV3 = typeof localStorage !== 'undefined' ? localStorage.getItem(MATCH_ENGINE_STORAGE_KEY) : null;
    if (rawV3) {
      const parsed = JSON.parse(rawV3);
      const ignoredWords = Array.isArray(parsed.ignoredWords)
        ? dedupeWordsCaseInsensitive(parsed.ignoredWords)
        : [...DEFAULT_IGNORED_WORDS];
      const threshold =
        typeof parsed.potentialMatchThreshold === 'number' &&
        parsed.potentialMatchThreshold >= 1 &&
        parsed.potentialMatchThreshold <= 99
          ? Math.round(parsed.potentialMatchThreshold)
          : 51;
      return {
        potentialMatchEnabled:
          typeof parsed.potentialMatchEnabled === 'boolean' ? parsed.potentialMatchEnabled : false,
        potentialMatchThreshold: threshold,
        ignoreCityNames:
          typeof parsed.ignoreCityNames === 'boolean' ? parsed.ignoreCityNames : true,
        ignoredWords,
      };
    }

    // One-time migration from v2/v1: preserve threshold/ignored words, default Match Rules to OFF (Standard Mode)
    const rawPrev =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(PREV_MATCH_ENGINE_STORAGE_KEY_V2) ||
          localStorage.getItem(LEGACY_MATCH_ENGINE_STORAGE_KEY)
        : null;
    if (rawPrev) {
      const parsed = JSON.parse(rawPrev);
      const existing = Array.isArray(parsed.ignoredWords) ? parsed.ignoredWords : [];
      const mergedWords = dedupeWordsCaseInsensitive([...existing, ...DEFAULT_IGNORED_WORDS]);
      const threshold =
        typeof parsed.potentialMatchThreshold === 'number' &&
        parsed.potentialMatchThreshold >= 1 &&
        parsed.potentialMatchThreshold <= 99
          ? Math.round(parsed.potentialMatchThreshold)
          : 51;
      const migrated: MatchEngineConfig = {
        potentialMatchEnabled: false,
        potentialMatchThreshold: threshold,
        ignoreCityNames:
          typeof parsed.ignoreCityNames === 'boolean' ? parsed.ignoreCityNames : true,
        ignoredWords: mergedWords,
      };
      try {
        localStorage.setItem(MATCH_ENGINE_STORAGE_KEY, JSON.stringify(migrated));
      } catch {
        // ignore quota errors
      }
      return migrated;
    }

    return { ...DEFAULT_MATCH_ENGINE_CONFIG, ignoredWords: [...DEFAULT_IGNORED_WORDS] };
  } catch {
    return { ...DEFAULT_MATCH_ENGINE_CONFIG, ignoredWords: [...DEFAULT_IGNORED_WORDS] };
  }
};

export const saveMatchEngineConfig = (config: MatchEngineConfig): void => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MATCH_ENGINE_STORAGE_KEY, JSON.stringify(config));
    }
  } catch {
    // ignore storage quota errors
  }
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(MATCH_ENGINE_UPDATED_EVENT, { detail: config }));
    }
  } catch {
    // ignore event errors
  }
};

export interface CompiledIgnoreLookup {
  ignoredSingleWords: Set<string>;
  ignoredPhrases: string[];
  ignoredPhraseRegex: RegExp | null;
  citySingleWords: Set<string>;
  cityPhrases: string[];
  cityPhraseRegex: RegExp | null;
  ignoreCityNames: boolean;
  potentialMatchEnabled: boolean;
  potentialMatchThreshold: number;
}

const normalizePhrase = (str: string): string =>
  str
    .toLowerCase()
    // Keep internal apostrophes attached (e.g., O'Reilly -> oreilly, D'Souza -> dsouza)
    .replace(/([a-z0-9])['’]([a-z0-9])/g, '$1$2')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildPhraseRegex = (phrases: string[]): RegExp | null => {
  if (phrases.length === 0) return null;
  const sorted = [...phrases].sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(?:${sorted.map(escapeRegex).join('|')})\\b`, 'g');
};

export const compileIgnoreLookup = (
  config: MatchEngineConfig,
  datasetCities: string[] = []
): CompiledIgnoreLookup => {
  const ignoredSingleWords = new Set<string>();
  const ignoredPhraseSet = new Set<string>();

  for (const rawWord of config.ignoredWords) {
    const norm = normalizePhrase(rawWord);
    if (!norm) continue;
    if (norm.includes(' ')) {
      ignoredPhraseSet.add(norm);
    } else {
      ignoredSingleWords.add(norm);
    }
  }

  const citySingleWords = new Set<string>();
  const cityPhraseSet = new Set<string>();

  if (config.ignoreCityNames) {
    BUILTIN_SINGLE_CITY_SET.forEach(c => citySingleWords.add(c));
    BUILTIN_MULTI_WORD_CITIES.forEach(p => cityPhraseSet.add(p));

    for (const rawCity of datasetCities) {
      const norm = normalizePhrase(rawCity);
      if (!norm || norm.length < 3) continue;
      if (norm.includes(' ')) {
        cityPhraseSet.add(norm);
      } else if (!GENERIC_CITY_PREFIXES.has(norm) && !/^\d+$/.test(norm)) {
        citySingleWords.add(norm);
      }
    }
  }

  const ignoredPhrases = Array.from(ignoredPhraseSet).sort((a, b) => b.length - a.length);
  const cityPhrases = Array.from(cityPhraseSet).sort((a, b) => b.length - a.length);

  return {
    ignoredSingleWords,
    ignoredPhrases,
    ignoredPhraseRegex: buildPhraseRegex(ignoredPhrases),
    citySingleWords,
    cityPhrases,
    cityPhraseRegex: buildPhraseRegex(cityPhrases),
    ignoreCityNames: config.ignoreCityNames,
    potentialMatchEnabled: config.potentialMatchEnabled,
    potentialMatchThreshold: config.potentialMatchThreshold,
  };
};

interface SignificantToken {
  clean: string;
  display: string;
}

const extractSignificantTokens = (
  rawName: string,
  lookup: CompiledIgnoreLookup,
  extraCityNorm?: string
): SignificantToken[] => {
  const rawTrimmed = (rawName || '').trim();
  if (!rawTrimmed) return [];

  // Preserve hyphen/dot/slash single-char prefixes glued to non-ignored words (e.g., T-Mobile -> tmobile, E-Trade -> etrade)
  const preprocessed = rawTrimmed.replace(
    /\b([a-zA-Z0-9])[-./]([a-zA-Z0-9]{2,})\b/g,
    (fullMatch, prefix: string, rest: string) => {
      const restLower = rest.toLowerCase();
      if (
        lookup.ignoredSingleWords.has(restLower) ||
        (lookup.ignoreCityNames && lookup.citySingleWords.has(restLower))
      ) {
        return `${prefix} ${rest}`;
      }
      return `${prefix}${rest}`;
    }
  );

  // Map clean tokens to their first-seen display casing
  const displayMap = new Map<string, string>();
  const rawParts = preprocessed
    .replace(/([a-zA-Z0-9])['’]([a-zA-Z0-9])/g, '$1$2')
    .split(/[\s,.;:!?/\\|()[\]{}"'+=_~`@#$%^&*<>-]+/);
  for (let i = 0; i < rawParts.length; i++) {
    const part = rawParts[i];
    if (!part) continue;
    const clean = part.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (clean && !displayMap.has(clean)) {
      displayMap.set(clean, part);
    }
  }

  let norm = normalizePhrase(preprocessed);

  // Strip custom multi-word ignored phrases in one pass
  if (lookup.ignoredPhraseRegex) {
    norm = norm.replace(lookup.ignoredPhraseRegex, ' ');
  }

  // Strip multi-word cities (case-specific city + built-in/dataset phrases)
  let caseCitySingle = '';
  if (lookup.ignoreCityNames) {
    if (extraCityNorm && extraCityNorm.length >= 3) {
      if (extraCityNorm.includes(' ')) {
        const needle = ` ${extraCityNorm} `;
        const padded = ` ${norm} `;
        if (padded.includes(needle)) {
          norm = padded.split(needle).join(' ');
        }
      } else if (!GENERIC_CITY_PREFIXES.has(extraCityNorm) && !/^\d+$/.test(extraCityNorm)) {
        caseCitySingle = extraCityNorm;
      }
    }
    if (lookup.cityPhraseRegex) {
      norm = norm.replace(lookup.cityPhraseRegex, ' ');
    }
  }

  norm = norm.trim();
  if (!norm) return [];

  // Merge consecutive single-character alphanumeric runs so space/punctuation-separated
  // acronyms & initials match their compact forms:
  // e.g. "R t" -> "rt", "S.M.Y" -> "smy", "S. M. Y." -> "smy", "R-T" -> "rt", "A&B" -> "ab"
  const rawTokens = norm.split(/\s+/);
  const mergedTokens: { clean: string; display: string }[] = [];
  let idx = 0;
  while (idx < rawTokens.length) {
    const tok = rawTokens[idx];
    if (tok.length === 1) {
      let end = idx + 1;
      while (end < rawTokens.length && rawTokens[end].length === 1) {
        end++;
      }
      if (end - idx >= 2) {
        const combined = rawTokens.slice(idx, end).join('');
        mergedTokens.push({
          clean: combined,
          display: combined.toUpperCase(),
        });
      }
      // Single isolated 1-char token (e.g. stray middle initial) is skipped
      idx = end;
    } else {
      mergedTokens.push({
        clean: tok,
        display: displayMap.get(tok) || tok.toUpperCase(),
      });
      idx++;
    }
  }

  const seen = new Set<string>();
  const result: SignificantToken[] = [];

  for (let i = 0; i < mergedTokens.length; i++) {
    const { clean: token, display } = mergedTokens[i];
    if (!token || token.length < 2) continue;
    if (TINY_CONNECTOR_WORDS.has(token)) continue;
    if (lookup.ignoredSingleWords.has(token)) continue;
    if (lookup.ignoreCityNames) {
      if (token === caseCitySingle || lookup.citySingleWords.has(token)) continue;
    }
    if (!seen.has(token)) {
      seen.add(token);
      result.push({
        clean: token,
        display,
      });
    }
  }

  return result;
};

const tokenMatchScore = (a: string, b: string): number => {
  if (a === b) return 1;
  if (a.length >= 4 && b.length >= 4) {
    const minLen = Math.min(a.length, b.length);
    const maxLen = Math.max(a.length, b.length);
    if (a.startsWith(b) || b.startsWith(a)) {
      // Strong stem match (>=75% length overlap) gets full token credit;
      // shorter 4+ char prefix overlap (e.g. "Aero" in "AeroTech") gets proportional partial credit (<50%)
      return minLen / maxLen >= 0.75 ? 1 : minLen / maxLen;
    }
    if (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5) && maxLen - minLen <= 2) {
      return 1;
    }
  }
  return 0;
};

const evaluateTokensAgainstRpl = (
  cRaw: string,
  normExactC: string,
  custTokens: SignificantToken[],
  custTokenCleanList: string[],
  custCompact: string,
  rplName: string,
  lookup: CompiledIgnoreLookup,
  extraCityNorm?: string
): RplMatchEvaluation => {
  const rRaw = (rplName || '').trim();
  if (!cRaw || !rRaw) {
    return {
      isExact: false,
      matchPercent: 0,
      isPotentialMatch: false,
      matchedKeywords: [],
      customerSignificantTokens: custTokenCleanList,
      rplSignificantTokens: [],
    };
  }

  const normExactR = rRaw.toLowerCase().replace(/\s+/g, ' ');
  const isExact = normExactC.length > 0 && normExactC === normExactR;

  const rplTokens = extractSignificantTokens(rRaw, lookup, extraCityNorm);
  const rplTokenCleanList = rplTokens.map(t => t.clean);

  if (isExact) {
    return {
      isExact: true,
      matchPercent: 100,
      isPotentialMatch: false,
      matchedKeywords: custTokens.length > 0 ? custTokens.map(t => t.display) : [cRaw],
      customerSignificantTokens: custTokenCleanList,
      rplSignificantTokens: rplTokenCleanList,
    };
  }

  if (custTokens.length === 0 || rplTokens.length === 0) {
    return {
      isExact: false,
      matchPercent: 0,
      isPotentialMatch: false,
      matchedKeywords: [],
      customerSignificantTokens: custTokenCleanList,
      rplSignificantTokens: rplTokenCleanList,
    };
  }

  // Space & special-character collapsed full match check on significant tokens
  // e.g., "Hua Yu" vs "Huayu", "R t" vs "RT", "S.M.Y" vs "SMY", "Blue-Sky" vs "BlueSky"
  const rplCompact = rplTokenCleanList.join('');
  if (custCompact.length >= 2 && custCompact === rplCompact) {
    const matchPercent = 100;
    const isPotentialMatch =
      lookup.potentialMatchEnabled && matchPercent > lookup.potentialMatchThreshold;
    return {
      isExact: false,
      matchPercent,
      isPotentialMatch,
      matchedKeywords: custTokens.map(t => t.display),
      customerSignificantTokens: custTokenCleanList,
      rplSignificantTokens: rplTokenCleanList,
    };
  }

  const matchedKeywords: string[] = [];
  const seenKeywordLower = new Set<string>();
  const matchedCustWeights = new Map<number, number>();
  const matchedRplWeights = new Map<number, number>();

  const setMaxWeight = (map: Map<number, number>, idx: number, weight: number) => {
    const prev = map.get(idx) ?? 0;
    if (weight > prev) map.set(idx, weight);
  };

  const pushKeyword = (kw: string) => {
    const lower = kw.toLowerCase();
    if (!seenKeywordLower.has(lower)) {
      seenKeywordLower.add(lower);
      matchedKeywords.push(kw);
    }
  };

  // Pass 1: Direct, stem & partial prefix token matches
  for (let i = 0; i < custTokens.length; i++) {
    const ct = custTokens[i];
    let bestScore = 0;
    let bestDisplay = ct.display;
    for (let j = 0; j < rplTokens.length; j++) {
      const score = tokenMatchScore(ct.clean, rplTokens[j].clean);
      if (score > 0) {
        setMaxWeight(matchedRplWeights, j, score);
        if (score > bestScore) {
          bestScore = score;
          // For partial prefix matches, show the shorter common matching name piece
          bestDisplay =
            score < 1 && rplTokens[j].clean.length < ct.clean.length
              ? rplTokens[j].display
              : ct.display;
        }
      }
    }
    if (bestScore > 0) {
      setMaxWeight(matchedCustWeights, i, bestScore);
      pushKeyword(bestDisplay);
    }
  }

  // Pass 2: Adjacent 2-token fusion matches (handles space/punctuation split words
  // when additional words are also present, e.g., "Hua Yu Holdings" vs "Huayu Trading")
  for (let i = 0; i < custTokens.length - 1; i++) {
    if ((matchedCustWeights.get(i) ?? 0) >= 1 && (matchedCustWeights.get(i + 1) ?? 0) >= 1) continue;
    const fusedCust = custTokens[i].clean + custTokens[i + 1].clean;
    for (let j = 0; j < rplTokens.length; j++) {
      const score = tokenMatchScore(fusedCust, rplTokens[j].clean);
      if (score >= 1) {
        setMaxWeight(matchedCustWeights, i, 1);
        setMaxWeight(matchedCustWeights, i + 1, 1);
        setMaxWeight(matchedRplWeights, j, 1);
        pushKeyword(`${custTokens[i].display} ${custTokens[i + 1].display}`);
      }
    }
  }

  for (let j = 0; j < rplTokens.length - 1; j++) {
    if ((matchedRplWeights.get(j) ?? 0) >= 1 && (matchedRplWeights.get(j + 1) ?? 0) >= 1) continue;
    const fusedRpl = rplTokens[j].clean + rplTokens[j + 1].clean;
    for (let i = 0; i < custTokens.length; i++) {
      const score = tokenMatchScore(custTokens[i].clean, fusedRpl);
      if (score >= 1) {
        setMaxWeight(matchedCustWeights, i, 1);
        setMaxWeight(matchedRplWeights, j, 1);
        setMaxWeight(matchedRplWeights, j + 1, 1);
        pushKeyword(custTokens[i].display);
      }
    }
  }

  if (matchedCustWeights.size === 0) {
    return {
      isExact: false,
      matchPercent: 0,
      isPotentialMatch: false,
      matchedKeywords: [],
      customerSignificantTokens: custTokenCleanList,
      rplSignificantTokens: rplTokenCleanList,
    };
  }

  let custWeightSum = 0;
  matchedCustWeights.forEach(w => {
    custWeightSum += w;
  });
  let rplWeightSum = 0;
  matchedRplWeights.forEach(w => {
    rplWeightSum += w;
  });

  // Weighted Dice similarity across significant tokens (always >= 1% when a keyword matched)
  const rawPct = Math.round(
    ((custWeightSum + rplWeightSum) / (custTokens.length + rplTokens.length)) * 100
  );
  const matchPercent = Math.min(100, Math.max(1, rawPct));

  const isPotentialMatch =
    lookup.potentialMatchEnabled &&
    matchPercent > lookup.potentialMatchThreshold;

  return {
    isExact: false,
    matchPercent,
    isPotentialMatch,
    matchedKeywords,
    customerSignificantTokens: custTokenCleanList,
    rplSignificantTokens: rplTokenCleanList,
  };
};

export const evaluateRplMatch = (
  customerName: string,
  rplName: string,
  lookup: CompiledIgnoreLookup,
  customerCity?: string
): RplMatchEvaluation => {
  const cRaw = (customerName || '').trim();
  const extraCityNorm = customerCity ? normalizePhrase(customerCity) : undefined;
  const custTokens = extractSignificantTokens(cRaw, lookup, extraCityNorm);
  const custTokenCleanList = custTokens.map(t => t.clean);
  const custCompact = custTokenCleanList.join('');
  const normExactC = cRaw.toLowerCase().replace(/\s+/g, ' ');
  return evaluateTokensAgainstRpl(
    cRaw,
    normExactC,
    custTokens,
    custTokenCleanList,
    custCompact,
    rplName,
    lookup,
    extraCityNorm
  );
};

export interface CompiledRiskAprvMatcher {
  riskRegex: RegExp | null;
  aprvCodeSet: Set<string>;
  aprvCountryNameRegex: RegExp | null;
}

const ALERT_STATUS_RISK_REGEX = /(?:^|[^A-Z0-9])(?:ZKWD|ZEMB|EMBF|EMBN)(?:[^A-Z0-9]|$)/i;
const APRV_STATUS_REGEX = /(?:^|[^A-Z0-9])APRV(?:[^A-Z0-9]|$)/i;

export const compileRiskAndAprvMatcher = (
  highRiskKeywords: string[] = DEFAULT_HIGH_RISK_KEYWORDS,
  aprvCodes: string[] = DEFAULT_APRV_COUNTRY_CODES
): CompiledRiskAprvMatcher => {
  const cleanedKeywords = highRiskKeywords
    .map(k => String(k || '').trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  const riskRegex =
    cleanedKeywords.length > 0
      ? new RegExp(
          `(?:^|[^a-z0-9])(?:${cleanedKeywords
            .map(k => escapeRegex(k).replace(/\s+/g, '[\\s-_]+'))
            .join('|')})(?:[^a-z0-9]|$)`,
          'i'
        )
      : null;

  const aprvCodeSet = new Set<string>();
  const countryNames = new Set<string>();
  for (const rawCode of aprvCodes) {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) continue;
    aprvCodeSet.add(code);
    const aliases = APRV_COUNTRY_NAME_BY_CODE[code];
    if (aliases) {
      for (const alias of aliases) countryNames.add(alias);
    }
  }

  const nameList = Array.from(countryNames).sort((a, b) => b.length - a.length);
  const aprvCountryNameRegex =
    nameList.length > 0
      ? new RegExp(`(?:^|[^a-z0-9])(?:${nameList.map(escapeRegex).join('|')})(?:[^a-z0-9]|$)`, 'i')
      : null;

  return { riskRegex, aprvCodeSet, aprvCountryNameRegex };
};

export const checkCaseRiskAndAprv = (
  customerName: string,
  country: string | undefined,
  status: string | undefined,
  rplEntries: { rowIndex: number; rplName: string }[],
  matcher?: CompiledRiskAprvMatcher
): { hasRiskKeyword: boolean; hasAprvCountry: boolean } => {
  const activeMatcher = matcher || compileRiskAndAprvMatcher();

  let hasRiskKeyword = false;
  if (
    (status && ALERT_STATUS_RISK_REGEX.test(status)) ||
    (customerName && ALERT_STATUS_RISK_REGEX.test(customerName))
  ) {
    hasRiskKeyword = true;
  } else if (activeMatcher.riskRegex) {
    if (
      (customerName && activeMatcher.riskRegex.test(customerName)) ||
      (status && activeMatcher.riskRegex.test(status))
    ) {
      hasRiskKeyword = true;
    } else {
      for (let i = 0; i < rplEntries.length; i++) {
        const rn = rplEntries[i].rplName;
        if (rn && activeMatcher.riskRegex.test(rn)) {
          hasRiskKeyword = true;
          break;
        }
      }
    }
  }

  let hasAprvCountry = false;
  if (
    (status && APRV_STATUS_REGEX.test(status)) ||
    (customerName && APRV_STATUS_REGEX.test(customerName))
  ) {
    hasAprvCountry = true;
  } else if (country) {
    const rawCountry = country.trim();
    if (rawCountry) {
      const upper = rawCountry.toUpperCase();
      if (activeMatcher.aprvCodeSet.has(upper)) {
        hasAprvCountry = true;
      } else {
        const tokens = upper.split(/[^A-Z0-9]+/).filter(Boolean);
        for (let i = 0; i < tokens.length; i++) {
          if (activeMatcher.aprvCodeSet.has(tokens[i])) {
            hasAprvCountry = true;
            break;
          }
        }
      }
      if (!hasAprvCountry && activeMatcher.aprvCountryNameRegex) {
        if (activeMatcher.aprvCountryNameRegex.test(rawCountry)) {
          hasAprvCountry = true;
        }
      }
    }
  }

  return { hasRiskKeyword, hasAprvCountry };
};

export const evaluateCaseMatches = (
  customerName: string,
  customerCity: string | undefined,
  rplEntries: { rowIndex: number; rplName: string }[],
  lookup: CompiledIgnoreLookup,
  options?: {
    country?: string;
    status?: string;
    riskAprvMatcher?: CompiledRiskAprvMatcher;
  }
): CaseMatchSummary => {
  const rplResultsByRow = new Map<number, RplMatchEvaluation>();
  let hasExactMatch = false;
  let hasPotentialMatch = false;
  let maxMatchPercent = 0;
  let potentialMatchCount = 0;
  let exactMatchCount = 0;

  const matchedKeywords: string[] = [];
  const seenKeywords = new Set<string>();

  const cRaw = (customerName || '').trim();
  const normExactC = cRaw.toLowerCase().replace(/\s+/g, ' ');
  const extraCityNorm = customerCity ? normalizePhrase(customerCity) : undefined;
  const custTokens = extractSignificantTokens(cRaw, lookup, extraCityNorm);
  const custTokenCleanList = custTokens.map(t => t.clean);
  const custCompact = custTokenCleanList.join('');

  for (let i = 0; i < rplEntries.length; i++) {
    const entry = rplEntries[i];
    const evalRes = evaluateTokensAgainstRpl(
      cRaw,
      normExactC,
      custTokens,
      custTokenCleanList,
      custCompact,
      entry.rplName,
      lookup,
      extraCityNorm
    );
    rplResultsByRow.set(entry.rowIndex, evalRes);

    if (evalRes.isExact) {
      hasExactMatch = true;
      exactMatchCount++;
    }
    if (evalRes.isPotentialMatch) {
      hasPotentialMatch = true;
      potentialMatchCount++;
    }
    if (evalRes.matchPercent > maxMatchPercent) {
      maxMatchPercent = evalRes.matchPercent;
    }

    for (let k = 0; k < evalRes.matchedKeywords.length; k++) {
      const kw = evalRes.matchedKeywords[k];
      const lower = kw.toLowerCase();
      if (!seenKeywords.has(lower)) {
        seenKeywords.add(lower);
        matchedKeywords.push(kw);
      }
    }
  }

  const { hasRiskKeyword, hasAprvCountry } = checkCaseRiskAndAprv(
    cRaw,
    options?.country,
    options?.status,
    rplEntries,
    options?.riskAprvMatcher
  );

  // Strict No Match: zero RPL<->Customer match (with Ignored Words exempted),
  // AND must NOT contain any Risk Keywords or APRV Country Codes.
  const isNoMatch =
    !hasExactMatch &&
    !hasPotentialMatch &&
    matchedKeywords.length === 0 &&
    maxMatchPercent === 0 &&
    !hasRiskKeyword &&
    !hasAprvCountry;

  // Others: everything other than No Match and Potential Match
  const isOther = !isNoMatch && !hasPotentialMatch;

  return {
    hasExactMatch,
    hasPotentialMatch,
    isNoMatch,
    isOther,
    hasRiskKeyword,
    hasAprvCountry,
    maxMatchPercent,
    potentialMatchCount,
    exactMatchCount,
    matchedKeywords,
    matchedKeywordsText: hasExactMatch ? 'Exact match' : matchedKeywords.join(', '),
    rplResultsByRow,
  };
};
