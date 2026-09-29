/* 방명록 — 저장소가 정해지기 전까지는 이 화면에서만 잠깐 보인다 */
import { $, el, reduced } from './util.js';
import { GUEST } from './store.js';
import { syncGuestBadges } from './home.js';

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
  syncGuestBadges();
  if(gList.scrollIntoView) gList.scrollIntoView({behavior:reduced?'auto':'smooth',block:'nearest'});
};
formState();
