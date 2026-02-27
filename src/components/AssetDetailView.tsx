import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Image as ImageIcon,
  Pencil,
  RotateCw,
  Send,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CommentThread } from "@/components/CommentThread";
import { EditAssetModal } from "@/components/EditAssetModal";
import { TagChip } from "@/components/TagChip";
import { placeholderUrl, timeAgo } from "@/lib/utils";
import type { Annotation, AssetVersion, AssetWithTags, Comment } from "@/lib/types";

type AssetDetailViewProps = {
  activeVersionId: string | null;
  annotations: Annotation[];
  asset: AssetWithTags;
  comments: Comment[];
  onAddComment: (content: string) => Promise<void>;
  onBack: () => void;
  onAssetUpdate: (updated: {
    id: string;
    title: string;
    tags: string[];
    description: string;
  }) => Promise<boolean>;
  onAssetDelete: (assetId: string) => Promise<boolean>;
  onCreateVariant: (version: AssetVersion) => void;
  onDeleteVersion: (version: AssetVersion) => void;
  onRegenerate: (version: AssetVersion) => void;
  onSelectVersion: (versionId: string) => void;
  onSendPrompt: (prompt: string, referenceFile: File | null) => Promise<void>;
  versions: AssetVersion[];
};

type ConversationMessage =
  | {
      id: string;
      type: "prompt";
      versionId: string;
      versionLabel: string;
      author: string;
      timestamp: string;
      content: string;
      outputType: "image" | "text";
      size: string;
      style: string;
    }
  | {
      id: string;
      type: "generation";
      versionId: string;
      versionLabel: string;
      author: "AI Assistant";
      timestamp: string;
      imageUrl: string | null;
      responseText: string | null;
      hideImage?: boolean;
      annotations: Annotation[];
      sourceVersion: AssetVersion;
    };

