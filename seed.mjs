/* 그릴링용 장면 만들기 — 4명이 서로 다르게 찍은 상태 */
const BASE='http://localhost:3000';
const jar=()=>{const j=new Map();return{async c(p,i={}){const ck=[...j].map(([k,v])=>`${k}=${v}`).join('; ');
 const r=await fetch(BASE+p,{...i,headers:{'content-type':'application/json',...(ck?{cookie:ck}:{}),...(i.headers||{})}});
 (r.headers.getSetCookie?.()??[]).forEach(c=>{const[kv]=c.split(';');const n=kv.indexOf('=');j.set(kv.slice(0,n),kv.slice(n+1))});
 const t=await r.text();let d=null;try{d=JSON.parse(t)}catch{};return{s:r.status,d}},
 post(p,b){return this.c(p,{method:'POST',body:JSON.stringify(b)})},get(p){return this.c(p)}}};

const A=jar(),B=jar(),C=jar(),D=jar();
const m=await A.post('/api/m',{name:'우리 팀 회식',hostName:'김방장',scope:'place'});
const code=m.d.code;
await B.post(`/api/m/${code}`,{action:'join',name:'박영희',pin:'1111'});
await C.post(`/api/m/${code}`,{action:'join',name:'이민준',pin:'2222'});
await D.post(`/api/m/${code}`,{action:'join',name:'김철수',pin:'3333'});

const 동=[
 {refId:'1144055000',name:'연남동',lat:37.5626,lng:126.9256},
 {refId:'1120068000',name:'성수동',lat:37.5447,lng:127.0557},
 {refId:'1114055000',name:'망원동',lat:37.5559,lng:126.9020},
 {refId:'1121051000',name:'왕십리동',lat:37.5613,lng:127.0374},
];
/* 방장 2곳, 영희 3곳, 민준 1곳, 철수 0곳 — 진행률이 애매해지는 상태 */
await A.post(`/api/m/${code}`,{action:'ping',kind:'region',...동[1]});
await A.post(`/api/m/${code}`,{action:'ping',kind:'region',...동[0]});
await B.post(`/api/m/${code}`,{action:'ping',kind:'region',...동[1]});
await B.post(`/api/m/${code}`,{action:'ping',kind:'region',...동[2]});
await B.post(`/api/m/${code}`,{action:'ping',kind:'region',...동[3]});
await C.post(`/api/m/${code}`,{action:'ping',kind:'region',...동[1]});
const v=(await A.get(`/api/m/${code}`)).d;
console.log(code);
console.log(v.candidates.map(c=>`${c.name} ${c.votes}표`).join(' · '));
console.log(`참가자 ${v.participants.length}명 · 한 곳이라도 찍은 사람 3명 · 표 총합 ${v.candidates.reduce((a,c)=>a+c.votes,0)}`);
