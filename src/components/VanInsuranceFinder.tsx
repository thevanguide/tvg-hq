import React, { useState } from "react";

/* ── Carrier data ────────────────────────────────────────────────── */

interface Carrier {
  name: string;
  slug: string;
  quoteUrl: string;
  features: {
    coversDIY: boolean;
    requiresAllSix: boolean;
    requiresBathroom: boolean;
    agreedValue: boolean;
    rentalCoverage: boolean;
    fullTimeCoverage: boolean;
    acceptsSingleVehicle: boolean;
    availableInCA: boolean;
    bundlingDiscount: string | null;
  };
}

const carriers: Carrier[] = [
  {
    name: "Roamly",
    slug: "roamly",
    quoteUrl: "https://www.roamly.com/",
    features: {
      coversDIY: true,
      requiresAllSix: false,
      requiresBathroom: false,
      agreedValue: true,
      rentalCoverage: true,
      fullTimeCoverage: true,
      acceptsSingleVehicle: true,
      availableInCA: true,
      bundlingDiscount: null,
    },
  },
  {
    name: "Progressive",
    slug: "progressive",
    quoteUrl: "https://www.progressive.com/",
    features: {
      coversDIY: true,
      requiresAllSix: true,
      requiresBathroom: false,
      agreedValue: false,
      rentalCoverage: false,
      fullTimeCoverage: true,
      acceptsSingleVehicle: true,
      availableInCA: true,
      bundlingDiscount: "Progressive",
    },
  },
  {
    name: "Good Sam / National General",
    slug: "good-sam",
    quoteUrl: "https://www.goodsam.com/",
    features: {
      coversDIY: true,
      requiresAllSix: true,
      requiresBathroom: true,
      agreedValue: true,
      rentalCoverage: false,
      fullTimeCoverage: true,
      acceptsSingleVehicle: false,
      availableInCA: false,
      bundlingDiscount: "Good Sam",
    },
  },
  {
    name: "State Farm",
    slug: "state-farm",
    quoteUrl: "https://www.statefarm.com/",
    features: {
      coversDIY: true,
      requiresAllSix: false,
      requiresBathroom: false,
      agreedValue: false,
      rentalCoverage: false,
      fullTimeCoverage: false,
      acceptsSingleVehicle: true,
      availableInCA: true,
      bundlingDiscount: "State Farm",
    },
  },
];

/* ── Types ───────────────────────────────────────────────────────── */

type BuildType = "factory" | "professional" | "diy";
type Usage = "recreational" | "fulltime" | "rental";

interface Answers {
  buildType: BuildType | null;
  features: string[];
  state: string;
  usage: Usage | null;
  onlyVehicle: boolean | null;
  existingInsurance: string[];
}

interface ScoredCarrier {
  carrier: Carrier;
  score: number;
  reasons: string[];
  caveats: string[];
  disqualified: boolean;
  disqualifyReasons: string[];
  nearMiss?: string;
}

const FEATURE_LIST = [
  { id: "cooking", label: "Cooking facilities" },
  { id: "fridge", label: "Refrigeration" },
  { id: "sleeping", label: "Sleeping area" },
  { id: "hvac", label: "Heating or AC system (not wood stove)" },
  { id: "water", label: "Drinkable water supply" },
  { id: "electrical", label: "110-125V electrical system" },
  { id: "bathroom", label: "Bathroom with indoor plumbing" },
];

const SIX_REQUIRED = ["cooking", "fridge", "sleeping", "hvac", "water", "electrical"];

const FEATURE_LABELS: Record<string, string> = {
  cooking: "cooking facilities",
  fridge: "refrigeration",
  sleeping: "sleeping area",
  hvac: "heating/AC",
  water: "drinkable water",
  electrical: "110-125V electrical",
  bathroom: "bathroom",
};

/* ── Scoring ─────────────────────────────────────────────────────── */

