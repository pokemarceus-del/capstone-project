export type NotificationChannel = 'EMAIL' | 'PORTAL';

export interface NotificationRecord {
  id: string;
  template: string;
  channel: NotificationChannel;
  recipient: string;
  status: 'QUEUED' | 'SENT' | 'FAILED';
  createdAt: string;
}
