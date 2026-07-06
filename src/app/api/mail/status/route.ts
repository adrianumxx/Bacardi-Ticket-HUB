import { errorResponse, json } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { AppNotification } from "@/lib/models";
import { mailHealth } from "@/lib/mail";

export async function GET() {
  try {
    await requireSuperAdmin();
    await connectDb();
    const lastFailed = await AppNotification.findOne({ emailStatus: "failed", emailError: { $ne: "" } })
      .sort({ createdAt: -1 })
      .select("emailError createdAt")
      .lean();

    return json({
      mail: mailHealth(lastFailed?.emailError || ""),
      lastError: lastFailed?.emailError || "",
      lastErrorAt: lastFailed?.createdAt || "",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
