"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

// Desktop-only "there's more below" hint pinned to the bottom of the hero.
// On large screens the hero can fill the viewport and read as a complete page,
// so some users never scroll. This nudges the eye, then fades out the instant
// they do scroll. Hidden on mobile (content already overflows there) and static
// under reduced-motion.
export function ScrollCue() {
  const reduce = useReducedMotion();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onScroll = () => setHidden(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-5 hidden justify-center md:flex"
      initial={false}
      animate={{ opacity: hidden ? 0 : 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <span className="flex flex-col items-center gap-1.5 text-rf-text-muted">
        <span className="text-xs font-medium uppercase tracking-widest">Scroll</span>
        <motion.svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-rf-accent"
          animate={reduce ? undefined : { y: [0, 5, 0] }}
          transition={reduce ? undefined : { duration: 1.6, ease: "easeInOut", repeat: Infinity }}
        >
          <path d="M6 9l6 6 6-6" />
        </motion.svg>
      </span>
    </motion.div>
  );
}
