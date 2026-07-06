import { errorResponse, json } from "@/lib/api";
import { requireUser } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { Profile, TicketRequest } from "@/lib/models";
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
    const requests = await TicketRequest.updateMany({ requestedBy: user.email }, { $set: { accountManagerName: name } });

    await auditLog({ actor: user.email, action: "profile.updated", target: user.email, payload: { name, updatedRequests: requests.modifiedCount } });
    return json({ profile, updatedRequests: requests.modifiedCount });
  } catch (error) {
    return errorResponse(error);
  }
}
