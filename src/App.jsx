import { useState, useEffect } from 'react';
import {
  Shield, Zap, RefreshCw, Loader2, AlertCircle, Info,
  Crown, ListChecks, BarChart3, Check, X, Trash2, Plus,
  TrendingUp, TrendingDown, Clock, Sparkles, Layers, Coins,
  Key, ExternalLink, Settings
} from 'lucide-react';

// Storage compatibility: use Claude's window.storage if available,
// otherwise fall back to browser localStorage (for deployment outside Claude).
if (typeof window !== 'undefined' && !window.storage) {
  window.storage = {
    get: async (key) => {
      try {
        const v = localStorage.getItem(key);
        return v !== null ? { key, value: v, shared: false } : null;
      } catch { return null; }
    },
    set: async (key, value) => {
      try {
        localStorage.setItem(key, value);
        return { key, value, shared: false };
      } catch { return null; }
    },
    delete: async (key) => {
      try {
        localStorage.removeItem(key);
        return { key, deleted: true, shared: false };
      } catch { return null; }
    },
    list: async (prefix = '') => {
      try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(prefix)) keys.push(k);
        }
        return { keys, prefix, shared: false };
      } catch { return { keys: [], prefix, shared: false }; }
    }
  };
}

// ---------- Constants ----------

const SPORTS = {
  football: { label: 'Foot', emoji: '⚽', apiHost: 'v3.football.api-sports.io' },
  basketball: { label: 'Basket', emoji: '🏀', apiHost: 'v1.basketball.api-sports.io' },
  hockey: { label: 'Hockey', emoji: '🏒', apiHost: 'v1.hockey.api-sports.io' },
  rugby: { label: 'Rugby', emoji: '🏉', apiHost: 'v1.rugby.api-sports.io' },
  handball: { label: 'Hand', emoji: '🤾', apiHost: 'v1.handball.api-sports.io' },
};

const CURRENCIES = {
  XOF: { symbol: 'FCFA', label: 'FCFA', name: 'Franc CFA (BCEAO)', defaultStake: 5000, decimals: 0, position: 'after', locale: 'fr-FR' },
  XAF: { symbol: 'FCFA', label: 'FCFA BEAC', name: 'Franc CFA (BEAC)', defaultStake: 5000, decimals: 0, position: 'after', locale: 'fr-FR' },
  EUR: { symbol: '€', label: 'EUR', name: 'Euro', defaultStake: 10, decimals: 2, position: 'after', locale: 'fr-FR' },
  USD: { symbol: '$', label: 'USD', name: 'Dollar US', defaultStake: 10, decimals: 2, position: 'before', locale: 'en-US' },
  GBP: { symbol: '£', label: 'GBP', name: 'Livre sterling', defaultStake: 10, decimals: 2, position: 'before', locale: 'en-GB' },
  CHF: { symbol: 'CHF', label: 'CHF', name: 'Franc suisse', defaultStake: 10, decimals: 2, position: 'after', locale: 'fr-CH' },
  MAD: { symbol: 'DH', label: 'MAD', name: 'Dirham marocain', defaultStake: 100, decimals: 2, position: 'after', locale: 'fr-MA' },
  DZD: { symbol: 'DA', label: 'DZD', name: 'Dinar algérien', defaultStake: 1000, decimals: 0, position: 'after', locale: 'fr-FR' },
  TND: { symbol: 'DT', label: 'TND', name: 'Dinar tunisien', defaultStake: 20, decimals: 2, position: 'after', locale: 'fr-FR' },
  CAD: { symbol: 'C$', label: 'CAD', name: 'Dollar canadien', defaultStake: 10, decimals: 2, position: 'before', locale: 'fr-CA' },
};

const BETS_KEY = 'bets:all';
const CURRENCY_KEY = 'settings:currency';
const APIKEY_KEY = 'settings:apikey';
const PROXY_KEY = 'settings:useProxy';

// Public free CORS proxy — needed because api-sports.io direct calls are blocked
// by browsers due to missing CORS headers on their servers.
const CORS_PROXY = 'https://corsproxy.io/?url=';

// Preferred bookmakers in priority order
const PREFERRED_BOOKMAKERS = ['Bet365', 'Pinnacle', 'Bwin', '1xBet', 'Betfair', 'William Hill', 'Betway', 'Marathonbet'];

// Priority football league IDs (API-Football) — these appear first in results
const FOOTBALL_PRIORITY_LEAGUES = new Set([
  2,    // UEFA Champions League
  3,    // UEFA Europa League
  848,  // UEFA Europa Conference League
  39,   // Premier League (Angleterre)
  40,   // Championship (Angleterre)
  78,   // Bundesliga (Allemagne)
  140,  // La Liga (Espagne)
  94,   // Primeira Liga (Portugal)
  88,   // Eredivisie (Pays-Bas)
  203,  // Süper Lig (Turquie)
  135,  // Serie A (Italie)
  61,   // Ligue 1 (France)
  62,   // Ligue 2 (France)
]);

function isPriorityLeague(fixture, sport) {
  const name = (fixture.league?.name || '').toLowerCase();
  if (sport === 'football') {
    const leagueId = fixture.league?.id;
    if (leagueId && FOOTBALL_PRIORITY_LEAGUES.has(leagueId)) return true;
    if (/champions league|europa league|conference league|premier league|la liga|primera divisi|serie a|bundesliga|ligue 1|eredivisie|primeira liga|liga portugal|süper lig|super lig turk/i.test(name)) return true;
    return false;
  }
  if (sport === 'rugby') {
    if (/top 14|premiership|urc|united rugby|six nations|rugby world cup|champions cup|challenge cup|super rugby|currie cup|pro d2/i.test(name)) return true;
    return false;
  }
  if (sport === 'handball') {
    if (/champions league|ehf|bundesliga|hbl|liqui moly|lnh|starligue|liga asobal|ligue européenne/i.test(name)) return true;
    return false;
  }
  return false;
}

// ---------- Helpers ----------

function buildDays() {
  return [0, 1, 2].map(offset => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const key = d.toISOString().split('T')[0];
    const label = offset === 0 ? "Aujourd'hui" : offset === 1 ? 'Demain' : 'Après-demain';
    const short = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    const full = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return { offset, key, label, short, full };
  });
}

function impliedProb(odds) {
  if (!odds || odds <= 0) return 0;
  return Math.round((1 / odds) * 100);
}

function probClass(p) {
  if (p >= 60) return 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60';
  if (p >= 35) return 'bg-amber-950/60 text-amber-300 border-amber-800/60';
  return 'bg-rose-950/60 text-rose-300 border-rose-800/60';
}

function formatAmount(value, cur) {
  const num = Number(value) || 0;
  const formatted = new Intl.NumberFormat(cur.locale, {
    minimumFractionDigits: cur.decimals,
    maximumFractionDigits: cur.decimals,
  }).format(num);
  return cur.position === 'before' ? `${cur.symbol}${formatted}` : `${formatted} ${cur.symbol}`;
}

function isPickInPast(pick, dayKey) {
  const today = new Date().toISOString().split('T')[0];
  if (dayKey !== today) return false;
  if (!pick?.time || !/^\d{1,2}:\d{2}$/.test(pick.time)) return false;
  const [h, m] = pick.time.split(':').map(Number);
  const now = new Date();
  return h * 60 + m <= now.getHours() * 60 + now.getMinutes();
}

