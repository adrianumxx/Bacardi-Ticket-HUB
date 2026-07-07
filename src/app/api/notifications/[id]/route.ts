import { errorResponse, json, notFound } from "@/lib/api";
import { requireUser } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { markNotificationRead } from "@/lib/notifications";
import { AppNotification } from "@/lib/models";
import { normalizeEmail } from "@/lib/utils";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await connectDb();
    const { id } = await context.params;
    const input = (await request.json()) as { read?: boolean };
    const notification = await markNotificationRead(id, user.email, Boolean(input.read));
    if (!notification) return notFound("Notification not found.", "NOTIFICATION_NOT_FOUND");
    return json({ notification });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await connectDb();
    const { id } = await context.params;
    // Scoped to the requesting user's own inbox, same as markNotificationRead.
    const result = await AppNotification.deleteOne({ _id: id, recipient: normalizeEmail(user.email) });
    if (result.deletedCount === 0) return notFound("Notification not found.", "NOTIFICATION_NOT_FOUND");
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