function scoreCarriers(answers: Answers): ScoredCarrier[] {
  const hasSix = SIX_REQUIRED.every((f) => answers.features.includes(f));
  const hasBathroom = answers.features.includes("bathroom");
  const hasAll7 = hasSix && hasBathroom;
  const isCA = answers.state.toLowerCase() === "california";
  const missingSix = SIX_REQUIRED.filter((f) => !answers.features.includes(f));

  return carriers.map((carrier) => {
    let score = 0;
    const reasons: string[] = [];
    const caveats: string[] = [];
    const disqualifyReasons: string[] = [];
    let nearMiss: string | undefined;

    // Build type scoring (never disqualifies)
    if (answers.buildType === "diy") {
      const pts: Record<string, number> = { Roamly: 3, Progressive: 2, "Good Sam / National General": 1, "State Farm": 1 };
      score += pts[carrier.name] ?? 0;
      if (carrier.name === "Roamly") reasons.push("Covers DIY builds by default");
      if (carrier.name === "State Farm") caveats.push("DIY coverage is agent-dependent");
    } else if (answers.buildType === "factory") {
      const pts: Record<string, number> = { Roamly: 1, Progressive: 2, "Good Sam / National General": 3, "State Farm": 2 };
      score += pts[carrier.name] ?? 0;
      if (carrier.name === "Good Sam / National General") reasons.push("Specializes in factory RVs and Class Bs");
    } else if (answers.buildType === "professional") {
      const pts: Record<string, number> = { Roamly: 2, Progressive: 2, "Good Sam / National General": 2, "State Farm": 1 };
      score += pts[carrier.name] ?? 0;
    }

    // Features — check all carriers independently
    if (hasAll7) {
      const pts: Record<string, number> = { Roamly: 1, Progressive: 1, "Good Sam / National General": 2, "State Farm": 1 };
      score += pts[carrier.name] ?? 0;
      if (carrier.name === "Good Sam / National General") reasons.push("Your build meets all 7 feature requirements");
    } else if (hasSix) {
      // Has 6 but not bathroom
      if (carrier.name === "Good Sam / National General") {
        disqualifyReasons.push("Requires a bathroom with indoor plumbing");
      } else {
        const pts: Record<string, number> = { Roamly: 2, Progressive: 1, "State Farm": 1 };
        score += pts[carrier.name] ?? 0;
        if (carrier.name === "Roamly") reasons.push("No bathroom requirement");
      }
    } else {
      // Missing some of the core 6
      if (carrier.name === "Progressive") {
        if (missingSix.length === 1) {
          const missing = FEATURE_LABELS[missingSix[0]] || missingSix[0];
          disqualifyReasons.push(`Requires 6 RV features — you're only missing ${missing}`);
          nearMiss = `Add ${missing} to qualify for Progressive's RV rates`;
        } else {
          disqualifyReasons.push(`Requires 6 specific RV features (missing ${missingSix.length})`);
        }
      } else if (carrier.name === "Good Sam / National General") {
        disqualifyReasons.push(`Requires 7 specific RV features (missing ${missingSix.length + (hasBathroom ? 0 : 1)})`);
      } else {
        score += 1;
        if (carrier.name === "Roamly") reasons.push("Covers vans without specific feature requirements");
        if (carrier.name === "State Farm") reasons.push("No specific feature checklist required");
      }
    }

    // State
    if (isCA) {
      if (carrier.name === "Good Sam / National General") {
        disqualifyReasons.push("Does not cover Class B van conversions in California");
      } else {
        const pts: Record<string, number> = { Roamly: 2, Progressive: 1, "State Farm": 1 };
        score += pts[carrier.name] ?? 0;
        if (carrier.name === "Roamly") reasons.push("Available in California");
      }
    }

    // Usage
    if (answers.usage === "rental") {
      if (carrier.name === "Roamly") {
        score += 3;
        reasons.push("Supports Outdoorsy and RVshare rentals");
      } else {
        disqualifyReasons.push("Does not cover peer-to-peer van rentals");
      }
    } else if (answers.usage === "fulltime") {
      if (disqualifyReasons.length === 0) {
        const pts: Record<string, number> = { Roamly: 1, Progressive: 2, "Good Sam / National General": 1, "State Farm": 0 };
        score += pts[carrier.name] ?? 0;
        if (carrier.name === "Progressive") reasons.push("Offers full-time RV coverage");
        if (carrier.name === "State Farm") caveats.push("Full-time living coverage may be limited");
      }
    }

    // Only vehicle
    if (answers.onlyVehicle) {
      if (carrier.name === "Good Sam / National General") {
        disqualifyReasons.push("Requires a separate daily-driver vehicle");
      } else if (disqualifyReasons.length === 0) {
        score += 1;
        if (carrier.name === "Roamly") reasons.push("No second vehicle required");
      }
    }

    // Existing insurance (only apply if not disqualified)
    if (disqualifyReasons.length === 0) {
      if (answers.existingInsurance.includes("Progressive") && carrier.name === "Progressive") {
        score += 3;
        reasons.push("Multi-policy discount with your existing Progressive coverage");
      }
      if (answers.existingInsurance.includes("State Farm") && carrier.name === "State Farm") {
        score += 3;
        reasons.push("Multi-policy discount with your existing State Farm coverage");
      }
      if (answers.existingInsurance.includes("Good Sam") && carrier.name === "Good Sam / National General") {
        score += 3;
        reasons.push("Good Sam membership discount applies");
      }
    }

    // General caveats (only if not disqualified)
    if (disqualifyReasons.length === 0) {
      if (carrier.name === "Roamly" && !carrier.features.bundlingDiscount) {
        caveats.push("No multi-policy bundling discount available");
      }
      if (carrier.name === "Progressive" && !carrier.features.agreedValue) {
        caveats.push("Does not offer agreed-value coverage");
      }
      if (carrier.name === "State Farm") {
        caveats.push("Coverage options vary by agent");
      }
    }

    const disqualified = disqualifyReasons.length > 0;
    if (disqualified) score = -10;

    return { carrier, score, reasons, caveats, disqualified, disqualifyReasons, nearMiss };
  });
}

