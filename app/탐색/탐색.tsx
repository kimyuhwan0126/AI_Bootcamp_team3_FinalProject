'use client';
/* 홈의 '가운데 찾기' — 로그인도 모임도 없이 **써 보면서** 무엇을 해 주는 곳인지 알게 하는 자리.

   전에는 홈이 `[모임 만들기]` 와 `[코드 넣기]` 둘뿐인 갈림길이었다. 처음 온 사람은
   무엇을 해 주는 곳인지 모른 채 둘 중 하나를 골라야 했다. 출발지를 넣어 가운데가 잡히는 것을
   한 번 보면 설명이 필요 없다 (예전판 기록 §1).

   출발지 검색·고르기는 `app/originfield.tsx` 를 그대로 쓴다 — 만들기·참여와 한 벌이어야
   고칠 곳이 하나로 남는다(그 파일 머리말). 다만 그 칸은 '한 곳'을 받는 물건이라
   여기서는 **고른 것을 곧바로 목록으로 옮기고 칸을 새로 단다**(아래 `칸비우기`). */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import OriginField, { type Origin, type Transport } from '../originfield';
import { 실어보내기, 두고간것읽기, 두고가기 } from '@/lib/넘기기';
import type { RouteStep } from '@/lib/routes';
import 지도 from './지도';
import s from './탐색.module.css';

/* 예전판과 같은 한도 — 모임 정원도 8이다 */
const 최대 = 8;

/* 한국 밖은 안 받는다 (논의55·60). 판정하는 상자는 `lib/geo.ts` 의 `한국안` 이지만
   그 파일은 불러오는 순간 DB 연결을 만들어 브라우저에서는 못 쓴다 — 같은 상자를 여기 한 번 더 적는다.
   (옮기자는 이야기는 보고에 적었다.) */
const 한국안 = (lat: number, lng: number) =>
  lat >= 33 && lat <= 38.7 && lng >= 124.5 && lng <= 132;

/* 같은 곳을 두 번 넣지 않는다. 이름만 보면 '스타벅스'가 하나뿐이 되고,
   좌표만 보면 같은 건물의 다른 출입구가 두 곳이 된다 — 둘을 함께 본다. */
const 열쇠 = (o: Origin) => `${o.name}@${o.lat.toFixed(5)},${o.lng.toFixed(5)}`;

/* 출발지 하나의 경로 — 지도에 그리는 좌표(points)와, 아래 '출발지별 상세'에 쓰는
   시간·거리·구간별 안내(steps)를 한 번의 /api/routes 호출로 같이 얻는다(2026-08-17). */
type 상세경로 = { id: string; points: { lat: number; lng: number }[]; distanceM: number | null; durationS: number | null; steps?: RouteStep[] };

/* ── 가운데를 잡는 기준 (2026-08-17) ──────────────────────────
   '거리'만 있으면 다들 오는 데 걸리는 실제 시간은 다르다는 것을 맛보기 화면에서도
   보여 달라는 요청 — 대중교통·차 사정에 따라 지리적 가운데가 늘 최선은 아니다.
   시간·AI는 실제로 뜻이 있으려면 출발지가 둘 이상이어야 한다. */
type 기준값 = '거리' | '시간' | 'AI';
const 기준목록: { key: 기준값; 이름: string }[] = [
  { key: '거리', 이름: '거리' }, { key: '시간', 이름: '시간' }, { key: 'AI', 이름: 'AI' },
];
const 기준설명: Record<기준값, string> = {
  거리: '참가자들의 출발지 한가운데를 잡아요.',
  시간: '다 같이 오는 데 걸리는 시간이 가장 적게 드는 곳을 찾아요.',
  AI: '여러 조건을 살펴 AI가 장소를 추천해요.',
};

