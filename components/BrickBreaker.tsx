"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import confetti from "canvas-confetti";

// --- Configuration ---
const BRICK_ROWS = 5;
const BRICK_COLS = 8;
const PADDLE_WIDTH = 100;
const PADDLE_HEIGHT = 15;
const BALL_RADIUS = 8;
const PADDLE_SPEED = 7;
const APPS_SCRIPT_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL || "";

const BRICK_COLORS: Record<string, string> = {
  lightred: "#ff9999",
  orange: "#ffb347",
  yellow: "#fdfd96",
  blue: "#779ecb",
  green: "#77dd77",
  purple: "#b39eb5",
};

interface Brick {
  x: number;
  y: number;
  status: number;
  type: string;
  color: string;
  w: number;
  h: number;
}

const BrickBreaker: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgmRef = useRef<HTMLAudioElement>(null);
  
  const [gameState, setGameState] = useState<"MAIN" | "GAME">("MAIN");
  const [userName, setUserName] = useState("");
  const [lives, setLives] = useState(3);
  const [time, setTime] = useState("00:00");
  const [isPaused, setIsPaused] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [result, setResult] = useState<{ message: string; sub: string; success: boolean } | null>(null);
  const [rankings, setRankings] = useState<{ name: string; time?: string; finishtime?: string }[]>([]);
  
  // Mutable game state for high-performance loop
  const gameRef = useRef({
    paddleX: 0,
    ballX: 0,
    ballY: 0,
    ballDX: 0,
    ballDY: 0,
    bricks: [] as Brick[][],
    lightRedCleared: 0,
    startTime: 0,
    rightPressed: false,
    leftPressed: false,
    gameRunning: false,
    timerInterval: null as NodeJS.Timeout | null,
    audioCtx: null as AudioContext | null,
    isPaused: false,
  });

  const resetBall = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    gameRef.current.ballX = canvas.width / 2;
    gameRef.current.ballY = canvas.height - 30;
    const speed = 4;
    let dx = (Math.random() - 0.5) * 2 * speed;
    if (Math.abs(dx) < 2) dx = dx < 0 ? -3 : 3;
    gameRef.current.ballDX = dx;
    gameRef.current.ballDY = -speed;
  }, []);

  const initBricks = useCallback(() => {
    const totalBricks = BRICK_ROWS * BRICK_COLS;
    const lightRedCount = Math.floor(totalBricks * 0.3);
    let colorPool: string[] = [];
    for (let i = 0; i < lightRedCount; i++) colorPool.push("lightred");
    const remaining = totalBricks - lightRedCount;
    const otherColors = ["orange", "yellow", "blue", "green", "purple"];
    for (let i = 0; i < remaining; i++) {
        colorPool.push(otherColors[Math.floor(Math.random() * otherColors.length)]);
    }
    colorPool.sort(() => Math.random() - 0.5);

    const newBricks: Brick[][] = [];
    for (let c = 0; c < BRICK_COLS; c++) {
      newBricks[c] = [];
      for (let r = 0; r < BRICK_ROWS; r++) {
        const type = colorPool.pop()!;
        newBricks[c][r] = { x: 0, y: 0, status: 1, type, color: BRICK_COLORS[type], w: 0, h: 0 };
      }
    }
    gameRef.current.bricks = newBricks;
  }, []);

  const playHitSound = useCallback(() => {
    if (!gameRef.current.audioCtx) {
      gameRef.current.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = gameRef.current.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }, []);

  const fetchRankings = useCallback(async () => {
    if (!APPS_SCRIPT_URL) return;
    try {
      const response = await fetch(APPS_SCRIPT_URL);
      const data = await response.json();
      if (Array.isArray(data)) {
        setRankings(data);
      } else {
        console.error("Rankings data is not an array:", data);
      }
    } catch (e) {
      console.error("Failed to fetch rankings:", e);
    }
  }, []);

  const startGameFlow = () => {
    if (!userName.trim()) {
      alert("이름을 입력해주세요!");
      return;
    }
    setGameState("GAME");
  };

  // Trigger countdown and initialization when state changes to GAME
  useEffect(() => {
    if (gameState === "GAME" && !gameRef.current.gameRunning && !result) {
      const startSequence = async () => {
        setResult(null);
        setIsPaused(false);
        gameRef.current.isPaused = false;
        
        // Stop any existing loop
        gameRef.current.gameRunning = false;
        if (gameRef.current.timerInterval) clearInterval(gameRef.current.timerInterval);

        // Initial setup
        setLives(3);
        setTime("00:00");
        gameRef.current.lightRedCleared = 0;
        initBricks();
        resetBall();
        
        if (canvasRef.current) {
          gameRef.current.paddleX = (canvasRef.current.width - PADDLE_WIDTH) / 2;
          drawInitialFrame();
        }

        bgmRef.current?.play();
        if (bgmRef.current) bgmRef.current.volume = 0.2;

        // Countdown
        for (let i = 3; i > 0; i--) {
          setCountdown(i);
          await new Promise((r) => setTimeout(r, 1000));
        }
        setCountdown(null);

        // Start Game
        gameRef.current.gameRunning = true;
        gameRef.current.startTime = Date.now();
        
        gameRef.current.timerInterval = setInterval(() => {
          if (gameRef.current.isPaused) return;
          const elapsed = Math.floor((Date.now() - gameRef.current.startTime) / 1000);
          const mins = Math.floor(elapsed / 60).toString().padStart(2, "0");
          const secs = (elapsed % 60).toString().padStart(2, "0");
          setTime(`${mins}:${secs}`);
        }, 1000);

        requestAnimationFrame(gameLoop);
      };
      startSequence();
    }
  }, [gameState]);

  const gameLoop = () => {
    if (!gameRef.current.gameRunning) return;
    if (gameRef.current.isPaused) {
      requestAnimationFrame(gameLoop);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Paddle move
    if (gameRef.current.rightPressed) {
      gameRef.current.paddleX = Math.min(canvas.width - PADDLE_WIDTH, gameRef.current.paddleX + PADDLE_SPEED);
    } else if (gameRef.current.leftPressed) {
      gameRef.current.paddleX = Math.max(0, gameRef.current.paddleX - PADDLE_SPEED);
    }

    // Render components
    drawBricksToCanvas(ctx);
    drawBallToCanvas(ctx);
    drawPaddleToCanvas(ctx);
    checkCollision();

    // Physics
    if (gameRef.current.ballX + gameRef.current.ballDX > canvas.width - BALL_RADIUS || gameRef.current.ballX + gameRef.current.ballDX < BALL_RADIUS) {
      gameRef.current.ballDX = -gameRef.current.ballDX;
    }
    if (gameRef.current.ballY + gameRef.current.ballDY < BALL_RADIUS) {
      gameRef.current.ballDY = -gameRef.current.ballDY;
    } else if (gameRef.current.ballY + gameRef.current.ballDY > canvas.height - BALL_RADIUS - 10) {
      if (gameRef.current.ballX > gameRef.current.paddleX && gameRef.current.ballX < gameRef.current.paddleX + PADDLE_WIDTH) {
        gameRef.current.ballDY = -gameRef.current.ballDY;
        let hitPos = (gameRef.current.ballX - (gameRef.current.paddleX + PADDLE_WIDTH / 2)) / (PADDLE_WIDTH / 2);
        gameRef.current.ballDX = hitPos * 5;
      } else {
        setLives((prev) => {
          if (prev <= 1) {
            handleGameOver();
            return 0;
          }
          resetBall();
          return prev - 1;
        });
      }
    }

    gameRef.current.ballX += gameRef.current.ballDX;
    gameRef.current.ballY += gameRef.current.ballDY;

    requestAnimationFrame(gameLoop);
  };

  const drawInitialFrame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBricksToCanvas(ctx);
    drawBallToCanvas(ctx);
    drawPaddleToCanvas(ctx);
  };

  const drawBricksToCanvas = (ctx: CanvasRenderingContext2D) => {
    const padding = 4;
    const brickW = (ctx.canvas.width / BRICK_COLS) - padding;
    const brickH = 20;
    const offsetTop = 10;
    const offsetLeft = padding / 2;

    for (let c = 0; c < BRICK_COLS; c++) {
      for (let r = 0; r < BRICK_ROWS; r++) {
        if (gameRef.current.bricks[c][r].status === 1) {
          const bX = c * (brickW + padding) + offsetLeft;
          const bY = r * (brickH + padding) + offsetTop;
          gameRef.current.bricks[c][r].x = bX;
          gameRef.current.bricks[c][r].y = bY;
          gameRef.current.bricks[c][r].w = brickW;
          gameRef.current.bricks[c][r].h = brickH;
          ctx.beginPath();
          ctx.roundRect(bX, bY, brickW, brickH, 4);
          ctx.fillStyle = gameRef.current.bricks[c][r].color;
          ctx.fill();
          ctx.closePath();
        }
      }
    }
  };

  const drawBallToCanvas = (ctx: CanvasRenderingContext2D) => {
    ctx.beginPath();
    ctx.arc(gameRef.current.ballX, gameRef.current.ballY, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#5bb3ff";
    ctx.fill();
    ctx.closePath();
    ctx.shadowBlur = 0;
  };

  const drawPaddleToCanvas = (ctx: CanvasRenderingContext2D) => {
    ctx.beginPath();
    ctx.roundRect(gameRef.current.paddleX, ctx.canvas.height - PADDLE_HEIGHT - 5, PADDLE_WIDTH, PADDLE_HEIGHT, 10);
    ctx.fillStyle = "var(--secondary-color)";
    ctx.shadowBlur = 15;
    ctx.shadowColor = "rgba(91, 179, 255, 0.5)";
    ctx.fill();
    ctx.closePath();
    ctx.shadowBlur = 0;
  };

  const checkCollision = () => {
    for (let c = 0; c < BRICK_COLS; c++) {
      for (let r = 0; r < BRICK_ROWS; r++) {
        const b = gameRef.current.bricks[c][r];
        if (b.status === 1) {
          if (gameRef.current.ballX > b.x && gameRef.current.ballX < b.x + b.w && gameRef.current.ballY > b.y && gameRef.current.ballY < b.y + b.h) {
            gameRef.current.ballDY = -gameRef.current.ballDY;
            b.status = 0;
            playHitSound();
            if (b.type === "lightred") {
              gameRef.current.lightRedCleared++;
              if (gameRef.current.lightRedCleared >= 3) {
                handleWin();
              }
            }
          }
        }
      }
    }
  };

  const handleWin = async () => {
    gameRef.current.gameRunning = false;
    clearInterval(gameRef.current.timerInterval!);
    bgmRef.current?.pause();
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    
    const finishTime = timeRef.current; // Need to capture current time accurately
    setResult({ message: "MISSION SUCCESS!", sub: `기록: ${finishTime}`, success: true });

    if (APPS_SCRIPT_URL) {
      console.log("Saving score:", { name: userName, finishtime: finishTime });
      try {
        // Send as standard form data for maximum compatibility
        const params = new URLSearchParams();
        params.append("name", userName);
        params.append("finishtime", finishTime);

        await fetch(APPS_SCRIPT_URL, {
          method: "POST",
          mode: "no-cors", // Crucial for GAS
          body: params.toString(),
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          }
        });
        setTimeout(fetchRankings, 1500);
      } catch (e) {
        console.error("Save failed:", e);
      }
    } else {
      console.warn("NEXT_PUBLIC_APPS_SCRIPT_URL is not defined in .env.local");
      setRankings([
        { name: "김철수", finishtime: "00:45" },
        { name: "이영희", finishtime: "00:52" },
        { name: userName, finishtime: finishTime }
      ].sort((a,b) => a.finishtime.localeCompare(b.finishtime)).slice(0,3));
    }
  };

  const handleGameOver = () => {
    gameRef.current.gameRunning = false;
    clearInterval(gameRef.current.timerInterval!);
    bgmRef.current?.pause();
    setResult({ message: "미션 실패", sub: "", success: false });
  };

  // Synchronize timeRef for async saving
  const timeRef = useRef("00:00");
  useEffect(() => { timeRef.current = time; }, [time]);

  // Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Right" || e.key === "ArrowRight") gameRef.current.rightPressed = true;
      if (e.key === "Left" || e.key === "ArrowLeft") gameRef.current.leftPressed = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Right" || e.key === "ArrowRight") gameRef.current.rightPressed = false;
      if (e.key === "Left" || e.key === "ArrowLeft") gameRef.current.leftPressed = false;
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const handleBackToMain = () => {
    gameRef.current.gameRunning = false;
    if (gameRef.current.timerInterval) clearInterval(gameRef.current.timerInterval);
    bgmRef.current?.pause();
    if (bgmRef.current) bgmRef.current.currentTime = 0;
    setGameState("MAIN");
  };

  return (
    <div id="app">
      <audio ref={bgmRef} src="/Hyper_Speed_Run.mp3" loop />

      {gameState === "MAIN" ? (
        <section className="screen active">
          <div className="content">
            <h1 className="game-title">INU 벽돌깨기</h1>
            <div className="mascot-container">
              <img src="/Mascot.jpg" alt="횃불이 마스코트" />
            </div>
            <div className="input-container">
              <input
                type="text"
                placeholder="사용자 이름을 입력하세요"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
              />
              <button onClick={startGameFlow}>게임 시작</button>
            </div>
            <div className="creator-info">
              <p>물리학과 / 202100288 / 김기태</p>
            </div>
          </div>
        </section>
      ) : (
        <section className="screen active">
          <div className="top-bar">
            <div className="stats">
              <span>{time}</span>
              <span>{"❤️".repeat(lives)}</span>
            </div>
            <div className="controls">
              <button onClick={() => {
                setIsPaused(!isPaused);
                gameRef.current.isPaused = !isPaused;
              }}>
                {isPaused ? "계속하기" : "일시정지"}
              </button>
              <button onClick={handleBackToMain}>다시 시작</button>
              <button onClick={() => { if (confirm("게임을 종료하시겠습니까?")) handleBackToMain(); }}>
                게임 종료
              </button>
            </div>
          </div>

          <div className="canvas-container">
            <canvas ref={canvasRef} width={600} height={500} />
            {countdown !== null && <div className="overlay countdown">{countdown}</div>}
            {result && (
              <div className="overlay result">
                <h2 style={{ color: result.success ? "#4CAF50" : "#f44336" }}>{result.message}</h2>
                <p>{result.sub}</p>
                {result.success && (
                  <div className="ranking-container">
                    <h3>🏆 Top 3 Rankings</h3>
                    <ul className="ranking-list">
                      {Array.isArray(rankings) && rankings.map((r, i) => (
                        <li key={i}>{r.name} - {r.finishtime}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <button onClick={handleBackToMain}>메인으로</button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Styles are loaded via globals.css */}
      <style jsx global>{`
        .overlay.countdown {
            font-size: 8rem;
            font-weight: 900;
            color: var(--secondary-color);
            background: transparent;
            border: none;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
        }
        .overlay.result {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            background: rgba(0,0,0,0.85);
            padding: 2rem;
            border-radius: 20px;
            backdrop-filter: blur(5px);
            border: 1px solid var(--glass-border);
            z-index: 30;
            min-width: 300px;
        }
        .ranking-container {
            margin: 1.5rem 0;
            background: rgba(255, 255, 255, 0.1);
            padding: 1rem;
            border-radius: 10px;
        }
        .ranking-list {
            list-style: none;
            padding: 0;
            text-align: left;
        }
        .ranking-list li {
            padding: 8px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            font-size: 0.95rem;
        }
      `}</style>
    </div>
  );
};

export default BrickBreaker;
