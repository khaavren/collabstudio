import { useCallback, useEffect, useMemo, useState } from "react";
import { useLoaderData, useNavigate, useParams } from "react-router-dom";
import { AssetCard } from "@/components/AssetCard";
import { EmptyState } from "@/components/EmptyState";
import { GenerateModal } from "@/components/GenerateModal";
import { InspectorPanel } from "@/components/InspectorPanel";
import { PageHeader } from "@/components/PageHeader";
import { Sidebar } from "@/components/Sidebar";
import {
  addComment,
  createRoom,
  ensureAnonSession,
  fetchAssetDetails,
  fetchAssetsForRoom,
  fetchRooms,
  generateAssetVersion,
  isSupabaseConfigured,
  supabase
} from "@/lib/supabase";
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
  referenceFile: null
};

export function RoomPage() {
  const { roomSlug } = useLoaderData() as RoomLoaderData;
  const params = useParams();
  const navigate = useNavigate();

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

  const activeRoomSlug = params.roomId ?? roomSlug;

  const activeRoom = useMemo(
    () => rooms.find((room) => room.slug === activeRoomSlug) ?? null,
    [activeRoomSlug, rooms]
  );

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [assets, selectedAssetId]
  );

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const haystack = `${asset.title} ${asset.tags.join(" ")}`.toLowerCase();
      const searchMatch = haystack.includes(search.toLowerCase());

      if (!searchMatch) return false;

      if (filter === "All") return true;
      if (filter === "Images") return !asset.tags.some((tag) => ["Connector", "Kit"].includes(tag));
      if (filter === "Connectors") return asset.tags.includes("Connector");
      if (filter === "Kits") return asset.tags.includes("Kit");

      return true;
    });
  }, [assets, filter, search]);

  const loadRoomsData = useCallback(async () => {
    setIsLoading(true);

    try {
      if (!isSupabaseConfigured) {
        setError("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
        setRooms([]);
        return;
      }

      await ensureAnonSession();
      const data = await fetchRooms();
      setRooms(data);

      if (data.length > 0 && !data.some((room) => room.slug === activeRoomSlug)) {
        navigate(`/room/${data[0].slug}`, { replace: true });
      }

      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load rooms.");
    } finally {
      setIsLoading(false);
    }
  }, [activeRoomSlug, navigate]);

  const loadAssetsData = useCallback(async () => {
    if (!activeRoom) {
      setAssets([]);
      return;
    }

    try {
      const data = await fetchAssetsForRoom(activeRoom.id);
      setAssets(data);

      if (data.length === 0) {
        setSelectedAssetId(null);
      } else if (!data.some((asset) => asset.id === selectedAssetId)) {
        setSelectedAssetId(data[0].id);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load assets.");
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
      setActiveVersionId((current) => current ?? detail.versions[0]?.id ?? null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load inspector.");
    }
  }, [selectedAssetId]);

  useEffect(() => {
    void loadRoomsData();
  }, [loadRoomsData]);

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
      const room = await createRoom(name, slug);
      setRooms((current) => [...current, room]);
      navigate(`/room/${room.slug}`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to create room.");
    }
  }

  async function handleGenerate(input: GenerateInput) {
    if (!activeRoom) return;

    try {
      const activeAsset = assets.find((asset) => asset.id === selectedAssetId);
      const title = input.title.trim() || activeAsset?.title || "Untitled Concept";

      const assetId = await generateAssetVersion({
        activeAsset,
        editor: "Phil",
        roomId: activeRoom.id,
        title,
        prompt: input.prompt,
        size: input.size,
        style: input.style,
        notes: input.notes,
        referenceFile: input.referenceFile
      });

      setSelectedAssetId(assetId);
      await loadAssetsData();
      await loadInspectorData(assetId);
      setGeneratePreset(defaultGenerate);
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Generation failed.");
    }
  }

  async function handleAddComment(content: string) {
    if (!selectedAssetId) return;

    try {
      await addComment(selectedAssetId, "Phil", content);
      await loadInspectorData(selectedAssetId);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to add comment.");
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-[var(--muted-foreground)]">
        Loading Band Joes Studio...
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Sidebar
        activeSlug={activeRoomSlug}
        onCreateRoom={handleCreateRoom}
        onSelectRoom={(slug) => navigate(`/room/${slug}`)}
        rooms={rooms}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          assetCount={filteredAssets.length}
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

        {error ? (
          <div className="mx-6 mt-4 rounded-lg border border-[#e8cfc6] bg-[#fff4f0] px-4 py-2 text-sm text-[#9d4d3d]">
            {error}
          </div>
        ) : null}

        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          {filteredAssets.length === 0 ? (
            <EmptyState
              onGenerate={() => {
                setGeneratePreset(defaultGenerate);
                setIsGenerateOpen(true);
              }}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredAssets.map((asset) => (
                <AssetCard
                  asset={asset}
                  isSelected={asset.id === selectedAssetId}
                  key={asset.id}
                  onSelect={() => setSelectedAssetId(asset.id)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {selectedAsset ? (
        <InspectorPanel
          activeVersionId={activeVersionId}
          annotations={annotations}
          asset={selectedAsset}
          comments={comments}
          onAddComment={handleAddComment}
          onClose={() => setSelectedAssetId(null)}
          onRegenerate={(version) => {
            setGeneratePreset({
              title: selectedAsset.title,
              prompt: version.prompt,
              style: version.style,
              size: version.size,
              notes: version.notes ?? "",
              referenceFile: null
            });
            setIsGenerateOpen(true);
          }}
          onSelectVersion={setActiveVersionId}
          versions={versions}
        />
      ) : null}

      <GenerateModal
        initialValues={generatePreset}
        isOpen={isGenerateOpen}
        onClose={() => setIsGenerateOpen(false)}
        onGenerate={handleGenerate}
      />
    </div>
  );
}
