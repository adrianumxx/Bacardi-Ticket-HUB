import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      role?: "super_admin" | "workspace_manager" | "account_manager";
      status?: "active" | "blocked";
    } & DefaultSession["user"];
  }
}
