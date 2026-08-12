import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const oidcGrant = sqliteTable('oidc_grant', {
	grantId: integer('grant_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	clientId: text('client_id').notNull(),
	scope: text('scope').default('').notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
	updateTime: text('update_time')
});

export default oidcGrant
