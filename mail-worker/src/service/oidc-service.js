import orm from '../entity/orm';
import { oidcGrant } from '../entity/oidc-grant';
import { and, eq } from 'drizzle-orm';
import OidcError from '../error/oidc-error';
import KvConst from '../const/kv-const';
import constant from '../const/constant';
import { isDel, oidcConst, settingConst, userConst } from '../const/entity-const';
import settingService from './setting-service';
import oidcClientService from './oidc-client-service';
import oidcKeyService from './oidc-key-service';
import userService from './user-service';
import accountService from './account-service';
import oauthService from './oauth-service';
import jwtUtils, { base64url } from '../utils/jwt-utils';
import dayjs from 'dayjs';

const encoder = new TextEncoder();

const oidcService = {

	//issuer留空时取当前请求的origin, 端点统一挂在 /api/oidc 下
	base(c, settingRow) {
		const issuer = settingRow.oidcIssuer?.trim();
		return (issuer || new URL(c.req.url).origin).replace(/\/+$/, '');
	},

	async setting(c) {
		const settingRow = await settingService.query(c);

		if (settingRow.oidc !== settingConst.oidc.OPEN) {
			throw new OidcError('temporarily_unavailable', 'The OIDC provider is not enabled', 503);
		}

		return settingRow;
	},

	async discovery(c) {

		const settingRow = await this.setting(c);
		const base = this.base(c, settingRow);

		return {
			issuer: base,
			authorization_endpoint: `${base}/api/oidc/authorize`,
			token_endpoint: `${base}/api/oidc/token`,
			userinfo_endpoint: `${base}/api/oidc/userinfo`,
			jwks_uri: `${base}/api/oidc/jwks`,
			end_session_endpoint: `${base}/api/oidc/logout`,
			scopes_supported: constant.OIDC_SCOPES,
			response_types_supported: ['code'],
			response_modes_supported: ['query'],
			grant_types_supported: ['authorization_code', 'refresh_token'],
			subject_types_supported: ['public'],
			id_token_signing_alg_values_supported: ['RS256'],
			token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
			code_challenge_methods_supported: ['S256'],
			claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'auth_time', 'nonce', 'name', 'preferred_username', 'picture', 'updated_at', 'email', 'email_verified']
		};
	},

	jwks(c) {
		return oidcKeyService.jwks(c);
	},

	//授权端点: 校验请求后落一条待确认记录, 跳转到前端同意页
	async authorize(c, params) {

		const settingRow = await this.setting(c);
		const base = this.base(c, settingRow);

		const {
			client_id: clientId,
			redirect_uri: redirectUri,
			response_type: responseType,
			scope,
			state,
			nonce,
			prompt,
			code_challenge: codeChallenge,
			code_challenge_method: codeChallengeMethod
		} = params;

		//client_id与redirect_uri未确认合法前不能回跳, 只能直接报错
		if (!clientId) {
			throw new OidcError('invalid_request', 'client_id is required');
		}

		const clientRow = await oidcClientService.selectByClientId(c, clientId);

		if (!clientRow || clientRow.status !== oidcConst.status.OPEN) {
			throw new OidcError('unauthorized_client', 'Unknown or disabled client');
		}

		const redirectUris = JSON.parse(clientRow.redirectUris);

		if (!redirectUri || !redirectUris.includes(redirectUri)) {
			throw new OidcError('invalid_request', 'redirect_uri is not registered for this client');
		}

		if (responseType !== 'code') {
			return this.errorRedirect(redirectUri, 'unsupported_response_type', 'Only the authorization code flow is supported', state);
		}

		const scopeList = String(scope || '').split(' ').map(item => item.trim()).filter(Boolean);

		if (!scopeList.includes('openid')) {
			return this.errorRedirect(redirectUri, 'invalid_scope', 'The openid scope is required', state);
		}

		const allowScopes = clientRow.scopes.split(',').filter(Boolean);

		if (scopeList.some(item => !allowScopes.includes(item))) {
			return this.errorRedirect(redirectUri, 'invalid_scope', 'The requested scope is not allowed for this client', state);
		}

		if (codeChallenge && codeChallengeMethod !== 'S256') {
			return this.errorRedirect(redirectUri, 'invalid_request', 'Only the S256 code_challenge_method is supported', state);
		}

		if (!codeChallenge && clientRow.clientType === oidcConst.clientType.PUBLIC) {
			return this.errorRedirect(redirectUri, 'invalid_request', 'PKCE is required for public clients', state);
		}

		const rid = crypto.randomUUID();

		await c.env.kv.put(KvConst.OIDC_REQ + rid, JSON.stringify({
			clientId,
			redirectUri,
			scope: scopeList.join(' '),
			state: state || '',
			nonce: nonce || '',
			prompt: prompt || '',
			codeChallenge: codeChallenge || ''
		}), { expirationTtl: constant.OIDC_REQ_EXPIRE });

		return `${base}/oidc/consent?rid=${rid}`;
	},

	//同意页渲染所需信息, 不含任何用户数据, rid本身是不可猜测的一次性标识
	async authInfo(c, params) {

		const { req, clientRow } = await this.selectReq(c, params.rid);

		return {
			clientName: clientRow.name,
			logo: clientRow.logo,
			description: clientRow.description,
			scopes: req.scope.split(' ').filter(Boolean),
			prompt: req.prompt,
			skipConsent: clientRow.skipConsent === oidcConst.skipConsent.OPEN
		};
	},

	//确认授权, 需登录态; silent为true时由后端判断能否免交互放行
	async confirm(c, params, userId) {

		await this.setting(c);

		const { rid, approve, silent } = params;
		const { req, clientRow } = await this.selectReq(c, rid);

		if (!approve) {
			await c.env.kv.delete(KvConst.OIDC_REQ + rid);
			return { redirectUri: this.errorRedirect(req.redirectUri, 'access_denied', 'The user denied the request', req.state) };
		}

		const grantRow = await orm(c).select().from(oidcGrant)
			.where(and(eq(oidcGrant.userId, userId), eq(oidcGrant.clientId, req.clientId)))
			.get();

		//已授权过相同scope, 或客户端配置了免确认, 才能不经交互直接放行
		const allowSilent = this.isGranted(grantRow, req.scope) || clientRow.skipConsent === oidcConst.skipConsent.OPEN;

		if (silent && !allowSilent) {

			//prompt=none要求全程无交互, 无法直接放行时按规范回跳错误
			if (req.prompt === 'none') {
				await c.env.kv.delete(KvConst.OIDC_REQ + rid);
				return { redirectUri: this.errorRedirect(req.redirectUri, 'interaction_required', 'User interaction is required', req.state) };
			}

			return { needConsent: true };
		}

		//prompt=consent要求每次都重新确认
		if (silent && req.prompt === 'consent') {
			return { needConsent: true };
		}

		const userRow = await this.selectAvailUser(c, userId);

		if (grantRow) {
			await orm(c).update(oidcGrant)
				.set({ scope: req.scope, updateTime: dayjs().toISOString() })
				.where(eq(oidcGrant.grantId, grantRow.grantId)).run();
		} else {
			await orm(c).insert(oidcGrant).values({ userId, clientId: req.clientId, scope: req.scope }).run();
		}

		const code = this.genToken();

		await c.env.kv.put(KvConst.OIDC_CODE + code, JSON.stringify({
			userId: userRow.userId,
			clientId: req.clientId,
			redirectUri: req.redirectUri,
			scope: req.scope,
			nonce: req.nonce,
			codeChallenge: req.codeChallenge,
			authTime: Math.floor(Date.now() / 1000)
		}), { expirationTtl: constant.OIDC_CODE_EXPIRE });

		await c.env.kv.delete(KvConst.OIDC_REQ + rid);

		const url = new URL(req.redirectUri);
		url.searchParams.set('code', code);

		if (req.state) {
			url.searchParams.set('state', req.state);
		}

		return { redirectUri: url.toString() };
	},

	async token(c) {

		await this.setting(c);

		const body = await c.req.parseBody();
		const clientRow = await this.verifyClient(c, body);

		if (body.grant_type === 'authorization_code') {
			return await this.codeToken(c, body, clientRow);
		}

		if (body.grant_type === 'refresh_token') {
			return await this.refreshToken(c, body, clientRow);
		}

		throw new OidcError('unsupported_grant_type', 'Unsupported grant_type');
	},

	async codeToken(c, body, clientRow) {

		const { code, redirect_uri: redirectUri, code_verifier: codeVerifier } = body;

		if (!code) {
			throw new OidcError('invalid_request', 'code is required');
		}

		const codeRow = await c.env.kv.get(KvConst.OIDC_CODE + code, { type: 'json' });

		//授权码一次性, 无论校验是否通过都立即失效
		await c.env.kv.delete(KvConst.OIDC_CODE + code);

		if (!codeRow) {
			throw new OidcError('invalid_grant', 'The authorization code is invalid or expired');
		}

		if (codeRow.clientId !== clientRow.clientId) {
			throw new OidcError('invalid_grant', 'The authorization code was issued to another client');
		}

		if (codeRow.redirectUri !== redirectUri) {
			throw new OidcError('invalid_grant', 'redirect_uri does not match the authorization request');
		}

		if (codeRow.codeChallenge) {

			if (!codeVerifier) {
				throw new OidcError('invalid_grant', 'code_verifier is required');
			}

			const digest = await crypto.subtle.digest('SHA-256', encoder.encode(codeVerifier));

			if (base64url(digest) !== codeRow.codeChallenge) {
				throw new OidcError('invalid_grant', 'code_verifier does not match code_challenge');
			}
		}

		const userRow = await this.selectAvailUser(c, codeRow.userId);
		return await this.issueToken(c, clientRow, userRow, codeRow.scope, codeRow.nonce, codeRow.authTime);
	},

	async refreshToken(c, body, clientRow) {

		const refreshToken = body.refresh_token;

		if (!refreshToken) {
			throw new OidcError('invalid_request', 'refresh_token is required');
		}

		const tokenRow = await c.env.kv.get(KvConst.OIDC_RT + refreshToken, { type: 'json' });

		if (!tokenRow) {
			throw new OidcError('invalid_grant', 'The refresh token is invalid or expired');
		}

		if (tokenRow.clientId !== clientRow.clientId) {
			throw new OidcError('invalid_grant', 'The refresh token was issued to another client');
		}

		//轮换刷新令牌, 旧令牌立即失效
		await c.env.kv.delete(KvConst.OIDC_RT + refreshToken);

		const grantRow = await orm(c).select().from(oidcGrant)
			.where(and(eq(oidcGrant.userId, tokenRow.userId), eq(oidcGrant.clientId, tokenRow.clientId)))
			.get();

		if (!grantRow) {
			throw new OidcError('invalid_grant', 'The authorization has been revoked');
		}

		const userRow = await this.selectAvailUser(c, tokenRow.userId);
		return await this.issueToken(c, clientRow, userRow, tokenRow.scope, '', tokenRow.authTime);
	},

	async issueToken(c, clientRow, userRow, scope, nonce, authTime) {

		const settingRow = await settingService.query(c);
		const base = this.base(c, settingRow);
		const scopeList = scope.split(' ').filter(Boolean);
		const now = Math.floor(Date.now() / 1000);

		const keyRow = await oidcKeyService.getActiveKey(c);
		const claims = await this.claims(c, userRow, scopeList);

		const idToken = await jwtUtils.signRs256({
			...claims,
			iss: base,
			aud: clientRow.clientId,
			iat: now,
			exp: now + clientRow.idTokenTtl,
			auth_time: authTime || now,
			...(nonce ? { nonce } : {})
		}, JSON.parse(keyRow.privateJwk), keyRow.kid);

		const accessToken = this.genToken();

		await c.env.kv.put(KvConst.OIDC_AT + accessToken, JSON.stringify({
			userId: userRow.userId,
			clientId: clientRow.clientId,
			scope
		}), { expirationTtl: clientRow.accessTokenTtl });

		const tokenResult = {
			access_token: accessToken,
			token_type: 'Bearer',
			expires_in: clientRow.accessTokenTtl,
			id_token: idToken,
			scope
		};

		if (scopeList.includes('offline_access')) {

			const refreshToken = this.genToken();

			await c.env.kv.put(KvConst.OIDC_RT + refreshToken, JSON.stringify({
				userId: userRow.userId,
				clientId: clientRow.clientId,
				scope,
				authTime: authTime || now
			}), { expirationTtl: clientRow.refreshTokenTtl });

			tokenResult.refresh_token = refreshToken;
		}

		return tokenResult;
	},

	async userinfo(c) {

		await this.setting(c);

		const authorization = c.req.header('Authorization') || '';

		if (!authorization.startsWith('Bearer ')) {
			throw new OidcError('invalid_token', 'A bearer access token is required', 401);
		}

		const tokenRow = await c.env.kv.get(KvConst.OIDC_AT + authorization.substring(7).trim(), { type: 'json' });

		if (!tokenRow) {
			throw new OidcError('invalid_token', 'The access token is invalid or expired', 401);
		}

		const userRow = await this.selectAvailUser(c, tokenRow.userId, 401);
		return await this.claims(c, userRow, tokenRow.scope.split(' ').filter(Boolean));
	},

	//登出端点: 校验回跳地址后转到前端登出页, 由前端清掉站内会话再跳回客户端
	async logout(c, params) {

		const settingRow = await this.setting(c);
		const base = this.base(c, settingRow);

		const { post_logout_redirect_uri: redirectUri, state, client_id: clientId, id_token_hint: idTokenHint } = params;

		if (!redirectUri) {
			return `${base}/oidc/logout`;
		}

		const clientRow = await this.logoutClient(c, clientId, idTokenHint);

		if (!clientRow || !JSON.parse(clientRow.postLogoutRedirectUris).includes(redirectUri)) {
			throw new OidcError('invalid_request', 'post_logout_redirect_uri is not registered for this client');
		}

		const target = new URL(redirectUri);

		if (state) {
			target.searchParams.set('state', state);
		}

		return `${base}/oidc/logout?redirect=${encodeURIComponent(target.toString())}`;
	},

	async logoutClient(c, clientId, idTokenHint) {

		if (clientId) {
			return await oidcClientService.selectByClientId(c, clientId);
		}

		if (!idTokenHint) {
			return null;
		}

		try {
			const payload = JSON.parse(new TextDecoder().decode(
				Uint8Array.from(atob(idTokenHint.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')), item => item.charCodeAt(0))
			));
			return await oidcClientService.selectByClientId(c, payload.aud);
		} catch (e) {
			return null;
		}
	},

	async claims(c, userRow, scopeList) {

		const claims = { sub: String(userRow.userId) };

		if (scopeList.includes('profile')) {

			const [accountRow, oauthRow] = await Promise.all([
				accountService.selectByEmailIncludeDel(c, userRow.email),
				oauthService.selectByUserId(c, userRow.userId)
			]);

			claims.name = accountRow?.name || userRow.email.split('@')[0];
			claims.preferred_username = claims.name;
			claims.updated_at = dayjs(userRow.activeTime || userRow.createTime).unix();

			if (oauthRow?.avatar) {
				claims.picture = oauthRow.avatar;
			}
		}

		if (scopeList.includes('email')) {
			claims.email = userRow.email;
			claims.email_verified = true;
		}

		return claims;
	},

	async selectReq(c, rid) {

		if (!rid) {
			throw new OidcError('invalid_request', 'rid is required');
		}

		const req = await c.env.kv.get(KvConst.OIDC_REQ + rid, { type: 'json' });

		if (!req) {
			throw new OidcError('invalid_request', 'The authorization request is invalid or expired');
		}

		const clientRow = await oidcClientService.selectByClientId(c, req.clientId);

		if (!clientRow || clientRow.status !== oidcConst.status.OPEN) {
			throw new OidcError('unauthorized_client', 'Unknown or disabled client');
		}

		return { req, clientRow };
	},

	async selectAvailUser(c, userId, status = 400) {

		const userRow = await userService.selectByIdIncludeDel(c, userId);

		if (!userRow || userRow.isDel === isDel.DELETE || userRow.status === userConst.status.BAN) {
			throw new OidcError('invalid_grant', 'The user is unavailable', status);
		}

		return userRow;
	},

	async verifyClient(c, body) {

		const authorization = c.req.header('Authorization') || '';
		let clientId = body.client_id;
		let clientSecret = body.client_secret;

		if (authorization.startsWith('Basic ')) {
			try {
				const [basicId, ...rest] = atob(authorization.substring(6).trim()).split(':');
				clientId = decodeURIComponent(basicId);
				clientSecret = decodeURIComponent(rest.join(':'));
			} catch (e) {
				throw new OidcError('invalid_client', 'Malformed basic authorization header', 401);
			}
		}

		if (!clientId) {
			throw new OidcError('invalid_client', 'client_id is required', 401);
		}

		const clientRow = await oidcClientService.selectByClientId(c, clientId);

		if (!clientRow || clientRow.status !== oidcConst.status.OPEN) {
			throw new OidcError('invalid_client', 'Unknown or disabled client', 401);
		}

		if (clientRow.clientType === oidcConst.clientType.PUBLIC) {
			return clientRow;
		}

		if (!clientSecret || !this.equals(clientSecret, clientRow.clientSecret)) {
			throw new OidcError('invalid_client', 'Client authentication failed', 401);
		}

		return clientRow;
	},

	isGranted(grantRow, scope) {

		if (!grantRow) {
			return false;
		}

		const grantedScopes = grantRow.scope.split(' ').filter(Boolean);
		return scope.split(' ').filter(Boolean).every(item => grantedScopes.includes(item));
	},

	errorRedirect(redirectUri, error, description, state) {

		const url = new URL(redirectUri);
		url.searchParams.set('error', error);
		url.searchParams.set('error_description', description);

		if (state) {
			url.searchParams.set('state', state);
		}

		return url.toString();
	},

	genToken() {
		const buff = new Uint8Array(32);
		crypto.getRandomValues(buff);
		return base64url(buff);
	},

	//定长比较, 避免密钥校验产生时序差异
	equals(input, stored) {

		if (input.length !== stored.length) {
			return false;
		}

		let diff = 0;

		for (let i = 0; i < input.length; i++) {
			diff |= input.charCodeAt(i) ^ stored.charCodeAt(i);
		}

		return diff === 0;
	}

};

export default oidcService;