function normalizeAssistantMarkdown(rawText: string) {
  const normalized = rawText
    .replace(/\r\n/g, "\n")
    .replace(/\\\*/g, "*")
    .replace(/\s+(##\s+)/g, "\n\n$1")
    .replace(/\s+(###\s+)/g, "\n\n$1")
    .replace(/\s+(####\s+)/g, "\n\n$1")
    .replace(/\s+-\s+/g, "\n- ")
    .replace(/\s+(\d+\)\s+)/g, "\n$1")
    .replace(/\s+(\d+\.\s+)/g, "\n$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized.length > 0 ? normalized : rawText;
}

function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString();
}

function PromptMessage({ message }: { message: Extract<ConversationMessage, { type: "prompt" }> }) {
  const avatarUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(message.author)}`;

  return (
    <div className="flex items-start gap-3">
      <img alt={message.author} className="mt-1 h-8 w-8 shrink-0 rounded-full" src={avatarUrl} />

      <div className="flex-1 space-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-[var(--foreground)]">{message.author}</span>
          <span className="text-xs text-[var(--muted-foreground)]">{message.timestamp}</span>
        </div>

        <div className="max-w-3xl rounded-2xl rounded-tl-sm bg-[color-mix(in_srgb,var(--accent)_70%,white)] px-4 py-3">
          <p className="text-sm leading-relaxed text-[var(--foreground)]">{message.content}</p>
          {message.outputType === "image" ? (
            <div className="mt-2 flex gap-4 border-t border-[var(--border)] pt-2 text-xs text-[var(--muted-foreground)]">
              <span>Size: {message.size}</span>
              <span>Style: {message.style}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function GenerationMessage({
  isActive,
  message,
  onCreateVariant,
  onDeleteVersion,
  onImageClick,
  onRegenerate
}: {
  isActive: boolean;
  message: Extract<ConversationMessage, { type: "generation" }>;
  onCreateVariant: (version: AssetVersion) => void;
  onDeleteVersion: (version: AssetVersion) => void;
  onImageClick: (imageUrl: string) => void;
  onRegenerate: (version: AssetVersion) => void;
}) {
  const isImageResponse = Boolean(message.imageUrl) && !message.hideImage;

  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--primary)_20%,white)]">
        <Sparkles className="h-4 w-4 text-[var(--primary)]" />
      </div>

      <div className="flex-1 space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-[var(--foreground)]">AI Assistant</span>
          <span className="text-xs text-[var(--muted-foreground)]">{message.timestamp}</span>
          <span className="text-xs font-medium text-[var(--primary)]">{message.versionLabel}</span>
          {isActive ? (
            <span className="rounded-full bg-[color-mix(in_srgb,var(--primary)_20%,white)] px-2 py-0.5 text-[10px] font-semibold text-[var(--primary)]">
              Current
            </span>
          ) : null}
        </div>

        {isImageResponse ? (
          <>
            {message.responseText ? (
              <div className="max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)]">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => <h3 className="mb-2 mt-1 text-base font-semibold">{children}</h3>,
                    h2: ({ children }) => <h4 className="mb-2 mt-1 text-sm font-semibold">{children}</h4>,
                    h3: ({ children }) => <h5 className="mb-2 mt-1 text-sm font-semibold">{children}</h5>,
                    p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
                    ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5">{children}</ul>,
                    ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5">{children}</ol>,
                    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                    em: ({ children }) => <em className="italic">{children}</em>,
                    hr: () => <hr className="my-3 border-[var(--border)]" />,
                    blockquote: ({ children }) => (
                      <blockquote className="mb-2 border-l-2 border-[var(--border)] pl-3 text-[var(--muted-foreground)]">
                        {children}
                      </blockquote>
                    ),
                    code: ({ children, className }) =>
                      className ? (
                        <code className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-xs">{children}</code>
                      ) : (
                        <code className="rounded bg-[var(--accent)] px-1 py-0.5 text-xs">{children}</code>
                      )
                  }}
                  remarkPlugins={[remarkGfm]}
                >
                  {normalizeAssistantMarkdown(message.responseText)}
                </ReactMarkdown>
              </div>
            ) : null}
            <button
              className="group relative block w-full max-w-2xl overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--muted)] text-left"
              onClick={() => {
                if (message.imageUrl) {
                  onImageClick(message.imageUrl);
                }
              }}
              type="button"
            >
              <img alt={`Generated ${message.versionLabel}`} className="h-auto w-full" src={message.imageUrl ?? ""} />

              {message.annotations.map((annotation) => (
                <span
                  className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-medium text-white shadow-lg transition-transform hover:scale-110"
                  key={`${message.id}-ann-${annotation.id}`}
                  style={{
                    left: `${annotation.x_position}%`,
                    top: `${annotation.y_position}%`
                  }}
                  title={`Pin ${annotation.number}`}
                >
                  {annotation.number}
                </span>
              ))}

              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/5 group-hover:opacity-100">
                <span className="rounded-lg bg-[var(--card)]/95 px-3 py-1.5 text-sm text-[var(--foreground)]">
                  Click to expand
                </span>
              </div>
            </button>

            <div className="flex items-center gap-3">
              <button
                className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
                onClick={() => onRegenerate(message.sourceVersion)}
                type="button"
              >
                <RotateCw className="h-3.5 w-3.5" />
                Regenerate
              </button>
              <button
                className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
                onClick={() => onCreateVariant(message.sourceVersion)}
                type="button"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                Create Variant
              </button>
              <button
                className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] transition hover:text-[#b54a3f]"
                onClick={() => onDeleteVersion(message.sourceVersion)}
                type="button"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Turn
              </button>
            </div>
          </>
        ) : (
          <div className="max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)]">
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h3 className="mb-2 mt-1 text-base font-semibold">{children}</h3>,
                h2: ({ children }) => <h4 className="mb-2 mt-1 text-sm font-semibold">{children}</h4>,
                h3: ({ children }) => <h5 className="mb-2 mt-1 text-sm font-semibold">{children}</h5>,
                p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
                ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5">{children}</ul>,
                ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5">{children}</ol>,
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                em: ({ children }) => <em className="italic">{children}</em>,
                hr: () => <hr className="my-3 border-[var(--border)]" />,
                blockquote: ({ children }) => (
                  <blockquote className="mb-2 border-l-2 border-[var(--border)] pl-3 text-[var(--muted-foreground)]">
                    {children}
                  </blockquote>
                ),
                code: ({ children, className }) =>
                  className ? (
                    <code className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-xs">{children}</code>
                  ) : (
                    <code className="rounded bg-[var(--accent)] px-1 py-0.5 text-xs">{children}</code>
                  )
              }}
              remarkPlugins={[remarkGfm]}
            >
              {normalizeAssistantMarkdown(message.responseText ?? "No text response returned.")}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

function PromptInputBar({
  isSending,
  onSend,
  onReferenceFileChange,
  value,
  onChange,
  referenceFile
}: {
  isSending: boolean;
  onSend: () => void;
  onReferenceFileChange: (file: File | null) => void;
  value: string;
  onChange: (value: string) => void;
  referenceFile: File | null;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const referencePreviewUrl = useMemo(
    () => (referenceFile ? URL.createObjectURL(referenceFile) : null),
    [referenceFile]
  );

  useEffect(() => {
    return () => {
      if (referencePreviewUrl) {
        URL.revokeObjectURL(referencePreviewUrl);
      }
    };
  }, [referencePreviewUrl]);

  function resizeTextarea() {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
  }

  useEffect(() => {
    resizeTextarea();
  }, [value]);

  return (
    <div className="shrink-0 border-t border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mx-auto flex max-w-4xl items-end gap-3">
        <div className="relative flex-1">
          {referenceFile && referencePreviewUrl ? (
            <div className="mb-2 flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--accent)] px-2 py-2">
              <img
                alt="Reference attachment"
                className="h-11 w-11 rounded-md border border-[var(--border)] object-cover"
                src={referencePreviewUrl}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-[var(--foreground)]">
                  {referenceFile.name || "Pasted image"}
                </p>
                <p className="text-[11px] text-[var(--muted-foreground)]">Reference image attached</p>
              </div>
              <button
                className="rounded-md p-1 text-[var(--muted-foreground)] transition hover:bg-[var(--card)] hover:text-[var(--foreground)]"
                onClick={() => onReferenceFileChange(null)}
                title="Remove reference image"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}
          <textarea
            className="min-h-[52px] max-h-32 w-full resize-none rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--accent)_60%,white)] px-4 py-3 pr-12 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--primary)_50%,white)]"
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            onPaste={(event) => {
              const imageItem = Array.from(event.clipboardData.items).find(
                (item) => item.kind === "file" && item.type.startsWith("image/")
              );

              if (!imageItem) return;

              const file = imageItem.getAsFile();
              if (!file) return;

              const extension = file.type.split("/")[1] || "png";
              const filename = file.name || `clipboard-image-${Date.now()}.${extension}`;
              onReferenceFileChange(new File([file], filename, { type: file.type }));
            }}
            placeholder="Describe your next iteration..."
            ref={textareaRef}
            rows={1}
            value={value}
          />
          <button
            className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)] text-white transition hover:opacity-90 disabled:opacity-40"
            disabled={isSending || !value.trim()}
            onClick={onSend}
            type="button"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-[var(--muted-foreground)]">
        Press Enter to send · Shift + Enter for new line · Paste image with Cmd/Ctrl + V
      </p>
    </div>
  );
}

function ImageLightbox({ imageUrl, onClose }: { imageUrl: string; onClose: () => void }) {
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
      onClick={onClose}
      role="presentation"
    >
      <button
        aria-label="Close image"
        className="absolute right-4 top-4 rounded-lg bg-white/10 p-2 text-white transition hover:bg-white/20"
        onClick={onClose}
        type="button"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        alt="Expanded generation"
        className="max-h-full max-w-full rounded-lg object-contain"
        onClick={(event) => event.stopPropagation()}
        src={imageUrl}
      />
    </div>
  );
}

export function AssetDetailView({
  activeVersionId,
  annotations,
  asset,
  comments,
  onAddComment,
  onBack,
  onAssetDelete,
  onAssetUpdate,
  onCreateVariant,
  onDeleteVersion,
  onRegenerate,
  onSelectVersion,
  onSendPrompt,
  versions
}: AssetDetailViewProps) {
  const [promptInput, setPromptInput] = useState("");
  const [promptReferenceFile, setPromptReferenceFile] = useState<File | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isSendingPrompt, setIsSendingPrompt] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const conversationBottomRef = useRef<HTMLDivElement>(null);
  const generationRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const previousMessageCountRef = useRef(0);

  const chronologicalVersions = useMemo(
    () =>
      [...versions].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    [versions]
  );

  const latestVersionId = chronologicalVersions[chronologicalVersions.length - 1]?.id ?? null;
  const activeVersion =
    versions.find((version) => version.id === activeVersionId) ??
    chronologicalVersions[chronologicalVersions.length - 1] ??
    null;

  const conversationThread = useMemo<ConversationMessage[]>(() => {
    return chronologicalVersions.flatMap((version) => {
      const imageUrl = version.image_url ?? (version.id === latestVersionId
        ? asset.image_url
        : placeholderUrl(version.prompt, version.size || "1024x1024"));
      const outputType = version.output_type ?? "image";
      const isImageOutput = outputType !== "text";
      const hideInitialImage = isImageOutput && version.version === "v1" && Boolean(version.response_text);

      return [
        {
          id: `prompt-${version.id}`,
          type: "prompt",
          versionId: version.id,
          versionLabel: version.version,
          author: version.editor,
          timestamp: formatTimestamp(version.created_at),
          content: version.prompt,
          outputType: outputType === "text" ? "text" : "image",
          size: version.size,
          style: version.style
        },
        {
          id: `generation-${version.id}`,
          type: "generation",
          versionId: version.id,
          versionLabel: version.version,
          author: "AI Assistant",
          timestamp: formatTimestamp(version.created_at),
          imageUrl: isImageOutput ? imageUrl : null,
          responseText: version.response_text,
          hideImage: hideInitialImage,
          annotations: isImageOutput ? annotations : [],
          sourceVersion: version
        }
      ];
    });
  }, [annotations, asset.image_url, chronologicalVersions, latestVersionId]);

  useEffect(() => {
    const nextCount = conversationThread.length;
    const previousCount = previousMessageCountRef.current;

    if (nextCount > previousCount && conversationBottomRef.current) {
      conversationBottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }

    previousMessageCountRef.current = nextCount;
  }, [conversationThread.length]);

  async function handleSendPrompt() {
    const trimmed = promptInput.trim();
    if (!trimmed || isSendingPrompt) return;

    setIsSendingPrompt(true);
    try {
      await onSendPrompt(trimmed, promptReferenceFile);
      setPromptInput("");
      setPromptReferenceFile(null);
    } finally {
      setIsSendingPrompt(false);
    }
  }

  async function handleSaveAsset(data: {
    title: string;
    tags: string[];
    description: string;
  }) {
    const ok = await onAssetUpdate({
      id: asset.id,
      title: data.title,
      tags: data.tags,
      description: data.description
    });
    if (ok) {
      setIsEditModalOpen(false);
    }
  }

  async function handleDeleteAsset() {
    const ok = await onAssetDelete(asset.id);
    if (ok) {
      setIsEditModalOpen(false);
      onBack();
    }
  }

  function scrollToVersion(versionId: string) {
    onSelectVersion(versionId);
    generationRefs.current[versionId]?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[var(--background)]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--card)] px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm text-[var(--foreground)] transition hover:bg-[var(--accent)]"
            onClick={onBack}
            type="button"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-medium text-[var(--foreground)]">{asset.title}</h2>
              <button
                className="rounded-md p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
                onClick={() => setIsEditModalOpen(true)}
                title="Edit project details"
                type="button"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {asset.tags.map((tag) => (
                <TagChip key={`${asset.id}-detail-${tag}`}>{tag}</TagChip>
              ))}
            </div>
            {asset.description ? (
              <p className="mt-2 line-clamp-2 text-sm text-[var(--muted-foreground)]">
                {asset.description}
              </p>
            ) : null}
          </div>
        </div>

        <p className="text-sm text-[var(--muted-foreground)]">
          Current: <span className="font-medium text-[var(--foreground)]">{activeVersion?.version ?? asset.current_version}</span>
        </p>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-6">
              {conversationThread.map((message) =>
                message.type === "prompt" ? (
                  <PromptMessage key={message.id} message={message} />
                ) : (
                  <div
                    key={message.id}
                    ref={(element) => {
                      generationRefs.current[message.versionId] = element;
                    }}
                  >
                    <GenerationMessage
                      isActive={message.versionId === (activeVersion?.id ?? latestVersionId)}
                      message={message}
                      onCreateVariant={onCreateVariant}
                      onDeleteVersion={onDeleteVersion}
                      onImageClick={setSelectedImage}
                      onRegenerate={onRegenerate}
                    />
                  </div>
                )
              )}
              <div ref={conversationBottomRef} />
            </div>
          </div>

          <PromptInputBar
            isSending={isSendingPrompt}
            onChange={setPromptInput}
            onReferenceFileChange={setPromptReferenceFile}
            onSend={handleSendPrompt}
            referenceFile={promptReferenceFile}
            value={promptInput}
          />
        </div>

        <aside className="w-80 shrink-0 border-l border-[var(--border)] bg-[var(--card)]">
          <div className="flex h-full flex-col overflow-y-auto">
            <section className="border-b border-[var(--border)] p-4">
              <h3 className="mb-3 text-sm font-medium text-[var(--foreground)]">Version Quick Nav</h3>
              <div className="space-y-2">
                {[...chronologicalVersions].reverse().map((version) => (
                  <button
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                      version.id === (activeVersion?.id ?? latestVersionId)
                        ? "border-[color-mix(in_srgb,var(--primary)_50%,white)] bg-[var(--accent)]"
                        : "border-transparent hover:bg-[var(--accent)]"
                    }`}
                    key={version.id}
                    onClick={() => scrollToVersion(version.id)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[var(--foreground)]">{version.version}</span>
                      <span className="text-xs text-[var(--muted-foreground)]">{version.editor}</span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">{timeAgo(version.created_at)}</p>
                  </button>
                ))}
              </div>
            </section>

            <section className="p-4">
              <h3 className="mb-3 text-sm font-medium text-[var(--foreground)]">Team Comments</h3>
              <CommentThread comments={comments} onAddComment={onAddComment} />
            </section>
          </div>
        </aside>
      </div>

      {selectedImage ? <ImageLightbox imageUrl={selectedImage} onClose={() => setSelectedImage(null)} /> : null}

      <EditAssetModal
        assetDescription={asset.description}
        assetTags={asset.tags}
        assetTitle={asset.title}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onDelete={() => {
          void handleDeleteAsset();
        }}
        onSave={(data) => {
          void handleSaveAsset(data);
        }}
      />
    </div>
  );
}
