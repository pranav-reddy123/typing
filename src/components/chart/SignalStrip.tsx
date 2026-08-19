import { useEffect, useRef } from 'react';
import type { TypingEngine } from '@/lib/typing/engine';
import { useReducedMotion } from '@/hooks';

/**
 * The Signal Strip — the product's signature element.
 *
 * Your typing rendered as a live signal trace: instantaneous raw WPM as
 * amplitude, scrolling right to left; each error punches a downward notch.
 * Consistency becomes legible as the smoothness of the line.
 *
 * One canvas, one rAF loop, reading a fixed-size ring buffer the engine writes.
 * It never touches React state, so it costs nothing during a test. Under
 * reduced motion the loop does not run at all — the trace is drawn once,
 * statically, whenever the engine reports a tick.
 */
export function SignalStrip({
  engine,
  height = 44,
  scale = 160,
  className,
}: {
  engine: TypingEngine | null;
  height?: number;
  scale?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !engine) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      if (width === 0) resize();
      ctx.clearRect(0, 0, width, height);

      const count = engine.traceCount;
      const baseline = height - 2;

      // Baseline rule — the strip reads as an instrument even when idle.
      ctx.strokeStyle = 'rgba(29, 34, 44, 1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, baseline + 0.5);
      ctx.lineTo(width, baseline + 0.5);
      ctx.stroke();

      if (count === 0) {
        raf = reduced ? 0 : requestAnimationFrame(draw);
        return;
      }

      const visible = Math.min(count, Math.max(40, Math.floor(width / 3)));
      const step = width / visible;
      const start = (engine.traceHead - visible + engine.trace.length) % engine.trace.length;

      ctx.beginPath();
      ctx.moveTo(0, baseline);
      for (let i = 0; i < visible; i++) {
        const idx = (start + i) % engine.trace.length;
        const value = Math.min(engine.trace[idx] / scale, 1);
        ctx.lineTo(i * step, baseline - value * (height - 8));
      }
      ctx.strokeStyle = 'rgba(255, 163, 24, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Fill under the trace, very low alpha — depth without decoration.
      ctx.lineTo(width, baseline);
      ctx.lineTo(0, baseline);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 163, 24, 0.07)';
      ctx.fill();

      // Error notches.
      ctx.strokeStyle = 'rgba(224, 89, 106, 0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < visible; i++) {
        const idx = (start + i) % engine.trace.length;
        if (engine.traceFault[idx] !== 1) continue;
        const x = Math.round(i * step) + 0.5;
        ctx.moveTo(x, baseline);
        ctx.lineTo(x, baseline - 6);
      }
      ctx.stroke();

      if (!reduced) raf = requestAnimationFrame(draw);
    };

    const observer = new ResizeObserver(() => {
      resize();
      draw();
    });
    observer.observe(canvas);

    resize();
    draw();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [engine, height, scale, reduced]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{ width: '100%', height, display: 'block' }}
    />
  );
}