type 점 = { lat: number; lng: number };
/* 같은 자리를 두 번 안 잰다 — 소수 5자리(약 1m)까지 같으면 같은 후보로 친다 */
const 좌표중복빼기 = (pts: 점[]): 점[] => {
  const seen = new Set<string>();
  return pts.filter((p) => {
    const k = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
};
/* 시간을 재 볼 후보 자리 — 출발지 전부를 다 후보로 두면(N명) 잴 거리가 N×N으로 늘어난다.
   출발지가 4곳 이하면 각자의 자리 + 지리적 가운데(최대 5곳)를, 그보다 많으면 가운데에서
   가장 먼 4곳 + 가운데(역시 최대 5곳)만 잰다 — 실제로 가운데를 밀어낼 힘이 큰 자리들이다. */
/* ⚠ 2026-08-17 뒤처리 — 처음엔 후보를 '출발지 자신들 + 지리적 가운데'로만 두었다.
   그런데 둘만 넣으면(가장 흔한 경우) 후보가 딱 셋(그 둘 + 가운데)뿐이라, 둘 다에게서
   먼 자기 출발지는 거의 늘 지는 패라 사실상 지리적 가운데를 다시 뽑는 것과 똑같았다 —
   "시간" 기준이 "거리" 기준과 똑같은 자리를 내놓는 것처럼 보인다는 신고(Vercel 스크린샷).
   출발지 자신은 후보에서 빼고, 대신 가운데를 중심으로 실제 넓이(출발지들이 흩어진 정도)에
   맞춘 원형 격자 8곳을 더한다 — 대중교통 노선은 직선이 아니니, 가운데에서 살짝 벗어난
   자리가 오히려 평균 시간이 더 짧을 수 있다. 여전히 참 최적화는 아니다(격자 한 바퀴뿐이다)
   — 출발지 수와 상관없이 늘 9곳(가운데 1 + 격자 8)으로 호출 수를 묶어 둔다. */
function 시간후보들(출발지들: Origin[]): 점[] {
  const n = 출발지들.length;
  const 중심 = { lat: 출발지들.reduce((a, o) => a + o.lat, 0) / n, lng: 출발지들.reduce((a, o) => a + o.lng, 0) / n };
  if (n < 2) return [중심];
  const la = 출발지들.map((o) => o.lat), ln = 출발지들.map((o) => o.lng);
  /* 흩어진 정도의 절반 — 이만큼 벗어난 자리까지 살펴본다. 다 붙어 있으면(같은 동네) 격자도
     좁게 잡는다 — 옆 동네까지 튀어 나가면 뜻이 없다. */
  const 반경lat = Math.max((Math.max(...la) - Math.min(...la)) / 2, 0.01);
  const 반경lng = Math.max((Math.max(...ln) - Math.min(...ln)) / 2, 0.01);
  const 격자: 점[] = [];
  for (let i = 0; i < 8; i++) {
    const 각 = (i / 8) * 2 * Math.PI;
    /* 반경의 절반만큼만 벌린다 — 끝까지 벌리면 참가자 중 누군가보다도 먼 자리가 나온다 */
    격자.push({ lat: 중심.lat + Math.sin(각) * 반경lat * 0.5, lng: 중심.lng + Math.cos(각) * 반경lng * 0.5 });
  }
  return 좌표중복빼기([중심, ...격자]);
}
/* 후보마다 모두의 실제 이동시간(/api/routes, 이번 세션에 만든 카카오 대중교통·TMAP 연동)을
   재서 평균이 가장 짧은 곳을 고른다 — 몇 사람 것을 못 구해도(길이 없거나 잠시 막혀도)
   구한 것만으로 평균을 낸다. 아무도 하나도 못 구한 후보는 버린다. */
async function 시간가운데찾기(출발지들: Origin[], transport: Transport): Promise<(점 & { 평균분: number }) | null> {
  const 후보들 = 시간후보들(출발지들);
  const 평가 = await Promise.all(후보들.map(async (cand) => {
    const 시간들 = await Promise.all(출발지들.map(async (o) => {
      try {
        const qs = new URLSearchParams({
          fromLat: String(o.lat), fromLng: String(o.lng),
          toLat: String(cand.lat), toLng: String(cand.lng), mode: transport,
        });
        const r = await fetch(`/api/routes?${qs}`);
        if (!r.ok) return null;
        const j = await r.json();
        return j.found && Number.isFinite(j.durationS) ? (j.durationS as number) : null;
      } catch { return null; }
    }));
    const 구한것 = 시간들.filter((t): t is number => t != null);
    return 구한것.length ? { ...cand, 합: 구한것.reduce((a, b) => a + b, 0), 답수: 구한것.length } : null;
  }));
  const 살아남은 = 평가.filter((x): x is NonNullable<typeof x> => !!x);
  if (!살아남은.length) return null;
  살아남은.sort((a, b) => a.합 / a.답수 - b.합 / b.답수);
  const 최선 = 살아남은[0];
  return { lat: 최선.lat, lng: 최선.lng, 평균분: Math.round(최선.합 / 최선.답수 / 60) };
}

/* ⚠ **가운데 둘레 지점 목록(음식점·카페 등)을 없앴다** (2026-08-14) — 맛보기 화면은
   '가운데가 어디로 잡히는지' 만 보여 주면 충분한데, 그 아래 실제 가게·주차장 목록까지
   나오면 마치 지금 뭔가를 고르는 화면처럼 보인다. 그건 로그인해서 모임에 들어간 뒤
   지점을 고를 때(`app/m/[code]`)의 일이다 — 여기서 미리 보여 주면 같은 것을 두 번 하는
   셈이고, `/api/places` 를 홈에 들를 때마다 부르는 값도 없었다. */

export default function 탐색() {
  /* 두고 간 것을 읽기 전에는 출발지 칸을 안 단다 — 먼저 달면 그 칸이 스스로 얹는 기본 출발지가
     두고 간 목록보다 앞서 들어와 순서가 뒤엉킨다 */
  const [준비, set준비] = useState(false);
  const [출발지들, set출발지들] = useState<Origin[]>([]);
  const [이동수단, set이동수단] = useState<Transport>('transit');
  const [칸키, set칸키] = useState(0);
  const [알림, set알림] = useState('');
  /* 가운데를 잡는 기준 — 거리(기본)·시간·AI. AI 는 지금은 안내만 하고 실제로 안 부른다(2026-08-17,
     Ollama 쪽 설정이 아직 안 맞음 — lib/ai.ts 참고). */
  const [기준, set기준] = useState<기준값>('거리');
  const [시간가운데, set시간가운데] = useState<(점 & { 평균분: number }) | null>(null);
  const [시간상태, set시간상태] = useState<'idle' | '구하는중' | '못구함'>('idle');

  /* 새로 단 출발지 칸은 **스스로** 내정보의 기본 출발지·이동 수단을 얹는다(originfield.tsx).
     그건 사람이 고른 것이 아니다 — 칸을 새로 달 때마다 기본값이 또 얹히면
     사람이 뺀 출발지가 되살아나고, 골라 둔 이동 수단이 매번 되돌아간다.
     자식의 첫 효과가 부모 효과보다 **먼저** 도는 성질을 써서 한 번만 흘려보낸다. */
  const 자동출발지무시 = useRef(false);
  const 자동이동수단무시 = useRef(false);
  /* 이 줄은 아래 두 효과보다 **먼저** 적혀 있어야 한다 — 같은 그리기에서는 적힌 차례대로 돈다 */
  useEffect(() => { 자동출발지무시.current = false; 자동이동수단무시.current = false; });

  useEffect(() => {
    const 두고간것 = 두고간것읽기();
    /* `null` 은 '두고 간 것이 없다', `[]` 는 '두고 갔는데 다 뺐다'.
       뒤엣것에 기본 출발지를 다시 얹으면 방금 뺀 것이 새로고침마다 살아난다 */
    if (두고간것) { set출발지들(두고간것); 자동출발지무시.current = true; }
    set준비(true);
  }, []);

  const 바꾸기 = (다음: Origin[]) => { set출발지들(다음); 두고가기(다음); };

  /* 검색칸을 새로 단다. 칸 안의 검색어를 밖에서 지울 길이 없어서다 —
     그냥 두면 방금 넣은 곳이 목록에 계속 떠 있고, 그것을 또 누르면 아무 일도 안 일어난다. */
  const 칸비우기 = () => {
    자동출발지무시.current = true; 자동이동수단무시.current = true;
    set칸키((v) => v + 1);
  };

  const 고름 = (o: Origin | null) => {
    if (!o) return;
    if (자동출발지무시.current) return;
    if (!한국안(o.lat, o.lng)) { set알림('한국 안에서만 가운데를 잡아 줘요'); 칸비우기(); return; }
    if (출발지들.length >= 최대) { set알림(`출발지는 ${최대}곳까지 넣을 수 있어요`); 칸비우기(); return; }
    if (출발지들.some((p) => 열쇠(p) === 열쇠(o))) { set알림('이미 넣은 출발지예요'); 칸비우기(); return; }
    set알림('');
    바꾸기([...출발지들, o]);
    칸비우기();
  };

  const 이동수단정하기 = (t: Transport) => {
    if (자동이동수단무시.current) return;
    set이동수단(t);
  };

  const 빼기 = (i: number) => {
    set알림('');
    바꾸기(출발지들.filter((_, k) => k !== i));
  };

  /* 모두의 출발지 가운데 — `app/m/[code]/ui.tsx:302` 와 **같은 셈**이다.
     두 화면이 다른 가운데를 말하면 홈에서 본 자리와 모임에서 여는 자리가 어긋난다. */
  const 가운데 = 출발지들.length
    ? { lat: 출발지들.reduce((a, o) => a + o.lat, 0) / 출발지들.length,
        lng: 출발지들.reduce((a, o) => a + o.lng, 0) / 출발지들.length }
    : null;

  /* '시간' 기준을 고르면 다시 잰다 — 출발지·이동수단이 바뀔 때마다, 손을 멈추면(350ms)
     한 번만 부른다(originfield.tsx 의 이름 찾기와 같은 결). 둘 미만이면 잴 것이 없다. */
  const 출발지서명 = 출발지들.map((o) => `${o.lat},${o.lng}`).join('|');
  useEffect(() => {
    if (기준 !== '시간' || 출발지들.length < 2) { set시간가운데(null); set시간상태('idle'); return; }
    let 살아있나 = true;
    set시간상태('구하는중');
    const t = setTimeout(() => {
      시간가운데찾기(출발지들, 이동수단).then((결과) => {
        if (!살아있나) return;
        if (결과) { set시간가운데(결과); set시간상태('idle'); }
        else { set시간가운데(null); set시간상태('못구함'); }
      }).catch(() => { if (살아있나) { set시간가운데(null); set시간상태('못구함'); } });
    }, 350);
    return () => { 살아있나 = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [기준, 출발지서명, 이동수단]);

  /* 지도에 실제로 얹을 가운데 — AI 는 아직 실제로 안 부르니 핀을 안 띄운다(아래 안내문이 대신 말한다).
     시간은 구하는 동안·못 구했을 때 거리 기준으로 잠깐 대신 보여 준다 — 지도가 비어 보이는 것보다는 낫다. */
  const 지도가운데 = 기준 === 'AI' ? null : 기준 === '시간' && 시간가운데 ? 시간가운데 : 가운데;

  /* 핀 이름표는 "가운데"·"시간상 가운데" 같은 우리 말이 아니라 그 자리의 실제 지명을
     보여 준다(2026-08-22, 사용자 요청 — "지역명이든 지점명이든"). 이미 지역 미리보기가
     쓰는 것과 같은 되짚기(/api/geo, app/m/[code]/ui.tsx:583)를 홈에서도 쓴다.
     점이 바뀌면 옛 이름부터 버린다(먼저 null) — 안 그러면 새 점으로 옮겨가는 잠깐
     동안 예전 지명이 잘못 붙어 있는다. 바다 근처·국외처럼 못 찾는 자리도 있어(503)
     그때는 기본 문구로 돌아간다 — 이름표가 아예 비는 것보다 낫다. */
  const [가운데지명, set가운데지명] = useState<string | null>(null);
  useEffect(() => {
    set가운데지명(null);
    if (!지도가운데) return;
    let 살아있나 = true;
    const { lat, lng } = 지도가운데;
    const t = setTimeout(() => {
      fetch(`/api/geo?lat=${lat}&lng=${lng}`).then((r) => (r.ok ? r.json() : null))
        .then((g) => { if (살아있나) set가운데지명(g?.name ?? null); })
        .catch(() => { if (살아있나) set가운데지명(null); });
    }, 350);
    return () => { 살아있나 = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [지도가운데?.lat, 지도가운데?.lng]);
  const 지도가운데라벨 = 가운데지명 ?? (기준 === '시간' && 시간가운데 ? '시간상 가운데' : '가운데');

  /* 출발지마다 지금 뜬 가운데까지 오는 길 (2026-08-17, 사용자 요청) — 모임 화면과 같은
     /api/routes 를 쓴다. 지도가운데가 바뀔 때마다(거리↔시간을 오가거나, 시간 계산이 끝나
     '거리 대신 보여 주던 자리'에서 '진짜 시간상 자리'로 넘어갈 때도) 다시 잰다.
     AI 는 가운데 자체가 없으니(위) 여기서도 자동으로 빈다. */
  const [경로들, set경로들] = useState<상세경로[]>([]);
  /* 부르는 중인지 — '출발지별 상세'가 결과 없음과 구하는 중을 다른 말로 보여 준다 */
  const [경로구하는중, set경로구하는중] = useState(false);
  useEffect(() => {
    const 목적지 = 지도가운데;
    if (!목적지 || !출발지들.length) { set경로들([]); set경로구하는중(false); return; }
    let 살아있나 = true;
    set경로구하는중(true);
    const t = setTimeout(async () => {
      const 결과 = await Promise.all(출발지들.map(async (o) => {
        try {
          const qs = new URLSearchParams({
            fromLat: String(o.lat), fromLng: String(o.lng),
            toLat: String(목적지.lat), toLng: String(목적지.lng), mode: 이동수단,
          });
          const r = await fetch(`/api/routes?${qs}`);
          if (!r.ok) return null;
          const j = await r.json();
          if (!j.found) return null;
          return {
            id: 열쇠(o), points: (Array.isArray(j.points) ? j.points : []) as 점[],
            distanceM: j.distanceM ?? null, durationS: j.durationS ?? null,
            steps: Array.isArray(j.steps) ? (j.steps as RouteStep[]) : undefined,
          } as 상세경로;
        } catch { return null; }
      }));
      if (살아있나) { set경로들(결과.filter((x): x is 상세경로 => !!x)); set경로구하는중(false); }
    }, 350);
    return () => { 살아있나 = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [지도가운데?.lat, 지도가운데?.lng, 출발지서명, 이동수단]);

  /* '출발지별 상세'에서 지금 펼친 것들 — 토글형이라 여럿을 한꺼번에 펼쳐 볼 수 있다
     (하나만 펼치는 아코디언이 아니다. 몇 명 안 되는 자리라 다 펼쳐 놓고 견줘 봐도 좋다). */
  const [펼친출발지, set펼친출발지] = useState<Set<string>>(new Set());
  const 토글 = (key: string) => set펼친출발지((전) => {
    const 다음 = new Set(전);
    if (다음.has(key)) 다음.delete(key); else 다음.add(key);
    return 다음;
  });

  /* 지도 밑 한 줄 — 기준마다 다른 말을 한다(사용자 요청, 2026-08-17).
     둘 미만이면 기준과 상관없이 '더 넣어 달라'가 우선이다 — 그 전까지는 어느 기준을 골라도 잴 게 없다. */
  const 지도밑문구 = 출발지들.length === 0
    ? '출발지를 2곳 이상 넣으면 가운데와 그 둘레를 보여 드려요.'
    : 출발지들.length === 1
      ? '출발지를 하나 더 넣으면 두 곳의 가운데를 잡아 줘요.'
      : 기준 === '거리' ? 기준설명.거리
      : 기준 === '시간'
        ? 시간상태 === '구하는중' ? `${기준설명.시간} 찾는 중…`
          : 시간상태 === '못구함' ? '지금은 도착 시간을 계산하지 못했어요 — 거리 기준으로 대신 보여 드려요.'
          : 시간가운데 ? `${기준설명.시간} 평균 ${시간가운데.평균분}분쯤 걸려요.`
          : 기준설명.시간
      : `${기준설명.AI} 아직 준비 중이에요 — 곧 붙일게요.`;

  /* ── 만들기 폼으로 ───────────────────────────────────────
     **링크**로 둔다. 주소가 있는 자리로 가는 길이라 새 탭·오래 눌러 열기가 되어야 하고,
     자바스크립트가 아직 안 붙은 동안에도 눌리면 만들기로 가야 한다.
     짐은 누를 때 싣는다 — Link 는 같은 문서 안에서 옮겨 가므로 실어 둔 것이 그대로 살아 있다
     (lib/넘기기.ts). 새 탭으로 열면 문서가 새로 뜨니 짐은 없던 것이 되고, 폼은 기본값으로 뜬다. */
  function 짐싣기() {
    /* 목록 전체를 실어 보낸다 — 만들기 폼(app/new/page.tsx)이 첫 곳을 방장의 출발지로
       미리 채워 두되, 여기서 잡은 나머지도 '바꾸기'를 누르면 골라 담을 수 있다
       (2026-08-17, 첫 곳이 늘 방장 것은 아니라는 실사용 신고로 바뀌었다).
       고르지 않은 나머지는 아직 안 온 사람들 것일 수 있다 — 그들은 참여할 때 각자 넣는다. */
    실어보내기({ 출발지들, 이동수단 });
  }

  /* 가운데 좌표는 눈으로 못 읽는다(지도 위 핀뿐이다) — 그 셈이 맞는지 시험이 볼 수 있게 적어 둔다.
     지금 화면에 실제로 뜬 가운데(기준에 따라 거리·시간이 다를 수 있다)를 적는다 — 시험은
     이 값으로 '고른 기준이 실제로 지도에 반영됐는지'까지 잴 수 있다. */
  return (
    <section className={s.칸} data-slot="탐색" data-출발지수={출발지들.length} data-기준={기준}
      data-가운데={지도가운데 ? `${지도가운데.lat},${지도가운데.lng}` : ''}>
      {/* 옛 판 홈에는 '가운데 찾기' 라는 제목도 딸린 설명도 없었다.
          큰 검색칸이 "어디에서 출발하시나요?" 라고 스스로 묻는다 — 물음이 곧 안내다.
          홈은 훑는 자리라 칸마다 설명을 붙이면 화면이 글로 덮인다. */}

      {/* 출발지 칸을 새로 달아 검색어를 비운다 — 위 `칸비우기` 주석 참고 */}
      {준비 && (
        <OriginField key={칸키} origin={null} setOrigin={고름} 쓰임="탐색"
          transport={이동수단} setTransport={이동수단정하기} />
      )}

      {/* 넣은 출발지 알약 줄. 점선 원 ＋(출발지 더 넣기)는 오늘(2026-08-14) 없앴다 — 사람이 정했다.
          바로 위 검색칸이 늘 열려 있어서 같은 일을 하는 둘째 단추였다. 하나도 안 넣었을 때는
          알약도 없으니 이 줄 자체를 안 그린다 — 빈 자리를 남기지 않는다. */}
      {!!출발지들.length && (
        <ul className={s.알약들}>
          {출발지들.map((o, i) => (
            <li key={열쇠(o)} className={s.알약}>
              <span className={s.알약이름}>{o.name}</span>
              <button type="button" onClick={() => 빼기(i)} aria-label={`${o.name} 빼기`}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <p className={s.잔글}>
        {출발지들.length ? `${출발지들.length}곳 넣었어요 · 최대 ${최대}곳까지 넣을 수 있어요.`
          : `최대 ${최대}곳까지 넣을 수 있어요.`}
      </p>
      {알림 && <p className="warn" style={{ margin: '0 0 10px', fontSize: 12.5 }}>{알림}</p>}

      {/* 가운데를 잡는 기준 — 거리·시간·AI (사용자 요청, 2026-08-17). 지도 바로 위에 두어
          '이 지도가 무엇을 기준으로 그려졌는지'가 한눈에 보이게 한다. 출발지가 하나도 없을
          때도 보여 준다 — 눌러서 무엇을 해 주는 자리인지 미리 알 수 있게(둘레 설명은 아래
          지도밑문구 가 맡는다). */}
      <div className={s.기준줄} data-slot="기준">
        <span className={s.기준이름}>가운데를 잡는 기준</span>
        <div className="segs">
          {기준목록.map((k) => (
            <button key={k.key} type="button" className="seg" aria-pressed={기준 === k.key}
              onClick={() => set기준(k.key)}>{k.이름}</button>
          ))}
        </div>
      </div>

      <div className={s.지도칸}>
        <지도
          출발지들={출발지들.map((o) => ({ 이름: o.name, lat: o.lat, lng: o.lng }))}
          가운데={지도가운데} 가운데라벨={지도가운데라벨} 경로들={경로들} />
      </div>

      {/* 옛 판은 지도 아래에 이 한 줄을 **늘** 뒀다 — 무엇을 하면 무엇이 나오는지 미리 말해 준다.
          지금은 기준(거리·시간·AI)에 따라 다른 말을 한다 — 위 지도밑문구 에서 다 정했다.
          data-slot 은 시험이 붙잡는 자리다 — CSS 모듈이 한글 클래스명을 해시로 바꿔 버려
          클래스로는 못 찾는다(지도.tsx 와 같은 사정). */}
      <p className={s.지도밑} data-slot="지도밑">{지도밑문구}</p>

      {/* 이동 수단 — 옛 판 홈에는 없던 칸이다(거기서는 내정보에만 있었다).
          우리는 이 값을 만들기 폼으로 실어 보내므로 여기 남긴다. 다만 **지도 아래**로 내렸다:
          위쪽은 검색 → 출발지 → 지도 로 이어지는 옛 판의 흐름을 그대로 두려는 것이다. */}
      <div className={s.이동칸}>
        <span className={s.이동이름}>이동 수단</span>
        <div className="segs">
          {/* originfield.tsx 와 같은 잣대 — 값은 'transit' 하나로 합쳤지만 글자는 '대중교통' 만 보인다 */}
          {([['transit', '대중교통'], ['car', '자동차']] as const).map(([k, t]) => (
            <button key={k} type="button" className="seg" aria-pressed={이동수단 === k}
              onClick={() => 이동수단정하기(k)}>{t}</button>
          ))}
        </div>
      </div>

      <Link className="cta" href="/new" onClick={짐싣기}>
        {출발지들.length ? '이 출발지들로 모임 만들기' : '＋ 모임 만들기'}
      </Link>
      {출발지들.length > 1 && (
        <p className="mut" style={{ margin: '6px 0 0' }}>
          {/* 2026-08-17 — 첫 곳이 늘 방장 것은 아니라는 신고로 만들기 폼에 '바꾸기' 로 고르는
             길이 생겼다(app/originfield.tsx 의 quickPicks). 여기 안내도 그에 맞춰 고쳤다 —
             예전엔 "폼에는 첫 출발지만 들어가요" 라고 해서, 나머지를 고를 수 있다는 걸 몰랐다. */}
          폼에는 첫 출발지로 채워져요 — 바꾸기를 누르면 여기서 잡은 곳 중 고를 수 있어요.
        </p>
      )}

      {/* 출발지별 상세 — 이동시간·상세 경로(어떻게 이동하는지)·이동 수단을 하나씩 펼쳐 본다
          (사용자 요청, 2026-08-17). 위 '가운데 둘레 지점 목록을 없앴다'(2026-08-14, 이 위
          주석)와는 다른 물건이다 — 그건 고를 자리(가게·카페) 목록이라 아직 모임도 없는
          자리에서 고르는 화면처럼 보이는 게 문제였다. 이건 고르는 게 아니라 '내가 넣은
          출발지에서 어떻게 오는지'를 보는 것이라, 실제로 가운데가 잡혀 있을 때만 뜻이
          있다 — AI 기준(가운데가 아직 없다)이거나 출발지가 하나뿐이면 안 보인다. */}
      {지도가운데 && 출발지들.length >= 2 && (
        <div className={s.상세칸} data-slot="출발지별상세">
          <span className={s.상세이름}>출발지별 상세</span>
          <ul className={s.상세목록}>
            {출발지들.map((o) => {
              const key = 열쇠(o);
              const r = 경로들.find((x) => x.id === key);
              const 열림 = 펼친출발지.has(key);
              const 시간표시 = r?.durationS != null ? `${Math.round(r.durationS / 60)}분`
                : r ? '경로 없음' : 경로구하는중 ? '찾는 중…' : '—';
              return (
                <li key={key} className={s.상세행}>
                  <button type="button" className={s.상세토글} aria-expanded={열림}
                    onClick={() => 토글(key)}>
                    <span className={s.상세토글이름}>{o.name}</span>
                    <span className={s.상세토글시간}>{시간표시}</span>
                    <span className={s.상세화살표} data-열림={열림 || undefined} aria-hidden>▾</span>
                  </button>
                  {열림 && (
                    <div className={s.상세내용}>
                      <p className={s.상세수단}>{이동수단 === 'car' ? '자동차로 이동' : '대중교통으로 이동'}</p>
                      {!r ? (
                        <p className="mut">{경로구하는중 ? '경로를 찾는 중이에요…' : '경로를 아직 못 찾았어요.'}</p>
                      ) : r.steps?.length ? (
                        /* 구간별 안내 — 카카오가 준 문장 그대로("2호선 (왕십리 > 성수)" 같은 식).
                           자차(TMAP)는 이런 구간이 없다 — steps 가 비어 아래 else 로 빠진다. */
                        <ol className={s.단계들}>
                          {r.steps.map((st, i) => (
                            <li key={i}>
                              <span className={s.단계아이콘} aria-hidden>
                                {st.type === 'SUBWAY' ? '🚇' : st.type === 'BUS' ? '🚌'
                                  : st.type === 'WALKING' ? '🚶' : '•'}
                              </span>
                              {/* 문장과 '· N분'을 한 span 에 같이 둔다 — 따로 두면(형제 flex 항목)
                                  글이 길어 줄바꿈될 때 시간 배지가 뚝 떨어져 나가 보였다(실사용 신고,
                                  스크린샷) — 같은 글줄 안에 있어야 문장 끝에 자연히 붙어 줄바꿈된다. */}
                              <span className={s.단계글}>
                                {st.guidance}
                                {st.durationS != null && <span className="mut"> · {Math.round(st.durationS / 60)}분</span>}
                              </span>
                            </li>
                          ))}
                        </ol>
                      ) : r.durationS != null ? (
                        <p className="mut">
                          {r.distanceM != null ? `${(r.distanceM / 1000).toFixed(1)}km · ` : ''}
                          {Math.round(r.durationS / 60)}분
                        </p>
                      ) : (
                        <p className="mut">여기까지 가는 경로를 찾지 못했어요.</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
