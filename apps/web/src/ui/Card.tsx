import type { Card as CardModel, Color } from '@nue-uno/engine';
import { useId, type SVGProps } from 'react';

/** Card colors (PRD §8) and colorblind-safe shapes (PRD G9): red ◆, yellow ●, green ▲, blue ■. */
export const CARD_COLORS: Record<Color, { fill: string; ink: string; label: string }> = {
  red: { fill: 'var(--color-card-red)', ink: '#fff', label: 'Red' },
  yellow: { fill: 'var(--color-card-yellow)', ink: '#1b1300', label: 'Yellow' },
  green: { fill: 'var(--color-card-green)', ink: '#fff', label: 'Green' },
  blue: { fill: 'var(--color-card-blue)', ink: '#fff', label: 'Blue' },
};

export function ColorShape({ color, size = 12, ...rest }: { color: Color; size?: number } & SVGProps<SVGSVGElement>) {
  const s = size;
  const fill = 'currentColor';
  return (
    <svg width={s} height={s} viewBox="0 0 12 12" aria-hidden {...rest}>
      {color === 'red' && <path d="M6 0.5 11.5 6 6 11.5 0.5 6Z" fill={fill} />}
      {color === 'yellow' && <circle cx="6" cy="6" r="5.5" fill={fill} />}
      {color === 'green' && <path d="M6 0.8 11.5 11H0.5Z" fill={fill} />}
      {color === 'blue' && <rect x="1" y="1" width="10" height="10" rx="1" fill={fill} />}
    </svg>
  );
}

const GLYPH: Partial<Record<CardModel['value'], string>> = {
  skip: '⊘',
  reverse: '⇄',
  draw2: '+2',
  wild4: '+4',
};

export function cardLabel(card: CardModel): string {
  const value =
    card.value === 'draw2'
      ? 'Draw Two'
      : card.value === 'wild4'
        ? 'Wild Draw Four'
        : card.value === 'wild'
          ? 'Wild'
          : card.value === 'skip'
            ? 'Skip'
            : card.value === 'reverse'
              ? 'Reverse'
              : card.value;
  return card.color === 'wild' ? value : `${CARD_COLORS[card.color].label} ${value}`;
}

interface CardProps {
  card?: CardModel;
  faceDown?: boolean;
  /** Width in px; height is 1.5×. */
  width?: number;
  className?: string;
  dimmed?: boolean;
}

/** Original card art as inline SVG (no external assets). */
export function Card({ card, faceDown, width = 80, className, dimmed }: CardProps) {
  const uid = useId().replace(/:/g, '');
  const height = width * 1.5;
  const common = {
    width,
    height,
    viewBox: '0 0 100 150',
    className,
    role: 'img',
    style: { filter: dimmed ? 'brightness(0.7) saturate(0.8)' : undefined },
  } as const;

  if (faceDown || !card) {
    return (
      <svg {...common} aria-label="Face-down card">
        <defs>
          <linearGradient id={`back-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#10263d" />
            <stop offset="1" stopColor="#06101c" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="98" height="148" rx="10" fill={`url(#back-${uid})`} stroke="#f5c542" strokeWidth="2" />
        <rect x="8" y="8" width="84" height="134" rx="7" fill="none" stroke="#f5c54255" strokeWidth="1.5" />
        <ellipse cx="50" cy="75" rx="30" ry="48" fill="#e5484d" transform="rotate(-28 50 75)" />
        <text x="50" y="72" textAnchor="middle" className="font-display" fontSize="22" fontWeight="800" fill="#fff">NUE</text>
        <text x="50" y="94" textAnchor="middle" className="font-display" fontSize="22" fontWeight="800" fill="#f5c542">UNO</text>
      </svg>
    );
  }

  const label = cardLabel(card);

  if (card.color === 'wild') {
    // The Nue Wild: four-color pinwheel around the N mark (placeholder until final art — PRD §8).
    return (
      <svg {...common} aria-label={label}>
        <rect x="1" y="1" width="98" height="148" rx="10" fill="#0b1a2b" stroke="#fff" strokeWidth="3" />
        <g transform="rotate(-28 50 75)">
          <clipPath id={`oval-${uid}`}>
            <ellipse cx="50" cy="75" rx="32" ry="50" />
          </clipPath>
          <g clipPath={`url(#oval-${uid})`}>
            <rect x="0" y="0" width="50" height="75" fill="var(--color-card-red)" />
            <rect x="50" y="0" width="50" height="75" fill="var(--color-card-blue)" />
            <rect x="0" y="75" width="50" height="75" fill="var(--color-card-yellow)" />
            <rect x="50" y="75" width="50" height="75" fill="var(--color-card-green)" />
          </g>
        </g>
        <circle cx="50" cy="75" r="17" fill="#0b1a2b" stroke="#fff" strokeWidth="2.5" />
        <text x="50" y="83" textAnchor="middle" className="font-display" fontSize={card.value === 'wild4' ? 18 : 24} fontWeight="800" fill="#fff">
          {card.value === 'wild4' ? '+4' : 'N'}
        </text>
        <text x="12" y="22" className="font-display" fontSize="15" fontWeight="800" fill="#fff">
          {card.value === 'wild4' ? '+4' : 'W'}
        </text>
        <text x="88" y="138" textAnchor="end" className="font-display" fontSize="15" fontWeight="800" fill="#fff">
          {card.value === 'wild4' ? '+4' : 'W'}
        </text>
      </svg>
    );
  }

  const { fill, ink } = CARD_COLORS[card.color];
  const glyph = GLYPH[card.value] ?? card.value;
  const underline = card.value === '6' || card.value === '9';
  return (
    <svg {...common} aria-label={label}>
      <rect x="1" y="1" width="98" height="148" rx="10" fill="#fff" />
      <rect x="6" y="6" width="88" height="138" rx="7" fill={fill} />
      <ellipse cx="50" cy="75" rx="31" ry="50" fill="#fff" transform="rotate(-28 50 75)" />
      <text
        x="50"
        y="92"
        textAnchor="middle"
        className="font-display"
        fontSize={glyph.length > 1 ? 40 : 52}
        fontWeight="800"
        fill={fill}
        stroke="#0b1a2b33"
        strokeWidth="1"
        textDecoration={underline ? 'underline' : undefined}
      >
        {glyph}
      </text>
      {/* Corner index + colorblind shape */}
      <g fill={ink}>
        <text x="12" y="25" className="font-display" fontSize="17" fontWeight="800">{glyph}</text>
        <g transform="translate(12 30)" color={ink}><ColorShape color={card.color} size={11} /></g>
        <text x="88" y="136" textAnchor="end" className="font-display" fontSize="17" fontWeight="800">{glyph}</text>
        <g transform="translate(77 110)" color={ink}><ColorShape color={card.color} size={11} /></g>
      </g>
    </svg>
  );
}