/* ── Styles (inline, using CSS vars) ─────────────────────────────── */

const styles = {
  card: {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-lg)",
    padding: "1.5rem",
  } as React.CSSProperties,
  activeCard: {
    background: "var(--color-surface)",
    border: "2px solid var(--color-accent)",
    borderRadius: "var(--radius-lg)",
    padding: "1.5rem",
    cursor: "pointer",
  } as React.CSSProperties,
  inactiveCard: {
    background: "var(--color-bg)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-lg)",
    padding: "1.5rem",
    cursor: "pointer",
  } as React.CSSProperties,
  progressBar: {
    height: "4px",
    background: "var(--color-border)",
    borderRadius: "2px",
    overflow: "hidden",
    marginBottom: "2rem",
  } as React.CSSProperties,
  progressFill: (pct: number) =>
    ({
      height: "100%",
      width: `${pct}%`,
      background: "var(--color-accent)",
      borderRadius: "2px",
      transition: "width 0.3s ease",
    }) as React.CSSProperties,
  checkbox: {
    width: "1.25rem",
    height: "1.25rem",
    accentColor: "var(--color-accent)",
    cursor: "pointer",
  } as React.CSSProperties,
};

/* ── Sub-components ──────────────────────────────────────────────── */

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <span style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
          Step {step} of {total}
        </span>
        <span style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
          {Math.round((step / total) * 100)}%
        </span>
      </div>
      <div style={styles.progressBar}>
        <div style={styles.progressFill((step / total) * 100)} />
      </div>
    </div>
  );
}

function NavButtons({
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled = false,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
      {onBack && (
        <button className="btn btn-ghost" onClick={onBack} type="button">
          Back
        </button>
      )}
      <button className="btn btn-primary" onClick={onNext} disabled={nextDisabled} type="button" style={{ opacity: nextDisabled ? 0.5 : 1 }}>
        {nextLabel}
      </button>
    </div>
  );
}

