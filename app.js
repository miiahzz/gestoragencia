/* ============================================================
   CENTRAL — GestorPro app logic
   ============================================================ */
const DB='gestorpro_v4';
const FIREBASE_DOC_ID='central-dados';
const SCHEMA_VERSION=2; // bump this when S structure changes to trigger migrations

// ---------- MIGRATIONS ----------
// When we add new fields to S, old saved data won't have them.
// This function fills in any missing fields with safe defaults.
function migrateState(s){
  if(!s.folgas)s.folgas={};
  if(!s.reportDrafts)s.reportDrafts={};
  if(!s.smartAlertsDone)s.smartAlertsDone={};
  if(!s.alertNotes)s.alertNotes={};
  if(!s.horaExtraSlots)s.horaExtraSlots={};
  if(!s.swaps)s.swaps=[];
  if(!s.morningRoutine)s.morningRoutine=[];
  if(!s.problemsToday)s.problemsToday={};
  if(!s.demandas)s.demandas={};
  if(!s.trainings)s.trainings=[];
  if(!s.weekEvolutions)s.weekEvolutions={};
  if(!s.modelRequests)s.modelRequests={};
  if(!s.weekPrize)s.weekPrize={};
  if(!s.motivational)s.motivational={};
  if(!s.scheduleRequests)s.scheduleRequests={};
  if(!s.chatterFichas)s.chatterFichas={};
  if(!s.estudosDraft)s.estudosDraft={};
  if(!s.estudosHistory)s.estudosHistory=[];
  if(!s.managerProfile)s.managerProfile={};
  if(!s.motivacionalHome)s.motivacionalHome={};
  if(!s.chatAnalyses)s.chatAnalyses={};
  if(!s.semanaObjetivos)s.semanaObjetivos={};
  if(!s.modelRequestsSplit)s.modelRequestsSplit={};
  if(!s.demandas2)s.demandas2={};
  if(!s.justificativas)s.justificativas={};
  if(Array.isArray(s.shifts))s.shifts=s.shifts.map(sh=>({start2:'',end2:'',folgaDia:'',modelIds:[],...sh}));
  if(!s.chatterTrainings)s.chatterTrainings=[];
  if(s.hasSeededStudies===undefined)s.hasSeededStudies=false;
  if(!s.chatterWeekGoals)s.chatterWeekGoals={};
  if(!s.weekNotes)s.weekNotes={};
  if(!s.watchAlerts)s.watchAlerts={};
  if(!s.midnightTasks)s.midnightTasks={};
  if(!s.dailyTasks)s.dailyTasks={};
  if(!s.weekGoals)s.weekGoals={};
  if(!s.revenues)s.revenues={};
  if(!s.models)s.models=[];
  if(!s.quickNotes)s.quickNotes=[];
  if(!s.turnoLog)s.turnoLog={};
  if(!s.chatters)s.chatters=[];
  if(!s.shifts)s.shifts=[];
  if(!s.absences)s.absences=[];
  if(!s.orientations)s.orientations=[];
  if(!s.studies)s.studies=[];
  s.chatters=s.chatters.map(c=>({
    level:'junior',discord:'',notes:'',watchtime:'',createdAt:new Date().toISOString(),
    time:'basico', // 'basico' | 'elite'
    ...c
  }));
  return s;
}

/* ===========================================================
   FIREBASE SYNC
   The localStorage cache lets the app render instantly; Firestore
   is the real source of truth so data survives app updates,
   cache clears, and works across devices.
   =========================================================== */
let fbDb=null;
let fbReady=false;
let fbSaveTimer=null;
let fbSyncStatus='connecting';
let fbIgnoreSnapshotsUntil=0; // timestamp — ignore all snapshots before this time
let fbHasReceivedFirstSnapshot=false;
let fbLastErrorMessage='';
let fbInitAttempts=0;

function initFirebaseWithRetry(){
  if(typeof firebase==='undefined'&&fbInitAttempts<6){
    fbInitAttempts++;
    setTimeout(initFirebaseWithRetry,600);
    return;
  }
  if(typeof firebase==='undefined'){
    fbSyncStatus='offline';
    updateSyncBadge();
    return;
  }
  initFirebase();
}

function initFirebase(){
  if(typeof firebase==='undefined'){fbSyncStatus='offline';updateSyncBadge();return;}
  try{
    const firebaseConfig={
      apiKey:"AIzaSyA5Q5MYehtJAU18ixZLvqS4-gQnNJJD3LI",
      authDomain:"agenciaseduct-8fd34.firebaseapp.com",
      projectId:"agenciaseduct-8fd34",
      storageBucket:"agenciaseduct-8fd34.firebasestorage.app",
      messagingSenderId:"232929088781",
      appId:"1:232929088781:web:b278bd92bf9bdc857e4c44"
    };
    const app=firebase.apps&&firebase.apps.length?firebase.app():firebase.initializeApp(firebaseConfig);
    fbDb=firebase.firestore();
    fbReady=true;
    // Timeout: if no response in 8s, give up silently
    const t=setTimeout(()=>{
      if(fbSyncStatus!=='online'){fbSyncStatus='offline';updateSyncBadge();}
    },8000);
    listenToFirestore(t);
  }catch(e){
    fbSyncStatus='offline';
    updateSyncBadge();
  }
}

function listenToFirestore(connectTimeout){
  if(!fbDb)return;
  fbDb.collection('gestorpro').doc(FIREBASE_DOC_ID).onSnapshot(
    (doc)=>{
      if(connectTimeout)clearTimeout(connectTimeout);
      if(Date.now()<fbIgnoreSnapshotsUntil){
        fbHasReceivedFirstSnapshot=true;
        fbSyncStatus='online';updateSyncBadge();
        return;
      }
      if(doc.exists){
        const remote=doc.data();
        if(remote&&remote.payload){
          try{
            const parsed=JSON.parse(remote.payload);
            const migrated=migrateState(parsed);
            const CRITICAL_ARRAYS=['chatters','shifts','absences','orientations','studies','models','chatterTrainings'];
            const safeParsed={...migrated};
            CRITICAL_ARRAYS.forEach(key=>{
              if(Array.isArray(safeParsed[key])&&safeParsed[key].length===0&&Array.isArray(S[key])&&S[key].length>0){
                delete safeParsed[key];
              }
            });
            S={...S,...safeParsed};
            try{localStorage.setItem(DB,JSON.stringify(S));}catch(e){}
            const active=document.activeElement;
            const isTyping=active&&(active.tagName==='INPUT'||active.tagName==='TEXTAREA'||active.tagName==='SELECT');
            if(isTyping){
              const rerenderOnBlur=()=>{renderView(currentViewName());active.removeEventListener('blur',rerenderOnBlur);};
              active.addEventListener('blur',rerenderOnBlur,{once:true});
            } else {
              renderView(currentViewName());
            }
          }catch(e){}
        }
      } else if(!fbHasReceivedFirstSnapshot){
        pushToFirestore();
      }
      fbHasReceivedFirstSnapshot=true;
      fbSyncStatus='online';
      updateSyncBadge();
      runAutoBackupIfNeeded();
    },
    (err)=>{
      if(connectTimeout)clearTimeout(connectTimeout);
      fbSyncStatus='offline';
      updateSyncBadge();
    }
  );
}

function pushToFirestore(){
  if(!fbDb||!fbReady)return;
  fbDb.collection('gestorpro').doc(FIREBASE_DOC_ID).set({
    payload:JSON.stringify(S),
    schemaVersion:SCHEMA_VERSION,
    updatedAt:firebase.firestore.FieldValue.serverTimestamp()
  }).then(()=>{
    fbSyncStatus='online';updateSyncBadge();
  }).catch((err)=>{
    console.error('Firestore write error',err);
    fbSyncStatus='offline';
    fbLastErrorMessage=(err&&err.code)?`${err.code}: ${err.message||''}`:'Erro ao salvar';
    updateSyncBadge();
  });
}

function updateSyncBadge(){
  const el=document.getElementById('sync-badge');
  if(!el)return;
  const map={
    connecting:{txt:'⏳ conectando',cls:'pill-flat'},
    online:{txt:'☁ sincronizado',cls:'pill-ok'},
    offline:{txt:'💾 local',cls:'pill-flat'},
    error:{txt:'💾 local',cls:'pill-flat'}
  };
  const s=map[fbSyncStatus]||map.offline;
  el.textContent=s.txt;
  el.className='pill '+s.cls;
  el.style.cursor='pointer';
  el.onclick=function(){
    if(fbSyncStatus==='online'){
      toast('☁ Sincronizado com Firebase');
    } else {
      toast('Tentando reconectar…');
      fbInitAttempts=0;
      initFirebaseWithRetry();
    }
  };
}
function currentViewName(){
  const active=document.querySelector('.view.active');
  return active?active.id.replace('v-',''):'home';
}

function save(){
  try{localStorage.setItem(DB,JSON.stringify(S));}catch(e){}
  // Protect local state for 3 seconds after any save — blocks incoming
  // snapshots from overwriting fresh checkins/entries before they reach Firebase.
  fbIgnoreSnapshotsUntil=Date.now()+3000;
  clearTimeout(fbSaveTimer);
  fbSaveTimer=setTimeout(()=>pushToFirestore(),600);
}
function load(){
  try{
    const d=localStorage.getItem(DB);
    if(d){
      const parsed=JSON.parse(d);
      S={...S,...migrateState(parsed)};
    }
  }catch(e){}
}
let S={
  chatters:[],shifts:[],absences:[],orientations:[],studies:[],revenues:{},models:[],
  quickNotes:[],lastCode:null,
  turnoLog:{},          // date -> [{chatterId, action, time, note, otEnd}]
  midnightTasks:{},     // date -> [{id, chatterId, label, done}]
  dailyTasks:{},        // date -> [{id, text, prio, done}]
  weekGoals:{},         // weekKey -> [{id, text, type, target, current, done}]
  chatterWeekGoals:{},  // weekKey -> {chatterId: targetValue}
  weekNotes:{},         // weekKey -> text
  watchAlerts:{},       // date -> {chatterId: 'pending'|'confirmed'|'missed'}
  chatterTrainings:[],  // [{id, chatterId, title, done, createdAt}]
  hasSeededStudies:false,
  folgas:{},             // date -> [chatterId, ...] — manual day-off registrations
  reportDrafts:{},        // weekKey -> {field: value} — manual fields of weekly report
  smartAlertsDone:{},    // dateKey -> [alertId, ...]
  alertNotes:{},         // 'date_alertId' -> text
  horaExtraSlots:{},     // weekKey -> [{...}]
  swaps:[],              // [{id, date, covererId, originalId, ...}]
  morningRoutine:[],     // [{id, text, done}] — repeats daily
  problemsToday:{},      // dateKey -> [{id, text, done}]
  demandas:{},           // dateKey -> [{id, text, done}]
  trainings:[],          // [{id, title, date, days:[{day, script}]}]
  weekEvolutions:{},     // weekKey -> [{id, label, done, missed}]
  modelRequests:{},      // weekKey -> [{id, text}]
  weekPrize:{},          // weekKey -> {goal, winner, prize}
  motivational:{},       // weekKey -> {idea, chatters:{id:{issue, help}}}
  scheduleRequests:{},   // weekKey -> [{id, chatterId, text}]
  chatterFichas:{},      // chatterId -> {tech, behavior, potential, risk, history}
  estudosDraft:{},       // {fortes1,fortes2,fortes3,fracos1,fracos2,fracos3,foco1,foco2,foco3}
  estudosHistory:[],     // [{date, ...draft}] — snapshots
  managerProfile:{},     // {name, cargo, photoUrl}
  motivacionalHome:{},   // weekKey -> {idea, results}
  chatAnalyses:{},       // dateKey -> [{id, chatterId, ...scores, pontosFracos, pontosFortes}]
  semanaObjetivos:{},    // weekKey -> [{id, label, valor, done}]
  modelRequestsSplit:{}, // weekKey -> {modelId: text}
  demandas2:{},          // dateKey -> [{id,text,date,done}]  (new demandas with date)
};

/* ===========================================================
   AUTOMATIC BACKUP — saves a daily snapshot to Firebase under
   gestorpro/backup-{dateKey} once per day. No manual action
   needed. The home screen shows when the last backup ran.
   =========================================================== */
let lastAutoBackupDate='';

function runAutoBackupIfNeeded(){
  if(!fbDb||!fbReady)return;
  const today=todayKey();
  if(lastAutoBackupDate===today)return;
  lastAutoBackupDate=today;
  fbDb.collection('gestorpro').doc(`backup-${today}`).set({
    payload:JSON.stringify(S),
    createdAt:firebase.firestore.FieldValue.serverTimestamp(),
    schemaVersion:SCHEMA_VERSION
  }).then(()=>{
    updateBackupStatus(`Último backup: hoje às ${nowHHMM()}`,'pill-ok');
  }).catch(err=>{
    console.error('Auto backup failed',err);
    updateBackupStatus('Backup falhou — dados principais no Firebase','pill-warn');
  });
}
function updateBackupStatus(msg,pillClass){
  const lb=document.getElementById('backup-status-lb');
  const pill=document.getElementById('backup-status-pill');
  if(lb)lb.textContent=msg;
  if(pill)pill.className='pill '+(pillClass||'pill-ok');
}

const DAYS=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const MONTHS=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const DAY_KEYS=['dom','seg','ter','qua','qui','sex','sab'];
const LVLCLASS={treinamento:'lvl-treinamento',teste:'lvl-teste',junior:'lvl-junior',pleno:'lvl-pleno',senior:'lvl-senior'};
const LVLEMOJI={treinamento:'◆',teste:'○',junior:'▲',pleno:'●',senior:'★'};

