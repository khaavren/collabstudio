"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { SidebarRooms } from "@/components/SidebarRooms";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Room, TeamRole } from "@/lib/types";

type Membership = {
  organization_id: string;
  role: TeamRole;
};

export function RoomsIndexClient() {
  return (
    <AuthGate>
      {({ user, signOut }) => (
        <RoomsIndexShell
          onSignOut={signOut}
          userEmail={user.email}
          userId={user.id}
        />
      )}
    </AuthGate>
  );
}

function RoomsIndexShell({
  onSignOut,
  userEmail,
  userId
}: {
  onSignOut: () => Promise<void>;
  userEmail?: string;
  userId: string;
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreateRoom = membership?.role === "admin" || membership?.role === "editor";

  const loadRooms = useCallback(async () => {
    setIsLoading(true);

    const { data: membershipData, error: membershipError } = await supabase
      .from("team_members")
      .select("organization_id, role")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      setError(membershipError.message);
      setIsLoading(false);
      return;
    }

    if (!membershipData) {
      setMembership(null);
      setRooms([]);
      setIsLoading(false);
      return;
    }

    setMembership(membershipData as Membership);

    const { data: roomData, error: roomError } = await supabase
      .from("rooms")
      .select("*")
      .eq("organization_id", membershipData.organization_id)
      .order("created_at", { ascending: false });

    if (roomError) {
      setError(roomError.message);
    } else {
      setRooms(roomData ?? []);
      setError(null);
    }

    setIsLoading(false);
  }, [supabase, userId]);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  async function handleCreateRoom(name: string) {
    if (!membership || !canCreateRoom) return;

    setIsCreating(true);
    const { data, error: insertError } = await supabase
      .from("rooms")
      .insert({
        organization_id: membership.organization_id,
        name
      })
      .select("*")
      .single();

    setIsCreating(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "Failed to create room.");
      return;
    }

    setRooms((current) => [data, ...current]);
    setError(null);
    router.push(`/rooms/${data.id}`);
  }

  return (
    <main className="flex h-screen overflow-hidden">
      <div className="w-72 shrink-0">
        <SidebarRooms
          canCreateRoom={canCreateRoom}
          isCreating={isCreating}
          onCreateRoom={handleCreateRoom}
          onSelectRoom={(roomId) => router.push(`/rooms/${roomId}`)}
          rooms={rooms}
        />
      </div>

      <section className="flex flex-1 flex-col overflow-y-auto p-8">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-stone-900">Band Joes Studio</h1>
            <p className="mt-1 text-sm text-stone-600">
              Choose a room or create a new one to start concept development.
            </p>
          </div>
          <div className="text-right text-sm text-stone-600">
            <p>{userEmail}</p>
            <div className="mt-1 flex items-center justify-end gap-3">
              <Link className="font-medium text-accent hover:underline" href="/admin">
                Admin
              </Link>
              <button
                className="font-medium text-accent hover:underline"
                onClick={onSignOut}
                type="button"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        {error ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {!membership ? (
          <div className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-600">
            Your account is not assigned to a team yet. Ask an admin to invite you from the admin panel.
          </div>
        ) : isLoading ? (
          <p className="text-sm text-stone-600">Loading rooms...</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <button
                className="rounded-xl border border-stone-200 bg-white p-4 text-left shadow-sm transition hover:border-stone-400 hover:shadow"
                key={room.id}
                onClick={() => router.push(`/rooms/${room.id}`)}
                type="button"
              >
                <p className="text-sm font-semibold text-stone-900">{room.name}</p>
                <p className="mt-2 text-xs text-stone-500">
                  Created {new Date(room.created_at).toLocaleDateString()}
                </p>
              </button>
            ))}

            {rooms.length === 0 ? (
              <div className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-600">
                No rooms yet. {canCreateRoom ? "Create one from the sidebar." : "Viewer role is read-only."}
              </div>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}
