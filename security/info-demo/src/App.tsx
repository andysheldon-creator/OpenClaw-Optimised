import { Environment, OrbitControls, Stars } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Crosshair, Layers, Shield, X } from "lucide-react";
import React, { useMemo, useRef, useState } from "react";
import type { SecuritySurface, SurfaceCategory } from "./surfaces";
import { AtlasScene } from "./components/AtlasScene";
import { clsx } from "./lib/clsx";
import { SURFACES } from "./surfaces";

type Filter = SurfaceCategory | "All";

function severityBadgeClass(sev: SecuritySurface["severity"]) {
  if (sev === "High") {
    return "badge badgeHigh";
  }
  if (sev === "Medium") {
    return "badge badgeMed";
  }
  return "badge badgeLow";
}

function metricFromSurfaces(surfaces: SecuritySurface[]) {
  const counts = { High: 0, Medium: 0, Low: 0 } as Record<SecuritySurface["severity"], number>;
  for (const s of surfaces) {
    counts[s.severity] += 1;
  }
  return counts;
}

export function App() {
  const [filter, setFilter] = useState<Filter>("All");
  const [selected, setSelected] = useState<SecuritySurface | null>(SURFACES[0] ?? null);
  const [focusId, setFocusId] = useState<string | null>(SURFACES[0]?.id ?? null);
  const cardsRef = useRef<HTMLDivElement | null>(null);

  const categories = useMemo(() => {
    const set = new Set<SurfaceCategory>();
    for (const s of SURFACES) {
      set.add(s.category);
    }
    return ["All", ...Array.from(set)] as const;
  }, []);

  const filtered = useMemo(() => {
    if (filter === "All") {
      return SURFACES;
    }
    return SURFACES.filter((s) => s.category === filter);
  }, [filter]);

  const metrics = useMemo(() => metricFromSurfaces(filtered), [filtered]);

  const open = (surface: SecuritySurface) => {
    setSelected(surface);
    setFocusId(surface.id);
  };

  const scrollToCards = () => {
    cardsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="app">
      <div className="bgCanvas" aria-hidden="true">
        <Canvas
          camera={{ position: [0, 0, 9], fov: 50 }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          dpr={[1, 2]}
        >
          <color attach="background" args={["#000000"]} />
          <fog attach="fog" args={["#05060a", 10, 32]} />
          <Stars radius={60} depth={40} count={5200} factor={2.6} saturation={0} fade speed={0.4} />
          <ambientLight intensity={0.45} />
          <directionalLight position={[6, 8, 6]} intensity={0.75} />
          <AtlasScene surfaces={SURFACES} focusId={focusId} onPick={open} />
          <Environment preset="city" />
          <OrbitControls
            enablePan={false}
            enableZoom={false}
            rotateSpeed={0.55}
            minPolarAngle={Math.PI * 0.28}
            maxPolarAngle={Math.PI * 0.72}
          />
        </Canvas>
      </div>

      <div className="overlay">
        <header className="topbar">
          <div className="topbarInner">
            <div className="brand">
              <div className="brandMark" />
              <div>
                OpenClaw <span style={{ opacity: 0.8 }}>Security Atlas</span>
              </div>
            </div>
            <div className="nav">
              <div
                className={clsx("chip", "chipActive")}
                role="button"
                tabIndex={0}
                onClick={scrollToCards}
                onKeyDown={(e) => (e.key === "Enter" ? scrollToCards() : undefined)}
              >
                <Crosshair size={14} /> Explore
              </div>
              <div
                className="chip"
                role="button"
                tabIndex={0}
                onClick={() => open(SURFACES[0])}
                onKeyDown={(e) => (e.key === "Enter" ? open(SURFACES[0]) : undefined)}
              >
                <Shield size={14} /> See Mitigations
              </div>
            </div>
          </div>
        </header>

        <main>
          <section className="hero">
            <div className="heroGrid">
              <div>
                <h1 className="heroTitle">
                  A cinematic map of <span>threat surfaces</span> — and the moves that tame them.
                </h1>
                <div className="heroSub">
                  Built for “wow factor” and clarity: click a node in the 3D atlas or drill down
                  below to explore the ways OpenClaw can be attacked, and how we intend to harden
                  it.
                </div>
                <div className="ctaRow">
                  <button className={clsx("btn", "btnPrimary")} onClick={scrollToCards}>
                    Explore surfaces <ArrowRight size={16} />
                  </button>
                  <button
                    className="btn"
                    onClick={() =>
                      open(SURFACES.find((s) => s.id === "prompt-injection") ?? SURFACES[0])
                    }
                  >
                    Prompt injection playbook <Layers size={16} />
                  </button>
                </div>
                <div className="footerNote">
                  Tip: the background atlas is interactive — hover for labels, click to open a deep
                  dive.
                </div>
              </div>

              <div className="sideCard">
                <div className="sideTitle">
                  <div>Risk skyline (filtered)</div>
                  <div className="badge">live</div>
                </div>
                <div className="sideMeta">
                  <div className="metric">
                    <div className="metricLabel">High impact</div>
                    <div className="metricValue" style={{ color: "var(--bad)" }}>
                      {metrics.High}
                    </div>
                  </div>
                  <div className="metric">
                    <div className="metricLabel">Medium</div>
                    <div className="metricValue" style={{ color: "var(--warn)" }}>
                      {metrics.Medium}
                    </div>
                  </div>
                  <div className="metric">
                    <div className="metricLabel">Low</div>
                    <div className="metricValue" style={{ color: "var(--ok)" }}>
                      {metrics.Low}
                    </div>
                  </div>
                </div>
                <div className="footerNote">
                  This demo intentionally speaks in operator language: “what it is”, “how it bites”,
                  and “how we mitigate”.
                </div>
              </div>
            </div>
          </section>

          <section className="sections" ref={cardsRef}>
            <div className="sectionHeader">
              <div>
                <h2>Threat Surfaces</h2>
                <p>Filter and drill down. Every card opens a mitigation-focused brief.</p>
              </div>
              <div
                style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}
              >
                {categories.map((cat) => (
                  <div
                    key={cat}
                    className={clsx("chip", filter === cat && "chipActive")}
                    role="button"
                    tabIndex={0}
                    onClick={() => setFilter(cat)}
                    onKeyDown={(e) => (e.key === "Enter" ? setFilter(cat) : undefined)}
                  >
                    {cat === "All" ? <Layers size={14} /> : <Shield size={14} />}
                    {cat}
                  </div>
                ))}
              </div>
            </div>

            <div className="cards">
              {filtered.map((s) => (
                <motion.div
                  key={s.id}
                  className="card"
                  onClick={() => open(s)}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  layout
                >
                  <div className="cardTop">
                    <div>
                      <div className="cardTitle">{s.title}</div>
                      <div className="cardDesc">{s.wowTagline}</div>
                    </div>
                    <div className={severityBadgeClass(s.severity)}>{s.severity}</div>
                  </div>
                  <div className="cardFooter">
                    <div className="pill">{s.category}</div>
                    <div className="pill">{s.policyGoal}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        </main>

        <AnimatePresence>
          {selected ? (
            <motion.div
              className="modalBackdrop"
              onClick={() => setSelected(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="modal"
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
              >
                <div className="modalHeader">
                  <div>
                    <h3 className="modalTitle">{selected.title}</h3>
                    <div className="modalSub">{selected.whatItIs}</div>
                  </div>
                  <button
                    className="modalClose"
                    onClick={() => setSelected(null)}
                    aria-label="Close"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="modalBody">
                  <div className="panel">
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <div>
                        <div className="panelTitle">How it bites</div>
                        <div className="footerNote">
                          Attack patterns that feel “plausible” in real ops.
                        </div>
                      </div>
                      <div className={severityBadgeClass(selected.severity)}>
                        {selected.severity}
                      </div>
                    </div>
                    <ul className="panelList">
                      {selected.howItBites.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="panel">
                    <div className="panelTitle">Mitigation moves</div>
                    <div className="footerNote">
                      Concrete strategies: scope, gates, guardrails, observability.
                    </div>
                    <ul className="panelList">
                      {selected.mitigationMoves.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                    <div style={{ height: 10 }} />
                    <div className="panelTitle">Detection signals</div>
                    <ul className="panelList">
                      {selected.detectionSignals.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
