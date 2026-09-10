import { respond } from '@/api/http';
import { loadPolicy } from '@/policy/load';

/** The YAML policy as loaded, so the UI can show the rules and threshold in force. */
export async function GET() {
  return respond(async () => ({ policy: loadPolicy() }));
}
