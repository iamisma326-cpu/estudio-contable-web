/** Contratos de /api/admin/* (panel de administración). */

export interface Overview {
  users_total: number;
  users_banned: number;
  users_verified: number;
  admins: number;
  new_24h: number;
  new_7d: number;
  new_30d: number;
  active_sessions: number;
  logins_24h: number;
  logins_7d: number;
  resources_active: number;
  views_7d: number;
  profiles: number;
}

export interface StatsResponse {
  ok: boolean;
  overview: Overview;
  signups: { date: string; count: number }[];
  topResources: { id: string; title: string; views: number }[];
  recentUsers: {
    id: string;
    name: string;
    email: string;
    role: string;
    banned: boolean;
    createdAt: string;
  }[];
  recentActivity: { viewed_at: string; title: string | null; email: string | null }[];
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  createdAt: string;
  last_session_at: string | null;
  empresa: string | null;
  telefono: string | null;
}

export interface UsersResponse {
  ok: boolean;
  users: AdminUser[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface AdminResource {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  href: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface ResourcesResponse {
  ok: boolean;
  resources: AdminResource[];
}
