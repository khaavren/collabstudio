export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TeamRole = "admin" | "editor" | "viewer";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  contact_email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  logo_storage_path: string | null;
  created_at: string;
  updated_at: string;
};

export type TeamMember = {
  id: string;
  organization_id: string;
  user_id: string;
  role: TeamRole;
  created_at: string;
};

export type Room = {
  id: string;
  organization_id: string;
  name: string;
  created_at: string;
};

export type Asset = {
  id: string;
  organization_id: string;
  room_id: string | null;
  title: string;
  cover_storage_path: string | null;
  created_at: string;
  created_by: string | null;
};

export type AssetVersion = {
  id: string;
  organization_id: string;
  asset_id: string | null;
  version: number;
  prompt: string;
  params: Json;
  storage_path: string;
  created_at: string;
  created_by: string | null;
};

export type Comment = {
  id: string;
  organization_id: string;
  asset_version_id: string | null;
  body: string;
  x: number | null;
  y: number | null;
  created_at: string;
  created_by: string | null;
};

export type ApiSetting = {
  id: string;
  organization_id: string;
  provider: string | null;
  model: string | null;
  default_image_size: string | null;
  default_params: Json;
  encrypted_api_key: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type UsageMetric = {
  id: string;
  organization_id: string;
  month: string;
  images_generated: number;
  storage_used_mb: number;
  api_calls: number;
};

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: Organization;
        Insert: {
          id?: string;
          name: string;
          slug: string;
          website?: string | null;
          contact_email?: string | null;
          phone?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          country?: string | null;
          logo_storage_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          website?: string | null;
          contact_email?: string | null;
          phone?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          country?: string | null;
          logo_storage_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      team_members: {
        Row: TeamMember;
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role: TeamRole;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          role?: TeamRole;
          created_at?: string;
        };
        Relationships: [];
      };
      rooms: {
        Row: Room;
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      assets: {
        Row: Asset;
        Insert: {
          id?: string;
          organization_id: string;
          room_id?: string | null;
          title: string;
          cover_storage_path?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          room_id?: string | null;
          title?: string;
          cover_storage_path?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Relationships: [];
      };
      asset_versions: {
        Row: AssetVersion;
        Insert: {
          id?: string;
          organization_id: string;
          asset_id?: string | null;
          version: number;
          prompt: string;
          params?: Json;
          storage_path: string;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          asset_id?: string | null;
          version?: number;
          prompt?: string;
          params?: Json;
          storage_path?: string;
          created_at?: string;
          created_by?: string | null;
        };
        Relationships: [];
      };
      comments: {
        Row: Comment;
        Insert: {
          id?: string;
          organization_id: string;
          asset_version_id?: string | null;
          body: string;
          x?: number | null;
          y?: number | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          asset_version_id?: string | null;
          body?: string;
          x?: number | null;
          y?: number | null;
          created_at?: string;
          created_by?: string | null;
        };
        Relationships: [];
      };
      api_settings: {
        Row: ApiSetting;
        Insert: {
          id?: string;
          organization_id: string;
          provider?: string | null;
          model?: string | null;
          default_image_size?: string | null;
          default_params?: Json;
          encrypted_api_key?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          provider?: string | null;
          model?: string | null;
          default_image_size?: string | null;
          default_params?: Json;
          encrypted_api_key?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      usage_metrics: {
        Row: UsageMetric;
        Insert: {
          id?: string;
          organization_id: string;
          month: string;
          images_generated?: number;
          storage_used_mb?: number;
          api_calls?: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          month?: string;
          images_generated?: number;
          storage_used_mb?: number;
          api_calls?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type GeneratePayload = {
  title?: string;
  prompt: string;
  size: string;
  style?: string;
};

export type TeamMemberWithUser = TeamMember & {
  email: string | null;
};
