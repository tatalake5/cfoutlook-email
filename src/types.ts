// Worker environment bindings
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ADMIN_PASSWORD: string;
  COOKIE_SECRET: string;
  GPTMAIL_API_KEY?: string;
}

// Database row types
export interface SettingRow {
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
}

export interface GroupRow {
  id: number;
  name: string;
  description: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface AccountRow {
  id: number;
  email: string;
  client_id: string;
  refresh_token: string;
  password: string;
  group_id: number;
  remark: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TempEmailRow {
  id: number;
  email: string;
  source: string;
  remark: string;
  created_at: string;
  updated_at: string;
}

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
  };
}

// Graph API types
export interface GraphTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

export interface GraphMailMessage {
  id: string;
  subject: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  toRecipients: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
  }>;
  ccRecipients?: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
  }>;
  receivedDateTime: string;
  bodyPreview: string;
  isRead: boolean;
  hasAttachments: boolean;
  body?: {
    contentType: string;
    content: string;
  };
}
