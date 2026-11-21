import { useEffect, useRef, useState } from "react";
import { FlightCard } from "./task-card";
import type { Transition } from "./tasks";
import styles from "./workspace.module.css";

export type Motion = { transition: Transition; start: DOMRect; end: DOMRect; token: number };

export function reducedMotion() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function Flight({ motion }: { motion: Motion }) {
  const card = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const { start, end, transition } = motion;
  useEffect(() => {
    const x = end.left + end.width / 2 - start.left - start.width / 2;
    const y = end.top + end.height / 2 - start.top - start.height / 2;
    const defer = transition.to === "Defer";
    const animation = card.current?.animate(
      defer
        ? [
            { transform: "translateY(0)" },
            { transform: "translateY(-65px) rotate(-3deg)", offset: 0.45 },
            { transform: "translateY(10px) scale(.94)", opacity: 0 },
          ]
        : [
            { transform: "translate(0, 0)" },
            { transform: `translate(${x}px, ${y}px) scale(.9)`, opacity: 0.25 },
          ],
      { duration: 340, easing: "cubic-bezier(.28,.75,.35,1)", fill: "both" },
    );
    if (animation) animation.onfinish = () => setVisible(false);
    return () => animation?.cancel();
  }, [end, start, transition]);

  return (
    visible && (
      <div
        ref={card}
        aria-hidden="true"
        className={styles.flight}
        style={{ top: start.top, left: start.left, width: start.width }}
      >
        <FlightCard name={transition.name} checked={transition.to === "Done"} />
      </div>
    )
  );
}

export function Confetti({ area }: { area: DOMRect }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    const context = el?.getContext("2d");
    if (!el || !context) return;
    el.width = innerWidth;
    el.height = innerHeight;
    const start = performance.now();
    const particles = Array.from({ length: 48 }, (_, i) => ({
      x: area.left + Math.random() * area.width,
      y: area.top + Math.random() * area.height,
      dx: (Math.random() - 0.5) * 240,
      dy: -40 - Math.random() * 140,
      rotation: Math.random() * 8,
      color: ["#3195bd", "#194f72", "#71bdd4", "#e3aa4b"][i % 4],
    }));
    let frame = requestAnimationFrame(function draw(now) {
      const time = Math.max(0, (now - start) / 1000);
      const turnAt = 0.18;
      const charge = Math.min(1, time / turnAt);
      const pullback = -0.035 * charge * (2 - charge);
      const release = Math.max(0, time - turnAt);
      // Both phases reach the turning point with zero velocity.
      const spread = release ** 2 / (release + 0.085);
      const travel = pullback + spread;
      context.clearRect(0, 0, el.width, el.height);
      for (const p of particles) {
        context.save();
        context.globalAlpha = Math.max(0, Math.min(1, (0.85 - time) * 3));
        context.fillStyle = p.color;
        context.translate(p.x + p.dx * travel, p.y + p.dy * travel + 200 * spread ** 2);
        context.rotate(p.rotation + travel * 10);
        context.fillRect(-3, -2, 6, 4);
        context.restore();
      }
      if (time < 0.85) frame = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(frame);
  }, [area]);
  return <canvas ref={canvas} aria-hidden="true" className={styles.confetti} />;
}
