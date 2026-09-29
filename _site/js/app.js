/* =====================================================================
   PLAYLOG — 화면 동작
   데이터는 전부 data/site.json 에서 온다 (scripts/build.py 가 만든다).
   글을 고치려면 posts/ 의 마크다운을, 게임 목록은 content/games.json 을 고친다.
   ===================================================================== */

let SITE;
try {
  const res = await fetch('data/site.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
  SITE = await res.json();
} catch (err) {
  document.body.innerHTML =
    '<div style="padding:40px;font-family:system-ui;line-height:1.7;color:#17232D">'
    + '<b>데이터를 불러오지 못했습니다.</b><br>'
    + '파일을 직접 열었다면(file://) 브라우저가 막은 것입니다. 로컬에서는<br>'
    + '<code>python scripts/build.py &amp;&amp; python -m http.server -d _site</code><br>'
    + '로 띄운 뒤 <code>http://localhost:8000</code> 을 여세요.<br><small>' + err + '</small></div>';
  throw err;
}
const FEATURED = SITE.games;     /* 글이 있는 게임 (카트리지) */
const ARCHIVE  = SITE.reviews;   /* 한줄 리뷰만 있는 게임 */

/* ---------- 유틸 ---------- */
const $ = s => document.querySelector(s);
const el = (t,c) => { const n=document.createElement(t); if(c) n.className=c; return n; };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse  = matchMedia('(pointer: coarse)').matches;

function starRow(r, size){
  const w = size||13, box = el('div','stars');
  for(let i=1;i<=5;i++){
    const s=document.createElementNS('http://www.w3.org/2000/svg','svg');
    s.setAttribute('width',w); s.setAttribute('height',w); s.setAttribute('viewBox','0 0 24 24');
    const d='M12 2.6 14.9 9.2 22 10 16.8 14.9 18.2 22 12 18.5 5.8 22 7.2 14.9 2 10l7.1-.8Z';
    const p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d',d); p.setAttribute('stroke-width','1.6'); p.setAttribute('stroke-linejoin','round');
    if(r>=i){ p.setAttribute('fill','#E78B3B'); p.setAttribute('stroke','#E78B3B'); }
    else if(r>=i-0.5){
      const id='hs'+Math.random().toString(36).slice(2,8);
      const defs=document.createElementNS('http://www.w3.org/2000/svg','defs');
      const g=document.createElementNS('http://www.w3.org/2000/svg','linearGradient');
      g.setAttribute('id',id); g.setAttribute('x1','0'); g.setAttribute('x2','1'); g.setAttribute('y1','0'); g.setAttribute('y2','0');
      [['50%','#E78B3B'],['50%','rgba(0,0,0,0)']].forEach(([o,c])=>{
        const st=document.createElementNS('http://www.w3.org/2000/svg','stop');
        st.setAttribute('offset',o); st.setAttribute('stop-color',c); g.appendChild(st);
      });
      defs.appendChild(g); s.appendChild(defs);
      p.setAttribute('fill','url(#'+id+')'); p.setAttribute('stroke','#E78B3B');
    } else { p.setAttribute('fill','none'); p.setAttribute('stroke','rgba(255,255,255,.45)'); }
    s.appendChild(p); box.appendChild(s);
  }
  return box;
}
function tick(){
  const d=new Date(), t=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  ['#clock','#clock2','#clock3'].forEach(s=>{ const n=$(s); if(n) n.textContent=t; });
}
setInterval(tick,10000); tick();

/* ---------- 홈 그리기 ---------- */
const rail=$('#rail'), grid=$('#grid');
FEATURED.forEach(g=>{
  const b=el('button','tile'); b.setAttribute('aria-label',g.name+' — 글 '+g.posts.length+'편');
  const art=el('div','art'); art.style.background=g.art;
  const pill=el('span','pill');
  pill.innerHTML='<svg width="11" height="13" viewBox="0 0 11 13" fill="none" style="color:#EFEAE1"><path d="M1 1.6C1 1.27 1.27 1 1.6 1h7.8c.33 0 .6.27.6.6v8.2c0 .2-.1.38-.26.49l-1.6 1.06a.6.6 0 0 1-.33.1H1.6a.6.6 0 0 1-.6-.6V1.6Z" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/><path d="M3.3 3.5h4.4v2.9H3.3z" fill="currentColor" opacity=".6"/></svg><span>'+g.posts.length+'</span>';
  const meta=el('div','meta'), nm=el('div','name'); nm.textContent=g.name;
  meta.append(pill,nm);
  b.append(art, el('div','tint'), el('div','scrim'), meta);
  b.onclick=()=>openInsert(g);
  rail.appendChild(b);
});
ARCHIVE.forEach(g=>{
  const b=el('button','atile'); b.setAttribute('aria-label',g.name+' — '+g.r+'점');
  const art=el('div','art'); art.style.background=g.art;
  const nm=el('div','an'); nm.textContent=g.name;
  b.append(art, el('div','tint'), el('div','scrim'), nm, starRow(g.r));
  b.onclick=()=>openSheet(g);
  grid.appendChild(b);
});
$('#featCount').textContent=FEATURED.length;
$('#archCount').textContent=FEATURED.length+ARCHIVE.length;

/* ---------- 가로 레일 : 버튼은 한 칸씩, 스크롤/스와이프는 자유롭게 ---------- */
const railWrap=$('#railWrap'), railPrev=$('#railPrev'), railNext=$('#railNext');
const railStep=()=>{ const t=rail.querySelector('.tile');
  return t ? t.getBoundingClientRect().width+20 : 232; };
function railState(){
  // 스크롤 스냅이 시작점을 정확히 0으로 두지 않는다 (레일 좌측 패딩만큼 밀림) — 여유 필요
  const max=rail.scrollWidth-rail.clientWidth, pad=12;
  const cp=rail.scrollLeft>pad, cn=rail.scrollLeft<max-pad;
  railPrev.disabled=!cp; railNext.disabled=!cn;
  railWrap.classList.toggle('can-prev',cp);
  railWrap.classList.toggle('can-next',cn);
}
const railGo=d=>rail.scrollBy({left:d*railStep(),behavior:reduced?'auto':'smooth'});
railPrev.onclick=()=>railGo(-1);
railNext.onclick=()=>railGo(1);
rail.addEventListener('scroll',railState,{passive:true});
addEventListener('resize',railState);
railState();

$('#mq').innerHTML=Array(8).fill('<span>PLAY</span><span>◆</span><span>RECORD</span>'
  +'<span>◆</span><span>TALK</span><span>◆</span><span>REPEAT</span><span>◆</span>').join('');

/* ---------- 화면 전환 ---------- */
let current='home';
function show(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('on',s.id===id));
  current=id; window.scrollTo(0,0);
}
$('#ejectBtn').onclick=()=>show('home');
document.querySelectorAll('[data-back]').forEach(k=>{
  k.closest('.hint').style.cursor='pointer';
  k.closest('.hint').onclick=()=>show(k.dataset.back);
});

