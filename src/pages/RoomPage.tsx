import { useCallback, useEffect, useMemo, useState } from "react";
import { useLoaderData, useNavigate, useParams } from "react-router-dom";
import { AssetCard } from "@/components/AssetCard";
import { AssetDetailView } from "@/components/AssetDetailView";
import { EditAssetModal } from "@/components/EditAssetModal";
import { GenerateInlinePanel } from "@/components/GenerateInlinePanel";
import { GenerateModal } from "@/components/GenerateModal";
import { PageHeader } from "@/components/PageHeader";
import { Sidebar } from "@/components/Sidebar";
import {
  addComment,
  type ActorProfile,
  createRoom,
  deleteRoom,
  deleteAssetVersionTurn,
  deleteAssetCascade,
  ensureAnonSession,
  fetchAssetDetails,
  fetchAssetsForRoom,
  fetchRooms,
  generateAssetVersion,
  getCurrentActorProfile,
  isSupabaseConfigured,
  supabase,
  updateRoomName,
  updateAssetMetadata
} from "@/lib/supabase";
import { fetchWorkspaceNameById } from "@/lib/workspaces";
import { slugify } from "@/lib/utils";
import type {
  Annotation,
  AssetFilter,
  AssetVersion,
  AssetWithTags,
  Comment,
  GenerateInput,
  Room
} from "@/lib/types";

type RoomLoaderData = {
  roomSlug: string;
};

const defaultGenerate: GenerateInput = {
  title: "",
  prompt: "",
  style: "Product Photography",
  size: "1024x1024",
  notes: "",
  referenceFile: null,
  generationMode: "auto"
};

