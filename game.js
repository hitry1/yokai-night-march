/* ================================================================
   요괴야행 (Yokai Night March) v3.0
   Korean-mythology Vampire-Survivors roguelike
   Pure vanilla JS · HTML5 Canvas · Zero dependencies

   Major Features:
   - 6 playable characters with unique abilities
   - 8 base weapons + 4 evolved weapons
   - 9 enemy types including elites & bosses
   - Meta progression (gold → permanent upgrades)
   - Difficulty selection (Easy/Normal/Hard/Nightmare)
   - Treasure chest system
   - Settings (volume, difficulty)
   ================================================================ */
(() => {
"use strict";

/* ─── CONSTANTS ─── */
const W = 4000, H = 4000, SURVIVE = 600, BOSS_TIME = 300;
const ELITE_INTERVAL = 45; // seconds between elite spawns
let _eid = 0;

/* ─── PERSISTENT STORAGE ─── */
const KEYS = {
  scores: "yokai_highscores",
  gold: "yokai_gold",
  meta: "yokai_meta",
  stats: "yokai_stats",
  settings: "yokai_settings",
  unlocks: "yokai_unlocks",
  achievements: "yokai_achievements",
};

/* ─── SUPABASE CONFIG (온라인 리더보드용) ─── */
// 아래 값을 실제 Supabase 프로젝트 정보로 교체하세요
const SUPABASE_CONFIG = {
  url: "YOUR_SUPABASE_URL",      // 예: "https://xxxxx.supabase.co"
  key: "YOUR_SUPABASE_ANON_KEY", // 예: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  table: "leaderboard"          // 테이블명
};

function isOnlineLeaderboardConfigured() {
  return SUPABASE_CONFIG.url !== "YOUR_SUPABASE_URL";
}

/* ─── ONLINE LEADERBOARD ─── */
async function fetchOnlineLeaderboard(difficulty) {
  if (!isOnlineLeaderboardConfigured()) return [];

  try {
    const response = await fetch(
      `${SUPABASE_CONFIG.url}/rest/v1/${SUPABASE_CONFIG.table}?difficulty=eq.${difficulty}&order=time.asc&limit=10`,
      {
        headers: {
          "apikey": SUPABASE_CONFIG.key,
          "Authorization": `Bearer ${SUPABASE_CONFIG.key}`
        }
      }
    );
    if (!response.ok) throw new Error("Failed to fetch");
    return await response.json();
  } catch (e) {
    console.warn("Online leaderboard fetch failed:", e);
    return [];
  }
}

async function submitOnlineScore(name, time, kills, level, difficulty, character) {
  if (!isOnlineLeaderboardConfigured()) return false;

  try {
    const response = await fetch(
      `${SUPABASE_CONFIG.url}/rest/v1/${SUPABASE_CONFIG.table}`,
      {
        method: "POST",
        headers: {
          "apikey": SUPABASE_CONFIG.key,
          "Authorization": `Bearer ${SUPABASE_CONFIG.key}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        },
        body: JSON.stringify({
          name, time, kills, level, difficulty, character,
          created_at: new Date().toISOString()
        })
      }
    );
    return response.ok;
  } catch (e) {
    console.warn("Online score submit failed:", e);
    return false;
  }
}

function _load(key, fallback) {
  try {
    const d = localStorage.getItem(key);
    return d ? JSON.parse(d) : fallback;
  } catch { return fallback; }
}
function _save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

/* high scores */
function loadScores() { return _load(KEYS.scores, []); }
function saveScore(entry) {
  const arr = loadScores();
  const prevBest = arr.length > 0 ? arr[0].time : -1;
  arr.push(entry);
  arr.sort((a, b) => b.time - a.time || b.kills - a.kills);
  if (arr.length > 10) arr.length = 10;
  _save(KEYS.scores, arr);
  return entry.time > prevBest;
}

/* gold */
function loadGold() { return _load(KEYS.gold, 0); }
function saveGold(v) { _save(KEYS.gold, v); }

/* meta upgrade levels */
function loadMeta() { return _load(KEYS.meta, {}); }
function saveMeta(v) { _save(KEYS.meta, v); }

/* cumulative stats */
function loadCStats() {
  return _load(KEYS.stats, {
    totalKills: 0, totalGold: 0, totalRuns: 0, totalTime: 0,
    totalDmg: 0, gamesWon: 0, bossKills: 0, eliteKills: 0, evolvedWeapons: [],
    maxSurvivalTime: 0, highestLevel: 0,
    nightmareMaxTime: 0, seaCleared: 0,
    usedArtifacts: [], synergyCount: 0, unlockedCharacters: [],
  });
}
function saveCStats(v) { _save(KEYS.stats, v); }

/* settings */
function loadSettings() {
  return _load(KEYS.settings, { sfxVol: 50, bgmVol: 30, difficulty: "normal", joySens: 100, map: "bamboo", endless: false, ngPlus: 0 });
}
function saveSettings(v) { _save(KEYS.settings, v); }

/* stage progress */
function loadStageProgress() {
  return _load("yokai_stage", {
    unlockedChapters: [1],
    unlockedStages: ["1-1"],
    stars: {}, // { "1-1": 3 }
    totalStars: 0,
  });
}
function saveStageProgress(v) { _save("yokai_stage", v); }
function getStageStars(stageId) {
  const progress = loadStageProgress();
  return progress.stars[stageId] || 0;
}
function isStageUnlocked(stageId) {
  const progress = loadStageProgress();
  return progress.unlockedStages.includes(stageId);
}
function canUnlockStage(stageId) {
  const stage = STAGES[stageId];
  if (!stage) return false;
  const progress = loadStageProgress();
  if (stage.chapter === 1) return true;
  // Check previous chapter stars
  const prevChapter = CHAPTERS[stage.chapter - 1];
  if (!prevChapter) return false;
  return progress.totalStars >= stage.unlockCost;
}

/* unlocks */
function loadUnlocks() {
  return _load(KEYS.unlocks, { characters: ["exorcist", "shaman"] });
}
function saveUnlocks(v) { _save(KEYS.unlocks, v); }

/* achievements */
function loadAchievements() {
  return _load(KEYS.achievements, {});
}
function saveAchievements(v) { _save(KEYS.achievements, v); }

function showBestRecord() {
  const el = document.getElementById("best-record");
  if (!el) return;
  const arr = loadScores();
  if (!arr.length) { el.textContent = ""; return; }
  const b = arr[0];
  const m = Math.floor(b.time / 60), s = Math.floor(b.time % 60);
  el.textContent = `최고 기록: ${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} | ${b.kills} KILLS | Lv ${b.level}`;
}

/* ─── BGM DEFINITIONS ─── */
// 실제 BGM 파일 경로 (게임 음원 폴더 기준)
const BGM_FILES = {
  menu: "Before_the_Map_Unfolds.mp3",
  gameStart: "Before_The_First_Blade.mp3",
  battleEarly: "The_Last_Life.mp3",
  battleMid: "The_Iron_Toll.mp3",
  battleLate: "Siege_of_the_Thousand_Eyes.mp3",
  elite: "Midnight_Mask_Parade.mp3",
  magic: "Sugar_Spun_Cannonade.mp3",
  boss: "The_Gatekeeper_s_Wait.mp3",
  bossAction: "Blade_Against_the_Throne.mp3",
  final: "The_Last_Breach.mp3",
  hpDanger: "One_Heart_Remaining.mp3",
  victory: "Throne_of_the_Setting_Sun.mp3",
  shop: "Hearth_and_Anvil.mp3",
};

const BGM_BASE_PATH = "게임 음원/";  // game.js 기준 (같은 디렉토리)

/* ─── AUDIO ─── */
class Sfx {
  constructor() {
    this.ac = null; this.g = null; this.on = true; this.sfxVol = 0.5; this.bgmVol = 0.3;
    this.bgmPlaying = false; this.bgmTimer = null; this.currentBgm = null; this.bgmAudio = null;
    this.bgmLoaded = {};
  }
  init() {
    if (this.ac) return;
    try {
      this.ac = new (window.AudioContext || window.webkitAudioContext);
      this.g = this.ac.createGain();
      this.g.gain.value = this.sfxVol * 0.5;
      this.g.connect(this.ac.destination);
      this.bgmGain = this.ac.createGain();
      this.bgmGain.gain.value = this.bgmVol * 0.5;
      this.bgmGain.connect(this.ac.destination);
    } catch {}
  }
  resume() { if (this.ac && this.ac.state === "suspended") this.ac.resume(); }
  setSfxVol(v) { this.sfxVol = v; if (this.g) this.g.gain.value = v * 0.5; }
  setBgmVol(v) { this.bgmVol = v; if (this.bgmGain) this.bgmGain.gain.value = v * 0.5; }

  _t(d, f0, f1, tp, v, useBgm) {
    if (!this.ac || !this.on) return;
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = tp;
    o.frequency.setValueAtTime(f0, this.ac.currentTime);
    o.frequency.linearRampToValueAtTime(f1, this.ac.currentTime + d);
    g.gain.setValueAtTime(v, this.ac.currentTime);
    g.gain.linearRampToValueAtTime(0, this.ac.currentTime + d);
    o.connect(g);
    g.connect(useBgm ? this.bgmGain : this.g);
    o.start(); o.stop(this.ac.currentTime + d);
  }
  _n(d, freq, v) {
    if (!this.ac || !this.on) return;
    const n = this.ac.sampleRate * d;
    const buf = this.ac.createBuffer(1, n, this.ac.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
    const s = this.ac.createBufferSource(); s.buffer = buf;
    const f = this.ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq;
    const g = this.ac.createGain();
    g.gain.setValueAtTime(v, this.ac.currentTime);
    g.gain.linearRampToValueAtTime(0, this.ac.currentTime + d);
    s.connect(f); f.connect(g); g.connect(this.g); s.start();
  }

  hit() { this._n(0.04, 900, 0.08); }
  kill() { this._t(0.07, 220, 80, "square", 0.12); }
  xp() { this._t(0.04, 1200, 1600, "sine", 0.06); }
  lvl() {
    this._t(0.15, 400, 800, "sine", 0.18);
    setTimeout(() => this._t(0.15, 600, 1200, "sine", 0.13), 100);
    setTimeout(() => this._t(0.2, 800, 1600, "sine", 0.1), 200);
  }
  dmg() { this._n(0.1, 220, 0.18); }
  boss() { this._t(0.5, 80, 40, "sawtooth", 0.22); }
  win() { [0, 100, 200, 300, 450].forEach((d, i) => setTimeout(() => this._t(0.2, 400 + i * 120, 600 + i * 120, "sine", 0.14), d)); }
  synth() { this._t(0.2, 200, 600, "sine", 0.2); setTimeout(() => this._t(0.2, 400, 1000, "sine", 0.15), 150); setTimeout(() => this._t(0.3, 600, 1400, "sine", 0.12), 300); }
  talisman() { this._t(0.12, 600, 1200, "sine", 0.1); }
  allure() { this._t(0.3, 300, 150, "sine", 0.08); }
  coin() { this._t(0.05, 1400, 1800, "sine", 0.04); }
  chest() { this._t(0.15, 600, 1400, "sine", 0.15); setTimeout(() => this._t(0.15, 800, 1600, "sine", 0.12), 100); }
  announce() { this._t(0.12, 500, 700, "triangle", 0.08); }
  knockback() { this._n(0.06, 400, 0.1); }
  powerup() { this._t(0.2, 400, 1200, "sine", 0.15); setTimeout(() => this._t(0.2, 600, 1400, "sine", 0.12), 100); }
  levelup() { this._t(0.15, 500, 1500, "sine", 0.18); setTimeout(() => this._t(0.15, 700, 1800, "sine", 0.15), 150); setTimeout(() => this._t(0.2, 900, 2000, "sine", 0.12), 300); }
  heal() { this._t(0.1, 800, 1200, "sine", 0.08); setTimeout(() => this._t(0.1, 1000, 1400, "sine", 0.06), 80); }
  shield() { this._t(0.15, 300, 600, "triangle", 0.12); }
  crit() { this._t(0.1, 1500, 2500, "square", 0.1); }
  pickup() { this._t(0.06, 1000, 1500, "sine", 0.07); }
  revive() { this._t(0.3, 300, 800, "sine", 0.15); setTimeout(() => this._t(0.3, 500, 1200, "sine", 0.12), 150); setTimeout(() => this._t(0.4, 700, 1600, "sine", 0.1), 300); }
  combo() { this._t(0.08, 800, 1400, "triangle", 0.1); setTimeout(() => this._t(0.08, 1200, 1800, "triangle", 0.08), 80); }
  wpn(t) {
    if (t === "blade" || t === "ghostSlash") this._t(0.04, 320, 200, "sawtooth", 0.06);
    else if (t === "fire" || t === "ghostFlame") this._n(0.06, 1100, 0.08);
    else if (t === "lightning" || t === "thunderIce") this._t(0.03, 2200, 120, "square", 0.1);
    else if (t === "frost") this._t(0.08, 800, 380, "triangle", 0.06);
    else if (t === "curseMist") this._t(0.1, 180, 120, "triangle", 0.06);
    else if (t === "aura") this._t(0.06, 160, 260, "sine", 0.04);
    else if (t === "beads" || t === "divineWind") this._t(0.05, 700, 1100, "sine", 0.05);
    else if (t === "windSpirit") this._n(0.08, 600, 0.07);
    else if (t === "scythe" || t === "deathQuake") this._t(0.08, 180, 80, "sawtooth", 0.1);
    else if (t === "quake") { this._n(0.12, 200, 0.14); this._t(0.08, 60, 30, "square", 0.08); }
    else if (t === "trident" || t === "tidalStorm") this._t(0.06, 500, 900, "triangle", 0.08);
  }

  bgmStart(type = "battleEarly") {
    if (!this.ac) return;
    this.playBgm(type);
  }

  async playBgm(type) {
    if (!this.on) return;

    // Stop ALL previously loaded BGM to prevent multiple sounds playing
    for (const key in this.bgmLoaded) {
      const audio = this.bgmLoaded[key];
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    }

    // Stop current BGM
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio = null;
    }
    if (this.bgmTimer) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }

    // Get BGM file
    const bgmFile = BGM_FILES[type];
    if (!bgmFile) return;

    // Check if already loaded
    if (!this.bgmLoaded[type]) {
      try {
        // Create audio element
        const audio = new Audio(BGM_BASE_PATH + bgmFile);
        audio.loop = true;
        audio.volume = this.bgmVol * 0.5;

        // Load and play
        await audio.play().catch(() => {}); // Auto-play

        this.bgmLoaded[type] = audio;
        this.bgmAudio = audio;
        this.bgmPlaying = true;
        this.currentBgm = type;
      } catch (e) {
        console.warn("BGM load failed:", bgmFile, e);
      }
    } else {
      // Use cached audio
      this.bgmAudio = this.bgmLoaded[type];
      this.bgmAudio.currentTime = 0;
      this.bgmAudio.volume = this.bgmVol * 0.5;
      this.bgmAudio.play().catch(() => {});
      this.bgmPlaying = true;
      this.currentBgm = type;
    }
  }

  bgmStop() {
    this.bgmPlaying = false;
    if (this.bgmTimer) clearTimeout(this.bgmTimer);
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio = null;
    }
  }

  bgmSetVolume(v) {
    this.bgmVol = v;
    if (this.bgmAudio) this.bgmAudio.volume = v * 0.5;
  }
}

/* ─── VISUAL EFFECTS SYSTEM ─── */
class VFX {
  constructor() {
    this.particles = [];
    this.damageNumbers = [];
    this.screenShake = { x: 0, y: 0, intensity: 0, decay: 0.9 };
    this.hitSparks = [];
    this.pickups = [];
    this.weaponTrails = [];
    this.bloodSplats = [];
  }

  reset() {
    this.particles = [];
    this.damageNumbers = [];
    this.hitSparks = [];
    this.pickups = [];
    this.weaponTrails = [];
    this.bloodSplats = [];
    this.screenShake = { x: 0, y: 0, intensity: 0, decay: 0.9 };
  }

  /* ── SCREEN SHAKE ── */
  shake(intensity = 10, decay = 0.85) {
    this.screenShake.intensity = max(this.screenShake.intensity, intensity);
    this.screenShake.decay = decay;
  }

  updateShake() {
    if (this.screenShake.intensity > 0.1) {
      this.screenShake.x = rand(-1, 1) * this.screenShake.intensity;
      this.screenShake.y = rand(-1, 1) * this.screenShake.intensity;
      this.screenShake.intensity *= this.screenShake.decay;
    } else {
      this.screenShake.x = 0;
      this.screenShake.y = 0;
      this.screenShake.intensity = 0;
    }
  }

  /* ── DAMAGE NUMBERS ── */
  addDamage(x, y, dmg, isCrit = false, isKill = false) {
    this.damageNumbers.push({
      x, y,
      dmg: floor(dmg),
      isCrit,
      isKill,
      life: 1.2,
      maxLife: 1.2,
      vy: isCrit ? -90 : -60,
      vx: rand(-20, 20),
      scale: isCrit ? 1.5 : 1,
      rotation: rand(-0.2, 0.2),
    });
  }

  updateDamageNumbers(dt) {
    for (const d of this.damageNumbers) {
      d.life -= dt;
      d.y += d.vy * dt;
      d.x += d.vx * dt;
      d.vy *= 0.98;
      d.vx *= 0.95;
    }
    this.damageNumbers = this.damageNumbers.filter(d => d.life > 0);
  }

  /* ── PARTICLES ── */
  addParticle(x, y, config) {
    const p = {
      x, y,
      vx: config.vx || rand(-50, 50),
      vy: config.vy || rand(-50, 50),
      life: config.life || 1,
      maxLife: config.life || 1,
      r: config.r || rand(2, 5),
      col: config.col || "#fff",
      grav: config.grav || 0,
      fade: config.fade !== false,
      blend: config.blend || "source-over",
      count: config.count || 1,
    };
    for (let i = 0; i < p.count; i++) {
      this.particles.push({
        ...p,
        vx: (config.vx || rand(-50, 50)) + rand(-20, 20),
        vy: (config.vy || rand(-50, 50)) + rand(-20, 20),
      });
    }
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
      p.vx *= 0.99;
    }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  /* ── HIT SPARKS ── */
  addHitSpark(x, y, color = "#fff", count = 5) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const spd = rand(80, 200);
      this.hitSparks.push({
        x, y,
        vx: cos(a) * spd,
        vy: sin(a) * spd,
        life: rand(0.15, 0.35),
        maxLife: 0.35,
        r: rand(1, 3),
        col: color,
      });
    }
  }

  updateHitSparks(dt) {
    for (const s of this.hitSparks) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.95;
      s.vy *= 0.95;
    }
    this.hitSparks = this.hitSparks.filter(s => s.life > 0);
  }

  /* ── PICKUPS ── */
  addPickup(x, y, type, value) {
    this.pickups.push({
      x, y,
      type, // "gold" or "xp"
      value,
      life: 2,
      maxLife: 2,
      startY: y,
      hover: 0,
    });
  }

  updatePickups(dt) {
    for (const p of this.pickups) {
      p.life -= dt;
      p.hover += dt * 3;
    }
    this.pickups = this.pickups.filter(p => p.life > 0);
  }

  /* ── WEAPON TRAILS ── */
  addWeaponTrail(x, y, weaponType, angle) {
    const colors = {
      blade: "#b0bec5",
      fire: "#ff9800",
      ghostFlame: "#ff6d00",
      lightning: "#00e5ff",
      thunderIce: "#80deea",
      frost: "#80deea",
      curseMist: "#9c27b0",
      aura: "#ce93d8",
      beads: "#ffd54f",
      divineWind: "#81c784",
      windSpirit: "#b0bec5",
      scythe: "#90a4ae",
      deathQuake: "#78909c",
      quake: "#8d6e63",
      trident: "#4fc3f7",
      tidalStorm: "#29b6f6",
    };
    this.weaponTrails.push({
      x, y,
      angle,
      weaponType,
      col: colors[weaponType] || "#fff",
      life: 0.3,
      maxLife: 0.3,
      len: rand(20, 40),
    });
  }

  updateWeaponTrails(dt) {
    for (const t of this.weaponTrails) {
      t.life -= dt;
    }
    this.weaponTrails = this.weaponTrails.filter(t => t.life > 0);
  }

  /* ── BLOOD SPLAT ── */
  addBloodSplat(x, y, size = 1) {
    this.bloodSplats.push({
      x, y,
      size,
      life: 3,
      maxLife: 3,
    });
  }

  updateBloodSplats(dt) {
    for (const b of this.bloodSplats) {
      b.life -= dt;
    }
    this.bloodSplats = this.bloodSplats.filter(b => b.life > 0);
  }

  /* ── UPDATE ALL ── */
  update(dt) {
    this.updateShake();
    this.updateDamageNumbers(dt);
    this.updateParticles(dt);
    this.updateHitSparks(dt);
    this.updatePickups(dt);
    this.updateWeaponTrails(dt);
    this.updateBloodSplats(dt);
  }
}

/* ─── MATH ─── */
const sqrt = Math.sqrt, atan2 = Math.atan2, cos = Math.cos, sin = Math.sin;
const abs = Math.abs, min = Math.min, max = Math.max, PI = Math.PI, TAU = PI * 2, floor = Math.floor;
function dist(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return sqrt(dx * dx + dy * dy); }
function norm(x, y) { const l = sqrt(x * x + y * y) || 1; return [x / l, y / l]; }
function rand(a, b) { return Math.random() * (b - a) + a; }
function rInt(a, b) { return floor(rand(a, b + 1)); }
function pick(a) { return a[floor(Math.random() * a.length)]; }
function clamp(v, lo, hi) { return max(lo, min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

/* ─── CHARACTER DEFINITIONS ─── */
const CHARACTERS = {
  exorcist: {
    name: "퇴마사", desc: "균형잡힌 능력치의 기본 캐릭터",
    icon: "🗡️", startWeapon: "blade",
    hp: 100, spd: 2.8, armor: 0, magnetR: 80,
    dmgMul: 1, cdMul: 1, xpMul: 1,
    passive: null, unlocked: true,
    unlockDesc: "기본 캐릭터",
  },
  shaman: {
    name: "무녀", desc: "높은 경험치 획득률. 부적불꽃으로 시작",
    icon: "🏮", startWeapon: "fire",
    hp: 80, spd: 2.6, armor: 0, magnetR: 100,
    dmgMul: 0.9, cdMul: 0.95, xpMul: 1.3,
    passive: null, unlocked: true,
    unlockDesc: "기본 캐릭터",
  },
  taoist: {
    name: "도사", desc: "높은 방어력과 체력. 빙결파동으로 시작",
    icon: "☯️", startWeapon: "frost",
    hp: 150, spd: 2.4, armor: 3, magnetR: 70,
    dmgMul: 0.85, cdMul: 1.1, xpMul: 1,
    passive: null, unlocked: false,
    unlockDesc: "누적 500 처치 달성",
    unlockCheck: (s) => s.totalKills >= 500,
  },
  hunter: {
    name: "사냥꾼", desc: "빠른 이동과 공격. 번개부로 시작",
    icon: "🏹", startWeapon: "lightning",
    hp: 70, spd: 3.5, armor: 0, magnetR: 90,
    dmgMul: 1.15, cdMul: 0.85, xpMul: 1,
    passive: null, unlocked: false,
    unlockDesc: "10분 생존 클리어",
    unlockCheck: (s) => s.gamesWon >= 1,
  },
  monk: {
    name: "승려", desc: "강력한 근접 전투. 혼령장으로 시작",
    icon: "📿", startWeapon: "aura",
    hp: 120, spd: 2.6, armor: 2, magnetR: 60,
    dmgMul: 1.2, cdMul: 1.05, xpMul: 0.9,
    passive: null, unlocked: false,
    unlockDesc: "무기 진화 1회 달성",
    unlockCheck: (s) => s.evolvedWeapons && s.evolvedWeapons.length >= 1,
  },
  foxSpirit: {
    name: "반요", desc: "HP가 낮을수록 공격력 증가. 저주안개로 시작",
    icon: "🦊", startWeapon: "curseMist",
    hp: 60, spd: 3.0, armor: 0, magnetR: 100,
    dmgMul: 1, cdMul: 1, xpMul: 1.1,
    passive: "lowHpBoost", unlocked: false,
    unlockDesc: "구미호 보스 처치",
    unlockCheck: (s) => s.bossKills >= 1,
  },
  reaper: {
    name: "저승사자", desc: "처치 시 일정 확률로 즉사 효과. 사신낫으로 시작",
    icon: "💀", startWeapon: "scythe",
    hp: 85, spd: 3.2, armor: 1, magnetR: 70,
    dmgMul: 1.1, cdMul: 0.9, xpMul: 0.85,
    passive: "executeChance", unlocked: false,
    unlockDesc: "악몽 난이도 3분 생존",
    unlockCheck: (s) => s.nightmareMaxTime >= 180,
  },
  mountainGod: {
    name: "산신령", desc: "시간 경과에 따라 점점 강해진다. 지진파로 시작",
    icon: "⛰️", startWeapon: "quake",
    hp: 130, spd: 2.2, armor: 4, magnetR: 60,
    dmgMul: 0.8, cdMul: 1.15, xpMul: 1,
    passive: "growingPower", unlocked: false,
    unlockDesc: "누적 1000 처치 달성",
    unlockCheck: (s) => s.totalKills >= 1000,
  },
  seaDiver: {
    name: "해녀", desc: "물 근처에서 능력 강화. 해류창으로 시작",
    icon: "🧜", startWeapon: "trident",
    hp: 90, spd: 2.9, armor: 0, magnetR: 120,
    dmgMul: 1.05, cdMul: 1, xpMul: 1.15,
    passive: "waterAffinity", unlocked: false,
    unlockDesc: "바다 맵에서 클리어",
    unlockCheck: (s) => s.seaCleared >= 1,
  },
};

/* ─── NEW ENEMIES (Expansion) ─── */
const ETYPES = {
  // 기본 적들 (1-2 스테이지)
  dokkaebi:  { name: "도깨비",   hp: 25,  spd: 1.0, r: 13, col: "#e65100", xp: 1,  dmg: 10, goldMin: 0, goldMax: 1 },
  wisp:      { name: "쥐불",     hp: 12,  spd: 2.5, r: 8,  col: "#00e5ff", xp: 1,  dmg: 6,  goldMin: 0, goldMax: 0 },
  shadow:    { name: "그림자",   hp: 20,  spd: 1.5, r: 10, col: "#37474f", xp: 2,  dmg: 8,  goldMin: 0, goldMax: 1 },
  skeleton:  { name: "해골병사", hp: 50,  spd: 0.9, r: 14, col: "#efebe9", xp: 3,  dmg: 12, goldMin: 1, goldMax: 2 },
  ghost:     { name: "처녀귀신", hp: 35,  spd: 1.1, r: 12, col: "#e8eaf6", xp: 4,  dmg: 18, goldMin: 1, goldMax: 3 },
  bulgasari: { name: "불가사리", hp: 100, spd: 0.55, r: 18, col: "#78909c", xp: 5,  dmg: 15, goldMin: 3, goldMax: 6 },
  jangsan:   { name: "장산범",   hp: 40,  spd: 1.6, r: 15, col: "#ff8a65", xp: 3,  dmg: 16, goldMin: 1, goldMax: 2 },

  // 중급 적들 (2-3 스테이지)
  goblin:    { name: "고블린",   hp: 30,  spd: 1.8, r: 10, col: "#8d6e63", xp: 2,  dmg: 14, goldMin: 1, goldMax: 2 },
  wetGhost:  { name: "물귀신",   hp: 45,  spd: 1.2, r: 11, col: "#4dd0e1", xp: 5,  dmg: 20, goldMin: 2, goldMax: 4 },
  fireEnt:   { name: "불꽃정령", hp: 80,  spd: 0.8, r: 16, col: "#ff5722", xp: 6,  dmg: 22, goldMin: 3, goldMax: 5 },
  tombKeeper: { name: "무덤지기", hp: 120, spd: 0.7, r: 17, col: "#455a64", xp: 7,  dmg: 18, goldMin: 4, goldMax: 7 },
  plagueRat: { name: "역병쥐",   hp: 35,  spd: 2.0, r: 9,  col: "#827717", xp: 4,  dmg: 14, goldMin: 2, goldMax: 3 },

  // 고급 적들 (3-4 스테이지)
  demonKnight: { name: "악마기사", hp: 150, spd: 0.9, r: 16, col: "#c62828", xp: 8, dmg: 25, goldMin: 5, goldMax: 8, elite: true },
  soulSiphon:  { name: "영혼흡수자", hp: 100, spd: 1.1, r: 14, col: "#6a1b9a", xp: 7, dmg: 20, goldMin: 4, goldMax: 6 },
  iceGolem:    { name: "얼음골렘", hp: 200, spd: 0.5, r: 20, col: "#80deea", xp: 9, dmg: 28, goldMin: 5, goldMax: 9, elite: true },
  ghostKing:   { name: "귀왕",   hp: 180, spd: 0.8, r: 18, col: "#4a148c", xp: 10, dmg: 30, goldMin: 6, goldMax: 10 },

  // 보스 적들
  dokkaKing: { name: "도깨비왕", hp: 800, spd: 1.0, r: 35, col: "#ff6f00", xp: 50, dmg: 35, goldMin: 30, goldMax: 50, boss: true },
  haetae:    { name: "해태",     hp: 1000, spd: 0.7, r: 38, col: "#5d4037", xp: 60, dmg: 40, goldMin: 40, goldMax: 60, boss: true },
  imugi:     { name: "이무기",   hp: 900, spd: 1.3, r: 32, col: "#1b5e20", xp: 55, dmg: 38, goldMin: 35, goldMax: 55, boss: true },
  gumiho:    { name: "구미호",   hp: 1200, spd: 1.5, r: 30, col: "#e91e63", xp: 70, dmg: 45, goldMin: 50, goldMax: 80, boss: true },

  // 신규 적들 (확장)
  snakeSpirit: { name: "뱀精", hp: 45, spd: 1.4, r: 12, col: "#7cb342", xp: 4, dmg: 16, goldMin: 1, goldMax: 3 },
  crowTsukuyomi: { name: "달乌鸦", hp: 60, spd: 2.2, r: 11, col: "#263238", xp: 5, dmg: 18, goldMin: 2, goldMax: 4 },
  kappa: { name: "카파", hp: 70, spd: 1.3, r: 14, col: "#66bb6a", xp: 4, dmg: 20, goldMin: 2, goldMax: 5 },
  oni: { name: "오니", hp: 140, spd: 1.0, r: 18, col: "#d32f2f", xp: 8, dmg: 28, goldMin: 5, goldMax: 8, elite: true },
  yokaiLord: { name: "요괴lord", hp: 1500, spd: 0.9, r: 40, col: "#311b92", xp: 80, dmg: 50, goldMin: 60, goldMax: 100, boss: true },
};

// 적 생성 테이블 - 스테이지별 다양화
const SPAWN_TBL = [
  // 0-2분: 기본 적들
  { t: 0,   types: ["dokkaebi", "shadow"] },
  { t: 45,  types: ["dokkaebi", "wisp", "goblin"] },
  { t: 90,  types: ["dokkaebi", "wisp", "skeleton", "goblin"] },
  { t: 135, types: ["dokkaebi", "wisp", "bulgasari", "skeleton"] },
  // 2-4분: 중급 적들 추가
  { t: 180, types: ["wisp", "skeleton", "ghost", "goblin", "wetGhost"] },
  { t: 225, types: ["skeleton", "ghost", "bulgasari", "wetGhost", "jangsan"] },
  { t: 270, types: ["ghost", "jangsan", "bulgasari", "wetGhost", "fireEnt"] },
  // 4-6분: 고급 적들 추가
  { t: 315, types: ["ghost", "fireEnt", "tombKeeper", "goblin", "wetGhost"] },
  { t: 360, types: ["tombKeeper", "fireEnt", "plagueRat", "demonKnight", "soulSiphon"] },
  { t: 405, types: ["demonKnight", "soulSiphon", "iceGolem", "plagueRat", "fireEnt"] },
  // 6-8분: 강적들
  { t: 450, types: ["demonKnight", "soulSiphon", "iceGolem", "ghost", "tombKeeper"] },
  { t: 495, types: ["iceGolem", "soulSiphon", "plagueRat", "ghostKing", "wetGhost"] },
  // 8-10분: 보스 &终极
  { t: 540, types: ["demonKnight", "iceGolem", "ghostKing", "plagueRat", "fireEnt"] },
  { t: 570, types: ["iceGolem", "ghostKing", "imugi", "dokkaKing", "haetae"] },
];

// 적 강도 스케일링 - 시간에 따라 증가
const ENEMY_SCALING = {
  hpScale: 1.0,      // hp 증가율 (분당)
  dmgScale: 1.0,     // 데미지 증가율 (분당)
  spawnScale: 1.0,   // 생성 수 증가율 (분당)
  eliteChance: 0.03, // 엘리트 확률 (시간에 따라 증가)
};

const WAVE_NAMES = [
  { t: 0,   text: "🌙 요괴야행 시작" },
  { t: 45,  text: "👺 고블린 출현!" },
  { t: 90,  text: "💀 해골병사 출현!" },
  { t: 135, text: "🪨 불가사리 출현!" },
  { t: 180, text: "👻 처녀귀신 · 물귀신 출현!" },
  { t: 225, text: "🔥 불꽃정령 · 장산범 출현!" },
  { t: 270, text: "⚔️ 악마기사 출현!" },
  { t: 315, text: "🧊 얼음골렘 · 영혼흡수자!" },
  { t: 360, text: "👹 강적들 출현!" },
  { t: 405, text: "⚠️ 엘리트 적 출현!" },
  { t: 450, text: "🌪️ 대규모 습격!" },
  { t: 540, text: "🐉 보스 등장!" },
];

/* ─── WEAPON DEFINITIONS ─── */
const WDEFS = {
  blade: {
    name: "퇴마검", desc: "플레이어 주위를 회전하는 퇴마검",
    icon: "⚔️", col: "#ffd54f", attr: "yang", maxLv: 8,
    lvs: [
      { cnt: 1, dmg: 10, rad: 60, spd: 2 },    { cnt: 2, dmg: 13, rad: 65, spd: 2.2 },
      { cnt: 3, dmg: 16, rad: 70, spd: 2.5 },   { cnt: 3, dmg: 20, rad: 80, spd: 2.7 },
      { cnt: 4, dmg: 24, rad: 85, spd: 3 },     { cnt: 5, dmg: 28, rad: 92, spd: 3.2 },
      { cnt: 5, dmg: 34, rad: 100, spd: 3.4 },   { cnt: 6, dmg: 42, rad: 112, spd: 3.6 },
    ],
  },
  fire: {
    name: "부적불꽃", desc: "가장 가까운 적에게 부적 불꽃 발사",
    icon: "🔥", col: "#ff9800", attr: "yang", maxLv: 8,
    lvs: [
      { dmg: 15, cd: 1200, spd: 4.5, cnt: 1, prc: 1 }, { dmg: 18, cd: 1100, spd: 5, cnt: 1, prc: 1 },
      { dmg: 22, cd: 1000, spd: 5, cnt: 2, prc: 1 },   { dmg: 26, cd: 900, spd: 5.5, cnt: 2, prc: 2 },
      { dmg: 32, cd: 800, spd: 5.5, cnt: 3, prc: 2 },  { dmg: 38, cd: 700, spd: 6, cnt: 3, prc: 3 },
      { dmg: 45, cd: 600, spd: 6.5, cnt: 4, prc: 3 },  { dmg: 55, cd: 500, spd: 7, cnt: 4, prc: 4 },
    ],
  },
  lightning: {
    name: "번개부", desc: "랜덤 적에게 번개 낙뢰",
    icon: "⚡", col: "#ffeb3b", attr: "yang", maxLv: 8,
    lvs: [
      { dmg: 28, cd: 2000, st: 1 }, { dmg: 33, cd: 1800, st: 1 }, { dmg: 38, cd: 1600, st: 2 },
      { dmg: 45, cd: 1400, st: 2 }, { dmg: 55, cd: 1200, st: 3 }, { dmg: 65, cd: 1000, st: 3 },
      { dmg: 78, cd: 900, st: 4 },  { dmg: 95, cd: 800, st: 5 },
    ],
  },
  frost: {
    name: "빙결파동", desc: "주변 적을 얼려 느리게 만듦",
    icon: "❄️", col: "#80deea", attr: "yin", maxLv: 8,
    lvs: [
      { dmg: 8, cd: 3000, rad: 80, slow: 0.5, dur: 2000 },    { dmg: 10, cd: 2800, rad: 92, slow: 0.45, dur: 2200 },
      { dmg: 13, cd: 2600, rad: 105, slow: 0.4, dur: 2500 },   { dmg: 16, cd: 2400, rad: 118, slow: 0.35, dur: 2700 },
      { dmg: 20, cd: 2200, rad: 132, slow: 0.3, dur: 3000 },   { dmg: 24, cd: 2000, rad: 150, slow: 0.25, dur: 3200 },
      { dmg: 30, cd: 1800, rad: 170, slow: 0.2, dur: 3500 },   { dmg: 38, cd: 1500, rad: 200, slow: 0.15, dur: 4000 },
    ],
  },
  curseMist: {
    name: "저주안개", desc: "독안개를 퍼뜨려 지속 피해",
    icon: "🌫️", col: "#7e57c2", attr: "yin", maxLv: 8,
    lvs: [
      { dmg: 4, cd: 2500, rad: 50, dur: 3, cnt: 1, tick: 400 },    { dmg: 5, cd: 2300, rad: 55, dur: 3.2, cnt: 1, tick: 380 },
      { dmg: 6, cd: 2100, rad: 62, dur: 3.5, cnt: 2, tick: 360 },  { dmg: 8, cd: 1900, rad: 68, dur: 3.8, cnt: 2, tick: 340 },
      { dmg: 10, cd: 1700, rad: 75, dur: 4, cnt: 2, tick: 320 },   { dmg: 12, cd: 1500, rad: 82, dur: 4.3, cnt: 3, tick: 300 },
      { dmg: 15, cd: 1300, rad: 90, dur: 4.5, cnt: 3, tick: 280 }, { dmg: 18, cd: 1100, rad: 100, dur: 5, cnt: 3, tick: 250 },
    ],
  },
  aura: {
    name: "혼령장", desc: "접촉한 적에게 지속 피해",
    icon: "🔮", col: "#ce93d8", attr: "yin", maxLv: 8,
    lvs: [
      { dmg: 5, rad: 50, tick: 500 },   { dmg: 7, rad: 56, tick: 450 },  { dmg: 9, rad: 62, tick: 400 },
      { dmg: 11, rad: 72, tick: 380 },   { dmg: 14, rad: 82, tick: 350 }, { dmg: 17, rad: 94, tick: 300 },
      { dmg: 21, rad: 108, tick: 280 },  { dmg: 26, rad: 124, tick: 250 },
    ],
  },
  beads: {
    name: "염주", desc: "넓은 궤도로 도는 기도 구슬",
    icon: "📿", col: "#ffcc80", attr: "yang", maxLv: 8,
    lvs: [
      { cnt: 2, dmg: 8, rad: 95, spd: 1.5 },   { cnt: 3, dmg: 11, rad: 100, spd: 1.7 },
      { cnt: 3, dmg: 14, rad: 108, spd: 1.9 },  { cnt: 4, dmg: 17, rad: 115, spd: 2.1 },
      { cnt: 5, dmg: 21, rad: 122, spd: 2.3 },  { cnt: 5, dmg: 26, rad: 128, spd: 2.5 },
      { cnt: 6, dmg: 32, rad: 135, spd: 2.7 },  { cnt: 7, dmg: 38, rad: 142, spd: 2.9 },
    ],
  },
  windSpirit: {
    name: "풍백", desc: "주변 적을 밀어내며 피해를 줌",
    icon: "🌪️", col: "#b0bec5", attr: "yin", maxLv: 8,
    lvs: [
      { dmg: 10, cd: 3200, rad: 90, kb: 70 },     { dmg: 13, cd: 3000, rad: 100, kb: 85 },
      { dmg: 16, cd: 2700, rad: 112, kb: 100 },    { dmg: 20, cd: 2400, rad: 125, kb: 115 },
      { dmg: 24, cd: 2100, rad: 140, kb: 130 },    { dmg: 28, cd: 1900, rad: 155, kb: 145 },
      { dmg: 33, cd: 1700, rad: 170, kb: 160 },    { dmg: 40, cd: 1500, rad: 190, kb: 180 },
    ],
  },
  scythe: {
    name: "사신낫", desc: "전방 호를 그리는 거대한 낫 일격",
    icon: "🌙", col: "#b388ff", attr: "yin", maxLv: 8,
    lvs: [
      { dmg: 22, cd: 1600, arc: 1.8, rad: 70 },    { dmg: 27, cd: 1500, arc: 2.0, rad: 78 },
      { dmg: 32, cd: 1400, arc: 2.2, rad: 85 },    { dmg: 38, cd: 1300, arc: 2.4, rad: 92 },
      { dmg: 45, cd: 1200, arc: 2.6, rad: 100 },   { dmg: 52, cd: 1100, arc: 2.8, rad: 108 },
      { dmg: 60, cd: 1000, arc: 3.0, rad: 118 },   { dmg: 72, cd: 900, arc: 3.2, rad: 130 },
    ],
  },
  quake: {
    name: "지진파", desc: "땅을 내려쳐 주변에 충격파를 일으킴",
    icon: "🌋", col: "#8d6e63", attr: "yang", maxLv: 8,
    lvs: [
      { dmg: 18, cd: 2800, rad: 100, stunT: 0.5 }, { dmg: 22, cd: 2600, rad: 112, stunT: 0.6 },
      { dmg: 27, cd: 2400, rad: 125, stunT: 0.7 }, { dmg: 32, cd: 2200, rad: 140, stunT: 0.8 },
      { dmg: 38, cd: 2000, rad: 155, stunT: 0.9 }, { dmg: 44, cd: 1800, rad: 170, stunT: 1.0 },
      { dmg: 52, cd: 1600, rad: 188, stunT: 1.1 }, { dmg: 62, cd: 1400, rad: 210, stunT: 1.3 },
    ],
  },
  trident: {
    name: "해류창", desc: "관통하는 물줄기를 발사",
    icon: "🔱", col: "#29b6f6", attr: "yang", maxLv: 8,
    lvs: [
      { dmg: 20, cd: 1300, spd: 5.5, cnt: 1, prc: 3 }, { dmg: 24, cd: 1200, spd: 5.8, cnt: 1, prc: 3 },
      { dmg: 28, cd: 1100, spd: 6.0, cnt: 2, prc: 4 }, { dmg: 33, cd: 1000, spd: 6.3, cnt: 2, prc: 4 },
      { dmg: 40, cd: 900, spd: 6.6, cnt: 2, prc: 5 },  { dmg: 48, cd: 800, spd: 7.0, cnt: 3, prc: 5 },
      { dmg: 56, cd: 700, spd: 7.5, cnt: 3, prc: 6 },  { dmg: 68, cd: 600, spd: 8.0, cnt: 3, prc: 8 },
    ],
  },
  // New weapons expansion
  kunai: {
    name: "쿠나이", desc: "빠른 속도의 표기投射",
    icon: "🗡️", col: "#607d8b", attr: "yang", maxLv: 8,
    lvs: [
      { dmg: 12, cd: 600, spd: 8, cnt: 1, prc: 2 }, { dmg: 15, cd: 550, spd: 8.5, cnt: 1, prc: 2 },
      { dmg: 18, cd: 500, spd: 9, cnt: 2, prc: 3 }, { dmg: 22, cd: 450, spd: 9.5, cnt: 2, prc: 3 },
      { dmg: 27, cd: 400, spd: 10, cnt: 3, prc: 4 }, { dmg: 32, cd: 350, spd: 11, cnt: 3, prc: 4 },
      { dmg: 38, cd: 300, spd: 12, cnt: 4, prc: 5 }, { dmg: 45, cd: 250, spd: 13, cnt: 4, prc: 6 },
    ],
  },
  dragonBreath: {
    name: "용숨", desc: "화염을 뿜어내는 용의 숨결",
    icon: "🐉", col: "#ff5722", attr: "yang", maxLv: 8,
    lvs: [
      { dmg: 15, cd: 2500, rad: 60, dur: 1.5 }, { dmg: 18, cd: 2300, rad: 70, dur: 1.6 },
      { dmg: 22, cd: 2100, rad: 80, dur: 1.7 }, { dmg: 26, cd: 1900, rad: 90, dur: 1.8 },
      { dmg: 32, cd: 1700, rad: 100, dur: 2.0 }, { dmg: 38, cd: 1500, rad: 115, dur: 2.2 },
      { dmg: 45, cd: 1300, rad: 130, dur: 2.4 }, { dmg: 55, cd: 1100, rad: 150, dur: 2.6 },
    ],
  },
  spiritChain: {
    name: "영혼사슬", desc: "적들을 결속시키는 malevolent 사슬",
    icon: "⛓️", col: "#9c27b0", attr: "yin", maxLv: 8,
    lvs: [
      { dmg: 8, cd: 1800, rad: 70, link: 2 }, { dmg: 10, cd: 1700, rad: 78, link: 2 },
      { dmg: 12, cd: 1600, rad: 86, link: 3 }, { dmg: 15, cd: 1500, rad: 95, link: 3 },
      { dmg: 18, cd: 1400, rad: 105, link: 4 }, { dmg: 22, cd: 1300, rad: 118, link: 4 },
      { dmg: 27, cd: 1200, rad: 132, link: 5 }, { dmg: 32, cd: 1000, rad: 148, link: 6 },
    ],
  },
  mirror: {
    name: "분신거울", desc: "거울결계로 적을 공격",
    icon: "🪞", col: "#e0e0e0", attr: "yin", maxLv: 8,
    lvs: [
      { dmg: 14, cd: 2000, rad: 65, reflect: 1 }, { dmg: 17, cd: 1900, rad: 72, reflect: 1 },
      { dmg: 20, cd: 1800, rad: 80, reflect: 2 }, { dmg: 24, cd: 1700, rad: 90, reflect: 2 },
      { dmg: 29, cd: 1600, rad: 102, reflect: 3 }, { dmg: 35, cd: 1500, rad: 115, reflect: 3 },
      { dmg: 42, cd: 1400, rad: 130, reflect: 4 }, { dmg: 50, cd: 1200, rad: 148, reflect: 5 },
    ],
  },
  bambooSpear: {
    name: "대창", desc: "긴 대 Bamboo lance로 관통",
    icon: "🎋", col: "#7cb342", attr: "yang", maxLv: 8,
    lvs: [
      { dmg: 25, cd: 1400, len: 100, pierce: 1 }, { dmg: 30, cd: 1300, len: 110, pierce: 1 },
      { dmg: 36, cd: 1200, len: 122, pierce: 2 }, { dmg: 42, cd: 1100, len: 135, pierce: 2 },
      { dmg: 50, cd: 1000, len: 150, pierce: 3 }, { dmg: 58, cd: 900, len: 168, pierce: 3 },
      { dmg: 68, cd: 800, len: 188, pierce: 4 }, { dmg: 80, cd: 700, len: 210, pierce: 5 },
    ],
  },
};

/* ─── EVOLVED WEAPONS ─── */
const EVOLVED = {
  ghostSlash: {
    name: "귀신참", desc: "광범위 회전 + 처치 시 HP회복",
    icon: "👻", col: "#a5d6a7", recipe: ["blade", "aura"], maxLv: 5,
    lvs: [
      { cnt: 6, dmg: 35, rad: 120, spd: 3.5, heal: 2 }, { cnt: 7, dmg: 40, rad: 130, spd: 3.8, heal: 3 },
      { cnt: 7, dmg: 48, rad: 140, spd: 4, heal: 3 },   { cnt: 8, dmg: 55, rad: 155, spd: 4.2, heal: 4 },
      { cnt: 8, dmg: 65, rad: 170, spd: 4.5, heal: 5 },
    ],
  },
  ghostFlame: {
    name: "귀화염", desc: "추적 화염 + 처치 시 연쇄폭발",
    icon: "👹", col: "#ff6d00", recipe: ["fire", "curseMist"], maxLv: 5,
    lvs: [
      { dmg: 45, cd: 600, spd: 6, cnt: 4, prc: 3, exR: 60, exD: 20 },
      { dmg: 52, cd: 550, spd: 6.5, cnt: 5, prc: 4, exR: 70, exD: 25 },
      { dmg: 60, cd: 500, spd: 7, cnt: 5, prc: 4, exR: 80, exD: 32 },
      { dmg: 70, cd: 450, spd: 7, cnt: 6, prc: 5, exR: 90, exD: 40 },
      { dmg: 82, cd: 400, spd: 8, cnt: 6, prc: 6, exR: 100, exD: 50 },
    ],
  },
  thunderIce: {
    name: "뇌빙", desc: "번개 동결 + 폭발 파편",
    icon: "🌩️", col: "#4dd0e1", recipe: ["lightning", "frost"], maxLv: 5,
    lvs: [
      { dmg: 60, cd: 1200, st: 3, frzT: 1.5, frzD: 30, frzR: 50 },
      { dmg: 72, cd: 1100, st: 3, frzT: 1.8, frzD: 38, frzR: 55 },
      { dmg: 85, cd: 1000, st: 4, frzT: 2, frzD: 45, frzR: 60 },
      { dmg: 100, cd: 900, st: 4, frzT: 2.2, frzD: 55, frzR: 70 },
      { dmg: 120, cd: 800, st: 5, frzT: 2.5, frzD: 68, frzR: 80 },
    ],
  },
  divineWind: {
    name: "신풍염주", desc: "바람 구슬 궤도 + 적 넉백 + 지속피해",
    icon: "🌟", col: "#fff176", recipe: ["beads", "windSpirit"], maxLv: 5,
    lvs: [
      { cnt: 8, dmg: 28, rad: 150, spd: 3.2, kb: 50, dotDmg: 5, dotDur: 2 },
      { cnt: 9, dmg: 34, rad: 160, spd: 3.5, kb: 65, dotDmg: 7, dotDur: 2.5 },
      { cnt: 9, dmg: 42, rad: 170, spd: 3.8, kb: 80, dotDmg: 9, dotDur: 3 },
      { cnt: 10, dmg: 50, rad: 180, spd: 4.0, kb: 95, dotDmg: 12, dotDur: 3.5 },
      { cnt: 10, dmg: 60, rad: 195, spd: 4.3, kb: 110, dotDmg: 15, dotDur: 4 },
    ],
  },
  deathQuake: {
    name: "명부진동", desc: "사신낫 + 지진파: 광범위 사신 충격파. 적 HP 12% 즉사 확률",
    icon: "☠️", col: "#9c27b0", recipe: ["scythe", "quake"], maxLv: 5,
    lvs: [
      { dmg: 50, cd: 1400, rad: 140, arc: 3.5, stunT: 1.0, execPct: 0.08 },
      { dmg: 60, cd: 1300, rad: 155, arc: 3.8, stunT: 1.1, execPct: 0.10 },
      { dmg: 72, cd: 1200, rad: 170, arc: 4.0, stunT: 1.2, execPct: 0.12 },
      { dmg: 85, cd: 1100, rad: 188, arc: 4.2, stunT: 1.3, execPct: 0.14 },
      { dmg: 100, cd: 1000, rad: 210, arc: 4.5, stunT: 1.5, execPct: 0.16 },
    ],
  },
  tidalStorm: {
    name: "해일폭풍", desc: "해류창 + 빙결파동: 얼어붙는 거대 해일",
    icon: "🌊", col: "#0288d1", recipe: ["trident", "frost"], maxLv: 5,
    lvs: [
      { dmg: 45, cd: 1000, spd: 7, cnt: 3, prc: 6, frzChance: 0.3, frzDur: 1500 },
      { dmg: 55, cd: 950, spd: 7.5, cnt: 3, prc: 7, frzChance: 0.35, frzDur: 1700 },
      { dmg: 65, cd: 900, spd: 8, cnt: 4, prc: 8, frzChance: 0.4, frzDur: 1900 },
      { dmg: 78, cd: 850, spd: 8.5, cnt: 4, prc: 9, frzChance: 0.45, frzDur: 2100 },
      { dmg: 95, cd: 800, spd: 9, cnt: 5, prc: 10, frzChance: 0.5, frzDur: 2500 },
    ],
  },
};

const RECIPES = [
  { a: "blade", b: "aura", result: "ghostSlash" },
  { a: "fire", b: "curseMist", result: "ghostFlame" },
  { a: "lightning", b: "frost", result: "thunderIce" },
  { a: "beads", b: "windSpirit", result: "divineWind" },
  { a: "scythe", b: "quake", result: "deathQuake" },
  { a: "trident", b: "frost", result: "tidalStorm" },
];

function getWDef(t) { return WDEFS[t] || EVOLVED[t]; }

/* ─── PASSIVES ─── */
const PASSIVES = {
  maxHp:    { name: "최대 HP",       desc: "최대 체력 +20",       icon: "❤️", maxLv: 5 },
  speed:    { name: "이동속도",      desc: "이동속도 +10%",       icon: "👟", maxLv: 5 },
  magnet:   { name: "자석",          desc: "기운 흡수 범위 +30",  icon: "🧲", maxLv: 5 },
  armor:    { name: "방어력",        desc: "받는 피해 -3",        icon: "🛡️", maxLv: 5 },
  cdReduce: { name: "쿨타임 감소",   desc: "무기 쿨타임 -8%",    icon: "⏱️", maxLv: 5 },
  xpBonus:  { name: "경험치 보너스", desc: "획득 경험치 +15%",    icon: "✨", maxLv: 5 },
  regen:    { name: "재생력",        desc: "초당 HP +1 회복",     icon: "💚", maxLv: 3 },
};

/* ─── META UPGRADES (permanent, bought with gold) ─── */
const META_UPGRADES = {
  metaHp:      { name: "체력 강화",     desc: "최대 HP +10",          icon: "❤️",  maxLv: 10, costs: [100,150,220,300,400,520,660,820,1000,1400] },
  metaDmg:     { name: "공격력 강화",   desc: "공격력 +5%",           icon: "⚔️",  maxLv: 10, costs: [120,180,260,360,480,620,780,960,1200,1600] },
  metaSpd:     { name: "이동속도 강화", desc: "이동속도 +3%",         icon: "👟",  maxLv: 10, costs: [80,120,180,260,350,460,580,720,880,1100] },
  metaArmor:   { name: "방어력 강화",   desc: "방어력 +1",            icon: "🛡️", maxLv: 5,  costs: [200,400,650,1000,1500] },
  metaMagnet:  { name: "자석 강화",     desc: "흡수 범위 +10",        icon: "🧲",  maxLv: 10, costs: [60,100,150,220,300,400,500,620,760,920] },
  metaCd:      { name: "쿨타임 감소",   desc: "무기 쿨타임 -3%",      icon: "⏱️", maxLv: 10, costs: [100,160,240,340,460,600,760,940,1150,1400] },
  metaXp:      { name: "경험치 보너스", desc: "경험치 +5%",           icon: "✨",  maxLv: 10, costs: [80,130,190,270,370,480,600,740,900,1100] },
  metaRegen:   { name: "재생력",        desc: "초당 HP +0.3 회복",    icon: "💚",  maxLv: 5,  costs: [150,300,500,800,1200] },
  metaGold:    { name: "금화 보너스",   desc: "골드 획득 +10%",       icon: "💰",  maxLv: 10, costs: [100,200,320,460,620,800,1000,1250,1530,1850] },
  metaRevive:  { name: "부활",          desc: "사망 시 HP 30% 부활 (런당 1회)", icon: "💫", maxLv: 1, costs: [3000] },
};

/* ─── MAP DEFINITIONS ─── */
const MAPS = {
  bamboo: {
    name: "대나무 숲", emoji: "🎋", desc: "기본 맵. 대나무와 달빛의 고요한 전장",
    bg: "#081210", gridCol: "rgba(80,160,100,.04)", bamboo: true, moon: true,
    waterZones: false, graveFx: false,
    unlocked: true,
  },
  graveyard: {
    name: "지하묘지", emoji: "⚰️", desc: "언데드 적 강화. 해골병사·처녀귀신 출현 빨라짐",
    bg: "#0a0808", gridCol: "rgba(120,80,80,.05)", bamboo: false, moon: false,
    waterZones: false, graveFx: true,
    enemyBonus: { skeleton: { hpMul: 1.3 }, ghost: { hpMul: 1.3 } },
    spawnOverride: [
      { t: 0, types: ["dokkaebi", "skeleton"] },
      { t: 60, types: ["dokkaebi", "skeleton", "ghost"] },
      { t: 120, types: ["skeleton", "ghost", "bulgasari"] },
      { t: 180, types: ["skeleton", "ghost", "wisp", "bulgasari"] },
      { t: 240, types: ["ghost", "jangsan", "skeleton", "bulgasari"] },
      { t: 360, types: ["skeleton", "ghost", "jangsan", "bulgasari", "dokkaebi"] },
      { t: 480, types: ["skeleton", "ghost", "jangsan", "bulgasari"] },
    ],
    unlocked: false, unlockCheck: (s) => s.gamesWon >= 1,
    unlockDesc: "아무 맵에서 클리어",
  },
  sea: {
    name: "용궁 해변", emoji: "🌊", desc: "맵에 물 지대 존재. 물 위에서 적 감속, 해녀 강화",
    bg: "#06101a", gridCol: "rgba(60,120,180,.04)", bamboo: false, moon: true,
    waterZones: true, graveFx: false,
    unlocked: false, unlockCheck: (s) => s.gamesWon >= 2,
    unlockDesc: "2회 클리어",
  },
  forest: {
    name: "잠든 숲", emoji: "🌲", desc: "음울한 숲. 적 이동속도 +20%, 출현량 +30%",
    bg: "#0a1a0a", gridCol: "rgba(40,80,40,.05)", bamboo: false, moon: true,
    waterZones: false, graveFx: false,
    enemySpeedMul: 1.2, enemySpawnMul: 1.3,
    unlocked: false, unlockCheck: (s) => s.totalKills >= 100,
    unlockDesc: "누적 100 처치",
  },
  dokkabong: {
    name: "도깨비 성", emoji: "🏰", desc: "도깨비들의 성. 다량의 엘리트 적 출현",
    bg: "#1a0a0a", gridCol: "rgba(80,40,40,.05)", bamboo: false, moon: false,
    waterZones: false, graveFx: false,
    enemyHpMul: 1.4, eliteSpawnMul: 2,
    spawnOverride: [
      { t: 0, types: ["dokkaebi", "dokkaebi"] },
      { t: 30, types: ["dokkaebi", "dokkaKing"] },
      { t: 60, types: ["dokkaebi", "dokkaKing", "wisp"] },
      { t: 90, types: ["dokkaKing", "wisp", "ghost"] },
      { t: 120, types: ["dokkaKing", "dokkaKing", "ghost", "jangsan"] },
      { t: 180, types: ["dokkaKing", "dokkaKing", "ghost", "jangsan", "bulgasari"] },
      { t: 240, types: ["dokkaKing", "ghost", "jangsan", "bulgasari", "haetae"] },
    ],
    unlocked: false, unlockCheck: (s) => s.gamesWon >= 3,
    unlockDesc: "3회 클리어",
  },
};

/* ─── STAGE SYSTEM ─── */
const STAGES = {
  // 챕터 1: 어두운 밤의 숲 (5스테이지)
  "1-1": {
    chapter: 1, name: "대나무 숲", desc: "가장 첫 번째 숲, 도깨비들이 사냥감을 찾고 있다",
    map: "bamboo", difficulty: "easy",
    clearTime: 150,
    stars: { 1: 150, 2: 120, 3: 90 },
    enemies: ["dokkaebi", "wisp", "shadow"],
    boss: null,
    unlockCost: 0,
  },
  "1-2": {
    chapter: 1, name: "어두운 산책로", desc: "달빛이 깃든 오솔길",
    map: "bamboo", difficulty: "easy",
    clearTime: 180,
    stars: { 1: 180, 2: 150, 3: 120 },
    enemies: ["dokkaebi", "wisp", "goblin"],
    boss: null,
    unlockCost: 0,
  },
  "1-3": {
    chapter: 1, name: "으스스한 길", desc: "등골이 서늘해지는 길, 해골병사가 나타난다",
    map: "graveyard", difficulty: "easy",
    clearTime: 210,
    stars: { 1: 210, 2: 180, 3: 150 },
    enemies: ["dokkaebi", "wisp", "skeleton", "goblin"],
    boss: null,
    unlockCost: 0,
  },
  "1-4": {
    chapter: 1, name: "버려진 사당", desc: "오랜 버려진 사당, 유령들이 떠돌다",
    map: "graveyard", difficulty: "normal",
    clearTime: 240,
    stars: { 1: 240, 2: 210, 3: 180 },
    enemies: ["skeleton", "ghost", "goblin", "wetGhost"],
    boss: null,
    unlockCost: 1,
    reqStars: 1,
  },
  "1-5": {
    chapter: 1, name: "도깨비王的 성", desc: "도깨비왕이 지배하는 성, 최종 전투",
    map: "graveyard", difficulty: "normal",
    clearTime: 300,
    stars: { 1: 300, 2: 270, 3: 240 },
    enemies: ["skeleton", "ghost", "wetGhost", "tombKeeper"],
    boss: "dokkaKing",
    unlockCost: 3,
    reqStars: 3,
  },

  // 챕터 2: 저승의 문 (5스테이지)
  "2-1": {
    chapter: 2, name: "무덤길", desc: "저승으로 향하는 길, 영혼들이 떠돌고 있다",
    map: "graveyard", difficulty: "normal",
    clearTime: 240,
    stars: { 1: 240, 2: 210, 3: 180 },
    enemies: ["skeleton", "ghost", "wetGhost", "tombKeeper"],
    boss: null,
    unlockCost: 6,
    reqStars: 6,
  },
  "2-2": {
    chapter: 2, name: "영혼의 숲", desc: "울창한 숲속, 잊힌 영혼들이 깃들어 있다",
    map: "forest", difficulty: "hard",
    clearTime: 270,
    stars: { 1: 270, 2: 240, 3: 210 },
    enemies: ["ghost", "tombKeeper", "fireEnt", "goblin"],
    boss: null,
    unlockCost: 8,
    reqStars: 8,
  },
  "2-3": {
    chapter: 2, name: "잠든 묘지", desc: "영혼들이 깊이 잠든 곳, Grave Keeper가 감시한다",
    map: "graveyard", difficulty: "hard",
    clearTime: 300,
    stars: { 1: 300, 2: 270, 3: 240 },
    enemies: ["ghost", "tombKeeper", "fireEnt", "plagueRat"],
    boss: null,
    unlockCost: 10,
    reqStars: 10,
  },
  "2-4": {
    chapter: 2, name: "저승의 문앞", desc: "저승의 문前面, 강력한 수호자들이 있다",
    map: "graveyard", difficulty: "hard",
    clearTime: 360,
    stars: { 1: 360, 2: 330, 3: 300 },
    enemies: ["tombKeeper", "fireEnt", "demonKnight", "soulSiphon"],
    boss: null,
    unlockCost: 12,
    reqStars: 12,
  },
  "2-5": {
    chapter: 2, name: "저승문", desc: "저승의 문, 해태가 지키고 있다",
    map: "graveyard", difficulty: "nightmare",
    clearTime: 420,
    stars: { 1: 420, 2: 390, 3: 360 },
    enemies: ["tombKeeper", "fireEnt", "demonKnight", "soulSiphon", "ghostKing"],
    boss: "haetae",
    unlockCost: 15,
    reqStars: 15,
  },

  // 챕터 3: 용궁 (5스테이지)
  "3-1": {
    chapter: 3, name: "해안가", desc: "바다와 숲의 경계, 물귀신이 나타난다",
    map: "sea", difficulty: "hard",
    clearTime: 300,
    stars: { 1: 300, 2: 270, 3: 240 },
    enemies: ["wetGhost", "plagueRat", "soulSiphon", "goblin"],
    boss: null,
    unlockCost: 18,
    reqStars: 18,
  },
  "3-2": {
    chapter: 3, name: "수중 동굴", desc: "바다深处的 동굴, 위험한 적들이 있다",
    map: "sea", difficulty: "nightmare",
    clearTime: 330,
    stars: { 1: 330, 2: 300, 3: 270 },
    enemies: ["soulSiphon", "iceGolem", "plagueRat", "wetGhost"],
    boss: null,
    unlockCost: 21,
    reqStars: 21,
  },
  "3-3": {
    chapter: 3, name: "용궁 입구", desc: "용궁으로 들어서는 곳, 강력한 수호자들이 있다",
    map: "sea", difficulty: "nightmare",
    clearTime: 360,
    stars: { 1: 360, 2: 330, 3: 300 },
    enemies: ["soulSiphon", "iceGolem", "demonKnight", "plagueRat"],
    boss: null,
    unlockCost: 24,
    reqStars: 24,
  },
  "3-4": {
    chapter: 3, name: "용의 궁전", desc: "용왕의宮殿, Elite들이 지키고 있다",
    map: "dokkabong", difficulty: "nightmare",
    clearTime: 420,
    stars: { 1: 420, 2: 390, 3: 360 },
    enemies: ["iceGolem", "demonKnight", "ghostKing", "imugi"],
    boss: null,
    unlockCost: 27,
    reqStars: 27,
  },
  "3-5": {
    chapter: 3, name: "용왕의大殿", desc: "용왕이 지키는 곳, 최종挑战",
    map: "sea", difficulty: "hell",
    clearTime: 480,
    stars: { 1: 480, 2: 450, 3: 420 },
    enemies: ["iceGolem", "demonKnight", "ghostKing", "imugi", "haetae"],
    boss: "dragon",
    unlockCost: 30,
    reqStars: 30,
  },
};

const CHAPTERS = {
  1: { name: "어두운 밤의 숲", emoji: "🌲", stages: ["1-1", "1-2", "1-3", "1-4", "1-5"], reqStars: 0, unlockDesc: "시작부터" },
  2: { name: "저승의 문", emoji: "⛩️", stages: ["2-1", "2-2", "2-3", "2-4", "2-5"], reqStars: 6, unlockDesc: "챕터1에서 별 6개 획득" },
  3: { name: "용궁", emoji: "🐉", stages: ["3-1", "3-2", "3-3", "3-4", "3-5"], reqStars: 15, unlockDesc: "챕터2에서 별 15개 획득" },
};

/* ─── GACHA SYSTEM ─── */
// 유령 가챠
const GHOSTS = {
  // 일반 (N)
  wanderingSpirit: { name: "떠돌이 유령", rarity: "N", type: "attack", stats: { hp: 50, atk: 10 }, skill: "basicAttack", icon: "👻" },
  tinyGhost: { name: "작은 유령", rarity: "N", type: "support", stats: { hp: 40, atk: 8 }, skill: "blessing", icon: "✨" },
  shadowSprite: { name: "그림자 정령", rarity: "N", type: "attack", stats: { hp: 45, atk: 12 }, skill: "shadowStrike", icon: "🌑" },

  // 레어 (R)
  forestGuardian: { name: "숲의 수호자", rarity: "R", type: "defense", stats: { hp: 100, atk: 15 }, skill: "shieldAura", icon: "🌳" },
  waterSpirit: { name: "물귀신", rarity: "R", type: "attack", stats: { hp: 80, atk: 20 }, skill: "waterSlash", icon: "💧" },
  fireWisp: { name: "불꽃 정령", rarity: "R", type: "attack", stats: { hp: 75, atk: 22 }, skill: "flameBurst", icon: "🔥" },

  // 에픽 (SR)
  thunderSpirit: { name: "천둥령", rarity: "SR", type: "attack", stats: { hp: 120, atk: 35 }, skill: "thunderStorm", icon: "⚡" },
  iceWraith: { name: "얼음망령", rarity: "SR", type: "attack", stats: { hp: 110, atk: 30 }, skill: "frostNova", icon: "❄️" },
  darkKnight: { name: "어둠의 기사", rarity: "SR", type: "defense", stats: { hp: 180, atk: 25 }, skill: "voidShield", icon: "🗡️" },
  soulHunter: { name: "영혼 사냥꾼", rarity: "SR", type: "attack", stats: { hp: 100, atk: 40 }, skill: "soulSiphon", icon: "🎯" },

  // 전설 (SSR)
  nineTailedFox: { name: "구미호", rarity: "SSR", type: "hybrid", stats: { hp: 200, atk: 50 }, skill: "allureCharm", icon: "🦊" },
  grimReaper: { name: "저승사자", rarity: "SSR", type: "attack", stats: { hp: 180, atk: 60 }, skill: "deathScythe", icon: "💀" },
  dragonSpirit: { name: "용령", rarity: "SSR", type: "attack", stats: { hp: 220, atk: 55 }, skill: "dragonBreath", icon: "🐉" },

  // 신화 (UR)
  cheonyeoQueen: { name: "처녀귀왕", rarity: "UR", type: "hybrid", stats: { hp: 300, atk: 80 }, skill: "soulDrain", icon: "👸" },
  doomLord: { name: "파멸의 군주", rarity: "UR", type: "attack", stats: { hp: 280, atk: 100 }, skill: "cataclysm", icon: "😈" },
};

const GACHA_RARITY = {
  N:  { weight: 50, color: "#a0a0a0", name: "일반", icon: "⚪" },
  R:  { weight: 30, color: "#4fc3f7", name: "레어", icon: "🔵" },
  SR: { weight: 14, color: "#ab47bc", name: "에픽", icon: "🟣" },
  SSR:{ weight: 4,  color: "#ff9800", name: "전설", icon: "🟠" },
  UR: { weight: 2,  color: "#ff1744", name: "신화", icon: "🔴" },
};

const GACHA_COST = { normal: 100, gold: 1000 };
const PITY_LIMIT = 90; // 90회 후 보장

// 가챠 데이터 로드/저장
function loadGachaData() {
  return _load("yokai_gacha", {
    spiritStones: 500, // 시작 재화
    goldSpiritStones: 0,
    ghosts: {},
    pityCounter: 0,
    totalPulls: 0,
  });
}
function saveGachaData(v) { _save("yokai_gacha", v); }

function pullGacha(type = "normal", count = 1) {
  const data = loadGachaData();
  const cost = type === "gold" ? GACHA_COST.gold : GACHA_COST.normal;

  if (type === "normal" && data.spiritStones < cost * count) return null;
  if (type === "gold" && data.goldSpiritStones < cost * count) return null;

  // 차감
  if (type === "normal") data.spiritStones -= cost * count;
  else data.goldSpiritStones -= cost * count;

  const results = [];
  for (let i = 0; i < count; i++) {
    data.pityCount++;
    data.totalPulls++;

    // 天井判定
    let rarity;
    if (data.pityCount >= PITY_LIMIT) {
      rarity = "SSR";
      data.pityCount = 0;
    } else {
      const rand = Math.random() * 100;
      let accum = 0;
      for (const [r, info] of Object.entries(GACHA_RARITY)) {
        accum += info.weight;
        if (rand < accum) { rarity = r; break; }
      }
    }

    // 해당 등급 유령 중 랜덤 선택
    const ghostList = Object.entries(GHOSTS).filter(([k, v]) => v.rarity === rarity);
    const [ghostId, ghost] = ghostList[Math.floor(Math.random() * ghostList.length)];

    // inventory에 추가
    data.ghosts[ghostId] = (data.ghosts[ghostId] || 0) + 1;
    results.push({ id: ghostId, ...ghost });
  }

  saveGachaData(data);
  return results;
}

/* ─── DAILY CHALLENGES ─── */
const DAILY_CHALLENGES = [
  { id: "fast", name: "속도전", desc: "이동속도 +50%", effect: { spdMul: 1.5 } },
  { id: "pow", name: "힘의 질주", desc: "공격력 +40%, 방어력 -30%", effect: { dmgMul: 1.4, armorMul: 0.7 } },
  { id: "tiny", name: "미니 체력", desc: "HP 50%,攻击力 +30%", effect: { hpMul: 0.5, dmgMul: 1.3 } },
  { id: "gold", name: "황금 전장", desc: "골드 +100%, 경험치 -30%", effect: { goldMul: 2, xpMul: 0.7 } },
  { id: "magnet", name: "자석 전사", desc: "아이템 탐지 범위 +100%", effect: { magnetMul: 2 } },
  { id: "slowmo", name: "슬로모", desc: "적 이동속도 50%", effect: { enemySpdMul: 0.5 } },
  { id: "flood", name: "대홍수", desc: "물 지대 전체 맵", effect: { waterEverywhere: true } },
  { id: "boss", name: "보스 러시", desc: "보스 5분마다 출현", effect: { bossInterval: 300 } },
  { id: "blade", name: "검만들", desc: "무기: 퇴마검 only", effect: { weaponOnly: "blade" } },
  { id: "fire", name: "불꽃 날개", desc: "무기: 부적불꽃 only", effect: { weaponOnly: "fire" } },
  { id: "noHeal", name: "고통의 길", desc: "HP 재생 없음", effect: { noRegen: true } },
  { id: "tinyMap", name: "좁은 전장", desc: "맵 크기 50%", effect: { mapSizeMul: 0.5 } },
];

function getDailyChallenge() {
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const idx = seed % DAILY_CHALLENGES.length;
  return DAILY_CHALLENGES[idx];
}

function loadDailyStats() {
  return _load("yokia_daily", { lastDate: "", bestTime: 0, completed: false, streak: 0, lastPlayDate: "" });
}
function saveDailyStats(v) { _save("yokia_daily", v); }

function checkDailyStreak() {
  const today = new Date().toDateString();
  const stats = loadDailyStats();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  if (stats.lastPlayDate === yesterday) {
    // Consecutive day - increment streak
    stats.streak = (stats.streak || 0) + 1;
  } else if (stats.lastPlayDate !== today) {
    // Missed days - reset streak
    stats.streak = 1;
  }

  stats.lastPlayDate = today;
  saveDailyStats(stats);
  return stats.streak;
}

function getDailyStreakBonus() {
  const streak = checkDailyStreak();
  const bonuses = {
    1: 1.1,  // 10% gold bonus
    2: 1.15, // 15%
    3: 1.2,  // 20%
    4: 1.25, // 25%
    5: 1.3,  // 30%
    6: 1.35, // 35%
    7: 1.5,  // 50% - weekly bonus!
  };
  return bonuses[streak] || 1;
}

/* ── Time Attack Best Times ── */
function loadBestTime(mode) {
  const key = `yokai_best_${mode}`;
  return parseFloat(localStorage.getItem(key) || 'Infinity');
}
function saveBestTime(mode, time) {
  const key = `yokai_best_${mode}`;
  const current = loadBestTime(mode);
  if (time < current) {
    localStorage.setItem(key, time.toString());
    return true; // New record
  }
  return false;
}
function formatTime(seconds) {
  const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

/* ─── ACHIEVEMENTS ─── */
const ACHIEVEMENTS = {
  // 처치 관련
  firstBlood:       { name: "첫 번째 희생자", desc: "첫 적 1 처치", icon: "⚔️", reward: 50 },
  kill10:           { name: "초보 사냥꾼",   desc: "적 10 처치", icon: "🎯", reward: 100 },
  kill50:           { name: "중급 사냥꾼",   desc: "적 50 처치", icon: "🏹", reward: 200 },
  kill100:          { name: "고급 사냥꾼",   desc: "적 100 처치", icon: "💀", reward: 300 },
  kill500:          { name: "숙련 사냥꾼",   desc: "적 500 처치", icon: "🩸", reward: 500 },
  kill1000:         { name: "대名师",       desc: "적 1000 처치", icon: "🔥", reward: 1000 },
  kill5000:         { name: "요괴graduate", desc: "적 5000 처치", icon: "🏅", reward: 5000 },
  // 보스/엘리트
  killElite:        { name: "엘리트 사냥",   desc: "엘리트 적 1 처치", icon: "⭐", reward: 100 },
  kill5Elite:       { name: "엘리트 학살자", desc: "엘리트 5 처치", icon: "🌟", reward: 300 },
  killBoss:         { name: "보스 사냥",    desc: "보스 1 처치", icon: "👹", reward: 200 },
  kill10Boss:       { name: "보스 전문가",   desc: "보스 10 처치", icon: "👺", reward: 1000 },
  // 생존
  survive1min:      { name: "1분 생존",     desc: "1분 동안 생존", icon: "⏱️", reward: 50 },
  survive3min:      { name: "3분 생존",     desc: "3분 동안 생존", icon: "⌛", reward: 100 },
  survive5min:      { name: "5분 생존",     desc: "5분 동안 생존", icon: "⏳", reward: 200 },
  survive10min:     { name: "완주",         desc: "10분 클리어", icon: "🏆", reward: 500 },
  // 레벨
  lv10:             { name: "레벨 10",     desc: "레벨 10 도달", icon: "🔟", reward: 200 },
  lv30:             { name: "레벨 30",     desc: "레벨 30 도달", icon: "🔝", reward: 500 },
  lv50:             { name: "레벨 50",     desc: "레벨 50 도달", icon: "🌟", reward: 1000 },
  lv100:            { name: "레벨 100",    desc: "레벨 100 도달", icon: "💎", reward: 5000 },
  // 무기
  maxWeapon:       { name: "무기大师",     desc: "무기 최대 레벨", icon: "⚔️", reward: 300 },
  evolveWeapon:    { name: "무기 진화",    desc: "무기 1회 진화", icon: "✨", reward: 400 },
  evolve3Weapon:   { name: "진화 마스터",  desc: "무기 3회 진화", icon: "💫", reward: 1000 },
  useAllWeapons:   { name: "무기 수집가",  desc: "모든 무기 1회 이상 사용", icon: "🎖️", reward: 1000 },
  // 캐릭터
  unlockChar:      { name: "새 얼굴",      desc: "캐릭터 1명 해금", icon: "👤", reward: 100 },
  unlockAllChar:   { name: "캐릭터 컬렉터", desc: "모든 캐릭터 해금", icon: "👥", reward: 2000 },
  // 콤보
  combo10:          { name: "연속 10킬",   desc: "콤보 10 달성", icon: "🔥", reward: 200 },
  combo50:         { name: "연속 50킬",   desc: "콤보 50 달성", icon: "⚡", reward: 500 },
  combo100:        { name: "연속 100킬",  desc: "콤보 100 달성", icon: "💥", reward: 1500 },
  // 맵
  clearBamboo:     { name: "대나무 종결자", desc: "대나무 숲 클리어", icon: "🎋", reward: 200 },
  clearGraveyard:  { name: "고인 종결자",   desc: "지하묘지 클리어", icon: "⚰️", reward: 300 },
  clearSea:        { name: "해적",         desc: "바다 맵 클리어", icon: "🌊", reward: 400 },
  // 특수
  noDamageWin:    { name: "무손실 클리어", desc: "피격 없이 클리어", icon: "🛡️", reward: 2000 },
  speedRun:        { name: "스피드런",    desc: "5분 이내 클리어", icon: "⏩", reward: 1500 },
  allDiffClear:    { name: "모든 난이도 클리어", desc: "5가지 난이도 모두 클리어", icon: "🎯", reward: 5000 },
  metaMax:         { name: "영구 강화 달성", desc: "모든 영구 강화 최대 레벨", icon: "💰", reward: 3000 },
  // 파워업
  powerup10:      { name: "파워업 수집가", desc: "파워업 10개 획득", icon: "⚡", reward: 150 },
  powerup50:       { name: "파워업 달인",   desc: "파워업 50개 획득", icon: "✨", reward: 400 },
  // 가챠 관련
  firstGacha:      { name: "첫 가챠",     desc: "첫 가챠 수행", icon: "🎰", reward: 100 },
  getSSR:          { name: "SSR 획득",    desc: "SSR 등급 유령 획득", icon: "🌟", reward: 500 },
  getUR:           { name: "UR 획득",     desc: "UR 등급 유령 획득", icon: "💎", reward: 2000 },
  clearForest:     { name: "숲 파수관",    desc: "잠든 숲 클리어", icon: "🌲", reward: 400 },
  clearDokkabong:  { name: "도깨비 왕",    desc: "도깨비 성 클리어", icon: "🏰", reward: 500 },
  // 난이도
  clearNormal:     { name: "일반 클리어",  desc: "보통 난이도 클리어", icon: "🟡", reward: 100 },
  clearHard:       { name: "困难克星",    desc: "어려움 난이도 클리어", icon: "🔴", reward: 300 },
  clearNightmare:  { name: "악몽 종결자",  desc: "악몽 난이도 클리어", icon: "💀", reward: 1000 },
  clearNightmare10:{ name: "진정한 악몽",  desc: "악몽 10분 생존", icon: "🌑", reward: 2000 },
  // 골드/메타
  gold100:         { name: "골드 수집가", desc: "누적 골드 100", icon: "💰", reward: 100 },
  gold1000:        { name: "부자",        desc: "누적 골드 1000", icon: "💎", reward: 500 },
  gold10000:       { name: "대부호",      desc: "누적 골드 10000", icon: "👑", reward: 2000 },
  maxUpgrade:      { name: "최대 강화",    desc: "하나의 강화 최대", icon: "⬆️", reward: 300 },
  // 엔드리스/NG+
  endlessWin:      { name: "엔드리스 클리어", desc: "엔드리스 모드 클리어", icon: "♾️", reward: 500 },
  ngPlus1:         { name: "NG+ 시작",    desc: "NG+ 1회차 클리어", icon: "🔁", reward: 300 },
  ngPlus3:         { name: "NG+ 3회차",   desc: "NG+ 3회차 클리어", icon: "🔂", reward: 1000 },
  //特殊な
  noDamage:        { name: "무적",        desc: "클리어 시 피해 0", icon: "🛡️", reward: 500 },
  hp1Survive:      { name: "죽음의邊緣",  desc: "HP 1로 클리어", icon: "💖", reward: 300 },
  fullHpWin:       { name: "완벽한 승리", desc: "Full HP로 클리어", icon: "💚", reward: 400 },
  soloWeapon:      { name: "단일 무기",   desc: "무기 1개만으로 클리어", icon: "🤝", reward: 500 },
  fastClear:       { name: "속도전",      desc: "8분 이내 클리어", icon: "⚡", reward: 600 },
  // 유물
  useArtifact:     { name: "유물 수집가", desc: "유물 1회 사용", icon: "🏮", reward: 100 },
  useAllArtifact: { name: "유물 탐험가", desc: "모든 유물 사용", icon: "🪝", reward: 1000 },
  // 시너지
  synergy1:        { name: "시너지的第一步", desc: "시너지 1회 발동", icon: "🔗", reward: 100 },
  synergy10:       { name: "시너지 마스터", desc: "시너지 10회 발동", icon: "💫", reward: 500 },
  // 시간대별
  midnightClear:  { name: "자정 사냥",    desc: "자정 시간대에 클리어", icon: "🌙", reward: 300 },
  morningClear:   { name: "새벽 사냥",    desc: "아침 시간대에 클리어", icon: "🌅", reward: 300 },
  // 콤보 관련
  combo5:         { name: "연속 사냥",    desc: "콤보 5 달성", icon: "🔥", reward: 100 },
  combo10:        { name: "무쌍 사냥꾼",  desc: "콤보 10 달성", icon: "⚔️", reward: 200 },
  combo20:        { name: "초월 사냥꾼",   desc: "콤보 20 달성", icon: "💫", reward: 400 },
  combo50:        { name: "전설 사냥꾼",  desc: "콤보 50 달성", icon: "👑", reward: 1000 },
  // 파워업 관련
  powerup10:      { name: "파워업 수집가", desc: "파워업 10개 획득", icon: "⚡", reward: 150 },
  powerup50:      { name: "파워업 달인",   desc: "파워업 50개 획득", icon: "✨", reward: 400 },
  // 펫 관련
  petFox:         { name: "여우 친구",    desc: "여우 요정으로 30 처치", icon: "🦊", reward: 200 },
  petGhost:       { name: "귀신 보호자",  desc: "귀신 친구로 5분 생존", icon: "👻", reward: 200 },
  petBird:        { name: "영혼 수집가",  desc: "영혼 새로 XP 500 획득", icon: "🐦", reward: 200 },
  petDragon:      { name: "용 사육사",   desc: "용 도마뱀로 골드 200 추가 획득", icon: "🐉", reward: 200 },
  // 무기 진화
  evolve5Weapon:  { name: "진화 달인",    desc: "무기 5회 진화", icon: "🌈", reward: 800 },
};

/* ─── ARTIFACTS (picked at run start, 1 per run) ─── */
const ARTIFACTS = {
  soulLantern:  { name: "혼등",     icon: "🏮", desc: "처치 시 5% 확률로 HP 5 회복", effect: "killHeal5" },
  dragonScale:  { name: "용린",     icon: "🐉", desc: "받는 피해 20% 감소",           effect: "dmgReduce20" },
  spiritMirror: { name: "영혼거울", icon: "🪞", desc: "크리티컬 확률 10% → 20%",      effect: "critUp" },
  jadeBell:     { name: "옥방울",   icon: "🔔", desc: "무기 쿨타임 15% 감소",         effect: "cdReduce15" },
  goldenFan:    { name: "금선",     icon: "🪭", desc: "골드 획득 50% 증가",           effect: "goldUp50" },
  moonStone:    { name: "월석",     icon: "💎", desc: "경험치 25% 증가",              effect: "xpUp25" },
  tigerClaw:    { name: "호조",     icon: "🐅", desc: "공격력 15% 증가",              effect: "dmgUp15" },
  windCharm:    { name: "풍부",     icon: "🎐", desc: "이동속도 20% 증가",            effect: "spdUp20" },
  ironTortle:   { name: "철거북",   icon: "🐢", desc: "최대 HP +50",                  effect: "hpUp50" },
  foxBead:      { name: "여우구슬", icon: "🔮", desc: "보스 피해 30% 증가",           effect: "bossDmg30" },
};

/* ─── POWERUPS (in-game pickups, temporary buffs) ─── */
const POWERUPS = {
  speedBoost: { name: "가속", icon: "⚡", effect: "speed", val: 0.5, dur: 10, col: "#ffeb3b" },
  damageBoost: { name: "강타", icon: "💥", effect: "dmg", val: 0.3, dur: 15, col: "#ff5722" },
  invincibility: { name: "무적", icon: "✨", effect: "inv", dur: 3, col: "#e040fb" },
  magnet: { name: "자석", icon: "🧲", effect: "magnet", val: 3, dur: 20, col: "#4caf50" },
  doubleXP: { name: "好运", icon: "⭐", effect: "xp", val: 1, dur: 20, col: "#ffd700" },
  heal: { name: "회복", icon: "💚", effect: "heal", val: 20, dur: 0, col: "#e91e63" },
  // New powerups for variety
  shield: { name: "보호막", icon: "🛡️", effect: "shield", val: 0.5, dur: 15, col: "#42a5f5" },
  slowField: { name: "감속장", icon: "🌀", effect: "slowField", val: 0.3, dur: 12, col: "#78909c" },
  critBoost: { name: "치명타", icon: "🎯", effect: "critBoost", val: 0.15, dur: 20, col: "#ff7043" },
  lifeSteal: { name: "흡혈", icon: "🩸", effect: "lifeSteal", val: 0.05, dur: 15, col: "#c62828" },
};

/* ─── PETS (companions) ─── */
const PETS = {
  foxPet: { name: "여우 요정", icon: "🦊", desc: "자동 공격 - 근처 적 데미지", dmg: 20, atkInterval: 3, range: 150 },
  ghostPet: { name: "귀신 친구", icon: "👻", desc: "방어 지원 - 받는 피해 10% 감소", dmgReduce: 0.1 },
  spiritBird: { name: "영혼 새", icon: "🐦", desc: "경험치 증가 - XP +25%", xpMul: 1.25 },
  dragonSalamander: { name: "용 도마뱀", icon: "🐉", desc: "골드 증가 - 골드 +30%", goldMul: 1.3 },
};

/* ─── SYNERGY (character + weapon bonus) ─── */
const SYNERGIES = [
  { char: "exorcist",    wpn: "blade",     name: "퇴마 달인",  desc: "퇴마검 피해 +25%",      bonus: { wpnDmgMul: 1.25, wpnType: "blade" } },
  { char: "shaman",      wpn: "fire",      name: "부적 명인",  desc: "부적불꽃 쿨타임 -20%",   bonus: { wpnCdMul: 0.8, wpnType: "fire" } },
  { char: "taoist",      wpn: "frost",     name: "빙결 도술",  desc: "빙결 범위 +30%",         bonus: { wpnRadMul: 1.3, wpnType: "frost" } },
  { char: "hunter",      wpn: "lightning",  name: "뇌격 사냥",  desc: "번개 대상 +2",           bonus: { wpnExtra: 2, wpnType: "lightning" } },
  { char: "monk",        wpn: "aura",      name: "불법 수행",  desc: "혼령장 범위 +40%",       bonus: { wpnRadMul: 1.4, wpnType: "aura" } },
  { char: "foxSpirit",   wpn: "curseMist", name: "요기 해방",  desc: "저주안개 피해 +30%",     bonus: { wpnDmgMul: 1.3, wpnType: "curseMist" } },
  { char: "reaper",      wpn: "scythe",    name: "사신 일격",  desc: "사신낫 범위 +25%",       bonus: { wpnRadMul: 1.25, wpnType: "scythe" } },
  { char: "mountainGod", wpn: "quake",     name: "산신 격진",  desc: "지진파 스턴 +50%",       bonus: { wpnStunMul: 1.5, wpnType: "quake" } },
  { char: "seaDiver",    wpn: "trident",   name: "용궁 창술",  desc: "해류창 관통 +3",         bonus: { wpnExtra: 3, wpnType: "trident" } },
];

/* ─── DIFFICULTY ─── */
const DIFFICULTIES = {
  easy:      { name: "쉬움",   emoji: "🟢", hpMul: 0.8, dmgMul: 0.8, spdMul: 0.9, spawnMul: 0.7,  goldMul: 0.6, xpMul: 1.4, reqLevel: 1 },
  normal:    { name: "보통",   emoji: "🟡", hpMul: 1.0, dmgMul: 1.0, spdMul: 1.0, spawnMul: 1.0,  goldMul: 1.0, xpMul: 1.0, reqLevel: 1 },
  hard:      { name: "어려움", emoji: "🔴", hpMul: 1.6, dmgMul: 1.4, spdMul: 1.1, spawnMul: 1.4,  goldMul: 1.6, xpMul: 0.7, reqLevel: 10 },
  nightmare: { name: "악몽",   emoji: "💀", hpMul: 2.5, dmgMul: 2.0, spdMul: 1.25, spawnMul: 1.8,  goldMul: 2.5, xpMul: 0.5, reqLevel: 30,
    unlockCheck: (s) => s.gamesWon >= 3 },
  hell:      { name: "지옥",   emoji: "🔥", hpMul: 4.0, dmgMul: 3.0, spdMul: 1.4, spawnMul: 2.5,  goldMul: 4.0, xpMul: 0.3, reqLevel: 50,
    unlockCheck: (s) => s.gamesWon >= 10 },
};

/* ─── TUTORIAL SYSTEM ─── */
const TUTORIAL_STEPS = [
  { id: "move", title: "이동 방법", desc: "WASD 또는 방향키로 이동하세요", icon: "🕹️", condition: () => true },
  { id: "attack", title: "공격 방법", desc: "무기가 자동으로 근처 적을 공격합니다", icon: "⚔️", condition: () => true },
  { id: "collect", title: "아이템 수집", desc: "경험치와 골드를 떨어뜨리는 적을 처치하세요", icon: "💎", condition: (g) => g.killCount >= 3 },
  { id: "levelup", title: "레벨업", desc: "경험치를 모아 레벨이 오르면 무기를 강화하세요", icon: "⬆️", condition: (g) => g.level >= 2 },
  { id: "weapon", title: "새 무기 획득", desc: "레벨업 시 다른 무기를 선택할 수 있습니다", icon: "🎁", condition: (g) => g.weapons.length >= 2 },
  { id: "chest", title: "보물상자", desc: "보스나 엘리트 적을 처치하면 보물상자가 떨어집니다", icon: "📦", condition: (g) => g.chests && g.chests.length > 0 },
  { id: "powerup", title: "파워업", desc: "적을 처치하면 파워업을 떨어뜨립니다", icon: "✨", condition: (g) => g.powerupDrops && g.powerupDrops.length > 0 },
  { id: "boss", title: "보스戰", desc: "5분 후 보스가 등장합니다.全力以赴!", icon: "👹", condition: (g) => g.elapsed >= 300 },
];

function loadTutorialProgress() { return _load("yokai_tutorial", { completed: [], currentStep: 0, firstTime: true }); }
function saveTutorialProgress(v) { _save("yokai_tutorial", v); }
function showTutorialStep(step) {
  const tut = loadTutorialProgress();
  if (tut.completed.includes(step.id)) return null;
  return step;
}

/* ═══════════════════════════ GAME ═══════════════════════════ */
class Game {
  constructor() {
    this.cvs = document.getElementById("gc");
    this.ctx = this.cvs.getContext("2d");
    this.sfx = new Sfx();
    this.vfx = new VFX(); // Visual effects system
    this.keys = {}; this.touch = { active: false, dx: 0, dy: 0 };
    this.state = "menu";
    this.isMobile = "ontouchstart" in window;
    this.selectedChar = "exorcist";
    this.gold = loadGold();
    this.metaLvs = loadMeta();
    this.cStats = loadCStats();
    this.settings = loadSettings();
    this.unlocks = loadUnlocks();

    /* apply saved settings to audio */
    this.sfx.sfxVol = this.settings.sfxVol / 100;
    this.sfx.bgmVol = this.settings.bgmVol / 100;

    this._checkUnlocks();
    this._bindUI();
    this._bindInput();
    this._resize();
    window.addEventListener("resize", () => this._resize());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.state === "play") this._pause();
    });
    showBestRecord();
    this._updateMenuGold();
    this._hideLoading();
    this._raf();
  }

  /* ── LOADING SCREEN ── */
  _hideLoading() {
    const loadingScreen = document.getElementById("loading-screen");
    const loadingBar = document.getElementById("loading-bar");
    if (loadingBar) loadingBar.style.width = "100%";
    setTimeout(() => {
      if (loadingScreen) loadingScreen.classList.add("hidden");
    }, 300);
  }

  /* ── CHECK UNLOCKS ── */
  _checkUnlocks() {
    let changed = false;
    for (const [id, ch] of Object.entries(CHARACTERS)) {
      if (this.unlocks.characters.includes(id)) continue;
      if (ch.unlockCheck && ch.unlockCheck(this.cStats)) {
        this.unlocks.characters.push(id);
        changed = true;
        // Track in cStats for achievements
        if (!this.cStats.unlockedCharacters) this.cStats.unlockedCharacters = [];
        if (!this.cStats.unlockedCharacters.includes(id)) {
          this.cStats.unlockedCharacters.push(id);
        }
      }
    }
    if (changed) {
      saveUnlocks(this.unlocks);
      saveCStats(this.cStats);
    }
  }

  /* ── UI ── */
  _bindUI() {
    const $ = s => document.getElementById(s);
    this.ui = {
      hud: $("hud"), menu: $("screen-menu"), lvl: $("screen-lvl"),
      pause: $("screen-pause"), end: $("screen-end"),
      charSelect: $("screen-chars"), petScreen: $("screen-pet"), shop: $("screen-shop"), settings: $("screen-settings"),
      achievements: $("screen-achievements"), daily: $("screen-daily"),
      leaderboard: $("screen-leaderboard"),
      stageScreen: $("screen-stages"), stageClearScreen: $("screen-stage-clear"), gachaScreen: $("screen-gacha"),
      dailyChallenge: $("daily-challenge"), dailyBest: $("daily-best"),
      artifactScreen: $("screen-artifact"),
      stageList: $("stage-list"), chapterTabs: $("chapter-tabs"), stageTotalStars: $("stage-total-stars"),
      stageClearStars: $("stage-clear-stars"), stageClearStats: $("stage-clear-stats"),
      hpBar: $("hp-bar"), hpTxt: $("hp-txt"), xpBar: $("xp-bar"), lvTxt: $("lv-txt"),
      bossHpWrap: $("boss-hp-wrap"), bossHpBar: $("boss-hp-bar"),
      screenFlash: $("screen-flash"),
      timer: $("timer"), kills: $("kills"), wslots: $("weapon-slots"),
      choices: $("choices"), endTitle: $("end-title"), endStats: $("end-stats"),
      joyZone: $("joy-zone"), menuGold: $("menu-gold"), hudGold: $("hud-gold"),
      diffBadge: $("diff-badge"), charList: $("char-list"), petList: $("pet-list"),
      shopList: $("shop-list"), shopGold: $("shop-gold"),
      achievementList: $("achievement-list"), achievementProgress: $("achievement-progress"),
      goldEarned: $("gold-earned"), announceBar: $("announce-bar"),
      comboDisplay: $("combo-display"),
    };

    /* menu buttons */
    $("btn-play").onclick = () => this._showStageSelect();
    $("btn-shop").onclick = () => this._showShop();
    $("btn-achievements").onclick = () => this._showAchievements();
    $("btn-daily").onclick = () => this._showDaily();
    $("btn-leaderboard").onclick = () => this._showLeaderboard();
    $("btn-settings").onclick = () => this._showSettings();

    /* pet select buttons */
    $("btn-skip-pet").onclick = () => { this.chosenPet = null; this._startGame(); };

    /* leaderboard tabs */
    $("tab-easy").onclick = () => this._loadLeaderboard("easy");
    $("tab-normal").onclick = () => this._loadLeaderboard("normal");
    $("tab-hard").onclick = () => this._loadLeaderboard("hard");
    $("tab-nightmare").onclick = () => this._loadLeaderboard("nightmare");

    /* daily challenge */
    $("btn-start-daily").onclick = () => this._startDailyChallenge();
    $("btn-back-daily").onclick = () => this._showMenu();

    /* leaderboard */
    $("btn-back-leaderboard").onclick = () => this._showMenu();

    /* char select */
    $("btn-back-chars").onclick = () => this._showMenu();

    /* shop */
    $("btn-back-shop").onclick = () => this._showMenu();

    /* achievements */
    $("btn-back-achievements").onclick = () => this._showMenu();

    /* settings */
    $("btn-back-settings").onclick = () => { this._saveSettingsFromUI(); this._showMenu(); };

    /* gacha */
    if ($("btn-gacha")) $("btn-gacha").onclick = () => this._showGacha();
    if ($("btn-pull-normal")) $("btn-pull-normal").onclick = () => this._pullGacha("normal");
    if ($("btn-pull-10")) $("btn-pull-10").onclick = () => this._pullGacha("gold");
    if ($("btn-back-gacha")) $("btn-back-gacha").onclick = () => this._showMenu();

    /* stage selection */
    $("btn-back-stages").onclick = () => this._showMenu();

    /* stage clear */
    if ($("btn-retry-stage")) $("btn-retry-stage").onclick = () => this._startStage(this.selectedStage);
    if ($("btn-next-stage")) $("btn-next-stage").onclick = () => {
      const currentCh = parseInt(this.selectedStage.split("-")[0]);
      const nextStageId = `${currentCh}-${parseInt(this.selectedStage.split("-")[1]) + 1}`;
      if (STAGES[nextStageId]) {
        this.selectedStage = nextStageId;
        this._startStage(nextStageId);
      } else {
        this._showStageSelect();
      }
    };
    if ($("btn-stage-to-menu")) $("btn-stage-to-menu").onclick = () => { showBestRecord(); this._showMenu(); };

    /* in-game */
    $("btn-resume").onclick = () => this._unpause();
    $("btn-retry").onclick = () => { showBestRecord(); this._showCharSelect(); };
    $("btn-to-menu").onclick = () => { showBestRecord(); this._showMenu(); };
    $("btn-share").onclick = () => this._shareResult();

    if ($("btn-ngplus")) $("btn-ngplus").onclick = () => {
      this.settings.ngPlus = (this.settings.ngPlus || 0) + 1;
      saveSettings(this.settings);
      showBestRecord();
      this._showArtifactSelect();
    };

    /* sound toggle */
    this.ui.soundBtn = $("btn-sound");
    this.ui.volumePanel = $("volume-panel");
    this.ui.soundBtn.onclick = () => {
      // Toggle volume panel
      this.ui.volumePanel.classList.toggle("hidden");
    };
    // Volume sliders
    const sfxSlider = $("vol-sfx");
    const bgmSlider = $("vol-bgm");
    if (sfxSlider) {
      sfxSlider.value = this.settings.sfxVol || 50;
      sfxSlider.oninput = () => {
        this.settings.sfxVol = parseInt(sfxSlider.value);
        this.sfx.sfxVol = this.settings.sfxVol / 100;
        if (this.sfx.g) this.sfx.g.gain.value = this.sfx.sfxVol * 0.5;
      };
    }
    if (bgmSlider) {
      bgmSlider.value = this.settings.bgmVol || 30;
      bgmSlider.oninput = () => {
        this.settings.bgmVol = parseInt(bgmSlider.value);
        this.sfx.bgmVol = this.settings.bgmVol / 100;
        this.sfx.setBgmVol(this.sfx.bgmVol);
      };
    }
  }

  /* ── INPUT ── */
  _bindInput() {
    window.addEventListener("keydown", e => {
      this.keys[e.code] = true;
      if ((e.code === "Escape" || e.code === "KeyP") && (this.state === "play" || this.state === "pause")) {
        e.preventDefault();
        this.state === "play" ? this._pause() : this._unpause();
      }
    });
    window.addEventListener("keyup", e => { this.keys[e.code] = false; });

    const jz = this.ui.joyZone;
    let tId = null, ox = 0, oy = 0;
    jz.addEventListener("touchstart", e => {
      e.preventDefault(); this.sfx.resume();
      const t = e.changedTouches[0]; tId = t.identifier; ox = t.clientX; oy = t.clientY;
      this.touch.active = true; this.touch.ox = ox; this.touch.oy = oy;
      this.touch.kx = 0; this.touch.ky = 0;
    }, { passive: false });
    jz.addEventListener("touchmove", e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === tId) {
          const sens = (this.settings.joySens || 100) / 100;
          const dx = (t.clientX - ox) * sens, dy = (t.clientY - oy) * sens;
          const d = sqrt(dx * dx + dy * dy), mR = 60;
          if (d > mR) { this.touch.dx = dx / d; this.touch.dy = dy / d; }
          else { this.touch.dx = dx / mR; this.touch.dy = dy / mR; }
          this.touch.kx = clamp(dx, -mR, mR); this.touch.ky = clamp(dy, -mR, mR);
        }
      }
    }, { passive: false });
    const onEnd = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === tId) {
          tId = null; this.touch.active = false;
          this.touch.dx = 0; this.touch.dy = 0; this.touch.kx = 0; this.touch.ky = 0;
        }
      }
    };
    jz.addEventListener("touchend", onEnd);
    jz.addEventListener("touchcancel", onEnd);
    this.cvs.addEventListener("touchstart", e => { e.preventDefault(); this.sfx.resume(); }, { passive: false });
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    this.cvs.width = window.innerWidth * dpr;
    this.cvs.height = window.innerHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.sw = window.innerWidth; this.sh = window.innerHeight;
    // Fallback if canvas size is 0 (e.g., called before DOM ready)
    if (this.sw === 0 || this.sh === 0) {
      this.sw = 800; this.sh = 600;
    }
  }

  /* ── SCREEN NAVIGATION ── */
  _hideAll() {
    const screens = [this.ui.menu, this.ui.charSelect, this.ui.petScreen, this.ui.shop, this.ui.settings,
      this.ui.achievements, this.ui.daily, this.ui.leaderboard, this.ui.hud, this.ui.lvl, this.ui.pause, this.ui.end, this.ui.artifactScreen,
      this.ui.stageScreen, this.ui.stageClearScreen, this.ui.gachaScreen];
    for (const s of screens) if (s) s.classList.add("hidden");
    if (this.ui.joyZone) this.ui.joyZone.classList.add("hidden");
  }

  /* ── DOM ANNOUNCEMENTS ── */
  _showAnnouncement(text, duration) {
    const bar = this.ui.announceBar;
    if (!bar) return;
    // Reset animation by removing and re-adding the element
    bar.classList.remove("hidden");
    bar.textContent = text;
    // Force reflow to restart animation
    bar.style.animation = 'none';
    bar.offsetHeight; // Trigger reflow
    bar.style.animation = 'announceSlide 0.4s ease-out, announceFade 0.3s ease-out ' + (duration / 1000 - 0.3) + 's forwards';
    // Hide after duration
    if (this._announceTimeout) clearTimeout(this._announceTimeout);
    this._announceTimeout = setTimeout(() => {
      bar.classList.add("hidden");
    }, duration);
  }

  /* ── STAGE SELECTION ── */
  _showStageSelect() {
    this._hideAll();
    this.state = "stageSelect";
    const progress = loadStageProgress();

    // Update total stars display
    if (this.ui.stageTotalStars) {
      this.ui.stageTotalStars.textContent = "⭐ " + progress.totalStars;
    }

    // Render chapter tabs
    this._renderChapterTabs(progress);

    // Render first chapter stages
    this._renderStageList(1, progress);

    this.ui.stageScreen.classList.remove("hidden");
  }

  _renderChapterTabs(progress) {
    if (!this.ui.chapterTabs) return;
    this.ui.chapterTabs.innerHTML = "";
    for (const [chId, ch] of Object.entries(CHAPTERS)) {
      const btn = document.createElement("button");
      btn.className = "chapter-tab" + (this._currentChapter == chId ? " active" : "");
      btn.textContent = ch.emoji + " " + ch.name;
      const canUnlock = progress.totalStars >= ch.reqStars;
      btn.disabled = !canUnlock;
      btn.onclick = () => {
        this._currentChapter = parseInt(chId);
        this._renderChapterTabs(progress);
        this._renderStageList(parseInt(chId), progress);
      };
      this.ui.chapterTabs.appendChild(btn);
    }
  }

  _renderStageList(chapter, progress) {
    if (!this.ui.stageList) return;
    this.ui.stageList.innerHTML = "";
    const ch = CHAPTERS[chapter];
    if (!ch) return;

    for (const stageId of ch.stages) {
      const stage = STAGES[stageId];
      const unlocked = progress.unlockedStages.includes(stageId);
      const stars = progress.stars[stageId] || 0;

      const card = document.createElement("div");
      card.className = "stage-card" + (unlocked ? "" : " locked");
      card.innerHTML = `
        <div class="stage-icon">${chapter === 1 ? "🌲" : chapter === 2 ? "⛩️" : "🐉"}</div>
        <div class="stage-info">
          <div class="stage-name">${stage.name}</div>
          <div class="stage-desc">${stage.desc}</div>
          <span class="stage-difficulty ${stage.difficulty}">${DIFFICULTIES[stage.difficulty]?.emoji || ""} ${DIFFICULTIES[stage.difficulty]?.name || stage.difficulty}</span>
        </div>
        <div class="stage-stars">
          ${stars >= 1 ? "⭐" : "☆"}
          ${stars >= 2 ? "⭐" : "☆"}
          ${stars >= 3 ? "⭐" : "☆"}
        </div>
      `;

      if (unlocked) {
        card.onclick = () => {
          this.selectedStage = stageId;
          this._showCharSelect();
        };
      }

      this.ui.stageList.appendChild(card);
    }

    // Back button
    const backBtn = document.createElement("button");
    backBtn.className = "btn btn-secondary";
    backBtn.style.width = "100%";
    backBtn.style.marginTop = "8px";
    backBtn.textContent = "← 돌아가기";
    backBtn.onclick = () => this._showMenu();
    this.ui.stageList.appendChild(backBtn);
  }

  _showStageClear(time, stars) {
    this.state = "stageClear";
    if (this.ui.stageClearStars) {
      this.ui.stageClearStars.innerHTML = stars >= 1 ? "⭐⭐⭐" : stars >= 2 ? "⭐⭐" : "⭐";
    }
    if (this.ui.stageClearStats) {
      this.ui.stageClearStats.innerHTML = `시간: ${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, "0")} | 데미지: ${Math.floor(this.totalDmg).toLocaleString()}`;
    }
    this.ui.stageClearScreen.classList.remove("hidden");

    // Save progress
    const progress = loadStageProgress();
    const prevStars = progress.stars[this.selectedStage] || 0;
    if (!progress.stars[this.selectedStage] || progress.stars[this.selectedStage] < stars) {
      progress.stars[this.selectedStage] = stars;
    }
    progress.totalStars = Object.values(progress.stars).reduce((a, b) => a + b, 0);

    // Award gold spirit stones for first 3-star clear
    if (stars === 3 && prevStars < 3) {
      const gachaData = loadGachaData();
      gachaData.goldSpiritStones += 5;
      saveGachaData(gachaData);
      this._showAnnouncement("🌟 3스타 클리어! 황금영혼석 +5", 4000);
    }

    // Unlock next stage
    const stage = STAGES[this.selectedStage];
    const nextStageId = this.selectedStage.replace(/(\d+)-(\d+)/, (_, ch, st) => {
      const nextSt = parseInt(st) + 1;
      return CHAPTERS[ch].stages.includes(`${ch}-${nextSt}`) ? `${ch}-${nextSt}` : null;
    });
    if (nextStageId && !progress.unlockedStages.includes(nextStageId)) {
      progress.unlockedStages.push(nextStageId);
    }

    saveStageProgress(progress);
  }

  /* ── GACHA SYSTEM ── */
  _showGacha() {
    this._hideAll();
    this.state = "gacha";
    this.ui.gachaScreen.classList.remove("hidden");
    this._updateGachaUI();
  }

  _updateGachaUI() {
    const gachaData = loadGachaData();
    const ssEl = document.getElementById("spirit-stones");
    const gssEl = document.getElementById("gold-spirit-stones");
    if (ssEl) ssEl.textContent = gachaData.spiritStones;
    if (gssEl) gssEl.textContent = gachaData.goldSpiritStones;
    this._renderGhostInventory();
  }

  _renderGhostInventory() {
    const list = document.getElementById("ghost-list");
    if (!list) return;
    list.innerHTML = "";
    const gachaData = loadGachaData();

    for (const [ghostId, ghost] of Object.entries(GHOSTS)) {
      const count = gachaData.ghosts[ghostId] || 0;
      if (count === 0) continue;

      const item = document.createElement("div");
      item.className = "ghost-item";
      item.innerHTML = `
        <div class="ghost-icon" style="background:${this._getRarityColor(ghost.rarity)}">${ghost.emoji}</div>
        <div class="ghost-info">
          <div class="ghost-name">${ghost.name}</div>
          <div class="ghost-rarity ${ghost.rarity}">${ghost.rarity}</div>
        </div>
        <div class="ghost-count">x${count}</div>
      `;
      list.appendChild(item);
    }
  }

  _getRarityColor(rarity) {
    const colors = { N: "#888", R: "#4a90d9", SR: "#9b59b6", SSR: "#f39c12", UR: "#e74c3c" };
    return colors[rarity] || "#888";
  }

  _pullGacha(type) {
    const gachaData = loadGachaData();
    const cost = type === "gold" ? GACHA_COST.gold : GACHA_COST.normal;

    if (type === "normal" && gachaData.spiritStones < cost) {
      this._showAnnouncement("영혼석이 부족합니다!", 3000);
      return;
    }
    if (type === "gold" && gachaData.goldSpiritStones < cost) {
      this._showAnnouncement("황금영혼석이 부족합니다!", 3000);
      return;
    }

    // pullGacha handles cost deduction, inventory update, and saving
    const result = pullGacha(type, 1);
    if (!result) {
      this._showAnnouncement("가챠 실패!", 3000);
      return;
    }
    const pulled = result[0];

    // Show result
    this._showGachaResult(pulled);
    this._updateGachaUI();
  }

  _showGachaResult(ghost) {
    const resultDiv = document.getElementById("gacha-result");
    const pulledDiv = document.getElementById("pulled-ghosts");
    if (!resultDiv || !pulledDiv) return;

    resultDiv.classList.remove("hidden");
    pulledDiv.innerHTML = `
      <div class="pulled-ghost ${ghost.rarity}">
        <div class="ghost-emoji" style="background:${this._getRarityColor(ghost.rarity)}">${ghost.emoji}</div>
        <div class="ghost-name">${ghost.name}</div>
        <div class="ghost-rarity ${ghost.rarity}">${ghost.rarity}</div>
        <div class="ghost-effect">${ghost.effect}</div>
      </div>
    `;
  }

  _showMenu() {
    this._hideAll();
    this.state = "menu";
    this._updateMenuGold();
    showBestRecord();
    this.ui.menu.classList.remove("hidden");
    this.ui.end.classList.remove("victory", "defeat");
    this.sfx.bgmStop();
  }

  _updateMenuGold() {
    if (this.ui.menuGold) this.ui.menuGold.textContent = "💰 " + this.gold.toLocaleString();
  }

  /* ── CHARACTER SELECT ── */
  _showCharSelect() {
    this._hideAll();
    this.state = "charSelect";
    this.ui.charSelect.classList.remove("hidden");
    this._renderCharList();
  }

  _showPetSelect() {
    this._hideAll();
    this.state = "petSelect";
    this.ui.petScreen.classList.remove("hidden");
    this.chosenPet = null;
    this._renderPetList();
  }

  _renderPetList() {
    const box = this.ui.petList;
    while (box.firstChild) box.removeChild(box.firstChild);

    for (const [id, pet] of Object.entries(PETS)) {
      const card = document.createElement("div");
      card.className = "pet-card";
      if (id === this.chosenPet) card.classList.add("selected");

      const icon = document.createElement("div");
      icon.className = "pet-icon"; icon.textContent = pet.icon;

      const name = document.createElement("div");
      name.className = "pet-name"; name.textContent = pet.name;

      const desc = document.createElement("div");
      desc.className = "pet-desc"; desc.textContent = pet.desc;

      card.append(icon, name, desc);
      card.onclick = () => {
        this.chosenPet = id;
        // Skip artifact selection, go directly to game
        this._startGame();
      };
      box.appendChild(card);
    }
  }

  _renderCharList() {
    const box = this.ui.charList;
    while (box.firstChild) box.removeChild(box.firstChild);

    for (const [id, ch] of Object.entries(CHARACTERS)) {
      const card = document.createElement("div");
      card.className = "char-card";
      const isUnlocked = this.unlocks.characters.includes(id);

      if (!isUnlocked) card.classList.add("locked");
      if (id === this.selectedChar && isUnlocked) card.classList.add("selected");

      const icon = document.createElement("div");
      icon.className = "char-icon"; icon.textContent = isUnlocked ? ch.icon : "🔒";

      const name = document.createElement("div");
      name.className = "char-name"; name.textContent = ch.name;

      const desc = document.createElement("div");
      desc.className = "char-desc";
      desc.textContent = isUnlocked ? ch.desc : ch.unlockDesc;

      const stats = document.createElement("div");
      stats.className = "char-stats";
      if (isUnlocked) {
        const wpn = WDEFS[ch.startWeapon];
        stats.innerHTML =
          `<span>HP ${ch.hp}</span><span>속도 ${(ch.spd / 2.8 * 100).toFixed(0)}%</span>` +
          `<span>시작무기: ${wpn ? wpn.icon : ""} ${wpn ? wpn.name : ""}</span>`;
      }

      card.append(icon, name, desc, stats);
      if (isUnlocked) {
        card.onclick = () => {
          this.selectedChar = id;
          this._showPetSelect();
        };
      }
      box.appendChild(card);
    }
  }

  /* ── SHOP ── */
  _showShop() {
    this._hideAll();
    this.state = "shop";
    this.ui.shop.classList.remove("hidden");
    this._renderShop();
    this.sfx.playBgm("shop");
  }

  _renderShop() {
    const box = this.ui.shopList;
    while (box.firstChild) box.removeChild(box.firstChild);
    this.ui.shopGold.textContent = "💰 " + this.gold.toLocaleString();

    for (const [id, upg] of Object.entries(META_UPGRADES)) {
      const curLv = this.metaLvs[id] || 0;
      const isMaxed = curLv >= upg.maxLv;
      const cost = isMaxed ? 0 : upg.costs[curLv];
      const canBuy = !isMaxed && this.gold >= cost;

      const card = document.createElement("div");
      card.className = "shop-card" + (isMaxed ? " maxed" : "") + (canBuy ? " buyable" : "");

      const icon = document.createElement("span");
      icon.className = "shop-icon"; icon.textContent = upg.icon;

      const info = document.createElement("div");
      info.className = "shop-info";

      const nameRow = document.createElement("div");
      nameRow.className = "shop-name";
      nameRow.textContent = upg.name + (isMaxed ? " (MAX)" : ` Lv ${curLv}/${upg.maxLv}`);

      const descEl = document.createElement("div");
      descEl.className = "shop-desc"; descEl.textContent = upg.desc;

      const lvBar = document.createElement("div");
      lvBar.className = "shop-lv-bar";
      for (let i = 0; i < upg.maxLv; i++) {
        const pip = document.createElement("span");
        pip.className = "shop-pip" + (i < curLv ? " filled" : "");
        lvBar.appendChild(pip);
      }

      info.append(nameRow, descEl, lvBar);

      const costEl = document.createElement("div");
      costEl.className = "shop-cost";
      costEl.textContent = isMaxed ? "✓" : `💰 ${cost}`;

      card.append(icon, info, costEl);

      if (canBuy) {
        card.onclick = () => {
          this.gold -= cost;
          this.metaLvs[id] = curLv + 1;
          saveGold(this.gold); saveMeta(this.metaLvs);
          this.sfx.init(); this.sfx.resume(); this.sfx.coin();
          this._renderShop();
        };
      }
      box.appendChild(card);
    }
  }

  /* ── ACHIEVEMENTS ── */
  _showAchievements() {
    this._hideAll();
    this.state = "achievements";
    this.ui.achievements.classList.remove("hidden");

    const earned = loadAchievements();
    const total = Object.keys(ACHIEVEMENTS).length;
    const earnedCount = Object.keys(earned).length;

    // Update progress display
    const progressEl = this.ui.achievementProgress;
    if (progressEl) progressEl.textContent = "🏆 " + earnedCount + " / " + total;

    // Render achievement list
    const box = this.ui.achievementList;
    if (!box) return;
    box.innerHTML = "";

    for (const [id, a] of Object.entries(ACHIEVEMENTS)) {
      const isEarned = !!earned[id];
      const card = document.createElement("div");
      card.className = "achievement-card" + (isEarned ? " earned" : "");

      const icon = document.createElement("div");
      icon.className = "achievement-icon";
      icon.textContent = a.icon;

      const info = document.createElement("div");
      info.className = "achievement-info";
      const name = document.createElement("div");
      name.className = "achievement-name";
      name.textContent = a.name;
      const desc = document.createElement("div");
      desc.className = "achievement-desc";
      desc.textContent = a.desc;
      const reward = document.createElement("div");
      reward.className = "achievement-reward";
      reward.textContent = "보상: " + a.reward + " 💰";

      info.appendChild(name);
      info.appendChild(desc);
      info.appendChild(reward);

      const status = document.createElement("div");
      status.className = "achievement-status";
      status.textContent = isEarned ? "✅" : "🔒";

      card.appendChild(icon);
      card.appendChild(info);
      card.appendChild(status);
      box.appendChild(card);
    }
  }

  /* ── DAILY CHALLENGE ── */
  _showDaily() {
    this._hideAll();
    this.state = "daily";
    this.ui.daily.classList.remove("hidden");

    const challenge = getDailyChallenge();
    const stats = loadDailyStats();
    const today = new Date().toDateString();

    // Update challenge display
    const box = this.ui.dailyChallenge;
    box.innerHTML = "";

    const nameEl = document.createElement("div");
    nameEl.className = "daily-challenge-name";
    nameEl.textContent = "🎯 " + challenge.name;

    const descEl = document.createElement("div");
    descEl.className = "daily-challenge-desc";
    descEl.textContent = challenge.desc;

    const timerEl = document.createElement("div");
    timerEl.className = "daily-challenge-timer";
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const hoursLeft = Math.floor((tomorrow - now) / 3600000);
    const minsLeft = Math.floor(((tomorrow - now) % 3600000) / 60000);
    timerEl.textContent = "다음 챌린지까지: " + hoursLeft + "시간 " + minsLeft + "분";

    box.appendChild(nameEl);
    box.appendChild(descEl);
    box.appendChild(timerEl);

    // Update best record
    const bestEl = this.ui.dailyBest;
    if (stats.lastDate === today && stats.bestTime > 0) {
      const m = Math.floor(stats.bestTime / 60);
      const s = Math.floor(stats.bestTime % 60);
      bestEl.innerHTML = `<span class="daily-completed">✅ 오늘 클리어! 최고 기록: ${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}</span>`;
    } else if (stats.bestTime > 0) {
      const m = Math.floor(stats.bestTime / 60);
      const s = Math.floor(stats.bestTime % 60);
      bestEl.textContent = "최고 기록: " + String(m).padStart(2,"0") + ":" + String(s).padStart(2,"0");
    } else {
      bestEl.textContent = "오늘의 챌린지를 완료해보세요!";
    }
  }

  _startDailyChallenge() {
    this.dailyChallenge = getDailyChallenge();
    this.isDailyChallenge = true;
    this._showCharSelect();
  }

  /* ── LEADERBOARD ── */
  _showLeaderboard() {
    this._hideAll();
    this.state = "leaderboard";
    this.ui.leaderboard.classList.remove("hidden");

    // Update tab states
    const tabs = document.querySelectorAll(".tab-btn");
    tabs.forEach(t => t.classList.remove("active"));
    document.getElementById("tab-normal")?.classList.add("active");

    // Load default (normal) leaderboard
    this._loadLeaderboard("normal");
  }

  async _loadLeaderboard(difficulty) {
    // Update tab states
    const tabs = document.querySelectorAll(".tab-btn");
    tabs.forEach(t => t.classList.remove("active"));
    document.getElementById("tab-" + difficulty)?.classList.add("active");

    const box = document.getElementById("leaderboard-list");
    if (!box) return;

    // Show loading
    const loading = document.getElementById("leaderboard-loading");
    if (loading) loading.classList.remove("hidden");

    // Try to fetch online leaderboard
    let scores = [];
    if (isOnlineLeaderboardConfigured()) {
      scores = await fetchOnlineLeaderboard(difficulty);
    }

    // If no online data, use local scores as fallback
    if (scores.length === 0) {
      const localScores = loadScores();
      scores = localScores
        .filter(s => s.difficulty === difficulty && s.win)
        .sort((a, b) => a.time - b.time)
        .slice(0, 10)
        .map((s, i) => ({
          name: "나",
          time: s.time,
          kills: s.kills,
          level: s.level,
          character: s.character,
          rank: i + 1
        }));
    } else {
      scores = scores.map((s, i) => ({
        ...s,
        rank: i + 1
      }));
    }

    // Hide loading
    if (loading) loading.classList.add("hidden");

    // Render
    box.innerHTML = "";
    if (scores.length === 0) {
      box.innerHTML = "<div style='text-align:center;color:rgba(255,255,255,.5);padding:20px;'>아직 기록이 없습니다</div>";
      return;
    }

    for (const s of scores) {
      const m = Math.floor(s.time / 60);
      const sec = Math.floor(s.time % 60);
      const ch = s.character ? CHARACTERS[s.character] : null;

      const entry = document.createElement("div");
      entry.className = "leaderboard-entry";

      const rankClass = s.rank === 1 ? "gold" : (s.rank === 2 ? "silver" : (s.rank === 3 ? "bronze" : ""));

      entry.innerHTML = `
        <div class="leaderboard-rank ${rankClass}">${s.rank}</div>
        <div class="leaderboard-info">
          <div class="leaderboard-name">${s.name || "Player"} ${ch ? ch.icon : ""}</div>
          <div class="leaderboard-stats">Lv ${s.level} | ${s.kills} 처치 | ${s.character ? CHARACTERS[s.character]?.name : ""}</div>
        </div>
        <div class="leaderboard-score">${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}</div>
      `;
      box.appendChild(entry);
    }
  }

  /* ── SETTINGS ── */
  _showSettings() {
    this._hideAll();
    this.state = "settings";
    this.ui.settings.classList.remove("hidden");
    /* populate current values */
    document.getElementById("sfx-vol").value = this.settings.sfxVol;
    document.getElementById("bgm-vol").value = this.settings.bgmVol;
    document.getElementById("sfx-val").textContent = this.settings.sfxVol + "%";
    document.getElementById("bgm-val").textContent = this.settings.bgmVol + "%";

    const diffSel = document.getElementById("diff-select");
    diffSel.innerHTML = "";
    const cStats = this.cStats;
    for (const [id, d] of Object.entries(DIFFICULTIES)) {
      if (d.unlockCheck && !d.unlockCheck(cStats)) continue;
      const opt = document.createElement("option");
      opt.value = id; opt.textContent = d.emoji + " " + d.name;
      if (id === this.settings.difficulty) opt.selected = true;
      diffSel.appendChild(opt);
    }

    /* map selection */
    const mapSel = document.getElementById("map-select");
    if (mapSel) {
      mapSel.innerHTML = "";
      for (const [id, m] of Object.entries(MAPS)) {
        const unlocked = m.unlocked || (m.unlockCheck && m.unlockCheck(cStats));
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = unlocked ? (m.emoji + " " + m.name) : ("🔒 " + (m.unlockDesc || m.name));
        opt.disabled = !unlocked;
        if (id === this.settings.map) opt.selected = true;
        mapSel.appendChild(opt);
      }
    }

    /* joystick sensitivity */
    const joySlider = document.getElementById("joy-sens");
    if (joySlider) {
      joySlider.value = this.settings.joySens || 100;
      document.getElementById("joy-val").textContent = (this.settings.joySens || 100) + "%";
      joySlider.oninput = (e) => {
        document.getElementById("joy-val").textContent = e.target.value + "%";
      };
    }

    /* game mode toggle */
    const gameModeSel = document.getElementById("game-mode-select");
    if (gameModeSel) {
      gameModeSel.value = this.settings.gameMode || 'normal';
      gameModeSel.onchange = () => {
        const infoRow = document.getElementById("timeattack-info");
        if (infoRow) {
          infoRow.classList.toggle("hidden", gameModeSel.value !== "timeAttack");
        }
      };
      // Show time attack info if selected
      if (this.settings.gameMode === 'timeAttack') {
        const infoRow = document.getElementById("timeattack-info");
        if (infoRow) infoRow.classList.remove("hidden");
      }
      // Show best time
      const bestEl = document.getElementById("timeattack-best");
      if (bestEl) {
        const best = loadBestTime('timeAttack');
        if (best < Infinity) {
          const m = Math.floor(best / 60), s = Math.floor(best % 60);
          bestEl.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        }
      }
    }

    /* live update listeners */
    document.getElementById("sfx-vol").oninput = (e) => {
      document.getElementById("sfx-val").textContent = e.target.value + "%";
    };
    document.getElementById("bgm-vol").oninput = (e) => {
      document.getElementById("bgm-val").textContent = e.target.value + "%";
    };
  }

  _saveSettingsFromUI() {
    this.settings.sfxVol = parseInt(document.getElementById("sfx-vol").value);
    this.settings.bgmVol = parseInt(document.getElementById("bgm-vol").value);
    this.settings.difficulty = document.getElementById("diff-select").value;
    const joyEl = document.getElementById("joy-sens");
    if (joyEl) this.settings.joySens = parseInt(joyEl.value);
    const mapEl = document.getElementById("map-select");
    if (mapEl && mapEl.selectedOptions.length && !mapEl.selectedOptions[0].disabled) this.settings.map = mapEl.value;
    const gameModeEl = document.getElementById("game-mode-select");
    if (gameModeEl) this.settings.gameMode = gameModeEl.value;
    saveSettings(this.settings);
    this.sfx.setSfxVol(this.settings.sfxVol / 100);
    this.sfx.setBgmVol(this.settings.bgmVol / 100);
  }

  /* ── ARTIFACT SELECT ── */
  _showArtifactSelect() {
    this._hideAll();
    this.state = "artifactSelect";
    const screen = this.ui.artifactScreen;
    if (!screen) { this.selectedArtifact = null; this._startGame(); return; }
    screen.classList.remove("hidden");
    const box = document.getElementById("artifact-list");
    if (!box) { this.selectedArtifact = null; this._startGame(); return; }
    while (box.firstChild) box.removeChild(box.firstChild);

    /* pick 3 random artifacts */
    const keys = Object.keys(ARTIFACTS);
    for (let i = keys.length - 1; i > 0; i--) {
      const j = floor(Math.random() * (i + 1));
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    const picks = keys.slice(0, 3);

    for (const id of picks) {
      const art = ARTIFACTS[id];
      const card = document.createElement("div");
      card.className = "choice-card";
      const ic = document.createElement("div"); ic.className = "choice-icon"; ic.textContent = art.icon;
      const nm = document.createElement("div"); nm.className = "choice-name"; nm.textContent = art.name;
      const ds = document.createElement("div"); ds.className = "choice-desc"; ds.textContent = art.desc;
      card.append(ic, nm, ds);
      card.onclick = () => {
        this.selectedArtifact = id;
        screen.classList.add("hidden");
        this._startGame();
      };
      box.appendChild(card);
    }

    /* skip option */
    const skip = document.createElement("div");
    skip.className = "choice-card"; skip.style.opacity = "0.6";
    const skIc = document.createElement("div"); skIc.className = "choice-icon"; skIc.textContent = "➡️";
    const skNm = document.createElement("div"); skNm.className = "choice-name"; skNm.textContent = "유물 없이 시작";
    skip.append(skIc, skNm);
    skip.onclick = () => {
      this.selectedArtifact = null;
      screen.classList.add("hidden");
      this._startGame();
    };
    box.appendChild(skip);
  }

  /* ── START GAME ── */
  _startGame() {
    // Safety check - if no character selected, use default
    if (!this.selectedChar || !CHARACTERS[this.selectedChar]) {
      console.warn("No character selected, using exorcist");
      this.selectedChar = "exorcist";
    }

    this.sfx.init(); this.sfx.resume(); this.sfx.bgmStart("gameStart"); _eid = 0;
    this._prevUnlocks = [...this.unlocks.characters]; // snapshot before run
    const cx = W / 2, cy = H / 2;
    const ch = CHARACTERS[this.selectedChar];
    const diff = DIFFICULTIES[this.settings.difficulty] || DIFFICULTIES.normal;
    const meta = this.metaLvs;

    /* base stats from character */
    let hp = ch.hp, spd = ch.spd, armor = ch.armor, magnetR = ch.magnetR;
    let dmgMul = ch.dmgMul, cdMul = ch.cdMul, xpMul = ch.xpMul;
    let regen = 0, goldMul = diff.goldMul;

    /* apply meta upgrades */
    hp += (meta.metaHp || 0) * 10;
    dmgMul *= 1 + (meta.metaDmg || 0) * 0.05;
    spd *= 1 + (meta.metaSpd || 0) * 0.03;
    armor += (meta.metaArmor || 0);
    magnetR += (meta.metaMagnet || 0) * 10;
    cdMul *= Math.pow(0.97, meta.metaCd || 0);
    xpMul *= 1 + (meta.metaXp || 0) * 0.05;
    regen += (meta.metaRegen || 0) * 0.3;
    goldMul *= 1 + (meta.metaGold || 0) * 0.1;

    /* apply difficulty xp modifier */
    xpMul *= diff.xpMul;

    /* Game mode specific modifiers */
    if (this.gameMode === "endless") {
      // Endless: faster enemy scaling, more gold
      this._endlessMode = true;
      goldMul *= 1.5;
      xpMul *= 1.3;
    } else if (this.gameMode === "timeAttack") {
      // Time Attack: faster, less XP, focus on speed
      xpMul *= 0.7;
      this._timeAttackMode = true;
    } else if (this.gameMode === "survival") {
      // Survival: extreme scaling but more rewards
      this._survivalMode = true;
      spd *= 1.1;
    }

    /* NG+ scaling */
    const ngLv = this.settings.ngPlus || 0;
    if (ngLv > 0) {
      const ngScale = 1 + ngLv * 0.5; /* each NG+ = enemies +50% harder */
      this._ngHpMul = ngScale;
      this._ngDmgMul = 1 + ngLv * 0.3;
      this._ngGoldMul = 1 + ngLv * 0.3;
      goldMul *= this._ngGoldMul;
    } else {
      this._ngHpMul = 1; this._ngDmgMul = 1; this._ngGoldMul = 1;
    }
    this.ngPlus = ngLv;

    /* apply artifact */
    this.artifact = this.selectedArtifact ? ARTIFACTS[this.selectedArtifact] : null;
    this.artifactId = this.selectedArtifact;
    if (this.artifact) {
      const eff = this.artifact.effect;
      if (eff === "dmgReduce20") this._artDmgReduce = 0.8;
      else this._artDmgReduce = 1;
      if (eff === "cdReduce15") cdMul *= 0.85;
      if (eff === "goldUp50") goldMul *= 1.5;
      if (eff === "xpUp25") xpMul *= 1.25;
      if (eff === "dmgUp15") dmgMul *= 1.15;
      if (eff === "spdUp20") spd *= 1.2;
      if (eff === "hpUp50") hp += 50;
    } else {
      this._artDmgReduce = 1;
    }

    /* apply daily challenge effects */
    if (this.dailyChallenge && this.dailyChallenge.effect) {
      const eff = this.dailyChallenge.effect;
      if (eff.spdMul) spd *= eff.spdMul;
      if (eff.dmgMul) dmgMul *= eff.dmgMul;
      if (eff.armorMul) armor *= eff.armorMul;
      if (eff.hpMul) hp *= eff.hpMul;
      if (eff.goldMul) goldMul *= eff.goldMul;
      if (eff.xpMul) xpMul *= eff.xpMul;
      if (eff.magnetMul) magnetR *= eff.magnetMul;
      if (eff.noRegen) regen = 0;
    }

    /* game mode */
    this.gameMode = this.settings.gameMode || 'normal';
    this.endless = (this.gameMode === 'endless') || !!this.settings.endless;

    /* time attack: faster spawn to complete quicker */
    if (this.gameMode === 'timeAttack') {
      this.spawnInterval = 800; // Faster spawns
    }

    /* detect synergy */
    this.activeSynergy = null;
    for (const syn of SYNERGIES) {
      if (syn.char === this.selectedChar && syn.wpn === ch.startWeapon) {
        this.activeSynergy = syn;
        break;
      }
    }

    this.diff = diff;
    this.goldMul = goldMul;
    this.charPassive = ch.passive;
    this.reviveAvail = (meta.metaRevive || 0) >= 1;
    this.reviveUsed = false;

    /* map setup */
    this.mapId = this.settings.map || "bamboo";
    this.mapDef = MAPS[this.mapId] || MAPS.bamboo;
    /* generate water zones for sea map */
    this.waterZones = [];
    if (this.mapDef.waterZones) {
      for (let i = 0; i < 6; i++) {
        this.waterZones.push({ x: rand(200, W - 200), y: rand(200, H - 200), r: rand(120, 220) });
      }
    }

    this.p = {
      x: cx, y: cy, r: 13, spd, hp, maxHp: hp,
      armor, magnetR, cdMul, xpMul, dmgMul, baseDmgMul: dmgMul, regen,
      invT: 0, flashT: 0, facing: 0,
    };
    // Ensure canvas has valid size before setting camera
    if (this.sw <= 0 || this.sh <= 0) this._resize();
    this.cam = { x: cx - this.sw / 2, y: cy - this.sh / 2 };
    this.shakeT = 0; this.shakeI = 0;
    this.weapons = []; this.passiveLvs = {};
    this._addWeapon(ch.startWeapon);
    this.projs = []; this.enemies = []; this.gems = []; this.particles = []; this.dmgNums = [];
    this.lightnings = []; this.frostWaves = []; this.clouds = []; this.enemyProjs = [];
    this.talismans = []; this.talismanT = 0;
    this.goldCoins = []; this.chests = [];
    this.windBursts = []; this.scytheSlashes = [];
    // Ambient floating spirits
    this.ambientSpirits = [];
    this.xp = 0; this.level = 1; this.xpNext = 10;
    this.elapsed = 0; this.killCount = 0; this.totalDmg = 0;
    this.goldEarned = 0; this.damageTaken = 0;
    /* combo system */
    this.combo = { count: 0, timer: 0, maxCombo: 0, lastKillTime: 0 };
    this.comboMultiplier = { dmg: 1, gold: 1, xp: 1 };
    /* power-up system */
    this.baseSpd = spd; this.baseDmgMul = dmgMul;
    this.activePowerups = {};
    this.powerupDrops = [];
    /* run stats for achievements */
    this.runStats = { powerupsCollected: 0, xpGained: 0, goldEarnedFromPet: 0 };
    /* pet system */
    this.pets = [];
    if (this.chosenPet) {
      this._spawnPet(this.chosenPet);
      // Apply pet passive effects
      const petDef = PETS[this.chosenPet];
      if (petDef.xpMul) this.p.xpMul = (this.p.xpMul || 1) * petDef.xpMul;
      if (petDef.goldMul) this.goldMul *= petDef.goldMul;
      if (petDef.dmgReduce) this._artDmgReduce *= (1 - petDef.dmgReduce);
    }
    this.spawnTimer = -1; this.spawnInterval = 1500;
    this.eliteTimer = 0;
    this.bossSpawned = false; this.allureT = 0; this.allureSrc = null;
    // Gameplay improvements: progressive scaling
    this.gameTimeScale = 1.0; // Enemies scale over time
    this.killStreak = 0; // Track consecutive kills
    this.lastKillTime = 0; // For streak tracking
    this.weaponTypesUsed = new Set(); // Track weapon diversity
    this.bladeAngle = 0; this.beadsAngle = 0; this.pendingLevelUps = 0;
    this.announcements = []; this.lastWaveIdx = -1;
    // Reset VFX at game start
    this.vfx.reset();

    this._hideAll();
    this.ui.hud.classList.remove("hidden");
    if (this.isMobile) this.ui.joyZone.classList.remove("hidden");
    this.state = "play"; this.lastT = performance.now();
    this._initialBgmPlayed = false;
    this._bgmCooldown = 0;
    this._refreshWeaponSlots();
  }

  _addWeapon(type) { this.weapons.push({ type, lv: 0, lastFire: 0, hitMap: new Map() }); }
  _pause() { this.state = "pause"; this.ui.pause.classList.remove("hidden"); }
  _unpause() { this.state = "play"; this.ui.pause.classList.add("hidden"); this.lastT = performance.now(); }

  /* ── RAF ── */
  _raf() {
    const now = performance.now();
    if (this.state === "play") {
      const dt = min((now - this.lastT) / 1000, 0.05); this.lastT = now; this._update(dt);
    } else this.lastT = now;
    this._render();
    requestAnimationFrame(() => this._raf());
  }

  /* ═══════════════════ UPDATE ═══════════════════ */
  _update(dt) {
    this.elapsed += dt;

    // Spawn ambient spirits periodically (floating fireflies)
    if (this.ambientSpirits.length < 15 && Math.random() < 0.02) {
      this.ambientSpirits.push({
        x: rand(50, W - 50), y: rand(50, H - 50),
        vx: rand(-5, 5), vy: rand(-3, 3),
        r: rand(2, 4), life: rand(8, 15), maxLife: rand(8, 15),
        col: Math.random() > 0.5 ? "#ffd700" : "#00e5ff",
        phase: rand(0, TAU),
      });
    }
    // Update ambient spirits
    this.ambientSpirits = this.ambientSpirits.filter(s => {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx += rand(-2, 2) * dt;
      s.vy += rand(-2, 2) * dt;
      s.vx = clamp(s.vx, -15, 15);
      s.vy = clamp(s.vy, -10, 10);
      // Keep in bounds
      if (s.x < 20) s.vx += 5;
      if (s.x > W - 20) s.vx -= 5;
      if (s.y < 20) s.vy += 5;
      if (s.y > H - 20) s.vy -= 5;
      return s.life > 0;
    });

    // BGM cooldown
    if (this._bgmCooldown > 0) this._bgmCooldown -= dt;

    /* combo timer countdown (3 second window) */
    if (this.combo.count > 0) {
      this.combo.timer -= dt;
      if (this.combo.timer <= 0) {
        this.combo.count = 0;
        this.comboMultiplier = { dmg: 1, gold: 1, xp: 1 };
        this._updateComboUI();
      }
    }

    /* dynamic BGM based on time */
    this._updateBgm();

    /* apply power-up buffs */
    let spdMul = 1, dmgMul = this.baseDmgMul || 1;
    if (this.activePowerups.speed) spdMul += this.activePowerups.speed.val;
    if (this.activePowerups.dmg) dmgMul *= (1 + this.activePowerups.dmg.val);
    this.p.spd = this.baseSpd * spdMul;
    this.p.dmgMul = dmgMul;

    /* invincibility check */
    if (this.activePowerups.inv) {
      this.p.invT = 0.1;
    }

    /* player movement */
    let mx = 0, my = 0;
    if (this.keys.KeyW || this.keys.ArrowUp) my = -1;
    if (this.keys.KeyS || this.keys.ArrowDown) my = 1;
    if (this.keys.KeyA || this.keys.ArrowLeft) mx = -1;
    if (this.keys.KeyD || this.keys.ArrowRight) mx = 1;
    if (this.touch.active) { mx = this.touch.dx; my = this.touch.dy; }
    const ml = sqrt(mx * mx + my * my);
    if (ml > 0.1) {
      const [nx, ny] = norm(mx, my);
      this.p.x = clamp(this.p.x + nx * this.p.spd * dt * 60, this.p.r, W - this.p.r);
      this.p.y = clamp(this.p.y + ny * this.p.spd * dt * 60, this.p.r, H - this.p.r);
      this.p.facing = atan2(ny, nx);
    }

    /* allure pull */
    if (this.allureT > 0) {
      this.allureT -= dt;
      if (this.allureSrc) {
        const a = atan2(this.allureSrc.y - this.p.y, this.allureSrc.x - this.p.x);
        this.p.x += cos(a) * 1.5 * dt * 60; this.p.y += sin(a) * 1.5 * dt * 60;
        this.p.x = clamp(this.p.x, this.p.r, W - this.p.r);
        this.p.y = clamp(this.p.y, this.p.r, H - this.p.r);
      }
    }

    /* regen */
    if (this.p.regen > 0) this.p.hp = min(this.p.hp + this.p.regen * dt, this.p.maxHp);
    if (this.p.invT > 0) this.p.invT -= dt;
    if (this.p.flashT > 0) this.p.flashT -= dt;

    /* character passives */
    if (this.charPassive === "lowHpBoost") {
      const hpRatio = this.p.hp / this.p.maxHp;
      this.p.dmgMul = this.p.baseDmgMul * (1 + (1 - hpRatio) * 0.8);
    } else if (this.charPassive === "growingPower") {
      /* 산신령: every 60s, +8% dmg */
      this.p.dmgMul = this.p.baseDmgMul * (1 + floor(this.elapsed / 60) * 0.08);
    } else if (this.charPassive === "waterAffinity" && this.waterZones.length) {
      /* 해녀: in water zones, +30% dmg, +20% speed */
      let inWater = false;
      for (const wz of this.waterZones) if (dist(this.p, wz) < wz.r) { inWater = true; break; }
      this.p.dmgMul = this.p.baseDmgMul * (inWater ? 1.3 : 1);
      this.p.spd = (CHARACTERS[this.selectedChar].spd * (1 + (this.metaLvs.metaSpd || 0) * 0.03)) * (inWater ? 1.2 : 1);
    }

    /* spawn */
    this._spawnEnemies(dt);
    /* elite spawn */
    this._spawnElite(dt);
    /* boss */
    if (!this.bossSpawned && this.elapsed >= BOSS_TIME) { this.bossSpawned = true; this._spawnBoss(); }
    /* wave announcements */
    this._checkWaveAnnouncements();
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
    /* wind bursts */
    this._updateWindBursts(dt);
    /* lightnings */
    this.lightnings = this.lightnings.filter(l => { l.t -= dt; return l.t > 0; });
    /* gems */
    this._updateGems(dt);
    /* gold coins */
    this._updateGoldCoins(dt);
    /* treasure chests */
    this._updateChests(dt);
    /* talismans */
    this._updateTalismans(dt);
    /* power-ups */
    this._updatePowerups(dt);
    /* pets */
    this._updatePets(dt);
    /* fx */
    this.particles = this.particles.filter(p => {
      p.x += p.vx * dt * 60; p.y += p.vy * dt * 60;
      p.life -= dt; p.a = max(0, p.life / p.maxLife); return p.life > 0;
    });
    this.dmgNums = this.dmgNums.filter(d => {
      d.y -= 40 * dt; d.life -= dt; d.a = max(0, d.life / d.maxLife); return d.life > 0;
    });
    /* vfx update */
    this.vfx.update(dt);
    /* scythe slashes */
    if (this.scytheSlashes) this.scytheSlashes = this.scytheSlashes.filter(s => { s.t -= dt; return s.t > 0; });
    /* water zone enemy slow */
    if (this.waterZones.length) {
      for (const e of this.enemies) {
        let inW = false;
        for (const wz of this.waterZones) if (dist(e, wz) < wz.r) { inW = true; break; }
        if (inW && e.slowT <= 0) { e.slowT = 0.2; e.slowF = 0.5; }
      }
    }
    /* announcements */
    this.announcements = this.announcements.filter(a => { a.life -= dt; return a.life > 0; });

    /* camera */
    const tx = this.p.x - this.sw / 2, ty = this.p.y - this.sh / 2;
    this.cam.x = lerp(this.cam.x, tx, 0.08); this.cam.y = lerp(this.cam.y, ty, 0.08);
    // Add VFX screen shake to camera
    this.cam.x += this.vfx.screenShake.x;
    this.cam.y += this.vfx.screenShake.y;
    if (this.shakeT > 0) {
      this.cam.x += rand(-this.shakeI, this.shakeI);
      this.cam.y += rand(-this.shakeI, this.shakeI);
      this.shakeT -= dt;
    }

    /* HUD */
    this._updateHUD();
    /* lvl up */
    if (this.pendingLevelUps > 0 && this.state === "play") {
      this.pendingLevelUps--;
      // Level-up visual effects
      this._spawnParticles(this.p.x, this.p.y, 20, "#ffd700");
      this._shake(3, 0.1);
      this.lightnings.push({ x: this.p.x, y: this.p.y, r: 0, maxR: 60, life: 0.4, maxLife: 0.4, col: "#ffd700" });
      this._showLevelUp();
    }
    /* victory (skip in endless mode) */
    const surviveTime = this.selectedStage ? STAGES[this.selectedStage].clearTime : SURVIVE;
    if (this.elapsed >= surviveTime && !this.endless) this._victory();
    /* endless mode: spawn extra boss every 5 min after 10 min */
    if (this.endless && this.elapsed >= SURVIVE) {
      const extra = floor((this.elapsed - SURVIVE) / 300);
      if (extra > (this._endlessBossCount || 0)) {
        this._endlessBossCount = extra;
        this._spawnBoss();
      }
    }
  }

  /* ── WAVE ANNOUNCEMENTS ── */
  _checkWaveAnnouncements() {
    for (let i = 0; i < WAVE_NAMES.length; i++) {
      if (i <= this.lastWaveIdx) continue;
      if (this.elapsed >= WAVE_NAMES[i].t) {
        this.lastWaveIdx = i;
        this.announcements.push({ text: WAVE_NAMES[i].text, life: 3, maxLife: 3 });
        this.sfx.announce();
      }
    }
  }

  /* ── SPAWN ── */
  _spawnEnemies(dt) {
    const mf = this.elapsed / 60;
    const spdMul = this.diff.spawnMul;
    // Progressive difficulty scaling: becomes harder over time
    // Each minute: enemies get slightly stronger and more numerous
    this.gameTimeScale = 1 + mf * 0.05; // 5% per minute
    const difficultyScale = 1 + mf * 0.08; // 분당 8%씩 증가
    this.spawnInterval = max(200, (1500 - mf * 120) / spdMul / difficultyScale);
    this.spawnTimer -= dt * 1000; if (this.spawnTimer > 0) return;
    this.spawnTimer = this.spawnInterval;
    /* hard cap total enemies to prevent frame drops */
    if (this.enemies.length >= 300) return;
    const count = min(15, 2 + floor(mf * 1.1 * spdMul * difficultyScale));

    // Performance: skip spawn if too many objects
    if (this.enemies.length + this.projs.length + this.gems.length + this.goldCoins.length > 500) return;
    let types = ["dokkaebi"];
    const spawnTbl = (this.mapDef && this.mapDef.spawnOverride) || SPAWN_TBL;
    for (const row of spawnTbl) if (this.elapsed >= row.t) types = row.types;
    // Add boss waves at specific times for dramatic moments
    if (this.elapsed >= BOSS_TIME && !this.bossSpawned && mf >= 5) {
      this._spawnBoss();
    }
    for (let i = 0; i < count; i++) {
      const etype = pick(types);
      if (etype === "wisp") {
        const grp = rInt(4, 7), angle = rand(0, TAU), bd = rand(420, 560);
        for (let j = 0; j < grp; j++) {
          const ox = rand(-30, 30), oy = rand(-30, 30);
          const x = this.p.x + cos(angle) * bd + ox, y = this.p.y + sin(angle) * bd + oy;
          if (x < 0 || x > W || y < 0 || y > H) continue;
          this._spawnEnemy("wisp", x, y, mf);
        }
        continue;
      }
      const angle = rand(0, TAU), d = rand(420, 560);
      const x = this.p.x + cos(angle) * d, y = this.p.y + sin(angle) * d;
      if (x < 0 || x > W || y < 0 || y > H) continue;
      this._spawnEnemy(etype, x, y, mf);
    }
  }

  _spawnEnemy(type, x, y, mf) {
    const def = ETYPES[type];
    // Apply progressive scaling + difficulty + NG+
    const progressiveScale = this.gameTimeScale || 1;
    const hpS = (1 + mf * 0.12) * progressiveScale;
    const diff = this.diff;
    const ngHp = this._ngHpMul || 1, ngDmg = this._ngDmgMul || 1;
    this.enemies.push({
      id: ++_eid, type, x, y, r: def.r,
      hp: Math.round(def.hp * hpS * diff.hpMul * ngHp),
      maxHp: Math.round(def.hp * hpS * diff.hpMul * ngHp),
      spd: def.spd * diff.spdMul, col: def.col,
      dmg: Math.round(def.dmg * diff.dmgMul * ngDmg), xp: def.xp,
      boss: !!def.boss, elite: !!def.elite,
      hitT: 0, slowT: 0, slowF: 1,
      state: "chase", stateT: 0, atkT: 0, alpha: 1,
      targetX: 0, targetY: 0, chargeA: 0,
      frozenT: 0, frozenD: 0, frozenR: 0,
      summonT: 0, allureT: 0,
      dotT: 0, dotDmg: 0, dotDur: 0,
    });
  }

  _spawnElite(dt) {
    this.eliteTimer += dt;
    if (this.eliteTimer >= ELITE_INTERVAL && this.elapsed >= 90) {
      this.eliteTimer = 0;
      const angle = rand(0, TAU), d = rand(400, 550);
      const x = clamp(this.p.x + cos(angle) * d, 40, W - 40);
      const y = clamp(this.p.y + sin(angle) * d, 40, H - 40);
      /* rotate mini-bosses: imugi → dokkaKing → haetae → repeat */
      const elitePool = ["imugi", "dokkaKing", "haetae"];
      const eliteNames = { imugi: "⚠️ 이무기 출현!", dokkaKing: "👹 도깨비왕 출현!", haetae: "🦁 해태 출현!" };
      this._eliteIdx = ((this._eliteIdx || 0)) % elitePool.length;
      const etype = elitePool[this._eliteIdx];
      this._eliteIdx++;
      this._spawnEnemy(etype, x, y, this.elapsed / 60);
      this.announcements.push({ text: eliteNames[etype] || "⚠️ 엘리트 출현!", life: 2.5, maxLife: 2.5 });
      this.sfx.boss();
    }
  }

  _updateBgm() {
    if (!this.sfx.bgmPlaying) return;

    // BGM change cooldown (prevent rapid switches)
    if (this._bgmCooldown && this._bgmCooldown > 0) return;

    // Keep initial BGM throughout the game (no dynamic changes)
    // Only play once at start
    if (!this._initialBgmPlayed) {
      this.sfx.playBgm("battleEarly");
      this._initialBgmPlayed = true;
      this._bgmCooldown = 2;
      return;
    }

    // Only change if different (rare cases like pause/unpause)
    if (this.sfx.currentBgm !== "battleEarly" && this.sfx.currentBgm !== "battleMid" && this.sfx.currentBgm !== "battleLate") {
      this.sfx.playBgm("battleEarly");
      this._bgmCooldown = 2;
    }
  }

  _spawnBoss() {
    const def = ETYPES.gumiho, angle = rand(0, TAU);
    const diff = this.diff;
    const x = clamp(this.p.x + cos(angle) * 500, 40, W - 40);
    const y = clamp(this.p.y + sin(angle) * 500, 40, H - 40);
    this.enemies.push({
      id: ++_eid, type: "gumiho", x, y, r: def.r,
      hp: Math.round(def.hp * diff.hpMul), maxHp: Math.round(def.hp * diff.hpMul),
      spd: def.spd * diff.spdMul, col: def.col,
      dmg: Math.round(def.dmg * diff.dmgMul), xp: def.xp,
      boss: true, elite: false,
      hitT: 0, slowT: 0, slowF: 1,
      state: "chase", stateT: 0, atkT: 0, alpha: 1,
      targetX: 0, targetY: 0, chargeA: 0,
      frozenT: 0, frozenD: 0, frozenR: 0,
      summonT: 0, allureT: 0,
      dotT: 0, dotDmg: 0, dotDur: 0,
    });
    this.sfx.boss(); this._shake(12, 0.5);
    // Screen flash for boss spawn
    this._flashScreen("boss", 0.3);
    // VFX: boss spawn explosion
    this.vfx.addParticle(x, y, { vx: rand(-150, 150), vy: rand(-150, 150), life: 1.2, count: 25, col: "#ffd700", r: rand(4, 8), grav: 80 });
    this.vfx.addHitSpark(x, y, "#ffd700", 20);
    this.announcements.push({ text: "🦊 구미호 출현!", life: 3, maxLife: 3 });
  }

  /* ── WEAPONS ── */
  /* synergy helper: get synergy-boosted lv stats */
  _synLv(w, lv) {
    if (!this.activeSynergy || this.activeSynergy.bonus.wpnType !== w.type) return lv;
    const b = this.activeSynergy.bonus;
    const out = { ...lv };
    if (b.wpnDmgMul) out.dmg = Math.round((out.dmg || 0) * b.wpnDmgMul);
    if (b.wpnCdMul && out.cd) out.cd = Math.round(out.cd * b.wpnCdMul);
    if (b.wpnRadMul && out.rad) out.rad = Math.round(out.rad * b.wpnRadMul);
    if (b.wpnStunMul && out.stunT) out.stunT = out.stunT * b.wpnStunMul;
    if (b.wpnExtra) {
      if (out.st !== undefined) out.st += b.wpnExtra;
      if (out.prc !== undefined) out.prc += b.wpnExtra;
    }
    return out;
  }

  _updateWeapons(dt) {
    const now = this.elapsed * 1000;
    for (const w of this.weapons) {
      const def = getWDef(w.type), rawLv = def.lvs[w.lv];
      const lv = this._synLv(w, rawLv);
      switch (w.type) {
        case "blade": case "ghostSlash": this._wpnBlade(w, lv, dt, w.type); break;
        case "fire": case "ghostFlame": this._wpnFire(w, lv, now, w.type); break;
        case "lightning": this._wpnLightning(w, lv, now); break;
        case "thunderIce": this._wpnThunderIce(w, lv, now); break;
        case "frost": this._wpnFrost(w, lv, now); break;
        case "curseMist": this._wpnCurseMist(w, lv, now); break;
        case "aura": this._wpnAura(w, lv, dt); break;
        case "beads": case "divineWind": this._wpnBeads(w, lv, dt, w.type); break;
        case "windSpirit": this._wpnWind(w, lv, now); break;
        case "scythe": case "deathQuake": this._wpnScythe(w, lv, now, w.type); break;
        case "quake": this._wpnQuake(w, lv, now); break;
        case "trident": case "tidalStorm": this._wpnTrident(w, lv, now, w.type); break;
        case "kunai": this._wpnKunai(w, lv, now); break;
        case "dragonBreath": this._wpnDragonBreath(w, lv, now); break;
        case "spiritChain": this._wpnSpiritChain(w, lv, now); break;
        case "mirror": this._wpnMirror(w, lv, now); break;
        case "bambooSpear": this._wpnBambooSpear(w, lv, now); break;
      }
    }
  }

  _wpnBlade(w, lv, dt, type) {
    this.bladeAngle += lv.spd * dt;
    const step = TAU / lv.cnt;
    for (const [id, t] of w.hitMap) if (this.elapsed - t > 0.35) w.hitMap.delete(id);
    for (let i = 0; i < lv.cnt; i++) {
      const a = this.bladeAngle + step * i;
      const bx = this.p.x + cos(a) * lv.rad, by = this.p.y + sin(a) * lv.rad;
      // VFX: weapon trail
      this.vfx.addWeaponTrail(bx, by, w.type, a);
      for (const e of this.enemies) {
        if (sqrt((bx - e.x) ** 2 + (by - e.y) ** 2) < e.r + 10 && !w.hitMap.has(e.id)) {
          w.hitMap.set(e.id, this.elapsed);
          this._damageEnemy(e, lv.dmg);
          this.sfx.hit();
        }
      }
    }
  }

  _wpnFire(w, lv, now, type) {
    const cd = lv.cd * this.p.cdMul; if (now - w.lastFire < cd) return; w.lastFire = now;
    const sorted = [...this.enemies].sort((a, b) => dist(a, this.p) - dist(b, this.p));
    const targets = sorted.slice(0, lv.cnt); if (!targets.length) return;
    this.sfx.wpn(type);
    // Weapon fire visual effect
    this.vfx.addWeaponTrail(this.p.x, this.p.y, type, 0);
    this.vfx.addParticle(this.p.x, this.p.y, { vx: rand(-20, 20), vy: rand(-20, 20), life: 0.3, count: 3, col: "#fff", r: rand(2, 4) });
    for (const tgt of targets) {
      const a = atan2(tgt.y - this.p.y, tgt.x - this.p.x);
      this.projs.push({
        x: this.p.x, y: this.p.y, vx: cos(a) * lv.spd, vy: sin(a) * lv.spd,
        dmg: lv.dmg, r: 6, prc: lv.prc, col: type === "ghostFlame" ? "#ff6d00" : "#ff9800",
        life: 3, maxLife: 3, type, hitSet: new Set(),
      });
    }
  }

  _wpnLightning(w, lv, now) {
    const cd = lv.cd * this.p.cdMul; if (now - w.lastFire < cd) return; w.lastFire = now;
    const inR = this.enemies.filter(e => dist(e, this.p) < 350); if (!inR.length) return;
    this.sfx.wpn("lightning");
    // Lightning visual effect
    this.vfx.addParticle(this.p.x, this.p.y, { vx: rand(-30, 30), vy: rand(-30, 30), life: 0.4, count: 5, col: "#00e5ff", r: rand(3, 6) });
    for (let i = 0; i < lv.st && inR.length > 0; i++) {
      const idx = rInt(0, inR.length - 1), e = inR[idx];
      this._damageEnemy(e, lv.dmg);
      this.lightnings.push({ x1: this.p.x, y1: this.p.y, x2: e.x, y2: e.y, t: 0.2 });
      inR.splice(idx, 1);
    }
  }

  _wpnThunderIce(w, lv, now) {
    const cd = lv.cd * this.p.cdMul; if (now - w.lastFire < cd) return; w.lastFire = now;
    const inR = this.enemies.filter(e => dist(e, this.p) < 350); if (!inR.length) return;
    this.sfx.wpn("thunderIce");
    for (let i = 0; i < lv.st && inR.length > 0; i++) {
      const idx = rInt(0, inR.length - 1), e = inR[idx];
      this._damageEnemy(e, lv.dmg);
      this.lightnings.push({ x1: this.p.x, y1: this.p.y, x2: e.x, y2: e.y, t: 0.2, col: "#4dd0e1" });
      e.frozenT = lv.frzT; e.frozenD = lv.frzD; e.frozenR = lv.frzR;
      inR.splice(idx, 1);
    }
  }

  _wpnFrost(w, lv, now) {
    const cd = lv.cd * this.p.cdMul; if (now - w.lastFire < cd) return; w.lastFire = now;
    this.sfx.wpn("frost");
    // Frost wave visual effect
    this.vfx.addParticle(this.p.x, this.p.y, { vx: rand(-40, 40), vy: rand(-40, 40), life: 0.5, count: 8, col: "#80deea", r: rand(3, 6) });
    this.frostWaves.push({
      x: this.p.x, y: this.p.y, rad: 0, maxRad: lv.rad,
      dmg: lv.dmg, slow: lv.slow, dur: lv.dur, spd: 200, hitSet: new Set(),
    });
  }

  _wpnCurseMist(w, lv, now) {
    const cd = lv.cd * this.p.cdMul; if (now - w.lastFire < cd) return; w.lastFire = now;
    this.sfx.wpn("curseMist");
    // Curse mist visual effect
    this.vfx.addParticle(this.p.x, this.p.y, { vx: rand(-30, 30), vy: rand(-30, 30), life: 0.6, count: 6, col: "#9c27b0", r: rand(4, 8) });
    for (let i = 0; i < lv.cnt; i++) {
      const a = rand(0, TAU), d = rand(40, 180);
      this.clouds.push({
        x: this.p.x + cos(a) * d, y: this.p.y + sin(a) * d,
        rad: lv.rad, dmg: lv.dmg, tick: lv.tick, dur: lv.dur, tickT: 0, life: lv.dur,
      });
    }
  }

  _wpnAura(w, lv, dt) {
    w.lastFire = (w.lastFire || 0) + dt * 1000;
    const tick = lv.tick * this.p.cdMul;
    if (w.lastFire < tick) return; w.lastFire = 0; this.sfx.wpn("aura");
    for (const e of this.enemies) if (dist(e, this.p) < lv.rad + e.r) this._damageEnemy(e, lv.dmg);
  }

  /* NEW: beads / divineWind */
  _wpnBeads(w, lv, dt, type) {
    this.beadsAngle += lv.spd * dt;
    const step = TAU / lv.cnt;
    for (const [id, t] of w.hitMap) if (this.elapsed - t > 0.4) w.hitMap.delete(id);
    for (let i = 0; i < lv.cnt; i++) {
      const a = this.beadsAngle + step * i;
      const bx = this.p.x + cos(a) * lv.rad, by = this.p.y + sin(a) * lv.rad;
      for (const e of this.enemies) {
        if (sqrt((bx - e.x) ** 2 + (by - e.y) ** 2) < e.r + 8 && !w.hitMap.has(e.id)) {
          w.hitMap.set(e.id, this.elapsed);
          this._damageEnemy(e, lv.dmg);
          this.sfx.wpn(type);
          /* divineWind: knockback + DoT */
          if (type === "divineWind" && lv.kb) {
            const ka = atan2(e.y - this.p.y, e.x - this.p.x);
            e.x += cos(ka) * lv.kb * 0.5; e.y += sin(ka) * lv.kb * 0.5;
            e.x = clamp(e.x, e.r, W - e.r); e.y = clamp(e.y, e.r, H - e.r);
            if (lv.dotDmg) { e.dotDmg = lv.dotDmg; e.dotDur = lv.dotDur; e.dotT = 0; }
          }
        }
      }
    }
  }

  /* NEW: wind spirit burst */
  _wpnWind(w, lv, now) {
    const cd = lv.cd * this.p.cdMul; if (now - w.lastFire < cd) return; w.lastFire = now;
    this.sfx.wpn("windSpirit");
    this.windBursts.push({ x: this.p.x, y: this.p.y, rad: 0, maxRad: lv.rad, kb: lv.kb, dmg: lv.dmg, spd: 300, hitSet: new Set() });
  }

  _wpnScythe(w, lv, now, type) {
    const cd = lv.cd * this.p.cdMul; if (now - w.lastFire < cd) return; w.lastFire = now;
    this.sfx.wpn("blade");
    const halfArc = (lv.arc || 2.0) / 2;
    const facing = this.p.facing;
    const isEvolved = type === "deathQuake";
    for (const e of this.enemies) {
      const d = dist(e, this.p);
      if (d > (lv.rad || 100)) continue;
      const a = atan2(e.y - this.p.y, e.x - this.p.x);
      let da = a - facing; while (da > PI) da -= TAU; while (da < -PI) da += TAU;
      if (abs(da) < halfArc) {
        this._damageEnemy(e, lv.dmg);
        if (lv.stunT) { e.slowT = max(e.slowT, lv.stunT); e.slowF = 0; }
        if (isEvolved && lv.execPct && !e.boss && Math.random() < lv.execPct) {
          e.hp = 0; /* instant kill */
        }
      }
    }
    /* visual: arc slash */
    this.scytheSlashes = this.scytheSlashes || [];
    this.scytheSlashes.push({ x: this.p.x, y: this.p.y, facing, arc: lv.arc || 2.0, rad: lv.rad || 100, t: 0.25, col: isEvolved ? "#9c27b0" : "#b388ff" });
  }

  _wpnQuake(w, lv, now) {
    const cd = lv.cd * this.p.cdMul; if (now - w.lastFire < cd) return; w.lastFire = now;
    this.sfx.knockback(); this._shake(8, 0.3);
    for (const e of this.enemies) {
      if (dist(e, this.p) < lv.rad + e.r) {
        this._damageEnemy(e, lv.dmg);
        if (lv.stunT) { e.slowT = max(e.slowT, lv.stunT); e.slowF = 0; }
      }
    }
    /* visual: quake wave */
    this.windBursts.push({ x: this.p.x, y: this.p.y, rad: 0, maxRad: lv.rad, kb: 0, dmg: 0, spd: 250, hitSet: new Set(), col: "#8d6e63" });
  }

  _wpnTrident(w, lv, now, type) {
    const cd = lv.cd * this.p.cdMul; if (now - w.lastFire < cd) return; w.lastFire = now;
    const sorted = [...this.enemies].sort((a, b) => dist(a, this.p) - dist(b, this.p));
    const targets = sorted.slice(0, lv.cnt); if (!targets.length) return;
    this.sfx.wpn("frost");
    const isEvolved = type === "tidalStorm";
    for (const tgt of targets) {
      const a = atan2(tgt.y - this.p.y, tgt.x - this.p.x);
      this.projs.push({
        x: this.p.x, y: this.p.y, vx: cos(a) * lv.spd, vy: sin(a) * lv.spd,
        dmg: lv.dmg, r: 7, prc: lv.prc, col: isEvolved ? "#0288d1" : "#29b6f6",
        life: 3, maxLife: 3, type, hitSet: new Set(),
        frzChance: isEvolved ? (lv.frzChance || 0) : 0,
        frzDur: isEvolved ? (lv.frzDur || 0) : 0,
      });
    }
  }

  /* ── NEW WEAPONS ── */
  _wpnKunai(w, lv, now) {
    const cd = lv.cd * this.p.cdMul; if (now - w.lastFire < cd) return; w.lastFire = now;
    const sorted = [...this.enemies].sort((a, b) => dist(a, this.p) - dist(b, this.p));
    const targets = sorted.slice(0, lv.cnt); if (!targets.length) return;
    this.sfx.wpn("blade");
    for (const tgt of targets) {
      const a = atan2(tgt.y - this.p.y, tgt.x - this.p.x);
      this.projs.push({
        x: this.p.x, y: this.p.y, vx: cos(a) * lv.spd, vy: sin(a) * lv.spd,
        dmg: lv.dmg, r: 4, prc: lv.prc, col: "#90a4ae",
        life: 2.5, maxLife: 2.5, type: "kunai", hitSet: new Set(),
      });
    }
  }

  _wpnDragonBreath(w, lv, now) {
    const cd = lv.cd * this.p.cdMul; if (now - w.lastFire < cd) return; w.lastFire = now;
    // Create fire zone around player
    this.frostWaves.push({
      x: this.p.x, y: this.p.y, rad: 0, maxRad: lv.rad,
      spd: 80, dmg: lv.dmg, life: lv.dur, maxLife: lv.dur, hitSet: new Set(),
    });
    this.sfx.wpn("fire");
    this.vfx.addParticle(this.p.x, this.p.y, { vx: rand(-100, 100), vy: rand(-100, 100), life: 0.8, count: 15, col: "#ff5722", r: rand(4, 8), grav: 0 });
  }

  _wpnSpiritChain(w, lv, now) {
    const cd = lv.cd * this.p.cdMul; if (now - w.lastFire < cd) return; w.lastFire = now;
    // Chain nearby enemies
    const inR = this.enemies.filter(e => dist(e, this.p) < lv.rad);
    if (inR.length < 2) return;
    this.sfx.wpn("aura");
    // Create chain effect between enemies
    for (let i = 0; i < inR.length - 1 && i < lv.link - 1; i++) {
      const e1 = inR[i], e2 = inR[i + 1];
      this._damageEnemy(e1, lv.dmg);
      this._damageEnemy(e2, lv.dmg);
      // Visual chain
      this.vfx.addParticle((e1.x + e2.x) / 2, (e1.y + e2.y) / 2, { vx: 0, vy: 0, life: 0.3, count: 5, col: "#9c27b0", r: 3 });
    }
  }

  _wpnMirror(w, lv, now) {
    const cd = lv.cd * this.p.cdMul; if (now - w.lastFire < cd) return; w.lastFire = now;
    // Create mirror zones that reflect attacks
    for (let i = 0; i < lv.reflect; i++) {
      const a = rand(0, TAU), d = rand(80, 150);
      this.talismans.push({
        x: this.p.x + cos(a) * d, y: this.p.y + sin(a) * d,
        type: "mirror", r: 15, life: 5, dmg: lv.dmg, rad: lv.rad,
      });
    }
    this.sfx.wpn("frost");
  }

  _wpnBambooSpear(w, lv, now) {
    const cd = lv.cd * this.p.cdMul; if (now - w.lastFire < cd) return; w.lastFire = now;
    const sorted = [...this.enemies].sort((a, b) => dist(a, this.p) - dist(b, this.p));
    const target = sorted[0]; if (!target) return;
    this.sfx.wpn("blade");
    const a = atan2(target.y - this.p.y, target.x - this.p.x);
    // Long range piercing projectile
    this.projs.push({
      x: this.p.x, y: this.p.y, vx: cos(a) * 12, vy: sin(a) * 12,
      dmg: lv.dmg, r: 5, prc: lv.pierce, col: "#7cb342",
      life: 1.5, maxLife: 1.5, type: "bambooSpear", hitSet: new Set(), len: lv.len,
    });
  }

  /* ── PROJECTILES ── */
  _updateProjs(dt) {
    this.projs = this.projs.filter(p => {
      p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.life -= dt;
      if (p.life <= 0 || p.x < -50 || p.x > W + 50 || p.y < -50 || p.y > H + 50) return false;
      for (const e of this.enemies) {
        if (p.hitSet.has(e.id)) continue;
        if (dist(p, e) < p.r + e.r) {
          p.hitSet.add(e.id); this._damageEnemy(e, p.dmg); this.sfx.hit();
          // Projectile hit effect
          this.vfx.addParticle(p.x, p.y, { vx: rand(-30, 30), vy: rand(-30, 30), life: 0.3, count: 4, col: p.col || "#fff", r: rand(2, 4) });
          this.vfx.addHitSpark(p.x, p.y, p.col || "#fff", 6);
          /* tidalStorm freeze */
          if (p.frzChance && Math.random() < p.frzChance) {
            e.slowT = max(e.slowT, (p.frzDur || 1500) / 1000);
            e.slowF = 0.15;
          }
          p.prc--; if (p.prc <= 0) return false;
        }
      }
      return true;
    });
  }

  /* ── ENEMY PROJECTILES ── */
  _updateEnemyProjs(dt) {
    this.enemyProjs = this.enemyProjs.filter(p => {
      p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.life -= dt;
      if (p.life <= 0) return false;
      if (dist(p, this.p) < p.r + this.p.r && this.p.invT <= 0) {
        let raw = max(1, Math.round((p.dmg - this.p.armor) * (this._artDmgReduce || 1)));
        // Shield power-up reduces damage
        if (this.activePowerups.shield) {
          raw = Math.round(raw * (1 - this.activePowerups.shield.val));
          this.vfx.addParticle(this.p.x, this.p.y, { vx: rand(-30, 30), vy: rand(-40, -20), life: 0.3, count: 5, col: "#42a5f5", r: rand(2, 4) });
        }
        this.p.hp -= raw; this.p.invT = 0.5; this.p.flashT = 0.15; this.damageTaken += raw;
        this.sfx.dmg();
        // Screen flash on damage
        this._flashScreen("damage", 0.12);
        // VFX: player damage shake
        this.vfx.shake(6, 0.85);
        this._shake(4, 0.1);
        this._spawnParticles(this.p.x, this.p.y, 5, "#ef5350");
        // VFX: damage number
        this.vfx.addDamage(this.p.x, this.p.y - 20, raw, false, false);
        this.vfx.addHitSpark(this.p.x, this.p.y, "#ef5350", 8);
        this.dmgNums.push({ x: this.p.x, y: this.p.y - 20, txt: "-" + raw, col: "#ef5350", life: 0.8, maxLife: 0.8, a: 1, big: true });
        if (this.p.hp <= 0) { this.p.hp = 0; this._tryReviveOrGameOver(); }
        return false;
      }
      return true;
    });
  }

  /* ── FROST WAVES ── */
  _updateFrostWaves(dt) {
    this.frostWaves = this.frostWaves.filter(fw => {
      fw.rad += fw.spd * dt; if (fw.rad > fw.maxRad) return false;
      for (const e of this.enemies) {
        if (fw.hitSet.has(e.id)) continue;
        const d = dist(e, fw);
        if (d < fw.rad + e.r && d > fw.rad - 30) {
          fw.hitSet.add(e.id); this._damageEnemy(e, fw.dmg);
          e.slowT = fw.dur / 1000; e.slowF = fw.slow;
        }
      }
      return true;
    });
  }

  /* ── CLOUDS (curse mist) ── */
  _updateClouds(dt) {
    this.clouds = this.clouds.filter(c => {
      c.life -= dt; if (c.life <= 0) return false;
      c.tickT += dt * 1000;
      if (c.tickT >= c.tick) {
        c.tickT = 0;
        for (const e of this.enemies) if (dist(e, c) < c.rad + e.r) this._damageEnemy(e, c.dmg);
      }
      return true;
    });
  }

  /* ── WIND BURSTS ── */
  _updateWindBursts(dt) {
    this.windBursts = this.windBursts.filter(wb => {
      wb.rad += wb.spd * dt; if (wb.rad > wb.maxRad) return false;
      for (const e of this.enemies) {
        if (wb.hitSet.has(e.id)) continue;
        const d = dist(e, wb);
        if (d < wb.rad + e.r && d > wb.rad - 35) {
          wb.hitSet.add(e.id);
          this._damageEnemy(e, wb.dmg);
          /* knockback */
          const ka = atan2(e.y - wb.y, e.x - wb.x);
          e.x += cos(ka) * wb.kb; e.y += sin(ka) * wb.kb;
          e.x = clamp(e.x, e.r, W - e.r); e.y = clamp(e.y, e.r, H - e.r);
        }
      }
      return true;
    });
  }

  /* ── ENEMIES ── */
  _updateEnemies(dt) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.slowT > 0) e.slowT -= dt;
      const sm = e.slowT > 0 ? e.slowF : 1;
      // Slow field power-up slows all nearby enemies
      if (this.activePowerups.slowField && dist(e, this.p) < 200) {
        const slowFactor = this.activePowerups.slowField.val;
        const newSm = sm * (1 - slowFactor);
        if (newSm < sm) e.slowT = 0.2; // Keep refreshing slow
      }
      if (e.hitT > 0) e.hitT -= dt;
      e.stateT += dt;

      /* DoT ticks */
      if (e.dotDur > 0) {
        e.dotDur -= dt; e.dotT += dt;
        if (e.dotT >= 0.5) { e.dotT = 0; this._damageEnemy(e, e.dotDmg); }
      }

      /* frozen */
      if (e.frozenT > 0) {
        e.frozenT -= dt;
        if (e.frozenT <= 0) {
          for (const o of this.enemies) {
            if (o === e) continue;
            if (dist(o, e) < e.frozenR) this._damageEnemy(o, e.frozenD);
          }
          this._spawnParticles(e.x, e.y, 10, "#4dd0e1"); this.sfx.wpn("frost");
          e.frozenT = 0;
        }
      } else {
        /* AI dispatch */
        switch (e.type) {
          case "dokkaebi": this._aiDokkaebi(e, dt, sm); break;
          case "wisp": case "foxClone": this._aiChase(e, dt, sm); break;
          case "skeleton": this._aiSkeleton(e, dt, sm); break;
          case "ghost": this._aiGhost(e, dt, sm); break;
          case "gumiho": this._aiBoss(e, dt, sm); break;
          case "bulgasari": this._aiBulgasari(e, dt, sm); break;
          case "jangsan": this._aiJangsan(e, dt, sm); break;
          case "imugi": this._aiImugi(e, dt, sm); break;
          case "dokkaKing": this._aiDokkaKing(e, dt, sm); break;
          case "haetae": this._aiHaetae(e, dt, sm); break;
          default: this._aiChase(e, dt, sm); break;
        }
      }
      e.x = clamp(e.x, e.r, W - e.r); e.y = clamp(e.y, e.r, H - e.r);

      /* collision with player */
      if (dist(e, this.p) < e.r + this.p.r && this.p.invT <= 0 && e.alpha > 0.6) {
        let raw = max(1, Math.round((e.dmg - this.p.armor) * (this._artDmgReduce || 1)));
        // Shield power-up reduces damage
        if (this.activePowerups.shield) {
          raw = Math.round(raw * (1 - this.activePowerups.shield.val));
          this.vfx.addParticle(this.p.x, this.p.y, { vx: rand(-30, 30), vy: rand(-40, -20), life: 0.3, count: 5, col: "#42a5f5", r: rand(2, 4) });
        }
        this.p.hp -= raw; this.p.invT = 0.5; this.p.flashT = 0.15; this.damageTaken += raw;
        this.sfx.dmg();
        // Screen flash on damage
        this._flashScreen("damage", 0.12);
        // VFX: player damage shake (bigger for enemy collision)
        this.vfx.shake(8, 0.85);
        this._shake(6, 0.15);
        this._spawnParticles(this.p.x, this.p.y, 8, "#ef5350");
        // VFX: damage number
        this.vfx.addDamage(this.p.x, this.p.y - 20, raw, false, false);
        this.vfx.addHitSpark(this.p.x, this.p.y, "#ef5350", 10);
        this.dmgNums.push({ x: this.p.x, y: this.p.y - 20, txt: "-" + raw, col: "#ef5350", life: 0.8, maxLife: 0.8, a: 1, big: true });
        if (this.p.hp <= 0) { this.p.hp = 0; this._tryReviveOrGameOver(); return; }
      }
      /* death */
      if (e.hp <= 0) { this._onEnemyKill(e); this.enemies.splice(i, 1); }
    }

    /* separation (spatial hash) */
    const cs = 40, grid = new Map();
    for (const e of this.enemies) {
      const k = (floor(e.x / cs) << 16) ^ floor(e.y / cs);
      const cell = grid.get(k); if (cell) cell.push(e); else grid.set(k, [e]);
    }
    for (const e of this.enemies) {
      const gx = floor(e.x / cs), gy = floor(e.y / cs);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const k = ((gx + dx) << 16) ^ (gy + dy), cell = grid.get(k);
        if (!cell) continue;
        for (const o of cell) {
          if (o.id <= e.id) continue;
          const d = dist(e, o), md = e.r + o.r;
          if (d < md && d > 0) {
            const ov = (md - d) / 2, nx = (o.x - e.x) / d, ny = (o.y - e.y) / d;
            e.x -= nx * ov * 0.5; e.y -= ny * ov * 0.5;
            o.x += nx * ov * 0.5; o.y += ny * ov * 0.5;
          }
        }
      }
    }
  }

  /* ── AI: simple chase ── */
  _aiChase(e, dt, sm) {
    const a = atan2(this.p.y - e.y, this.p.x - e.x);
    e.x += cos(a) * e.spd * sm * dt * 60; e.y += sin(a) * e.spd * sm * dt * 60;
  }

  /* ── AI: 도깨비 — chase + charge ── */
  _aiDokkaebi(e, dt, sm) {
    switch (e.state) {
      case "chase": {
        const a = atan2(this.p.y - e.y, this.p.x - e.x);
        e.x += cos(a) * e.spd * sm * dt * 60; e.y += sin(a) * e.spd * sm * dt * 60;
        if (e.stateT > rand(3, 5) && dist(e, this.p) < 280) {
          e.state = "windup"; e.stateT = 0;
          e.chargeA = atan2(this.p.y - e.y, this.p.x - e.x);
        }
        break;
      }
      case "windup": if (e.stateT > 0.3) { e.state = "charge"; e.stateT = 0; } break;
      case "charge":
        e.x += cos(e.chargeA) * e.spd * 3.5 * sm * dt * 60;
        e.y += sin(e.chargeA) * e.spd * 3.5 * sm * dt * 60;
        if (e.stateT > 0.45) { e.state = "chase"; e.stateT = 0; }
        break;
      default: e.state = "chase"; e.stateT = 0;
    }
  }

  /* ── AI: 해골병사 — ranged ── */
  _aiSkeleton(e, dt, sm) {
    const d = dist(e, this.p);
    if (d > 200) {
      const a = atan2(this.p.y - e.y, this.p.x - e.x);
      e.x += cos(a) * e.spd * sm * dt * 60; e.y += sin(a) * e.spd * sm * dt * 60;
      e.state = "approach";
    } else {
      e.state = "ranged"; e.atkT += dt;
      if (e.atkT >= 1.8) {
        e.atkT = 0;
        const a = atan2(this.p.y - e.y, this.p.x - e.x);
        this.enemyProjs.push({ x: e.x, y: e.y, vx: cos(a) * 3, vy: sin(a) * 3, dmg: e.dmg, r: 5, life: 2.5, col: "#d7ccc8" });
        this.sfx.hit();
      }
    }
  }

  /* ── AI: 처녀귀신 — stalk → teleport ── */
  _aiGhost(e, dt, sm) {
    switch (e.state) {
      case "chase": case "stalk": {
        const a = atan2(this.p.y - e.y, this.p.x - e.x);
        e.x += cos(a) * e.spd * 0.5 * sm * dt * 60; e.y += sin(a) * e.spd * 0.5 * sm * dt * 60;
        e.alpha = 0.35; e.state = "stalk";
        if (dist(e, this.p) < 260 && e.stateT > 2.5) {
          e.state = "telegraph"; e.stateT = 0;
          e.targetX = this.p.x; e.targetY = this.p.y;
        }
        break;
      }
      case "telegraph":
        e.alpha = 0.25;
        if (e.stateT > 0.6) { e.state = "attack"; e.stateT = 0; e.x = e.targetX; e.y = e.targetY; e.alpha = 1; }
        break;
      case "attack":
        e.alpha = 1; if (e.stateT > 0.35) { e.state = "cooldown"; e.stateT = 0; } break;
      case "cooldown":
        e.alpha = 0.55;
        if (e.stateT > 1.2) {
          e.state = "stalk"; e.stateT = 0;
          const a = rand(0, TAU);
          e.x = this.p.x + cos(a) * rand(200, 340); e.y = this.p.y + sin(a) * rand(200, 340);
        }
        break;
      default: e.state = "stalk"; e.stateT = 0;
    }
  }

  /* ── AI: 구미호 boss ── */
  _aiBoss(e, dt, sm) {
    const a = atan2(this.p.y - e.y, this.p.x - e.x);
    e.x += cos(a) * e.spd * sm * dt * 60; e.y += sin(a) * e.spd * sm * dt * 60;
    e.summonT += dt;
    if (e.summonT >= 20) {
      e.summonT = 0;
      for (let j = 0; j < 2; j++) {
        const ca = rand(0, TAU);
        this._spawnEnemy("foxClone", e.x + cos(ca) * 40, e.y + sin(ca) * 40, this.elapsed / 60);
      }
      this._spawnParticles(e.x, e.y, 15, "#f48fb1");
    }
    e.allureT += dt;
    if (e.allureT >= 12) {
      e.allureT = 0; this.allureT = 2; this.allureSrc = e;
      this.sfx.allure(); this._spawnParticles(e.x, e.y, 20, "#f06292");
    }
  }

  /* ── AI: 불가사리 — slow tank, armored ── */
  _aiBulgasari(e, dt, sm) {
    const a = atan2(this.p.y - e.y, this.p.x - e.x);
    e.x += cos(a) * e.spd * sm * dt * 60; e.y += sin(a) * e.spd * sm * dt * 60;
  }

  /* ── AI: 장산범 — fast pounce ── */
  _aiJangsan(e, dt, sm) {
    switch (e.state) {
      case "chase": {
        const a = atan2(this.p.y - e.y, this.p.x - e.x);
        e.x += cos(a) * e.spd * sm * dt * 60; e.y += sin(a) * e.spd * sm * dt * 60;
        if (e.stateT > rand(2, 4) && dist(e, this.p) < 250) {
          e.state = "crouch"; e.stateT = 0;
          e.chargeA = atan2(this.p.y - e.y, this.p.x - e.x);
        }
        break;
      }
      case "crouch":
        if (e.stateT > 0.4) { e.state = "pounce"; e.stateT = 0; } break;
      case "pounce":
        e.x += cos(e.chargeA) * e.spd * 5 * sm * dt * 60;
        e.y += sin(e.chargeA) * e.spd * 5 * sm * dt * 60;
        if (e.stateT > 0.3) { e.state = "rest"; e.stateT = 0; }
        break;
      case "rest":
        if (e.stateT > 0.8) { e.state = "chase"; e.stateT = 0; } break;
      default: e.state = "chase"; e.stateT = 0;
    }
  }

  /* ── AI: 이무기 — elite serpent ── */
  _aiImugi(e, dt, sm) {
    /* sinusoidal movement toward player */
    const a = atan2(this.p.y - e.y, this.p.x - e.x);
    const perpA = a + PI / 2;
    const wave = sin(this.elapsed * 3 + e.id) * 1.5;
    e.x += (cos(a) * e.spd + cos(perpA) * wave) * sm * dt * 60;
    e.y += (sin(a) * e.spd + sin(perpA) * wave) * sm * dt * 60;
    /* periodically shoot */
    e.atkT = (e.atkT || 0) + dt;
    if (e.atkT >= 2.5) {
      e.atkT = 0;
      for (let j = -1; j <= 1; j++) {
        const sa = a + j * 0.3;
        this.enemyProjs.push({ x: e.x, y: e.y, vx: cos(sa) * 3.5, vy: sin(sa) * 3.5, dmg: e.dmg, r: 6, life: 2, col: "#66bb6a" });
      }
      this.sfx.hit();
    }
  }

  /* ── AI: 도깨비왕 — slow + ground pound AoE ── */
  _aiDokkaKing(e, dt, sm) {
    const a = atan2(this.p.y - e.y, this.p.x - e.x);
    e.x += cos(a) * e.spd * sm * dt * 60;
    e.y += sin(a) * e.spd * sm * dt * 60;
    e.atkT = (e.atkT || 0) + dt;
    if (e.atkT >= 3.5 && dist(e, this.p) < 200) {
      e.atkT = 0;
      /* ground pound: damage + knockback nearby player */
      this._shake(10, 0.4);
      this.sfx.knockback();
      this.windBursts.push({ x: e.x, y: e.y, rad: 0, maxRad: 120, kb: 80, dmg: Math.round(e.dmg * 0.6), spd: 200, hitSet: new Set(), col: "#ff3d00" });
    }
  }

  /* ── AI: 해태 — fire breath cone + chase ── */
  _aiHaetae(e, dt, sm) {
    const a = atan2(this.p.y - e.y, this.p.x - e.x);
    e.x += cos(a) * e.spd * sm * dt * 60;
    e.y += sin(a) * e.spd * sm * dt * 60;
    e.atkT = (e.atkT || 0) + dt;
    if (e.atkT >= 3 && dist(e, this.p) < 250) {
      e.atkT = 0;
      /* fire breath: 5 projectiles in a cone */
      for (let j = -2; j <= 2; j++) {
        const sa = a + j * 0.22;
        this.enemyProjs.push({ x: e.x, y: e.y, vx: cos(sa) * 3, vy: sin(sa) * 3, dmg: Math.round(e.dmg * 0.7), r: 5, life: 1.5, col: "#ffc107" });
      }
      this.sfx.boss();
    }
  }

  /* ── DAMAGE ── */
  _damageEnemy(e, baseDmg) {
    let dmg = Math.round(baseDmg * (this.p.dmgMul || 1) * this.comboMultiplier.dmg);
    /* boss damage artifact */
    if (this.artifact && this.artifact.effect === "bossDmg30" && (e.boss || e.elite)) dmg = Math.round(dmg * 1.3);
    let crit = false;
    const critChance = (this.artifact && this.artifact.effect === "critUp") ? 0.2 : 0.1;
    // Crit boost power-up increases crit chance
    if (this.activePowerups.critBoost) critChance += this.activePowerups.critBoost.val;
    if (Math.random() < critChance) { dmg = Math.round(dmg * 2); crit = true; }
    /* reaper passive: 5% chance to deal 25% max HP as bonus damage */
    if (this.charPassive === "executeChance" && !e.boss && Math.random() < 0.05) {
      dmg += Math.round(e.maxHp * 0.25);
      crit = true;
    }
    e.hp -= dmg; e.hitT = 0.1; this.totalDmg += dmg;
    // Life steal power-up heals on hit
    if (this.activePowerups.lifeSteal) {
      const heal = Math.round(dmg * this.activePowerups.lifeSteal.val);
      this.p.hp = min(this.p.hp + heal, this.p.maxHp);
      if (heal > 0) {
        this.vfx.addParticle(this.p.x, this.p.y, { vx: rand(-20, 20), vy: rand(-30, -10), life: 0.4, count: 3, col: "#c62828", r: rand(2, 4) });
      }
    }
    /* cap dmg numbers for performance */
    if (this.dmgNums.length < 80) {
      const col = crit ? "#ffd93d" : "#fff";
      this.dmgNums.push({ x: e.x + rand(-10, 10), y: e.y - e.r - 5, txt: dmg.toString(), col, life: 0.6, maxLife: 0.6, a: 1, big: crit });
    }
    // VFX damage number (new system)
    this.vfx.addDamage(e.x, e.y - e.r, dmg, crit, false);
    // VFX hit sparks
    this.vfx.addHitSpark(e.x, e.y, crit ? "#ffd700" : e.col, crit ? 12 : 5);
    this._spawnParticles(e.x, e.y, crit ? 6 : 3, e.col);
    // Extra screen shake on critical hits for impact
    if (crit) { this.vfx.shake(3, 0.1); }
  }

  _onEnemyKill(e) {
    this.killCount++;
    // Track kill streak for bonus
    if (this.elapsed - this.lastKillTime < 2) {
      this.killStreak++;
    } else {
      this.killStreak = 1;
    }
    this.lastKillTime = this.elapsed;

    /* ── COMBO SYSTEM ── */
    this.combo.count++;
    this.combo.timer = 3; // 3 second window
    this.combo.lastKillTime = this.elapsed;
    if (this.combo.count > this.combo.maxCombo) this.combo.maxCombo = this.combo.count;

    // Update combo multiplier based on tier
    const c = this.combo.count;
    if (c >= 50) {
      this.comboMultiplier = { dmg: 1.75, gold: 2.0, xp: 1.5 };
    } else if (c >= 20) {
      this.comboMultiplier = { dmg: 1.5, gold: 1.5, xp: 1.25 };
    } else if (c >= 10) {
      this.comboMultiplier = { dmg: 1.25, gold: 1.25, xp: 1.1 };
    } else if (c >= 5) {
      this.comboMultiplier = { dmg: 1.1, gold: 1, xp: 1 };
    }
    // Play combo sound at milestones
    if (c === 5 || c === 10 || c === 20 || c === 50) {
      this.sfx.combo();
      // Screen shake at high combos
      if (c >= 20) this.vfx.shake(c >= 50 ? 6 : 4, 0.2);
    }
    this._spawnComboText(c);
    this._updateComboUI();

    if (e.elite || e.boss) {
      this.eliteKillCount = (this.eliteKillCount || 0) + 1;
      // Award spirit stones for elite/boss kills
      const gachaData = loadGachaData();
      gachaData.spiritStones += e.boss ? 20 : 5;
      saveGachaData(gachaData);
      // Enhanced kill effects for elite/boss
      this.sfx.kill();
      this._spawnParticles(e.x, e.y, e.boss ? 35 : 20, e.boss ? "#ffd700" : "#ff9800");
      // VFX: kill particles
      this.vfx.addParticle(e.x, e.y, {
        vx: rand(-100, 100), vy: rand(-150, -50),
        life: 0.8, count: e.boss ? 20 : 10,
        col: e.boss ? "#ffd700" : "#ff9800", r: rand(3, 8), grav: 200
      });
      // VFX: kill damage number
      this.vfx.addDamage(e.x, e.y - e.r - 20, 0, false, true);
      // VFX: blood splat
      this.vfx.addBloodSplat(e.x, e.y, e.boss ? 3 : 2);
      // Screen shake (using VFX)
      this.vfx.shake(e.boss ? 12 : 6, 0.85);
      this._shake(e.boss ? 10 : 5, e.boss ? 0.3 : 0.15);
      // Ring effect for boss kills
      if (e.boss) {
        this.lightnings.push({ x: e.x, y: e.y, r: 0, maxR: 100, life: 0.4, maxLife: 0.4, col: "#ffd700" });
      }
    } else {
      this.sfx.kill();
      this._spawnParticles(e.x, e.y, 12, e.col);
      // VFX: kill particles
      this.vfx.addParticle(e.x, e.y, {
        vx: rand(-80, 80), vy: rand(-100, -30),
        life: 0.5, count: 5,
        col: e.col, r: rand(2, 5), grav: 150
      });
      // VFX: blood splat
      this.vfx.addBloodSplat(e.x, e.y, 1);
      // Combo shake for high combos
      if (this.combo.count >= 20) this.vfx.shake(4, 0.9);
      if (this.combo.count >= 20) this._shake(3, 0.1);
    }
    /* artifact: kill heal */
    if (this.artifact && this.artifact.effect === "killHeal5" && Math.random() < 0.05) {
      this.p.hp = min(this.p.hp + 5, this.p.maxHp);
    }

    /* ghostSlash heal */
    const gsW = this.weapons.find(w => w.type === "ghostSlash");
    if (gsW) {
      const lv = EVOLVED.ghostSlash.lvs[gsW.lv];
      this.p.hp = min(this.p.hp + lv.heal, this.p.maxHp);
    }
    /* ghostFlame explosion */
    const gfW = this.weapons.find(w => w.type === "ghostFlame");
    if (gfW) {
      const lv = EVOLVED.ghostFlame.lvs[gfW.lv];
      for (const o of this.enemies) { if (o === e) continue; if (dist(o, e) < lv.exR) this._damageEnemy(o, lv.exD); }
      this._spawnParticles(e.x, e.y, 15, "#ff6d00");
    }

    /* drop XP gems */
    let xv = Math.round(e.xp * this.comboMultiplier.xp);
    while (xv > 0) {
      const v = xv >= 10 ? 10 : xv >= 5 ? 5 : 1; xv -= v;
      this.gems.push({
        x: e.x + rand(-15, 15), y: e.y + rand(-15, 15),
        val: v, r: v >= 10 ? 7 : v >= 5 ? 5.5 : 4,
        col: v >= 10 ? "#ffab00" : v >= 5 ? "#ffd54f" : "#fff9c4",
        attracting: false,
      });
    }

    /* drop gold coins */
    const def = ETYPES[e.type];
    if (def) {
      const goldAmt = Math.round(rInt(def.goldMin || 0, def.goldMax || 0) * this.comboMultiplier.gold);
      if (goldAmt > 0) {
        this.goldCoins.push({
          x: e.x + rand(-12, 12), y: e.y + rand(-12, 12),
          val: goldAmt, r: 5, life: 8, attracting: false,
        });
      }
    }

    /* elite → treasure chest */
    if (e.elite || e.boss) {
      this.chests.push({
        x: e.x, y: e.y, r: 12, life: 20,
        type: e.boss ? "boss" : "elite",
      });
    }

    /* track boss kill */
    if (e.boss) {
      this.cStats.bossKills = (this.cStats.bossKills || 0) + 1;
    }

    /* power-up drop */
    const dropChance = e.elite || e.boss ? 0.3 : 0.05;
    if (Math.random() < dropChance) {
      this._spawnPowerup(e.x, e.y, e.elite || e.boss);
    }
  }

  /* ── GOLD COINS ── */
  _updateGoldCoins(dt) {
    this.goldCoins = this.goldCoins.filter(c => {
      c.life -= dt; if (c.life <= 0) return false;
      const d = dist(c, this.p);
      if (d < this.p.magnetR * 0.8 || c.attracting) {
        c.attracting = true;
        const a = atan2(this.p.y - c.y, this.p.x - c.x);
        const spd = 7 + max(0, (this.p.magnetR - d) * 0.08);
        c.x += cos(a) * spd * dt * 60; c.y += sin(a) * spd * dt * 60;
      }
      if (d < this.p.r + c.r) {
        const earned = Math.round(c.val * this.goldMul);
        this.goldEarned += earned;
        // Track pet bonus gold for achievements
        if (this.chosenPet === 'dragonSalamander') {
          this.runStats.goldEarnedFromPet = (this.runStats.goldEarnedFromPet || 0) + earned;
        }
        this.sfx.coin();
        // VFX: gold sparkle
        this.vfx.addParticle(c.x, c.y, {
          vx: rand(-40, 40), vy: rand(-50, -20),
          life: 0.5, count: 4,
          col: "#ffd700", r: rand(2, 5)
        });
        this.dmgNums.push({ x: this.p.x, y: this.p.y - 30, txt: "+" + earned + "💰", col: "#ffd93d", life: 0.6, maxLife: 0.6, a: 1, big: false });
        return false;
      }
      return true;
    });
  }

  /* ── TREASURE CHESTS ── */
  _updateChests(dt) {
    this.chests = this.chests.filter(ch => {
      ch.life -= dt; if (ch.life <= 0) return false;
      if (dist(ch, this.p) < ch.r + this.p.r) {
        this.sfx.chest();
        this._spawnParticles(ch.x, ch.y, 20, "#ffd93d");
        // Chest open effect
        this.vfx.addParticle(ch.x, ch.y, { vx: rand(-60, 60), vy: rand(-80, -40), life: 0.8, count: 15, col: "#ffd700", r: rand(3, 6), grav: 100 });
        this.vfx.addHitSpark(ch.x, ch.y, "#ffd700", 12);
        this._flashScreen("heal", 0.15);
        /* reward */
        if (ch.type === "boss") {
          /* boss chest: big gold + heal + vacuum gems */
          const bonus = Math.round(rInt(30, 50) * this.goldMul);
          this.goldEarned += bonus;
          this.p.hp = min(this.p.hp + this.p.maxHp * 0.5, this.p.maxHp);
          for (const g of this.gems) g.attracting = true;
          this.dmgNums.push({ x: this.p.x, y: this.p.y - 35, txt: "보스 보물! +" + bonus + "💰", col: "#ffd93d", life: 1.2, maxLife: 1.2, a: 1, big: true });
          this.announcements.push({ text: "🎁 보스 보물 획득!", life: 2.5, maxLife: 2.5 });
        } else {
          /* elite chest: random bonus */
          const roll = Math.random();
          if (roll < 0.4) {
            /* gold bonus */
            const bonus = Math.round(rInt(15, 30) * this.goldMul);
            this.goldEarned += bonus;
            this.dmgNums.push({ x: this.p.x, y: this.p.y - 35, txt: "+" + bonus + "💰", col: "#ffd93d", life: 1, maxLife: 1, a: 1, big: true });
          } else if (roll < 0.7) {
            /* free level up */
            this.pendingLevelUps++;
            this.dmgNums.push({ x: this.p.x, y: this.p.y - 35, txt: "레벨 업!", col: "#64b5f6", life: 1, maxLife: 1, a: 1, big: true });
          } else {
            /* full heal */
            this.p.hp = this.p.maxHp;
            this.dmgNums.push({ x: this.p.x, y: this.p.y - 35, txt: "완전 회복!", col: "#66bb6a", life: 1, maxLife: 1, a: 1, big: true });
          }
          this.announcements.push({ text: "📦 보물상자 획득!", life: 2, maxLife: 2 });
        }
        return false;
      }
      return true;
    });
  }

  /* ── GEMS ── */
  _updateGems(dt) {
    this.gems = this.gems.filter(g => {
      const d = dist(g, this.p);
      if (d < this.p.magnetR || g.attracting) {
        g.attracting = true;
        const a = atan2(this.p.y - g.y, this.p.x - g.x);
        const spd = 8 + max(0, (this.p.magnetR - d) * 0.1);
        g.x += cos(a) * spd * dt * 60; g.y += sin(a) * spd * dt * 60;
      }
      if (d < this.p.r + g.r) {
        const gainedXp = Math.round(g.val * this.p.xpMul);
        this.xp += gainedXp;
        this.runStats.xpGained = (this.runStats.xpGained || 0) + gainedXp;
        this.sfx.xp();
        // VFX: XP pickup sparkle
        this.vfx.addParticle(g.x, g.y, {
          vx: rand(-30, 30), vy: rand(-40, -20),
          life: 0.4, count: 3,
          col: g.val >= 10 ? "#ffab00" : "#ffd54f", r: rand(2, 4)
        });
        while (this.xp >= this.xpNext) {
          this.xp -= this.xpNext; this.level++;
          // Improved XP curve: slightly faster early, sustainable late
          this.xpNext = Math.round(8 * Math.pow(1.15, this.level - 1));
          this.pendingLevelUps++; this.sfx.lvl();
          // Screen flash on level up
          this._flashScreen("levelup", 0.2);
          // Update level display and trigger animation
          this.ui.lvTxt.textContent = "Lv " + this.level;
          const xpBar = document.getElementById("xp-bar");
          if (xpBar) { xpBar.classList.add("leveling"); setTimeout(() => xpBar.classList.remove("leveling"), 600); }
          // VFX: level up celebration
          this.vfx.addParticle(this.p.x, this.p.y - 30, {
            vx: rand(-60, 60), vy: rand(-80, -40),
            life: 0.8, count: 15,
            col: "#ffd700", r: rand(3, 6), grav: 150
          });
        }
        return false;
      }
      return true;
    });
  }

  /* ── TALISMANS ── */
  _updateTalismans(dt) {
    this.talismanT += dt;
    if (this.talismanT >= 30) {
      this.talismanT = 0;
      const type = Math.random() < 0.5 ? "heal" : "magnet";
      const a = rand(0, TAU), d = rand(100, 250);
      this.talismans.push({ x: this.p.x + cos(a) * d, y: this.p.y + sin(a) * d, type, r: 10, life: 15 });
    }
    this.talismans = this.talismans.filter(t => {
      t.life -= dt; if (t.life <= 0) return false;
      if (dist(t, this.p) < t.r + this.p.r) {
        this.sfx.talisman();
        if (t.type === "heal") {
          this.p.hp = min(this.p.hp + this.p.maxHp * 0.3, this.p.maxHp);
          this.dmgNums.push({ x: this.p.x, y: this.p.y - 25, txt: "+" + Math.round(this.p.maxHp * 0.3), col: "#66bb6a", life: 0.8, maxLife: 0.8, a: 1, big: true });
        } else {
          for (const g of this.gems) g.attracting = true;
        }
        this._spawnParticles(t.x, t.y, 10, t.type === "heal" ? "#66bb6a" : "#42a5f5");
        return false;
      }
      return true;
    });
  }

  /* ── POWER-UPS ── */
  _updatePowerups(dt) {
    // Update active power-up timers
    for (const key of Object.keys(this.activePowerups)) {
      const buf = this.activePowerups[key];
      buf.timer -= dt;
      if (buf.timer <= 0) {
        delete this.activePowerups[key];
      }
    }

    // Apply passive power-up effects
    // Life steal: heal on enemy kill
    // Crit boost: handled in _damageEnemy
    // Shield: reduces incoming damage
    // Slow field: slows nearby enemies

    // Update power-up drops (movement and collection)
    this.powerupDrops = this.powerupDrops.filter(p => {
      p.life -= dt;
      if (p.life <= 0) return false;

      // Magnet effect - move towards player
      const magnetRange = this.p.magnetR * (this.activePowerups.magnet ? this.activePowerups.magnet.val : 1);
      const d = dist(p, this.p);
      if (d < magnetRange) {
        const a = atan2(this.p.y - p.y, this.p.x - p.x);
        p.x += cos(a) * 8 * dt * 60;
        p.y += sin(a) * 8 * dt * 60;
      }

      // Collection check
      if (d < this.p.r + p.r) {
        this._applyPowerup(p.type);
        return false;
      }
      return true;
    });
  }

  _applyPowerup(type) {
    const def = POWERUPS[type];
    if (!def) return;

    this.sfx.talisman();
    this._spawnParticles(this.p.x, this.p.y, 8, def.col);
    // Small screen flash for powerup pickup
    this.vfx.shake(2, 0.15);

    if (def.effect === 'heal') {
      this.p.hp = min(this.p.hp + def.val, this.p.maxHp);
      this.dmgNums.push({ x: this.p.x, y: this.p.y - 25, txt: "+" + def.val, col: "#66bb6a", life: 0.8, maxLife: 0.8, a: 1, big: true });
      return;
    }

    // Track powerup for achievements
    this.runStats.powerupsCollected = (this.runStats.powerupsCollected || 0) + 1;

    // Apply or refresh buff
    this.activePowerups[def.effect] = { timer: def.dur, val: def.val, col: def.col, icon: def.icon, name: def.name };

    // Show notification
    this.dmgNums.push({ x: this.p.x, y: this.p.y - 35, txt: def.icon + " " + def.name, col: def.col, life: 1.2, maxLife: 1.2, a: 1, big: true });
  }

  _spawnPowerup(x, y, isRare) {
    const keys = Object.keys(POWERUPS);
    // Exclude heal from normal drops
    const pool = isRare ? keys : keys.filter(k => k !== 'heal');
    const type = pool[Math.floor(Math.random() * pool.length)];
    this.powerupDrops.push({
      x: x + rand(-20, 20), y: y + rand(-20, 20),
      type, r: 12, life: 30,
    });
  }

  /* ── PETS ── */
  _spawnPet(type) {
    const def = PETS[type];
    this.pets.push({
      type,
      x: this.p.x,
      y: this.p.y,
      r: 10,
      atkTimer: 0,
      angle: rand(0, TAU),
      dmg: def.dmg || 0,
      atkInterval: def.atkInterval || 3,
      range: def.range || 150,
    });
  }

  _updatePets(dt) {
    for (const pet of this.pets) {
      // Orbit around player
      pet.angle += dt * 1.2;
      const orbitR = 35;
      const targetX = this.p.x + cos(pet.angle) * orbitR;
      const targetY = this.p.y + sin(pet.angle) * orbitR;
      pet.x += (targetX - pet.x) * 4 * dt;
      pet.y += (targetY - pet.y) * 4 * dt;

      // Fox pet auto-attack
      if (pet.type === 'foxPet') {
        pet.atkTimer -= dt;
        if (pet.atkTimer <= 0) {
          pet.atkTimer = pet.atkInterval;
          this._petFoxAttack(pet);
        }
      }
    }
  }

  _petFoxAttack(pet) {
    // Find closest enemy
    let closest = null, closestDist = pet.range;
    for (const e of this.enemies) {
      const d = dist(e, pet);
      if (d < closestDist) {
        closestDist = d;
        closest = e;
      }
    }
    if (closest) {
      this._damageEnemy(closest, pet.dmg);
      this._spawnParticles(closest.x, closest.y, 6, "#ff9800");
      // Visual projectile
      this.particles.push({
        x: pet.x, y: pet.y,
        vx: (closest.x - pet.x) / 5, vy: (closest.y - pet.y) / 5,
        life: 0.5, maxLife: 0.5, col: "#ff9800", r: 4, a: 1
      });
    }
  }

  /* ── LEVEL UP ── */
  _showLevelUp() {
    this.state = "lvlup"; this.ui.lvl.classList.remove("hidden");
    const opts = this._genUpgradeOptions(3);
    const box = this.ui.choices;
    while (box.firstChild) box.removeChild(box.firstChild);
    for (const opt of opts) {
      const card = document.createElement("div");
      card.className = "choice-card";
      if (opt.kind === "synth") card.classList.add("synth");
      const ic = document.createElement("div"); ic.className = "choice-icon"; ic.textContent = opt.icon;
      const nm = document.createElement("div"); nm.className = "choice-name"; nm.textContent = opt.name;
      const lv = document.createElement("div"); lv.className = "choice-lv"; lv.textContent = opt.lvText;
      const ds = document.createElement("div"); ds.className = "choice-desc"; ds.textContent = opt.desc;
      card.append(ic, nm, lv, ds);
      card.onclick = () => {
        this._applyUpgrade(opt);
        this.ui.lvl.classList.add("hidden");
        this.state = "play"; this.lastT = performance.now();
        if (this.pendingLevelUps > 0) { this.pendingLevelUps--; this._showLevelUp(); }
      };
      box.appendChild(card);
    }
  }

  _genUpgradeOptions(n) {
    const pool = [];
    const owned = new Set(this.weapons.map(w => w.type));
    /* synthesis */
    for (const r of RECIPES) {
      if (owned.has(r.result)) continue;
      const wA = this.weapons.find(w => w.type === r.a), wB = this.weapons.find(w => w.type === r.b);
      if (wA && wB && wA.lv >= 4 && wB.lv >= 4) {
        const ev = EVOLVED[r.result];
        pool.push({
          kind: "synth", type: r.result, ingA: r.a, ingB: r.b,
          icon: ev.icon, name: "합성: " + ev.name, lvText: "★ 진화", desc: ev.desc,
        });
      }
    }
    /* weapon upgrades */
    for (const w of this.weapons) {
      const def = getWDef(w.type);
      if (w.lv < def.maxLv - 1) pool.push({
        kind: "weapon", type: w.type, icon: def.icon, name: def.name,
        lvText: "Lv " + (w.lv + 2), desc: def.desc,
      });
    }
    /* new weapons */
    for (const [type, def] of Object.entries(WDEFS)) {
      if (!owned.has(type)) pool.push({
        kind: "newWeapon", type, icon: def.icon,
        name: def.name + " (NEW)", lvText: "Lv 1", desc: def.desc,
      });
    }
    /* passives */
    for (const [key, def] of Object.entries(PASSIVES)) {
      const cur = this.passiveLvs[key] || 0;
      if (cur < def.maxLv) pool.push({
        kind: "passive", type: key, icon: def.icon, name: def.name,
        lvText: "Lv " + (cur + 1), desc: def.desc,
      });
    }
    /* prioritize synth, then shuffle rest */
    const synths = pool.filter(o => o.kind === "synth");
    const rest = pool.filter(o => o.kind !== "synth");
    for (let i = rest.length - 1; i > 0; i--) {
      const j = floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return [...synths, ...rest].slice(0, min(n, pool.length));
  }

  _applyUpgrade(opt) {
    if (opt.kind === "weapon") {
      const w = this.weapons.find(w => w.type === opt.type); if (w) w.lv++;
    } else if (opt.kind === "newWeapon") {
      this._addWeapon(opt.type);
    } else if (opt.kind === "synth") {
      this.weapons = this.weapons.filter(w => w.type !== opt.ingA && w.type !== opt.ingB);
      this._addWeapon(opt.type);
      this.sfx.synth(); this._shake(8, 0.3);
      this._flashScreen("levelup", 0.25);
      this._spawnParticles(this.p.x, this.p.y, 25, "#ffd54f");
      // Evolution burst effect
      this.vfx.addParticle(this.p.x, this.p.y, { vx: rand(-80, 80), vy: rand(-80, 80), life: 1.0, count: 20, col: "#ffd700", r: rand(4, 8), grav: 50 });
      /* track evolution for unlock */
      if (!this.cStats.evolvedWeapons) this.cStats.evolvedWeapons = [];
      if (!this.cStats.evolvedWeapons.includes(opt.type)) this.cStats.evolvedWeapons.push(opt.type);
    } else if (opt.kind === "passive") {
      const key = opt.type; this.passiveLvs[key] = (this.passiveLvs[key] || 0) + 1;
      const p = this.p;
      switch (key) {
        case "maxHp": p.maxHp += 20; p.hp = min(p.hp + 20, p.maxHp); break;
        case "speed": p.spd *= 1.1; break;
        case "magnet": p.magnetR += 30; break;
        case "armor": p.armor += 3; break;
        case "cdReduce": p.cdMul *= 0.92; break;
        case "xpBonus": p.xpMul *= 1.15; break;
        case "regen": p.regen += 1; break;
      }
    }
    this._refreshWeaponSlots();
  }

  _refreshWeaponSlots() {
    const box = this.ui.wslots;
    while (box.firstChild) box.removeChild(box.firstChild);
    const maxSlots = 6;
    for (let i = 0; i < maxSlots; i++) {
      const w = this.weapons[i];
      const el = document.createElement("div");
      el.className = "wslot";
      if (w) {
        const def = getWDef(w.type);
        el.textContent = def.icon;
        const lv = document.createElement("span");
        lv.className = "wslot-lv";
        lv.textContent = w.lv + 1;
        el.appendChild(lv);
      } else {
        el.textContent = "";
      }
      box.appendChild(el);
    }
  }

  /* ── REVIVE / END ── */
  _tryReviveOrGameOver() {
    if (this.reviveAvail && !this.reviveUsed) {
      this.reviveUsed = true;
      this.p.hp = Math.round(this.p.maxHp * 0.3);
      this.p.invT = 3; this.p.flashT = 0.5;
      this._shake(10, 0.5);
      this._spawnParticles(this.p.x, this.p.y, 30, "#ffd93d");
      this.announcements.push({ text: "💫 부활!", life: 3, maxLife: 3 });
      this.sfx.revive();
      /* kill nearby enemies */
      for (const e of this.enemies) {
        if (dist(e, this.p) < 150) { e.hp -= 9999; }
      }
    } else {
      this._gameOver();
    }
  }

  _gameOver() {
    this.state = "end"; this.sfx.bgmStop();
    this.sfx.playBgm("final");
    this.ui.endTitle.textContent = "게임 오버";
    this.ui.endTitle.style.color = "#ef5350";
    this.ui.end.classList.add("defeat");
    this.ui.end.classList.remove("victory");
    this.isNewRecord = saveScore({
      time: this.elapsed, kills: this.killCount, level: this.level,
      dmg: this.totalDmg, win: false, date: Date.now(),
      character: this.selectedChar, difficulty: this.settings.difficulty,
    });
    this._finishRun(false);
    this._showEndStats();
    this.ui.end.classList.remove("hidden");
  }

  _victory() {
    this.state = "end"; this.sfx.bgmStop(); this.sfx.win();
    this.sfx.playBgm("victory");

    // Check if stage mode
    if (this.selectedStage) {
      const stage = STAGES[this.selectedStage];
      const time = this.elapsed;
      let stars = 1;
      if (time <= stage.stars[3]) stars = 3;
      else if (time <= stage.stars[2]) stars = 2;

      this._showStageClear(time, stars);
      this._finishRun(true);
      return;
    }

    this.ui.endTitle.textContent = "🎉 퇴마 완료!";
    this.ui.endTitle.style.color = "#ffd93d";
    this.ui.end.classList.add("victory");
    this.ui.end.classList.remove("defeat");
    this.isNewRecord = saveScore({
      time: this.elapsed, kills: this.killCount, level: this.level,
      dmg: this.totalDmg, win: true, date: Date.now(),
      character: this.selectedChar, difficulty: this.settings.difficulty,
    });
    this._finishRun(true);
    this._showEndStats();
    this.ui.end.classList.remove("hidden");
  }

  _finishRun(won) {
    /* track daily challenge */
    if (won && this.isDailyChallenge) {
      const today = new Date().toDateString();
      const stats = loadDailyStats();
      if (stats.lastDate !== today || this.elapsed < stats.bestTime || stats.bestTime === 0) {
        stats.lastDate = today;
        stats.bestTime = this.elapsed;
        stats.completed = true;
        saveDailyStats(stats);
      }
    }

    /* track time attack best time */
    if (won && this.gameMode === 'timeAttack') {
      const isNewRecord = saveBestTime('timeAttack', this.elapsed);
      if (isNewRecord) {
        this._showAnnouncement("🏆 타임 어택 새 기록: " + formatTime(this.elapsed), 5000);
      }
    }

    /* submit online leaderboard */
    if (won && isOnlineLeaderboardConfigured()) {
      const name = "Player" + Math.floor(Math.random() * 1000);
      submitOnlineScore(name, this.elapsed, this.killCount, this.level,
        this.settings.difficulty, this.selectedChar);
    }

    /* end-of-run gold bonus */
    const timeBonus = Math.round(this.elapsed / 10);
    const killBonus = Math.round(this.killCount / 10);
    const levelBonus = this.level * 2;
    const winBonus = won ? 50 : 0;
    const runBonus = Math.round((timeBonus + killBonus + levelBonus + winBonus) * this.goldMul);
    this.goldEarned += runBonus;

    /* save gold */
    this.gold += this.goldEarned;
    saveGold(this.gold);

    /* award spirit stones */
    const gachaData = loadGachaData();
    let spiritEarned = 10; // base reward
    if (won) {
      spiritEarned += 30; // win bonus
      if (this.selectedStage) spiritEarned += 20; // stage clear bonus
    }
    spiritEarned += Math.floor(this.killCount / 5); // kill bonus
    gachaData.spiritStones += spiritEarned;
    saveGachaData(gachaData);

    /* update cumulative stats */
    this.cStats.totalKills += this.killCount;
    this.cStats.eliteKills = (this.cStats.eliteKills || 0) + (this.eliteKillCount || 0);
    this.cStats.totalGold += this.goldEarned;
    this.cStats.totalRuns++;
    this.cStats.totalTime += this.elapsed;
    this.cStats.totalDmg += this.totalDmg;
    if (won) this.cStats.gamesWon++;
    if (this.elapsed > this.cStats.maxSurvivalTime) this.cStats.maxSurvivalTime = this.elapsed;
    if (this.level > this.cStats.highestLevel) this.cStats.highestLevel = this.level;
    /* track nightmare survival */
    if (this.settings.difficulty === "nightmare") {
      this.cStats.nightmareMaxTime = max(this.cStats.nightmareMaxTime || 0, this.elapsed);
    }
    /* track sea map clear */
    if (won && this.mapId === "sea") {
      this.cStats.seaCleared = (this.cStats.seaCleared || 0) + 1;
    }
    saveCStats(this.cStats);

    /* check new unlocks */
    this._checkUnlocks();

    /* check achievements */
    this._checkAchievements(won);
  }

  _checkAchievements(won) {
    const earned = loadAchievements();
    const stats = this.cStats;
    const settings = this.settings;
    const newAchievements = [];

    const check = (id, condition) => {
      if (!earned[id] && condition) {
        earned[id] = true;
        const a = ACHIEVEMENTS[id];
        if (a) {
          this.gold += a.reward;
          saveGold(this.gold);
          newAchievements.push(a);
        }
      }
    };

    // 처치 관련
    check("firstBlood", stats.totalKills >= 1);
    check("kill10", stats.totalKills >= 10);
    check("kill50", stats.totalKills >= 50);
    check("kill100", stats.totalKills >= 100);
    check("kill500", stats.totalKills >= 500);
    check("kill1000", stats.totalKills >= 1000);

    // 보스/엘리트
    check("killElite", (stats.eliteKills || 0) >= 1);
    check("kill5Elite", (stats.eliteKills || 0) >= 5);
    check("killBoss", stats.bossKills >= 1);
    check("kill10Boss", stats.bossKills >= 10);

    // 생존
    check("survive1min", this.elapsed >= 60);
    check("survive3min", this.elapsed >= 180);
    check("survive5min", this.elapsed >= 300);
    check("survive10min", won && this.elapsed >= 600);

    // 레벨
    check("lv10", this.level >= 10);
    check("lv30", this.level >= 30);
    check("lv50", this.level >= 50);

    // 무기
    check("maxWeapon", this.weapons.some(w => w.lv >= 8));
    check("evolveWeapon", stats.evolvedWeapons && stats.evolvedWeapons.length >= 1);
    check("evolve3Weapon", stats.evolvedWeapons && stats.evolvedWeapons.length >= 3);

    // 캐릭터
    const charCount = Object.keys(CHARACTERS).length;
    const unlockedChars = (stats.unlockedCharacters || []).length;
    check("unlockChar", unlockedChars >= 1);
    check("unlockAllChar", unlockedChars >= charCount);

    // 맵 클리어
    check("clearBamboo", won && this.mapId === "bamboo");
    check("clearGraveyard", won && this.mapId === "graveyard");
    check("clearSea", won && this.mapId === "sea");
    check("clearForest", won && this.mapId === "forest");
    check("clearDokkabong", won && this.mapId === "dokkabong");

    // 난이도
    check("clearNormal", won && settings.difficulty === "normal");
    check("clearHard", won && settings.difficulty === "hard");
    check("clearNightmare", won && settings.difficulty === "nightmare");
    check("clearNightmare10", won && settings.difficulty === "nightmare" && this.elapsed >= 600);

    // 골드/메타
    check("gold100", stats.totalGold >= 100);
    check("gold1000", stats.totalGold >= 1000);
    check("gold10000", stats.totalGold >= 10000);

    // 엔드리스/NG+
    check("endlessWin", won && settings.endless);
    check("ngPlus1", won && settings.ngPlus >= 1);
    check("ngPlus3", won && settings.ngPlus >= 3);

    // 특수 조건
    check("noDamage", won && this.damageTaken === 0);
    check("hp1Survive", won && this.hp <= 1);
    check("fullHpWin", won && this.hp >= this.maxHp * 0.9);

    // 유물
    check("useArtifact", this.artifactId !== null);
    const usedArtifacts = stats.usedArtifacts || [];
    if (this.artifactId && !usedArtifacts.includes(this.artifactId)) {
      usedArtifacts.push(this.artifactId);
      stats.usedArtifacts = usedArtifacts;
    }
    check("useAllArtifact", usedArtifacts.length >= Object.keys(ARTIFACTS).length);

    // 시너지
    check("synergy1", (stats.synergyCount || 0) >= 1);
    check("synergy10", (stats.synergyCount || 0) >= 10);

    // 시간대별
    const hour = new Date().getHours();
    check("midnightClear", won && (hour >= 0 && hour < 5));
    check("morningClear", won && (hour >= 6 && hour < 9));

    // 콤보 관련
    check("combo5", this.combo.maxCombo >= 5);
    check("combo10", this.combo.maxCombo >= 10);
    check("combo20", this.combo.maxCombo >= 20);
    check("combo50", this.combo.maxCombo >= 50);

    // 파워업 관련 (runStats에서 powerupCollected 추적 필요)
    const powerupCount = this.runStats?.powerupsCollected || 0;
    check("powerup10", powerupCount >= 10);
    check("powerup50", powerupCount >= 50);

    // 펫 관련
    if (this.chosenPet === 'foxPet') {
      check("petFox", stats.kills >= 30);
    }
    if (this.chosenPet === 'ghostPet' && this.elapsed >= 300) {
      check("petGhost", true);
    }
    if (this.chosenPet === 'birdPet' && (stats.xpGained || 0) >= 500) {
      check("petBird", true);
    }
    if (this.chosenPet === 'dragonSalamander' && (stats.goldEarnedFromPet || 0) >= 200) {
      check("petDragon", true);
    }

    // 무기 진화
    check("evolve5Weapon", stats.evolvedWeapons && stats.evolvedWeapons.length >= 5);

    // Save achievements
    saveAchievements(earned);

    // Show new achievement notifications
    if (newAchievements.length > 0) {
      this._showAchievementNotifications(newAchievements);
    }
  }

  _showAchievementNotifications(achievements) {
    for (let i = 0; i < achievements.length; i++) {
      const a = achievements[i];
      setTimeout(() => {
        this._showAnnouncement("🏆 업적 달성: " + a.name + " (+" + a.reward + "💰)", 4000);
      }, i * 1500);
    }
  }

  _showEndStats() {
    const box = this.ui.endStats;
    while (box.firstChild) box.removeChild(box.firstChild);
    const m = floor(this.elapsed / 60), s = floor(this.elapsed % 60);
    const ch = CHARACTERS[this.selectedChar];
    const diff = DIFFICULTIES[this.settings.difficulty];
    const dps = this.elapsed > 0 ? Math.round(this.totalDmg / this.elapsed) : 0;
    const kpm = this.elapsed > 0 ? (this.killCount / (this.elapsed / 60)).toFixed(1) : "0";
    const rows = [
      ["캐릭터", ch ? ch.icon + " " + ch.name : ""],
      ["난이도", diff ? diff.emoji + " " + diff.name : ""],
      ["생존 시간", `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`],
      ["레벨", "Lv " + this.level],
      ["처치 수", this.killCount.toLocaleString() + ` (${kpm}/분)`],
      ["총 피해량", this.totalDmg.toLocaleString()],
      ["DPS", dps.toLocaleString()],
      ["받은 피해", (this.damageTaken || 0).toLocaleString()],
      ["무기 수", this.weapons.length + "종"],
    ];
    for (const [k, v] of rows) {
      const row = document.createElement("div"); row.className = "stat-row";
      const a = document.createElement("span"); a.textContent = k;
      const b = document.createElement("span"); b.textContent = v;
      row.append(a, b); box.appendChild(row);
    }

    /* gold earned breakdown */
    const goldRow = document.createElement("div");
    goldRow.className = "stat-row gold-row";
    const ga = document.createElement("span"); ga.textContent = "획득 골드";
    const gb = document.createElement("span"); gb.textContent = "💰 " + this.goldEarned.toLocaleString();
    gb.style.color = "#ffd93d"; gb.style.fontWeight = "800";
    goldRow.append(ga, gb); box.appendChild(goldRow);

    /* total gold */
    const totalRow = document.createElement("div");
    totalRow.className = "stat-row";
    const ta = document.createElement("span"); ta.textContent = "보유 골드";
    const tb = document.createElement("span"); tb.textContent = "💰 " + this.gold.toLocaleString();
    totalRow.append(ta, tb); box.appendChild(totalRow);

    /* new record check */
    if (this.isNewRecord) {
      const nr = document.createElement("div"); nr.className = "new-record"; nr.textContent = "🏆 NEW RECORD!";
      box.insertBefore(nr, box.firstChild);
    }

    /* new unlock notification */
    const newUnlocks = [];
    const prev = this._prevUnlocks || ["exorcist", "shaman"];
    for (const [id, ch] of Object.entries(CHARACTERS)) {
      if (this.unlocks.characters.includes(id) && !prev.includes(id)) {
        newUnlocks.push(ch);
      }
    }
    if (newUnlocks.length > 0) {
      const unlockDiv = document.createElement("div");
      unlockDiv.className = "unlock-notification";
      unlockDiv.innerHTML = "🔓 <b>새 캐릭터 해금!</b><br>" +
        newUnlocks.map(c => c.icon + " " + c.name).join(", ");
      unlockDiv.style.cssText = "margin-top:12px;padding:10px;background:rgba(255,215,0,.15);border:1px solid #ffd93d;border-radius:8px;color:#ffd93d;text-align:center;font-size:15px;";
      box.appendChild(unlockDiv);
    }

    /* artifact info */
    if (this.artifact) {
      const artDiv = document.createElement("div");
      artDiv.style.cssText = "margin-top:8px;padding:8px;background:rgba(156,39,176,.12);border:1px solid #ab47bc;border-radius:8px;color:#ce93d8;text-align:center;font-size:14px;";
      artDiv.textContent = "유물: " + this.artifact.icon + " " + this.artifact.name;
      box.appendChild(artDiv);
    }

    /* synergy info */
    if (this.activeSynergy) {
      const synDiv = document.createElement("div");
      synDiv.style.cssText = "margin-top:6px;padding:8px;background:rgba(255,152,0,.12);border:1px solid #ff9800;border-radius:8px;color:#ffb74d;text-align:center;font-size:14px;";
      synDiv.textContent = "시너지: " + this.activeSynergy.name + " — " + this.activeSynergy.desc;
      box.appendChild(synDiv);
    }

    /* NG+ info */
    if (this.ngPlus > 0) {
      const ngDiv = document.createElement("div");
      ngDiv.style.cssText = "margin-top:6px;padding:6px;background:rgba(244,67,54,.12);border:1px solid #ef5350;border-radius:8px;color:#ef9a9a;text-align:center;font-size:13px;";
      ngDiv.textContent = "🔥 NG+" + this.ngPlus;
      box.appendChild(ngDiv);
    }
  }

  /* ── SHARE ── */
  _shareResult() {
    const m = Math.floor(this.elapsed / 60);
    const s = Math.floor(this.elapsed % 60);
    const ch = CHARACTERS[this.selectedChar];
    const diff = DIFFICULTIES[this.settings.difficulty];
    const won = this.ui.endTitle.textContent.includes("퇴마");

    // Create a share text
    const shareText = won
      ? `🎮 요괴야행 클리어!\n\n👤 ${ch ? ch.icon + " " + ch.name : ""}\n⏱️ ${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}\n💀 ${this.killCount} 처치\n📊 Lv ${this.level} | ${diff ? diff.emoji + " " + diff.name : ""}\n\n#요괴야행 #게임`
      : `🎮 요괴야행 - 게임 오버\n\n👤 ${ch ? ch.icon + " " + ch.name : ""}\n⏱️ ${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}\n💀 ${this.killCount} 처치\n📊 Lv ${this.level}\n\n#요괴야행 #게임`;

    // Try to copy to clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareText).then(() => {
        this._showAnnouncement("📋 결과가 클립보드에 복사되었습니다!", 3000);
      }).catch(() => {
        // Fallback: try using a textarea
        this._copyToClipboardFallback(shareText);
      });
    } else {
      this._copyToClipboardFallback(shareText);
    }
  }

  _copyToClipboardFallback(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      this._showAnnouncement("📋 결과가 클립보드에 복사되었습니다!", 3000);
    } catch (e) {
      this._showAnnouncement("❌ 클립보드 복사 실패", 3000);
    }
    document.body.removeChild(textarea);
  }

  /* ── FX ── */
  _shake(i, d) { this.shakeI = i; this.shakeT = d; }
  _flashScreen(type, duration = 0.15) {
    const flash = this.ui.screenFlash;
    if (!flash) return;
    flash.className = type;
    flash.style.opacity = '1';
    clearTimeout(this._flashTimeout);
    this._flashTimeout = setTimeout(() => {
      flash.style.opacity = '0';
    }, duration * 1000);
  }
  _spawnParticles(x, y, cnt, col) {
    /* cap particles for performance on high enemy counts */
    const budget = 400;
    if (this.particles.length > budget) cnt = max(1, floor(cnt * 0.3));
    for (let i = 0; i < cnt; i++) {
      const a = rand(0, TAU), sp = rand(1, 3.5);
      this.particles.push({ x, y, vx: cos(a) * sp, vy: sin(a) * sp, col, r: rand(2, 4.5), life: rand(0.25, 0.5), maxLife: 0.5, a: 1 });
    }
  }

  /* ── COMBO HELPER FUNCTIONS ── */
  _getComboTier(count) {
    if (count >= 50) return { name: "전설!", color: "#ffd700" };
    if (count >= 20) return { name: "초월!", color: "#e040fb" };
    if (count >= 10) return { name: "무쌍!", color: "#ff5722" };
    if (count >= 5) return { name: "연속!", color: "#4caf50" };
    return { name: "", color: "#fff" };
  }

  _spawnComboText(count) {
    const tier = this._getComboTier(count);
    if (!tier.name) return;
    this.particles.push({
      x: this.p.x + rand(-30, 30),
      y: this.p.y - 50,
      vx: 0, vy: -1,
      life: 1.5, maxLife: 1.5,
      col: tier.color,
      txt: `${tier.name} ${count}Kill!`,
      big: true,
    });
  }

  _updateComboUI() {
    const el = this.ui.comboDisplay;
    if (!el) return;
    const c = this.combo.count;
    if (c > 0) {
      el.classList.remove("hidden");
      el.querySelector("#combo-count").textContent = c;
      const tier = this._getComboTier(c);
      const tierEl = el.querySelector("#combo-tier");
      tierEl.textContent = tier.name;
      el.className = "tier-" + (c >= 50 ? 50 : c >= 20 ? 20 : c >= 10 ? 10 : c >= 5 ? 5 : 0);
    } else {
      el.classList.add("hidden");
    }
  }

  _updateHUD() {
    const p = this.p;
    const hpPercent = p.hp / p.maxHp;
    this.ui.hpBar.style.width = (hpPercent * 100) + "%";
    // HP bar color based on health percentage
    if (hpPercent < 0.3) {
      this.ui.hpBar.style.background = "linear-gradient(90deg, #f44336, #ef5350)";
    } else if (hpPercent < 0.6) {
      this.ui.hpBar.style.background = "linear-gradient(90deg, #ff9800, #ffb74d)";
    } else {
      this.ui.hpBar.style.background = "linear-gradient(90deg, #4caf50, #81c784)";
    }
    this.ui.hpTxt.textContent = Math.ceil(p.hp) + " / " + p.maxHp;
    this.ui.xpBar.style.width = (this.xp / this.xpNext * 100) + "%";
    this.ui.lvTxt.textContent = "Lv " + this.level;
    const m = floor(this.elapsed / 60), s = floor(this.elapsed % 60);
    this.ui.timer.textContent = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    this.ui.kills.textContent = Math.floor(this.totalDmg).toLocaleString() + " DMG";
    if (this.ui.hudGold) this.ui.hudGold.textContent = "💰 " + this.goldEarned;
    if (this.ui.diffBadge) {
      const d = DIFFICULTIES[this.settings.difficulty];
      if (d) this.ui.diffBadge.textContent = d.emoji + " " + d.name;
    }
    // Update combo display if active
    if (this.ui.comboDisplay && this.combo.count > 0) {
      this._updateComboUI();
    }
    // Update boss health bar
    const boss = this.enemies && this.enemies.find(e => e.boss);
    if (this.ui.bossHpWrap && this.ui.bossHpBar) {
      if (boss) {
        this.ui.bossHpWrap.classList.remove("hidden");
        const bossHpPercent = boss.hp / boss.maxHp;
        this.ui.bossHpBar.style.width = (bossHpPercent * 100) + "%";
        // Update boss HP bar color based on remaining health
        if (bossHpPercent < 0.3) {
          this.ui.bossHpBar.style.background = "linear-gradient(90deg, #f44336, #ef5350)";
        } else if (bossHpPercent < 0.6) {
          this.ui.bossHpBar.style.background = "linear-gradient(90deg, #ff9800, #ffb74d)";
        } else {
          this.ui.bossHpBar.style.background = "linear-gradient(90deg, #f06292, #e91e63)";
        }
      } else {
        this.ui.bossHpWrap.classList.add("hidden");
      }
    }
  }

  /* ═══════════════════ RENDER ═══════════════════ */
  _render() {
    const c = this.ctx, sw = this.sw, sh = this.sh;
    c.clearRect(0, 0, sw, sh);
    if (this.state === "menu" || this.state === "charSelect" || this.state === "shop" || this.state === "settings") return;
    // Skip rendering if game objects not initialized yet
    if (!this.cam || !this.p) return;

    const cx = this.cam.x, cy = this.cam.y;
    const toX = x => x - cx, toY = y => y - cy;

    /* ── background (map-aware) ── */
    const mapD = this.mapDef || MAPS.bamboo;
    c.fillStyle = mapD.bg || "#081210"; c.fillRect(0, 0, sw, sh);
    const gs = 60; c.strokeStyle = mapD.gridCol || "rgba(80,160,100,.04)"; c.lineWidth = 1;
    const ox = -(cx % gs), oy = -(cy % gs);
    c.beginPath();
    for (let x = ox; x < sw; x += gs) { c.moveTo(x, 0); c.lineTo(x, sh); }
    for (let y = oy; y < sh; y += gs) { c.moveTo(0, y); c.lineTo(sw, y); }
    c.stroke();

    /* map-specific decorations */
    if (mapD.bamboo) {
      const bSpacing = 140; c.strokeStyle = "rgba(60,130,80,.1)"; c.lineWidth = 3;
      const bOx = -(cx % bSpacing);
      for (let bx = bOx - bSpacing; bx < sw + bSpacing; bx += bSpacing) {
        const wx = bx + cx, jitter = ((wx * 7 + 13) % bSpacing) * 0.3;
        const sx = bx + jitter; c.beginPath(); c.moveTo(sx, 0); c.lineTo(sx, sh); c.stroke();
        c.lineWidth = 1.5;
        for (let ny = ((cy * 3 + wx) % 80); ny < sh; ny += rand(70, 110)) {
          c.beginPath(); c.moveTo(sx - 6, ny); c.lineTo(sx + 6, ny); c.stroke();
        }
        c.lineWidth = 3;
      }
    }
    if (mapD.graveFx) {
      /* graveyard: tombstones */
      const tSpacing = 180; c.fillStyle = "rgba(120,80,80,.08)";
      const tOx = -(cx % tSpacing), tOy = -(cy % tSpacing);
      for (let tx = tOx; tx < sw; tx += tSpacing) {
        for (let ty = tOy; ty < sh; ty += tSpacing) {
          const jx = ((tx + cx) * 13 + 7) % tSpacing * 0.4;
          const jy = ((ty + cy) * 11 + 3) % tSpacing * 0.3;
          c.fillRect(tx + jx - 5, ty + jy - 12, 10, 16);
          c.fillRect(tx + jx - 8, ty + jy - 8, 16, 4);
        }
      }
    }
    /* water zones */
    if (this.waterZones && this.waterZones.length) {
      for (const wz of this.waterZones) {
        const wzx = toX(wz.x), wzy = toY(wz.y);
        if (wzx < -wz.r - 50 || wzx > sw + wz.r + 50 || wzy < -wz.r - 50 || wzy > sh + wz.r + 50) continue;
        c.save(); c.globalAlpha = 0.08; c.fillStyle = "#29b6f6";
        c.beginPath(); c.arc(wzx, wzy, wz.r, 0, TAU); c.fill();
        c.globalAlpha = 0.15; c.strokeStyle = "#0288d1"; c.lineWidth = 2;
        c.beginPath(); c.arc(wzx, wzy, wz.r, 0, TAU); c.stroke();
        /* wave lines */
        c.globalAlpha = 0.06; c.strokeStyle = "#81d4fa"; c.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          const wr = wz.r * (0.4 + i * 0.25);
          c.beginPath(); c.arc(wzx, wzy, wr, 0, TAU); c.stroke();
        }
        c.restore();
      }
    }

    /* moon (if map has it) */
    if (mapD.moon !== false) {
      c.save(); c.globalAlpha = 0.08; c.fillStyle = "#ffffcc";
      c.beginPath(); c.arc(sw - 120, 80, 60, 0, TAU); c.fill();
      c.globalAlpha = 0.03; c.beginPath(); c.arc(sw - 120, 80, 90, 0, TAU); c.fill(); c.restore();
    }

    /* world border */
    c.strokeStyle = "rgba(200,80,80,.25)"; c.lineWidth = 3;
    c.strokeRect(toX(0), toY(0), W, H);

    /* ── atmospheric vignette ── */
    c.save();
    const vx = toX(this.p.x), vy = toY(this.p.y);
    const vGrad = c.createRadialGradient(vx, vy, min(W, H) * 0.3, vx, vy, max(W, H) * 0.8);
    vGrad.addColorStop(0, "rgba(0,0,0,0)");
    vGrad.addColorStop(0.5, "rgba(0,0,0,0.15)");
    vGrad.addColorStop(1, "rgba(0,0,0,0.5)");
    c.fillStyle = vGrad; c.fillRect(0, 0, cw, ch);
    c.restore();

    /* ── allure line ── */
    if (this.allureT > 0 && this.allureSrc) {
      c.save(); c.globalAlpha = this.allureT / 2 * 0.3; c.strokeStyle = "#f06292"; c.lineWidth = 2;
      c.setLineDash([6, 6]); c.beginPath();
      c.moveTo(toX(this.allureSrc.x), toY(this.allureSrc.y));
      c.lineTo(toX(this.p.x), toY(this.p.y)); c.stroke();
      c.setLineDash([]); c.restore();
    }

    /* ── aura visual ── */
    const auraW = this.weapons.find(w => w.type === "aura");
    if (auraW) {
      const aLv = WDEFS.aura.lvs[auraW.lv]; c.beginPath();
      c.arc(toX(this.p.x), toY(this.p.y), aLv.rad, 0, TAU);
      c.fillStyle = "rgba(206,147,216,.06)"; c.fill();
      c.strokeStyle = "rgba(206,147,216,.2)"; c.lineWidth = 1.5; c.stroke();
    }

    /* ── clouds ── */
    for (const cl of this.clouds) {
      const sx = toX(cl.x), sy = toY(cl.y);
      c.save(); c.globalAlpha = min(0.3, cl.life / cl.dur * 0.35);
      c.fillStyle = "#7e57c2"; c.beginPath(); c.arc(sx, sy, cl.rad, 0, TAU); c.fill();
      c.restore();
    }

    /* ── frost waves ── */
    for (const fw of this.frostWaves) {
      c.beginPath(); c.arc(toX(fw.x), toY(fw.y), fw.rad, 0, TAU);
      c.strokeStyle = "rgba(128,222,234,.5)"; c.lineWidth = 4; c.stroke();
      c.fillStyle = "rgba(128,222,234,.05)"; c.fill();
    }

    /* ── wind bursts ── */
    for (const wb of this.windBursts) {
      c.save();
      c.globalAlpha = max(0, 1 - wb.rad / wb.maxRad) * 0.4;
      const wbCol = wb.col || "#b0bec5";
      c.strokeStyle = wbCol; c.lineWidth = 6;
      c.beginPath(); c.arc(toX(wb.x), toY(wb.y), wb.rad, 0, TAU); c.stroke();
      c.fillStyle = wbCol; c.globalAlpha *= 0.12; c.fill();
      c.restore();
    }

    /* ── ghost telegraph ── */
    for (const e of this.enemies) {
      if (e.type === "ghost" && e.state === "telegraph") {
        c.save(); c.globalAlpha = 0.3 + sin(this.elapsed * 20) * 0.15;
        c.strokeStyle = "#e8eaf6"; c.lineWidth = 2; c.setLineDash([4, 4]);
        c.beginPath(); c.arc(toX(e.targetX), toY(e.targetY), 18, 0, TAU); c.stroke();
        c.setLineDash([]); c.restore();
      }
    }

    /* ── treasure chests ── */
    for (const ch of this.chests) {
      const sx = toX(ch.x), sy = toY(ch.y);
      if (sx < -30 || sx > sw + 30 || sy < -30 || sy > sh + 30) continue;
      c.save();
      const pulse = 0.8 + sin(this.elapsed * 4) * 0.2;
      const bounce = sin(this.elapsed * 3) * 3;
      c.globalAlpha = ch.life < 3 ? ch.life / 3 : 1;
      const chCol = ch.type === "boss" ? "#ffd93d" : "#ffcc80";
      // Glow effect
      c.fillStyle = chCol; c.shadowColor = chCol; c.shadowBlur = 16 * pulse;
      /* chest body */
      c.fillRect(sx - 12, sy - 8 + bounce, 24, 16);
      /* chest lid */
      c.fillStyle = ch.type === "boss" ? "#ff8f00" : "#a1887f";
      c.fillRect(sx - 12, sy - 8 + bounce, 24, 5);
      /* decorative stripe */
      c.fillStyle = ch.type === "boss" ? "#ff6f00" : "#8d6e63";
      c.fillRect(sx - 12, sy - 2 + bounce, 24, 2);
      /* icon */
      c.fillStyle = "#fff"; c.font = "bold 10px sans-serif"; c.textAlign = "center";
      c.fillText(ch.type === "boss" ? "★" : "?", sx, sy + 6 + bounce);
      c.restore();
    }

    /* ── talismans ── */
    for (const t of this.talismans) {
      const sx = toX(t.x), sy = toY(t.y);
      c.save(); c.globalAlpha = t.life < 3 ? t.life / 3 : 1;
      const tcol = t.type === "heal" ? "#66bb6a" : "#42a5f5";
      c.fillStyle = tcol; c.shadowColor = tcol; c.shadowBlur = 12;
      c.fillRect(sx - 7, sy - 10, 14, 20);
      c.fillStyle = "#fff"; c.font = "bold 10px sans-serif"; c.textAlign = "center";
      c.fillText(t.type === "heal" ? "回" : "磁", sx, sy + 4);
      c.restore();
    }

    /* ── gold coins ── */
    for (const gc of this.goldCoins) {
      const sx = toX(gc.x), sy = toY(gc.y);
      if (sx < -15 || sx > sw + 15 || sy < -15 || sy > sh + 15) continue;
      c.save();
      c.globalAlpha = gc.life < 2 ? gc.life / 2 : 1;
      c.fillStyle = "#ffd93d"; c.shadowColor = "#ffd93d"; c.shadowBlur = 6;
      c.beginPath(); c.arc(sx, sy, gc.r, 0, TAU); c.fill();
      c.fillStyle = "#ff8f00"; c.font = "bold 7px sans-serif"; c.textAlign = "center";
      c.fillText("$", sx, sy + 3);
      c.restore();
    }

    /* ── power-ups ── */
    for (const pu of this.powerupDrops) {
      const sx = toX(pu.x), sy = toY(pu.y);
      if (sx < -20 || sx > sw + 20 || sy < -20 || sy > sh + 20) continue;
      const def = POWERUPS[pu.type];
      if (!def) continue;
      c.save();
      c.globalAlpha = 0.7 + Math.sin(this.elapsed * 6) * 0.2;
      c.fillStyle = def.col; c.shadowColor = def.col; c.shadowBlur = 14;
      c.beginPath(); c.arc(sx, sy, pu.r, 0, TAU); c.fill();
      c.fillStyle = "#fff"; c.font = "14px sans-serif"; c.textAlign = "center";
      c.fillText(def.icon, sx, sy + 5);
      c.restore();
    }

    /* ── gems ── */
    for (const g of this.gems) {
      const sx = toX(g.x), sy = toY(g.y);
      if (sx < -20 || sx > sw + 20 || sy < -20 || sy > sh + 20) continue;
      c.save(); c.translate(sx, sy); c.rotate(PI / 4);
      c.fillStyle = g.col; c.shadowColor = g.col; c.shadowBlur = 8;
      c.fillRect(-g.r, -g.r, g.r * 2, g.r * 2); c.restore();
    }

    /* ── pets ── */
    for (const pet of this.pets) {
      const sx = toX(pet.x), sy = toY(pet.y);
      const icons = { foxPet: "🦊", ghostPet: "👻", spiritBird: "🐦", dragonSalamander: "🐉" };
      const petGlow = { foxPet: "#ff8a65", ghostPet: "#b39ddb", spiritBird: "#4db6ac", dragonSalamander: "#ff7043" };
      c.save();
      // Floating animation
      const floatY = sin(this.elapsed * 3 + pet.x) * 3;
      // Glow effect based on pet type
      c.shadowColor = petGlow[pet.type] || "#fff"; c.shadowBlur = 15;
      c.font = "20px sans-serif"; c.textAlign = "center";
      c.fillText(icons[pet.type] || "?", sx, sy + 6 + floatY);
      c.restore();
    }

    /* ── enemies (skip off-screen for perf) ── */
    for (const e of this.enemies) {
      const sx = toX(e.x), sy = toY(e.y);
      if (sx < -50 || sx > sw + 50 || sy < -50 || sy > sh + 50) continue;
      const hf = e.hitT > 0; c.save(); c.globalAlpha = e.alpha || 1;

      /* elite glow */
      if (e.elite) {
        c.shadowColor = "#ffd93d"; c.shadowBlur = 16;
      }

      if (e.type === "wisp") {
        c.globalAlpha = (e.alpha || 1) * (0.55 + sin(this.elapsed * 10 + e.id) * 0.3);
        c.fillStyle = hf ? "#fff" : "#00e5ff"; c.shadowColor = "#00e5ff"; c.shadowBlur = 14;
        c.beginPath(); c.arc(sx, sy, e.r, 0, TAU); c.fill();
      } else if (e.type === "ghost") {
        c.fillStyle = hf ? "#fff" : e.col; c.beginPath(); c.arc(sx, sy, e.r, 0, TAU); c.fill();
        if (!hf) {
          c.strokeStyle = "#1a1a2e"; c.lineWidth = 1.5;
          for (let h = -6; h <= 6; h += 3) { c.beginPath(); c.moveTo(sx + h, sy - e.r * 0.4); c.lineTo(sx + h, sy + e.r + 5); c.stroke(); }
        }
        if (e.frozenT > 0) { c.strokeStyle = "#80deea"; c.lineWidth = 2; c.beginPath(); c.arc(sx, sy, e.r + 3, 0, TAU); c.stroke(); }
      } else if (e.type === "gumiho" || e.type === "foxClone") {
        c.fillStyle = hf ? "#fff" : e.col;
        c.shadowColor = e.boss ? "#f06292" : "transparent";
        if (e.boss) c.shadowBlur = 22;
        c.beginPath(); c.arc(sx, sy, e.r, 0, TAU); c.fill();
        c.fillStyle = hf ? "#fff" : e.col;
        c.beginPath(); c.moveTo(sx - e.r * 0.6, sy - e.r); c.lineTo(sx - e.r * 0.25, sy - e.r - 14); c.lineTo(sx + e.r * 0.1, sy - e.r); c.fill();
        c.beginPath(); c.moveTo(sx - e.r * 0.1, sy - e.r); c.lineTo(sx + e.r * 0.25, sy - e.r - 14); c.lineTo(sx + e.r * 0.6, sy - e.r); c.fill();
        if (e.boss) {
          c.strokeStyle = e.col; c.lineWidth = 2.5;
          for (let t = 0; t < 3; t++) {
            const ta = -PI / 2 + (t - 1) * 0.4 + sin(this.elapsed * 2 + t) * 0.25;
            c.beginPath(); c.moveTo(sx, sy + e.r);
            c.quadraticCurveTo(sx + cos(ta) * 35, sy + e.r + 18, sx + cos(ta) * 28, sy + e.r + 32); c.stroke();
          }
        }
        c.fillStyle = hf ? "#ccc" : "#fff"; c.beginPath();
        c.arc(sx - e.r * 0.25, sy - e.r * 0.1, e.r * 0.15, 0, TAU);
        c.arc(sx + e.r * 0.25, sy - e.r * 0.1, e.r * 0.15, 0, TAU); c.fill();
        c.fillStyle = "#1a1a2e"; c.beginPath();
        c.arc(sx - e.r * 0.25, sy - e.r * 0.1, e.r * 0.08, 0, TAU);
        c.arc(sx + e.r * 0.25, sy - e.r * 0.1, e.r * 0.08, 0, TAU); c.fill();
      } else if (e.type === "bulgasari") {
        /* 불가사리: rocky armored body */
        c.fillStyle = hf ? "#fff" : (e.slowT > 0 ? "#80deea" : e.col);
        c.beginPath(); c.arc(sx, sy, e.r, 0, TAU); c.fill();
        /* armor plates */
        if (!hf) {
          c.strokeStyle = "#546e7a"; c.lineWidth = 2;
          c.beginPath(); c.arc(sx, sy, e.r * 0.7, 0, TAU); c.stroke();
          c.beginPath(); c.arc(sx, sy, e.r * 0.4, 0, TAU); c.stroke();
        }
        c.fillStyle = "#263238"; c.beginPath();
        c.arc(sx - e.r * 0.25, sy - e.r * 0.1, 2, 0, TAU);
        c.arc(sx + e.r * 0.25, sy - e.r * 0.1, 2, 0, TAU); c.fill();
      } else if (e.type === "jangsan") {
        /* 장산범: tiger-like */
        c.fillStyle = hf ? "#fff" : (e.slowT > 0 ? "#80deea" : e.col);
        c.beginPath(); c.arc(sx, sy, e.r, 0, TAU); c.fill();
        /* stripes */
        if (!hf) {
          c.strokeStyle = "#bf360c"; c.lineWidth = 2;
          for (let s = -1; s <= 1; s += 2) {
            c.beginPath(); c.moveTo(sx + s * 4, sy - e.r * 0.6); c.lineTo(sx + s * 6, sy + e.r * 0.4); c.stroke();
          }
        }
        /* pounce indicator */
        if (e.state === "crouch") {
          c.strokeStyle = "#ff6d00"; c.lineWidth = 2; c.setLineDash([3, 3]);
          c.beginPath(); c.arc(sx, sy, e.r + 5, 0, TAU); c.stroke();
          c.setLineDash([]);
        }
        c.fillStyle = hf ? "#ccc" : "#fff3e0"; c.beginPath();
        c.arc(sx - 4, sy - 3, 2, 0, TAU); c.arc(sx + 4, sy - 3, 2, 0, TAU); c.fill();
        c.fillStyle = "#1a1a2e"; c.beginPath();
        c.arc(sx - 4, sy - 3, 1, 0, TAU); c.arc(sx + 4, sy - 3, 1, 0, TAU); c.fill();
      } else if (e.type === "imugi") {
        /* 이무기: serpent elite */
        c.fillStyle = hf ? "#fff" : e.col;
        c.shadowColor = "#ffd93d"; c.shadowBlur = 18;
        /* body segments */
        for (let s = 3; s >= 0; s--) {
          const sa = atan2(this.p.y - e.y, this.p.x - e.x);
          const segX = e.x - cos(sa) * s * 12 + sin(this.elapsed * 4 + s) * 5;
          const segY = e.y - sin(sa) * s * 12 + cos(this.elapsed * 4 + s) * 5;
          c.beginPath(); c.arc(toX(segX), toY(segY), e.r - s * 2, 0, TAU); c.fill();
        }
        /* head */
        c.beginPath(); c.arc(sx, sy, e.r, 0, TAU); c.fill();
        /* crown (elite marker) */
        c.fillStyle = "#ffd93d";
        c.beginPath(); c.moveTo(sx - 8, sy - e.r); c.lineTo(sx - 4, sy - e.r - 10); c.lineTo(sx, sy - e.r - 4);
        c.lineTo(sx + 4, sy - e.r - 10); c.lineTo(sx + 8, sy - e.r); c.fill();
        /* eyes */
        c.fillStyle = "#fff"; c.beginPath();
        c.arc(sx - 5, sy - 3, 3, 0, TAU); c.arc(sx + 5, sy - 3, 3, 0, TAU); c.fill();
        c.fillStyle = "#c62828"; c.beginPath();
        c.arc(sx - 5, sy - 3, 1.5, 0, TAU); c.arc(sx + 5, sy - 3, 1.5, 0, TAU); c.fill();
      } else if (e.type === "dokkaKing") {
        /* 도깨비왕: large dokkaebi with crown */
        c.fillStyle = hf ? "#fff" : e.col;
        c.shadowColor = "#ffd93d"; c.shadowBlur = 18;
        c.beginPath(); c.arc(sx, sy, e.r, 0, TAU); c.fill();
        /* horn */
        c.fillStyle = hf ? "#fff" : "#bf360c";
        c.beginPath(); c.moveTo(sx - 6, sy - e.r); c.lineTo(sx - 2, sy - e.r - 16); c.lineTo(sx + 2, sy - e.r); c.fill();
        c.beginPath(); c.moveTo(sx + 2, sy - e.r); c.lineTo(sx + 6, sy - e.r - 16); c.lineTo(sx + 10, sy - e.r); c.fill();
        /* crown */
        c.fillStyle = "#ffd93d";
        c.beginPath(); c.moveTo(sx - 10, sy - e.r + 2); c.lineTo(sx - 6, sy - e.r - 8); c.lineTo(sx, sy - e.r + 2);
        c.lineTo(sx + 6, sy - e.r - 8); c.lineTo(sx + 10, sy - e.r + 2); c.fill();
        /* eyes */
        c.fillStyle = "#fff"; c.beginPath();
        c.arc(sx - 5, sy - 3, 3, 0, TAU); c.arc(sx + 5, sy - 3, 3, 0, TAU); c.fill();
        c.fillStyle = "#1a1a2e"; c.beginPath();
        c.arc(sx - 5, sy - 3, 1.5, 0, TAU); c.arc(sx + 5, sy - 3, 1.5, 0, TAU); c.fill();
      } else if (e.type === "haetae") {
        /* 해태: golden lion guardian */
        c.fillStyle = hf ? "#fff" : e.col;
        c.shadowColor = "#ffc107"; c.shadowBlur = 20;
        c.beginPath(); c.arc(sx, sy, e.r, 0, TAU); c.fill();
        /* mane */
        if (!hf) {
          c.strokeStyle = "#ff8f00"; c.lineWidth = 3;
          for (let i = 0; i < 8; i++) {
            const ma = TAU / 8 * i + sin(this.elapsed * 2) * 0.1;
            c.beginPath();
            c.moveTo(sx + cos(ma) * e.r, sy + sin(ma) * e.r);
            c.lineTo(sx + cos(ma) * (e.r + 10), sy + sin(ma) * (e.r + 10));
            c.stroke();
          }
        }
        /* eyes */
        c.fillStyle = "#fff"; c.beginPath();
        c.arc(sx - 6, sy - 4, 3.5, 0, TAU); c.arc(sx + 6, sy - 4, 3.5, 0, TAU); c.fill();
        c.fillStyle = "#d32f2f"; c.beginPath();
        c.arc(sx - 6, sy - 4, 2, 0, TAU); c.arc(sx + 6, sy - 4, 2, 0, TAU); c.fill();
      } else {
        /* 도깨비, 해골 etc */
        c.beginPath(); c.arc(sx, sy, e.r, 0, TAU);
        c.fillStyle = hf ? "#fff" : (e.slowT > 0 ? "#80deea" : (e.frozenT > 0 ? "#b3e5fc" : e.col));
        c.fill();
        if (e.type === "dokkaebi") {
          c.fillStyle = hf ? "#fff" : "#bf360c";
          c.beginPath(); c.moveTo(sx - 3, sy - e.r); c.lineTo(sx, sy - e.r - 10); c.lineTo(sx + 3, sy - e.r); c.fill();
          if (e.state === "charge") {
            c.strokeStyle = "#ff6d00"; c.lineWidth = 2;
            c.beginPath(); c.arc(sx, sy, e.r + 4, 0, TAU); c.stroke();
          }
        }
        if (e.type === "skeleton" && e.state === "ranged") {
          c.strokeStyle = "rgba(255,255,255,.2)"; c.lineWidth = 1;
          const ta = atan2(this.p.y - e.y, this.p.x - e.x);
          c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + cos(ta) * 30, sy + sin(ta) * 30); c.stroke();
        }
        c.fillStyle = hf ? "#ccc" : "rgba(0,0,0,.5)"; c.beginPath();
        c.arc(sx - e.r * 0.28, sy - e.r * 0.15, e.r * 0.18, 0, TAU);
        c.arc(sx + e.r * 0.28, sy - e.r * 0.15, e.r * 0.18, 0, TAU); c.fill();
        if (e.frozenT > 0) {
          c.strokeStyle = "#80deea"; c.lineWidth = 2;
          c.beginPath(); c.arc(sx, sy, e.r + 3, 0, TAU); c.stroke();
        }
      }

      /* HP bar */
      if (e.hp < e.maxHp) {
        const bw = e.r * 2.2, bh = 3; c.globalAlpha = 1;
        c.fillStyle = "rgba(0,0,0,.5)"; c.fillRect(sx - bw / 2, sy - e.r - 8, bw, bh);
        c.fillStyle = e.boss ? "#f06292" : (e.elite ? "#ffd93d" : "#ef5350");
        c.fillRect(sx - bw / 2, sy - e.r - 8, bw * (e.hp / e.maxHp), bh);
      }
      c.restore();
    }

    /* ── enemy projectiles ── */
    for (const p of this.enemyProjs) {
      const sx = toX(p.x), sy = toY(p.y);
      c.save();
      // Danger glow
      c.shadowColor = p.col; c.shadowBlur = 10;
      // Warning outer ring
      c.globalAlpha = 0.3;
      c.strokeStyle = p.col; c.lineWidth = 1.5;
      c.beginPath(); c.arc(sx, sy, p.r + 3, 0, TAU); c.stroke();
      // Main projectile
      c.globalAlpha = 1;
      c.beginPath(); c.arc(sx, sy, p.r, 0, TAU); c.fillStyle = p.col; c.fill();
      c.restore();
    }

    /* ── player projectiles ── */
    for (const p of this.projs) {
      const sx = toX(p.x), sy = toY(p.y);
      if (sx < -20 || sx > sw + 20 || sy < -20 || sy > sh + 20) continue;
      c.save();
      // Glow effect
      c.shadowColor = p.col; c.shadowBlur = 12;
      // Main projectile
      c.beginPath(); c.arc(sx, sy, p.r, 0, TAU); c.fillStyle = p.col; c.fill();
      // Inner bright core
      c.beginPath(); c.arc(sx, sy, p.r * 0.5, 0, TAU); c.fillStyle = "#fff"; c.fill();
      // Trail effect
      c.globalAlpha = 0.5;
      c.beginPath(); c.arc(sx - p.vx * 0.05, sy - p.vy * 0.05, p.r * 0.8, 0, TAU);
      c.fillStyle = p.col; c.fill();
      c.restore();
    }

    /* ── blade / ghostSlash ── */
    const blW = this.weapons.find(w => w.type === "blade" || w.type === "ghostSlash");
    if (blW) {
      const def = getWDef(blW.type), bLv = def.lvs[blW.lv], step = TAU / bLv.cnt;
      const bCol = blW.type === "ghostSlash" ? "#a5d6a7" : "#ffd54f";
      for (let i = 0; i < bLv.cnt; i++) {
        const a = this.bladeAngle + step * i;
        const bx = toX(this.p.x + cos(a) * bLv.rad), by = toY(this.p.y + sin(a) * bLv.rad);
        c.save(); c.translate(bx, by); c.rotate(a + PI / 2);
        c.fillStyle = bCol; c.shadowColor = bCol; c.shadowBlur = 8;
        c.beginPath(); c.moveTo(0, -14); c.lineTo(-5, 0); c.lineTo(0, 7); c.lineTo(5, 0); c.closePath(); c.fill();
        c.restore();
      }
    }

    /* ── beads / divineWind ── */
    const bdW = this.weapons.find(w => w.type === "beads" || w.type === "divineWind");
    if (bdW) {
      const def = getWDef(bdW.type), bLv = def.lvs[bdW.lv], step = TAU / bLv.cnt;
      const bCol = bdW.type === "divineWind" ? "#fff176" : "#ffcc80";
      for (let i = 0; i < bLv.cnt; i++) {
        const a = this.beadsAngle + step * i;
        const bx = toX(this.p.x + cos(a) * bLv.rad), by = toY(this.p.y + sin(a) * bLv.rad);
        c.save(); c.fillStyle = bCol; c.shadowColor = bCol; c.shadowBlur = 10;
        c.beginPath(); c.arc(bx, by, 6, 0, TAU); c.fill();
        /* trail for divineWind */
        if (bdW.type === "divineWind") {
          c.globalAlpha = 0.3;
          const prevA = a - step * 0.15;
          c.beginPath(); c.arc(toX(this.p.x + cos(prevA) * bLv.rad), toY(this.p.y + sin(prevA) * bLv.rad), 4, 0, TAU); c.fill();
        }
        c.restore();
      }
    }

    /* ── lightning bolts ── */
    for (const l of this.lightnings) {
      c.save();
      // Ring effect (when r property exists)
      if (l.r !== undefined && l.maxR !== undefined) {
        const progress = 1 - (l.life / l.maxLife);
        const rad = l.r + (l.maxR - l.r) * progress;
        const sx = toX(l.x), sy = toY(l.y);
        c.globalAlpha = l.life / l.maxLife;
        c.strokeStyle = l.col; c.shadowColor = l.col; c.shadowBlur = 20; c.lineWidth = 4;
        c.beginPath(); c.arc(sx, sy, rad, 0, TAU); c.stroke();
      } else {
        // Lightning bolt effect
        c.globalAlpha = min(1, l.t / 0.1);
        const lc = l.col || "#ffeb3b"; c.strokeStyle = lc; c.shadowColor = lc; c.shadowBlur = 15; c.lineWidth = 3;
        const sx = toX(l.x1), sy = toY(l.y1), ex = toX(l.x2), ey = toY(l.y2);
        c.beginPath(); c.moveTo(sx, sy);
        for (let i = 1; i < 6; i++) { const t = i / 6; c.lineTo(sx + (ex - sx) * t + rand(-15, 15), sy + (ey - sy) * t + rand(-15, 15)); }
        c.lineTo(ex, ey); c.stroke();
      }
      c.restore();
    }

    /* ── scythe slashes ── */
    if (this.scytheSlashes) {
      for (const sl of this.scytheSlashes) {
        c.save();
        c.globalAlpha = min(1, sl.t / 0.1) * 0.5;
        c.strokeStyle = sl.col; c.shadowColor = sl.col; c.shadowBlur = 12; c.lineWidth = 4;
        const sx = toX(sl.x), sy = toY(sl.y);
        c.beginPath();
        c.arc(sx, sy, sl.rad, sl.facing - sl.arc / 2, sl.facing + sl.arc / 2);
        c.stroke();
        c.restore();
      }
    }

    /* ── particles ── */
    for (const pt of this.particles) {
      if (pt.txt) {
        // combo text particle
        c.globalAlpha = pt.a;
        c.font = (pt.big ? "bold 20px" : "bold 14px") + " 'Segoe UI',sans-serif";
        c.fillStyle = pt.col;
        c.textAlign = "center";
        c.fillText(pt.txt, toX(pt.x), toY(pt.y));
      } else {
        // regular particle
        c.globalAlpha = pt.a; c.beginPath();
        c.arc(toX(pt.x), toY(pt.y), pt.r * pt.a, 0, TAU);
        c.fillStyle = pt.col; c.fill();
      }
    }
    c.globalAlpha = 1;

    /* ── ambient spirits (fireflies) ── */
    for (const s of this.ambientSpirits) {
      const pulse = 0.5 + sin(this.elapsed * 3 + s.phase) * 0.5;
      c.globalAlpha = pulse * (s.life / s.maxLife) * 0.7;
      c.fillStyle = s.col;
      c.shadowColor = s.col;
      c.shadowBlur = 12;
      c.beginPath(); c.arc(toX(s.x), toY(s.y), s.r * pulse, 0, TAU); c.fill();
      c.shadowBlur = 0;
    }
    c.globalAlpha = 1;

    /* ── player ── */
    {
      const sx = toX(this.p.x), sy = toY(this.p.y); c.save();

      // Glow effect when invincible or active power-ups
      if (this.p.invT > 0 || this.activePowerups.inv) {
        c.shadowColor = "#e040fb"; c.shadowBlur = 25;
      } else {
        c.shadowColor = "#ffd54f"; c.shadowBlur = 16;
      }

      c.beginPath(); c.arc(sx, sy, this.p.r, 0, TAU);
      const flash = this.p.flashT > 0, blink = this.p.invT > 0 && floor(this.p.invT * 12) % 2 === 0;
      c.fillStyle = flash ? "#ff5252" : blink ? "rgba(255,213,79,.4)" : "#fafafa"; c.fill(); c.restore();

      // Power-up active indicator rings
      if (this.activePowerups.speed) {
        c.save();
        c.globalAlpha = 0.4 + sin(this.elapsed * 6) * 0.2;
        c.strokeStyle = "#ffeb3b"; c.lineWidth = 2;
        c.beginPath(); c.arc(sx, sy, this.p.r + 6, 0, TAU); c.stroke();
        c.restore();
      }
      if (this.activePowerups.inv) {
        c.save();
        c.globalAlpha = 0.5 + sin(this.elapsed * 8) * 0.3;
        c.strokeStyle = "#e040fb"; c.lineWidth = 3;
        c.beginPath(); c.arc(sx, sy, this.p.r + 8, 0, TAU); c.stroke();
        c.restore();
      }
      if (this.activePowerups.shield) {
        c.save();
        c.globalAlpha = 0.3 + sin(this.elapsed * 4) * 0.15;
        c.strokeStyle = "#42a5f5"; c.lineWidth = 4;
        c.beginPath(); c.arc(sx, sy, this.p.r + 12, 0, TAU); c.stroke();
        c.globalAlpha = 0.15; c.fillStyle = "#42a5f5";
        c.beginPath(); c.arc(sx, sy, this.p.r + 12, 0, TAU); c.fill();
        c.restore();
      }
      if (this.activePowerups.critBoost) {
        c.save();
        c.globalAlpha = 0.4 + sin(this.elapsed * 5) * 0.2;
        c.strokeStyle = "#ff7043"; c.lineWidth = 2;
        c.beginPath(); c.arc(sx, sy, this.p.r + 5, 0, TAU); c.stroke();
        c.restore();
      }

      /* headband - color varies by character */
      const hbColors = { exorcist: "#d32f2f", shaman: "#7b1fa2", taoist: "#1565c0", hunter: "#2e7d32", monk: "#ff6f00", foxSpirit: "#f06292", reaper: "#6a1b9a", mountainGod: "#5d4037", seaDiver: "#0277bd" };
      c.fillStyle = hbColors[this.selectedChar] || "#d32f2f";
      c.fillRect(sx - this.p.r * 0.8, sy - this.p.r * 0.7, this.p.r * 1.6, 3);
      /* facing arrow */
      c.fillStyle = "#ffd54f"; c.beginPath();
      const fa = this.p.facing;
      c.moveTo(sx + cos(fa) * (this.p.r + 5), sy + sin(fa) * (this.p.r + 5));
      c.lineTo(sx + cos(fa + 2.6) * this.p.r * 0.5, sy + sin(fa + 2.6) * this.p.r * 0.5);
      c.lineTo(sx + cos(fa - 2.6) * this.p.r * 0.5, sy + sin(fa - 2.6) * this.p.r * 0.5);
      c.closePath(); c.fill();
      /* eyes */
      c.fillStyle = "#1a1a2e"; c.beginPath();
      c.arc(sx - 4, sy - 2, 2.5, 0, TAU); c.arc(sx + 4, sy - 2, 2.5, 0, TAU); c.fill();
    }

    /* ── damage numbers ── */
    for (const d of this.dmgNums) {
      c.globalAlpha = d.a;
      c.font = (d.big ? "bold 18px" : "bold 13px") + " 'Segoe UI',sans-serif";
      c.fillStyle = d.col; c.textAlign = "center"; c.fillText(d.txt, toX(d.x), toY(d.y));
    }
    c.globalAlpha = 1;

    /* ── VFX: particles ── */
    for (const p of this.vfx.particles) {
      const alpha = p.fade ? p.life / p.maxLife : 1;
      c.globalAlpha = alpha;
      c.fillStyle = p.col;
      c.beginPath(); c.arc(toX(p.x), toY(p.y), p.r * (p.life / p.maxLife), 0, TAU); c.fill();
    }

    /* ── VFX: hit sparks ── */
    for (const s of this.vfx.hitSparks) {
      const alpha = s.life / s.maxLife;
      c.globalAlpha = alpha;
      c.fillStyle = s.col;
      c.beginPath(); c.arc(toX(s.x), toY(s.y), s.r * alpha, 0, TAU); c.fill();
    }

    /* ── VFX: weapon trails ── */
    for (const t of this.vfx.weaponTrails) {
      const alpha = t.life / t.maxLife;
      c.globalAlpha = alpha * 0.6;
      c.strokeStyle = t.col;
      c.lineWidth = 4 * alpha;
      c.lineCap = "round";
      c.beginPath();
      const tx = toX(t.x), ty = toY(t.y);
      const tailX = tx - cos(t.angle) * t.len;
      const tailY = ty - sin(t.angle) * t.len;
      c.moveTo(tailX, tailY); c.lineTo(tx, ty); c.stroke();
      c.lineCap = "butt";
    }

    /* ── VFX: damage numbers (new system) ── */
    for (const d of this.vfx.damageNumbers) {
      const alpha = d.life / d.maxLife;
      const scale = d.scale * (1 + (1 - alpha) * 0.2);
      c.globalAlpha = alpha;
      c.font = `bold ${16 * scale}px 'Segoe UI',sans-serif`;
      c.textAlign = "center";
      c.save();
      c.translate(toX(d.x), toY(d.y));
      c.rotate(d.rotation * (1 - alpha));
      if (d.isCrit) {
        c.shadowColor = d.isKill ? "#ff1744" : "#ff9800";
        c.shadowBlur = 15;
      }
      c.fillStyle = d.isKill ? "#ff1744" : (d.isCrit ? "#ff9800" : "#fff");
      c.fillText(d.dmg.toString(), 0, 0);
      c.restore();
    }

    /* ── VFX: blood splats ── */
    for (const b of this.vfx.bloodSplats) {
      const alpha = min(1, b.life / 0.5) * 0.4;
      c.globalAlpha = alpha;
      c.fillStyle = "#b71c1c";
      c.beginPath();
      c.arc(toX(b.x), toY(b.y), b.size * 3, 0, TAU); c.fill();
    }

    c.globalAlpha = 1;

    /* ── minimap ── */
    this._renderMinimap(c);

    /* ── mobile joystick ── */
    if (this.isMobile && this.touch.active) {
      const jx = this.touch.ox, jy = this.touch.oy;
      c.save();
      // Outer ring glow
      c.globalAlpha = 0.1; c.fillStyle = "#6366f1"; c.beginPath(); c.arc(jx, jy, 70, 0, TAU); c.fill();
      // Outer ring
      c.globalAlpha = 0.25; c.strokeStyle = "rgba(255,255,255,0.5)"; c.lineWidth = 2;
      c.beginPath(); c.arc(jx, jy, 60, 0, TAU); c.stroke();
      // Inner fill
      c.globalAlpha = 0.15; c.fillStyle = "#fff"; c.beginPath(); c.arc(jx, jy, 60, 0, TAU); c.fill();
      // Joystick knob with glow
      c.globalAlpha = 0.6; c.fillStyle = "#ffd54f";
      c.shadowColor = "#ffd54f"; c.shadowBlur = 15;
      c.beginPath(); c.arc(jx + (this.touch.kx || 0), jy + (this.touch.ky || 0), 18, 0, TAU); c.fill();
      c.shadowBlur = 0;
      c.restore();
    }

    /* ── announcements ── */
    if (this.announcements.length > 0) {
      const a = this.announcements[0];
      c.save();
      c.globalAlpha = min(1, a.life / 0.3, (a.maxLife - (a.maxLife - a.life)) > a.maxLife - 0.5 ? 1 : a.life / 0.5);
      c.font = "bold 22px 'Segoe UI',sans-serif";
      c.textAlign = "center"; c.fillStyle = "#fff";
      c.shadowColor = "rgba(0,0,0,.8)"; c.shadowBlur = 10;
      c.fillText(a.text, sw / 2, 80);
      c.restore();
    }
  }

  _renderMinimap(c) {
    const mw = 110, mh = 110, mx = this.sw - mw - 12, my = this.sh - mh - 12;
    const sx = mw / W, sy = mh / H;
    // Enhanced minimap with border and glow
    c.fillStyle = "rgba(0,0,0,.6)"; c.fillRect(mx, my, mw, mh);
    c.strokeStyle = "rgba(99,102,241,.4)"; c.lineWidth = 2; c.strokeRect(mx, my, mw, mh);
    // Grid lines
    c.strokeStyle = "rgba(255,255,255,.05)"; c.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      c.beginPath(); c.moveTo(mx + mw * i / 4, my); c.lineTo(mx + mw * i / 4, my + mh); c.stroke();
      c.beginPath(); c.moveTo(mx, my + mh * i / 4); c.lineTo(mx + mw, my + mh * i / 4); c.stroke();
    }
    c.fillStyle = "rgba(239,83,80,.6)";
    for (const e of this.enemies) {
      const s = e.boss ? 5 : (e.elite ? 4 : 2.5);
      if (e.elite) c.fillStyle = "rgba(255,217,61,.9)";
      else if (e.boss) c.fillStyle = "rgba(240,98,146,.9)";
      else c.fillStyle = "rgba(239,83,80,.6)";
      c.fillRect(mx + e.x * sx - s / 2, my + e.y * sy - s / 2, s, s);
    }
    // Player dot with glow
    c.fillStyle = "#fff"; c.beginPath();
    c.arc(mx + this.p.x * sx, my + this.p.y * sy, 4, 0, TAU); c.fill();
    c.fillStyle = "rgba(99,102,241,.3)"; c.beginPath();
    c.arc(mx + this.p.x * sx, my + this.p.y * sy, 6, 0, TAU); c.fill();
    // Viewport rectangle
    c.strokeStyle = "rgba(255,255,255,.4)";
    c.strokeRect(mx + this.cam.x * sx, my + this.cam.y * sy, this.sw * sx, this.sh * sy);
  }
}

new Game();
})();
