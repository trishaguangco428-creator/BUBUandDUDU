import React, { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================
   BUBU & DUDU — HEART CATCHER
   A cute, self-contained React game.
   Note: characters are original chibi-style illustrations
   (simple circles/ears/blush drawn in CSS+SVG) — not a
   reproduction of any existing character artwork.
   ============================================================ */

/* ---------------- constants ---------------- */

const STORAGE_SETTINGS = "bh_settings_v1";
const STORAGE_HIGHSCORE = "bh_highscore_v1";

const GAME_DURATION_MS = 42000; // time to reach the castle
const CATCH_ZONE_Y = 80; // % height where Dudu's paws are
const CATCH_THRESHOLD = 9; // % horizontal tolerance
const HEART_FALL_MS = 2600; // ms for a heart to fall from 0% -> 100% y
const SPAWN_INTERVAL_MS = 900;
const DUDU_SPEED = 60; // % per second

const MILESTONES = [
  { at: 0, label: "Start", icon: "🌳" },
  { at: 20, label: "Cloud Garden", icon: "☁️" },
  { at: 40, label: "Heart Meadow", icon: "🌸" },
  { at: 60, label: "Rainbow Bridge", icon: "🌈" },
  { at: 80, label: "Love Valley", icon: "💗" },
  { at: 100, label: "Final Castle", icon: "🏰" },
];

const DEFAULT_SETTINGS = { sound: true, music: true, animation: true };

/* ---------------- tiny sound engine (WebAudio, no assets) ---------------- */

let sharedCtx = null;
function getCtx() {
  if (!sharedCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) sharedCtx = new AC();
  }
  return sharedCtx;
}

function playTone({ freq = 880, duration = 0.12, type = "sine", gain = 0.06, when = 0, glideTo = null }) {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + when);
  if (glideTo) {
    osc.frequency.linearRampToValueAtTime(glideTo, ctx.currentTime + when + duration);
  }
  g.gain.setValueAtTime(0.0001, ctx.currentTime + when);
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(ctx.currentTime + when);
  osc.stop(ctx.currentTime + when + duration + 0.02);
}

function playCatchSound() {
  playTone({ freq: 660, glideTo: 990, duration: 0.14, type: "triangle", gain: 0.07 });
}
function playMissSound() {
  playTone({ freq: 260, glideTo: 180, duration: 0.12, type: "sine", gain: 0.03 });
}
function playFinishFanfare() {
  [523, 659, 784, 1046].forEach((f, i) =>
    playTone({ freq: f, duration: 0.22, type: "triangle", gain: 0.08, when: i * 0.13 })
  );
}
function playClickSound() {
  playTone({ freq: 500, duration: 0.06, type: "square", gain: 0.03 });
}

/* simple ambient music loop using two detuned oscillators */
function useMusicLoop(enabled) {
  const nodesRef = useRef(null);
  useEffect(() => {
    const ctx = getCtx();
    if (!ctx) return;
    if (enabled) {
      if (ctx.state === "suspended") ctx.resume();
      const notes = [392, 440, 494, 440];
      let step = 0;
      const gain = ctx.createGain();
      gain.gain.value = 0.02;
      gain.connect(ctx.destination);
      const interval = setInterval(() => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = notes[step % notes.length];
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.03, ctx.currentTime + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
        osc.connect(g).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 1);
        step++;
      }, 900);
      nodesRef.current = interval;
      return () => clearInterval(interval);
    }
  }, [enabled]);
}

/* ---------------- persisted settings hook ---------------- */

function useSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_SETTINGS);
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    } catch (e) {
      /* ignore */
    }
  }, []);
  const update = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      (async () => {
        try {
          window.localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(next));
        } catch (e) {
          /* storage unavailable — game still works, just won't persist */
        }
      })();
      return next;
    });
  }, []);
  return [settings, update];
}

/* ================= chibi illustrations ================= */

function ChibiBubu({ throwing, running, caught }) {
  return (
    <svg
      viewBox="0 0 140 150"
      className={`chibi bubu ${throwing ? "throwing" : ""} ${running ? "running" : ""} ${caught ? "celebrate" : ""}`}
    >
      <ellipse cx="70" cy="138" rx="34" ry="8" className="shadow" />
      {/* arm (behind) */}
      <circle cx="30" cy="90" r="13" className="bubu-fur" />
      {/* body */}
      <ellipse cx="70" cy="98" rx="38" ry="34" className="bubu-fur" />
      <ellipse cx="70" cy="106" rx="22" ry="18" className="bubu-belly" />
      {/* ears */}
      <circle cx="42" cy="42" r="16" className="bubu-fur" />
      <circle cx="98" cy="42" r="16" className="bubu-fur" />
      <circle cx="42" cy="42" r="7" className="bubu-innerear" />
      <circle cx="98" cy="42" r="7" className="bubu-innerear" />
      {/* head */}
      <circle cx="70" cy="62" r="38" className="bubu-fur" />
      <ellipse cx="70" cy="72" rx="20" ry="14" className="bubu-muzzle" />
      {/* face */}
      <circle cx="60" cy="60" r="4.2" className="eye" />
      <circle cx="80" cy="60" r="4.2" className="eye" />
      <circle cx="70" cy="72" r="3" className="nose" />
      <path d="M62 78 Q70 84 78 78" className="mouth" />
      <ellipse cx="48" cy="70" rx="6" ry="4" className="blush" />
      <ellipse cx="92" cy="70" rx="6" ry="4" className="blush" />
      {/* throwing arm (front) */}
      <g className="bubu-throw-arm">
        <circle cx="104" cy="86" r="12" className="bubu-fur" />
      </g>
    </svg>
  );
}

