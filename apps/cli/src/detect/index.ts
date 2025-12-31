// Export monorepo patterns first (no dependencies)
export {
  detectMonorepoConfig,
  expandPatternsForMonorepo,
  getIncludePatternsForFramework,
  isMonorepo,
  getMonorepoDescription,
  type MonorepoConfig,
  type ExpandedPatterns,
} from './monorepo-patterns.js';

// Then project detector (depends on monorepo-patterns)
export {
  ProjectDetector,
  getDetectionSummary,
  type DetectedProject,
  type FrameworkInfo,
  type ComponentLocation,
  type TokenLocation,
  type StorybookInfo,
  type DesignSystemInfo,
  type MonorepoInfo,
} from './project-detector.js';

export * from './frameworks.js';
