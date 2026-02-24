import { RoomBoardClient } from "@/components/RoomBoardClient";

export default function RoomDetailPage({
  params
}: {
  params: { roomId: string };
}) {
  return <RoomBoardClient roomId={params.roomId} />;
}