/* ---------- 리뷰 시트 ---------- */
const sheetWrap=$('#sheetWrap'), sheet=$('#sheet');
function openSheet(g){
  sheet.innerHTML='';
  const grab=el('div','grab');
  const top=el('div','sh-top');
  const art=el('div','sh-art'); art.style.background=g.art;
  const mid=el('div');
  const nm=el('div','sh-name'); nm.textContent=g.name;
  const rate=el('div','sh-rate'); const sc=el('span','sh-score'); sc.textContent=g.r.toFixed(1);
  rate.append(starRow(g.r,15),sc);
  const pl=el('div','sh-played'); pl.textContent='PLAYED '+g.y+' · '+g.h+'H';
  mid.append(nm,rate,pl); top.append(art,mid);
  const body=el('p','sh-body'); body.textContent=g.rev;
  const foot=el('div','sh-foot');
  const src=el('div','sh-src'); src.innerHTML='이미지 출처<br>자리';
  foot.append(el('div'),src);
  sheet.append(grab,top,body,foot);
  sheetWrap.classList.add('on');
  requestAnimationFrame(()=>sheetWrap.classList.add('in'));
}
function closeSheet(){
  sheetWrap.classList.remove('in');
  setTimeout(()=>sheetWrap.classList.remove('on'), reduced?0:320);
}
$('#dim').onclick=closeSheet;

