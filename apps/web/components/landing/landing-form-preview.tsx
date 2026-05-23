"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

type DemoStep =
  | { kind: "intro" }
  | { kind: "text"; label: string; placeholder: string; demoValue: string }
  | { kind: "rating"; label: string; max: number; demoValue: number }
  | { kind: "choice"; label: string; options: string[]; demoIndex: number }
  | { kind: "submit" };

const STEPS: DemoStep[] = [
  { kind: "intro" },
  {
    kind: "text",
    label: "What should we call you?",
    placeholder: "Type your name…",
    demoValue: "Ada Lovelace",
  },
  {
    kind: "rating",
    label: "How likely are you to recommend Askly?",
    max: 10,
    demoValue: 9,
  },
  {
    kind: "choice",
    label: "Which feature matters most to you?",
    options: ["Type safety", "Analytics", "Theming", "Speed"],
    demoIndex: 0,
  },
  { kind: "submit" },
];

const TYPE_SPEED_MS = 55;
const STEP_HOLD_MS = 1400;

export function LandingFormPreview() {
  const [stepIndex, setStepIndex] = useState(0);
  const [typedValue, setTypedValue] = useState("");
  const [ratingValue, setRatingValue] = useState(0);
  const [choiceIndex, setChoiceIndex] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const currentStep = STEPS[stepIndex];

  useEffect(() => {
    if (!currentStep) return;

    let timeoutHandles: ReturnType<typeof setTimeout>[] = [];

    const scheduleAdvance = (delay: number) => {
      const handle = setTimeout(() => {
        setStepIndex((prev) => {
          const next = prev + 1;
          if (next >= STEPS.length) {
            setSubmitted(true);
            const restart = setTimeout(() => {
              setStepIndex(0);
              setTypedValue("");
              setRatingValue(0);
              setChoiceIndex(null);
              setSubmitted(false);
            }, 2600);
            timeoutHandles.push(restart);
            return prev;
          }
          return next;
        });
      }, delay);
      timeoutHandles.push(handle);
    };

    if (currentStep.kind === "intro") {
      scheduleAdvance(1300);
    } else if (currentStep.kind === "text") {
      const targetValue = currentStep.demoValue;
      setTypedValue("");
      for (let charIndex = 1; charIndex <= targetValue.length; charIndex++) {
        const handle = setTimeout(() => {
          setTypedValue(targetValue.slice(0, charIndex));
        }, charIndex * TYPE_SPEED_MS);
        timeoutHandles.push(handle);
      }
      scheduleAdvance(targetValue.length * TYPE_SPEED_MS + STEP_HOLD_MS);
    } else if (currentStep.kind === "rating") {
      setRatingValue(0);
      const target = currentStep.demoValue;
      for (let star = 1; star <= target; star++) {
        const handle = setTimeout(() => setRatingValue(star), star * 130);
        timeoutHandles.push(handle);
      }
      scheduleAdvance(target * 130 + STEP_HOLD_MS);
    } else if (currentStep.kind === "choice") {
      setChoiceIndex(null);
      const handle = setTimeout(() => setChoiceIndex(currentStep.demoIndex), 700);
      timeoutHandles.push(handle);
      scheduleAdvance(700 + STEP_HOLD_MS);
    } else if (currentStep.kind === "submit") {
      scheduleAdvance(900);
    }

    return () => {
      timeoutHandles.forEach((handle) => clearTimeout(handle));
      timeoutHandles = [];
    };
  }, [stepIndex, currentStep]);

  const progressPercent = useMemo(() => {
    if (submitted) return 100;
    return Math.round(((stepIndex + 1) / STEPS.length) * 100);
  }, [stepIndex, submitted]);

  return (
    <section id="preview" className="relative mx-auto max-w-6xl px-5 py-20">
      <div className="mb-10 max-w-2xl">
        <p className="askly-section-eyebrow">Live preview</p>
        <h2 className="mt-2 text-3xl font-semibold text-stone-50 sm:text-4xl">
          One question at a time. No friction.
        </h2>
        <p className="mt-3 text-stone-300/80">
          Stepped flow with progress, validation, and respondent-friendly motion.
          The preview below auto-plays a real form path; it&apos;s the same component
          your respondents see.
        </p>
      </div>

      <div className="askly-card-glass mx-auto max-w-2xl p-6 sm:p-8">
        <div className="flex items-center justify-between text-xs text-stone-300/75">
          <span className="askly-section-eyebrow">Demo: Product feedback</span>
          <span>
            Step {Math.min(stepIndex + 1, STEPS.length)} of {STEPS.length}
          </span>
        </div>

        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-stone-700/40">
          <div
            className="h-full rounded-full bg-linear-to-r from-amber-200/90 to-stone-100/90 transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div key={stepIndex} className="askly-step-pulse mt-6 min-h-[180px]">
          {submitted ? (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <div className="grid size-12 place-items-center rounded-full border border-emerald-300/30 bg-emerald-300/10 text-emerald-200">
                <CheckCircle2 className="size-6" />
              </div>
              <p className="text-lg font-semibold text-stone-50">Response recorded</p>
              <p className="text-sm text-stone-300/80">
                Submission tracked. Funnel event sent. Demo restarts shortly…
              </p>
            </div>
          ) : currentStep?.kind === "intro" ? (
            <div className="py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-300/70">Public form</p>
              <h3 className="mt-2 text-2xl font-semibold text-stone-50">
                Product feedback — Q4
              </h3>
              <p className="mt-2 text-sm text-stone-300/80">
                Three quick questions. Should take under a minute.
              </p>
            </div>
          ) : currentStep?.kind === "text" ? (
            <div className="space-y-3">
              <label className="text-base font-medium text-stone-100">
                {currentStep.label}
              </label>
              <div className="flex w-full items-center gap-2 rounded-md border border-stone-200/25 bg-stone-950/40 px-3 py-2.5">
                <span className="text-stone-100">{typedValue}</span>
                <span className="ml-px inline-block h-4 w-px animate-pulse bg-stone-100/80" />
              </div>
            </div>
          ) : currentStep?.kind === "rating" ? (
            <div className="space-y-3">
              <label className="text-base font-medium text-stone-100">
                {currentStep.label}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: currentStep.max }, (_, index) => index + 1).map(
                  (value) => {
                    const isActive = value <= ratingValue;
                    return (
                      <span
                        key={value}
                        className={`grid size-9 place-items-center rounded-md border text-sm font-medium transition ${
                          isActive
                            ? "border-amber-200/60 bg-amber-200/15 text-amber-100"
                            : "border-stone-300/20 bg-stone-100/5 text-stone-300/70"
                        }`}
                      >
                        {value}
                      </span>
                    );
                  },
                )}
              </div>
            </div>
          ) : currentStep?.kind === "choice" ? (
            <div className="space-y-3">
              <label className="text-base font-medium text-stone-100">
                {currentStep.label}
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                {currentStep.options.map((option, index) => {
                  const isSelected = choiceIndex === index;
                  return (
                    <div
                      key={option}
                      className={`rounded-md border px-3 py-2.5 text-sm transition ${
                        isSelected
                          ? "border-amber-200/60 bg-amber-200/10 text-amber-100"
                          : "border-stone-300/20 bg-stone-100/5 text-stone-200"
                      }`}
                    >
                      {option}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : currentStep?.kind === "submit" ? (
            <div className="space-y-3 py-4">
              <p className="text-sm text-stone-300/80">Ready to send your response.</p>
              <div className="inline-flex items-center gap-2 rounded-md bg-amber-100 px-4 py-2 text-sm font-medium text-stone-900">
                Submit response
                <ArrowRight className="size-4" />
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-between text-xs text-stone-300/55">
          <span>Auto-playing demo</span>
          <span>Same component your respondents see</span>
        </div>
      </div>
    </section>
  );
}