// ---------- HELPERS ----------
function p2(n){return String(n).padStart(2,'0');}
function fmt(d){return`${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;}
function nowHHMM(){const n=new Date();return p2(n.getHours())+':'+p2(n.getMinutes());}
function todayKey(){return fmt(new Date());}
function getTodayDayKey(){return DAY_KEYS[new Date().getDay()];}
function getWeekDates(){
  const now=new Date(),dow=now.getDay();
  const mon=new Date(now);mon.setDate(now.getDate()-((dow+6)%7));
  return Array.from({length:7},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return d;});
}
function getWeekKey(){const wd=getWeekDates();return fmt(wd[0]);}
function money(n){return 'R$ '+ (n||0).toLocaleString('pt-BR',{minimumFractionDigits:2});}
function moneyShort(n){return 'R$'+(n||0).toLocaleString('pt-BR',{maximumFractionDigits:0});}

// ---------- NAV ----------
const VIEWS=['home','turno','semana','time','fat','report','extra','teamreports','gestao','fichas','estudos','evolucao'];
function navTo(view){
  if(!view)return;
  VIEWS.forEach(v=>{const el=document.getElementById('v-'+v);if(el)el.classList.remove('active');});
  const target=document.getElementById('v-'+view);
  if(target)target.classList.add('active');
  document.querySelectorAll('.toptab').forEach(t=>t.classList.toggle('active',t.dataset.go===view));
  document.querySelectorAll('.navbtn').forEach(t=>t.classList.toggle('active',t.dataset.go===view));
  renderView(view);
}
function renderView(v){
  if(v==='home')renderHome();
  if(v==='turno')renderTurno();
  if(v==='semana')renderSemana();
  if(v==='time')renderTeam('all');
  if(v==='fat')renderFat();
  if(v==='report')renderReport_Weekly();
  if(v==='extra')renderExtra();
  if(v==='teamreports')renderTeamReports();
  if(v==='gestao')renderGestao();
  if(v==='fichas')renderFichas();
  if(v==='estudos')renderEstudos();
  if(v==='evolucao')renderEvolucao();
}
document.querySelectorAll('.toptab,.navbtn').forEach(el=>el.addEventListener('click',()=>navTo(el.dataset.go)));

// ---------- MODAL ----------
function openModal(id){
  document.getElementById(id).classList.add('open');
  if(['m-shift','m-absence','m-orient','m-overtime'].includes(id))populateChatterSelects();
  if(id==='m-swap')initSwapModal();
  if(id==='m-manual-status')openManualStatusModal();
  if(id==='m-shift'){
    populateShiftModelChips();
    if(!document.getElementById('shift-edit-id').value){
      document.getElementById('shift-modal-title').textContent='Escalar chatter';
      document.getElementById('shift-start').value='';
      document.getElementById('shift-end').value='';
      document.getElementById('shift-start2').value='';
      document.getElementById('shift-end2').value='';
      document.querySelectorAll('#m-shift .chip[data-day]').forEach(c=>c.classList.remove('sel'));
      document.querySelectorAll('#m-shift .chip-folga').forEach(c=>c.classList.remove('sel'));
      // Default folga chip = "Nenhum"
      const noneChip=document.querySelector('#m-shift .chip-folga[data-folga=""]');
      if(noneChip)noneChip.classList.add('sel');
    }
    // Folga chips: single-select behavior
    document.querySelectorAll('#m-shift .chip-folga').forEach(chip=>{
      chip.onclick=()=>{
        document.querySelectorAll('#m-shift .chip-folga').forEach(c=>c.classList.remove('sel'));
        chip.classList.add('sel');
      };
    });
  }
  if(id==='m-overtime'){document.getElementById('ot-date').value=todayKey();document.getElementById('ot-start').value=nowHHMM();}
  if(id==='m-revreport')buildRevReport();
  if(id==='m-goal'){document.getElementById('goal-text').value='';document.getElementById('goal-target').value='';}
}
function populateShiftModelChips(){
  const el=document.getElementById('shift-model-chips');
  const note=document.getElementById('shift-model-empty-note');
  if(!S.models.length){
    el.innerHTML='';
    note.textContent='Nenhum modelo cadastrado ainda — cadastre na aba Faturamento.';
    return;
  }
  note.textContent='';
  el.innerHTML=S.models.map(m=>`<button class="chip" data-model="${m.id}">${m.emoji||'🧩'} ${m.name}</button>`).join('');
  el.querySelectorAll('.chip').forEach(chip=>chip.addEventListener('click',()=>chip.classList.toggle('sel')));
}
function closeModal(id){
  document.getElementById(id).classList.remove('open');
  if(id==='m-shift'){
    document.getElementById('shift-edit-id').value='';
    document.getElementById('shift-modal-title').textContent='Escalar chatter';
    document.getElementById('shift-start2').value='';
    document.getElementById('shift-end2').value='';
    document.querySelectorAll('#m-shift .chip-folga').forEach(c=>c.classList.remove('sel'));
    const noneChip=document.querySelector('#m-shift .chip-folga[data-folga=""]');
    if(noneChip)noneChip.classList.add('sel');
  }
}
document.querySelectorAll('.modalbg').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open');}));
function toggleGoalTarget(){
  const t=document.getElementById('goal-type').value;
  document.getElementById('goal-target-field').style.display=t==='valor'?'block':'none';
}

// ---------- TOAST ----------
function toast(msg,dur=2300){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),dur);}

// ---------- CLOCK ----------
function updateClock(){
  const now=new Date();
  document.getElementById('hd-clock').textContent=`${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`;
  document.getElementById('hd-date').textContent=`${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`;
  updateAlarmCountdown();
  checkMidnightGeneration();
  checkLoginWatch();
  updateNavDots();
  // Refresh escritório every minute — schedule-based status changes on the minute
  if(now.getSeconds()===0){
    renderEscritorioPanel();
    renderSmartAlerts();
  }
}

// ---------- NAV DOTS (pending indicators) ----------
function updateNavDots(){
  const yest=new Date();yest.setDate(yest.getDate()-1);
  const ykey=fmt(yest);
  const watchPending=Object.values(S.watchAlerts[todayKey()]||{}).filter(s=>s==='pending').length;
  const dot=document.getElementById('nav-dot-turno');
  if(dot)dot.style.display=(watchPending>0)?'block':'none';
}

/* ===========================================================
   FEATURE 1 — LOGIN WATCH ALARM (per-chatter)
   For each chatter with a configured watchtime, fires an
   internal alarm at that time reminding the manager to check
   whether the chatter actually logged in.
   =========================================================== */
let watchFiredToday=new Set(); // chatterIds already alerted today (in-memory, resets on reload but date-keyed below avoids dup via state)

function checkLoginWatch(){
  const today=todayKey();
  const now=new Date();
  const nowMinutes=now.getHours()*60+now.getMinutes();
  if(!S.watchAlerts[today])S.watchAlerts[today]={};
  S.chatters.forEach(c=>{
    if(!c.watchtime)return;
    const[wh,wm]=c.watchtime.split(':').map(Number);
    const watchMinutes=wh*60+wm;
    // Fire if we're at or up to 10 minutes past the configured time — covers
    // the case where the app wasn't open at the exact minute the alarm was due.
    const withinWindow=nowMinutes>=watchMinutes&&nowMinutes<=watchMinutes+10;
    if(withinWindow){
      const already=S.watchAlerts[today][c.id];
      if(!already){
        S.watchAlerts[today][c.id]='pending';
        save();
        toast(`⏰ Checar entrada de ${c.name} (esperado ${c.watchtime})`,6000);
        renderHome();
      }
    }
  });
}

function getWatchAlertsToday(){
  const today=todayKey();
  const map=S.watchAlerts[today]||{};
  return Object.entries(map).filter(([id,status])=>status==='pending').map(([id])=>S.chatters.find(c=>c.id===id)).filter(Boolean);
}

function confirmWatch(chatterId,status){
  const today=todayKey();
  if(!S.watchAlerts[today])S.watchAlerts[today]={};
  S.watchAlerts[today][chatterId]=status;
  save();
  renderHome();
  const c=S.chatters.find(ch=>ch.id===chatterId);
  toast(status==='confirmed'?`✅ ${c?c.name:'?'} confirmado online`:`⚠️ ${c?c.name:'?'} marcado como atraso`);
  if(status==='missed'){
    // also helpful: prefill absence quick log as atraso
  }
}

function renderWatchBanner(){
  const wrap=document.getElementById('home-watch-wrap');
  if(!wrap)return;
  const pending=getWatchAlertsToday();
  if(!pending.length){wrap.innerHTML='';return;}
  wrap.innerHTML=`<div class="watchbanner">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:9px">
      <span style="font-size:16px">⏰</span><span style="font-weight:700;font-size:13.5px;color:var(--bad)">Checagem de entrada</span>
    </div>
    ${pending.map(c=>{
      const color=getComputedLevelColor(c.level);
      return`<div class="watchitem">
        <div style="flex:1"><span style="font-weight:700;font-size:13px">${c.name}</span>
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--text2);margin-left:6px">esperado ${c.watchtime}</span></div>
        <button class="btn btn-primary btn-xs" onclick="confirmWatch('${c.id}','confirmed')">✓ Entrou</button>
        <button class="btn btn-danger btn-xs" onclick="confirmWatch('${c.id}','missed')">✕ Não entrou</button>
      </div>`;
    }).join('')}
  </div>`;
}
function getComputedLevelColor(level){
  const map={treinamento:'#6E6AF0',teste:'#8A8A93',junior:'#2F8FE0',pleno:'#C98A1F',senior:'#1F9E6E'};
  return map[level]||'#8A8A93';
}

/* ===========================================================
   FEATURE 2 — DAILY TASKS (general checklist, not chatter-bound)
   =========================================================== */
function renderDailyTasks(){
  const el=document.getElementById('daily-tasks-list');
  if(!el)return; // element removed — tasks now managed in Gestão
  const tasks=S.dailyTasks[today]||[];
  if(!tasks.length){el.innerHTML='<div class="empty"><div class="empty-ic">✅</div><div class="empty-tx">Nenhuma tarefa para hoje.<br>Adicione itens da sua rotina de gestão.</div></div>';return;}
  const pb={alta:'pill-bad',media:'pill-warn',baixa:'pill-flat'};
  el.innerHTML='<div class="tasklist">'+tasks.map(t=>`
    <div class="taskrow ${t.done?'done':''}">
      <div class="tcheck ${t.done?'done':''}" onclick="toggleTask('${t.id}')">${t.done?'✓':''}</div>
      <div class="tbody">
        <div class="ttext">${t.text}</div>
        <div class="tmeta-row"><span class="pill ${pb[t.prio]||'pill-flat'}">${t.prio}</span></div>
      </div>
      <button class="btn btn-icon btn-line" onclick="deleteTask('${t.id}')" style="font-size:14px">✕</button>
    </div>`).join('')+'</div>';
}
function saveTask(){
  const text=document.getElementById('task-text').value.trim();
  if(!text){toast('⚠️ Escreva a tarefa');return;}
  const today=todayKey();
  if(!S.dailyTasks[today])S.dailyTasks[today]=[];
  S.dailyTasks[today].push({id:'dt'+Date.now(),text,prio:document.getElementById('task-prio').value,done:false});
  save();closeModal('m-task');document.getElementById('task-text').value='';
  toast('✅ Tarefa adicionada!');renderDailyTasks();updateNavDots();
}
function toggleTask(id){
  const today=todayKey();
  const t=(S.dailyTasks[today]||[]).find(x=>x.id===id);
  if(t){t.done=!t.done;save();renderDailyTasks();updateNavDots();}
}
function deleteTask(id){
  const today=todayKey();
  S.dailyTasks[today]=(S.dailyTasks[today]||[]).filter(x=>x.id!==id);
  save();renderDailyTasks();toast('Removida');
}

/* ===========================================================
   FEATURE 3 — WEEKLY GOALS (team-level planning)
   =========================================================== */
function renderSemana(){
  const wk=getWeekDates();
  document.getElementById('semana-range').textContent=`${wk[0].getDate()}/${wk[0].getMonth()+1} – ${wk[6].getDate()}/${wk[6].getMonth()+1}`;
  document.getElementById('week-notes').value=S.weekNotes[getWeekKey()]||'';
  renderGoals();
  renderSemanaRevenue();
}
function renderGoals(){
  const el=document.getElementById('goals-list');
  const wkey=getWeekKey();
  const goals=S.weekGoals[wkey]||[];
  if(!goals.length){el.innerHTML='<div class="empty"><div class="empty-ic">🎯</div><div class="empty-tx">Nenhum objetivo definido para esta semana.<br>Defina metas para guiar o time.</div></div>';return;}
  el.innerHTML=goals.map(g=>{
    if(g.type==='simples'){
      return`<div class="goalcard ${g.done?'met':''}">
        <div class="goal-top">
          <div class="goal-text" style="${g.done?'text-decoration:line-through;color:var(--text3)':''}">${g.text}</div>
          <button class="tcheck ${g.done?'done':''}" onclick="toggleGoalDone('${g.id}')">${g.done?'✓':''}</button>
        </div>
        <button class="btn btn-icon btn-line" style="margin-top:4px" onclick="deleteGoal('${g.id}')">✕</button>
      </div>`;
    }
    const pct=g.target>0?Math.min(100,Math.round((g.current/g.target)*100)):0;
    const met=pct>=100;
    return`<div class="goalcard ${met?'met':''}">
      <div class="goal-top">
        <div class="goal-text">${g.text}</div>
        <button class="btn btn-icon btn-line" onclick="deleteGoal('${g.id}')">✕</button>
      </div>
      <div class="goalbar-track"><div class="goalbar-fill" style="width:${pct}%"></div></div>
      <div class="goal-nums">
        <span>${g.current.toLocaleString('pt-BR')} / ${g.target.toLocaleString('pt-BR')}</span>
        <span style="color:${met?'var(--ok)':'var(--warn)'}">${pct}%</span>
      </div>
      <div style="display:flex;gap:6px;margin-top:9px">
        <input type="number" class="finput" style="flex:1" id="goal-update-${g.id}" placeholder="Atualizar valor atual...">
        <button class="btn btn-soft btn-sm" onclick="updateGoalProgress('${g.id}')">Atualizar</button>
      </div>
    </div>`;
  }).join('');
}
function saveGoal(){
  const text=document.getElementById('goal-text').value.trim();
  if(!text){toast('⚠️ Descreva o objetivo');return;}
  const type=document.getElementById('goal-type').value;
  const target=parseFloat(document.getElementById('goal-target').value)||0;
  const wkey=getWeekKey();
  if(!S.weekGoals[wkey])S.weekGoals[wkey]=[];
  S.weekGoals[wkey].push({id:'g'+Date.now(),text,type,target,current:0,done:false});
  save();closeModal('m-goal');toast('🎯 Objetivo adicionado!');renderGoals();
}
function toggleGoalDone(id){
  const wkey=getWeekKey();
  const g=(S.weekGoals[wkey]||[]).find(x=>x.id===id);
  if(g){g.done=!g.done;save();renderGoals();}
}
function updateGoalProgress(id){
  const wkey=getWeekKey();
  const g=(S.weekGoals[wkey]||[]).find(x=>x.id===id);
  const val=parseFloat(document.getElementById('goal-update-'+id)?.value);
  if(g&&!isNaN(val)){g.current=val;save();toast('📈 Progresso atualizado!');renderGoals();}
}
function deleteGoal(id){
  const wkey=getWeekKey();
  S.weekGoals[wkey]=(S.weekGoals[wkey]||[]).filter(x=>x.id!==id);
  save();renderGoals();toast('Removido');
}
function saveWeekNotes(){
  S.weekNotes[getWeekKey()]=document.getElementById('week-notes').value;
  save();toast('📝 Notas salvas!');
}
function renderSemanaRevenue(){
  const el=document.getElementById('semana-revenue-preview');
  const wd=getWeekDates();
  let total=0;
  wd.forEach(d=>S.chatters.forEach(c=>S.models.forEach(m=>{total+=parseFloat(S.revenues[`${c.id}_${m.id}_${fmt(d)}`])||0;})));
  el.innerHTML=`<div style="font-family:var(--font-mono);font-size:30px;font-weight:700;color:var(--ok);text-align:center;padding:8px 0">${money(total)}</div>
  <div class="barchart">${['SEG','TER','QUA','QUI','SEX','SÁB','DOM'].map((lb,i)=>{
    let r=0;S.chatters.forEach(c=>S.models.forEach(m=>{r+=parseFloat(S.revenues[`${c.id}_${m.id}_${fmt(wd[i])}`])||0;}));
    const max=Math.max(...wd.map(dd=>{let rr=0;S.chatters.forEach(c=>S.models.forEach(m=>{rr+=parseFloat(S.revenues[`${c.id}_${m.id}_${fmt(dd)}`])||0;}));return rr;}),1);
    const h=Math.max(3,Math.round((r/max)*46));
    return`<div class="barcol"><div class="barfill" style="height:${h}px"></div><div class="barlb">${lb}</div></div>`;
  }).join('')}</div>`;
}

/* ===========================================================
   MIDNIGHT TASKS (existing feature, kept)
   =========================================================== */
function generateMidnightTasks(dateKey){
  if(S.midnightTasks[dateKey])return;
  const worked=getChattersThatWorkedOn(dateKey);
  if(!worked.length)return;
  S.midnightTasks[dateKey]=worked.map((cid,i)=>{
    const c=S.chatters.find(ch=>ch.id===cid);
    return{id:`mt${Date.now()}${i}${Math.random().toString(36).slice(2,6)}`,chatterId:cid,label:`Relatório: ${c?c.name:'?'}`,done:false};
  });
  save();
}
function getChattersThatWorkedOn(dateKey){
  const log=S.turnoLog[dateKey]||[];
  const ids=new Set();
  log.filter(e=>e.action==='in').forEach(e=>ids.add(e.chatterId));
  const dow=new Date(dateKey+'T12:00:00').getDay();
  const dk=DAY_KEYS[dow];
  S.shifts.filter(s=>s.days&&s.days.includes(dk)).forEach(s=>ids.add(s.chatterId));
  return Array.from(ids).filter(id=>S.chatters.find(c=>c.id===id));
}
function checkMidnightGeneration(){
  // Generate retroactively for yesterday and today regardless of what time
  // the app happens to be open — generateMidnightTasks() is itself a no-op
  // if tasks already exist for that date, so this is safe to call every tick.
  const now=new Date();
  const yest=new Date(now);yest.setDate(yest.getDate()-1);
  generateMidnightTasks(fmt(yest));
  generateMidnightTasks(fmt(now));
  runAutoBackupIfNeeded();
}
function renderMidnightPreviewHome(){
  const yest=new Date();yest.setDate(yest.getDate()-1);
  const key=fmt(yest);
  const tasks=S.midnightTasks[key]||[];
  const pending=tasks.filter(t=>!t.done).length;
  const panel=document.getElementById('home-midnight-panel');
  if(!panel)return;
  if(pending>0){
    panel.style.display='block';
    const prev=document.getElementById('home-midnight-preview');
    if(prev)prev.innerHTML=tasks.filter(t=>!t.done).slice(0,3).map(t=>`
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line)">
        <div style="width:7px;height:7px;border-radius:50%;background:var(--warn)"></div>
        <span style="font-size:12.5px">${t.label}</span>
      </div>`).join('');
  } else panel.style.display='none';
}
function renderMidnightList(){
  const el=document.getElementById('midnight-list');
  const badge=document.getElementById('midnight-badge');
  const today=todayKey();
  const yest=new Date();yest.setDate(yest.getDate()-1);const yestKey=fmt(yest);
  let all=[];
  [yestKey,today].forEach(dk=>{(S.midnightTasks[dk]||[]).forEach(t=>all.push({...t,dateKey:dk}));});
  const pending=all.filter(t=>!t.done).length;
  badge.textContent=`${pending} pendentes`;
  badge.className='pill '+(pending>0?'pill-warn':'pill-ok');
  if(!all.length){el.innerHTML='<div class="empty"><div class="empty-tx">Tarefas de relatório aparecem aqui à 00h com os chatters que trabalharam.</div></div>';return;}
  el.innerHTML='<div class="tasklist">'+all.map(t=>{
    const ot=getChatterOvertimeOn(t.chatterId,t.dateKey);
    return`<div class="taskrow ${t.done?'done':''}">
      <div class="tcheck ${t.done?'done':''}" onclick="toggleMidnight('${t.dateKey}','${t.id}')">${t.done?'✓':''}</div>
      <div class="tbody"><div class="ttext">${t.label}</div>
      <div class="tmeta-row"><span class="pill pill-flat">${t.dateKey}</span>${ot>0?`<span class="pill pill-warn">⏱ ${ot}min extra</span>`:''}</div></div>
      ${t.done?'<span class="pill pill-ok">enviado</span>':'<span class="pill pill-warn">pendente</span>'}
    </div>`;
  }).join('')+'</div>';
}
function toggleMidnight(dateKey,id){
  const t=(S.midnightTasks[dateKey]||[]).find(x=>x.id===id);
  if(t){t.done=!t.done;save();renderMidnightList();renderMidnightPreviewHome();updateNavDots();toast(t.done?'✅ Marcado como enviado!':'↩ Desmarcado');}
}

/* ===========================================================
   HOME
   =========================================================== */
/* ===========================================================
   FOLGAS — manual day-off registrations.
   A panel appears on the home screen after 22h showing who
   is off tomorrow, so the manager can plan extra coverage.
   =========================================================== */
function getTomorrowKey(){
  const d=new Date();d.setDate(d.getDate()+1);return fmt(d);
}
function getFolgasForDate(dateKey){
  return(S.folgas[dateKey]||[]).map(id=>S.chatters.find(c=>c.id===id)).filter(Boolean);
}
function toggleFolga(chatterId,dateKey){
  if(!S.folgas[dateKey])S.folgas[dateKey]=[];
  const idx=S.folgas[dateKey].indexOf(chatterId);
  if(idx===-1)S.folgas[dateKey].push(chatterId);
  else S.folgas[dateKey].splice(idx,1);
  save();renderFolgaPanel();
}
function isFolgaActive(){
  // Show the panel from 22h of today until end of tomorrow
  const now=new Date();
  return now.getHours()>=22||now.getHours()<6;
}
function renderFolgaPanel(){
  const panel=document.getElementById('home-folga-panel');
  if(!panel)return;
  const el=document.getElementById('home-folga-content');
  if(!panel||!el)return;
  const tomorrow=getTomorrowKey();
  const tomorrowDate=new Date();tomorrowDate.setDate(tomorrowDate.getDate()+1);
  const dayName=DAYS[tomorrowDate.getDay()];
  const folgasAmanha=S.folgas[tomorrow]||[];
  // Show if it's after 22h OR if there are folgas registered for tomorrow
  const shouldShow=isFolgaActive()||folgasAmanha.length>0;
  if(!shouldShow||!S.chatters.length){panel.style.display='none';return;}
  panel.style.display='block';
  const chattersOff=getFolgasForDate(tomorrow);
  const chattersOn=S.chatters.filter(c=>!folgasAmanha.includes(c.id));
  el.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <span style="font-size:20px">🌙</span>
      <div>
        <div style="font-weight:700;font-size:14px">Folgas de amanhã · ${dayName}</div>
        <div style="font-size:11.5px;color:var(--text2)">Programe as janelas de hora extra</div>
      </div>
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:7px">Marcar de folga amanhã</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
      ${S.chatters.map(c=>{
        const onFolga=folgasAmanha.includes(c.id);
        const color=getComputedLevelColor(c.level);
        return`<button onclick="toggleFolga('${c.id}','${tomorrow}')" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;border:1.5px solid ${onFolga?'var(--bad)':'var(--line)'};background:${onFolga?'var(--bad-soft)':'var(--bg-soft)'};cursor:pointer;font-family:var(--font-display);font-size:12.5px;font-weight:${onFolga?'700':'500'};color:${onFolga?'var(--bad)':'var(--text2)'}">
          ${onFolga?'🏖️':''}${c.name}
        </button>`;
      }).join('')}
    </div>
    ${chattersOff.length?`
      <div style="background:var(--bad-soft);border:1px solid rgba(180,35,52,.2);border-radius:10px;padding:11px 13px">
        <div style="font-size:11px;font-weight:700;color:var(--bad);text-transform:uppercase;letter-spacing:.04em;margin-bottom:7px">⛱ De folga amanhã (${chattersOff.length})</div>
        ${chattersOff.map(c=>`<div style="font-size:13px;font-weight:600;color:var(--text);padding:3px 0">${c.name} <span style="font-size:11px;color:var(--text3)">${c.level}</span></div>`).join('')}
      </div>
      ${chattersOn.length?`<div style="margin-top:9px;background:var(--ok-soft);border:1px solid rgba(23,115,80,.2);border-radius:10px;padding:11px 13px">
        <div style="font-size:11px;font-weight:700;color:var(--ok);text-transform:uppercase;letter-spacing:.04em;margin-bottom:7px">✅ Disponíveis amanhã (${chattersOn.length})</div>
        ${chattersOn.map(c=>`<div style="font-size:13px;font-weight:600;color:var(--text);padding:3px 0">${c.name} <span style="font-size:11px;color:var(--text3)">${c.level}</span></div>`).join('')}
      </div>`:''}
    `:'<div style="font-size:12.5px;color:var(--text3);text-align:center;padding:8px 0">Nenhuma folga marcada para amanhã</div>'}
  `;
}

/* ===========================================================
   SMART ALERTS — cross-reference all data and surface what
   needs the manager's attention right now.
   =========================================================== */
function getSmartAlerts(){
  const alerts=[];
  const today=todayKey();
  const now=new Date();
  const todayDayKey=getTodayDayKey();
  const wd=getWeekDates();
  const wkStart=fmt(wd[0]),wkEnd=fmt(wd[6]);
  const wkey=getWeekKey();
  const goals=S.chatterWeekGoals[wkey]||{};
  const daysLeft=getDaysRemainingInWeek();

  S.chatters.forEach(c=>{
    const id=c.id;

    // --- PERFORMANCE ---
    const target=parseFloat(goals[id])||0;
    const current=getChatterWeekRevenue(id);

    if(target>0){
      const pct=current/target;
      const remaining=target-current;
      const perDay=daysLeft>0?remaining/daysLeft:remaining;

      if(remaining<=0){
        alerts.push({id:`ok-${id}-metabatida`,type:'info',icon:'🎯',
          title:`${c.name} bateu a meta da semana!`,
          body:`Faturou ${moneyShort(current)} de ${moneyShort(target)} (${Math.round(pct*100)}%). Considere um desafio maior.`,
          chatterId:id,priority:4});
      } else if(daysLeft<=3){
        const urgency=daysLeft<=2?'bad':'warn';
        const emoji=daysLeft<=2?'🔴':'⚠️';
        alerts.push({id:`${urgency}-${id}-meta3d`,type:urgency,icon:emoji,
          title:`${c.name} — ${Math.round(pct*100)}% da meta (${daysLeft}d restantes)`,
          body:`Falta ${moneyShort(remaining)}. Precisa fazer ${moneyShort(perDay)}/dia.`,
          chatterId:id,priority:daysLeft<=2?1:2});
      } else if(daysLeft<=5&&pct<0.4){
        alerts.push({id:`warn-${id}-metalong`,type:'warn',icon:'📉',
          title:`${c.name} longe da meta`,
          body:`${Math.round(pct*100)}% atingido (${moneyShort(current)} de ${moneyShort(target)}). Falta ${moneyShort(remaining)} em ${daysLeft} dias.`,
          chatterId:id,priority:2});
      }
    }

    // Trabalhou/escalado hoje mas sem faturamento após 18h
    const trabalhouHoje=(S.turnoLog[today]||[]).some(e=>e.chatterId===id&&e.action==='in');
    const escaladoHoje=S.shifts.some(s=>s.chatterId===id&&s.days&&s.days.includes(todayDayKey));
    const temFaturamento=S.models.some(m=>(parseFloat(S.revenues[`${id}_${m.id}_${today}`])||0)>0);
    if((trabalhouHoje||escaladoHoje)&&!temFaturamento&&S.models.length>0&&now.getHours()>=18){
      alerts.push({id:`warn-${id}-semfat`,type:'warn',icon:'💰',
        title:`Faturamento de ${c.name} não lançado`,
        body:`Trabalhou hoje mas sem faturamento registrado ainda.`,
        chatterId:id,priority:2});
    }

    // --- PRESENÇA ---
    const weekAbsences=S.absences.filter(a=>a.chatterId===id&&a.date>=wkStart&&a.date<=wkEnd);
    const faltas=weekAbsences.filter(a=>a.type==='falta').length;
    const atrasos=weekAbsences.filter(a=>a.type==='atraso').length;
    if(faltas>=2){
      alerts.push({id:`bad-${id}-faltas`,type:'bad',icon:'🚨',
        title:`${c.name} com ${faltas} faltas esta semana`,
        body:`Requer atenção imediata. Considere uma conversa.`,
        chatterId:id,priority:1});
    } else if(faltas===1&&atrasos>=2){
      alerts.push({id:`warn-${id}-ocorrencias`,type:'warn',icon:'⚠️',
        title:`${c.name} com ocorrências repetidas`,
        body:`1 falta + ${atrasos} atrasos esta semana.`,
        chatterId:id,priority:2});
    }

    // Hora extra excessiva na semana
    let totalOT=0;
    wd.forEach(d=>totalOT+=getChatterOvertimeOn(id,fmt(d)));
    if(totalOT>=120){
      alerts.push({id:`info-${id}-horaextra`,type:'info',icon:'⏱️',
        title:`${c.name} com muita hora extra`,
        body:`${totalOT} min de hora extra esta semana. Avalie o equilíbrio.`,
        chatterId:id,priority:3});
    }

    // --- DESENVOLVIMENTO ---
    const yest=new Date(now);yest.setDate(yest.getDate()-1);
    const orientOntem=S.orientations.filter(o=>o.chatterId===id&&o.date===fmt(yest));
    const orientHoje=S.orientations.filter(o=>o.chatterId===id&&o.date===today);
    if(orientOntem.length>0&&orientHoje.length===0&&now.getHours()>=10){
      alerts.push({id:`info-${id}-followup`,type:'info',icon:'🎯',
        title:`Follow-up pendente: ${c.name}`,
        body:`Recebeu orientação ontem mas sem acompanhamento hoje.`,
        chatterId:id,priority:3});
    }

    // Treinamentos pendentes há mais de 7 dias (ID único por treinamento)
    S.chatterTrainings.filter(t=>t.chatterId===id&&!t.done).forEach(t=>{
      const created=new Date(t.createdAt+'T12:00:00');
      const days=Math.floor((now-created)/86400000);
      if(days>=7){
        alerts.push({id:`info-${id}-train-${t.id}`,type:'info',icon:'📚',
          title:`Treinamento atrasado: ${c.name}`,
          body:`"${t.title}" pendente há ${days} dias.`,
          chatterId:id,priority:3});
      }
    });

    // Chatter em teste há mais de 14 dias sem avaliação
    if((c.level==='treinamento'||c.level==='teste')&&c.createdAt){
      const daysInTest=Math.floor((now-new Date(c.createdAt))/86400000);
      if(daysInTest>=14&&!getReportDraft('decisao-'+id)){
        alerts.push({id:`warn-${id}-semavaliacao`,type:'warn',icon:'🔍',
          title:`${c.name} em teste sem avaliação`,
          body:`${daysInTest} dias em teste. Registre a decisão na aba Relatório.`,
          chatterId:id,priority:2});
      }
    }
  });

  // --- OPERACIONAL ---
  const escaladosHoje=S.shifts.filter(s=>s.days&&s.days.includes(todayDayKey));
  const onlineAgora=getCurrentOnline();
  if(escaladosHoje.length>0&&onlineAgora.length===0&&now.getHours()>=8&&now.getHours()<=23){
    alerts.push({id:'warn-ninguem-online',type:'warn',icon:'🔴',
      title:'Nenhum chatter online',
      body:`${escaladosHoje.length} escalado(s) hoje mas ninguém marcou entrada.`,
      priority:1});
  }

  const tomorrow=getTomorrowKey();
  const folgasAmanha=S.folgas[tomorrow]||[];
  if(folgasAmanha.length>0&&now.getHours()>=20){
    const tomorrowDow=new Date(tomorrow+'T12:00:00').getDay();
    const tomorrowDayKey=DAY_KEYS[tomorrowDow];
    const escaladosAmanha=S.shifts.filter(s=>s.days&&s.days.includes(tomorrowDayKey)&&!folgasAmanha.includes(s.chatterId));
    if(escaladosAmanha.length===0){
      alerts.push({id:'bad-turno-descoberto',type:'bad',icon:'🚨',
        title:'Turno de amanhã descoberto',
        body:`${folgasAmanha.length} de folga e ninguém escalado para cobrir.`,
        priority:1});
    }
  }

  // Chatters ativos sem meta definida esta semana
  const chattersAtivos=S.chatters.filter(c=>c.level!=='treinamento'&&c.level!=='teste');
  const semMeta=chattersAtivos.filter(c=>!(parseFloat(goals[c.id])>0));
  if(semMeta.length>0&&chattersAtivos.length>0){
    alerts.push({id:'info-sem-metas',type:'info',icon:'📋',
      title:`${semMeta.length} chatter(s) sem meta definida`,
      body:`Defina metas na aba Faturamento para acompanhar o progresso.`,
      priority:4});
  }

  // --- MODELO SEM ATENDIMENTO ---
  // Para cada modelo que tem chatters escalados hoje, verifica se algum está online
  if(S.models.length>0&&now.getHours()>=8&&now.getHours()<=23){
    S.models.forEach(m=>{
      // Check escalados - only básico chatters have shifts
      const escaladosNaModelo=S.shifts.filter(s=>
        s.days&&s.days.includes(todayDayKey)&&
        (s.modelIds||[]).includes(m.id)
      ).map(s=>s.chatterId).filter(cid=>{
        const ch=S.chatters.find(c=>c.id===cid);
        return ch&&ch.time!=='elite'; // Elite don't work scheduled hours
      });

      if(!escaladosNaModelo.length)return; // modelo sem ninguém escalado hoje — não alerta

      // Verifica se algum está online
      const algumOnline=escaladosNaModelo.some(cid=>
        ['online','overtime'].includes(getChatterStatus(cid,today))
      );

      if(!algumOnline){
        const nomes=escaladosNaModelo.map(cid=>S.chatters.find(c=>c.id===cid)?.name).filter(Boolean);
        alerts.push({id:`bad-modelo-${m.id}-vazia`,type:'bad',icon:'🚨',
          title:`${m.emoji||'🧩'} ${m.name} sem atendimento`,
          body:`Nenhum chatter online agora. Escalados: ${nomes.join(', ')}.`,
          priority:1});
      }
    });
  }

  return alerts.sort((a,b)=>a.priority-b.priority);
}
function toggleAlertDone(alertId){
  const today=todayKey();
  if(!S.smartAlertsDone[today])S.smartAlertsDone[today]=[];
  const idx=S.smartAlertsDone[today].indexOf(alertId);
  if(idx===-1)S.smartAlertsDone[today].push(alertId);
  else S.smartAlertsDone[today].splice(idx,1);
  save();
  renderSmartAlerts();
}
function saveAlertNote(alertId,value){
  const key=`${todayKey()}_${alertId}`;
  if(!S.alertNotes)S.alertNotes={};
  S.alertNotes[key]=value;
  save();
}
function getAlertNote(alertId){
  const key=`${todayKey()}_${alertId}`;
  return(S.alertNotes&&S.alertNotes[key])||'';
}

function renderSmartAlerts(){
  const panel=document.getElementById('home-smart-alerts');
  const badge=document.getElementById('smart-alerts-badge');
  if(!panel)return;
  const today=todayKey();
  const done=S.smartAlertsDone[today]||[];
  const alerts=getSmartAlerts();

  const pending=alerts.filter(a=>!done.includes(a.id));
  const realized=alerts.filter(a=>done.includes(a.id));

  if(badge){
    badge.textContent=pending.length>0?`${pending.length} pendente${pending.length>1?'s':''}`:realized.length>0?'tudo feito':'';
    badge.className='pill '+(pending.length>0?'pill-bad':realized.length>0?'pill-ok':'pill-flat');
  }

  const colorMap={bad:'var(--bad)',warn:'var(--warn)',info:'var(--info)'};
  const bgMap={bad:'var(--bad-soft)',warn:'var(--warn-soft)',info:'var(--info-soft)'};

  function alertCard(a,isDone){
    const note=getAlertNote(a.id);
    const borderColor=isDone?'var(--ok)':colorMap[a.type]||'var(--line)';
    const bg=isDone?'var(--bg-soft)':bgMap[a.type]||'var(--bg-soft)';
    return`<div style="border-radius:10px;padding:11px 12px;background:${bg};border-left:3px solid ${borderColor};margin-bottom:8px;transition:opacity .2s">
      <div style="display:flex;align-items:flex-start;gap:10px">
        <button onclick="toggleAlertDone('${a.id}')" style="width:22px;height:22px;border-radius:5px;border:2px solid ${isDone?'var(--ok)':borderColor};background:${isDone?'var(--ok)':'transparent'};cursor:pointer;flex-shrink:0;margin-top:1px;display:flex;align-items:center;justify-content:center;font-size:13px">
          ${isDone?'<span style="color:#fff">✓</span>':''}
        </button>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-size:16px">${a.icon}</span>
            <span style="font-weight:700;font-size:13px;color:${isDone?'var(--text3)':'var(--text)'};${isDone?'text-decoration:line-through':''}">${a.title}</span>
          </div>
          ${!isDone?`<div style="font-size:12px;color:var(--text2);margin-top:3px">${a.body}</div>`:''}
          ${!isDone?`<div style="display:flex;gap:8px;margin-top:6px;align-items:center">
            ${a.chatterId?`<button onclick="openChatterDetail('${a.chatterId}')" style="font-size:11px;color:var(--accent);background:none;border:none;cursor:pointer;padding:0;font-family:var(--font-display)">Ver perfil →</button>`:''}
            <button onclick="toggleAlertUrgent('${a.id}')" style="font-size:10.5px;padding:3px 8px;border-radius:6px;border:1px solid ${isAlertUrgent(a.id)?'var(--bad)':'var(--line)'};background:${isAlertUrgent(a.id)?'var(--bad-soft)':'transparent'};cursor:pointer;color:${isAlertUrgent(a.id)?'var(--bad)':'var(--text3)'};font-family:var(--font-display)">${isAlertUrgent(a.id)?'📌 fixado':'📌 fixar'}</button>
          </div>`:''}
          ${!isDone?`<div style="margin-top:7px">
            <input class="finput" style="font-size:11.5px;padding:5px 9px"
              placeholder="Ação tomada / observação..."
              value="${note}"
              onblur="saveAlertNote('${a.id}',this.value)"
              onclick="event.stopPropagation()">
          </div>`:''}
          ${isDone&&note?`<div style="font-size:11px;color:var(--text3);font-style:italic;margin-top:2px">"${note}"</div>`:''}
        </div>
      </div>
    </div>`;
  }

  let html='';

  if(!pending.length&&!realized.length){
    html=`<div style="display:flex;align-items:center;gap:10px;padding:4px 0">
      <span style="font-size:18px">✅</span>
      <div style="font-size:13px;color:var(--text2)">Tudo em ordem — nenhuma atenção necessária agora</div>
    </div>`;
  } else {
    // Pending alerts
    if(pending.length){
      html+=pending.map(a=>alertCard(a,false)).join('');
    } else {
      html+=`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;margin-bottom:4px">
        <span style="font-size:16px">✅</span>
        <span style="font-size:13px;color:var(--ok);font-weight:600">Tudo resolvido por hoje!</span>
      </div>`;
    }

    // Realized section — collapsible
    if(realized.length){
      const collapseId='alerts-done-'+today.replace(/-/g,'');
      html+=`<div style="margin-top:8px">
        <button onclick="const el=document.getElementById('${collapseId}');const arr=document.getElementById('${collapseId}-arr');el.style.display=el.style.display==='none'?'block':'none';arr.textContent=el.style.display==='none'?'▸':'▾';" style="display:flex;align-items:center;gap:6px;background:none;border:none;cursor:pointer;font-family:var(--font-display);font-size:12px;color:var(--text3);padding:4px 0;width:100%">
          <span id="${collapseId}-arr">▸</span>
          Realizadas hoje (${realized.length})
        </button>
        <div id="${collapseId}" style="display:none;margin-top:4px">
          ${realized.map(a=>alertCard(a,true)).join('')}
        </div>
      </div>`;
    }
  }

  panel.innerHTML=html;
}

function renderHome(){
  renderWatchBanner();
  renderEscritorioPanel();
  renderUrgentPanel();
  renderSmartAlerts();
  renderJanelaPanel();
  renderMotivacionalHome();
  render48hAlerts();
  renderMidnightPreviewHome(); // null-guarded
}

function renderEscritorioPanel(){
  const el=document.getElementById('home-escritorio');
  if(!el)return;
  const todayDK=getTodayDayKey();
  const today=todayKey();

  const online=getCurrentOnline();
  const scheduledToday=getCurrentScheduledToday();
  const nextUp=scheduledToday
    .filter(c=>!online.find(o=>o.id===c.id))
    .map(c=>({c,next:getNextShiftToday(c.id),
      models:[...new Set(S.shifts.filter(s=>s.chatterId===c.id&&(s.days||[]).includes(todayDK)).flatMap(s=>s.modelIds||[]))].map(mid=>S.models.find(m=>m.id===mid)).filter(Boolean)
    }))
    .filter(x=>x.next)
    .sort((a,b)=>a.next.localeCompare(b.next));

  el.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="font-weight:800;font-size:15px">🖥️ Escritório</div>
      <button class="btn btn-ghost btn-xs" onclick="navTo('turno')">escala →</button>
    </div>

    ${online.length?
      online.map(c=>{
        const shifts=S.shifts.filter(s=>s.chatterId===c.id&&(s.days||[]).includes(todayDK));
        const models=[...new Set(shifts.flatMap(s=>s.modelIds||[]))].map(mid=>S.models.find(m=>m.id===mid)).filter(Boolean);
        const ends=shifts.flatMap(s=>s.end2&&s.end2>s.end?[s.end2]:[s.end]).sort().reverse()[0]||'';
        return`<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line)">
          <div style="width:9px;height:9px;border-radius:50%;background:var(--ok);animation:pulse 2s infinite;flex-shrink:0"></div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:14px">${c.name}</div>
            <div style="font-size:11.5px;color:var(--text2)">${models.map(m=>`${m.emoji||''} ${m.name}`).join(' · ')||'online'}${ends?' · até '+ends:''}</div>
          </div>
        </div>`;
      }).join('')
    :`<div style="font-size:13px;color:var(--text3);padding:8px 0">Ninguém online agora</div>`}

    <button onclick="toggleNextTurno()" style="width:100%;margin-top:12px;background:var(--bg-soft);border:1.5px solid var(--line);border-radius:9px;padding:10px 14px;cursor:pointer;font-family:var(--font-display);font-size:13px;font-weight:700;color:var(--text);display:flex;align-items:center;justify-content:space-between">
      <span>⏳ PRÓXIMO TURNO</span>
      <span id="next-turno-arrow" style="font-size:11px;color:var(--text3)">▸</span>
    </button>
    <div id="next-turno-panel" style="display:none;margin-top:2px">
      ${nextUp.length?nextUp.slice(0,3).map(r=>`
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)">
          <div style="font-family:var(--font-mono);font-size:15px;font-weight:800;color:var(--warn);min-width:50px">${r.next}</div>
          <div style="font-weight:700;font-size:14px;flex:1">${r.c.name}</div>
          <div style="font-size:17px">${r.models.map(m=>m.emoji||'🧩').join('')}</div>
        </div>`).join('')
      :`<div style="font-size:12.5px;color:var(--text3);padding:10px 0">Nenhum próximo turno agendado</div>`}
    </div>
  `;
}


/* ===========================================================
   URGENT ALERTS — alerts the user pins to the home screen top
   =========================================================== */
function toggleAlertUrgent(alertId){
  if(!S.alertNotes)S.alertNotes={};
  const key='urgent_'+alertId;
  S.alertNotes[key]=!S.alertNotes[key];
  save();renderSmartAlerts();renderUrgentPanel();
}
function isAlertUrgent(alertId){
  return !!(S.alertNotes&&S.alertNotes['urgent_'+alertId]);
}
function renderUrgentPanel(){
  const panel=document.getElementById('home-urgent-panel');
  const list=document.getElementById('home-urgent-list');
  const badge=document.getElementById('home-urgent-badge');
  if(!panel||!list)return;
  const today=todayKey();
  const done=S.smartAlertsDone[today]||[];
  const alerts=getSmartAlerts().filter(a=>isAlertUrgent(a.id)&&!done.includes(a.id));
  if(!alerts.length){panel.style.display='none';return;}
  panel.style.display='block';
  if(badge)badge.textContent=`${alerts.length} urgente${alerts.length>1?'s':''}`;
  const colorMap={bad:'var(--bad)',warn:'var(--warn)',info:'var(--info)'};
  list.innerHTML=alerts.map(a=>`
    <div style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid rgba(180,35,52,.15)">
      <span style="font-size:16px;flex-shrink:0">${a.icon}</span>
      <div style="flex:1">
        <div style="font-weight:700;font-size:13px;color:var(--bad)">${a.title}</div>
        <div style="font-size:11.5px;color:var(--text2);margin-top:2px">${a.body}</div>
      </div>
      <button onclick="toggleAlertDone('${a.id}')" style="background:var(--ok);border:none;border-radius:5px;width:24px;height:24px;cursor:pointer;color:#fff;font-size:12px;flex-shrink:0">✓</button>
    </div>`).join('');
}
function saveQuickNote(){const v=document.getElementById('quicknote').value.trim();if(!v)return;S.quickNotes.push({text:v,date:new Date().toISOString()});save();toast('✅ Salvo!');}

// ---------- status helpers ----------
// Returns true if chatter is within their scheduled shift window right now
function isChatterScheduledNow(chatterId){
  const now=new Date();
  const todayDK=getTodayDayKey();
  const nowMins=now.getHours()*60+now.getMinutes();
  const shifts=S.shifts.filter(s=>s.chatterId===chatterId&&(s.days||[]).includes(todayDK));
  for(const s of shifts){
    const [sh,sm]=s.start.split(':').map(Number);
    const [eh,em]=s.end.split(':').map(Number);
    const startMins=sh*60+sm, endMins=eh*60+em;
    if(nowMins>=startMins&&nowMins<endMins)return true;
    if(s.start2&&s.end2){
      const [sh2,sm2]=s.start2.split(':').map(Number);
      const [eh2,em2]=s.end2.split(':').map(Number);
      const s2=sh2*60+sm2,e2=eh2*60+em2;
      if(nowMins>=s2&&nowMins<e2)return true;
    }
  }
  // Also check swaps for today
  const today=todayKey();
  const swapShifts=S.swaps.filter(sw=>sw.date===today&&sw.covererId===chatterId);
  for(const sw of swapShifts){
    const [sh,sm]=(sw.start||'').split(':').map(Number);
    const [eh,em]=(sw.end||'').split(':').map(Number);
    if(!isNaN(sh)){const s=sh*60+sm,e=eh*60+em;if(nowMins>=s&&nowMins<e)return true;}
    if(sw.start2&&sw.end2){
      const [sh2,sm2]=sw.start2.split(':').map(Number);
      const [eh2,em2]=sw.end2.split(':').map(Number);
      if(!isNaN(sh2)){const s2=sh2*60+sm2,e2=eh2*60+em2;if(nowMins>=s2&&nowMins<e2)return true;}
    }
  }
  return false;
}

// Returns chatter's next shift start today (or null)
function getNextShiftToday(chatterId){
  const now=new Date();
  const todayDK=getTodayDayKey();
  const nowMins=now.getHours()*60+now.getMinutes();
  let next=null;
  S.shifts.filter(s=>s.chatterId===chatterId&&(s.days||[]).includes(todayDK)).forEach(s=>{
    const [sh,sm]=s.start.split(':').map(Number);
    const startMins=sh*60+sm;
    if(startMins>nowMins&&(next===null||startMins<next))next=startMins;
    if(s.start2){
      const [sh2,sm2]=s.start2.split(':').map(Number);
      const s2=sh2*60+sm2;
      if(s2>nowMins&&(next===null||s2<next))next=s2;
    }
  });
  if(next===null)return null;
  return`${String(Math.floor(next/60)).padStart(2,'0')}:${String(next%60).padStart(2,'0')}`;
}

function getChatterStatus(chatterId,dateKey){
  // Manual overrides (checkins) take priority over schedule
  const log=(S.turnoLog[dateKey]||[]).filter(e=>e.chatterId===chatterId);
  if(log.length){
    const last=log[log.length-1];
    // Manual override: if last action was 'out', check if a new shift started since then
    if(last.action==='out'){
      // If schedule says they should be on right now (new shift window), override the manual out
      if(dateKey===todayKey()&&isChatterScheduledNow(chatterId))return'online';
      return'offline';
    }
    if(last.action==='overtime')return'overtime';
    if(last.action==='in')return'online';
  }
  // No manual log — use schedule automatically
  if(dateKey===todayKey()&&isChatterScheduledNow(chatterId))return'online';
  return'offline';
}

function getCurrentOnline(){
  const today=todayKey();
  // Elite chatters work off-schedule — exclude from auto status
  return S.chatters.filter(c=>c.time!=='elite'&&['online','overtime'].includes(getChatterStatus(c.id,today)));
}
function getCurrentScheduledToday(){
  const todayDK=getTodayDayKey();
  const today=todayKey();
  return S.chatters.filter(c=>{
    if(c.time==='elite')return false; // Elite work off-schedule
    const hasShift=S.shifts.some(s=>s.chatterId===c.id&&(s.days||[]).includes(todayDK));
    const hasSwap=S.swaps.some(sw=>sw.date===today&&sw.covererId===c.id);
    const gaveAway=S.swaps.some(sw=>sw.date===today&&sw.originalId===c.id);
    return(hasShift&&!gaveAway)||hasSwap;
  });
}
function getChatterOvertimeOn(chatterId,dateKey){
  const log=(S.turnoLog[dateKey]||[]).filter(e=>e.chatterId===chatterId&&e.action==='overtime');
  return log.reduce((sum,e)=>{
    if(e.otEnd&&e.time){const[h1,m1]=e.time.split(':').map(Number);const[h2,m2]=e.otEnd.split(':').map(Number);return sum+Math.max(0,(h2*60+m2)-(h1*60+m1));}
    return sum;
  },0);
}

/* ===========================================================
   TURNO
   =========================================================== */
let selectedDay='seg';
function toggleNextTurno(){
  const panel=document.getElementById('next-turno-panel');
  const arrow=document.getElementById('next-turno-arrow');
  if(!panel)return;
  const open=panel.style.display==='none';
  panel.style.display=open?'block':'none';
  if(arrow)arrow.textContent=open?'▾ fechar':'▸ ver';
}

function renderTurno(){
  renderTurnoDay();
  renderTurnoWeek();
  renderAbsenceList();
}

function renderTurnoDay(){
  const today=todayKey();
  const todayDK=getTodayDayKey();
  const now=new Date();
  const nowMins=now.getHours()*60+now.getMinutes();
  const DAY_FULL={seg:'Segunda',ter:'Terça',qua:'Quarta',qui:'Quinta',sex:'Sexta',sab:'Sábado',dom:'Domingo'};
  const titleEl=document.getElementById('turno-day-title');
  if(titleEl)titleEl.textContent=`Hoje · ${DAY_FULL[todayDK]||todayDK}`;

  const el=document.getElementById('turno-day-list');
  if(!el)return;

  // Collect today's effective roster (shifts + swaps)
  const seen=new Set();
  const rows=[];

  S.shifts.filter(s=>(s.days||[]).includes(todayDK)).forEach(s=>{
    if(seen.has(s.chatterId))return;
    seen.add(s.chatterId);
    const gaveAway=S.swaps.some(sw=>sw.date===today&&sw.originalId===s.chatterId);
    if(gaveAway)return;
    const c=S.chatters.find(ch=>ch.id===s.chatterId);
    if(!c||c.time==='elite')return; // Elite off-schedule
    const allShifts=S.shifts.filter(x=>x.chatterId===c.id&&(x.days||[]).includes(todayDK));
    const models=[...new Set(allShifts.flatMap(x=>x.modelIds||[]))].map(mid=>S.models.find(m=>m.id===mid)).filter(Boolean);
    const windows=allShifts.flatMap(x=>{
      const w=[{start:x.start,end:x.end}];
      if(x.start2&&x.end2)w.push({start:x.start2,end:x.end2});
      return w;
    }).sort((a,b)=>a.start.localeCompare(b.start));
    const isOn=['online','overtime'].includes(getChatterStatus(c.id,today));
    const firstStart=windows[0]?.start||'';
    const [sh,sm]=(firstStart).split(':').map(Number);
    const startMins=sh*60+sm;
    const status=startMins>nowMins?'next':isOn?'on':'done';
    rows.push({c,windows,models,status,shiftId:allShifts[0]?.id});
  });

  // Add swaps covering today
  S.swaps.filter(sw=>sw.date===today).forEach(sw=>{
    const c=S.chatters.find(ch=>ch.id===sw.covererId);
    if(!c)return;
    const orig=S.chatters.find(ch=>ch.id===sw.originalId);
    const isOn=['online','overtime'].includes(getChatterStatus(c.id,today));
    rows.push({c,windows:[{start:sw.start,end:sw.end}],models:[],status:isOn?'on':'next',isSwap:true,origName:orig?.name,shiftId:sw.id});
  });

  rows.sort((a,b)=>(a.windows[0]?.start||'').localeCompare(b.windows[0]?.start||''));

  if(!rows.length){
    el.innerHTML='<div style="color:var(--text3);font-size:13px;padding:12px 0;text-align:center">Nenhum chatter escalado hoje<br><span style="font-size:11.5px">Use o botão + adicionar acima</span></div>';
    return;
  }

  const statusColors={on:'var(--ok)',next:'var(--warn)',done:'var(--text3)'};
  const statusIcons={on:'🟢',next:'⏳',done:'⚫'};

  const renderRow=r=>{
    const timeStr=r.windows.map(w=>`${w.start}–${w.end}`).join(' · ');
    const modelStr=r.models.map(m=>`${m.emoji||'🧩'} ${m.name}`).join(' · ');
    const color=statusColors[r.status];
    return`<div onclick="openEditShiftFromProfile('${r.shiftId}','${r.c.id}')" style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);cursor:pointer">
      <div style="font-size:18px;flex-shrink:0">${statusIcons[r.status]}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:14.5px">${r.c.name}${r.isSwap?` <span style="font-size:10px;color:var(--info)">(troca p/ ${r.origName||'?'})</span>`:''}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:2px">${timeStr}${modelStr?' · '+modelStr:''}</div>
      </div>
      <span style="font-size:11px;color:${color};font-weight:700">${r.status==='on'?'online':r.status==='next'?'aguardando':'encerrado'}</span>
    </div>`;
  };

  const basico=rows.filter(r=>r.c.time!=='elite');

  let html='';
  if(!basico.length){
    html='<div style="color:var(--text3);font-size:13px;padding:12px 0;text-align:center">Nenhum chatter do Time Básico escalado hoje</div>';
  } else {
    html+=basico.map(renderRow).join('');
  }
  el.innerHTML=html;
}

function renderTurnoWeek(){
  const el=document.getElementById('turno-week-list');
  if(!el)return;

  if(!S.shifts.length){
    el.innerHTML='<div style="color:var(--text3);font-size:13px;padding:8px 0">Nenhum turno cadastrado ainda.<br>Use o botão + adicionar acima.</div>';
    return;
  }

  // Group shifts by model — each model gets a block
  // Shifts with no model go to a "Sem modelo" group
  const modelGroups={};
  S.models.forEach(m=>{ modelGroups[m.id]={model:m,shifts:[]}; });
  modelGroups['_none']={model:null,shifts:[]};

  S.shifts.forEach(s=>{
    const mids=s.modelIds&&s.modelIds.length?s.modelIds:[null];
    mids.forEach(mid=>{
      const key=mid||'_none';
      if(!modelGroups[key])modelGroups[key]={model:S.models.find(m=>m.id===mid)||null,shifts:[]};
      if(!modelGroups[key].shifts.find(x=>x.id===s.id))
        modelGroups[key].shifts.push(s);
    });
  });

  const blocks=Object.values(modelGroups).filter(g=>g.shifts.length);

  el.innerHTML=blocks.map(g=>{
    const m=g.model;
    // Sort shifts by start time
    const sorted=[...g.shifts].sort((a,b)=>a.start.localeCompare(b.start));

    const sorted2=sorted
      .filter(s=>{const c=S.chatters.find(ch=>ch.id===s.chatterId);return !c||c.time!=='elite';})
      .sort((a,b)=>{
        const toMins=t=>{if(!t)return 9999;const[h,m]=t.split(':').map(Number);return h<7?h*60+m+1440:h*60+m;};
        return toMins(a.start)-toMins(b.start);
      });
    const rows=sorted2.map(s=>{
      const c=S.chatters.find(ch=>ch.id===s.chatterId);
      const name=c?c.name:'—';
      const t1=`${s.start}–${s.end}`;
      const t2=s.start2&&s.end2?`${s.start2}–${s.end2}`:'';
      const folgaLabel=s.folgaDia?` <span style="font-size:10px;color:var(--bad)">(folga ${s.folgaDia})</span>`:'';
      return`<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--line)">
        <div onclick="openEditShiftFromProfile('${s.id}','${s.chatterId}')" style="font-family:var(--font-mono);font-size:12.5px;color:var(--warn);min-width:110px;flex-shrink:0;cursor:pointer">${t1}${t2?' · '+t2:''}</div>
        <div onclick="openEditShiftFromProfile('${s.id}','${s.chatterId}')" style="font-size:13.5px;font-weight:700;flex:1;cursor:pointer">${name}${folgaLabel}</div>
        <button onclick="deleteShift('${s.id}')" style="background:none;border:none;color:var(--bad);cursor:pointer;font-size:15px;padding:2px 6px">✕</button>
      </div>`;
    }).join('');

    return`<div style="margin-bottom:18px">
      <div style="font-size:14px;font-weight:800;margin-bottom:8px;padding-bottom:5px;border-bottom:2px solid var(--line)">
        ${m?`${m.emoji||'🧩'} ${m.name}`:'Sem modelo'}
      </div>
      ${rows}
    </div>`;
  }).join('');
}
/* ===========================================================
   EDIT PUNCH — correct a check-in/out/overtime time that was
   recorded automatically but doesn't match what really happened
   (chatters often clock in/out at slightly different times).
   =========================================================== */
function openEditPunch(dateKey,entryId){
  const entry=(S.turnoLog[dateKey]||[]).find(e=>e.id===entryId);
  if(!entry)return;
  const c=S.chatters.find(ch=>ch.id===entry.chatterId);
  const actLabel={in:'Entrada',out:'Saída',overtime:'Hora extra'}[entry.action]||entry.action;
  document.getElementById('punch-edit-title').textContent=`Editar ${actLabel.toLowerCase()} — ${c?c.name:'?'}`;
  document.getElementById('punch-edit-date').textContent=dateKey;
  document.getElementById('punch-edit-time').value=entry.time||'';
  document.getElementById('punch-edit-otend-field').style.display=entry.action==='overtime'?'block':'none';
  document.getElementById('punch-edit-otend').value=entry.otEnd||'';
  document.getElementById('punch-edit-confirm').onclick=function(){
    const newTime=document.getElementById('punch-edit-time').value;
    if(!newTime){toast('⚠️ Informe um horário');return;}
    entry.time=newTime;
    if(entry.action==='overtime'){
      entry.otEnd=document.getElementById('punch-edit-otend').value||entry.otEnd;
    }
    save();
    closeModal('m-punch-edit');
    toast('✅ Horário corrigido!');
    renderTodayWorkedList();renderTurnoBoard();renderHome();
  };
  document.getElementById('punch-edit-delete').onclick=function(){
    if(!confirm('Remover esse registro de ponto?'))return;
    S.turnoLog[dateKey]=(S.turnoLog[dateKey]||[]).filter(e=>e.id!==entryId);
    save();
    closeModal('m-punch-edit');
    toast('Registro removido');
    renderTodayWorkedList();renderTurnoBoard();renderHome();
  };
  openModal('m-punch-edit');
}

function renderTodayWorkedList(){
  const el=document.getElementById('today-worked-list');
  if(!el)return;
  const today=todayKey();
  const workedIds=new Set(getChattersThatWorkedOn(today));
  const chatters=S.chatters.filter(c=>workedIds.has(c.id));
  const badge=document.getElementById('today-worked-badge');
  if(badge)badge.textContent=`${chatters.length} hoje`;

  if(!chatters.length){
    el.innerHTML='<div class="empty"><div class="empty-tx">Nenhum chatter escalado ou com entrada registrada hoje</div></div>';
    return;
  }
  el.innerHTML='<div class="roster">'+chatters.map(c=>{
    const color=getComputedLevelColor(c.level);
    const status=getChatterStatus(c.id,today);
    const log=(S.turnoLog[today]||[]).filter(e=>e.chatterId===c.id);
    const todaysShifts=S.shifts.filter(s=>s.chatterId===c.id&&s.days&&s.days.includes(getTodayDayKey())).sort((a,b)=>a.start.localeCompare(b.start));
    const shiftsLabel=todaysShifts.length?todaysShifts.map(s=>`${s.start}–${s.end}`).join(' · '):'';
    const allModelIds=new Set();
    todaysShifts.forEach(s=>(s.modelIds||[]).forEach(mid=>allModelIds.add(mid)));
    const modelNames=Array.from(allModelIds).map(mid=>{const m=S.models.find(mm=>mm.id===mid);return m?`${m.emoji||'🧩'} ${m.name}`:null;}).filter(Boolean);
    const historyChips=log.length?log.map(e=>{
      const actLabel=e.action==='in'?'entrou':e.action==='out'?'saiu':'h.extra';
      return`<span class="pill pill-flat" style="cursor:pointer;margin:2px 3px 2px 0" onclick="openEditPunch('${today}','${e.id}')">${actLabel} ${e.time} ✎</span>`;
    }).join(''):'<span style="font-size:11.5px;color:var(--text3)">sem registro de ponto ainda</span>';
    return`<div class="rrow ${status==='online'?'on':status==='overtime'?'ot':'off'}">
      <div class="ravatar" style="background:${color}22;color:${color}">${c.name.slice(0,2).toUpperCase()}</div>
      <div class="rinfo">
        <div class="rname">${c.name}</div>
        <div class="rmeta">${shiftsLabel?`previsto: ${shiftsLabel}`:'sem horário fixo'}</div>
        ${modelNames.length?`<div class="rmeta" style="margin-top:2px">🧩 ${modelNames.join(' · ')}</div>`:''}
        <div style="margin-top:4px">${historyChips}</div>
      </div>
      <span class="pill ${status==='online'?'pill-ok':status==='overtime'?'pill-warn':'pill-flat'}">${status==='online'?'online':status==='overtime'?'h.extra':'offline'}</span>
    </div>`;
  }).join('')+'</div>';
}
function renderTurnoBoard(){
  const el=document.getElementById('turno-board');
  if(!S.chatters.length){el.innerHTML='<div class="empty"><div class="empty-tx">Cadastre chatters na aba Equipe</div></div>';return;}
  const today=todayKey();
  const todayDayKey=getTodayDayKey();
  el.innerHTML='<div class="roster">'+S.chatters.map(c=>{
    const status=getChatterStatus(c.id,today);
    const color=getComputedLevelColor(c.level);
    const log=(S.turnoLog[today]||[]).filter(e=>e.chatterId===c.id);
    const last=log.length?log[log.length-1]:null;
    const since=last&&last.action==='in'?` · desde ${last.time}`:'';
    const otMins=getChatterOvertimeOn(c.id,today);
    const todaysShifts=S.shifts.filter(s=>s.chatterId===c.id&&s.days&&s.days.includes(todayDayKey)).sort((a,b)=>a.start.localeCompare(b.start));
    const shiftsLabel=todaysShifts.length?todaysShifts.map(s=>`${s.start}-${s.end}`).join(' · '):'';
    let actions='';
    if(status==='offline'){
      actions=`<button class="btn btn-primary btn-xs" onclick="doCheckin('${c.id}','in')">▶ entrou</button>`;
    } else if(status==='online'){
      actions=`<button class="btn btn-danger btn-xs" onclick="doCheckin('${c.id}','out')">■ saiu</button><button class="btn btn-soft btn-xs" onclick="doCheckin('${c.id}','overtime')">⏱</button>`;
    } else if(status==='overtime'){
      actions=`<button class="btn btn-danger btn-xs" onclick="doCheckin('${c.id}','out')">■ saiu</button>`;
    }
    return`<div class="rrow ${status==='online'?'on':status==='overtime'?'ot':'off'}">
      <div class="ravatar" style="background:${color}22;color:${color}">${c.name.slice(0,2).toUpperCase()}</div>
      <div class="rinfo"><div class="rname">${c.name}${todaysShifts.length>1?' <span class="pill pill-info" style="font-size:9px">2 turnos</span>':''}</div>
      <div class="rmeta">${status==='online'?'online'+since:status==='overtime'?'hora extra':'offline'}${otMins>0?` · +${otMins}min`:''}${shiftsLabel?` · prev: ${shiftsLabel}`:''}</div></div>
      <div class="ractions">${actions}</div>
    </div>`;
  }).join('')+'</div>';
}
function doCheckin(chatterId,action){
  const c=S.chatters.find(ch=>ch.id===chatterId);if(!c)return;
  const today=todayKey();
  if(!S.turnoLog[today])S.turnoLog[today]=[];
  if(action==='overtime'){
    populateChatterSelects();
    document.getElementById('ot-date').value=today;document.getElementById('ot-start').value=nowHHMM();
    setTimeout(()=>{const sel=document.getElementById('ot-chatter');if(sel)sel.value=chatterId;},40);
    openModal('m-overtime');return;
  }
  if(action==='out'){
    S.turnoLog[today].push({id:'tl'+Date.now()+Math.random().toString(36).slice(2,6),chatterId,action:'out',time:nowHHMM()});
    save();toast(`${c.name} marcou saída`);renderTurnoBoard();renderTodayWorkedList();renderHome();
    return;
  }
  // action === 'in'
  S.turnoLog[today].push({id:'tl'+Date.now()+Math.random().toString(36).slice(2,6),chatterId,action:'in',time:nowHHMM()});
  save();toast(`✅ ${c.name} marcado como online`);renderTurnoBoard();renderTodayWorkedList();renderHome();
}
function openCheckinOut(chatterId){
  const c=S.chatters.find(ch=>ch.id===chatterId);
  document.getElementById('checkin-title').textContent=`Saída — ${c.name}`;
  const others=S.chatters.filter(ch=>ch.id!==chatterId&&getChatterStatus(ch.id,todayKey())==='offline');
  document.getElementById('checkin-body').innerHTML=`
    <p style="font-size:13px;color:var(--text2);margin-bottom:12px">Quem entrou no lugar de <strong style="color:var(--text)">${c.name}</strong>?</p>
    <div id="rep-list">
      ${others.map(ch=>`<div class="taskrow" style="cursor:pointer" onclick="selectRep('${ch.id}')">
        <div class="tcheck" id="rep-${ch.id}"></div>
        <div class="tbody"><div class="ttext">${ch.name}</div><div class="tmeta-row"><span class="pill pill-flat">${ch.level}</span></div></div>
      </div>`).join('')}
      <div class="taskrow" style="cursor:pointer" onclick="selectRep('none')">
        <div class="tcheck" id="rep-none"></div>
        <div class="tbody"><div class="ttext" style="color:var(--text2)">Ninguém entrou</div></div>
      </div>
    </div>`;
  let rep=null;
  window.selectRep=function(id){
    document.querySelectorAll('#rep-list .tcheck').forEach(e=>{e.classList.remove('done');e.textContent='';});
    document.getElementById('rep-'+id).classList.add('done');document.getElementById('rep-'+id).textContent='✓';
    rep=id;
  };
  document.getElementById('checkin-confirm').onclick=function(){
    const today=todayKey();if(!S.turnoLog[today])S.turnoLog[today]=[];
    S.turnoLog[today].push({id:'tl'+Date.now()+Math.random().toString(36).slice(2,6),chatterId,action:'out',time:nowHHMM()});
    if(rep&&rep!=='none'){
      S.turnoLog[today].push({id:'tl'+Date.now()+Math.random().toString(36).slice(2,6),chatterId:rep,action:'in',time:nowHHMM()});
      const r=S.chatters.find(ch=>ch.id===rep);
      toast(`✅ ${c.name} saiu · ${r?r.name:'?'} entrou`);
    } else toast(`✅ ${c.name} saiu`);
    save();closeModal('m-checkin');renderTurnoBoard();renderHome();
  };
  openModal('m-checkin');
}
function renderScheduleForDay(day){
  const list=document.getElementById('schedule-list');
  const shifts=S.shifts.filter(s=>s.days&&s.days.includes(day));

  // Find the actual date for this day in the current week (for swap lookup)
  const wd=getWeekDates();
  const dayKeyIndex={seg:0,ter:1,qua:2,qui:3,sex:4,sab:5,dom:6}[day];
  const dateForDay=dayKeyIndex!==undefined?fmt(wd[dayKeyIndex]):null;

  // Get swaps for this specific date
  const swapsForDay=dateForDay?S.swaps.filter(sw=>sw.date===dateForDay):[];

  if(!shifts.length&&!swapsForDay.length){
    list.innerHTML='<div class="empty"><div class="empty-tx">Nenhum turno cadastrado</div></div>';return;
  }

  // Build effective roster: original shifts minus given-away + covered swaps
  const byChatter={};
  shifts.forEach(s=>{
    // Skip if this chatter gave away their shift today via swap
    const gaveAway=swapsForDay.some(sw=>sw.originalId===s.chatterId&&sw.shiftId===s.id);
    if(gaveAway)return;
    if(!byChatter[s.chatterId])byChatter[s.chatterId]=[];
    byChatter[s.chatterId].push(s);
  });
  // Add swap coverers
  swapsForDay.forEach(sw=>{
    const origShift=S.shifts.find(s=>s.id===sw.shiftId);
    const swapEntry={...(origShift||{}),id:sw.id,start:sw.start,end:sw.end,start2:sw.start2||'',end2:sw.end2||'',isSwap:true,swapOriginalId:sw.originalId};
    if(!byChatter[sw.covererId])byChatter[sw.covererId]=[];
    byChatter[sw.covererId].push(swapEntry);
  });

  const groups=Object.entries(byChatter).map(([chatterId,list])=>{
    const c=S.chatters.find(ch=>ch.id===chatterId);
    const earliest=list.slice().sort((a,b)=>a.start.localeCompare(b.start))[0];
    return{chatterId,chatter:c,shifts:list.sort((a,b)=>a.start.localeCompare(b.start)),sortKey:earliest?earliest.start:'99:99'};
  }).filter(g=>g.chatter).sort((a,b)=>a.sortKey.localeCompare(b.sortKey));

  const DAY_LABELS={seg:'Seg',ter:'Ter',qua:'Qua',qui:'Qui',sex:'Sex',sab:'Sáb',dom:'Dom'};

  list.innerHTML='<div style="display:flex;flex-direction:column;gap:8px">'+groups.map(g=>{
    const c=g.chatter;
    const multi=g.shifts.length>1;
    const timeBlocks=g.shifts.map(s=>{
      const modelNames=(s.modelIds||[]).map(mid=>{const m=S.models.find(mm=>mm.id===mid);return m?`${m.emoji||'🧩'} ${m.name}`:null;}).filter(Boolean);
      const hasSecond=s.start2&&s.end2;
      const origChatter=s.swapOriginalId?S.chatters.find(c=>c.id===s.swapOriginalId):null;
      const timeLabel=`${s.start}–${s.end}${hasSecond?' · '+s.start2+'–'+s.end2:''}`;
      const timeDiv=s.isSwap
        ?`<div style="font-family:var(--font-mono);background:var(--info-soft);border-radius:7px;padding:5px 9px;font-size:11.5px;font-weight:700;color:var(--info);white-space:nowrap">${timeLabel}</div>`
        :`<div style="font-family:var(--font-mono);background:var(--bg-soft);border-radius:7px;padding:5px 9px;font-size:11.5px;font-weight:700;color:var(--warn);white-space:nowrap;cursor:pointer" onclick="openEditShift('${s.id}')">${timeLabel} ✎</div>`;
      const delBtn=s.isSwap
        ?`<button class="btn btn-icon btn-line" style="width:22px;height:22px;flex-shrink:0" onclick="deleteSwap('${s.id}')">✕</button>`
        :`<button class="btn btn-icon btn-line" style="width:22px;height:22px;flex-shrink:0" onclick="deleteShift('${s.id}')">✕</button>`;
      return`<div>
        <div style="display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap">${timeDiv}${delBtn}</div>
        ${s.isSwap&&origChatter?`<div style="font-size:10.5px;color:var(--info);margin-top:2px">troca: cobrindo `+origChatter.name+`</div>`:''}
        ${s.folgaDia&&!s.isSwap?`<div style="font-size:10.5px;color:var(--bad);margin-top:2px">folga: ${DAY_LABELS[s.folgaDia]||s.folgaDia}</div>`:''}
        ${modelNames.length?`<div style="font-size:10.5px;color:var(--text3);margin-top:2px">${modelNames.join(' · ')}</div>`:''}
      </div>`;}).join('');
    return`<div class="rrow" style="align-items:flex-start">
      <div style="display:flex;flex-wrap:wrap;gap:8px;max-width:175px">${timeBlocks}</div>
      <div class="rinfo">
        <div class="rname">${c.name}${multi?` <span class="pill pill-info" style="margin-left:5px;font-size:9.5px">2 turnos</span>`:''}${g.shifts.some(s=>s.isSwap)?` <span class="pill pill-info" style="margin-left:5px;font-size:9.5px">⇄ troca</span>`:''}</div>
        <span class="pill ${LVLCLASS[c.level]}" style="border:1px solid;margin-top:4px">${c.level}</span>
      </div>
    </div>`;
  }).join('')+'</div>';
}
function renderAlarmList(){
  const times=getShiftTimes();
  document.getElementById('alarm-badge').textContent=`${times.length} horários`;
  document.getElementById('alarm-times').innerHTML=times.length?times.map(t=>`<span class="pill pill-warn" style="margin:2px">${t}</span>`).join(''):'<span style="color:var(--text3);font-size:12px">Nenhum horário</span>';
}
function renderAbsenceList(){
  const el=document.getElementById('absence-list');
  const week=getWeekAbsencesData();
  if(!week.length){el.innerHTML='<div class="empty"><div class="empty-tx">Nenhuma ocorrência esta semana</div></div>';return;}
  const tb={falta:'pill-bad',atraso:'pill-warn',saida_antecipada:'pill-info'};
  const tl={falta:'Falta',atraso:'Atraso',saida_antecipada:'Saída antecip.'};
  el.innerHTML=week.slice(0,6).map(a=>{
    const c=S.chatters.find(ch=>ch.id===a.chatterId);
    return`<div class="reprow"><div><div style="font-size:13px;font-weight:700">${c?c.name:'?'}</div><div style="font-size:11px;color:var(--text2)">${a.date}${a.note?' · '+a.note:''}</div></div><span class="pill ${tb[a.type]||'pill-flat'}">${tl[a.type]||a.type}</span></div>`;
  }).join('');
}

// ---------- alarm (shift change) ----------
let alarmActive=false;
function getShiftTimes(){const t=new Set();S.shifts.forEach(s=>{if(s.start)t.add(s.start);if(s.end)t.add(s.end);});return Array.from(t).sort();}
function getNextAlarmTime(){
  const times=getShiftTimes();if(!times.length)return null;
  const hhmm=nowHHMM();for(const t of times){if(t>hhmm)return t;}return times[0];
}
function updateAlarmCountdown(){
  const next=getNextAlarmTime();
  ['home-countdown','turno-countdown'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent='--:--:--';});
  if(!next)return;
  const now=new Date();let[th,tm]=next.split(':').map(Number);
  let target=new Date(now);target.setHours(th,tm,0,0);if(target<=now)target.setDate(target.getDate()+1);
  let diff=Math.floor((target-now)/1000);
  const h=Math.floor(diff/3600),m=Math.floor((diff%3600)/60),s=diff%60;
  const str=`${p2(h)}:${p2(m)}:${p2(s)}`;
  ['home-countdown','turno-countdown'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=str;});
  const nl=document.getElementById('home-next-lb');if(nl)nl.textContent=`próxima troca · ${next}`;
  const nl2=document.getElementById('turno-next-lb');if(nl2)nl2.textContent=`para a troca das ${next}`;
  if(diff===0&&!alarmActive)triggerShiftAlarm(next);
}
function triggerShiftAlarm(time){
  alarmActive=true;const code=genCode();S.lastCode={code,time,date:new Date().toISOString()};save();
  ['home-codebox','turno-codebox'].forEach(id=>{const el=document.getElementById(id);if(el){el.style.display='block';el.textContent=code;}});
  const ring=document.getElementById('turno-ring');if(ring)ring.classList.add('ringing');
  toast(`🔔 Troca de turno! Código: ${code}`,8000);
  setTimeout(()=>{alarmActive=false;if(ring)ring.classList.remove('ringing');},30000);
}
function genCode(){const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let r='';for(let i=0;i<6;i++)r+=c[Math.floor(Math.random()*c.length)];return r;}
function generateCode(){
  const code=genCode();S.lastCode={code,time:'manual',date:new Date().toISOString()};save();
  ['home-codebox','turno-codebox'].forEach(id=>{const el=document.getElementById(id);if(el){el.style.display='block';el.textContent=code;}});
  toast(`🔑 Código: ${code}`);
}

/* ===========================================================
   EXPORT TO CALENDAR (.ics) — real phone notifications
   Generates one recurring weekly event per shift-change time
   already registered in the weekly schedule (S.shifts).
   The person imports this into iPhone Calendar so they get a
   real push alert even with the app closed.
   =========================================================== */
const ICS_DAY_MAP={dom:'SU',seg:'MO',ter:'TU',qua:'WE',qui:'TH',sex:'FR',sab:'SA'};
function icsEscape(str){
  return String(str)
    .split('\\').join('\\\\')
    .split(';').join('\\;')
    .split(',').join('\\,')
    .split('\n').join('\\n');
}
function icsDateTimeFromTime(hhmm){
  // Build the first upcoming occurrence date for a given HH:MM, returns {dtstart, byday}
  const [h,m]=hhmm.split(':').map(Number);
  const now=new Date();
  const d=new Date(now);d.setHours(h,m,0,0);
  if(d<=now)d.setDate(d.getDate()+1);
  return d;
}
function fmtICSDate(d){
  return `${d.getFullYear()}${p2(d.getMonth()+1)}${p2(d.getDate())}T${p2(d.getHours())}${p2(d.getMinutes())}00`;
}
function buildICSCalendar(){
  // Group shifts by time -> collect which weekdays use that time (for entry and for exit)
  const timeDays={}; // 'HH:MM' -> Set of ics day codes
  S.shifts.forEach(s=>{
    if(s.start&&s.days){
      if(!timeDays[s.start])timeDays[s.start]=new Set();
      s.days.forEach(d=>timeDays[s.start].add(ICS_DAY_MAP[d]));
    }
    if(s.end&&s.days){
      if(!timeDays[s.end])timeDays[s.end]=new Set();
      s.days.forEach(d=>timeDays[s.end].add(ICS_DAY_MAP[d]));
    }
  });
  const times=Object.keys(timeDays).sort();
  if(!times.length)return null;

  let ics=[
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//GestorPro//Turno//PT-BR','CALSCALE:GREGORIAN'
  ];
  times.forEach((t,idx)=>{
    const days=Array.from(timeDays[t]).join(',');
    const startDate=icsDateTimeFromTime(t);
    const endDate=new Date(startDate.getTime()+15*60000); // 15min duration
    const uid=`gestorpro-turno-${idx}-${Date.now()}@gestorpro.local`;
    ics.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${fmtICSDate(new Date())}Z`,
      `DTSTART:${fmtICSDate(startDate)}`,
      `DTEND:${fmtICSDate(endDate)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${days}`,
      `SUMMARY:${icsEscape('🔔 Troca de turno · '+t)}`,
      `DESCRIPTION:${icsEscape('Verificar entradas e saídas dos chatters no horário de '+t+'. Gerar código de acesso.')}`,
      'BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:Troca de turno agora','TRIGGER:-PT0M','END:VALARM',
      'END:VEVENT'
    );
  });
  ics.push('END:VCALENDAR');
  return ics.join('\r\n');
}
function exportCalendar(){
  const ics=buildICSCalendar();
  if(!ics){toast('⚠️ Cadastre horários na escala semanal primeiro');return;}
  const blob=new Blob([ics],{type:'text/calendar;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download='turnos-gestorpro.ics';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  toast('📅 Calendário exportado! Abra o arquivo para importar.');
}

/* ===========================================================
   AGENDA
   =========================================================== */
function renderAgenda(){renderStudyList();renderOrientList();renderMidnightList();}
function renderOrientList(){
  const el=document.getElementById('orient-list');
  const today=todayKey();const todayO=S.orientations.filter(o=>o.date===today);
  const yest=new Date();yest.setDate(yest.getDate()-1);const yO=S.orientations.filter(o=>o.date===fmt(yest));
  let html='';
  if(yO.length){
    html+=`<div style="margin-bottom:12px"><div class="sectionlb" style="color:var(--warn)">↻ follow-up de ontem</div>
    ${yO.map(o=>{const c=S.chatters.find(ch=>ch.id===o.chatterId);return`<div class="logitem alt"><div class="logdate">${c?c.name:'?'} · ${o.shift}</div><div class="logtext">${o.text}</div></div>`;}).join('')}</div>`;
  }
  if(!todayO.length){html+='<div class="empty"><div class="empty-ic">🎯</div><div class="empty-tx">Nenhuma orientação hoje</div></div>';}
  else{
    html+='<div class="sectionlb">hoje</div>';
    html+=todayO.map(o=>{const c=S.chatters.find(ch=>ch.id===o.chatterId);
      return`<div class="logitem"><div class="logdate">${c?c.name:'?'} · turno ${o.shift}</div><div class="logtext">${o.text}</div>
      ${o.goal?`<div style="margin-top:5px;font-family:var(--font-mono);font-size:12px;color:var(--ok)">meta: ${money(parseFloat(o.goal))}</div>`:''}
      <button class="btn btn-icon btn-line" style="margin-top:8px" onclick="deleteOrientation('${o.id}')">✕</button></div>`;
    }).join('');
  }
  el.innerHTML=html;
}
function renderStudyList(){
  const el=document.getElementById('study-list');
  if(!S.studies.length){el.innerHTML='<div class="empty"><div class="empty-ic">📚</div><div class="empty-tx">Adicione itens de estudo</div></div>';return;}
  const pb={alta:'pill-bad',media:'pill-warn',baixa:'pill-flat'};
  el.innerHTML='<div class="tasklist">'+S.studies.map(s=>`<div class="taskrow ${s.done?'done':''}">
    <div class="tcheck ${s.done?'done':''}" onclick="toggleStudy('${s.id}')">${s.done?'✓':''}</div>
    <div class="tbody"><div class="ttext">${s.title}</div>
    <div class="tmeta-row"><span class="pill pill-info">${s.category}</span><span class="pill ${pb[s.priority]||'pill-flat'}">${s.priority}</span></div></div>
    <button class="btn btn-icon btn-line" onclick="deleteStudy('${s.id}')">✕</button>
  </div>`).join('')+'</div>';
}

/* ===========================================================
   TEAM
   =========================================================== */
let teamFilter='all';
document.getElementById('team-filter-tabs').addEventListener('click',e=>{
  const b=e.target.closest('.segtab');if(!b)return;
  teamFilter=b.dataset.lvl;
  document.querySelectorAll('#team-filter-tabs .segtab').forEach(x=>x.classList.remove('active'));b.classList.add('active');
  renderTeam(teamFilter);
});
function renderTeam(filter){
  teamFilter=filter;
  const list=document.getElementById('team-list');
  let chatters=S.chatters;
  if(filter!=='all')chatters=chatters.filter(c=>c.level===filter);
  if(!chatters.length){list.innerHTML='<div class="empty"><div class="empty-ic">▦</div><div class="empty-tx">Nenhum chatter encontrado</div></div>';return;}

  const eliteGroup=chatters.filter(c=>c.time==='elite');
  const basicoGroup=chatters.filter(c=>c.time!=='elite');

  const renderCard=c=>{
    const color=getComputedLevelColor(c.level);
    const revWeek=getChatterWeekRevenueTotal(c.id);
    const status=getChatterStatus(c.id,todayKey());
    const otMins=getChatterOvertimeOn(c.id,todayKey());
    const dotColor=status==='online'?'var(--ok)':status==='overtime'?'var(--warn)':'var(--text3)';
    const timeBadge=c.time==='elite'?`<span class="pill pill-warn" style="font-size:9px">⭐ Elite</span>`:`<span class="pill pill-flat" style="font-size:9px">Básico</span>`;
    return`<div class="teamcard" onclick="openChatterDetail('${c.id}')">
      <div class="ravatar" style="width:42px;height:42px;background:${color}22;color:${color}">${c.name.slice(0,2).toUpperCase()}</div>
      <div class="rinfo">
        <div style="display:flex;align-items:center;gap:6px"><span class="rname">${c.name}</span><div class="tc-status" style="background:${dotColor}"></div></div>
        <div class="rmeta">${c.discord||''} · ${moneyShort(revWeek)} semana</div>
        <div class="tmeta-row">${timeBadge}<span class="pill ${LVLCLASS[c.level]}" style="border:1px solid">${c.level}</span>${otMins>0?`<span class="pill pill-warn">+${otMins}min`:''}${c.watchtime?`<span class="pill pill-info">⏰ ${c.watchtime}</span>`:''}</div>
      </div>
      <span style="color:var(--text3);font-size:18px">›</span>
    </div>`;
  };

  let html='';
  if(eliteGroup.length){
    html+=`<div style="font-size:11px;font-weight:800;color:var(--warn);text-transform:uppercase;letter-spacing:.06em;margin:4px 0 8px">⭐ Time Elite (${eliteGroup.length})</div>`;
    html+=eliteGroup.map(renderCard).join('');
  }
  if(basicoGroup.length){
    html+=`<div style="font-size:11px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin:${eliteGroup.length?'16px':'4px'} 0 8px">Time Básico (${basicoGroup.length})</div>`;
    html+=basicoGroup.map(renderCard).join('');
  }
  list.innerHTML=html;
}
function generateWeeklyReport(chatterId){
  const c=S.chatters.find(ch=>ch.id===chatterId);
  if(!c)return;
  const wd=getWeekDates();
  const wkStart=`${wd[0].getDate()}/${wd[0].getMonth()+1}`;
  const wkEnd=`${wd[6].getDate()}/${wd[6].getMonth()+1}`;
  const wkey=getWeekKey();
  const now=new Date();
  const DAYS_BR=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const MONTHS_BR=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

  // --- Presença ---
  const weekAbsences=S.absences.filter(a=>a.chatterId===chatterId&&a.date>=fmt(wd[0])&&a.date<=fmt(wd[6]));
  const faltas=weekAbsences.filter(a=>a.type==='falta');
  const atrasos=weekAbsences.filter(a=>a.type==='atraso');
  const saidasAntes=weekAbsences.filter(a=>a.type==='saida_antecipada');

  // --- Hora extra ---
  let totalOT=0;
  wd.forEach(d=>totalOT+=getChatterOvertimeOn(chatterId,fmt(d)));

  // --- Faturamento ---
  const revWeek=getChatterWeekRevenue(chatterId);
  const meta=parseFloat((S.chatterWeekGoals[wkey]||{})[chatterId])||0;
  const metaPct=meta>0?Math.round((revWeek/meta)*100):null;
  const revByDay=wd.map(d=>{
    let v=0;S.models.forEach(m=>{v+=parseFloat(S.revenues[`${chatterId}_${m.id}_${fmt(d)}`])||0;});
    return{day:DAYS_BR[d.getDay()],date:`${d.getDate()}/${d.getMonth()+1}`,value:v};
  }).filter(d=>d.value>0);

  // --- Orientações da semana ---
  const orients=S.orientations.filter(o=>o.chatterId===chatterId&&o.date>=fmt(wd[0])&&o.date<=fmt(wd[6]));

  // --- Treinamentos ---
  const trainings=S.chatterTrainings.filter(t=>t.chatterId===chatterId);
  const trainingsDone=trainings.filter(t=>t.done);
  const trainingsPending=trainings.filter(t=>!t.done);

  // --- Build report ---
  const lines=[];
  lines.push(`**📊 Relatório de Desenvolvimento Semanal**`);
  lines.push(`**${c.name}** · ${c.level} · Semana ${wkStart}–${wkEnd}`);
  lines.push(``);

  // Presença
  lines.push(`**📋 Presença**`);
  if(!weekAbsences.length&&totalOT===0){
    lines.push(`✅ Semana completa, sem ocorrências`);
  } else {
    if(faltas.length) lines.push(`❌ Faltas: ${faltas.length}${faltas.some(f=>f.note)?` — ${faltas.map(f=>f.note).filter(Boolean).join(', ')}`:''}` );
    if(atrasos.length) lines.push(`⚠️ Atrasos: ${atrasos.length}${atrasos.some(a=>a.note)?` — ${atrasos.map(a=>a.note).filter(Boolean).join(', ')}`:''}` );
    if(saidasAntes.length) lines.push(`🔸 Saídas antecipadas: ${saidasAntes.length}`);
    if(totalOT>0) lines.push(`⏱️ Hora extra: ${totalOT} min`);
  }
  lines.push(``);

  // Faturamento
  lines.push(`**💰 Faturamento**`);
  lines.push(`Total da semana: **R$ ${revWeek.toLocaleString('pt-BR',{minimumFractionDigits:2})}**`);
  if(meta>0){
    const emoji=metaPct>=100?'🎯':metaPct>=75?'📈':'📉';
    lines.push(`${emoji} Meta: R$ ${meta.toLocaleString('pt-BR',{minimumFractionDigits:2})} · Atingido: ${metaPct}%`);
  }
  if(revByDay.length){
    lines.push(`Detalhe por dia:`);
    revByDay.forEach(d=>lines.push(`  ${d.day} (${d.date}): R$ ${d.value.toLocaleString('pt-BR',{minimumFractionDigits:2})}`));
  }
  lines.push(``);

  // Orientações
  if(orients.length){
    lines.push(`**🎯 Orientações recebidas**`);
    orients.forEach(o=>{
      lines.push(`• ${o.date} (${o.shift}): ${o.text}${o.goal?` _(meta R$ ${parseFloat(o.goal).toLocaleString('pt-BR')})_`:''}`);
    });
    lines.push(``);
  }

  // Treinamentos
  if(trainings.length){
    lines.push(`**📚 Treinamentos**`);
    if(trainingsDone.length) trainingsDone.forEach(t=>lines.push(`✅ ${t.title}`));
    if(trainingsPending.length) trainingsPending.forEach(t=>lines.push(`⏳ ${t.title}`));
    lines.push(``);
  }

  // Notas do gestor
  if(c.notes&&c.notes.trim()){
    lines.push(`**📝 Observações do gestor**`);
    lines.push(c.notes.trim());
    lines.push(``);
  }

  lines.push(`_Gerado em ${now.getDate()} ${MONTHS_BR[now.getMonth()]} ${now.getFullYear()} às ${p2(now.getHours())}:${p2(now.getMinutes())}_`);

  const text=lines.join('\n');

  // Show in modal with copy button
  document.getElementById('report-discord-name').textContent=c.name;
  document.getElementById('report-discord-text').value=text;
  openModal('m-discord-report');
}
function copyDiscordReport(){
  const ta=document.getElementById('report-discord-text');
  ta.select();ta.setSelectionRange(0,999999);
  try{
    document.execCommand('copy');
    toast('✅ Copiado! Cole no Discord.');
  }catch(e){
    // Fallback for mobile: try clipboard API
    if(navigator.clipboard){
      navigator.clipboard.writeText(ta.value).then(()=>toast('✅ Copiado! Cole no Discord.')).catch(()=>toast('Selecione o texto manualmente e copie'));
    }
  }
}
function openChatterDetail(id){
  const c=S.chatters.find(ch=>ch.id===id);if(!c)return;
  const color=getComputedLevelColor(c.level);
  const orients=S.orientations.filter(o=>o.chatterId===id).slice(-8).reverse();
  const absencesAll=S.absences.filter(a=>a.chatterId===id).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10);
  const revWeek=getChatterWeekRevenueTotal(id);
  const today=todayKey();
  const weekDates=getWeekDates();let weekOT=0;weekDates.forEach(d=>weekOT+=getChatterOvertimeOn(id,fmt(d)));
  const monthlyGoals=getChatterMonthlyGoalHistory(id);

  const revRows=S.models.map(m=>{
    const key=`${id}_${m.id}_${today}`;const val=S.revenues[key]||'';
    return`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px">
      <span style="font-size:13px;color:var(--text2)">${m.emoji||'🧩'} ${m.name}</span>
      <div style="display:flex;align-items:center;gap:5px"><span style="font-family:var(--font-mono);color:var(--text3);font-size:12px">R$</span>
      <input type="number" class="finput" style="width:84px;text-align:right;padding:6px 8px;font-size:13px;font-family:var(--font-mono)" value="${val}" placeholder="0" oninput="saveRevenue('${id}','${m.id}',this.value)"></div>
    </div>`;
  }).join('');

  const tb={falta:'pill-bad',atraso:'pill-warn',saida_antecipada:'pill-info'};
  const tl={falta:'Falta',atraso:'Atraso',saida_antecipada:'Saída antecip.'};
  const absencesHtml=absencesAll.length?absencesAll.map(a=>`
    <div class="reprow">
      <div><div class="replb">${a.date}</div>${a.note?`<div style="font-size:11px;color:var(--text3)">${a.note}</div>`:''}</div>
      <span class="pill ${tb[a.type]||'pill-flat'}">${tl[a.type]||a.type}</span>
    </div>`).join(''):'<div style="font-size:12px;color:var(--text3)">Nenhuma ocorrência registrada</div>';

  const monthlyGoalsHtml=monthlyGoals.length?monthlyGoals.map(g=>`
    <div class="reprow">
      <div class="replb">Semana de ${g.weekStart}</div>
      <div style="text-align:right">
        <span class="pill ${g.met?'pill-ok':'pill-bad'}">${g.met?'✓ bateu':'✕ não bateu'}</span>
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);margin-top:2px">${money(g.achieved)} / ${money(g.target)}</div>
      </div>
    </div>`).join(''):'<div style="font-size:12px;color:var(--text3)">Nenhuma meta definida este mês</div>';

  document.getElementById('chatter-detail-body').innerHTML=`
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
      <div class="ravatar" style="width:50px;height:50px;font-size:19px;background:${color}22;color:${color}">${c.name.slice(0,2).toUpperCase()}</div>
      <div><div style="font-size:17px;font-weight:700">${c.name}</div><div style="font-size:12px;color:var(--text2)">${c.discord||'sem discord'}</div>
      <span class="pill ${LVLCLASS[c.level]}" style="border:1px solid;margin-top:4px">${c.level}</span></div>
    </div>
    <div class="statgrid">
      <div class="statcell"><div class="statval" style="font-size:18px;color:var(--ok)">${moneyShort(revWeek)}</div><div class="statlb">Semana</div></div>
      <div class="statcell"><div class="statval" style="font-size:18px;color:var(--warn)">${weekOT}min</div><div class="statlb">H.Extra sem.</div></div>
    </div>
    ${S.models.length?`<div class="field"><label class="flabel">Faturamento hoje por modelo</label>${revRows}</div>`:''}
    <div class="field"><label class="flabel">Nível</label>
      <select class="fselect" id="dl-level-${id}">
        <option value="treinamento" ${c.level==='treinamento'?'selected':''}>Treinamento</option>
        <option value="teste" ${c.level==='teste'?'selected':''}>Teste</option>
        <option value="junior" ${c.level==='junior'?'selected':''}>Júnior</option>
        <option value="pleno" ${c.level==='pleno'?'selected':''}>Pleno</option>
        <option value="senior" ${c.level==='senior'?'selected':''}>Sênior</option>
      </select>
    </div>
    <div class="field"><label class="flabel">Time</label>
      <div style="display:flex;gap:8px">
        <button id="dl-time-basico-${id}" onclick="setChatterTime('${id}','basico')" style="flex:1;padding:8px;border-radius:8px;border:2px solid ${(c.time||'basico')==='basico'?'var(--info)':'var(--line)'};background:${(c.time||'basico')==='basico'?'var(--info-soft)':'transparent'};cursor:pointer;font-family:var(--font-display);font-weight:700;font-size:12.5px;color:${(c.time||'basico')==='basico'?'var(--info)':'var(--text2)'}">Time Básico</button>
        <button id="dl-time-elite-${id}" onclick="setChatterTime('${id}','elite')" style="flex:1;padding:8px;border-radius:8px;border:2px solid ${c.time==='elite'?'var(--warn)':'var(--line)'};background:${c.time==='elite'?'var(--warn-soft)':'transparent'};cursor:pointer;font-family:var(--font-display);font-weight:700;font-size:12.5px;color:${c.time==='elite'?'var(--warn)':'var(--text2)'}">⭐ Elite</button>
      </div>
    </div>
    <div class="field"><label class="flabel">⏰ Alarme de checagem de login</label>
      <input type="time" class="finput" id="dl-watch-${id}" value="${c.watchtime||''}">
    </div>
    <div class="field"><label class="flabel">Mapeamento / notas</label><textarea class="ftext" id="dl-notes-${id}">${c.notes||''}</textarea></div>
    <button class="btn btn-primary btn-block" style="margin-bottom:12px" onclick="saveChatterDetail('${id}')">Salvar alterações</button>

    <div class="divider"></div>
    <div class="sectionlb">📅 turnos desta semana</div>
    <div id="dl-shifts-${id}" style="margin-bottom:10px"></div>
    <button class="btn btn-ghost btn-block btn-sm" onclick="openAddShiftForChatter('${id}')">+ adicionar turno</button>

    <div class="divider"></div>
    <div class="sectionlb">🎯 orientações recentes</div>
    ${orients.length?orients.map(o=>`<div class="logitem"><div class="logdate">${o.date} · ${o.shift||''}</div><div class="logtext">${o.text}</div>${o.goal?`<div style="margin-top:4px;font-family:var(--font-mono);font-size:11.5px;color:var(--ok)">meta do dia: ${money(parseFloat(o.goal))}</div>`:''}</div>`).join(''):'<div style="color:var(--text3);font-size:13px">Nenhuma orientação</div>'}

    <div class="divider"></div>
    <div class="sectionlb">📚 treinamentos pendentes / feitos</div>
    <div id="training-list-${id}" style="margin-bottom:8px"></div>
    <div style="display:flex;gap:6px">
      <input class="finput" id="new-training-${id}" placeholder="Novo treinamento..." style="flex:1">
      <button class="btn btn-primary btn-sm" onclick="addChatterTraining('${id}')">+</button>
    </div>

    <div class="divider"></div>
    <div class="sectionlb">📊 faltas e atrasos</div>
    ${absencesHtml}

    <div class="divider"></div>
    <div class="sectionlb">🎯 metas do mês</div>
    ${monthlyGoalsHtml}

    <button class="btn btn-primary btn-block" style="margin-top:12px" onclick="generateWeeklyReport('${id}')">📊 Gerar relatório semanal para Discord</button>
    <button class="btn btn-danger btn-block" style="margin-top:8px" onclick="deleteChatter('${id}')">Remover chatter</button>
  `;
  openModal('m-chatter-detail');
  refreshChatterDetailTrainings(id);
  renderChatterShifts(id);
}
/* ===========================================================
   CHATTER PROFILE — shift management inline
   =========================================================== */
function renderChatterShifts(chatterId){
  const el=document.getElementById('dl-shifts-'+chatterId);
  if(!el)return;
  const shifts=S.shifts.filter(s=>s.chatterId===chatterId);
  const DAY_LABEL={seg:'Seg',ter:'Ter',qua:'Qua',qui:'Qui',sex:'Sex',sab:'Sáb',dom:'Dom'};
  if(!shifts.length){
    el.innerHTML='<div style="font-size:12.5px;color:var(--text3)">Nenhum turno cadastrado</div>';
    return;
  }
  el.innerHTML=shifts.map(s=>{
    const days=(s.days||[]).map(d=>DAY_LABEL[d]||d).join(', ');
    const t2=s.start2&&s.end2?` + ${s.start2}–${s.end2}`:'';
    const folga=s.folgaDia?` · folga: ${DAY_LABEL[s.folgaDia]||s.folgaDia}`:'';
    const models=(s.modelIds||[]).map(mid=>S.models.find(m=>m.id===mid)?.name).filter(Boolean).join(', ');
    return`<div style="background:var(--bg-soft);border-radius:9px;padding:10px 12px;margin-bottom:7px;display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
      <div style="flex:1;min-width:0">
        <div style="font-family:var(--font-mono);font-weight:700;font-size:12.5px;color:var(--warn)">${s.start}–${s.end}${t2}</div>
        <div style="font-size:11.5px;color:var(--text2);margin-top:2px">${days}${folga}</div>
        ${models?`<div style="font-size:11px;color:var(--text3);margin-top:1px">🧩 ${models}</div>`:''}
      </div>
      <div style="display:flex;gap:5px;flex-shrink:0">
        <button class="btn btn-ghost btn-xs" onclick="openEditShiftFromProfile('${s.id}','${chatterId}')">✎</button>
        <button class="btn btn-danger btn-xs" onclick="deleteShiftFromProfile('${s.id}','${chatterId}')">✕</button>
      </div>
    </div>`;
  }).join('');
}
function openAddShiftForChatter(chatterId){
  // Pre-select this chatter in the shift modal and open it
  document.getElementById('shift-edit-id').value='';
  openModal('m-shift');
  document.getElementById('shift-modal-title').textContent='Novo turno';
  setTimeout(()=>{
    document.getElementById('shift-chatter').value=chatterId;
  },40);
}
function openEditShiftFromProfile(shiftId,chatterId){
  openEditShift(shiftId);
  // After saving, re-render the profile shifts
  const origSave=window._profileSaveCallback;
  window._profileChaterId=chatterId;
}
function deleteShiftFromProfile(shiftId,chatterId){
  S.shifts=S.shifts.filter(s=>s.id!==shiftId);
  save();
  toast('Turno removido');
  renderChatterShifts(chatterId);
  renderScheduleForDay(selectedDay);
}

function saveChatterDetail(id){
  const c=S.chatters.find(ch=>ch.id===id);if(!c)return;
  const levelEl=document.getElementById('dl-level-'+id);
  const notesEl=document.getElementById('dl-notes-'+id);
  const watchEl=document.getElementById('dl-watch-'+id);
  if(levelEl)c.level=levelEl.value||c.level;
  if(notesEl)c.notes=notesEl.value; // intentional: allow clearing notes
  if(watchEl)c.watchtime=watchEl.value; // intentional: allow clearing alarm
  save();toast('✅ Atualizado!');renderTeam(teamFilter);
}
function deleteChatter(id){
  if(!confirm('Remover chatter? Isso também apaga faltas, orientações, treinamentos e histórico de ponto dele.'))return;
  S.chatters=S.chatters.filter(c=>c.id!==id);
  S.shifts=S.shifts.filter(s=>s.chatterId!==id);
  S.absences=S.absences.filter(a=>a.chatterId!==id);
  S.orientations=S.orientations.filter(o=>o.chatterId!==id);
  S.chatterTrainings=S.chatterTrainings.filter(t=>t.chatterId!==id);
  Object.keys(S.turnoLog).forEach(dateKey=>{
    S.turnoLog[dateKey]=S.turnoLog[dateKey].filter(e=>e.chatterId!==id);
  });
  Object.keys(S.midnightTasks).forEach(dateKey=>{
    S.midnightTasks[dateKey]=S.midnightTasks[dateKey].filter(t=>t.chatterId!==id);
  });
  Object.keys(S.chatterWeekGoals).forEach(wkey=>{
    delete S.chatterWeekGoals[wkey][id];
  });
  Object.keys(S.watchAlerts).forEach(dateKey=>{
    delete S.watchAlerts[dateKey][id];
  });
  Object.keys(S.revenues).forEach(key=>{
    if(key.startsWith(id+'_'))delete S.revenues[key];
  });
  save();closeModal('m-chatter-detail');toast('Chatter e histórico removidos');renderTeam(teamFilter);
}

/* ===========================================================
   CHATTER TRAININGS — pending/done list per chatter, separate
   from free-text notes, so the manager can track concrete
   to-dos for each person's development.
   =========================================================== */
function addChatterTraining(chatterId){
  const input=document.getElementById('new-training-'+chatterId);
  const title=input.value.trim();
  if(!title){toast('⚠️ Descreva o treinamento');return;}
  S.chatterTrainings.push({id:'tr'+Date.now(),chatterId,title,done:false,createdAt:todayKey()});
  save();
  input.value='';
  toast('✅ Treinamento adicionado!');
  refreshChatterDetailTrainings(chatterId);
}
function toggleChatterTraining(trainingId,chatterId){
  const t=S.chatterTrainings.find(x=>x.id===trainingId);
  if(t){
    t.done=!t.done;
    t.doneAt=t.done?todayKey():null; // record when marked done
    save();refreshChatterDetailTrainings(chatterId);
  }
}
function deleteChatterTraining(trainingId,chatterId){
  S.chatterTrainings=S.chatterTrainings.filter(x=>x.id!==trainingId);
  save();toast('Removido');refreshChatterDetailTrainings(chatterId);
}
function refreshChatterDetailTrainings(chatterId){
  const el=document.getElementById('training-list-'+chatterId);
  if(!el)return;
  const items=S.chatterTrainings.filter(t=>t.chatterId===chatterId);
  if(!items.length){el.innerHTML='<div style="font-size:12px;color:var(--text3)">Nenhum treinamento cadastrado</div>';return;}
  el.innerHTML=items.map(t=>`
    <div class="taskrow ${t.done?'done':''}" style="margin-bottom:6px">
      <div class="tcheck ${t.done?'done':''}" onclick="toggleChatterTraining('${t.id}','${chatterId}')">${t.done?'✓':''}</div>
      <div class="tbody"><div class="ttext" style="font-size:12.5px">${t.title}</div></div>
      <button class="btn btn-icon btn-line" onclick="deleteChatterTraining('${t.id}','${chatterId}')">✕</button>
    </div>`).join('');
}

/* ===========================================================
   FATURAMENTO
   =========================================================== */
/* ===========================================================
   RELATÓRIO SEMANAL COMPLETO
   Seções 1-4 e 6 são preenchidas automaticamente a partir dos
   dados do app. Seções 5, 7, 8 são manuais (com rascunho salvo).
   =========================================================== */
function renderReport_Weekly(){
  const wd=getWeekDates();
  const wkey=getWeekKey();
  const goals=S.chatterWeekGoals[wkey]||{};

  // Update week range header
  const rangeEl=document.getElementById('report-wk-range');
  if(rangeEl)rangeEl.textContent=`${wd[0].getDate()}/${wd[0].getMonth()+1} a ${wd[6].getDate()}/${wd[6].getMonth()+1}`;

  // ---- Section 1: Visão Geral ----
  let totalRev=0;
  const chatterRevs=S.chatters.map(c=>{
    let r=0;wd.forEach(wdate=>S.models.forEach(m=>{r+=parseFloat(S.revenues[`${c.id}_${m.id}_${fmt(wdate)}`])||0;}));
    return{c,r};
  }).filter(x=>x.r>0).sort((a,b)=>b.r-a.r);
  chatterRevs.forEach(x=>totalRev+=x.r);
  const avgRev=chatterRevs.length?totalRev/chatterRevs.length:0;
  const best=chatterRevs[0];
  const worst=chatterRevs[chatterRevs.length-1];
  const s1=document.getElementById('rpt-visao-geral');
  if(s1)s1.innerHTML=`
    <div class="reprow"><div class="replb">Faturamento total bruto</div><div class="repval" style="color:var(--ok);font-weight:800">${money(totalRev)}</div></div>
    <div class="reprow"><div class="replb">Média por chatter</div><div class="repval">${money(avgRev)}</div></div>
    <div class="reprow"><div class="replb">Melhor chatter</div><div class="repval" style="color:var(--ok)">${best?`${best.c.name} (${moneyShort(best.r)})`:'—'}</div></div>
    <div class="reprow"><div class="replb">Pior chatter</div><div class="repval" style="color:var(--bad)">${worst&&worst!==best?`${worst.c.name} (${moneyShort(worst.r)})`:'—'}</div></div>
  `;

  // ---- Section 2: Performance por Chatter ----
  const s2=document.getElementById('rpt-performance');
  if(s2){
    const ativos=S.chatters.filter(c=>c.level!=='treinamento'&&c.level!=='teste');
    if(!ativos.length){s2.innerHTML='<div style="color:var(--text3);font-size:12px">Nenhum chatter ativo cadastrado</div>';}
    else s2.innerHTML=ativos.map(c=>{
      let rev=0;let daysWorked=0;
      wd.forEach(wdate=>{
        let dayRev=0;S.models.forEach(m=>{dayRev+=parseFloat(S.revenues[`${c.id}_${m.id}_${fmt(wdate)}`])||0;});
        rev+=dayRev;if(dayRev>0)daysWorked++;
      });
      const extra=getChatterExtraRevenue(c.id);
      const revTotal=rev+extra;
      const avg=daysWorked>0?rev/daysWorked:0;
      const weekAbs=S.absences.filter(a=>a.chatterId===c.id&&a.date>=fmt(wd[0])&&a.date<=fmt(wd[6]));
      const orients=S.orientations.filter(o=>o.chatterId===c.id&&o.date>=fmt(wd[0])&&o.date<=fmt(wd[6]));
      const target=parseFloat(goals[c.id])||0;
      const pct=target>0?Math.round((rev/target)*100):null; // meta uses rev only, not extra
      const statusColor=weekAbs.filter(a=>a.type==='falta').length>=2?'var(--bad)':rev<avgRev*0.6?'var(--warn)':'var(--ok)';
      const statusLabel=weekAbs.filter(a=>a.type==='falta').length>=2?'Atenção':rev===0?'Atenção':'Ativo';
      const modelsWorked=[...new Set(S.shifts.filter(s=>s.chatterId===c.id&&s.days&&s.days.some(dk=>wd.map(w=>DAY_KEYS[w.getDay()]).includes(dk))).flatMap(s=>s.modelIds||[]))].map(mid=>S.models.find(m=>m.id===mid)?.name).filter(Boolean);
      return`<div style="background:var(--bg-soft);border-radius:10px;padding:12px;margin-bottom:10px;border-left:3px solid ${statusColor}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-weight:700;font-size:14px">${c.name}</div>
          <span class="pill" style="background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}">${statusLabel}</span>
        </div>
        <div class="reprow"><div class="replb">Cargo / Nível</div><div class="repval">${c.level}</div></div>
        <div class="reprow"><div class="replb">Modelo(s)</div><div class="repval">${modelsWorked.length?modelsWorked.join(', '):'—'}</div></div>
        <div class="reprow"><div class="replb">Faturamento semanal</div><div class="repval">${money(rev)}${pct!==null?` <span style="font-size:11px;color:${pct>=100?'var(--ok)':'var(--warn)'}">(${pct}% da meta)</span>`:''}</div></div>
        ${extra>0?`<div class="reprow"><div class="replb">⚡ Hora extra</div><div class="repval" style="color:var(--info)">${money(extra)} <span style="font-size:10px;color:var(--text3)">(não conta na meta)</span></div></div>`:''}
        ${extra>0?`<div class="reprow"><div class="replb">Total (incl. extra)</div><div class="repval" style="font-weight:800">${money(revTotal)}</div></div>`:''}
        <div class="reprow"><div class="replb">Média diária</div><div class="repval">${money(avg)}</div></div>
        <div class="reprow"><div class="replb">Ocorrências</div><div class="repval">${weekAbs.length?weekAbs.map(a=>({falta:'Falta',atraso:'Atraso',saida_antecipada:'Saída antecip.'})[a.type]||a.type).join(', '):'Nenhuma'}</div></div>
        <div class="field" style="margin-top:8px"><label class="flabel">Principal erro</label><input class="finput" id="rpt-erro-${c.id}" value="${getReportDraft('erro-'+c.id)}" placeholder="Descreva o erro principal..."></div>
        <div class="field"><label class="flabel">Ação tomada</label><input class="finput" id="rpt-acao-${c.id}" value="${getReportDraft('acao-'+c.id)}" placeholder="O que você fez a respeito..."></div>
        ${orients.length?`<div style="margin-top:6px;font-size:11.5px;color:var(--text2)">📋 ${orients.length} orientação(ões) esta semana</div>`:''}
      </div>`;
    }).join('');
  }

  // ---- Section 3: Chatters em Teste ----
  const testePanel=document.getElementById('rpt-teste-panel');
  const s3=document.getElementById('rpt-teste');
  const emTeste=S.chatters.filter(c=>c.level==='treinamento'||c.level==='teste');
  if(testePanel)testePanel.style.display=emTeste.length?'block':'none';
  if(s3&&emTeste.length){
    s3.innerHTML=emTeste.map(c=>{
      let rev=0;wd.forEach(wdate=>S.models.forEach(m=>{rev+=parseFloat(S.revenues[`${c.id}_${m.id}_${fmt(wdate)}`])||0;}));
      const created=c.createdAt?Math.floor((new Date()-new Date(c.createdAt))/86400000):0;
      const evolucao=getReportDraft('evolucao-'+c.id);
      const decisao=getReportDraft('decisao-'+c.id);
      return`<div style="background:var(--bg-soft);border-radius:12px;padding:14px;margin-bottom:12px;border:1.5px solid var(--line)">

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div>
            <div style="font-weight:700;font-size:14px">${c.name}</div>
            <div style="font-size:11.5px;color:var(--text3)">${created}d em teste · ${money(rev)} esta semana</div>
          </div>
          <span class="pill pill-info" style="font-size:10px">${c.level}</span>
        </div>

        <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:7px">Evolução</div>
        <div style="display:flex;gap:8px;margin-bottom:10px">
          <button onclick="setReportToggle('evolucao-${c.id}','Boa','rpt-evo-${c.id}')" id="rpt-evo-${c.id}-Boa"
            style="flex:1;padding:10px;border-radius:9px;border:2px solid ${evolucao==='Boa'?'var(--ok)':'var(--line)'};background:${evolucao==='Boa'?'var(--ok-soft)':'var(--bg)'};cursor:pointer;font-family:var(--font-display);font-weight:700;font-size:13px;color:${evolucao==='Boa'?'var(--ok)':'var(--text2)'}">
            ✅ Evoluiu bem
          </button>
          <button onclick="setReportToggle('evolucao-${c.id}','Ruim','rpt-evo-${c.id}')" id="rpt-evo-${c.id}-Ruim"
            style="flex:1;padding:10px;border-radius:9px;border:2px solid ${evolucao==='Ruim'?'var(--bad)':'var(--line)'};background:${evolucao==='Ruim'?'var(--bad-soft)':'var(--bg)'};cursor:pointer;font-family:var(--font-display);font-weight:700;font-size:13px;color:${evolucao==='Ruim'?'var(--bad)':'var(--text2)'}">
            ❌ Evoluiu mal
          </button>
        </div>

        <div class="field">
          <label class="flabel">Por quê? (erros, comportamento, observações)</label>
          <textarea class="ftext" id="rpt-erroteste-${c.id}" style="min-height:60px" placeholder="Ex: dificuldade em manter ritmo, erros de comunicação..."
            onblur="saveReportDraftField('erroteste-${c.id}',this.value)">${getReportDraft('erroteste-'+c.id)}</textarea>
        </div>

        <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin:10px 0 7px">Decisão</div>
        <div style="display:flex;gap:6px">
          ${['Aprovar','Continuar','Reprovar'].map(op=>{
            const colors={Aprovar:'var(--ok)',Continuar:'var(--warn)',Reprovar:'var(--bad)'};
            const bgs={Aprovar:'var(--ok-soft)',Continuar:'var(--warn-soft)',Reprovar:'var(--bad-soft)'};
            const sel=decisao===op;
            return`<button onclick="setReportToggle('decisao-${c.id}','${op}','rpt-dec-${c.id}')" id="rpt-dec-${c.id}-${op}"
              style="flex:1;padding:8px 4px;border-radius:8px;border:2px solid ${sel?colors[op]:'var(--line)'};background:${sel?bgs[op]:'var(--bg)'};cursor:pointer;font-family:var(--font-display);font-weight:700;font-size:12px;color:${sel?colors[op]:'var(--text2)'}">
              ${op}
            </button>`;
          }).join('')}
        </div>
      </div>`;
    }).join('');
  }

  // ---- Section 4: Evolução dos Novos ----
  const s4=document.getElementById('rpt-evolucao');
  if(s4&&emTeste.length){
    const aprovaram=emTeste.filter(c=>getReportDraft('decisao-'+c.id)==='Aprovar').length;
    const reprovaram=emTeste.filter(c=>getReportDraft('decisao-'+c.id)==='Reprovar').length;
    const dificuldade=emTeste.filter(c=>getReportDraft('evolucao-'+c.id)==='Ruim'||getReportDraft('evolucao-'+c.id)==='Média').length;
    const evoluiram=emTeste.filter(c=>getReportDraft('evolucao-'+c.id)==='Boa').length;
    s4.innerHTML=`
      <div class="reprow"><div class="replb">Quantos entraram</div><div class="repval">${emTeste.length}</div></div>
      <div class="reprow"><div class="replb">Evoluíram bem</div><div class="repval" style="color:var(--ok)">${evoluiram}</div></div>
      <div class="reprow"><div class="replb">Com dificuldade</div><div class="repval" style="color:var(--warn)">${dificuldade}</div></div>
      <div class="reprow"><div class="replb">Reprovados</div><div class="repval" style="color:var(--bad)">${reprovaram}</div></div>
    `;
  } else if(s4){
    s4.innerHTML='<div style="color:var(--text3);font-size:12px">Nenhum chatter em teste/treinamento</div>';
  }

  // ---- Section 6: Ações Realizadas ----
  const s6=document.getElementById('rpt-acoes');
  if(s6){
    const wkStart=fmt(wd[0]),wkEnd=fmt(wd[6]);
    // Count trainings marked done this week (use doneAt if available, else createdAt)
    const trainsDone=S.chatterTrainings.filter(t=>{
      if(!t.done)return false;
      const doneDate=t.doneAt||t.createdAt||'';
      return doneDate>=wkStart&&doneDate<=wkEnd;
    }).length;
    const corrections=S.orientations.filter(o=>o.date>=wkStart&&o.date<=wkEnd).length;
    s6.innerHTML=`
      <div class="reprow"><div class="replb">Treinamentos feitos</div><div class="repval">${trainsDone}</div></div>
      <div class="reprow"><div class="replb">Orientações/correções</div><div class="repval">${corrections}</div></div>
    `;
  }

  // Restore saved draft values for manual fields
  ['erro1','erro2','erro3','prob1','prob2','plano1','plano2','plano3','ajustes'].forEach(key=>{
    const el=document.getElementById('rpt-'+key);
    if(el&&!el.value)el.value=getReportDraft(key)||'';
  });
}

function getReportDraft(key){
  const wkey=getWeekKey();
  return(S.reportDrafts&&S.reportDrafts[wkey]&&S.reportDrafts[wkey][key])||'';
}
function saveReportDraftField(key,value){
  const wkey=getWeekKey();
  if(!S.reportDrafts)S.reportDrafts={};
  if(!S.reportDrafts[wkey])S.reportDrafts[wkey]={};
  S.reportDrafts[wkey][key]=value;
  save();
}
function setReportToggle(draftKey,value,btnGroupPrefix){
  saveReportDraftField(draftKey,value);
  // Update button visual states
  const options=value==='Boa'||value==='Ruim'?['Boa','Ruim']:['Aprovar','Continuar','Reprovar'];
  const colorMap={
    Boa:'var(--ok)',Ruim:'var(--bad)',
    Aprovar:'var(--ok)',Continuar:'var(--warn)',Reprovar:'var(--bad)'
  };
  const bgMap={
    Boa:'var(--ok-soft)',Ruim:'var(--bad-soft)',
    Aprovar:'var(--ok-soft)',Continuar:'var(--warn-soft)',Reprovar:'var(--bad-soft)'
  };
  options.forEach(op=>{
    const btn=document.getElementById(`${btnGroupPrefix}-${op}`);
    if(!btn)return;
    const sel=op===value;
    btn.style.borderColor=sel?colorMap[op]:'var(--line)';
    btn.style.background=sel?bgMap[op]:'var(--bg)';
    btn.style.color=sel?colorMap[op]:'var(--text2)';
  });
}
function saveReportDraft(){
  const wkey=getWeekKey();
  if(!S.reportDrafts)S.reportDrafts={};
  if(!S.reportDrafts[wkey])S.reportDrafts[wkey]={};
  const fields=['erro1','erro2','erro3','prob1','prob2','plano1','plano2','plano3','ajustes'];
  fields.forEach(key=>{
    const el=document.getElementById('rpt-'+key);
    if(el)S.reportDrafts[wkey][key]=el.value;
  });
  // Save chatter-level text fields (evolucao/decisao are saved immediately via setReportToggle)
  S.chatters.forEach(c=>{
    ['erro','acao','erroteste'].forEach(f=>{
      const el=document.getElementById(`rpt-${f}-${c.id}`);
      if(el)S.reportDrafts[wkey][`${f}-${c.id}`]=el.value;
    });
  });
  save();
  toast('💾 Rascunho salvo!');
}
function generateFullReport(){
  saveReportDraft();
  const wd=getWeekDates();
  const wkey=getWeekKey();
  const goals=S.chatterWeekGoals[wkey]||{};
  const d=key=>getReportDraft(key);
  const wkStart=fmt(wd[0]),wkEnd=fmt(wd[6]);

  let totalRev=0;
  const chatterRevs=S.chatters.map(c=>{
    let r=0;wd.forEach(wdate=>S.models.forEach(m=>{r+=parseFloat(S.revenues[`${c.id}_${m.id}_${fmt(wdate)}`])||0;}));
    totalRev+=r;return{c,r};
  }).sort((a,b)=>b.r-a.r);
  const avgRev=chatterRevs.filter(x=>x.r>0).length?totalRev/chatterRevs.filter(x=>x.r>0).length:0;
  const best=chatterRevs[0];
  const worst=[...chatterRevs].reverse().find(x=>x.r>0);

  const lines=[];
  lines.push(`📊 RELATÓRIO SEMANAL CHAT`);
  lines.push(`(DATA: ${wd[0].getDate()}/${wd[0].getMonth()+1} à ${wd[6].getDate()}/${wd[6].getMonth()+1})`);
  lines.push(``);
  lines.push(`1. VISÃO GERAL`);
  lines.push(`● Faturamento total (bruto): ${money(totalRev)}`);
  lines.push(`● Média por chatter: ${money(avgRev)}`);
  lines.push(`● Melhor chatter: ${best?`${best.c.name} (${moneyShort(best.r)})`:'—'}`);
  lines.push(`● Pior chatter: ${worst&&worst!==best?`${worst.c.name} (${moneyShort(worst.r)})`:'—'}`);
  lines.push(``);
  lines.push(`2. PERFORMANCE POR CHATTER`);
  const ativos=S.chatters.filter(c=>c.level!=='treinamento'&&c.level!=='teste');
  ativos.forEach(c=>{
    let rev=0;let daysWorked=0;
    wd.forEach(dd=>{let dr=0;S.models.forEach(m=>{dr+=parseFloat(S.revenues[`${c.id}_${m.id}_${fmt(dd)}`])||0;});rev+=dr;if(dr>0)daysWorked++;});
    const avg=daysWorked>0?rev/daysWorked:0;
    const weekAbs=S.absences.filter(a=>a.chatterId===c.id&&a.date>=wkStart&&a.date<=wkEnd);
    const target=parseFloat(goals[c.id])||0;
    const pct=target>0?`${Math.round((rev/target)*100)}% da meta`:'sem meta definida';
    const statusLabel=weekAbs.filter(a=>a.type==='falta').length>=2?'Atenção':rev===0?'Atenção':'Ativo';
    const modelsWorked=[...new Set(S.shifts.filter(s=>s.chatterId===c.id&&s.days&&s.days.some(dk=>wd.map(w=>DAY_KEYS[w.getDay()]).includes(dk))).flatMap(s=>s.modelIds||[]))].map(mid=>S.models.find(m=>m.id===mid)?.name).filter(Boolean);
    lines.push(`Nome: ${c.name}`);
    lines.push(`● Status: ${statusLabel}`);
    lines.push(`● Cargo: ${c.level}`);
    lines.push(`● Modelo: ${modelsWorked.length?modelsWorked.join(', '):'—'}`);
    lines.push(`● Faturamento semanal: ${money(rev)} (${pct})`);
    lines.push(`● Média diária: ${money(avg)}`);
    lines.push(`● Principal erro: ${d('erro-'+c.id)||'—'}`);
    lines.push(`● Ação tomada: ${d('acao-'+c.id)||'—'}`);
    lines.push(``);
  });
  const emTeste=S.chatters.filter(c=>c.level==='treinamento'||c.level==='teste');
  if(emTeste.length){
    lines.push(`3. CHATTERS EM TESTE`);
    emTeste.forEach(c=>{
      let rev=0;wd.forEach(dd=>S.models.forEach(m=>{rev+=parseFloat(S.revenues[`${c.id}_${m.id}_${fmt(dd)}`])||0;}));
      const created=c.createdAt?Math.floor((new Date()-new Date(c.createdAt))/86400000):0;
      lines.push(`Nome: ${c.name}`);
      lines.push(`● Dias em teste: ${created}`);
      lines.push(`● Faturamento: ${money(rev)}`);
      lines.push(`● Evolução: ${d('evolucao-'+c.id)||'—'}`);
      lines.push(`● Principais erros: ${d('erroteste-'+c.id)||'—'}`);
      lines.push(`● Decisão: ${d('decisao-'+c.id)||'—'}`);
      lines.push(``);
    });
    const evoluiram=emTeste.filter(c=>d('evolucao-'+c.id)==='Boa').length;
    const dificuldade=emTeste.filter(c=>d('evolucao-'+c.id)==='Ruim'||d('evolucao-'+c.id)==='Média').length;
    const reprovaram=emTeste.filter(c=>d('decisao-'+c.id)==='Reprovar').length;
    lines.push(`4. EVOLUÇÃO DOS NOVOS`);
    lines.push(`● Quantos entraram: ${emTeste.length}`);
    lines.push(`● Evoluíram bem: ${evoluiram}`);
    lines.push(`● Com dificuldade: ${dificuldade}`);
    lines.push(`● Reprovados: ${reprovaram}`);
    lines.push(``);
  }
  lines.push(`5. MEUS PRINCIPAIS ERROS DA SEMANA`);
  lines.push(`● Erro 1: ${d('erro1')||'—'}`);
  lines.push(`● Erro 2: ${d('erro2')||'—'}`);
  lines.push(`● Erro 3: ${d('erro3')||'—'}`);
  lines.push(``);
  const trainsDone=S.chatterTrainings.filter(t=>{
    if(!t.done)return false;
    const doneDate=t.doneAt||t.createdAt||'';
    return doneDate>=wkStart&&doneDate<=wkEnd;
  }).length;
  const corrections=S.orientations.filter(o=>o.date>=wkStart&&o.date<=wkEnd).length;
  lines.push(`6. AÇÕES REALIZADAS`);
  lines.push(`● Treinamentos feitos: ${trainsDone}`);
  lines.push(`● Correções aplicadas: ${corrections}`);
  lines.push(`● Ajustes na operação: ${d('ajustes')||'—'}`);
  lines.push(``);
  lines.push(`7. PROBLEMAS ENCONTRADOS`);
  lines.push(`● Problema 1: ${d('prob1')||'—'}`);
  lines.push(`● Problema 2: ${d('prob2')||'—'}`);
  lines.push(``);
  lines.push(`8. PLANO PARA PRÓXIMA SEMANA`);
  lines.push(`● Ação 1: ${d('plano1')||'—'}`);
  lines.push(`● Ação 2: ${d('plano2')||'—'}`);
  lines.push(`● Ação 3: ${d('plano3')||'—'}`);

  const text=lines.join('\n');
  document.getElementById('rpt-output').value=text;
  document.getElementById('rpt-output-panel').style.display='block';
  document.getElementById('rpt-output-panel').scrollIntoView({behavior:'smooth'});
  toast('✅ Relatório gerado!');
}
function copyFullReport(){
  const ta=document.getElementById('rpt-output');
  ta.select();ta.setSelectionRange(0,999999);
  try{
    document.execCommand('copy');
    toast('✅ Copiado! Cole no Discord.');
  }catch(e){
    if(navigator.clipboard)navigator.clipboard.writeText(ta.value).then(()=>toast('✅ Copiado!')).catch(()=>toast('Selecione o texto manualmente'));
  }
}

let selectedFatDate=todayKey(); // currently selected date for revenue entry

function renderFat(){
  renderModelsList();
  const picker=document.getElementById('fat-date-picker');
  if(picker)picker.value=selectedFatDate;
  const dateLb=document.getElementById('fat-date-lb');
  if(dateLb)dateLb.textContent=selectedFatDate===todayKey()?'Hoje · '+selectedFatDate:selectedFatDate;
  renderRevenueTable();
  renderMetaProgress();
  renderExtraProgress();
  renderChatterAnalysis();
  renderReport('week');
  renderDailyByModel();
  renderDailyByChatter();
  renderChatterGoals();
}
function changeFatDate(offset){
  const d=new Date(selectedFatDate+'T12:00:00');
  d.setDate(d.getDate()+offset);
  selectedFatDate=fmt(d);
  renderFat();
}
function setFatDate(val){
  if(val)selectedFatDate=val;
  renderFat();
}
function renderModelsList(){
  const el=document.getElementById('models-list');
  if(!S.models.length){el.innerHTML='<div style="color:var(--text3);font-size:13px">Nenhum modelo. Clique + modelo.</div>';return;}
  el.innerHTML='<div style="display:flex;flex-wrap:wrap;gap:6px">'+S.models.map(m=>`<div style="display:inline-flex;align-items:center;gap:6px;background:var(--bg-soft);border:1px solid var(--line);border-radius:8px;padding:5px 10px">
    <span>${m.emoji||'🧩'}</span><span style="font-size:13px;font-weight:600">${m.name}</span>
    <button onclick="deleteModel('${m.id}')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:13px">✕</button>
  </div>`).join('')+'</div>';
}
function renderRevenueTable(){
  const el=document.getElementById('revenue-table');
  if(!S.models.length){el.innerHTML='<div class="empty"><div class="empty-tx">Cadastre modelos para lançar faturamento</div></div>';return;}
  const dateKey=selectedFatDate;
  const isToday=dateKey===todayKey();

  // For selected date: show chatters who worked OR have revenue on that day
  // Plus all chatters (so you can edit any day freely)
  const workedIds=new Set(getChattersThatWorkedOn(dateKey));
  // Always show everyone when editing a past date
  let activeChatters=isToday
    ?S.chatters.filter(c=>workedIds.has(c.id))
    :S.chatters; // show all chatters for past days
  const restChatters=isToday?S.chatters.filter(c=>!workedIds.has(c.id)):[];

  if(!S.chatters.length){el.innerHTML='<div class="empty"><div class="empty-tx">Cadastre chatters para lançar faturamento</div></div>';return;}

  let html='';
  if(!activeChatters.length&&isToday){
    html+='<div class="empty" style="padding:18px"><div class="empty-tx">Nenhum chatter escalado ou com entrada hoje.<br>Marque entrada na aba Turno ou use "+ adicionar".</div></div>';
  } else {
    html+=`<div style="overflow-x:auto"><table class="rtable"><thead><tr><th>Chatter</th>${S.models.map(m=>`<th style="text-align:right">${m.emoji} ${m.name}</th>`).join('')}<th style="text-align:right;color:var(--ok)">Total</th></tr></thead><tbody>`;
    activeChatters.forEach(c=>{
      let rt=0;
      const cells=S.models.map(m=>{
        const key=`${c.id}_${m.id}_${dateKey}`;
        const val=S.revenues[key]||'';
        rt+=parseFloat(val)||0;
        return`<td style="text-align:right"><input type="number" class="rinput" value="${val}" placeholder="—" oninput="saveRevenue('${c.id}','${m.id}',this.value,'${dateKey}')"></td>`;
      }).join('');
      html+=`<tr><td><div style="font-weight:700;font-size:13px">${c.name}</div></td>${cells}<td style="text-align:right;font-family:var(--font-mono);font-weight:800;color:var(--ok)">${moneyShort(rt)}</td></tr>`;
    });
    html+='<tr class="rtotalrow"><td>TOTAL</td>';
    S.models.forEach(m=>{let ct=0;activeChatters.forEach(c=>{ct+=parseFloat(S.revenues[`${c.id}_${m.id}_${dateKey}`])||0;});html+=`<td style="text-align:right">${moneyShort(ct)}</td>`;});
    const activeTotal=activeChatters.reduce((sum,c)=>sum+S.models.reduce((s2,m)=>s2+(parseFloat(S.revenues[`${c.id}_${m.id}_${dateKey}`])||0),0),0);
    html+=`<td style="text-align:right">${moneyShort(activeTotal)}</td></tr></tbody></table></div>`;
  }

  if(restChatters.length){
    html+=`<div style="margin-top:12px">
      <button class="btn btn-line btn-sm btn-block" onclick="toggleRestChatters()">+ adicionar lançamento de outro chatter (${restChatters.length} não escalado${restChatters.length>1?'s':''} hoje)</button>
      <div id="rest-chatters-panel" style="display:none;margin-top:8px">
        ${restChatters.map(c=>`<button class="chip" style="margin:3px" onclick="forceAddToday('${c.id}')">+ ${c.name}</button>`).join('')}
      </div>
    </div>`;
  }

  el.innerHTML=html;
}
function toggleRestChatters(){
  const p=document.getElementById('rest-chatters-panel');
  if(p)p.style.display=p.style.display==='none'?'block':'none';
}
function forceAddToday(chatterId){
  // Manually mark as "in" today so they appear in the revenue table without affecting shift schedule
  const today=todayKey();
  if(!S.turnoLog[today])S.turnoLog[today]=[];
  S.turnoLog[today].push({id:'tl'+Date.now()+Math.random().toString(36).slice(2,6),chatterId,action:'in',time:nowHHMM(),manualAdd:true});
  save();renderRevenueTable();renderTurnoBoard();renderHome();
  const c=S.chatters.find(ch=>ch.id===chatterId);
  toast(`✅ ${c?c.name:'?'} adicionado ao lançamento de hoje`);
}
document.getElementById('report-period-tabs').addEventListener('click',e=>{
  const b=e.target.closest('.segtab');if(!b)return;
  document.getElementById('report-period-tabs').querySelectorAll('.segtab').forEach(x=>x.classList.remove('active'));b.classList.add('active');
  renderReport(b.dataset.rep);
});
function renderReport(period){
  const el=document.getElementById('report-body');
  const wd=getWeekDates();const today=new Date();
  if(period==='week'){
    let total=0;wd.forEach(d=>S.chatters.forEach(c=>S.models.forEach(m=>{total+=parseFloat(S.revenues[`${c.id}_${m.id}_${fmt(d)}`])||0;})));
    el.innerHTML=`<div style="font-family:var(--font-mono);font-size:26px;font-weight:700;color:var(--ok);text-align:center;padding:6px 0">${money(total)}</div>
    <div class="divider"></div><div class="sectionlb">por modelo</div>
    ${S.models.map(m=>{let r=0;wd.forEach(d=>S.chatters.forEach(c=>{r+=parseFloat(S.revenues[`${c.id}_${m.id}_${fmt(d)}`])||0;}));return`<div class="reprow"><div class="replb">${m.emoji} ${m.name}</div><div class="repval">${money(r)}</div></div>`;}).join('')}
    <div class="divider"></div><div class="sectionlb">por chatter</div>
    ${S.chatters.map(c=>`<div class="reprow"><div class="replb">${c.name}</div><div class="repval">${money(getChatterWeekRevenueTotal(c.id))}</div></div>`).join('')}`;
  } else {
    const year=today.getFullYear(),month=today.getMonth();
    const daysInMonthSoFar=Array.from({length:today.getDate()},(_,i)=>new Date(year,month,i+1));
    let total=0;daysInMonthSoFar.forEach(d=>{const key=fmt(d);S.chatters.forEach(c=>S.models.forEach(m=>{total+=parseFloat(S.revenues[`${c.id}_${m.id}_${key}`])||0;}));});
    el.innerHTML=`<div style="font-family:var(--font-mono);font-size:26px;font-weight:700;color:var(--ok);text-align:center;padding:6px 0">${money(total)}</div>
    <div style="text-align:center;font-size:12px;color:var(--text2);margin-bottom:8px">${MONTHS[month]} ${year}</div>
    <div class="divider"></div><div class="sectionlb">por modelo</div>
    ${S.models.map(m=>{let r=0;daysInMonthSoFar.forEach(d=>{const key=fmt(d);S.chatters.forEach(c=>{r+=parseFloat(S.revenues[`${c.id}_${m.id}_${key}`])||0;});});return`<div class="reprow"><div class="replb">${m.emoji} ${m.name}</div><div class="repval">${money(r)}</div></div>`;}).join('')}
    <div class="divider"></div><div class="sectionlb">por chatter</div>
    ${S.chatters.map(c=>{let r=0;daysInMonthSoFar.forEach(d=>{const key=fmt(d);S.models.forEach(m=>{r+=parseFloat(S.revenues[`${c.id}_${m.id}_${key}`])||0;});});return`<div class="reprow"><div class="replb">${c.name}</div><div class="repval">${money(r)}</div></div>`;}).join('')}`;
  }
}
function buildRevReport(){
  const el=document.getElementById('revreport-body');
  const wd=getWeekDates();let html='';
  wd.forEach((d,i)=>{
    const key=fmt(d);let dayTotal=0;
    const breakdown=S.models.map(m=>{let mt=0;S.chatters.forEach(c=>{mt+=parseFloat(S.revenues[`${c.id}_${m.id}_${key}`])||0;});dayTotal+=mt;
      return mt>0?`<div style="display:flex;justify-content:space-between;padding:3px 0 3px 10px"><span style="font-size:12px;color:var(--text2)">${m.emoji} ${m.name}</span><span style="font-family:var(--font-mono);font-size:12px">${money(mt)}</span></div>`:'';}).join('');
    html+=`<div class="reprow" style="flex-direction:column;align-items:stretch"><div style="display:flex;justify-content:space-between"><span style="font-weight:700">${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'][i]} ${d.getDate()}/${d.getMonth()+1}</span><span style="font-family:var(--font-mono);font-weight:800;color:var(--ok)">${money(dayTotal)}</span></div>${breakdown}</div>`;
  });
  el.innerHTML=html||'<div class="empty"><div class="empty-tx">Nenhum lançamento</div></div>';
}

/* ===========================================================
   DAILY BREAKDOWN BY MODEL — day-by-day table for each model,
   across the current week.
   =========================================================== */
function renderDailyByModel(){
  const el=document.getElementById('daily-by-model');
  if(!el)return;
  if(!S.models.length){el.innerHTML='<div class="empty"><div class="empty-tx">Cadastre modelos para ver o diário</div></div>';return;}
  const wd=getWeekDates();
  const dayLabels=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  let html=`<div style="overflow-x:auto"><table class="rtable"><thead><tr><th>Modelo</th>${dayLabels.map(d=>`<th style="text-align:right">${d}</th>`).join('')}<th style="text-align:right;color:var(--ok)">Total</th></tr></thead><tbody>`;
  S.models.forEach(m=>{
    let rowTotal=0;
    const cells=wd.map(d=>{
      let v=0;S.chatters.forEach(c=>{v+=parseFloat(S.revenues[`${c.id}_${m.id}_${fmt(wdate)}`])||0;});
      rowTotal+=v;
      return`<td style="text-align:right;font-family:var(--font-mono);font-size:11.5px">${v>0?v.toLocaleString('pt-BR',{maximumFractionDigits:0}):'—'}</td>`;
    }).join('');
    html+=`<tr><td><div style="font-weight:700;font-size:13px">${m.emoji} ${m.name}</div></td>${cells}<td style="text-align:right;font-family:var(--font-mono);font-weight:800;color:var(--ok)">${moneyShort(rowTotal)}</td></tr>`;
  });
  html+='<tr class="rtotalrow"><td>TOTAL</td>';
  wd.forEach(d=>{
    let dayTotal=0;S.chatters.forEach(c=>S.models.forEach(m=>{dayTotal+=parseFloat(S.revenues[`${c.id}_${m.id}_${fmt(wdate)}`])||0;}));
    html+=`<td style="text-align:right;font-size:11.5px">${dayTotal>0?dayTotal.toLocaleString('pt-BR',{maximumFractionDigits:0}):'—'}</td>`;
  });
  html+=`<td style="text-align:right">${moneyShort(getWeekTotalRevenue())}</td></tr></tbody></table></div>`;
  el.innerHTML=html;
}

/* ===========================================================
   DAILY BREAKDOWN BY CHATTER — day-by-day table for each
   chatter, across the current week.
   =========================================================== */
function renderDailyByChatter(){
  const el=document.getElementById('daily-by-chatter');
  if(!el)return;
  if(!S.models.length){el.innerHTML='<div class="empty"><div class="empty-tx">Cadastre modelos para ver o diário</div></div>';return;}

  const today=todayKey();
  const todayDayKey=getTodayDayKey();

  // Build model -> chatters map from shifts (chatter linked to model via shift.modelIds)
  // A chatter can work multiple models but show under each one they're assigned to
  const modelChatters={}; // modelId -> Set of chatterIds
  S.models.forEach(m=>{ modelChatters[m.id]=new Set(); });
  S.shifts.forEach(s=>{
    (s.modelIds||[]).forEach(mid=>{
      if(modelChatters[mid])modelChatters[mid].add(s.chatterId);
    });
  });

  let html='';

  S.models.forEach(m=>{
    const chatterIds=[...modelChatters[m.id]];
    // Also include chatters who have revenue for this model today even if not in shift
    S.chatters.forEach(c=>{
      const rev=parseFloat(S.revenues[`${c.id}_${m.id}_${today}`])||0;
      if(rev>0)chatterIds.push(c.id);
    });
    const uniqueIds=[...new Set(chatterIds)];
    if(!uniqueIds.length)return;

    const chattersData=uniqueIds.map(cid=>{
      const c=S.chatters.find(ch=>ch.id===cid);
      if(!c)return null;
      const rev=parseFloat(S.revenues[`${c.id}_${m.id}_${today}`])||0;
      return{c,rev};
    }).filter(Boolean).sort((a,b)=>b.rev-a.rev);

    const modelTotal=chattersData.reduce((s,x)=>s+x.rev,0);

    html+=`<div style="background:var(--bg-soft);border-radius:12px;padding:14px;margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:15px;font-weight:700">${m.emoji||'🧩'} ${m.name}</div>
        <div style="font-family:var(--font-mono);font-weight:800;font-size:15px;color:var(--ok)">${money(modelTotal)}</div>
      </div>
      ${chattersData.map(({c,rev},i)=>`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;${i<chattersData.length-1?'border-bottom:1px solid var(--line)':''}">
          <div style="font-size:13.5px;font-weight:600">${c.name}</div>
          <div style="display:flex;align-items:center;gap:8px">
            <input type="number" class="finput" style="width:90px;text-align:right;padding:5px 8px;font-size:13px;font-family:var(--font-mono)"
              value="${rev||''}" placeholder="0"
              oninput="saveRevenue('${c.id}','${m.id}',this.value)">
          </div>
        </div>`).join('')}
    </div>`;
  });

  if(!html)html='<div style="font-size:12.5px;color:var(--text3);padding:8px 0">Nenhum chatter vinculado a modelos — configure os turnos na aba Turno</div>';
  el.innerHTML=html;
}
function getWeekTotalRevenue(){
  let t=0;
  getWeekDates().forEach(d=>S.chatters.forEach(c=>S.models.forEach(m=>{t+=parseFloat(S.revenues[`${c.id}_${m.id}_${fmt(d)}`])||0;})));
  // Include hora extra from parsed reports in the grand total display
  const wkey=getWeekKey();
  (S.horaExtraSlots[wkey]||[]).filter(x=>x.shiftId==='parsed').forEach(x=>t+=parseFloat(x.revenue)||0);
  return t;
}
function getWeekExtraRevenue(){
  const wkey=getWeekKey();
  return (S.horaExtraSlots[wkey]||[]).filter(x=>x.shiftId==='parsed').reduce((s,x)=>s+(parseFloat(x.revenue)||0),0);
}
function getChatterExtraRevenue(chatterId){
  const wkey=getWeekKey();
  return (S.horaExtraSlots[wkey]||[]).filter(x=>x.shiftId==='parsed'&&x.chatterId===chatterId).reduce((s,x)=>s+(parseFloat(x.revenue)||0),0);
}

/* ===========================================================
   PER-CHATTER WEEKLY GOALS — manager sets a weekly revenue
   target for each chatter; app computes progress, remaining
   amount, and how much they need per remaining day to hit it.
   =========================================================== */
function getDaysRemainingInWeek(){
  // Counts today + days left until Sunday (inclusive), so the
  // person always sees "still achievable today" math.
  const now=new Date();
  const dow=now.getDay(); // 0=Sun..6=Sat
  const isoDow=dow===0?7:dow; // 1=Mon..7=Sun
  return Math.max(1,7-isoDow+1);
}
function renderChatterGoals(){
  const el=document.getElementById('chatter-goals-list');
  if(!el)return;
  if(!S.chatters.length){el.innerHTML='<div class="empty"><div class="empty-tx">Cadastre chatters para definir metas</div></div>';return;}
  const wkey=getWeekKey();
  const goals=S.chatterWeekGoals[wkey]||{};
  const daysLeft=getDaysRemainingInWeek();
  el.innerHTML=S.chatters.map(c=>{
    const target=parseFloat(goals[c.id])||0;
    const current=getChatterWeekRevenue(c.id);
    const remaining=Math.max(0,target-current);
    const pct=target>0?Math.min(100,Math.round((current/target)*100)):0;
    const perDay=remaining>0?remaining/daysLeft:0;
    const met=target>0&&current>=target;
    return`<div class="goalcard ${met?'met':''}">
      <div class="goal-top">
        <div class="goal-text">${c.name}</div>
        <div style="display:flex;align-items:center;gap:5px">
          <span style="font-size:11px;color:var(--text3)">meta:</span>
          <input type="number" class="finput" style="width:90px;text-align:right;padding:5px 8px;font-size:12.5px" value="${target||''}" placeholder="0"
            onchange="saveChatterGoal('${c.id}',this.value)">
        </div>
      </div>
      ${target>0?`
        <div class="goalbar-track"><div class="goalbar-fill" style="width:${pct}%"></div></div>
        <div class="goal-nums">
          <span>${money(current)} de ${money(target)}</span>
          <span style="color:${met?'var(--ok)':'var(--warn)'}">${pct}%</span>
        </div>
        ${met?
          `<div style="margin-top:8px;font-size:12px;color:var(--ok);font-weight:600">🎉 Meta da semana batida!</div>`
          :`<div style="margin-top:8px;display:flex;gap:8px">
            <div style="flex:1;background:var(--bg-soft);border-radius:8px;padding:8px 10px">
              <div style="font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase">Falta</div>
              <div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:var(--bad)">${money(remaining)}</div>
            </div>
            <div style="flex:1;background:var(--bg-soft);border-radius:8px;padding:8px 10px">
              <div style="font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase">Por dia (${daysLeft}d restantes)</div>
              <div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:var(--accent)">${money(perDay)}</div>
            </div>
          </div>`}
      `:'<div style="font-size:11.5px;color:var(--text3);margin-top:6px">Defina uma meta para acompanhar o progresso</div>'}
    </div>`;
  }).join('');
}
function saveChatterGoal(chatterId,value){
  const wkey=getWeekKey();
  if(!S.chatterWeekGoals[wkey])S.chatterWeekGoals[wkey]={};
  S.chatterWeekGoals[wkey][chatterId]=parseFloat(value)||0;
  save();
  toast('🎯 Meta definida!');
  renderChatterGoals();
}

/* ===========================================================
   MONTHLY GOAL HISTORY — for a given chatter, walk back through
   every week key stored this month and report hit/miss + values.
   =========================================================== */
function getChatterMonthlyGoalHistory(chatterId){
  const now=new Date();
  const month=now.getMonth(),year=now.getFullYear();
  const results=[];
  Object.keys(S.chatterWeekGoals).forEach(wkey=>{
    const weekStart=new Date(wkey+'T12:00:00');
    if(isNaN(weekStart.getTime()))return;
    // Only include weeks that start in the current month (good enough granularity for a manager's monthly view)
    if(weekStart.getMonth()!==month||weekStart.getFullYear()!==year)return;
    const target=parseFloat(S.chatterWeekGoals[wkey][chatterId])||0;
    if(!target)return;
    const weekEnd=new Date(weekStart);weekEnd.setDate(weekStart.getDate()+6);
    let achieved=0;
    for(let d=new Date(weekStart);d<=weekEnd;d.setDate(d.getDate()+1)){
      S.models.forEach(m=>{achieved+=parseFloat(S.revenues[`${chatterId}_${m.id}_${fmt(d)}`])||0;});
    }
    results.push({weekStart:fmt(weekStart),target,achieved,met:achieved>=target});
  });
  return results.sort((a,b)=>a.weekStart.localeCompare(b.weekStart));
}

/* ===========================================================
   CRUD
   =========================================================== */
function populateChatterSelects(){
  ['shift-chatter','abs-chatter','orient-chatter','ot-chatter'].forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    el.innerHTML=S.chatters.length?S.chatters.map(c=>`<option value="${c.id}">${c.name}</option>`).join(''):'<option value="">Nenhum chatter</option>';
  });
}
function saveModel(){
  const name=document.getElementById('model-name').value.trim();if(!name){toast('⚠️ Nome obrigatório');return;}
  S.models.push({id:'m'+Date.now(),name,emoji:document.getElementById('model-emoji').value.trim()||'🧩'});
  save();closeModal('m-model');document.getElementById('model-name').value='';document.getElementById('model-emoji').value='';
  toast('✅ Modelo adicionado!');renderFat();
}
function deleteModel(id){if(!confirm('Remover modelo?'))return;S.models=S.models.filter(m=>m.id!==id);save();toast('Removido');renderFat();}
function saveChatter(){
  const name=document.getElementById('ch-name').value.trim();if(!name){toast('⚠️ Nome obrigatório');return;}
  S.chatters.push({id:'c'+Date.now(),name,discord:document.getElementById('ch-discord').value.trim(),level:document.getElementById('ch-level').value,notes:document.getElementById('ch-notes').value.trim(),watchtime:document.getElementById('ch-watchtime').value,createdAt:new Date().toISOString()});
  save();closeModal('m-chatter');['ch-name','ch-discord','ch-notes','ch-watchtime'].forEach(id=>document.getElementById(id).value='');
  toast('✅ Chatter adicionado!');renderTeam(teamFilter);renderHome();
}
function saveShift(){
  const chatterId=document.getElementById('shift-chatter').value;
  const start=document.getElementById('shift-start').value;
  const end=document.getElementById('shift-end').value;
  const start2=document.getElementById('shift-start2').value||'';
  const end2=document.getElementById('shift-end2').value||'';
  const days=Array.from(document.querySelectorAll('#m-shift .chip[data-day].sel')).map(c=>c.dataset.day);
  const modelIds=Array.from(document.querySelectorAll('#m-shift .chip[data-model].sel')).map(c=>c.dataset.model);
  const folgaDia=Array.from(document.querySelectorAll('#m-shift .chip-folga.sel')).map(c=>c.dataset.folga).find(v=>v!==undefined)||'';
  if(!chatterId||!start||!end||!days.length){toast('⚠️ Preencha chatter, 1º horário e dias');return;}
  const editId=document.getElementById('shift-edit-id').value;
  if(editId){
    const s=S.shifts.find(sh=>sh.id===editId);
    if(s){s.chatterId=chatterId;s.start=start;s.end=end;s.start2=start2;s.end2=end2;s.days=days;s.modelIds=modelIds;s.folgaDia=folgaDia;toast('✅ Turno atualizado!');}
  } else {
    S.shifts.push({id:'s'+Date.now(),chatterId,start,end,start2,end2,days,modelIds,folgaDia});
    toast('✅ Turno adicionado!');
  }
  save();
  closeModal('m-shift');
  document.querySelectorAll('#m-shift .chip').forEach(c=>c.classList.remove('sel'));
  document.querySelectorAll('#m-shift .chip-folga').forEach(c=>c.classList.remove('sel'));
  document.getElementById('shift-edit-id').value='';
  document.getElementById('shift-modal-title').textContent='Escalar chatter';
  renderTurno();
  if(currentViewName()==='extra')renderExtra();
  // If a chatter profile is open, refresh its shift list
  renderChatterShifts(chatterId);
}
function openEditShift(shiftId){
  const s=S.shifts.find(sh=>sh.id===shiftId);
  if(!s)return;
  document.getElementById('shift-edit-id').value=s.id;
  openModal('m-shift');
  document.getElementById('shift-modal-title').textContent='Editar turno';
  setTimeout(()=>{
    document.getElementById('shift-chatter').value=s.chatterId;
    document.getElementById('shift-start').value=s.start||'';
    document.getElementById('shift-end').value=s.end||'';
    document.getElementById('shift-start2').value=s.start2||'';
    document.getElementById('shift-end2').value=s.end2||'';
    document.querySelectorAll('#m-shift .chip[data-day]').forEach(c=>c.classList.toggle('sel',(s.days||[]).includes(c.dataset.day)));
    document.querySelectorAll('#m-shift .chip[data-model]').forEach(c=>c.classList.toggle('sel',(s.modelIds||[]).includes(c.dataset.model)));
    document.querySelectorAll('#m-shift .chip-folga').forEach(c=>c.classList.toggle('sel',c.dataset.folga===(s.folgaDia||'')));
  },40);
}

