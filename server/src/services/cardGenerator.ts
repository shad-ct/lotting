import { randomBytes } from 'node:crypto';

/**
 * Balanced, seeded, unique card generator (01 §4). PURE — no DB access.
 *
 * Repair-by-swap (own words): after dealing the balanced multiset into chunks,
 * some card may hold the same number twice. Pick such a duplicate cell (i,j)
 * and a random cell (a,b) on another card and EXCHANGE the two values — but
 * only if neither card already contains the incoming value. Because a swap
 * only moves values between cards, the global count of every number never
 * changes, so the "each number appears exactly N times" balance is preserved
 * while duplicates strictly decrease. If repair stalls, the whole deal is
 * retried with the next derived seed (bounded); then we fail loudly.
 */

export interface GeneratorConfig {
  playerCount: number;
  cardSize: number;
  maxNumber: number;
  maxOverlap?: number | null;
}

export interface GenerationStats {
  seed: string;
  perNumberCounts: { min: number; max: number };
  maxPairwiseOverlap: number;
  meanPairwiseOverlap: number;
  attemptsUsed: number;
  generatedAt: string;
}

export interface GenerateResult {
  cards: number[][];
  stats: GenerationStats;
}

export const MAX_REPAIR_ITERATIONS = 200_000;
export const MAX_DEAL_RETRIES = 50;

/** FNV-1a 32-bit string hash → uint32 seed. */
export function hashSeedString(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, well-known, seedable PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newSeed(): string {
  return randomBytes(16).toString('hex');
}

function fisherYates<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/** Target occurrence counts per number (balanced or near-balanced). */
function targetCounts(playerCount: number, cardSize: number, maxNumber: number): number[] {
  const total = playerCount * cardSize;
  const base = Math.floor(total / maxNumber);
  const extra = total - base * maxNumber; // first `extra` numbers get +1
  const counts = new Array<number>(maxNumber).fill(base);
  for (let i = 0; i < extra; i++) counts[i] += 1;
  return counts;
}

function findDupe(cards: number[][]): { i: number; j: number } | null {
  for (let i = 0; i < cards.length; i++) {
    const seen = new Set<number>();
    for (let j = 0; j < cards[i].length; j++) {
      if (seen.has(cards[i][j])) return { i, j };
      seen.add(cards[i][j]);
    }
  }
  return null;
}

function randInt(rng: () => number, n: number): number {
  return Math.floor(rng() * n);
}

function canonicalKey(card: number[]): string {
  return [...card].sort((a, b) => a - b).join('-');
}

function pairwiseOverlap(a: Set<number>, b: Set<number>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

function overlapStats(cards: number[][]): { max: number; mean: number } {
  const sets = cards.map((c) => new Set(c));
  let max = 0;
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const o = pairwiseOverlap(sets[i], sets[j]);
      if (o > max) max = o;
      sum += o;
      pairs++;
    }
  }
  return { max, mean: pairs === 0 ? 0 : sum / pairs };
}