// Format timestamp (Unix seconds) as local HH:MM
function formatLocalTime(timestamp) {
  const d = new Date(timestamp * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---------- API layer ----------

async function apiCall(sport, path, apiKey, useProxy) {
  const host = SPORTS[sport].apiHost;
  const directUrl = `https://${host}${path}`;
  const url = useProxy ? `${CORS_PROXY}${encodeURIComponent(directUrl)}` : directUrl;
  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': host,
      },
    });
  } catch (netErr) {
    throw new Error(`Erreur réseau/CORS pour ${sport} (${netErr.message || 'fetch failed'})`);
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Clé API invalide ou non autorisée pour ${sport}`);
    }
    if (res.status === 429) {
      throw new Error(`Quota journalier dépassé pour ${sport}`);
    }
    throw new Error(`API ${sport}: erreur ${res.status}`);
  }
  const data = await res.json();
  if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
    const msg = typeof data.errors[0] === 'string'
      ? data.errors[0]
      : Object.values(data.errors[0])[0] || 'erreur inconnue';
    throw new Error(`API ${sport}: ${msg}`);
  }
  if (data.errors && !Array.isArray(data.errors) && Object.keys(data.errors).length > 0) {
    const msg = Object.values(data.errors)[0];
    throw new Error(`API ${sport}: ${msg}`);
  }
  return data;
}

// Extract picks from a fixture + its odds data
function extractPicksFromFixture(fixture, oddsForFixture, sport, id, todayKey) {
  const picks = [];

  // Match info
  let match, league, time, sportKey, fixtureId, status;

  if (sport === 'football') {
    match = `${fixture.teams.home.name} vs ${fixture.teams.away.name}`;
    league = fixture.league.name;
    time = formatLocalTime(fixture.fixture.timestamp);
    fixtureId = fixture.fixture.id;
    status = fixture.fixture.status.short;
  } else {
    // basketball & hockey
    match = `${fixture.teams.home.name} vs ${fixture.teams.away.name}`;
    league = fixture.league.name;
    time = formatLocalTime(fixture.timestamp);
    fixtureId = fixture.id;
    status = fixture.status?.short;
  }

  // Skip if not scheduled (already started, finished, cancelled)
  const scheduledStatuses = ['NS', 'TBD', 'PST']; // Not Started, TBD, Postponed
  if (status && !scheduledStatuses.includes(status)) return picks;

  if (!oddsForFixture || !oddsForFixture.bookmakers) return picks;

  // Pick preferred bookmaker
  const bookmaker = pickPreferredBookmaker(oddsForFixture.bookmakers);
  if (!bookmaker) return picks;

  const basePick = { sport, league, time, match, fixtureId, bookmaker: bookmaker.name };

  // Extract 1X2 / Match Winner
  const winner = bookmaker.bets.find(b =>
    /match winner|home\/away|1x2|winner/i.test(b.name)
  );
  if (winner && winner.values && winner.values.length > 0) {
    // Find the favorite (lowest odd)
    const sortedByOdd = [...winner.values]
      .filter(v => v.odd && !isNaN(parseFloat(v.odd)))
      .sort((a, b) => parseFloat(a.odd) - parseFloat(b.odd));

    if (sortedByOdd.length > 0) {
      const fav = sortedByOdd[0];
      const favOdds = parseFloat(fav.odd);
      const pickLabel = mapWinnerValueToLabel(fav.value, fixture, sport);
      picks.push({
        ...basePick,
        id: `${id}_w`,
        betType: sport === 'football' ? '1X2' : 'Vainqueur',
        pick: pickLabel,
        odds: favOdds,
        analysis: buildAnalysis(sortedByOdd, sport, 'winner'),
      });

      // If odds are close (competitive), also propose the second option as fun pick
      if (sortedByOdd.length > 1) {
        const alt = sortedByOdd[sortedByOdd.length - 1];
        const altOdds = parseFloat(alt.odd);
        if (altOdds >= 3 && altOdds <= 15) {
          picks.push({
            ...basePick,
            id: `${id}_wa`,
            betType: sport === 'football' ? '1X2' : 'Vainqueur',
            pick: mapWinnerValueToLabel(alt.value, fixture, sport),
            odds: altOdds,
            analysis: `Outsider selon ${bookmaker.name}. Cote élevée mais possible surprise.`,
          });
        }
      }
    }
  }

  // Football-specific bets: BTTS, Over/Under 2.5
  if (sport === 'football') {
    // Both Teams To Score
    const btts = bookmaker.bets.find(b => /both teams (to )?score|btts/i.test(b.name));
    if (btts && btts.values) {
      const yes = btts.values.find(v => /yes|oui/i.test(v.value));
      const no = btts.values.find(v => /no|non/i.test(v.value));
      if (yes && no) {
        const yesOdd = parseFloat(yes.odd);
        const noOdd = parseFloat(no.odd);
        const fav = yesOdd < noOdd ? { label: 'Oui', odds: yesOdd } : { label: 'Non', odds: noOdd };
        picks.push({
          ...basePick,
          id: `${id}_btts`,
          betType: 'BTTS',
          pick: `Les 2 équipes marquent : ${fav.label}`,
          odds: fav.odds,
          analysis: `Cotes BTTS via ${bookmaker.name} : Oui @${yesOdd.toFixed(2)}, Non @${noOdd.toFixed(2)}.`,
        });
      }
    }

    // Over/Under 2.5 goals
    const goalsOU = bookmaker.bets.find(b => /goals over\/under|total goals|over\/under/i.test(b.name));
    if (goalsOU && goalsOU.values) {
      const over25 = goalsOU.values.find(v => /over 2\.5/i.test(v.value));
      const under25 = goalsOU.values.find(v => /under 2\.5/i.test(v.value));
      if (over25 && under25) {
        const overOdd = parseFloat(over25.odd);
        const underOdd = parseFloat(under25.odd);
        const fav = overOdd < underOdd ? { label: 'Plus de 2.5 buts', odds: overOdd } : { label: 'Moins de 2.5 buts', odds: underOdd };
        picks.push({
          ...basePick,
          id: `${id}_ou`,
          betType: 'Over/Under',
          pick: fav.label,
          odds: fav.odds,
          analysis: `Plus/Moins 2.5 buts via ${bookmaker.name} : Over @${overOdd.toFixed(2)}, Under @${underOdd.toFixed(2)}.`,
        });
      }
    }
  }

  // Basketball/hockey: Total points/goals
  if (sport === 'basketball' || sport === 'hockey') {
    const totalBet = bookmaker.bets.find(b => /total|over\/under/i.test(b.name));
    if (totalBet && totalBet.values && totalBet.values.length >= 2) {
      const over = totalBet.values.find(v => /over/i.test(v.value));
      const under = totalBet.values.find(v => /under/i.test(v.value));
      if (over && under) {
        const overOdd = parseFloat(over.odd);
        const underOdd = parseFloat(under.odd);
        const fav = overOdd < underOdd ? { label: over.value, odds: overOdd } : { label: under.value, odds: underOdd };
        picks.push({
          ...basePick,
          id: `${id}_tot`,
          betType: 'Total',
          pick: fav.label,
          odds: fav.odds,
          analysis: `Total points via ${bookmaker.name}.`,
        });
      }
    }
  }

  return picks.filter(p => p.odds && p.odds >= 1.05 && !isNaN(p.odds));
}

function mapWinnerValueToLabel(value, fixture, sport) {
  const homeName = fixture.teams.home.name;
  const awayName = fixture.teams.away.name;
  if (/home|1/i.test(value) && !/away/i.test(value)) return `Victoire ${homeName}`;
  if (/away|2/i.test(value)) return `Victoire ${awayName}`;
  if (/draw|x|nul/i.test(value)) return 'Match nul';
  return value;
}

function buildAnalysis(sortedByOdd, sport, betCategory) {
  if (betCategory === 'winner' && sortedByOdd.length >= 2) {
    const fav = sortedByOdd[0];
    const nextOdds = sortedByOdd[1];
    const gap = parseFloat(nextOdds.odd) - parseFloat(fav.odd);
    if (gap > 2) return `Favori net selon les cotes bookmakers (écart de ${gap.toFixed(2)} avec l'option suivante).`;
    if (gap > 0.5) return `Favori selon les cotes, mais match ouvert (écart ${gap.toFixed(2)}).`;
    return `Match serré selon les cotes bookmakers, faible écart entre les options.`;
  }
  return `Cote favorable selon le marché.`;
}

function pickPreferredBookmaker(bookmakers) {
  for (const preferred of PREFERRED_BOOKMAKERS) {
    const found = bookmakers.find(b => b.name && b.name.toLowerCase().includes(preferred.toLowerCase()));
    if (found && found.bets && found.bets.length > 0) return found;
  }
  return bookmakers.find(b => b.bets && b.bets.length > 0) || null;
}

// Fetch fixtures + odds for a sport on a date
async function fetchSportData(sport, dateStr, apiKey, useProxy) {
  const path = sport === 'football' ? '/fixtures' : '/games';
  const oddsPath = '/odds';
  const [fixturesResp, oddsResp] = await Promise.all([
    apiCall(sport, `${path}?date=${dateStr}`, apiKey, useProxy),
    apiCall(sport, `${oddsPath}?date=${dateStr}`, apiKey, useProxy).catch(() => ({ response: [] })),
  ]);
  return {
    fixtures: fixturesResp.response || [],
    odds: oddsResp.response || [],
  };
}

// Turn API data into pick objects
function buildPicksFromApiData(sport, sportData, todayKey, limit = 40) {
  const { fixtures, odds } = sportData;
  const oddsByFixture = {};
  for (const o of odds) {
    const fid = sport === 'football' ? o.fixture?.id : o.game?.id;
    if (fid != null) oddsByFixture[fid] = o;
  }

  // Sort fixtures: priority leagues first
  const sortedFixtures = [...fixtures].sort((a, b) => {
    const aPri = isPriorityLeague(a, sport) ? 0 : 1;
    const bPri = isPriorityLeague(b, sport) ? 0 : 1;
    return aPri - bPri;
  });

  const prefix = { football: 'pfo', basketball: 'pbk', hockey: 'phk', rugby: 'prg', handball: 'phb' }[sport] || `p${sport[0]}`;

  const allPicks = [];
  let counter = 0;
  for (const fx of sortedFixtures) {
    const fid = sport === 'football' ? fx.fixture.id : fx.id;
    const oddsForFixture = oddsByFixture[fid];
    if (!oddsForFixture) continue;
    const picks = extractPicksFromFixture(fx, oddsForFixture, sport, `${prefix}${++counter}`, todayKey);
    if (picks.length === 0) continue;
    allPicks.push(...picks.slice(0, 2));
    if (allPicks.length >= limit) break;
  }
  return allPicks.slice(0, limit);
}

// ---------- Client-side combo builder ----------

