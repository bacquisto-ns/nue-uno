import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/**
 * /admin/signs — printable A4 table signs with a QR code to /table/:n (PRD E3, delivery plan W5).
 * Print from the browser; each sign fills a page.
 */
export function TableSigns() {
  const [count, setCount] = useState(4);
  const [codes, setCodes] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    void Promise.all(
      Array.from({ length: count }, (_, i) =>
        QRCode.toDataURL(`${window.location.origin}/table/${i + 1}`, { margin: 1, width: 600, color: { dark: '#0b1a2b', light: '#ffffff' } }),
      ),
    ).then((c) => alive && setCodes(c));
    return () => {
      alive = false;
    };
  }, [count]);

  return (
    <main className="bg-white text-felt-950">
      <style>{'@media print { .no-print { display: none } .sign { break-after: page; } body { background: #fff } }'}</style>
      <div className="no-print flex items-center gap-3 p-4">
        <label>Tables <input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-16 rounded border px-2" /></label>
        <button className="rounded bg-felt-900 px-4 py-2 font-bold text-white" onClick={() => window.print()}>Print</button>
      </div>
      {codes.map((src, i) => (
        <section key={i} className="sign flex min-h-screen flex-col items-center justify-center gap-6 p-10 text-center">
          <p className="font-display text-5xl font-extrabold"><span className="text-card-red">NUE</span> <span className="text-card-yellow">UNO</span></p>
          <p className="font-display text-[12rem] font-extrabold leading-none">TABLE {i + 1}</p>
          <img src={src} alt={`QR code for table ${i + 1}`} className="h-80 w-80" />
          <p className="text-2xl font-semibold">Scan to check in when your match is called</p>
        </section>
      ))}
    </main>
  );
}
