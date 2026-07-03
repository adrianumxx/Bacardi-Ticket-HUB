import { AuditLog } from "@/lib/models";

type AuditInput = {
  actor: string;
  action: string;
  target?: string;
  payload?: unknown;
};

export async function auditLog(input: AuditInput) {
  await AuditLog.create({
    actor: input.actor,
    action: input.action,
    target: input.target || "",
    payload: input.payload,
  });
}
