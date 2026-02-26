import { createClient } from "@supabase/supabase-js";
import type { PostgrestError, User } from "@supabase/supabase-js";
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

export type ActorProfile = {
  displayName: string;
  avatarUrl: string;
  email: string | null;
  userId: string | null;
};

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

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

function resolveActorDisplayName(user: User | null) {
  if (!user) return "Guest";

  const metadata = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  const emailHandle = typeof user.email === "string" ? user.email.split("@")[0] : null;

  const configuredName = firstNonEmptyString(
    (metadata as Record<string, unknown>).full_name,
    (metadata as Record<string, unknown>).name,
    (metadata as Record<string, unknown>).display_name,
    (metadata as Record<string, unknown>).preferred_username,
    emailHandle
  );

  if (configuredName) return configuredName;

  if (user.is_anonymous) {
    return `Anonymous ${user.id.slice(0, 6)}`;
  }

  return `User ${user.id.slice(0, 8)}`;
}

function resolveActorAvatar(user: User | null, displayName: string) {
  if (user?.user_metadata && typeof user.user_metadata === "object") {
    const avatar = (user.user_metadata as Record<string, unknown>).avatar_url;
    if (typeof avatar === "string" && avatar.trim().length > 0) {
      return avatar;
    }
  }

  const seed = user?.id ?? displayName;
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}`;
}

export async function getCurrentActorProfile(): Promise<ActorProfile> {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  const user = session?.user ?? null;
  const displayName = resolveActorDisplayName(user);

  return {
    displayName,
    avatarUrl: resolveActorAvatar(user, displayName),
    email: user?.email ?? null,
    userId: user?.id ?? null
  };
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

export async function updateRoomName(roomId: string, name: string) {
  const { data, error } = await supabase
    .from("rooms")
    .update({
      name,
      updated_at: new Date().toISOString()
    })
    .eq("id", roomId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(toUserErrorMessage(error ?? new Error("Unable to update room.")));
  }

  return data as Room;
}

export async function deleteRoom(roomId: string) {
  const { error } = await supabase.from("rooms").delete().eq("id", roomId);

  if (error) {
    throw new Error(toUserErrorMessage(error));
  }
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

async function requestGeneratedImage(prompt: string, size: string) {
  const fallback = placeholderUrl(prompt, size);
  const {
    data: { session }
  } = await supabase.auth.getSession();

  try {
    const response = await fetch("/api/generate-image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
      },
      body: JSON.stringify({ prompt, size })
    });
    const payload = (await response.json().catch(() => ({}))) as {
      configured?: boolean;
      error?: string;
      imageUrl?: string;
    };

    if (!response.ok) {
      if (payload.configured === false) {
        return fallback;
      }

      throw new Error(payload.error ?? "Configured provider failed to generate an image.");
    }

    if (payload.imageUrl) {
      return payload.imageUrl;
    }

    if (payload.configured === false) {
      return fallback;
    }

    throw new Error("Image generation returned no image URL.");
  } catch (caughtError) {
    throw new Error(
      caughtError instanceof Error
        ? caughtError.message
        : "Image generation failed. Check Model API configuration in Admin."
    );
  }
}

async function uploadImageToStorage(prompt: string, size: string, file?: File | null) {
  const blob = file
    ? file
    : await requestGeneratedImage(prompt, size).then(async (generatedUrl) => {
        const response = await fetch(generatedUrl);
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
  editor?: string;
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
  const actor = await getCurrentActorProfile();
  const resolvedEditor = firstNonEmptyString(editor, actor.displayName) ?? "Collaborator";

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
        edited_by: resolvedEditor
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

  let nextVersion = "v1";
  let inserted = false;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data: versionRows, error: latestError } = await supabase
      .from("asset_versions")
      .select("version")
      .eq("asset_id", asset.id);

    if (latestError) throw new Error(toUserErrorMessage(latestError));

    const highestVersion = (versionRows ?? []).reduce((max, row) => {
      const parsed = safeVersionNumber(row.version);
      return parsed > max ? parsed : max;
    }, 0);

    const nextVersionNumber = highestVersion + 1;
    nextVersion = `v${nextVersionNumber}`;

    const { error: versionError } = await supabase.from("asset_versions").insert({
      asset_id: asset.id,
      version: nextVersion,
      prompt,
      size,
      style,
      notes: notes || null,
      editor: resolvedEditor
    });

    if (!versionError) {
      inserted = true;
      break;
    }

    if (versionError.code === "23505") {
      continue;
    }

    throw new Error(toUserErrorMessage(versionError));
  }

  if (!inserted) {
    throw new Error("Version conflict detected. Please retry generation.");
  }

  const { error: updateError } = await supabase
    .from("assets")
    .update({
      title,
      current_version: nextVersion,
      image_url: imageUrl,
      edited_by: resolvedEditor,
      updated_at: new Date().toISOString()
    })
    .eq("id", asset.id);

  if (updateError) throw new Error(toUserErrorMessage(updateError));

  return asset.id;
}

export async function addComment(assetId: string, content: string, actor?: ActorProfile) {
  const currentActor = actor ?? (await getCurrentActorProfile());

  const { error } = await supabase.from("comments").insert({
    asset_id: assetId,
    author: currentActor.displayName,
    avatar_url: currentActor.avatarUrl,
    content
  });

  if (error) throw new Error(toUserErrorMessage(error));
}

function normalizeTags(tags: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const tag of tags) {
    const cleaned = tag.trim().replace(/^#+/, "");
    if (!cleaned) continue;

    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    output.push(cleaned);
  }

  return output.slice(0, 10);
}

export async function updateAssetMetadata(options: {
  assetId: string;
  title: string;
  description: string;
  tags: string[];
  editedBy?: string;
}) {
  const { assetId, description, editedBy, title } = options;
  const actor = await getCurrentActorProfile();
  const resolvedEditor = firstNonEmptyString(editedBy, actor.displayName) ?? "Collaborator";
  const tags = normalizeTags(options.tags);

  const { error: assetError } = await supabase
    .from("assets")
    .update({
      title: title.trim(),
      description: description.trim() || null,
      edited_by: resolvedEditor,
      updated_at: new Date().toISOString()
    })
    .eq("id", assetId);

  if (assetError) {
    throw new Error(toUserErrorMessage(assetError));
  }

  const { error: deleteTagsError } = await supabase.from("asset_tags").delete().eq("asset_id", assetId);
  if (deleteTagsError) {
    throw new Error(toUserErrorMessage(deleteTagsError));
  }

  if (tags.length > 0) {
    const { error: insertTagsError } = await supabase
      .from("asset_tags")
      .insert(tags.map((tag) => ({ asset_id: assetId, tag })));
    if (insertTagsError) {
      throw new Error(toUserErrorMessage(insertTagsError));
    }
  }
}

export async function deleteAssetCascade(assetId: string) {
  const deleteSteps: Array<PromiseLike<{ error: PostgrestError | null }>> = [
    supabase.from("asset_tags").delete().eq("asset_id", assetId),
    supabase.from("annotations").delete().eq("asset_id", assetId),
    supabase.from("comments").delete().eq("asset_id", assetId),
    supabase.from("asset_versions").delete().eq("asset_id", assetId),
    supabase.from("assets").delete().eq("id", assetId)
  ];

  for (const step of deleteSteps) {
    const { error } = await step;
    if (error) {
      throw new Error(toUserErrorMessage(error));
    }
  }
}
