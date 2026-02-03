import { html, nothing, type TemplateResult } from "lit";

export type OrbitalItem = {
  id: string;
  title: TemplateResult | string;
  subtitle?: TemplateResult | string;
  icon?: TemplateResult;
  disabled?: boolean;
  onClick?: () => void;
};

type OrbitalPlacement = {
  ring: number;
  angleDeg: number;
  radiusPx: number;
};

export type OrbitalLayout = {
  itemWidthPx?: number;
  itemGapPx?: number;
  minRadiusPx?: number;
  ringStepPx?: number;
  maxRings?: number;
};

function resolveLayout(layout?: OrbitalLayout) {
  return {
    itemWidthPx: Math.max(120, Math.round(layout?.itemWidthPx ?? 168)),
    itemGapPx: Math.max(10, Math.round(layout?.itemGapPx ?? 22)),
    minRadiusPx: Math.max(120, Math.round(layout?.minRadiusPx ?? 190)),
    ringStepPx: Math.max(90, Math.round(layout?.ringStepPx ?? 138)),
    maxRings: Math.max(2, Math.min(12, Math.round(layout?.maxRings ?? 8))),
  };
}

function computeRingCapacity(radiusPx: number, itemWidthPx: number, itemGapPx: number): number {
  const circumference = 2 * Math.PI * radiusPx;
  const perItem = itemWidthPx + itemGapPx;
  return Math.max(4, Math.floor(circumference / perItem));
}

function computePlacements(count: number, layout?: OrbitalLayout): OrbitalPlacement[] {
  const l = resolveLayout(layout);
  const placements: OrbitalPlacement[] = [];
  let remaining = Math.max(0, count);

  for (let ring = 0; ring < l.maxRings && remaining > 0; ring++) {
    const radiusPx = l.minRadiusPx + l.ringStepPx * ring;
    const capacity = Math.min(24, computeRingCapacity(radiusPx, l.itemWidthPx, l.itemGapPx));
    const ringCount = Math.max(1, Math.min(capacity, remaining));
    const step = 360 / ringCount;
    const start = -90; // start at top
    for (let i = 0; i < ringCount; i++) {
      placements.push({ ring, angleDeg: start + step * i, radiusPx });
    }
    remaining -= ringCount;
  }

  // Overflow: spill onto an extra outer ring.
  if (remaining > 0) {
    const ring = l.maxRings;
    const radiusPx = l.minRadiusPx + l.ringStepPx * ring;
    const ringCount = remaining;
    const step = 360 / ringCount;
    const start = -90;
    for (let i = 0; i < ringCount; i++) {
      placements.push({ ring, angleDeg: start + step * i, radiusPx });
    }
  }

  return placements;
}

export function renderOrbital(props: {
  center: TemplateResult;
  items: OrbitalItem[];
  className?: string;
  ariaLabel?: string;
  layout?: OrbitalLayout;
}) {
  const items = props.items ?? [];
  const layout = resolveLayout(props.layout);
  const placements = computePlacements(items.length, layout);
  const outerRadius = Math.max(...placements.map((p) => p.radiusPx), 0);
  const size = Math.max(560, Math.min(980, outerRadius * 2 + layout.itemWidthPx + 260));
  const className = props.className ? `orbital ${props.className}` : "orbital";
  const ariaLabel = props.ariaLabel ?? "Orbital navigation";
  const ringRadii = Array.from(new Set(placements.map((p) => p.radiusPx))).sort((a, b) => a - b);

  return html`
    <div
      class=${className}
      style="--orbital-size:${size}px; --orbital-item-width:${layout.itemWidthPx}px;"
      role="group"
      aria-label=${ariaLabel}
    >
      <div class="orbital__rings" aria-hidden="true">
        ${ringRadii.map(
          (radiusPx) =>
            html`<div class="orbital__ring" style="--orbital-ring:${radiusPx}px;"></div>`,
        )}
      </div>
      <div class="orbital__center">
        ${props.center}
      </div>
      <div class="orbital__items">
        ${
          items.length === 0
            ? nothing
            : items.map((item, idx) => {
                const placement = placements[idx]!;
                const angle = placement.angleDeg;
                const angleNeg = -angle;
                const disabled = Boolean(item.disabled);
                const click = item.onClick;
                return html`
            <button
              class="orbital__item"
              style="--orbital-rot:${angle}deg; --orbital-rot-neg:${angleNeg}deg; --orbital-radius:${placement.radiusPx}px;"
              type="button"
              ?disabled=${disabled}
              @click=${() => click?.()}
              aria-label=${typeof item.title === "string" ? item.title : item.id}
            >
              ${item.icon ? html`<div class="orbital__icon">${item.icon}</div>` : nothing}
              <div class="orbital__title">${item.title}</div>
              ${item.subtitle ? html`<div class="orbital__subtitle">${item.subtitle}</div>` : nothing}
            </button>
          `;
              })
        }
      </div>
    </div>
  `;
}
