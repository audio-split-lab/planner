(()=>{'use strict';
// ===== עוזר אישי ביומן: צאט + מיקרופון + תזכורות =====
const Q=s=>document.querySelector(s);
const LS={chat:'assistantChat',rem:'assistantRem',week:'assistantWeek',remOn:'assistantRemind',owner:'assistantOwner',device:'assistantDevice',quota:'assistantQuota'};
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
  tasks:(all[k]||[]).map(t=>({id:t.id,title:t.title,start:fmtM(t.start),end:fmtM(t.start+ +t.dur),duration_min:+t.dur,category:t.cat,note:t.note||'',done:!!t.done})),
  todos:(td[k]||[]).map((t,i)=>({index:i,text:t.text,category:t.cat||'',done:!!t.done}))}})}

// ---------- כלים ----------
const S_=(type,description,extra={})=>({type,description,...extra});
const TOOLS=[
 {name:'get_state',description:'קריאת מצב עדכני: משימות לו"ז ומשימות לכל ימי השבוע, וסיכום התקציב של החודש הנוכחי.',},
 {name:'add_task',description:'הוספת משימה ללו"ז בשעה מסוימת (משבצות של 15 דקות, 08:00–02:00). רק בשבוע הנוכחי.',parameters:{type:'object',properties:{date:S_('string','YYYY-MM-DD של היום בשבוע הנוכחי'),start:S_('string','שעת התחלה HH:MM (00:00–02:00 = אחרי חצות של אותו יום ביומן)'),duration_min:S_('integer','משך בדקות, כפולה של 15. ברירת מחדל 60'),title:S_('string','כותרת המשימה'),category:S_('string','קטגוריית לו"ז',{enum:Object.keys(PCATS)}),note:S_('string','הערה')},required:['date','start','title']}},
 {name:'edit_task',description:'עריכת משימה קיימת בלו"ז לפי id. שדות שלא נשלחו לא משתנים.',parameters:{type:'object',properties:{date:S_('string','היום שבו המשימה נמצאת כעת YYYY-MM-DD'),task_id:S_('number','id של המשימה'),new_date:S_('string','יום חדש YYYY-MM-DD'),start:S_('string','שעה חדשה HH:MM'),duration_min:S_('integer','משך חדש'),title:S_('string','כותרת חדשה'),category:S_('string','קטגוריה',{enum:Object.keys(PCATS)}),note:S_('string','הערה')},required:['date','task_id']}},
 {name:'delete_task',description:'מחיקת משימה מהלו"ז. רק אחרי שהמשתמש אישר במפורש.',parameters:{type:'object',properties:{date:S_('string','YYYY-MM-DD'),task_id:S_('number','id')},required:['date','task_id']}},
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
 {name:'set_category_target',description:'קביעת יעד (תקרת תקציב) חודשי לקטגוריית הוצאה בחודש הנוכחי. 0 מוחק את היעד.',parameters:{type:'object',properties:{category:S_('string','',{enum:['food','car','home','bills','fun','shop','health','other']}),amount:S_('number','סכום היעד')},required:['category','amount']}}
];
const fail=e=>({ok:false,error:e});
const num=x=>{const n=Number(x);return Number.isFinite(n)?n:NaN};
function getDay(s){const d=dayFrom(s);if(!d)return{err:'חסר יום או שהתאריך לא תקין – שאל את המשתמש לאיזה יום'};if(d==='out')return{err:'אפשר לתכנן רק בשבוע הנוכחי (היומן מתאפס כל מוצאי שבת) – הסבר למשתמש'};return{d}}
const EXEC={
 get_state:()=>({ok:true,planner:plannerSnapshot(),budget:budgetSummary()}),
 add_task(a){const g=getDay(a.date);if(g.err)return fail(g.err);if(!String(a.title||'').trim())return fail('חסרה כותרת – שאל את המשתמש');const t=parseTime(a.start,g.d.getDay()===6);if(t.err)return fail(t.err);
  const all=lp(),k=dkey(g.d),o={id:Date.now(),title:String(a.title).trim(),start:t.v,dur:durOk(a.duration_min),note:a.note||'',cat:PCATS[a.category]?a.category:'other',done:false,notified:false};
  if(g.d.getDay()===6&&o.start+o.dur>24*60)o.dur=Math.max(15,24*60-o.start);
  all[k]=(all[k]||[]).concat(o).sort((x,y)=>x.start-y.start);sp(all);refreshPlanner();return{ok:true,task:{id:o.id,date:isoOf(g.d),start:fmtM(o.start),duration_min:o.dur,title:o.title},rounded_to_15:!!t.rounded}},
 edit_task(a){const g=getDay(a.date);if(g.err)return fail(g.err);const all=lp(),k=dkey(g.d),arr=all[k]||[],t=arr.find(x=>String(x.id)===String(a.task_id));if(!t)return fail('לא נמצאה משימה עם id כזה ביום הזה');
  let nd=g.d;if(a.new_date){const g2=getDay(a.new_date);if(g2.err)return fail(g2.err);nd=g2.d}
  if(a.start!=null||nd!==g.d){const tt=parseTime(a.start!=null?a.start:fmtM(t.start),nd.getDay()===6);if(tt.err)return fail(tt.err);if(tt.v!==t.start){t.start=tt.v;t.notified=false}}
  if(a.duration_min!=null)t.dur=durOk(a.duration_min);if(a.title)t.title=String(a.title).trim();if(PCATS[a.category])t.cat=a.category;if(a.note!=null)t.note=a.note;
  all[k]=arr.filter(x=>x!==t);const nk=dkey(nd);all[nk]=(all[nk]||[]).concat(t).sort((x,y)=>x.start-y.start);sp(all);refreshPlanner();return{ok:true,task:{id:t.id,date:isoOf(nd),start:fmtM(t.start),duration_min:t.dur,title:t.title}}},
 delete_task(a){const g=getDay(a.date);if(g.err)return fail(g.err);const all=lp(),k=dkey(g.d),arr=all[k]||[];const t=arr.find(x=>String(x.id)===String(a.task_id));if(!t)return fail('לא נמצאה משימה');all[k]=arr.filter(x=>x!==t);sp(all);refreshPlanner();return{ok:true,deleted:t.title}},
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
 set_category_target(a){const C=B()?.categories||{},amount=num(a.amount);if(!C[a.category])return fail('קטגוריה לא תקינה');if(!(amount>=0))return fail('סכום לא תקין');const d=rb(),m=ymNow();(d.limits[m]=d.limits[m]||{})[a.category]=amount;wb(d);refreshBudget();return{ok:true,month:m,category:C[a.category][0],target:amount}}
};
function runTool(name,args){try{const f=EXEC[name];return f?f(args||{}):fail('כלי לא מוכר')}catch(e){return fail('שגיאה: '+e.message)}}

