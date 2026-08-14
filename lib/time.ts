/* 모임 시간은 한국시간으로 읽는다 (그릴링 논의28).
   화면의 <input type="datetime-local"> 은 시간대가 없는 '2026-08-20T18:30' 을 준다.
   그대로 Postgres 에 넣으면 UTC 로 읽혀 한국 새벽 3:30 이 됐다 —
   화면에는 18:30 으로 잘 보여서 눈에 안 띄지만 D-day·자동전환이 9시간 틀어진다.
   경계를 여기 두 함수로만 둔다. 다른 곳은 시간대를 몰라도 된다. */

export const KST_OFFSET_MIN = 9 * 60;

/* 약속 시간은 '2026-08-20T18:30' 한국시간 벽시계만 받는다.
   Date 가 2월 31일을 3월 3일로 조용히 넘기므로 되돌려 같은 날인지까지 본다 —
   엉터리 문자열이 굴러 다른 날로 저장되거나(2026-13-45 → 2027-02-17),
   형식이 안 맞으면 아래 kstToInstant 가 null 을 줘 시간이 조용히 지워졌다.
   만들 때(api/m)와 고칠 때(api/m/[code])가 **같은 잣대**여야 해서 여기 둔다 (그릴링 논의70) —
   두 곳에 베껴 두면 한쪽만 고치고 잊는다. */
export function 약속시간유효(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(:\d{2})?$/.exec(s);
  if (!m) return false;
  const [y, mo, d, h, mi] = m.slice(1, 6).map(Number);
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || h > 23 || mi > 59) return false;
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** '2026-08-20T18:30' (한국시간) → 저장할 ISO 문자열 */
export function kstToInstant(local: string | null): string | null {
  if (!local) return null;
  const m = local.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi) - KST_OFFSET_MIN * 60_000).toISOString();
}

/** 저장된 값 → '2026-08-20T18:30' (한국시간). input 에 그대로 넣을 수 있다 */
export function instantToKst(iso: string | null): string {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  return new Date(t.getTime() + KST_OFFSET_MIN * 60_000).toISOString().slice(0, 16);
}

/** 사람이 읽는 꼴 — '8월 20일 (목) 오후 6:30' */
export function formatKst(iso: string | null): string {
  const s = instantToKst(iso);
  if (!s) return '';
  const t = new Date(s + ':00Z');
  const 요일 = ['일', '월', '화', '수', '목', '금', '토'][t.getUTCDay()];
  const h = t.getUTCHours(), mi = t.getUTCMinutes();
  const 오전 = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${t.getUTCMonth() + 1}월 ${t.getUTCDate()}일 (${요일}) ${오전} ${h12}:${String(mi).padStart(2, '0')}`;
}
