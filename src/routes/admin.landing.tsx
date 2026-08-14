import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/landing")({
  head: () => ({
    meta: [
      { title: "Landing Experience · KRMU Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
