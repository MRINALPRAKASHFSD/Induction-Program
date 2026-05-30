import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/my-pass")({
  beforeLoad: () => {
    throw redirect({ to: "/attendance", replace: true });
  },
});
