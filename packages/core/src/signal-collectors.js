"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectBuildResult = collectBuildResult;
exports.collectTestResult = collectTestResult;
exports.collectCodeQuality = collectCodeQuality;
exports.collectWorkLogSignals = collectWorkLogSignals;
exports.collectProductFeedback = collectProductFeedback;
exports.collectGitHistory = collectGitHistory;
const node_crypto_1 = require("node:crypto");
function toWeight(value) {
    if (!Number.isFinite(value)) {
        return 0.5;
    }
    return Math.max(0.05, Math.min(1, value));
}
function createSignal(type, source, outcome, weight, metadata) {
    return {
        signalId: (0, node_crypto_1.randomUUID)(),
        type,
        source,
        outcome,
        weight: toWeight(weight),
        capturedAt: new Date().toISOString(),
        metadata
    };
}
function parseSlashPair(output) {
    const match = output.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) {
        return null;
    }
    const passed = Number(match[1]);
    const total = Number(match[2]);
    if (!Number.isFinite(passed) || !Number.isFinite(total)) {
        return null;
    }
    return { passed, total };
}
function collectBuildResult(buildOutput) {
    const hasFailure = /(error TS\d+|\bfailed\b|\berror\b)/i.test(buildOutput);
    const hasSuccess = /(build completed|compiled successfully|\b0 errors\b)/i.test(buildOutput);
    const outcome = hasFailure ? 'negative' : hasSuccess ? 'positive' : 'neutral';
    const weight = hasFailure ? 1 : hasSuccess ? 0.7 : 0.35;
    return createSignal('build', 'npm run build', outcome, weight, {
        hasFailure,
        hasSuccess
    });
}
function collectTestResult(testOutput, previousCount) {
    const slashPair = parseSlashPair(testOutput);
    const passingMatch = testOutput.match(/(\d+)\s+passing/i);
    const failingMatch = testOutput.match(/(\d+)\s+failing/i);
    const testsTotal = slashPair?.total ?? (passingMatch ? Number(passingMatch[1]) : 0);
    const testsPassed = slashPair?.passed ?? (passingMatch ? Number(passingMatch[1]) : 0);
    const testsFailed = failingMatch ? Number(failingMatch[1]) : Math.max(0, testsTotal - testsPassed);
    const testsDelta = testsTotal - previousCount;
    const outcome = testsFailed > 0 ? 'negative' : testsDelta >= 0 && testsTotal > 0 ? 'positive' : 'neutral';
    const weight = testsFailed > 0 ? 1 : testsDelta >= 0 ? 0.75 : 0.4;
    return createSignal('test', 'npm run test', outcome, weight, {
        testsTotal,
        testsPassed,
        testsFailed,
        testsDelta
    });
}
function collectCodeQuality(lintOutput, coveragePercent = 0) {
    const lintErrors = Number(lintOutput.match(/(\d+)\s+error/i)?.[1] ?? 0);
    const lintWarnings = Number(lintOutput.match(/(\d+)\s+warning/i)?.[1] ?? 0);
    const qualityScore = Math.max(0, Math.min(100, coveragePercent - lintErrors * 8 - lintWarnings * 2));
    const outcome = qualityScore >= 70 ? 'positive' : qualityScore >= 45 ? 'neutral' : 'negative';
    const weight = qualityScore >= 70 ? 0.7 : qualityScore >= 45 ? 0.45 : 0.9;
    return createSignal('quality', 'lint+coverage', outcome, weight, {
        coveragePercent,
        lintErrors,
        lintWarnings,
        qualityScore
    });
}
function collectWorkLogSignals(workLogContent, lookbackDays) {
    if (!workLogContent.trim()) {
        return [];
    }
    const now = Date.now();
    const windowMs = Math.max(1, lookbackDays) * 24 * 60 * 60 * 1000;
    const entries = workLogContent.match(/^##\s+\d{4}-\d{2}-\d{2}.*$/gm) ?? [];
    const recentEntries = entries.filter((line) => {
        const dateMatch = line.match(/\d{4}-\d{2}-\d{2}/);
        if (!dateMatch) {
            return false;
        }
        const ts = new Date(`${dateMatch[0]}T00:00:00.000Z`).getTime();
        return now - ts <= windowMs;
    });
    if (recentEntries.length === 0) {
        return [createSignal('work-log', 'agent/WORK_LOG.md', 'neutral', 0.2, { recentEntries: 0 })];
    }
    return recentEntries.map((entry) => {
        const lower = entry.toLowerCase();
        const outcome = lower.includes('blocked')
            ? 'negative'
            : lower.includes('done') || lower.includes('closed')
                ? 'positive'
                : 'neutral';
        return createSignal('work-log', 'agent/WORK_LOG.md', outcome, 0.35, {
            headline: entry.slice(0, 120)
        });
    });
}
function collectProductFeedback(feedbackRecords) {
    if (feedbackRecords.length === 0) {
        return [];
    }
    return feedbackRecords.map((record) => {
        const outcome = record.score >= 4 ? 'positive' : record.score <= 2 ? 'negative' : 'neutral';
        const weight = record.score >= 4 ? 0.65 : record.score <= 2 ? 0.85 : 0.4;
        return createSignal('feedback', 'feedback-record', outcome, weight, {
            profileId: record.profileId,
            target: record.target,
            score: record.score,
            accepted: Boolean(record.acceptedAt)
        });
    });
}
function collectGitHistory(history) {
    if (history.length === 0) {
        return [];
    }
    return history.map((snapshot) => {
        const churn = snapshot.insertions + snapshot.deletions;
        const outcome = snapshot.reverted ? 'negative' : churn <= 300 ? 'positive' : 'neutral';
        return createSignal('git-history', 'git log --numstat', outcome, snapshot.reverted ? 0.95 : 0.5, {
            insertions: snapshot.insertions,
            deletions: snapshot.deletions,
            reverted: Boolean(snapshot.reverted)
        });
    });
}
//# sourceMappingURL=signal-collectors.js.map