import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Button({
  variant = 'primary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  const base =
    'min-h-11 rounded-xl px-5 py-2.5 font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none';
  const styles =
    variant === 'primary'
      ? 'bg-gold text-felt-950 shadow-lg shadow-black/30 hover:brightness-110'
      : 'bg-white/5 text-ink ring-1 ring-white/15 hover:bg-white/10';
  return <button className={`${base} ${styles} ${className}`} {...rest} />;
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-3xl bg-felt-900/80 p-6 shadow-2xl shadow-black/40 ring-1 ring-white/10 backdrop-blur ${className}`}
    >
      {children}
    </div>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="felt-grain mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      {children}
    </main>
  );
}

export function Logo({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  return (
    <h1 className={`font-display font-extrabold leading-none ${size === 'lg' ? 'text-6xl' : 'text-3xl'}`}>
      <span className="text-card-red drop-shadow">NUE</span>{' '}
      <span className="text-gold drop-shadow">UNO</span>
    </h1>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg bg-card-red/15 px-3 py-2 text-sm text-red-200 [overflow-wrap:anywhere]">
      {children}
    </p>
  );
}
