export interface APIResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}