function buildCombosForRange(picks, minOdds, maxOdds, count) {
  const usable = picks.filter(p => Number(p.odds) >= 1.2 && Number(p.odds) <= 6);
  const candidates = [];

  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      if (usable[i].match === usable[j].match) continue;
      const t = usable[i].odds * usable[j].odds;
      if (t >= minOdds && t <= maxOdds) candidates.push({ picks: [usable[i], usable[j]], totalOdds: t });
    }
  }

  const limit3 = 500;
  for (let i = 0; i < usable.length && candidates.length < limit3; i++) {
    for (let j = i + 1; j < usable.length && candidates.length < limit3; j++) {
      if (usable[i].match === usable[j].match) continue;
      for (let k = j + 1; k < usable.length && candidates.length < limit3; k++) {
        if (usable[i].match === usable[k].match || usable[j].match === usable[k].match) continue;
        const t = usable[i].odds * usable[j].odds * usable[k].odds;
        if (t >= minOdds && t <= maxOdds) candidates.push({ picks: [usable[i], usable[j], usable[k]], totalOdds: t });
      }
    }
  }

  if (maxOdds > 5) {
    const limit4 = 800;
    for (let i = 0; i < usable.length && candidates.length < limit4; i++) {
      for (let j = i + 1; j < usable.length && candidates.length < limit4; j++) {
        if (usable[i].match === usable[j].match) continue;
        for (let k = j + 1; k < usable.length && candidates.length < limit4; k++) {
          if (usable[i].match === usable[k].match || usable[j].match === usable[k].match) continue;
          for (let l = k + 1; l < usable.length && candidates.length < limit4; l++) {
            if ([usable[i], usable[j], usable[k]].some(p => p.match === usable[l].match)) continue;
            const t = usable[i].odds * usable[j].odds * usable[k].odds * usable[l].odds;
            if (t >= minOdds && t <= maxOdds) candidates.push({ picks: [usable[i], usable[j], usable[k], usable[l]], totalOdds: t });
          }
        }
      }
    }
  }

  const target = (minOdds + maxOdds) / 2;
  const avgPickProb = c => c.picks.reduce((s, p) => s + impliedProb(p.odds), 0) / c.picks.length;
  candidates.forEach(c => {
    const sports = new Set(c.picks.map(p => p.sport));
    const distScore = 1 - Math.abs(c.totalOdds - target) / (maxOdds - minOdds);
    const diversityScore = sports.size / Math.min(3, c.picks.length);
    const simplicityScore = 1 - (c.picks.length - 2) / 3;
    const qualityScore = avgPickProb(c) / 100;
    c.score = distScore * 0.35 + qualityScore * 0.35 + diversityScore * 0.20 + simplicityScore * 0.10;
  });

  candidates.sort((a, b) => b.score - a.score);

  const selected = [];
  for (const cand of candidates) {
    if (selected.length >= count) break;
    const overlap = selected.some(sel => {
      const shared = cand.picks.filter(p => sel.picks.some(sp => sp.id === p.id)).length;
      return shared >= Math.min(cand.picks.length, sel.picks.length);
    });
    if (!overlap) selected.push(cand);
  }
  for (const cand of candidates) {
    if (selected.length >= count) break;
    if (!selected.includes(cand)) selected.push(cand);
  }
  return selected.slice(0, count);
}

function labelCombo(picks, i, kind) {
  const sports = [...new Set(picks.map(p => p.sport))];
  if (sports.length === 1) {
    const s = SPORTS[sports[0]];
    return kind === 'safe' ? `${s.emoji} ${s.label} #${i}` : `${s.emoji} Coup ${s.label} #${i}`;
  }
  const emojis = sports.map(s => SPORTS[s].emoji).join('');
  return kind === 'safe' ? `Mix ${emojis} #${i}` : `Éclair ${emojis} #${i}`;
}

function describeCombo(picks) {
  const sports = [...new Set(picks.map(p => p.sport))];
  const sportsPart = sports.map(s => `${SPORTS[s].emoji} ${SPORTS[s].label}`).join(' + ');
  const probs = picks.map(p => impliedProb(p.odds));
  const minProb = Math.min(...probs);
  const bookies = [...new Set(picks.map(p => p.bookmaker).filter(Boolean))];
  const bookieText = bookies.length === 1 ? ` Cotes ${bookies[0]}.` : '';
  return `${sportsPart}.${bookieText} Maillon le plus risqué : ${minProb}%.`;
}

function buildCombos(picks) {
  const safeRaw = buildCombosForRange(picks, 1.85, 2.20, 10);
  const funRaw = buildCombosForRange(picks, 8, 12, 10);
  const safe = safeRaw.map((c, i) => ({
    id: `cs${i + 1}`,
    label: labelCombo(c.picks, i + 1, 'safe'),
    pickIds: c.picks.map(p => p.id),
    totalOdds: Math.round(c.totalOdds * 100) / 100,
    analysis: describeCombo(c.picks),
  }));
  const fun = funRaw.map((c, i) => ({
    id: `cf${i + 1}`,
    label: labelCombo(c.picks, i + 1, 'fun'),
    pickIds: c.picks.map(p => p.id),
    totalOdds: Math.round(c.totalOdds * 100) / 100,
    analysis: describeCombo(c.picks),
  }));
  return { safe, fun };
}

// ---------- Main component ----------

