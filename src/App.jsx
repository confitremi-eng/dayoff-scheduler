import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { fetchAll, saveData } from "./api";

const DB = { CONFIG: "config", LEAVES: "leaves", EMPLOYEES: "employees", SPECIAL: "specialIntent", REMARKS: "remarks" };

// ── helpers ──────────────────────────────────────────────────────────
function getNextMonth() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 1); }
function fmt(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function monthLabel(d) { return d.toLocaleDateString("zh-TW", { year: "numeric", month: "long" }); }
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function weekdayStr(y, m, d) { return ["日","一","二","三","四","五","六"][new Date(y,m,d).getDay()]; }
function isWeekend(y, m, d) { const day = new Date(y,m,d).getDay(); return day === 0 || day === 6; }

// ── Taiwan holidays 2025-2027 ───────────────────────────────────────
const H_FIXED = {"01-01":"元旦","02-28":"和平紀念日","04-04":"兒童節","04-05":"清明節","05-01":"勞動節","10-10":"國慶日"};
const H_YEAR = {
  2025:{"01-27":"除夕","01-28":"春節","01-29":"春節","01-30":"春節","01-31":"春節(彈性)","04-03":"清明節(彈性)","05-30":"端午節","05-31":"端午節(彈性)","10-06":"中秋節"},
  2026:{"02-16":"除夕","02-17":"春節","02-18":"春節","02-19":"春節","02-20":"春節(彈性)","04-03":"清明節(彈性)","06-19":"端午節","09-25":"中秋節"},
  2027:{"02-05":"除夕","02-06":"春節","02-07":"春節","02-08":"春節","02-09":"春節(彈性)","04-03":"清明節(彈性)","06-09":"端午節","10-15":"中秋節"},
};
function getHolidayName(y,m,d){const k=`${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;return H_FIXED[k]||(H_YEAR[y]&&H_YEAR[y][k])||null;}
function isHoliday(y,m,d){return !!getHolidayName(y,m,d);}
function dayType(y,m,d){if(isHoliday(y,m,d))return"holiday";if(isWeekend(y,m,d))return"weekend";return"weekday";}
const DAY_LABELS={holiday:"國定假日",weekend:"週末",weekday:"平日"};

const DEF_CONFIG={maxWeekday:2,maxWeekend:1,maxHoliday:1,maxPerMonth:5,maxHolidayMonth:2};
const DEF_EMP=["王小明","李美玲","張大偉","陳怡君","林志豪","黃淑芬","吳建宏","周雅婷","鄭宗翰","蔡佳穎"];

function getDayLimit(cfg,y,m,d){const t=dayType(y,m,d);if(t==="holiday")return cfg.maxHoliday;if(t==="weekend")return cfg.maxWeekend;return cfg.maxWeekday;}

// ── colours ─────────────────────────────────────────────────────────
const C={bg:"#0F1117",surface:"#181B25",card:"#1E2230",cardHover:"#252A3A",border:"#2A2F42",borderLight:"#3A4060",accent:"#6C63FF",accentLight:"#8B83FF",accentDim:"rgba(108,99,255,.12)",danger:"#FF6B6B",dangerDim:"rgba(255,107,107,.12)",success:"#4ADE80",successDim:"rgba(74,222,128,.12)",warn:"#FBBF24",warnDim:"rgba(251,191,36,.12)",orange:"#FB923C",orangeDim:"rgba(251,146,60,.12)",pink:"#F472B6",pinkDim:"rgba(244,114,182,.12)",text:"#E8E9F0",textSub:"#9498AD",textDim:"#5C6080"};
const baseCSS=`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Noto Sans TC',sans-serif;background:${C.bg};color:${C.text}}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}@keyframes slideIn{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:none}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`;

// ── UI components ───────────────────────────────────────────────────
function Badge({children,color=C.accent}){return <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 10px",borderRadius:20,fontSize:12,fontWeight:600,letterSpacing:.3,color,background:`${color}18`}}>{children}</span>}
function Btn({children,onClick,variant="primary",small,disabled,style:sx}){const b={display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,padding:small?"6px 14px":"10px 22px",borderRadius:10,border:"none",cursor:disabled?"not-allowed":"pointer",fontSize:small?13:14,fontWeight:600,fontFamily:"inherit",transition:"all .2s",opacity:disabled?.45:1};const s={primary:{...b,background:C.accent,color:"#fff"},ghost:{...b,background:"transparent",color:C.textSub,border:`1px solid ${C.border}`},danger:{...b,background:C.dangerDim,color:C.danger}};return <button style={{...s[variant],...sx}} onClick={disabled?undefined:onClick}>{children}</button>}
function Input({value,onChange,placeholder,type="text",style:sx}){return <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surface,color:C.text,fontSize:14,fontFamily:"inherit",outline:"none",transition:"border .2s",...sx}} onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border}/>}
function Select({value,onChange,children,style:sx}){return <select value={value} onChange={e=>onChange(e.target.value)} style={{padding:"10px 14px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surface,color:C.text,fontSize:14,fontFamily:"inherit",outline:"none",cursor:"pointer",...sx}}>{children}</select>}
function Tabs({tabs,active,onChange}){return <div style={{display:"flex",gap:4,padding:4,borderRadius:14,background:C.surface,border:`1px solid ${C.border}`}}>{tabs.map(t=><button key={t.key} onClick={()=>onChange(t.key)} style={{flex:1,padding:"10px 18px",borderRadius:10,border:"none",cursor:"pointer",fontSize:14,fontWeight:600,fontFamily:"inherit",transition:"all .25s",background:active===t.key?C.accent:"transparent",color:active===t.key?"#fff":C.textSub}}>{t.icon} {t.label}</button>)}</div>}
function Toast({msg,type,onClose}){useEffect(()=>{const t=setTimeout(onClose,2800);return()=>clearTimeout(t)},[onClose]);const colors={success:C.success,error:C.danger,warn:C.warn,info:C.accent};const color=colors[type]||C.accent;return <div style={{position:"fixed",top:24,right:24,zIndex:9999,padding:"14px 24px",borderRadius:14,background:C.card,border:`1px solid ${color}40`,color,fontSize:14,fontWeight:600,boxShadow:`0 8px 32px ${color}20`,animation:"slideIn .3s ease"}}>{type==="success"?"✓ ":type==="error"?"✕ ":"⚠ "}{msg}</div>}

// ══════════════════════════════════════════════════════════════════════
//  MAIN APP
// ══════════════════════════════════════════════════════════════════════
export default function App(){
  const[tab,setTab]=useState("calendar");
  const[config,setConfig]=useState(DEF_CONFIG);
  const[employees,setEmployees]=useState(DEF_EMP);
  const[leaves,setLeaves]=useState({});
  const[specialIntent,setSpecialIntent]=useState({});
  const[remarks,setRemarks]=useState({});
  const[currentUser,setCurrentUser]=useState("");
  const[toast,setToast]=useState(null);
  const[ready,setReady]=useState(false);
  const[dbOk,setDbOk]=useState(true);
  const pollRef=useRef(null);

  // 從 Neon DB 載入
  const loadAll=useCallback(async(init=false)=>{
    try{
      const data=await fetchAll();
      setConfig(data.config||DEF_CONFIG);
      setEmployees(data.employees||DEF_EMP);
      setLeaves(data.leaves||{});
      setSpecialIntent(data.specialIntent||{});
      setRemarks(data.remarks||{});
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
  const updateSpecialIntent=useCallback(async s=>{setSpecialIntent(s);await saveData(DB.SPECIAL,s)},[]);
  const updateRemarks=useCallback(async r=>{setRemarks(r);await saveData(DB.REMARKS,r)},[]);

  const nextMonth=getNextMonth();
  const year=nextMonth.getFullYear(),month=nextMonth.getMonth(),days=daysInMonth(year,month);

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
      const ds=fmt(new Date(year,month,d)),wd=weekdayStr(year,month,d),t=dayType(year,month,d),lim=getDayLimit(config,year,month,d),hName=getHolidayName(year,month,d);
      csv+=`${ds},${wd},${hName||DAY_LABELS[t]},${lim},`;let tot=0;
      employees.forEach(emp=>{const has=(leaves[emp]||[]).includes(ds);csv+=(has?"休":"")+",";if(has)tot++});
      csv+=tot+"\n";
    }
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    a.download=`排休表_${year}年${month+1}月.csv`;a.click();notify("已匯出 CSV","success");
  };

  if(!ready)return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:C.bg}}><div style={{color:C.textSub,fontSize:16}}>載入中...</div></div>;

  return(
    <div style={{minHeight:"100vh",background:C.bg,padding:"20px 16px 40px"}}>
      <style>{baseCSS}</style>
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)} key={toast.key}/>}

      <div style={{maxWidth:960,margin:"0 auto 24px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
          <div style={{width:42,height:42,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,background:`linear-gradient(135deg,${C.accent},${C.accentLight})`}}>🍽️</div>
          <div>
            <h1 style={{fontSize:22,fontWeight:700,letterSpacing:-.5}}>餐飲排休管理系統</h1>
            <p style={{fontSize:13,color:C.textSub,marginTop:2}}>
              {monthLabel(nextMonth)} ・ 平日{config.maxWeekday}人 ・ 週末{config.maxWeekend}人 ・ 假日{config.maxHoliday}人 ・ 每月假日{config.maxHolidayMonth}天 ・ 每月共{config.maxPerMonth}天
              <span style={{display:"inline-flex",alignItems:"center",gap:4,marginLeft:8,fontSize:11,fontWeight:600,color:dbOk?C.success:C.danger}}>
                <span style={{width:6,height:6,borderRadius:3,background:dbOk?C.success:C.danger,animation:dbOk?"pulse 2s infinite":"none"}}/>
                {dbOk?"已連線":"離線"}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div style={{maxWidth:960,margin:"0 auto 24px"}}>
        <Tabs tabs={[{key:"calendar",label:"排休日曆",icon:"📅"},{key:"records",label:"排休紀錄",icon:"📋"},{key:"admin",label:"管理後台",icon:"⚙️"}]} active={tab} onChange={setTab}/>
      </div>

      <div style={{maxWidth:960,margin:"0 auto"}}>
        {tab==="calendar"&&<CalendarView {...{year,month,days,dayCount,config,employees,currentUser,setCurrentUser,userLeaves,toggleDay,exportCSV,leaves,specialIntent,updateSpecialIntent,remarks,updateRemarks}}/>}
        {tab==="records"&&<RecordsView {...{employees,leaves,year,month,days,config,specialIntent,remarks}}/>}
        {tab==="admin"&&<AdminView {...{config,updateConfig,employees,updateEmployees,leaves,updateLeaves,notify,year,month}}/>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
//  CALENDAR VIEW
// ══════════════════════════════════════════════════════════════════════
function CalendarView({year,month,days,dayCount,config,employees,currentUser,setCurrentUser,userLeaves,toggleDay,exportCSV,leaves,specialIntent,updateSpecialIntent,remarks,updateRemarks}){
  const firstDay=new Date(year,month,1).getDay();
  const whoOn=day=>{const ds=fmt(new Date(year,month,day));return employees.filter(e=>(leaves[e]||[]).includes(ds))};

  const userHolidayCount=useMemo(()=>userLeaves.filter(d=>{const dt=new Date(d+"T00:00:00");const t=dayType(dt.getFullYear(),dt.getMonth(),dt.getDate());return t==="weekend"||t==="holiday"}).length,[userLeaves]);

  const uSpecial=specialIntent[currentUser]||0;

  const remarkTimerRef=useRef(null);
  const[localRemark,setLocalRemark]=useState(remarks[currentUser]||"");
  const prevUser=useRef(currentUser);
  useEffect(()=>{if(prevUser.current!==currentUser){setLocalRemark(remarks[currentUser]||"");prevUser.current=currentUser}},[currentUser,remarks]);
  const onRemarkChange=val=>{setLocalRemark(val);clearTimeout(remarkTimerRef.current);remarkTimerRef.current=setTimeout(()=>updateRemarks({...remarks,[currentUser]:val}),600)};

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
          <Badge color={userHolidayCount>=config.maxHolidayMonth?C.danger:C.orange}>假日 {userHolidayCount}/{config.maxHolidayMonth} 天</Badge>
          {uSpecial>0&&<Badge color="#22D3EE">特休 {uSpecial} 天</Badge>}
        </div>}
        <Btn onClick={exportCSV} variant="ghost" small>📥 匯出排休表</Btn>
      </div>

      {/* 特休意願 */}
      {currentUser&&<div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20,padding:"14px 18px",borderRadius:14,background:uSpecial>0?"rgba(34,211,238,.08)":C.surface,border:`1px solid ${uSpecial>0?"rgba(34,211,238,.35)":C.border}`,transition:"all .25s",flexWrap:"wrap"}}>
        <button onClick={()=>updateSpecialIntent({...specialIntent,[currentUser]:uSpecial>0?0:1})} style={{width:48,height:26,borderRadius:13,border:"none",background:uSpecial>0?"#22D3EE":C.border,cursor:"pointer",position:"relative",transition:"background .25s",flexShrink:0}}>
          <div style={{width:20,height:20,borderRadius:10,background:"#fff",position:"absolute",top:3,left:uSpecial>0?25:3,transition:"left .25s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
        </button>
        <span style={{fontSize:14,fontWeight:600,color:uSpecial>0?"#22D3EE":C.textSub}}>是否使用特休？</span>
        {uSpecial>0&&<div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:13,color:C.textSub}}>天數</span>
          <Select value={String(uSpecial)} onChange={v=>updateSpecialIntent({...specialIntent,[currentUser]:parseInt(v)||0})} style={{width:80,padding:"6px 10px",fontSize:14,borderColor:"rgba(34,211,238,.35)"}}>
            {[1,2,3,4,5].map(n=><option key={n} value={n}>{n} 天</option>)}
          </Select>
        </div>}
      </div>}

      {/* 備註 */}
      {currentUser&&<div style={{marginBottom:20,padding:"14px 18px",borderRadius:14,background:C.surface,border:`1px solid ${C.border}`}}>
        <label style={{fontSize:14,fontWeight:600,color:C.textSub,display:"flex",alignItems:"center",gap:6,marginBottom:8}}>📝 備註</label>
        <textarea value={localRemark} onChange={e=>onRemarkChange(e.target.value)} placeholder="輸入備註（例如：排休原因、特殊需求等）" rows={3} style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1px solid ${C.border}`,background:C.card,color:C.text,fontSize:14,fontFamily:"inherit",outline:"none",resize:"vertical",transition:"border .2s",lineHeight:1.6}} onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border}/>
      </div>}

      <div style={{background:C.surface,borderRadius:20,border:`1px solid ${C.border}`,padding:20,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:8}}>
          {["日","一","二","三","四","五","六"].map((w,i)=><div key={w} style={{textAlign:"center",fontSize:13,fontWeight:600,color:i===0||i===6?C.orange+"cc":C.textDim,padding:"6px 0"}}>{w}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
          {Array.from({length:firstDay}).map((_,i)=><div key={`e${i}`}/>)}
          {Array.from({length:days}).map((_,i)=>{
            const day=i+1,t=dayType(year,month,day),hName=getHolidayName(year,month,day),limit=getDayLimit(config,year,month,day),count=dayCount[day]||0,full=count>=limit,sel=userLeaves.includes(fmt(new Date(year,month,day))),people=whoOn(day);
            const tc={holiday:{bg:C.pinkDim,bd:`${C.pink}40`,nc:C.pink,tc2:C.pink},weekend:{bg:C.orangeDim,bd:`${C.orange}40`,nc:C.orange,tc2:C.orange},weekday:{bg:C.card,bd:C.border,nc:C.text,tc2:C.textDim}}[t];
            const cellBg=sel?C.accentDim:full?C.dangerDim:tc.bg,cellBd=sel?`2px solid ${C.accent}`:`1px solid ${full?C.danger+"60":tc.bd}`;
            return <div key={day} onClick={()=>toggleDay(day)} style={{position:"relative",minHeight:68,borderRadius:12,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,cursor:"pointer",transition:"all .2s",background:cellBg,border:cellBd,padding:"4px 2px"}} onMouseEnter={e=>{e.currentTarget.style.background=sel?C.accentDim:C.cardHover;e.currentTarget.style.transform="scale(1.04)"}} onMouseLeave={e=>{e.currentTarget.style.background=cellBg;e.currentTarget.style.transform="none"}}>
              {(t==="holiday"||t==="weekend")&&<span style={{fontSize:8,fontWeight:700,letterSpacing:.5,color:tc.tc2,lineHeight:1,marginBottom:1}}>{t==="holiday"?(hName&&hName.length<=4?hName:"假日"):"週末"}</span>}
              <span style={{fontSize:16,fontWeight:sel?700:500,fontFamily:"'JetBrains Mono',monospace",color:sel?C.accent:tc.nc}}>{day}</span>
              <span style={{fontSize:10,fontWeight:600,color:full?C.danger:count>0?C.warn:C.textDim}}>{count}/{limit}</span>
              {people.length>0&&<div className="day-tooltip" style={{position:"absolute",bottom:"calc(100% + 8px)",left:"50%",transform:"translateX(-50%)",background:C.card,border:`1px solid ${C.borderLight}`,borderRadius:10,padding:"8px 12px",fontSize:12,color:C.textSub,whiteSpace:"nowrap",pointerEvents:"none",opacity:0,transition:"opacity .2s",zIndex:10,boxShadow:`0 4px 20px ${C.bg}80`}}><span style={{fontWeight:600,color:C.text}}>{hName||`${month+1}/${day}`}</span><br/>{people.join("、")}</div>}
              <style>{`div:hover>.day-tooltip{opacity:1!important}`}</style>
            </div>
          })}
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:16,marginTop:20,padding:"14px 0 0",borderTop:`1px solid ${C.border}`}}>
          {[{color:C.accent,label:"已選排休"},{color:C.orange,label:`週末（上限${config.maxWeekend}人）`},{color:C.pink,label:`國定假日（上限${config.maxHoliday}人）`},{color:C.textDim,label:`平日（上限${config.maxWeekday}人）`},{color:C.danger,label:"已額滿"}].map(l=><div key={l.label} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:C.textSub}}><div style={{width:10,height:10,borderRadius:4,background:l.color}}/>{l.label}</div>)}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
//  RECORDS VIEW
// ══════════════════════════════════════════════════════════════════════
function RecordsView({employees,leaves,year,month,days,config,specialIntent,remarks}){
  const[filter,setFilter]=useState("");
  const data=useMemo(()=>employees.filter(e=>!filter||e.includes(filter)).map(emp=>{
    const el=(leaves[emp]||[]).filter(d=>{const dt=new Date(d+"T00:00:00");return dt.getFullYear()===year&&dt.getMonth()===month}).sort();
    return{name:emp,leaves:el,spec:specialIntent[emp]||0,remark:remarks[emp]||""};
  }),[employees,leaves,year,month,filter,specialIntent,remarks]);

  return(
    <div>
      <div style={{marginBottom:20,maxWidth:300}}><Input value={filter} onChange={setFilter} placeholder="🔍 搜尋同仁姓名..."/></div>
      <div style={{background:C.surface,borderRadius:20,border:`1px solid ${C.border}`,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"100px 60px 60px 1fr 140px",padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:13,fontWeight:600,color:C.textDim}}>
          <div>同仁</div><div style={{textAlign:"center"}}>排休</div><div style={{textAlign:"center"}}>特休</div><div>排休日期</div><div>備註</div>
        </div>
        {data.length===0&&<div style={{padding:40,textAlign:"center",color:C.textDim}}>無符合條件的紀錄</div>}
        {data.map((row,idx)=><div key={row.name} style={{display:"grid",gridTemplateColumns:"100px 60px 60px 1fr 140px",padding:"14px 20px",alignItems:"center",borderBottom:idx<data.length-1?`1px solid ${C.border}`:"none",transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background=C.card} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <div style={{fontWeight:600,fontSize:14}}>{row.name}</div>
          <div style={{textAlign:"center"}}><Badge color={row.leaves.length>=config.maxPerMonth?C.danger:row.leaves.length>0?C.accent:C.textDim}>{row.leaves.length}/{config.maxPerMonth}</Badge></div>
          <div style={{textAlign:"center"}}>{row.spec>0?<Badge color="#22D3EE">{row.spec} 天</Badge>:<span style={{fontSize:12,color:C.textDim}}>—</span>}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {row.leaves.length===0&&<span style={{fontSize:13,color:C.textDim}}>尚未排休</span>}
            {row.leaves.map(d=>{const dt=new Date(d+"T00:00:00"),t=dayType(dt.getFullYear(),dt.getMonth(),dt.getDate()),hN=getHolidayName(dt.getFullYear(),dt.getMonth(),dt.getDate()),tc2={holiday:C.pink,weekend:C.orange,weekday:C.accentLight}[t];
              return <span key={d} style={{padding:"3px 10px",borderRadius:8,background:`${tc2}18`,color:tc2,fontSize:12,fontWeight:500,fontFamily:"'JetBrains Mono',monospace"}}>{dt.getDate()}日{hN?` ${hN}`:`（${weekdayStr(dt.getFullYear(),dt.getMonth(),dt.getDate())}）`}</span>
            })}
          </div>
          <div style={{fontSize:13,color:C.textSub,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={row.remark}>{row.remark||<span style={{color:C.textDim}}>—</span>}</div>
        </div>)}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
//  ADMIN VIEW
// ══════════════════════════════════════════════════════════════════════
function AdminView({config,updateConfig,employees,updateEmployees,leaves,updateLeaves,notify,year,month}){
  const[newEmp,setNewEmp]=useState("");
  const[lW,sW]=useState(String(config.maxWeekday));
  const[lWe,sWe]=useState(String(config.maxWeekend));
  const[lH,sH]=useState(String(config.maxHoliday));
  const[lM,sM]=useState(String(config.maxPerMonth));
  const[lHM,sHM]=useState(String(config.maxHolidayMonth));

  const saveCfg=()=>{updateConfig({maxWeekday:Math.max(1,parseInt(lW)||1),maxWeekend:Math.max(1,parseInt(lWe)||1),maxHoliday:Math.max(1,parseInt(lH)||1),maxPerMonth:Math.max(1,parseInt(lM)||1),maxHolidayMonth:Math.max(1,parseInt(lHM)||1)});notify("限制已更新","success")};
  const addEmp=()=>{const n=newEmp.trim();if(!n)return;if(employees.includes(n))return notify("同仁已存在","error");updateEmployees([...employees,n]);setNewEmp("");notify(`已新增 ${n}`,"success")};
  const rmEmp=name=>{updateEmployees(employees.filter(e=>e!==name));const nl={...leaves};delete nl[name];updateLeaves(nl);notify(`已移除 ${name}`,"warn")};

  const hCount=useMemo(()=>{let c=0;for(let d=1;d<=daysInMonth(year,month);d++)if(isHoliday(year,month,d))c++;return c},[year,month]);
  const weCount=useMemo(()=>{let c=0;for(let d=1;d<=daysInMonth(year,month);d++)if(!isHoliday(year,month,d)&&isWeekend(year,month,d))c++;return c},[year,month]);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:24}}>
      <div style={{background:C.surface,borderRadius:20,border:`1px solid ${C.border}`,padding:24}}>
        <h3 style={{fontSize:16,fontWeight:700,marginBottom:20,display:"flex",alignItems:"center",gap:8}}>⚙️ 排休限制設定</h3>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:16,maxWidth:700}}>
          <div><label style={{fontSize:13,color:C.textSub,display:"flex",alignItems:"center",gap:4,marginBottom:6}}>☀️ 平日上限（人/天）</label><Input type="number" value={lW} onChange={sW}/></div>
          <div><label style={{fontSize:13,color:C.orange,display:"flex",alignItems:"center",gap:4,marginBottom:6}}>🌙 週末上限（人/天）</label><Input type="number" value={lWe} onChange={sWe}/></div>
          <div><label style={{fontSize:13,color:C.pink,display:"flex",alignItems:"center",gap:4,marginBottom:6}}>🏮 國定假日上限（人/天）</label><Input type="number" value={lH} onChange={sH}/></div>
          <div><label style={{fontSize:13,color:C.textSub,display:"flex",alignItems:"center",gap:4,marginBottom:6}}>📅 每月總上限（天/人）</label><Input type="number" value={lM} onChange={sM}/></div>
          <div><label style={{fontSize:13,color:C.orange,display:"flex",alignItems:"center",gap:4,marginBottom:6}}>🗓️ 每月假日排休上限（天/人）</label><Input type="number" value={lHM} onChange={sHM}/></div>
        </div>
        <div style={{marginTop:16,display:"flex",gap:10,flexWrap:"wrap"}}><Btn onClick={saveCfg}>儲存設定</Btn><Btn onClick={()=>{updateLeaves({});notify("已清空所有排休紀錄","warn")}} variant="danger" small>🗑 清空所有排休</Btn></div>
      </div>

      <div style={{background:C.surface,borderRadius:20,border:`1px solid ${C.border}`,padding:24}}>
        <h3 style={{fontSize:16,fontWeight:700,marginBottom:16,display:"flex",alignItems:"center",gap:8}}>🏮 本月特殊日期</h3>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {Array.from({length:daysInMonth(year,month)}).map((_,i)=>{const d=i+1,hN=getHolidayName(year,month,d);if(!hN)return null;return <div key={d} style={{padding:"8px 14px",borderRadius:10,background:C.pinkDim,border:`1px solid ${C.pink}30`,fontSize:13,color:C.pink,fontWeight:600}}>{month+1}/{d} {hN}</div>})}
          {hCount===0&&<span style={{fontSize:13,color:C.textDim}}>本月無國定假日</span>}
        </div>
        <div style={{marginTop:12,fontSize:13,color:C.textSub}}>本月共 {hCount} 天國定假日、{weCount} 天週末</div>
      </div>

      <div style={{background:C.surface,borderRadius:20,border:`1px solid ${C.border}`,padding:24}}>
        <h3 style={{fontSize:16,fontWeight:700,marginBottom:20,display:"flex",alignItems:"center",gap:8}}>👥 同仁管理</h3>
        <div style={{display:"flex",gap:10,marginBottom:20,maxWidth:400}}><Input value={newEmp} onChange={setNewEmp} placeholder="輸入新同仁姓名" style={{flex:1}}/><Btn onClick={addEmp} small>＋ 新增</Btn></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:8}}>
          {employees.map(emp=>{const ec=(leaves[emp]||[]).filter(d=>{const dt=new Date(d+"T00:00:00");return dt.getFullYear()===year&&dt.getMonth()===month}).length;
            return <div key={emp} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderRadius:12,background:C.card,border:`1px solid ${C.border}`,transition:"border-color .2s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.borderLight} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
              <div><div style={{fontSize:14,fontWeight:600}}>{emp}</div><div style={{fontSize:11,color:C.textDim,marginTop:2}}>已排 {ec} 天</div></div>
              <button onClick={()=>rmEmp(emp)} style={{width:28,height:28,borderRadius:8,border:"none",background:C.dangerDim,color:C.danger,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit"}}>✕</button>
            </div>})}
        </div>
      </div>

      <div style={{background:C.surface,borderRadius:20,border:`1px solid ${C.border}`,padding:24}}>
        <h3 style={{fontSize:16,fontWeight:700,marginBottom:16,display:"flex",alignItems:"center",gap:8}}>📊 本月概覽</h3>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12}}>
          {[{label:"總同仁數",value:employees.length,color:C.accent},{label:"總排休天次",value:Object.values(leaves).flat().filter(d=>{const dt=new Date(d+"T00:00:00");return dt.getFullYear()===year&&dt.getMonth()===month}).length,color:C.warn},{label:"已排休人數",value:employees.filter(e=>(leaves[e]||[]).some(d=>{const dt=new Date(d+"T00:00:00");return dt.getFullYear()===year&&dt.getMonth()===month})).length,color:C.success},{label:"國定假日",value:hCount,color:C.pink},{label:"週末天數",value:weCount,color:C.orange}].map(s=><div key={s.label} style={{padding:"18px 16px",borderRadius:14,background:C.card,border:`1px solid ${C.border}`,textAlign:"center"}}><div style={{fontSize:28,fontWeight:700,color:s.color,fontFamily:"'JetBrains Mono',monospace"}}>{s.value}</div><div style={{fontSize:12,color:C.textSub,marginTop:4}}>{s.label}</div></div>)}
        </div>
      </div>
    </div>
  );
}
