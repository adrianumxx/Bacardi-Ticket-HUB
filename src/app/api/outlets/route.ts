import { errorResponse, json } from "@/lib/api";
import { requireUser } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { Outlet } from "@/lib/models";
import { outletSchema } from "@/lib/schemas";
import { notifyAdmins } from "@/lib/notifications";
import { auditLog } from "@/lib/audit";

export async function GET() {
  try {
    const user = await requireUser();
    await connectDb();
    const query = user.role === "super_admin" ? {} : { status: { $in: ["approved", "pending"] } };
    const outlets = await Outlet.find(query).sort({ status: 1, name: 1 }).lean();
    return json({ outlets });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await connectDb();
    const input = outletSchema.parse(await request.json());
    const outlet = await Outlet.create({
      ...input,
      status: user.role === "super_admin" ? input.status : "pending",
      proposedBy: user.email,
    });
    if (user.role === "super_admin") {
      await auditLog({ actor: user.email, action: "outlet.created", target: String(outlet._id), payload: { name: outlet.name } });
    } else {
      await notifyAdmins({
        actor: user.email,
        category: "outlets",
        entityType: "outlet",
        entityId: String(outlet._id),
        title: "New outlet proposed",
        message: `${user.name} proposed ${outlet.name} for review.`,
      });
    }
    return json({ outlet }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
