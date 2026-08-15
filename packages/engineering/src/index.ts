export {
  reviewChanges,
  parseUnifiedDiff,
  type ReviewFinding,
  type DiffHunk,
} from "./review.js";

export {
  inspectGit,
  gitLog,
  gitDiff,
  gitBranches,
  gitBlame,
  gitShow,
  type GitStatus,
} from "./git.js";

export {
  findDependencyCycles,
  findUnusedExportCandidates,
  findUnusedSymbols,
  findImportSccs,
  type UnusedCandidate,
} from "./deps.js";

export {
  runTests,
  runBuild,
  runValidate,
  analyzeChanges,
  findBrokenDocCommands,
  analyzeApiCompatibility,
  ensurePackageManager,
  type TestRunResult,
  type ValidateReport,
} from "./ops.js";

export {
  buildHealthReport,
  runDoctor,
  type HealthReport,
  type DoctorFinding,
} from "./health.js";

export {
  scanSecretPatterns,
  storeSecretScanFindings,
  type SecretFinding,
  type SecretScanResult,
} from "./security.js";

export {
  parseStacktrace,
  investigateStacktrace,
  type StackFrame,
  type StackSuspect,
  type StackInvestigation,
} from "./debug.js";

export {
  explainCommand,
  detectPackageScripts,
  type CommandToken,
  type CommandExplanation,
  type DetectedScript,
} from "./command.js";

export {
  parseCodeowners,
  matchCodeownersPattern,
  ownersForPath,
  uncoveredByCodeowners,
  symbolBlameHistory,
  mapWorkspace,
  workspacePackageInfo,
  workspaceCrossDeps,
  adaptersStatus,
  adapterForFilePath,
  findDuplicateImports,
  findHeavyImports,
  findSensitiveFiles,
  findInsecureConfig,
  findEnvUsage,
  findEnvMissing,
  findDbMigrations,
  findDbModels,
  ciLocalEquivalent,
  releaseUncommitted,
  detectReleaseVersion,
  searchDocs,
  searchUnified,
  classifyCommandRisk,
  rulesApplicable,
  generateRuleStub,
  type CodeOwnerRule,
  type WorkspacePackage,
  type RiskLevel,
} from "./agent-tools.js";
