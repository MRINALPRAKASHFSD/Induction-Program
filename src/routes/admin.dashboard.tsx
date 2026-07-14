import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard · KRMU Admin" }, { name: "robots", content: "noindex" }],
  }),
});
