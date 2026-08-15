export interface BaseModuleConfig {
  id: string;
  type: string;
  order: number;
  enabled: boolean;
  schema_version: number;
  config: any;
}
