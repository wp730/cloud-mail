import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const oidcKey = sqliteTable('oidc_key', {
	keyId: integer('key_id').primaryKey({ autoIncrement: true }),
	kid: text('kid').notNull(),
	alg: text('alg').default('RS256').notNull(),
	publicJwk: text('public_jwk').notNull(),
	privateJwk: text('private_jwk').notNull(),
	status: integer('status').default(0).notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull()
});

export default oidcKey
