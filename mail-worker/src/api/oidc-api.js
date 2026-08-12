import app from '../hono/hono';
import result from '../model/result';
import oidcService from '../service/oidc-service';
import userContext from '../security/user-context';

//根路径的 /.well-known/openid-configuration 由 index.js 重写到这里
app.get('/oidc/.well-known/openid-configuration', async (c) => {
	const discovery = await oidcService.discovery(c);
	return c.json(discovery, 200, { 'Cache-Control': 'no-store' });
})

app.get('/oidc/jwks', async (c) => {
	const jwks = await oidcService.jwks(c);
	return c.json(jwks, 200, { 'Cache-Control': 'public, max-age=600' });
})

app.get('/oidc/authorize', async (c) => {
	const redirectUri = await oidcService.authorize(c, c.req.query());
	return c.redirect(redirectUri, 302);
})

app.get('/oidc/authInfo', async (c) => {
	const authInfo = await oidcService.authInfo(c, c.req.query());
	return c.json(result.ok(authInfo));
})

app.post('/oidc/confirm', async (c) => {
	const confirm = await oidcService.confirm(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(confirm));
})

app.post('/oidc/token', async (c) => {
	const token = await oidcService.token(c);
	return c.json(token, 200, { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' });
})

app.on(['GET', 'POST'], '/oidc/userinfo', async (c) => {
	const claims = await oidcService.userinfo(c);
	return c.json(claims, 200, { 'Cache-Control': 'no-store' });
})

app.on(['GET', 'POST'], '/oidc/logout', async (c) => {
	//end_session规范允许GET与POST表单两种提交方式
	const params = c.req.method === 'POST'
		? { ...c.req.query(), ...await c.req.parseBody() }
		: c.req.query();
	const redirectUri = await oidcService.logout(c, params);
	return c.redirect(redirectUri, 302);
})
