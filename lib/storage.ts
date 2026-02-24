import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

export const BANDJOES_BUCKET = "bandjoes-assets";

export function getPublicAssetUrl(
  supabase: SupabaseClient<Database>,
  storagePath: string | null
) {
  if (!storagePath) return null;
  const { data } = supabase.storage.from(BANDJOES_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function uploadFetchedImageToStorage({
  supabase,
  imageUrl,
  organizationId,
  roomId,
  assetId,
  version
}: {
  supabase: SupabaseClient<Database>;
  imageUrl: string;
  organizationId: string;
  roomId: string;
  assetId: string;
  version: number;
}) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error("Failed to fetch placeholder image before upload.");
  }

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const blob = await response.blob();
  const extension = contentType.includes("png") ? "png" : "jpg";
  const storagePath = `orgs/${organizationId}/rooms/${roomId}/assets/${assetId}/v${version}-${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from(BANDJOES_BUCKET)
    .upload(storagePath, blob, {
      contentType,
      upsert: true
    });

  if (error) {
    throw new Error(error.message);
  }

  return {
    storagePath,
    publicUrl: getPublicAssetUrl(supabase, storagePath)
  };
}