export function generateCards(config: GeneratorConfig, seed: string): GenerateResult {
  const { playerCount, cardSize, maxNumber, maxOverlap } = config;
  if (!Number.isInteger(playerCount) || playerCount <= 0) throw new Error('INVALID_PLAYER_COUNT');
  if (!Number.isInteger(cardSize) || cardSize <= 0) throw new Error('INVALID_CARD_SIZE');
  if (!Number.isInteger(maxNumber) || maxNumber <= 0) throw new Error('INVALID_MAX_NUMBER');
  if (cardSize > maxNumber) {
    throw new Error('IMPOSSIBLE_CONFIG: cardSize > maxNumber');
  }
  if (maxOverlap != null && (maxOverlap < 0 || maxOverlap >= cardSize)) {
    throw new Error('INVALID_MAX_OVERLAP');
  }

  const counts = targetCounts(playerCount, cardSize, maxNumber);
  let attemptsUsed = 0;
  let cards: number[][] = [];

  for (let attempt = 0; attempt <= MAX_DEAL_RETRIES; attempt++) {
    attemptsUsed = attempt + 1;
    const rng = mulberry32(hashSeedString(`${seed}:${attempt}`));

    const slots: number[] = [];
    for (let n = 1; n <= maxNumber; n++) {
      for (let k = 0; k < counts[n - 1]; k++) slots.push(n);
    }
    fisherYates(slots, rng);
    cards = [];
    for (let i = 0; i < playerCount; i++) {
      cards.push(slots.slice(i * cardSize, (i + 1) * cardSize));
    }

    // Repair duplicates by validity-preserving swaps.
    let repaired = false;
    for (let iter = 0; iter < MAX_REPAIR_ITERATIONS; iter++) {
      const dupe = findDupe(cards);
      if (!dupe) {
        repaired = true;
        break;
      }
      const { i, j } = dupe;
      const a = randInt(rng, playerCount);
      if (a === i) continue;
      const b = randInt(rng, cardSize);
      const va = cards[i][j];
      const vb = cards[a][b];
      if (va === vb) continue;
      if (cards[i].includes(vb)) continue;
      if (cards[a].includes(va)) continue;
      cards[i][j] = vb;
      cards[a][b] = va;
    }
    if (!repaired) continue;

    // Uniqueness as sets: fix identical cards with the same swap rule.
    const seenKeys = new Map<string, number>();
    let unique = true;
    for (let idx = 0; idx < cards.length; idx++) {
      const key = canonicalKey(cards[idx]);
      const other = seenKeys.get(key);
      if (other != null) {
        unique = false;
        // Try to break the tie with a validity-preserving swap.
        let fixed = false;
        for (let t = 0; t < 5000; t++) {
          const a = randInt(rng, playerCount);
          if (a === idx || a === other) continue;
          const j = randInt(rng, cardSize);
          const b = randInt(rng, cardSize);
          const va = cards[idx][j];
          const vb = cards[a][b];
          if (va === vb) continue;
          if (cards[idx].includes(vb)) continue;
          if (cards[a].includes(va)) continue;
          cards[idx][j] = vb;
          cards[a][b] = va;
          fixed = true;
          break;
        }
        if (!fixed) break;
        // restart uniqueness scan
        seenKeys.clear();
        idx = -1;
        unique = true;
        continue;
      }
      seenKeys.set(key, idx);
    }
    if (!unique) continue;

    // Optional overlap cap.
    if (maxOverlap != null) {
      const sets = cards.map((c) => new Set(c));
      let ok = true;
      for (let t = 0; t < 50_000; t++) {
        let worst = -1;
        let worstPair: [number, number] | null = null;
        for (let i = 0; i < sets.length && worstPair == null; i++) {
          for (let j = i + 1; j < sets.length; j++) {
            const o = pairwiseOverlap(sets[i], sets[j]);
            if (o > maxOverlap && o > worst) {
              worst = o;
              worstPair = [i, j];
            }
          }
        }
        if (!worstPair) break;
        const [i, j] = worstPair;
        // Swap one element of card i with a third card to reduce overlap.
        let improved = false;
        for (let t2 = 0; t2 < 200 && !improved; t2++) {
          const a = randInt(rng, playerCount);
          if (a === i || a === j) continue;
          const pi = randInt(rng, cardSize);
          const pa = randInt(rng, cardSize);
          const va = cards[i][pi];
          const vb = cards[a][pa];
          if (va === vb) continue;
          if (cards[i].includes(vb)) continue;
          if (cards[a].includes(va)) continue;
          cards[i][pi] = vb;
          cards[a][pa] = va;
          sets[i] = new Set(cards[i]);
          sets[a] = new Set(cards[a]);
          improved = true;
        }
        if (!improved) {
          ok = false;
          break;
        }
        void worst;
      }
      // Re-verify cap strictly — never silently ignore it.
      const finalStats = overlapStats(cards);
      if (!ok || finalStats.max > maxOverlap) continue;
    }

    // Layout: shuffle each card's positions.
    for (const card of cards) fisherYates(card, rng);

    // Final validation before returning.
    assertValid(cards, config);
    const perNumber = countOccurrences(cards, maxNumber);
    const ov = overlapStats(cards);
    return {
      cards,
      stats: {
        seed,
        perNumberCounts: { min: Math.min(...perNumber), max: Math.max(...perNumber) },
        maxPairwiseOverlap: ov.max,
        meanPairwiseOverlap: Math.round(ov.mean * 100) / 100,
        attemptsUsed,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  throw new Error(`CARD_GENERATION_FAILED after ${MAX_DEAL_RETRIES + 1} attempts`);
}

function countOccurrences(cards: number[][], maxNumber: number): number[] {
  const counts = new Array<number>(maxNumber).fill(0);
  for (const card of cards) for (const n of card) counts[n - 1]++;
  return counts;
}

function assertValid(cards: number[][], config: GeneratorConfig): void {
  const keys = new Set<string>();
  for (const card of cards) {
    if (card.length !== config.cardSize) throw new Error('INVALID_CARD_LENGTH');
    const set = new Set(card);
    if (set.size !== card.length) throw new Error('DUPLICATE_NUMBER_IN_CARD');
    for (const n of card) {
      if (!Number.isInteger(n) || n < 1 || n > config.maxNumber) throw new Error('NUMBER_OUT_OF_RANGE');
    }
    const key = canonicalKey(card);
    if (keys.has(key)) throw new Error('DUPLICATE_CARD');
    keys.add(key);
  }
}
