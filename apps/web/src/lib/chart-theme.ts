import type { CSSProperties } from "react";

export const CHART_COLORS = [
  "var(--rf-chart-1)",
  "var(--rf-chart-2)",
  "var(--rf-chart-3)",
  "var(--rf-chart-4)",
  "var(--rf-chart-5)"
] as const;

export const CHART_TOOLTIP_CONTENT_STYLE: CSSProperties = {
  borderRadius: 12,
  border: "1px solid var(--rf-border)",
  backgroundColor: "var(--rf-surface)",
  color: "var(--rf-text)",
  boxShadow: "0 14px 24px rgba(0, 0, 0, 0.25)"
};

export const CHART_TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: "var(--rf-text-muted)"
};

export const CHART_AXIS_TICK = {
  fontSize: 10,
  fill: "var(--rf-text-muted)"
} as const;

export const CHART_GRID_PROPS = {
  strokeDasharray: "3 3",
  vertical: false,
  stroke: "var(--rf-border)"
} as const;
