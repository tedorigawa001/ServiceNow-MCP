/** Fixture-only response policy. Returns no token, OAuth error description or raw response. */
export type FixtureOAuthDetail='oauth_response_invalid'|'oauth_lifetime_insufficient';
export function validateFixtureOAuthResponse(data:unknown,deadlineMs:number):
  Readonly<{ok:true}|{ok:false;detail:FixtureOAuthDetail}>{
  const invalid=()=>Object.freeze({ok:false as const,detail:'oauth_response_invalid' as const});
  if(!data||typeof data!=='object'||Array.isArray(data)||Object.hasOwn(data,'error'))return invalid();
  const value=data as Record<string,unknown>;
  if(typeof value.access_token!=='string'||value.access_token.length>8192||!value.access_token.trim()||/[\r\n]/.test(value.access_token)
    ||typeof value.expires_in!=='number'||!Number.isFinite(value.expires_in)||value.expires_in<=0
    ||value.token_type!==undefined&&(typeof value.token_type!=='string'||value.token_type.toLowerCase()!=='bearer'))return invalid();
  const lifetime=value.expires_in*1000;
  if(!Number.isFinite(lifetime)||!Number.isFinite(deadlineMs)||deadlineMs<1)return invalid();
  if(lifetime<=deadlineMs)return Object.freeze({ok:false,detail:'oauth_lifetime_insufficient'});
  return Object.freeze({ok:true});
}
