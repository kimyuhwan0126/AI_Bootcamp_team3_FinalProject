'use client';
/* 내 모임 목록 (논의77·78·119). 서버가 `GET /api/mine` 으로 이미 세워 준 차례를 그대로 그린다.

   화면이 하는 일은 셋뿐이다 — **거르고 · 한 줄로 요약하고 · 그 모임으로 보낸다.**
   정렬을 다시 하지 않는다: 서버가 '마지막 움직임' 순으로 준다(논의77). 여기서 또 세우면
   목록이 조용히 갈라진다.

   신원은 쿠키가 안다. 쿠키가 없으면 401 이 아니라 `{meetings:[]}` 200 이라,
   '로그인해 주세요' 가 아니라 '아직 모임이 없어요' 를 그린다 — 이 앱에 로그인 안 한 상태는 없다. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
/* ⚠ 규약 타입은 지금 lib/db.ts 에 있다(내 파일이 아니라 못 옮겼다). types.ts 로 옮겨지면 여기도 바꿔라.
   `import type` 이라 구운 뒤에는 사라진다 — 화면 꾸러미에 DB 코드가 딸려 오지 않는다. */
import type { MyMeeting } from '@/lib/db';
import { 고른수, 아직 } from '@/lib/말';
import type { 상태 } from './줄글';
import { 상태of, 상태이름, 요약, 진행중 } from './줄글';
import s from './목록.module.css';

const 상태칩 = ['all', 'region', 'place', 'result', 'past'] as const;
const 역할칩 = ['all', 'host', 'member'] as const;
type 상태키 = (typeof 상태칩)[number];
type 역할키 = (typeof 역할칩)[number];

/* '전체' 는 지난 모임까지 **다** 뜻한다. 예전판은 전체에서 지난 모임을 빼 놓아 낱말이 거짓이었고,
   그 탓에 지난 모임만 가진 사람이 첫 화면에서 '모임이 없다'는 말을 들었다.
   지금은 첫 화면(전체)에서 0개면 **정말 0개**다 — 두 빈 화면을 가르는 잣대가 이것 하나로 선다. */
const 상태칩이름: Record<상태키, string> = { all: '전체', ...상태이름 };
const 역할칩이름: Record<역할키, string> = { all: '전체', host: '방장', member: '참여자' };