export default function App() {
  const DAYS = buildDays();

  const [apiKey, setApiKey] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [dayOffset, setDayOffset] = useState(0);
  const [mainTab, setMainTab] = useState('picks');
  const [sportFilter, setSportFilter] = useState('all');
  const [trackerFilter, setTrackerFilter] = useState('all');
  const [dataByDay, setDataByDay] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [error, setError] = useState(null);
  const [addingBet, setAddingBet] = useState(null);
  const [stakeInput, setStakeInput] = useState('');
  const [bets, setBets] = useState([]);
  const [customCombo, setCustomCombo] = useState([]);
  const [customComboOpen, setCustomComboOpen] = useState(false);
  const [addingCustom, setAddingCustom] = useState(false);
  const [customStake, setCustomStake] = useState('');
  const [currency, setCurrency] = useState('XOF');
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [checkingResults, setCheckingResults] = useState(false);
  const [checkSummary, setCheckSummary] = useState(null);
  const [useProxy, setUseProxy] = useState(true);

  const currentDay = DAYS[dayOffset];
  const currentData = dataByDay[currentDay.key];
  const cur = CURRENCIES[currency];

  // Load prefs and bets on mount
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(BETS_KEY, false);
        if (r && r.value) setBets(JSON.parse(r.value));
      } catch {}
      try {
        const c = await window.storage.get(CURRENCY_KEY, false);
        if (c && c.value) {
          const saved = JSON.parse(c.value);
          if (CURRENCIES[saved]) setCurrency(saved);
        }
      } catch {}
      try {
        const k = await window.storage.get(APIKEY_KEY, false);
        if (k && k.value) {
          setApiKey(JSON.parse(k.value));
        } else {
          setShowSetup(true);
        }
      } catch {
        setShowSetup(true);
      }
      try {
        const p = await window.storage.get(PROXY_KEY, false);
        if (p && p.value) setUseProxy(JSON.parse(p.value));
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (dataByDay[currentDay.key]) return;
      try {
        const r = await window.storage.get(`preds:${currentDay.key}`, false);
        if (r && r.value) {
          setDataByDay(prev => ({ ...prev, [currentDay.key]: JSON.parse(r.value) }));
        }
      } catch {}
    })();
    setCustomCombo([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayOffset]);

  const saveApiKey = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) return;
    setApiKey(trimmed);
    setShowSetup(false);
    setShowSettings(false);
    try {
      await window.storage.set(APIKEY_KEY, JSON.stringify(trimmed), false);
    } catch {}
    setApiKeyInput('');
  };

  const changeCurrency = async (code) => {
    setCurrency(code);
    setShowCurrencyModal(false);
    try {
      await window.storage.set(CURRENCY_KEY, JSON.stringify(code), false);
    } catch {}
  };

  const toggleProxy = async () => {
    const next = !useProxy;
    setUseProxy(next);
    try {
      await window.storage.set(PROXY_KEY, JSON.stringify(next), false);
    } catch {}
  };

  const saveBets = async (next) => {
    setBets(next);
    try {
      await window.storage.set(BETS_KEY, JSON.stringify(next), false);
    } catch (e) {
      console.warn('Sauvegarde suivi échouée :', e);
    }
  };

  const addPickBet = (pick, stake) => {
    const bet = {
      id: `bet_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'pick',
      day: currentDay.key,
      createdAt: new Date().toISOString(),
      stake: Number(stake),
      odds: Number(pick.odds),
      currency,
      status: 'pending',
      sport: pick.sport,
      league: pick.league,
      time: pick.time,
      match: pick.match,
      betType: pick.betType,
      pick: pick.pick,
      fixtureId: pick.fixtureId,
      bookmaker: pick.bookmaker,
    };
    saveBets([bet, ...bets]);
    setAddingBet(null);
  };

  const addComboBet = (combo, picks, stake, isCustom = false) => {
    const bet = {
      id: `bet_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'combo',
      day: currentDay.key,
      createdAt: new Date().toISOString(),
      stake: Number(stake),
      odds: Number(combo.totalOdds),
      currency,
      status: 'pending',
      label: combo.label || (isCustom ? 'Combi perso' : 'Combo'),
      isCustom,
      legs: picks.map(p => ({
        sport: p.sport, league: p.league, time: p.time,
        match: p.match, betType: p.betType, pick: p.pick, odds: p.odds,
        fixtureId: p.fixtureId, bookmaker: p.bookmaker,
      })),
    };
    saveBets([bet, ...bets]);
    setAddingBet(null);
    setAddingCustom(false);
  };

  const updateBet = (id, status) =>
    saveBets(bets.map(b => b.id === id ? { ...b, status } : b));
  const deleteBet = (id) =>
    saveBets(bets.filter(b => b.id !== id));

  // ---------- Generate ----------
  const generate = async () => {
    if (!apiKey) {
      setShowSetup(true);
      return;
    }
    setLoading(true);
    setError(null);
    setLoadingStatus('Récupération des fixtures et cotes…');
    try {
      const dateStr = currentDay.key;

      const results = await Promise.allSettled([
        fetchSportData('football', dateStr, apiKey, useProxy),
        fetchSportData('basketball', dateStr, apiKey, useProxy),
        fetchSportData('hockey', dateStr, apiKey, useProxy),
        fetchSportData('rugby', dateStr, apiKey, useProxy),
        fetchSportData('handball', dateStr, apiKey, useProxy),
      ]);

      setLoadingStatus('Construction des picks et combos…');

      const notes = [];
      const allPicks = [];
      const sports = ['football', 'basketball', 'hockey', 'rugby', 'handball'];
      const debugPerSport = {};
      let successCount = 0;

      results.forEach((r, idx) => {
        const sport = sports[idx];
        if (r.status === 'fulfilled' && r.value) {
          const rawFixtures = r.value.fixtures || [];
          const rawOdds = r.value.odds || [];
          const sportPicks = buildPicksFromApiData(sport, r.value, currentDay.key);
          sportPicks.forEach(p => allPicks.push(p));
          debugPerSport[sport] = {
            ok: true,
            fixtures: rawFixtures.length,
            oddsFixtures: rawOdds.length,
            picks: sportPicks.length,
          };
          if (sportPicks.length === 0) {
            notes.push(`${SPORTS[sport].emoji} ${SPORTS[sport].label}: ${rawFixtures.length} matchs mais ${rawOdds.length === 0 ? 'aucune cote disponible' : 'aucun match avec cote exploitable'}.`);
          } else {
            notes.push(`${SPORTS[sport].emoji} ${SPORTS[sport].label}: ${sportPicks.length} picks sur ${rawFixtures.length} matchs.`);
          }
          successCount++;
        } else {
          const reason = r.reason?.message || 'erreur inconnue';
          notes.push(`${SPORTS[sport].emoji} ${SPORTS[sport].label}: ${reason}`);
          debugPerSport[sport] = { ok: false, error: reason };
          console.error(`Sport ${sport} failed:`, r.reason);
        }
      });

      if (successCount === 0) {
        // Still save debug info so user can see what went wrong
        const ts = new Date().toISOString();
        const dayData = {
          picks: [],
          combos: { safe: [], fun: [] },
          notes: notes.join('  •  '),
          debug: debugPerSport,
          timestamp: ts
        };
        setDataByDay(prev => ({ ...prev, [currentDay.key]: dayData }));
        throw new Error('Toutes les API ont échoué. Vois le diagnostic ci-dessous.');
      }

      const combos = allPicks.length > 0 ? buildCombos(allPicks) : { safe: [], fun: [] };
      const ts = new Date().toISOString();
      const dayData = {
        picks: allPicks,
        combos,
        notes: notes.length ? notes.join('  •  ') : undefined,
        debug: debugPerSport,
        timestamp: ts
      };
      setDataByDay(prev => ({ ...prev, [currentDay.key]: dayData }));

      try {
        await window.storage.set(`preds:${currentDay.key}`, JSON.stringify(dayData), false);
      } catch (storageErr) {
        console.warn('Sauvegarde locale échouée :', storageErr);
      }
    } catch (e) {
      setError(e.message || 'Erreur inconnue');
    } finally {
      setLoading(false);
      setLoadingStatus('');
    }
  };

  // ---------- Auto-check results ----------
  const checkResults = async () => {
    if (!apiKey) {
      setShowSetup(true);
      return;
    }
    const pending = bets.filter(b => b.status === 'pending');
    if (pending.length === 0) {
      setCheckSummary({ info: 'Aucun pari en attente à vérifier.' });
      return;
    }

    setCheckingResults(true);
    setCheckSummary(null);

    try {
      // Collect unique fixture IDs per sport
      const fixturesToCheck = new Map(); // key: sport|id -> fixtureData
      const collectFixtures = (bet) => {
        if (bet.type === 'pick' && bet.fixtureId) {
          fixturesToCheck.set(`${bet.sport}|${bet.fixtureId}`, { sport: bet.sport, id: bet.fixtureId });
        } else if (bet.type === 'combo' && bet.legs) {
          bet.legs.forEach(l => {
            if (l.fixtureId) fixturesToCheck.set(`${l.sport}|${l.fixtureId}`, { sport: l.sport, id: l.fixtureId });
          });
        }
      };
      pending.forEach(collectFixtures);

      if (fixturesToCheck.size === 0) {
        throw new Error("Aucun ID de match connu pour la vérification (paris trop anciens?)");
      }

      // Fetch fixture results in parallel
      const fixtureResults = new Map(); // key: sport|id -> result
      await Promise.all(
        Array.from(fixturesToCheck.values()).map(async ({ sport, id }) => {
          try {
            const path = sport === 'football' ? `/fixtures?id=${id}` : `/games?id=${id}`;
            const data = await apiCall(sport, path, apiKey, useProxy);
            const fx = data.response?.[0];
            if (fx) fixtureResults.set(`${sport}|${id}`, { sport, fixture: fx });
          } catch (e) {
            console.warn(`Failed to fetch ${sport} fixture ${id}:`, e);
          }
        })
      );

      // Evaluate each bet
      let wonCount = 0, lostCount = 0, unclearCount = 0;
      const nowIso = new Date().toISOString();

      const evaluateLeg = (leg) => {
        const fxData = fixtureResults.get(`${leg.sport}|${leg.fixtureId}`);
        if (!fxData) return { status: 'unclear', reason: 'Fixture introuvable' };
        return evaluatePickOutcome(leg, fxData.fixture, leg.sport);
      };

      const nextBets = bets.map(b => {
        if (b.status !== 'pending') return b;
        if (b.type === 'pick') {
          const evalRes = evaluateLeg(b);
          if (evalRes.status === 'won') { wonCount++; return { ...b, status: 'won', resultInfo: evalRes.score, resultReason: evalRes.reason, checkedAt: nowIso }; }
          if (evalRes.status === 'lost') { lostCount++; return { ...b, status: 'lost', resultInfo: evalRes.score, resultReason: evalRes.reason, checkedAt: nowIso }; }
          unclearCount++;
          return { ...b, lastCheckReason: evalRes.reason, checkedAt: nowIso };
        } else {
          // Combo: all legs must be won
          const legResults = b.legs.map(evaluateLeg);
          if (legResults.some(r => r.status === 'lost')) {
            lostCount++;
            const lostLegs = legResults.map((r, i) => r.status === 'lost' ? b.legs[i].match : null).filter(Boolean);
            return { ...b, status: 'lost', resultReason: `Leg perdu : ${lostLegs.join(', ')}`, checkedAt: nowIso };
          }
          if (legResults.every(r => r.status === 'won')) {
            wonCount++;
            return { ...b, status: 'won', resultReason: 'Tous les legs gagnés', checkedAt: nowIso };
          }
          unclearCount++;
          const unclearReasons = legResults.filter(r => r.status === 'unclear').map((r, i) => r.reason).join(' • ');
          return { ...b, lastCheckReason: unclearReasons || 'Certains matchs non terminés', checkedAt: nowIso };
        }
      });

      await saveBets(nextBets);
      setCheckSummary({ won: wonCount, lost: lostCount, unclear: unclearCount, total: pending.length });
    } catch (e) {
      setCheckSummary({ error: e.message || 'Erreur inconnue' });
    } finally {
      setCheckingResults(false);
    }
  };

  // ---------- Derived state ----------
  const rawPicks = currentData?.picks || [];
  const allPicks = rawPicks.filter(p => !isPickInPast(p, currentDay.key));
  const hiddenPastCount = rawPicks.length - allPicks.length;
  const filteredPicks = sportFilter === 'all'
    ? allPicks
    : allPicks.filter(p => p.sport === sportFilter);

  const rawSafeCombos = currentData?.combos?.safe || [];
  const rawFunCombos = currentData?.combos?.fun || [];
  const getPickById = (id) => allPicks.find(p => p.id === id);
  const getRawPickById = (id) => rawPicks.find(p => p.id === id);
  const comboIsLive = (c) => (c.pickIds || []).map(getRawPickById).filter(Boolean).every(p => !isPickInPast(p, currentDay.key));
  const safeCombos = rawSafeCombos.filter(comboIsLive);
  const funCombos = rawFunCombos.filter(comboIsLive);
  const hiddenCombos = (rawSafeCombos.length + rawFunCombos.length) - (safeCombos.length + funCombos.length);

  const activeCombos = mainTab === 'safe' ? safeCombos : mainTab === 'fun' ? funCombos : [];
  const isCombosView = mainTab === 'safe' || mainTab === 'fun';

  const customComboPicks = customCombo.map(getPickById).filter(Boolean);
  const customComboOdds = customComboPicks.reduce((acc, p) => acc * Number(p.odds), 1);
  const customComboProb = impliedProb(customComboOdds);
  const canAddToCustom = (pickId) => {
    const pick = getPickById(pickId);
    if (!pick) return false;
    return !customComboPicks.some(p => p.match === pick.match && p.id !== pickId);
  };
  const toggleCustom = (pickId) => {
    if (customCombo.includes(pickId)) setCustomCombo(customCombo.filter(id => id !== pickId));
    else if (canAddToCustom(pickId)) {
      setCustomCombo([...customCombo, pickId]);
      if (!customComboOpen) setCustomComboOpen(true);
    }
  };

  const trackedBets = bets;
  const filteredBets = trackerFilter === 'all' ? trackedBets : trackedBets.filter(b => b.status === trackerFilter);
  const resolved = trackedBets.filter(b => b.status === 'won' || b.status === 'lost').filter(b => (b.currency || 'EUR') === currency);
  const totalStaked = resolved.reduce((s, b) => s + b.stake, 0);
  const totalReturned = resolved.reduce((s, b) => s + (b.status === 'won' ? b.stake * b.odds : 0), 0);
  const net = totalReturned - totalStaked;
  const roi = totalStaked > 0 ? (net / totalStaked) * 100 : 0;
  const wonCount = resolved.filter(b => b.status === 'won').length;
  const winRate = resolved.length > 0 ? (wonCount / resolved.length) * 100 : 0;
  const pendingCount = trackedBets.filter(b => b.status === 'pending').length;

  const comboAccent = mainTab === 'safe' ? 'emerald' : 'gold';
  const defaultStakeStr = String(cur.defaultStake);
  const startAddPickBet = (id) => { setAddingBet(id); setStakeInput(defaultStakeStr); };
  const startAddComboBet = (id) => { setAddingBet(id); setStakeInput(defaultStakeStr); };
  const startAddCustom = () => { setAddingCustom(true); setCustomStake(defaultStakeStr); };

  const commonStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
    body, * { font-family: 'Space Grotesk', system-ui, sans-serif; }
    .brand-font { font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.02em; }
    .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
    .gold-gradient { background: linear-gradient(135deg, #F5CB5C 0%, #D4A650 50%, #B8891F 100%); }
    .gold-text { background: linear-gradient(135deg, #F5CB5C 0%, #D4A650 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .card-shine { position: relative; }
    .card-shine::before { content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 1px; background: linear-gradient(135deg, rgba(212, 166, 80, 0.3), transparent 30%, transparent 70%, rgba(212, 166, 80, 0.15)); -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; }
  `;

  // ---------- Setup screen ----------
  if (showSetup) {
    return (
      <div className="min-h-screen text-slate-100 p-4 flex items-center justify-center" style={{ background: 'radial-gradient(ellipse at top, #0f1729 0%, #050810 55%)' }}>
        <style>{commonStyles}</style>
        <div className="max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-3 rounded-2xl gold-gradient flex items-center justify-center shadow-2xl shadow-amber-900/40">
              <Crown className="w-8 h-8 text-slate-950" strokeWidth={2.5} />
            </div>
            <h1 className="brand-font text-3xl mb-1">
              <span className="gold-text font-bold">JD</span>
              <span className="text-slate-100"> PRONO </span>
              <span className="gold-text font-bold">WINNER</span>
            </h1>
            <p className="text-xs text-amber-200/60 uppercase tracking-widest">Configuration initiale</p>
          </div>

          <div className="bg-slate-900/70 border border-amber-900/40 rounded-2xl p-4 mb-4">
            <p className="text-sm text-slate-300 leading-relaxed mb-3">
              L'app utilise <span className="gold-text font-bold">API-Sports</span> pour récupérer les vrais matchs et cotes bookmakers. Il te faut une clé gratuite (100 requêtes/jour).
            </p>

            <div className="space-y-2 text-xs text-slate-400 mb-4">
              <p className="flex gap-2">
                <span className="gold-text font-bold shrink-0">1.</span>
                <span>Va sur <a href="https://dashboard.api-sports.io/register" target="_blank" rel="noreferrer" className="text-amber-300 underline inline-flex items-center gap-0.5">dashboard.api-sports.io <ExternalLink className="w-3 h-3" /></a> et crée un compte gratuit (email/pass, sans CB)</span>
              </p>
              <p className="flex gap-2">
                <span className="gold-text font-bold shrink-0">2.</span>
                <span>Une fois connecté, tu vois ta clé API tout en haut du dashboard</span>
              </p>
              <p className="flex gap-2">
                <span className="gold-text font-bold shrink-0">3.</span>
                <span>Copie-la et colle-la ci-dessous</span>
              </p>
            </div>

            <label className="text-[10px] uppercase tracking-widest text-amber-200/60 flex items-center gap-1 mb-1">
              <Key className="w-3 h-3" /> Ta clé API-Sports
            </label>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="Colle ta clé ici (ex: abc123def456...)"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm mono text-slate-100 focus:border-amber-400 focus:outline-none mb-3"
            />
            <button
              onClick={saveApiKey}
              disabled={!apiKeyInput.trim()}
              className="w-full gold-gradient hover:brightness-110 disabled:opacity-30 text-slate-950 font-bold px-4 py-3 rounded-lg text-sm shadow-lg shadow-amber-900/30"
            >
              Enregistrer et démarrer
            </button>
          </div>

          <p className="text-[10px] text-slate-600 text-center leading-relaxed">
            La clé est stockée uniquement sur ton appareil.<br />
            Elle donne accès à 3 API : Football, Basketball, Hockey.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-slate-100 pb-40" style={{ background: 'radial-gradient(ellipse at top, #0f1729 0%, #050810 55%)' }}>
      <style>{commonStyles}</style>

      <header className="sticky top-0 z-10 px-4 py-3 border-b border-amber-900/30 backdrop-blur-lg" style={{ background: 'rgba(5, 8, 16, 0.9)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gold-gradient flex items-center justify-center shrink-0 shadow-lg shadow-amber-900/40">
                <Crown className="w-4 h-4 text-slate-950" strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <h1 className="brand-font text-2xl leading-none flex items-baseline gap-1.5">
                  <span className="gold-text font-bold">JD</span>
                  <span className="text-slate-100">PRONO</span>
                  <span className="gold-text font-bold">WINNER</span>
                </h1>
                <p className="text-[10px] text-amber-200/60 mt-0.5 uppercase tracking-widest capitalize">{currentDay.full}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setShowCurrencyModal(true)}
              className="flex items-center gap-1 border border-amber-900/50 text-amber-200 text-xs font-semibold px-2 py-2 rounded-lg hover:border-amber-700"
              aria-label="Devise"
            >
              <Coins className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">{cur.label}</span>
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="border border-amber-900/50 text-amber-200 text-xs font-semibold p-2 rounded-lg hover:border-amber-700"
              aria-label="Paramètres"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            {mainTab !== 'tracker' && (
              <button
                onClick={generate}
                disabled={loading}
                className="flex items-center gap-1.5 gold-gradient hover:brightness-110 disabled:opacity-40 disabled:brightness-50 text-slate-950 font-bold px-3 py-2 rounded-lg text-sm shadow-lg shadow-amber-900/30"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>{currentData ? 'MAJ' : 'Générer'}</span>
              </button>
            )}
          </div>
        </div>

        {mainTab !== 'tracker' && (
          <div className="mt-3 grid grid-cols-3 gap-1 bg-slate-900/70 p-1 rounded-lg border border-slate-800/70">
            {DAYS.map(d => (
              <button
                key={d.key}
                onClick={() => setDayOffset(d.offset)}
                className={`py-1.5 rounded text-xs font-semibold transition ${
                  dayOffset === d.offset ? 'gold-gradient text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                <div>{d.label}</div>
                <div className={`text-[10px] font-normal capitalize ${dayOffset === d.offset ? 'text-slate-900/70' : 'opacity-70'}`}>{d.short}</div>
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="px-4 pt-3">
        <div className="grid grid-cols-4 gap-1 bg-slate-900/70 p-1 rounded-xl border border-slate-800/70 backdrop-blur">
          {[
            { k: 'picks', label: 'Pronos', Icon: ListChecks, cls: 'bg-slate-100 text-slate-950' },
            { k: 'safe', label: 'Safe', Icon: Shield, cls: 'bg-emerald-500 text-slate-950' },
            { k: 'fun', label: 'Fun', Icon: Zap, cls: 'gold-gradient text-slate-950' },
            { k: 'tracker', label: 'Suivi', Icon: BarChart3, cls: 'bg-violet-500 text-slate-950' },
          ].map(t => (
            <button
              key={t.k}
              onClick={() => setMainTab(t.k)}
              className={`relative flex items-center justify-center gap-1 py-2 rounded-lg font-bold text-[11px] uppercase tracking-wider transition ${
                mainTab === t.k ? `${t.cls} shadow` : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              <t.Icon className="w-3.5 h-3.5" />
              {t.label}
              {t.k === 'tracker' && pendingCount > 0 && mainTab !== 'tracker' && (
                <span className="absolute -top-1 -right-1 gold-gradient text-slate-950 text-[9px] rounded-full min-w-4 h-4 px-1 flex items-center justify-center font-bold shadow">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {mainTab === 'picks' && (
        <div className="px-4 pt-3 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setSportFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition ${
              sportFilter === 'all' ? 'bg-slate-100 text-slate-950 border-slate-100' : 'border-slate-700 text-slate-400 hover:border-amber-700 hover:text-slate-100'
            }`}
          >
            Tous ({allPicks.length})
          </button>
          {Object.entries(SPORTS).map(([key, s]) => {
            const count = allPicks.filter(p => p.sport === key).length;
            return (
              <button
                key={key}
                onClick={() => setSportFilter(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition ${
                  sportFilter === key ? 'bg-slate-100 text-slate-950 border-slate-100' : 'border-slate-700 text-slate-400 hover:border-amber-700 hover:text-slate-100'
                }`}
              >
                {s.emoji} {s.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      <main className="px-4 pt-4 space-y-3">
        {error && (
          <div className="bg-rose-950/60 border border-rose-900 rounded-lg p-3 flex gap-2 items-start">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-200">{error}</p>
          </div>
        )}

        {mainTab !== 'tracker' && !currentData && !loading && !error && (
          <div className="text-center py-16 px-4">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full gold-gradient flex items-center justify-center shadow-2xl shadow-amber-900/40">
              <Crown className="w-8 h-8 text-slate-950" strokeWidth={2.5} />
            </div>
            <p className="brand-font text-2xl gold-text mb-2">PRÊT POUR LA VICTOIRE</p>
            <p className="text-sm text-slate-400 leading-relaxed max-w-xs mx-auto">
              Appuie sur <span className="gold-text font-bold">Générer</span> — données API certifiées, cotes bookmakers réelles.
            </p>
            <p className="text-xs text-slate-600 mt-3">~ 3 à 10 secondes</p>
          </div>
        )}

        {loading && !currentData && (
          <div className="text-center py-16">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <Loader2 className="w-16 h-16 animate-spin text-amber-400" />
              <Crown className="w-6 h-6 gold-text absolute inset-0 m-auto" />
            </div>
            <p className="brand-font text-xl gold-text tracking-wider">{loadingStatus || 'CHARGEMENT'}</p>
            <p className="text-slate-500 text-xs mt-1">3 sports en parallèle</p>
          </div>
        )}

        {mainTab === 'picks' && currentData?.debug && Object.values(currentData.debug).some(d => !d.ok || d.picks === 0) && (
          <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <p className="text-xs font-bold text-slate-200 uppercase tracking-widest">Diagnostic par sport</p>
            </div>
            <div className="space-y-1.5 text-xs">
              {Object.entries(currentData.debug).map(([sport, d]) => (
                <div key={sport} className="flex items-start gap-2">
                  <span>{SPORTS[sport]?.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-slate-300 font-semibold">{SPORTS[sport]?.label} : </span>
                    {d.ok ? (
                      <span className={d.picks === 0 ? 'text-rose-300' : 'text-emerald-300'}>
                        {d.picks} pick{d.picks > 1 ? 's' : ''} sur {d.fixtures} match{d.fixtures > 1 ? 's' : ''} ({d.oddsFixtures} avec cotes)
                      </span>
                    ) : (
                      <span className="text-rose-300">échec — {d.error}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {mainTab === 'picks' && currentData?.notes && (
          <div className="bg-amber-950/40 border border-amber-900/60 rounded-lg p-3 flex gap-2 items-start">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-100 leading-relaxed">{currentData.notes}</p>
          </div>
        )}

        {mainTab === 'picks' && hiddenPastCount > 0 && (
          <p className="text-[10px] text-slate-500 text-center uppercase tracking-widest flex items-center justify-center gap-1">
            <Clock className="w-3 h-3" /> {hiddenPastCount} match{hiddenPastCount > 1 ? 's' : ''} déjà commencé{hiddenPastCount > 1 ? 's' : ''} masqué{hiddenPastCount > 1 ? 's' : ''}
          </p>
        )}

        {isCombosView && hiddenCombos > 0 && (
          <p className="text-[10px] text-slate-500 text-center uppercase tracking-widest flex items-center justify-center gap-1">
            <Clock className="w-3 h-3" /> {hiddenCombos} combo{hiddenCombos > 1 ? 's' : ''} masqué{hiddenCombos > 1 ? 's' : ''} (contient au moins un match commencé)
          </p>
        )}

        {mainTab === 'picks' && filteredPicks.map((p, i) => {
          const prob = impliedProb(p.odds);
          const isAdding = addingBet === p.id;
          const inCustom = customCombo.includes(p.id);
          const canAdd = !inCustom && canAddToCustom(p.id);
          return (
            <div key={p.id || i} className={`card-shine relative rounded-xl overflow-hidden border ${
              inCustom ? 'border-amber-500/60 bg-slate-900/90 shadow-lg shadow-amber-900/20' : 'border-slate-800/70 bg-slate-900/60'
            }`}>
              <div className="px-4 py-2.5 border-b border-slate-800/70 flex justify-between items-center gap-2">
                <div className="flex items-center gap-2 text-xs text-slate-400 min-w-0">
                  <span className="text-base shrink-0">{SPORTS[p.sport]?.emoji}</span>
                  <span className="truncate">{p.league}</span>
                  <span className="text-slate-700 shrink-0">•</span>
                  <span className="mono shrink-0">{p.time}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`mono text-[10px] px-1.5 py-0.5 rounded border ${probClass(prob)}`}>{prob}%</span>
                  <div className="mono text-lg font-bold gold-text">{Number(p.odds).toFixed(2)}</div>
                </div>
              </div>
              <div className="px-4 py-3">
                <p className="font-bold text-slate-100 leading-snug">{p.match}</p>
                <div className="flex items-baseline gap-2 mt-1.5 flex-wrap">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-900/60 font-bold uppercase tracking-wider">
                    {p.betType}
                  </span>
                  <span className="text-sm font-semibold text-amber-100">{p.pick}</span>
                  {p.bookmaker && <span className="text-[9px] text-slate-500 ml-auto">{p.bookmaker}</span>}
                </div>
                {p.analysis && <p className="text-xs text-slate-400 mt-2.5 leading-relaxed">{p.analysis}</p>}
              </div>

              {isAdding ? (
                <div className="border-t border-slate-800/70 bg-slate-950/70 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-400">Mise :</label>
                    <input
                      type="number"
                      value={stakeInput}
                      onChange={(e) => setStakeInput(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm mono text-slate-100 focus:border-amber-400 focus:outline-none"
                      autoFocus
                    />
                    <span className="text-xs text-slate-400">{cur.symbol}</span>
                    <button onClick={() => setAddingBet(null)} className="text-xs text-slate-400 px-2 py-1.5">Annuler</button>
                    <button onClick={() => addPickBet(p, stakeInput)} className="gold-gradient text-slate-950 text-xs font-bold px-3 py-1.5 rounded shadow">Suivre</button>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1.5 mono">
                    Gain potentiel : {formatAmount(Number(stakeInput || 0) * p.odds, cur)}
                  </p>
                </div>
              ) : (
                <div className="border-t border-slate-800/70 grid grid-cols-2 divide-x divide-slate-800/70">
                  <button
                    onClick={() => toggleCustom(p.id)}
                    disabled={!inCustom && !canAdd}
                    className={`py-2 text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 transition ${
                      inCustom ? 'bg-amber-950/40 text-amber-300'
                        : canAdd ? 'text-slate-400 hover:text-amber-300 hover:bg-slate-800/50'
                        : 'text-slate-700 cursor-not-allowed'
                    }`}
                  >
                    {inCustom ? <><Check className="w-3 h-3" /> Dans combi</> : <><Layers className="w-3 h-3" /> Au combi</>}
                  </button>
                  <button
                    onClick={() => startAddPickBet(p.id)}
                    className="py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-amber-300 hover:bg-slate-800/50 flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Suivre seul
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {mainTab === 'picks' && currentData && filteredPicks.length === 0 && (
          <div className="text-center py-12 text-slate-500 text-sm">Aucun pronostic pour ce sport.</div>
        )}

        {isCombosView && activeCombos.map((c, i) => {
          const picks = (c.pickIds || []).map(getPickById).filter(Boolean);
          const prob = impliedProb(c.totalOdds);
          const isAdding = addingBet === c.id;
          const accentText = comboAccent === 'emerald' ? 'text-emerald-400' : 'gold-text';
          const accentBg = comboAccent === 'emerald' ? 'bg-emerald-500' : 'gold-gradient';
          return (
            <div key={c.id || i} className="card-shine rounded-xl overflow-hidden border border-slate-800/70 bg-slate-900/60">
              <div className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${accentBg} text-slate-950 font-bold uppercase tracking-wider`}>#{i + 1}</span>
                    <p className="font-bold text-slate-100 truncate">{c.label}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
                    <span>{picks.length} sélection{picks.length > 1 ? 's' : ''}</span>
                    <span>•</span>
                    <span className={`mono px-1.5 py-0.5 rounded border ${probClass(prob)}`}>{prob}%</span>
                    <span>•</span>
                    <span>{formatAmount(cur.defaultStake, cur)} = <span className="text-slate-200 mono font-bold">{formatAmount(Number(c.totalOdds) * cur.defaultStake, cur)}</span></span>
                  </div>
                </div>
                <div className={`mono text-2xl font-bold shrink-0 ${accentText}`}>{Number(c.totalOdds).toFixed(2)}</div>
              </div>

              {c.analysis && (
                <div className="px-4 pb-2 -mt-1">
                  <p className="text-xs text-slate-400 leading-relaxed italic">{c.analysis}</p>
                </div>
              )}

              <div className="border-t border-slate-800/70 bg-slate-950/70 divide-y divide-slate-900">
                {picks.map(p => (
                  <div key={p.id} className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 text-xs text-slate-400 min-w-0">
                        <span>{SPORTS[p.sport]?.emoji}</span>
                        <span className="truncate">{p.league}</span>
                        <span className="text-slate-700">•</span>
                        <span className="mono">{p.time}</span>
                      </div>
                      <span className={`mono text-sm font-bold shrink-0 ${accentText}`}>{Number(p.odds).toFixed(2)}</span>
                    </div>
                    <p className="text-sm text-slate-200 font-semibold">{p.match}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      <span className="text-[9px] px-1 py-0.5 rounded bg-slate-800 uppercase tracking-wider mr-1.5">{p.betType}</span>
                      {p.pick}
                    </p>
                  </div>
                ))}
              </div>

              {isAdding ? (
                <div className="border-t border-slate-800/70 bg-slate-950/70 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-400">Mise :</label>
                    <input
                      type="number"
                      value={stakeInput}
                      onChange={(e) => setStakeInput(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm mono text-slate-100 focus:border-amber-400 focus:outline-none"
                      autoFocus
                    />
                    <span className="text-xs text-slate-400">{cur.symbol}</span>
                    <button onClick={() => setAddingBet(null)} className="text-xs text-slate-400 px-2 py-1.5">Annuler</button>
                    <button onClick={() => addComboBet(c, picks, stakeInput)} className={`${accentBg} text-slate-950 text-xs font-bold px-3 py-1.5 rounded shadow`}>Suivre</button>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1.5 mono">
                    Gain potentiel : {formatAmount(Number(stakeInput || 0) * c.totalOdds, cur)}
                  </p>
                </div>
              ) : (
                <button
                  onClick={() => startAddComboBet(c.id)}
                  className="w-full py-2 text-[11px] font-bold uppercase tracking-wider border-t border-slate-800/70 text-slate-400 hover:text-amber-300 hover:bg-slate-800/50 flex items-center justify-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Suivre ce combo
                </button>
              )}
            </div>
          );
        })}

        {isCombosView && currentData && activeCombos.length === 0 && (
          <div className="text-center py-12 text-slate-500 text-sm">
            Aucun combo {mainTab === 'safe' ? 'safe' : 'fun'} pour ce jour.
          </div>
        )}

        {mainTab === 'tracker' && (
          <>
            <div className="card-shine rounded-xl p-4 border border-slate-800/70 bg-slate-900/70">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Stats en {cur.label}</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest">Mise totale</p>
                  <p className="text-xl font-bold mono text-slate-100">{formatAmount(totalStaked, cur)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest">Gains nets</p>
                  <p className={`text-xl font-bold mono flex items-center gap-1 ${net > 0 ? 'text-emerald-400' : net < 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                    {net > 0 && <TrendingUp className="w-4 h-4" />}
                    {net < 0 && <TrendingDown className="w-4 h-4" />}
                    {net >= 0 ? '+' : ''}{formatAmount(net, cur)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest">ROI</p>
                  <p className={`text-xl font-bold mono ${roi > 0 ? 'text-emerald-400' : roi < 0 ? 'text-rose-400' : 'text-slate-200'}`}>{roi >= 0 ? '+' : ''}{roi.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest">Réussite</p>
                  <p className="text-xl font-bold mono text-slate-100">{winRate.toFixed(0)}% <span className="text-xs text-slate-500">({wonCount}/{resolved.length})</span></p>
                </div>
              </div>
              {pendingCount > 0 && (
                <p className="text-xs text-amber-300 border-t border-slate-800/70 pt-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {pendingCount} pari{pendingCount > 1 ? 's' : ''} en attente
                </p>
              )}
            </div>

            {pendingCount > 0 && (
              <button
                onClick={checkResults}
                disabled={checkingResults}
                className="w-full flex items-center justify-center gap-2 gold-gradient hover:brightness-110 disabled:opacity-40 text-slate-950 font-bold px-4 py-3 rounded-xl text-sm shadow-lg shadow-amber-900/30"
              >
                {checkingResults ? <><Loader2 className="w-4 h-4 animate-spin" /> Vérification…</> : <><Sparkles className="w-4 h-4" /> Vérifier les résultats</>}
              </button>
            )}

            {checkSummary && !checkingResults && (
              <div className={`rounded-xl p-3 border flex items-start gap-2 ${
                checkSummary.error ? 'bg-rose-950/50 border-rose-900 text-rose-200' : 'bg-slate-900/70 border-slate-800/70'
              }`}>
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed flex-1">
                  {checkSummary.error ? <>Erreur : {checkSummary.error}</>
                    : checkSummary.info ? <>{checkSummary.info}</>
                    : (
                      <>
                        <span className="text-slate-300 font-semibold">Vérification terminée :</span>{' '}
                        <span className="text-emerald-400 font-bold">{checkSummary.won} gagné{checkSummary.won > 1 ? 's' : ''}</span>,{' '}
                        <span className="text-rose-400 font-bold">{checkSummary.lost} perdu{checkSummary.lost > 1 ? 's' : ''}</span>,{' '}
                        <span className="text-amber-300 font-bold">{checkSummary.unclear} indéterminé{checkSummary.unclear > 1 ? 's' : ''}</span>
                        {' '}sur {checkSummary.total}.
                      </>
                    )}
                </div>
                <button onClick={() => setCheckSummary(null)} className="text-slate-500 hover:text-slate-200"><X className="w-3.5 h-3.5" /></button>
              </div>
            )}

            <div className="flex gap-2 overflow-x-auto pb-1">
              {[
                { k: 'all', l: `Tous (${trackedBets.length})` },
                { k: 'pending', l: `En attente (${trackedBets.filter(b => b.status === 'pending').length})` },
                { k: 'won', l: `Gagnés (${trackedBets.filter(b => b.status === 'won').length})` },
                { k: 'lost', l: `Perdus (${trackedBets.filter(b => b.status === 'lost').length})` },
              ].map(f => (
                <button
                  key={f.k}
                  onClick={() => setTrackerFilter(f.k)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition ${
                    trackerFilter === f.k ? 'bg-slate-100 text-slate-950 border-slate-100' : 'border-slate-700 text-slate-400 hover:border-amber-700 hover:text-slate-100'
                  }`}
                >
                  {f.l}
                </button>
              ))}
            </div>

            {filteredBets.length === 0 && (
              <div className="text-center py-12 text-slate-500 text-sm">
                {trackedBets.length === 0 ? "Aucun pari suivi. Ajoute-en un depuis les Pronos." : "Aucun pari dans ce filtre."}
              </div>
            )}

            {filteredBets.map(bet => {
              const betCur = CURRENCIES[bet.currency] || cur;
              const gain = bet.stake * bet.odds;
              const statusBorder = bet.status === 'won' ? 'border-l-emerald-500' : bet.status === 'lost' ? 'border-l-rose-500' : 'border-l-amber-500';
              return (
                <div key={bet.id} className={`rounded-xl overflow-hidden border border-slate-800/70 border-l-4 ${statusBorder} bg-slate-900/60`}>
                  <div className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        {bet.type === 'combo' ? (
                          <>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest flex items-center gap-1">
                              {bet.isCustom ? <><Layers className="w-2.5 h-2.5" /> Combi perso</> : <>Combo</>} · {bet.legs?.length} sélections
                            </p>
                            <p className="font-bold text-slate-100 truncate">{bet.label}</p>
                          </>
                        ) : (
                          <>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest flex items-center gap-1">
                              <span>{SPORTS[bet.sport]?.emoji}</span>
                              {bet.league} · {bet.time}
                            </p>
                            <p className="font-bold text-slate-100 truncate">{bet.match}</p>
                            <p className="text-xs text-amber-100 mt-0.5">
                              <span className="text-[9px] px-1 py-0.5 rounded bg-amber-950/60 border border-amber-900/60 uppercase tracking-wider mr-1.5">{bet.betType}</span>
                              {bet.pick}
                            </p>
                          </>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="mono text-lg font-bold gold-text">{Number(bet.odds).toFixed(2)}</p>
                        <p className="text-[10px] text-slate-500 mono">{formatAmount(bet.stake, betCur)} → {formatAmount(gain, betCur)}</p>
                      </div>
                    </div>

                    {bet.type === 'combo' && bet.legs && (
                      <div className="text-[10px] text-slate-500 space-y-0.5 mb-2 border-t border-slate-800/70 pt-2">
                        {bet.legs.map((leg, li) => (
                          <div key={li} className="flex items-center gap-1.5 truncate">
                            <span>{SPORTS[leg.sport]?.emoji}</span>
                            <span className="truncate">{leg.match} · {leg.pick}</span>
                            <span className="mono ml-auto">{Number(leg.odds).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {bet.status === 'pending' ? (
                      <>
                        {bet.lastCheckReason && (
                          <div className="mb-2 text-[10px] text-amber-300/80 flex items-start gap-1 bg-amber-950/20 border border-amber-900/40 rounded px-2 py-1.5">
                            <Info className="w-2.5 h-2.5 shrink-0 mt-0.5" />
                            <span className="italic">{bet.lastCheckReason}</span>
                          </div>
                        )}
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => updateBet(bet.id, 'won')} className="flex-1 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/60 text-xs font-bold py-2 rounded flex items-center justify-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Gagné
                          </button>
                          <button onClick={() => updateBet(bet.id, 'lost')} className="flex-1 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 text-xs font-bold py-2 rounded flex items-center justify-center gap-1">
                            <X className="w-3.5 h-3.5" /> Perdu
                          </button>
                          <button onClick={() => deleteBet(bet.id)} className="bg-slate-800/60 hover:bg-slate-700 text-slate-400 border border-slate-700 text-xs font-semibold py-2 px-3 rounded">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="border-t border-slate-800/70 mt-2 pt-2">
                        {(bet.resultInfo || bet.resultReason) && (
                          <div className="mb-1.5 text-[10px] text-slate-500 flex items-start gap-1">
                            <Sparkles className="w-2.5 h-2.5 text-amber-400 shrink-0 mt-0.5" />
                            <span>
                              {bet.resultInfo && <span className="text-slate-300 mono">{bet.resultInfo}</span>}
                              {bet.resultInfo && bet.resultReason && ' — '}
                              {bet.resultReason && <span className="italic">{bet.resultReason}</span>}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs">
                          <span className={`font-bold ${bet.status === 'won' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {bet.status === 'won' ? `✓ Gagné (+${formatAmount(gain - bet.stake, betCur)})` : `✗ Perdu (−${formatAmount(bet.stake, betCur)})`}
                          </span>
                          <div className="flex gap-2">
                            <button onClick={() => updateBet(bet.id, 'pending')} className="text-slate-500 hover:text-slate-300 text-[10px] underline">Rétablir</button>
                            <button onClick={() => deleteBet(bet.id)} className="text-slate-500 hover:text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {currentData?.timestamp && mainTab !== 'tracker' && (
          <p className="text-[10px] text-slate-600 text-center pt-2 uppercase tracking-widest">
            Généré à {new Date(currentData.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}

        <div className="bg-slate-900/40 border border-slate-800/70 rounded-lg p-3 mt-6 flex gap-2 items-start">
          <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-500 leading-relaxed">
            Données API-Sports. Cotes réelles bookmakers. Aucun gain garanti. 18+. Joue avec modération.
          </p>
        </div>
      </main>

      {customComboPicks.length > 0 && mainTab === 'picks' && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-amber-900/50 backdrop-blur-lg shadow-2xl shadow-amber-950/50" style={{ background: 'rgba(10, 14, 26, 0.95)' }}>
          {customComboOpen && (
            <div className="max-h-56 overflow-y-auto border-b border-slate-800/70 px-4 py-2">
              {customComboPicks.map(p => (
                <div key={p.id} className="flex items-center gap-2 py-1.5 text-xs">
                  <span>{SPORTS[p.sport]?.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-200 truncate font-medium">{p.match}</p>
                    <p className="text-slate-500 truncate">{p.pick}</p>
                  </div>
                  <span className="mono gold-text font-bold">{Number(p.odds).toFixed(2)}</span>
                  <button onClick={() => toggleCustom(p.id)} className="text-slate-500 hover:text-rose-400 p-1"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}

          {addingCustom ? (
            <div className="px-4 py-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400">Mise :</label>
                <input
                  type="number"
                  value={customStake}
                  onChange={(e) => setCustomStake(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm mono text-slate-100 focus:border-amber-400 focus:outline-none"
                  autoFocus
                />
                <span className="text-xs text-slate-400">{cur.symbol}</span>
                <button onClick={() => setAddingCustom(false)} className="text-xs text-slate-400 px-2 py-1.5">Annuler</button>
                <button
                  onClick={() => {
                    addComboBet({ label: 'Combi perso', totalOdds: customComboOdds }, customComboPicks, customStake, true);
                    setCustomCombo([]);
                    setCustomComboOpen(false);
                  }}
                  className="gold-gradient text-slate-950 text-xs font-bold px-3 py-1.5 rounded shadow"
                >
                  Suivre
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5 mono">
                Gain potentiel : {formatAmount(Number(customStake || 0) * customComboOdds, cur)}
              </p>
            </div>
          ) : (
            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <button onClick={() => setCustomComboOpen(!customComboOpen)} className="flex items-center gap-2 text-left min-w-0 flex-1">
                  <Layers className="w-4 h-4 gold-text shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-widest text-amber-200/70">Ton combi perso</p>
                    <p className="text-xs text-slate-300 truncate">
                      {customComboPicks.length} sél · Prob. {customComboProb}% · {formatAmount(cur.defaultStake, cur)} = <span className="mono text-slate-100 font-bold">{formatAmount(customComboOdds * cur.defaultStake, cur)}</span>
                    </p>
                  </div>
                </button>
                <div className="mono text-2xl font-bold gold-text shrink-0">{customComboOdds.toFixed(2)}</div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => { setCustomCombo([]); setCustomComboOpen(false); }} className="text-xs font-semibold py-2 rounded border border-slate-700 text-slate-400 hover:text-rose-400 hover:border-rose-800">Vider</button>
                <button onClick={() => setCustomComboOpen(!customComboOpen)} className="text-xs font-semibold py-2 rounded border border-slate-700 text-slate-300 hover:border-slate-500">{customComboOpen ? 'Réduire' : 'Détails'}</button>
                <button onClick={startAddCustom} className="text-xs font-bold py-2 rounded gold-gradient text-slate-950 shadow">Suivre</button>
              </div>
            </div>
          )}
        </div>
      )}

      {showCurrencyModal && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setShowCurrencyModal(false)}>
          <div className="w-full max-w-sm bg-slate-900 border border-amber-900/40 rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 gold-text" />
                <p className="font-bold text-slate-100">Choisir la devise</p>
              </div>
              <button onClick={() => setShowCurrencyModal(false)} className="text-slate-400 hover:text-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {Object.entries(CURRENCIES).map(([code, c]) => (
                <button
                  key={code}
                  onClick={() => changeCurrency(code)}
                  className={`w-full px-4 py-3 flex items-center justify-between border-b border-slate-800/60 text-left hover:bg-slate-800/40 transition ${currency === code ? 'bg-amber-950/30' : ''}`}
                >
                  <div>
                    <p className="font-bold text-slate-100 text-sm">{c.label} <span className="text-slate-500 font-normal">({c.symbol})</span></p>
                    <p className="text-[11px] text-slate-500">{c.name}</p>
                  </div>
                  {currency === code && <Check className="w-4 h-4 text-amber-400" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setShowSettings(false)}>
          <div className="w-full max-w-sm bg-slate-900 border border-amber-900/40 rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 gold-text" />
                <p className="font-bold text-slate-100">Paramètres</p>
              </div>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-amber-200/60 flex items-center gap-1 mb-1">
                  <Key className="w-3 h-3" /> Clé API-Sports actuelle
                </label>
                <p className="text-xs mono text-slate-400 mb-2 truncate">
                  {apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : 'Aucune'}
                </p>
                <label className="text-[10px] uppercase tracking-widest text-amber-200/60 mb-1 block">Nouvelle clé (optionnel)</label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="Colle une nouvelle clé"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm mono text-slate-100 focus:border-amber-400 focus:outline-none mb-2"
                />
                <button
                  onClick={saveApiKey}
                  disabled={!apiKeyInput.trim()}
                  className="w-full gold-gradient hover:brightness-110 disabled:opacity-30 text-slate-950 font-bold px-3 py-2 rounded-lg text-sm shadow"
                >
                  Mettre à jour la clé
                </button>
              </div>
              <div className="pt-3 border-t border-slate-800">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useProxy}
                    onChange={toggleProxy}
                    className="mt-1 accent-amber-400"
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-100">Utiliser un proxy CORS</p>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      Nécessaire dans la plupart des navigateurs (Chrome, Safari, Firefox) car API-Sports ne renvoie pas d'en-têtes CORS. Décoche uniquement si tu as un blocage réseau ou si tu déploies l'app avec un backend.
                    </p>
                  </div>
                </label>
              </div>
              <div className="pt-3 border-t border-slate-800">
                <a href="https://dashboard.api-sports.io/" target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-amber-300 underline">
                  Voir mon quota API restant <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Evaluate whether a pick won/lost/unclear based on the API fixture result
function evaluatePickOutcome(pick, fixture, sport) {
  if (sport === 'football') {
    const status = fixture.fixture?.status?.short;
    if (status !== 'FT' && status !== 'AET' && status !== 'PEN') {
      return { status: 'unclear', reason: `Match non terminé (${status || 'statut inconnu'})` };
    }
    const homeGoals = fixture.goals?.home;
    const awayGoals = fixture.goals?.away;
    if (homeGoals == null || awayGoals == null) {
      return { status: 'unclear', reason: 'Score indisponible' };
    }
    const score = `${fixture.teams.home.name} ${homeGoals}-${awayGoals} ${fixture.teams.away.name}`;
    return evaluateBet(pick, fixture, homeGoals, awayGoals, score);
  } else {
    const status = fixture.status?.short;
    if (status !== 'FT' && status !== 'AOT') {
      return { status: 'unclear', reason: `Match non terminé (${status || 'statut inconnu'})` };
    }
    const homeScore = fixture.scores?.home?.total ?? fixture.scores?.home;
    const awayScore = fixture.scores?.away?.total ?? fixture.scores?.away;
    if (homeScore == null || awayScore == null) {
      return { status: 'unclear', reason: 'Score indisponible' };
    }
    const score = `${fixture.teams.home.name} ${homeScore}-${awayScore} ${fixture.teams.away.name}`;
    return evaluateBet(pick, fixture, homeScore, awayScore, score);
  }
}

function evaluateBet(pick, fixture, homeScore, awayScore, scoreStr) {
  const homeName = fixture.teams.home.name;
  const awayName = fixture.teams.away.name;
  const pickText = (pick.pick || '').toLowerCase();
  const betType = (pick.betType || '').toLowerCase();

  // 1X2 / Winner
  if (/1x2|winner|vainqueur/i.test(betType)) {
    const homeWon = homeScore > awayScore;
    const awayWon = awayScore > homeScore;
    const draw = homeScore === awayScore;
    if (pickText.includes(homeName.toLowerCase()) || pickText.includes('victoire ' + homeName.toLowerCase())) {
      return { status: homeWon ? 'won' : 'lost', reason: `${homeName} ${homeWon ? 'a gagné' : (draw ? 'nul' : 'a perdu')}`, score: scoreStr };
    }
    if (pickText.includes(awayName.toLowerCase()) || pickText.includes('victoire ' + awayName.toLowerCase())) {
      return { status: awayWon ? 'won' : 'lost', reason: `${awayName} ${awayWon ? 'a gagné' : (draw ? 'nul' : 'a perdu')}`, score: scoreStr };
    }
    if (/nul|draw/i.test(pickText)) {
      return { status: draw ? 'won' : 'lost', reason: draw ? 'Match nul' : 'Pas de nul', score: scoreStr };
    }
    return { status: 'unclear', reason: 'Pick incompréhensible', score: scoreStr };
  }

  // BTTS
  if (/btts|both teams/i.test(betType)) {
    const bothScored = homeScore > 0 && awayScore > 0;
    const wantYes = /oui|yes/i.test(pickText);
    const wantNo = /non|no/i.test(pickText);
    if (wantYes) return { status: bothScored ? 'won' : 'lost', reason: bothScored ? 'Les 2 ont marqué' : 'Une équipe blanchie', score: scoreStr };
    if (wantNo) return { status: !bothScored ? 'won' : 'lost', reason: !bothScored ? 'Une équipe blanchie' : 'Les 2 ont marqué', score: scoreStr };
    return { status: 'unclear', reason: 'BTTS ambigu', score: scoreStr };
  }

  // Over/Under (extract number)
  if (/over\/under|total/i.test(betType)) {
    const match = pickText.match(/(\d+[.,]?\d*)/);
    if (match) {
      const threshold = parseFloat(match[1].replace(',', '.'));
      const total = homeScore + awayScore;
      const isOver = /plus de|over/i.test(pickText);
      const isUnder = /moins de|under/i.test(pickText);
      if (isOver) return { status: total > threshold ? 'won' : 'lost', reason: `Total ${total} vs seuil ${threshold}`, score: scoreStr };
      if (isUnder) return { status: total < threshold ? 'won' : 'lost', reason: `Total ${total} vs seuil ${threshold}`, score: scoreStr };
    }
    return { status: 'unclear', reason: 'Seuil O/U non détecté', score: scoreStr };
  }

  return { status: 'unclear', reason: `Type de pari non géré (${betType})`, score: scoreStr };
}
