export type Room = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
};

export type Asset = {
  id: string;
  room_id: string;
  title: string;
  description: string | null;
  current_version: string;
  image_url: string;
  created_at: string;
  updated_at: string;
  edited_by: string;
};

export type AssetTag = {
  id: string;
  asset_id: string;
  tag: string;
};

export type AssetVersion = {
  id: string;
  asset_id: string;
  version: string;
  prompt: string;
  image_url: string | null;
  output_type: "image" | "text";
  response_text: string | null;
  size: string;
  style: string;
  notes: string | null;
  editor: string;
  created_at: string;
};

export type Annotation = {
  id: number;
  asset_id: string;
  number: number;
  x_position: number;
  y_position: number;
  created_at: string;
};

export type Comment = {
  id: string;
  asset_id: string;
  author: string;
  avatar_url: string;
  content: string;
  created_at: string;
};

export type AssetWithTags = Asset & {
  tags: string[];
};

export type AssetFilter = "All" | "Images" | "Connectors" | "Kits";

export type GenerateInput = {
  title: string;
  prompt: string;
  style: string;
  size: string;
  notes: string;
  referenceFile: File | null;
  sourceImageUrl?: string | null;
  generationMode?: "force_image" | "image" | "auto";
};