/* ===========================================================
   TROCAS DE HORÁRIO
   Pontual: chatter A cobre o turno de B num dia específico.
   Aparece na escala daquele dia no lugar de B.
   =========================================================== */
function initSwapModal(){
  populateChatterSelects();
  ['swap-chatter-in','swap-chatter-out'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    el.innerHTML=S.chatters.length?S.chatters.map(c=>`<option value="${c.id}">${c.name}</option>`).join(''):'<option value="">Nenhum chatter</option>';
  });
  document.getElementById('swap-date').value=todayKey();
  document.querySelectorAll('#swap-type-chips .chip').forEach(chip=>{
    chip.onclick=()=>{
      document.querySelectorAll('#swap-type-chips .chip').forEach(c=>c.classList.remove('sel'));
      chip.classList.add('sel');
      const type=chip.dataset.swapType;
      document.getElementById('swap-pontual-fields').style.display=type==='pontual'?'block':'none';
      document.getElementById('swap-definitiva-fields').style.display=type==='definitiva'?'block':'none';
      document.getElementById('swap-btns').style.display=type==='pontual'?'flex':'none';
    };
  });
  document.getElementById('swap-chatter-out').onchange=updateSwapPreview;
  document.getElementById('swap-date').onchange=updateSwapPreview;
  updateSwapPreview();
}
function updateSwapPreview(){
  const chatterId=document.getElementById('swap-chatter-out')?.value;
  const date=document.getElementById('swap-date')?.value;
  const preview=document.getElementById('swap-shift-preview');
  if(!preview||!chatterId||!date)return;
  const d=new Date(date+'T12:00:00');
  const dayKey=DAY_KEYS[d.getDay()];
  const shifts=S.shifts.filter(s=>s.chatterId===chatterId&&s.days&&s.days.includes(dayKey));
  if(!shifts.length){
    preview.style.display='block';
    preview.textContent='Chatter nao tem turno nesse dia da semana';
    preview.style.color='var(--warn)';
  } else {
    const c=S.chatters.find(ch=>ch.id===chatterId);
    const timeStr=shifts.map(s=>s.start2&&s.end2?`${s.start}-${s.end} e ${s.start2}-${s.end2}`:`${s.start}-${s.end}`).join(', ');
    preview.style.display='block';
    preview.style.color='var(--text2)';
    preview.textContent=`Turno de ${c?c.name:'?'}: ${timeStr}`;
  }
}
function saveSwap(){
  const date=document.getElementById('swap-date').value;
  const covererId=document.getElementById('swap-chatter-in').value;
  const originalId=document.getElementById('swap-chatter-out').value;
  if(!date||!covererId||!originalId){toast('Preencha todos os campos');return;}
  if(covererId===originalId){toast('Selecione chatters diferentes');return;}
  const d=new Date(date+'T12:00:00');
  const dayKey=DAY_KEYS[d.getDay()];
  const shifts=S.shifts.filter(s=>s.chatterId===originalId&&s.days&&s.days.includes(dayKey));
  if(!shifts.length){toast('Chatter nao tem turno nesse dia');return;}
  S.swaps=S.swaps.filter(sw=>!(sw.date===date&&sw.originalId===originalId));
  shifts.forEach(s=>{
    S.swaps.push({id:'sw'+Date.now()+Math.random().toString(36).slice(2,5),date,covererId,originalId,start:s.start,end:s.end,start2:s.start2||'',end2:s.end2||'',shiftId:s.id,createdAt:todayKey()});
  });
  save();
  closeModal('m-swap');
  const coverer=S.chatters.find(c=>c.id===covererId);
  const original=S.chatters.find(c=>c.id===originalId);
  toast('Troca registrada: '+coverer.name+' cobre '+original.name+' em '+date);
  renderTurno();
}
function deleteSwap(swapId){S.swaps=S.swaps.filter(sw=>sw.id!==swapId);save();toast('Troca removida');renderTurno();}
function getEffectiveShiftsForDate(chatterId,dateKey){
  const d=new Date(dateKey+'T12:00:00');
  const dayKey=DAY_KEYS[d.getDay()];
  const gaveAway=S.swaps.filter(sw=>sw.date===dateKey&&sw.originalId===chatterId);
  let ownShifts=gaveAway.length?[]:S.shifts.filter(s=>s.chatterId===chatterId&&s.days&&s.days.includes(dayKey));
  const covered=S.swaps.filter(sw=>sw.date===dateKey&&sw.covererId===chatterId);
  const swapShifts=covered.map(sw=>({...(S.shifts.find(s=>s.id===sw.shiftId)||{}),id:sw.id,start:sw.start,end:sw.end,start2:sw.start2,end2:sw.end2,isSwap:true,swapOriginalId:sw.originalId}));
  return[...ownShifts,...swapShifts];
}

