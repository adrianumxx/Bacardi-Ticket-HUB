import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function errorResponse(error: unknown) {
  if (error instanceof Response) return error;
  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.issues.map((issue) => issue.message).join(" "), code: "VALIDATION_ERROR" }, { status: 400 });
  }
  if (error instanceof Error && error.name === "CastError") {
    return NextResponse.json({ error: "Invalid record identifier.", code: "INVALID_ID" }, { status: 400 });
  }
  // Log the internal detail server-side but never leak it to the client.
  console.error("[api:unhandled]", {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json({ error: "Unexpected server error. Please try again.", code: "SERVER_ERROR" }, { status: 500 });
}

export function badRequest(message: string, code = "BAD_REQUEST") {
  return NextResponse.json({ error: message, code }, { status: 400 });
}

export function forbidden(message = "Forbidden") {
  return NextResponse.json({ error: message, code: "FORBIDDEN" }, { status: 403 });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ error: message, code: "NOT_FOUND" }, { status: 404 });
}

export function tooManyRequests(message = "Too many requests. Try again later.") {
  return NextResponse.json({ error: message, code: "RATE_LIMITED" }, { status: 429 });
}

export function serializeDoc<T>(doc: T): T {
  return JSON.parse(JSON.stringify(doc)) as T;
}
