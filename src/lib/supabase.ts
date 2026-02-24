import { createClient } from "@supabase/supabase-js";
import type { PostgrestError } from "@supabase/supabase-js";
import type {
  Annotation,
  Asset,
  AssetTag,
  AssetVersion,
  Comment,
  Room
} from "@/lib/types";
import { hashSeed, placeholderUrl, safeVersionNumber } from "@/lib/utils";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Prevent hard crashes when env vars are missing in production builds.
const fallbackSupabaseUrl = "https://example.supabase.co";
const fallbackSupabaseAnonKey = "public-anon-key-placeholder";

export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : fallbackSupabaseUrl,
  isSupabaseConfigured ? supabaseAnonKey : fallbackSupabaseAnonKey
);

function toUserErrorMessage(error: PostgrestError | Error) {
  const message = error.message ?? "";
  const code = "code" in error ? error.code : undefined;

  if (code === "42501" || message.toLowerCase().includes("row-level security")) {
    return "Write access is blocked. Enable Supabase Anonymous auth, then retry.";
  }

  if (code === "23505") {
    return "That room name already exists. Try a different name.";
  }

  return message || "Unexpected Supabase error.";
}

export async function ensureAnonSession() {
  if (!isSupabaseConfigured) return;

  const { data } = await supabase.auth.getSession();
  if (data.session) return;

  const { error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw new Error(
      "Anonymous sign-in failed. Enable Auth > Providers > Anonymous in Supabase."
    );
  }
}

export async function fetchRooms() {
  const { data, error } = await supabase.from("rooms").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as Room[];
}

export async function createRoom(name: string, slug: string) {
  const baseSlug = slug;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidateSlug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;

    const { data, error } = await supabase
      .from("rooms")
      .insert({ name, slug: candidateSlug })
      .select("*")
      .single();

    if (!error && data) {
      return data as Room;
    }

    if (error?.code === "23505") {
      continue;
    }

    throw new Error(toUserErrorMessage(error ?? new Error("Unable to create room.")));
  }

  throw new Error("Unable to create room after multiple slug attempts.");
}

export async function fetchAssetsForRoom(roomId: string) {
  const { data: assets, error: assetsError } = await supabase
    .from("assets")
    .select("*")
    .eq("room_id", roomId)
    .order("updated_at", { ascending: false });

  if (assetsError) throw new Error(toUserErrorMessage(assetsError));

  const assetRows = (assets ?? []) as Asset[];
  if (assetRows.length === 0) return [];

  const assetIds = assetRows.map((asset) => asset.id);
  const { data: tags, error: tagsError } = await supabase
    .from("asset_tags")
    .select("*")
    .in("asset_id", assetIds);

  if (tagsError) throw new Error(toUserErrorMessage(tagsError));

  const tagsByAsset = new Map<string, string[]>();
  (tags as AssetTag[]).forEach((entry) => {
    const current = tagsByAsset.get(entry.asset_id) ?? [];
    current.push(entry.tag);
    tagsByAsset.set(entry.asset_id, current);
  });

  return assetRows.map((asset) => ({
    ...asset,
    tags: tagsByAsset.get(asset.id) ?? []
  }));
}

export async function fetchAssetDetails(assetId: string) {
  const [versionsQuery, annotationsQuery, commentsQuery] = await Promise.all([
    supabase
      .from("asset_versions")
      .select("*")
      .eq("asset_id", assetId)
      .order("created_at", { ascending: false }),
    supabase
      .from("annotations")
      .select("*")
      .eq("asset_id", assetId)
      .order("number", { ascending: true }),
    supabase
      .from("comments")
      .select("*")
      .eq("asset_id", assetId)
      .order("created_at", { ascending: true })
  ]);

  if (versionsQuery.error) throw new Error(toUserErrorMessage(versionsQuery.error));
  if (annotationsQuery.error) throw new Error(toUserErrorMessage(annotationsQuery.error));
  if (commentsQuery.error) throw new Error(toUserErrorMessage(commentsQuery.error));

  return {
    versions: (versionsQuery.data ?? []) as AssetVersion[],
    annotations: (annotationsQuery.data ?? []) as Annotation[],
    comments: (commentsQuery.data ?? []) as Comment[]
  };
}