/* ===========================================================
   HORA EXTRA — separate from general revenue.
   Vagas are generated automatically from shifts that have a
   folgaDia set. Manager assigns a chatter + logs revenue per slot.
   =========================================================== */
function getHoraExtraVagas(){
  // Collect all shifts that have a folga day — each becomes an "available slot"
  const vagas=[];
  S.shifts.forEach(s=>{
    if(!s.folgaDia)return;
    const c=S.chatters.find(ch=>ch.id===s.chatterId);
    if(!c)return;
    // Slot 1: always the main shift time
    vagas.push({shiftId:s.id,chatterId:s.chatterId,chatterName:c.name,folgaDia:s.folgaDia,
      start:s.start,end:s.end,slotIdx:1,
      label:`${c.name} — ${s.folgaDia.toUpperCase()} (${s.start}–${s.end})`});
    // Slot 2: if second time exists
    if(s.start2&&s.end2){
      vagas.push({shiftId:s.id,chatterId:s.chatterId,chatterName:c.name,folgaDia:s.folgaDia,
        start:s.start2,end:s.end2,slotIdx:2,
        label:`${c.name} — ${s.folgaDia.toUpperCase()} (${s.start2}–${s.end2})`});
    }
  });
  return vagas.sort((a,b)=>a.folgaDia.localeCompare(b.folgaDia)||a.start.localeCompare(b.start));
}
function getExtraSlotId(shiftId,slotIdx){
  const wkey=getWeekKey();
  const slots=S.horaExtraSlots[wkey]||[];
  return slots.find(x=>x.shiftId===shiftId&&x.slotIdx===slotIdx);
}
function saveExtraSlot(shiftId,slotIdx,field,value){
  const wkey=getWeekKey();
  if(!S.horaExtraSlots[wkey])S.horaExtraSlots[wkey]=[];
  let slot=S.horaExtraSlots[wkey].find(x=>x.shiftId===shiftId&&x.slotIdx===slotIdx);
  if(!slot){
    slot={id:'ex'+Date.now(),shiftId,slotIdx,chatterId:'',revenue:0,done:false};
    S.horaExtraSlots[wkey].push(slot);
  }
  slot[field]=value;
  save();
  renderExtra();
}
function toggleExtraDone(shiftId,slotIdx){
  const wkey=getWeekKey();
  if(!S.horaExtraSlots[wkey])S.horaExtraSlots[wkey]=[];
  let slot=S.horaExtraSlots[wkey].find(x=>x.shiftId===shiftId&&x.slotIdx===slotIdx);
  if(!slot){slot={id:'ex'+Date.now(),shiftId,slotIdx,chatterId:'',revenue:0,done:true};S.horaExtraSlots[wkey].push(slot);}
  else slot.done=!slot.done;
  save();renderExtra();
}
/* ===========================================================
   RELATÓRIOS DA EQUIPE
   Parses reports sent by chatters (from external system) and
   cross-references with S.chatters, S.models, S.chatterWeekGoals
   to auto-fill revenue and show goal progress.
   Format expected:
     Data: DD/MM/YYYY
     Nome: [chatter name]
     [MODEL NAME]
     HH:MM - R$ XX,XX
     Total de comissões: R$ XX,XX
   =========================================================== */
