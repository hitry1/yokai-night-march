/* ================================================================
   요괴야행 (Yokai Night March)
   Korean-mythology Vampire-Survivors roguelike
   Pure vanilla JS · HTML5 Canvas · Zero dependencies
   ================================================================ */
(() => {
"use strict";

/* ─── CONFIG ─── */
const W=4000, H=4000, SURVIVE=600, BOSS_TIME=300;
let _eid=0;

/* ─── AUDIO ─── */
class Sfx{
  constructor(){this.ac=null;this.g=null;this.on=true}
  init(){if(this.ac)return;try{this.ac=new(window.AudioContext||window.webkitAudioContext);
    this.g=this.ac.createGain();this.g.gain.value=.25;this.g.connect(this.ac.destination)}catch(e){}}
  resume(){if(this.ac&&this.ac.state==="suspended")this.ac.resume()}
  _t(d,f0,f1,tp,v){if(!this.ac||!this.on)return;const o=this.ac.createOscillator(),g=this.ac.createGain();
    o.type=tp;o.frequency.setValueAtTime(f0,this.ac.currentTime);
    o.frequency.linearRampToValueAtTime(f1,this.ac.currentTime+d);
    g.gain.setValueAtTime(v,this.ac.currentTime);g.gain.linearRampToValueAtTime(0,this.ac.currentTime+d);
    o.connect(g);g.connect(this.g);o.start();o.stop(this.ac.currentTime+d)}
  _n(d,freq,v){if(!this.ac||!this.on)return;const n=this.ac.sampleRate*d,
    buf=this.ac.createBuffer(1,n,this.ac.sampleRate),ch=buf.getChannelData(0);
    for(let i=0;i<n;i++)ch[i]=Math.random()*2-1;const s=this.ac.createBufferSource();s.buffer=buf;
    const f=this.ac.createBiquadFilter();f.type="lowpass";f.frequency.value=freq;
    const g=this.ac.createGain();g.gain.setValueAtTime(v,this.ac.currentTime);
    g.gain.linearRampToValueAtTime(0,this.ac.currentTime+d);
    s.connect(f);f.connect(g);g.connect(this.g);s.start()}
  hit(){this._n(.04,900,.08)}
  kill(){this._t(.07,220,80,"square",.12)}
  xp(){this._t(.04,1200,1600,"sine",.06)}
  lvl(){this._t(.15,400,800,"sine",.18);setTimeout(()=>this._t(.15,600,1200,"sine",.13),100);
    setTimeout(()=>this._t(.2,800,1600,"sine",.1),200)}
  dmg(){this._n(.1,220,.18)}
  boss(){this._t(.5,80,40,"sawtooth",.22)}
  win(){[0,100,200,300,450].forEach((d,i)=>setTimeout(()=>this._t(.2,400+i*120,600+i*120,"sine",.14),d))}
  synth(){this._t(.2,200,600,"sine",.2);setTimeout(()=>this._t(.2,400,1000,"sine",.15),150);
    setTimeout(()=>this._t(.3,600,1400,"sine",.12),300)}
  talisman(){this._t(.12,600,1200,"sine",.1)}
  allure(){this._t(.3,300,150,"sine",.08)}
  wpn(t){
    if(t==="blade"||t==="ghostSlash")this._t(.04,320,200,"sawtooth",.06);
    else if(t==="fire"||t==="ghostFlame")this._n(.06,1100,.08);
    else if(t==="lightning"||t==="thunderIce")this._t(.03,2200,120,"square",.1);
    else if(t==="frost")this._t(.08,800,380,"triangle",.06);
    else if(t==="curseMist")this._t(.1,180,120,"triangle",.06);
    else if(t==="aura")this._t(.06,160,260,"sine",.04);
  }
}

/* ─── MATH ─── */
const sqrt=Math.sqrt,atan2=Math.atan2,cos=Math.cos,sin=Math.sin,
  abs=Math.abs,min=Math.min,max=Math.max,PI=Math.PI,TAU=PI*2,floor=Math.floor;
function dist(a,b){const dx=a.x-b.x,dy=a.y-b.y;return sqrt(dx*dx+dy*dy)}
function norm(x,y){const l=sqrt(x*x+y*y)||1;return[x/l,y/l]}
function rand(a,b){return Math.random()*(b-a)+a}
function rInt(a,b){return floor(rand(a,b+1))}
function pick(a){return a[floor(Math.random()*a.length)]}
function clamp(v,lo,hi){return max(lo,min(hi,v))}
function lerp(a,b,t){return a+(b-a)*t}

/* ─── ENEMY DEFS ─── */
const ETYPES={
  dokkaebi:{name:"도깨비",hp:22,spd:1.0,r:13,col:"#e65100",xp:1,dmg:8},
  wisp:    {name:"쥐불",hp:10,spd:2.4,r:8,col:"#00e5ff",xp:1,dmg:5},
  skeleton:{name:"해골병사",hp:45,spd:.9,r:14,col:"#efebe9",xp:3,dmg:10},
  ghost:   {name:"처녀귀신",hp:30,spd:1.0,r:12,col:"#e8eaf6",xp:4,dmg:15},
  gumiho:  {name:"구미호",hp:800,spd:.5,r:28,col:"#f06292",xp:80,dmg:20,boss:true},
  foxClone:{name:"여우분신",hp:80,spd:1.3,r:16,col:"#f48fb1",xp:5,dmg:10},
};

const SPAWN_TBL=[
  {t:0,types:["dokkaebi"]},
  {t:60,types:["dokkaebi","wisp"]},
  {t:150,types:["dokkaebi","wisp","skeleton"]},
  {t:240,types:["wisp","skeleton","ghost"]},
  {t:360,types:["dokkaebi","wisp","skeleton","ghost"]},
  {t:480,types:["skeleton","ghost","wisp"]},
];

/* ─── WEAPON DEFS ─── */
const WDEFS={
  blade:{name:"퇴마검",desc:"플레이어 주위를 회전하는 퇴마검",icon:"⚔️",col:"#ffd54f",attr:"yang",maxLv:8,
    lvs:[
      {cnt:1,dmg:10,rad:60,spd:2},{cnt:2,dmg:13,rad:65,spd:2.2},
      {cnt:3,dmg:16,rad:70,spd:2.5},{cnt:3,dmg:20,rad:80,spd:2.7},
      {cnt:4,dmg:24,rad:85,spd:3},{cnt:5,dmg:28,rad:92,spd:3.2},
      {cnt:5,dmg:34,rad:100,spd:3.4},{cnt:6,dmg:42,rad:112,spd:3.6},
    ]},
  fire:{name:"부적불꽃",desc:"가장 가까운 적에게 부적 불꽃 발사",icon:"🔥",col:"#ff9800",attr:"yang",maxLv:8,
    lvs:[
      {dmg:15,cd:1200,spd:4.5,cnt:1,prc:1},{dmg:18,cd:1100,spd:5,cnt:1,prc:1},
      {dmg:22,cd:1000,spd:5,cnt:2,prc:1},{dmg:26,cd:900,spd:5.5,cnt:2,prc:2},
      {dmg:32,cd:800,spd:5.5,cnt:3,prc:2},{dmg:38,cd:700,spd:6,cnt:3,prc:3},
      {dmg:45,cd:600,spd:6.5,cnt:4,prc:3},{dmg:55,cd:500,spd:7,cnt:4,prc:4},
    ]},
  lightning:{name:"번개부",desc:"랜덤 적에게 번개 낙뢰",icon:"⚡",col:"#ffeb3b",attr:"yang",maxLv:8,
    lvs:[
      {dmg:28,cd:2000,st:1},{dmg:33,cd:1800,st:1},{dmg:38,cd:1600,st:2},
      {dmg:45,cd:1400,st:2},{dmg:55,cd:1200,st:3},{dmg:65,cd:1000,st:3},
      {dmg:78,cd:900,st:4},{dmg:95,cd:800,st:5},
    ]},
  frost:{name:"빙결파동",desc:"주변 적을 얼려 느리게 만듦",icon:"❄️",col:"#80deea",attr:"yin",maxLv:8,
    lvs:[
      {dmg:8,cd:3000,rad:80,slow:.5,dur:2000},{dmg:10,cd:2800,rad:92,slow:.45,dur:2200},
      {dmg:13,cd:2600,rad:105,slow:.4,dur:2500},{dmg:16,cd:2400,rad:118,slow:.35,dur:2700},
      {dmg:20,cd:2200,rad:132,slow:.3,dur:3000},{dmg:24,cd:2000,rad:150,slow:.25,dur:3200},
      {dmg:30,cd:1800,rad:170,slow:.2,dur:3500},{dmg:38,cd:1500,rad:200,slow:.15,dur:4000},
    ]},
  curseMist:{name:"저주안개",desc:"독안개를 퍼뜨려 지속 피해",icon:"🌫️",col:"#7e57c2",attr:"yin",maxLv:8,
    lvs:[
      {dmg:4,cd:2500,rad:50,dur:3,cnt:1,tick:400},{dmg:5,cd:2300,rad:55,dur:3.2,cnt:1,tick:380},
      {dmg:6,cd:2100,rad:62,dur:3.5,cnt:2,tick:360},{dmg:8,cd:1900,rad:68,dur:3.8,cnt:2,tick:340},
      {dmg:10,cd:1700,rad:75,dur:4,cnt:2,tick:320},{dmg:12,cd:1500,rad:82,dur:4.3,cnt:3,tick:300},
      {dmg:15,cd:1300,rad:90,dur:4.5,cnt:3,tick:280},{dmg:18,cd:1100,rad:100,dur:5,cnt:3,tick:250},
    ]},
  aura:{name:"혼령장",desc:"접촉한 적에게 지속 피해",icon:"🔮",col:"#ce93d8",attr:"yin",maxLv:8,
    lvs:[
      {dmg:5,rad:50,tick:500},{dmg:7,rad:56,tick:450},{dmg:9,rad:62,tick:400},
      {dmg:11,rad:72,tick:380},{dmg:14,rad:82,tick:350},{dmg:17,rad:94,tick:300},
      {dmg:21,rad:108,tick:280},{dmg:26,rad:124,tick:250},
    ]},
};

/* ─── EVOLVED WEAPON DEFS ─── */
const EVOLVED={
  ghostSlash:{name:"귀신참",desc:"광범위 회전 + 처치 시 HP회복",icon:"👻",col:"#a5d6a7",
    recipe:["blade","aura"],maxLv:5,
    lvs:[
      {cnt:6,dmg:35,rad:120,spd:3.5,heal:2},{cnt:7,dmg:40,rad:130,spd:3.8,heal:3},
      {cnt:7,dmg:48,rad:140,spd:4,heal:3},{cnt:8,dmg:55,rad:155,spd:4.2,heal:4},
      {cnt:8,dmg:65,rad:170,spd:4.5,heal:5},
    ]},
  ghostFlame:{name:"귀화염",desc:"추적 화염 + 처치 시 연쇄폭발",icon:"👹",col:"#ff6d00",
    recipe:["fire","curseMist"],maxLv:5,
    lvs:[
      {dmg:45,cd:600,spd:6,cnt:4,prc:3,exR:60,exD:20},{dmg:52,cd:550,spd:6.5,cnt:5,prc:4,exR:70,exD:25},
      {dmg:60,cd:500,spd:7,cnt:5,prc:4,exR:80,exD:32},{dmg:70,cd:450,spd:7,cnt:6,prc:5,exR:90,exD:40},
      {dmg:82,cd:400,spd:8,cnt:6,prc:6,exR:100,exD:50},
    ]},
  thunderIce:{name:"뇌빙",desc:"번개 동결 + 폭발 파편",icon:"🌩️",col:"#4dd0e1",
    recipe:["lightning","frost"],maxLv:5,
    lvs:[
      {dmg:60,cd:1200,st:3,frzT:1.5,frzD:30,frzR:50},{dmg:72,cd:1100,st:3,frzT:1.8,frzD:38,frzR:55},
      {dmg:85,cd:1000,st:4,frzT:2,frzD:45,frzR:60},{dmg:100,cd:900,st:4,frzT:2.2,frzD:55,frzR:70},
      {dmg:120,cd:800,st:5,frzT:2.5,frzD:68,frzR:80},
    ]},
};

const RECIPES=[
  {a:"blade",b:"aura",result:"ghostSlash"},
  {a:"fire",b:"curseMist",result:"ghostFlame"},
  {a:"lightning",b:"frost",result:"thunderIce"},
];

function getWDef(t){return WDEFS[t]||EVOLVED[t]}

/* ─── PASSIVES ─── */
const PASSIVES={
  maxHp:{name:"최대 HP",desc:"최대 체력 +20",icon:"❤️",maxLv:5},
  speed:{name:"이동속도",desc:"이동속도 +10%",icon:"👟",maxLv:5},
  magnet:{name:"자석",desc:"기운 흡수 범위 +30",icon:"🧲",maxLv:5},
  armor:{name:"방어력",desc:"받는 피해 -3",icon:"🛡️",maxLv:5},
  cdReduce:{name:"쿨타임 감소",desc:"무기 쿨타임 -8%",icon:"⏱️",maxLv:5},
  xpBonus:{name:"경험치 보너스",desc:"획득 경험치 +15%",icon:"✨",maxLv:5},
  regen:{name:"재생력",desc:"초당 HP +1 회복",icon:"💚",maxLv:3},
};

/* ══════════════════════ GAME ══════════════════════ */
class Game{
  constructor(){
    this.cvs=document.getElementById("gc");
    this.ctx=this.cvs.getContext("2d");
    this.sfx=new Sfx();
    this.keys={};this.touch={active:false,dx:0,dy:0};
    this.state="menu";
    this.isMobile="ontouchstart"in window;
    this._bindUI();this._bindInput();this._resize();
    window.addEventListener("resize",()=>this._resize());
    document.addEventListener("visibilitychange",()=>{
      if(document.hidden&&this.state==="play")this._pause()});
    this._raf();
  }

  /* ── UI ── */
  _bindUI(){
    const $=s=>document.getElementById(s);
    this.ui={hud:$("hud"),start:$("screen-start"),lvl:$("screen-lvl"),
      pause:$("screen-pause"),end:$("screen-end"),
      hpBar:$("hp-bar"),hpTxt:$("hp-txt"),xpBar:$("xp-bar"),lvTxt:$("lv-txt"),
      timer:$("timer"),kills:$("kills"),wslots:$("weapon-slots"),
      choices:$("choices"),endTitle:$("end-title"),endStats:$("end-stats"),
      joyZone:$("joy-zone")};
    $("btn-start").onclick=()=>this._startGame();
    $("btn-resume").onclick=()=>this._unpause();
    $("btn-retry").onclick=()=>this._startGame();
  }

  /* ── INPUT ── */
  _bindInput(){
    window.addEventListener("keydown",e=>{this.keys[e.code]=true;
      if((e.code==="Escape"||e.code==="KeyP")&&(this.state==="play"||this.state==="pause")){
        e.preventDefault();this.state==="play"?this._pause():this._unpause()}});
    window.addEventListener("keyup",e=>{this.keys[e.code]=false});
    const jz=this.ui.joyZone;let tId=null,ox=0,oy=0;
    jz.addEventListener("touchstart",e=>{e.preventDefault();this.sfx.resume();
      const t=e.changedTouches[0];tId=t.identifier;ox=t.clientX;oy=t.clientY;this.touch.active=true},{passive:false});
    jz.addEventListener("touchmove",e=>{e.preventDefault();for(const t of e.changedTouches){
      if(t.identifier===tId){const dx=t.clientX-ox,dy=t.clientY-oy,d=sqrt(dx*dx+dy*dy),mR=60;
        if(d>mR){this.touch.dx=dx/d;this.touch.dy=dy/d}else{this.touch.dx=dx/mR;this.touch.dy=dy/mR}}}},{passive:false});
    const onEnd=e=>{for(const t of e.changedTouches){
      if(t.identifier===tId){tId=null;this.touch.active=false;this.touch.dx=0;this.touch.dy=0}}};
    jz.addEventListener("touchend",onEnd);jz.addEventListener("touchcancel",onEnd);
    this.cvs.addEventListener("touchstart",e=>{e.preventDefault();this.sfx.resume()},{passive:false});
  }

  _resize(){const dpr=window.devicePixelRatio||1;
    this.cvs.width=window.innerWidth*dpr;this.cvs.height=window.innerHeight*dpr;
    this.ctx.setTransform(dpr,0,0,dpr,0,0);this.sw=window.innerWidth;this.sh=window.innerHeight}

  /* ── START ── */
  _startGame(){
    this.sfx.init();this.sfx.resume();_eid=0;
    const cx=W/2,cy=H/2;
    this.p={x:cx,y:cy,r:13,spd:2.8,hp:100,maxHp:100,
      armor:0,magnetR:80,cdMul:1,xpMul:1,regen:0,invT:0,flashT:0,facing:0};
    this.cam={x:cx-this.sw/2,y:cy-this.sh/2};
    this.shakeT=0;this.shakeI=0;
    this.weapons=[];this.passiveLvs={};
    this._addWeapon("blade");
    this.projs=[];this.enemies=[];this.gems=[];this.particles=[];this.dmgNums=[];
    this.lightnings=[];this.frostWaves=[];this.clouds=[];this.enemyProjs=[];
    this.talismans=[];this.talismanT=0;
    this.xp=0;this.level=1;this.xpNext=10;
    this.elapsed=0;this.killCount=0;this.totalDmg=0;
    this.spawnTimer=0;this.spawnInterval=1500;
    this.bossSpawned=false;this.allureT=0;this.allureSrc=null;
    this.bladeAngle=0;this.pendingLevelUps=0;
    this.ui.start.classList.add("hidden");this.ui.end.classList.add("hidden");
    this.ui.pause.classList.add("hidden");this.ui.lvl.classList.add("hidden");
    this.ui.hud.classList.remove("hidden");
    if(this.isMobile)this.ui.joyZone.classList.remove("hidden");
    this.state="play";this.lastT=performance.now();
    this._refreshWeaponSlots();
  }
  _addWeapon(type){this.weapons.push({type,lv:0,lastFire:0,hitMap:new Map()})}
  _pause(){this.state="pause";this.ui.pause.classList.remove("hidden")}
  _unpause(){this.state="play";this.ui.pause.classList.add("hidden");this.lastT=performance.now()}

  /* ── RAF ── */
  _raf(){const now=performance.now();
    if(this.state==="play"){const dt=min((now-this.lastT)/1000,.05);this.lastT=now;this._update(dt)}
    else this.lastT=now;
    this._render();requestAnimationFrame(()=>this._raf())}

  /* ═══════════════════ UPDATE ═══════════════════ */
  _update(dt){
    this.elapsed+=dt;
    /* player movement */
    let mx=0,my=0;
    if(this.keys.KeyW||this.keys.ArrowUp)my=-1;
    if(this.keys.KeyS||this.keys.ArrowDown)my=1;
    if(this.keys.KeyA||this.keys.ArrowLeft)mx=-1;
    if(this.keys.KeyD||this.keys.ArrowRight)mx=1;
    if(this.touch.active){mx=this.touch.dx;my=this.touch.dy}
    const ml=sqrt(mx*mx+my*my);
    if(ml>.1){const[nx,ny]=norm(mx,my);
      this.p.x=clamp(this.p.x+nx*this.p.spd*dt*60,this.p.r,W-this.p.r);
      this.p.y=clamp(this.p.y+ny*this.p.spd*dt*60,this.p.r,H-this.p.r);
      this.p.facing=atan2(ny,nx)}
    /* allure pull */
    if(this.allureT>0){this.allureT-=dt;
      if(this.allureSrc){const a=atan2(this.allureSrc.y-this.p.y,this.allureSrc.x-this.p.x);
        this.p.x+=cos(a)*1.5*dt*60;this.p.y+=sin(a)*1.5*dt*60;
        this.p.x=clamp(this.p.x,this.p.r,W-this.p.r);this.p.y=clamp(this.p.y,this.p.r,H-this.p.r)}}
    /* regen */
    if(this.p.regen>0)this.p.hp=min(this.p.hp+this.p.regen*dt,this.p.maxHp);
    if(this.p.invT>0)this.p.invT-=dt;
    if(this.p.flashT>0)this.p.flashT-=dt;
    /* spawn */
    this._spawnEnemies(dt);
    /* boss */
    if(!this.bossSpawned&&this.elapsed>=BOSS_TIME){this.bossSpawned=true;this._spawnBoss()}
    /* weapons */
    this._updateWeapons(dt);
    /* projs */
    this._updateProjs(dt);
    /* enemy projs */
    this._updateEnemyProjs(dt);
    /* enemies */
    this._updateEnemies(dt);
    /* frost waves */
    this._updateFrostWaves(dt);
    /* clouds */
    this._updateClouds(dt);
    /* lightnings */
    this.lightnings=this.lightnings.filter(l=>{l.t-=dt;return l.t>0});
    /* gems */
    this._updateGems(dt);
    /* talismans */
    this._updateTalismans(dt);
    /* fx */
    this.particles=this.particles.filter(p=>{p.x+=p.vx*dt*60;p.y+=p.vy*dt*60;p.life-=dt;p.a=max(0,p.life/p.maxLife);return p.life>0});
    this.dmgNums=this.dmgNums.filter(d=>{d.y-=40*dt;d.life-=dt;d.a=max(0,d.life/d.maxLife);return d.life>0});
    /* camera */
    const tx=this.p.x-this.sw/2,ty=this.p.y-this.sh/2;
    this.cam.x=lerp(this.cam.x,tx,.08);this.cam.y=lerp(this.cam.y,ty,.08);
    if(this.shakeT>0){this.cam.x+=rand(-this.shakeI,this.shakeI);this.cam.y+=rand(-this.shakeI,this.shakeI);this.shakeT-=dt}
    /* HUD */
    this._updateHUD();
    /* lvl up */
    if(this.pendingLevelUps>0&&this.state==="play"){this.pendingLevelUps--;this._showLevelUp()}
    /* victory */
    if(this.elapsed>=SURVIVE)this._victory();
  }

  /* ── SPAWN ── */
  _spawnEnemies(dt){
    const mf=this.elapsed/60;
    this.spawnInterval=max(300,1500-mf*100);
    this.spawnTimer-=dt*1000;if(this.spawnTimer>0)return;
    this.spawnTimer=this.spawnInterval;
    const count=min(12,2+floor(mf*.9));
    let types=["dokkaebi"];
    for(const row of SPAWN_TBL)if(this.elapsed>=row.t)types=row.types;
    for(let i=0;i<count;i++){
      let etype=pick(types);
      // wisp spawns in groups
      if(etype==="wisp"){
        const grp=rInt(4,7),angle=rand(0,TAU),bd=rand(420,560);
        for(let j=0;j<grp;j++){
          const ox=rand(-30,30),oy=rand(-30,30);
          const x=this.p.x+cos(angle)*bd+ox,y=this.p.y+sin(angle)*bd+oy;
          if(x<0||x>W||y<0||y>H)continue;
          this._spawnEnemy("wisp",x,y,mf);
        }
        continue;
      }
      const angle=rand(0,TAU),d=rand(420,560);
      const x=this.p.x+cos(angle)*d,y=this.p.y+sin(angle)*d;
      if(x<0||x>W||y<0||y>H)continue;
      this._spawnEnemy(etype,x,y,mf);
    }
  }
  _spawnEnemy(type,x,y,mf){
    const def=ETYPES[type];const hpS=1+mf*.12;
    this.enemies.push({id:++_eid,type,x,y,r:def.r,
      hp:Math.round(def.hp*hpS),maxHp:Math.round(def.hp*hpS),
      spd:def.spd,col:def.col,dmg:def.dmg,xp:def.xp,
      boss:!!def.boss,hitT:0,slowT:0,slowF:1,
      state:"chase",stateT:0,atkT:0,alpha:1,
      targetX:0,targetY:0,chargeA:0,
      frozenT:0,frozenD:0,frozenR:0,
      summonT:0,allureT:0});
  }
  _spawnBoss(){
    const def=ETYPES.gumiho,angle=rand(0,TAU);
    const x=clamp(this.p.x+cos(angle)*500,40,W-40);
    const y=clamp(this.p.y+sin(angle)*500,40,H-40);
    this.enemies.push({id:++_eid,type:"gumiho",x,y,r:def.r,
      hp:def.hp,maxHp:def.hp,spd:def.spd,col:def.col,dmg:def.dmg,xp:def.xp,
      boss:true,hitT:0,slowT:0,slowF:1,
      state:"chase",stateT:0,atkT:0,alpha:1,
      targetX:0,targetY:0,chargeA:0,
      frozenT:0,frozenD:0,frozenR:0,
      summonT:0,allureT:0});
    this.sfx.boss();this._shake(12,.5);
  }

  /* ── WEAPONS ── */
  _updateWeapons(dt){
    const now=this.elapsed*1000;
    for(const w of this.weapons){
      const def=getWDef(w.type),lv=def.lvs[w.lv];
      switch(w.type){
        case"blade":case"ghostSlash":this._wpnBlade(w,lv,dt,w.type);break;
        case"fire":case"ghostFlame":this._wpnFire(w,lv,now,w.type);break;
        case"lightning":this._wpnLightning(w,lv,now);break;
        case"thunderIce":this._wpnThunderIce(w,lv,now);break;
        case"frost":this._wpnFrost(w,lv,now);break;
        case"curseMist":this._wpnCurseMist(w,lv,now);break;
        case"aura":this._wpnAura(w,lv,dt);break;
      }
    }
  }
  _wpnBlade(w,lv,dt,type){
    this.bladeAngle+=lv.spd*dt;const step=TAU/lv.cnt;
    for(const[id,t]of w.hitMap)if(this.elapsed-t>.35)w.hitMap.delete(id);
    for(let i=0;i<lv.cnt;i++){
      const a=this.bladeAngle+step*i,bx=this.p.x+cos(a)*lv.rad,by=this.p.y+sin(a)*lv.rad;
      for(const e of this.enemies){
        if(sqrt((bx-e.x)**2+(by-e.y)**2)<e.r+10&&!w.hitMap.has(e.id)){
          w.hitMap.set(e.id,this.elapsed);this._damageEnemy(e,lv.dmg);this.sfx.hit()}}}
  }
  _wpnFire(w,lv,now,type){
    const cd=lv.cd*this.p.cdMul;if(now-w.lastFire<cd)return;w.lastFire=now;
    const sorted=[...this.enemies].sort((a,b)=>dist(a,this.p)-dist(b,this.p));
    const targets=sorted.slice(0,lv.cnt);if(!targets.length)return;
    this.sfx.wpn(type);
    for(const tgt of targets){
      const a=atan2(tgt.y-this.p.y,tgt.x-this.p.x);
      this.projs.push({x:this.p.x,y:this.p.y,vx:cos(a)*lv.spd,vy:sin(a)*lv.spd,
        dmg:lv.dmg,r:6,prc:lv.prc,col:type==="ghostFlame"?"#ff6d00":"#ff9800",
        life:3,maxLife:3,type,hitSet:new Set()})}
  }
  _wpnLightning(w,lv,now){
    const cd=lv.cd*this.p.cdMul;if(now-w.lastFire<cd)return;w.lastFire=now;
    const inR=this.enemies.filter(e=>dist(e,this.p)<350);if(!inR.length)return;
    this.sfx.wpn("lightning");
    for(let i=0;i<lv.st&&inR.length>0;i++){
      const idx=rInt(0,inR.length-1),e=inR[idx];
      this._damageEnemy(e,lv.dmg);
      this.lightnings.push({x1:this.p.x,y1:this.p.y,x2:e.x,y2:e.y,t:.2});inR.splice(idx,1)}
  }
  _wpnThunderIce(w,lv,now){
    const cd=lv.cd*this.p.cdMul;if(now-w.lastFire<cd)return;w.lastFire=now;
    const inR=this.enemies.filter(e=>dist(e,this.p)<350);if(!inR.length)return;
    this.sfx.wpn("thunderIce");
    for(let i=0;i<lv.st&&inR.length>0;i++){
      const idx=rInt(0,inR.length-1),e=inR[idx];
      this._damageEnemy(e,lv.dmg);
      this.lightnings.push({x1:this.p.x,y1:this.p.y,x2:e.x,y2:e.y,t:.2,col:"#4dd0e1"});
      e.frozenT=lv.frzT;e.frozenD=lv.frzD;e.frozenR=lv.frzR;
      inR.splice(idx,1)}
  }
  _wpnFrost(w,lv,now){
    const cd=lv.cd*this.p.cdMul;if(now-w.lastFire<cd)return;w.lastFire=now;
    this.sfx.wpn("frost");
    this.frostWaves.push({x:this.p.x,y:this.p.y,rad:0,maxRad:lv.rad,
      dmg:lv.dmg,slow:lv.slow,dur:lv.dur,spd:200,hitSet:new Set()});
  }
  _wpnCurseMist(w,lv,now){
    const cd=lv.cd*this.p.cdMul;if(now-w.lastFire<cd)return;w.lastFire=now;
    this.sfx.wpn("curseMist");
    for(let i=0;i<lv.cnt;i++){const a=rand(0,TAU),d=rand(40,180);
      this.clouds.push({x:this.p.x+cos(a)*d,y:this.p.y+sin(a)*d,
        rad:lv.rad,dmg:lv.dmg,tick:lv.tick,dur:lv.dur,tickT:0,life:lv.dur})}
  }
  _wpnAura(w,lv,dt){
    w.lastFire=(w.lastFire||0)+dt*1000;const tick=lv.tick*this.p.cdMul;
    if(w.lastFire<tick)return;w.lastFire=0;this.sfx.wpn("aura");
    for(const e of this.enemies)if(dist(e,this.p)<lv.rad+e.r)this._damageEnemy(e,lv.dmg);
  }

  /* ── PROJECTILES ── */
  _updateProjs(dt){
    this.projs=this.projs.filter(p=>{
      p.x+=p.vx*dt*60;p.y+=p.vy*dt*60;p.life-=dt;
      if(p.life<=0||p.x<-50||p.x>W+50||p.y<-50||p.y>H+50)return false;
      for(const e of this.enemies){
        if(p.hitSet.has(e.id))continue;
        if(dist(p,e)<p.r+e.r){p.hitSet.add(e.id);this._damageEnemy(e,p.dmg);this.sfx.hit();
          p.prc--;if(p.prc<=0)return false}}
      return true});
  }

  /* ── ENEMY PROJECTILES ── */
  _updateEnemyProjs(dt){
    this.enemyProjs=this.enemyProjs.filter(p=>{
      p.x+=p.vx*dt*60;p.y+=p.vy*dt*60;p.life-=dt;
      if(p.life<=0)return false;
      if(dist(p,this.p)<p.r+this.p.r&&this.p.invT<=0){
        const raw=max(1,p.dmg-this.p.armor);
        this.p.hp-=raw;this.p.invT=.5;this.p.flashT=.15;
        this.sfx.dmg();this._shake(4,.1);
        this._spawnParticles(this.p.x,this.p.y,5,"#ef5350");
        this.dmgNums.push({x:this.p.x,y:this.p.y-20,txt:"-"+raw,col:"#ef5350",life:.8,maxLife:.8,a:1,big:true});
        if(this.p.hp<=0){this.p.hp=0;this._gameOver()}
        return false}
      return true});
  }

  /* ── FROST WAVES ── */
  _updateFrostWaves(dt){
    this.frostWaves=this.frostWaves.filter(fw=>{
      fw.rad+=fw.spd*dt;if(fw.rad>fw.maxRad)return false;
      for(const e of this.enemies){if(fw.hitSet.has(e.id))continue;
        const d=dist(e,fw);if(d<fw.rad+e.r&&d>fw.rad-30){
          fw.hitSet.add(e.id);this._damageEnemy(e,fw.dmg);e.slowT=fw.dur/1000;e.slowF=fw.slow}}
      return true});
  }

  /* ── CLOUDS (curse mist) ── */
  _updateClouds(dt){
    this.clouds=this.clouds.filter(c=>{
      c.life-=dt;if(c.life<=0)return false;
      c.tickT+=dt*1000;if(c.tickT>=c.tick){c.tickT=0;
        for(const e of this.enemies)if(dist(e,c)<c.rad+e.r)this._damageEnemy(e,c.dmg)}
      return true});
  }

  /* ── ENEMIES ── */
  _updateEnemies(dt){
    for(let i=this.enemies.length-1;i>=0;i--){
      const e=this.enemies[i];
      if(e.slowT>0)e.slowT-=dt;
      const sm=e.slowT>0?e.slowF:1;
      if(e.hitT>0)e.hitT-=dt;
      e.stateT+=dt;

      /* frozen → don't move, explode when timer runs out */
      if(e.frozenT>0){e.frozenT-=dt;
        if(e.frozenT<=0){
          for(const o of this.enemies){if(o===e)continue;
            if(dist(o,e)<e.frozenR)this._damageEnemy(o,e.frozenD)}
          this._spawnParticles(e.x,e.y,10,"#4dd0e1");this.sfx.wpn("frost");
          e.frozenT=0}
      }else{
        /* AI dispatch */
        switch(e.type){
          case"dokkaebi":this._aiDokkaebi(e,dt,sm);break;
          case"wisp":case"foxClone":this._aiChase(e,dt,sm);break;
          case"skeleton":this._aiSkeleton(e,dt,sm);break;
          case"ghost":this._aiGhost(e,dt,sm);break;
          case"gumiho":this._aiBoss(e,dt,sm);break;
          default:this._aiChase(e,dt,sm);break;
        }
      }
      e.x=clamp(e.x,e.r,W-e.r);e.y=clamp(e.y,e.r,H-e.r);

      /* collision with player */
      if(dist(e,this.p)<e.r+this.p.r&&this.p.invT<=0&&e.alpha>.6){
        const raw=max(1,e.dmg-this.p.armor);
        this.p.hp-=raw;this.p.invT=.5;this.p.flashT=.15;
        this.sfx.dmg();this._shake(6,.15);this._spawnParticles(this.p.x,this.p.y,8,"#ef5350");
        this.dmgNums.push({x:this.p.x,y:this.p.y-20,txt:"-"+raw,col:"#ef5350",life:.8,maxLife:.8,a:1,big:true});
        if(this.p.hp<=0){this.p.hp=0;this._gameOver();return}}
      /* death */
      if(e.hp<=0){this._onEnemyKill(e);this.enemies.splice(i,1)}
    }
    /* separation */
    for(let i=0;i<this.enemies.length;i++)for(let j=i+1;j<this.enemies.length;j++){
      const a=this.enemies[i],b=this.enemies[j],d=dist(a,b),md=a.r+b.r;
      if(d<md&&d>0){const ov=(md-d)/2,nx=(b.x-a.x)/d,ny=(b.y-a.y)/d;
        a.x-=nx*ov*.5;a.y-=ny*ov*.5;b.x+=nx*ov*.5;b.y+=ny*ov*.5}}
  }

  /* ── AI: simple chase ── */
  _aiChase(e,dt,sm){
    const a=atan2(this.p.y-e.y,this.p.x-e.x);
    e.x+=cos(a)*e.spd*sm*dt*60;e.y+=sin(a)*e.spd*sm*dt*60}

  /* ── AI: 도깨비 — chase + random charge ── */
  _aiDokkaebi(e,dt,sm){
    switch(e.state){
      case"chase":{
        const a=atan2(this.p.y-e.y,this.p.x-e.x);
        e.x+=cos(a)*e.spd*sm*dt*60;e.y+=sin(a)*e.spd*sm*dt*60;
        if(e.stateT>rand(3,5)&&dist(e,this.p)<280){
          e.state="windup";e.stateT=0;e.chargeA=atan2(this.p.y-e.y,this.p.x-e.x)}
        break}
      case"windup":if(e.stateT>.3){e.state="charge";e.stateT=0}break;
      case"charge":
        e.x+=cos(e.chargeA)*e.spd*3.5*sm*dt*60;e.y+=sin(e.chargeA)*e.spd*3.5*sm*dt*60;
        if(e.stateT>.45){e.state="chase";e.stateT=0}break;
      default:e.state="chase";e.stateT=0}
  }

  /* ── AI: 해골병사 — ranged attacker ── */
  _aiSkeleton(e,dt,sm){
    const d=dist(e,this.p);
    if(d>200){const a=atan2(this.p.y-e.y,this.p.x-e.x);
      e.x+=cos(a)*e.spd*sm*dt*60;e.y+=sin(a)*e.spd*sm*dt*60;e.state="approach"}
    else{e.state="ranged";e.atkT+=dt;
      if(e.atkT>=1.8){e.atkT=0;
        const a=atan2(this.p.y-e.y,this.p.x-e.x);
        this.enemyProjs.push({x:e.x,y:e.y,vx:cos(a)*3,vy:sin(a)*3,
          dmg:e.dmg,r:5,life:2.5,col:"#d7ccc8"});
        this.sfx.hit()}}
  }

  /* ── AI: 처녀귀신 — stalk → telegraph → teleport attack ── */
  _aiGhost(e,dt,sm){
    switch(e.state){
      case"chase":case"stalk":{
        const a=atan2(this.p.y-e.y,this.p.x-e.x);
        e.x+=cos(a)*e.spd*.5*sm*dt*60;e.y+=sin(a)*e.spd*.5*sm*dt*60;
        e.alpha=.35;e.state="stalk";
        if(dist(e,this.p)<260&&e.stateT>2.5){
          e.state="telegraph";e.stateT=0;e.targetX=this.p.x;e.targetY=this.p.y}
        break}
      case"telegraph":
        e.alpha=.25;
        if(e.stateT>.6){e.state="attack";e.stateT=0;
          e.x=e.targetX;e.y=e.targetY;e.alpha=1}
        break;
      case"attack":
        e.alpha=1;if(e.stateT>.35){e.state="cooldown";e.stateT=0}break;
      case"cooldown":
        e.alpha=.55;
        if(e.stateT>1.2){e.state="stalk";e.stateT=0;
          const a=rand(0,TAU);e.x=this.p.x+cos(a)*rand(200,340);e.y=this.p.y+sin(a)*rand(200,340)}
        break;
      default:e.state="stalk";e.stateT=0}
  }

  /* ── AI: 구미호 boss ── */
  _aiBoss(e,dt,sm){
    /* always slowly chase */
    const a=atan2(this.p.y-e.y,this.p.x-e.x);
    e.x+=cos(a)*e.spd*sm*dt*60;e.y+=sin(a)*e.spd*sm*dt*60;
    /* summon clones every 20s */
    e.summonT+=dt;
    if(e.summonT>=20){e.summonT=0;
      for(let j=0;j<2;j++){const ca=rand(0,TAU);
        this._spawnEnemy("foxClone",e.x+cos(ca)*40,e.y+sin(ca)*40,this.elapsed/60)}
      this._spawnParticles(e.x,e.y,15,"#f48fb1")}
    /* allure every 12s */
    e.allureT+=dt;
    if(e.allureT>=12){e.allureT=0;
      this.allureT=2;this.allureSrc=e;this.sfx.allure();
      this._spawnParticles(e.x,e.y,20,"#f06292")}
  }

  /* ── DAMAGE ── */
  _damageEnemy(e,dmg){
    let crit=false;if(Math.random()<.1){dmg=Math.round(dmg*2);crit=true}
    e.hp-=dmg;e.hitT=.1;this.totalDmg+=dmg;
    const col=crit?"#ffd93d":"#fff";
    this.dmgNums.push({x:e.x+rand(-10,10),y:e.y-e.r-5,txt:dmg.toString(),col,life:.6,maxLife:.6,a:1,big:crit});
    this._spawnParticles(e.x,e.y,crit?6:3,e.col);
  }
  _onEnemyKill(e){
    this.killCount++;this.sfx.kill();this._spawnParticles(e.x,e.y,12,e.col);
    /* ghostSlash heal */
    const gsW=this.weapons.find(w=>w.type==="ghostSlash");
    if(gsW){const lv=EVOLVED.ghostSlash.lvs[gsW.lv];
      this.p.hp=min(this.p.hp+lv.heal,this.p.maxHp)}
    /* ghostFlame explosion */
    const gfW=this.weapons.find(w=>w.type==="ghostFlame");
    if(gfW){const lv=EVOLVED.ghostFlame.lvs[gfW.lv];
      for(const o of this.enemies){if(o===e)continue;if(dist(o,e)<lv.exR)this._damageEnemy(o,lv.exD)}
      this._spawnParticles(e.x,e.y,15,"#ff6d00")}
    /* drop gems */
    let xv=e.xp;while(xv>0){const v=xv>=10?10:xv>=5?5:1;xv-=v;
      this.gems.push({x:e.x+rand(-15,15),y:e.y+rand(-15,15),
        val:v,r:v>=10?7:v>=5?5.5:4,col:v>=10?"#ffab00":v>=5?"#ffd54f":"#fff9c4",
        attracting:false})}
  }

  /* ── GEMS ── */
  _updateGems(dt){
    this.gems=this.gems.filter(g=>{
      const d=dist(g,this.p);
      if(d<this.p.magnetR||g.attracting){g.attracting=true;
        const a=atan2(this.p.y-g.y,this.p.x-g.x),spd=8+max(0,(this.p.magnetR-d)*.1);
        g.x+=cos(a)*spd*dt*60;g.y+=sin(a)*spd*dt*60}
      if(d<this.p.r+g.r){this.xp+=Math.round(g.val*this.p.xpMul);this.sfx.xp();
        while(this.xp>=this.xpNext){this.xp-=this.xpNext;this.level++;
          this.xpNext=Math.round(10*Math.pow(1.18,this.level-1));this.pendingLevelUps++;this.sfx.lvl()}
        return false}
      return true});
  }

  /* ── TALISMANS ── */
  _updateTalismans(dt){
    this.talismanT+=dt;
    if(this.talismanT>=30){this.talismanT=0;
      const type=Math.random()<.5?"heal":"magnet";
      const a=rand(0,TAU),d=rand(100,250);
      this.talismans.push({x:this.p.x+cos(a)*d,y:this.p.y+sin(a)*d,
        type,r:10,life:15})}
    this.talismans=this.talismans.filter(t=>{
      t.life-=dt;if(t.life<=0)return false;
      if(dist(t,this.p)<t.r+this.p.r){
        this.sfx.talisman();
        if(t.type==="heal"){this.p.hp=min(this.p.hp+this.p.maxHp*.3,this.p.maxHp);
          this.dmgNums.push({x:this.p.x,y:this.p.y-25,txt:"+"+Math.round(this.p.maxHp*.3),col:"#66bb6a",life:.8,maxLife:.8,a:1,big:true})}
        else{for(const g of this.gems)g.attracting=true}
        this._spawnParticles(t.x,t.y,10,t.type==="heal"?"#66bb6a":"#42a5f5");
        return false}
      return true});
  }

  /* ── LEVEL UP ── */
  _showLevelUp(){
    this.state="lvlup";this.ui.lvl.classList.remove("hidden");
    const opts=this._genUpgradeOptions(3);
    const box=this.ui.choices;while(box.firstChild)box.removeChild(box.firstChild);
    for(const opt of opts){
      const card=document.createElement("div");card.className="choice-card";
      if(opt.kind==="synth")card.classList.add("synth");
      const ic=document.createElement("div");ic.className="choice-icon";ic.textContent=opt.icon;
      const nm=document.createElement("div");nm.className="choice-name";nm.textContent=opt.name;
      const lv=document.createElement("div");lv.className="choice-lv";lv.textContent=opt.lvText;
      const ds=document.createElement("div");ds.className="choice-desc";ds.textContent=opt.desc;
      card.append(ic,nm,lv,ds);
      card.onclick=()=>{this._applyUpgrade(opt);this.ui.lvl.classList.add("hidden");
        this.state="play";this.lastT=performance.now();
        if(this.pendingLevelUps>0){this.pendingLevelUps--;this._showLevelUp()}};
      box.appendChild(card)}
  }
  _genUpgradeOptions(n){
    const pool=[];const owned=new Set(this.weapons.map(w=>w.type));
    /* synthesis check first */
    for(const r of RECIPES){
      if(owned.has(r.result))continue;
      const wA=this.weapons.find(w=>w.type===r.a),wB=this.weapons.find(w=>w.type===r.b);
      if(wA&&wB&&wA.lv>=4&&wB.lv>=4){
        const ev=EVOLVED[r.result];
        pool.push({kind:"synth",type:r.result,ingA:r.a,ingB:r.b,
          icon:ev.icon,name:"합성: "+ev.name,lvText:"★ 진화",desc:ev.desc})}}
    /* weapon upgrades */
    for(const w of this.weapons){const def=getWDef(w.type);
      if(w.lv<def.maxLv-1)pool.push({kind:"weapon",type:w.type,icon:def.icon,name:def.name,
        lvText:"Lv "+(w.lv+2),desc:def.desc})}
    /* new weapons (base only) */
    for(const[type,def]of Object.entries(WDEFS)){
      if(!owned.has(type))pool.push({kind:"newWeapon",type,icon:def.icon,
        name:def.name+" (NEW)",lvText:"Lv 1",desc:def.desc})}
    /* passives */
    for(const[key,def]of Object.entries(PASSIVES)){
      const cur=this.passiveLvs[key]||0;
      if(cur<def.maxLv)pool.push({kind:"passive",type:key,icon:def.icon,name:def.name,
        lvText:"Lv "+(cur+1),desc:def.desc})}
    /* prioritize: synth first, then shuffle rest */
    const synths=pool.filter(o=>o.kind==="synth");
    const rest=pool.filter(o=>o.kind!=="synth");
    for(let i=rest.length-1;i>0;i--){const j=floor(Math.random()*(i+1));[rest[i],rest[j]]=[rest[j],rest[i]]}
    return[...synths,...rest].slice(0,min(n,pool.length));
  }
  _applyUpgrade(opt){
    if(opt.kind==="weapon"){const w=this.weapons.find(w=>w.type===opt.type);if(w)w.lv++}
    else if(opt.kind==="newWeapon")this._addWeapon(opt.type);
    else if(opt.kind==="synth"){
      this.weapons=this.weapons.filter(w=>w.type!==opt.ingA&&w.type!==opt.ingB);
      this._addWeapon(opt.type);this.sfx.synth();this._shake(8,.3);
      this._spawnParticles(this.p.x,this.p.y,25,"#ffd54f")}
    else if(opt.kind==="passive"){
      const key=opt.type;this.passiveLvs[key]=(this.passiveLvs[key]||0)+1;
      const p=this.p;switch(key){
        case"maxHp":p.maxHp+=20;p.hp=min(p.hp+20,p.maxHp);break;
        case"speed":p.spd*=1.1;break;case"magnet":p.magnetR+=30;break;
        case"armor":p.armor+=3;break;case"cdReduce":p.cdMul*=.92;break;
        case"xpBonus":p.xpMul*=1.15;break;case"regen":p.regen+=1;break}}
    this._refreshWeaponSlots();
  }
  _refreshWeaponSlots(){
    const box=this.ui.wslots;while(box.firstChild)box.removeChild(box.firstChild);
    for(const w of this.weapons){const def=getWDef(w.type);
      const el=document.createElement("div");el.className="wslot";el.textContent=def.icon;
      const lv=document.createElement("span");lv.className="wslot-lv";lv.textContent=w.lv+1;
      el.appendChild(lv);box.appendChild(el)}
  }

  /* ── END ── */
  _gameOver(){this.state="end";this.ui.endTitle.textContent="게임 오버";
    this.ui.endTitle.style.color="#ef5350";this._showEndStats();this.ui.end.classList.remove("hidden")}
  _victory(){this.state="end";this.sfx.win();this.ui.endTitle.textContent="🎉 퇴마 완료!";
    this.ui.endTitle.style.color="#ffd93d";this._showEndStats();this.ui.end.classList.remove("hidden")}
  _showEndStats(){
    const box=this.ui.endStats;while(box.firstChild)box.removeChild(box.firstChild);
    const m=floor(this.elapsed/60),s=floor(this.elapsed%60);
    const rows=[["생존 시간",`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`],
      ["레벨","Lv "+this.level],["처치 수",this.killCount.toLocaleString()],
      ["총 피해량",this.totalDmg.toLocaleString()],["무기 수",this.weapons.length+"종"]];
    for(const[k,v]of rows){const row=document.createElement("div");row.className="stat-row";
      const a=document.createElement("span");a.textContent=k;
      const b=document.createElement("span");b.textContent=v;
      row.append(a,b);box.appendChild(row)}
  }

  /* ── FX ── */
  _shake(i,d){this.shakeI=i;this.shakeT=d}
  _spawnParticles(x,y,cnt,col){for(let i=0;i<cnt;i++){const a=rand(0,TAU),sp=rand(1,3.5);
    this.particles.push({x,y,vx:cos(a)*sp,vy:sin(a)*sp,col,r:rand(2,4.5),life:rand(.25,.5),maxLife:.5,a:1})}}
  _updateHUD(){
    const p=this.p;
    this.ui.hpBar.style.width=(p.hp/p.maxHp*100)+"%";
    this.ui.hpTxt.textContent=Math.ceil(p.hp)+" / "+p.maxHp;
    this.ui.xpBar.style.width=(this.xp/this.xpNext*100)+"%";
    this.ui.lvTxt.textContent="Lv "+this.level;
    const m=floor(this.elapsed/60),s=floor(this.elapsed%60);
    this.ui.timer.textContent=String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
    this.ui.kills.textContent=this.killCount+" KILLS"}

  /* ═══════════════════ RENDER ═══════════════════ */
  _render(){
    const c=this.ctx,sw=this.sw,sh=this.sh;c.clearRect(0,0,sw,sh);
    if(this.state==="menu")return;
    const cx=this.cam.x,cy=this.cam.y;
    const toX=x=>x-cx,toY=y=>y-cy;

    /* ── bamboo forest background ── */
    c.fillStyle="#081210";c.fillRect(0,0,sw,sh);
    // grid
    const gs=60;c.strokeStyle="rgba(80,160,100,.04)";c.lineWidth=1;
    const ox=-(cx%gs),oy=-(cy%gs);c.beginPath();
    for(let x=ox;x<sw;x+=gs){c.moveTo(x,0);c.lineTo(x,sh)}
    for(let y=oy;y<sh;y+=gs){c.moveTo(0,y);c.lineTo(sw,y)}
    c.stroke();
    // bamboo stalks
    const bSpacing=140;c.strokeStyle="rgba(60,130,80,.1)";c.lineWidth=3;
    const bOx=-(cx%bSpacing);
    for(let bx=bOx-bSpacing;bx<sw+bSpacing;bx+=bSpacing){
      const wx=bx+cx,jitter=((wx*7+13)%bSpacing)*.3;
      const sx=bx+jitter;c.beginPath();c.moveTo(sx,0);c.lineTo(sx,sh);c.stroke();
      c.lineWidth=1.5;
      for(let ny=((cy*3+wx)%80);ny<sh;ny+=rand(70,110)){
        c.beginPath();c.moveTo(sx-6,ny);c.lineTo(sx+6,ny);c.stroke()}
      c.lineWidth=3}
    // moon
    c.save();c.globalAlpha=.08;c.fillStyle="#ffffcc";
    c.beginPath();c.arc(sw-120,80,60,0,TAU);c.fill();
    c.globalAlpha=.03;c.beginPath();c.arc(sw-120,80,90,0,TAU);c.fill();c.restore();
    // world border
    c.strokeStyle="rgba(200,80,80,.25)";c.lineWidth=3;c.strokeRect(toX(0),toY(0),W,H);

    /* ── allure visual ── */
    if(this.allureT>0&&this.allureSrc){
      c.save();c.globalAlpha=this.allureT/2*.3;c.strokeStyle="#f06292";c.lineWidth=2;
      const bsx=toX(this.allureSrc.x),bsy=toY(this.allureSrc.y);
      const psx=toX(this.p.x),psy=toY(this.p.y);
      c.setLineDash([6,6]);c.beginPath();c.moveTo(bsx,bsy);c.lineTo(psx,psy);c.stroke();
      c.setLineDash([]);c.restore()}

    /* ── aura /혼령장 visual ── */
    const auraW=this.weapons.find(w=>w.type==="aura");
    if(auraW){const aLv=WDEFS.aura.lvs[auraW.lv];c.beginPath();
      c.arc(toX(this.p.x),toY(this.p.y),aLv.rad,0,TAU);
      c.fillStyle="rgba(206,147,216,.06)";c.fill();
      c.strokeStyle="rgba(206,147,216,.2)";c.lineWidth=1.5;c.stroke()}

    /* ── clouds (curse mist) ── */
    for(const cl of this.clouds){
      const sx=toX(cl.x),sy=toY(cl.y);
      c.save();c.globalAlpha=min(.3,cl.life/cl.dur*.35);
      c.fillStyle="#7e57c2";c.beginPath();c.arc(sx,sy,cl.rad,0,TAU);c.fill();
      c.restore()}

    /* ── frost waves ── */
    for(const fw of this.frostWaves){c.beginPath();c.arc(toX(fw.x),toY(fw.y),fw.rad,0,TAU);
      c.strokeStyle="rgba(128,222,234,.5)";c.lineWidth=4;c.stroke();
      c.fillStyle="rgba(128,222,234,.05)";c.fill()}

    /* ── ghost telegraph ── */
    for(const e of this.enemies){
      if(e.type==="ghost"&&e.state==="telegraph"){
        c.save();c.globalAlpha=.3+sin(this.elapsed*20)*.15;
        c.strokeStyle="#e8eaf6";c.lineWidth=2;c.setLineDash([4,4]);
        c.beginPath();c.arc(toX(e.targetX),toY(e.targetY),18,0,TAU);c.stroke();
        c.setLineDash([]);c.restore()}}

    /* ── talismans ── */
    for(const t of this.talismans){
      const sx=toX(t.x),sy=toY(t.y);
      c.save();c.globalAlpha=t.life<3?t.life/3:1;
      const tcol=t.type==="heal"?"#66bb6a":"#42a5f5";
      c.fillStyle=tcol;c.shadowColor=tcol;c.shadowBlur=12;
      // talisman shape (rectangle)
      c.fillRect(sx-7,sy-10,14,20);
      c.fillStyle="#fff";c.font="bold 10px sans-serif";c.textAlign="center";
      c.fillText(t.type==="heal"?"回":"磁",sx,sy+4);
      c.restore()}

    /* ── gems ── */
    for(const g of this.gems){const sx=toX(g.x),sy=toY(g.y);
      if(sx<-20||sx>sw+20||sy<-20||sy>sh+20)continue;
      c.save();c.translate(sx,sy);c.rotate(PI/4);c.fillStyle=g.col;
      c.shadowColor=g.col;c.shadowBlur=8;c.fillRect(-g.r,-g.r,g.r*2,g.r*2);c.restore()}

    /* ── enemies ── */
    for(const e of this.enemies){
      const sx=toX(e.x),sy=toY(e.y);
      if(sx<-50||sx>sw+50||sy<-50||sy>sh+50)continue;
      const hf=e.hitT>0;c.save();c.globalAlpha=e.alpha||1;

      if(e.type==="wisp"){
        /* 쥐불: flickering flame */
        c.globalAlpha=(e.alpha||1)*(0.55+sin(this.elapsed*10+e.id)*.3);
        c.fillStyle=hf?"#fff":"#00e5ff";c.shadowColor="#00e5ff";c.shadowBlur=14;
        c.beginPath();c.arc(sx,sy,e.r,0,TAU);c.fill();
      }else if(e.type==="ghost"){
        /* 처녀귀신: semi-transparent + hair */
        c.fillStyle=hf?"#fff":e.col;c.beginPath();c.arc(sx,sy,e.r,0,TAU);c.fill();
        if(!hf){c.strokeStyle="#1a1a2e";c.lineWidth=1.5;
          for(let h=-6;h<=6;h+=3){c.beginPath();c.moveTo(sx+h,sy-e.r*.4);c.lineTo(sx+h,sy+e.r+5);c.stroke()}}
        if(e.frozenT>0){c.strokeStyle="#80deea";c.lineWidth=2;c.beginPath();c.arc(sx,sy,e.r+3,0,TAU);c.stroke()}
      }else if(e.type==="gumiho"||e.type==="foxClone"){
        /* 구미호 / 여우분신: fox shape */
        c.fillStyle=hf?"#fff":e.col;c.shadowColor=e.boss?"#f06292":"transparent";
        if(e.boss)c.shadowBlur=22;
        c.beginPath();c.arc(sx,sy,e.r,0,TAU);c.fill();
        // ears
        c.fillStyle=hf?"#fff":e.col;
        c.beginPath();c.moveTo(sx-e.r*.6,sy-e.r);c.lineTo(sx-e.r*.25,sy-e.r-14);c.lineTo(sx+e.r*.1,sy-e.r);c.fill();
        c.beginPath();c.moveTo(sx-e.r*.1,sy-e.r);c.lineTo(sx+e.r*.25,sy-e.r-14);c.lineTo(sx+e.r*.6,sy-e.r);c.fill();
        // tails (boss only)
        if(e.boss){c.strokeStyle=e.col;c.lineWidth=2.5;
          for(let t=0;t<3;t++){const ta=-PI/2+(t-1)*.4+sin(this.elapsed*2+t)*.25;
            c.beginPath();c.moveTo(sx,sy+e.r);
            c.quadraticCurveTo(sx+cos(ta)*35,sy+e.r+18,sx+cos(ta)*28,sy+e.r+32);c.stroke()}}
        // eyes
        c.fillStyle=hf?"#ccc":"#fff";c.beginPath();
        c.arc(sx-e.r*.25,sy-e.r*.1,e.r*.15,0,TAU);c.arc(sx+e.r*.25,sy-e.r*.1,e.r*.15,0,TAU);c.fill();
        c.fillStyle="#1a1a2e";c.beginPath();
        c.arc(sx-e.r*.25,sy-e.r*.1,e.r*.08,0,TAU);c.arc(sx+e.r*.25,sy-e.r*.1,e.r*.08,0,TAU);c.fill();
      }else{
        /* 도깨비, 해골 etc */
        c.beginPath();c.arc(sx,sy,e.r,0,TAU);
        c.fillStyle=hf?"#fff":(e.slowT>0?"#80deea":(e.frozenT>0?"#b3e5fc":e.col));c.fill();
        // 도깨비 horn
        if(e.type==="dokkaebi"){c.fillStyle=hf?"#fff":"#bf360c";
          c.beginPath();c.moveTo(sx-3,sy-e.r);c.lineTo(sx,sy-e.r-10);c.lineTo(sx+3,sy-e.r);c.fill();
          if(e.state==="charge"){c.strokeStyle="#ff6d00";c.lineWidth=2;
            c.beginPath();c.arc(sx,sy,e.r+4,0,TAU);c.stroke()}}
        // skeleton throw indicator
        if(e.type==="skeleton"&&e.state==="ranged"){c.strokeStyle="rgba(255,255,255,.2)";c.lineWidth=1;
          const ta=atan2(this.p.y-e.y,this.p.x-e.x);
          c.beginPath();c.moveTo(sx,sy);c.lineTo(sx+cos(ta)*30,sy+sin(ta)*30);c.stroke()}
        // eyes
        c.fillStyle=hf?"#ccc":"rgba(0,0,0,.5)";c.beginPath();
        c.arc(sx-e.r*.28,sy-e.r*.15,e.r*.18,0,TAU);c.arc(sx+e.r*.28,sy-e.r*.15,e.r*.18,0,TAU);c.fill();
        // frozen ring
        if(e.frozenT>0){c.strokeStyle="#80deea";c.lineWidth=2;c.beginPath();c.arc(sx,sy,e.r+3,0,TAU);c.stroke()}
      }
      // HP bar
      if(e.hp<e.maxHp){const bw=e.r*2.2,bh=3;c.globalAlpha=1;
        c.fillStyle="rgba(0,0,0,.5)";c.fillRect(sx-bw/2,sy-e.r-8,bw,bh);
        c.fillStyle=e.boss?"#f06292":"#ef5350";c.fillRect(sx-bw/2,sy-e.r-8,bw*(e.hp/e.maxHp),bh)}
      c.restore()}

    /* ── enemy projectiles ── */
    for(const p of this.enemyProjs){const sx=toX(p.x),sy=toY(p.y);
      c.save();c.fillStyle=p.col;c.shadowColor=p.col;c.shadowBlur=6;
      c.beginPath();c.arc(sx,sy,p.r,0,TAU);c.fill();c.restore()}

    /* ── player projectiles ── */
    for(const p of this.projs){const sx=toX(p.x),sy=toY(p.y);
      if(sx<-20||sx>sw+20||sy<-20||sy>sh+20)continue;
      c.save();c.shadowColor=p.col;c.shadowBlur=10;c.beginPath();c.arc(sx,sy,p.r,0,TAU);
      c.fillStyle=p.col;c.fill();c.restore()}

    /* ── blade / ghostSlash ── */
    const blW=this.weapons.find(w=>w.type==="blade"||w.type==="ghostSlash");
    if(blW){const def=getWDef(blW.type),bLv=def.lvs[blW.lv],step=TAU/bLv.cnt;
      const bCol=blW.type==="ghostSlash"?"#a5d6a7":"#ffd54f";
      for(let i=0;i<bLv.cnt;i++){const a=this.bladeAngle+step*i;
        const bx=toX(this.p.x+cos(a)*bLv.rad),by=toY(this.p.y+sin(a)*bLv.rad);
        c.save();c.translate(bx,by);c.rotate(a+PI/2);c.fillStyle=bCol;c.shadowColor=bCol;c.shadowBlur=8;
        c.beginPath();c.moveTo(0,-14);c.lineTo(-5,0);c.lineTo(0,7);c.lineTo(5,0);c.closePath();c.fill();c.restore()}}

    /* ── lightning bolts ── */
    for(const l of this.lightnings){c.save();c.globalAlpha=min(1,l.t/.1);
      const lc=l.col||"#ffeb3b";c.strokeStyle=lc;c.shadowColor=lc;c.shadowBlur=15;c.lineWidth=3;
      const sx=toX(l.x1),sy=toY(l.y1),ex=toX(l.x2),ey=toY(l.y2);
      c.beginPath();c.moveTo(sx,sy);
      for(let i=1;i<6;i++){const t=i/6;c.lineTo(sx+(ex-sx)*t+rand(-15,15),sy+(ey-sy)*t+rand(-15,15))}
      c.lineTo(ex,ey);c.stroke();c.restore()}

    /* ── particles ── */
    for(const pt of this.particles){c.globalAlpha=pt.a;c.beginPath();
      c.arc(toX(pt.x),toY(pt.y),pt.r*pt.a,0,TAU);c.fillStyle=pt.col;c.fill()}
    c.globalAlpha=1;

    /* ── player (퇴마사) ── */
    {const sx=toX(this.p.x),sy=toY(this.p.y);c.save();
      c.shadowColor="#ffd54f";c.shadowBlur=16;c.beginPath();c.arc(sx,sy,this.p.r,0,TAU);
      const flash=this.p.flashT>0,blink=this.p.invT>0&&floor(this.p.invT*12)%2===0;
      c.fillStyle=flash?"#ff5252":blink?"rgba(255,213,79,.4)":"#fafafa";c.fill();c.restore();
      // headband
      c.fillStyle="#d32f2f";c.fillRect(sx-this.p.r*.8,sy-this.p.r*.7,this.p.r*1.6,3);
      // facing
      c.fillStyle="#ffd54f";c.beginPath();const fa=this.p.facing;
      c.moveTo(sx+cos(fa)*(this.p.r+5),sy+sin(fa)*(this.p.r+5));
      c.lineTo(sx+cos(fa+2.6)*this.p.r*.5,sy+sin(fa+2.6)*this.p.r*.5);
      c.lineTo(sx+cos(fa-2.6)*this.p.r*.5,sy+sin(fa-2.6)*this.p.r*.5);c.closePath();c.fill();
      // eyes
      c.fillStyle="#1a1a2e";c.beginPath();c.arc(sx-4,sy-2,2.5,0,TAU);c.arc(sx+4,sy-2,2.5,0,TAU);c.fill()}

    /* ── damage numbers ── */
    for(const d of this.dmgNums){c.globalAlpha=d.a;
      c.font=(d.big?"bold 18px":"bold 13px")+" 'Segoe UI',sans-serif";
      c.fillStyle=d.col;c.textAlign="center";c.fillText(d.txt,toX(d.x),toY(d.y))}
    c.globalAlpha=1;

    /* ── minimap ── */
    this._renderMinimap(c)}

  _renderMinimap(c){
    const mw=100,mh=100,mx=this.sw-mw-12,my=this.sh-mh-12,sx=mw/W,sy=mh/H;
    c.fillStyle="rgba(0,0,0,.45)";c.fillRect(mx,my,mw,mh);
    c.strokeStyle="rgba(255,255,255,.15)";c.lineWidth=1;c.strokeRect(mx,my,mw,mh);
    c.fillStyle="rgba(239,83,80,.6)";
    for(const e of this.enemies)c.fillRect(mx+e.x*sx-1,my+e.y*sy-1,e.boss?4:2,e.boss?4:2);
    c.fillStyle="#fafafa";c.beginPath();c.arc(mx+this.p.x*sx,my+this.p.y*sy,3,0,TAU);c.fill();
    c.strokeStyle="rgba(255,255,255,.25)";c.strokeRect(mx+this.cam.x*sx,my+this.cam.y*sy,this.sw*sx,this.sh*sy)}
}

new Game();
})();
