import { errorResponse, json } from "@/lib/api";
import { requireUser } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { Profile } from "@/lib/models";
import { profileUpdateSchema } from "@/lib/schemas";
import { auditLog } from "@/lib/audit";

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    await connectDb();
    const input = profileUpdateSchema.parse(await request.json());
    const name = [input.firstName, input.lastName].filter(Boolean).join(" ").trim();

    const profile = await Profile.findOneAndUpdate(
      { email: user.email },
      { $set: { name } },
      { new: true },
    ).lean();

    await auditLog({ actor: user.email, action: "profile.updated", target: user.email, payload: { name } });
    return json({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}