function ChibiDudu({ running, caught, throwing }) {
  return (
    <svg
      viewBox="0 0 140 150"
      className={`chibi dudu ${running ? "running" : ""} ${caught ? "celebrate" : ""} ${throwing ? "throwing" : ""}`}
    >
      <ellipse cx="70" cy="138" rx="34" ry="8" className="shadow" />
      {/* legs */}
      <ellipse cx="56" cy="126" rx="11" ry="9" className="dudu-legL panda-black" />
      <ellipse cx="84" cy="126" rx="11" ry="9" className="dudu-legR panda-black" />
      {/* body */}
      <ellipse cx="70" cy="98" rx="36" ry="32" className="panda-white" />
      {/* arms */}
      <ellipse cx="34" cy="96" rx="10" ry="16" className="dudu-armL panda-black" />
      <ellipse cx="106" cy="96" rx="10" ry="16" className="dudu-armR panda-black" />
      {/* ears */}
      <circle cx="44" cy="40" r="15" className="panda-black" />
      <circle cx="96" cy="40" r="15" className="panda-black" />
      {/* head */}
      <circle cx="70" cy="62" r="37" className="panda-white" />
      {/* eye patches */}
      <ellipse cx="55" cy="62" rx="11" ry="14" className="panda-black" transform="rotate(-12 55 62)" />
      <ellipse cx="85" cy="62" rx="11" ry="14" className="panda-black" transform="rotate(12 85 62)" />
      <circle cx="57" cy="64" r="4" className="eye-white" />
      <circle cx="83" cy="64" r="4" className="eye-white" />
      <circle cx="58" cy="65" r="2.4" className="eye" />
      <circle cx="82" cy="65" r="2.4" className="eye" />
      <ellipse cx="70" cy="74" rx="8" ry="6" className="dudu-muzzle" />
      <circle cx="70" cy="72" r="2.6" className="nose" />
      <path d="M64 78 Q70 82 76 78" className="mouth" />
      <ellipse cx="46" cy="76" rx="5" ry="3.4" className="blush" />
      <ellipse cx="94" cy="76" rx="5" ry="3.4" className="blush" />
    </svg>
  );
}

function FlyingHeart({ x, y }) {
  return (
    <div className="flying-heart" style={{ left: `${x}%`, top: `${y}%` }}>
      💗
    </div>
  );
}

function Castle() {
  return (
    <svg viewBox="0 0 220 200" className="castle-svg">
      <rect x="20" y="90" width="180" height="100" rx="6" className="castle-wall" />
      <rect x="0" y="60" width="46" height="130" rx="4" className="castle-tower" />
      <rect x="174" y="60" width="46" height="130" rx="4" className="castle-tower" />
      <polygon points="0,60 23,30 46,60" className="castle-roof" />
      <polygon points="174,60 197,30 220,60" className="castle-roof" />
      <rect x="88" y="50" width="44" height="140" rx="4" className="castle-tower castle-mid" />
      <polygon points="88,50 110,18 132,50" className="castle-roof" />
      <circle cx="110" cy="18" r="3" className="castle-flagpole" />
      <path d="M110 18 L128 24 L110 30 Z" className="castle-flag" />
      <rect x="98" y="150" width="24" height="40" rx="12" className="castle-door" />
      <circle cx="23" cy="100" r="5" className="castle-window" />
      <circle cx="197" cy="100" r="5" className="castle-window" />
      <circle cx="110" cy="90" r="6" className="castle-window" />
    </svg>
  );
}

/* ================= HUD & progress path ================= */

