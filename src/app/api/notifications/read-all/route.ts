import { errorResponse, json } from "@/lib/api";
import { requireUser } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { AppNotification } from "@/lib/models";

export async function POST() {
  try {
    const user = await requireUser();
    await connectDb();
    const result = await AppNotification.updateMany({ recipient: user.email, read: false }, { $set: { read: true } });
    return json({ updated: result.modifiedCount });
  } catch (error) {
    return errorResponse(error);
  }
}
