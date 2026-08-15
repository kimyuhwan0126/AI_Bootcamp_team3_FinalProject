'use client';
/* 모임 화면 하나. 단계는 분기로 가른다 — 단계마다 파일을 만들면 공통 부분이 복제된다.
   서버가 준 MeetingView 만 보고 그린다. 화면은 SQL 도 규칙도 모른다. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeetingView, Action, Kind, Going } from '@/lib/types';
import OsmMap from './osmmap';
import { instantToKst, formatKst } from '@/lib/time';
import TimePicker from '../../timepicker';

declare global { interface Window { kakao: any } }

/* 화면에 보이는 말은 하나로 (그릴링 논의24 · 71 · 72) — 지역 · 지점 · 선택.
   '투표 · 표 · 동네 · 가게 · 마감' 은 화면에 안 쓴다. 코드 낱말(region/place)은 그대로 둔다.
   몇 사람이 골랐는지는 늘 "3명이 골랐어요" 한 문장으로 말한다 — 지도 핀처럼 좁은 자리만
   숫자로 두되 읽어 주는 말(aria-label)에 같은 문장을 넣는다 (논의72). */
/* 지점은 확정된 지역 근처에서 고른다 (그릴링 논의32).
   반경은 모임마다 다를 수 있다 — meetings.radius_m 을 그대로 쓴다.
   상수로 박아 두면 DB 값을 바꿔도 화면만 다른 반경으로 막는다. */
const RADIUS_FALLBACK_M = 700;

/* 지점이 정해진 뒤, 각자 오는 길을 지도로 보여준다 (2026-08-15) — 대중교통은 ODsay,
   자차는 TMAP. 사람마다가 아니라 이동수단마다 색을 가른다 — "이 선은 대중교통, 저 선은
   차" 가 알고 싶은 것이지 누구 선인지는 목록(글)이 이미 말해 준다. */
const 경로색: Record<'transit' | 'car', string> = { transit: '#2f6bff', car: '#f59e0b' };
type RouteFetch =
  | { st: 'loading' }
  | { st: 'error' }
  | { st: 'ok'; points: { lat: number; lng: number }[]; distanceM: number | null; durationS: number | null; found: boolean };
