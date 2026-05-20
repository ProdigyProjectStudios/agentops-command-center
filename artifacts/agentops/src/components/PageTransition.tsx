import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PAGE_IN } from "@/lib/motion";

export function PageTransition({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div initial="hidden" animate="show" variants={PAGE_IN}>
      {children}
    </motion.div>
  );
}
