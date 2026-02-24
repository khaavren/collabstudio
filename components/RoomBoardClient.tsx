"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { BoardGallery } from "@/components/BoardGallery";
import { RightPanelInspector } from "@/components/RightPanelInspector";
import { SidebarRooms } from "@/components/SidebarRooms";
import { fetchWithAuth } from "@/lib/client/auth-fetch";
import { getPublicAssetUrl, uploadFetchedImageToStorage } from "@/lib/storage";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  Asset,
  AssetVersion,
  Comment,
  GeneratePayload,
  Room,
  TeamRole
} from "@/lib/types";

type RoomBoardClientProps = {
  roomId: string;
};

type Membership = {
  organization_id: string;
  role: TeamRole;
};

export function RoomBoardClient({ roomId }: RoomBoardClientProps) {
  return (
    <AuthGate>
      {({ user, signOut }) => (
        <RoomBoardShell
          roomId={roomId}
          signOut={signOut}
          userId={user.id}
          userEmail={user.email}
        />
      )}
    </AuthGate>
  );
}

function RoomBoardShell({
  roomId,
  signOut,
  userEmail,
  userId
}: {
  roomId: string;
  signOut: () => Promise<void>;
  userEmail?: string;
  userId: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [roomName, setRoomName] = useState("Room");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [versions, setVersions] = useState<AssetVersion[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | undefined>(undefined);
  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGenerateOpen, setIsGenerateOpen] = useState(true);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAssetIdRef = useRef<string | undefined>(undefined);
  const selectedVersionIdRef = useRef<string | undefined>(undefined);
  const membershipRef = useRef<Membership | null>(null);

  const canEdit = membership?.role === "admin" || membership?.role === "editor";

  useEffect(() => {
    selectedAssetIdRef.current = selectedAssetId;
  }, [selectedAssetId]);

  useEffect(() => {
    selectedVersionIdRef.current = selectedVersionId;
  }, [selectedVersionId]);

  useEffect(() => {
    membershipRef.current = membership;
  }, [membership]);

  const loadAssetDetails = useCallback(
    async (assetId: string, preferredVersionId?: string) => {
      const activeMembership = membershipRef.current;
      if (!activeMembership) return;

      const { data: versionData, error: versionError } = await supabase
        .from("asset_versions")
        .select("*")
        .eq("asset_id", assetId)
        .eq("organization_id", activeMembership.organization_id)
        .order("version", { ascending: false });

      if (versionError) {
        setError(versionError.message);
        return;
      }

      const orderedVersions = versionData ?? [];
      setVersions(orderedVersions);

      const nextVersionId =
        preferredVersionId && orderedVersions.some((entry) => entry.id === preferredVersionId)
          ? preferredVersionId
          : selectedVersionIdRef.current &&
              orderedVersions.some((entry) => entry.id === selectedVersionIdRef.current)
            ? selectedVersionIdRef.current
            : orderedVersions[0]?.id;

      setSelectedVersionId(nextVersionId);
      selectedVersionIdRef.current = nextVersionId;

      if (orderedVersions.length === 0) {
        setComments([]);
        return;
      }

      const versionIds = orderedVersions.map((entry) => entry.id);
      const { data: commentData, error: commentError } = await supabase
        .from("comments")
        .select("*")
        .eq("organization_id", activeMembership.organization_id)
        .in("asset_version_id", versionIds)
        .order("created_at", { ascending: false });

      if (commentError) {
        setError(commentError.message);
      } else {
        setComments(commentData ?? []);
        setError(null);
      }
    },
    [supabase]
  );

  const refreshBoard = useCallback(async () => {
    const activeMembership = membershipRef.current;
    if (!activeMembership) {
      setRooms([]);
      setAssets([]);
      setVersions([]);
      setComments([]);
      setIsLoading(false);
      return;
    }

    const [roomsQuery, roomQuery, assetsQuery] = await Promise.all([
      supabase
        .from("rooms")
        .select("*")
        .eq("organization_id", activeMembership.organization_id)
        .order("created_at", { ascending: false }),
      supabase
        .from("rooms")
        .select("name")
        .eq("id", roomId)
        .eq("organization_id", activeMembership.organization_id)
        .maybeSingle(),
      supabase
        .from("assets")
        .select("*")
        .eq("room_id", roomId)
        .eq("organization_id", activeMembership.organization_id)
        .order("created_at", { ascending: false })
    ]);

    if (roomsQuery.error) {
      setError(roomsQuery.error.message);
    } else {
      setRooms(roomsQuery.data ?? []);
    }

    if (roomQuery.error || !roomQuery.data) {
      setRoomName("Unknown room");
      if (roomQuery.error) setError(roomQuery.error.message);
    } else {
      setRoomName(roomQuery.data.name ?? "Room");
    }

    if (assetsQuery.error) {
      setError(assetsQuery.error.message);
      setIsLoading(false);
      return;
    }

    const nextAssets = assetsQuery.data ?? [];
    setAssets(nextAssets);

    const currentSelected = selectedAssetIdRef.current;
    const nextSelectedAssetId =
      currentSelected && nextAssets.some((asset) => asset.id === currentSelected)
        ? currentSelected
        : nextAssets[0]?.id;

    setSelectedAssetId(nextSelectedAssetId);
    selectedAssetIdRef.current = nextSelectedAssetId;

    if (nextSelectedAssetId) {
      await loadAssetDetails(nextSelectedAssetId);
    } else {
      setVersions([]);
      setComments([]);
      setSelectedVersionId(undefined);
      selectedVersionIdRef.current = undefined;
    }

    setError(null);
    setIsLoading(false);
  }, [loadAssetDetails, roomId, supabase]);

  const loadMembership = useCallback(async () => {
    const { data, error: membershipError } = await supabase
      .from("team_members")
      .select("organization_id, role")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      setError(membershipError.message);
      setMembership(null);
      setIsLoading(false);
      return;
    }

    if (!data) {
      setMembership(null);
      setIsLoading(false);
      return;
    }

    setMembership(data as Membership);
    membershipRef.current = data as Membership;
    await refreshBoard();
  }, [refreshBoard, supabase, userId]);

  useEffect(() => {
    void loadMembership();
  }, [loadMembership]);

  useEffect(() => {
    const activeMembership = membershipRef.current;
    if (!activeMembership) return;

    const channel = supabase
      .channel(`org-${activeMembership.organization_id}-room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "assets",
          filter: `organization_id=eq.${activeMembership.organization_id}`
        },
        () => {
          void refreshBoard();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "asset_versions",
          filter: `organization_id=eq.${activeMembership.organization_id}`
        },
        () => {
          void refreshBoard();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comments",
          filter: `organization_id=eq.${activeMembership.organization_id}`
        },
        () => {
          void refreshBoard();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshBoard, roomId, supabase, membership]);

  async function handleSelectAsset(assetId: string) {
    setSelectedAssetId(assetId);
    selectedAssetIdRef.current = assetId;
    await loadAssetDetails(assetId);
  }

  async function handleCreateRoom(name: string) {
    if (!membership || !canEdit) return;

    setIsCreatingRoom(true);
    const { data, error: createError } = await supabase
      .from("rooms")
      .insert({
        organization_id: membership.organization_id,
        name
      })
      .select("*")
      .single();

    setIsCreatingRoom(false);

    if (createError || !data) {
      setError(createError?.message ?? "Could not create room.");
      return;
    }

    router.push(`/rooms/${data.id}`);
  }

  async function handleGenerate(payload: GeneratePayload) {
    if (!membership || !canEdit) {
      setError("Viewer role is read-only.");
      return;
    }

    try {
      setIsGenerating(true);
      setError(null);

      let workingAssetId = selectedAssetIdRef.current;
      let workingAssetTitle = payload.title?.trim();

      if (!workingAssetId) {
        const title = workingAssetTitle || `Concept ${assets.length + 1}`;
        const { data: createdAsset, error: createAssetError } = await supabase
          .from("assets")
          .insert({
            organization_id: membership.organization_id,
            room_id: roomId,
            title,
            created_by: userId
          })
          .select("*")
          .single();

        if (createAssetError || !createdAsset) {
          throw new Error(createAssetError?.message ?? "Unable to create asset.");
        }

        workingAssetId = createdAsset.id;
        workingAssetTitle = createdAsset.title;
        setSelectedAssetId(workingAssetId);
        selectedAssetIdRef.current = workingAssetId;
      }

      const { data: latestVersionRow, error: versionLookupError } = await supabase
        .from("asset_versions")
        .select("version")
        .eq("organization_id", membership.organization_id)
        .eq("asset_id", workingAssetId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (versionLookupError) {
        throw new Error(versionLookupError.message);
      }

      const nextVersion = (latestVersionRow?.version ?? 0) + 1;

      const imageResponse = await fetchWithAuth("/api/generate-image", {
        method: "POST",
        body: JSON.stringify({
          prompt: payload.prompt,
          size: payload.size
        })
      });

      if (!imageResponse.ok) {
        const imageError = (await imageResponse.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(imageError?.error ?? "Image generation route failed.");
      }

      const { imageUrl } = (await imageResponse.json()) as { imageUrl: string };

      const uploadResult = await uploadFetchedImageToStorage({
        supabase,
        imageUrl,
        organizationId: membership.organization_id,
        roomId,
        assetId: workingAssetId,
        version: nextVersion
      });

      const params = {
        size: payload.size,
        style: payload.style ?? "default"
      };

      const { data: createdVersion, error: createVersionError } = await supabase
        .from("asset_versions")
        .insert({
          organization_id: membership.organization_id,
          asset_id: workingAssetId,
          version: nextVersion,
          prompt: payload.prompt,
          params,
          storage_path: uploadResult.storagePath,
          created_by: userId
        })
        .select("*")
        .single();

      if (createVersionError || !createdVersion) {
        throw new Error(createVersionError?.message ?? "Unable to create asset version.");
      }

      const { error: updateAssetError } = await supabase
        .from("assets")
        .update({
          title: workingAssetTitle,
          cover_storage_path: uploadResult.storagePath
        })
        .eq("id", workingAssetId)
        .eq("organization_id", membership.organization_id);

      if (updateAssetError) {
        throw new Error(updateAssetError.message);
      }

      await refreshBoard();
      await loadAssetDetails(workingAssetId, createdVersion.id);
      setIsGenerateOpen(false);
    } catch (generationError) {
      const message = generationError instanceof Error ? generationError.message : "Generate failed.";
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSubmitComment(body: string, pin?: { x: number; y: number }) {
    if (!membership || !canEdit) {
      setError("Viewer role is read-only.");
      return;
    }

    const versionId = selectedVersionIdRef.current;
    if (!versionId) return;

    const { data, error: createCommentError } = await supabase
      .from("comments")
      .insert({
        organization_id: membership.organization_id,
        asset_version_id: versionId,
        body,
        x: pin?.x,
        y: pin?.y,
        created_by: userId
      })
      .select("*")
      .single();

    if (createCommentError || !data) {
      setError(createCommentError?.message ?? "Unable to add comment.");
      return;
    }

    setComments((current) => [data, ...current]);
    setError(null);
  }

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? null;

  const currentVersion =
    versions.find((version) => version.id === selectedVersionId) ?? versions[0];

  const commentsForCurrentVersion = comments.filter(
    (comment) => comment.asset_version_id === currentVersion?.id
  );

  if (!membership) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="rounded-lg border border-stone-300 bg-white p-6 text-sm text-stone-700">
          You are not assigned to a team yet. Ask an admin to invite you.
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen overflow-hidden md:grid md:grid-cols-[280px_minmax(0,1fr)_430px]">
      <div className="h-56 border-b border-stone-300 md:h-full md:border-b-0 md:border-r-0">
        <SidebarRooms
          canCreateRoom={canEdit}
          currentRoomId={roomId}
          isCreating={isCreatingRoom}
          onCreateRoom={handleCreateRoom}
          onSelectRoom={(nextRoomId) => router.push(`/rooms/${nextRoomId}`)}
          rooms={rooms}
        />
      </div>

      <section className="flex h-[calc(100vh-14rem)] flex-col overflow-hidden border-b border-stone-300 md:h-full md:border-b-0 md:border-x md:border-stone-300">
        <header className="flex items-center justify-between gap-3 border-b border-stone-300 bg-[#f7f6f3] px-6 py-3">
          <div>
            <h1 className="text-sm font-semibold uppercase tracking-wide text-stone-600">{roomName}</h1>
            <p className="text-xs text-stone-500">Role: {membership.role}</p>
          </div>
          <div className="text-right text-xs text-stone-600">
            <p>{userEmail}</p>
            <div className="mt-1 flex items-center justify-end gap-3">
              <Link className="font-medium text-accent hover:underline" href="/admin">
                Admin
              </Link>
              <button
                className="font-medium text-accent hover:underline"
                onClick={signOut}
                type="button"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        {error ? (
          <div className="mx-6 mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="p-6 text-sm text-stone-600">Loading room workspace...</div>
        ) : (
          <BoardGallery
            assets={assets}
            onSelectAsset={(assetId) => {
              void handleSelectAsset(assetId);
            }}
            resolveCoverUrl={(asset) => getPublicAssetUrl(supabase, asset.cover_storage_path)}
            selectedAssetId={selectedAssetId}
          />
        )}
      </section>

      <div className="h-[50vh] md:h-full">
        <RightPanelInspector
          asset={selectedAsset}
          canEdit={canEdit}
          commentsForCurrentVersion={commentsForCurrentVersion}
          currentImageUrl={currentVersion ? getPublicAssetUrl(supabase, currentVersion.storage_path) : null}
          isGenerateOpen={isGenerateOpen}
          isGenerating={isGenerating}
          onGenerate={handleGenerate}
          onSelectVersion={(versionId) => {
            setSelectedVersionId(versionId);
            selectedVersionIdRef.current = versionId;
          }}
          onSubmitComment={handleSubmitComment}
          onToggleGenerate={() => setIsGenerateOpen((current) => !current)}
          selectedVersionId={selectedVersionId}
          versions={versions}
        />
      </div>
    </main>
  );
}
