import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/scan/$token")({
  head: () => ({
    meta: [
      { title: "Mark Attendance · KRMU" },
      { name: "description", content: "Scan QR to mark attendance for KRMU induction events." },
      { name: "robots", content: "noindex" },
    ],
  }),
});
