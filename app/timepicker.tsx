'use client';
/* 약속 시간 고르기 — 브라우저 기본 <input type=datetime-local> 은 기기·브라우저마다
   모양이 다 다르다(안드로이드는 원형 다이얼, 데스크톱 크롬은 스크롤 목록·달력이 붙은 상자).
   같은 화면이 사람마다 다르게 보이는 게 문제라 우리가 직접 그린다 — 달력 + 시계 다이얼.
   값은 그대로 'YYYY-MM-DDTHH:mm'(한국시간 벽시계, lib/time.ts 와 같은 꼴)이라
   부르는 쪽(app/new/page.tsx · ui.tsx 설정)은 한 글자도 안 바뀐다.
   키보드로만 쓰는 사람을 위해 다이얼 옆에 '직접 입력'(옛 네이티브 입력칸) 예비 길을 둔다. */
import { useEffect, useRef, useState } from 'react';

export type TimePickerProps = {
  id?: string;
  value: string;                          // '' 아니면 'YYYY-MM-DDTHH:mm'
  onChange: (v: string) => void;
  readOnly?: boolean;
  /** 비운 칸 안내 문구 — 화면마다 뜻이 달라 부르는 쪽에서 넣는다. null 이면 아예 안 그린다 */
  hint?: string | null;
};

const 요일 = ['일', '월', '화', '수', '목', '금', '토'];
const pad2 = (n: number) => String(n).padStart(2, '0');

function 풀기(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return { y: +y, mo: +mo, d: +d, h: +h, mi: +mi };
}
const 값으로 = (y: number, mo: number, d: number, h: number, mi: number) =>
  `${y}-${pad2(mo)}-${pad2(d)}T${pad2(h)}:${pad2(mi)}`;

/* 그 달 첫 칸이 무슨 요일인지 · 며칠까지 있는지 */
function 달정보(y: number, mo: number) {
  return { 시작요일: new Date(y, mo - 1, 1).getDay(), 마지막날: new Date(y, mo, 0).getDate() };
}

function 표시글(v: string) {
  const p = 풀기(v);
  if (!p) return '';
  const w = 요일[new Date(p.y, p.mo - 1, p.d).getDay()];
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  return `${p.y}년 ${p.mo}월 ${p.d}일 (${w}) ${p.h < 12 ? '오전' : '오후'} ${h12}:${pad2(p.mi)}`;
}

/* 다이얼 반지름 — 숫자 자리와 바늘 끝이 같은 값을 써야 바늘이 숫자에 정확히 닿는다 */
const 중심 = 118, 반지름 = 92;
const 자리 = (deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return { x: 중심 + 반지름 * Math.sin(rad), y: 중심 - 반지름 * Math.cos(rad) };
};

