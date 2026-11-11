(()=>{'use strict';
// ===== עוזר אישי ביומן: צאט + מיקרופון + תזכורות =====
const Q=s=>document.querySelector(s);
const LS={chat:'assistantChat',rem:'assistantRem',week:'assistantWeek',remOn:'assistantRemind',owner:'assistantOwner',device:'assistantDevice',quota:'assistantQuota',brief:'assistantBrief',briefDay:'assistantBriefDay'};
// כתובת השרת של העוזר (מגביל שימוש) – מקום אחד לשנות
const PROXY=window.ASSISTANT_PROXY||'https://netanel-planner-ai.onrender.com/api/gemini';
const QUOTA_URL=PROXY.replace(/\/gemini$/,'/quota');
try{localStorage.removeItem('assistantKey');localStorage.removeItem('assistantModel')}catch(e){} // מפתח אישי מגרסה קודמת – כבר לא בשימוש
const B=()=>window.BudgetAPI;
const pad=n=>String(n).padStart(2,'0');
const ymNow=()=>{const d=new Date();return`${d.getFullYear()}-${pad(d.getMonth()+1)}`};
const isoNow=()=>{const d=new Date();return`${ymNow()}-${pad(d.getDate())}`};
const isoOf=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>(crypto.randomUUID?crypto.randomUUID():Date.now()+''+Math.random());
const J=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}};
const W=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const DN=['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
const PCATS={work:'עבודה',personal:'אישי',shop:'קניות',other:'אחר'};
const INCOME=['משכורת','עצמאי','קצבה','אחר'],HOLD=['קרן השתלמות','מניות','פיקדון','קריפטו','חיסכון','אחר'];

// ---------- שבוע ואיפוס ----------
const weekStart=()=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-d.getDay());return d};
const dkey=d=>`${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; // אותו מפתח כמו היומן
const plannerDay=()=>{const d=new Date();if(d.getHours()*60+d.getMinutes()<150)d.setDate(d.getDate()-1);d.setHours(0,0,0,0);const w=weekStart();return d<w?w:d};
const weekDays=()=>{const w=weekStart();return Array.from({length:7},(_,i)=>{const d=new Date(w);d.setDate(d.getDate()+i);return d})};
function weeklyReset(){const k=dkey(weekStart());if(localStorage.getItem(LS.week)!==k){localStorage.setItem(LS.week,k);localStorage.removeItem(LS.chat);localStorage.removeItem(LS.rem);return true}return false}
// לא נוגעים ב-budget, בקוד האישי, במזהה המכשיר או בהעדפות

// ---------- נתוני היומן ----------
const lp=()=>J('planner',{}),sp=o=>W('planner',o),ltd=()=>J('todos',{}),std=o=>W('todos',o);
const fmtM=m=>pad(Math.floor(m/60)%24)+':'+pad(m%60);
function refreshPlanner(){try{if(typeof render==='function')render()}catch(e){}}
function refreshBudget(){try{B()&&B().render()}catch(e){}}
function dayFrom(s){ // YYYY-MM-DD / היום / מחר / שם יום -> Date בשבוע הנוכחי
  if(!s)return null;s=String(s).trim();const days=weekDays();let d=null;
  const m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m)d=new Date(+m[1],+m[2]-1,+m[3]);else if(/היום|today/.test(s))d=plannerDay();else if(/מחר|tomorrow/.test(s)){d=plannerDay();d.setDate(d.getDate()+1)}
  else{const i=DN.findIndex(n=>s.includes(n));if(i>=0)d=days[i]}
  if(!d)return null;d.setHours(0,0,0,0);return days.some(x=>dkey(x)===dkey(d))?d:'out'}
function parseTime(t,sat){if(t==null)return{err:'חסרה שעה – שאל את המשתמש באיזו שעה'};const m=String(t).match(/^(\d{1,2})(?::(\d{2}))?$/);if(!m)return{err:'פורמט שעה לא תקין, צריך HH:MM'};let h=+m[1],mi=+(m[2]||0);if(h>23||mi>59)return{err:'שעה לא תקינה'};let v=h*60+mi;if(h<8)v+=24*60;
  if(v<8*60||v>26*60)return{err:'היומן פתוח רק בין 08:00 ל-02:00 – שאל את המשתמש לשעה אחרת'};if(sat&&v>=24*60)return{err:'במוצאי שבת היומן מתאפס ב-00:00, אז בשבת אפשר רק עד 23:45'};
  const r=Math.round(v/15)*15;return{v:Math.min(r,sat?23*60+45:26*60),rounded:r!==v}}
const durOk=x=>{x=Math.round((+x||60)/15)*15;return Math.max(15,Math.min(480,x))};

// ---------- נתוני תקציב (שומרים על כל שדה קיים) ----------
const rb=()=>{const x=J('budget',{})||{};x.entries=x.entries||[];x.recurring=x.recurring||[];x.holdings=x.holdings||[];x.limits=x.limits||{};x.alerts=x.alerts||{};return x};
const wb=d=>localStorage.setItem('budget',JSON.stringify(d));
const prevYm=m=>{const [y,n]=m.split('-').map(Number);const d=new Date(y,n-2,1);return`${d.getFullYear()}-${pad(d.getMonth()+1)}`};
const stripEmoji=s=>String(s).replace(/[\p{Extended_Pictographic}\u200d\ufe0f\u{1F1E6}-\u{1F1FF}]/gu,'').trim();
const hasEmoji=s=>/^\s*[\p{Extended_Pictographic}]/u.test(s);
function normDesc(desc,cat){desc=String(desc||'').trim();if(!desc)return desc;const S=B()?.SUGG||{},C=B()?.categories||{};const plain=stripEmoji(desc);
  const lists=[S[cat]||[],...Object.values(S)];for(const l of lists){const hit=l.find(x=>stripEmoji(x)===plain);if(hit)return hit}
  if(hasEmoji(desc))return desc;const ce=(C[cat]?.[0]||'').split(' ')[0];return ce?ce+' '+desc:desc}
function monthRows(d,m){const a=d.entries.filter(e=>String(e.date).slice(0,7)===m);for(const r of d.recurring)if(r.start<=m&&(!r.end||r.end>=m))a.push({...r,fixed:true});return a}
function budgetSummary(){const d=rb(),m=ymNow(),a=monthRows(d,m),C=B()?.categories||{};const sum=f=>Math.round(a.filter(f).reduce((n,e)=>n+ +e.amount,0)*100)/100;
  const income=sum(e=>e.kind==='income'),expenses=sum(e=>e.kind==='expense'),savings=sum(e=>e.kind==='saving');
  const cats={};for(const k in C)cats[k]={name:C[k][0],spent:sum(e=>e.kind==='expense'&&e.category===k),target:+(d.limits[m]?.[k]||0)||null};
  return{month:m,income,expenses,savings,balance:Math.round((income-expenses-savings)*100)/100,categories:cats,
    entries:d.entries.filter(e=>String(e.date).slice(0,7)===m).map(e=>({id:e.id,kind:e.kind,description:e.description,amount:e.amount,category:e.category,type:e.type,date:e.date})),
    fixed:d.recurring.filter(r=>!r.end||r.end>=m).map(r=>({id:r.id,kind:r.kind,description:r.description,amount:r.amount,category:r.category,day:r.day,start:r.start})),
    investments:d.holdings.map(h=>({id:h.id,name:h.name,type:h.type,invested:h.invested,value:h.value}))}}
function plannerSnapshot(){const all=lp(),td=ltd();return weekDays().map(d=>{const k=dkey(d);return{date:isoOf(d),day:DN[d.getDay()],today:k===dkey(plannerDay()),
  tasks:(all[k]||[]).map(t=>({id:t.id,title:t.title,start:fmtM(t.start),end:fmtM(t.start+ +t.dur),duration_min:+t.dur,category:t.cat,note:t.note||'',done:!!t.done,...(t.rid?{repeats_this_week:t.rid}:{})})),
  todos:(td[k]||[]).map((t,i)=>({index:i,text:t.text,category:t.cat||'',done:!!t.done}))}})}

// ---------- משימה שחוזרת השבוע ----------
function repeatOn(all,o,dates,skipKey){const added=[],skipped=[];let n=0;for(const ds of dates){const g=getDay(ds);if(g.err){skipped.push({date:ds,reason:g.err});continue}const k=dkey(g.d);if(k===skipKey)continue;const sat=g.d.getDay()===6,day=DN[g.d.getDay()];
  if(sat&&o.start>=24*60){skipped.push({day,reason:'בשבת היומן נסגר ב-23:45'});continue}const du=sat&&o.start+o.dur>24*60?Math.max(15,24*60-o.start):o.dur;
  const arr=all[k]||[];if(arr.some(x=>x.start<o.start+du&&o.start<x.start+ +x.dur)){skipped.push({day,reason:'המשבצת תפוסה'});continue}
  arr.push({...o,id:o.id+(++n),dur:du});arr.sort((x,y)=>x.start-y.start);all[k]=arr;added.push(day)}return{added,skipped}}
// ---------- תובנות תקציב (מקומי) ----------
function catSpend(d,m,upto){const C=B()?.categories||{},o={};for(const k in C)o[k]=0;let tot=0;
 for(const e of monthRows(d,m)){if(e.kind!=='expense')continue;const day=e.fixed?+e.day||1:+String(e.date).slice(8,10);if(upto&&day>upto)continue;const k=o[e.category]!=null?e.category:'other';o[k]=(o[k]||0)+ +e.amount;tot+= +e.amount}
 for(const k in o)o[k]=Math.round(o[k]*100)/100;return{cats:o,total:Math.round(tot*100)/100}}
function budgetInsights(){const d=rb(),m=ymNow(),now=new Date(),day=now.getDate(),dim=new Date(now.getFullYear(),now.getMonth()+1,0).getDate(),C=B()?.categories||{},r=n=>Math.round(n);
 const p1=prevYm(m),p2=prevYm(p1),p3=prevYm(p2),cur=catSpend(d,m),same=catSpend(d,p1,day),full=[p1,p2,p3].map(x=>catSpend(d,x)),withData=full.filter(x=>x.total>0);
 const cats=Object.keys(C).map(k=>{const c=cur.cats[k]||0,s2=same.cats[k]||0,avg=withData.length?r(withData.reduce((a,x)=>a+(x.cats[k]||0),0)/withData.length):null,target=+(d.limits[m]?.[k]||0)||null;
  return{category:k,name:C[k][0],this_month:c,prev_month_same_point:s2,prev_month_full:full[0].cats[k]||0,avg_prev_months:avg,projected_month_end:r(c/day*dim),change_vs_prev_same_point_pct:s2?r((c/s2-1)*100):null,target,target_used_pct:target?r(c/target*100):null,unusually_high:s2>0&&c>=1.5*s2&&c-s2>=50}}).filter(x=>x.this_month||x.prev_month_full||x.target);
 const hi=[];cats.filter(x=>x.unusually_high).sort((a,b)=>(b.this_month-b.prev_month_same_point)-(a.this_month-a.prev_month_same_point)).forEach(x=>hi.push(`${x.name}: ${r(x.this_month)} ₪ עד עכשיו – פי ${(x.this_month/x.prev_month_same_point).toFixed(1)} מאותה תקופה בחודש שעבר (${r(x.prev_month_same_point)} ₪)`));
 cats.filter(x=>x.target_used_pct>=80).forEach(x=>hi.push(`${x.name}: ניצלת ${x.target_used_pct}% מהיעד (${r(x.this_month)} מתוך ${r(x.target)} ₪)`));
 const bs=budgetSummary();return{month:m,day_of_month:day,days_in_month:dim,months_compared:[p1,p2,p3],totals:{expenses_this_month:cur.total,prev_month_same_point:same.total,prev_month_full:full[0].total,income:bs.income,savings:bs.savings,left_this_month:bs.balance},categories:cats,highlights:hi}}
const nis=n=>`${Math.round(n).toLocaleString('he-IL')} ₪`;

// ---------- כלים ----------
const S_=(type,description,extra={})=>({type,description,...extra});
const TOOLS=[
 {name:'get_state',description:'קריאת מצב עדכני: משימות לו"ז ומשימות לכל ימי השבוע, וסיכום התקציב של החודש הנוכחי.',},
 {name:'add_task',description:'הוספת משימה ללו"ז בשעה מסוימת (משבצות של 15 דקות, 08:00–02:00). רק בשבוע הנוכחי.',parameters:{type:'object',properties:{date:S_('string','YYYY-MM-DD של היום בשבוע הנוכחי'),start:S_('string','שעת התחלה HH:MM (00:00–02:00 = אחרי חצות של אותו יום ביומן)'),duration_min:S_('integer','משך בדקות, כפולה של 15. ברירת מחדל 60'),title:S_('string','כותרת המשימה'),category:S_('string','קטגוריית לו"ז',{enum:Object.keys(PCATS)}),note:S_('string','הערה'),repeat_days:S_('array','אופציונלי: משימה שחוזרת השבוע – תאריכים נוספים YYYY-MM-DD בשבוע הנוכחי שבהם להוסיף את אותה משימה באותה שעה (למשל "כל יום השבוע חוץ משישי"). ימים שהמשבצת בהם תפוסה מדולגים.',{items:{type:'string'}})},required:['date','start','title']}},
 {name:'edit_task',description:'עריכת משימה קיימת בלו"ז לפי id. שדות שלא נשלחו לא משתנים.',parameters:{type:'object',properties:{date:S_('string','היום שבו המשימה נמצאת כעת YYYY-MM-DD'),task_id:S_('number','id של המשימה'),new_date:S_('string','יום חדש YYYY-MM-DD'),start:S_('string','שעה חדשה HH:MM'),duration_min:S_('integer','משך חדש'),title:S_('string','כותרת חדשה'),category:S_('string','קטגוריה',{enum:Object.keys(PCATS)}),note:S_('string','הערה'),all_week:S_('boolean','true = להחיל את השינוי (כותרת/שעה/משך/קטגוריה/הערה) על כל המופעים של משימה חוזרת השבוע. בלי new_date.')},required:['date','task_id']}},
 {name:'delete_task',description:'מחיקת משימה מהלו"ז. רק אחרי שהמשתמש אישר במפורש.',parameters:{type:'object',properties:{date:S_('string','YYYY-MM-DD'),task_id:S_('number','id'),all_week:S_('boolean','true = למחוק את כל המופעים של משימה חוזרת השבוע')},required:['date','task_id']}},
 {name:'set_task_done',description:'סימון משימת לו"ז כבוצעה או כלא בוצעה.',parameters:{type:'object',properties:{date:S_('string','YYYY-MM-DD'),task_id:S_('number','id'),done:S_('boolean','true = בוצע')},required:['date','task_id','done']}},
 {name:'add_todo',description:'הוספת משימה בלי שעה לרשימת המשימות של יום.',parameters:{type:'object',properties:{date:S_('string','YYYY-MM-DD, ברירת מחדל היום'),text:S_('string','המשימה'),category:S_('string','קטגוריה',{enum:Object.keys(PCATS)})},required:['text']}},
 {name:'set_todo_done',description:'סימון משימה (בלי שעה) כבוצעה/לא בוצעה לפי האינדקס שלה ברשימה של אותו יום.',parameters:{type:'object',properties:{date:S_('string','YYYY-MM-DD'),index:S_('integer','index מהמצב'),done:S_('boolean','true = בוצע')},required:['date','index','done']}},
 {name:'delete_todo',description:'מחיקת משימה בלי שעה. רק אחרי אישור המשתמש.',parameters:{type:'object',properties:{date:S_('string','YYYY-MM-DD'),index:S_('integer','index')},required:['date','index']}},
 {name:'add_expense',description:'רישום הוצאה בחודש הנוכחי. חובה תיאור, סכום וקטגוריה – אם חסר משהו, שאל לפני שקוראים לכלי.',parameters:{type:'object',properties:{description:S_('string','תיאור, עדיף בסגנון ההצעות עם אימוג׳י, למשל "⛽ דלק"'),amount:S_('number','סכום בש"ח'),category:S_('string','קטגוריית הוצאה',{enum:['food','car','home','bills','fun','shop','health','other']})},required:['description','amount','category']}},
 {name:'add_income',description:'רישום הכנסה בחודש הנוכחי.',parameters:{type:'object',properties:{amount:S_('number','סכום בש"ח'),type:S_('string','סוג הכנסה',{enum:INCOME})},required:['amount','type']}},
 {name:'add_saving',description:'רישום הפקדה לחיסכון בחודש הנוכחי.',parameters:{type:'object',properties:{amount:S_('number','סכום'),description:S_('string','לאן הופקד')},required:['amount','description']}},
 {name:'add_fixed',description:'הוספת הוצאה או הכנסה קבועה (כל חודש מהחודש הנוכחי ואילך).',parameters:{type:'object',properties:{kind:S_('string','',{enum:['expense','income']}),description:S_('string','תיאור (בהוצאה)'),amount:S_('number','סכום חודשי'),category:S_('string','קטגוריה (בהוצאה)',{enum:['food','car','home','bills','fun','shop','health','other']}),type:S_('string','סוג (בהכנסה)',{enum:INCOME}),day:S_('integer','יום בחודש 1–31')},required:['kind','amount','day']}},
 {name:'delete_budget_item',description:'מחיקת תנועה מהחודש הנוכחי (entries) או הסרת קבועה מהחודש הנוכחי ואילך (fixed). רק אחרי אישור.',parameters:{type:'object',properties:{id:S_('string','id'),list:S_('string','',{enum:['entries','fixed']})},required:['id','list']}},
 {name:'add_investment',description:'הוספת השקעה/חיסכון לאחזקות.',parameters:{type:'object',properties:{name:S_('string','שם'),type:S_('string','סוג',{enum:HOLD}),invested:S_('number','סכום שהושקע'),value:S_('number','שווי נוכחי (אם לא ידוע – שווה לסכום שהושקע)')},required:['name','type','invested']}},
 {name:'update_investment',description:'עדכון אחזקה קיימת לפי id.',parameters:{type:'object',properties:{id:S_('string','id'),invested:S_('number','סכום שהושקע'),value:S_('number','שווי נוכחי'),name:S_('string','שם')},required:['id']}},
 {name:'set_category_target',description:'קביעת יעד (תקרת תקציב) חודשי לקטגוריית הוצאה בחודש הנוכחי. 0 מוחק את היעד.',parameters:{type:'object',properties:{category:S_('string','',{enum:['food','car','home','bills','fun','shop','health','other']}),amount:S_('number','סכום היעד')},required:['category','amount']}},
 {name:'get_budget_insights',description:'ניתוח תקציב: לכל קטגוריה – כמה הוצא החודש, לעומת אותה תקופה בחודש שעבר, החודש הקודם המלא וממוצע 3 חודשים קודמים, תחזית לסוף החודש, יעד ואחוז ניצול, וסימון חריגות. השתמש כשמבקשים "איך אני עם התקציב", "על מה אני מוציא הכי הרבה", "איפה לחסוך".'},
 {name:'plan_day',description:'תכנון יום: מקבל רשימת דברים (בלי שעות, או חלקם עם שעה מועדפת) ומשבץ אותם במשבצות פנויות ביום שנבחר – מכבד משימות קיימות, רשת של 15 דק׳, 08:00–02:00, בשבת עד 23:45, והיום – רק מעכשיו והלאה. ברירת מחדל: משבץ ושומר; dry_run=true רק מציע בלי לשמור.',parameters:{type:'object',properties:{date:S_('string','YYYY-MM-DD בשבוע הנוכחי'),items:S_('array','הדברים לשבץ, לפי סדר העדיפות',{items:{type:'object',properties:{title:S_('string','כותרת'),duration_min:S_('integer','משך משוער בדקות (כפולה של 15). אם לא נאמר – הערך בעצמך באופן סביר'),category:S_('string','קטגוריה',{enum:Object.keys(PCATS)}),start:S_('string','שעה מועדפת HH:MM אם המשתמש ביקש')},required:['title']}}),start_after:S_('string','לא לפני השעה HH:MM'),end_before:S_('string','לסיים עד HH:MM'),gap_min:S_('integer','הפסקה בדקות בין משימות (ברירת מחדל 0)'),dry_run:S_('boolean','true = רק להציע, לא לשמור')},required:['date','items']}}

];
const fail=e=>({ok:false,error:e});
const num=x=>{const n=Number(x);return Number.isFinite(n)?n:NaN};
function getDay(s){const d=dayFrom(s);if(!d)return{err:'חסר יום או שהתאריך לא תקין – שאל את המשתמש לאיזה יום'};if(d==='out')return{err:'אפשר לתכנן רק בשבוע הנוכחי (היומן מתאפס כל מוצאי שבת) – הסבר למשתמש'};return{d}}
const EXEC={
 get_state:()=>({ok:true,planner:plannerSnapshot(),budget:budgetSummary()}),
 add_task(a){const g=getDay(a.date);if(g.err)return fail(g.err);if(!String(a.title||'').trim())return fail('חסרה כותרת – שאל את המשתמש');const t=parseTime(a.start,g.d.getDay()===6);if(t.err)return fail(t.err);
  const all=lp(),k=dkey(g.d),o={id:Date.now(),title:String(a.title).trim(),start:t.v,dur:durOk(a.duration_min),note:a.note||'',cat:PCATS[a.category]?a.category:'other',done:false,notified:false};
  if(g.d.getDay()===6&&o.start+o.dur>24*60)o.dur=Math.max(15,24*60-o.start);
  let rp=null;if(Array.isArray(a.repeat_days)&&a.repeat_days.length){o.rid='r'+o.id;rp=repeatOn(all,o,a.repeat_days,k)}
  all[k]=(all[k]||[]).concat(o).sort((x,y)=>x.start-y.start);sp(all);refreshPlanner();return{ok:true,task:{id:o.id,date:isoOf(g.d),start:fmtM(o.start),duration_min:o.dur,title:o.title},rounded_to_15:!!t.rounded,...(rp?{repeated_on:rp.added,skipped:rp.skipped}:{})}},
 edit_task(a){const g=getDay(a.date);if(g.err)return fail(g.err);const all=lp(),k=dkey(g.d),arr=all[k]||[],t=arr.find(x=>String(x.id)===String(a.task_id));if(!t)return fail('לא נמצאה משימה עם id כזה ביום הזה');
  let nd=g.d;if(a.new_date){const g2=getDay(a.new_date);if(g2.err)return fail(g2.err);nd=g2.d}
  if(a.start!=null||nd!==g.d){const tt=parseTime(a.start!=null?a.start:fmtM(t.start),nd.getDay()===6);if(tt.err)return fail(tt.err);if(tt.v!==t.start){t.start=tt.v;t.notified=false}}
  if(a.duration_min!=null)t.dur=durOk(a.duration_min);if(a.title)t.title=String(a.title).trim();if(PCATS[a.category])t.cat=a.category;if(a.note!=null)t.note=a.note;
  all[k]=arr.filter(x=>x!==t);const nk=dkey(nd);all[nk]=(all[nk]||[]).concat(t).sort((x,y)=>x.start-y.start);let also=[];
  if(a.all_week&&t.rid&&!a.new_date)weekDays().forEach(d=>{const dk2=dkey(d);if(dk2===nk)return;const sat=d.getDay()===6;(all[dk2]||[]).forEach(x=>{if(x.rid!==t.rid)return;if(a.title)x.title=t.title;if(PCATS[a.category])x.cat=t.cat;if(a.note!=null)x.note=t.note;if(a.start!=null&&!(sat&&t.start>=24*60)){if(x.start!==t.start)x.notified=false;x.start=t.start}if(a.duration_min!=null)x.dur=t.dur;if(sat&&x.start+x.dur>24*60)x.dur=Math.max(15,24*60-x.start);also.push(DN[d.getDay()])});all[dk2]&&all[dk2].sort((x,y)=>x.start-y.start)});
  sp(all);refreshPlanner();return{ok:true,task:{id:t.id,date:isoOf(nd),start:fmtM(t.start),duration_min:t.dur,title:t.title},...(also.length?{also_updated:also}:{})}},
 delete_task(a){const g=getDay(a.date);if(g.err)return fail(g.err);const all=lp(),k=dkey(g.d),arr=all[k]||[];const t=arr.find(x=>String(x.id)===String(a.task_id));if(!t)return fail('לא נמצאה משימה');all[k]=arr.filter(x=>x!==t);let n=1;if(a.all_week&&t.rid)weekDays().forEach(d=>{const dk2=dkey(d),b=all[dk2]||[],c=b.filter(x=>x.rid!==t.rid);n+=b.length-c.length;if(all[dk2])all[dk2]=c});sp(all);refreshPlanner();return{ok:true,deleted:t.title,count:n}},
 set_task_done(a){const g=getDay(a.date);if(g.err)return fail(g.err);const all=lp(),t=(all[dkey(g.d)]||[]).find(x=>String(x.id)===String(a.task_id));if(!t)return fail('לא נמצאה משימה');t.done=!!a.done;sp(all);refreshPlanner();resolveRem('task:'+dkey(g.d)+':'+t.id);return{ok:true,title:t.title,done:t.done}},
 add_todo(a){const g=getDay(a.date||isoOf(plannerDay()));if(g.err)return fail(g.err);const text=String(a.text||'').trim();if(!text)return fail('חסר תוכן למשימה');const o=ltd(),k=dkey(g.d);(o[k]=o[k]||[]).push({text,done:false,cat:PCATS[a.category]?a.category:undefined});std(o);refreshPlanner();return{ok:true,date:isoOf(g.d),index:o[k].length-1,text}},
 set_todo_done(a){const g=getDay(a.date||isoOf(plannerDay()));if(g.err)return fail(g.err);const o=ltd(),t=(o[dkey(g.d)]||[])[a.index];if(!t)return fail('לא נמצאה משימה באינדקס הזה');t.done=!!a.done;std(o);refreshPlanner();return{ok:true,text:t.text,done:t.done}},
 delete_todo(a){const g=getDay(a.date);if(g.err)return fail(g.err);const o=ltd(),arr=o[dkey(g.d)]||[];if(!arr[a.index])return fail('לא נמצאה משימה');const [x]=arr.splice(a.index,1);std(o);refreshPlanner();return{ok:true,deleted:x.text}},
 add_expense(a){const C=B()?.categories||{};const amount=num(a.amount);if(!String(a.description||'').trim())return fail('חובה תיאור להוצאה – שאל את המשתמש על מה ההוצאה');if(!(amount>0))return fail('חסר סכום או שהסכום לא תקין – שאל את המשתמש');if(!C[a.category])return fail('חסרה קטגוריה – שאל את המשתמש לאיזו קטגוריה');
  const d=rb(),e={kind:'expense',description:normDesc(a.description,a.category).slice(0,160),amount:Math.round(amount*100)/100,category:a.category,type:'',date:isoNow(),id:uid()};d.entries.push(e);wb(d);refreshBudget();return{ok:true,entry:e,month:ymNow()}},
 add_income(a){const amount=num(a.amount);if(!(amount>0))return fail('חסר סכום – שאל את המשתמש');if(!INCOME.includes(a.type))return fail('חסר סוג הכנסה: משכורת / עצמאי / קצבה / אחר – שאל');const d=rb(),e={kind:'income',description:a.type,type:a.type,amount:Math.round(amount*100)/100,category:'other',date:isoNow(),id:uid()};d.entries.push(e);wb(d);refreshBudget();return{ok:true,entry:e}},
 add_saving(a){const amount=num(a.amount);if(!(amount>0))return fail('חסר סכום');if(!String(a.description||'').trim())return fail('חסר תיאור – שאל לאן הופקד');const d=rb(),e={kind:'saving',description:String(a.description).trim(),amount:Math.round(amount*100)/100,category:'other',type:'',date:isoNow(),id:uid()};d.entries.push(e);wb(d);refreshBudget();return{ok:true,entry:e}},
 add_fixed(a){const C=B()?.categories||{},amount=num(a.amount),day=Math.round(num(a.day));if(!['expense','income'].includes(a.kind))return fail('לא ברור אם זו הוצאה או הכנסה');if(!(amount>0))return fail('חסר סכום');if(!(day>=1&&day<=31))return fail('חסר יום בחודש (1–31) – שאל');
  let o;if(a.kind==='expense'){if(!String(a.description||'').trim())return fail('חסר תיאור');if(!C[a.category])return fail('חסרה קטגוריה – שאל');o={kind:'expense',description:normDesc(a.description,a.category),category:a.category,type:''}}else{if(!INCOME.includes(a.type))return fail('חסר סוג הכנסה');o={kind:'income',description:a.type,type:a.type,category:'other'}}
  Object.assign(o,{amount:Math.round(amount*100)/100,start:ymNow(),day,id:uid()});const d=rb();d.recurring.push(o);wb(d);refreshBudget();return{ok:true,fixed:o}},
 delete_budget_item(a){const d=rb(),m=ymNow();if(a.list==='fixed'){const r=d.recurring.find(x=>x.id===a.id);if(!r)return fail('לא נמצאה קבועה');if(r.start<m)r.end=prevYm(m);else d.recurring=d.recurring.filter(x=>x!==r);wb(d);refreshBudget();return{ok:true,removed:r.description,note:'הוסרה מהחודש הנוכחי ואילך; חודשים קודמים נשמרו'}}
  const e=d.entries.find(x=>x.id===a.id);if(!e)return fail('לא נמצאה תנועה');if(String(e.date).slice(0,7)!==m)return fail('חודשים קודמים הם לקריאה בלבד – אי אפשר לשנות');d.entries=d.entries.filter(x=>x!==e);wb(d);refreshBudget();return{ok:true,removed:e.description}},
 add_investment(a){const inv=num(a.invested),val=a.value==null?inv:num(a.value);if(!String(a.name||'').trim())return fail('חסר שם');if(!(inv>=0)||!(val>=0))return fail('חסר סכום');const o={name:String(a.name).trim(),type:HOLD.includes(a.type)?a.type:'אחר',invested:inv,value:val,id:uid()};const d=rb();d.holdings.push(o);wb(d);refreshBudget();return{ok:true,investment:o}},
 update_investment(a){const d=rb(),h=d.holdings.find(x=>x.id===a.id);if(!h)return fail('לא נמצאה אחזקה');if(a.invested!=null){if(!(num(a.invested)>=0))return fail('סכום לא תקין');h.invested=num(a.invested)}if(a.value!=null){if(!(num(a.value)>=0))return fail('שווי לא תקין');h.value=num(a.value)}if(a.name)h.name=String(a.name).trim();wb(d);refreshBudget();return{ok:true,investment:h}},
 get_budget_insights:()=>({ok:true,...budgetInsights()}),
 plan_day(a){const g=getDay(a.date);if(g.err)return fail(g.err);const items=(Array.isArray(a.items)?a.items:[]).filter(x=>x&&String(x.title||'').trim());if(!items.length)return fail('חסרה רשימה של דברים לשבץ – שאל את המשתמש');
  const sat=g.d.getDay()===6,k=dkey(g.d),all=lp(),arr=all[k]||[],busy=arr.map(t=>[t.start,t.start+ +t.dur]),gap=Math.max(0,Math.round((+a.gap_min||0)/15)*15);
  let from=8*60,to=sat?24*60:26*60;if(a.start_after){const t=parseTime(a.start_after,sat);if(t.err)return fail(t.err);from=Math.max(from,t.v)}
  if(a.end_before){const m=String(a.end_before).match(/^(\d{1,2})(?::(\d{2}))?$/);if(m){let v=+m[1]*60+ +(m[2]||0);if(+m[1]<8)v+=24*60;to=Math.min(to,Math.floor(v/15)*15)}}
  if(k===dkey(plannerDay())){const nm=(Date.now()-g.d.getTime())/60000;from=Math.max(from,Math.ceil(nm/15)*15)}
  const free=(s,e)=>s>=from&&e<=to&&busy.every(([x,y])=>e+gap<=x||s>=y+gap);const placed=[],missed=[];let id=Date.now();
  const order=items.map((x,i)=>({x,i})).sort((p,q)=>(q.x.start?1:0)-(p.x.start?1:0));
  for(const {x} of order){const dur=durOk(x.duration_min);let at=null,note='';
   if(x.start){const t=parseTime(x.start,sat);if(!t.err&&free(t.v,t.v+dur))at=t.v;else note='השעה שביקשת תפוסה או לא אפשרית – שובץ בזמן הפנוי הקרוב'}
   if(at==null)for(let s2=Math.ceil(from/15)*15;s2+dur<=to;s2+=15)if(free(s2,s2+dur)){at=s2;break}
   if(at==null){missed.push({title:x.title,reason:'אין מספיק זמן פנוי ביום הזה'});continue}
   busy.push([at,at+dur]);placed.push({id:id++,title:String(x.title).trim(),start:at,dur,note:'',cat:PCATS[x.category]?x.category:'other',done:false,notified:false,_n:note})}
  placed.sort((p,q)=>p.start-q.start);const out=placed.map(t=>({title:t.title,start:fmtM(t.start),end:fmtM(t.start+t.dur),duration_min:t.dur,...(t._n?{note:t._n}:{})}));
  if(!a.dry_run&&placed.length){all[k]=arr.concat(placed.map(({_n,...t})=>t)).sort((x,y)=>x.start-y.start);sp(all);refreshPlanner()}
  return{ok:true,date:isoOf(g.d),saved:!a.dry_run&&placed.length>0,placed:out,not_placed:missed,existing:arr.map(t=>({title:t.title,start:fmtM(t.start),end:fmtM(t.start+ +t.dur)}))}},

 set_category_target(a){const C=B()?.categories||{},amount=num(a.amount);if(!C[a.category])return fail('קטגוריה לא תקינה');if(!(amount>=0))return fail('סכום לא תקין');const d=rb(),m=ymNow();(d.limits[m]=d.limits[m]||{})[a.category]=amount;wb(d);refreshBudget();return{ok:true,month:m,category:C[a.category][0],target:amount}}
};
function runTool(name,args){try{const f=EXEC[name];return f?f(args||{}):fail('כלי לא מוכר')}catch(e){return fail('שגיאה: '+e.message)}}

// ---------- הנחיית מערכת ----------
function systemPrompt(){const now=new Date(),C=B()?.categories||{},S=B()?.SUGG||{};
 const pend=Object.entries(J(LS.rem,{})).filter(([k,v])=>!v.resolved&&v.asked).map(([k])=>k);
 return `אתה "העוזר" ביומן האישי של נתנאל – אפליקציית לו"ז, משימות ותקציב בעברית. ענה תמיד בעברית, בקצרה ובחום, בלי מונחים טכניים. אם שואלים מי אתה, איזה מודל או איזו חברה עומדת מאחוריך – ענה רק שאתה "העוזר שלי" של היומן, ואל תזכיר שום חברה, מודל או טכנולוגיה. אם שואלים על מגבלת הודעות, כמה הודעות נשארו, קוד אישי או מי מוגבל – אל תזכיר מגבלות, מספרים או קוד, ואל תנחה לגביהם.
