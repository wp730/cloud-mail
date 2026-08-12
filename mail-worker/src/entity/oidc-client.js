import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const oidcClient = sqliteTable('oidc_client', {
	oidcClientId: integer('oidc_client_id').primaryKey({ autoIncrement: true }),
	clientId: text('client_id').notNull(),
	clientSecret: text('client_secret').default('').notNull(),
	name: text('name').default('').notNull(),
	logo: text('logo').default('').notNull(),
	description: text('description').default('').notNull(),
	redirectUris: text('redirect_uris').default('[]').notNull(),
	postLogoutRedirectUris: text('post_logout_redirect_uris').default('[]').notNull(),
	scopes: text('scopes').default('openid,profile,email').notNull(),
	clientType: integer('client_type').default(0).notNull(),
	skipConsent: integer('skip_consent').default(1).notNull(),
	status: integer('status').default(0).notNull(),
	idTokenTtl: integer('id_token_ttl').default(3600).notNull(),
	accessTokenTtl: integer('access_token_ttl').default(7200).notNull(),
	refreshTokenTtl: integer('refresh_token_ttl').default(2592000).notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
	userId: integer('user_id').default(0).notNull()
});

export default oidcClient