/* ---------- 삽입 화면 ---------- */
let active=null;
const cart=$('#dragCart'), arena=$('#arena'), slot=$('#slot');
function openInsert(g){
  active=g;
  setCtx(g.name.toUpperCase());
  $('#cartTitle').textContent=g.name.toUpperCase();
  $('#cartWin').style.background=g.art;
  $('#cartBand').style.background=g.color;
  $('#insHelp').textContent = coarse
    ? '카트리지를 눌러서 꽂으세요. 끌어다 놓아도 됩니다.'
    : '아래 슬롯으로 끌어다 놓으세요. 그냥 눌러도 꽂힙니다.';
  show('insert');
  requestAnimationFrame(resetCart);
}
function cartSize(){ const r=cart.getBoundingClientRect(); return {w:r.width,h:r.height}; }
function homePos(){
  const a=arena.getBoundingClientRect(), c=cartSize();
  return { x:(a.width-c.w)/2, y:Math.max(6,(a.height-150-c.h)/2) };
}
function targetPos(){
  const a=arena.getBoundingClientRect(), s=slot.getBoundingClientRect(), c=cartSize();
  return { x:(s.left-a.left)+(s.width-c.w)/2, y:(s.top-a.top)-c.h*0.62 };
}
function place(p){ cart.style.left=p.x+'px'; cart.style.top=p.y+'px'; }
function resetCart(){
  cart.className='cart'; cart.style.transform='';
  cart.style.zIndex=3; place(homePos());
  slot.classList.remove('hot'); $('#led').classList.remove('on');
}
window.addEventListener('resize',()=>{ if(current==='insert' && !dragging) resetCart(); });

/* ---------- 드래그 ---------- */
const SNAP=70;
let dragging=false, grabDX=0, grabDY=0, moved=0;
cart.addEventListener('pointerdown',e=>{
  if(cart.classList.contains('settling')) return;
  dragging=true; moved=0;
  cart.setPointerCapture(e.pointerId);
  cart.className='cart grabbing'; cart.style.zIndex=6;
  const a=arena.getBoundingClientRect(), r=cart.getBoundingClientRect();
  grabDX=e.clientX-r.left; grabDY=e.clientY-r.top;
  e.preventDefault();
});
cart.addEventListener('pointermove',e=>{
  if(!dragging) return;
  const a=arena.getBoundingClientRect();
  const x=e.clientX-a.left-grabDX, y=e.clientY-a.top-grabDY;
  moved+=Math.abs(e.movementX||0)+Math.abs(e.movementY||0);
  place({x,y});
  const t=targetPos(), d=Math.hypot(x-t.x,y-t.y), near=d<SNAP;
  slot.classList.toggle('hot',near);
  // 커서 가로 변위를 rotateY에 ±18도까지만. 슬롯 근처에선 0도로 수렴. Z축 회전은 없다.
  const c=cartSize(), cx=x+c.w/2, mid=a.width/2;
  let ry=Math.max(-18,Math.min(18,(cx-mid)/mid*18));
  if(near) ry*=Math.max(0,(d-14)/(SNAP-14));
  cart.style.transform='perspective(950px) rotateY('+ry.toFixed(1)+'deg) rotateX(3deg)';
});
function endDrag(e){
  if(!dragging) return;
  dragging=false;
  const a=arena.getBoundingClientRect(), r=cart.getBoundingClientRect();
  const x=r.left-a.left, y=r.top-a.top, t=targetPos();
  if(moved<6){ insertNow(); return; }                 // 사실상 클릭이었다
  if(Math.hypot(x-t.x,y-t.y)<SNAP) insertNow();       // 자석 흡착
  else {                                              // 실패 — 제자리로
    cart.className='cart returning'; cart.style.transform='';
    place(homePos()); slot.classList.remove('hot');
    setTimeout(()=>{ cart.className='cart'; cart.style.zIndex=3; }, reduced?0:270);
  }
}
cart.addEventListener('pointerup',endDrag);
cart.addEventListener('pointercancel',endDrag);
cart.addEventListener('keydown',e=>{
  if(e.key==='Enter'||e.key===' '){ e.preventDefault(); insertNow(); }
});

