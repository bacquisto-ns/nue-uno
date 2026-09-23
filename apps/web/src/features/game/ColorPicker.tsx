import { COLORS, type Color } from '@nue-uno/engine';
import { m } from 'framer-motion';
import { useEffect } from 'react';
import { spring } from '../../motion/tokens';
import { CARD_COLORS, ColorShape } from '../../ui/Card';

/** Wild color choice: four big buttons (keys 1–4, PRD G8). */
export function ColorPicker({ onPick, onCancel }: { onPick: (c: Color) => void; onCancel?: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < 4) onPick(COLORS[idx]!);
      if (e.key === 'Escape') onCancel?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPick, onCancel]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal aria-label="Choose a color">
      <m.div
        initial={{ scale: 0, rotate: -90 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={spring.bouncy}
        className="grid grid-cols-2 gap-3 rounded-full p-4"
      >
        {COLORS.map((c, i) => (
          <button
            key={c}
            onClick={() => onPick(c)}
            className="flex h-28 w-28 flex-col items-center justify-center gap-1 rounded-3xl text-lg font-bold shadow-xl ring-4 ring-white/20 transition hover:scale-105 focus-visible:scale-105"
            style={{ background: CARD_COLORS[c].fill, color: CARD_COLORS[c].ink }}
          >
            <ColorShape color={c} size={28} />
            {CARD_COLORS[c].label}
            <span className="text-xs opacity-70">{i + 1}</span>
          </button>
        ))}
      </m.div>
      {onCancel && (
        <button onClick={onCancel} className="absolute bottom-10 text-ink-muted underline">
          Cancel
        </button>
      )}
    </div>
  );
}
