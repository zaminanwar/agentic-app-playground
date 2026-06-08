// Server-side upload route for RFP PDFs.
//
// The browser POSTs a PDF here (multipart/form-data, field "file"). This handler
// streams it into the private RFP_BUCKET and returns a gs:// pointer the caller
// hands to the agent (the orchestrator calls `ingest_rfp` on it). Keeping the
// upload server-side means the bucket stays private and the browser never needs
// GCS credentials — same trust model as the agent BFF proxy.
//
// Auth: we reuse google-auth-library (already a dependency) to mint a GCS access
// token from Application Default Credentials (the web runtime service account,
// granted roles/storage.objectCreator on the bucket by Terraform), then call the
// GCS JSON upload API directly. This avoids pulling in @google-cloud/storage.
//
// Locally (no GCP credentials / no RFP_BUCKET) this returns a clear 500; the
// upload+ingest path is exercised on the dev Cloud Run deploy.

import { GoogleAuth } from "google-auth-library";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read/write scope so the web SA can create objects in the bucket.
const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
});

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB — generous for a 100+ page digital RFP.

/** Make an object name safe and unique while keeping the original filename. */
function buildObjectName(filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  return `uploads/${stamp}-${safe || "rfp.pdf"}`;
}

export async function POST(request: NextRequest): Promise<Response> {
  const bucket = process.env.RFP_BUCKET?.trim();
  if (!bucket) {
    return NextResponse.json(
      {
        error:
          "RFP_BUCKET is not set. The web service must receive the RFP bucket " +
          "name as a server-side env var (wired by Terraform in deployed envs).",
      },
      { status: 500 },
    );
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const entry = form.get("file");
    if (entry instanceof File) {
      file = entry;
    }
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with a 'file' field." },
      { status: 400 },
    );
  }

  if (!file) {
    return NextResponse.json(
      { error: "No file provided under the 'file' field." },
      { status: 400 },
    );
  }
  if (file.type && file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
    return NextResponse.json(
      { error: "Only PDF uploads are supported in Phase 1." },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB).` },
      { status: 413 },
    );
  }

  let token: string | null | undefined;
  try {
    token = await auth.getAccessToken();
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to obtain GCS credentials for the upload.",
        detail: (err as Error).message,
      },
      { status: 502 },
    );
  }
  if (!token) {
    return NextResponse.json(
      { error: "Empty GCS access token; check the web service account credentials." },
      { status: 502 },
    );
  }

  const objectName = buildObjectName(file.name);
  const uploadUrl =
    `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o` +
    `?uploadType=media&name=${encodeURIComponent(objectName)}`;

  const bytes = await file.arrayBuffer();

  let gcsResponse: Response;
  try {
    gcsResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/pdf",
      },
      body: bytes,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to reach Google Cloud Storage.", detail: (err as Error).message },
      { status: 502 },
    );
  }

  if (!gcsResponse.ok) {
    const detail = await gcsResponse.text().catch(() => "");
    return NextResponse.json(
      { error: `GCS upload failed (${gcsResponse.status}).`, detail },
      { status: 502 },
    );
  }

  return NextResponse.json({
    gsUri: `gs://${bucket}/${objectName}`,
    bucket,
    object: objectName,
    filename: file.name,
  });
}