function OptionCard({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      style={selected ? styles.activeCard : styles.inactiveCard}
    >
      {children}
    </div>
  );
}

function ResultCard({
  result,
  rank,
}: {
  result: ScoredCarrier;
  rank: number;
}) {
  const badge = rank === 1 ? "Best Match" : rank === 2 ? "Strong Option" : "Worth Considering";
  const badgeBg = rank === 1 ? "var(--color-accent)" : "var(--color-primary-light)";

  return (
    <div style={{ ...styles.card, marginBottom: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
        <span
          style={{
            display: "inline-block",
            background: badgeBg,
            color: "#fff",
            fontSize: "0.75rem",
            fontWeight: 600,
            padding: "0.25rem 0.625rem",
            borderRadius: "var(--radius-sm)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {badge}
        </span>
        <span style={{ fontWeight: 700, fontSize: "1.125rem" }}>{result.carrier.name}</span>
      </div>

      {result.reasons.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1rem 0" }}>
          {result.reasons.map((r, i) => (
            <li key={i} style={{ padding: "0.25rem 0", color: "var(--color-text)" }}>
              <span style={{ color: "var(--color-primary-light)", marginRight: "0.5rem" }}>&#10003;</span>
              {r}
            </li>
          ))}
        </ul>
      )}

      {result.caveats.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1rem 0" }}>
          {result.caveats.map((c, i) => (
            <li key={i} style={{ padding: "0.25rem 0", color: "var(--color-text-muted)", fontSize: "0.875rem" }}>
              <span style={{ marginRight: "0.5rem" }}>&#9888;</span>
              {c}
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <a href={`/insurance/carriers/${result.carrier.slug}/`} className="btn btn-ghost" style={{ fontSize: "0.875rem" }}>
          Read full review &rarr;
        </a>
        <a
          href={result.carrier.quoteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-accent"
          style={{ fontSize: "0.875rem" }}
        >
          Get a quote &rarr;
        </a>
      </div>
    </div>
  );
}

function AnswerSummary({ answers, onEditStep }: { answers: Answers; onEditStep: (step: number) => void }) {
  const buildLabels: Record<string, string> = { factory: "Factory Class B", professional: "Professional custom build", diy: "DIY build" };
  const usageLabels: Record<string, string> = { recreational: "Recreational", fulltime: "Full-time", rental: "Peer-to-peer rental" };
  const featureCount = answers.features.length;

  const rows: { label: string; value: string; step: number }[] = [
    { label: "Build type", value: answers.buildType ? buildLabels[answers.buildType] : "—", step: 1 },
    { label: "Features", value: featureCount === 7 ? "All 7" : featureCount === 0 ? "None" : `${featureCount} of 7`, step: 2 },
    { label: "State", value: answers.state || "—", step: 3 },
    { label: "Usage", value: answers.usage ? usageLabels[answers.usage] : "—", step: 4 },
    { label: "Only vehicle", value: answers.onlyVehicle === null ? "—" : answers.onlyVehicle ? "Yes" : "No", step: 5 },
    {
      label: "Existing insurance",
      value: answers.existingInsurance.length > 0 ? answers.existingInsurance.join(", ") : "None",
      step: 6,
    },
  ];

  return (
    <div style={{ ...styles.card, marginBottom: "1.5rem" }}>
      <div style={{ fontWeight: 600, marginBottom: "0.75rem", fontSize: "0.9375rem" }}>Your answers</div>
      {rows.map((row) => (
        <div
          key={row.step}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0.375rem 0",
            fontSize: "0.875rem",
          }}
        >
          <span style={{ color: "var(--color-text-muted)" }}>{row.label}</span>
          <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontWeight: 500 }}>{row.value}</span>
            <button
              type="button"
              onClick={() => onEditStep(row.step)}
              style={{
                background: "none",
                border: "none",
                color: "var(--color-accent)",
                cursor: "pointer",
                fontSize: "0.8125rem",
                padding: "0.125rem 0.25rem",
                textDecoration: "underline",
              }}
            >
              Edit
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────── */

const INITIAL_ANSWERS: Answers = {
  buildType: null,
  features: [],
  state: "",
  usage: null,
  onlyVehicle: null,
  existingInsurance: [],
};

const TOTAL_STEPS = 6;

export default function VanInsuranceFinder() {
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<Answers>({ ...INITIAL_ANSWERS });

  const update = <K extends keyof Answers>(key: K, value: Answers[K]) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS + 1));
  const back = () => setStep((s) => Math.max(s - 1, 1));
  const goToStep = (s: number) => setStep(s);
  const restart = () => {
    setStep(1);
    setAnswers({ ...INITIAL_ANSWERS });
  };

  const toggleFeature = (id: string) => {
    setAnswers((prev) => ({
      ...prev,
      features: prev.features.includes(id) ? prev.features.filter((f) => f !== id) : [...prev.features, id],
    }));
  };

  const toggleInsurance = (id: string) => {
    setAnswers((prev) => ({
      ...prev,
      existingInsurance: prev.existingInsurance.includes(id)
        ? prev.existingInsurance.filter((i) => i !== id)
        : [...prev.existingInsurance, id],
    }));
  };

  // Results
  if (step > TOTAL_STEPS) {
    const scored = scoreCarriers(answers);
    const recommended = scored
      .filter((s) => !s.disqualified && s.score > 0)
      .sort((a, b) => b.score - a.score || a.carrier.name.localeCompare(b.carrier.name));
    const disqualified = scored.filter((s) => s.disqualified);
    const nearMisses = disqualified.filter((d) => d.nearMiss);

    return (
      <div>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>Your Recommendations</h2>
        <p style={{ color: "var(--color-text-muted)", marginBottom: "1.5rem", fontSize: "0.9375rem" }}>
          Based on your answers, {recommended.length === 0 ? "here's what we found" : `${recommended.length} carrier${recommended.length !== 1 ? "s" : ""} fit${recommended.length === 1 ? "s" : ""} your situation`}.
        </p>

        <AnswerSummary answers={answers} onEditStep={goToStep} />

        {recommended.length === 0 && (
          <div style={{ ...styles.card, marginBottom: "1.5rem" }}>
            <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>No carriers matched all your criteria.</p>
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.9375rem" }}>
              Your combination of build type, features, state, and usage is unusual enough that standard RV carriers may not cover it.
              Consider reaching out to a specialty RV insurance broker who can shop multiple underwriters.
            </p>
          </div>
        )}

        {recommended.map((result, i) => (
          <ResultCard key={result.carrier.slug} result={result} rank={i + 1} />
        ))}

        {nearMisses.length > 0 && (
          <div
            style={{
              marginTop: "1rem",
              marginBottom: "1rem",
              padding: "1rem",
              background: "var(--color-bg-alt)",
              borderRadius: "var(--radius-md)",
              borderLeft: "3px solid var(--color-accent)",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.5rem" }}>Almost qualified</div>
            {nearMisses.map((nm) => (
              <p key={nm.carrier.slug} style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", margin: "0.25rem 0" }}>
                {nm.nearMiss}
              </p>
            ))}
          </div>
        )}

        {disqualified.length > 0 && (
          <div style={{ marginTop: "1.5rem" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-text-muted)", marginBottom: "0.75rem" }}>
              Not recommended for your situation
            </h3>
            {disqualified.map((d) => (
              <div
                key={d.carrier.slug}
                style={{
                  padding: "0.75rem 0",
                  borderBottom: "1px solid var(--color-border)",
                  fontSize: "0.875rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <span style={{ fontWeight: 600 }}>{d.carrier.name}</span>
                  {d.disqualifyReasons.length === 1 && (
                    <span style={{ color: "var(--color-text-muted)", textAlign: "right" }}>{d.disqualifyReasons[0]}</span>
                  )}
                </div>
                {d.disqualifyReasons.length > 1 && (
                  <ul style={{ listStyle: "none", padding: 0, margin: "0.375rem 0 0 0" }}>
                    {d.disqualifyReasons.map((r, i) => (
                      <li key={i} style={{ color: "var(--color-text-muted)", padding: "0.125rem 0" }}>
                        &bull; {r}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        <p
          style={{
            marginTop: "2rem",
            padding: "1rem",
            background: "var(--color-bg-alt)",
            borderRadius: "var(--radius-md)",
            fontSize: "0.8125rem",
            color: "var(--color-text-muted)",
            lineHeight: 1.6,
          }}
        >
          These recommendations are based on published carrier requirements and your answers. Get quotes from at least 2-3 carriers
          before deciding — your specific premium depends on vehicle, driver, and state.
        </p>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
          <button className="btn btn-primary" onClick={restart} type="button">
            Start over
          </button>
        </div>
      </div>
    );
  }

  // Questions
  return (
    <div>
      <ProgressBar step={step} total={TOTAL_STEPS} />

      {/* Q1: Build type */}
      {step === 1 && (
        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "1rem" }}>What kind of build is it?</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {([
              ["factory", "Factory Class B", "Winnebago, Airstream, Thor, etc."],
              ["professional", "Professional custom build", "Built by a conversion shop"],
              ["diy", "DIY build", "Built by the owner"],
            ] as [BuildType, string, string][]).map(([value, label, desc]) => (
              <OptionCard key={value} selected={answers.buildType === value} onClick={() => update("buildType", value)}>
                <div style={{ fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginTop: "0.25rem" }}>{desc}</div>
              </OptionCard>
            ))}
          </div>
          <NavButtons onNext={next} nextDisabled={!answers.buildType} />
        </div>
      )}

      {/* Q2: Features */}
      {step === 2 && (
        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>Does your build have all of these?</h2>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
            Check everything that applies. Some carriers require specific features for RV classification.
            {answers.features.length === 0 && " It's fine if you don't have any yet."}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {FEATURE_LIST.map((f) => (
              <label
                key={f.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.75rem 1rem",
                  background: answers.features.includes(f.id) ? "var(--color-surface)" : "var(--color-bg)",
                  border: answers.features.includes(f.id) ? "2px solid var(--color-accent)" : "1px solid var(--color-border)",
                  borderRadius: "var(--radius-lg)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={answers.features.includes(f.id)}
                  onChange={() => toggleFeature(f.id)}
                  style={styles.checkbox}
                />
                <span style={{ fontWeight: 500 }}>{f.label}</span>
              </label>
            ))}
          </div>
          {answers.features.length > 0 && answers.features.length < 6 && (
            <p style={{ fontSize: "0.8125rem", color: "var(--color-text-subtle)", marginTop: "0.75rem" }}>
              {6 - answers.features.filter((f) => SIX_REQUIRED.includes(f)).length > 0
                ? `${6 - answers.features.filter((f) => SIX_REQUIRED.includes(f)).length} more feature${6 - answers.features.filter((f) => SIX_REQUIRED.includes(f)).length !== 1 ? "s" : ""} needed for Progressive's RV classification`
                : ""}
            </p>
          )}
          <NavButtons onBack={back} onNext={next} />
        </div>
      )}

      {/* Q3: State */}
      {step === 3 && (
        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>Where is the van garaged?</h2>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
            Some carriers have state restrictions, particularly in California.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <OptionCard selected={answers.state === "California"} onClick={() => update("state", "California")}>
              <div style={{ fontWeight: 600 }}>California</div>
            </OptionCard>
            <div>
              <div
                style={{
                  fontWeight: 600,
                  marginBottom: "0.5rem",
                  color: answers.state && answers.state !== "California" ? "var(--color-text)" : "var(--color-text-muted)",
                }}
              >
                Other US state
              </div>
              <select
                value={answers.state === "California" ? "" : answers.state}
                onChange={(e) => update("state", e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  border: "1px solid var(--color-border-strong)",
                  borderRadius: "var(--radius-md)",
                  background: "var(--color-bg)",
                  color: "var(--color-text)",
                  fontSize: "1rem",
                }}
              >
                <option value="">Select a state...</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <NavButtons onBack={back} onNext={next} nextDisabled={!answers.state} />
        </div>
      )}

      {/* Q4: Usage */}
      {step === 4 && (
        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "1rem" }}>How do you use the van?</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {([
              ["recreational", "Recreational", "Weekend trips, occasional travel"],
              ["fulltime", "Full-time", "Living in it as a primary residence"],
              ["rental", "Peer-to-peer rental", "Renting on Outdoorsy, RVshare, etc."],
            ] as [Usage, string, string][]).map(([value, label, desc]) => (
              <OptionCard key={value} selected={answers.usage === value} onClick={() => update("usage", value)}>
                <div style={{ fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginTop: "0.25rem" }}>{desc}</div>
              </OptionCard>
            ))}
          </div>
          <NavButtons onBack={back} onNext={next} nextDisabled={!answers.usage} />
        </div>
      )}

      {/* Q5: Only vehicle */}
      {step === 5 && (
        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "1rem" }}>Is this your only vehicle?</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <OptionCard selected={answers.onlyVehicle === true} onClick={() => update("onlyVehicle", true)}>
              <div style={{ fontWeight: 600 }}>Yes, it's my only vehicle</div>
            </OptionCard>
            <OptionCard selected={answers.onlyVehicle === false} onClick={() => update("onlyVehicle", false)}>
              <div style={{ fontWeight: 600 }}>No, I have another vehicle</div>
            </OptionCard>
          </div>
          <NavButtons onBack={back} onNext={next} nextDisabled={answers.onlyVehicle === null} />
        </div>
      )}

      {/* Q6: Existing insurance */}
      {step === 6 && (
        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            Do you have existing insurance or memberships with any of these?
          </h2>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
            Optional. Bundling can affect pricing.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {[
              ["Progressive", "Progressive auto or home policy"],
              ["State Farm", "State Farm auto or home policy"],
              ["Good Sam", "Good Sam / Camping World membership"],
            ].map(([id, label]) => (
              <label
                key={id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.75rem 1rem",
                  background: answers.existingInsurance.includes(id) ? "var(--color-surface)" : "var(--color-bg)",
                  border: answers.existingInsurance.includes(id) ? "2px solid var(--color-accent)" : "1px solid var(--color-border)",
                  borderRadius: "var(--radius-lg)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={answers.existingInsurance.includes(id)}
                  onChange={() => toggleInsurance(id)}
                  style={styles.checkbox}
                />
                <span style={{ fontWeight: 500 }}>{label}</span>
              </label>
            ))}
            <div
              role="button"
              tabIndex={0}
              onClick={() => update("existingInsurance", [])}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); update("existingInsurance", []); } }}
              style={{
                padding: "0.75rem 1rem",
                background: answers.existingInsurance.length === 0 ? "var(--color-surface)" : "var(--color-bg)",
                border: answers.existingInsurance.length === 0 ? "2px solid var(--color-accent)" : "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                cursor: "pointer",
                fontWeight: 500,
                textAlign: "center",
                color: "var(--color-text-muted)",
              }}
            >
              None of these
            </div>
          </div>
          <NavButtons onBack={back} onNext={next} nextLabel="See recommendations" />
        </div>
      )}
    </div>
  );
}

/* ── US States list ──────────────────────────────────────────────── */

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "Colorado", "Connecticut",
  "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana",
  "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts",
  "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska",
  "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York",
  "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania",
  "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah",
  "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
];