function insertNow(){
  slot.classList.add('hot'); $('#led').classList.add('on');
  cart.className='cart settling'; cart.style.zIndex=3;
  cart.style.transform='perspective(950px) rotateY(0deg) rotateX(3deg)';
  place(targetPos());
  setTimeout(boot, reduced?0:260);
}
$('#skipBtn').onclick=()=>{ slot.classList.add('hot'); place(targetPos()); boot(); };

/* ---------- 부팅 ---------- */
function boot(){
  const b=$('#boot');
  $('#bootTxt').textContent='READING  '+active.name.toUpperCase();
  if(reduced){ openLibrary(); return; }
  b.classList.add('on');
  requestAnimationFrame(()=>b.classList.add('run'));
  setTimeout(()=>{ openLibrary(); b.classList.remove('on','run'); }, 560);
}

/* ---------- 라이브러리 ---------- */
const slots=$('#slots');
function openLibrary(){
  const g=active;
  setCtx(g.name.toUpperCase());
  $('#libName').textContent=g.name;
  $('#libN').textContent=g.posts.length+' SAVES';
  /* 카트리지를 꽂은 순간부터 그 게임의 스킨이 화면을 가져간다 */
  $('#library').dataset.skin=g.skin||'base';
  $('#reader').dataset.skin=g.skin||'base';
  slots.innerHTML=''; slots.classList.remove('boot');
  g.posts.forEach((p,i)=>{
    const b=el('button','save');
    const bar=el('div','bar'); bar.style.background=g.color;
    if(i>0) bar.style.opacity='1';
    const th=el('div','thumb');
    th.style.background = p.cover ? 'url("'+p.cover+'") center/cover' : g.art;
    b.appendChild(el('div','tex'));
    const mid=el('div','mid');
    const n=el('div','n'); n.textContent='SAVE '+String(g.posts.length-i).padStart(2,'0');
    const t=el('div','t'); t.textContent=p.t;
    const m=el('div','m');
    m.textContent=p.d+' · 읽는 데 '+p.min+'분'
      +(p.tags&&p.tags.length?'  ·  '+p.tags.map(x=>'#'+x).join(' '):'');
    mid.append(n,t,m);
    const pr=el('div','prog');
    const pc=el('div','pct'); pc.textContent=p.pct+'%';
    const tr=el('div','track'); const fi=el('i');
    fi.style.width=p.pct+'%'; fi.style.background=g.color; tr.appendChild(fi);
    pr.append(pc,tr);
    b.append(bar,th,mid,pr);
    b.style.animationDelay=(i*40)+'ms';
    b.onclick=()=>openReader(g,p,fi,pc);
    slots.appendChild(b);
  });
  show('library');
  if(!reduced) requestAnimationFrame(()=>slots.classList.add('boot'));
}

