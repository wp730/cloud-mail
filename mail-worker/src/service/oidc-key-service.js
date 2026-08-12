import orm from '../entity/orm';
import { oidcKey } from '../entity/oidc-key';
import { asc, eq } from 'drizzle-orm';
import KvConst from '../const/kv-const';
import { base64url } from '../utils/jwt-utils';
import { oidcConst } from '../const/entity-const';

const encoder = new TextEncoder();

const oidcKeyService = {

	//取当前签名密钥, 不存在则惰性生成一对RSA-2048
	async getActiveKey(c) {

		const keyRow = await this.selectActiveKey(c);

		if (keyRow) {
			return keyRow;
		}

		return await this.generateKey(c);
	},

	selectActiveKey(c) {
		return orm(c).select().from(oidcKey)
			.where(eq(oidcKey.status, oidcConst.status.OPEN))
			.orderBy(asc(oidcKey.keyId))
			.get();
	},

	async generateKey(c) {

		const { publicKey, privateKey } = await crypto.subtle.generateKey({
			name: 'RSASSA-PKCS1-v1_5',
			modulusLength: 2048,
			publicExponent: new Uint8Array([1, 0, 1]),
			hash: 'SHA-256'
		}, true, ['sign', 'verify']);

		const publicJwk = await crypto.subtle.exportKey('jwk', publicKey);
		const privateJwk = await crypto.subtle.exportKey('jwk', privateKey);

		const kid = await this.thumbprint(publicJwk);

		publicJwk.kid = kid;
		publicJwk.alg = 'RS256';
		publicJwk.use = 'sig';

		const keyRow = await orm(c).insert(oidcKey).values({
			kid,
			alg: 'RS256',
			publicJwk: JSON.stringify(publicJwk),
			privateJwk: JSON.stringify(privateJwk)
		}).returning().get();

		await c.env.kv.delete(KvConst.OIDC_JWKS);
		return keyRow;
	},

	//RFC 7638 jwk指纹, 用作kid
	async thumbprint(publicJwk) {
		const canonical = JSON.stringify({ e: publicJwk.e, kty: publicJwk.kty, n: publicJwk.n });
		const digest = await crypto.subtle.digest('SHA-256', encoder.encode(canonical));
		return base64url(digest);
	},

	//公钥集, 包含仅验签的历史密钥, 保证轮换期间旧token仍可校验
	async jwks(c) {

		const jwksCache = await c.env.kv.get(KvConst.OIDC_JWKS, { type: 'json' });

		if (jwksCache) {
			return jwksCache;
		}

		await this.getActiveKey(c);

		const keyList = await orm(c).select().from(oidcKey).orderBy(asc(oidcKey.keyId)).all();
		const jwks = { keys: keyList.map(keyRow => JSON.parse(keyRow.publicJwk)) };

		await c.env.kv.put(KvConst.OIDC_JWKS, JSON.stringify(jwks));
		return jwks;
	}

};

export default oidcKeyService;
