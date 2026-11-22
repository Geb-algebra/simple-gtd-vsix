import { useEffect, useRef, useState } from "react";
import { FlightCard } from "./task-card";
import type { Transition } from "./tasks";
import styles from "./workspace.module.css";

const flightDuration = 340;
const acceleration = "cubic-bezier(.42,0,.78,0)";

export type Motion = {
  transition: Transition;
  start: DOMRect;
  end: DOMRect;
  impact: HTMLElement | null;
  token: number;
};

export function reducedMotion() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function Flight({
  motion,
  onArrival,
}: {
  motion: Motion;
  onArrival: (token: number) => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const { start, end, impact, transition, token } = motion;
  useEffect(() => {
    const x = end.left + end.width / 2 - start.left - start.width / 2;
    const y = end.top + end.height / 2 - start.top - start.height / 2;
    const defer = transition.to === "Defer";
    const scale = Math.min(0.9, (end.width - 8) / start.width, (end.height - 8) / start.height);
    const arrival = `translate(${x}px, ${y}px) scale(${Math.max(0.2, scale)})`;
    const animation = card.current?.animate(
      defer
        ? [
            { transform: "translateY(0)" },
            { transform: "translateY(-65px) rotate(-3deg)", offset: 0.45 },
            { transform: "translateY(10px) scale(.94)", opacity: 0 },
          ]
        : impact
          ? [
              { transform: "translate(0, 0)", easing: acceleration },
              { transform: arrival, opacity: 1, offset: 0.82 },
              { transform: arrival, opacity: 0 },
            ]
          : [
              { transform: "translate(0, 0)" },
              { transform: `translate(${x}px, ${y}px) scale(.9)`, opacity: 0.25 },
            ],
      {
        duration: flightDuration,
        easing: impact
          ? "linear"
          : transition.from === "Add"
            ? acceleration
            : "cubic-bezier(.28,.75,.35,1)",
        fill: "both",
      },
    );
    let reaction: Animation | undefined;
    if (animation)
      animation.onfinish = () => {
        setVisible(false);
        onArrival(token);
        if (!impact?.isConnected || reducedMotion()) return;
        const nudge = y < 0 ? -4 : 4;
        reaction = impact.animate(
          [
            { transform: "translateY(0)" },
            { transform: `translateY(${nudge}px)`, offset: 0.28 },
            { transform: `translateY(${-nudge / 2}px)`, offset: 0.62 },
            { transform: "translateY(0)" },
          ],
          { duration: 260, easing: "ease-out" },
        );
      };
    return () => {
      animation?.cancel();
      reaction?.cancel();
    };
  }, [end, impact, onArrival, start, token, transition]);

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