// ---------- הנחיית מערכת ----------
function systemPrompt(){const now=new Date(),C=B()?.categories||{},S=B()?.SUGG||{};
 const pend=Object.entries(J(LS.rem,{})).filter(([k,v])=>!v.resolved&&v.asked).map(([k])=>k);
 return `אתה "העוזר" ביומן האישי של נתנאל – אפליקציית לו"ז, משימות ותקציב בעברית. ענה תמיד בעברית, בקצרה ובחום, בלי מונחים טכניים. אם שואלים מי אתה, איזה מודל או איזו חברה עומדת מאחוריך – ענה רק שאתה "העוזר שלי" של היומן, ואל תזכיר שום חברה, מודל או טכנולוגיה.
עכשיו: ${now.toLocaleString('he-IL',{weekday:'long',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}. היום ביומן: ${isoOf(plannerDay())} (יום ${DN[plannerDay().getDay()]}).
ימי השבוע הנוכחי: ${weekDays().map(d=>DN[d.getDay()]+'='+isoOf(d)).join(', ')}.
כללים:
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
קטגוריות לו"ז: ${Object.entries(PCATS).map(([k,v])=>k+'='+v).join(', ')}.
קטגוריות הוצאה והצעות תיאור:
${Object.keys(C).map(k=>`${k}=${C[k][0]}: ${(S[k]||[]).join(' | ')}`).join('\n')}
סוגי הכנסה: ${INCOME.join(', ')}. סוגי השקעה: ${HOLD.join(', ')}.
מדריך היומן (הכר אותו כמו את הבית שלך) – כשמבקשים "איך עושים…", הדרך צעד-צעד בשמות המדויקים ("לחץ על … ואז …"). אם זו פעולה שאתה יכול לעשות בכלי – הצע לעשות אותה בעצמך.
• כותרת עליונה: "📒 היומן של נתנאל", לידה 🌙/☀️ למצב כהה/בהיר (נשמר תמיד). "🔔 הפעל התראות" – מאשר התראות; בלי זה אין התראות בטלפון. שורת ימים ראשון–שבת של השבוע הנוכחי (היום מסומן במסגרת צהובה) – לחיצה על יום עוברת אליו. 4 לשוניות: לו"ז | משימות | סיכום | תקציב.
• לו"ז: משבצות 15 דק׳ מ-08:00 עד 02:00 (בשבת עד 23:45); עד 02:30 בלילה עדיין נחשב היום הקודם. הוספה: לוחצים על משבצת ריקה ← "משימה חדשה": כותרת, שעת התחלה, משך (15 דק׳ עד 8 שע׳), קטגוריה (עבודה/אישי/קניות/אחר, לכל אחת צבע – מקרא למעלה), הערה ← "שמור". עריכה: לוחצים על המשימה ← משנים ← "שמור"; מחיקה: "מחק". ☐ בפינת המשימה = סימון בוצע (✅ וקו חוצה). 10 דקות לפני משימה יש צפצוף, רטט והתראה ⏰.
• משימות (בלי שעה): כותבים ב"מה צריך לעשות היום?", בוחרים קטגוריה (או "ללא") ← "הוסף" או Enter. ☐ או לחיצה על הטקסט = בוצע; ✏️ עריכה; 🗑️ מחיקה. "העבר משימות שלא הושלמו למחר ←" מעביר את הפתוחות ליום הבא (לא בשבת). כל יום עם רשימה משלו.
• סיכום: ליום הנבחר – כמה בוצעו בלו"ז ובמשימות, זמן שבוצע/מתוכנן, התקדמות לפי קטגוריה, "✅ מה הושלם" ו"⏳ לא הושלם".
• איפוס שבועי: כל מוצאי שבת ב-00:00 נמחקים הלו"ז, המשימות, השיחה עם העוזר והתזכורות. נשמרים: כל התקציב וההשקעות, מצב כהה, הקוד האישי וההגדרות. אי אפשר לתכנן שבוע הבא מראש.
• תקציב: למעלה "→ חודש קודם" / "חודש הבא ←". מדורים: סקירה | הכנסות | הוצאות | קבועות | השקעות. הכפתור הגדול "＋" משתנה לפי המדור ("תנועה חדשה" / "הכנסה חדשה" / "הוצאה / הכנסה קבועה" / "השקעה או חיסכון").
 – הוצאה: מדור הוצאות ← "＋ תנועה חדשה" ← בוחרים "קטגוריית הוצאה" ← לוחצים על "תיאור" ונפתח "בחר תיאור" עם הצעות + אימוג׳י לפי הקטגוריה (או כותבים חופשי ← "אישור") ← "סכום ₪" ← "שמור". תנועה נרשמת להיום.
 – הכנסה: מדור הכנסות ← "＋ הכנסה חדשה" ← סוג הכנסה (משכורת/עצמאי/קצבה/אחר) + סכום. הפקדה לחיסכון: סוג תנועה "הפקדה לחיסכון", או במדור השקעות "＋ הפקדה לחיסכון".
 – קבועות: מדור קבועות ← "＋ הוצאה / הכנסה קבועה" ← סכום ו"יום בחודש" – נרשמת אוטומטית בכל חודש מעכשיו והלאה. בכל קבועה: "עריכה מהחודש הנוכחי", "עצירה מהחודש הנוכחי", "הסרה מהחודש הנוכחי" – חודשים קודמים לא משתנים.
 – סקירה: הכנסות, הוצאות כולל קבועות, הפקדות לחיסכון, "נשאר לך". לכל קטגוריה שדה "יעד ₪" לחודש (נשמר לכל חודש בנפרד): ב-80% "⚠️ קרוב לתקציב", ב-100% "⚠️ הגעת לתקציב" (+התראה).
 – השקעות: אחזקות (קרן השתלמות/מניות/פיקדון/קריפטו/חיסכון/אחר) עם הושקע, שווי נוכחי ורווח/הפסד; "עריכה"/"מחיקה". לא מתאפסות לפי חודש וניתנות לעריכה תמיד.
 – חודשים קודמים: 🔒 צפייה בלבד + טבלת "תוצאות החודש". הנתונים נשמרים רק בטלפון, בלי חיבור לבנק.
• העוזר (אתה): כפתור 🤖 בפינה (מספר עליו = הודעות שלא נקראו) פותח את "🤖 העוזר שלי"; ✕ סוגר. כותבים ושולחים ב-➤, או 🎤 לדיבור בעברית (⏹ לעצירה). ⚙️ הגדרות: "קוד אישי (לא חובה)" – מבטל את מגבלת 50 ההודעות ביום (בלי קוד עובד רגיל), "🗑️ הסר קוד", תיבת "תזכורות: לשאול אותי אם ביצעתי משימות", "שמור", "🧹 נקה את השיחה". תזכורות: כשמשימת לו"ז מסתיימת אני שואל עם "✅ בוצע" / "עוד לא" (עוד לא = שואל שוב בעוד שעה, עד 3 פעמים); ב-13:00 וב-20:30 שואל על משימות פתוחות.
• התקנה כאפליקציה: אייפון – Safari ← שיתוף ← "הוסף למסך הבית"; אנדרואיד – Chrome ← ⋮ ← "התקן אפליקציה"/"הוסף למסך הבית". עובד גם בלי אינטרנט (חוץ מהעוזר).
• דברים שרק המשתמש עושה (הדרך אותו): מצב כהה, הפעלת התראות, העברת משימות למחר, עריכת טקסט של משימה בלי שעה, עריכת הכנסה/הוצאה/קבועה קיימת (לוחצים "עריכה" ליד הפריט), מעבר בין חודשים, הגדרות העוזר.
${pend.length?'תזכורות פתוחות ששאלת עליהן (אם המשתמש עונה "עשיתי"/"בוצע" – סמן בכלי המתאים): '+pend.join(', '):''}
מצב נוכחי (JSON):
${JSON.stringify({planner:plannerSnapshot(),budget:budgetSummary()})}`}

