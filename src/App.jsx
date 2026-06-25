import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { fetchAll, saveData } from "./api";

const DB = { CONFIG: "config", LEAVES: "leaves", EMPLOYEES: "employees", SPECIAL: "specialIntent", CLOSED: "closedDays", BLOCKED: "blockedDays", SKIP: "skipLeave", PT_EMP: "partTimeEmployees", PT_SLOTS: "partTimeSlots" };

const DEF_PT_EMP = ["陳小瑜", "林阿明", "吳小花"];
const SLOT_LABELS = { allday: "全天", noon: "中午", evening: "晚上" };

// ── helpers ──────────────────────────────────────────────────────────
// ── generate month options: 當月起至 2026年12月 ──────────────────────
function getMonthOptions(){
  const opts=[];
  const now=new Date();
  let y=now.getFullYear(),m=now.getMonth();
  while(y<2026||(y===2026&&m<=11)){
    opts.push({value:`${y}-${String(m).padStart(2,"0")}`,label:`${y}年${m+1}月`});
    m++;if(m>11){m=0;y++}
  }
  // 保底：至少包含當月
  if(opts.length===0)opts.push({value:`${now.getFullYear()}-${String(now.getMonth()).padStart(2,"0")}`,label:`${now.getFullYear()}年${now.getMonth()+1}月`});
  return opts;
}
function getDefaultMonth(){
  const opts=getMonthOptions();
  const d=new Date();
  const next=`${d.getMonth()===11?d.getFullYear()+1:d.getFullYear()}-${String((d.getMonth()+1)%12).padStart(2,"0")}`;
  // 預設下個月；若超出選單範圍則取最後一個月
  return opts.some(o=>o.value===next)?next:opts[opts.length-1].value;
}
function fmt(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function monthLabel(d) { return d.toLocaleDateString("zh-TW", { year: "numeric", month: "long" }); }
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function weekdayStr(y, m, d) { return ["日","一","二","三","四","五","六"][new Date(y,m,d).getDay()]; }
function isWeekend(y, m, d) { const day = new Date(y,m,d).getDay(); return day === 0 || day === 6; }

// ── Taiwan holidays 2026 (行政院人事行政總處公告，含補假，無補班) ──
// 固定日期國定假日（每年相同）
const H_FIXED = {
  "01-01":"元旦",
  "02-28":"和平紀念日",
  "04-04":"兒童節",
  "05-01":"勞動節",
  "09-28":"教師節",
  "10-10":"國慶日",
  "10-25":"台灣光復節",
  "12-25":"行憲紀念日",
};
// 農曆節日＋補假（每年不同）
const H_YEAR = {
  2025:{
    "01-27":"除夕","01-28":"春節","01-29":"春節","01-30":"春節","01-31":"春節補假",
    "04-03":"清明節補假","04-05":"清明節",
    "05-30":"端午節","05-31":"端午節補假",
    "09-29":"教師節補假",
    "10-06":"中秋節",
    "10-24":"光復節補假",
  },
  2026:{
    // 春節連假 2/14(六)~2/22(日) 共9天
    "02-15":"小年夜","02-16":"除夕","02-17":"春節初一","02-18":"春節初二","02-19":"春節初三","02-20":"小年夜補假",
    // 228連假 2/27(五)~3/1(日) 共3天
    "02-27":"和平紀念日補假",
    // 清明連假 4/3(五)~4/6(一) 共4天
    "04-03":"兒童節補假","04-05":"清明節","04-06":"清明節補假",
    // 端午連假 6/19(五)~6/21(日) 共3天
    "06-19":"端午節",
    // 中秋+教師節連假 9/25(五)~9/28(一) 共4天
    "09-25":"中秋節",
    // 國慶連假 10/9(五)~10/11(日) 共3天
    "10-09":"國慶日補假",
    // 光復節連假 10/24(六)~10/26(一) 共3天
    "10-26":"光復節補假",
    // 行憲紀念日連假 12/25(五)~12/27(日) 共3天
  },
  2027:{
    "02-05":"除夕","02-06":"春節初一","02-07":"春節初二","02-08":"春節初三","02-09":"春節補假",
    "04-05":"清明節","04-03":"兒童節補假","04-06":"清明節補假",
    "06-09":"端午節",
    "09-27":"教師節補假",
    "10-15":"中秋節",
    "10-27":"光復節補假",
  },
};
function getHolidayName(y,m,d){const k=`${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;return H_FIXED[k]||(H_YEAR[y]&&H_YEAR[y][k])||null;}
function isHoliday(y,m,d){return !!getHolidayName(y,m,d);}
function dayType(y,m,d){if(isHoliday(y,m,d))return"holiday";if(isWeekend(y,m,d))return"weekend";return"weekday";}
const DAY_LABELS={holiday:"國定假日",weekend:"週末",weekday:"平日"};

const DEF_CONFIG={maxWeekday:2,maxWeekend:1,maxHoliday:1,maxPerMonth:5,maxHolidayMonth:2};
const DEF_EMP=["王小明","李美玲","張大偉","陳怡君","林志豪","黃淑芬","吳建宏","周雅婷","鄭宗翰","蔡佳穎"];

function getDayLimit(cfg,y,m,d){const t=dayType(y,m,d);if(t==="holiday")return cfg.maxHoliday;if(t==="weekend")return cfg.maxWeekend;return cfg.maxWeekday;}

// ── colours ─────────────────────────────────────────────────────────
const C={bg:"#0F1117",surface:"#181B25",card:"#1E2230",cardHover:"#252A3A",border:"#2A2F42",borderLight:"#3A4060",accent:"#6C63FF",accentLight:"#8B83FF",accentDim:"rgba(108,99,255,.12)",danger:"#FF6B6B",dangerDim:"rgba(255,107,107,.12)",success:"#4ADE80",successDim:"rgba(74,222,128,.12)",warn:"#FBBF24",warnDim:"rgba(251,191,36,.12)",gold:"#D97706",goldDim:"rgba(217,119,6,.12)",text:"#E8E9F0",textSub:"#9498AD",textDim:"#5C6080"};
const baseCSS=`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Noto Sans TC',sans-serif;background:${C.bg};color:${C.text}}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}@keyframes slideIn{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:none}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`;

// ── UI components ───────────────────────────────────────────────────
function Badge({children,color=C.accent}){return <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 10px",borderRadius:20,fontSize:12,fontWeight:600,letterSpacing:.3,color,background:`${color}18`}}>{children}</span>}
function Btn({children,onClick,variant="primary",small,disabled,style:sx}){const b={display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,padding:small?"6px 14px":"10px 22px",borderRadius:10,border:"none",cursor:disabled?"not-allowed":"pointer",fontSize:small?13:14,fontWeight:600,fontFamily:"inherit",transition:"all .2s",opacity:disabled?.45:1};const s={primary:{...b,background:C.accent,color:"#fff"},ghost:{...b,background:"transparent",color:C.textSub,border:`1px solid ${C.border}`},danger:{...b,background:C.dangerDim,color:C.danger}};return <button style={{...s[variant],...sx}} onClick={disabled?undefined:onClick}>{children}</button>}
function Input({value,onChange,placeholder,type="text",style:sx}){return <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surface,color:C.text,fontSize:14,fontFamily:"inherit",outline:"none",transition:"border .2s",...sx}} onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border}/>}
function Select({value,onChange,children,style:sx}){return <select value={value} onChange={e=>onChange(e.target.value)} style={{padding:"10px 14px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surface,color:C.text,fontSize:14,fontFamily:"inherit",outline:"none",cursor:"pointer",...sx}}>{children}</select>}
function Tabs({tabs,active,onChange}){return <div style={{display:"flex",gap:4,padding:4,borderRadius:14,background:C.surface,border:`1px solid ${C.border}`}}>{tabs.map(t=><button key={t.key} onClick={()=>onChange(t.key)} style={{flex:1,padding:"10px 18px",borderRadius:10,border:"none",cursor:"pointer",fontSize:14,fontWeight:600,fontFamily:"inherit",transition:"all .25s",background:active===t.key?C.accent:"transparent",color:active===t.key?"#fff":C.textSub}}>{t.icon} {t.label}</button>)}</div>}
function Toast({msg,type,onClose}){useEffect(()=>{const t=setTimeout(onClose,2800);return()=>clearTimeout(t)},[onClose]);const colors={success:C.success,error:C.danger,warn:C.warn,info:C.accent};const color=colors[type]||C.accent;return <div style={{position:"fixed",top:"18%",left:"50%",transform:"translateX(-50%)",zIndex:9999,padding:"18px 36px",borderRadius:16,background:C.card,border:`1px solid ${color}40`,color,fontSize:18,fontWeight:700,boxShadow:`0 12px 40px ${color}25`,animation:"toastIn .3s ease",whiteSpace:"nowrap"}}>{type==="success"?"✓ ":type==="error"?"✕ ":"⚠ "}{msg}<style>{`@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(-20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style></div>}

// ══════════════════════════════════════════════════════════════════════
//  MAIN APP
// ══════════════════════════════════════════════════════════════════════
export default function App(){
  const[tab,setTab]=useState("calendar");
  const[selectedMonth,setSelectedMonth]=useState(getDefaultMonth());
  const[config,setConfig]=useState(DEF_CONFIG);
  const[employees,setEmployees]=useState(DEF_EMP);
  const[leaves,setLeaves]=useState({});
  const[closedDays,setClosedDays]=useState([]);
  const[blockedDays,setBlockedDays]=useState([]);
  const[specialIntent,setSpecialIntent]=useState({});
  const[skipLeave,setSkipLeave]=useState({}); // { "王小明": true }
  const[role,setRole]=useState("fulltime");
  const[ptEmp,setPtEmp]=useState(DEF_PT_EMP);
  const[ptSlots,setPtSlots]=useState({});
  const[currentUser,setCurrentUser]=useState("");
  const[toast,setToast]=useState(null);
  const[ready,setReady]=useState(false);
  const[dbOk,setDbOk]=useState(true);
  const[adminUnlocked,setAdminUnlocked]=useState(false);
  const[showPwModal,setShowPwModal]=useState(false);
  const[showResetModal,setShowResetModal]=useState(false);
  const[pwInput,setPwInput]=useState("");
  const pollRef=useRef(null);

  // 從 Neon DB 載入
  const loadAll=useCallback(async(init=false)=>{
    try{
      const data=await fetchAll();
      setConfig(data.config||DEF_CONFIG);
      setEmployees(data.employees||DEF_EMP);
      setLeaves(data.leaves||{});
      setClosedDays(data.closedDays||[]);
      setBlockedDays(data.blockedDays||[]);
      setSpecialIntent(data.specialIntent||{});
      setSkipLeave(data.skipLeave||{});
      setPtEmp(data.partTimeEmployees||DEF_PT_EMP);
      setPtSlots(data.partTimeSlots||{});
      setDbOk(true);
      if(init)setReady(true);
    }catch(e){
      console.error("載入失敗:",e);
      setDbOk(false);
      if(init)setReady(true);
    }
  },[]);

  useEffect(()=>{
    loadAll(true);
    pollRef.current=setInterval(()=>loadAll(),3000);
    return()=>clearInterval(pollRef.current);
  },[loadAll]);

  const updateConfig=useCallback(async c=>{setConfig(c);await saveData(DB.CONFIG,c)},[]);
  const updateEmployees=useCallback(async e=>{setEmployees(e);await saveData(DB.EMPLOYEES,e)},[]);
  const updateLeaves=useCallback(async l=>{setLeaves(l);await saveData(DB.LEAVES,l)},[]);
  const updateClosedDays=useCallback(async c=>{setClosedDays(c);await saveData(DB.CLOSED,c)},[]);
  const updateBlockedDays=useCallback(async b=>{setBlockedDays(b);await saveData(DB.BLOCKED,b)},[]);
  const updateSpecialIntent=useCallback(async s=>{setSpecialIntent(s);await saveData(DB.SPECIAL,s)},[]);
  const updateSkipLeave=useCallback(async s=>{setSkipLeave(s);await saveData(DB.SKIP,s)},[]);
  const updatePtEmp=useCallback(async e=>{setPtEmp(e);await saveData(DB.PT_EMP,e)},[]);
  const updatePtSlots=useCallback(async s=>{setPtSlots(s);await saveData(DB.PT_SLOTS,s)},[]);

  const[smY,smM]=selectedMonth.split("-").map(Number);
  const year=smY,month=smM,days=daysInMonth(year,month);
  const monthOptions=useMemo(()=>getMonthOptions(),[]);

  const dayCount=useMemo(()=>{
    const m={};for(let d=1;d<=days;d++)m[d]=0;
    Object.values(leaves).forEach(arr=>arr.forEach(ds=>{const dt=new Date(ds+"T00:00:00");if(dt.getFullYear()===year&&dt.getMonth()===month)m[dt.getDate()]=(m[dt.getDate()]||0)+1}));
    return m;
  },[leaves,year,month,days]);

  const userLeaves=useMemo(()=>{
    if(!currentUser)return[];
    return(leaves[currentUser]||[]).filter(d=>{const dt=new Date(d+"T00:00:00");return dt.getFullYear()===year&&dt.getMonth()===month});
  },[leaves,currentUser,year,month]);

  const notify=(msg,type="info")=>setToast({msg,type,key:Date.now()});

  const toggleDay=async(day)=>{
    if(!currentUser)return notify("請先選擇同仁","error");
    const dateStr=fmt(new Date(year,month,day));
    if(closedDays.includes(dateStr))return notify("此日為公休日，無法排休","error");
    if(blockedDays.includes(dateStr))return notify("此日為禁止排休日，無法排休","error");
    if((skipLeave[`${year}-${month}`]||{})[currentUser])return notify(`${currentUser} 本月已設定不需排休`,"error");
    const cur=leaves[currentUser]||[];
    if(cur.includes(dateStr)){
      updateLeaves({...leaves,[currentUser]:cur.filter(d=>d!==dateStr)});
      return notify("已取消排休","warn");
    }
    const limit=getDayLimit(config,year,month,day);
    if(dayCount[day]>=limit)return notify(`${DAY_LABELS[dayType(year,month,day)]}已達上限（${limit}人）`,"error");
    const t=dayType(year,month,day);
    if(t==="weekend"||t==="holiday"){
      const hc=cur.filter(d=>{const dt=new Date(d+"T00:00:00");if(dt.getFullYear()!==year||dt.getMonth()!==month)return false;const tt=dayType(dt.getFullYear(),dt.getMonth(),dt.getDate());return tt==="weekend"||tt==="holiday"}).length;
      if(hc>=config.maxHolidayMonth)return notify(`本月假日排休已達上限（${config.maxHolidayMonth}天）`,"error");
    }
    const mc=cur.filter(d=>{const dt=new Date(d+"T00:00:00");return dt.getFullYear()===year&&dt.getMonth()===month}).length;
    if(mc>=config.maxPerMonth)return notify(`本月排休已達上限（${config.maxPerMonth}天）`,"error");
    updateLeaves({...leaves,[currentUser]:[...cur,dateStr]});
    notify("排休成功！","success");
  };

  const exportCSV=()=>{
    let csv="\uFEFF日期,星期,類型,上限,"+employees.join(",")+",合計\n";
    for(let d=1;d<=days;d++){
      const ds=fmt(new Date(year,month,d)),wd=weekdayStr(year,month,d),t=dayType(year,month,d),lim=getDayLimit(config,year,month,d),hName=getHolidayName(year,month,d),closed=closedDays.includes(ds),blocked=blockedDays.includes(ds);
      csv+=`${ds},${wd},${closed?"公休":blocked?"禁休":hName||DAY_LABELS[t]},${closed||blocked?0:lim},`;let tot=0;
      employees.forEach(emp=>{const has=(leaves[emp]||[]).includes(ds);csv+=(has?"休":"")+",";if(has)tot++});
      csv+=tot+"\n";
    }
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    const a=document.createElement("a");a.href=url;
    a.download=`排休表_${year}年${month+1}月.csv`;a.click();
    URL.revokeObjectURL(url);notify("已匯出 CSV","success");
  };

  const exportPtCSV=()=>{
    const slotName=s=>s==="allday"?"全天":s==="noon"?"中午":s==="evening"?"晚上":s;
    let csv="\uFEFF日期,星期,類型,"+ptEmp.join(",")+"\n";
    for(let d=1;d<=days;d++){
      const ds=fmt(new Date(year,month,d)),wd=weekdayStr(year,month,d),t=dayType(year,month,d),hName=getHolidayName(year,month,d),closed=closedDays.includes(ds);
      csv+=`${ds},${wd},${closed?"公休":hName||DAY_LABELS[t]},`;
      ptEmp.forEach(emp=>{
        const slots=(ptSlots[emp]||{})[ds]||[];
        const txt=slots.length>0?slots.map(slotName).join("/"):"";
        csv+=`${txt},`;
      });
      csv=csv.slice(0,-1)+"\n";
    }
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    const a=document.createElement("a");a.href=url;
    a.download=`兼職排班表_${year}年${month+1}月.csv`;a.click();
    URL.revokeObjectURL(url);notify("已匯出兼職排班表","success");
  };

  if(!ready)return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:C.bg}}><div style={{color:C.textSub,fontSize:16}}>載入中...</div></div>;

  return(
    <div style={{minHeight:"100vh",background:C.bg,padding:"20px 16px 40px"}}>
      <style>{baseCSS}</style>
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)} key={toast.key}/>}

      <div style={{maxWidth:960,margin:"0 auto 24px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
          <div style={{width:42,height:42,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,background:"linear-gradient(135deg,#F97316,#FBBF24)"}}>🍕</div>
          <div>
            <h1 style={{fontSize:22,fontWeight:700,letterSpacing:-.5}}>小黑米排休系統</h1>
            <p style={{fontSize:13,color:C.textSub,marginTop:2}}>
              平日{config.maxWeekday}人 ・ 週末{config.maxWeekend}人 ・ 假日{config.maxHoliday}人 ・ 每月假日{config.maxHolidayMonth}天 ・ 每月共{config.maxPerMonth}天
              <span style={{display:"inline-flex",alignItems:"center",gap:4,marginLeft:8,fontSize:11,fontWeight:600,color:dbOk?C.success:C.danger}}>
                <span style={{width:6,height:6,borderRadius:3,background:dbOk?C.success:C.danger,animation:dbOk?"pulse 2s infinite":"none"}}/>
                {dbOk?"已連線":"離線"}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* 月份選擇 */}
      <div style={{maxWidth:960,margin:"0 auto 12px",display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{fontSize:13,color:C.textSub,fontWeight:600}}>月份：</span>
        <button onClick={()=>{const idx=monthOptions.findIndex(o=>o.value===selectedMonth);if(idx>0)setSelectedMonth(monthOptions[idx-1].value)}} disabled={monthOptions[0]?.value===selectedMonth} style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.textSub,fontSize:14,cursor:"pointer",fontFamily:"inherit",opacity:monthOptions[0]?.value===selectedMonth?.4:1}}>◀</button>
        <Select value={selectedMonth} onChange={setSelectedMonth} style={{fontSize:14,fontWeight:600,padding:"6px 14px"}}>
          {monthOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <button onClick={()=>{const idx=monthOptions.findIndex(o=>o.value===selectedMonth);if(idx<monthOptions.length-1)setSelectedMonth(monthOptions[idx+1].value)}} disabled={monthOptions[monthOptions.length-1]?.value===selectedMonth} style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.textSub,fontSize:14,cursor:"pointer",fontFamily:"inherit",opacity:monthOptions[monthOptions.length-1]?.value===selectedMonth?.4:1}}>▶</button>
        {selectedMonth===getDefaultMonth()&&<span style={{padding:"4px 10px",borderRadius:8,background:C.successDim,color:C.success,fontSize:12,fontWeight:600}}>📌 下個月（建議排休月份）</span>}
      </div>
      <div style={{maxWidth:960,margin:"0 auto 16px"}}>
        <div style={{padding:"8px 14px",borderRadius:10,background:"rgba(108,99,255,.06)",border:`1px solid ${C.accent}20`,fontSize:12,color:C.textSub}}>
          💡 目前正在排 <strong style={{color:C.accentLight}}>{year}年{month+1}月</strong> 的{role==="parttime"?"班":"休"}，請確認月份正確再填寫
        </div>
      </div>

      {/* 身分切換 */}
      <div style={{maxWidth:960,margin:"0 auto 12px",display:"flex",gap:8,alignItems:"center"}}>
        <span style={{fontSize:13,color:C.textSub,fontWeight:600}}>身分：</span>
        {[{key:"fulltime",label:"正職同仁",icon:"👔"},{key:"parttime",label:"兼職同仁",icon:"⏰"}].map(r=>(
          <button key={r.key} onClick={()=>{setRole(r.key);setCurrentUser("")}} style={{
            padding:"8px 18px",borderRadius:10,border:`1px solid ${role===r.key?C.accent:C.border}`,
            background:role===r.key?C.accentDim:"transparent",
            color:role===r.key?C.accentLight:C.textSub,
            fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all .2s",
          }}>{r.icon} {r.label}</button>
        ))}
      </div>

      <div style={{maxWidth:960,margin:"0 auto 24px"}}>
        <Tabs tabs={[{key:"calendar",label:role==="parttime"?"排班時段":"排休日曆",icon:"📅"},{key:"records",label:"排休紀錄",icon:"📋"},{key:"admin",label:"管理後台",icon:"⚙️"}]} active={tab} onChange={t=>{
          if(t==="admin"&&!adminUnlocked){setShowPwModal(true);setPwInput("")}
          else{setTab(t)}
        }}/>
      </div>

      {/* 密碼彈窗 */}
      {showPwModal&&<div style={{position:"fixed",inset:0,zIndex:9998,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setShowPwModal(false)}>
        <div style={{background:C.surface,borderRadius:20,border:`1px solid ${C.border}`,padding:32,width:340,boxShadow:"0 20px 60px rgba(0,0,0,.5)"}} onClick={e=>e.stopPropagation()}>
          <h3 style={{fontSize:18,fontWeight:700,marginBottom:4}}>🔒 管理後台</h3>
          <p style={{fontSize:13,color:C.textSub,marginBottom:20}}>請輸入管理員密碼</p>
          <input type="password" value={pwInput} onChange={e=>setPwInput(e.target.value)} placeholder="輸入密碼" autoFocus
            onKeyDown={e=>{if(e.key==="Enter"){if(pwInput==="888888"){setAdminUnlocked(true);setTab("admin");setShowPwModal(false);notify("已進入管理後台","success")}else{notify("密碼錯誤","error");setPwInput("")}}}}
            style={{width:"100%",padding:"12px 16px",borderRadius:12,border:`1px solid ${C.border}`,background:C.card,color:C.text,fontSize:16,fontFamily:"inherit",outline:"none",letterSpacing:4,textAlign:"center"}}
          />
          <div style={{display:"flex",gap:10,marginTop:20}}>
            <button onClick={()=>setShowPwModal(false)} style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${C.border}`,background:"transparent",color:C.textSub,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>取消</button>
            <button onClick={()=>{if(pwInput==="888888"){setAdminUnlocked(true);setTab("admin");setShowPwModal(false);notify("已進入管理後台","success")}else{notify("密碼錯誤","error");setPwInput("")}}} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:C.accent,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>確認</button>
          </div>
        </div>
      </div>}

      <div style={{maxWidth:960,margin:"0 auto"}}>
        {tab==="calendar"&&role==="fulltime"&&<CalendarView {...{year,month,days,dayCount,config,employees,currentUser,setCurrentUser,userLeaves,toggleDay,exportCSV,leaves,specialIntent,updateSpecialIntent,closedDays,blockedDays,skipLeave,updateSkipLeave}}/>}
        {tab==="calendar"&&role==="parttime"&&<PartTimeCalendarView {...{year,month,days,ptEmp,ptSlots,updatePtSlots,currentUser,setCurrentUser,notify,closedDays,exportPtCSV}}/>}
        {tab==="records"&&<RecordsView {...{employees,leaves,year,month,days,config,specialIntent,ptEmp,ptSlots,role}}/>}
        {tab==="admin"&&<AdminView {...{config,updateConfig,employees,updateEmployees,leaves,updateLeaves,notify,year,month,closedDays,updateClosedDays,blockedDays,updateBlockedDays,ptEmp,updatePtEmp,ptSlots,updatePtSlots,updateSpecialIntent,updateSkipLeave,showResetModal,setShowResetModal}}/>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
//  CALENDAR VIEW
// ══════════════════════════════════════════════════════════════════════
function CalendarView({year,month,days,dayCount,config,employees,currentUser,setCurrentUser,userLeaves,toggleDay,exportCSV,leaves,specialIntent,updateSpecialIntent,closedDays,blockedDays,skipLeave,updateSkipLeave}){
  const firstDay=new Date(year,month,1).getDay();
  const whoOn=day=>{const ds=fmt(new Date(year,month,day));return employees.filter(e=>(leaves[e]||[]).includes(ds))};

  const userHolidayCount=useMemo(()=>userLeaves.filter(d=>{const dt=new Date(d+"T00:00:00");const t=dayType(dt.getFullYear(),dt.getMonth(),dt.getDate());return t==="weekend"||t==="holiday"}).length,[userLeaves]);

  const monthKey=`${year}-${month}`;
  const monthSpecial=specialIntent[monthKey]||{};
  const monthSkip=skipLeave[monthKey]||{};
  const uSpecial=monthSpecial[currentUser]||0;
  const isSkipped=monthSkip[currentUser]||false;

  return(
    <div>
      <div style={{display:"flex",flexWrap:"wrap",gap:12,marginBottom:16,alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,flex:1,minWidth:240}}>
          <label style={{fontSize:14,fontWeight:600,color:C.textSub,whiteSpace:"nowrap"}}>選擇同仁</label>
          <Select value={currentUser} onChange={setCurrentUser} style={{flex:1,maxWidth:220}}>
            <option value="">— 請選擇 —</option>
            {employees.map(e=><option key={e} value={e}>{e}</option>)}
          </Select>
        </div>
        {currentUser&&<div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <Badge color={C.accent}>{currentUser}</Badge>
          <Badge color={userLeaves.length>=config.maxPerMonth?C.danger:C.success}>排休 {userLeaves.length}/{config.maxPerMonth} 天</Badge>
          <Badge color={userHolidayCount>=config.maxHolidayMonth?C.danger:C.gold}>假日 {userHolidayCount}/{config.maxHolidayMonth} 天</Badge>
          {uSpecial>0&&<Badge color="#22D3EE">特休 {uSpecial} 天</Badge>}
          {isSkipped&&<Badge color={C.warn}>不需排休</Badge>}
        </div>}
        <Btn onClick={exportCSV} variant="ghost" small>📥 匯出排休表</Btn>
      </div>

      {/* 不需排休 + 特休意願 */}
      {currentUser&&<div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
        {/* 不需排休 */}
        <div style={{display:"flex",alignItems:"center",gap:14,padding:"14px 18px",borderRadius:14,background:isSkipped?"rgba(251,191,36,.08)":C.surface,border:`1px solid ${isSkipped?"rgba(251,191,36,.35)":C.border}`,transition:"all .25s",flexWrap:"wrap"}}>
          <button onClick={()=>updateSkipLeave({...skipLeave,[monthKey]:{...monthSkip,[currentUser]:!isSkipped}})} style={{width:48,height:26,borderRadius:13,border:"none",background:isSkipped?C.warn:C.border,cursor:"pointer",position:"relative",transition:"background .25s",flexShrink:0}}>
            <div style={{width:20,height:20,borderRadius:10,background:"#fff",position:"absolute",top:3,left:isSkipped?25:3,transition:"left .25s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
          </button>
          <span style={{fontSize:14,fontWeight:600,color:isSkipped?C.warn:C.textSub}}>不需排休</span>
          {isSkipped&&<span style={{fontSize:12,color:C.textSub}}>（此同仁本月不排休）</span>}
        </div>

        {/* 特休意願 */}
        {!isSkipped&&<div style={{display:"flex",alignItems:"center",gap:14,padding:"14px 18px",borderRadius:14,background:uSpecial>0?"rgba(34,211,238,.08)":C.surface,border:`1px solid ${uSpecial>0?"rgba(34,211,238,.35)":C.border}`,transition:"all .25s",flexWrap:"wrap"}}>
        <button onClick={()=>updateSpecialIntent({...specialIntent,[monthKey]:{...monthSpecial,[currentUser]:uSpecial>0?0:1}})} style={{width:48,height:26,borderRadius:13,border:"none",background:uSpecial>0?"#22D3EE":C.border,cursor:"pointer",position:"relative",transition:"background .25s",flexShrink:0}}>
          <div style={{width:20,height:20,borderRadius:10,background:"#fff",position:"absolute",top:3,left:uSpecial>0?25:3,transition:"left .25s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
        </button>
        <span style={{fontSize:14,fontWeight:600,color:uSpecial>0?"#22D3EE":C.textSub}}>是否使用特休？</span>
        {uSpecial>0&&<div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:13,color:C.textSub}}>天數</span>
          <Select value={String(uSpecial)} onChange={v=>updateSpecialIntent({...specialIntent,[monthKey]:{...monthSpecial,[currentUser]:parseInt(v)||0}})} style={{width:80,padding:"6px 10px",fontSize:14,borderColor:"rgba(34,211,238,.35)"}}>
            {[1,2,3,4,5].map(n=><option key={n} value={n}>{n} 天</option>)}
          </Select>
        </div>}
        </div>}
      </div>}
      {currentUser&&isSkipped&&<div style={{marginBottom:20}}/>}

      <div style={{background:C.surface,borderRadius:20,border:`1px solid ${C.border}`,padding:20,overflow:"hidden"}}>
        <div style={{marginBottom:12}}>
          <span style={{fontSize:18,fontWeight:700,color:C.text}}>{year}年{month+1}月排休</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:8}}>
          {["日","一","二","三","四","五","六"].map((w,i)=><div key={w} style={{textAlign:"center",fontSize:13,fontWeight:600,color:i===0||i===6?C.gold+"cc":C.textDim,padding:"6px 0"}}>{w}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
          {Array.from({length:firstDay}).map((_,i)=><div key={`e${i}`}/>)}
          {Array.from({length:days}).map((_,i)=>{
            const day=i+1,dateStr=fmt(new Date(year,month,day)),t=dayType(year,month,day),hName=getHolidayName(year,month,day),limit=getDayLimit(config,year,month,day),count=dayCount[day]||0,full=count>=limit,sel=userLeaves.includes(dateStr),people=whoOn(day),closed=closedDays.includes(dateStr),blocked=blockedDays.includes(dateStr);
            const disabled=closed||blocked;
            const tc={holiday:{bg:C.goldDim,bd:`${C.gold}40`,nc:C.gold,tc2:C.gold},weekend:{bg:C.goldDim,bd:`${C.gold}40`,nc:C.gold,tc2:C.gold},weekday:{bg:C.card,bd:C.border,nc:C.text,tc2:C.textDim}}[t];
            const cellBg=closed?"rgba(255,107,107,.06)":blocked?"rgba(251,146,60,.08)":sel?C.accentDim:full?C.dangerDim:tc.bg;
            const cellBd=closed?`1px solid ${C.danger}30`:blocked?`1px solid #FB923C30`:sel?`2px solid ${C.accent}`:`1px solid ${full?C.danger+"60":tc.bd}`;
            return <div key={day} onClick={()=>!disabled&&toggleDay(day)} style={{position:"relative",minHeight:68,borderRadius:12,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,cursor:disabled?"not-allowed":"pointer",transition:"all .2s",background:cellBg,border:cellBd,padding:"4px 2px",opacity:disabled?.45:1}} onMouseEnter={e=>{if(!disabled){e.currentTarget.style.background=sel?C.accentDim:C.cardHover;e.currentTarget.style.transform="scale(1.04)"}}} onMouseLeave={e=>{if(!disabled){e.currentTarget.style.background=cellBg;e.currentTarget.style.transform="none"}}}>
              {closed&&<span style={{fontSize:9,fontWeight:800,color:C.danger,letterSpacing:.5,lineHeight:1,marginBottom:1}}>公休</span>}
              {blocked&&!closed&&<span style={{fontSize:9,fontWeight:800,color:"#FB923C",letterSpacing:.5,lineHeight:1,marginBottom:1}}>禁休</span>}
              {!disabled&&(t==="holiday"||t==="weekend")&&<span style={{fontSize:8,fontWeight:700,letterSpacing:.5,color:tc.tc2,lineHeight:1,marginBottom:1}}>{t==="holiday"?(hName&&hName.length<=4?hName:"假日"):"週末"}</span>}
              <span style={{fontSize:16,fontWeight:sel?700:500,fontFamily:"'JetBrains Mono',monospace",color:disabled?C.textDim:sel?C.accent:tc.nc,textDecoration:disabled?"line-through":"none"}}>{day}</span>
              {!disabled&&<span style={{fontSize:10,fontWeight:600,color:full?C.danger:count>0?C.warn:C.textDim}}>{count}/{limit}</span>}
              {people.length>0&&<div className="day-tooltip" style={{position:"absolute",bottom:"calc(100% + 8px)",left:"50%",transform:"translateX(-50%)",background:C.card,border:`1px solid ${C.borderLight}`,borderRadius:10,padding:"8px 12px",fontSize:12,color:C.textSub,whiteSpace:"nowrap",pointerEvents:"none",opacity:0,transition:"opacity .2s",zIndex:10,boxShadow:`0 4px 20px ${C.bg}80`}}><span style={{fontWeight:600,color:C.text}}>{hName||`${month+1}/${day}`}</span><br/>{people.join("、")}</div>}
              <style>{`div:hover>.day-tooltip{opacity:1!important}`}</style>
            </div>
          })}
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:16,marginTop:20,padding:"14px 0 0",borderTop:`1px solid ${C.border}`}}>
          {[{color:C.accent,label:"已選排休"},{color:C.gold,label:`週末（上限${config.maxWeekend}人）`},{color:C.gold,label:`國定假日（上限${config.maxHoliday}人）`},{color:C.textDim,label:`平日（上限${config.maxWeekday}人）`},{color:"#FB923C",label:"禁止排休"},{color:C.danger,label:"公休日"},{color:C.danger,label:"已額滿"}].map(l=><div key={l.label} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:C.textSub}}><div style={{width:10,height:10,borderRadius:4,background:l.color}}/>{l.label}</div>)}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
//  PART-TIME CALENDAR VIEW
// ══════════════════════════════════════════════════════════════════════
function PartTimeCalendarView({year,month,days,ptEmp,ptSlots,updatePtSlots,currentUser,setCurrentUser,notify,closedDays,exportPtCSV}){
  const firstDay=new Date(year,month,1).getDay();
  const[editingDay,setEditingDay]=useState(null); // 彈窗顯示中的日期
  useEffect(()=>{setEditingDay(null)},[year,month]); // 切換月份時關閉彈窗

  const userSlots=ptSlots[currentUser]||{};
  const totalSlotDays=Object.keys(userSlots).filter(d=>{
    const dt=new Date(d+"T00:00:00");
    return dt.getFullYear()===year&&dt.getMonth()===month&&(userSlots[d]||[]).length>0;
  }).length;

  const toggleSlot=(dateStr,slot)=>{
    const cur=userSlots[dateStr]||[];
    let next;
    if(cur.includes(slot)){
      next=cur.filter(s=>s!==slot);
    }else if(slot==="allday"){
      next=["allday"]; // 選全天時清除中午/晚上
    }else{
      next=[...cur.filter(s=>s!=="allday"),slot]; // 選中午/晚上時清除全天
    }
    const newUserSlots={...userSlots};
    if(next.length===0) delete newUserSlots[dateStr];
    else newUserSlots[dateStr]=next;
    updatePtSlots({...ptSlots,[currentUser]:newUserSlots});
  };

  return(
    <div>
      <div style={{display:"flex",flexWrap:"wrap",gap:12,marginBottom:16,alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,flex:1,minWidth:240}}>
          <label style={{fontSize:14,fontWeight:600,color:C.textSub,whiteSpace:"nowrap"}}>選擇兼職同仁</label>
          <Select value={currentUser} onChange={setCurrentUser} style={{flex:1,maxWidth:220}}>
            <option value="">— 請選擇 —</option>
            {ptEmp.map(e=><option key={e} value={e}>{e}</option>)}
          </Select>
        </div>
        {currentUser&&<div style={{display:"flex",gap:8,alignItems:"center"}}>
          <Badge color={C.accent}>{currentUser}</Badge>
          <Badge color={C.success}>可排班 {totalSlotDays} 天</Badge>
        </div>}
        <Btn onClick={exportPtCSV} variant="ghost" small>📥 匯出排班表</Btn>
      </div>

      <div style={{background:C.surface,borderRadius:20,border:`1px solid ${C.border}`,padding:20}}>
        <div style={{marginBottom:12}}>
          <span style={{fontSize:18,fontWeight:700,color:C.text}}>{year}年{month+1}月 兼職可排班時段</span>
          <p style={{fontSize:12,color:C.textSub,marginTop:4}}>點擊日期即可選擇可排班時段（全天／中午／晚上）</p>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:8}}>
          {["日","一","二","三","四","五","六"].map((w,i)=><div key={w} style={{textAlign:"center",fontSize:13,fontWeight:600,color:i===0||i===6?C.gold+"cc":C.textDim,padding:"6px 0"}}>{w}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
          {Array.from({length:firstDay}).map((_,i)=><div key={`pe${i}`}/>)}
          {Array.from({length:days}).map((_,i)=>{
            const day=i+1,ds=fmt(new Date(year,month,day)),closed=closedDays.includes(ds);
            const slots=userSlots[ds]||[],hasSlot=slots.length>0;
            const bg=closed?"rgba(255,107,107,.06)":hasSlot?C.accentDim:C.card;
            const bd=closed?`1px solid ${C.danger}30`:hasSlot?`2px solid ${C.accent}`:`1px solid ${C.border}`;
            return <div key={day} onClick={()=>{if(closed)return notify("此日為公休日","error");if(!currentUser)return notify("請先選擇同仁","error");setEditingDay(day)}} style={{
              position:"relative",minHeight:68,borderRadius:12,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,
              cursor:closed?"not-allowed":"pointer",transition:"all .2s",background:bg,border:bd,padding:"4px 2px",opacity:closed?.45:1,
            }} onMouseEnter={e=>{if(!closed){e.currentTarget.style.transform="scale(1.04)"}}} onMouseLeave={e=>{if(!closed){e.currentTarget.style.transform="none"}}}>
              {closed&&<span style={{fontSize:9,fontWeight:800,color:C.danger,lineHeight:1,marginBottom:1}}>公休</span>}
              <span style={{fontSize:16,fontWeight:hasSlot?700:500,fontFamily:"'JetBrains Mono',monospace",color:closed?C.textDim:hasSlot?C.accent:C.text,textDecoration:closed?"line-through":"none"}}>{day}</span>
              {hasSlot&&!closed&&<div style={{display:"flex",gap:2,marginTop:1}}>
                {slots.includes("allday")&&<span style={{fontSize:8,fontWeight:700,padding:"1px 4px",borderRadius:3,background:"#4ADE80",color:"#000"}}>全</span>}
                {slots.includes("noon")&&<span style={{fontSize:8,fontWeight:700,padding:"1px 4px",borderRadius:3,background:"#FBBF24",color:"#000"}}>中</span>}
                {slots.includes("evening")&&<span style={{fontSize:8,fontWeight:700,padding:"1px 4px",borderRadius:3,background:"#818CF8",color:"#fff"}}>晚</span>}
              </div>}
            </div>
          })}
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:16,marginTop:20,padding:"14px 0 0",borderTop:`1px solid ${C.border}`}}>
          {[{color:C.accent,label:"已填時段"},{color:"#4ADE80",label:"全天"},{color:"#FBBF24",label:"中午"},{color:"#818CF8",label:"晚上"},{color:C.danger,label:"公休日"}].map(l=><div key={l.label} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:C.textSub}}><div style={{width:10,height:10,borderRadius:4,background:l.color}}/>{l.label}</div>)}
        </div>
      </div>

      {/* 時段選擇彈窗 */}
      {editingDay&&(()=>{
        const ds=fmt(new Date(year,month,editingDay));
        const slots=userSlots[ds]||[];
        return <div style={{position:"fixed",inset:0,zIndex:9998,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setEditingDay(null)}>
          <div style={{background:C.surface,borderRadius:20,border:`1px solid ${C.border}`,padding:28,width:360,boxShadow:"0 20px 60px rgba(0,0,0,.5)"}} onClick={e=>e.stopPropagation()}>
            <h3 style={{fontSize:18,fontWeight:700,marginBottom:4}}>📅 {month+1}/{editingDay}（{weekdayStr(year,month,editingDay)}）</h3>
            <p style={{fontSize:13,color:C.textSub,marginBottom:18}}>選擇 <strong style={{color:C.accent}}>{currentUser}</strong> 的可排班時段</p>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {[{key:"allday",label:"☀️ 全天",color:"#4ADE80"},{key:"noon",label:"🌞 中午",color:"#FBBF24"},{key:"evening",label:"🌙 晚上",color:"#818CF8"}].map(s=>{
                const active=slots.includes(s.key);
                return <button key={s.key} onClick={()=>toggleSlot(ds,s.key)} style={{
                  padding:"16px 20px",borderRadius:12,border:`2px solid ${active?s.color:C.border}`,
                  background:active?`${s.color}18`:"transparent",color:active?s.color:C.text,
                  fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all .2s",
                  display:"flex",alignItems:"center",justifyContent:"space-between",
                }}>
                  <span>{s.label}</span>
                  <span style={{fontSize:12,opacity:.8}}>{active?"✓ 已選":"點擊選擇"}</span>
                </button>
              })}
            </div>
            <button onClick={()=>setEditingDay(null)} style={{width:"100%",marginTop:18,padding:"10px",borderRadius:10,border:`1px solid ${C.border}`,background:"transparent",color:C.textSub,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>完成</button>
          </div>
        </div>
      })()}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
//  RECORDS VIEW
// ══════════════════════════════════════════════════════════════════════
function RecordsView({employees,leaves,year,month,days,config,specialIntent,ptEmp,ptSlots,role}){
  const[filter,setFilter]=useState("");

  // 兼職紀錄
  const ptData=useMemo(()=>ptEmp.filter(e=>!filter||e.includes(filter)).map(emp=>{
    const slots=ptSlots[emp]||{};
    const monthSlots=Object.entries(slots)
      .filter(([d,v])=>{const dt=new Date(d+"T00:00:00");return dt.getFullYear()===year&&dt.getMonth()===month&&v.length>0})
      .sort((a,b)=>a[0].localeCompare(b[0]));
    return{name:emp,slots:monthSlots};
  }),[ptEmp,ptSlots,year,month,filter]);

  // 正職紀錄
  const data=useMemo(()=>employees.filter(e=>!filter||e.includes(filter)).map(emp=>{
    const el=(leaves[emp]||[]).filter(d=>{const dt=new Date(d+"T00:00:00");return dt.getFullYear()===year&&dt.getMonth()===month}).sort();
    return{name:emp,leaves:el,spec:(specialIntent[`${year}-${month}`]||{})[emp]||0};
  }),[employees,leaves,year,month,filter,specialIntent]);

  // 兼職紀錄畫面
  if(role==="parttime"){
    return(
      <div>
        <div style={{marginBottom:20,maxWidth:300}}><Input value={filter} onChange={setFilter} placeholder="🔍 搜尋兼職同仁姓名..."/></div>
        <div style={{background:C.surface,borderRadius:20,border:`1px solid ${C.border}`,overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"140px 80px 1fr",padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:13,fontWeight:600,color:C.textDim}}>
            <div>兼職同仁</div><div style={{textAlign:"center"}}>天數</div><div>可排班時段</div>
          </div>
          {ptData.length===0&&<div style={{padding:40,textAlign:"center",color:C.textDim}}>無符合條件的紀錄</div>}
          {ptData.map((row,idx)=><div key={row.name} style={{display:"grid",gridTemplateColumns:"140px 80px 1fr",padding:"14px 20px",alignItems:"center",borderBottom:idx<ptData.length-1?`1px solid ${C.border}`:"none"}}>
            <div style={{fontWeight:600,fontSize:14}}>{row.name}</div>
            <div style={{textAlign:"center"}}><Badge color={row.slots.length>0?C.accent:C.textDim}>{row.slots.length} 天</Badge></div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {row.slots.length===0&&<span style={{fontSize:13,color:C.textDim}}>尚未填寫</span>}
              {row.slots.map(([d,sArr])=>{const dt=new Date(d+"T00:00:00");
                return <span key={d} style={{padding:"3px 10px",borderRadius:8,background:`${C.accentLight}18`,color:C.accentLight,fontSize:12,fontWeight:500,fontFamily:"'JetBrains Mono',monospace",display:"inline-flex",gap:4,alignItems:"center"}}>
                  {dt.getDate()}日
                  {sArr.includes("allday")&&<span style={{fontSize:9,padding:"1px 4px",borderRadius:3,background:"#4ADE80",color:"#000",fontWeight:700}}>全</span>}
                  {sArr.includes("noon")&&<span style={{fontSize:9,padding:"1px 4px",borderRadius:3,background:"#FBBF24",color:"#000",fontWeight:700}}>中</span>}
                  {sArr.includes("evening")&&<span style={{fontSize:9,padding:"1px 4px",borderRadius:3,background:"#818CF8",color:"#fff",fontWeight:700}}>晚</span>}
                </span>
              })}
            </div>
          </div>)}
        </div>
      </div>
    );
  }

  return(
    <div>
      <div style={{marginBottom:20,maxWidth:300}}><Input value={filter} onChange={setFilter} placeholder="🔍 搜尋同仁姓名..."/></div>
      <div style={{background:C.surface,borderRadius:20,border:`1px solid ${C.border}`,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"120px 70px 70px 1fr",padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:13,fontWeight:600,color:C.textDim}}>
          <div>同仁</div><div style={{textAlign:"center"}}>排休</div><div style={{textAlign:"center"}}>特休</div><div>排休日期</div>
        </div>
        {data.length===0&&<div style={{padding:40,textAlign:"center",color:C.textDim}}>無符合條件的紀錄</div>}
        {data.map((row,idx)=><div key={row.name} style={{display:"grid",gridTemplateColumns:"120px 70px 70px 1fr",padding:"14px 20px",alignItems:"center",borderBottom:idx<data.length-1?`1px solid ${C.border}`:"none",transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background=C.card} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <div style={{fontWeight:600,fontSize:14}}>{row.name}</div>
          <div style={{textAlign:"center"}}><Badge color={row.leaves.length>=config.maxPerMonth?C.danger:row.leaves.length>0?C.accent:C.textDim}>{row.leaves.length}/{config.maxPerMonth}</Badge></div>
          <div style={{textAlign:"center"}}>{row.spec>0?<Badge color="#22D3EE">{row.spec} 天</Badge>:<span style={{fontSize:12,color:C.textDim}}>—</span>}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {row.leaves.length===0&&<span style={{fontSize:13,color:C.textDim}}>尚未排休</span>}
            {row.leaves.map(d=>{const dt=new Date(d+"T00:00:00"),t=dayType(dt.getFullYear(),dt.getMonth(),dt.getDate()),hN=getHolidayName(dt.getFullYear(),dt.getMonth(),dt.getDate()),tc2={holiday:C.gold,weekend:C.gold,weekday:C.accentLight}[t];
              return <span key={d} style={{padding:"3px 10px",borderRadius:8,background:`${tc2}18`,color:tc2,fontSize:12,fontWeight:500,fontFamily:"'JetBrains Mono',monospace"}}>{dt.getDate()}日{hN?` ${hN}`:`（${weekdayStr(dt.getFullYear(),dt.getMonth(),dt.getDate())}）`}</span>
            })}
          </div>
        </div>)}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
//  ADMIN VIEW
// ══════════════════════════════════════════════════════════════════════
function AdminView({config,updateConfig,employees,updateEmployees,leaves,updateLeaves,notify,year,month,closedDays,updateClosedDays,blockedDays,updateBlockedDays,ptEmp,updatePtEmp,ptSlots,updatePtSlots,updateSpecialIntent,updateSkipLeave,showResetModal,setShowResetModal}){
  const[newEmp,setNewEmp]=useState("");
  const[newPtEmp,setNewPtEmp]=useState("");
  const[lW,sW]=useState(String(config.maxWeekday));
  const[lWe,sWe]=useState(String(config.maxWeekend));
  const[lH,sH]=useState(String(config.maxHoliday));
  const[lM,sM]=useState(String(config.maxPerMonth));
  const[lHM,sHM]=useState(String(config.maxHolidayMonth));

  const saveCfg=()=>{updateConfig({maxWeekday:Math.max(1,parseInt(lW)||1),maxWeekend:Math.max(1,parseInt(lWe)||1),maxHoliday:Math.max(1,parseInt(lH)||1),maxPerMonth:Math.max(1,parseInt(lM)||1),maxHolidayMonth:Math.max(1,parseInt(lHM)||1)});notify("限制已更新","success")};
  const addEmp=()=>{const n=newEmp.trim();if(!n)return;if(employees.includes(n))return notify("同仁已存在","error");updateEmployees([...employees,n]);setNewEmp("");notify(`已新增 ${n}`,"success")};
  const rmEmp=name=>{updateEmployees(employees.filter(e=>e!==name));const nl={...leaves};delete nl[name];updateLeaves(nl);notify(`已移除 ${name}`,"warn")};
  const addPt=()=>{const n=newPtEmp.trim();if(!n)return;if(ptEmp.includes(n))return notify("兼職同仁已存在","error");updatePtEmp([...ptEmp,n]);setNewPtEmp("");notify(`已新增兼職 ${n}`,"success")};
  const rmPt=name=>{updatePtEmp(ptEmp.filter(e=>e!==name));const ns={...ptSlots};delete ns[name];updatePtSlots(ns);notify(`已移除 ${name}`,"warn")};

  const hCount=useMemo(()=>{let c=0;for(let d=1;d<=daysInMonth(year,month);d++)if(isHoliday(year,month,d))c++;return c},[year,month]);
  const weCount=useMemo(()=>{let c=0;for(let d=1;d<=daysInMonth(year,month);d++)if(!isHoliday(year,month,d)&&isWeekend(year,month,d))c++;return c},[year,month]);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:24}}>
      <div style={{background:C.surface,borderRadius:20,border:`1px solid ${C.border}`,padding:24}}>
        <h3 style={{fontSize:16,fontWeight:700,marginBottom:20,display:"flex",alignItems:"center",gap:8}}>⚙️ 排休限制設定</h3>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:16,maxWidth:700}}>
          <div><label style={{fontSize:13,color:C.textSub,display:"flex",alignItems:"center",gap:4,marginBottom:6}}>☀️ 平日上限（人/天）</label><Input type="number" value={lW} onChange={sW}/></div>
          <div><label style={{fontSize:13,color:C.gold,display:"flex",alignItems:"center",gap:4,marginBottom:6}}>🌙 週末上限（人/天）</label><Input type="number" value={lWe} onChange={sWe}/></div>
          <div><label style={{fontSize:13,color:C.gold,display:"flex",alignItems:"center",gap:4,marginBottom:6}}>🏮 國定假日上限（人/天）</label><Input type="number" value={lH} onChange={sH}/></div>
          <div><label style={{fontSize:13,color:C.textSub,display:"flex",alignItems:"center",gap:4,marginBottom:6}}>📅 每月總上限（天/人）</label><Input type="number" value={lM} onChange={sM}/></div>
          <div><label style={{fontSize:13,color:C.gold,display:"flex",alignItems:"center",gap:4,marginBottom:6}}>🗓️ 每月假日排休上限（天/人）</label><Input type="number" value={lHM} onChange={sHM}/></div>
        </div>
        <div style={{marginTop:16,display:"flex",gap:10,flexWrap:"wrap"}}><Btn onClick={saveCfg}>儲存設定</Btn><Btn onClick={()=>{updateLeaves({});updatePtSlots({});notify("已清空所有排休紀錄（含兼職）","warn")}} variant="danger" small>🗑 清空排休</Btn><Btn onClick={()=>setShowResetModal(true)} variant="danger" small>🔄 全部重置（新月份）</Btn></div>
      </div>

      <div style={{background:C.surface,borderRadius:20,border:`1px solid ${C.border}`,padding:24}}>
        <h3 style={{fontSize:16,fontWeight:700,marginBottom:16,display:"flex",alignItems:"center",gap:8}}>🏮 本月特殊日期</h3>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {Array.from({length:daysInMonth(year,month)}).map((_,i)=>{const d=i+1,hN=getHolidayName(year,month,d);if(!hN)return null;return <div key={d} style={{padding:"8px 14px",borderRadius:10,background:C.goldDim,border:`1px solid ${C.gold}30`,fontSize:13,color:C.gold,fontWeight:600}}>{month+1}/{d} {hN}</div>})}
          {hCount===0&&<span style={{fontSize:13,color:C.textDim}}>本月無國定假日</span>}
        </div>
        <div style={{marginTop:12,fontSize:13,color:C.textSub}}>本月共 {hCount} 天國定假日、{weCount} 天週末</div>
      </div>

      {/* 公休日設定 */}
      <div style={{background:C.surface,borderRadius:20,border:`1px solid ${C.border}`,padding:24}}>
        <h3 style={{fontSize:16,fontWeight:700,marginBottom:8,display:"flex",alignItems:"center",gap:8}}>🚫 公休日設定</h3>
        <p style={{fontSize:13,color:C.textSub,marginBottom:16}}>點擊日期即可設定/取消公休，公休日同仁無法排休</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:8}}>
          {["日","一","二","三","四","五","六"].map(w=><div key={w} style={{textAlign:"center",fontSize:12,fontWeight:600,color:C.textDim,padding:"4px 0"}}>{w}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
          {Array.from({length:new Date(year,month,1).getDay()}).map((_,i)=><div key={`ce${i}`}/>)}
          {Array.from({length:daysInMonth(year,month)}).map((_,i)=>{
            const d=i+1,ds=fmt(new Date(year,month,d)),isClosed=closedDays.includes(ds);
            return <div key={d} onClick={()=>{
              if(isClosed) updateClosedDays(closedDays.filter(x=>x!==ds));
              else updateClosedDays([...closedDays,ds]);
              notify(isClosed?`已取消 ${d}日 公休`:`已設定 ${d}日 為公休`,isClosed?"warn":"success");
            }} style={{
              padding:"8px 0",borderRadius:10,textAlign:"center",cursor:"pointer",transition:"all .2s",
              fontSize:14,fontWeight:isClosed?700:500,fontFamily:"'JetBrains Mono',monospace",
              background:isClosed?C.dangerDim:C.card,
              border:`1px solid ${isClosed?C.danger+"50":C.border}`,
              color:isClosed?C.danger:C.text,
              textDecoration:isClosed?"line-through":"none",
            }}
            onMouseEnter={e=>{e.currentTarget.style.background=isClosed?C.dangerDim:C.cardHover}}
            onMouseLeave={e=>{e.currentTarget.style.background=isClosed?C.dangerDim:C.card}}
            >{d}{isClosed&&<div style={{fontSize:8,fontWeight:800,marginTop:1}}>公休</div>}</div>
          })}
        </div>
        {closedDays.filter(d=>{const dt=new Date(d+"T00:00:00");return dt.getFullYear()===year&&dt.getMonth()===month}).length>0&&
          <div style={{marginTop:14,display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
            <span style={{fontSize:13,color:C.textSub}}>已設定公休：</span>
            {closedDays.filter(d=>{const dt=new Date(d+"T00:00:00");return dt.getFullYear()===year&&dt.getMonth()===month}).sort().map(d=>{
              const dt=new Date(d+"T00:00:00");
              return <span key={d} style={{padding:"3px 10px",borderRadius:8,background:C.dangerDim,color:C.danger,fontSize:12,fontWeight:600}}>{dt.getDate()}日（{weekdayStr(dt.getFullYear(),dt.getMonth(),dt.getDate())}）</span>
            })}
          </div>
        }
      </div>

      {/* 禁止排休日設定（僅正職） */}
      <div style={{background:C.surface,borderRadius:20,border:`1px solid ${C.border}`,padding:24}}>
        <h3 style={{fontSize:16,fontWeight:700,marginBottom:8,display:"flex",alignItems:"center",gap:8}}>⛔ 禁止排休日設定</h3>
        <p style={{fontSize:13,color:C.textSub,marginBottom:16}}>點擊日期即可設定/取消，設定後正職同仁無法在該日排休</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:8}}>
          {["日","一","二","三","四","五","六"].map(w=><div key={w} style={{textAlign:"center",fontSize:12,fontWeight:600,color:C.textDim,padding:"4px 0"}}>{w}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
          {Array.from({length:new Date(year,month,1).getDay()}).map((_,i)=><div key={`be${i}`}/>)}
          {Array.from({length:daysInMonth(year,month)}).map((_,i)=>{
            const d=i+1,ds=fmt(new Date(year,month,d)),isBlocked=blockedDays.includes(ds),isClosed=closedDays.includes(ds);
            return <div key={d} onClick={()=>{
              if(isClosed)return notify("此日已設為公休日","error");
              if(isBlocked) updateBlockedDays(blockedDays.filter(x=>x!==ds));
              else updateBlockedDays([...blockedDays,ds]);
              notify(isBlocked?`已取消 ${d}日 禁止排休`:`已設定 ${d}日 為禁止排休`,isBlocked?"warn":"success");
            }} style={{
              padding:"8px 0",borderRadius:10,textAlign:"center",cursor:isClosed?"not-allowed":"pointer",transition:"all .2s",
              fontSize:14,fontWeight:isBlocked?700:500,fontFamily:"'JetBrains Mono',monospace",
              background:isBlocked?"rgba(251,146,60,.12)":isClosed?C.dangerDim:C.card,
              border:`1px solid ${isBlocked?"#FB923C50":isClosed?C.danger+"30":C.border}`,
              color:isBlocked?"#FB923C":isClosed?C.danger:C.text,
              opacity:isClosed?.35:1,
              textDecoration:isBlocked?"line-through":"none",
            }}
            onMouseEnter={e=>{if(!isClosed)e.currentTarget.style.background=isBlocked?"rgba(251,146,60,.12)":C.cardHover}}
            onMouseLeave={e=>{if(!isClosed)e.currentTarget.style.background=isBlocked?"rgba(251,146,60,.12)":C.card}}
            >{d}{isBlocked&&<div style={{fontSize:8,fontWeight:800,marginTop:1}}>禁休</div>}</div>
          })}
        </div>
        {blockedDays.filter(d=>{const dt=new Date(d+"T00:00:00");return dt.getFullYear()===year&&dt.getMonth()===month}).length>0&&
          <div style={{marginTop:14,display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
            <span style={{fontSize:13,color:C.textSub}}>已設定禁止排休：</span>
            {blockedDays.filter(d=>{const dt=new Date(d+"T00:00:00");return dt.getFullYear()===year&&dt.getMonth()===month}).sort().map(d=>{
              const dt=new Date(d+"T00:00:00");
              return <span key={d} style={{padding:"3px 10px",borderRadius:8,background:"rgba(251,146,60,.12)",color:"#FB923C",fontSize:12,fontWeight:600}}>{dt.getDate()}日（{weekdayStr(dt.getFullYear(),dt.getMonth(),dt.getDate())}）</span>
            })}
          </div>
        }
      </div>

      <div style={{background:C.surface,borderRadius:20,border:`1px solid ${C.border}`,padding:24}}>
        <h3 style={{fontSize:16,fontWeight:700,marginBottom:20,display:"flex",alignItems:"center",gap:8}}>👔 正職同仁管理</h3>
        <div style={{display:"flex",gap:10,marginBottom:20,maxWidth:400}}><Input value={newEmp} onChange={setNewEmp} placeholder="輸入新同仁姓名" style={{flex:1}}/><Btn onClick={addEmp} small>＋ 新增</Btn></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:8}}>
          {employees.map(emp=>{const ec=(leaves[emp]||[]).filter(d=>{const dt=new Date(d+"T00:00:00");return dt.getFullYear()===year&&dt.getMonth()===month}).length;
            return <div key={emp} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderRadius:12,background:C.card,border:`1px solid ${C.border}`,transition:"border-color .2s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.borderLight} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
              <div><div style={{fontSize:14,fontWeight:600}}>{emp}</div><div style={{fontSize:11,color:C.textDim,marginTop:2}}>已排 {ec} 天</div></div>
              <button onClick={()=>rmEmp(emp)} style={{width:28,height:28,borderRadius:8,border:"none",background:C.dangerDim,color:C.danger,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit"}}>✕</button>
            </div>})}
        </div>
      </div>

      {/* 兼職同仁管理 */}
      <div style={{background:C.surface,borderRadius:20,border:`1px solid ${C.border}`,padding:24}}>
        <h3 style={{fontSize:16,fontWeight:700,marginBottom:20,display:"flex",alignItems:"center",gap:8}}>⏰ 兼職同仁管理</h3>
        <div style={{display:"flex",gap:10,marginBottom:20,maxWidth:400}}><Input value={newPtEmp} onChange={setNewPtEmp} placeholder="輸入新兼職同仁姓名" style={{flex:1}}/><Btn onClick={addPt} small>＋ 新增</Btn></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:8}}>
          {ptEmp.map(emp=>{
            const slots=ptSlots[emp]||{};
            const dayCount=Object.keys(slots).filter(d=>{const dt=new Date(d+"T00:00:00");return dt.getFullYear()===year&&dt.getMonth()===month&&(slots[d]||[]).length>0}).length;
            return <div key={emp} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderRadius:12,background:C.card,border:`1px solid ${C.border}`,transition:"border-color .2s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.borderLight} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
              <div><div style={{fontSize:14,fontWeight:600}}>{emp}</div><div style={{fontSize:11,color:C.textDim,marginTop:2}}>可排班 {dayCount} 天</div></div>
              <button onClick={()=>rmPt(emp)} style={{width:28,height:28,borderRadius:8,border:"none",background:C.dangerDim,color:C.danger,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit"}}>✕</button>
            </div>
          })}
          {ptEmp.length===0&&<span style={{fontSize:13,color:C.textDim,gridColumn:"1/-1"}}>尚未新增兼職同仁</span>}
        </div>
      </div>

      <div style={{background:C.surface,borderRadius:20,border:`1px solid ${C.border}`,padding:24}}>
        <h3 style={{fontSize:16,fontWeight:700,marginBottom:16,display:"flex",alignItems:"center",gap:8}}>📊 本月概覽</h3>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12}}>
          {[{label:"總同仁數",value:employees.length,color:C.accent},{label:"總排休天次",value:Object.values(leaves).flat().filter(d=>{const dt=new Date(d+"T00:00:00");return dt.getFullYear()===year&&dt.getMonth()===month}).length,color:C.warn},{label:"已排休人數",value:employees.filter(e=>(leaves[e]||[]).some(d=>{const dt=new Date(d+"T00:00:00");return dt.getFullYear()===year&&dt.getMonth()===month})).length,color:C.success},{label:"國定假日",value:hCount,color:C.gold},{label:"週末天數",value:weCount,color:C.gold}].map(s=><div key={s.label} style={{padding:"18px 16px",borderRadius:14,background:C.card,border:`1px solid ${C.border}`,textAlign:"center"}}><div style={{fontSize:28,fontWeight:700,color:s.color,fontFamily:"'JetBrains Mono',monospace"}}>{s.value}</div><div style={{fontSize:12,color:C.textSub,marginTop:4}}>{s.label}</div></div>)}
        </div>
      </div>

      {/* 全部重置確認彈窗 */}
      {showResetModal&&<div style={{position:"fixed",inset:0,zIndex:9998,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setShowResetModal(false)}>
        <div style={{background:C.surface,borderRadius:20,border:`1px solid ${C.danger}40`,padding:32,width:380,boxShadow:"0 20px 60px rgba(0,0,0,.5)"}} onClick={e=>e.stopPropagation()}>
          <h3 style={{fontSize:18,fontWeight:700,marginBottom:8,color:C.danger}}>🔄 全部重置</h3>
          <p style={{fontSize:14,color:C.textSub,marginBottom:8}}>將清空以下所有資料：</p>
          <div style={{fontSize:13,color:C.text,lineHeight:2,marginBottom:16,padding:"10px 14px",borderRadius:10,background:C.card}}>
            ✓ 正職排休紀錄<br/>✓ 兼職可排班時段<br/>✓ 公休日設定<br/>✓ 禁止排休日設定<br/>✓ 特休意願<br/>✓ 不需排休設定
          </div>
          <p style={{fontSize:13,color:C.success,marginBottom:20}}>✓ 保留：人員名單、排休限制設定</p>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setShowResetModal(false)} style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${C.border}`,background:"transparent",color:C.textSub,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>取消</button>
            <button onClick={()=>{updateLeaves({});updateClosedDays([]);updateBlockedDays([]);updatePtSlots({});updateSpecialIntent({});updateSkipLeave({});setShowResetModal(false);notify("已全部重置，可開始新月份排休","success")}} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:C.danger,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>確認重置</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
