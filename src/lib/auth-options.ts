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
      const limit = rateLimit(`login:${email}`, 20, 60 * 60 * 1000);
      if (limit.limited) return null;
      const profile = await ensureAllowedProfile(email, email.split("@")[0]);
      if (!profile) return null;
      return {
        id: String(profile._id),
        email,
        name: profile.name || email,
      };
    },
  }),
];

export const authOptions: NextAuthOptions = {
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/" },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const profile = await ensureAllowedProfile(user.email, user.name);
      return Boolean(profile);
    },
    async jwt({ token }) {
      if (token.email) {
        const profile = await ensureAllowedProfile(String(token.email), String(token.name || ""));
        if (profile) {
          token.id = String(profile._id);
          token.role = profile.role;
          token.status = profile.status;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id || "");
        session.user.role = token.role as "super_admin" | "account_manager";
        session.user.status = token.status as "active" | "blocked";
      }
      return session;
    },
  },
};
