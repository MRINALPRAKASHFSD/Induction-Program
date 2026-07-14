import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/scanner")({
  head: () => ({
    meta: [
      { title: "QR Scanner · KRMU Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
