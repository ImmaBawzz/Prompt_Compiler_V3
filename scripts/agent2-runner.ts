const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const https = require('node:https');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite');

const SCHEMA_VERSION = 1;

const DDL = `
  CREATE TABLE IF NOT EXISTS agent2_cycles (
    cycle_id         TEXT PRIMARY KEY,
    started_at       TEXT NOT NULL,
    completed_at     TEXT NOT NULL,
    dry_run          INTEGER NOT NULL,
    signals_consumed INTEGER NOT NULL,
    actions_planned  INTEGER NOT NULL,
    actions_applied  INTEGER NOT NULL,
    cycle_json       TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_agent2_cycles_completed
    ON agent2_cycles(completed_at DESC);

  CREATE TABLE IF NOT EXISTS agent2_learning_signals (
    signal_id      TEXT PRIMARY KEY,
    cycle_id       TEXT NOT NULL,
    signal_type    TEXT NOT NULL,
    signal_source  TEXT NOT NULL,
    signal_outcome TEXT NOT NULL,
    signal_weight  REAL NOT NULL,
    captured_at    TEXT NOT NULL,
    signal_json    TEXT NOT NULL,
    FOREIGN KEY (cycle_id) REFERENCES agent2_cycles(cycle_id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_agent2_signals_cycle
    ON agent2_learning_signals(cycle_id, captured_at DESC);

  CREATE TABLE IF NOT EXISTS agent2_behavioral_weights (
    dimension       TEXT PRIMARY KEY,
    current_value   REAL NOT NULL,
    candidate_value REAL,
    status          TEXT NOT NULL,
    sample_count    INTEGER NOT NULL,
    updated_at      TEXT NOT NULL,
    weight_json     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent2_adaptations (
    adaptation_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle_id       TEXT NOT NULL,
    action_type    TEXT NOT NULL,
    target         TEXT NOT NULL,
    confidence     REAL NOT NULL,
    summary        TEXT NOT NULL,
    action_json    TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    FOREIGN KEY (cycle_id) REFERENCES agent2_cycles(cycle_id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_agent2_adaptations_cycle
    ON agent2_adaptations(cycle_id, created_at DESC);
`;

const DEFAULT_BEHAVIORAL_WEIGHTS = {
  'self-modification-threshold': 0.5,
  'code-change-confidence': 0.5,
  'test-first-priority': 0.5,
  'task-selection-breadth': 0.5,
  'git-push-eagerness': 0.5,
  'learning-cycle-frequency': 0.5,
  'shadow-eval-strictness': 0.5
};

function toIsoNow() {
  return new Date().toISOString();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function average(values) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function coefficientOfVariation(values) {
  if (values.length < 2) {
    return 0;
  }
  const mean = average(values);
  if (mean === 0) {
    return 0;
  }
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance) / mean;
}

function parseGitShortStat(output) {
  const filesMatch = output.match(/(\d+)\s+files?\s+changed/i);
  const insertionsMatch = output.match(/(\d+)\s+insertions?\(\+\)/i);
  const deletionsMatch = output.match(/(\d+)\s+deletions?\(-\)/i);
  return {
    filesChanged: Number(filesMatch?.[1] ?? 0),
    insertions: Number(insertionsMatch?.[1] ?? 0),
    deletions: Number(deletionsMatch?.[1] ?? 0)
  };
}

function parseSlashPair(output) {
  const match = output.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) {
    return null;
  }
  return {
    passed: Number(match[1]),
    total: Number(match[2])
  };
}

function parseModelResponse(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  try {
    return JSON.parse(candidate);
  } catch {
    return {
      filePath: 'UNPARSEABLE',
      patchSummary: 'GitHub Models returned non-JSON output.',
      suggestedCode: text.slice(0, 2000)
    };
  }
}