const dist = (a: number, b: number, c: number, d: number) => {
  const R = 6371000, r = Math.PI / 180;
  const dp = (c - a) * r, dl = (d - b) * r;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/* 단계는 이름으로 부른다 (논의117) — ①②③ 는 화면 번호 전용이라 여기 쓰지 않는다.
   '확정됨' 은 위쪽 배지에서만 쓰는 낱말이다 (논의111) — 문장 안에 넣지 않는다. */
const STAGE_LABEL: Record<string, string> = {
  region: '지역 정하는 중', place: '지점 정하는 중',
  result: '확정됨',
};
const KIND_LABEL: Record<Kind, string> = { region: '지역', place: '지점' };

/* 몇 사람이 골랐는지 (논의72) — 좁은 자리를 뺀 모든 곳이 이 한 문장을 쓴다 */
/* 두 곳에서 쓰는 문구는 lib/말.ts 한 곳에 둔다 — 지도(osmmap)도 같은 말을 쓴다 */
import { 고른수, 아직 } from '@/lib/말';

/* 신호등은 셋 (논의116) — 시간이 정해지면 켜지고, 다시 눌러 바꾼다 (논의115).
   값은 서버가 가진다(participants.going) — 이 기기에만 남기면 남이 못 보고,
   남이 못 보면 논의116 의 "모두에게 알린다" 가 서지 않는다. 갈래 이름은 lib/types 의 Going 하나. */
const 신호등: { key: Going; 불: string; 말: string }[] = [
  { key: 'go', 불: '🟢', 말: '제때 가요' },
  { key: 'late', 불: '🟡', 말: '늦어요' },
  { key: 'no', 불: '🔴', 말: '못 가요' },
];
/* 사람 줄에 붙이는 말 — 단추와 같은 낱말을 쓴다(두 벌이면 한쪽만 고치고 잊는다).
   아직 안 누른 사람도 반드시 자리를 갖는다: 켠 사람만 보이면 '안 누른 사람'과 '못 가는 사람'이
   빈칸 하나로 뭉개진다. */
const 신호말 = (g: Going | null) => {
  const 불 = 신호등.find((x) => x.key === g);
  return 불 ? `${불.불} ${불.말}` : '⚪ 아직 안 알렸어요';
};

/* 'D+9' 도 '마감' 도 쓰지 않는다 (논의73) — 읽히는 말로 적는다 */
const 며칠전 = (iso: string | null): string => {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (Number.isNaN(t)) return '';
  const 날 = Math.floor((Date.now() - t) / 86_400_000);
  return 날 < 0 ? '' : 날 === 0 ? '오늘' : 날 === 1 ? '어제' : `${날}일 전`;
};

/* 조사는 앞 글자 받침이 고른다 — 이름이 값으로 들어오는 문장은 사람이 미리 고를 수 없다.
   '메가커피으로 정했어요', '확정됨 이에요' 가 그대로 화면에 나갔다.
   한글은 유니코드로 정확히, 숫자·영문은 읽는 소리로 어림한다. 0 = 받침 없음, 8 = ㄹ. */
const 받침 = (word: string): number => {
  const s = (word ?? '').trim();
  if (!s) return 0;
  const last = s[s.length - 1];
  const c = last.charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28;
  if (last >= '0' && last <= '9') return '178'.includes(last) ? 8 : '036'.includes(last) ? 1 : 0;
  const en = last.toLowerCase();
  if (en >= 'a' && en <= 'z') return en === 'l' || en === 'r' ? 8 : 'mn'.includes(en) ? 1 : 0;
  return 0;
};
/* 을/를 · 이에요/예요 · 과/와 처럼 받침 하나로 갈리는 것 */
const 조사 = (word: string, 받는말: string, 안받는말: string) => (받침(word) ? 받는말 : 안받는말);
/* '으로/로' 만 ㄹ 이 예외다 — 서울로, 연필로 */
const 으로 = (word: string) => { const j = 받침(word); return j === 0 || j === 8 ? '로' : '으로'; };

/* 무슨 일인지 서버가 말해 주지 못했을 때 (본문이 비었거나 모르는 코드).
   무엇을 하면 되는지까지 말한다 — '실패'만 띄우면 다음 손짓을 알 수 없다. */
const FAILED = '잠시 문제가 생겼어요 — 다시 해 주세요';

export default function UI({ code, first }: { code: string; first: MeetingView }) {
  const [v, setV] = useState(first);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  /* 모임이 지워지면 화면도 닫혀야 한다 — 404 를 조용히 버리면
     지워진 모임을 계속 그리고, 뭘 눌러도 아무 말 없이 실패한다 */
  const [gone, setGone] = useState(false);
  /* AI 는 20초까지 걸린다 — 그동안 버튼이 흐려지기만 하면 뭘 기다리는지 모른다 (논의38 ③) */
  const [aiBusy, setAiBusy] = useState(false);
  /* AI 는 단계마다 몇 번까지다 (논의93) — 다 쓰고 나서 막히면 당황스러우니 미리 말한다.
     서버가 부를 때마다 남은 횟수를 실어 준다. 아직 한 번도 안 불렀으면 모른다(null). */
  const [aiLeft, setAiLeft] = useState<number | null>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const marks = useRef<any[]>([]);
  /* 참가자 출발지 핀(후보 marks 와 따로 관리 — 고르는 대상이 아니라서 뭉침 계산도 안 받는다) */
  const originMarks = useRef<any[]>([]);
  /* 확정된 지역의 범위(원) — 지점을 고르는 자리가 어디까지인지 지도에 그려 준다.
     표시가 없으면 스크롤하다 딴 동네를 고를 수 있다(실사용 신고). 색은 당근마켓 것을
     임시로 빌렸다 — 기능이 자리 잡으면 그때 우리 색으로 바꾼다. */
  const regionCircle = useRef<any>(null);
  /* 참가자별 이동 경로 선(카카오 Polyline) — 2026-08-15 */
  const routePolylines = useRef<any[]>([]);
  /* 뭉치느라 지도에서 뗀 핀 — 다시 흩을 때 되돌릴 대상이 누구인지 알아야 한다 */
  const hiddenIds = useRef<Set<string>>(new Set());

  const reload = useCallback(async () => {
    const r = await fetch(`/api/m/${code}`, { cache: 'no-store' }).catch(() => null);
    if (!r) return;                                   /* 잠깐 끊긴 것뿐일 수 있다 — 다음 신호를 기다린다 */
    if (r.status === 404) { setGone(true); return; }
    if (!r.ok) return;
    const j = await r.json().catch(() => null);
    if (j) setV(j);
  }, [code]);

  /* 남이 고른 것이 바로 보이게 — 서버가 밀어 준다.
     새 연결은 서버가 횟수를 센다(lib/ratelimit.ts 'stream', 배포 점검 §3⑦) — 여기서는
     그 한도를 계속 두들기지 않는다. 브라우저 기본 재연결은 딱 붙는 즉시 다시 시도한다 —
     망이 잠깐 끊겼다 바로 돌아오면 괜찮지만, 막힌 채로 계속되면(429) 그 리듬 그대로 두들긴다.
     그래서 재연결은 우리가 쥔다: 열리면(onopen) 물러남을 0으로 되돌리고, 안 열리면
     점점 크게 물러난다(1→2→4→…→최대 20초). '몇 초 뒤에 다시'라는 서버의 답(retry-after)은
     EventSource 가 JS 에 안 보여 주므로 못 읽는다 — 대신 늘어나는 물러남으로 같은 뜻을 이룬다. */
  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let 그만 = false;
    let 물러난횟수 = 0;

    const 붙기 = () => {
      if (그만) return;
      es = new EventSource(`/api/m/${code}/stream`);
      es.onopen = () => { 물러난횟수 = 0; };
      es.onmessage = (e) => { if (e.data === 'changed') reload(); };
      es.onerror = () => {
        es?.close();
        if (그만) return;
        const 기다림 = Math.min(20_000, 1000 * 2 ** 물러난횟수);
        물러난횟수++;
        timer = setTimeout(붙기, 기다림);
      };
    };
    붙기();

    return () => {
      그만 = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [code, reload]);

  /* 오류는 화면 위에 잠시 띄운다 (그릴링 논의26 ③).
     시트 맨 아래에 두면 후보가 몇 곳만 쌓여도 화면 밖으로 밀려 아무 것도 안 보였다. */
  const errTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback((msg: string) => {
    setErr(msg);
    if (errTimer.current) clearTimeout(errTimer.current);
    errTimer.current = setTimeout(() => setErr(''), 4000);
  }, []);
  useEffect(() => () => { if (errTimer.current) clearTimeout(errTimer.current); }, []);

  /* 방장이 되돌리면 참여자 화면이 예고 없이 바뀐다 — 확인을 받고 넘어간다 (그릴링 논의28).
     내가 누른 되돌리기는 스스로 아는 일이니 묻지 않는다. */
  const [rewound, setRewound] = useState<string | null>(null);
  /* 앞으로 넘어간 것도 알린다 — 내가 고르는 순간 방장이 확정하면
     내 표가 조용히 사라진 것처럼 보인다 (그릴링 논의40 ④) */
  const [moved, setMoved] = useState<{ from: string; to: string } | null>(null);
  const [tieOpen, setTieOpen] = useState(false);
  /* 뭉쳐서 하나로 합친 핀을 누르면 그 안을 펼친다 (그릴링 논의38 ②) */
  const [clusterIds, setClusterIds] = useState<string[] | null>(null);
  /* 긴 이름은 한 줄로 잘린다 — 누르면 펼친다. 참여자는 모임 설정을 못 열어
     달리 전체를 볼 길이 없다 (그릴링 논의40 ①) */
  const [nameOpen, setNameOpen] = useState(false);
  /* 지점은 '누른 자리 주변 지점'에서 고른다 (그릴링 논의32) — 지역 이름이 후보로 오르지 않게 */
  const [near, setNear] = useState<{ loading: boolean; at: { lat: number; lng: number } | null;
    list: { id: string; name: string; address: string; lat: number; lng: number }[] } | null>(null);
  /* 지점 고르기에서 지도만 누르는 게 아니라 이름으로도 찾을 수 있게 — 확정된 지역
     반경 안으로 좁혀 찾는다(app/originfield.tsx 의 '이름으로 찾기'와 같은 결). */
  const [qPlace, setQPlace] = useState('');
  const [placeHits, setPlaceHits] = useState<
    { id: string; name: string; address: string; lat: number; lng: number }[] | null>(null);
  const [place문제, setPlace문제] = useState<string | null>(null);
  const placeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* 모임 설정 — 참여자도 열어 볼 수 있다 (논의118). 고치는 것은 방장만 */
  const [settings, setSettings] = useState(false);
  const [sName, setSName] = useState('');
  const [sAt, setSAt] = useState('');
  /* 지도를 누르면 곧바로 후보가 되지 않는다 — 먼저 미리보기 (논의81 · 120).
     한 번 더 눌러야 후보가 된다. 다른 곳을 누르면 미리보기가 그리로 옮겨간다. */
  const [preview, setPreview] = useState<
    { kind: Kind; refId: string; name: string; lat: number; lng: number; address?: string } | null>(null);
  /* 시트는 손잡이로 키우고 줄인다 (논의82) — 손잡이는 맨 윗줄과 요약 줄 둘 다.
     세 자리로 **정착**한다: mini(요약 줄만 남기고 지도를 거의 다 보여 준다) · default(기본) · big.
     ⚠ 2026-08-15 — mini 가 여기 없었다. 예전판(v8)엔 '지도 전체화면 보기' 라는 이름으로 있던
     것이 재작성 때 안 옮겨 왔다 — 사람이 실제로 찾다가 없어진 것을 알아챘다.
     ⚠ 처음엔 24px 문턱을 넘는 순간 딱 정착 자리로 점프했다 — 사람이 손가락을 눈으로
     좇을 수 없어 "이산적이다, 손 위치를 따라가야 한다" 고 다시 고쳤다. 지금은 끄는 동안
     손가락 y 를 그대로 시트 높이(dragH, px)로 옮긴다 — 매 프레임 시트가 손 밑에 붙어 있다.
     손을 떼는 순간에만 가장 가까운 정착 자리(mini·default·big)를 골라 그리로 부드럽게
     스냅한다(css transition, 드래그 중엔 그 transition 을 꺼 즉시 반응하게 한다). */
  type 시트단계 = 'mini' | 'default' | 'big';
  const [sheetStage, setSheetStage] = useState<시트단계>('default');
  /* 끄는 동안만 값이 있다 — 있으면 이 픽셀 값이 sheetStage 보다 우선한다(아래 style 참고) */
  const [dragH, setDragH] = useState<number | null>(null);
  /* 지난 모임은 확정된 곳만 크게, 기록은 접어 둔다 (논의74) */
  const [howOpen, setHowOpen] = useState(false);
  /* 알림 쪽지는 시트가 올라오면 그 위로 (논의108) — 평소엔 css 가 정한 화면 위쪽.
     쪽지 높이는 글자 수에 따라 달라진다 — 위가 아니라 아래를 시트 머리에 맞춘다. */
  const [toastUp, setToastUp] = useState<number | null>(null);
  /* 손잡이를 끌 때 잡아 두는 자리 (논의82). startH 는 끌기 시작한 순간의 시트 실제 높이(px) —
     여기서부터 손가락이 움직인 만큼(-dy) 더해 나간다. */
  const 끌기 = useRef<{ y: number; startH: number; moved: boolean } | null>(null);
  /* 정착 자리 셋을 실제 픽셀로 — mini 는 손잡이(요약 줄) 높이에 맞춘 고정값(sheetmini 실측 76px),
     default·big 은 dvh 를 그때그때 뷰포트로 환산한다(회전·주소창 접힘으로 뷰포트가 바뀔 수 있어
     매번 다시 잰다 — 값을 어딘가에 캐시해 두면 오래된 뷰포트 기준으로 어긋난다). */
  const 시트픽셀 = (stage: 시트단계) => {
    const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
    return stage === 'mini' ? 76 : stage === 'big' ? vh * 0.82 : vh * 0.56;
  };

  /* 시트는 한 번에 하나만 (그릴링 논의? — 다섯이 같은 z-index 라 겹치면 뒤엣것이 안 보인 채 살아 있다).
     낡은 시트는 단계가 지난 뒤에도 눌려 wrong_stage 만 돌려받았다. */
  const closeSheets = useCallback(() => {
    setNear(null); setClusterIds(null); setTieOpen(false);
    setSettings(false); setMoved(null); setRewound(null);
    /* 미리보기도 시트와 같이 닫는다 (논의81) — 단계가 지난 뒤에 눌리면 wrong_stage 만 돌아온다 */
    setPreview(null);
  }, []);
  /* Esc 로도 닫힌다 — 바깥 클릭만 되면 키보드만 쓰는 사람은 시트에 갇힌다 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSheets(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeSheets]);

  const prevStage = useRef(first.meeting.stage);
  const iReopened = useRef(false);
  useEffect(() => {
    const now = v.meeting.stage;
    const ORDER = ['region', 'place', 'result'];
    const 앞 = ORDER.indexOf(prevStage.current), 지금 = ORDER.indexOf(now);
    /* 단계가 바뀌면 열어 둔 시트는 이미 낡았다 — 누르면 wrong_stage 만 돌아온다 */
    if (지금 !== 앞) closeSheets();
    if (지금 < 앞) {
      /* 단계 이름 대신 무엇을 다시 고르는지로 적는다 (논의111 · 117) */
      if (!iReopened.current) setRewound(KIND_LABEL[now as Kind] ?? '지역');
      iReopened.current = false;
    } else if (지금 > 앞 && !v.me.isHost) {
      /* 단계를 넘긴 건 방장이다 — 방장 자신은 자기가 눌러 안다 */
      setMoved({ from: prevStage.current, to: now });
    }
    prevStage.current = now;
  }, [v.meeting.stage, v.me.isHost, closeSheets]);

  /* 마무리된 뒤에도 시트가 열려 있으면 눌러 봐야 closed 만 돌아온다 */
  useEffect(() => { if (v.meeting.closed_at) closeSheets(); }, [v.meeting.closed_at, closeSheets]);

  /* 오류 코드를 사람 말로. 번역표가 send() 안에만 있어서 flash('quota_kakao') 가
     영문 그대로 화면에 떴다(전수 조사에서 확인) — 표를 밖으로 꺼낸다.
     표에 없는 코드는 코드 그대로 나갔다(unknown_action·cannot_kick_host·name_required 실측).
     서버가 낼 수 있는 코드를 전부 담고, 그래도 모르는 것은 일반 문구로 덮는다 —
     영문 코드는 어떤 경우에도 사용자에게 보이지 않아야 한다. */
  const say = useCallback((code: string) => ({
    ai_unavailable: 'AI 추천을 지금 부를 수 없어요',
    quota_kakao: v.me.isHost ? '카카오 무료 사용량을 다 썼어요 — 콘솔에서 한도를 늘려 주세요'
                             : '지금은 장소를 찾을 수 없어요',
    forbidden: '방장만 할 수 있어요',
    not_member: '먼저 참여해야 해요',
    closed: '이미 끝난 모임이에요',
    wrong_stage: '지금 단계에서는 할 수 없어요',
    nothing_decided: '아직 아무 곳도 정해지지 않았어요 — 먼저 확정해 주세요',
    nothing_to_undo: '더 되돌릴 게 없어요',
    already_joined: '이미 이 모임에 들어와 있어요',
    awaiting_approval: '방장의 승인을 기다리는 중이에요',
    pin_wrong: 'PIN 이 달라요',
    not_pending: '지금은 승인할 수 없어요',
    ref_required: '고른 곳을 알 수 없어요 — 다시 눌러 주세요',
    bad_coords: '여긴 고를 수 없어요',
    origin_required: '출발지를 골라 주세요',
    not_found: '찾을 수 없어요',
    name_required: '이름을 적어주세요',
    name_taken: '같은 이름이 있어요 — 별칭을 붙여주세요',
    cannot_kick_host: '방장은 내보낼 수 없어요',

    kicked_out: '이 모임에서 내보내졌어요',
    unknown_action: '지금은 할 수 없어요',
    pin_required: 'PIN 네 자리를 적어주세요',
    /* 논의125 — 넘기기를 없애서 방장은 못 나간다. 빠지고 싶으면 모임을 지운다 */
    host_cannot_leave: '방장은 모임에서 나갈 수 없어요 — 모임을 지워 주세요',
    login_required: '모임을 만들려면 로그인해 주세요',
    geo_unavailable: '여긴 고를 수 없어요 — 지역 안을 눌러 주세요',
    /* 그릴링 논의46 — 서버가 1위만 받는다 */
    not_top: '가장 많은 사람이 고른 곳만 정할 수 있어요',
    no_votes: '아직 아무도 안 골랐어요 — 한 곳이라도 골라야 정할 수 있어요',
    bad_kind: '지금 단계에서는 고를 수 없어요',
    bad_time: '시간을 2026-08-20 18:30 처럼 골라 주세요',
    bad_transport: '이동수단을 다시 골라 주세요',
    name_too_long: '이름이 너무 길어요',
    bad_json: '잠시 뒤에 다시 해 주세요',
    /* 기다리면 된다는 것을 말한다 (논의101) — 그래야 마구 누르지 않는다 */
    places_unavailable: '지금은 주변 지점을 불러올 수 없어요 — 잠시 뒤에 다시 해 주세요',
    bad_radius: '이 자리는 고를 수 없어요 — 지도를 조금 옮겨 주세요',
    /* 횟수 제한 (논의92) — 잠그는 것이 아니라 잠깐 쉬는 것이다 */
    too_many: '너무 자주 불러서 잠깐 쉬는 중이에요 — 잠시 뒤에 다시 해 주세요',
    /* 만들 때 정하고 끝인 것 (논의79) */
    scope_locked: '모임 범위는 만들 때 정해요 — 나중에 못 바꿔요',
    /* AI 는 단계마다 몇 번까지 (논의93) */
    ai_limit: '이 단계에서 AI 추천은 다 썼어요',
    /* 신호등은 시간이 있어야 뜻이 선다 (논의116) — 화면이 먼저 감추지만 서버가 마지막 문이다.
       시간이 지워진 순간 눌린 손짓이 여기로 온다 — 무엇을 하면 켜지는지까지 말한다. */
    no_meet_time: '약속 시간을 정하면 신호등이 켜져요',
    /* 화면은 셋만 보내니 올 일이 없다 — 그래도 영문 코드가 새어 나가면 안 된다 */
    bad_going: '신호등을 다시 골라 주세요',
    failed: FAILED,
  } as Record<string, string>)[code] ?? FAILED, [v.me.isHost]);

  const send = useCallback(async (body: Action) => {
    if (body.action === 'reopen') iReopened.current = true;
    setBusy(true); setErr('');
    /* 500 은 본문이 비어 오고, 끊긴 망은 fetch 자체가 터진다.
       전에는 여기서 예외가 나 토스트까지 못 갔고, await 를 안 붙인 확정 단추는
       그대로 unhandled rejection 이 됐다 — 화면에는 아무 문구도 안 떴다. */
    const r = await fetch(`/api/m/${code}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(false);
    if (!r) { flash(FAILED); return false; }
    if (!r.ok) {
      /* 원인은 고칠 수 있는 사람에게만 말한다 (그릴링 원장 #379~381).
         참여자는 키를 바꿀 수 없다 — 원인을 알려도 할 수 있는 게 없다. */
      const j = await r.json().catch(() => null);
      /* 404 는 '모임이 사라졌다'일 수도 '그 후보가 없다'일 수도 있다 — 다시 읽어 가른다 */
      if (r.status === 404) await reload();
      flash(say(j?.error ?? 'failed'));
      return false;
    }
    await reload();
    return true;
  }, [code, reload, flash, say]);

  /* 보고 있는 중에 내보내지거나 대기로 바뀌면 화면도 바로 닫힌다 (그릴링 논의29).
     서버 렌더 때만 막으면 이미 열어 둔 사람은 SSE 로 진행 상황을 계속 봤다(재현됨).
     훅을 건너뛰면 안 되니 여기서는 표시만 하고, 그리는 것은 맨 아래에서 가른다. */
  const 나 = v.participants.find((p) => p.id === v.me.participantId);
  const 막힘: 'kicked' | 'pending' | null =
    나 && 나.state !== 'active' ? (나.state as 'kicked' | 'pending') : null;

  const stage = v.meeting.stage;
  /* 마무리한 모임은 결과 화면을 그대로 읽기전용으로 보여준다 (그릴링 논의31 ③) —
     단계가 어디였든 '끝난 모임'이면 확정된 곳을 보여주는 게 맞다. */
  const done_ = !!v.meeting.closed_at || stage === 'result';
  /* 끝난 모임이 무엇으로 끝났는지는 scope 가 아니라 '실제로 정해진 것'이 말한다.
     지역만 정하고 마무리한 모임도 있다 — scope 로 판정하면 그 화면이 텅 빈다. */
  const doneKind: Kind = v.meeting.winner_place_id ? 'place' : 'region';
  const kind: Kind = done_ ? doneKind : stage === 'region' ? 'region' : 'place';
  const shown = v.candidates.filter((c) => c.kind === kind);
  /* 확정된 지역 — 지점 단계에서 지도를 여기로 당기고, 밖은 막는다 (그릴링 논의32) */
  const region = v.candidates.find((c) => c.kind === 'region' && c.id === v.meeting.winner_region_id) ?? null;

  /* 모두의 출발지 가운데 — 지역을 고르기 전에는 여기서 지도를 연다 (그릴링 논의35 ①).
     서울 시청을 기본으로 두면 부산에서 모이는 사람은 매번 지도를 끌어야 한다. */
  const withOrigin = v.participants.filter((p) => p.state === 'active').filter((p) => p.lat != null && p.lng != null);
  const midpoint = withOrigin.length
    ? { lat: withOrigin.reduce((a, p) => a + p.lat!, 0) / withOrigin.length,
        lng: withOrigin.reduce((a, p) => a + p.lng!, 0) / withOrigin.length }
    : null;


  /* 지점을 정하는 중에도 지도를 누를 수 있다 — 지점도 핑=선택이라 후보 올리기와 고르기가 한 손짓이다 (논의26 ①) */
  const canPing = stage !== 'result' && !v.meeting.closed_at && !!v.me.participantId;

  /* 지도를 못 띄우는 자리에서도 흐름은 걸어볼 수 있어야 한다.
     이 PC 주소가 카카오 콘솔에 없으면 SDK 가 ERR_BLOCKED_BY_ORB 로 막힌다 —
     그때는 아래 목록에서 고른다. 규칙(핑=선택)은 똑같이 서버가 판정한다. */
  const [mapDead, setMapDead] = useState(false);
  /* SDK 는 늦게 뜬다. 이 신호가 없으면 핀 그리기가 지도보다 먼저 끝나 버리고
     다음 변경이 올 때까지 핀이 하나도 안 보인다(실제로 0개였다). */
  const [mapReady, setMapReady] = useState(false);
  const fitted = useRef(false);
  const placed = useRef(false);
  const [tools, setTools] = useState(false);      /* 방장 도구 펼침 */
  const [copied, setCopied] = useState(false);
  /* 참가자 id → 경로 (2026-08-15). 지점이 정해진 뒤에만 채운다 */
  const [routes, setRoutes] = useState<Record<string, RouteFetch>>({});

  /* ── 지도 ─────────────────────────────────────────────── */
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
    if (!key) { setMapDead(true); return; }
    if (!mapEl.current || map.current) return;
    const boot = () => window.kakao.maps.load(() => {
      const c0 = midRef.current;
      map.current = new window.kakao.maps.Map(mapEl.current, {
        center: new window.kakao.maps.LatLng(c0?.lat ?? 37.5665, c0?.lng ?? 126.978), level: 7,
      });
      /* 지도를 누르면 그 자리의 동으로 — 찍는 것이 곧 표 */
      window.kakao.maps.event.addListener(map.current, 'click', (e: any) => {
        if (!canPingRef.current) return;
        const ll = e.latLng;
        pickRef.current(ll.getLat(), ll.getLng());
      });
      /* 확대·이동이 끝나면 겹침을 다시 푼다 */
      window.kakao.maps.event.addListener(map.current, 'idle', () => layoutRef.current());
      setMapReady(true);
    });
    if (window.kakao?.maps) { boot(); return; }
    /* StrictMode 가 이 훅을 두 번 돌린다 — 태그를 두 번 붙이지 않게 id 로 막는다 */
    const ID = 'kakao-sdk';
    const had = document.getElementById(ID) as HTMLScriptElement | null;
    const s = had ?? document.createElement('script');
    if (!had) {
      s.id = ID;
      s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&libraries=services&autoload=false`;
      document.head.appendChild(s);
    }
    s.addEventListener('load', boot);
    s.addEventListener('error', () => setMapDead(true));
    /* 막히면 error 가 안 오는 경우도 있다 — 시간으로도 잡는다 */
    const t = setTimeout(() => { if (!window.kakao?.maps) setMapDead(true); }, 4000);
    return () => clearTimeout(t);
  }, []);

  /* ⚠ 2026-08-15 — 요약 시트를 끌어 지도 칸(.map, flex:1)의 실제 크기가 바뀌어도
     카카오 SDK 는 그 변화를 스스로 못 알아챈다(리사이즈 이벤트를 안 듣는다) — 지도
     타일은 처음 그렸던 크기 그대로 남고, 그 아래(또는 옆) 새로 생긴 자리는 `.map`의
     민무늬 배경(#e9eef6)만 보인다. 실제로 시트를 내려도 지도가 안 커지는 것처럼
     보인다는 말이 나와서 찾았다 — relayout() 을 불러 주면 컨테이너의 지금 크기에
     맞춰 다시 그린다(가운데 좌표는 그대로 둔 채). ResizeObserver 로 크기가 바뀔
     때마다(시트를 끄는 매 순간 포함) 자동으로 부른다. */
  useEffect(() => {
    if (!mapReady || !mapEl.current) return;
    const el = mapEl.current;
    const ro = new ResizeObserver(() => { map.current?.relayout(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mapReady]);

  /* 겹친 핀을 다룬다 (그릴링 논의21 · 논의38 ②).
     둘이 겹치면 위로 벌린다. 셋 이상이 한 덩어리로 뭉치면 벌려도 모자라서
     '이 근처 N곳' 하나로 합치고, 누르면 시트로 펼친다.
     확대하면 뭉침이 풀리므로 지도가 멈출 때(idle)마다 다시 계산한다. */
  /* 이만큼 안이면 한 덩어리로 본다. 지점은 한 지역 안에서 고르니 늘 붙어 있어
     묶으면 지도가 통째로 비었다 — 지역에서만 묶는다 (그릴링 논의42 ①). */
  const CLUSTER_PX = 46;
  const layout = useCallback(() => {
    const m = map.current;
    if (!m || !marks.current.length) return;
    const proj = m.getProjection();

    /* ⓪ 지난번 뭉침을 먼저 되돌린다. 뭉치는 가지만 이름표를 바꾸고 나머지를 감춰서,
       확대해 덩어리가 풀려도 '이 근처 N곳' 과 감춘 핀이 그대로 남아 있었다. */
    marks.current.forEach((mk) => {
      if (mk.el.dataset.cluster) delete mk.el.dataset.cluster;
      mk.el.textContent = `${mk.c.name} ${mk.c.votes}`;
      mk.el.setAttribute('aria-label', `${mk.c.name} · ${고른수(mk.c.votes)}`);
      mk.el.style.transform = '';
      if (hiddenIds.current.has(mk.c.id)) mk.ov.setMap(m);
    });
    hiddenIds.current.clear();

    /* ① 화면 좌표로 옮겨 가까운 것끼리 묶는다 */
    const pts = marks.current.map((mk) => ({
      ...mk, p: proj.containerPointFromCoords(new window.kakao.maps.LatLng(mk.c.lat, mk.c.lng)),
    }));
    const 덩어리: (typeof pts)[] = [];
    pts.forEach((q) => {
      const g = 덩어리.find((G) => G.some((x) =>
        Math.hypot(x.p.x - q.p.x, x.p.y - q.p.y) < CLUSTER_PX));
      if (g) g.push(q); else 덩어리.push([q]);
    });

    /* ② 셋 이상 뭉친 덩어리는 하나로 합쳐 보여 준다 */
    /* 지도 위 붙박이(확대·축소 · 방장 버튼)는 이미 자리를 차지한 것으로 친다 (그릴링 논의42) */
    const box0 = mapEl.current?.getBoundingClientRect();
    const W0 = box0?.width ?? 430, H0 = box0?.height ?? 380;
    const placed: { l: number; r: number; t: number; b: number }[] = [
      { l: 0, r: 62, t: 0, b: 110 },
      { l: 0, r: 170, t: H0 - 20, b: H0 },
      { l: W0 - 150, r: W0, t: H0 - 130, b: H0 },
    ];
    덩어리.forEach((G) => {
      if (G.length >= 3 && kindRef.current === 'region') {
        const 골랐다 = G.reduce((a, x) => a + x.c.votes, 0);
        const 대표 = G[0];
        대표.el.textContent = `이 근처 ${G.length}곳 ${골랐다}`;
        대표.el.setAttribute('aria-label', `이 근처 ${G.length}곳 · ${고른수(골랐다)}`);
        대표.el.dataset.cluster = G.map((x) => x.c.id).join(',');
        대표.el.style.transform = '';
        G.slice(1).forEach((x) => { x.ov.setMap(null); hiddenIds.current.add(x.c.id); });
        placed.push({ l: 대표.p.x - 60, r: 대표.p.x + 60, t: 대표.p.y - 26, b: 대표.p.y });
        return;
      }
      /* ③ 둘 이하면 위로 벌린다 */
      G.forEach(({ el, p }) => {
        const w = el.offsetWidth || 80, h = el.offsetHeight || 26;
        /* 위로만 밀면 왼쪽 위 확대 버튼을 피하다 화면 밖으로 나간다 (그릴링 논의42) */
        const box = (dx: number, dy: number) =>
          ({ l: p.x - w / 2 + dx, r: p.x + w / 2 + dx, t: p.y - h + dy, b: p.y + dy });
        const 빈자리 = (dx: number, dy: number) => {
          const a = box(dx, dy);
          if (a.r < 8 || a.l > W0 - 8 || a.b < 8 || a.t > H0 - 8) return false;
          return !placed.some((q) => a.l < q.r + 4 && a.r > q.l - 4 && a.t < q.b + 4 && a.b > q.t - 4);
        };
        /* 제자리부터 여덟 방향으로 원을 넓혀 가며 처음 비는 자리를 찾는다 (그릴링 논의42) */
        const 후보자리: [number, number][] = [[0, 0]];
        for (let ring = 1; ring <= 8; ring++) {
          const dyStep = ring * (h + 6), dxStep = ring * (w / 2 + 10);
          후보자리.push(
            [0, -dyStep], [0, dyStep], [dxStep, 0], [-dxStep, 0],
            [dxStep, -dyStep], [-dxStep, -dyStep], [dxStep, dyStep], [-dxStep, dyStep],
          );
        }
        const [dx, dy] = 후보자리.find(([x, y]) => 빈자리(x, y)) ?? [0, 0];
        el.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : '';
        placed.push(box(dx, dy));
      });
    });
  }, []);
  const layoutRef = useRef(layout); layoutRef.current = layout;

  /* 지도를 눌렀을 때. 지역이면 그 자리의 지역, 지점이면 주변 지점 목록 (그릴링 논의32).
     확정된 지역 밖은 받지 않는다 — 지역을 정한 뜻이 없어진다.
     누른 것만으로는 후보가 되지 않는다 (논의81) — 미리보기를 띄우고 한 번 더 눌러야 후보다.
     미리보기가 떠 있는데 다른 곳을 누르면 그리로 옮겨간다(setPreview 가 덮어쓴다). */
  const pickAt = useCallback(async (lat: number, lng: number) => {
    if (kindRef.current === 'region') {
      const r = await fetch(`/api/geo?lat=${lat}&lng=${lng}`).catch(() => null);
      /* 바다·산·국외처럼 사람이 모일 수 없는 자리 (그릴링 논의33 ②) */
      if (!r?.ok) { flash('여긴 고를 수 없어요 — 지역 안을 눌러 주세요'); return; }
      const g = await r.json().catch(() => null);
      if (!g) { flash(FAILED); return; }
      setPreview({ kind: 'region', refId: g.code, name: g.name, lat, lng });
      return;
    }
    const w = winRef.current;
    if (w && dist(lat, lng, w.lat, w.lng) > (radiusRef.current || RADIUS_FALLBACK_M)) {
      flash(`${w.name} 안에서 골라 주세요`);
      return;
    }
    closeSheets();                                   /* 앞서 연 시트는 닫고 이 자리 것만 남긴다 */
    setNear({ loading: true, at: { lat, lng }, list: [] });
    const r = await fetch(`/api/places?lat=${lat}&lng=${lng}&r=300`).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    if (!r?.ok) {
      setNear(null);
      /* 봉투의 retryable 이 '기다리면 된다'를 가른다 (논의101) — 429 를 전부 한도 초과로
         말하면, 잠깐 쉬는 중인 것까지 '무료 사용량을 다 썼다'가 된다 */
      flash(j?.error ? say(j.error) : '지금은 주변 지점을 불러올 수 없어요 — 잠시 뒤에 다시 해 주세요');
      return;
    }
    if (!j) { setNear(null); flash(FAILED); return; }
    setNear({ loading: false, at: { lat, lng }, list: j.places ?? [] });
  }, [flash, say, closeSheets]);
  const pickRef = useRef(pickAt); pickRef.current = pickAt;
  const winRef = useRef(region); winRef.current = region;
  const radiusRef = useRef(v.meeting.radius_m); radiusRef.current = v.meeting.radius_m;
  const midRef = useRef(midpoint); midRef.current = midpoint;

  /* 지점 고르기 — 지도를 누르는 것 말고 이름으로도 찾을 수 있게 (원본지필드의
     '이름으로 찾기'와 같은 결, 손을 멈추면 찾는다). 확정된 지역 반경 안으로 좁혀 찾는다 —
     안 좁히면 '상대원1동' 을 확정해 놓고 '강남역' 을 쳐도 전국에서 걸려 나온다. */
  useEffect(() => {
    if (placeTimer.current) clearTimeout(placeTimer.current);
    const s = qPlace.trim();
    if (!(stage === 'place' && !done_ && region) || s.length < 2) { setPlaceHits(null); return; }
    placeTimer.current = setTimeout(async () => {
      try {
        const radius = radiusRef.current || RADIUS_FALLBACK_M;
        const res = await fetch(
          `/api/places/search?q=${encodeURIComponent(s)}&lat=${region.lat}&lng=${region.lng}&r=${radius}`);
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          setPlace문제(j?.error === 'too_many' ? '너무 자주 불러서 잠깐 쉬는 중이에요 — 잠시 뒤에 다시 해 주세요'
            : j?.retryable ? '지금은 장소를 찾을 수 없어요 — 잠시 뒤에 다시 해 주세요'
            : '지금은 장소를 찾을 수 없어요');
          setPlaceHits(null);
          return;
        }
        setPlace문제(null);
        setPlaceHits((await res.json()).places ?? []);
      } catch { setPlace문제('지금은 장소를 찾을 수 없어요 — 잠시 뒤에 다시 해 주세요'); setPlaceHits(null); }
    }, 350);
    return () => { if (placeTimer.current) clearTimeout(placeTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qPlace, stage, done_, region?.id]);

  /* 검색 결과를 고르면 지도 탭과 같은 길(미리보기)로 합류한다 — 한 번 더 눌러야 후보가 된다.
     반경 검사도 지도 탭과 같다(pickAt) — 바깥 API 가 반경을 못 지켜도 여기서 한 번 더 막는다. */
  const 지점검색고르기 = (p: { id: string; name: string; address: string; lat: number; lng: number }) => {
    if (region && dist(p.lat, p.lng, region.lat, region.lng) > (radiusRef.current || RADIUS_FALLBACK_M)) {
      flash(`${region.name} 안에서 골라 주세요`);
      return;
    }
    setPreview({ kind: 'place', refId: p.id, name: p.name, lat: p.lat, lng: p.lng, address: p.address });
    setQPlace(''); setPlaceHits(null);
  };

  /* 콜백이 낡은 값을 잡지 않게 — 지도 리스너는 한 번만 달기 때문 */
  const canPingRef = useRef(canPing); canPingRef.current = canPing;
  const kindRef = useRef(kind); kindRef.current = kind;

  /* 후보 핀 다시 그리기.
     색은 한 가지 뜻만 나른다(그릴링 논의22) — 크기·진하기는 순위, 테두리는 내 선택.
     전에는 파랑 하나가 둘을 겸해서 셋이 고른 1위와 하나가 고른 곳이 똑같이 보였다. */
  useEffect(() => {
    if (!map.current) return;
    marks.current.forEach((m) => m.ov.setMap(null));
    hiddenIds.current.clear();                       /* 핀을 새로 만들었으니 옛 뭉침 기록도 버린다 */
    marks.current = onMap.map((c, i) => {
      const mine = v.me.myVotes.includes(c.id);
      const first = done_ ? true : i === 0 && c.votes > 0;   /* 득표순 — 확정 버튼이 집는 그 곳 */
      const ov = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(c.lat, c.lng), yAnchor: 1,
        zIndex: first ? 9 : mine ? 6 : 4,
      });
      const el = document.createElement('div');
      el.style.cssText = `background:${first ? '#16307a' : '#fff'};color:${first ? '#fff' : '#171a21'};
        border:${mine ? `3px solid ${first ? '#8fb4ff' : '#2f6bff'}` : '1px solid #e2e6ee'};
        border-radius:999px;padding:${first ? '8px 16px' : '4px 10px'};
        font-size:${first ? '15px' : '11.5px'};font-weight:800;
        box-shadow:0 2px 8px rgba(20,26,40,.16);white-space:nowrap;
        cursor:${canPing ? 'pointer' : 'default'}`;
      /* 핀은 좁아서 숫자만 둔다 — 읽어 주는 말에는 온전한 문장을 넣는다 (논의72) */
      el.textContent = `${c.name} ${c.votes}`;
      el.setAttribute('aria-label', `${c.name} · ${고른수(c.votes)}`);
      delete el.dataset.cluster;
      /* 못 찍는 사람(비참여자·지난 모임)에게는 핀이 읽을 것이지 누를 것이 아니다 —
         전에는 눌려서 '먼저 참여해야 해요' 토스트만 돌아왔다 */
      if (canPing) el.onclick = () => {
        const ids = el.dataset.cluster;
        if (ids) { closeSheets(); setClusterIds(ids.split(',')); return; }
        toggle(c.id, mine);
      };
      ov.setContent(el); ov.setMap(map.current);
      return { ov, el, c };
    });
    layout();

    /* 찍힌 곳이 화면 밖이면 없는 것과 같다 — 처음 한 번만 후보를 다 담는다.
       매번 맞추면 남이 찍을 때마다 내 지도가 튄다. */
    /* 지점 단계로 넘어오면 지도를 확정된 지역으로 당긴다 (그릴링 논의32) —
       서울 전체가 보이면 어디서 골라야 할지 알 수 없다. */
    if (kind === 'place' && region && !placed.current) {
      placed.current = true;
      map.current.setCenter(new window.kakao.maps.LatLng(region.lat, region.lng));
      map.current.setLevel(5);
      fitted.current = onMap.length > 0;
      return;
    }
    if (!fitted.current && onMap.length) {
      fitted.current = true;
      const b = new window.kakao.maps.LatLngBounds();
      onMap.forEach((c) => b.extend(new window.kakao.maps.LatLng(c.lat, c.lng)));
      map.current.setBounds(b, 40, 40, 40, 40);
    }
  }, [v, mapReady]);

  /* 참가자 출발지 핀 (2026-08-15) — withOrigin(가운데를 셈할 때 이미 만들던 목록)이
     지도에 정작 안 그려지고 있었다. "각자 어디서 오는지 지도로 보고 싶다"는 실제 사용
     중 나온 말로 추가했다. 후보(marks)와 다른 ref(originMarks)로 따로 관리한다 —
     고르는 대상이 아니라서 뭉침 계산(layout)에는 안 들어간다.
     xAnchor·yAnchor 를 0 으로 두고 style 로 left:0;top:0 을 박는 것은 홈 맛보기 지도
     (탐색/지도.tsx)와 같은 수법이다 — .ofrom 자신의 transform:translate(-50%,-100%) 가
     자리를 잡게 하려는 것이다(카카오 자체 앵커와 이중으로 겹치면 어긋난다). */
  useEffect(() => {
    if (!map.current) return;
    originMarks.current.forEach((ov) => ov.setMap(null));
    originMarks.current = withOrigin.map((p) => {
      const ov = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(p.lat!, p.lng!), xAnchor: 0, yAnchor: 0, zIndex: 3,
      });
      const el = document.createElement('span');
      el.className = 'ofrom';
      el.style.cssText = 'left:0;top:0';
      const pt = document.createElement('span'); pt.className = 'pt'; pt.setAttribute('aria-hidden', 'true');
      const lb = document.createElement('span'); lb.className = 'lb'; lb.textContent = p.origin_name ?? '';
      el.appendChild(pt); el.appendChild(lb);
      ov.setContent(el); ov.setMap(map.current);
      return ov;
    });
  }, [v, mapReady]);

  /* 확정된 지역의 범위(원) — 지점을 지도에서 찾다 보면 스크롤 끝에 딴 동네를 고를
     수도 있었다(실사용 신고). radius_m 을 그대로 반지름으로 쓴다 — 서버가 "이 지역
     안에서 골라 주세요" 를 판정하는 값과 같아서, 화면에 보이는 범위와 실제로 고를 수
     있는 범위가 어긋나지 않는다. 색은 당근마켓 동네 범위 표시를 임시로 빌렸다 —
     기능이 자리 잡으면 그때 우리 색으로 바꾼다. */
  useEffect(() => {
    if (!map.current) return;
    if (regionCircle.current) { regionCircle.current.setMap(null); regionCircle.current = null; }
    if (!(region && kind === 'place')) return;
    regionCircle.current = new window.kakao.maps.Circle({
      center: new window.kakao.maps.LatLng(region.lat, region.lng),
      radius: v.meeting.radius_m,
      strokeWeight: 2, strokeColor: '#FF8A3D', strokeOpacity: 0.85, strokeStyle: 'solid',
      fillColor: '#FF8A3D', fillOpacity: 0.12,
    });
    regionCircle.current.setMap(map.current);
  }, [region?.id, v.meeting.radius_m, kind, mapReady]);

  /* 참가자별 이동 경로 — 지점이 정해진 뒤에만 그린다. 대중교통은 파랑, 자차는 주황으로
     이동수단을 가른다(색은 위 경로색 상수 하나). routes(state)가 /api/routes 응답을 채우면
     여기서 카카오 Polyline 으로 그린다 — OSM 폴백 쪽(osmmap.tsx)은 같은 좌표를 SVG 로 그린다. */
  useEffect(() => {
    if (!map.current) return;
    routePolylines.current.forEach((pl) => pl.setMap(null));
    routePolylines.current = [];
    if (!v.meeting.winner_place_id) return;
    for (const p of v.participants) {
      const r = routes[p.id];
      if (!r || r.st !== 'ok' || r.points.length < 2) continue;
      const pl = new window.kakao.maps.Polyline({
        path: r.points.map((pt) => new window.kakao.maps.LatLng(pt.lat, pt.lng)),
        strokeWeight: 4, strokeColor: 경로색[p.transport], strokeOpacity: 0.75, strokeStyle: 'solid',
      });
      pl.setMap(map.current);
      routePolylines.current.push(pl);
    }
  }, [routes, v.meeting.winner_place_id, v.participants, mapReady]);

  const invite = async () => {
    const url = `${location.origin}/join/${code}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt('이 주소를 복사해 보내세요', url); }
  };

  /* 모임 설정 — 이름·시간을 고치고, 삭제도 여기 안에 있다 (그릴링 논의23).
     도구 줄에 두면 '✕ 닫기' 바로 아래 붙어 둘 다 ✕ 로 시작해 헷갈린다.
     참여자도 열어 볼 수 있다 (논의118) — 언제 모이는지를 방장에게 물어볼 일이 없어야 한다.
     고치는 길은 방장에게만 준다. */
  const openSettings = () => {
    setSName(v.meeting.name);
    setSAt(instantToKst(v.meeting.meet_at));
    closeSheets();
    setSettings(true);
  };
  const saveSettings = async () => {
    if (await send({ action: 'update', name: sName.trim() || v.meeting.name, meetAt: sAt.trim() || null }))
      setSettings(false);
  };

  const removeMeeting = async () => {
    if (!window.confirm(`'${v.meeting.name}'${조사(v.meeting.name, '과', '와')} 모든 후보·선택이 사라져요. 되돌릴 수 없어요.`)) return;
    const r = await fetch(`/api/m/${code}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'remove' }),
    }).catch(() => null);
    if (r?.ok) location.href = '/';
    else flash(FAILED);
  };

  /* 나가기 — **참여자만 나간다.**
     방장 갈래는 통째로 없앴다: 방장 넘기기가 사라지면서(논의125) 서버는 방장의 `leave` 를
     무조건 409 `host_cannot_leave` 로 막는다. 그런데 화면은 아직 옛 규칙을 말하고 있었다 —
       · "아래 사람 줄에서 방장을 먼저 넘겨 주세요" → 넘길 자리가 이제 없다
       · 혼자면 "나가면 모임이 사라져요" 를 묻고 → **예 를 눌러도 서버가 거절한다**
     둘 다 못 지킬 약속이었다. 방장이 빠지는 길은 **[모임 설정] 안의 [✕ 모임 삭제]** 하나뿐이다. */
  const leave = async () => {
    if (!window.confirm('이 모임에서 나갑니다. 내가 고른 것도 함께 빠져요.')) return;
    if (await send({ action: 'leave' })) location.href = '/';
  };

  /* 확정은 언제든 가능하다(그릴링). 다만 다 안 고른 상태면 한 번 더 묻는다 —
     되돌릴 수는 있지만 남의 선택이 반영 안 된 채로 끝나는 게 흔한 사고다.
     후보가 한 곳뿐이어도 저절로 넘어가지 않는다 (논의114) — 방장이 이 단추를 눌러야 한다. */
  const confirmTop = () => {
    if (!top) return;
    if (done < total && !window.confirm(`아직 ${total - done}명이 안 골랐어요. 그래도 확정할까요?`)) return;
    if (isTie) { closeSheets(); setTieOpen(true); return; }      /* 동점은 사람이 고른다 */
    send({ action: 'confirm', candidateId: top.id });
  };

  /* 되돌리기는 단추 하나지만 무게가 다르다 (논의59 · 113) — 글자가 무슨 일이 벌어지는지 말하고,
     잃을 것이 있을 때만 묻는다. 지역을 다시 고르면 모아 둔 지점은 사라진다 (논의87). */
  const 지점후보수 = v.candidates.filter((c) => c.kind === 'place').length;
  const 되돌리기이름 = stage === 'place' ? '지점 다시 고르기' : '한 칸 뒤로';
  const 되돌리기 = () => {
    if (stage === 'place' && 지점후보수 > 0
      && !window.confirm(`모은 지점 ${지점후보수}곳이 사라져요. 괜찮으세요?`)) return;
    send({ action: 'reopen' });
  };

  /* 지점도 지역과 같다 — 다시 누르면 취소, 여러 곳을 골라도 된다 (논의26 ①) */
  const toggle = (cid: string, mine: boolean) => {
    const c = shown.find((x) => x.id === cid);
    if (!c) return;
    if (mine) { send({ action: 'unping', candidateId: cid }); return; }
    send({ action: 'ping', kind, refId: c.ref_id ?? c.id, name: c.name,
      lat: c.lat, lng: c.lng, address: c.address ?? undefined });
  };

  /* AI 추천 — 남은 횟수를 답에서 받아 화면에 그대로 보인다 (논의93).
     send() 는 성공 여부만 주므로 여기서만 응답을 직접 읽는다. */
  const 추천받기 = async () => {
    setAiBusy(true);
    const r = await fetch(`/api/m/${code}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'ai' }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    setAiBusy(false);
    if (typeof j?.aiLeft === 'number') setAiLeft(j.aiLeft);
    if (!r || !r.ok) { flash(say(j?.error ?? 'failed')); return; }
    await reload();
  };

  /* 미리보기를 한 번 더 누르면 그때 후보가 된다 (논의81 · 120) */
  const 후보로 = async () => {
    if (!preview) return;
    const p = preview;
    if (await send({ action: 'ping', kind: p.kind, refId: p.refId, name: p.name,
      lat: p.lat, lng: p.lng, address: p.address })) setPreview(null);
  };

  /* AI 가 올린 곳은 0표여도 안 사라진다 (논의53) — 한 번에 치우는 길이 있어야 한다 (논의94) */
  const ai후보수 = v.candidates.filter((c) => c.kind === kind && c.by_ai && c.votes === 0).length;

  /* ── 상태 줄 (그릴링: 알약 폐기, 시트 맨 윗줄을 치환) ── */
  const myCount = v.me.myVotes.length;
  const statusLine = !v.me.participantId ? null
    : done_ ? null
    : myCount === 0
      ? <p className="warn" style={{ margin: '0 0 8px', fontSize: 13 }}>{아직}</p>
      : <p className="mut" style={{ margin: '0 0 8px' }}>
          {/* 이름을 다 늘어놓으면 아홉 곳만 골라도 세 줄이 된다 (그릴링 논의42).
              어디를 골랐는지는 목록의 파란 테두리가 이미 말한다. */}
          내가 고른 곳 {myCount}곳
        </p>;

  /* 진행률 = 사람 수 (그릴링 Q11=A).
     핑=선택이라 한 사람이 여러 곳을 고른다 — 선택을 세면 분자가 사람 수를 넘는다.
     '한 곳이라도 낸 사람'을 센다. 방장이 '다 했나'를 판단하는 기준과 같다. */
  const active = v.participants.filter((p) => p.state === 'active');
  const total = active.length;
  /* 서버가 셈해 준 것을 쓴다 — voters 는 코드만 아는 사람에게 비어서 온다(논의95).
     화면이 직접 세면 그 사람에게는 늘 '0/N 선택' 이 됐다. */
  const done = active.filter((p) => p.골랐나).length;

  const winnerId = v.meeting.winner_place_id ?? v.meeting.winner_region_id;
  /* 정해진 곳은 후보 전체에서 찾는다 (논의76) — 종류로 거른 목록에서만 찾으면
     한 칸이라도 어긋나는 순간 결과 카드가 통째로 사라진다. 정해졌는데 아무것도 안 보이는 게 가장 나쁘다. */
  const winner = v.candidates.find((c) => c.id === winnerId) ?? null;
  const top = shown[0];
  /* 동점이면 조용히 먼저 올라온 곳이 이긴다 — 그건 규칙이 아니라 사고다 (그릴링 논의31 ①).
     같은 수가 고른 곳을 모아 두고, 확정할 때 방장이 직접 고르게 한다. */
  const tied = top && top.votes > 0 ? shown.filter((c) => c.votes === top.votes) : [];
  const isTie = tied.length > 1;

  /* 끝난 모임의 지도는 정해진 곳 하나만 크게 보여준다 (그릴링 논의29) —
     아직 겨루는 중인 것처럼 후보를 다 늘어놓으면 무엇이 정해졌는지 안 보인다. */
  const onMap = done_ && winner ? [winner] : shown;

  /* 참가자별 이동 경로 — 지점(winner_place_id)이 있을 때만 부른다. 지역은 범위일 뿐 한 점이
     아니라 길찾기 API 에 줄 도착점이 없다 (사용자 말: "지점이 정해져 있다면"). SSE 로 화면이
     자주 다시 읽혀도 출발지·이동수단·도착점이 그대로면 다시 부르지 않는다 — 문자열 하나로
     그 셋을 뭉쳐 두고 그 값이 바뀔 때만 훅을 다시 돈다. */
  const routeKey = v.meeting.winner_place_id && winner
    ? `${winner.id}:${winner.lat}:${winner.lng}|` +
      withOrigin.map((p) => `${p.id}:${p.transport}:${p.lat}:${p.lng}`).join(',')
    : '';
  useEffect(() => {
    if (!routeKey) { setRoutes({}); return; }
    if (!winner) return;
    let 취소 = false;
    withOrigin.forEach((p) => {
      setRoutes((r) => ({ ...r, [p.id]: { st: 'loading' } }));
      const qs = new URLSearchParams({
        fromLat: String(p.lat), fromLng: String(p.lng),
        toLat: String(winner.lat), toLng: String(winner.lng), mode: p.transport,
      });
      fetch(`/api/routes?${qs}`, { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : Promise.reject(res)))
        .then((j) => {
          if (취소) return;
          setRoutes((r) => ({ ...r, [p.id]: { st: 'ok', points: j.points ?? [], distanceM: j.distanceM ?? null, durationS: j.durationS ?? null, found: !!j.found } }));
        })
        .catch(() => { if (!취소) setRoutes((r) => ({ ...r, [p.id]: { st: 'error' } })); });
    });
    return () => { 취소 = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  /* 신호등 — 시간이 정해지면 켜진다 (논의116). 장소가 정해지기 전에도 켜진다.
     다시 누르면 '아직' 으로 돌아간다 (논의115). 표도 가운데 계산도 안 건드린다 — 알리기만 한다.
     값은 서버에 있다(participants.going) — 화면에만 두면 나만 보고, 나만 보는 것은 알림이 아니다.
     그래서 화면 상태를 따로 두지 않는다: 두면 서버 값과 갈라져 남이 보는 불과 내가 보는 불이 달라진다.
     지난 모임에서는 감춘다 — 끝난 약속에 '제때 가요' 를 켜고 끄는 일은 없다. */
  const 내신호 = 나?.going ?? null;
  const 신호볼수있나 = !!v.meeting.meet_at && !v.meeting.closed_at;
  /* 같은 불을 다시 누르면 '아직' 으로 (논의115) */
  const 신호누르기 = (s: Going) => send({ action: 'going', status: 내신호 === s ? null : s });

  /* 알림 쪽지는 시트가 올라오면 시트 머리 바로 위로 (논의108) —
     손이 있는 곳과 답이 있는 곳을 맞춘다. 시트가 없으면 css 가 정한 화면 위쪽 그대로. */
  useEffect(() => {
    if (!err) return;
    const 시트들 = document.querySelectorAll('.msheet');
    const 머리 = 시트들.length
      ? (시트들[시트들.length - 1] as HTMLElement).getBoundingClientRect().top : null;
    setToastUp(머리 == null ? null : Math.max(12, window.innerHeight - 머리 + 10));
  }, [err, near, clusterIds, tieOpen, moved, rewound, settings]);

  /* 지워진 모임을 계속 그리면 뭘 눌러도 조용히 실패한다 — 사라졌다고 말하고 나갈 길을 준다.
     왜 없어졌는지는 말하지 않는다 (논의112) — 지워진 뒤엔 이유를 남겨 둘 자리가 없다. */
  if (gone) {
    return (
      <div className="wrap">
        <div className="hd"><h1>{v.meeting.name}</h1></div>
        <div className="sheet" style={{ padding: 20 }}>
          <p className="warn" style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>이 모임은 없어졌어요</p>
          <p className="mut" style={{ margin: '8px 0 18px' }}>여기서 할 수 있는 일은 더 없어요.</p>
          <a className="cta" style={{ textAlign: 'center', lineHeight: '48px', textDecoration: 'none' }}
            href="/">홈으로</a>
        </div>
      </div>
    );
  }

  if (막힘) {
    const 강퇴 = 막힘 === 'kicked';
    return (
      <div className="wrap">
        <div className="hd"><h1>{v.meeting.name}</h1></div>
        <div className="sheet" style={{ padding: 20 }}>
          <p className={강퇴 ? 'warn' : undefined} style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
            {강퇴 ? '방장이 이 모임에서 내보냈어요' : '방장의 승인을 기다리는 중이에요'}
          </p>
          <p className="mut" style={{ margin: '8px 0 18px' }}>
            {강퇴
              ? '그래서 진행 상황은 볼 수 없어요. 다시 들어가려면 방장의 승인이 필요합니다.'
              : '승인되면 바로 들어갈 수 있어요. 24시간 안에 답이 없으면 신청이 사라집니다.'}
          </p>
          {강퇴 && (
            <a className="cta" style={{ textAlign: 'center', lineHeight: '48px', textDecoration: 'none' }}
              href={`/join/${code}`}>다시 참여 신청하기</a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="hd">
        {/* 펼치기는 키보드로도 닿아야 한다 — <h1 onClick> 은 Tab 순회에 아예 안 잡혔다 */}
        <h1 className={nameOpen ? 'open' : undefined}
          role="button" tabIndex={0} aria-expanded={nameOpen}
          onClick={() => setNameOpen(!nameOpen)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setNameOpen(!nameOpen); }
          }}
          title={nameOpen ? '접기' : '전체 보기'}>{v.meeting.name}</h1>
        <span className="badge">
          {v.meeting.closed_at ? '지난 모임'
            : done_ ? STAGE_LABEL[stage]
            : `${done}/${total} 선택 · ${STAGE_LABEL[stage]}`}
        </span>
      </div>

      <div className="map" ref={mapEl}>
        {/* 카카오가 막히면 조용히 OSM 으로 바꾼다 (그릴링 논의27) —
            전에는 빈 흰 자리에 '등록해 주세요' 만 떠서 아무 것도 할 수 없었다. */}
        {mapDead && (
          <OsmMap
            candidates={onMap} myVotes={v.me.myVotes}
            /* 지점 단계면 확정된 지역이 한가운데 (그릴링 논의32) */
            center={region && kind === 'place' ? { lat: region.lat, lng: region.lng }
              : midpoint ?? { lat: 37.5665, lng: 126.978 }}
            canPing={canPing}
            /* 미리보기가 지도에 안 보이면 시트에 이름만 뜨고 '어디인지'를 알 수 없다 (논의81) */
            preview={preview}
            onPick={(lat, lng) => pickAt(lat, lng)}
            onToggle={(c, mine) => toggle(c.id, mine)}
            onCluster={(ids) => { closeSheets(); setClusterIds(ids); }}
            cluster={kind === 'region'}
            /* 참가자 출발지 — 카카오 쪽(위 useEffect)과 같은 데이터, 같은 뜻 */
            origins={withOrigin.map((p) => ({ name: p.origin_name ?? '', lat: p.lat!, lng: p.lng! }))}
            /* 확정된 지역의 범위 — 카카오 쪽(위 regionCircle useEffect)과 같은 뜻·같은 반경 */
            region={region && kind === 'place' ? { lat: region.lat, lng: region.lng } : null}
            regionRadiusM={v.meeting.radius_m}
            /* 참가자별 이동 경로 — 카카오 쪽(위 routePolylines useEffect)과 같은 데이터 */
            routes={v.meeting.winner_place_id ? v.participants
              .map((p) => { const r = routes[p.id]; return r?.st === 'ok' && r.points.length >= 2
                ? { id: p.id, points: r.points, color: 경로색[p.transport] } : null; })
              .filter((x): x is { id: string; points: { lat: number; lng: number }[]; color: string } => !!x)
              : []}
          />
        )}
        {/* 도구(스피드다이얼)가 펴져 있는 동안은 주 액션을 감춘다 — 안 그러면 다이얼이
            자라며 이 알약과 겹친다. 마침 다이얼이 열린 동안은 눈길이 도구 쪽에 가 있다 —
            닫으면 바로 되돌아온다. */}
        {!v.meeting.closed_at && !tools && (
          <div className="acts">
            {/* 지금 할 수 없는 주 액션은 감춘다 (그릴링 논의30 ①) —
                꺼진 채로 파랗게 남으면 눌릴 것처럼 보인다. */}
            {/* 혼자면 지금 할 일은 고르는 게 아니라 사람을 부르는 것이다 (그릴링 논의39 ①) */}
            {v.me.isHost && active.length === 1 && !done_ && (
              <button className="fab primary" disabled={busy} onClick={invite}>
                {copied ? '복사됨' : '초대 링크 복사'}
              </button>
            )}
            {v.me.isHost && active.length > 1 && stage === 'region' && !!top && (
              <button className="fab primary" disabled={busy} onClick={confirmTop}>✓ 지역 확정</button>
            )}
            {v.me.isHost && active.length > 1 && stage === 'place' && !!top && (
              <button className="fab primary" disabled={busy} onClick={confirmTop}>✓ 지점 확정</button>
            )}
            {v.me.isHost && stage === 'result' && (
              <button className="fab primary" disabled={busy}
                onClick={() => send({ action: 'close' })}>모임 종료</button>
            )}
            {/* 아직 안 골랐으면 누구에게나 같은 안내를 준다 (그릴링 논의30 ② · 논의40).
                방장도 그 모임의 참가자다 — 방장만 안내가 없으면 자기 선택을 잊는다. */}
            {canPing && !myCount && (
              <button className="fab primary"
                onClick={() => flash('지도를 누르면 미리보기가 떠요 — 한 번 더 누르면 후보가 돼요')}>
                {kind === 'region' ? '지역 고르기' : '지점 고르기'}
              </button>
            )}
          </div>
        )}
        {/* 방장 도구 — 스피드다이얼 FAB (지도를 가장 넓게 쓰는 방식).
           접힌 채로는 파란 동그라미(⋯) 하나뿐이고, 펴면 도구마다 이름표+아이콘 한 줄이
           그 위로 쌓인다. 알약이 나란히 쌓여 지도 오른쪽을 세로로 다 덮던 옛 모습을 없앴다. */}
        {!v.meeting.closed_at && v.me.participantId && (
          <>
            {/* 다이얼이 펴져 있으면 지도를 살짝 덮는다 — 안 그러면 다이얼 항목이 후보
                핀 이름표를 그대로 가려 눌러도 핀이 아니라 다이얼이 잡혔다(실측으로 확인).
                눌러서 닫는 길도 겸한다. */}
            {tools && <button className="dialscrim" aria-label="도구 닫기" onClick={() => setTools(false)} />}
          <div className="dial">
            {/* 더보기는 '이 모임 사람'에게만. 링크만 받은 사람에게도 떠서
                누르면 403 이 났다(전수 조사에서 확인).
                참여자에게도 연다 (논의118) — 안에 모임 설정이 있고, 참여자는 보기만 한다. */}
            <button className="dial-toggle" aria-expanded={tools}
              aria-label={tools ? '도구 닫기' : '방장 도구 더보기'}
              onClick={() => setTools(!tools)}>{tools ? '✕' : '⋯'}</button>
            {tools && (
              <>
                {v.me.isHost && (
                  <button className="dial-item" disabled={busy || aiBusy} onClick={추천받기}>
                    <span className="lb">
                      {aiBusy ? '찾는 중…' : aiLeft == null ? 'AI 추천' : `AI 추천 (${aiLeft}번 남음)`}
                    </span>
                    <span className="ic" aria-hidden>✦</span>
                  </button>
                )}
                {/* AI 것은 0표여도 안 사라진다 (논의53) — 치울 길을 함께 둔다 (논의94) */}
                {v.me.isHost && ai후보수 > 0 && (
                  <button className="dial-item" disabled={busy}
                    onClick={() => { if (window.confirm(`AI 가 올린 ${ai후보수}곳을 치울까요? 누군가 고른 곳은 남아요.`))
                      send({ action: 'clearAi' }); }}>
                    <span className="lb">추천 치우기</span>
                    <span className="ic" aria-hidden>⌫</span>
                  </button>
                )}
                {/* 되돌리기 — 글자가 무게를 말한다 (논의113) */}
                {v.me.isHost && stage !== 'region' && (
                  <button className="dial-item" disabled={busy} onClick={되돌리기}>
                    <span className="lb">{되돌리기이름}</span>
                    <span className="ic" aria-hidden>‹</span>
                  </button>
                )}
                {/* 약속은 깨지기도 한다 — 지우지 않고 닫는 길 (논의106).
                    되돌릴 수 없으니 한 번 더 묻는다. */}
                {v.me.isHost && !done_ && (
                  <button className="dial-item" disabled={busy}
                    onClick={() => { if (window.confirm('아무 곳도 정하지 않고 끝낼까요? 지난 모임으로 남고 더는 못 고쳐요.'))
                      send({ action: 'close', force: true }); }}>
                    <span className="lb">정하지 않고 끝내기</span>
                    <span className="ic" aria-hidden>■</span>
                  </button>
                )}
                <button className="dial-item" disabled={busy} onClick={openSettings}>
                  <span className="lb">모임 설정</span>
                  <span className="ic" aria-hidden>⚙</span>
                </button>
                {/* 방장이 혼자일 땐 주 액션(위 '초대 링크 복사')이 이미 떠 있다 — 더보기에도
                    같은 초대 버튼을 또 넣으면 한 화면에 초대 UI 가 둘로 보인다. 사람이 하나라도
                    모이고 나면 주 액션이 다른 것으로 바뀌므로 그때부터는 여기가 유일한 초대 길이다. */}
                {!(v.me.isHost && active.length === 1 && !done_) && (
                  <button className="dial-item" disabled={busy} onClick={invite}>
                    <span className="lb">{copied ? '복사됨' : '초대 링크 복사'}</span>
                    <span className="ic" aria-hidden>＋</span>
                  </button>
                )}
                {/* 방장에게는 안 그린다 — 서버가 409 로 막는 단추다(논의125). 눌러야만 안 되는 것을
                    알게 되는 단추는 거짓말이다(논의105). 방장이 빠지는 길은 바로 옆 [모임 설정] 안의
                    [✕ 모임 삭제] 하나뿐이다. */}
                {!v.me.isHost && (
                  <button className="dial-item" disabled={busy} onClick={leave}>
                    <span className="lb">나가기</span>
                    <span className="ic" aria-hidden>↩</span>
                  </button>
                )}
              </>
            )}
          </div>
          </>
        )}
      </div>

      {/* 손잡이로 키우고 줄인다 (논의82) — 시트 자체 높이는 css 가 정하고 여기서만 덮어쓴다.
          mini 는 요약 줄만 남기고 나머지(후보 목록·참가자 목록)를 시트의 overflow-y:auto 뒤로
          넘긴다 — 지우는 게 아니라 접어 두는 것이다, 시트를 다시 키우면 그대로 있다.
          끄는 동안(dragH 가 있을 때)은 손가락 위치를 그대로 픽셀로 반영하고 transition 을
          끈다(안 그러면 화면이 손가락보다 늦게 따라온다) — 손을 떼면 dragH 가 비고
          sheetStage 의 정착 값(dvh)으로 돌아가며 css 의 transition 이 그 이동을 부드럽게
          보여 준다. */}
      <div className="sheet" style={
        dragH != null ? { maxHeight: `${dragH}px`, transition: 'none' }
        : sheetStage === 'big' ? { maxHeight: '82dvh' }
        : sheetStage === 'mini' ? { maxHeight: '76px', overflow: 'hidden' }
        : undefined
      }>
        {/* 손잡이는 맨 윗줄과 요약 줄을 둘 다 잡는다 (논의82) — 사람들은 보통 요약 줄을 잡는다.
            끄는 동안은 시트 높이가 손가락을 그대로 따라간다(연속). 손을 떼면 mini·default·big
            중 지금 높이와 가장 가까운 자리로 스냅한다. 그냥 누르면(끌지 않았으면)
            default ↔ big 을 오간다(mini 에서 누르면 default 로 돌아온다 — 눌러서는 못
            들어가고 끌어야만 들어가는 자리를, 눌러서는 늘 빠져나올 수 있게 한다). */}
        <div data-grip role="button" tabIndex={0} aria-expanded={sheetStage === 'big'}
          aria-label={`시트 손잡이 — 누르면 ${sheetStage === 'default' ? '커져요' : '기본 크기로 돌아와요'}. 끌면 지도 크기가 손가락을 따라와요`}
          style={{ cursor: 'grab', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
            margin: '-14px -16px 4px', padding: '10px 16px 2px' }}
          onPointerDown={(e) => {
            /* 마우스로 끌 때 e.preventDefault() 가 없으면 손을 움직이는 동안 브라우저가
               밑에 깔린 글자를 문장 선택으로 집어 버린다 — 파랗게 훑히면서 끌기가 끊기는
               것처럼 보인다(실제로 데스크톱에서 그랬다). 손가락(touch)은 원래 안 그래서
               모바일에서는 안 드러났다. */
            e.preventDefault();
            /* 끌기 시작점은 **정착 자리의 제한값**(시트픽셀)이지, 지금 실제로 그려진 높이가
               아니다 — 컨텐츠가 짧으면(후보가 몇 곳 안 되면) 시트의 실제 렌더 높이가 그
               제한값보다 작다(max-height 라서). 실제 렌더 높이를 시작점으로 삼으면 첫
               손짓에 시트가 그 차이만큼 훅 줄어드는 것처럼 보인다(실제로 그렇게 됐었다) —
               우리가 끌면서 조절하는 것은 이 제한값이니 기준도 이 값이어야 손가락 밑에
               계속 붙어 있다. */
            const startH = 시트픽셀(sheetStage);
            끌기.current = { y: e.clientY, startH, moved: false };
            /* 이걸 안 부르면 마우스가 이 작은 손잡이(44×45px)를 살짝만 벗어나도
               pointermove·pointerup 이 이 요소가 아니라 그 밑에 있는 다른 요소(지도 등)로
               가 버려 드래그가 끊긴다 — 실제로 그래서 끌기가 안 됐다. 지도의 같은 손짓
               (탐색/지도.tsx·osmmap.tsx)도 이 한 줄로 잡는다. */
            try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* 그냥 끌면 된다 */ }
          }}
          onPointerMove={(e) => {
            const d = 끌기.current;
            if (!d) return;
            const dy = e.clientY - d.y;
            /* 아주 작은 떨림만 거른다 — 연속으로 따라가야 하니 예전의 24px 문턱(그 안에서는
               아예 안 움직이던 것)은 너무 크다. */
            if (!d.moved && Math.abs(dy) < 4) return;
            d.moved = true;
            const vh = window.innerHeight;
            /* 위로 끌면(dy 가 음수) 커지도록 -dy 를 더한다. mini~big 범위를 못 벗어나게 막는다. */
            setDragH(Math.min(vh * 0.82, Math.max(76, d.startH - dy)));
          }}
          onPointerUp={() => {
            const d = 끌기.current;
            끌기.current = null;
            if (!d) return;
            if (!d.moved) {
              /* 끌지 않고 눌렀으면 여닫기 — mini 에서도 default 로 돌아오는 길은 늘 눌러서 된다 */
              setDragH(null);
              setSheetStage((s) => (s === 'default' ? 'big' : 'default'));
              return;
            }
            /* 끌었으면 손을 뗀 그 순간의 높이에서 가장 가까운 정착 자리로 스냅한다 */
            const cur = dragH ?? d.startH;
            const 자리들: 시트단계[] = ['mini', 'default', 'big'];
            let 가장가까운: 시트단계 = 'default', 최소거리 = Infinity;
            for (const 자리 of 자리들) {
              const 거리 = Math.abs(cur - 시트픽셀(자리));
              if (거리 < 최소거리) { 최소거리 = 거리; 가장가까운 = 자리; }
            }
            setDragH(null);
            setSheetStage(가장가까운);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setSheetStage((s) => (s === 'default' ? 'big' : 'default'));
            }
          }}>
          <div aria-hidden style={{ width: 44, height: 5, borderRadius: 999,
            background: 'var(--line)', margin: '0 auto 8px' }} />
          <p className="mut" style={{ margin: 0 }}>
            {v.meeting.closed_at
              ? `지난 모임${며칠전(v.meeting.meet_at) ? ` · ${며칠전(v.meeting.meet_at)}` : ''}`
              : <>
                  {/* 확정·마무리한 뒤에는 더 고를 것이 없다 — 진행률이 남으면 아직 겨루는 중으로 읽힌다 */}
                  후보 {KIND_LABEL[kind]} {shown.length}곳{!done_ && ` · ${done}/${total} 선택`}
                  {isTie && !done_ && ` · ${tied.length}곳이 같아요`}
                  {/* 이름을 다 늘어놓으면 8명만 돼도 두 줄을 먹는다 (그릴링 논의38 ①) */}
                  {done < total && !done_ && (() => {
                    const 안낸 = active.filter((p) => !p.골랐나);
                    return ' · ' + (안낸.length <= 2
                      ? 안낸.map((p) => p.name).join(', ')
                      : `${안낸[0].name} 외 ${안낸.length - 1}명`) + ' 아직';
                  })()}
                </>}
          </p>
        </div>

        {/* 시간은 여기 — 머릿줄에 두면 모임 이름을 밀어내 이름이 잘렸다 (그릴링 논의37 ④) */}
        {v.meeting.meet_at && (
          <p className="when">{formatKst(v.meeting.meet_at)}
            {v.meeting.closed_at && 며칠전(v.meeting.meet_at) && ` · ${며칠전(v.meeting.meet_at)}`}</p>
        )}

        {/* 신호등 — 시간이 정해지면 켜진다 (논의116). 장소는 상관없다.
            다시 누르면 '아직' 으로 돌아간다 (논의115). 알리기만 하고 셈에는 안 들어간다.
            보내는 동안에도 단추를 끄지 않는다 — 목록 줄과 같은 규칙이다(초점을 잃지 않게). */}
        {신호볼수있나 && !!v.me.participantId && (
          <div className="segs" style={{ margin: '0 0 10px' }}>
            {신호등.map(({ key, 불, 말 }) => (
              <button key={key} className="seg" aria-pressed={내신호 === key} aria-busy={busy || undefined}
                aria-label={`${말}${내신호 === key ? ' — 누르면 되돌려요' : ''}`}
                onClick={() => { if (!busy) 신호누르기(key); }}>{불} {말}</button>
            ))}
          </div>
        )}
        {statusLine}

        {/* 지점 고르기 — 지도를 누르는 것 말고 이름으로도 찾는다(원본지필드의 '이름으로
            찾기'와 같은 결). 확정된 지역 안으로 좁혀 찾으니 딴 동네 가게가 안 섞인다. */}
        {stage === 'place' && !done_ && region && canPing && (
          <div className="fld" style={{ margin: '0 0 12px' }}>
            <input value={qPlace} onChange={(e) => setQPlace(e.target.value)}
              placeholder={`${region.name} 안에서 가게·카페·공원 이름으로 찾기`}
              aria-label="지점 이름으로 찾기" />
            {place문제 && qPlace.trim().length >= 2 &&
              <p className="warn" style={{ margin: '6px 0 0', fontSize: 12.5 }}>{place문제}</p>}
            {!place문제 && placeHits && !placeHits.length && qPlace.trim().length >= 2 &&
              <p className="mut" style={{ margin: '6px 0 0' }}>찾는 곳이 없어요 — 다른 이름으로 해보세요.</p>}
            {!!placeHits?.length && (
              <ul className="rows" style={{ marginTop: 6 }}>
                {placeHits.slice(0, 6).map((p) => (
                  <li key={p.id}>
                    <button className="row" disabled={busy} onClick={() => 지점검색고르기(p)}>
                      <span className="nm">{p.name}
                        {p.address && <span className="mut" style={{ display: 'block', fontWeight: 600 }}>{p.address}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* 미리보기 — 한 번 더 눌러야 후보가 된다 (논의81 · 120) */}
        {preview && canPing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="row" data-preview disabled={busy} onClick={후보로}
              aria-label={`미리보기 ${preview.name} — 다시 누르면 후보가 돼요`}>
              <span className="nm">미리보기 · {preview.name}
                <span className="mut" style={{ display: 'block', fontWeight: 600 }}>
                  미리보기를 다시 누르면 후보가 돼요
                </span>
              </span>
              <span className="ct">여기로 할까요?</span>
            </button>
            <button className="mini" style={{ marginBottom: 7, flex: '0 0 auto' }}
              onClick={() => setPreview(null)}>취소</button>
          </div>
        )}

        {stage === 'region' && !done_ && (
          <p className="note">지도를 누르면 그 자리의 <b>지역</b>이 미리보기로 떠요 — 한 번 더 누르면 후보가 됩니다.
            여러 곳을 골라도 되고, 같은 곳을 다시 누르면 취소돼요.
            <b> 가장 많은 사람이 고른 지역</b>으로 정해집니다.</p>
        )}
        {stage === 'place' && !done_ && (
          <p className="note">지도를 누르면 <b>그 근처 지점</b>이 뜨고, 고르면 미리보기가 됩니다 — 한 번 더 눌러야 후보예요.
            {region && <> <b>{region.name}</b> 안에서 골라 주세요.</>} 여러 곳을 골라도 되고,
            같은 곳을 다시 누르면 취소돼요. <b>가장 많은 사람이 고른 지점</b>으로 정해집니다.</p>
        )}
        {/* 혼자면 확정을 막되 이유를 말한다 (논의68) — 막아 두고 말이 없으면 고장으로 읽힌다 */}
        {v.me.isHost && active.length === 1 && !done_ && (
          <p className="note">혼자서는 정할 수 없어요 — 친구를 불러 주세요.</p>
        )}
        {done_ && (
          <p className="note">
            {winner
              ? <><b>{winner.name}</b>에서 만나요
                  {/* 주소가 없어도 카드는 사라지지 않는다 (논의76) — 이름과 지도가 대신한다 */}
                  <span className="mut" style={{ display: 'block', fontWeight: 600, marginTop: 4 }}>
                    {/* 빈 문자열로 온 주소도 '없는 것' 이다 — ?? 만 쓰면 빈 줄이 남는다 */}
                    {winner.address || '주소가 없어요 — 위 지도에서 자리를 봐 주세요'}
                  </span></>
              : <>아직 정해지지 않았어요</>}
          </p>
        )}

        {/* 참가자별 오는 길 (2026-08-15) — 지점이 정해졌을 때만. 지역은 범위일 뿐이라
            도착점이 없어 길찾기를 못 한다("지점이 정해져 있다면"이 사용자 조건이었다).
            지도 위 선(위 routePolylines·osmmap routes)과 같은 색으로 이동수단을 가른다. */}
        {done_ && v.meeting.winner_place_id && withOrigin.length > 0 && (
          <>
            <p className="mut" style={{ margin: '10px 0 4px', fontWeight: 800, fontSize: 13 }}>오는 길</p>
            <ul className="rows">
              {withOrigin.map((p) => {
                const r = routes[p.id];
                const 말 = !r || r.st === 'loading' ? '경로를 찾는 중…'
                  : r.st === 'error' ? '경로를 못 불러왔어요'
                  : !r.found ? '경로를 찾지 못했어요'
                  : [r.distanceM != null ? `${(r.distanceM / 1000).toFixed(1)}km` : null,
                     r.durationS != null ? `${Math.round(r.durationS / 60)}분` : null]
                      .filter(Boolean).join(' · ') || '경로를 찾았어요';
                return (
                  <li key={p.id}>
                    <div className="row" data-static>
                      <span className="nm">
                        <span aria-hidden style={{
                          display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                          background: 경로색[p.transport], marginRight: 6, verticalAlign: 'middle',
                        }} />
                        {p.name}
                        <span className="mut" style={{ display: 'block', fontWeight: 600 }}>
                          {p.transport === 'car' ? '자차' : '대중교통'} · {말}
                        </span>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {/* 지난 모임은 확정된 곳만 크게, 기록은 접어 둔다 (논의74) */}
        {v.meeting.closed_at ? (
          <>
            <button className="row" aria-expanded={howOpen} style={{ marginTop: 6 }}
              onClick={() => setHowOpen(!howOpen)}>
              <span className="nm">어떻게 정해졌나</span>
              <span className="ct">{howOpen ? '접기' : '펼치기'}</span>
            </button>
            {howOpen && (
              <ul className="rows">
                {shown.map((c) => {
                  const 고른사람 = c.voters
                    .map((id) => v.participants.find((p) => p.id === id)?.name)
                    .filter(Boolean).join(', ');
                  return (
                    <li key={c.id}>
                      <div className="row" data-static data-win={c.id === winnerId || undefined}>
                        <span className="nm">{c.name}{c.id === winnerId && ' · 여기서 만나요'}
                          <span className="mut" style={{ display: 'block', fontWeight: 600 }}>
                            {고른사람 ? `${고른사람} 골랐어요` : '아무도 안 골랐어요'}
                          </span>
                        </span>
                        <span className="ct" aria-label={고른수(c.votes)}>{c.votes}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : (
          <>
            {/* 이 목록이 정식 길이다 (그릴링 논의29) — 지도 핀은 같은 일을 하는 둘째 길.
                키보드는 Tab 으로 돌고 Enter 로 고른다. 무엇이 일어나는지 aria-label 이 말한다.
                보내는 동안에도 단추를 끄지 않는다 — 초점이 가 있는 단추를 끄면 초점이 BODY 로
                떨어져 키보드로 고른 사람은 자리를 잃었다. 누름만 무시한다. */}
            <ul className="rows">
              {shown.map((c) => {
                const mine = v.me.myVotes.includes(c.id);
                const isWinner = stage === 'result' && c.id === winnerId;
                return (
                  <li key={c.id}>
                    {canPing ? (
                      <button className="row" aria-pressed={mine} aria-busy={busy || undefined}
                        aria-label={`${c.name} · ${고른수(c.votes)}. ${mine ? '내가 고른 곳 — 누르면 취소' : '누르면 선택'}`}
                        onClick={() => { if (!busy) toggle(c.id, mine); }}>
                        <span className="nm">{c.name}
                          {/* 같은 이름 지점이 둘일 수 있다 — 주소가 구별해 준다 (논의37 ①) */}
                          {c.address && <span className="mut" style={{ display: 'block', fontWeight: 600 }}>{c.address}</span>}
                        </span>
                        <span className="ct">{c.votes}</span>
                      </button>
                    ) : (
                      <div className="row" data-static data-win={isWinner || undefined}>
                        <span className="nm">{c.name}{isWinner && ' · 여기서 만나요'}
                          {c.address && <span className="mut" style={{ display: 'block', fontWeight: 600 }}>{c.address}</span>}
                        </span>
                        <span className="ct" aria-label={고른수(c.votes)}>{c.votes}</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {!shown.length && !done_ &&
              <p className="mut">아직 없어요 — 지도를 눌러 골라 보세요.</p>}
          </>
        )}

        {/* 함께하는 사람 (그릴링 논의35 ②) — 전에는 이름이 '영희, 민준 남음' 한 줄에만 스쳤고
            내보내기·방장 넘기기가 화면에 아예 없었다. */}
        <p className="mut" style={{ margin: '16px 0 6px' }}>함께하는 사람 {active.length}명</p>
        <ul className="rows">
          {active.map((p) => {
            /* id 를 견주지 않는다 — 코드만 아는 사람에게는 id 가 다 비어 와서
               견주는 순간 전원이 방장이 됐다(논의95). 서버가 붙여 준 값을 쓴다. */
            const isHostRow = p.방장인가;
            const gave = p.골랐나;
            return (
              <li key={p.id}>
                {/* 남의 불도 여기 (논의116) — 신호등이 내 화면에만 켜지면 아무에게도 안 알린 것이다.
                    자리는 사람 줄이 맞다: 누가 못 오는지는 '그 사람'에 붙은 이야기다.
                    data-going 은 나중에 모양을 입힐 자리다(값이 없으면 'none' — 안 누른 사람도 자리를 갖는다) */}
                <div className="row" data-static
                  data-going={신호볼수있나 ? (p.going ?? 'none') : undefined}>
                  <span className="nm">{p.name}
                    {isHostRow && <span className="tag">방장</span>}
                    {p.id === v.me.participantId && <span className="tag">나</span>}
                    <span className="mut" style={{ display: 'block', fontWeight: 600 }}>
                      {p.origin_name ?? '출발지 없음'}
                      {/* 미선택 문구는 화면 어디서나 한 가지 (논의72) */}
                      {gave ? ' · 골랐어요' : ` · ${아직}`}
                      {신호볼수있나 && ` · ${신호말(p.going)}`}
                    </span>
                  </span>
                  {/* 마무리 전까지는 넘길 수 있어야 한다 — 확정됐다고 감추면
                      방장이 나갈 길이 사라진다(전수 조사에서 확인). */}
                  {v.me.isHost && !isHostRow && !v.meeting.closed_at && (
                    /* 방장 넘기기는 없앴다 (논의125) — 넘겨받은 사람이 로그인 안 했으면
                       그 모임이 다시 '쿠키만 가진 방장' 이 되어 벽돌 위험이 돌아온다. */
                    <button className="mini danger" disabled={busy}
                      onClick={() => { if (window.confirm(`${p.name} 님을 내보낼까요?`))
                        send({ action: 'kick', participantId: p.id }); }}>내보내기</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {/* 승인 대기 — 방장에게만. 마무리한 모임은 읽기 전용이라 승인·거절 둘 다 409 만 돌아온다 */}
        {v.me.isHost && !v.meeting.closed_at && v.participants.filter((p) => p.state === 'pending').map((p) => (
          <div key={p.id} className="note" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <b style={{ flex: 1 }}>{p.name} 님이 다시 들어오려 해요</b>
            <button className="fab" onClick={() => send({ action: 'approve', participantId: p.id, ok: true })}>수락</button>
            <button className="fab" onClick={() => send({ action: 'approve', participantId: p.id, ok: false })}>거절</button>
          </div>
        ))}

        {settings && (
          <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) setSettings(false); }}>
            <div className="msheet">
              <h2>모임 설정</h2>
              {/* 참여자는 보기만 한다 (논의118) — 고칠 수 없는 칸을 눌러 보고 헛되이 기다리지 않게 */}
              {!v.me.isHost && (
                <p className="mut" style={{ margin: '-6px 0 12px' }}>방장만 고칠 수 있어요.</p>
              )}
              <label>이름
                <input value={sName} readOnly={!v.me.isHost} disabled={!v.me.isHost}
                  onChange={(e) => setSName(e.target.value)} placeholder="모임 이름" />
              </label>
              <TimePicker value={sAt} onChange={setSAt} readOnly={!v.me.isHost} hint={null} />
              {/* 범위는 만들 때 정하고 끝이다 (논의79) — 잠금이라고 화면이 먼저 말한다 */}
              <label>어디까지 정하나
                <input value={v.meeting.scope === 'region' ? '지역까지 🔒' : '지점까지 🔒'} readOnly disabled />
              </label>
              <p className="mut" style={{ margin: '-6px 0 12px' }}>모임을 만들 때 정해요 — 나중에 못 바꿔요.</p>
              {v.me.isHost ? (
                <>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button className="fab" style={{ flex: 1 }} onClick={() => setSettings(false)}>취소</button>
                    <button className="fab primary" style={{ flex: 1 }} disabled={busy} onClick={saveSettings}>저장</button>
                  </div>
                  {/* 되돌릴 수 없는 것은 따로, 맨 아래 */}
                  <div className="zone">
                    <button disabled={busy} onClick={removeMeeting}>✕ 모임 삭제</button>
                  </div>
                </>
              ) : (
                <button className="fab" style={{ width: '100%', marginTop: 4 }}
                  onClick={() => setSettings(false)}>닫기</button>
              )}
            </div>
          </div>
        )}

        {/* 지난 모임에는 들어갈 수 없다 — 눌러도 /join 이 열람으로 되돌려 보내는 헛걸음이었다 */}
        {!v.me.participantId && !v.meeting.closed_at && <a className="cta" style={{ textAlign: 'center', lineHeight: '48px', textDecoration: 'none' }} href={`/join/${code}`}>이 모임에 참여하기</a>}
      </div>

      {/* 시트가 올라와 있으면 시트 머리 바로 위로 (논의108) */}
      {err && <div className="toast" role="alert"
        style={toastUp == null ? undefined : { top: 'auto', bottom: toastUp }}>{err}</div>}

      {/* 누른 자리 주변 지점에서 고른다 (그릴링 논의32) — 지도 탭 한 번이 곧 이 목록이다 */}
      {near && (
        <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) setNear(null); }}>
          <div className="msheet">
            <h2>이 근처에서 고르기</h2>
            {near.loading && <p className="mut" style={{ margin: '0 0 12px' }}>주변을 찾는 중…</p>}
            {!near.loading && !near.list.length && (
              <p className="mut" style={{ margin: '0 0 12px' }}>
                여기엔 등록된 지점이 없어요. 지도를 조금 옮겨 다시 눌러 보세요.
              </p>
            )}
            <ul className="rows">
              {near.list.map((pl) => (
                <li key={pl.id}>
                  {/* 고르면 곧바로 후보가 되지 않는다 (논의81) — 미리보기로 두고 한 번 더 묻는다 */}
                  <button className="row" aria-busy={busy || undefined}
                    onClick={() => {
                      if (busy) return;
                      setNear(null);
                      setPreview({ kind: 'place', refId: pl.id, name: pl.name,
                        lat: pl.lat, lng: pl.lng, address: pl.address });
                    }}>
                    <span className="nm">{pl.name}
                      {pl.address && <span className="mut" style={{ display: 'block', fontWeight: 600 }}>{pl.address}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button className="fab" style={{ width: '100%', marginTop: 10 }}
              onClick={() => setNear(null)}>닫기</button>
          </div>
        </div>
      )}

      {/* 방장이 단계를 넘겼다고 알린다 (그릴링 논의40 ④) */}
      {moved && (
        <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) setMoved(null); }}>
          <div className="msheet">
            {/* 지점 단계로 넘어오면 winner 는 아직 없다 — 방금 정해진 지역 이름을 쓴다.
                이름은 값이라 조사를 미리 못 고른다 — '메가커피으로' 가 그대로 나갔다. */}
            <h2>방장이 {(winner ?? region)
              ? `${(winner ?? region)!.name}${으로((winner ?? region)!.name)} ` : ''}정했어요</h2>
            <p className="mut" style={{ margin: '0 0 16px' }}>
              {/* 단계 이름은 쪽지에 안 쓴다 (논의111) — '확정됨' 은 위쪽 배지 전용 낱말이다.
                  무엇을 하면 되는지만 말한다. */}
              {stage === 'place'
                ? '방금 고른 지역은 이 화면에 안 나와요 — 아래에서 지점을 골라 주세요.'
                : stage === 'result'
                  ? '이제 더 고를 것은 없어요.'
                  : '이어서 골라 주세요.'}
            </p>
            <button className="fab primary" style={{ width: '100%' }}
              onClick={() => setMoved(null)}>알겠어요</button>
          </div>
        </div>
      )}

      {/* 뭉친 핀을 펼친 목록 (그릴링 논의38 ②) */}
      {clusterIds && (
        <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) setClusterIds(null); }}>
          <div className="msheet">
            <h2>이 근처 {clusterIds.length}곳</h2>
            <ul className="rows">
              {shown.filter((c) => clusterIds.includes(c.id)).map((c) => {
                const mine = v.me.myVotes.includes(c.id);
                return (
                  <li key={c.id}>
                    {/* 못 찍는 사람에게는 읽을 것만 준다 — 지도 핀과 같은 규칙 */}
                    {canPing ? (
                      <button className="row" aria-pressed={mine} aria-busy={busy || undefined}
                        aria-label={`${c.name} · ${고른수(c.votes)}. ${mine ? '내가 고른 곳 — 누르면 취소' : '누르면 선택'}`}
                        onClick={() => { if (busy) return; setClusterIds(null); toggle(c.id, mine); }}>
                        <span className="nm">{c.name}
                          {c.address && <span className="mut" style={{ display: 'block', fontWeight: 600 }}>{c.address}</span>}
                        </span>
                        <span className="ct">{c.votes}</span>
                      </button>
                    ) : (
                      <div className="row" data-static>
                        <span className="nm">{c.name}
                          {c.address && <span className="mut" style={{ display: 'block', fontWeight: 600 }}>{c.address}</span>}
                        </span>
                        <span className="ct" aria-label={고른수(c.votes)}>{c.votes}</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <button className="fab" style={{ width: '100%', marginTop: 10 }}
              onClick={() => setClusterIds(null)}>닫기</button>
          </div>
        </div>
      )}

      {/* 같은 수가 고른 곳이 여럿이면 사람이 고른다 (그릴링 논의31 ①) —
          어느 곳인지, 몇 명이 아직 안 골랐는지 함께 보여준다 */}
      {tieOpen && (
        <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) setTieOpen(false); }}>
          <div className="msheet">
            <h2>{tied.length}곳을 똑같이 골랐어요</h2>
            <p className="mut" style={{ margin: '0 0 12px' }}>
              {고른수(tied[0]?.votes ?? 0)}.
              {done < total && ` 아직 ${total - done}명이 안 골랐어요.`} 어디로 정할까요?
            </p>
            <ul className="rows">
              {tied.map((c) => (
                <li key={c.id}>
                  <button className="row" aria-busy={busy || undefined}
                    aria-label={`${c.name} · ${고른수(c.votes)}. 누르면 여기로 정해요`}
                    onClick={() => { if (busy) return; setTieOpen(false); send({ action: 'confirm', candidateId: c.id }); }}>
                    <span className="nm">{c.name}{c.address ? <span className="mut"> · {c.address}</span> : null}</span>
                    <span className="ct">{c.votes}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button className="fab" style={{ width: '100%', marginTop: 10 }}
              onClick={() => setTieOpen(false)}>더 기다릴게요</button>
          </div>
        </div>
      )}

      {/* 방장이 되돌리면 한 번 알린다 (그릴링 논의28) — 전에는 말없이 화면만 바뀌었다 */}
      {rewound && (
        <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) setRewound(null); }}>
          <div className="msheet">
            <h2>방장이 되돌렸어요</h2>
            <p className="mut" style={{ margin: '0 0 16px' }}>
              {/* 단계 이름 대신 무엇을 다시 고르는지로 말한다 (논의111 · 117).
                  지역을 다시 고르면 모아 둔 지점은 사라진다 (논의87) — 그대로 있다고 말하지 않는다. */}
              다시 <b>{rewound}</b>부터 골라요.
              {rewound === '지역' && ' 지점은 지역이 정해진 뒤에 다시 고릅니다.'}
            </p>
            <button className="fab primary" style={{ width: '100%' }}
              onClick={() => setRewound(null)}>알겠어요</button>
          </div>
        </div>
      )}
    </div>
  );
}
