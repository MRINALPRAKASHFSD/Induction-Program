import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/verification")({
  head: () => ({
    meta: [
      { title: "Allocation Verification · KRMU Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
