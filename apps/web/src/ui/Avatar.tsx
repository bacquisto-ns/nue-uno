const EMOJI: Record<string, string> = {
  fox: '🦊',
  owl: '🦉',
  bear: '🐻',
  otter: '🦦',
  panda: '🐼',
  tiger: '🐯',
  koala: '🐨',
  penguin: '🐧',
  lion: '🦁',
  rabbit: '🐰',
  wolf: '🐺',
  octopus: '🐙',
};

export const AVATAR_COLOR_VALUES: Record<string, string> = {
  coral: '#ff7a6b',
  amber: '#f5b400',
  lime: '#8ccf3f',
  teal: '#22b8a7',
  sky: '#3fa9f5',
  indigo: '#6b6ff5',
  violet: '#b06bf5',
  rose: '#f56ba8',
};

/** Preset avatar (placeholder emoji art until Design delivers illustrations — delivery plan W1). */
export function Avatar({
  avatarId,
  color,
  size = 48,
  label,
}: {
  avatarId: string;
  color: string;
  size?: number;
  label: string;
}) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      className="inline-grid place-items-center rounded-full shadow-inner ring-2 ring-white/20"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.55,
        background: `radial-gradient(circle at 35% 30%, #ffffff55, transparent 60%), ${AVATAR_COLOR_VALUES[color] ?? AVATAR_COLOR_VALUES.teal}`,
      }}
    >
      {EMOJI[avatarId] ?? '🙂'}
    </span>
  );
}
