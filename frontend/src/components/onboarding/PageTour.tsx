import { useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import {
  isTourCompleted,
  markTourCompleted,
  PAGE_TOURS,
  type PageTourId,
  type TourStep,
} from "@/lib/pageTours";
import { cn } from "@/lib/utils";

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;
const TOOLTIP_GAP = 14;

function measureTarget(selector: string | undefined): Rect | null {
  if (!selector || typeof document === "undefined") return null;
  const el = document.querySelector(`[data-tour="${selector}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function tooltipStyle(
  target: Rect | null,
  cardW: number,
  cardH: number,
): CSSProperties {
  if (!target) {
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: Math.min(cardW, window.innerWidth - 32),
    };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = target.top + target.height + TOOLTIP_GAP;
  let left = target.left;

  if (top + cardH > vh - 16) {
    top = target.top - cardH - TOOLTIP_GAP;
  }
  if (left + cardW > vw - 16) {
    left = vw - cardW - 16;
  }
  if (left < 16) left = 16;
  if (top < 16) top = 16;

  return {
    position: "fixed",
    top,
    left,
    width: Math.min(cardW, vw - 32),
  };
}

export function PageTour({ tourId }: { tourId: PageTourId }) {
  const steps = PAGE_TOURS[tourId];
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [mounted, setMounted] = useState(false);

  const step: TourStep | undefined = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex >= steps.length - 1;
  const hasTarget = Boolean(step?.target && targetRect);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || isTourCompleted(tourId)) return;
    const t = window.setTimeout(() => setActive(true), 600);
    return () => window.clearTimeout(t);
  }, [mounted, tourId]);

  useLayoutEffect(() => {
    if (!active || !step) return;
    const rect = measureTarget(step.target);
    setTargetRect(rect);
    const el = step.target
      ? document.querySelector(`[data-tour="${step.target}"]`)
      : null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }

    const onResize = () => setTargetRect(measureTarget(step.target));
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [active, step, stepIndex]);

  function finish() {
    markTourCompleted(tourId);
    setActive(false);
  }

  function goNext() {
    if (isLast) finish();
    else setStepIndex((i) => i + 1);
  }

  function goBack() {
    if (!isFirst) setStepIndex((i) => i - 1);
  }

  if (!mounted || !active || !step) return null;

  const cardStyle = tooltipStyle(hasTarget ? targetRect : null, 340, 200);

  return createPortal(
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true" aria-label="Visite guidée">
      {/* Dim overlay with spotlight cutout */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <mask id={`tour-mask-${tourId}`}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && hasTarget ? (
              <rect
                x={targetRect.left - PAD}
                y={targetRect.top - PAD}
                width={targetRect.width + PAD * 2}
                height={targetRect.height + PAD * 2}
                rx="12"
                fill="black"
              />
            ) : null}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(15, 40, 25, 0.55)"
          mask={`url(#tour-mask-${tourId})`}
        />
      </svg>

      {targetRect && hasTarget ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-primary/80 ring-offset-2 ring-offset-transparent"
          style={{
            top: targetRect.top - PAD,
            left: targetRect.left - PAD,
            width: targetRect.width + PAD * 2,
            height: targetRect.height + PAD * 2,
          }}
          aria-hidden
        />
      ) : null}

      {/* Tooltip card */}
      <div
        style={cardStyle}
        className={cn(
          "z-[201] rounded-2xl border border-[#0C2819]/15 bg-white p-5 shadow-[0_20px_50px_-20px_rgba(12,40,25,0.35)]",
          "animate-in fade-in slide-in-from-bottom-2 duration-300",
        )}
      >
        <h3 className="font-display text-lg font-bold text-[#0C2819]">{step.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-[#3B5245]">{step.body}</p>

        <div className="mt-5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            {!isFirst ? (
              <button
                type="button"
                onClick={goBack}
                className="text-sm font-semibold text-[#0C2819] hover:underline"
              >
                Retour
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={finish}
              className="text-sm font-semibold text-[#C45A2E] hover:underline"
            >
              Passer
            </button>
          </div>
          <button
            type="button"
            onClick={goNext}
            className="rounded-full bg-[#0C2819] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#0C2819]/90"
          >
            {isLast ? "Terminer" : "Suivant"}
          </button>
        </div>

        <p className="mt-3 text-center text-[10px] font-mono text-[#4D6254]/70">
          {stepIndex + 1} / {steps.length}
        </p>
      </div>
    </div>,
    document.body,
  );
}