function ProgressRibbon({ distance }) {
  return (
    <div className="ribbon-wrap">
      <div className="ribbon-track">
        <div className="ribbon-fill" style={{ width: `${distance}%` }} />
        {MILESTONES.map((m) => (
          <div
            key={m.label}
            className={`ribbon-charm ${distance >= m.at ? "reached" : ""}`}
            style={{ left: `${m.at}%` }}
            title={m.label}
          >
            <span>{m.icon}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HUD({ heartsCaught, score, distance }) {
  return (
    <div className="hud">
      <div className="hud-stat">💗 <b>{heartsCaught}</b></div>
      <div className="hud-stat">🏆 <b>{score}</b></div>
      <div className="hud-stat">🏰 <b>{Math.min(100, Math.round(distance))}%</b></div>
    </div>
  );
}

/* ================= Settings & How-To modals ================= */

function ModalShell({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ToggleRow({ label, value, onChange }) {
  return (
    <div className="toggle-row">
      <span>{label}</span>
      <button
        className={`switch ${value ? "on" : "off"}`}
        onClick={() => onChange(!value)}
        aria-pressed={value}
      >
        <span className="knob" />
      </button>
    </div>
  );
}

function SettingsModal({ settings, updateSettings, onClose, onOpenHowTo, onResetScore, highScore }) {
  return (
    <ModalShell title="Settings ⚙️" onClose={onClose}>
      <div className="modal-body">
        <ToggleRow label="🔊 Sound" value={settings.sound} onChange={(v) => updateSettings({ sound: v })} />
        <ToggleRow label="🎵 Music" value={settings.music} onChange={(v) => updateSettings({ music: v })} />
        <ToggleRow label="✨ Animation" value={settings.animation} onChange={(v) => updateSettings({ animation: v })} />
        <div className="modal-divider" />
        <div className="modal-row">
          <span>Best score</span>
          <b>{highScore}</b>
        </div>
        <button className="btn btn-soft" onClick={onResetScore}>Reset Score</button>
        <button className="btn btn-soft" onClick={onOpenHowTo}>How to Play</button>
      </div>
    </ModalShell>
  );
}

function HowToPlayModal({ onClose }) {
  return (
    <ModalShell title="How to Play 💕" onClose={onClose}>
      <div className="modal-body howto">
        <p>Dudu throws hearts 💕</p>
        <p>Help Bubu catch them!</p>
        <div className="howto-demo">
          <span className="demo-bubu">🐼</span>
          <span className="demo-arrow">💗➜</span>
          <span className="demo-dudu">🐻</span>
        </div>
        <p>Move Bubu to catch as many hearts as possible.</p>
        <p>Reach the castle before the path ends!</p>
        <div className="modal-divider" />
        <div className="controls-grid">
          <div>
            <b>Desktop</b>
            <div>⬅️ ➡️ or A / D</div>
          </div>
          <div>
            <b>Mobile</b>
            <div>◀ LEFT · RIGHT ▶ buttons</div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

/* ================= Start Screen ================= */

function StartScreen({ onStart, onOpenSettings, highScore, animation }) {
  return (
    <div className={`screen start-screen ${animation ? "" : "no-anim"}`}>
      <Sky />
      <button className="icon-btn settings-corner" onClick={onOpenSettings} aria-label="Settings">⚙️</button>
      <div className="start-content">
        <div className="hero-illustration">
          <ChibiDudu running={false} throwing />
          <FlyingHeart x={46} y={38} />
          <ChibiBubu />
        </div>
        <h1 className="title">
          BUBU <span className="amp">&amp;</span> DUDU
          <span className="title-sub">HEART CATCHER</span>
        </h1>
        <p className="subtitle">Catch the hearts. Reach the castle. 💕</p>
        {highScore > 0 && <p className="highscore-pill">🏆 Best: {highScore}</p>}
        <button className="btn btn-primary btn-large" onClick={onStart}>
          START GAME ❤️
        </button>
      </div>
    </div>
  );
}

function Sky() {
  return (
    <div className="sky">
      <div className="cloud c1">☁️</div>
      <div className="cloud c2">☁️</div>
      <div className="cloud c3">☁️</div>
      <div className="sparkle s1">✨</div>
      <div className="sparkle s2">✨</div>
      <div className="hill hill-back" />
      <div className="hill hill-front" />
      <div className="flower f1">🌸</div>
      <div className="flower f2">🌷</div>
      <div className="flower f3">🌼</div>
    </div>
  );
}

/* ================= Game Screen ================= */

function GameScreen({ settings, onFinish }) {
  const [duduX, setDuduX] = useState(50);
  const [hearts, setHearts] = useState([]); // {id,x,spawnedAt}
  const [floaters, setFloaters] = useState([]); // {id,x,y,text}
  const [score, setScore] = useState(0);
  const [heartsCaught, setHeartsCaught] = useState(0);
  const [distance, setDistance] = useState(0);
  const [caughtPulse, setCaughtPulse] = useState(false);
  const [throwPulse, setThrowPulse] = useState(false);

  const keysRef = useRef({ left: false, right: false });
  const duduXRef = useRef(50);
  const rafRef = useRef(null);
  const lastTsRef = useRef(null);
  const startTsRef = useRef(null);
  const spawnAccRef = useRef(0);
  const finishedRef = useRef(false);
  const scoreRef = useRef(0);
  const heartsCaughtRef = useRef(0);

  useMusicLoop(settings.music);

  /* keyboard controls */
  useEffect(() => {
    const down = (e) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keysRef.current.left = true;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keysRef.current.right = true;
    };
    const up = (e) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keysRef.current.left = false;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keysRef.current.right = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const setDudu = useCallback((v) => {
    duduXRef.current = v;
    setDuduX(v);
  }, []);

  /* main loop */
  useEffect(() => {
    function tick(ts) {
      if (startTsRef.current === null) startTsRef.current = ts;
      if (lastTsRef.current === null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;

      if (!finishedRef.current) {
        /* move dudu */
        let dx = 0;
        if (keysRef.current.left) dx -= DUDU_SPEED * dt;
        if (keysRef.current.right) dx += DUDU_SPEED * dt;
        if (dx !== 0) {
          const next = Math.max(6, Math.min(94, duduXRef.current + dx));
          setDudu(next);
        }

        /* distance progress */
        const elapsed = ts - startTsRef.current;
        const nextDistance = Math.min(100, (elapsed / GAME_DURATION_MS) * 100);
        setDistance(nextDistance);

        /* spawn hearts */
        spawnAccRef.current += dt * 1000;
        if (spawnAccRef.current >= SPAWN_INTERVAL_MS && nextDistance < 100) {
          spawnAccRef.current = 0;
          const id = Math.random().toString(36).slice(2);
          const x = 15 + Math.random() * 70;
          setHearts((prev) => [...prev, { id, x, spawnedAt: ts }]);
          setThrowPulse(true);
          setTimeout(() => setThrowPulse(false), 260);
        }

        /* update hearts, detect catch/miss */
        setHearts((prev) => {
          const remaining = [];
          for (const h of prev) {
            const progress = (ts - h.spawnedAt) / HEART_FALL_MS; // 0..1
            const y = progress * 100;
            if (progress >= 1) {
              // reached bottom -> resolve
              if (Math.abs(h.x - duduXRef.current) <= CATCH_THRESHOLD) {
                scoreRef.current += 10;
                heartsCaughtRef.current += 1;
                setScore(scoreRef.current);
                setHeartsCaught(heartsCaughtRef.current);
                setCaughtPulse(true);
                setTimeout(() => setCaughtPulse(false), 260);
                if (settings.sound) playCatchSound();
                setFloaters((f) => [
                  ...f,
                  { id: h.id + "-f", x: h.x, y: CATCH_ZONE_Y, text: "+10 💗", ts },
                ]);
              } else {
                if (settings.sound) playMissSound();
              }
              // heart removed either way
            } else {
              remaining.push(h);
            }
          }
          return remaining;
        });

        if (nextDistance >= 100 && !finishedRef.current) {
          finishedRef.current = true;
          if (settings.sound) playFinishFanfare();
          setTimeout(() => {
            onFinish({ score: scoreRef.current, heartsCaught: heartsCaughtRef.current });
          }, 700);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.sound, onFinish, setDudu]);

  /* clean up floating "+10" texts after their animation finishes */
  useEffect(() => {
    if (floaters.length === 0) return;
    const timers = floaters.map((fl) =>
      setTimeout(() => {
        setFloaters((prev) => prev.filter((x) => x.id !== fl.id));
      }, 800)
    );
    return () => timers.forEach(clearTimeout);
  }, [floaters]);

  /* touch controls */
  const holdRef = useRef(null);
  const startHold = (dir) => {
    if (holdRef.current) clearInterval(holdRef.current);
    keysRef.current[dir] = true;
    holdRef.current = true;
  };
  const endHold = (dir) => {
    keysRef.current[dir] = false;
  };

  const animClass = settings.animation ? "" : "no-anim";

  return (
    <div className={`screen game-screen ${animClass}`}>
      <Sky />
      <HUD heartsCaught={heartsCaught} score={score} distance={distance} />
      <ProgressRibbon distance={distance} />

      <div className="castle-wrap" style={{ opacity: 0.35 + Math.min(0.65, distance / 100) }}>
        <Castle />
      </div>

      <div className="play-area">
        <div className="bubu-spot">
          <ChibiDudu throwing={throwPulse} />
        </div>

        {hearts.map((h) => {
          const progress = Math.min(1, (performance.now() - h.spawnedAt) / HEART_FALL_MS);
          const y = 12 + progress * (CATCH_ZONE_Y - 12);
          return <FlyingHeart key={h.id} x={h.x} y={y} />;
        })}

        {floaters.map((f) => (
          <div key={f.id} className="floater" style={{ left: `${f.x}%`, top: `${f.y}%` }}>
            {f.text}
          </div>
        ))}

        <div className="dudu-lane">
          <div
            className={`dudu-spot ${caughtPulse ? "pulse" : ""}`}
            style={{ left: `${duduX}%` }}
          >
            <ChibiBubu running caught={caughtPulse} />
          </div>
        </div>
      </div>

      <div className="touch-controls">
        <button
          className="touch-btn"
          onPointerDown={() => startHold("left")}
          onPointerUp={() => endHold("left")}
          onPointerLeave={() => endHold("left")}
          aria-label="Move left"
        >
          ◀
        </button>
        <button
          className="touch-btn"
          onPointerDown={() => startHold("right")}
          onPointerUp={() => endHold("right")}
          onPointerLeave={() => endHold("right")}
          aria-label="Move right"
        >
          ▶
        </button>
      </div>
    </div>
  );
}

/* ================= Finish Screen ================= */

function FinishScreen({ result, onPlayAgain, onMainMenu, isNewHigh }) {
  return (
    <div className="screen finish-screen">
      <Sky />
      <div className="confetti-wrap">
        {Array.from({ length: 18 }).map((_, i) => (
          <span key={i} className={`confetti c${i % 6}`} style={{ left: `${(i * 53) % 100}%`, animationDelay: `${(i % 9) * 0.12}s` }}>
            {["💗", "✨", "🎀", "💕"][i % 4]}
          </span>
        ))}
      </div>
      <div className="finish-content">
        <div className="finish-illustration">
          <Castle />
          <div className="finish-pair">
            <ChibiDudu />
            <ChibiBubu caught />
          </div>
        </div>
        <div className="banner">🏁 FINISH! 🏁</div>
        <h2 className="finish-title">YOU MADE IT! 💕</h2>
        {isNewHigh && <p className="highscore-pill new">✨ New Best Score! ✨</p>}
        <p className="finish-stat">Hearts Caught: <b>{result.heartsCaught}</b></p>
        <p className="finish-stat">Final Score: <b>{result.score}</b></p>
        <div className="finish-buttons">
          <button className="btn btn-primary" onClick={onPlayAgain}>PLAY AGAIN ❤️</button>
          <button className="btn btn-soft" onClick={onMainMenu}>MAIN MENU 🏠</button>
        </div>
      </div>
    </div>
  );
}

/* ================= App root ================= */

export default function BubuDuduHeartCatcher() {
  const [screen, setScreen] = useState("menu"); // menu | game | finish
  const [modal, setModal] = useState(null); // null | 'settings' | 'howto'
  const [settings, updateSettings] = useSettings();
  const [highScore, setHighScore] = useState(0);
  const [result, setResult] = useState({ score: 0, heartsCaught: 0 });
  const [isNewHigh, setIsNewHigh] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_HIGHSCORE);
      if (raw) setHighScore(parseInt(raw, 10) || 0);
    } catch (e) {
      /* ignore */
    }
  }, []);

  const click = useCallback(
    (fn) => (...args) => {
      if (settings.sound) playClickSound();
      fn && fn(...args);
    },
    [settings.sound]
  );

  const handleFinish = useCallback(
    async (res) => {
      setResult(res);
      let newHigh = false;
      try {
        const raw = window.localStorage.getItem(STORAGE_HIGHSCORE);
        const prevHigh = raw ? parseInt(raw, 10) || 0 : 0;
        if (res.score > prevHigh) {
          newHigh = true;
          window.localStorage.setItem(STORAGE_HIGHSCORE, String(res.score));
          setHighScore(res.score);
        }
      } catch (e) {
        /* ignore storage errors */
      }
      setIsNewHigh(newHigh);
      setScreen("finish");
    },
    []
  );

  const resetScore = useCallback(async () => {
    try {
      window.localStorage.removeItem(STORAGE_HIGHSCORE);
    } catch (e) {
      /* ignore */
    }
    setHighScore(0);
  }, []);

  return (
    <div className="bh-root">
      <style>{CSS}</style>

      {screen === "menu" && (
        <StartScreen
          onStart={click(() => setScreen("game"))}
          onOpenSettings={click(() => setModal("settings"))}
          highScore={highScore}
          animation={settings.animation}
        />
      )}

      {screen === "game" && (
        <GameScreen key={Math.random()} settings={settings} onFinish={handleFinish} />
      )}

      {screen === "finish" && (
        <FinishScreen
          result={result}
          isNewHigh={isNewHigh}
          onPlayAgain={click(() => setScreen("game"))}
          onMainMenu={click(() => setScreen("menu"))}
        />
      )}

      {modal === "settings" && (
        <SettingsModal
          settings={settings}
          updateSettings={updateSettings}
          onClose={() => setModal(null)}
          onOpenHowTo={() => setModal("howto")}
          onResetScore={resetScore}
          highScore={highScore}
        />
      )}
      {modal === "howto" && <HowToPlayModal onClose={() => setModal(null)} />}
    </div>
  );
}

/* ================= styles ================= */

const CSS = `
:root{
  --cream:#FFF7EE;
  --pink:#FF8FAE;
  --pink-deep:#E8608E;
  --rose-ink:#5B3A4E;
  --lavender:#C9B6FF;
  --sky:#BEE7F7;
  --mint:#BDEFC9;
  --gold:#FFD166;
  --white:#FFFFFF;
  --shadow-soft: 0 10px 24px rgba(198,120,150,0.22);
}
.bh-root{
  position:relative;
  width:100%;
  min-height:100vh;
  font-family: -apple-system, "Segoe UI", "Nunito", "Quicksand", system-ui, sans-serif;
  color:var(--rose-ink);
  overflow:hidden;
  background: linear-gradient(180deg,#FFE3EE 0%, #FFF3E6 45%, #FFF9EF 100%);
}
.screen{
  position:relative;
  width:100%;
  min-height:100vh;
  overflow:hidden;
  display:flex;
  flex-direction:column;
  align-items:center;
  box-sizing:border-box;
}
.no-anim, .no-anim *{
  animation:none !important;
  transition:none !important;
}

/* ---------- sky / scenery ---------- */
.sky{ position:absolute; inset:0; overflow:hidden; pointer-events:none; }
.cloud{ position:absolute; font-size:34px; opacity:0.85; filter:drop-shadow(0 4px 6px rgba(0,0,0,0.05)); animation:driftCloud 26s linear infinite; }
.c1{ top:8%; left:-10%; animation-duration:32s; }
.c2{ top:18%; left:-20%; font-size:26px; animation-duration:24s; animation-delay:-8s; }
.c3{ top:5%; left:-30%; font-size:20px; animation-duration:40s; animation-delay:-20s; }
@keyframes driftCloud{ from{ transform:translateX(0);} to{ transform:translateX(140vw);} }
.sparkle{ position:absolute; font-size:16px; opacity:0.8; animation:twinkle 2.4s ease-in-out infinite; }
.s1{ top:14%; left:22%; } .s2{ top:26%; left:78%; animation-delay:1s; }
@keyframes twinkle{ 0%,100%{opacity:0.3; transform:scale(0.8);} 50%{opacity:1; transform:scale(1.1);} }
.hill{ position:absolute; bottom:0; left:0; right:0; height:22%; border-radius:50% 50% 0 0 / 100% 100% 0 0; }
.hill-back{ background:var(--mint); opacity:0.55; height:26%; }
.hill-front{ background:var(--mint); opacity:0.85; height:16%; }
.flower{ position:absolute; bottom:6%; font-size:20px; }
.f1{ left:8%; } .f2{ left:50%; bottom:4%;} .f3{ right:10%; bottom:8%; }

/* ---------- buttons ---------- */
.btn{
  border:none; cursor:pointer; border-radius:999px; font-weight:800;
  font-size:15px; letter-spacing:0.02em; padding:14px 26px;
  transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
}
.btn:active{ transform:scale(0.96); }
.btn-primary{
  background: linear-gradient(180deg, #FFB0C6, var(--pink) 60%, var(--pink-deep));
  color:#fff; box-shadow:var(--shadow-soft);
}
.btn-primary:hover{ filter:brightness(1.05); transform:translateY(-2px); }
.btn-large{ padding:18px 44px; font-size:19px; }
.btn-soft{
  background:var(--white); color:var(--pink-deep); box-shadow:0 6px 14px rgba(198,120,150,0.15);
  margin-top:10px; width:100%;
}
.btn-soft:hover{ background:#FFF1F5; }
.icon-btn{
  background:var(--white); border:none; border-radius:50%; width:44px; height:44px;
  font-size:18px; cursor:pointer; box-shadow:0 6px 14px rgba(198,120,150,0.18);
}
.icon-btn:active{ transform:scale(0.92); }
.settings-corner{ position:absolute; top:18px; right:18px; z-index:5; }

/* ---------- start screen ---------- */
.start-content{
  position:relative; z-index:2; text-align:center; padding:60px 20px 40px;
  display:flex; flex-direction:column; align-items:center; gap:10px;
}
.hero-illustration{
  position:relative; display:flex; align-items:flex-end; justify-content:center; gap:6px;
  height:150px; margin-bottom:6px;
}
.hero-illustration .chibi{ width:110px; height:auto; }
.title{
  font-size:34px; font-weight:900; color:var(--pink-deep); margin:6px 0 0;
  letter-spacing:0.03em; text-shadow: 0 3px 0 #fff, 0 6px 10px rgba(198,120,150,0.25);
  line-height:1.1;
}
.title .amp{ color:var(--lavender); }
.title-sub{ display:block; font-size:19px; color:var(--rose-ink); letter-spacing:0.3em; margin-top:4px; }
.subtitle{ font-size:15px; color:#8a6a78; margin:6px 0 4px; }
.highscore-pill{
  background:var(--gold); color:#7a5200; font-weight:800; padding:6px 16px; border-radius:999px; font-size:13px;
  box-shadow:0 4px 10px rgba(255,209,102,0.5);
}
.highscore-pill.new{ background:var(--pink); color:#fff; animation:popIn 0.5s ease; }
@keyframes popIn{ from{ transform:scale(0);} 60%{transform:scale(1.15);} to{transform:scale(1);} }

/* ---------- chibi characters ---------- */
.chibi{ display:block; }
.bubu-fur{ fill:#D9A46B; }
.bubu-innerear{ fill:#F5D6AE; }
.bubu-belly{ fill:#F5E2C4; }
.bubu-muzzle{ fill:#F5E2C4; }
.panda-white{ fill:#FFFDF8; stroke:#efe6da; stroke-width:1; }
.panda-black{ fill:#4A4048; }
.dudu-muzzle{ fill:#FFFDF8; }
.eye{ fill:#3A2B33; }
.eye-white{ fill:#fff; }
.nose{ fill:#3A2B33; }
.mouth{ fill:none; stroke:#3A2B33; stroke-width:2; stroke-linecap:round; }
.blush{ fill:#FF9FB3; opacity:0.55; }
.shadow{ fill:#000; opacity:0.08; }
.bubu-throw-arm{ transform-origin: 90px 82px; transition: transform 0.18s ease; }
.bubu.throwing .bubu-throw-arm{ animation:throwArm 0.26s ease; }
@keyframes throwArm{ 0%{ transform:rotate(0deg);} 40%{ transform:rotate(-55deg) translate(-6px,-8px);} 100%{ transform:rotate(0deg);} }
.dudu.running, .bubu.running{ animation:duduBob 0.5s ease-in-out infinite; }
@keyframes duduBob{ 0%,100%{ transform:translateY(0);} 50%{ transform:translateY(-4px);} }
.dudu.celebrate, .bubu.celebrate{ animation:duduCelebrate 0.5s ease; }
@keyframes duduCelebrate{ 0%{ transform:scale(1) rotate(0);} 50%{ transform:scale(1.18) rotate(-6deg);} 100%{ transform:scale(1) rotate(0);} }
/* whole-body throw bounce for characters without an articulated throw arm (e.g. Dudu) */
.dudu.throwing{ animation:chibiThrowPulse 0.26s ease; }
@keyframes chibiThrowPulse{ 0%{ transform:scale(1) rotate(0);} 40%{ transform:scale(1.06) rotate(-6deg);} 100%{ transform:scale(1) rotate(0);} }

/* ---------- HUD ---------- */
.hud{
  position:absolute; top:14px; left:50%; transform:translateX(-50%); z-index:6;
  display:flex; gap:10px; background:rgba(255,255,255,0.85); backdrop-filter: blur(4px);
  padding:8px 16px; border-radius:999px; box-shadow:var(--shadow-soft); font-size:14px;
}
.hud-stat{ display:flex; align-items:center; gap:5px; font-weight:800; color:var(--pink-deep); }
.hud-stat b{ color:var(--rose-ink); }

/* ---------- progress ribbon ---------- */
.ribbon-wrap{ position:absolute; top:66px; left:0; right:0; z-index:5; padding:0 24px; }
.ribbon-track{
  position:relative; height:10px; background:rgba(255,255,255,0.7); border-radius:999px;
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.08);
}
.ribbon-fill{
  height:100%; border-radius:999px; background:linear-gradient(90deg, var(--pink), var(--gold));
  transition:width 0.2s linear;
}
.ribbon-charm{
  position:absolute; top:50%; transform:translate(-50%,-50%); font-size:16px; opacity:0.45;
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.ribbon-charm.reached{ opacity:1; transform:translate(-50%,-50%) scale(1.25); }

/* ---------- game screen ---------- */
.game-screen{ padding-top:0; }
.castle-wrap{ position:absolute; right:2%; top:8%; width:150px; z-index:2; transition:opacity 0.4s ease; }
.castle-wrap svg{ width:100%; height:auto; }
.castle-wall{ fill:#FDEFE0; stroke:#EBD3B8; stroke-width:2; }
.castle-tower{ fill:#FBE4EE; stroke:#EBC3D3; stroke-width:2; }
.castle-mid{ fill:#F7D8E8; }
.castle-roof{ fill:var(--pink); }
.castle-flagpole{ fill:#8a6a78; }
.castle-flag{ fill:var(--gold); }
.castle-door{ fill:#B98A5E; }
.castle-window{ fill:#8ecbe0; }

.play-area{ position:relative; flex:1; width:100%; min-height:78vh; z-index:3; }
.bubu-spot{ position:absolute; left:2%; bottom:14%; width:120px; z-index:4; }
.bubu-spot .chibi{ width:100%; height:auto; }

.flying-heart{
  position:absolute; font-size:22px; transform:translate(-50%,-50%);
  filter:drop-shadow(0 3px 4px rgba(0,0,0,0.12));
}
.floater{
  position:absolute; transform:translate(-50%,-50%); font-weight:900; color:var(--pink-deep);
  font-size:15px; animation:floatUp 0.8s ease forwards; pointer-events:none;
}
@keyframes floatUp{ from{ opacity:1; transform:translate(-50%,-50%);} to{ opacity:0; transform:translate(-50%,-160%);} }

.dudu-lane{ position:absolute; left:0; right:0; bottom:6%; height:110px; }
.dudu-spot{
  position:absolute; bottom:0; width:100px; transform:translateX(-50%);
  transition: left 0.05s linear;
}
.dudu-spot .chibi{ width:100%; height:auto; }
.dudu-spot.pulse{ animation:catchPulse 0.26s ease; }
@keyframes catchPulse{ 0%{ transform:translateX(-50%) scale(1);} 50%{ transform:translateX(-50%) scale(1.15);} 100%{ transform:translateX(-50%) scale(1);} }

/* ---------- touch controls ---------- */
.touch-controls{
  position:absolute; bottom:14px; left:0; right:0; display:flex; justify-content:space-between;
  padding:0 20px; z-index:8; pointer-events:none;
}
.touch-btn{
  pointer-events:all; width:64px; height:64px; border-radius:50%; border:none;
  background:rgba(255,255,255,0.9); color:var(--pink-deep); font-size:26px; font-weight:900;
  box-shadow:var(--shadow-soft); touch-action:none; user-select:none;
}
.touch-btn:active{ transform:scale(0.9); background:#FFE3EE; }
@media (min-width: 900px){ .touch-controls{ display:none; } }

/* ---------- modals ---------- */
.modal-backdrop{
  position:fixed; inset:0; background:rgba(90,50,70,0.35); backdrop-filter: blur(2px);
  display:flex; align-items:center; justify-content:center; z-index:50; padding:20px;
}
.modal-card{
  background:var(--cream); border-radius:26px; width:100%; max-width:380px; padding:22px;
  box-shadow:0 20px 50px rgba(90,50,70,0.3); animation:modalIn 0.22s ease;
}
@keyframes modalIn{ from{ opacity:0; transform:translateY(14px) scale(0.97);} to{ opacity:1; transform:translateY(0) scale(1);} }
.modal-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
.modal-head h2{ margin:0; font-size:20px; color:var(--pink-deep); }
.modal-body p{ margin:6px 0; font-size:14px; }
.modal-row{ display:flex; justify-content:space-between; padding:8px 0; font-size:14px; }
.modal-divider{ height:1px; background:#f0dfe4; margin:12px 0; }
.toggle-row{ display:flex; justify-content:space-between; align-items:center; padding:10px 0; font-size:14px; font-weight:700; }
.switch{
  width:46px; height:26px; border-radius:999px; border:none; cursor:pointer; position:relative;
  background:#e6d8dd; transition:background 0.2s ease;
}
.switch.on{ background:var(--pink); }
.knob{ position:absolute; top:3px; left:3px; width:20px; height:20px; border-radius:50%; background:#fff; box-shadow:0 2px 4px rgba(0,0,0,0.2); transition:left 0.2s ease; }
.switch.on .knob{ left:23px; }
.howto-demo{ display:flex; align-items:center; justify-content:center; gap:10px; font-size:30px; margin:14px 0; }
.demo-arrow{ font-size:18px; }
.controls-grid{ display:flex; justify-content:space-between; gap:10px; font-size:13px; }
.controls-grid b{ display:block; color:var(--pink-deep); margin-bottom:4px; }

/* ---------- finish screen ---------- */
.finish-screen{ justify-content:center; }
.finish-content{
  position:relative; z-index:3; text-align:center; padding:30px 20px; display:flex;
  flex-direction:column; align-items:center; gap:6px;
}
.finish-illustration{ position:relative; width:220px; margin-bottom:6px; }
.finish-illustration svg.castle-svg{ width:100%; height:auto; }
.finish-pair{ position:absolute; bottom:-6px; left:50%; transform:translateX(-50%); display:flex; gap:-10px; }
.finish-pair .chibi{ width:70px; }
.banner{
  background:var(--pink-deep); color:#fff; font-weight:900; padding:8px 22px; border-radius:999px;
  letter-spacing:0.08em; margin-top:10px; box-shadow:var(--shadow-soft);
}
.finish-title{ font-size:26px; color:var(--pink-deep); margin:10px 0 0; }
.finish-stat{ font-size:16px; margin:2px 0; }
.finish-buttons{ display:flex; gap:12px; margin-top:16px; flex-wrap:wrap; justify-content:center; }
.confetti-wrap{ position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:2; }
.confetti{ position:absolute; top:-8%; font-size:20px; animation:confettiFall 3.2s linear infinite; }
@keyframes confettiFall{ from{ transform:translateY(-10vh) rotate(0deg); opacity:1;} to{ transform:translateY(110vh) rotate(360deg); opacity:0.8;} }

@media (max-width: 480px){
  .title{ font-size:26px; }
  .title-sub{ font-size:14px; letter-spacing:0.2em; }
  .hero-illustration{ height:120px; }
  .hero-illustration .chibi{ width:82px; }
  .castle-wrap{ width:100px; }
  .bubu-spot{ width:80px; }
  .dudu-spot{ width:76px; }
}
`;
