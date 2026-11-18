import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { Button } from '../ui';

/** The part of the browser `BarcodeDetector` API used here (not in the TypeScript DOM library yet). */
interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

const stop = (stream: MediaStream) => {
  for (const track of stream.getTracks()) track.stop();
};

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

/** The camera can be read when the browser has both a barcode detector and camera access (secure pages only). */
export function canScan(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window && typeof navigator.mediaDevices?.getUserMedia === 'function';
}

/** Digits only, as typed or pasted; a barcode is 6 to 14 of them. */
export const cleanCode = (text: string) => text.replace(/\D/g, '');
export const isCode = (text: string) => /^\d{6,14}$/.test(text);

/**
 * The rear camera with a frame around what is read. Calls `onCode` once with the first barcode seen, then the
 * caller closes it. Without camera permission the person is told, and the typed field stays the way in.
 */
export function CameraScan({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const found = useRef(onCode);
  found.current = onCode;

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const Detector = (window as unknown as { BarcodeDetector: DetectorConstructor }).BarcodeDetector;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) return stop(stream);
        const el = video.current;
        if (!el) return;
        el.srcObject = stream;
        await el.play();
        const detector = new Detector({ formats: FORMATS });
        const look = async () => {
          if (stopped) return;
          try {
            const code = (await detector.detect(el)).map((b) => cleanCode(b.rawValue)).find(isCode);
            if (code) {
              found.current(code);
              return;
            }
          } catch {
            // A frame that cannot be read is skipped; the next one is tried.
          }
          timer = setTimeout(look, 250);
        };
        void look();
      } catch {
        if (!stopped) setFailed(true);
      }
    })();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (stream) stop(stream);
    };
  }, []);

  return (
    <div className="space-y-2">
      {failed ? (
        <p role="alert" className="rounded-xl bg-surface-high px-3.5 py-2.5 text-sm font-medium text-warn">
          {t('stock.scan.noCamera')}
        </p>
      ) : (
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video ref={video} muted playsInline className="aspect-[4/3] w-full object-cover" aria-label={t('stock.scan.preview')} />
          <span className="pointer-events-none absolute inset-x-[12%] top-1/3 h-1/3 rounded-lg border-2 border-accent/80" />
        </div>
      )}
      <Button onClick={onClose} className="w-full">
        {t('stock.scan.stop')}
      </Button>
    </div>
  );
}