function renderTeamReports(){
  // Just ensure the input area is visible — processing happens on button click
}

function parseTeamReports(){
  const raw=document.getElementById('teamreport-input').value.trim();
  if(!raw){document.getElementById('teamreport-results').innerHTML='<div style="color:var(--text3);font-size:13px;padding:8px 0">Cole o conteúdo antes de processar</div>';return;}

  const lines=raw.split('\n').map(l=>l.trim()).filter(l=>l);
  const blocks=[];
  let current=null;

  lines.forEach(line=>{
    if(/^data:/i.test(line)){
      if(current)blocks.push(current);
      current={dateRaw:line.replace(/^data:\s*/i,'').trim(),name:'',modelBlocks:[],currentModel:null,rawSales:[]};
    } else if(/^nome:/i.test(line)&&current){
      current.name=line.replace(/^nome:\s*/i,'').trim();
    } else if(current){
      const isModelLine=/^[A-ZÁÉÍÓÚÀÂÊÎÔÛÃÕ\s0-9]+$/.test(line)&&line.length>3&&!line.includes('R$')&&!/^\d/.test(line)&&line===line.toUpperCase();
      if(isModelLine){
        current.currentModel={name:line,sales:[],saleTimes:[]};
        current.modelBlocks.push(current.currentModel);
      } else if(/total de comiss/i.test(line)&&current.currentModel){
        const m=line.match(/R\$\s*([\d.,]+)/);
        if(m)current.currentModel.total=parseFloat(m[1].replace('.','').replace(',','.'));
      } else if(current.currentModel){
        // Detect shift window: "23:21 às 07:02"
        const shiftMatch=line.match(/(\d{2}:\d{2})\s+às\s+(\d{2}:\d{2})/);
        if(shiftMatch&&!current.currentModel.shiftStart){
          current.currentModel.shiftStart=shiftMatch[1];
          current.currentModel.shiftEnd=shiftMatch[2];
        }
        // Detect sales: "HH:MM - R$ XX,XX"
        const saleTimePattern=/(\d{2}:\d{2})\s*-\s*R\$/g;
        let st;
        while((st=saleTimePattern.exec(line))!==null){
          current.currentModel.saleTimes.push(st[1]);
        }
        const valMatches=line.match(/R\$\s*([\d.,]+)/g);
        if(valMatches){
          valMatches.forEach(v=>{
            const val=parseFloat(v.replace('R$','').trim().replace(/\./g,'').replace(',','.'));
            if(val>0){current.currentModel.sales.push(val);current.rawSales.push({val,time:null});}
          });
        }
      }
    }
  });
  if(current)blocks.push(current);

  if(!blocks.length){
    document.getElementById('teamreport-results').innerHTML='<div style="color:var(--warn);font-size:13px;padding:8px 0">⚠️ Nenhum relatório reconhecido. Verifique o formato.</div>';
    return;
  }

  const wkey=getWeekKey();
  const goals=S.chatterWeekGoals[wkey]||{};
  let exportLines=['📊 RELATÓRIOS DA EQUIPE — '+wkey,''];
  let totalEquipe=0;

  const resultsHtml=blocks.map(block=>{
    const chatter=S.chatters.find(c=>c.name.toLowerCase()===block.name.toLowerCase())||
      S.chatters.find(c=>block.name.toLowerCase().includes(c.name.toLowerCase().split(' ')[0]));

    let dateKey=todayKey();
    if(block.dateRaw){
      const parts=block.dateRaw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      if(parts){
        const year=parts[3].length===2?'20'+parts[3]:parts[3];
        dateKey=`${year}-${parts[2].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
      }
    }

    let chatterTotal=0,extraTotal=0;
    const allSales=[];
    const modelResults=block.modelBlocks.map(mb=>{
      const total=mb.total||mb.sales.reduce((s,v)=>s+v,0);
      const isExtra=/hora extra/i.test(mb.name);
      if(isExtra)extraTotal+=total; else chatterTotal+=total;
      mb.sales.forEach((v,i)=>allSales.push({val:v,time:mb.saleTimes[i]||null,isExtra}));

      const cleanName=mb.name.replace(/hora extra/gi,'').trim();
      const model=S.models.find(m=>cleanName.toLowerCase().includes(m.name.toLowerCase())||m.name.toLowerCase().includes(cleanName.toLowerCase().split(' ')[0]));

      if(chatter&&model){
        if(isExtra){
          const wkeyLocal=getWeekKey();
          if(!S.horaExtraSlots[wkeyLocal])S.horaExtraSlots[wkeyLocal]=[];
          const slotId=`parsed_${chatter.id}_${model.id}_${dateKey}`;
          let slot=S.horaExtraSlots[wkeyLocal].find(x=>x.id===slotId);
          if(!slot){slot={id:slotId,shiftId:'parsed',slotIdx:0,chatterId:chatter.id,modelId:model.id,revenue:0,done:true,dateKey};S.horaExtraSlots[wkeyLocal].push(slot);}
          slot.revenue=total;
        } else {
          S.revenues[`${chatter.id}_${model.id}_${dateKey}`]=total;
        }
      }
      return{name:mb.name,total,model,matched:!!model,isExtra};
    });

    // ---- Analytics ----
    const normalSales=allSales.filter(s=>!s.isExtra);
    const ticketMedio=normalSales.length>0?chatterTotal/normalSales.length:0;
    const highTicketSales=normalSales.filter(s=>s.val>=ticketMedio*1.5);
    const highTicketPct=normalSales.length>0?Math.round((highTicketSales.length/normalSales.length)*100):0;

    // Vendas por hora — use shift window from "HH:MM às HH:MM" in the report
    let shiftHours=0;
    block.modelBlocks.filter(mb=>!(/hora extra/i.test(mb.name))).forEach(mb=>{
      if(mb.shiftStart&&mb.shiftEnd){
        const[h1,m1]=mb.shiftStart.split(':').map(Number);
        const[h2,m2]=mb.shiftEnd.split(':').map(Number);
        let endMins=h2*60+m2,startMins=h1*60+m1;
        if(endMins<startMins)endMins+=24*60;
        shiftHours+=(endMins-startMins)/60;
      }
    });
    if(!shiftHours)shiftHours=8; // fallback if no shift window found
    const vendasPorHora=shiftHours>0?Math.round((normalSales.length/shiftHours)*100)/100:0;

    // Tempo máximo sem venda (gap between sale times)
    let maxGapMin=0;
    const saleTsAll=[];
    block.modelBlocks.filter(mb=>!(/hora extra/i.test(mb.name))).forEach(mb=>{
      (mb.saleTimes||[]).forEach(t=>{const[h,m]=t.split(':').map(Number);saleTsAll.push(h*60+m);});
    });
    saleTsAll.sort((a,b)=>a-b);
    if(saleTsAll.length>1){
      for(let i=1;i<saleTsAll.length;i++){
        const gap=saleTsAll[i]-saleTsAll[i-1];
        if(gap>maxGapMin)maxGapMin=gap;
      }
    }

    // Save analytics to chatter ficha + update tech fields
    if(chatter){
      if(!S.chatterFichas[chatter.id])S.chatterFichas[chatter.id]={tech:{},behavior:{},potential:{},risk:{},history:[],analytics:{}};
      if(!S.chatterFichas[chatter.id].analytics)S.chatterFichas[chatter.id].analytics={};
      const a=S.chatterFichas[chatter.id].analytics;
      if(!a.weeklyData)a.weeklyData={};
      a.weeklyData[dateKey]={ticketMedio,vendasPorHora,highTicketPct,maxGapMin,totalVendas:normalSales.length,chatterTotal,extraTotal,shiftHours};
      // Auto-fill ficha técnica from analytics
      const f=S.chatterFichas[chatter.id];
      const scoreLabel=n=>n>=4?'4 - Ótimo':n>=3?'3 - Bom':n>=2?'2 - Regular':'1 - Fraco';
      const convScore=Math.min(5,Math.max(1,Math.round(vendasPorHora*2))); // scale: 2 vendas/h = 4
      const ticketScore=ticketMedio>=100?5:ticketMedio>=50?4:ticketMedio>=30?3:ticketMedio>=15?2:1;
      f.tech.conversao=scoreLabel(convScore);
      f.tech.ticket=scoreLabel(ticketScore);
    }

    totalEquipe+=chatterTotal;

    const meta=chatter?parseFloat(goals[chatter.id])||0:0;
    const weekRev=chatter?getChatterWeekRevenue(chatter.id):0;
    const pct=meta>0?Math.round((weekRev/meta)*100):null;
    const falta=meta>0?Math.max(0,meta-weekRev):0;

    exportLines.push(`👤 ${block.name}${block.dateRaw?' ('+block.dateRaw+')':''}`);
    modelResults.filter(mr=>!mr.isExtra).forEach(mr=>exportLines.push(`  ${mr.name}: ${money(mr.total)}`));
    if(chatterTotal>0)exportLines.push(`  Total: ${money(chatterTotal)} | Ticket médio: ${money(ticketMedio)} | High ticket: ${highTicketPct}% | Vendas/hora: ${vendasPorHora}`);
    if(extraTotal>0)exportLines.push(`  ⚡ Hora extra: ${money(extraTotal)}`);
    if(meta>0)exportLines.push(`  Meta: ${money(meta)} | Atingido: ${money(weekRev)} (${pct}%)${falta>0?` | Falta: ${money(falta)}`:' ✅'}`);
    exportLines.push('');

    const matchColor=chatter?'var(--ok)':'var(--warn)';
    return`<div style="background:var(--bg-soft);border-radius:10px;padding:13px;margin-bottom:10px;border-left:3px solid ${matchColor}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div>
          <div style="font-weight:700;font-size:14px">${block.name}${chatter?'':' <span style="color:var(--warn);font-size:11px">⚠️ não encontrado</span>'}</div>
          <div style="font-size:11.5px;color:var(--text3)">${block.dateRaw||dateKey}</div>
        </div>
        <div style="text-align:right">
          ${chatterTotal>0?`<div style="font-family:var(--font-mono);font-weight:800;font-size:15px;color:var(--ok)">${money(chatterTotal)}</div>`:''}
          ${extraTotal>0?`<div style="font-size:12px;color:var(--info)">⚡ ${money(extraTotal)}</div>`:''}
        </div>
      </div>
      ${modelResults.filter(mr=>!mr.isExtra).map(mr=>`
        <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12.5px;border-bottom:1px solid var(--line)">
          <span>${mr.name}</span><span style="font-family:var(--font-mono)">${money(mr.total)}</span>
        </div>`).join('')}
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-top:10px">
        <div style="background:var(--bg);border-radius:7px;padding:7px;text-align:center">
          <div style="font-size:10px;color:var(--text3)">Ticket médio</div>
          <div style="font-size:13px;font-weight:700;font-family:var(--font-mono)">${money(ticketMedio)}</div>
        </div>
        <div style="background:var(--bg);border-radius:7px;padding:7px;text-align:center">
          <div style="font-size:10px;color:var(--text3)">High ticket</div>
          <div style="font-size:13px;font-weight:700;color:${highTicketPct>=30?'var(--ok)':'var(--warn)'}">${highTicketPct}%</div>
        </div>
        <div style="background:var(--bg);border-radius:7px;padding:7px;text-align:center">
          <div style="font-size:10px;color:var(--text3)">Vendas/hora</div>
          <div style="font-size:13px;font-weight:700;color:${vendasPorHora>=1?'var(--ok)':vendasPorHora>=0.5?'var(--warn)':'var(--bad)'}">${vendasPorHora}</div>
        </div>
        <div style="background:var(--bg);border-radius:7px;padding:7px;text-align:center">
          <div style="font-size:10px;color:var(--text3)">Maior gap</div>
          <div style="font-size:13px;font-weight:700;color:${maxGapMin>60?'var(--bad)':maxGapMin>30?'var(--warn)':'var(--ok)'}">${maxGapMin?maxGapMin+'min':'—'}</div>
        </div>
      </div>
      ${meta>0?`<div style="margin-top:10px">
        <div style="background:var(--line);border-radius:4px;height:6px;overflow:hidden;margin-bottom:4px">
          <div style="height:6px;border-radius:4px;background:${pct>=100?'var(--ok)':pct>=60?'var(--warn)':'var(--bad)'};width:${Math.min(100,pct||0)}%"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3)">
          <span>${pct}% da meta</span>${falta>0?`<span style="color:var(--bad)">falta ${money(falta)}</span>`:`<span style="color:var(--ok)">✅ batida!</span>`}
        </div>
      </div>`:''}
    </div>`;
  }).join('');

  save();

  exportLines.push(`TOTAL EQUIPE: ${money(totalEquipe)}`);
  document.getElementById('teamreport-results').innerHTML=
    `<div style="font-size:11.5px;color:var(--ok);margin-bottom:10px">✅ ${blocks.length} relatório(s) processado(s) · Dados salvos automaticamente</div>`+resultsHtml;
  const summaryEl=document.getElementById('teamreport-summary');
  const exportEl=document.getElementById('teamreport-export');
  if(summaryEl)summaryEl.style.display='block';
  if(exportEl)exportEl.value=exportLines.join('\n');
}

function copyTeamReport(){
  const ta=document.getElementById('teamreport-export');
  if(!ta)return;
  ta.select();ta.setSelectionRange(0,999999);
  try{document.execCommand('copy');toast('✅ Copiado!');}
  catch(e){if(navigator.clipboard)navigator.clipboard.writeText(ta.value).then(()=>toast('✅ Copiado!'));}
}

function openManualStatusModal(){
  const today=todayKey();
  const el=document.getElementById('manual-status-body');
  if(!el)return;
  el.innerHTML=S.chatters.map(c=>{
    const status=getChatterStatus(c.id,today);
    const isOn=status==='online'||status==='overtime';
    return`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)">
      <div>
        <div style="font-weight:700;font-size:13.5px">${c.name}</div>
        <div style="font-size:11.5px;color:${isOn?'var(--ok)':'var(--text3)'}">${isOn?'🟢 online':'⚫ offline'}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-xs ${isOn?'btn-ghost':'btn-primary'}" onclick="doCheckin('${c.id}','in');openManualStatusModal()">Entrou</button>
        <button class="btn btn-xs ${isOn?'btn-danger':'btn-ghost'}" onclick="doCheckin('${c.id}','out');openManualStatusModal()">Saiu</button>
      </div>
    </div>`;
  }).join('');
}

/* ===========================================================
   GESTÃO — morning routine, problems, demands, training,
   evolutions, prize, motivational, requests, schedules
   =========================================================== */

// ---- ROTINA DA MANHÃ (repeats daily, same tasks) ----
function renderMorningRoutine(){
  const el=document.getElementById('morning-routine-list');
  if(!el)return;
  const today=todayKey();
  // Clone routine items with today's done state
  if(!S.problemsToday[today+'_routine'])S.problemsToday[today+'_routine']=[];
  const doneIds=new Set(S.problemsToday[today+'_routine']);
  if(!S.morningRoutine.length){el.innerHTML='<div style="color:var(--text3);font-size:12.5px">Adicione itens da rotina abaixo</div>';return;}
  el.innerHTML=S.morningRoutine.map(item=>{
    const done=doneIds.has(item.id);
    return`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)">
      <button onclick="toggleRoutineItem('${item.id}')" style="width:22px;height:22px;border-radius:5px;border:2px solid ${done?'var(--ok)':'var(--line)'};background:${done?'var(--ok)':'transparent'};cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px">${done?'<span style="color:#fff">✓</span>':''}</button>
      <span style="flex:1;font-size:13.5px;${done?'text-decoration:line-through;color:var(--text3)':''}">${item.text}</span>
      <button onclick="removeMorningRoutineItem('${item.id}')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:13px">✕</button>
    </div>`;
  }).join('');
}
function toggleRoutineItem(id){
  const today=todayKey();const key=today+'_routine';
  if(!S.problemsToday[key])S.problemsToday[key]=[];
  const idx=S.problemsToday[key].indexOf(id);
  if(idx===-1)S.problemsToday[key].push(id);else S.problemsToday[key].splice(idx,1);
  save();renderMorningRoutine();
}
function addMorningRoutine(){
  const inp=document.getElementById('morning-routine-input');
  const text=inp?.value.trim();if(!text)return;
  S.morningRoutine.push({id:'mr'+Date.now(),text});
  inp.value='';save();renderMorningRoutine();
}
function removeMorningRoutineItem(id){
  S.morningRoutine=S.morningRoutine.filter(x=>x.id!==id);
  save();renderMorningRoutine();
}

// ---- DAILY TASK LIST HELPER (problems + demandas) ----
function renderDailyList(storeKey,listId,badgeId){
  const el=document.getElementById(listId);
  if(!el)return;
  const today=todayKey();
  const items=S[storeKey][today]||[];
  const badge=document.getElementById(badgeId);
  const pending=items.filter(x=>!x.done).length;
  if(badge)badge.textContent=pending>0?`${pending} pendente${pending>1?'s':''}` :'';
  if(!items.length){el.innerHTML='<div style="color:var(--text3);font-size:12.5px">Nenhum item</div>';return;}
  el.innerHTML=items.map(item=>`
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)">
      <button onclick="toggleDailyItem('${storeKey}','${item.id}')" style="width:22px;height:22px;border-radius:5px;border:2px solid ${item.done?'var(--ok)':'var(--line)'};background:${item.done?'var(--ok)':'transparent'};cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px">${item.done?'<span style="color:#fff">✓</span>':''}</button>
      <span style="flex:1;font-size:13.5px;${item.done?'text-decoration:line-through;color:var(--text3)':''}">${item.text}</span>
      <button onclick="removeDailyItem('${storeKey}','${item.id}')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:13px">✕</button>
    </div>`).join('');
}
function toggleDailyItem(store,id){
  const today=todayKey();
  const items=S[store][today]||[];
  const item=items.find(x=>x.id===id);
  if(item)item.done=!item.done;
  save();renderGestao();
}
function removeDailyItem(store,id){
  const today=todayKey();
  S[store][today]=(S[store][today]||[]).filter(x=>x.id!==id);
  save();renderGestao();
}
function addProblem(){
  const inp=document.getElementById('problems-input');
  const text=inp?.value.trim();if(!text)return;
  const today=todayKey();
  if(!S.problemsToday[today])S.problemsToday[today]=[];
  S.problemsToday[today].push({id:'p'+Date.now(),text,done:false});
  inp.value='';save();renderGestao();
}
function addDemanda(){
  const inp=document.getElementById('demandas-input');
  if(!inp)return;
  const text=inp?.value.trim();if(!text)return;
  const today=todayKey();
  if(!S.demandas[today])S.demandas[today]=[];
  S.demandas[today].push({id:'d'+Date.now(),text,done:false});
  inp.value='';save();renderGestao();
}

// ---- TREINAMENTO ----
function saveTraining(){
  const title=document.getElementById('train-title')?.value.trim();
  const date=document.getElementById('train-date')?.value;
  const script=document.getElementById('train-script')?.value.trim();
  if(!title||!date){toast('⚠️ Preencha título e data');return;}
  S.trainings.push({id:'tr'+Date.now(),title,date,days:[{day:1,script:script||''}]});
  save();closeModal('m-add-training');renderGestao();toast('✅ Treinamento criado!');
}
function renderTrainings(){
  const el=document.getElementById('training-list');
  if(!el)return;
  if(!S.trainings.length){el.innerHTML='<div style="color:var(--text3);font-size:12.5px">Nenhum treinamento. Use + novo acima.</div>';return;}
  el.innerHTML=S.trainings.map(t=>{
    const today=todayKey();
    const daysAgo=Math.floor((new Date(today)-new Date(t.date))/86400000);
    const currentDay=daysAgo>=0?daysAgo+1:null;
    const dayScript=currentDay?t.days.find(d=>d.day===currentDay)?.script||null:null;
    return`<div style="background:var(--warn-soft);border-radius:10px;padding:12px;margin-bottom:8px;border-left:3px solid var(--warn)">
      <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="toggleTrainingDetail('${t.id}')">
        <div>
          <div style="font-weight:700;font-size:14px">🎓 ${t.title}</div>
          <div style="font-size:11.5px;color:var(--text2)">${t.date}${currentDay?` · Dia ${currentDay}`:' · não iniciado'}</div>
        </div>
        <span style="font-size:11px;color:var(--warn)">▸</span>
      </div>
      <div id="train-detail-${t.id}" style="display:none;margin-top:10px">
        ${currentDay&&dayScript?`<div style="background:var(--bg-soft);border-radius:8px;padding:10px;font-size:13px;margin-bottom:8px"><strong>Roteiro do dia ${currentDay}:</strong><br>${dayScript}</div>`:''}
        ${currentDay&&!dayScript?`<div style="font-size:12.5px;color:var(--text3);margin-bottom:8px">Sem roteiro para o dia ${currentDay}. Adicione abaixo:</div>`:''}
        <textarea class="ftext" placeholder="Roteiro do dia ${currentDay||1}..." style="min-height:60px;font-size:12px" id="train-script-${t.id}"></textarea>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn btn-soft btn-sm" onclick="saveTrainingDayScript('${t.id}',${currentDay||1})">💾 Salvar roteiro</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteTraining('${t.id}')">Excluir</button>
        </div>
      </div>
    </div>`;
  }).join('');
}
function toggleTrainingDetail(id){const el=document.getElementById('train-detail-'+id);if(el)el.style.display=el.style.display==='none'?'block':'none';}
function saveTrainingDayScript(trainingId,day){
  const t=S.trainings.find(x=>x.id===trainingId);if(!t)return;
  const script=document.getElementById('train-script-'+trainingId)?.value.trim()||'';
  const existing=t.days.find(d=>d.day===day);
  if(existing)existing.script=script;else t.days.push({day,script});
  save();renderTrainings();toast('✅ Roteiro salvo!');
}
function deleteTraining(id){if(!confirm('Excluir treinamento?'))return;S.trainings=S.trainings.filter(t=>t.id!==id);save();renderGestao();}

// ---- EVOLUÇÕES SEMANAIS ----
function renderWeekEvolutions(){
  const el=document.getElementById('week-evolution-list');
  if(!el)return; // removed from UI
  const wkey=getWeekKey();
  const items=S.weekEvolutions[wkey]||[];
  if(!items.length){el.innerHTML='<div style="color:var(--text3);font-size:12.5px">Adicione itens de evolução. Ao fim da semana um aviso aparecerá para os não feitos.</div>';return;}
  el.innerHTML=items.map(item=>`
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)">
      <button onclick="toggleEvolution('${item.id}')" style="width:26px;height:26px;border-radius:6px;border:2px solid ${item.done?'var(--ok)':item.missed?'var(--bad)':'var(--line)'};background:${item.done?'var(--ok)':item.missed?'var(--bad)':'transparent'};cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:13px">${item.done?'<span style="color:#fff">✓</span>':item.missed?'<span style="color:#fff">✕</span>':''}</button>
      <span style="flex:1;font-size:13.5px;color:${item.done?'var(--ok)':item.missed?'var(--bad)':'var(--text)'}">${item.label}</span>
      <button onclick="removeEvolution('${item.id}')" style="background:none;border:none;color:var(--text3);cursor:pointer">✕</button>
    </div>`).join('');
}
function toggleEvolution(id){
  const wkey=getWeekKey();
  const items=S.weekEvolutions[wkey]||[];
  const item=items.find(x=>x.id===id);if(!item)return;
  if(!item.done&&!item.missed){item.done=true;item.missed=false;}
  else if(item.done){item.done=false;item.missed=true;}
  else{item.done=false;item.missed=false;}
  save();renderWeekEvolutions();
}
function removeEvolution(id){const wkey=getWeekKey();S.weekEvolutions[wkey]=(S.weekEvolutions[wkey]||[]).filter(x=>x.id!==id);save();renderWeekEvolutions();}
function addWeekEvolution(){
  const label=prompt('Nome do item de evolução:');if(!label)return;
  const wkey=getWeekKey();
  if(!S.weekEvolutions[wkey])S.weekEvolutions[wkey]=[];
  S.weekEvolutions[wkey].push({id:'ev'+Date.now(),label,done:false,missed:false});
  save();renderWeekEvolutions();
}

// ---- PREMIAÇÃO ----
function renderPrizePanel(){
  const el=document.getElementById('prize-panel');if(!el)return;
  const wkey=getWeekKey();
  const prize=S.weekPrize[wkey]||{goal:'',winner:'',prize:''};
  el.innerHTML=`
    <div class="field"><label class="flabel">Objetivo da semana</label><input class="finput" id="prize-goal" value="${prize.goal||''}" placeholder="Ex: bater R$10k em equipe" onblur="savePrize()"></div>
    <div class="field"><label class="flabel">Prêmio</label><input class="finput" id="prize-prize" value="${prize.prize||''}" placeholder="Ex: R$50 bônus" onblur="savePrize()"></div>
    <div class="field"><label class="flabel">Vencedor (preencher ao fim da semana)</label>
      <select class="fselect" id="prize-winner" onchange="savePrize()">
        <option value="">— selecionar —</option>
        ${S.chatters.map(c=>`<option value="${c.id}" ${prize.winner===c.id?'selected':''}>${c.name}</option>`).join('')}
      </select>
    </div>
    ${prize.winner?`<div style="text-align:center;padding:10px;background:var(--ok-soft);border-radius:10px;font-size:15px;font-weight:800;color:var(--ok)">🏆 ${S.chatters.find(c=>c.id===prize.winner)?.name||'?'}</div>`:''}`;
}
function savePrize(){
  const wkey=getWeekKey();
  S.weekPrize[wkey]={
    goal:document.getElementById('prize-goal')?.value||'',
    prize:document.getElementById('prize-prize')?.value||'',
    winner:document.getElementById('prize-winner')?.value||''
  };save();
}

// ---- MOTIVACIONAL ----
function renderMotivacional(){
  const el=document.getElementById('motivational-panel');
  if(!el)return;
  const wkey=getWeekKey();
  if(!S.motivational[wkey])S.motivational[wkey]={idea:'',chatters:{}};
  const data=S.motivational[wkey];
  el.innerHTML=`
    <div class="field"><label class="flabel">💡 Ideia motivacional da semana (para a equipe toda)</label>
      <textarea class="ftext" id="motiv-idea" placeholder="Ex: esta semana o foco é energia e ritmo..." style="min-height:60px" onblur="saveMotivacional()">${data.idea||''}</textarea>
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin:10px 0 8px">Dificuldades individuais</div>
    ${S.chatters.map(c=>{
      const cd=data.chatters[c.id]||{issue:'',help:''};
      return`<div style="background:var(--bg-soft);border-radius:9px;padding:10px;margin-bottom:8px">
        <div style="font-weight:700;font-size:13px;margin-bottom:7px">${c.name}</div>
        <div class="field"><label class="flabel">Dificuldade</label><input class="finput" id="motiv-issue-${c.id}" value="${cd.issue||''}" placeholder="O que está com dificuldade..." onblur="saveMotivacional()"></div>
        <div class="field"><label class="flabel">O que fiz pra ajudar</label><input class="finput" id="motiv-help-${c.id}" value="${cd.help||''}" placeholder="Ação tomada..." onblur="saveMotivacional()"></div>
      </div>`;
    }).join('')}`;
}
function saveMotivacional(){
  const wkey=getWeekKey();
  if(!S.motivational[wkey])S.motivational[wkey]={idea:'',chatters:{}};
  S.motivational[wkey].idea=document.getElementById('motiv-idea')?.value||'';
  S.chatters.forEach(c=>{
    S.motivational[wkey].chatters[c.id]={
      issue:document.getElementById('motiv-issue-'+c.id)?.value||'',
      help:document.getElementById('motiv-help-'+c.id)?.value||''
    };
  });save();
}
function saveModelRequests(){
  const wkey=getWeekKey();
  const el=document.getElementById('model-requests-text');
  if(!el)return;
  S.modelRequests[wkey]=el.value||'';
  save();
}

// ---- REQUISIÇÕES DE HORÁRIOS ----
function renderScheduleRequests(){
  const el=document.getElementById('schedule-requests-list');if(!el)return;
  const wkey=getWeekKey();
  const items=S.scheduleRequests[wkey]||[];
  if(!items.length){el.innerHTML='<div style="color:var(--text3);font-size:12.5px">Nenhuma requisição</div>';return;}
  el.innerHTML=items.map(item=>{
    const c=S.chatters.find(ch=>ch.id===item.chatterId);
    return`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)">
      <div style="flex:1"><span style="font-weight:700">${c?c.name:'?'}</span><span style="font-size:12px;color:var(--text2);margin-left:8px">${item.text}</span></div>
      <button onclick="removeScheduleRequest('${item.id}')" style="background:none;border:none;color:var(--text3);cursor:pointer">✕</button>
    </div>`;
  }).join('');
  // Populate chatter select
  const sel=document.getElementById('sched-req-chatter');
  if(sel&&!sel.options.length){sel.innerHTML=S.chatters.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');}
}
function addScheduleRequest(){
  const cid=document.getElementById('sched-req-chatter')?.value;
  const text=document.getElementById('sched-req-text')?.value.trim();
  if(!cid||!text)return;
  const wkey=getWeekKey();
  if(!S.scheduleRequests[wkey])S.scheduleRequests[wkey]=[];
  S.scheduleRequests[wkey].push({id:'sr'+Date.now(),chatterId:cid,text});
  document.getElementById('sched-req-text').value='';
  save();renderScheduleRequests();
}
function removeScheduleRequest(id){const wkey=getWeekKey();S.scheduleRequests[wkey]=(S.scheduleRequests[wkey]||[]).filter(x=>x.id!==id);save();renderScheduleRequests();}


/* ===========================================================
   FICHAS DOS CHATTERS — ficha seduct format with history
   =========================================================== */
/* ===========================================================
   ESTUDOS — personal development tracking with snapshots
   =========================================================== */

function setChatterTime(chatterId,time){
  const c=S.chatters.find(ch=>ch.id===chatterId);
  if(!c)return;
  c.time=time;
  save();
  // Update button styles
  const basicoBtn=document.getElementById('dl-time-basico-'+chatterId);
  const eliteBtn=document.getElementById('dl-time-elite-'+chatterId);
  if(basicoBtn){
    basicoBtn.style.borderColor=time==='basico'?'var(--info)':'var(--line)';
    basicoBtn.style.background=time==='basico'?'var(--info-soft)':'transparent';
    basicoBtn.style.color=time==='basico'?'var(--info)':'var(--text2)';
  }
  if(eliteBtn){
    eliteBtn.style.borderColor=time==='elite'?'var(--warn)':'var(--line)';
    eliteBtn.style.background=time==='elite'?'var(--warn-soft)':'transparent';
    eliteBtn.style.color=time==='elite'?'var(--warn)':'var(--text2)';
  }
  toast(`✅ ${c.name} → ${time==='elite'?'⭐ Time Elite':'Time Básico'}`);
  renderTeam(teamFilter);
}



function renderFichas(){
  const sel=document.getElementById('ficha-chatter-select');
  if(!sel)return;
  if(!S.chatters.length){
    document.getElementById('ficha-content').innerHTML='<div style="color:var(--text3);font-size:13px">Cadastre chatters na aba Equipe primeiro</div>';
    return;
  }
  sel.innerHTML=S.chatters.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  renderFichaChatter(sel.value);
}
function renderFichaChatter(chatterId){
  const el=document.getElementById('ficha-content');if(!el)return;
  const c=S.chatters.find(ch=>ch.id===chatterId);if(!c){el.innerHTML='';return;}
  if(!S.chatterFichas[chatterId])S.chatterFichas[chatterId]={tech:{},behavior:{},potential:{},risk:{},history:[]};
  const f=S.chatterFichas[chatterId];
  const rateField=(key,label,store)=>`<div class="field"><label class="flabel">${label}</label>
    <select class="fselect" id="ficha-${store}-${key}-${chatterId}" onchange="saveFicha('${chatterId}')">
      ${['','1 - Fraco','2 - Regular','3 - Bom','4 - Ótimo','5 - Excelente'].map(o=>`<option value="${o}" ${(f[store][key]||'')=== o?'selected':''}>${o||'— selecionar —'}</option>`).join('')}
    </select></div>`;
  const boolField=(key,label,store)=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)">
    <span style="font-size:13.5px">${label}</span>
    <div style="display:flex;gap:6px">
      <button onclick="saveFichaBool('${chatterId}','${store}','${key}',true)" style="padding:4px 12px;border-radius:6px;border:1.5px solid ${f[store][key]===true?'var(--ok)':'var(--line)'};background:${f[store][key]===true?'var(--ok-soft)':'transparent'};cursor:pointer;font-size:12px;font-weight:600">Sim</button>
      <button onclick="saveFichaBool('${chatterId}','${store}','${key}',false)" style="padding:4px 12px;border-radius:6px;border:1.5px solid ${f[store][key]===false?'var(--bad)':'var(--line)'};background:${f[store][key]===false?'var(--bad-soft)':'transparent'};cursor:pointer;font-size:12px;font-weight:600">Não</button>
    </div></div>`;

  const history=f.history||[];

  el.innerHTML=`
    <div style="background:var(--bg-soft);border-radius:12px;padding:14px;margin-bottom:12px">
      <div style="font-weight:800;font-size:16px;margin-bottom:4px">${c.name}</div>
      <div style="font-size:12px;color:var(--text3)">${c.level} · desde ${c.createdAt?c.createdAt.slice(0,10):'?'}</div>
    </div>

    <div class="panel">
      <div class="panel-head"><div class="panel-title">⚡ TÉCNICA</div></div>
      ${rateField('conversao','Conversão','tech')}
      ${rateField('ticket','Ticket médio','tech')}
      ${rateField('resposta','Tempo de resposta','tech')}
      ${rateField('evolucao','Evolução','tech')}
    </div>

    <div class="panel">
      <div class="panel-head"><div class="panel-title">🧠 COMPORTAMENTO</div></div>
      ${rateField('intensidade','Intensidade','behavior')}
      ${rateField('comunicacao','Comunicação','behavior')}
      ${rateField('comprometimento','Comprometimento','behavior')}
      ${rateField('energia','Energia','behavior')}
    </div>

    <div class="panel">
      <div class="panel-head"><div class="panel-title">🚀 POTENCIAL</div></div>
      ${boolField('aprende','Aprende rápido?','potential')}
      ${boolField('lidera','Lidera naturalmente?','potential')}
      ${boolField('criativo','Tem criatividade?','potential')}
      ${boolField('ambicao','Tem ambição?','potential')}
    </div>

    <div class="panel">
      <div class="panel-head"><div class="panel-title">⚠️ RISCO</div></div>
      ${boolField('oscila','Oscila emocionalmente?','risk')}
      ${boolField('reclama','Reclama muito?','risk')}
      ${boolField('some','Some?','risk')}
      ${boolField('desconecta','Desconecta?','risk')}
    </div>

    <button class="btn btn-primary btn-block" style="margin-bottom:12px" onclick="saveFichaSnapshot('${chatterId}')">💾 Salvar snapshot semanal</button>

    ${history.length?`
    <div class="panel">
      <div class="panel-head"><div class="panel-title">📜 Histórico cronológico</div></div>
      ${[...history].reverse().map(snap=>`
        <div style="padding:10px 0;border-bottom:1px solid var(--line)">
          <div style="font-weight:700;font-size:12.5px;color:var(--text3);margin-bottom:6px">${snap.date}</div>
          <div style="font-size:12px;color:var(--text2);line-height:1.7">${formatFichaSnapshot(snap)}</div>
        </div>`).join('')}
    </div>`:''}
  `;
}
function formatFichaSnapshot(snap){
  const lines=[];
  if(snap.tech)Object.entries(snap.tech).forEach(([k,v])=>{if(v)lines.push(`${k}: ${v}`);});
  if(snap.behavior)Object.entries(snap.behavior).forEach(([k,v])=>{if(v)lines.push(`${k}: ${v}`);});
  if(snap.potential)Object.entries(snap.potential).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')lines.push(`${k}: ${v?'Sim':'Não'}`);});
  if(snap.risk)Object.entries(snap.risk).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')lines.push(`${k}: ${v?'Sim':'Não'}`);});
  return lines.join(' · ')||'Sem dados';
}
function saveFicha(chatterId){
  if(!S.chatterFichas[chatterId])S.chatterFichas[chatterId]={tech:{},behavior:{},potential:{},risk:{},history:[]};
  const f=S.chatterFichas[chatterId];
  ['conversao','ticket','resposta','evolucao'].forEach(k=>{const el=document.getElementById(`ficha-tech-${k}-${chatterId}`);if(el)f.tech[k]=el.value;});
  ['intensidade','comunicacao','comprometimento','energia'].forEach(k=>{const el=document.getElementById(`ficha-behavior-${k}-${chatterId}`);if(el)f.behavior[k]=el.value;});
  save();
}
function saveFichaBool(chatterId,store,key,value){
  if(!S.chatterFichas[chatterId])S.chatterFichas[chatterId]={tech:{},behavior:{},potential:{},risk:{},history:[]};
  S.chatterFichas[chatterId][store][key]=value;
  save();renderFichaChatter(chatterId);
}
function saveFichaSnapshot(chatterId){
  saveFicha(chatterId);
  const f=S.chatterFichas[chatterId];
  const snap={date:todayKey(),tech:{...f.tech},behavior:{...f.behavior},potential:{...f.potential},risk:{...f.risk}};
  if(!f.history)f.history=[];
  f.history.push(snap);
  save();renderFichaChatter(chatterId);toast('✅ Snapshot salvo!');
}

