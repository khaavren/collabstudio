"use client";

import { useMemo, useState } from "react";
import { AnnotationPins } from "@/components/AnnotationPins";
import { GenerateVersionForm } from "@/components/GenerateVersionForm";
import { PromptDiffViewer } from "@/components/PromptDiffViewer";
import type { Asset, AssetVersion, Comment, GeneratePayload } from "@/lib/types";

type RightPanelInspectorProps = {
  asset: Asset | null;
  canEdit: boolean;
  commentsForCurrentVersion: Comment[];
  currentImageUrl: string | null;
  isGenerateOpen: boolean;
  isGenerating: boolean;
  onGenerate: (payload: GeneratePayload) => Promise<void>;
  onSelectVersion: (versionId: string) => void;
  onSubmitComment: (body: string, pin?: { x: number; y: number }) => Promise<void>;
  onToggleGenerate: () => void;
  selectedVersionId?: string;
  versions: AssetVersion[];
};

function paramsLabel(params: unknown) {
  if (params === null || params === undefined) return "{}";
  if (typeof params === "string") return params;
  try {
    return JSON.stringify(params);
  } catch {
    return "{}";
  }
}

export function RightPanelInspector({
  asset,
  canEdit,
  commentsForCurrentVersion,
  currentImageUrl,
  isGenerateOpen,
  isGenerating,
  onGenerate,
  onSelectVersion,
  onSubmitComment,
  onToggleGenerate,
  selectedVersionId,
  versions
}: RightPanelInspectorProps) {
  const [draftComment, setDraftComment] = useState("");
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [openDiffVersionId, setOpenDiffVersionId] = useState<string | null>(null);

  const currentVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? versions[0],
    [selectedVersionId, versions]
  );

  async function handleCommentSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draftComment.trim();
    if (!body) return;
    await onSubmitComment(body, pendingPin ?? undefined);
    setDraftComment("");
    setPendingPin(null);
  }

  return (
    <aside className="flex h-full w-full flex-col border-l border-stone-300 bg-[#faf9f6]">
      <div className="border-b border-stone-300 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-700">Inspector</h2>
            <p className="mt-1 text-sm text-stone-900">
              {asset ? asset.title : "No asset selected"}
            </p>
          </div>
          <button
            className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:border-stone-500"
            disabled={!canEdit}
            onClick={onToggleGenerate}
            type="button"
          >
            {isGenerateOpen ? "Hide Generate" : "Generate"}
          </button>
        </div>

        {isGenerateOpen && canEdit ? (
          <div className="mt-3">
            <GenerateVersionForm
              isGenerating={isGenerating}
              onGenerate={onGenerate}
              selectedAssetTitle={asset?.title}
            />
          </div>
        ) : null}
      </div>

      {!asset ? (
        <div className="p-4 text-sm text-stone-600">
          Select a board card to inspect its versions, prompt history, image annotations, and comments.
        </div>
      ) : (
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-600">
              Version Timeline
            </h3>
            <div className="space-y-2">
              {versions.map((version) => (
                <button
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ${
                    version.id === currentVersion?.id
                      ? "border-stone-900 bg-stone-900 text-white"
                      : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
                  }`}
                  key={version.id}
                  onClick={() => onSelectVersion(version.id)}
                  type="button"
                >
                  <span>v{version.version}</span>
                  <span className="text-xs opacity-80">
                    {new Date(version.created_at).toLocaleString()}
                  </span>
                </button>
              ))}

              {versions.length === 0 ? (
                <div className="rounded-md border border-dashed border-stone-300 bg-white p-3 text-sm text-stone-500">
                  No versions yet. Generate the first concept image.
                </div>
              ) : null}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-600">
              Prompt History
            </h3>
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {versions.map((version, index) => {
                const previousPrompt = versions[index + 1]?.prompt;
                const isDiffOpen = openDiffVersionId === version.id;
                return (
                  <article className="rounded-md border border-stone-300 bg-white p-2" key={version.id}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-stone-700">v{version.version}</p>
                      <button
                        className="text-xs font-medium text-accent hover:underline"
                        onClick={() =>
                          setOpenDiffVersionId((current) =>
                            current === version.id ? null : version.id
                          )
                        }
                        type="button"
                      >
                        View diff
                      </button>
                    </div>
                    <p className="mt-1 text-sm text-stone-800">{version.prompt}</p>
                    <p className="mt-1 text-xs text-stone-500">Params: {paramsLabel(version.params)}</p>
                    {isDiffOpen ? (
                      <PromptDiffViewer
                        currentPrompt={version.prompt}
                        previousPrompt={previousPrompt}
                      />
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-600">
              Current Image Preview
            </h3>
            {currentImageUrl ? (
              <>
                <AnnotationPins
                  imageUrl={currentImageUrl}
                  isReadOnly={!canEdit}
                  onAddPin={setPendingPin}
                  pins={commentsForCurrentVersion}
                  selectedPin={pendingPin}
                />
                <p className="mt-2 text-xs text-stone-500">
                  {canEdit
                    ? "Click the image to drop an annotation pin before posting a comment."
                    : "Viewer role is read-only."}
                </p>
              </>
            ) : (
              <div className="rounded-md border border-dashed border-stone-300 bg-white p-4 text-sm text-stone-500">
                This version has no accessible image URL.
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-600">
              Comments
            </h3>
            <form className="space-y-2" onSubmit={handleCommentSubmit}>
              <textarea
                className="min-h-20 w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-stone-500"
                disabled={!canEdit}
                onChange={(event) => setDraftComment(event.target.value)}
                placeholder={
                  currentVersion
                    ? canEdit
                      ? "Share feedback for this version..."
                      : "Viewer role is read-only."
                    : "Select or generate a version before commenting."
                }
                value={draftComment}
              />

              {pendingPin ? (
                <p className="text-xs text-stone-600">
                  Pending pin at {pendingPin.x.toFixed(2)}%, {pendingPin.y.toFixed(2)}%
                </p>
              ) : null}

              <div className="flex gap-2">
                <button
                  className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!canEdit || !currentVersion || !draftComment.trim()}
                  type="submit"
                >
                  Add comment
                </button>
                {pendingPin ? (
                  <button
                    className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700"
                    onClick={() => setPendingPin(null)}
                    type="button"
                  >
                    Clear pin
                  </button>
                ) : null}
              </div>
            </form>

            <div className="mt-3 space-y-2">
              {commentsForCurrentVersion.map((comment) => (
                <article className="rounded-md border border-stone-200 bg-white p-2" key={comment.id}>
                  <p className="text-sm text-stone-800">{comment.body}</p>
                  <p className="mt-1 text-xs text-stone-500">
                    {comment.x !== null && comment.y !== null
                      ? `Pinned at ${comment.x.toFixed(2)}%, ${comment.y.toFixed(2)}%`
                      : "No pin"}
                    {" • "}
                    {new Date(comment.created_at).toLocaleString()}
                  </p>
                </article>
              ))}

              {commentsForCurrentVersion.length === 0 ? (
                <p className="text-sm text-stone-500">No comments on this version yet.</p>
              ) : null}
            </div>
          </section>
        </div>
      )}
    </aside>
  );
}
