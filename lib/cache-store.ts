// ─────────────────────────────────────────────────────────────
// cache-store.ts — 외부 API 응답의 영속 캐시 (L2) · **자체 서버 디스크**
//
//  `lib/routing.ts` 의 메모리 Map(L1) 은 서버를 재시작하면 사라진다. 그러면
//  유료 호출을 처음부터 다시 한다(실측: 재시작 직후 첫 조회 2,896ms / 외부 14콜).
//  그 아래에 디스크 계층을 하나 둔다.
//
//    L1 메모리 → (근거리 단락) → L2 여기(디스크) → L3 외부 API
//
//  왜 자체 서버 디스크인가 — Neon(클라우드 DB)이 아니라
//   · 캐시는 "빠르려고" 두는 것인데 네트워크 너머에 두면 그 목적이 약해진다.
//   · Neon 무료는 100 CU-hours/월이다. 캐시 조회가 그 한도를 계속 갉아먹는다.
//   · 자체 서버는 디스크가 자유롭고 조회가 프로세스 안에서 끝난다.
//
//  저장 방식 — 추가 기록(append-only JSONL) + 메모리 색인
//   · 시작할 때 파일을 한 번 읽어 Map 으로 만든다. 이후 조회는 전부 메모리다.
//   · 쓸 때는 줄 하나를 덧붙인다. 통째로 다시 쓰지 않아 빠르고, 중간에 죽어도
//     마지막 한 줄만 깨질 뿐 앞부분은 멀쩡하다(깨진 줄은 읽을 때 건너뛴다).
//   · 같은 키를 다시 쓰면 뒤 줄이 이긴다. 줄이 너무 불어나면 압축한다.
//   · SQLite 를 쓰지 않은 이유: 네이티브 모듈이라 서버에도 빌드가 필요하고
//     🔒 package.json 을 또 건드려야 한다. 이 규모(수만 건)에는 과하다.
//
//  ⚠️ TTL 은 필수다. 대중교통 소요시간은 시간대·요일에 따라 달라져 낡은 값이
//     계속 나오면 안 된다. (ODsay 약관의 "결과 데이터 저장" 조항도 임시 캐시와
//     영구 축적을 가르는데, PoC 단계에서는 그쪽을 판단 근거로 삼지 않기로 했다.)
//  ⚠️ 개인정보를 담지 않는다. "강남역 → 좌표", "좌표쌍 → 분" 같은 공개 지리
//     정보뿐이다. 참가자의 실제 출발지는 `participants` 가 갖고 모임과 함께 지워진다.
// ─────────────────────────────────────────────────────────────
import { appendFile, mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";

/** 지오코딩 TTL — 역·건물 좌표는 거의 변하지 않는다. */
const GEO_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * 이동시간 TTL — 6시간.
 * 한 번의 모임 계획 과정(수 분~수 시간)은 캐시가 받쳐 주면서,
 * 아침 값이 저녁에 나오는 일은 막는 선.
 */
const ROUTE_TTL_MS = 6 * 60 * 60 * 1000;

/** 압축 기준 — 파일 줄 수가 살아있는 항목 수의 이 배를 넘으면 다시 쓴다. */
const COMPACT_RATIO = 3;
/** 그 전에 최소 이만큼은 쌓여야 압축한다 (작은 파일을 계속 다시 쓰지 않게). */
const COMPACT_MIN_LINES = 500;

const DIR = join(process.cwd(), ".cache");
const FILE = join(DIR, "api-cache.jsonl");

interface Entry {
  /** 만료 시각 (epoch ms) */
  e: number;
  /** 값 — 좌표 객체이거나 분(숫자) */
  v: unknown;
}
/** 파일에 한 줄로 적히는 형태 */
interface Line extends Entry {
  k: string;
}

const mem = new Map<string, Entry>();
let lineCount = 0;
let loaded: Promise<void> | null = null;

/**
 * 파일을 한 번만 읽어 메모리 색인을 만든다.
 *
 * 실패해도 throw 하지 않는다 — 캐시는 있으면 좋은 것이지 필수가 아니다.
 * 파일이 없으면(첫 실행) 그냥 빈 상태로 시작한다.
 */
function ensureLoaded(): Promise<void> {
  if (loaded) return loaded;
  loaded = (async () => {
    try {
      const text = await readFile(FILE, "utf8");
      const now = Date.now();
      for (const raw of text.split("\n")) {
        const line = raw.trim();
        if (!line) continue;
        try {
          const o = JSON.parse(line) as Line;
          if (!o || typeof o.k !== "string") continue;
          lineCount++;
          // 만료된 것은 색인에 넣지 않는다. 압축 때 파일에서도 사라진다.
          if (typeof o.e === "number" && o.e > now) mem.set(o.k, { e: o.e, v: o.v });
          else mem.delete(o.k);
        } catch {
          // 마지막 줄이 쓰다 만 상태일 수 있다 — 그 줄만 버린다.
        }
      }
    } catch {
      // 파일 없음/읽기 실패 → 빈 캐시로 시작
    }
  })();
  return loaded;
}

async function put(k: string, v: unknown, ttlMs: number): Promise<void> {
  await ensureLoaded();
  const e = Date.now() + ttlMs;
  mem.set(k, { e, v });
  try {
    await mkdir(DIR, { recursive: true });
    await appendFile(FILE, JSON.stringify({ k, e, v } satisfies Line) + "\n", "utf8");
    lineCount++;
    if (lineCount > COMPACT_MIN_LINES && lineCount > mem.size * COMPACT_RATIO) void compact();
  } catch {
    // 디스크에 못 써도 이번 프로세스 동안은 메모리 색인이 받쳐 준다.
  }
}

async function get(k: string): Promise<unknown | null> {
  await ensureLoaded();
  const hit = mem.get(k);
  if (!hit) return null;
  if (hit.e <= Date.now()) {
    mem.delete(k);
    return null;
  }
  return hit.v;
}

/**
 * 살아있는 항목만 남기고 파일을 다시 쓴다.
 *
 * 임시 파일에 쓰고 이름을 바꾼다 — 도중에 죽어도 기존 파일이 깨지지 않는다.
 */
let compacting = false;
async function compact(): Promise<void> {
  if (compacting) return;
  compacting = true;
  try {
    const now = Date.now();
    const lines: string[] = [];
    for (const [k, { e, v }] of mem) {
      if (e > now) lines.push(JSON.stringify({ k, e, v } satisfies Line));
    }
    const tmp = FILE + ".tmp";
    await mkdir(DIR, { recursive: true });
    await writeFile(tmp, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
    await rename(tmp, FILE);
    lineCount = lines.length;
  } catch {
    // 압축 실패는 기능에 영향이 없다 — 파일이 좀 더 길어질 뿐이다.
  } finally {
    compacting = false;
  }
}

// ── 지오코딩 ──────────────────────────────────────────────────

export interface CachedCoord {
  lat: number;
  lng: number;
}

export async function geoCacheGet(q: string): Promise<CachedCoord | null> {
  const v = await get(`geo:${q}`);
  if (!v || typeof v !== "object") return null;
  const c = v as Partial<CachedCoord>;
  return typeof c.lat === "number" && typeof c.lng === "number" ? { lat: c.lat, lng: c.lng } : null;
}

export async function geoCacheSet(q: string, c: CachedCoord): Promise<void> {
  await put(`geo:${q}`, { lat: c.lat, lng: c.lng }, GEO_TTL_MS);
}

// ── 이동시간 ──────────────────────────────────────────────────

export async function routeCacheGet(k: string): Promise<number | null> {
  const v = await get(`route:${k}`);
  return typeof v === "number" ? v : null;
}

export async function routeCacheSet(k: string, minutes: number): Promise<void> {
  await put(`route:${k}`, minutes, ROUTE_TTL_MS);
}

// ── 진단 ──────────────────────────────────────────────────────

/** 현재 캐시 상태 — 진단 라우트에서 쓰라고 열어 둔다. */
export async function cacheStats(): Promise<{ entries: number; lines: number; file: string }> {
  await ensureLoaded();
  return { entries: mem.size, lines: lineCount, file: FILE };
}