function renderExtra(){
  const wd=getWeekDates();
  document.getElementById('extra-sub').textContent=`Semana ${wd[0].getDate()}/${wd[0].getMonth()+1}–${wd[6].getDate()}/${wd[6].getMonth()+1}`;
  const wkey=getWeekKey();
  const vagas=getHoraExtraVagas();
  const slots=S.horaExtraSlots[wkey]||[];
  const DAY_LABELS={seg:'Segunda',ter:'Terça',qua:'Quarta',qui:'Quinta',sex:'Sexta',sab:'Sábado',dom:'Domingo'};

  // Badge
  const vagasBadge=document.getElementById('extra-vagas-badge');
  if(vagasBadge)vagasBadge.textContent=`${vagas.length} vaga${vagas.length!==1?'s':''}`;

  // Total extra revenue
  const totalExtra=slots.reduce((sum,x)=>sum+(parseFloat(x.revenue)||0),0);
  const totalBadge=document.getElementById('extra-total-badge');
  if(totalBadge)totalBadge.textContent=moneyShort(totalExtra);

  // Vagas disponíveis
  const vagasList=document.getElementById('extra-vagas-list');
  if(vagasList){
    if(!vagas.length){
      vagasList.innerHTML='<div class="empty"><div class="empty-tx">Nenhuma vaga — cadastre turnos com dia de folga na aba Turno</div></div>';
    } else {
      vagasList.innerHTML=vagas.map(v=>{
        const slot=getExtraSlotId(v.shiftId,v.slotIdx)||{};
        const atribuido=slot.chatterId?S.chatters.find(c=>c.id===slot.chatterId):null;
        const isDone=slot.done||false;
        return`<div style="background:${isDone?'var(--bg-soft)':'var(--warn-soft)'};border-radius:10px;padding:12px;margin-bottom:8px;border-left:3px solid ${isDone?'var(--ok)':'var(--warn)'};opacity:${isDone?'0.7':'1'}">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div>
              <div style="font-weight:700;font-size:13px">${DAY_LABELS[v.folgaDia]||v.folgaDia} · ${v.start}–${v.end}</div>
              <div style="font-size:11.5px;color:var(--text2)">Folga de ${v.chatterName}${v.slotIdx===2?' (2º turno)':''}</div>
            </div>
            <button onclick="toggleExtraDone('${v.shiftId}',${v.slotIdx})" style="width:26px;height:26px;border-radius:6px;border:2px solid ${isDone?'var(--ok)':'var(--warn)'};background:${isDone?'var(--ok)':'transparent'};cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center">
              ${isDone?'<span style="color:#fff">✓</span>':''}
            </button>
          </div>
          <div class="field" style="margin-bottom:6px">
            <label class="flabel">Quem cobriu</label>
            <select class="fselect" onchange="saveExtraSlot('${v.shiftId}',${v.slotIdx},'chatterId',this.value)">
              <option value="">— selecionar chatter —</option>
              ${S.chatters.filter(c=>c.id!==v.chatterId).map(c=>`<option value="${c.id}" ${slot.chatterId===c.id?'selected':''}>${c.name}</option>`).join('')}
            </select>
          </div>
          ${atribuido?`
          <div class="fgrid2">
            <div class="field">
              <label class="flabel">Faturamento (R$)</label>
              <input type="number" class="finput" style="font-family:var(--font-mono)" value="${slot.revenue||''}" placeholder="0"
                onblur="saveExtraSlot('${v.shiftId}',${v.slotIdx},'revenue',parseFloat(this.value)||0)">
            </div>
            <div class="field">
              <label class="flabel">Modelo</label>
              <select class="fselect" onchange="saveExtraSlot('${v.shiftId}',${v.slotIdx},'modelId',this.value)">
                <option value="">—</option>
                ${S.models.map(m=>`<option value="${m.id}" ${slot.modelId===m.id?'selected':''}>${m.emoji} ${m.name}</option>`).join('')}
              </select>
            </div>
          </div>`:''}
        </div>`;
      }).join('');
    }
  }

  // Hora extra atribuída: shift-based + parsed from team reports
  const atribuidos=vagas.filter(v=>{const s=getExtraSlotId(v.shiftId,v.slotIdx);return s&&s.chatterId;});
  // Parsed slots (from team reports, shiftId='parsed')
  const parsedSlots=slots.filter(x=>x.shiftId==='parsed'&&x.chatterId&&(parseFloat(x.revenue)||0)>0);

  const atribList=document.getElementById('extra-atribuida-list');
  if(atribList){
    const hasAny=atribuidos.length||parsedSlots.length;
    if(!hasAny){
      atribList.innerHTML='<div style="color:var(--text3);font-size:12.5px;padding:8px 0">Nenhuma hora extra atribuída ainda</div>';
    } else {
      let html='';
      // Shift-based slots
      if(atribuidos.length){
        html+=atribuidos.map(v=>{
          const slot=getExtraSlotId(v.shiftId,v.slotIdx)||{};
          const worker=S.chatters.find(c=>c.id===slot.chatterId);
          const model=S.models.find(m=>m.id===slot.modelId);
          return`<div class="reprow">
            <div>
              <div style="font-weight:700;font-size:13px">${worker?worker.name:'?'}</div>
              <div style="font-size:11.5px;color:var(--text2)">${DAY_LABELS[v.folgaDia]||v.folgaDia} · ${v.start}–${v.end}${model?` · ${model.emoji} ${model.name}`:''}</div>
            </div>
            <div style="font-family:var(--font-mono);font-weight:800;color:var(--ok)">${moneyShort(parseFloat(slot.revenue)||0)}</div>
          </div>`;
        }).join('');
      }
      // Parsed slots from team reports
      if(parsedSlots.length){
        html+=`<div style="font-size:11px;font-weight:700;color:var(--info);text-transform:uppercase;letter-spacing:.04em;margin:10px 0 6px">📨 Importado dos relatórios</div>`;
        html+=parsedSlots.map(slot=>{
          const worker=S.chatters.find(c=>c.id===slot.chatterId);
          const model=S.models.find(m=>m.id===slot.modelId);
          return`<div class="reprow">
            <div>
              <div style="font-weight:700;font-size:13px">${worker?worker.name:'?'}</div>
              <div style="font-size:11.5px;color:var(--text2)">${slot.dateKey||''} ${model?`· ${model.emoji} ${model.name}`:''}</div>
            </div>
            <div style="font-family:var(--font-mono);font-weight:800;color:var(--ok)">${moneyShort(parseFloat(slot.revenue)||0)}</div>
          </div>`;
        }).join('');
      }
      atribList.innerHTML=html;
    }
  }

  // Faturamento breakdown por chatter (shift-based + parsed)
  const fatBreak=document.getElementById('extra-fat-breakdown');
  if(fatBreak){
    const byChatter={};
    atribuidos.forEach(v=>{
      const slot=getExtraSlotId(v.shiftId,v.slotIdx)||{};
      if(!slot.chatterId)return;
      const model=S.models.find(m=>m.id===slot.modelId);
      if(!byChatter[slot.chatterId])byChatter[slot.chatterId]={total:0,models:{}};
      byChatter[slot.chatterId].total+=parseFloat(slot.revenue)||0;
      if(model){
        byChatter[slot.chatterId].models[model.id]=(byChatter[slot.chatterId].models[model.id]||0)+(parseFloat(slot.revenue)||0);
      }
    });
    parsedSlots.forEach(slot=>{
      if(!slot.chatterId)return;
      const model=S.models.find(m=>m.id===slot.modelId);
      if(!byChatter[slot.chatterId])byChatter[slot.chatterId]={total:0,models:{}};
      byChatter[slot.chatterId].total+=parseFloat(slot.revenue)||0;
      if(model){
        byChatter[slot.chatterId].models[model.id]=(byChatter[slot.chatterId].models[model.id]||0)+(parseFloat(slot.revenue)||0);
      }
    });
    const entries=Object.entries(byChatter);
    if(!entries.length){
      fatBreak.innerHTML='<div style="color:var(--text3);font-size:12.5px;padding:8px 0">Nenhum faturamento de hora extra registrado</div>';
    } else {
      fatBreak.innerHTML=entries.map(([cid,data])=>{
        const c=S.chatters.find(ch=>ch.id===cid);
        const modelBreakdown=Object.entries(data.models).map(([mid,val])=>{
          const m=S.models.find(mm=>mm.id===mid);
          return`<div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--text2);padding:2px 0 2px 12px">
            <span>${m?`${m.emoji} ${m.name}`:mid}</span>
            <span style="font-family:var(--font-mono)">${moneyShort(val)}</span>
          </div>`;
        }).join('');
        return`<div style="margin-bottom:8px">
          <div class="reprow"><div class="replb" style="font-weight:700">${c?c.name:'?'}</div><div class="repval" style="color:var(--ok);font-weight:800">${money(data.total)}</div></div>
          ${modelBreakdown}
        </div>`;
      }).join('')+`<div class="reprow" style="border-top:2px solid var(--line);margin-top:6px;padding-top:8px"><div class="replb" style="font-weight:800">Total hora extra</div><div class="repval" style="color:var(--ok);font-weight:800">${money(totalExtra+(parsedSlots.reduce((s,x)=>s+(parseFloat(x.revenue)||0),0)))}</div></div>`;
    }
  }
}
function saveAbsence(){
  const chatterId=document.getElementById('abs-chatter').value,type=document.getElementById('abs-type').value;
  const date=document.getElementById('abs-date').value,note=document.getElementById('abs-note').value.trim();
  if(!chatterId||!date){toast('⚠️ Preencha os campos');return;}
  S.absences.push({id:'a'+Date.now(),chatterId,type,date,note});save();
  closeModal('m-absence');document.getElementById('abs-date').value='';document.getElementById('abs-note').value='';
  toast('✅ Registrado!');renderAbsenceList();renderHome();
}
function saveOrientation(){
  const chatterId=document.getElementById('orient-chatter').value,text=document.getElementById('orient-text').value.trim();
  if(!chatterId||!text){toast('⚠️ Preencha os campos');return;}
  S.orientations.push({id:'o'+Date.now(),chatterId,text,shift:document.getElementById('orient-shift').value,goal:document.getElementById('orient-goal').value,date:todayKey()});
  save();closeModal('m-orient');document.getElementById('orient-text').value='';document.getElementById('orient-goal').value='';
  toast('✅ Orientação salva!');renderOrientList();
}
function deleteOrientation(id){S.orientations=S.orientations.filter(o=>o.id!==id);save();renderOrientList();toast('Removida');}
function saveStudy(){
  const title=document.getElementById('study-title').value.trim();if(!title){toast('⚠️ Título obrigatório');return;}
  S.studies.push({id:'st'+Date.now(),title,category:document.getElementById('study-cat').value,priority:document.getElementById('study-prio').value,done:false});
  save();closeModal('m-study');document.getElementById('study-title').value='';toast('✅ Adicionado!');renderStudyList();
}
function toggleStudy(id){const s=S.studies.find(st=>st.id===id);if(s){s.done=!s.done;save();renderStudyList();}}
function deleteStudy(id){S.studies=S.studies.filter(s=>s.id!==id);save();renderStudyList();toast('Removido');}
function saveRevenue(chatterId,modelId,value,dateKey){
  const key=`${chatterId}_${modelId}_${dateKey||selectedFatDate||todayKey()}`;
  S.revenues[key]=parseFloat(value)||0;
  save();
  // Refresh totals in the table row without full re-render
  renderHome();
}
function saveOvertime(){
  const chatterId=document.getElementById('ot-chatter').value;
  const start=document.getElementById('ot-start').value,end=document.getElementById('ot-end').value;
  const date=document.getElementById('ot-date').value,note=document.getElementById('ot-note').value.trim();
  if(!chatterId||!start||!date){toast('⚠️ Preencha os campos');return;}
  if(!S.turnoLog[date])S.turnoLog[date]=[];
  S.turnoLog[date].push({id:'tl'+Date.now()+Math.random().toString(36).slice(2,6),chatterId,action:'overtime',time:start,otEnd:end,note});
  save();closeModal('m-overtime');document.getElementById('ot-note').value='';
  const c=S.chatters.find(ch=>ch.id===chatterId);
  toast(`⏱ Hora extra de ${c?c.name:'?'} registrada!`);renderTurnoBoard();renderHome();
}