/* Neon 이 잠자다 깨면 첫 물음이 7초를 넘겨 넘어진다 — 사람에게 묻기 전에 몇 번 더 해 본다 */
async function 불러오기(): Promise<MyMeeting[]> {
  let 마지막: unknown = null;
  for (let 판 = 0; 판 < 3; 판++) {
    if (판) await new Promise((r) => setTimeout(r, 400 * 판));
    try {
      const r = await fetch('/api/mine', { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { meetings?: MyMeeting[] };
      return j.meetings ?? [];
    } catch (e) {
      마지막 = e;
    }
  }
  throw 마지막;
}

export default function 모임목록() {
  const [목록, set목록] = useState<MyMeeting[] | null>(null);
  const [잘못, set잘못] = useState(false);
  const [상태고름, set상태고름] = useState<상태키>('all');
  const [역할고름, set역할고름] = useState<역할키>('all');

  const 다시 = useCallback(() => {
    set목록(null); set잘못(false);
    불러오기().then(set목록).catch(() => set잘못(true));
  }, []);
  useEffect(() => { 다시(); }, [다시]);

  /* 두 축이 겹쳐 걸린다 — 상태와 역할은 성격이 다르다 */
  const 걸러진 = useMemo(() => (목록 ?? []).filter((m) => {
    if (상태고름 !== 'all' && 상태of(m) !== 상태고름) return false;
    if (역할고름 === 'host' && !m.iAmHost) return false;
    if (역할고름 === 'member' && m.iAmHost) return false;
    return true;
  }), [목록, 상태고름, 역할고름]);

  return (
    <div className="wrap">
      <div className="hd">
        <h1>모임</h1>
        <Link className={s.만들기} href="/new">＋ 모임 만들기</Link>
      </div>

      <div className={s.몸}>
        {목록 === null && !잘못 && (
          <p className="mut" data-loading style={{ padding: '40px 0', textAlign: 'center' }}>
            모임을 불러오는 중이에요
          </p>
        )}

        {잘못 && (
          /* 무엇이 잘못됐고 무엇을 하면 되는지만 말한다. 서버가 준 영문은 화면에 안 싣는다 */
          <div className={s.빈} data-error>
            <p className={s.빈제목}>모임 목록을 불러오지 못했어요</p>
            <p className="mut">인터넷이 끊겼거나 잠시 붐비는 중이에요.</p>
            <button className="cta sub" onClick={다시}>다시 해 보기</button>
          </div>
        )}

        {목록 !== null && !잘못 && 목록.length === 0 && (
          /* ① 모임이 정말 0개 — 만들기로 이끈다 (논의78) */
          <div className={s.빈} data-empty="none">
            <p className={s.빈제목}>아직 모임이 없어요</p>
            <p className="mut">모임을 만들면 여기 쌓여요. 초대 링크를 받았다면 그 링크로 바로 들어가면 돼요.</p>
            <Link className="cta" href="/new">모임 만들기</Link>
          </div>
        )}

        {목록 !== null && !잘못 && 목록.length > 0 && (
          <>
            <div className={s.거르개}>
              <div className={s.줄} data-filter-row="상태">
                <span className={s.줄이름}>상태</span>
                <span className={s.칩들}>
                  {상태칩.map((k) => (
                    <button key={k} type="button" className={s.칩} data-state-filter={k}
                            aria-pressed={상태고름 === k} onClick={() => set상태고름(k)}>
                      {상태칩이름[k]}
                    </button>
                  ))}
                </span>
              </div>
              <div className={s.줄} data-filter-row="역할">
                <span className={s.줄이름}>역할</span>
                <span className={s.칩들}>
                  {역할칩.map((k) => (
                    <button key={k} type="button" className={s.칩} data-role-filter={k}
                            aria-pressed={역할고름 === k} onClick={() => set역할고름(k)}>
                      {역할칩이름[k]}
                    </button>
                  ))}
                </span>
              </div>
            </div>

            {걸러진.length === 0 ? (
              /* ② 걸러낸 결과가 0개 — 말만 한다 (논의119). 모임은 그대로 있으니
                 만들기로 이끌면 엉뚱한 길로 민다. 되돌릴 길(거르개)은 위에 그대로 있다. */
              <p className={s.걸림} data-empty="filtered">이 조건에 맞는 모임이 없어요</p>
            ) : (
              <div className={s.목록} data-list>
                {걸러진.map((m) => <카드 key={m.code} m={m} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function 카드({ m }: { m: MyMeeting }) {
  const st: 상태 = 상태of(m);
  /* 내 할 일은 '아직 고를 것이 남았는데 내가 안 골랐다' 일 때만이다.
     정해진 모임·지난 모임에는 고를 것이 없으므로 자국을 안 붙인다. */
  const 할일 = 진행중(st) && !m.iChose;
  return (
    <Link className={s.카드} href={`/m/${m.code}`}
          data-card data-code={m.code} data-state={st}
          data-host={m.iAmHost ? '1' : undefined} data-todo={할일 ? '1' : undefined}>
      <span className={s.속}>
        <span className={s.머리}>
          <span className={s.이름}>{m.name}</span>
          {m.iAmHost && <span className={s.방장}>방장</span>}
        </span>
        <span className={s.요약}>{요약(m, Date.now())}</span>
        {진행중(st) && (
          <span className={s.바닥}>
            {할일 && <span className={s.할일}>{아직}</span>}
            <span className={s.잔}>{고른수(m.chosen)}</span>
          </span>
        )}
      </span>
      <span className={s.화살} aria-hidden>›</span>
    </Link>
  );
}
