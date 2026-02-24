"use client";

import type { MouseEvent } from "react";
import type { Comment } from "@/lib/types";

type AnnotationPinsProps = {
  imageUrl: string;
  isReadOnly?: boolean;
  onAddPin: (pin: { x: number; y: number }) => void;
  pins: Comment[];
  selectedPin?: { x: number; y: number } | null;
};

export function AnnotationPins({
  imageUrl,
  isReadOnly = false,
  onAddPin,
  pins,
  selectedPin = null
}: AnnotationPinsProps) {
  function handleImageClick(event: MouseEvent<HTMLDivElement>) {
    if (isReadOnly) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Number((((event.clientX - bounds.left) / bounds.width) * 100).toFixed(2));
    const y = Number((((event.clientY - bounds.top) / bounds.height) * 100).toFixed(2));
    onAddPin({ x, y });
  }

  return (
    <div
      className={`relative aspect-square w-full overflow-hidden rounded-lg border border-stone-300 bg-stone-100 ${
        isReadOnly ? "cursor-default" : "cursor-crosshair"
      }`}
      onClick={handleImageClick}
      role="button"
      tabIndex={0}
      onKeyDown={() => {
        // Click-only interaction for pin placement.
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="Current version preview" className="h-full w-full object-cover" src={imageUrl} />

      {pins
        .filter((comment) => comment.x !== null && comment.y !== null)
        .map((comment, index) => (
          <span
            className="absolute inline-flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-accent text-[10px] font-semibold text-white shadow"
            key={comment.id}
            style={{ left: `${comment.x}%`, top: `${comment.y}%` }}
            title={comment.body}
          >
            {index + 1}
          </span>
        ))}

      {selectedPin ? (
        <span
          className="absolute inline-flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-amber-500 text-[10px] font-semibold text-white shadow"
          style={{ left: `${selectedPin.x}%`, top: `${selectedPin.y}%` }}
          title="Pending pin"
        >
          +
        </span>
      ) : null}
    </div>
  );
}
