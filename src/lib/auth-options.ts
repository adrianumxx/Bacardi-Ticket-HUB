import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { ensureAllowedProfile } from "@/lib/auth-users";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/utils";

const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
    id: "email",
    name: "Email",
    credentials: {
      email: { label: "Email", type: "email" },
    },
    async authorize(credentials) {
      const email = normalizeEmail(credentials?.email || "");
      if (!email) return null;
      if (process.env.NODE_ENV === "production") {
        const limit = await rateLimit(`login:${email}`, 20, 60 * 60 * 1000);
        if (limit.limited) {
          console.warn("[auth:rate-limited]", { email });
          return null;
        }
      }
      try {
        const profile = await ensureAllowedProfile(email, email.split("@")[0], { touchLogin: true });
        if (!profile) return null;
        return {
          id: String(profile._id),
          email,
          name: profile.name || email,
        };
      } catch (error) {
        console.error("[auth:authorize-failed]", {
          email,
          name: error instanceof Error ? error.name : "UnknownError",
          message: error instanceof Error ? error.message : "Authentication failed.",
        });
        return null;
      }
    },
  }),
];

export const authOptions: NextAuthOptions = {
  providers,
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    // Keep users signed in across visits instead of forcing a re-login every
    // session -- explicit here so it doesn't depend on next-auth's defaults.
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // re-issue the session cookie once a day of activity
  },
  pages: { signIn: "/" },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      try {
        const profile = await ensureAllowedProfile(user.email, user.name, { touchLogin: true });
        return Boolean(profile);
      } catch (error) {
        console.error("[auth:signin-failed]", {
          email: user.email,
          name: error instanceof Error ? error.name : "UnknownError",
          message: error instanceof Error ? error.message : "Sign in failed.",
        });
        return false;
      }
    },
    async jwt({ token }) {
      if (token.email) {
        try {
          const profile = await ensureAllowedProfile(String(token.email), String(token.name || ""));
          if (profile) {
            token.id = String(profile._id);
            token.role = profile.role;
            token.status = profile.status;
            token.officialEmail = profile.officialEmail || "";
            token.preferredEmailApp = profile.preferredEmailApp || "default";
            // Keep the session's display name in sync with Settings updates:
            // ensureAllowedProfile never overwrites an existing name, so the DB
            // value here always reflects the latest save.
            if (profile.name) token.name = profile.name;
          }
        } catch (error) {
          // A transient DB hiccup while refreshing the token must not sign
          // the user out -- keep whatever role/status the token already has
          // and let API routes re-check access against the DB directly
          // (see authz.ts) on the next request. Only the initial sign-in and
          // every API call enforce access; this refresh is just a cache.
          console.error("[auth:jwt-refresh-failed]", {
            email: token.email,
            name: error instanceof Error ? error.name : "UnknownError",
            message: error instanceof Error ? error.message : "Token refresh failed.",
          });
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id || "");
        session.user.role = token.role as "super_admin" | "workspace_manager" | "account_manager";
        session.user.status = token.status as "active" | "blocked";
        session.user.officialEmail = String(token.officialEmail || "");
        session.user.preferredEmailApp = token.preferredEmailApp as "default" | "outlook_web" | "gmail";
      }
      return session;
    },
  },
};
