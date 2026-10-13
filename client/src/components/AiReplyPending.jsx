import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';

// Presentation only: never create a conversation message or send a request.
export default function AiReplyPending({ label }) {
  const element = useRef(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    element.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  }, [reduceMotion]);

  return (
    <div ref={element} role="status" aria-live="polite" aria-atomic="true"
      className="flex w-fit max-w-full items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm"
      style={{ color: 'var(--foreground-secondary)' }}>
      <span aria-hidden="true" className="inline-flex shrink-0 items-center gap-1.5">
        {[0, 1, 2].map(index => (
          <motion.span key={index} className="h-1.5 w-1.5 rounded-full bg-primary"
            animate={reduceMotion ? { y: 0, opacity: 1 } : { y: [0, -4, 0], opacity: [0.45, 1, 0.45] }}
            transition={reduceMotion ? { duration: 0 } : { duration: 1.2, repeat: Infinity, delay: index * 0.16 }} />
        ))}
      </span>
      <span>{label}</span>
    </div>
  );
}