/* ---------- 글 읽기 : 진행률은 실제로 읽은 만큼 ---------- */
const reader=$('#reader'), rd=$('#rd'), rdBar=$('#rdBar');
let cur=null;
function openReader(g,p,fill,pctEl){
  cur={p,fill,pctEl};
  rd.innerHTML='';
  const back=el('button','rd-back');
  back.innerHTML='<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.6 1.6 3.2 6l4.4 4.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>세이브 목록';
  back.onclick=closeReader;
  rd.appendChild(back);
  const hero=el('div','hero');
  if(p.cover){const im=new Image();im.className='cov';im.src=p.cover;im.alt='';hero.appendChild(im);}
  hero.append(el('div','tex'),el('div','glow'),el('div','frame'));
  ['tl','tr','bl','br'].forEach(k=>hero.appendChild(el('span','brk '+k)));
  const comp=el('div','compass'); comp.innerHTML='<i></i><span>N</span>'; hero.appendChild(comp);
  const hin=el('div','hin');
  const h=el('h1'); h.textContent=p.t;
  const m=el('div','rmeta'); m.textContent=g.name+' · '+p.d+' · 읽는 데 '+p.min+'분';
  hin.append(h,m); hero.appendChild(hin); rd.appendChild(hero);
  (p.blocks||[]).forEach(b=>{
    if(b.type==='text'){ const q=el('p'); q.textContent=b.text; rd.appendChild(q); }
    else{
      const f=el('figure'); const im=new Image(); im.src=b.src; im.alt=b.caption||'';
      f.appendChild(im);
      if(b.caption){ const cp=el('figcaption'); const sp=el('span');
        sp.textContent=b.caption; cp.appendChild(sp); f.appendChild(cp); }
      rd.appendChild(f);
    }
  });
  const endl=el('div','end');
  const es=el('span'); es.textContent='END OF LOG';
  const eb=el('b'); eb.innerHTML='PLAY<i>LOG</i>';
  endl.append(es,eb); rd.appendChild(endl);
  const end=el('div'); end.style.height='40vh'; rd.appendChild(end);
  reader.classList.add('on'); reader.scrollTop=0; updateProgress();
}
function closeReader(){ reader.classList.remove('on'); cur=null; }
function updateProgress(){
  if(!cur) return;
  const max=reader.scrollHeight-reader.clientHeight;
  const pct=max<=0?100:Math.min(100,Math.round(reader.scrollTop/max*100));
  rdBar.style.width=pct+'%';
  if(pct>cur.p.pct){ cur.p.pct=pct; cur.fill.style.width=pct+'%'; cur.pctEl.textContent=pct+'%'; }
}
reader.addEventListener('scroll',updateProgress,{passive:true});

/* ---------- ESC ---------- */
addEventListener('keydown',e=>{
  if(e.key!=='Escape') return;
  if(reader.classList.contains('on')) closeReader();
  else if(sheetWrap.classList.contains('on')) closeSheet();
  else if(current==='library'||current==='insert') show('home');
});

/* =====================================================================
   추가 : 자기소개 · 방명록 · 탭 내비게이션
   ===================================================================== */

/* ---------- 탭 ---------- */
const TABS = [
  { id:'about', sys:'ABOUT',     ko:'자기소개' },
  { id:'home',  sys:'PLAY',      ko:'플레이 기록' },
  { id:'guest', sys:'GUESTBOOK', ko:'방명록' }
];
document.querySelectorAll('[data-tabs]').forEach(host=>{
  const inner=el('div','tabs-in');
  const lg=el('button','logo');
  lg.setAttribute('aria-label','PLAYLOG 홈');
  lg.innerHTML='<svg width="15" height="18" viewBox="0 0 11 13" fill="none">'
    +'<path d="M1 1.6C1 1.27 1.27 1 1.6 1h7.8c.33 0 .6.27.6.6v8.2c0 .2-.1.38-.26.49l-1.6 1.06'
    +'a.6.6 0 0 1-.33.1H1.6a.6.6 0 0 1-.6-.6V1.6Z" stroke="currentColor" stroke-width="1.05" '
    +'stroke-linejoin="round"/><path d="M3.3 3.5h4.4v2.9H3.3z" fill="currentColor" opacity=".55"/>'
    +'</svg><span class="wm">PLAY<i>LOG</i></span>';
  lg.onclick=()=>show('home');
  inner.appendChild(lg);
  TABS.forEach(t=>{
    const b=el('button','tab'); b.dataset.go=t.id;
    const s=el('span','sys'); s.textContent=t.sys;
    const k=el('span','ko');  k.textContent=t.ko;
    b.append(s,k); b.onclick=()=>show(t.id);
    inner.appendChild(b);
  });
  inner.appendChild(el('span','tab-ctx'));   /* 꽂힌 카트리지 이름이 들어갈 자리 */
  host.appendChild(inner);
});
/* 꽂은 카트리지 이름은 이제 탭 바 오른쪽이 맡는다 (예전 상단바 자리) */
function setCtx(t){
  document.querySelectorAll('.tab-ctx').forEach(n=>n.textContent=t||'');
}
function syncTabs(id){
  /* 삽입·라이브러리는 '플레이 기록' 안쪽이다 */
  const key=(id==='insert'||id==='library')?'home':id;
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b.dataset.go===key));
  if(key===id) setCtx('');
}
/* 기존 show()는 그대로 두고 탭 동기화만 얹는다 */
const _show = show;
show = function(id){ _show(id); syncTabs(id); };
syncTabs('home');
/* 새로 붙은 화면의 시계도 같이 돌린다 */
function tick2(){
  const d=new Date(), t=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  ['#clock4','#clock5'].forEach(s=>{ const n=$(s); if(n) n.textContent=t; });
}
setInterval(tick2,10000); tick2();

