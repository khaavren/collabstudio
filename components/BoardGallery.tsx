"use client";

import type { Asset } from "@/lib/types";

type BoardGalleryProps = {
  assets: Asset[];
  onSelectAsset: (assetId: string) => void;
  resolveCoverUrl: (asset: Asset) => string | null;
  selectedAssetId?: string;
};

export function BoardGallery({
  assets,
  onSelectAsset,
  resolveCoverUrl,
  selectedAssetId
}: BoardGalleryProps) {
  return (
    <section className="h-full overflow-y-auto px-6 py-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-stone-900">Product Board</h1>
        <p className="mt-1 text-sm text-stone-600">
          Select an asset to inspect versions, prompts, and pinned comments.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {assets.map((asset) => {
          const image = resolveCoverUrl(asset);
          const active = selectedAssetId === asset.id;

          return (
            <button
              className={`overflow-hidden rounded-xl border text-left shadow-sm transition ${
                active
                  ? "border-stone-900 bg-white"
                  : "border-stone-200 bg-white hover:border-stone-400 hover:shadow"
              }`}
              key={asset.id}
              onClick={() => onSelectAsset(asset.id)}
              type="button"
            >
              <div className="aspect-square bg-gradient-to-br from-stone-100 to-stone-200">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt={asset.title} className="h-full w-full object-cover" src={image} />
                ) : (
                  <div className="flex h-full items-center justify-center px-4 text-center text-xs text-stone-500">
                    No generated image yet.
                  </div>
                )}
              </div>
              <div className="border-t border-stone-100 p-3">
                <h3 className="line-clamp-2 text-sm font-semibold text-stone-900">{asset.title}</h3>
                <p className="mt-1 text-xs text-stone-500">
                  {new Date(asset.created_at).toLocaleString()}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {assets.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-600">
          This room has no assets yet. Use Generate in the right panel to create one.
        </div>
      ) : null}
    </section>
  );
}
