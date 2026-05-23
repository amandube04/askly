"use client";

import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, GaugeCircle, Waves } from "lucide-react";

interface MissionOverviewCardsProps {
  status: string;
}

const cards = [
  {
    key: "health",
    title: "Backend Status",
    subtitle: "Live system health and readiness",
    icon: GaugeCircle,
    body: "Live system health and readiness",
  },
  {
    key: "creator",
    title: "Creator Surface",
    subtitle: "Core creator pipeline",
    icon: Waves,
    body: "Dashboard, form builder, analytics, CSV export.",
  },
  {
    key: "public",
    title: "Public Experience",
    subtitle: "Submission and funnel flow",
    icon: CheckCircle2,
    body: "Event-tracked submissions with funnel metrics.",
  },
] as const;

function normalizeHealthStatus(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("healthy") || normalized.includes("ok")) return "healthy";
  if (normalized.includes("degraded") || normalized.includes("warn")) return "degraded";
  return "error";
}

export function MissionOverviewCards({ status }: MissionOverviewCardsProps) {
  const healthState = normalizeHealthStatus(status);

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {cards.map((card, index) => {
        const Icon = card.icon;
        const isHealthCard = card.key === "health";
        const isHealthy = isHealthCard && healthState === "healthy";
        const isDegraded = isHealthCard && healthState === "degraded";
        const isError = isHealthCard && healthState === "error";

        return (
          <motion.div
            key={card.key}
            className="dune-card overflow-hidden p-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: index * 0.08 }}
            whileHover={{ y: -3 }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-stone-300/80">{card.title}</p>
                <p className="mt-1 text-xs text-stone-300/70">{card.subtitle}</p>
              </div>
              <motion.div
                animate={
                  isHealthy
                    ? { scale: [1, 1.08, 1], opacity: [0.9, 1, 0.9] }
                    : isDegraded
                      ? { rotate: [0, -5, 5, -3, 3, 0] }
                      : isError
                        ? { x: [0, -2, 2, -2, 2, 0] }
                        : { y: [0, -2, 0] }
                }
                transition={{ duration: isHealthy ? 2.2 : 0.7, repeat: Infinity, repeatDelay: isHealthy ? 0.2 : 2.5 }}
                className="rounded-md border border-stone-300/25 bg-stone-100/8 p-1.5"
              >
                {isError ? (
                  <AlertTriangle className="size-4 text-red-300" />
                ) : (
                  <Icon className="size-4 text-stone-100" />
                )}
              </motion.div>
            </div>

            <div className="mt-3">
              {isHealthCard ? (
                <motion.p
                  className="text-2xl font-semibold text-stone-100"
                  animate={
                    isHealthy
                      ? { color: ["#f5f0e7", "#daf7df", "#f5f0e7"] }
                      : isDegraded
                        ? { color: ["#f5f0e7", "#f5deb7", "#f5f0e7"] }
                        : { color: ["#f5f0e7", "#f5b7b7", "#f5f0e7"] }
                  }
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  {status}
                </motion.p>
              ) : (
                <p className="text-sm text-stone-200/90">{card.body}</p>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