/* ---------- 자기소개 : 숫자는 전부 실제 데이터에서 ---------- */
const totalPosts = FEATURED.reduce((n,g)=>n+g.posts.length,0);
const avgStar    = ARCHIVE.reduce((n,g)=>n+g.r,0)/ARCHIVE.length;
const totalHours = ARCHIVE.reduce((n,g)=>n+g.h,0);

$('#spSlots').textContent = FEATURED.length+' CARTRIDGES';
$('#spSaves').textContent = totalPosts+' SAVES';
$('#spBoot').textContent  = new Date().toISOString().slice(0,10).replace(/-/g,'.');

[
  { n:FEATURED.length+ARCHIVE.length, u:'개', l:'기록에 남긴 게임' },
  { n:totalPosts,                     u:'편', l:'게임별 상세 글' },
  { n:avgStar.toFixed(1),             u:'',   l:'한줄 리뷰 평균 별점' },
  { n:totalHours,                     u:'시간', l:'아카이브 누적 플레이' }
].forEach(s=>{
  const c=el('div','stat');
  const n=el('div','n'); n.textContent=s.n;
  if(s.u){ const i=el('i'); i.textContent=s.u; n.appendChild(i); }
  const l=el('div','l'); l.textContent=s.l;
  c.append(n,l); $('#stats').appendChild(c);
});

/* 별점 분포 — 후한 채점자인지 짠 채점자인지가 한눈에 보인다 */
const bucket=[0,0,0,0,0];
ARCHIVE.forEach(g=>bucket[Math.min(4,Math.max(0,Math.round(g.r)-1))]++);
const bmax=Math.max(...bucket);
for(let i=4;i>=0;i--){
  const row=el('div','drow');
  const lb=el('span','lb'); lb.textContent=(i+1)+'★';
  const tr=el('div','tr'); const fi=el('i'); fi.style.width='0%'; tr.appendChild(fi);
  const c=el('span','c'); c.textContent=bucket[i];
  row.append(lb,tr,c); $('#dist').appendChild(row);
  requestAnimationFrame(()=>{ fi.style.width=(bmax? bucket[i]/bmax*100:0)+'%'; });
}

/* 태그 빈도 */
const tagCount={};
FEATURED.forEach(g=>g.posts.forEach(p=>(p.tags||[]).forEach(t=>{ tagCount[t]=(tagCount[t]||0)+1; })));
Object.entries(tagCount).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([t,n])=>{
  const c=el('span','chip'); c.textContent='#'+t;
  if(n>1){ const i=el('i'); i.textContent=n; c.appendChild(i); }
  $('#tagChips').appendChild(c);
});

/* 최근 카트리지 — 누르면 기존 삽입 화면으로 그대로 연결된다 */
FEATURED.slice(0,6).forEach(g=>{
  const b=el('button','mcart'); b.setAttribute('aria-label',g.name+' 카트리지 꽂기');
  const art=el('div','art'); art.style.background=g.art;
  const nm=el('div','nm'); nm.textContent=g.name;
  b.append(art, el('div','tint'), el('div','scrim'), nm);
  b.onclick=()=>openInsert(g);
  $('#mini').appendChild(b);
});

/* ---------- 방명록 ---------- */
/* 저장소 미정 — 지금은 메모리 배열 하나가 전부다. 나중에 이 배열을
   서버/댓글 서비스 응답으로 바꿔 끼우면 화면은 손댈 게 없다. */
const GUEST = SITE.guestbook;
const BLOCKS=24;
const gList=$('#gList'), mcBlocks=$('#mcBlocks');

