export interface User {
  name: string;
  pin: string;
  startTime?: string;
  endTime?: string;
  permissions: string[];
  createdAt: string;
}
