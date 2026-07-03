import { errorResponse, json, notFound } from "@/lib/api";
import { requireUser } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { markNotificationRead } from "@/lib/notifications";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await connectDb();
    const { id } = await context.params;
    const input = (await request.json()) as { read?: boolean };
    const notification = await markNotificationRead(id, user.email, Boolean(input.read));
    if (!notification) return notFound("Notification not found.");
    return json({ notification });
  } catch (error) {
    return errorResponse(error);
  }
}
