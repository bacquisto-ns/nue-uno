import { useSession } from '../auth/session';
import { play, setSoundDefault, useSoundStore } from './sound';

/** The speaker toggle in the corner of the game screen and the TV (motion spec §7). */
export function SoundToggle({ className = '' }: { className?: string }) {
  const profileSound = useSession((s) => s.profile?.settings?.sound ?? false);
  setSoundDefault(profileSound);
  const stored = useSoundStore((s) => s.on);
  const setOn = useSoundStore((s) => s.setOn);
  const on = stored ?? profileSound;
  return (
    <button
      type="button"
      onClick={() => {
        setOn(!on);
        if (!on) play('pop');
      }}
      aria-pressed={on}
      aria-label={on ? 'Sound on — tap to mute' : 'Sound off — tap to turn on'}
      title={on ? 'Sound on' : 'Sound off'}
      className={`rounded-full bg-white/10 px-2 py-0.5 text-base leading-none hover:bg-white/20 ${className}`}
    >
      {on ? '🔊' : '🔇'}
    </button>
  );
}
