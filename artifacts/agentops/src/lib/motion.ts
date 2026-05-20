import type { Transition, Variants } from "framer-motion";

// Single source of truth for AgentOps motion personality.
// One spring. One fade. Interactions never exceed 200ms.

export const SPRING: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 32,
  mass: 0.9,
};

export const FADE: Transition = {
  duration: 0.18,
  ease: [0.22, 0.61, 0.36, 1],
};

export const FADE_UP: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: FADE },
};

export const STAGGER_CHILDREN: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
};

export const PAGE_IN: Variants = {
  hidden: { opacity: 0, y: 4 },
  show: { opacity: 1, y: 0, transition: FADE },
};