async function uploadImageToStorage(prompt: string, size: string, file?: File | null) {
  const blob = file
    ? file
    : await fetch(placeholderUrl(prompt, size)).then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to generate placeholder image.");
        }

        return response.blob();
      });

  const filename = `${crypto.randomUUID()}.jpg`;

  const { error } = await supabase.storage.from("asset-images").upload(filename, blob, {
    contentType: blob.type || "image/jpeg",
    upsert: true
  });

  if (error) throw new Error(toUserErrorMessage(error));

  const { data } = supabase.storage.from("asset-images").getPublicUrl(filename);
  return data.publicUrl;
}

function inferTags(style: string, title: string) {
  const tags = ["Prototype", style];
  const lowerTitle = title.toLowerCase();

  if (lowerTitle.includes("clip") || lowerTitle.includes("connector")) tags.push("Connector");
  if (lowerTitle.includes("kit")) tags.push("Kit");
  if (lowerTitle.includes("hard hat")) tags.push("Industrial");

  tags.push(`W${Math.abs(Number.parseInt(hashSeed(title), 36) % 100)}`);
  return [...new Set(tags)];
}

export async function generateAssetVersion(options: {
  activeAsset?: Asset;
  editor: string;
  roomId: string;
  title: string;
  prompt: string;
  size: string;
  style: string;
  notes: string;
  referenceFile: File | null;
}) {
  const {
    activeAsset,
    editor,
    notes,
    prompt,
    referenceFile,
    roomId,
    size,
    style,
    title
  } = options;

  const imageUrl = await uploadImageToStorage(prompt, size, referenceFile);

  let asset = activeAsset;

  if (!asset) {
    const initialVersion = "v1";
    const { data: createdAsset, error: assetError } = await supabase
      .from("assets")
      .insert({
        room_id: roomId,
        title,
        current_version: initialVersion,
        image_url: imageUrl,
        edited_by: editor
      })
      .select("*")
      .single();

    if (assetError || !createdAsset) {
      throw new Error(toUserErrorMessage(assetError ?? new Error("Unable to create asset.")));
    }

    asset = createdAsset as Asset;

    const tags = inferTags(style, title).map((tag) => ({ asset_id: createdAsset.id, tag }));
    const { error: tagsError } = await supabase.from("asset_tags").insert(tags);
    if (tagsError) throw new Error(toUserErrorMessage(tagsError));
  }

  if (!asset) {
    throw new Error("Unable to resolve asset for version generation.");
  }

  const { data: latestVersion, error: latestError } = await supabase
    .from("asset_versions")
    .select("version")
    .eq("asset_id", asset.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) throw new Error(toUserErrorMessage(latestError));

  const nextVersionNumber = safeVersionNumber(latestVersion?.version ?? "v0") + 1;
  const nextVersion = `v${nextVersionNumber}`;

  const { error: versionError } = await supabase.from("asset_versions").insert({
    asset_id: asset.id,
    version: nextVersion,
    prompt,
    size,
    style,
    notes: notes || null,
    editor
  });

  if (versionError) throw new Error(toUserErrorMessage(versionError));

  const { error: updateError } = await supabase
    .from("assets")
    .update({
      title,
      current_version: nextVersion,
      image_url: imageUrl,
      edited_by: editor,
      updated_at: new Date().toISOString()
    })
    .eq("id", asset.id);

  if (updateError) throw new Error(toUserErrorMessage(updateError));

  return asset.id;
}

export async function addComment(assetId: string, author: string, content: string) {
  const { error } = await supabase.from("comments").insert({
    asset_id: assetId,
    author,
    avatar_url: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(author)}`,
    content
  });

  if (error) throw new Error(toUserErrorMessage(error));
}
