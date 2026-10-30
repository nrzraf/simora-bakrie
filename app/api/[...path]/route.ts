import { database } from "../../../server/db";
import { createService } from "../../../server/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const service = createService(database);
export const GET = service.handle;
export const POST = service.handle;
export const PATCH = service.handle;
export const DELETE = service.handle;
