(()=>{'use strict';
// ===== סיכומים: שבועי (כל שבת 22:00, נשמרים כל החודש, נמחקים ב-1 לחודש 00:00) + חודשי (יום אחרון בחודש 20:00, נעלם 72 שעות אחרי פתיחה / 72 שעות אחרי יצירה אם לא נפתח) =====
// לא מושפעים מהאיפוס השבועי של היומן
const Q=s=>document.querySelector(s),H=3600000,M_TTL=72*H;
const J=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}},W=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const pad=n=>String(n).padStart(2,'0'),ymOf=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}`,isoD=d=>`${ymOf(d)}-${pad(d.getDate())}`,r2=n=>Math.round(n*100)/100;
const prevYm=m=>{const [y,n]=m.split('-').map(Number);return ymOf(new Date(y,n-2,1))};
const monthName=m=>new Date(+m.slice(0,4),+m.slice(5)-1,1).toLocaleDateString('he-IL',{month:'long',year:'numeric'});
const ils=n=>`<span class="b-money">${new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',maximumFractionDigits:0}).format(n||0)}</span>`;
const nis=n=>`${Math.round(n||0).toLocaleString('he-IL')} ₪`;
const BC=()=>(window.BudgetAPI||{}).categories||{},bname=k=>(BC()[k]||['📦 אחר'])[0];
const pct=(a,b)=>b?Math.round(a/b*100):0;
const chg=(v,pv,goodUp,unit='%')=>{if(pv==null)return'';let c;if(unit==='pt')c=Math.round(v-pv);else{if(!pv)return v?'<span class="b-chg b-muted">חדש</span>':'';c=Math.round((v/pv-1)*100)}if(!c)return'<span class="b-chg b-muted">ללא שינוי</span>';const good=goodUp?c>0:c<0;return`<span class="b-chg ${good?'b-good':'b-bad'}">${c>0?'▲':'▼'} ${Math.abs(c)}%</span>`};
const getWeeks=()=>J('weekSummaries',[]).filter(x=>x&&x.id).sort((a,b)=>a.from.localeCompare(b.from));
const setWeeks=a=>W('weekSummaries',a);
const wLabel=s=>{const f=x=>{const [,m,d]=x.split('-').map(Number);return d+'/'+m};return`\u2066${f(s.from)}–${f(s.to)}\u2069`};
const comp=s=>({done:s.tasks.done+s.todos.done,total:s.tasks.total+s.todos.total});

// ---------- חישוב שבוע ----------
function budgetRows(m){const b=J('budget',{})||{},a=(b.entries||[]).filter(e=>String(e.date).slice(0,7)===m).map(e=>({...e,day:+String(e.date).slice(8,10)}));
 for(const r of b.recurring||[])if(r.start<=m&&(!r.end||r.end>=m))a.push({...r,fixed:true,day:+r.day||1});return a}
function computeWeek(key){if(!key||!/^\d{4}-\d{1,2}-\d{1,2}$/.test(key))return null;const pl=load(),td=lt(),[y,mo,da]=key.split('-').map(Number),days=[];for(let i=0;i<7;i++)days.push(new Date(y,mo-1,da+i));
 let ts=[],tds=[];const perDay=days.map(d=>{const a=pl[dk(d)]||[],b=td[dk(d)]||[];ts=ts.concat(a);tds=tds.concat(b);return a.filter(t=>t.done).length+b.filter(t=>t.done).length});
 const cats={};for(const k in CATS){const a=ts.filter(t=>(t.cat||'other')===k),b=tds.filter(t=>t.cat===k);if(!a.length&&!b.length)continue;cats[k]={n:a.length+b.length,nd:a.filter(t=>t.done).length+b.filter(t=>t.done).length,min:a.reduce((x,t)=>x+ +t.dur,0),doneMin:a.filter(t=>t.done).reduce((x,t)=>x+ +t.dur,0)}}
 const isos=days.map(isoD),from=isos[0],to=isos[6],mk=to.slice(0,7),endDay=+to.slice(8),b=J('budget',{})||{};
 const wk=(b.entries||[]).filter(e=>e.kind==='expense'&&isos.includes(String(e.date))),byCat={};wk.forEach(e=>byCat[e.category||'other']=r2((byCat[e.category||'other']||0)+ +e.amount));
 const month=r2(budgetRows(mk).filter(e=>e.kind==='expense'&&e.day<=endDay).reduce((x,e)=>x+ +e.amount,0));
 const week=r2(wk.reduce((x,e)=>x+ +e.amount,0));if(!ts.length&&!tds.length&&!week)return null;const best=perDay.indexOf(Math.max(...perDay));
 return{id:key,from,to,tasks:{done:ts.filter(t=>t.done).length,total:ts.length,planMin:ts.reduce((x,t)=>x+ +t.dur,0),doneMin:ts.filter(t=>t.done).reduce((x,t)=>x+ +t.dur,0)},todos:{done:tds.filter(t=>t.done).length,total:tds.length},cats,bestDay:perDay[best]?best:-1,spent:{week,byCat,month,monthKey:mk},made:Date.now()}}
function upsertWeek(s,keepMade){const a=getWeeks(),i=a.findIndex(x=>x.id===s.id);if(i>=0){if(keepMade)s.made=a[i].made;a[i]=s}else a.push(s);a.sort((x,y)=>x.from.localeCompare(y.from));setWeeks(a)}

// ---------- חישוב חודש ----------
function catTotals(m,upto=31){const o={};let inc=0,exp=0,sav=0;for(const e of budgetRows(m)){if(e.day>upto)continue;const v=+e.amount||0;if(e.kind==='income')inc+=v;else if(e.kind==='saving')sav+=v;else if(e.kind==='expense'){exp+=v;const k=e.category||'other';o[k]=(o[k]||0)+v}}for(const k in o)o[k]=r2(o[k]);return{cats:o,income:r2(inc),expenses:r2(exp),savings:r2(sav),left:r2(inc-exp-sav)}}
function computeMonth(m){const weeks=getWeeks().map(w=>({id:w.id,from:w.from,to:w.to,done:comp(w).done,total:comp(w).total,doneMin:w.tasks.doneMin,spent:w.spent.week}));
 const cw=typeof wstart==='function'?dk(wstart()):null;if(cw&&!weeks.some(w=>w.id===cw)){const s=computeWeek(cw);if(s)weeks.push({id:s.id,from:s.from,to:s.to,done:comp(s).done,total:comp(s).total,doneMin:s.tasks.doneMin,spent:s.spent.week,partial:true})}
 weeks.sort((a,b)=>a.from.localeCompare(b.from));const cur=catTotals(m),prev=catTotals(prevYm(m)),lim=((J('budget',{})||{}).limits||{})[m]||{};
 const done=weeks.reduce((a,w)=>a+w.done,0),total=weeks.reduce((a,w)=>a+w.total,0),doneMin=weeks.reduce((a,w)=>a+(w.doneMin||0),0);
 const rated=weeks.filter(w=>w.total>0).map(w=>({...w,p:pct(w.done,w.total)}));let best=null,worst=null;if(rated.length){best=rated.reduce((a,b)=>b.p>a.p?b:a);if(rated.length>1){worst=rated.reduce((a,b)=>b.p<a.p?b:a);if(worst.id===best.id)worst=null}}
 const cats=Object.keys({...cur.cats,...prev.cats}).map(k=>({k,v:cur.cats[k]||0,pv:prev.cats[k]||0})).sort((a,b)=>b.v-a.v);
 const targets=Object.entries(lim).filter(([,t])=>+t>0).map(([k,t])=>({k,target:+t,spent:cur.cats[k]||0,pct:pct(cur.cats[k]||0,+t)}));
 const ins=[];const up=cats.filter(c=>c.pv>0&&c.v>c.pv).sort((a,b)=>(b.v-b.pv)-(a.v-a.pv))[0],down=cats.filter(c=>c.pv>0&&c.v<c.pv).sort((a,b)=>(a.v-a.pv)-(b.v-b.pv))[0];
 if(up)ins.push(`הכי עלה: ${bname(up.k)} – ${nis(up.v)} לעומת ${nis(up.pv)} בחודש שעבר`);if(down)ins.push(`הכי ירד: ${bname(down.k)} – חסכת ${nis(down.pv-down.v)} לעומת החודש שעבר`);
 if(rated.length>1){const a=rated[0].p,z=rated[rated.length-1].p;ins.push(z>a?`ההשלמה השתפרה במהלך החודש: מ-${a}% בשבוע הראשון ל-${z}% בשבוע האחרון 💪`:z<a?`ההשלמה ירדה במהלך החודש: מ-${a}% ל-${z}% – אולי לתכנן פחות ולהספיק יותר`:`השלמה יציבה של ${z}% לאורך החודש`)}
 const over=targets.filter(t=>t.pct>=100);if(targets.length)ins.push(over.length?`חרגת מהיעד ב: ${over.map(t=>bname(t.k)).join(', ')}`:'עמדת בכל היעדים החודש 🎯');
 if(cur.income)ins.push(cur.left>=0?`נשאר לך ${nis(cur.left)} (${pct(cur.left,cur.income)}% מההכנסות)`:`הוצאת ${nis(-cur.left)} יותר ממה שנכנס`);
 return{id:m,month:m,weeks,tasks:{done,total,doneMin},budget:{...cur,prevExpenses:prev.expenses,prevMonth:prevYm(m)},cats,targets,best:best&&{id:best.id,from:best.from,to:best.to,p:best.p},worst:worst&&{id:worst.id,from:worst.from,to:worst.to,p:worst.p},insights:ins.slice(0,5),made:Date.now(),openedAt:null}}
const getMonth=()=>{const x=J('monthSummary',null);if(!x)return null;const now=Date.now();if(x.openedAt?now-x.openedAt>=M_TTL:now-x.made>=M_TTL){localStorage.removeItem('monthSummary');localStorage.removeItem('monthSummaryNew');return null}return x};
const monthLeft=x=>{const h=Math.max(1,Math.ceil(((x.openedAt||x.made)+M_TTL-Date.now())/H));return h+' שע׳'};
function markMonthOpened(){const x=getMonth();if(x&&!x.openedAt){x.openedAt=Date.now();W('monthSummary',x)}}

// ---------- HTML ----------
function wsHTML(s,p){let h=`<div class="cards"><div class="card"><b>${s.tasks.done}/${s.tasks.total}</b>לו״ז בוצעו</div><div class="card"><b>${s.todos.done}/${s.todos.total}</b>משימות בוצעו</div><div class="card"><b>${dur(s.tasks.doneMin)}</b>זמן שבוצע</div><div class="card"><b>${ils(s.spent.week)}</b>הוצאות השבוע</div></div>`;
 const c=comp(s),cp=c.total?pct(c.done,c.total):0;
 if(p){const q=comp(p),pp=q.total?pct(q.done,q.total):0;h+=`<div class="ws-cmp"><b>לעומת השבוע הקודם (${wLabel(p)})</b><p>✅ השלמה: ${cp}% ${chg(cp,pp,true,'pt')} <span class="b-muted">(קודם ${pp}%)</span></p><p>⏱️ זמן שבוצע: ${dur(s.tasks.doneMin)} ${chg(s.tasks.doneMin,p.tasks.doneMin,true)} <span class="b-muted">(קודם ${dur(p.tasks.doneMin)})</span></p><p>💰 הוצאות: ${ils(s.spent.week)} ${chg(s.spent.week,p.spent.week,false)} <span class="b-muted">(קודם ${ils(p.spent.week)})</span></p></div>`}
 else if(c.total)h+=`<p class="ws-line">✅ השלמה: ${cp}%</p>`;
 if(s.bestDay>=0)h+=`<p class="ws-line">🏆 היום הכי פרודוקטיבי: יום ${DN[s.bestDay]}</p>`;
 const ck=Object.keys(s.cats||{});if(ck.length){h+='<h3>⏱️ לפי קטגוריה</h3>';const mx=Math.max(1,...ck.map(k=>s.cats[k].min));ck.forEach(k=>{const x=s.cats[k],cc=CATS[k]||CATS.other,pm=p&&p.cats&&p.cats[k]?p.cats[k].min:0;
  h+=`<div style="margin:6px 0"><span class="dot" style="background:${cc[1]}"></span>${cc[0]}: ${x.nd}/${x.n} בוצעו${x.min?` · ${dur(x.min)} בלו״ז`:''}${p&&(x.min||pm)?' '+chg(x.min,pm,true):''}<div class="bar"><i style="width:${x.min?x.min/mx*100:x.nd/x.n*100}%;background:${cc[1]}"></i></div></div>`})}
 const bc=Object.entries(s.spent.byCat||{}).sort((a,b)=>b[1]-a[1]);h+='<h3>💰 הוצאות</h3>'+(bc.length?'<ul>'+bc.slice(0,4).map(([k,v])=>`<li>${esc(bname(k))}: ${ils(v)}${p?' '+chg(v,(p.spent.byCat||{})[k]||0,false):''}</li>`).join('')+'</ul>':'<p class="ws-line">לא נרשמו הוצאות השבוע</p>')+`<p class="ws-line">סה״כ הוצאות מתחילת החודש: ${ils(s.spent.month)}</p>`;return h}
function msHTML(m){const b=m.budget,t=m.tasks;let h=`<div class="cards"><div class="card"><b>${t.done}/${t.total}</b>משימות בוצעו (${pct(t.done,t.total)}%)</div><div class="card"><b>${dur(t.doneMin)}</b>זמן שבוצע</div><div class="card"><b>${ils(b.expenses)}</b>הוצאות ${chg(b.expenses,b.prevExpenses,false)}</div><div class="card"><b class="${b.left<0?'b-bad':''}">${ils(b.left)}</b>נשאר לך</div></div>`;
 h+=`<p class="ws-line">💵 הכנסות: ${ils(b.income)}${b.savings?` · 🏦 חיסכון: ${ils(b.savings)}`:''}</p>`;
 if(m.weeks.length){h+='<h3>🗓️ שבוע אחרי שבוע</h3><ul class="ms-weeks">'+m.weeks.map((w,i)=>`<li>${m.best&&m.best.id===w.id?'🏆 ':m.worst&&m.worst.id===w.id?'🐢 ':''}שבוע ${i+1} (${wLabel(w)})${w.partial?' – עד עכשיו':''}: ${w.total?pct(w.done,w.total)+'% הושלמו':'אין משימות'} · ${ils(w.spent)}</li>`).join('')+'</ul>'}
 if(m.cats.length)h+=`<h3>💰 הוצאות לפי קטגוריה <span class="b-muted">(לעומת ${monthName(b.prevMonth)})</span></h3><ul>`+m.cats.filter(c=>c.v||c.pv).map(c=>`<li>${esc(bname(c.k))}: ${ils(c.v)} ${chg(c.v,c.pv,false)}</li>`).join('')+'</ul>';
 if(m.targets.length)h+='<h3>🎯 יעדים</h3><ul>'+m.targets.map(x=>`<li>${esc(bname(x.k))}: ${ils(x.spent)} מתוך ${ils(x.target)} – <span class="${x.pct>=100?'b-bad':x.pct>=80?'b-warn':'b-good'}">${x.pct}% ${x.pct>100?'⚠️ חריגה':x.pct===100?'⚠️ בדיוק ביעד':'✅'}</span></li>`).join('')+'</ul>';
 if(m.insights.length)h+='<h3>💡 תובנות</h3><ul>'+m.insights.map(x=>`<li>${esc(x)}</li>`).join('')+'</ul>';return h}
let sel=-1;
function html(){let h='';const m=getMonth();if(m)h+=`<h3 id="ms-sec">📅 סיכום חודשי – ${monthName(m.month)}</h3><div class="ws-old">${m.openedAt?`<p class="ws-line">ייעלם בעוד ${monthLeft(m)}</p>`:''}${msHTML(m)}</div>`;
 const a=getWeeks();if(a.length){if(sel<0||sel>=a.length)sel=a.length-1;const s=a[sel];
  h+=`<h3 id="ws-sec">📊 סיכומים שבועיים</h3><div class="ws-nav"><button type="button" data-wsnav="-1" ${sel?'':'disabled'} aria-label="שבוע קודם">→</button><div class="ws-chips">${a.map((x,i)=>`<button type="button" data-wsi="${i}" class="${i===sel?'on':''}">שבוע ${i+1}</button>`).join('')}</div><button type="button" data-wsnav="1" ${sel<a.length-1?'':'disabled'} aria-label="שבוע הבא">←</button></div>
  <div class="ws-old"><p class="ws-line"><b>${wLabel(s)}</b></p>${wsHTML(s,sel?a[sel-1]:null)}</div><p class="ws-line">כל הסיכומים השבועיים נמחקים ב-1 לחודש ב-00:00.</p>`}return h}
document.addEventListener('click',e=>{const b=e.target.closest('[data-wsnav],[data-wsi]');if(!b||!b.closest('#sum'))return;const n=getWeeks().length;sel=b.dataset.wsi!=null?+b.dataset.wsi:Math.max(0,Math.min(n-1,sel+ +b.dataset.wsnav));renderSum();const x=Q('#ws-sec');if(x)x.scrollIntoView({block:'start'})});

// ---------- התראה + כרטיס חד-פעמי ----------
async function notifyOnce(kind,id,title,body){const k=kind+'SummaryNotified';if(localStorage.getItem(k)===id)return;localStorage.setItem(k,id);
 if(!(window.Notification&&Notification.permission==='granted'))return;const url='./?summary='+kind;
 try{const r=await navigator.serviceWorker?.getRegistration();if(r)await r.showNotification(title,{body,icon:'icon.svg',tag:kind+'-summary',data:{url}});else{const n=new Notification(title,{body,tag:kind+'-summary'});n.onclick=()=>{window.focus();openTab(kind);n.close()}}}catch(e){}}
function card(kind,s){let d=Q('#wsum');if(!d){d=document.createElement('dialog');d.id='wsum';document.body.append(d)}const week=kind==='week';
 if(week){const a=getWeeks(),i=a.findIndex(x=>x.id===s.id);d.innerHTML=`<button type="button" class="ws-x" aria-label="סגור">✕</button><h2>📊 סיכום השבוע שלך</h2><p class="ws-line">${wLabel(s)} · נשמר בלשונית "סיכום" עד סוף החודש.</p>${wsHTML(s,i>0?a[i-1]:null)}<button type="button" class="p ws-ok">תודה 👍</button>`}
 else{markMonthOpened();d.innerHTML=`<button type="button" class="ws-x" aria-label="סגור">✕</button><h2>📅 הסיכום החודשי שלך</h2><p class="ws-line">${monthName(s.month)} · זמין גם בלשונית "סיכום" – ייעלם בעוד 72 שעות.</p>${msHTML(s)}<button type="button" class="p ws-ok">תודה 👍</button>`}
 localStorage.setItem(kind+'SummaryCard',s.id);d.querySelector('.ws-x').onclick=()=>d.close();d.querySelector('.ws-ok').onclick=()=>d.close();d.onclick=e=>{if(e.target===d)d.close()};
 d.onclose=()=>{localStorage.removeItem(kind+'SummaryNew');renderSum();setTimeout(deliver,300)};if(!d.open)d.showModal()}
async function deliver(){const m=getMonth(),mid=localStorage.monthSummaryNew,wid=localStorage.weekSummaryNew,w=wid&&getWeeks().find(x=>x.id===wid);
 if(mid&&!m)localStorage.removeItem('monthSummaryNew');if(wid&&!w)localStorage.removeItem('weekSummaryNew');
 if(m&&mid===m.id)await notifyOnce('month',m.id,'📅 הסיכום החודשי שלך מוכן',`השלמת ${m.tasks.done} מתוך ${m.tasks.total} משימות · הוצאות: ${nis(m.budget.expenses)} · נשאר: ${nis(m.budget.left)} · לחץ לצפייה`);
 if(w){const c=comp(w);await notifyOnce('week',w.id,'📊 סיכום השבוע שלך מוכן',`השלמת ${c.done} מתוך ${c.total} משימות`+(w.spent.week?` · הוצאות השבוע: ${nis(w.spent.week)}`:'')+' · לחץ לצפייה')}
 if(document.hidden)return;const d=Q('#wsum');if(d&&d.open)return;
 if(m&&mid===m.id){if(localStorage.monthSummaryCard===m.id)localStorage.removeItem('monthSummaryNew');else return card('month',m)}
 if(w){if(localStorage.weekSummaryCard===w.id)localStorage.removeItem('weekSummaryNew');else card('week',w)}}
function openTab(kind){for(const k of ['week','month']){const id=localStorage.getItem(k+'SummaryNew');if(id&&(kind===k||kind==='1'&&k==='week')){localStorage.setItem(k+'SummaryCard',id);localStorage.removeItem(k+'SummaryNew')}}
 if(kind==='month')markMonthOpened();const d=Q('#wsum');if(d&&d.open){d.onclose=null;d.close()}tab(2);if(getMonth())markMonthOpened();sel=-1;renderSum();const x=Q(kind==='month'?'#ms-sec':'#ws-sec');if(x)x.scrollIntoView({block:'start'})}
function onTab(){if(getMonth())markMonthOpened();renderSum()}

// ---------- תזמון ----------
function check(){const now=new Date(),cm=ymOf(now);
 // מעבר ממה שנשמר בגרסה הקודמת (סיכום יחיד)
 const old=J('weekSummary',null);if(old){localStorage.removeItem('weekSummary');if(old.to&&old.to.slice(0,7)===cm||old.from&&old.from.slice(0,7)===cm){delete old.openedAt;delete old.expAt;upsertWeek(old)}}
 const sm=localStorage.summaryMonth;
 if(!sm)localStorage.summaryMonth=cm;
 else if(sm!==cm){ // 1 לחודש 00:00: סיכום חודשי שלא נוצר (היומן היה סגור ב-20:00) נוצר עכשיו מהנתונים לפני המחיקה
  if(localStorage.monthSummaryMade!==sm){localStorage.monthSummaryMade=sm;try{W('monthSummary',computeMonth(sm));localStorage.monthSummaryNew=sm}catch(e){}}
  setWeeks([]);localStorage.removeItem('weekSummaryNew');localStorage.summaryMonth=cm;sel=-1}
 const k=typeof wstart==='function'?dk(wstart()):null;
 if(k&&now.getDay()===6&&now.getHours()>=22){if(localStorage.weekSummaryMade!==k){localStorage.weekSummaryMade=k;const s=computeWeek(k);if(s){upsertWeek(s);localStorage.weekSummaryNew=k}}else if(getWeeks().some(x=>x.id===k)){const s=computeWeek(k);if(s)upsertWeek(s,true)}}
 const tm=new Date(now);tm.setDate(tm.getDate()+1);
 if(tm.getDate()===1&&now.getHours()>=20){if(localStorage.monthSummaryMade!==cm){localStorage.monthSummaryMade=cm;W('monthSummary',computeMonth(cm));localStorage.monthSummaryNew=cm}
  else{const o=J('monthSummary',null);if(o&&o.id===cm&&!o.openedAt){const s=computeMonth(cm);s.made=o.made;W('monthSummary',s)}}}
 getMonth();deliver();try{if(Q('#sum')&&Q('#sum').style.display==='block')renderSum()}catch(e){}}
window.SummaryUI={html,onTab,open:openTab,check,deliver,weeks:getWeeks,month:getMonth};
if('serviceWorker'in navigator)navigator.serviceWorker.addEventListener('message',e=>{if(e.data&&e.data.type==='summary')openTab(e.data.which||'week')});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(check,400)});
setInterval(check,60000);
window.addEventListener('load',()=>setTimeout(()=>{const m=location.search.match(/[?&]summary=(\w+)/);check();if(m){history.replaceState(null,'',location.pathname);openTab(m[1]==='month'?'month':'week')}},300));
})();
