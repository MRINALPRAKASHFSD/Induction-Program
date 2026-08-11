import { createLazyFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/my-schedule")({
  component: MyScheduleRedirect,
});

function MyScheduleRedirect() {
  return <Navigate to="/schedule" replace />;
}