// ---------- data helpers ----------
function getTodayTotalRevenue(){
  const today=todayKey();let t=0;
  S.chatters.forEach(c=>S.models.forEach(m=>{t+=parseFloat(S.revenues[`${c.id}_${m.id}_${today}`])||0;}));
  // Include today's hora extra in daily total
  const wkey=getWeekKey();
  (S.horaExtraSlots[wkey]||[]).filter(x=>x.shiftId==='parsed'&&x.dateKey===today).forEach(x=>t+=parseFloat(x.revenue)||0);
  return t;
}
// Revenue for META calculation — EXCLUDES hora extra (extra doesn't count toward goal)
function getChatterWeekRevenue(id){
  let t=0;getWeekDates().forEach(d=>S.models.forEach(m=>{t+=parseFloat(S.revenues[`${id}_${m.id}_${fmt(d)}`])||0;}));
  return t;
}
// Revenue for DISPLAY — INCLUDES hora extra
function getChatterWeekRevenueTotal(id){
  return getChatterWeekRevenue(id)+getChatterExtraRevenue(id);
}
function getWeekAbsencesData(){
  const wd=getWeekDates();
  const wkStart=fmt(wd[0]),wkEnd=fmt(wd[6]);
  return S.absences.filter(a=>a.date>=wkStart&&a.date<=wkEnd);
}

// ---------- chips ----------
document.querySelectorAll('.chip').forEach(chip=>chip.addEventListener('click',()=>chip.classList.toggle('sel')));

// ---------- INIT ----------
load();
initFirebaseWithRetry();
document.getElementById('abs-date').value=todayKey();