// ---------- Gemini ----------
const getOwner=()=>localStorage.getItem(LS.owner)||'';
function deviceId(){let d=localStorage.getItem(LS.device);if(!d||!/^[A-Za-z0-9_-]{8,80}$/.test(d)){d=uid().replace(/[^A-Za-z0-9-]/g,'');localStorage.setItem(LS.device,d)}return d}
const hdrs=turn=>{const h={'X-Device-Id':deviceId()};if(turn)h['X-Turn-Id']=turn;const o=getOwner();if(o)h['X-Owner-Code']=o;return h};
function saveQuota(r){const rem=r.headers.get('X-Remaining');if(rem==null)return;W(LS.quota,{rem,limit:+r.headers.get('X-Limit')||50,owner:r.headers.get('X-Owner')==='1',day:isoNow()});quotaUI()}
const newTurn=()=>uid().replace(/[^A-Za-z0-9-]/g,'');
async function gemini(contents,extra={},turn=newTurn()){let r;
 try{r=await fetch(PROXY,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',...hdrs(turn)},body:JSON.stringify({contents,...extra})})}
 catch(e){throw new Error('אין חיבור לעוזר כרגע. בדוק את האינטרנט ונסה שוב.')}
 saveQuota(r);let j=null;try{j=await r.json()}catch(e){}
 if(!r.ok){const code=j?.error;const err=new Error(code==='limit'?`הגעת ל-${j.limit||50} הודעות להיום, נתראה מחר 🙂`:code==='busy'?'העוזר עמוס כרגע, נסה שוב עוד מעט':code==='turn'?'turn':'משהו השתבש בשרת ('+r.status+'). נסה שוב עוד מעט.');err.code=code;throw err}
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
<div class="as-set" hidden><h3>⚙️ הגדרות העוזר</h3>
<p class="as-quota as-small"></p>
<p class="as-kstat"></p><label><span class="as-klabel">קוד אישי (לא חובה)</span><input type="password" class="as-key" autocomplete="off" placeholder="הדבק כאן את הקוד האישי" dir="ltr"></label>
<p class="as-small">הקוד האישי מבטל את מגבלת ההודעות היומית. מי שאין לו קוד – העוזר עובד לו רגיל, עד 50 הודעות ביום.</p>
<label class="as-chk"><input type="checkbox" class="as-rem"> תזכורות: לשאול אותי אם ביצעתי משימות</label>
<div class="as-row"><button type="button" class="as-save">שמור</button><button type="button" class="as-delkey">🗑️ הסר קוד</button></div>
<button type="button" class="as-clear">🧹 נקה את השיחה</button>
<p class="as-small">🔒 הקוד האישי נשמר רק בטלפון הזה ולא נמחק באיפוס השבועי. ההודעות עוברות דרך השרת של היומן. השיחה מתאפסת כל מוצאי שבת ב-00:00 ביחד עם היומן. נתוני התקציב לא נמחקים.</p></div></div>
<div class="as-typing" hidden>העוזר חושב…</div>
<form class="as-in"><button type="button" class="as-mic" aria-label="הקלטה">🎤</button><textarea rows="1" placeholder="כתוב או הקלט מה לעשות…" aria-label="הודעה"></textarea><button type="submit" class="as-send" aria-label="שלח">➤</button></form>`;
document.body.append(pane);
const msgsEl=pane.querySelector('.as-msgs'),setEl=pane.querySelector('.as-set'),ta=pane.querySelector('textarea'),micB=pane.querySelector('.as-mic'),typing=pane.querySelector('.as-typing');
const md=t=>esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\n/g,'<br>');
let unread=+(localStorage.getItem('assistantUnread')||0);
function badge(){const b=Q('#as-badge');b.hidden=!unread;b.textContent=unread>9?'9+':unread}
function draw(){if(pane.hidden)return;const welcome=!chat.msgs.length?`<div class="as-m bot">שלום נתנאל! 👋 אני העוזר שלך ביומן.<br>אפשר לכתוב או להקליט לי, למשל:<br>• "שילמתי 200 שקל על דלק"<br>• "תוסיף מחר בעשר פגישה עם רואה חשבון"<br>• "קיבלתי משכורת 9000"<br>• "מה יש לי היום?"</div>`:'';
 msgsEl.innerHTML=welcome+chat.msgs.map(m=>`<div class="as-m ${m.role}" data-id="${m.id}">${md(m.text)}${m.btns?`<div class="as-btns">${m.btns.map((b,i)=>`<button type="button" data-i="${i}" ${m.answered?'disabled':''} class="${b.a.t==='later'?'':'ok'}">${esc(b.l)}</button>`).join('')}</div>`:''}</div>`).join('');
 msgsEl.scrollTop=msgsEl.scrollHeight}
function openPane(){pane.hidden=false;fab.hidden=true;unread=0;localStorage.setItem('assistantUnread',0);badge();setEl.hidden=true;msgsEl.hidden=false;draw();setTimeout(()=>ta.focus(),50)}
function closePane(){pane.hidden=true;fab.hidden=false;stopMic()}
fab.onclick=openPane;pane.querySelector('.as-x').onclick=closePane;
pane.querySelector('.as-gear').onclick=()=>{const show=setEl.hidden;setEl.hidden=!show;msgsEl.hidden=show;loadSet();if(show)refreshQuota();else draw()};
function quotaUI(){const el=pane.querySelector('.as-quota');if(!el)return;const q=J(LS.quota,null);
 el.textContent=!q||q.day!==isoNow()?'':q.owner?'✨ ללא הגבלת הודעות (קוד אישי פעיל)':`נשארו לך היום ${q.rem} מתוך ${q.limit} הודעות`}
async function refreshQuota(){try{const r=await fetch(QUOTA_URL,{cache:'no-store',headers:hdrs()});saveQuota(r);const j=await r.json();
 if(getOwner()){const st=pane.querySelector('.as-kstat');st.innerHTML=j.owner?'✅ קוד אישי פעיל – ללא הגבלה':'⚠️ הקוד האישי לא נכון – העוזר עובד עם המגבלה הרגילה';st.className='as-kstat '+(j.owner?'yes':'no')}}catch(e){}}
function loadSet(){const k=getOwner();pane.querySelector('.as-key').value='';pane.querySelector('.as-kstat').innerHTML=k?'✅ קוד אישי שמור: <span dir="ltr">••••'+esc(k.slice(-2))+'</span>':'אין קוד אישי (לא חובה)';pane.querySelector('.as-kstat').className='as-kstat '+(k?'yes':'');pane.querySelector('.as-klabel').textContent=k?'להחלפת הקוד – הדבק קוד חדש (אפשר להשאיר ריק)':'קוד אישי (לא חובה)';pane.querySelector('.as-delkey').hidden=!k;pane.querySelector('.as-rem').checked=localStorage.getItem(LS.remOn)!=='off';quotaUI()}
pane.querySelector('.as-save').onclick=()=>{const k=pane.querySelector('.as-key').value.trim();if(k){localStorage.setItem(LS.owner,k);localStorage.removeItem(LS.quota)}localStorage.setItem(LS.remOn,pane.querySelector('.as-rem').checked?'on':'off');setEl.hidden=true;msgsEl.hidden=false;draw()};
pane.querySelector('.as-delkey').onclick=()=>{if(confirm('להסיר את הקוד האישי מהטלפון? העוזר ימשיך לעבוד עם מגבלה של 50 הודעות ביום.')){localStorage.removeItem(LS.owner);localStorage.removeItem(LS.quota);loadSet();refreshQuota()}};
pane.querySelector('.as-clear').onclick=()=>{if(confirm('לנקות את כל השיחה?')){chat={msgs:[],api:[]};saveChat();setEl.hidden=true;msgsEl.hidden=false;draw()}};
ta.addEventListener('input',()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,120)+'px'});
ta.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();pane.querySelector('form').requestSubmit()}});
pane.querySelector('form').onsubmit=e=>{e.preventDefault();const t=ta.value.trim();if(!t)return;ta.value='';ta.style.height='auto';send(t)};
msgsEl.addEventListener('click',e=>{const b=e.target.closest('.as-btns button');if(!b)return;const m=chat.msgs.find(x=>x.id===b.closest('.as-m').dataset.id);if(!m||m.answered)return;answerBtn(m,m.btns[+b.dataset.i])});

let busy=false;
async function send(text,turn){if(busy)return;push({role:'user',text});turn=turn||newTurn();
 busy=true;typing.hidden=false;
 try{const api=trimApi(chat.api.concat({role:'user',parts:[{text}]}));let changed=[];
  for(let step=0;step<8;step++){let j;try{j=await gemini(api,{systemInstruction:{parts:[{text:systemPrompt()}]},tools:[{functionDeclarations:TOOLS}]},turn)}
   catch(e){if(e.code==='turn'&&step>0){api.push({role:'model',parts:[{text:'בוצע ✅'}]});push({role:'bot',text:'בוצע ✅'});break}throw e}
   const c=j?.candidates?.[0]?.content;if(!c||!c.parts){const why=j?.promptFeedback?.blockReason||j?.candidates?.[0]?.finishReason;throw new Error('לא התקבלה תשובה'+(why?' ('+why+')':''))}
   api.push({role:'model',parts:c.parts});const calls=c.parts.filter(p=>p.functionCall);
   if(!calls.length){const txt=c.parts.filter(p=>p.text&&!p.thought).map(p=>p.text).join('').trim();push({role:'bot',text:txt||(changed.length?'בוצע ✅':'…')});break}
   const resp=calls.map(p=>{const res=runTool(p.functionCall.name,p.functionCall.args);if(res.ok&&p.functionCall.name!=='get_state')changed.push(p.functionCall.name);const fr={name:p.functionCall.name,response:res};if(p.functionCall.id)fr.id=p.functionCall.id;return{functionResponse:fr}});
   api.push({role:'user',parts:resp});
   if(step===7)push({role:'bot',text:'בוצע ✅'})}
  chat.api=trimApi(api);saveChat()}
 catch(e){push({role:'err',text:(e.code==='limit'?'':'⚠️ ')+(e.code==='turn'?'העוזר עמוס כרגע, נסה שוב עוד מעט':e.message)})}
 finally{busy=false;typing.hidden=true}}

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

// ---------- הפעלה ----------
function tick(){if(weeklyReset()){chat={msgs:[],api:[]};unread=0;localStorage.setItem('assistantUnread',0);badge();draw()}checkReminders()}
tick();badge();setInterval(tick,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
window.Assistant={send,runTool,checkReminders,tick,systemPrompt,open:openPane,close:closePane,get chat(){return chat},TOOLS};
})();
