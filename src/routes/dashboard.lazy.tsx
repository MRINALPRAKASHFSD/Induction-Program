/**
 * /dashboard — The student's home after authentication.
 *
 * This file makes `/dashboard` the canonical post-login destination.
 * The underlying MyPassPage component is preserved at `/my-pass` for
 * internal backward-compatibility; students are always routed here.
 */
import { createLazyFileRoute } from "@tanstack/react-router";
import { MyPassPage } from "./my-pass.lazy";

export const Route = createLazyFileRoute("/dashboard")({
  component: MyPassPage,
});
