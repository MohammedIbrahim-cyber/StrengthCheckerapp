const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const EXPOSURES = {
  mild: {
    key: "mild",
    label: "Mild (RCC)",
    maxWc: 0.55,
    minCement: 300,
    minGradeFck: 20,
  },
  moderate: {
    key: "moderate",
    label: "Moderate (RCC)",
    maxWc: 0.5,
    minCement: 300,
    minGradeFck: 25,
  },
  severe: {
    key: "severe",
    label: "Severe (RCC)",
    maxWc: 0.45,
    minCement: 320,
    minGradeFck: 30,
  },
  verySevere: {
    key: "verySevere",
    label: "Very Severe (RCC)",
    maxWc: 0.45,
    minCement: 340,
    minGradeFck: 35,
  },
  extreme: {
    key: "extreme",
    label: "Extreme (RCC)",
    maxWc: 0.4,
    minCement: 360,
    minGradeFck: 40,
  },
};

function round(value, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// In-memory store (prototype)
let RUNS = [];
let NEXT_ID = 1;

function computeMixDesign(fck, exposureKey) {
  const x = Number(fck);
  if (!x || Number.isNaN(x) || x <= 0) return null;

  const limits = EXPOSURES[exposureKey] || EXPOSURES.mild;

  const fckMean = -0.0035 * x * x + 1.3074 * x + 1.6883;
  const w_c = 9e-06 * x * x - 0.0044 * x + 0.5617;
  const water = -0.0107 * x * x - 0.0941 * x + 195.56;
  const cement = -0.0308 * x * x + 4.7223 * x + 298.78;
  const fineAgg = -0.1156 * x * x + 10.473 * x + 484.42;
  const coarseAgg = 0.0335 * x * x - 5.2723 * x + 1234.4;

  const isWcOk = w_c <= limits.maxWc;
  const isCementOk = cement >= limits.minCement;
  const isGradeOk = x >= limits.minGradeFck;

  return {
    fckMean: round(fckMean, 2),
    w_c: round(w_c, 3),
    water: round(water, 2),
    cement: round(cement, 2),
    fineAgg: round(fineAgg, 2),
    coarseAgg: round(coarseAgg, 2),
    checks: {
      isWcOk,
      isCementOk,
      isGradeOk,
      limits,
    },
  };
}

// POST /api/mix-design – compute + store run with project info
app.post("/api/mix-design", (req, res) => {
  const {
    fck,
    cementGrade,
    exposure,
    projectName,
    projectSite,
    mixId,
    castingDate,
  } = req.body || {};

  if (!fck) {
    return res.status(400).json({
      success: false,
      message: "fck is required",
    });
  }

  const result = computeMixDesign(fck, exposure);
  if (!result) {
    return res.status(400).json({
      success: false,
      message: "Invalid fck value",
    });
  }

  const expCfg = EXPOSURES[exposure] || EXPOSURES.mild;

  const run = {
    id: NEXT_ID++,
    timestamp: new Date().toISOString(),
    project: {
      projectName: projectName || "",
      projectSite: projectSite || "",
      mixId: mixId || `MIX-${String(NEXT_ID - 1).padStart(3, "0")}`,
      castingDate:
        castingDate || new Date().toISOString().slice(0, 10), // yyyy-mm-dd
    },
    input: {
      fck: Number(fck),
      cementGrade: cementGrade || null,
      exposure: expCfg.key,
    },
    result,
  };

  RUNS.push(run);

  return res.json({
    success: true,
    data: run,
  });
});

// GET /api/mix-design/runs – list history (latest first)
app.get("/api/mix-design/runs", (req, res) => {
  const sorted = [...RUNS].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );
  res.json({
    success: true,
    count: sorted.length,
    data: sorted,
  });
});

// GET /api/mix-design/export.csv – CSV export including project info
app.get("/api/mix-design/export.csv", (req, res) => {
  const header = [
    "id",
    "timestamp",
    "projectName",
    "projectSite",
    "mixId",
    "castingDate",
    "fck",
    "cementGrade",
    "exposure",
    "fckMean",
    "w_c",
    "water",
    "cement",
    "fineAgg",
    "coarseAgg",
    "isWcOk",
    "isCementOk",
    "isGradeOk",
  ].join(",");

  const rows = RUNS.map((run) => {
    const { id, timestamp, project, input, result } = run;
    const {
      fckMean,
      w_c,
      water,
      cement,
      fineAgg,
      coarseAgg,
      checks,
    } = result;

    return [
      id,
      timestamp,
      (project.projectName || "").replace(/,/g, " "),
      (project.projectSite || "").replace(/,/g, " "),
      (project.mixId || "").replace(/,/g, " "),
      project.castingDate || "",
      input.fck,
      input.cementGrade,
      input.exposure,
      fckMean,
      w_c,
      water,
      cement,
      fineAgg,
      coarseAgg,
      checks.isWcOk,
      checks.isCementOk,
      checks.isGradeOk,
    ].join(",");
  });

  const csv = [header, ...rows].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="mix_design_runs.csv"'
  );
  res.send(csv);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Mix Design API running on http://localhost:${PORT}`);
});
