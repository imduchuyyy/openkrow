/**
 * Types for GPU pod management.
 */

export interface PodConfig {
  name: string;
  model: string;
  gpuType: "A100" | "H100" | "A10G" | "L40S";
  gpuCount: number;
  maxConcurrency?: number;
  region?: string;
  envVars?: Record<string, string>;
}

export interface PodStatus {
  id: string;
  name: string;
  status: "pending" | "running" | "stopped" | "error";
  model: string;
  gpuType: string;
  gpuCount: number;
  endpoint?: string;
  createdAt: number;
  uptimeSeconds?: number;
  requestsServed?: number;
}

export interface PodDeployment {
  id: string;
  config: PodConfig;
  status: PodStatus;
  logs: string[];
}
