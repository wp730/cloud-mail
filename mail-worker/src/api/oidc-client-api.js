import app from '../hono/hono';
import result from '../model/result';
import oidcClientService from '../service/oidc-client-service';
import userContext from '../security/user-context';

app.get('/oidcClient/list', async (c) => {
	const list = await oidcClientService.list(c, c.req.query());
	return c.json(result.ok(list));
})

app.post('/oidcClient/add', async (c) => {
	const clientRow = await oidcClientService.add(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(clientRow));
})

app.put('/oidcClient/set', async (c) => {
	await oidcClientService.set(c, await c.req.json());
	return c.json(result.ok());
})

app.delete('/oidcClient/delete', async (c) => {
	await oidcClientService.delete(c, c.req.query());
	return c.json(result.ok());
})

app.put('/oidcClient/resetSecret', async (c) => {
	const secret = await oidcClientService.resetSecret(c, await c.req.json());
	return c.json(result.ok(secret));
})

app.get('/oidcClient/secret', async (c) => {
	const secret = await oidcClientService.secret(c, c.req.query());
	return c.json(result.ok(secret));
})
