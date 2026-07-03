import { errorResponse, json } from "@/lib/api";
import { requireUser } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { AppNotification } from "@/lib/models";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    await connectDb();
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") || "all";
    const category = searchParams.get("category") || "all";

    const query: Record<string, unknown> = { recipient: user.email };
    if (filter === "unread") query.read = false;
    if (category !== "all") query.category = category;

    const [notifications, unreadCount] = await Promise.all([
      AppNotification.find(query).sort({ createdAt: -1 }).limit(80).lean(),
      AppNotification.countDocuments({ recipient: user.email, read: false }),
    ]);

    return json({ notifications, unreadCount });
  } catch (error) {
    return errorResponse(error);
  }
}
