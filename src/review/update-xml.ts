/** Internal-only code extraction. Never serialize the returned code to an MCP result. */
import { createHash } from 'node:crypto';
import { SaxesParser } from 'saxes';

export const XML_LIMITS = Object.freeze({ payload_bytes: 2 * 1024 * 1024,
  depth: 8, elements: 2048, text_bytes: 1024 * 1024, code_bytes: 256 * 1024 });
export class ExtractionError extends Error {
  constructor(public readonly reason: string) { super(reason); }
}
const reject = (reason: string): never => { throw new ExtractionError(reason); };
export const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const tables = new Set(['sys_script', 'sys_script_client', 'sys_script_include', 'sys_ws_operation', 'sysauto_script']);

export function extractReviewXml(payload: string, expectedName: string) {
  if (Buffer.byteLength(payload, 'utf8') > XML_LIMITS.payload_bytes) reject('payload_limit');
  const parser = new SaxesParser({ xmlns: false, defaultXMLVersion: '1.0' });
  const stack: string[] = [];
  const fields = new Map<string, string>();
  let table = '', records = 0, elements = 0, textBytes = 0;
  parser.on('error', () => reject('invalid_xml'));
  parser.on('doctype', () => reject('forbidden_dtd'));
  parser.on('processinginstruction', () => reject('forbidden_instruction'));
  parser.on('xmldecl', decl => { if (decl.version !== '1.0') reject('unsupported_xml_version'); });
  parser.on('opentag', tag => {
    if (++elements > XML_LIMITS.elements) reject('element_limit');
    if (stack.length >= XML_LIMITS.depth) reject('depth_limit');
    if (tag.name.includes(':') || Object.keys(tag.attributes).some(key => key === 'xmlns' || key.includes(':'))) reject('forbidden_namespace');
    stack.push(tag.name);
    if (stack.length === 1) {
      if (tag.name !== 'record_update' || !tables.has(String(tag.attributes.table))) reject('unsupported_envelope');
      table = String(tag.attributes.table);
    } else if (stack.length === 2) {
      if (++records !== 1 || tag.name !== table) reject('ambiguous_record');
      const action = tag.attributes.action;
      if (action === 'DELETE') reject('deleted_asset');
      if (action !== 'INSERT_OR_UPDATE') reject('unsupported_action');
    } else if (stack.length === 3) {
      if (fields.has(tag.name)) reject('duplicate_field');
      fields.set(tag.name, '');
    } else reject('nested_field');
  });
  const append = (text: string) => {
    textBytes += Buffer.byteLength(text, 'utf8');
    if (textBytes > XML_LIMITS.text_bytes) reject('text_limit');
    if (stack.length === 3) {
      const name = stack[2];
      fields.set(name, fields.get(name)! + text);
      if (name === 'script' && Buffer.byteLength(fields.get(name)!, 'utf8') > XML_LIMITS.code_bytes) reject('code_limit');
    } else if (text.trim()) reject('unexpected_text');
  };
  parser.on('text', append);
  parser.on('cdata', append);
  parser.on('closetag', () => { stack.pop(); });
  // Fixed chunks also bound event buffering; no entity resolvers, file or network callbacks.
  for (let offset = 0; offset < payload.length; offset += 4096) parser.write(payload.slice(offset, offset + 4096));
  parser.close();
  if (records !== 1 || !fields.has('script')) reject('missing_script');
  const id = fields.get('sys_id') ?? '';
  if (!/^[a-f0-9]{32}$/.test(id) || expectedName !== `${table}_${id}`) reject('identity_mismatch');
  const scope = fields.get('sys_scope') || null;
  if (scope !== null && scope !== 'global' && !/^[a-f0-9]{32}$/.test(scope)) reject('invalid_scope');
  return { table, sys_id: id, sys_scope: scope, code: fields.get('script')!,
    when: fields.get('when') ?? null, active: fields.get('active') ?? null,
    payload_hash: sha256(payload), code_hash: sha256(fields.get('script')!) };
}
