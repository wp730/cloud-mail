import orm from '../entity/orm';
import { oidcClient } from '../entity/oidc-client';
import { oidcGrant } from '../entity/oidc-grant';
import { desc, eq, inArray, like } from 'drizzle-orm';
import BizError from '../error/biz-error';
import constant from '../const/constant';
import { oidcConst } from '../const/entity-const';
import { base64url } from '../utils/jwt-utils';
import { t } from '../i18n/i18n.js';

const oidcClientService = {

	async add(c, params, userId) {

		const values = this.buildValues(params);
		values.clientId = crypto.randomUUID().replace(/-/g, '');
		values.clientSecret = values.clientType === oidcConst.clientType.PUBLIC ? '' : this.genSecret();
		values.userId = userId;

		const clientRow = await orm(c).insert(oidcClient).values(values).returning().get();
		return this.toView(clientRow, true);
	},

	async set(c, params) {

		const clientRow = await this.selectByClientId(c, params.clientId);

		if (!clientRow) {
			throw new BizError(t('oidcClientNotExist'));
		}

		const values = this.buildValues(params);

		//由机密客户端改为公开客户端时清掉密钥, 反之补发一个
		if (values.clientType === oidcConst.clientType.PUBLIC) {
			values.clientSecret = '';
		} else if (!clientRow.clientSecret) {
			values.clientSecret = this.genSecret();
		}

		await orm(c).update(oidcClient).set(values).where(eq(oidcClient.clientId, params.clientId)).run();
	},

	async list(c, params) {

		const { name } = params;
		let query = orm(c).select().from(oidcClient);

		if (name) {
			query = query.where(like(oidcClient.name, `%${name}%`));
		}

		const clientList = await query.orderBy(desc(oidcClient.oidcClientId)).all();
		return clientList.map(clientRow => this.toView(clientRow));
	},

	async delete(c, params) {
		let { oidcClientIds } = params;
		oidcClientIds = oidcClientIds.split(',').map(id => Number(id));

		const clientList = await orm(c).select().from(oidcClient).where(inArray(oidcClient.oidcClientId, oidcClientIds)).all();

		if (clientList.length === 0) {
			return;
		}

		const clientIds = clientList.map(clientRow => clientRow.clientId);

		await orm(c).delete(oidcClient).where(inArray(oidcClient.oidcClientId, oidcClientIds)).run();
		await orm(c).delete(oidcGrant).where(inArray(oidcGrant.clientId, clientIds)).run();
	},

	async resetSecret(c, params) {

		const clientRow = await this.selectByClientId(c, params.clientId);

		if (!clientRow) {
			throw new BizError(t('oidcClientNotExist'));
		}

		if (clientRow.clientType === oidcConst.clientType.PUBLIC) {
			throw new BizError(t('oidcClientNotExist'));
		}

		const clientSecret = this.genSecret();
		await orm(c).update(oidcClient).set({ clientSecret }).where(eq(oidcClient.clientId, params.clientId)).run();
		return { clientSecret };
	},

	async secret(c, params) {

		const clientRow = await this.selectByClientId(c, params.clientId);

		if (!clientRow) {
			throw new BizError(t('oidcClientNotExist'));
		}

		return { clientSecret: clientRow.clientSecret };
	},

	selectByClientId(c, clientId) {
		return orm(c).select().from(oidcClient).where(eq(oidcClient.clientId, clientId)).get();
	},

	buildValues(params) {

		const { name, logo, description, clientType, skipConsent, status, idTokenTtl, accessTokenTtl, refreshTokenTtl } = params;

		if (!name) {
			throw new BizError(t('oidcNameEmpty'));
		}

		const redirectUris = this.verifyUris(params.redirectUris, true);
		const postLogoutRedirectUris = this.verifyUris(params.postLogoutRedirectUris, false);
		const scopes = this.verifyScopes(params.scopes);

		return {
			name,
			logo: logo || '',
			description: description || '',
			redirectUris: JSON.stringify(redirectUris),
			postLogoutRedirectUris: JSON.stringify(postLogoutRedirectUris),
			scopes: scopes.join(','),
			clientType: clientType === oidcConst.clientType.PUBLIC ? oidcConst.clientType.PUBLIC : oidcConst.clientType.CONFIDENTIAL,
			skipConsent: skipConsent === oidcConst.skipConsent.OPEN ? oidcConst.skipConsent.OPEN : oidcConst.skipConsent.CLOSE,
			status: status === oidcConst.status.CLOSE ? oidcConst.status.CLOSE : oidcConst.status.OPEN,
			idTokenTtl: Number(idTokenTtl) || 3600,
			accessTokenTtl: Number(accessTokenTtl) || 7200,
			refreshTokenTtl: Number(refreshTokenTtl) || 2592000
		};
	},

	verifyUris(uris, required) {

		const uriList = (Array.isArray(uris) ? uris : String(uris || '').split('\n'))
			.map(uri => uri.trim())
			.filter(Boolean);

		if (uriList.length === 0) {
			if (required) {
				throw new BizError(t('oidcRedirectUriEmpty'));
			}
			return [];
		}

		uriList.forEach(uri => {
			let url;

			try {
				url = new URL(uri);
			} catch (e) {
				throw new BizError(t('oidcRedirectUriIllegal'));
			}

			if (!['http:', 'https:'].includes(url.protocol) || url.hash) {
				throw new BizError(t('oidcRedirectUriIllegal'));
			}
		});

		return uriList;
	},

	verifyScopes(scopes) {

		const scopeList = (Array.isArray(scopes) ? scopes : String(scopes || '').split(','))
			.map(scope => scope.trim())
			.filter(Boolean);

		if (!scopeList.includes('openid')) {
			scopeList.unshift('openid');
		}

		if (scopeList.some(scope => !constant.OIDC_SCOPES.includes(scope))) {
			throw new BizError(t('oidcScopeIllegal'));
		}

		return [...new Set(scopeList)];
	},

	//客户端密钥只在新建、查看、重置时返回明文, 列表里按系统设置的风格脱敏
	toView(clientRow, showSecret = false) {
		return {
			...clientRow,
			redirectUris: JSON.parse(clientRow.redirectUris),
			postLogoutRedirectUris: JSON.parse(clientRow.postLogoutRedirectUris),
			scopes: clientRow.scopes.split(',').filter(Boolean),
			clientSecret: showSecret || !clientRow.clientSecret
				? clientRow.clientSecret
				: `${clientRow.clientSecret.slice(0, 12)}******`
		};
	},

	genSecret() {
		const buff = new Uint8Array(48);
		crypto.getRandomValues(buff);
		return base64url(buff);
	}

};

export default oidcClientService;
