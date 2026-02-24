"use client";

type PromptDiffViewerProps = {
  currentPrompt: string;
  previousPrompt?: string;
};

export function PromptDiffViewer({
  currentPrompt,
  previousPrompt = "No previous prompt available."
}: PromptDiffViewerProps) {
  return (
    <div className="mt-2 rounded-md border border-stone-200 bg-stone-50 p-2 text-xs text-stone-700">
      <p className="font-semibold text-stone-800">Prompt Diff</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <p className="mb-1 font-medium text-stone-600">Previous</p>
          <p className="rounded border border-stone-200 bg-white p-2 leading-relaxed">{previousPrompt}</p>
        </div>
        <div>
          <p className="mb-1 font-medium text-stone-600">Current</p>
          <p className="rounded border border-stone-200 bg-white p-2 leading-relaxed">{currentPrompt}</p>
        </div>
      </div>
    </div>
  );
}