export default function TimePicker({ id, value, onChange, readOnly, hint }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [입력모드, set입력모드] = useState(false);
  const [수동값, set수동값] = useState(value);

  const [보는년, set보는년] = useState(() => new Date().getFullYear());
  const [보는월, set보는월] = useState(() => new Date().getMonth() + 1);
  const [날, set날] = useState({ y: 보는년, mo: 보는월, d: new Date().getDate() });
  const [시12, set시12] = useState(12);
  const [분, set분] = useState(0);
  const [오후, set오후] = useState(false);
  const [다이얼, set다이얼] = useState<'시' | '분'>('시');

  const face = useRef<HTMLDivElement>(null);
  const 끄는중 = useRef(false);

  /* 열 때마다 저장된 값(없으면 지금)으로 다시 맞춘다 — 지난번에 취소한 임시값이 남으면 안 된다 */
  useEffect(() => {
    if (!open) return;
    const now = new Date();
    const p = 풀기(value);
    const 기준 = p ?? { y: now.getFullYear(), mo: now.getMonth() + 1, d: now.getDate(),
                        h: now.getHours(), mi: now.getMinutes() };
    set보는년(기준.y); set보는월(기준.mo);
    set날({ y: 기준.y, mo: 기준.mo, d: 기준.d });
    set시12(기준.h % 12 === 0 ? 12 : 기준.h % 12);
    set분(기준.mi);
    set오후(기준.h >= 12);
    set다이얼('시');
    set입력모드(false);
    set수동값(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const h24 = () => (오후 ? (시12 % 12) + 12 : 시12 % 12);

  function 확인() {
    if (입력모드) { if (수동값.trim()) onChange(수동값.trim()); }
    else onChange(값으로(날.y, 날.mo, 날.d, h24(), 분));
    setOpen(false);
  }
  function 비우기() { onChange(''); setOpen(false); }
  function 키보드로() { set수동값(값으로(날.y, 날.mo, 날.d, h24(), 분)); set입력모드(true); }
  function 다이얼로() {
    const p = 풀기(수동값);
    if (p) {
      set보는년(p.y); set보는월(p.mo); set날({ y: p.y, mo: p.mo, d: p.d });
      set시12(p.h % 12 === 0 ? 12 : p.h % 12); set분(p.mi); set오후(p.h >= 12);
    }
    set입력모드(false);
  }

  function 달옮기(방향: -1 | 1) {
    let mo = 보는월 + 방향, y = 보는년;
    if (mo < 1) { mo = 12; y -= 1; } else if (mo > 12) { mo = 1; y += 1; }
    set보는년(y); set보는월(mo);
  }

  /* ── 시계 다이얼 손짓 — 손가락 위치를 그대로 각도로 따라간다(손 떼기 전까지 이산 점프 없음) ── */
  function 각도구하기(clientX: number, clientY: number) {
    const el = face.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2), dy = clientY - (r.top + r.height / 2);
    let deg = Math.atan2(dx, -dy) * (180 / Math.PI);
    if (deg < 0) deg += 360;
    return deg;
  }
  function 각도적용(deg: number) {
    if (다이얼 === '시') { const idx = Math.round(deg / 30) % 12; set시12(idx === 0 ? 12 : idx); }
    else set분(Math.round(deg / 6) % 60);
  }
  const onDown = (e: React.PointerEvent) => {
    끄는중.current = true;
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* 무시 */ }
    각도적용(각도구하기(e.clientX, e.clientY));
  };
  const onMove = (e: React.PointerEvent) => {
    if (!끄는중.current) return;
    각도적용(각도구하기(e.clientX, e.clientY));
  };
  const onUp = () => {
    if (!끄는중.current) return;
    끄는중.current = false;
    if (다이얼 === '시') set다이얼('분');           /* 시를 고르면 곧장 분으로 — 두 번 여닫지 않는다 */
  };
  /* 숫자를 직접 눌렀을 때 — 각도를 거꾸로 셈하지 않고 그 숫자의 값을 그대로 쓴다.
     눌러도 안 그린다면 위 onDown 이 같은 손짓에서 각도로 다시 셈해 서로 다른 값을 낼 수 있다
     (버튼이 하필 두 눈금 사이 각도 시작점 자리라 반올림이 갈릴 때 실제로 어긋났다) —
     그래서 버튼에서는 부모의 손짓 셈이 아예 안 일어나게 막는다. */
  const 숫자누름 = (n: number) => {
    if (다이얼 === '시') { set시12(n); set다이얼('분'); } else set분(n);
  };

  const { 시작요일, 마지막날 } = 달정보(보는년, 보는월);
  const 칸들: (number | null)[] = [...Array(시작요일).fill(null), ...Array.from({ length: 마지막날 }, (_, i) => i + 1)];
  const 오늘 = new Date();

  const 눈금들 = 다이얼 === '시'
    ? Array.from({ length: 12 }, (_, i) => ({ val: i === 0 ? 12 : i, deg: i * 30 }))
    : Array.from({ length: 12 }, (_, i) => ({ val: i * 5, deg: i * 30 }));
  const 바늘각 = 다이얼 === '시' ? (시12 % 12) * 30 : 분 * 6;
  const 바늘끝 = 자리(바늘각);

  const 글 = 표시글(value);

  return (
    <div className="fld">
      <label htmlFor={id}>약속 시간</label>
      {readOnly ? (
        <div className="row" aria-disabled data-value={value} style={{ cursor: 'default' }}>
          <span className="nm">{글 || '아직 안 정했어요'}</span>
        </div>
      ) : (
        /* data-value — 눈에는 안 띈다. 시험(playwright)이 '지금 정해진 값'을 읽을 자리다.
           이 칸은 이제 <input> 이 아니라 <button> 이라 .inputValue() 로는 못 읽는다. */
        <button type="button" id={id} className="row" data-value={value} onClick={() => setOpen(true)}>
          <span className="nm">{글 || '아직 안 정했으면 비워 두세요'}</span>
          <span className="mut">{value ? '바꾸기' : '고르기'}</span>
        </button>
      )}
      {!readOnly && hint !== null && <p className="mut" style={{ margin: '6px 0 0' }}>
        {hint ?? '아직 안 정했으면 비워 두세요 — 나중에 설정에서 넣을 수 있어요.'}
      </p>}

      {open && (
        <div className="modal" onClick={() => setOpen(false)}>
          <div className="msheet tpsheet" onClick={(e) => e.stopPropagation()}>
            <h2>약속 시간</h2>

            <div className="tpbody">
            {입력모드 ? (
              <div className="fld">
                <label htmlFor="tp-manual">직접 입력</label>
                <input id="tp-manual" type="datetime-local" value={수동값}
                       onChange={(e) => set수동값(e.target.value)} />
              </div>
            ) : (
              <>
                <div className="tpDigital">
                  <div className="tpAmPm">
                    <button type="button" aria-pressed={!오후} onClick={() => set오후(false)}>오전</button>
                    <button type="button" aria-pressed={오후} onClick={() => set오후(true)}>오후</button>
                  </div>
                  <div className="tpBig">
                    <button type="button" aria-pressed={다이얼 === '시'} onClick={() => set다이얼('시')}>{시12}</button>
                    <span>:</span>
                    <button type="button" aria-pressed={다이얼 === '분'} onClick={() => set다이얼('분')}>{pad2(분)}</button>
                  </div>
                </div>

                <div className="tpcal-hd">
                  <button type="button" aria-label="이전 달" onClick={() => 달옮기(-1)}>‹</button>
                  <strong>{보는년}년 {보는월}월</strong>
                  <button type="button" aria-label="다음 달" onClick={() => 달옮기(1)}>›</button>
                </div>
                <div className="tpcal-week" aria-hidden>
                  {요일.map((w) => <span key={w}>{w}</span>)}
                </div>
                <div className="tpcal-grid">
                  {칸들.map((d, i) => d == null ? <span key={`e${i}`} /> : (
                    <button type="button" key={d}
                      aria-pressed={날.y === 보는년 && 날.mo === 보는월 && 날.d === d}
                      data-today={오늘.getFullYear() === 보는년 && 오늘.getMonth() + 1 === 보는월 && 오늘.getDate() === d ? '' : undefined}
                      onClick={() => set날({ y: 보는년, mo: 보는월, d })}>{d}</button>
                  ))}
                </div>

                <div className="tpclock" ref={face}
                     onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
                  <svg viewBox="0 0 236 236" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden>
                    <line x1={중심} y1={중심} x2={바늘끝.x} y2={바늘끝.y} stroke="var(--brand)" strokeWidth={2} />
                    <circle cx={바늘끝.x} cy={바늘끝.y} r={3} fill="var(--brand)" />
                  </svg>
                  <span className="tpclock-center" aria-hidden />
                  {눈금들.map((n) => {
                    const p = 자리(n.deg);
                    const 활성 = 다이얼 === '시' ? n.val === 시12 : n.val === 분;
                    return (
                      <button type="button" key={n.val} className="tpclock-num"
                        style={{ left: p.x, top: p.y }} data-active={활성 ? '' : undefined}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => 숫자누름(n.val)}>
                        {다이얼 === '분' ? pad2(n.val) : n.val}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            </div>

            <div className="tpfoot">
              <button type="button" className="tpkbd" aria-label={입력모드 ? '다이얼로 바꾸기' : '키보드로 직접 입력'}
                onClick={() => (입력모드 ? 다이얼로() : 키보드로())}>{입력모드 ? '🕐' : '⌨'}</button>
              <div className="right">
                {value && <button type="button" className="ghost" onClick={비우기}>비우기</button>}
                <button type="button" className="ghost" onClick={() => setOpen(false)}>취소</button>
                <button type="button" className="ghost" style={{ color: 'var(--ink)', fontWeight: 800 }}
                  onClick={확인}>확인</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