export function RoomPage() {
  const { roomSlug } = useLoaderData() as RoomLoaderData;
  const params = useParams();
  const navigate = useNavigate();
  const activeWorkspaceId = params.workspaceId ?? null;

  const [rooms, setRooms] = useState<Room[]>([]);
  const [assets, setAssets] = useState<AssetWithTags[]>([]);
  const [versions, setVersions] = useState<AssetVersion[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AssetFilter>("All");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [generatePreset, setGeneratePreset] = useState<GenerateInput>(defaultGenerate);
  const [editingGridAsset, setEditingGridAsset] = useState<AssetWithTags | null>(null);
  const [currentActor, setCurrentActor] = useState<ActorProfile | null>(null);

  const activeRoomSlug = params.roomId ?? roomSlug;

  const activeRoom = useMemo(
    () => rooms.find((room) => room.slug === activeRoomSlug) ?? null,
    [activeRoomSlug, rooms]
  );
  const [workspaceName, setWorkspaceName] = useState("Workspace");

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [assets, selectedAssetId]
  );
  const actorName = currentActor?.displayName ?? "Collaborator";

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const haystack = `${asset.title} ${asset.description ?? ""} ${asset.tags.join(" ")}`.toLowerCase();
      const searchMatch = haystack.includes(search.toLowerCase());

      if (!searchMatch) return false;

      if (filter === "All") return true;
      if (filter === "Images") return !asset.tags.some((tag) => ["Connector", "Kit"].includes(tag));
      if (filter === "Connectors") return asset.tags.includes("Connector");
      if (filter === "Kits") return asset.tags.includes("Kit");

      return true;
    });
  }, [assets, filter, search]);

  const collaboratorCount = useMemo(() => {
    const names = new Set(
      assets
        .map((asset) => asset.edited_by?.trim())
        .filter((value): value is string => Boolean(value))
    );
    return names.size;
  }, [assets]);

  const loadRoomsData = useCallback(async () => {
    setIsLoading(true);

    try {
      if (!isSupabaseConfigured) {
        setError("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
        setRooms([]);
        return;
      }

      await ensureAnonSession();
      const actor = await getCurrentActorProfile();
      setCurrentActor(actor);
      const data = await fetchRooms(activeWorkspaceId);
      setRooms(data);

      if (data.length > 0 && !data.some((room) => room.slug === activeRoomSlug)) {
        const nextPath = activeWorkspaceId
          ? `/workspace/${activeWorkspaceId}/room/${data[0].slug}`
          : `/room/${data[0].slug}`;
        navigate(nextPath, { replace: true });
      }

      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load rooms.");
    } finally {
      setIsLoading(false);
    }
  }, [activeRoomSlug, activeWorkspaceId, navigate]);

  useEffect(() => {
    let active = true;

    async function loadWorkspaceName() {
      if (!activeWorkspaceId) {
        if (!active) return;
        setWorkspaceName("Workspace");
        return;
      }

      const name = await fetchWorkspaceNameById(activeWorkspaceId);
      if (!active) return;
      setWorkspaceName(name ?? "Workspace");
    }

    void loadWorkspaceName();
    return () => {
      active = false;
    };
  }, [activeWorkspaceId]);

  const loadAssetsData = useCallback(async () => {
    if (!activeRoom) {
      setAssets([]);
      return;
    }

    try {
      const data = await fetchAssetsForRoom(activeRoom.id);
      setAssets(data);

      if (data.length === 0 || !data.some((asset) => asset.id === selectedAssetId)) {
        setSelectedAssetId(null);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load projects.");
    }
  }, [activeRoom, selectedAssetId]);

  const loadInspectorData = useCallback(async (targetAssetId?: string) => {
    const assetId = targetAssetId ?? selectedAssetId;
    if (!assetId) {
      setVersions([]);
      setAnnotations([]);
      setComments([]);
      setActiveVersionId(null);
      return;
    }

    try {
      const detail = await fetchAssetDetails(assetId);
      setVersions(detail.versions);
      setAnnotations(detail.annotations);
      setComments(detail.comments);
      setActiveVersionId((current) =>
        current && detail.versions.some((version) => version.id === current)
          ? current
          : detail.versions[0]?.id ?? null
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load inspector.");
    }
  }, [selectedAssetId]);

  useEffect(() => {
    void loadRoomsData();
  }, [loadRoomsData]);

  useEffect(() => {
    let active = true;

    async function syncActor() {
      if (!isSupabaseConfigured) return;
      try {
        await ensureAnonSession();
        const actor = await getCurrentActorProfile();
        if (!active) return;
        setCurrentActor(actor);
      } catch {
        if (!active) return;
        setCurrentActor(null);
      }
    }

    void syncActor();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(() => {
      void syncActor();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void loadAssetsData();
  }, [loadAssetsData]);

  useEffect(() => {
    void loadInspectorData();
  }, [loadInspectorData]);

  useEffect(() => {
    if (!activeRoom) return;

    const channel = supabase
      .channel(`room-${activeRoom.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "assets", filter: `room_id=eq.${activeRoom.id}` },
        () => {
          void loadAssetsData();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "asset_tags" },
        () => {
          void loadAssetsData();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeRoom, loadAssetsData]);

  useEffect(() => {
    if (!selectedAssetId) return;

    const channel = supabase
      .channel(`asset-${selectedAssetId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "asset_versions", filter: `asset_id=eq.${selectedAssetId}` },
        () => {
          void loadInspectorData(selectedAssetId);
          void loadAssetsData();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "annotations", filter: `asset_id=eq.${selectedAssetId}` },
        () => {
          void loadInspectorData(selectedAssetId);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `asset_id=eq.${selectedAssetId}` },
        () => {
          void loadInspectorData(selectedAssetId);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadAssetsData, loadInspectorData, selectedAssetId]);

  async function handleCreateRoom() {
    const name = window.prompt("New room name");
    if (!name) return;

    const slug = slugify(name);
    if (!slug) return;

    try {
      const room = await createRoom(name, slug, activeWorkspaceId);
      setRooms((current) => [...current, room]);
      const nextPath = activeWorkspaceId
        ? `/workspace/${activeWorkspaceId}/room/${room.slug}`
        : `/room/${room.slug}`;
      navigate(nextPath);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to create room.");
    }
  }

  async function handleRenameRoom(targetRoom: Room, name: string) {
    const nextName = name.trim();
    if (!nextName) return false;
    if (nextName === targetRoom.name) return true;

    const previousRooms = rooms;
    setRooms((current) =>
      current.map((room) =>
        room.id === targetRoom.id
          ? {
              ...room,
              name: nextName,
              updated_at: new Date().toISOString()
            }
          : room
      )
    );

    try {
      await updateRoomName(targetRoom.id, nextName);
      setError(null);
      return true;
    } catch (caughtError) {
      setRooms(previousRooms);
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update room.");
      return false;
    }
  }

  async function handleDeleteRoom(targetRoom: Room) {
    const confirmed = window.confirm(
      `Delete room "${targetRoom.name}"? This also deletes all projects in this room.`
    );
    if (!confirmed) {
      return false;
    }

    const previousRooms = rooms;
    const deletingActiveRoom = targetRoom.slug === activeRoomSlug;
    const nextRooms = previousRooms.filter((room) => room.id !== targetRoom.id);
    const previousPath = activeWorkspaceId
      ? `/workspace/${activeWorkspaceId}/room/${activeRoomSlug}`
      : `/room/${activeRoomSlug}`;

    setRooms(nextRooms);

    if (deletingActiveRoom) {
      setSelectedAssetId(null);
      setActiveVersionId(null);
      setAssets([]);
      setVersions([]);
      setAnnotations([]);
      setComments([]);

      if (nextRooms.length > 0) {
        const nextPath = activeWorkspaceId
          ? `/workspace/${activeWorkspaceId}/room/${nextRooms[0].slug}`
          : `/room/${nextRooms[0].slug}`;
        navigate(nextPath, { replace: true });
      }
    }

    try {
      await deleteRoom(targetRoom.id);
      setError(null);
      return true;
    } catch (caughtError) {
      setRooms(previousRooms);
      if (deletingActiveRoom) {
        navigate(previousPath, { replace: true });
      }
      setError(caughtError instanceof Error ? caughtError.message : "Unable to delete room.");
      return false;
    }
  }

  async function handleGenerate(input: GenerateInput) {
    try {
      let targetRoom = activeRoom;
      if (!targetRoom) {
        if (rooms.length > 0) {
          targetRoom = rooms[0];
        } else {
          const defaultRoom = await createRoom("General", "general", activeWorkspaceId);
          setRooms((current) => [...current, defaultRoom]);
          targetRoom = defaultRoom;
        }

        const nextPath = activeWorkspaceId
          ? `/workspace/${activeWorkspaceId}/room/${targetRoom.slug}`
          : `/room/${targetRoom.slug}`;
        navigate(nextPath, { replace: true });
      }

      if (!targetRoom) {
        throw new Error("Unable to resolve a room for generation.");
      }

      const activeAsset = assets.find((asset) => asset.id === selectedAssetId);
      const sourceVersion =
        versions.find((version) => version.id === activeVersionId) ??
        versions[0] ??
        null;
      const title = input.title.trim() || activeAsset?.title || "Untitled Concept";
      const sourceImageUrl = input.referenceFile
        ? null
        : input.sourceImageUrl ?? sourceVersion?.image_url ?? activeAsset?.image_url ?? null;

      const assetId = await generateAssetVersion({
        activeAsset,
        roomId: targetRoom.id,
        title,
        prompt: input.prompt,
        model: input.model,
        size: input.size,
        style: input.style,
        notes: input.notes,
        referenceFile: input.referenceFile,
        sourceImageUrl,
        generationMode: input.generationMode ?? "auto",
        conversationContext: input.conversationContext
      });

      setSelectedAssetId(assetId);
      if (activeRoom && targetRoom.id === activeRoom.id) {
        await loadAssetsData();
        await loadInspectorData(assetId);
      }
      setGeneratePreset(defaultGenerate);
      setError(null);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Generation failed.";
      setError(message);
      throw new Error(message);
    }
  }

  async function handleAddComment(content: string) {
    if (!selectedAssetId) return;

    try {
      await addComment(selectedAssetId, content, currentActor ?? undefined);
      await loadInspectorData(selectedAssetId);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to add comment.");
    }
  }

  async function handleSendPrompt(prompt: string, referenceFile: File | null, model: string | null) {
    if (!selectedAsset) return;

    const baseVersion =
      versions.find((version) => version.id === activeVersionId) ??
      versions[0] ??
      null;
    const context = [...versions]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .flatMap((version) => {
        const turns: Array<{ role: "user" | "assistant"; content: string }> = [
          { role: "user", content: version.prompt }
        ];

        if (version.output_type === "text" && version.response_text) {
          turns.push({ role: "assistant", content: version.response_text });
        }

        return turns;
      })
      .slice(-16);

    try {
      await handleGenerate({
        title: selectedAsset.title,
        prompt,
        model,
        style: baseVersion?.style ?? "Product Photography",
        size: baseVersion?.size ?? "1024x1024",
        notes: "",
        referenceFile,
        sourceImageUrl: referenceFile ? null : baseVersion?.image_url ?? selectedAsset.image_url,
        generationMode: "auto",
        conversationContext: context
      });
    } catch {
      // Error banner is already set by handleGenerate.
    }
  }

  async function handleAssetUpdate(updatedAsset: {
    id: string;
    title: string;
    tags: string[];
    description: string;
  }) {
    const previousAssets = assets;

    setAssets((current) =>
      current.map((asset) =>
        asset.id === updatedAsset.id
          ? {
              ...asset,
              title: updatedAsset.title,
              tags: updatedAsset.tags,
              description: updatedAsset.description || null,
              edited_by: actorName,
              updated_at: new Date().toISOString()
            }
          : asset
      )
    );

    try {
      await updateAssetMetadata({
        assetId: updatedAsset.id,
        title: updatedAsset.title,
        tags: updatedAsset.tags,
        description: updatedAsset.description,
        editedBy: actorName
      });
      await loadAssetsData();
      setError(null);
      return true;
    } catch (caughtError) {
      setAssets(previousAssets);
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update project.");
      return false;
    }
  }

  async function handleDeleteAsset(assetId: string) {
    const targetAsset = assets.find((asset) => asset.id === assetId);
    const label = targetAsset?.title ?? "this project";
    const confirmed = window.confirm(`Delete "${label}"? This action cannot be undone.`);
    if (!confirmed) {
      return false;
    }

    const previousAssets = assets;
    const wasSelected = selectedAssetId === assetId;

    setAssets((current) => current.filter((asset) => asset.id !== assetId));
    if (wasSelected) {
      setSelectedAssetId(null);
      setActiveVersionId(null);
      setVersions([]);
      setAnnotations([]);
      setComments([]);
    }

    try {
      await deleteAssetCascade(assetId);
      await loadAssetsData();
      setError(null);
      return true;
    } catch (caughtError) {
      setAssets(previousAssets);
      if (wasSelected) {
        setSelectedAssetId(assetId);
      }
      setError(caughtError instanceof Error ? caughtError.message : "Unable to delete project.");
      return false;
    }
  }

  async function handleDeleteVersion(version: AssetVersion) {
    const confirmed = window.confirm(`Delete turn ${version.version}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    try {
      const result = await deleteAssetVersionTurn(version.id);
      await loadAssetsData();

      if (!result.assetId) {
        setError(null);
        return;
      }

      if (result.assetDeleted) {
        if (selectedAssetId === result.assetId) {
          setSelectedAssetId(null);
          setActiveVersionId(null);
          setVersions([]);
          setAnnotations([]);
          setComments([]);
        }
      } else if (selectedAssetId === result.assetId) {
        await loadInspectorData(result.assetId);
        if (result.nextVersionId) {
          setActiveVersionId(result.nextVersionId);
        }
      }

      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to delete turn.");
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-[var(--muted-foreground)]">
        Loading workspace...
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Sidebar
        activeSlug={activeRoomSlug}
        onCreateRoom={handleCreateRoom}
        onDeleteRoom={handleDeleteRoom}
        onRenameRoom={handleRenameRoom}
        onSelectRoom={(slug) => {
          const nextPath = activeWorkspaceId
            ? `/workspace/${activeWorkspaceId}/room/${slug}`
            : `/room/${slug}`;
          navigate(nextPath);
        }}
        rooms={rooms}
        workspaceName={workspaceName}
        userName={actorName}
        userSubtitle={currentActor?.email ?? "Workspace Member"}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {error ? (
          <div className="mx-6 mt-4 rounded-lg border border-[#e8cfc6] bg-[#fff4f0] px-4 py-2 text-sm text-[#9d4d3d]">
            {error}
          </div>
        ) : null}

        {selectedAsset ? (
          <AssetDetailView
            activeVersionId={activeVersionId}
            annotations={annotations}
            asset={selectedAsset}
            comments={comments}
            onAddComment={handleAddComment}
            onAssetDelete={handleDeleteAsset}
            onAssetUpdate={handleAssetUpdate}
            onBack={() => {
              setSelectedAssetId(null);
              setActiveVersionId(null);
            }}
            onCreateVariant={(version) => {
              void handleGenerate({
                title: selectedAsset.title,
                prompt: `${version.prompt}\n\nCreate a close variant with subtle improvements.`,
                style: version.style,
                size: version.size,
                notes: version.notes ?? "",
                referenceFile: null,
                sourceImageUrl: version.image_url ?? selectedAsset.image_url,
                generationMode: "force_image"
              }).catch(() => {
                // Error banner is already set by handleGenerate.
              });
            }}
            onDeleteVersion={handleDeleteVersion}
            onRegenerate={(version) => {
              void handleGenerate({
                title: selectedAsset.title,
                prompt: version.prompt,
                style: version.style,
                size: version.size,
                notes: version.notes ?? "",
                referenceFile: null,
                sourceImageUrl: version.image_url ?? selectedAsset.image_url,
                generationMode: "force_image"
              }).catch(() => {
                // Error banner is already set by handleGenerate.
              });
            }}
            onSelectVersion={setActiveVersionId}
            onSendPrompt={handleSendPrompt}
            versions={versions}
          />
        ) : (
          <>
            <PageHeader
              collaboratorCount={collaboratorCount}
              projectCount={filteredAssets.length}
              filter={filter}
              onFilterChange={setFilter}
              onGenerate={() => {
                setGeneratePreset(defaultGenerate);
                setIsGenerateOpen(true);
              }}
              onSearchChange={setSearch}
              roomTitle={activeRoom?.name ?? "Room"}
              searchValue={search}
            />

            <main className="min-h-0 flex-1 overflow-y-auto p-6">
              {filteredAssets.length === 0 ? (
                <div className="flex min-h-[calc(100vh-220px)] items-center justify-center">
                  <GenerateInlinePanel
                    initialValues={defaultGenerate}
                    onGenerate={handleGenerate}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredAssets.map((asset) => (
                    <AssetCard
                      asset={asset}
                      isSelected={asset.id === selectedAssetId}
                      key={asset.id}
                      onEdit={() => setEditingGridAsset(asset)}
                      onSelect={() => {
                        setSelectedAssetId(asset.id);
                        setActiveVersionId(null);
                      }}
                    />
                  ))}
                </div>
              )}
            </main>
          </>
        )}
      </div>

      <GenerateModal
        initialValues={generatePreset}
        isOpen={isGenerateOpen}
        onClose={() => setIsGenerateOpen(false)}
        onGenerate={handleGenerate}
      />

      <EditAssetModal
        assetDescription={editingGridAsset?.description}
        assetTags={editingGridAsset?.tags ?? []}
        assetTitle={editingGridAsset?.title ?? ""}
        isOpen={editingGridAsset !== null}
        onClose={() => setEditingGridAsset(null)}
        onDelete={() => {
          if (!editingGridAsset) return;
          void handleDeleteAsset(editingGridAsset.id).then((ok) => {
            if (ok) {
              setEditingGridAsset(null);
            }
          });
        }}
        onSave={(data) => {
          if (!editingGridAsset) return;
          void handleAssetUpdate({
            id: editingGridAsset.id,
            title: data.title,
            tags: data.tags,
            description: data.description
          }).then((ok) => {
            if (ok) {
              setEditingGridAsset(null);
            }
          });
        }}
      />
    </div>
  );
}
