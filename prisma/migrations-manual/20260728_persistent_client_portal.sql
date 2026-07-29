-- Store the recoverable portal token encrypted with the application key.
-- Existing hashed-only links remain valid, but must be regenerated once
-- before their URL can be displayed again in the internal portal manager.
ALTER TABLE "client_portal_tokens"
ADD COLUMN "token_ciphertext" TEXT;
