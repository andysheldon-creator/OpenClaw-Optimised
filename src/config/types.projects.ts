export type ProjectConfig = {
  /** Unique project identifier (e.g., "backend-api"). */
  id: string;
  /** Human-readable project name (e.g., "Backend API Service"). */
  name: string;
  /** Slack channels mapped to this project (e.g., ["#backend", "#api-bugs"]). */
  channels?: string[];
  /** External source directories/files to index (e.g., ["/repos/api-service/docs"]). */
  sources?: string[];
  /** Keywords for context detection hints (e.g., ["api", "endpoints"]). */
  keywords?: string[];
};

export type ProjectsConfig = {
  /** List of project definitions. */
  list?: ProjectConfig[];
  /** Default project ID when no channel mapping matches. */
  defaultProject?: string;
};
