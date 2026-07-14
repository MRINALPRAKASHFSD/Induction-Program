import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/analytics")({
  head: () => ({ meta: [{ title: "Analytics · KRMU Admin" }, { name: "robots", content: "noindex" }] }),
});