if(!S.hasSeededStudies&&!S.studies.length){
  S.studies=[
    {id:'st1',title:'Liderança Situacional — adaptar estilo ao nível do liderado',category:'liderança',priority:'alta',done:false},
    {id:'st2',title:'Feedback eficaz: SBI (Situação, Comportamento, Impacto)',category:'comunicacao',priority:'alta',done:false},
    {id:'st3',title:'Preparar treinamento: técnicas de retenção para chatters júniores',category:'treinamento',priority:'media',done:false},
    {id:'st4',title:'Gestão de tempo: matriz de Eisenhower',category:'gestao',priority:'media',done:false},
    {id:'st5',title:'Técnicas de vendas conversacionais',category:'vendas',priority:'alta',done:false},
  ];
  S.hasSeededStudies=true;
  save();
}

updateClock();setInterval(updateClock,1000);
renderHome();

/* ===========================================================
   MANAGER PROFILE
   =========================================================== */
function renderManagerProfile(){
  const el=document.getElementById('manager-profile-display');
  if(!el)return;
  const p=S.managerProfile||{};
  if(!p.name&&!p.cargo){
    el.innerHTML='<div style="color:var(--text3);font-size:13px;text-align:center;padding:8px">Clique em editar para configurar seu perfil</div>';
    return;
  }
  el.innerHTML=`<div style="display:flex;align-items:center;gap:14px">
    <div style="width:56px;height:56px;border-radius:50%;overflow:hidden;background:var(--bg-soft);border:2px solid var(--line);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:24px">
      ${p.photoUrl?`<img src="${p.photoUrl}" style="width:100%;height:100%;object-fit:cover">`:'👤'}
    </div>
    <div><div style="font-weight:800;font-size:16px">${p.name||'Gestor'}</div>
    <div style="font-size:12.5px;color:var(--text2)">${p.cargo||''}</div></div>
  </div>`;
}
function openManagerProfileModal(){
  const p=S.managerProfile||{};
  const nameEl=document.getElementById('mgr-name');
  const cargoEl=document.getElementById('mgr-cargo');
  if(nameEl)nameEl.value=p.name||'';
  if(cargoEl)cargoEl.value=p.cargo||'';
  const preview=document.getElementById('mgr-photo-preview');
  if(preview&&p.photoUrl)preview.innerHTML=`<img src="${p.photoUrl}" style="width:100%;height:100%;object-fit:cover">`;
  openModal('m-manager-profile');
}
function loadManagerPhoto(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const preview=document.getElementById('mgr-photo-preview');
    if(preview)preview.innerHTML=`<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover">`;
    if(!S.managerProfile)S.managerProfile={};
    S.managerProfile.photoUrl=e.target.result;
  };
  reader.readAsDataURL(file);
}
function saveManagerProfile(){
  if(!S.managerProfile)S.managerProfile={};
  S.managerProfile.name=document.getElementById('mgr-name')?.value||'';
  S.managerProfile.cargo=document.getElementById('mgr-cargo')?.value||'';
  save();closeModal('m-manager-profile');
  renderManagerProfile();toast('✅ Perfil salvo!');
}

/* ===========================================================
   DEMANDAS 2 — with dates and 48h alerts
   =========================================================== */
function renderDemandas2(){
  const el=document.getElementById('demandas2-list');
  if(!el)return;
  const today=todayKey();
  const items=S.demandas2[today]||[];
  if(!items.length){el.innerHTML='<div style="color:var(--text3);font-size:12.5px">Nenhuma demanda</div>';return;}
  el.innerHTML=items.map(item=>{
    const overdue=item.date&&item.date<today;
    const near=item.date&&!overdue&&isWithin48h(item.date);
    return`<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)">
      <button onclick="toggleDemanda2('${item.id}')" style="width:22px;height:22px;border-radius:5px;border:2px solid ${item.done?'var(--ok)':'var(--line)'};background:${item.done?'var(--ok)':'transparent'};cursor:pointer;flex-shrink:0;margin-top:2px;display:flex;align-items:center;justify-content:center">${item.done?'<span style="color:#fff;font-size:11px">✓</span>':''}</button>
      <div style="flex:1">
        <div style="font-size:13.5px;${item.done?'text-decoration:line-through;color:var(--text3)':''}">${item.text}</div>
        ${item.date?`<div style="font-size:11px;color:${overdue?'var(--bad)':near?'var(--warn)':'var(--text3)'};margin-top:2px">${overdue?'⚠️ vencida':'📅'} ${item.date}</div>`:''}
      </div>
      <button onclick="removeDemanda2('${item.id}')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:13px">✕</button>
    </div>`;
  }).join('');
  const dateEl=document.getElementById('demandas2-date');
  if(dateEl&&!dateEl.value)dateEl.value=today;
}
function isWithin48h(dateStr){
  const d=new Date(dateStr+'T23:59:00');
  const diff=d-new Date();
  return diff>0&&diff<=48*3600*1000;
}
function addDemanda2(){
  const text=document.getElementById('demandas2-text')?.value.trim();
  const date=document.getElementById('demandas2-date')?.value||'';
  if(!text)return;
  const today=todayKey();
  if(!S.demandas2[today])S.demandas2[today]=[];
  S.demandas2[today].push({id:'d2'+Date.now(),text,date,done:false});
  document.getElementById('demandas2-text').value='';
  save();renderDemandas2();
}
function toggleDemanda2(id){
  const today=todayKey();
  const item=(S.demandas2[today]||[]).find(x=>x.id===id);
  if(item){item.done=!item.done;save();renderDemandas2();}
}
function removeDemanda2(id){
  const today=todayKey();
  S.demandas2[today]=(S.demandas2[today]||[]).filter(x=>x.id!==id);
  save();renderDemandas2();
}

/* ===========================================================
   MOTIVACIONAL HOME
   =========================================================== */
function renderMotivacionalHome(){
  const el=document.getElementById('home-motiv-content');
  if(!el)return;
  const wkey=getWeekKey();
  const data=S.motivacionalHome[wkey]||{};
  if(!data.idea){
    el.innerHTML=`<div style="color:var(--text3);font-size:13px">Nenhuma ideia motivacional esta semana.<br><button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="navTo('gestao')">Adicionar na Gestão →</button></div>`;
    return;
  }
  el.innerHTML=`<div style="font-size:14px;line-height:1.6;color:var(--text)">${data.idea}</div>
    ${data.results?`<div style="margin-top:8px;font-size:12px;color:var(--text2);border-top:1px solid var(--line);padding-top:8px"><strong>Resultado:</strong> ${data.results}</div>`:''}`;
}
function openMotivacionalHome(){navTo('gestao');}
function saveMotivacionalGestao(){
  const wkey=getWeekKey();
  if(!S.motivacionalHome[wkey])S.motivacionalHome[wkey]={};
  S.motivacionalHome[wkey].idea=document.getElementById('motiv-idea-gestao')?.value||'';
  S.motivacionalHome[wkey].results=document.getElementById('motiv-results-gestao')?.value||'';
  save();renderMotivacionalHome();
}

/* ===========================================================
   JANELA DE TURNOS — empty slots in upcoming days
   =========================================================== */
function renderJanelaPanel(){
  const panel=document.getElementById('home-janela-panel');
  const list=document.getElementById('home-janela-list');
  if(!panel||!list)return;
  const DAY_KEYS=['dom','seg','ter','qua','qui','sex','sab'];
  const DAY_LABEL={seg:'Seg',ter:'Ter',qua:'Qua',qui:'Qui',sex:'Sex',sab:'Sáb',dom:'Dom'};
  const gaps=[];
  // Check next 7 days for models without any coverage
  for(let i=1;i<=7;i++){
    const d=new Date();d.setDate(d.getDate()+i);
    const dk=DAY_KEYS[d.getDay()];
    S.models.forEach(m=>{
      const covered=S.shifts.some(s=>(s.days||[]).includes(dk)&&(s.modelIds||[]).includes(m.id));
      if(!covered)gaps.push({day:DAY_LABEL[dk],date:fmt(d),model:m});
    });
  }
  if(!gaps.length){panel.style.display='none';return;}
  panel.style.display='block';
  list.innerHTML=gaps.slice(0,6).map(g=>`
    <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line)">
      <span style="font-size:16px">${g.model.emoji||'🧩'}</span>
      <div><div style="font-weight:600;font-size:13px">${g.model.name}</div>
      <div style="font-size:11.5px;color:var(--text2)">${g.day} ${g.date} — sem cobertura</div></div>
    </div>`).join('');
}

/* ===========================================================
   48H DEADLINE ALERTS for demandas in home panel
   =========================================================== */
function render48hAlerts(){
  const el=document.getElementById('home-demandas-urgentes');
  if(!el)return;
  const today=todayKey();
  const urgent=[];
  // Check all demandas2 across days
  Object.entries(S.demandas2||{}).forEach(([day,items])=>{
    (items||[]).forEach(item=>{
      if(!item.done&&item.date&&!urgent.find(x=>x.id===item.id)){
        const overdue=item.date<today;
        const near=!overdue&&isWithin48h(item.date);
        if(overdue||near)urgent.push({...item,overdue});
      }
    });
  });
  // Check trainings
  S.trainings.forEach(t=>{
    if(t.date&&isWithin48h(t.date))urgent.push({id:'tr_'+t.id,text:`Treinamento: ${t.title}`,date:t.date,overdue:false,training:true});
  });
  if(!urgent.length){el.innerHTML='';return;}
  el.innerHTML=`<div class="panel" style="border-color:var(--warn)">
    <div class="panel-head"><div class="panel-title" style="color:var(--warn)">⏰ Próximas datas</div></div>
    ${urgent.map(item=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)">
      <span style="font-size:16px">${item.overdue?'🚨':'⏳'}</span>
      <div style="flex:1"><div style="font-size:13px;font-weight:600">${item.text}</div>
      <div style="font-size:11px;color:${item.overdue?'var(--bad)':'var(--warn)'}">${item.overdue?'Vencida:':'Prazo:'} ${item.date}</div></div>
    </div>`).join('')}
  </div>`;
}

/* ===========================================================
   MODEL REQUESTS SPLIT
   =========================================================== */
function renderModelRequestsSplit(){
  const el=document.getElementById('model-requests-split-list');
  if(!el)return;
  const wkey=getWeekKey();
  if(!S.modelRequestsSplit)S.modelRequestsSplit={};
  if(!S.modelRequestsSplit[wkey])S.modelRequestsSplit[wkey]={};
  if(!S.models.length){el.innerHTML='<div style="color:var(--text3);font-size:12.5px">Cadastre modelos primeiro</div>';return;}
  el.innerHTML=S.models.map(m=>`
    <div style="margin-bottom:12px">
      <label class="flabel">${m.emoji||'🧩'} ${m.name}</label>
      <textarea class="ftext" id="mr-split-${m.id}" style="min-height:60px" placeholder="Requisições para ${m.name}..." onblur="saveModelRequestSplit('${m.id}')">${S.modelRequestsSplit[wkey][m.id]||''}</textarea>
    </div>`).join('');
}
function saveModelRequestSplit(modelId){
  const wkey=getWeekKey();
  if(!S.modelRequestsSplit)S.modelRequestsSplit={};
  if(!S.modelRequestsSplit[wkey])S.modelRequestsSplit[wkey]={};
  S.modelRequestsSplit[wkey][modelId]=document.getElementById('mr-split-'+modelId)?.value||'';
  save();
}

/* ===========================================================
   CHAT ANALYSIS — daily per chatter, feeds ficha
   =========================================================== */
const CHAT_METRICS=['conexao','conducao','engajamento','conversao','resposta','naturalidade'];
const CHAT_METRIC_LABELS={conexao:'Conexão',conducao:'Condução',engajamento:'Engajamento',conversao:'Conversão',resposta:'Resposta',naturalidade:'Naturalidade'};

function openChatAnalysis(){
  const sel=document.getElementById('ca-chatter');
  if(sel)sel.innerHTML=S.chatters.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  CHAT_METRICS.forEach(m=>{const el=document.getElementById('ca-'+m);if(el)el.value='';});
  const f=document.getElementById('ca-fortes');const fr=document.getElementById('ca-fracos');
  if(f)f.value='';if(fr)fr.value='';
  openModal('m-chat-analysis');
}
function saveChatAnalysis(){
  const chatterId=document.getElementById('ca-chatter')?.value;
  if(!chatterId){toast('Selecione um chatter');return;}
  const analysis={id:'ca'+Date.now(),chatterId,date:todayKey(),fortes:document.getElementById('ca-fortes')?.value||'',fracos:document.getElementById('ca-fracos')?.value||''};
  CHAT_METRICS.forEach(m=>{analysis[m]=parseInt(document.getElementById('ca-'+m)?.value)||0;});
  const today=todayKey();
  if(!S.chatAnalyses[today])S.chatAnalyses[today]=[];
  S.chatAnalyses[today].push(analysis);
  // Auto-update chatter ficha with average scores
  updateFichaFromAnalysis(chatterId);
  save();closeModal('m-chat-analysis');renderChatAnalysisList();
  toast('✅ Análise salva!');
}
function updateFichaFromAnalysis(chatterId){
  if(!S.chatterFichas[chatterId])S.chatterFichas[chatterId]={tech:{},behavior:{},potential:{},risk:{},history:[]};
  const f=S.chatterFichas[chatterId];
  // Collect all analyses for this chatter
  const allAnalyses=[];
  Object.values(S.chatAnalyses||{}).forEach(dayArr=>{
    (dayArr||[]).filter(a=>a.chatterId===chatterId).forEach(a=>allAnalyses.push(a));
  });
  if(!allAnalyses.length)return;
  const avg=key=>Math.round(allAnalyses.reduce((s,a)=>s+(a[key]||0),0)/allAnalyses.length);
  // Map to ficha fields
  const scores={conversao:avg('conversao'),resposta:avg('resposta'),evolucao:avg('engajamento')};
  const labels={1:'1 - Fraco',2:'2 - Regular',3:'3 - Bom',4:'4 - Ótimo',5:'5 - Excelente'};
  Object.entries(scores).forEach(([k,v])=>{if(v>0)f.tech[k]=labels[v]||String(v);});
  const behavScores={intensidade:avg('conexao'),comunicacao:avg('conducao'),energia:avg('naturalidade')};
  Object.entries(behavScores).forEach(([k,v])=>{if(v>0)f.behavior[k]=labels[v]||String(v);});
}
function renderChatAnalysisList(){
  const el=document.getElementById('chat-analysis-list');
  const sel=document.getElementById('chat-analysis-chatter');
  if(!el)return;
  // Populate select
  if(sel&&!sel.options.length)sel.innerHTML='<option value="">— selecionar chatter —</option>'+S.chatters.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  const chatterId=sel?.value;
  if(!chatterId){el.innerHTML='<div style="color:var(--text3);font-size:12.5px">Selecione um chatter</div>';return;}
  const analyses=[];
  Object.entries(S.chatAnalyses).forEach(([date,arr])=>{
    (arr||[]).filter(a=>a.chatterId===chatterId).forEach(a=>analyses.push({...a,date}));
  });
  analyses.sort((a,b)=>b.date.localeCompare(a.date));
  if(!analyses.length){el.innerHTML='<div style="color:var(--text3);font-size:12.5px">Nenhuma análise para este chatter</div>';return;}
  el.innerHTML=analyses.slice(0,5).map(a=>`
    <div style="background:var(--bg-soft);border-radius:9px;padding:10px;margin-bottom:8px">
      <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:7px">${a.date}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px">
        ${CHAT_METRICS.map(m=>`<div style="text-align:center;background:var(--bg);border-radius:7px;padding:6px 4px">
          <div style="font-size:10px;color:var(--text3)">${CHAT_METRIC_LABELS[m]}</div>
          <div style="font-size:18px;font-weight:800;color:${a[m]>=4?'var(--ok)':a[m]>=3?'var(--warn)':'var(--bad)'}">${a[m]||'—'}</div>
        </div>`).join('')}
      </div>
      ${a.fortes?`<div style="font-size:12px"><strong>✅</strong> ${a.fortes}</div>`:''}
      ${a.fracos?`<div style="font-size:12px;margin-top:4px"><strong>⚠️</strong> ${a.fracos}</div>`:''}
    </div>`).join('');
}

/* ===========================================================
   ESTUDOS — updated with 3 fields each
   =========================================================== */
function saveEstudosDraft(){
  S.estudosDraft={};
  ['fortes1','fortes2','fortes3','fracos1','fracos2','fracos3','foco1','foco2','foco3'].forEach(k=>{
    S.estudosDraft[k]=document.getElementById('estudos-'+k)?.value||'';
  });
  save();
}
function renderEstudos(){
  const d=S.estudosDraft||{};
  ['fortes1','fortes2','fortes3','fracos1','fracos2','fracos3','foco1','foco2','foco3'].forEach(k=>{
    const el=document.getElementById('estudos-'+k);
    if(el&&!el.value)el.value=d[k]||'';
  });
  renderStudyList();
  renderEstudosHistorico();
}
function saveEstudosSnapshot(){
  saveEstudosDraft();
  const d=S.estudosDraft;
  const hasContent=Object.values(d).some(v=>v.trim());
  if(!hasContent){toast('⚠️ Preencha pelo menos um campo');return;}
  if(!S.estudosHistory)S.estudosHistory=[];
  S.estudosHistory.push({date:todayKey(),...d});
  save();renderEstudosHistorico();toast('✅ Snapshot salvo!');
}
function renderEstudosHistorico(){
  const el=document.getElementById('estudos-historico');
  if(!el)return;
  const history=S.estudosHistory||[];
  if(!history.length){el.innerHTML='<div style="color:var(--text3);font-size:12.5px;padding:8px 0">Nenhum snapshot ainda. Preencha e clique "💾 Salvar snapshot".</div>';return;}
  el.innerHTML=[...history].reverse().map((snap,i)=>`
    <div style="padding:12px 0;border-bottom:1px solid var(--line)">
      <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px">${snap.date}${i===0?' · <span style="color:var(--ok)">mais recente</span>':''}</div>
      ${[1,2,3].map(n=>snap['fortes'+n]?`<div style="margin-bottom:4px"><span style="font-size:11px;font-weight:700;color:var(--ok)">✅ FORTE ${n}</span><div style="font-size:13px;margin-top:2px">${snap['fortes'+n]}</div></div>`:'').join('')}
      ${[1,2,3].map(n=>snap['fracos'+n]?`<div style="margin-bottom:4px"><span style="font-size:11px;font-weight:700;color:var(--warn)">⚠️ MELHORAR ${n}</span><div style="font-size:13px;margin-top:2px">${snap['fracos'+n]}</div></div>`:'').join('')}
      ${[1,2,3].map(n=>snap['foco'+n]?`<div style="margin-bottom:4px"><span style="font-size:11px;font-weight:700;color:var(--info)">🎯 FOCO ${n}</span><div style="font-size:13px;margin-top:2px">${snap['foco'+n]}</div></div>`:'').join('')}
    </div>`).join('');
}

/* ===========================================================
   TURNO — delete shift button
   =========================================================== */
function deleteShift(shiftId){
  if(!confirm('Remover este turno?'))return;
  S.shifts=S.shifts.filter(s=>s.id!==shiftId);
  save();renderTurno();toast('Turno removido');
}

/* ===========================================================
   FATURAMENTO — meta progress + chatter analysis
   =========================================================== */
function renderMetaProgress(){
  const el=document.getElementById('fat-meta-progress');
  if(!el)return;
  const wkey=getWeekKey();
  const goals=S.chatterWeekGoals[wkey]||{};
  const ativos=S.chatters.filter(c=>c.time!=='elite');
  if(!ativos.length){el.innerHTML='';return;}
  el.innerHTML=`<div style="margin-bottom:4px;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.05em">Metas da semana</div>`+
  ativos.map(c=>{
    const meta=parseFloat(goals[c.id])||0;
    const rev=getChatterWeekRevenue(c.id);
    const extra=getChatterExtraRevenue(c.id);
    const pct=meta>0?Math.min(100,Math.round((rev/meta)*100)):0;
    const falta=meta>0?Math.max(0,meta-rev):0;
    return`<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div style="font-weight:600;font-size:13px">${c.name}</div>
        <div style="font-size:12px;font-family:var(--font-mono)">${moneyShort(rev)}${meta>0?` / ${moneyShort(meta)}`:''}</div>
      </div>
      ${meta>0?`<div style="background:var(--line);border-radius:4px;height:8px;overflow:hidden;margin-bottom:3px">
        <div style="height:8px;border-radius:4px;background:${pct>=100?'var(--ok)':pct>=60?'var(--warn)':'var(--bad)'};width:${pct}%;transition:width .3s"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3)">
        <span>${pct}%${extra>0?` · +${moneyShort(extra)} extra`:''}</span>
        ${falta>0?`<span style="color:var(--bad)">falta ${moneyShort(falta)}</span>`:`<span style="color:var(--ok)">✅ meta batida!</span>`}
      </div>`:`<div style="font-size:11px;color:var(--text3)">Sem meta definida${extra>0?` · extra: ${moneyShort(extra)}`:''}</div>`}
    </div>`;
  }).join('');
}

function renderExtraProgress(){
  const el=document.getElementById('fat-extra-progress');
  if(!el)return;
  const chattersWithExtra=S.chatters.filter(c=>getChatterExtraRevenue(c.id)>0);
  if(!chattersWithExtra.length){el.innerHTML='<div style="color:var(--text3);font-size:12.5px">Nenhuma hora extra registrada esta semana</div>';return;}
  el.innerHTML=chattersWithExtra.map(c=>{
    const extra=getChatterExtraRevenue(c.id);
    return`<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--line)">
      <div style="font-weight:600;font-size:13px">${c.name}</div>
      <div style="font-family:var(--font-mono);font-weight:700;color:var(--info)">⚡ ${money(extra)}</div>
    </div>`;
  }).join('');
}

function renderChatterAnalysis(){
  const el=document.getElementById('fat-chatter-analysis');
  if(!el)return;
  const sel=document.getElementById('fat-analysis-chatter');
  if(sel&&!sel.options.length)sel.innerHTML='<option value="">— selecionar —</option>'+S.chatters.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  const chatterId=sel?.value;
  if(!chatterId){el.innerHTML='<div style="color:var(--text3);font-size:12.5px">Selecione um chatter para ver análise</div>';return;}

  const f=S.chatterFichas[chatterId];
  const analytics=f?.analytics?.weeklyData||{};
  const wd=getWeekDates();

  // Aggregate analytics from parsed reports this week
  let totalRev=0,totalSales=0,totalTicket=0,totalHighPct=0,totalGap=0,extraTot=0,totalVPH=0,daysCount=0;
  wd.forEach(d=>{
    const dk=fmt(d);
    if(analytics[dk]){
      const a=analytics[dk];
      totalRev+=a.chatterTotal||0;
      totalSales+=a.totalVendas||0;
      if(a.ticketMedio>0){totalTicket+=a.ticketMedio;totalVPH+=a.vendasPorHora||0;totalHighPct+=a.highTicketPct||0;daysCount++;}
      if(a.maxGapMin>totalGap)totalGap=a.maxGapMin;
      extraTot+=a.extraTotal||0;
    }
  });

  const ticketMedioSemana=daysCount>0?totalTicket/daysCount:0;
  const highPctSemana=daysCount>0?Math.round(totalHighPct/daysCount):0;
  const vphSemana=daysCount>0?Math.round((totalVPH/daysCount)*100)/100:0;

  // Fall back to revenue data if no analytics yet
  if(!daysCount){
    let revTotal=0;let revDays=0;
    wd.forEach(d=>{let dr=0;S.models.forEach(m=>{dr+=parseFloat(S.revenues[`${chatterId}_${m.id}_${fmt(d)}`])||0;});if(dr>0){revTotal+=dr;revDays++;}});
    totalRev=revTotal;
    const ticketFallback=totalSales>0?revTotal/totalSales:0;
    el.innerHTML=`
      <div class="reprow"><div class="replb">Faturamento semana</div><div class="repval">${money(totalRev)}</div></div>
      <div class="reprow"><div class="replb">Dias com vendas</div><div class="repval">${revDays} dias</div></div>
      <div style="margin-top:8px;font-size:12px;color:var(--text3)">Cole relatórios na aba Rel.Equipe para ver ticket médio, high ticket e tempo sem venda.</div>`;
    return;
  }

  el.innerHTML=`
    <div class="reprow"><div class="replb">Faturamento semana</div><div class="repval">${money(totalRev)}</div></div>
    <div class="reprow"><div class="replb">Ticket médio (semana)</div><div class="repval">${money(ticketMedioSemana)}</div></div>
    <div class="reprow"><div class="replb">% High ticket</div><div class="repval" style="color:${highPctSemana>=30?'var(--ok)':'var(--warn)'}">${highPctSemana}%</div></div>
    <div class="reprow"><div class="replb">Vendas/hora (média)</div><div class="repval" style="color:${vphSemana>=1?'var(--ok)':vphSemana>=0.5?'var(--warn)':'var(--bad)'}">${vphSemana}</div></div>
    <div class="reprow"><div class="replb">Maior tempo sem venda</div><div class="repval" style="color:${totalGap>60?'var(--bad)':totalGap>30?'var(--warn)':'var(--ok)'}">${totalGap?totalGap+'min':'—'}</div></div>
    ${extraTot>0?`<div class="reprow"><div class="replb">Hora extra (semana)</div><div class="repval" style="color:var(--info)">⚡ ${money(extraTot)}</div></div>`:''}
    <div class="reprow"><div class="replb">Dias analisados</div><div class="repval">${daysCount}</div></div>
    ${daysCount>0?`
    <div style="margin-top:10px;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Por dia</div>
    ${wd.filter(d=>analytics[fmt(d)]).map(d=>{const a=analytics[fmt(d)];return`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line);font-size:12px">
        <span style="color:var(--text2)">${fmt(d)}</span>
        <span>${money(a.chatterTotal)} · ${a.totalVendas} vendas · ${a.vendasPorHora||0}/h</span>
      </div>`}).join('')}`:''}`;
}

/* ===========================================================
   GESTÃO — updated renderGestao
   =========================================================== */
function renderGestaoMissingReports(){
  const el=document.getElementById('gestao-missing-reports');
  if(!el)return;
  const wd=getWeekDates();
  const missing=[];
  wd.forEach(d=>{
    const dk=fmt(d);
    if(dk>todayKey())return; // future days skip
    S.chatters.filter(c=>c.time!=='elite').forEach(c=>{
      const hasRev=S.models.some(m=>(parseFloat(S.revenues[`${c.id}_${m.id}_${dk}`])||0)>0);
      if(!hasRev)missing.push({name:c.name,id:c.id,date:dk});
    });
  });
  if(!missing.length){el.innerHTML='<div style="color:var(--ok);font-size:13px">✅ Todos os relatórios recebidos esta semana</div>';return;}
  // Group by chatter
  const byChatter={};
  missing.forEach(x=>{if(!byChatter[x.id])byChatter[x.id]={name:x.name,dates:[]};byChatter[x.id].dates.push(x.date);});
  el.innerHTML=Object.values(byChatter).map(x=>`
    <div style="padding:8px 0;border-bottom:1px solid var(--line)">
      <div style="font-weight:600;font-size:13px;margin-bottom:4px">${x.name}</div>
      <div style="font-size:11.5px;color:var(--bad)">Sem relatório: ${x.dates.join(', ')}</div>
      <textarea class="ftext" placeholder="Justificativa (falta, folga, etc.)..." style="min-height:40px;font-size:12px;margin-top:6px" onblur="saveJustificativa('${x.id}',this.value)"></textarea>
    </div>`).join('');
}
function saveJustificativa(chatterId,text){
  if(!S.justificativas)S.justificativas={};
  S.justificativas[todayKey()+'_'+chatterId]=text;
  save();
}

function renderGestao(){
  renderManagerProfile();
  renderMorningRoutine();
  renderDailyList('problemsToday','problems-list','problems-badge');
  renderDemandas2();
  renderTrainings();
  renderPrizePanel();
  const wkey=getWeekKey();
  const motiv=S.motivacionalHome[wkey]||{};
  const ideaEl=document.getElementById('motiv-idea-gestao');
  const resEl=document.getElementById('motiv-results-gestao');
  if(ideaEl&&!ideaEl.value)ideaEl.value=motiv.idea||'';
  if(resEl&&!resEl.value)resEl.value=motiv.results||'';
  renderModelRequestsSplit();
  renderScheduleRequests();
  const sel=document.getElementById('sched-req-chatter');
  if(sel&&!sel.options.length)sel.innerHTML=S.chatters.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  renderChatAnalysisList();
  renderOrientList();
  renderGestaoMissingReports();
}

/* ===========================================================
   EVOLUÇÃO — auto-summary of all people
   =========================================================== */
function renderEvolucao(){
  const el=document.getElementById('evolucao-content');
  if(!el)return;
  const wkey=getWeekKey();
  let html='';

  // Manager card — profile only, no estudos
  const p=S.managerProfile||{};
  html+=`<div class="panel" style="border-left:3px solid var(--info);margin-bottom:16px">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:44px;height:44px;border-radius:50%;overflow:hidden;background:var(--bg-soft);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px">
        ${p.photoUrl?`<img src="${p.photoUrl}" style="width:100%;height:100%;object-fit:cover">`:'👤'}
      </div>
      <div>
        <div style="font-weight:800;font-size:15px">${p.name||'Gestor'}</div>
        <div style="font-size:12px;color:var(--info)">${p.cargo||'Gestor de Chatters'}</div>
      </div>
    </div>
  </div>`;

  // Team section
  html+=`<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Equipe — evolução semanal</div>`;

  if(!S.chatters.length){
    html+='<div style="color:var(--text3);font-size:13px;padding:12px 0">Cadastre chatters na aba Equipe</div>';
    el.innerHTML=html;return;
  }

  S.chatters.forEach(c=>{
    const rev=getChatterWeekRevenueTotal(c.id);
    const goals=S.chatterWeekGoals[wkey]||{};
    const meta=parseFloat(goals[c.id])||0;
    const pct=meta>0?Math.round((getChatterWeekRevenue(c.id)/meta)*100):null;
    const f=S.chatterFichas[c.id]||{};
    const analytics=f?.analytics?.weeklyData||{};
    const wd=getWeekDates();
    let ticketSum=0,ticketDays=0,highPctSum=0;
    wd.forEach(d=>{const a=analytics[fmt(d)];if(a&&a.ticketMedio>0){ticketSum+=a.ticketMedio;highPctSum+=a.highTicketPct||0;ticketDays++;}});
    const ticketMedio=ticketDays>0?ticketSum/ticketDays:0;
    const highPct=ticketDays>0?Math.round(highPctSum/ticketDays):0;
    const analyses=[];
    Object.values(S.chatAnalyses||{}).forEach(arr=>(arr||[]).filter(a=>a.chatterId===c.id).forEach(a=>analyses.push(a)));
    const avgScore=analyses.length?Math.round(CHAT_METRICS.reduce((s,m)=>s+analyses.reduce((ss,a)=>ss+(a[m]||0),0)/analyses.length,0)/CHAT_METRICS.length*10)/10:null;
    const timeLabel=c.time==='elite'?'<span class="pill pill-warn" style="font-size:9px">⭐ Elite</span>':'<span class="pill pill-flat" style="font-size:9px">Básico</span>';

    html+=`<div class="panel" style="margin-bottom:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:6px">
          <div style="font-weight:700;font-size:14px">${c.name}</div>${timeLabel}
          <span class="pill pill-flat" style="font-size:9px">${c.level}</span>
        </div>
        <div style="font-family:var(--font-mono);font-weight:800;font-size:14px;color:var(--ok)">${moneyShort(rev)}</div>
      </div>
      ${meta>0?`<div style="background:var(--line);border-radius:4px;height:6px;overflow:hidden;margin-bottom:4px">
        <div style="height:6px;border-radius:4px;background:${pct>=100?'var(--ok)':pct>=60?'var(--warn)':'var(--bad)'};width:${Math.min(100,pct||0)}%"></div>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:6px">${pct}% da meta${pct<60?' · 🔴 atenção':pct>=100?' · ✅':''}</div>`:''}
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${ticketMedio>0?`<span style="font-size:12px;color:var(--text2)">Ticket médio: <strong>${money(ticketMedio)}</strong></span>`:''}
        ${highPct>0?`<span style="font-size:12px;color:var(--text2)">High ticket: <strong style="color:${highPct>=30?'var(--ok)':'var(--warn)'}">${highPct}%</strong></span>`:''}
        ${avgScore!==null?`<span style="font-size:12px;color:var(--text2)">Análise: <strong style="color:${avgScore>=4?'var(--ok)':avgScore>=3?'var(--warn)':'var(--bad)'}">${avgScore}/5</strong></span>`:''}
      </div>
    </div>`;
  });

  el.innerHTML=html;
}