function runCommand(command, args) {
  const resolvedCommand = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command;
  const result = spawnSync(resolvedCommand, args, {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  const fallback =
    result.error && process.platform === 'win32' && resolvedCommand !== command
      ? spawnSync(command, args, { cwd: process.cwd(), encoding: 'utf8', shell: true })
      : result;

  return {
    ok: fallback.status === 0,
    output: `${fallback.stdout ?? ''}\n${fallback.stderr ?? ''}`.trim()
  };
}

async function callGithubModelsCodeWriter(promptInput) {
  const apiKey = process.env.GITHUB_MODELS_API_KEY;
  const enabled = process.env.AGENT2_ENABLE_CODEWRITER === 'true';
  if (!enabled || !apiKey) {
    return null;
  }

  const model = process.env.AGENT2_GH_MODEL || 'gpt-4o-mini';
  const endpoint = process.env.AGENT2_GH_MODELS_ENDPOINT || 'https://models.inference.ai.azure.com/chat/completions';
  const body = JSON.stringify({
    model,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content:
          'You are Agent2 code-writer. Return STRICT JSON with keys: filePath, patchSummary, suggestedCode. No markdown.'
      },
      {
        role: 'user',
        content: promptInput
      }
    ]
  });

  return await new Promise((resolve) => {
    const url = new URL(endpoint);
    const req = https.request(
      {
        method: 'POST',
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(body))
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          if ((res.statusCode ?? 500) >= 400) {
            resolve({
              provider: 'github-models',
              model,
              error: `HTTP ${res.statusCode}`,
              raw: data.slice(0, 1000)
            });
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const text = parsed?.choices?.[0]?.message?.content;
            if (typeof text !== 'string' || text.length === 0) {
              resolve({ provider: 'github-models', model, error: 'No completion text', raw: data.slice(0, 1000) });
              return;
            }
            resolve({ provider: 'github-models', model, ...parseModelResponse(text) });
          } catch {
            resolve({ provider: 'github-models', model, error: 'Failed to parse response', raw: data.slice(0, 1000) });
          }
        });
      }
    );
    req.on('error', (error) => {
      resolve({ provider: 'github-models', model, error: error.message });
    });
    req.write(body);
    req.end();
  });
}

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    singleCycle: argv.includes('--single-cycle'),
    skipChecks: argv.includes('--skip-checks')
  };
}

function getMemoryDbPath() {
  const configured = process.env.AGENT2_MEMORY_DB_PATH;
  if (configured && configured.length > 0) {
    return configured;
  }
  const dataDir = path.resolve(process.cwd(), '.agent2');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'agent2-memory.db');
}

function readWorkLog() {
  const workLogPath = path.resolve(process.cwd(), 'agent/WORK_LOG.md');
  if (!fs.existsSync(workLogPath)) {
    return '';
  }
  return fs.readFileSync(workLogPath, 'utf8');
}

