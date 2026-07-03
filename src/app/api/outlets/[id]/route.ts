import { badRequest, errorResponse, json } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/authz";
import { connectDb } from "@/lib/db";
import { Outlet, TicketRequest } from "@/lib/models";
import { outletMergeSchema, outletSchema } from "@/lib/schemas";
import { auditLog } from "@/lib/audit";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSuperAdmin();
    await connectDb();
    const { id } = await context.params;
    const input = outletSchema.partial().parse(await request.json());
    const outlet = await Outlet.findByIdAndUpdate(id, { $set: input }, { new: true }).lean();
    if (!outlet) return badRequest("Outlet not found.");
    await auditLog({ actor: user.email, action: "outlet.updated", target: id, payload: input });
    return json({ outlet });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSuperAdmin();
    await connectDb();
    const { id } = await context.params;
    const { targetOutletId } = outletMergeSchema.parse(await request.json());
    if (!targetOutletId || targetOutletId === id) return badRequest("Select a different target outlet for merge.");

    const [source, target] = await Promise.all([Outlet.findById(id), Outlet.findById(targetOutletId)]);
    if (!source || !target) return badRequest("Source or target outlet not found.");

    const result = await TicketRequest.updateMany({ outlet: source._id }, { $set: { outlet: target._id } });
    source.status = "archived";
    source.notes = `${source.notes ? `${source.notes}\n` : ""}Merged into ${target.name} by ${user.email}.`;
    await source.save();
    await auditLog({
      actor: user.email,
      action: "outlet.merged",
      target: id,
      payload: { targetOutletId, movedRequests: result.modifiedCount },
    });
    return json({ source, target, movedRequests: result.modifiedCount });
  } catch (error) {
    return errorResponse(error);
  }
}
