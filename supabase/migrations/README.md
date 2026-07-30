# supabase/migrations — DB 변경은 여기에 파일을 "추가"한다

## 왜 이 폴더가 있나

`supabase/schema.sql` 하나만 있으면, 세 사람이 각자 컬럼을 추가할 때
**전부 같은 파일 같은 근처를 고쳐서 머지할 때마다 충돌**난다.
번호 붙은 파일을 하나씩 추가하는 방식이면 충돌이 물리적으로 안 난다.

## 규칙

1. **`schema.sql` 은 건드리지 않는다.** (통합 세션 소유 — `.github/CODEOWNERS`)
2. 필요한 변경을 `NNN_짧은설명.sql` 파일 **하나로 새로 만든다.**
   번호는 폴더에서 가장 큰 번호 + 1. 같은 번호가 겹치면 나중 사람이 올린다.
3. **여러 번 실행해도 안전하게 쓴다.** 팀원마다 자기 DB가 있고, 누가 몇 번까지
   돌렸는지 아무도 기억 못 한다.
   ```sql
   alter table participants add column if not exists prefs jsonb not null default '{}'::jsonb;
   create index if not exists idx_x on y(z);
   ```
4. PR 설명에 **"이 마이그레이션을 돌려야 함"** 이라고 적는다. 자동 적용은 없다 —
   각자 Supabase 대시보드 → SQL Editor 에 붙여넣고 Run 한다.
5. 통합 담당자가 머지할 때 `schema.sql` 에 같은 내용을 반영한다
   (새로 프로젝트를 파는 사람이 파일 하나만 돌리면 되게 유지하기 위함).

## 적용 방법

Supabase 대시보드 → **SQL Editor** → 파일 내용을 붙여넣고 **Run**.
처음 세팅하는 사람은 `../schema.sql` 하나만 돌리면 최신 상태가 된다.

## 목록

| 파일 | 내용 | 반영 여부 |
|---|---|---|
| (아직 없음) | | |
