export type Row = Record<string, any>;
export interface SQL {
  query: (
    text: string,
    params?: any[],
  ) => Promise<{ rows: Row[]; rowCount?: number | null }>;
}
export interface Database extends SQL {
  transaction: <T>(fn: (sql: SQL) => Promise<T>) => Promise<T>;
}