function countRecentLogEntries(workLogContent) {
  if (!workLogContent.trim()) {
    return 0;
  }
  const entries = workLogContent.match(/^##\s+\d{4}-\d{2}-\d{2}.*$/gm) ?? [];
  return entries.length;
}

function parseTestsTotal(output) {
  const slashPair = parseSlashPair(output);
  if (slashPair) {
    return Number(slashPair.total);
  }
  const passing = output.match(/(\d+)\s+passing/i);
  return passing ? Number(passing[1]) : 0;
}

function createSignal(type, source, outcome, weight, metadata) {
  return {
    signalId: randomUUID(),
    type,
    source,
    outcome,
    weight: clamp(weight, 0.05, 1),
    capturedAt: toIsoNow(),
    metadata
  };
}

function collectSignals({ build, test, previousTestsTotal, workLogEntries }) {
  const buildFailure = /(error TS\d+|\bfailed\b|\berror\b)/i.test(build.output);
  const testPair = parseSlashPair(test.output);
  const testsTotal = parseTestsTotal(test.output);
  const testsFailed = Number(test.output.match(/(\d+)\s+failing/i)?.[1] ?? (testPair ? Math.max(0, testPair.total - testPair.passed) : 0));
  const testsDelta = testsTotal - previousTestsTotal;

  const gitStat = runCommand('git', ['diff', '--shortstat', 'HEAD~1..HEAD']);
  const git = parseGitShortStat(gitStat.output);

  const signals = [
    createSignal('build', 'npm run build', buildFailure ? 'negative' : 'positive', buildFailure ? 1 : 0.7, {
      passed: !buildFailure
    }),
    createSignal('test', 'npm run test', testsFailed > 0 ? 'negative' : 'positive', testsFailed > 0 ? 1 : 0.75, {
      testsTotal,
      testsFailed,
      testsDelta
    }),
    createSignal('work-log', 'agent/WORK_LOG.md', workLogEntries > 0 ? 'positive' : 'neutral', workLogEntries > 0 ? 0.35 : 0.2, {
      workLogEntries
    }),
    createSignal('git-history', 'git diff --shortstat HEAD~1..HEAD', git.filesChanged > 0 ? 'positive' : 'neutral', 0.5, {
      filesChanged: git.filesChanged,
      insertions: git.insertions,
      deletions: git.deletions
    })
  ];

  return {
    signals,
    testsTotal,
    testsDelta,
    testsFailed
  };
}

function createDefaultWeights(nowIso) {
  return Object.entries(DEFAULT_BEHAVIORAL_WEIGHTS).map(([dimension, currentValue]) => ({
    dimension,
    currentValue,
    candidateValue: null,
    status: 'active',
    sampleCount: 0,
    updatedAt: nowIso
  }));
}

function deriveBehavioralWeights(signals, currentWeights, opts) {
  const baseline = currentWeights.length > 0 ? currentWeights : createDefaultWeights(opts.nowIso);
  if (signals.length < opts.minSampleSize) {
    return baseline;
  }

  const deltaByDimension = new Map();
  for (const signal of signals) {
    const map = {
      build: 'code-change-confidence',
      test: 'test-first-priority',
      'work-log': 'task-selection-breadth',
      'git-history': 'git-push-eagerness'
    };
    const dimension = map[signal.type] || 'self-modification-threshold';
    const existing = deltaByDimension.get(dimension) ?? 0;
    const signalDelta = signal.outcome === 'positive' ? signal.weight * 0.04 : signal.outcome === 'negative' ? -signal.weight * 0.06 : 0;
    deltaByDimension.set(dimension, existing + signalDelta);
  }

  return baseline.map((weight) => {
    const elapsed = opts.nowTs - new Date(weight.updatedAt).getTime();
    if (Number.isFinite(elapsed) && elapsed < opts.cooldownMs) {
      return weight;
    }
    const rawDelta = deltaByDimension.get(weight.dimension) ?? 0;
    const boundedDelta = clamp(rawDelta, -opts.maxWeightDelta, opts.maxWeightDelta);
    const nextValue = round3(clamp(weight.currentValue + boundedDelta, 0.1, 0.9));
    return {
      ...weight,
      candidateValue: nextValue,
      currentValue: nextValue,
      status: 'active',
      sampleCount: weight.sampleCount + signals.length,
      updatedAt: opts.nowIso
    };
  });
}

function detectDivergence(cycles) {
  if (cycles.length < 10) {
    return false;
  }
  const lastTen = cycles.slice(0, 10).map((cycle) => Number(cycle.metrics?.selfEvalScore ?? 0));
  return coefficientOfVariation(lastTen) > 0.15;
}

function shadowEvaluateProposal(proposal, historicalCycles) {
  const recent = historicalCycles.slice(0, 5);
  const avgSelfEval = average(recent.map((cycle) => Number(cycle.metrics?.selfEvalScore ?? 0)));
  const avgBuildPass = average(recent.map((cycle) => (cycle.metrics?.buildPassed ? 1 : 0)));
  return round3(proposal.confidence * 0.6 + (avgSelfEval / 100) * 0.25 + avgBuildPass * 0.15);
}

function proposeDeterministicActions({ buildPassed, testsFailed, testsDelta }) {
  const actions = [];
  if (!buildPassed) {
    actions.push({
      actionType: 'write-code',
      target: 'packages/core/src',
      confidence: 0.72,
      summary: 'Resolve build failures from the latest cycle using deterministic diagnostics.',
      metadata: {
        source: 'rule-engine',
        reason: 'build-failed'
      }
    });
  }
  if (testsFailed > 0 || testsDelta < 0) {
    actions.push({
      actionType: 'add-task',
      target: 'agent/TASK_BOARD.json',
      confidence: 0.66,
      summary: 'Prioritize test stabilization after regressions were detected.',
      metadata: {
        source: 'rule-engine',
        reason: 'test-regression'
      }
    });
  }
  if (buildPassed && testsFailed === 0) {
    actions.push({
      actionType: 'modify-rule',
      target: 'agent2/AGENT2_RULES.md',
      confidence: 0.67,
      summary: 'Tune deterministic safety rule thresholds after stable cycle.',
      metadata: {
        source: 'rule-engine',
        reason: 'stability-tune'
      }
    });
  }
  return actions;
}

function passesPromotionGates({
  proposal,
  shadowScore,
  buildPassed,
  testPassed,
  divergence,
  cooldownSatisfied,
  minConfidence
}) {
  if (!buildPassed || !testPassed) {
    return false;
  }
  if (!cooldownSatisfied) {
    return false;
  }
  if (divergence) {
    return false;
  }
  if (proposal.confidence < minConfidence) {
    return false;
  }
  if (shadowScore < minConfidence) {
    return false;
  }
  return true;
}

function openMemoryStore(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec(DDL);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);

  const stmtInsertCycle = db.prepare(`
    INSERT OR REPLACE INTO agent2_cycles (
      cycle_id, started_at, completed_at, dry_run, signals_consumed, actions_planned, actions_applied, cycle_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const stmtRecent = db.prepare(`
    SELECT cycle_json
    FROM agent2_cycles
    ORDER BY completed_at DESC
    LIMIT ?
  `);

  const stmtLast = db.prepare(`
    SELECT completed_at
    FROM agent2_cycles
    ORDER BY completed_at DESC
    LIMIT 1
  `);

  const stmtInsertSignal = db.prepare(`
    INSERT OR REPLACE INTO agent2_learning_signals (
      signal_id, cycle_id, signal_type, signal_source, signal_outcome, signal_weight, captured_at, signal_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const stmtUpsertWeight = db.prepare(`
    INSERT INTO agent2_behavioral_weights (
      dimension, current_value, candidate_value, status, sample_count, updated_at, weight_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(dimension) DO UPDATE SET
      current_value = excluded.current_value,
      candidate_value = excluded.candidate_value,
      status = excluded.status,
      sample_count = excluded.sample_count,
      updated_at = excluded.updated_at,
      weight_json = excluded.weight_json
  `);

  const stmtListWeights = db.prepare(`
    SELECT weight_json
    FROM agent2_behavioral_weights
    ORDER BY dimension ASC
  `);

  const stmtInsertAdaptation = db.prepare(`
    INSERT INTO agent2_adaptations (
      cycle_id, action_type, target, confidence, summary, action_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  return {
    listRecentCycles(limit = 10) {
      const rows = stmtRecent.all(limit);
      const cycles = [];
      for (const row of rows) {
        const raw = row['cycle_json'];
        if (typeof raw !== 'string') {
          continue;
        }
        try {
          cycles.push(JSON.parse(raw));
        } catch {
          continue;
        }
      }
      return cycles;
    },
    getLastCompletedCycleAt() {
      const row = stmtLast.get();
      return typeof row?.completed_at === 'string' ? row.completed_at : null;
    },
    appendCycle(cycle) {
      stmtInsertCycle.run(
        cycle.cycleId,
        cycle.startedAt,
        cycle.completedAt,
        cycle.dryRun ? 1 : 0,
        cycle.signalsConsumed,
        cycle.actionsPlanned,
        cycle.actionsApplied,
        JSON.stringify(cycle)
      );
    },
    appendSignals(cycleId, signals) {
      for (const signal of signals) {
        stmtInsertSignal.run(
          signal.signalId,
          cycleId,
          signal.type,
          signal.source,
          signal.outcome,
          signal.weight,
          signal.capturedAt,
          JSON.stringify(signal)
        );
      }
    },
    listBehavioralWeights() {
      const rows = stmtListWeights.all();
      const weights = [];
      for (const row of rows) {
        const raw = row['weight_json'];
        if (typeof raw !== 'string') {
          continue;
        }
        try {
          weights.push(JSON.parse(raw));
        } catch {
          continue;
        }
      }
      return weights;
    },
    upsertBehavioralWeights(weights) {
      for (const weight of weights) {
        stmtUpsertWeight.run(
          weight.dimension,
          weight.currentValue,
          weight.candidateValue ?? null,
          weight.status,
          weight.sampleCount,
          weight.updatedAt,
          JSON.stringify(weight)
        );
      }
    },
    appendAdaptations(cycleId, actions) {
      const now = toIsoNow();
      for (const action of actions) {
        stmtInsertAdaptation.run(
          cycleId,
          action.actionType,
          action.target,
          action.confidence,
          action.summary,
          JSON.stringify(action),
          now
        );
      }
    },
    close() {
      db.close();
    }
  };
}

async function runSingleCycle(options) {
  const dbPath = getMemoryDbPath();
  const store = openMemoryStore(dbPath);

  try {
    const recentCycles = store.listRecentCycles(20);
    const previous = recentCycles[0];
    const previousTestsTotal = previous?.metrics?.testsTotal ?? 0;
    const previousCompletedAt = previous?.completedAt ? new Date(previous.completedAt).getTime() : 0;
    const nowIso = toIsoNow();
    const nowTs = new Date(nowIso).getTime();

    const cooldownMs = Number(process.env.AGENT2_COOLDOWN_MS ?? 10 * 60 * 1000);
    const maxWeightDelta = Number(process.env.AGENT2_MAX_WEIGHT_DELTA ?? 0.1);
    const minSampleSize = Number(process.env.AGENT2_MIN_SAMPLE_SIZE ?? 2);
    const minConfidence = Number(process.env.AGENT2_PROMOTION_MIN_CONFIDENCE ?? 0.65);
    const cooldownSatisfied = previousCompletedAt === 0 ? true : nowTs - previousCompletedAt >= cooldownMs;

    const startedAt = nowIso;
    const shouldRunChecks = !options.dryRun && !options.skipChecks;
    const build = shouldRunChecks ? runCommand('npm', ['run', 'build']) : { ok: true, output: 'skipped' };
    const test = shouldRunChecks ? runCommand('npm', ['run', 'test']) : { ok: true, output: 'skipped' };
    const workLogEntries = countRecentLogEntries(readWorkLog());
    const signalData = collectSignals({
      build,
      test,
      previousTestsTotal,
      workLogEntries
    });

    const storedWeights = store.listBehavioralWeights();
    const nextWeights = deriveBehavioralWeights(signalData.signals, storedWeights, {
      nowIso,
      nowTs,
      maxWeightDelta,
      minSampleSize,
      cooldownMs
    });

    const divergence = detectDivergence(recentCycles);
    const deterministicActions = proposeDeterministicActions({
      buildPassed: build.ok,
      testsFailed: signalData.testsFailed,
      testsDelta: signalData.testsDelta
    });

    const promotedActions = [];
    for (const proposal of deterministicActions) {
      const shadowScore = shadowEvaluateProposal(proposal, recentCycles);
      if (
        passesPromotionGates({
          proposal,
          shadowScore,
          buildPassed: build.ok,
          testPassed: test.ok,
          divergence,
          cooldownSatisfied,
          minConfidence
        })
      ) {
        promotedActions.push({
          ...proposal,
          metadata: {
            ...(proposal.metadata ?? {}),
            shadowScore,
            promotionGate: 'passed'
          }
        });
      }
    }

    if (build.ok && test.ok && !divergence) {
      for (const action of promotedActions) {
        if (action.actionType !== 'write-code') {
          continue;
        }
        const modelOutput = await callGithubModelsCodeWriter(
          `Workspace: ${process.cwd()}\nAction Summary: ${action.summary}\n` +
            `Return JSON with filePath, patchSummary, suggestedCode for a conservative code improvement.`
        );
        if (modelOutput) {
          action.afterContent = JSON.stringify(modelOutput, null, 2);
          action.metadata = {
            ...(action.metadata ?? {}),
            codeWriter: 'github-models',
            model: modelOutput.model ?? 'unknown',
            used: !modelOutput.error
          };
        }
      }

      // --- Phase progression integration ---
      try {
        // Dynamically import phase-evaluator.mjs
        const { evaluatePhaseProgression } = await import(path.resolve(process.cwd(), 'scripts/phase-evaluator.mjs'));
        const phaseResult = evaluatePhaseProgression();
        if (phaseResult.eligible && phaseResult.nextPhaseId) {
          // Load and update TASK_BOARD.json
          const taskBoardPath = path.resolve(process.cwd(), 'agent/TASK_BOARD.json');
          const board = JSON.parse(fs.readFileSync(taskBoardPath, 'utf8'));
          const prevPhase = board.currentPhase;
          board.currentPhase = phaseResult.nextPhaseId;
          if (!board.phaseEvidence) board.phaseEvidence = {};
          board.phaseEvidence[phaseResult.nextPhaseId] = {
            advancedAt: toIsoNow(),
            fromPhase: prevPhase,
            rationale: 'All tasks done and gates passed (auto-advanced by Agent2)',
            cycleId: previous?.cycleId || null
          };
          fs.writeFileSync(taskBoardPath, JSON.stringify(board, null, 2));
        }
      } catch (err) {
        // Log but do not fail the cycle if phase progression fails
        console.error('[Agent2] Phase progression check failed:', err);
      }
      // --- End phase progression integration ---
    }

    const cycle = {
      cycleId: randomUUID(),
      startedAt,
      completedAt: toIsoNow(),
      dryRun: options.dryRun,
      signalsConsumed: signalData.signals.length,
      actionsPlanned: deterministicActions.length,
      actionsApplied: promotedActions.length,
      metrics: {
        buildPassed: build.ok,
        testPassed: test.ok,
        testsTotal: signalData.testsTotal,
        testsDelta: signalData.testsDelta,
        qualityScore: build.ok && test.ok ? 80 : 35,
        selfEvalScore: build.ok && test.ok ? 75 : 42
      },
      metadata: {
        workLogEntries,
        divergence,
        cooldownSatisfied,
        guardrails: {
          deterministicSelfModification: true,
          llmOnlyForCodeWriting: true
        }
      }
    };

    if (!options.dryRun) {
      store.appendCycle(cycle);
      store.appendSignals(cycle.cycleId, signalData.signals);
      store.upsertBehavioralWeights(nextWeights);
      store.appendAdaptations(cycle.cycleId, promotedActions);
    }

    return {
      cycle,
      dbPath,
      lastCompletedAt: store.getLastCompletedCycleAt(),
      divergence,
      cooldownSatisfied,
      promotedActions
    };
  } finally {
    store.close();
  }
}

function run() {
  const options = parseArgs(process.argv.slice(2));
  const intervalMs = Number(process.env.AGENT2_CYCLE_INTERVAL_MS ?? 20 * 60 * 1000);

  const execute = async () => {
    const result = await runSingleCycle(options);
    console.log(
      JSON.stringify(
        {
          cycleId: result.cycle.cycleId,
          dbPath: result.dbPath,
          buildPassed: result.cycle.metrics.buildPassed,
          testPassed: result.cycle.metrics.testPassed,
          testsTotal: result.cycle.metrics.testsTotal,
          testsDelta: result.cycle.metrics.testsDelta,
          actionsPlanned: result.cycle.actionsPlanned,
          actionsApplied: result.cycle.actionsApplied,
          divergence: result.divergence,
          cooldownSatisfied: result.cooldownSatisfied,
          promotedActions: result.promotedActions.map((action) => ({
            actionType: action.actionType,
            target: action.target,
            confidence: action.confidence,
            usedGithubModels: Boolean(action.metadata?.codeWriter === 'github-models' && action.metadata?.used)
          })),
          dryRun: result.cycle.dryRun,
          lastCompletedAt: result.lastCompletedAt
        },
        null,
        2
      )
    );
  };

  void execute();
  if (!options.singleCycle) {
    setInterval(() => {
      void execute();
    }, intervalMs);
  }
}

run();
