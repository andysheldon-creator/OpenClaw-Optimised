import { NextResponse } from "next/server";
import { deleteJob } from "../../../../lib/db";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const deleted = deleteJob(id);

    if (!deleted) {
      return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
