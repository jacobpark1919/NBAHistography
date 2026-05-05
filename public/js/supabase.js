// Data is fetched via Supabase Edge Function (bypasses RLS)

// ── Deduplication helpers ─────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'the','a','an','in','of','at','to','and','or','for','on','with','by','as',
  'is','was','were','be','been','has','had','have','that','this','it','he',
  'she','they','his','her','their','from','into','after','before','when',
  'who','which','would','could','will','all','first','one','two','also',
  'new','than','more','most','became','become','over','about','out','not',
  'are','per','set','its','after','during'
]);

function normalize(text) {
  if (!text) return new Set();
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w))
  );
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) { if (b.has(w)) intersection++; }
  return intersection / (a.size + b.size - intersection);
}

function buildDateIndex(events) {
  const index = {};
  for (const e of events) {
    if (!index[e.date]) index[e.date] = [];
    index[e.date].push(normalize(e.description));
  }
  return index;
}

function neighborDates(dateStr) {
  const ms = new Date(dateStr + 'T00:00:00Z').getTime();
  return [-1, 0, 1].map(d =>
    new Date(ms + d * 86400000).toISOString().slice(0, 10)
  );
}

function isDuplicate(event, nbaIndex, threshold = 0.1) {
  const words = normalize(event.description);
  for (const date of neighborDates(event.event_date)) {
    for (const candidate of (nbaIndex[date] || [])) {
      if (jaccard(words, candidate) >= threshold) return true;
    }
  }
  return false;
}

// ── Main loader ───────────────────────────────────────────────────────────────

async function loadEvents() {
  const res = await fetch(
    'https://oyklvvbokossvubkhctj.supabase.co/functions/v1/hoopstography-data'
  );

  if (!res.ok) throw new Error(`Edge function error: ${res.status}`);

  const { nbaData, sportsData } = await res.json();

  console.log('[supabase] nba_events:', nbaData.length);
  console.log('[supabase] sports_events raw:', sportsData.length);

  const nbaIndex = buildDateIndex(nbaData.filter(e => e.date));

  const nbaEvents = nbaData
    .filter(e => e.date)
    .map(e => ({
      date: e.date,
      desc: e.description,
      title: '',
      imp: 1,
      cat: 'milestone',
      source: 'nba.com/history'
    }));

  const hoopsIndex = {};
  const sportsEvents = [];
  for (const e of sportsData) {
    if (!e.event_date || e.sport !== 'Basketball' || !e.description) continue;
    if (isDuplicate(e, nbaIndex) || isDuplicate(e, hoopsIndex)) continue;
    sportsEvents.push({
      date: e.event_date,
      desc: e.description,
      title: e.title || '',
      imp: 1,
      cat: 'milestone',
      source: 'hoopsrewind.app'
    });
    if (!hoopsIndex[e.event_date]) hoopsIndex[e.event_date] = [];
    hoopsIndex[e.event_date].push(normalize(e.description));
  }

  console.log('[supabase] sports_events after filter:', sportsEvents.length);

  return [...nbaEvents, ...sportsEvents];
}