function renderGuest(freshId){
  gList.innerHTML='';
  GUEST.forEach((g,i)=>{
    const box=el('div','gentry'+(g.mine?' mine':'')+(g.id&&g.id===freshId?' fresh':''));
    box.appendChild(el('div','bar'));
    const hd=el('div','g-hd');
    const no=el('span','g-no'); no.textContent='SAVE '+String(GUEST.length-i).padStart(2,'0');
    const nm=el('span','g-nm'); nm.textContent=g.n;
    const dt=el('span','g-dt'); dt.textContent=g.d;
    hd.append(no,nm,dt);
    const msg=el('p','g-msg'); msg.textContent=g.m;
    box.append(hd,msg);
    if(g.re){
      const re=el('div','g-re');
      const who=el('span','who'); who.textContent='수';
      const p=el('p'); p.textContent=g.re;
      re.append(who,p); box.appendChild(re);
    }
    gList.appendChild(box);
  });
  $('#gCount').textContent=GUEST.length;
  $('#mcUsed').textContent=GUEST.length;
  mcBlocks.innerHTML='';
  for(let i=0;i<BLOCKS;i++){
    const b=el('span','blk'+(i<GUEST.length?' used':''));
    mcBlocks.appendChild(b);
  }
}
renderGuest();

const gName=$('#gName'), gMsg=$('#gMsg'), gSave=$('#gSave'), gCnt=$('#gCnt');
function formState(){
  gCnt.textContent=gMsg.value.length+' / 300';
  gSave.disabled = !(gName.value.trim() && gMsg.value.trim());
}
gName.addEventListener('input',formState);
gMsg.addEventListener('input',formState);
gSave.onclick=()=>{
  if(GUEST.length>=BLOCKS){ alert('메모리 카드가 가득 찼습니다.'); return; }
  const d=new Date();
  const id='g'+Date.now();
  GUEST.unshift({
    id, n:gName.value.trim(), m:gMsg.value.trim(),
    d:d.getFullYear()+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+String(d.getDate()).padStart(2,'0'),
    mine:true
  });
  gMsg.value=''; formState();
  renderGuest(id);
  if(gList.scrollIntoView) gList.scrollIntoView({behavior:reduced?'auto':'smooth',block:'nearest'});
};
formState();

/* ---------- 랜딩 : 전원을 켜는 화면 ----------
   "최초 접속 시에만" 을 진짜로 지키려면 방문 여부를 어딘가 남겨야 한다.
   그 저장소가 아직 정해지지 않았으므로, 판단은 아래 한 함수로 몰아뒀다.
   배포할 때 이 함수 안만 바꾸면 나머지는 손댈 게 없다.
     - localStorage 한 줄이면 충분하고 (기기별 1회)
     - 계정/쿠키를 쓰면 사람별 1회가 된다
   지금은 프로토타입이라 늘 true — 새로고침할 때마다 보인다. */
function shouldShowLanding(){
  return true;   /* ← 배포 시 : return !localStorage.getItem('pl_seen'); */
}
function markLandingSeen(){
  /* ← 배포 시 : localStorage.setItem('pl_seen','1'); */
}

const landing=$('#landing');
[
  { n:FEATURED.length,                u:'개', l:'카트리지' },
  { n:totalPosts,                     u:'편', l:'상세 기록' },
  { n:ARCHIVE.length,                 u:'개', l:'한줄 리뷰' }
].forEach(s=>{
  const c=el('div','ld-stat');
  const b=document.createElement('b'); b.textContent=s.n+s.u;
  const sp=el('span'); sp.textContent=s.l;
  c.append(b,sp); $('#ldStats').appendChild(c);
});

function closeLanding(){
  if(!landing.classList.contains('on')) return;
  markLandingSeen();
  if(reduced){ landing.classList.remove('on'); return; }
  landing.classList.add('out');
  setTimeout(()=>landing.classList.remove('on','out'),420);
}
$('#ldStart').onclick=closeLanding;
addEventListener('keydown',e=>{
  if(!landing.classList.contains('on')) return;
  if(e.key==='Enter'||e.key===' '||e.key==='Escape'){ e.preventDefault(); closeLanding(); }
});
if(shouldShowLanding()){
  landing.classList.add('on');
  requestAnimationFrame(()=>$('#ldStart').focus({preventScroll:true}));
}
