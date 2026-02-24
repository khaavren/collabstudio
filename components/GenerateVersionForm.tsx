"use client";

import { useEffect, useState } from "react";
import type { GeneratePayload } from "@/lib/types";

type GenerateVersionFormProps = {
  isGenerating: boolean;
  onGenerate: (payload: GeneratePayload) => Promise<void>;
  selectedAssetTitle?: string;
};

export function GenerateVersionForm({
  isGenerating,
  onGenerate,
  selectedAssetTitle
}: GenerateVersionFormProps) {
  const [title, setTitle] = useState(selectedAssetTitle ?? "");
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("1024x1024");
  const [style, setStyle] = useState("product-sketch");

  useEffect(() => {
    if (selectedAssetTitle) {
      setTitle(selectedAssetTitle);
    }
  }, [selectedAssetTitle]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return;

    await onGenerate({
      title: title.trim() || undefined,
      prompt: trimmedPrompt,
      size,
      style
    });

    setPrompt("");
  }

  return (
    <form className="space-y-3 rounded-lg border border-stone-300 bg-white p-3" onSubmit={handleSubmit}>
      {!selectedAssetTitle ? (
        <label className="block text-xs font-medium text-stone-700">
          Asset title
          <input
            className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm outline-none focus:border-stone-500"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Band Joes concept title"
            value={title}
          />
        </label>
      ) : null}

      <label className="block text-xs font-medium text-stone-700">
        Prompt
        <textarea
          className="mt-1 min-h-20 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm outline-none focus:border-stone-500"
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Describe the concept image to generate..."
          required
          value={prompt}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs font-medium text-stone-700">
          Size
          <select
            className="mt-1 w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-stone-500"
            onChange={(event) => setSize(event.target.value)}
            value={size}
          >
            <option value="1024x1024">1024x1024</option>
            <option value="768x768">768x768</option>
            <option value="512x512">512x512</option>
          </select>
        </label>

        <label className="block text-xs font-medium text-stone-700">
          Style
          <input
            className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm outline-none focus:border-stone-500"
            onChange={(event) => setStyle(event.target.value)}
            placeholder="product-sketch"
            value={style}
          />
        </label>
      </div>

      <button
        className="w-full rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isGenerating}
        type="submit"
      >
        {isGenerating ? "Generating..." : "Generate"}
      </button>
    </form>
  );
}
