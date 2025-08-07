export interface Session {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: "Bearer";
}

export interface TokenPayload {
  sub: string;
  email: string;
  exp: number;
  iat: number;
  iss: string;
  jti: string;
}
