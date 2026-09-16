export type PublicGoogleConnectionInput = {
  id: string;
  googleAccountEmail: string;
  googleAccountId: string | null;
  scopes: string[];
  accessTokenEncrypted?: string;
  refreshTokenEncrypted?: string | null;
  tokenExpiresAt: Date;
  status: string;
  lastError: string | null;
  lastDiscoveredAt: Date | null;
  connectedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  disconnectedAt: Date | null;
};

export function toPublicConnection(connection: PublicGoogleConnectionInput | null) {
  if (!connection) return null;
  return {
    id: connection.id,
    googleAccountEmail: connection.googleAccountEmail,
    googleAccountId: connection.googleAccountId,
    scopes: connection.scopes,
    status: connection.status,
    lastError: connection.lastError,
    lastDiscoveredAt: connection.lastDiscoveredAt,
    connectedByUserId: connection.connectedByUserId,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    disconnectedAt: connection.disconnectedAt,
    tokenExpiresAt: connection.tokenExpiresAt,
    hasRefreshToken: Boolean(connection.refreshTokenEncrypted),
  };
}