עכשיו: ${now.toLocaleString('he-IL',{weekday:'long',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}. היום ביומן: ${isoOf(plannerDay())} (יום ${DN[plannerDay().getDay()]}).
ימי השבוע הנוכחי: ${weekDays().map(d=>DN[d.getDay()]+'='+isoOf(d)).join(', ')}.
כללים:
- השיחה הזאת נמחקת אוטומטית כל מוצאי שבת ב-00:00 יחד עם הלו"ז והמשימות – לא צריך למחוק ידנית. "🧹 נקה את השיחה" הוא רק אפשרות נוספת.
- אתה מבצע פעולות רק דרך הכלים. אחרי פעולה – אשר בקצרה מה נרשם (למשל: "רשמתי ⛽ דלק 200 ₪ ברכב ודלק").
- אם חסר פרט הכרחי (סכום, קטגוריה, תיאור להוצאה, יום או שעה למשימה בלו"ז, סוג הכנסה) – שאל שאלה קצרה ואל תנחש. אם המשתמש אמר "מחר"/"ביום שלישי" – תרגם לתאריך מהרשימה. משך משימה שלא נאמר = 60 דקות.
- קטגוריה להוצאה אפשר להסיק כשזה ברור מאוד מהתיאור (דלק→car, סופר→food, חשמל→bills). אם לא ברור – שאל.
- תיאור הוצאה: השתמש בהצעה המתאימה מהרשימה (עם האימוג׳י) אם יש, אחרת כתוב תיאור קצר עם אימוג׳י מתאים.
- לו"ז: משבצות של 15 דקות בין 08:00 ל-02:00 (00:00–02:00 שייכים לאותו יום ביומן). בשבת עד 23:45. רק בשבוע הנוכחי – היומן והשיחה מתאפסים כל מוצאי שבת ב-00:00. "משימה" בלי שעה = add_todo.
- תקציב: הכל נרשם לחודש הנוכחי (${ymNow()}) בלי תאריך. חודשים קודמים לקריאה בלבד. נתוני התקציב לא נמחקים באיפוס השבועי.
- מחיקה – רק אחרי שהמשתמש אישר במפורש.
- אם המשתמש מבקש כמה דברים בבת אחת – בצע את כולם.
- אם כלי החזיר error – הסבר/שאל לפי ההודעה.
- כשמבקשים מצב/סיכום – השתמש בנתונים למטה (או get_state) וסכם יפה.
- משימה שחוזרת השבוע ("כל יום השבוע ב-18:00 חוץ משישי", "ראשון שלישי וחמישי"): add_task על היום הראשון + repeat_days עם שאר התאריכים מהרשימה. רק בשבוע הנוכחי – זה לא עובר לשבוע הבא. אחרי זה ציין באילו ימים נוסף ועל אילו דילגת ולמה. בעריכה/מחיקה של משימה עם repeats_this_week – שאל "רק היום או כל השבוע?" ואז all_week בהתאם.
- תכנון יום: כשהמשתמש מונה כמה דברים ליום מסוים בלי שעות ("מחר יש לי: כביסה, סופר, להתקשר לאמא") – קרא ל-plan_day עם כל הדברים (הערך משך סביר לכל אחד אם לא נאמר; אם לא ברור לאיזה יום – שאל). אחרי השיבוץ אשר בקצרה מה שובץ ומתי (רשימה עם שעות), מה לא נכנס ולמה, ושאפשר להזיז. אם ביקש "תציע קודם" – dry_run=true ואז שמור אחרי אישור.
- "איך אני עם התקציב" / "על מה אני מוציא הכי הרבה" / "איפה לחסוך" – קרא ל-get_budget_insights ותן 2–4 תובנות קצרות וקונקרטיות עם מספרים (מה עלה/ירד לעומת אותה תקופה בחודש שעבר, מה קרוב ליעד, כמה נשאר), ועצה אחת מעשית.
- צילום קבלה: כשמגיעה תמונה – חלץ את הסכום הכולל לתשלום (לא מע"מ ולא סכום ביניים), את שם העסק וקטגוריה מתאימה. אם הכל ברור – רשום מיד עם add_expense (תיאור: שם העסק עם אימוג׳י מתאים, או ההצעה המתאימה מהרשימה) ואשר מה נרשם. אם הסכום לא קריא, יש כמה סכומים, או שהקטגוריה לא ברורה – שאל לאישור לפני הרישום. אם זו לא קבלה – אמור זאת בעדינות.
קטגוריות לו"ז: ${Object.entries(PCATS).map(([k,v])=>k+'='+v).join(', ')}.
קטגוריות הוצאה והצעות תיאור:
${Object.keys(C).map(k=>`${k}=${C[k][0]}: ${(S[k]||[]).join(' | ')}`).join('\n')}
סוגי הכנסה: ${INCOME.join(', ')}. סוגי השקעה: ${HOLD.join(', ')}.
מדריך היומן (הכר אותו כמו את הבית שלך) – כשמבקשים "איך עושים…", הדרך צעד-צעד בשמות המדויקים ("לחץ על … ואז …"). אם זו פעולה שאתה יכול לעשות בכלי – הצע לעשות אותה בעצמך.
• כותרת עליונה: "📒 היומן של נתנאל", לידה 🌙/☀️ למצב כהה/בהיר (נשמר תמיד). "🔔 הפעל התראות" – מאשר התראות; בלי זה אין התראות בטלפון. שורת ימים ראשון–שבת של השבוע הנוכחי (היום מסומן במסגרת צהובה) – לחיצה על יום עוברת אליו. 4 לשוניות: לו"ז | משימות | סיכום | תקציב.
• לו"ז: משבצות 15 דק׳ מ-08:00 עד 02:00 (בשבת עד 23:45); עד 02:30 בלילה עדיין נחשב היום הקודם. הוספה: לוחצים על משבצת ריקה ← "משימה חדשה": כותרת, שעת התחלה, משך (15 דק׳ עד 8 שע׳), קטגוריה (עבודה/אישי/קניות/אחר, לכל אחת צבע – מקרא למעלה), הערה ← "שמור". עריכה: לוחצים על המשימה ← משנים ← "שמור"; מחיקה: "מחק". ☐ בפינת המשימה = סימון בוצע (✅ וקו חוצה). 10 דקות לפני משימה יש צפצוף, רטט והתראה ⏰.
• משימות (בלי שעה): כותבים ב"מה צריך לעשות היום?", בוחרים קטגוריה (או "ללא") ← "הוסף" או Enter. ☐ או לחיצה על הטקסט = בוצע; ✏️ עריכה; 🗑️ מחיקה. "העבר משימות שלא הושלמו למחר ←" מעביר את הפתוחות ליום הבא (לא בשבת). כל יום עם רשימה משלו.
• משימה שחוזרת השבוע: בטופס "משימה חדשה" מסמנים "🔁 חוזר השבוע" ובוחרים ימים (א׳–ש׳; ברירת מחדל: מהיום שנבחר ועד שבת) ← "שמור". נוצרת אותה משימה באותה שעה בכל יום שנבחר בשבוע הנוכחי בלבד; יום שהמשבצת בו תפוסה מדולג (מופיעה הודעה). בעריכה או מחיקה של משימה כזו נשאל "רק היום" / "כל השבוע". זה לא עובר לשבוע הבא – מתאפס עם כל היומן.
• סיכום: ליום הנבחר – כמה בוצעו בלו"ז ובמשימות, זמן שבוצע/מתוכנן, התקדמות לפי קטגוריה, "✅ מה הושלם" ו"⏳ לא הושלם". כשיש סיכום שבועי פתוח מופיע שם גם "📊 סיכום השבוע" (נעלם 24 שעות אחרי שנפתח).
• סיכום שבועי: בשבת ב-22:00 נוצר "📊 סיכום השבוע שלך" (לו"ז ומשימות שבוצעו, זמן לפי קטגוריה, היום הכי פרודוקטיבי, הוצאות השבוע ומתחילת החודש). נשלחת התראה אחת לטלפון "📊 סיכום השבוע שלך מוכן" (למשל "השלמת 12 מתוך 15 משימות"; לחיצה פותחת את לשונית "סיכום"), ובפתיחה הבאה של היומן מופיע פעם אחת כרטיס קטן – סוגרים בלחיצה אחת. הסיכום עובד כמו "צפייה חד-פעמית": הוא נשמר (גם אחרי האיפוס של 00:00) עד שפותחים אותו – בכרטיס, בלשונית "סיכום" או מההתראה – ונעלם 24 שעות אחרי הפתיחה הראשונה. אם לא פותחים אותו בכלל – הוא נמחק לבד ביום שני ב-04:00 (30 שעות אחרי שבת 22:00). סיכום של שבוע חדש מחליף ישן; אין היסטוריה. ההתראה נשלחת רק אם התראות מופעלות והיומן פתוח (גם ברקע) בשבת בין 22:00 ל-00:00, אחרת רק הכרטיס בפתיחה הבאה.
• איפוס שבועי: כל מוצאי שבת ב-00:00 נמחקים אוטומטית הלו"ז, המשימות, השיחה עם העוזר והתזכורות – לא צריך למחוק את השיחה ידנית. נשמרים: כל התקציב וההשקעות, מצב כהה וההגדרות. אי אפשר לתכנן שבוע הבא מראש.
• תקציב: למעלה "→ חודש קודם" / "חודש הבא ←". מדורים: סקירה | הכנסות | הוצאות | קבועות | השקעות. הכפתור הגדול "＋" משתנה לפי המדור ("תנועה חדשה" / "הכנסה חדשה" / "הוצאה / הכנסה קבועה" / "השקעה או חיסכון").
 – הוצאה: מדור הוצאות ← "＋ תנועה חדשה" ← בוחרים "קטגוריית הוצאה" ← לוחצים על "תיאור" ונפתח "בחר תיאור" עם הצעות + אימוג׳י לפי הקטגוריה (או כותבים חופשי ← "אישור") ← "סכום ₪" ← "שמור". תנועה נרשמת להיום.
 – הכנסה: מדור הכנסות ← "＋ הכנסה חדשה" ← סוג הכנסה (משכורת/עצמאי/קצבה/אחר) + סכום. הפקדה לחיסכון: סוג תנועה "הפקדה לחיסכון", או במדור השקעות "＋ הפקדה לחיסכון".
 – קבועות: מדור קבועות ← "＋ הוצאה / הכנסה קבועה" ← סכום ו"יום בחודש" – נרשמת אוטומטית בכל חודש מעכשיו והלאה. בכל קבועה: "עריכה מהחודש הנוכחי", "עצירה מהחודש הנוכחי", "הסרה מהחודש הנוכחי" – חודשים קודמים לא משתנים.
 – סקירה: הכנסות, הוצאות כולל קבועות, הפקדות לחיסכון, "נשאר לך". מתחת: "📊 לאן הלך הכסף" – גרף עוגה לפי קטגוריות עם סה"כ, אחוז מכל קטגוריה והשוואה (▲ עלייה אדומה / ▼ ירידה ירוקה) לאותה תקופה בחודש שעבר; בחודש קודם – לחודש שלפניו. לכל קטגוריה שדה "יעד ₪" לחודש (נשמר לכל חודש בנפרד): ב-80% "⚠️ קרוב לתקציב", ב-100% "⚠️ הגעת לתקציב" (+התראה).
 – השקעות: אחזקות (קרן השתלמות/מניות/פיקדון/קריפטו/חיסכון/אחר) עם הושקע, שווי נוכחי ורווח/הפסד; "עריכה"/"מחיקה". לא מתאפסות לפי חודש וניתנות לעריכה תמיד.
 – חודשים קודמים: 🔒 צפייה בלבד + טבלת "תוצאות החודש". הנתונים נשמרים רק בטלפון, בלי חיבור לבנק.
• העוזר (אתה): כפתור 🤖 בפינה (מספר עליו = הודעות שלא נקראו) פותח את "🤖 העוזר שלי"; ✕ סוגר. כותבים ושולחים ב-➤, או 🎤 לדיבור בעברית (⏹ לעצירה). 📷 = צילום קבלה: מצלמים ואני מזהה סכום, עסק וקטגוריה ורושם את ההוצאה (שואל אם משהו לא ברור). ☀️ בוקר טוב יומי: בפתיחה הראשונה של היום אחרי 06:00 אני כותב סיכום קצר – מה בלו"ז היום, משימות פתוחות, כמה נשאר בתקציב החודש, והתראה אם קטגוריה גבוהה מהרגיל; אפשר לכבות בהגדרות. אפשר לבקש ממני "איך אני עם התקציב" לניתוח מלא, ו"תתכנן לי את מחר: …" כדי שאשבץ דברים במשבצות הפנויות. ⚙️ הגדרות: תיבת "תזכורות: לשאול אותי אם ביצעתי משימות", תיבת "☀️ בוקר טוב יומי", "שמור", "🧹 נקה את השיחה" (רק אם רוצים למחוק עכשיו; השיחה גם נמחקת אוטומטית כל מוצאי שבת ב-00:00, בלי צורך למחוק ידנית). תזכורות: כשמשימת לו"ז מסתיימת אני שואל עם "✅ בוצע" / "עוד לא" (עוד לא = שואל שוב בעוד שעה, עד 3 פעמים); ב-13:00 וב-20:30 שואל על משימות פתוחות.
• התקנה כאפליקציה: אייפון – Safari ← שיתוף ← "הוסף למסך הבית"; אנדרואיד – Chrome ← ⋮ ← "התקן אפליקציה"/"הוסף למסך הבית". עובד גם בלי אינטרנט (חוץ מהעוזר).
• דברים שרק המשתמש עושה (הדרך אותו): מצב כהה, הפעלת התראות, העברת משימות למחר, עריכת טקסט של משימה בלי שעה, עריכת הכנסה/הוצאה/קבועה קיימת (לוחצים "עריכה" ליד הפריט), מעבר בין חודשים, הגדרות העוזר.
${pend.length?'תזכורות פתוחות ששאלת עליהן (אם המשתמש עונה "עשיתי"/"בוצע" – סמן בכלי המתאים): '+pend.join(', '):''}
מצב נוכחי (JSON):
${JSON.stringify({planner:plannerSnapshot(),budget:budgetSummary()})}`}

// ---------- Gemini ----------
const getOwner=()=>localStorage.getItem(LS.owner)||'';
function deviceId(){let d=localStorage.getItem(LS.device);if(!d||!/^[A-Za-z0-9_-]{8,80}$/.test(d)){d=uid().replace(/[^A-Za-z0-9-]/g,'');localStorage.setItem(LS.device,d)}return d}
const hdrs=turn=>{const h={'X-Device-Id':deviceId()};if(turn)h['X-Turn-Id']=turn;const o=getOwner();if(o)h['X-Owner-Code']=o;return h};
function saveQuota(r){const rem=r.headers.get('X-Remaining');if(rem==null)return;W(LS.quota,{rem,limit:+r.headers.get('X-Limit')||50,owner:r.headers.get('X-Owner')==='1',day:isoNow()})}
const newTurn=()=>uid().replace(/[^A-Za-z0-9-]/g,'');
async function gemini(contents,extra={},turn=newTurn()){let r;
 try{r=await fetch(PROXY,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',...hdrs(turn)},body:JSON.stringify({contents,...extra})})}
 catch(e){throw new Error('אין חיבור לעוזר כרגע. בדוק את האינטרנט ונסה שוב.')}
 saveQuota(r);let j=null;try{j=await r.json()}catch(e){}
 if(!r.ok){const code=j?.error;const err=new Error(code==='limit'?'העוזר עמוס כרגע, נסה שוב מחר 🙏':code==='busy'?'העוזר עמוס כרגע, נסה שוב עוד מעט':code==='turn'?'turn':'משהו השתבש בשרת ('+r.status+'). נסה שוב עוד מעט.');err.code=code;throw err}
 return j}
function trimApi(api){const MAX=40;if(api.length<=MAX)return api;let i=api.length-MAX;while(i<api.length&&!(api[i].role==='user'&&api[i].parts.some(p=>p.text!=null)))i++;return api.slice(i)}

// ---------- מצב השיחה ----------
let chat=J(LS.chat,null)||{msgs:[],api:[]};
const saveChat=()=>W(LS.chat,chat);
function push(m){m.id=m.id||uid();m.ts=Date.now();chat.msgs.push(m);if(chat.msgs.length>200)chat.msgs=chat.msgs.slice(-200);saveChat();draw();return m}

// ---------- ממשק ----------
const fab=document.createElement('button');fab.id='as-fab';fab.type='button';fab.setAttribute('aria-label','פתח את העוזר');fab.innerHTML='🤖<span id="as-badge" hidden></span>';document.body.append(fab);
const pane=document.createElement('section');pane.id='as-pane';pane.hidden=true;pane.setAttribute('role','dialog');pane.setAttribute('aria-label','העוזר');
pane.innerHTML=`<div class="as-head"><button type="button" class="as-x" aria-label="סגור">✕</button><h2>🤖 העוזר שלי</h2><button type="button" class="as-gear" aria-label="הגדרות">⚙️</button></div>
<div class="as-body"><div class="as-msgs" aria-live="polite"></div>
<div class="as-set" hidden><h3 class="as-set-title">⚙️ הגדרות העוזר</h3>
<div class="as-owner" hidden>
<p class="as-kstat" hidden></p>
<label><span class="as-klabel">קוד אישי</span><input type="password" class="as-key" autocomplete="off" placeholder="הדבק כאן את הקוד האישי" dir="ltr"></label>
<p class="as-small">הקוד נשמר רק בטלפון הזה ולא נמחק באיפוס השבועי.</p>
<button type="button" class="as-delkey" hidden>🗑️ הסר קוד</button>
</div>
<label class="as-chk"><input type="checkbox" class="as-rem"> תזכורות: לשאול אותי אם ביצעתי משימות</label>
<label class="as-chk"><input type="checkbox" class="as-brief"> ☀️ בוקר טוב יומי: סיכום קצר של היום בכל בוקר</label>
<div class="as-row"><button type="button" class="as-save">שמור</button></div>
<button type="button" class="as-clear">🧹 נקה את השיחה</button>
<p class="as-small">🔒 השיחה מתאפסת כל מוצאי שבת ב-00:00 ביחד עם היומן. נתוני התקציב לא נמחקים.</p></div></div>
<div class="as-typing" hidden>העוזר חושב…</div>
<form class="as-in"><button type="button" class="as-mic" aria-label="הקלטה">🎤</button><button type="button" class="as-cam" aria-label="צלם קבלה" title="צלם קבלה">📷</button><input type="file" class="as-file" accept="image/*" capture="environment" hidden><textarea rows="1" placeholder="כתוב או הקלט מה לעשות…" aria-label="הודעה"></textarea><button type="submit" class="as-send" aria-label="שלח">➤</button></form>`;
document.body.append(pane);
const msgsEl=pane.querySelector('.as-msgs'),setEl=pane.querySelector('.as-set'),ta=pane.querySelector('textarea'),micB=pane.querySelector('.as-mic'),typing=pane.querySelector('.as-typing');
const md=t=>esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\n/g,'<br>');
let unread=+(localStorage.getItem('assistantUnread')||0);
function badge(){const b=Q('#as-badge');b.hidden=!unread;b.textContent=unread>9?'9+':unread}
function draw(){if(pane.hidden)return;const welcome=!chat.msgs.length?`<div class="as-m bot">שלום נתנאל! 👋 אני העוזר שלך ביומן.<br>אפשר לכתוב או להקליט לי, למשל:<br>• "שילמתי 200 שקל על דלק"<br>• "תוסיף מחר בעשר פגישה עם רואה חשבון"<br>• "קיבלתי משכורת 9000"<br>• "מה יש לי היום?"<br>• "תתכנן לי את מחר: כביסה, סופר, להתקשר לאמא"<br>• "איך אני עם התקציב?"<br>• 📷 צלם קבלה ואני ארשום את ההוצאה</div>`:'';
 msgsEl.innerHTML=welcome+chat.msgs.map(m=>`<div class="as-m ${m.role}" data-id="${m.id}">${md(m.text)}${m.btns?`<div class="as-btns">${m.btns.map((b,i)=>`<button type="button" data-i="${i}" ${m.answered?'disabled':''} class="${b.a.t==='later'?'':'ok'}">${esc(b.l)}</button>`).join('')}</div>`:''}</div>`).join('');
 msgsEl.scrollTop=msgsEl.scrollHeight}
function openPane(){pane.hidden=false;fab.hidden=true;unread=0;localStorage.setItem('assistantUnread',0);badge();setEl.hidden=true;msgsEl.hidden=false;draw();setTimeout(()=>ta.focus(),50)}
function closePane(){pane.hidden=true;fab.hidden=false;stopMic()}
fab.onclick=openPane;pane.querySelector('.as-x').onclick=closePane;
pane.querySelector('.as-gear').onclick=()=>{const show=setEl.hidden;setEl.hidden=!show;msgsEl.hidden=show;loadSet();if(show&&isOwnerUI()&&getOwner())refreshQuota();else if(!show)draw()};
let ownerReveal=false;
function isOwnerUI(){try{if(new URLSearchParams(location.search).has('owner'))ownerReveal=true}catch(e){}if(getOwner())ownerReveal=true;return ownerReveal}
function syncOwnerUI(){const box=pane.querySelector('.as-owner');if(box)box.hidden=!isOwnerUI()}
async function refreshQuota(){if(!isOwnerUI()||!getOwner())return;try{const r=await fetch(QUOTA_URL,{cache:'no-store',headers:hdrs()});saveQuota(r);const j=await r.json();
 const st=pane.querySelector('.as-kstat');if(!st)return;st.hidden=false;st.innerHTML=j.owner?'✅ קוד אישי פעיל – ללא הגבלה':'⚠️ הקוד האישי לא נכון';st.className='as-kstat '+(j.owner?'yes':'no')}catch(e){}}
function loadSet(){const k=getOwner();syncOwnerUI();const keyEl=pane.querySelector('.as-key'),st=pane.querySelector('.as-kstat'),del=pane.querySelector('.as-delkey'),lab=pane.querySelector('.as-klabel');
 if(keyEl)keyEl.value='';
 if(st){st.hidden=!k;st.innerHTML=k?'✅ קוד אישי שמור':'';st.className='as-kstat'+(k?' yes':'')}
 if(lab)lab.textContent=k?'להחלפת הקוד – הדבק קוד חדש (אפשר להשאיר ריק)':'קוד אישי';
 if(del)del.hidden=!k;
 pane.querySelector('.as-rem').checked=localStorage.getItem(LS.remOn)!=='off';pane.querySelector('.as-brief').checked=localStorage.getItem(LS.brief)!=='off'}
pane.querySelector('.as-save').onclick=()=>{const box=pane.querySelector('.as-owner');const k=(!box.hidden&&pane.querySelector('.as-key'))?pane.querySelector('.as-key').value.trim():'';if(k){localStorage.setItem(LS.owner,k);localStorage.removeItem(LS.quota)}localStorage.setItem(LS.remOn,pane.querySelector('.as-rem').checked?'on':'off');localStorage.setItem(LS.brief,pane.querySelector('.as-brief').checked?'on':'off');setEl.hidden=true;msgsEl.hidden=false;draw()};
pane.querySelector('.as-delkey').onclick=()=>{if(confirm('להסיר את הקוד האישי מהטלפון?')){localStorage.removeItem(LS.owner);localStorage.removeItem(LS.quota);loadSet()}};
{const h=pane.querySelector('.as-set-title');let n=0,t=0;h.addEventListener('click',()=>{const now=Date.now();if(now-t>2000)n=0;t=now;if(++n>=5){n=0;ownerReveal=true;syncOwnerUI();loadSet()}})}

pane.querySelector('.as-clear').onclick=()=>{if(confirm('לנקות את כל השיחה?')){chat={msgs:[],api:[]};saveChat();setEl.hidden=true;msgsEl.hidden=false;draw()}};
ta.addEventListener('input',()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,120)+'px'});
ta.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();pane.querySelector('form').requestSubmit()}});
pane.querySelector('form').onsubmit=e=>{e.preventDefault();const t=ta.value.trim();if(!t)return;ta.value='';ta.style.height='auto';send(t)};
msgsEl.addEventListener('click',e=>{const b=e.target.closest('.as-btns button');if(!b)return;const m=chat.msgs.find(x=>x.id===b.closest('.as-m').dataset.id);if(!m||m.answered)return;answerBtn(m,m.btns[+b.dataset.i])});

let busy=false;
async function send(text,turn,img){if(busy)return;push({role:'user',text:img?'📷 צילום קבלה'+(text?'\n'+text:''):text});turn=turn||newTurn();
 busy=true;typing.hidden=false;
 try{const parts=img?[{inlineData:{mimeType:'image/jpeg',data:img}},{text:RECEIPT+(text?'\nהמשתמש הוסיף: '+text:'')}]:[{text}];const api=trimApi(chat.api.concat({role:'user',parts}));let changed=[];
  for(let step=0;step<8;step++){let j;try{j=await gemini(api,{systemInstruction:{parts:[{text:systemPrompt()}]},tools:[{functionDeclarations:TOOLS}]},turn)}
   catch(e){if(e.code==='turn'&&step>0){api.push({role:'model',parts:[{text:'בוצע ✅'}]});push({role:'bot',text:'בוצע ✅'});break}throw e}
   const c=j?.candidates?.[0]?.content;if(!c||!c.parts){const why=j?.promptFeedback?.blockReason||j?.candidates?.[0]?.finishReason;throw new Error('לא התקבלה תשובה'+(why?' ('+why+')':''))}
   api.push({role:'model',parts:c.parts});const calls=c.parts.filter(p=>p.functionCall);
   if(!calls.length){const txt=c.parts.filter(p=>p.text&&!p.thought).map(p=>p.text).join('').trim();push({role:'bot',text:txt||(changed.length?'בוצע ✅':'…')});break}
   const resp=calls.map(p=>{const res=runTool(p.functionCall.name,p.functionCall.args);if(res.ok&&p.functionCall.name!=='get_state')changed.push(p.functionCall.name);const fr={name:p.functionCall.name,response:res};if(p.functionCall.id)fr.id=p.functionCall.id;return{functionResponse:fr}});
   api.push({role:'user',parts:resp});
   if(step===7)push({role:'bot',text:'בוצע ✅'})}
  chat.api=trimApi(noImg(api));saveChat()}
 catch(e){push({role:'err',text:(e.code==='limit'?'':'⚠️ ')+(e.code==='turn'?'העוזר עמוס כרגע, נסה שוב עוד מעט':e.message)})}
 finally{busy=false;typing.hidden=true}}

// ---------- צילום קבלה ----------
const RECEIPT='זו תמונה של קבלה/חשבונית. חלץ את הסכום הכולל לתשלום, את שם העסק וקטגוריה מתאימה, ורשום את ההוצאה עם add_expense. אם הסכום או הקטגוריה לא ברורים – שאל אותי לאישור לפני שאתה רושם.';
// התמונה נשלחת רק בתור הנוכחי; בהיסטוריה השמורה היא מוחלפת בטקסט כדי לא לנפח את הזיכרון ואת הבקשות הבאות
const noImg=api=>api.map(c=>c.parts&&c.parts.some(p=>p.inlineData)?{...c,parts:c.parts.map(p=>p.inlineData?{text:'[צורפה תמונת קבלה – כבר טופלה]'}:p)}:c);
async function shrinkImage(file,max=1280,q=.7){const url=URL.createObjectURL(file);try{const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('img'));i.src=url});
 const w=img.naturalWidth,h=img.naturalHeight,s=Math.min(1,max/Math.max(w,h)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*s));c.height=Math.max(1,Math.round(h*s));const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);
 return c.toDataURL('image/jpeg',q).split(',')[1]}finally{URL.revokeObjectURL(url)}}
{const cam=pane.querySelector('.as-cam'),file=pane.querySelector('.as-file');cam.onclick=()=>{if(!busy){file.value='';file.click()}};
 file.onchange=async()=>{const f=file.files&&file.files[0];if(!f)return;let b64;try{b64=await shrinkImage(f)}catch(e){push({role:'err',text:'⚠️ לא הצלחתי לפתוח את התמונה. נסה לצלם שוב.'});return}
  const cap=ta.value.trim();ta.value='';ta.style.height='auto';send(cap,undefined,b64)}}

// ---------- מיקרופון ----------
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;let rec=null,mr=null,chunks=[],srBroken=false;
function micUI(on,label){micB.classList.toggle('on',on);micB.textContent=on?'⏹':'🎤';micB.setAttribute('aria-label',on?'עצור הקלטה':'הקלטה');ta.placeholder=on?(label||'מקשיב… דבר עכשיו'):'כתוב או הקלט מה לעשות…'}
function stopMic(){try{rec&&rec.stop()}catch(e){}try{mr&&mr.state==='recording'&&mr.stop()}catch(e){}}
function noMic(){push({role:'err',text:'הדפדפן הזה לא תומך בהקלטה ישירה 🎤. אפשר ללחוץ על אייקון המיקרופון במקלדת של הטלפון ולהכתיב – הטקסט ייכתב בתיבה ואז לוחצים ➤.'})}
micB.onclick=()=>{if(micB.classList.contains('on')){stopMic();return}
 if(SR&&!srBroken)return startSR();if(window.MediaRecorder&&navigator.mediaDevices?.getUserMedia)return startRec();noMic()};
function startSR(){rec=new SR();rec.lang='he-IL';rec.interimResults=true;rec.continuous=false;rec.maxAlternatives=1;let final='',errored=false;
 rec.onresult=e=>{let interim='';final='';for(const r of e.results){if(r.isFinal)final+=r[0].transcript;else interim+=r[0].transcript}ta.value=(final+interim).trim()};
 rec.onerror=e=>{errored=true;micUI(false);if(e.error==='service-not-allowed'||e.error==='network'||e.error==='language-not-supported'){srBroken=true;if(window.MediaRecorder)push({role:'err',text:'זיהוי הדיבור של הדפדפן לא זמין כאן. לחץ שוב על 🎤 – ההקלטה תישלח לעוזר לתמלול.'});else noMic()}
  else if(e.error==='not-allowed')push({role:'err',text:'אין הרשאה למיקרופון. אשר גישה למיקרופון בהגדרות הדפדפן ונסה שוב.'});
  else if(e.error==='no-speech')push({role:'err',text:'לא שמעתי כלום 🙂 נסה שוב.'})};
 rec.onend=()=>{micUI(false);rec=null;const t=ta.value.trim();if(!errored&&final.trim()&&t){ta.value='';send(t)}};
 try{rec.start();micUI(true)}catch(e){micUI(false);srBroken=true;noMic()}}
async function startRec(){let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:true})}catch(e){push({role:'err',text:'אין הרשאה למיקרופון. אשר גישה בהגדרות ונסה שוב.'});return}
 chunks=[];mr=new MediaRecorder(stream);mr.ondataavailable=e=>e.data.size&&chunks.push(e.data);
 mr.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());micUI(false);const type=(mr.mimeType||'audio/webm').split(';')[0];const blob=new Blob(chunks,{type});mr=null;if(blob.size<1500)return;
  typing.hidden=false;typing.textContent='מתמלל…';
  try{const b64=await new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(String(fr.result).split(',')[1]);fr.onerror=rej;fr.readAsDataURL(blob)});
   const turn=newTurn(); // התמלול וההודעה שאחריו נספרים כהודעה אחת
   const j=await gemini([{role:'user',parts:[{inlineData:{mimeType:type,data:b64}},{text:'תמלל את ההקלטה בעברית. החזר רק את הטקסט שנאמר, בלי שום תוספת.'}]}],{},turn);
   const t=(j?.candidates?.[0]?.content?.parts||[]).filter(p=>p.text&&!p.thought).map(p=>p.text).join('').trim();typing.hidden=true;typing.textContent='העוזר חושב…';if(t)send(t,turn);else push({role:'err',text:'לא הצלחתי להבין את ההקלטה, נסה שוב.'})}
  catch(e){typing.hidden=true;typing.textContent='העוזר חושב…';push({role:'err',text:'⚠️ '+e.message})}};
 mr.start();micUI(true,'מקליט… לחץ ⏹ כשסיימת')}

// ---------- תזכורות ----------
const rem=()=>J(LS.rem,{}),saveRem=o=>W(LS.rem,o);
function resolveRem(k){const o=rem();if(o[k]){o[k].resolved=true;saveRem(o)}chat.msgs.forEach(m=>{if(!m.answered&&m.btns&&m.btns.some(b=>b.a.k===k)){if(m.btns.every(b=>b.a.k===k||b.a.t==='later'))m.answered=true}});saveChat();draw()}
async function ping(text){if(pane.hidden||document.hidden){unread++;localStorage.setItem('assistantUnread',unread);badge();if(window.Notification&&Notification.permission==='granted'){try{const r=await navigator.serviceWorker?.getRegistration();r?r.showNotification('העוזר 🤖',{body:text,icon:'icon.svg',tag:'assistant'}):new Notification('העוזר 🤖',{body:text})}catch(e){}}}}
function answerBtn(m,b){const a=b.a;m.answered=true;
 if(a.t==='task'){const all=lp(),t=(all[a.day]||[]).find(x=>String(x.id)===String(a.id));if(t){t.done=true;sp(all);refreshPlanner()}const o=rem();if(o[a.k]){o[a.k].resolved=true;saveRem(o)}push({role:'user',text:'✅ בוצע'});push({role:'bot',text:t?`מעולה! סימנתי "${t.title}" כבוצע ✅`:'המשימה כבר לא קיימת ביומן.'})}
 else if(a.t==='todo'){const o=ltd(),arr=o[a.day]||[];const i=arr[a.idx]&&arr[a.idx].text===a.text?a.idx:arr.findIndex(x=>x.text===a.text);if(i>=0){arr[i].done=true;std(o);refreshPlanner()}push({role:'user',text:'✅ '+a.text});const left=(ltd()[a.day]||[]).filter(x=>!x.done);
  const rest=m.btns.filter(x=>x.a.t==='todo'&&x!==b&&left.some(y=>y.text===x.a.text));push({role:'bot',text:`יופי! "${a.text}" סומן כבוצע ✅`+(rest.length?'\nומה עם השאר?':''),btns:rest.length?rest.concat({l:'עוד לא',a:{t:'later',k:a.k}}):undefined})}
 else{const o=rem();if(o[a.k]&&o[a.k].count<3)o[a.k].snooze=Date.now()+60*60000;else if(o[a.k])o[a.k].resolved=true;saveRem(o);push({role:'user',text:'עוד לא'});push({role:'bot',text:o[a.k]&&!o[a.k].resolved?'בסדר 👍 אשאל שוב בעוד שעה.':'בסדר 👍'})}
 saveChat();draw()}
function checkReminders(){if(localStorage.getItem(LS.remOn)==='off')return;const now=Date.now(),o=rem(),day=plannerDay(),k=dkey(day),base=day.getTime();let n=0;
 for(const t of (lp()[k]||[])){const rk='task:'+k+':'+t.id,r=o[rk]||{count:0};if(t.done||r.resolved){continue}const end=base+(t.start+ +t.dur)*60000;if(now<end)continue;if(r.snooze&&now<r.snooze)continue;if(r.asked&&!r.snooze)continue;if(n>=3)break;
  r.asked=now;r.count=(r.count||0)+1;r.snooze=0;o[rk]=r;n++;const txt=`⏰ המשימה "${t.title}" (\u2066${fmtM(t.start)}–${fmtM(t.start+ +t.dur)}\u2069) הסתיימה. ביצעת אותה?`;
  chat.msgs.filter(m=>!m.answered&&m.btns&&m.btns.some(b=>b.a.k===rk)).forEach(m=>m.answered=true);
  push({role:'bot',text:txt,btns:[{l:'✅ בוצע',a:{t:'task',k:rk,day:k,id:t.id}},{l:'עוד לא',a:{t:'later',k:rk}}]});ping(txt)}
 const hm=new Date().getHours()*60+new Date().getMinutes();for(const [slot,at] of [['noon',13*60],['eve',20*60+30]]){const rk='todo:'+k+':'+slot;if(o[rk]||hm<at||hm>at+3*60)continue;const open=(ltd()[k]||[]).map((t,i)=>({...t,i})).filter(t=>!t.done);o[rk]={asked:now,count:3};if(!open.length)continue;
  const txt=`📝 יש לך ${open.length} משימות פתוחות להיום. סיימת משהו מהן?`;push({role:'bot',text:txt+'\n'+open.map(t=>'• '+t.text).join('\n'),btns:open.slice(0,8).map(t=>({l:'✅ '+t.text,a:{t:'todo',k:rk,day:k,idx:t.i,text:t.text}})).concat({l:'עוד לא',a:{t:'later',k:rk}})});ping(txt)}
 saveRem(o)}

// ---------- בוקר טוב יומי (מקומי, בלי שרת) ----------
function briefText(){const day=new Date();day.setHours(0,0,0,0);const k=dkey(day),tasks=(lp()[k]||[]).filter(t=>!t.done),todos=(ltd()[k]||[]).filter(t=>!t.done),d=rb(),m=ymNow(),hasBud=monthRows(d,m).length>0;
 if(!tasks.length&&!todos.length&&!hasBud&&!(lp()[k]||[]).length)return null;
 const hr=new Date().getHours(),L=[`${hr<12?'☀️ בוקר טוב':hr<17?'🌤️ צהריים טובים':'🌙 ערב טוב'}! הנה היום שלך (יום ${DN[day.getDay()]}):`];
 L.push(tasks.length?`📅 בלו"ז היום (${tasks.length}):\n`+tasks.slice(0,8).map(t=>`• \u2066${fmtM(t.start)}\u2069 ${t.title}`).join('\n')+(tasks.length>8?`\n• ועוד ${tasks.length-8}…`:''):'📅 אין משימות בלו"ז להיום.');
 if(todos.length)L.push(`📝 משימות פתוחות (${todos.length}):\n`+todos.slice(0,6).map(t=>'• '+t.text).join('\n')+(todos.length>6?`\n• ועוד ${todos.length-6}…`:''));
 if(hasBud){const bs=budgetSummary();L.push(bs.balance>=0?`💰 נשאר לך החודש: ${nis(bs.balance)}`:`💰 שים לב: החודש הוצאת ${nis(-bs.balance)} יותר ממה שנכנס`);
  try{const hi=budgetInsights().highlights;if(hi.length)L.push('💡 '+hi[0])}catch(e){}}
 L.push('שיהיה יום מוצלח! 💪');return L.join('\n')}
function morningBrief(force){if(!force&&localStorage.getItem(LS.brief)==='off')return false;const n=new Date();if(!force&&n.getHours()<6)return false;const today=isoNow();if(!force&&localStorage.getItem(LS.briefDay)===today)return false;
 localStorage.setItem(LS.briefDay,today);const txt=briefText();if(!txt)return false;push({role:'bot',text:txt});ping(txt);return true}

// ---------- הפעלה ----------
function tick(){if(weeklyReset()){chat={msgs:[],api:[]};unread=0;localStorage.setItem('assistantUnread',0);badge();draw()}checkReminders();morningBrief()}
tick();badge();setInterval(tick,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
window.Assistant={send,runTool,checkReminders,tick,systemPrompt,morningBrief,budgetInsights,shrinkImage,open:openPane,close:closePane,get chat(){return chat},TOOLS};
})();
