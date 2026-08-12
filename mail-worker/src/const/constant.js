const constant = {
	TOKEN_HEADER: 'Authorization',
	JWT_UID: 'user_id:',
	JWT_TOKEN: 'token:',
	TOKEN_EXPIRE: 60 * 60 * 24 * 30,
	ATTACHMENT_PREFIX: 'attachments/',
	BACKGROUND_PREFIX: 'static/background/',
	ADMIN_ROLE: {
		name: 'admin',
		sendCount: 0,
		sendType: 'count',
		accountCount: 0
	},
	OIDC_REQ_EXPIRE: 60 * 10,
	OIDC_CODE_EXPIRE: 60,
	OIDC_SCOPES: ['openid', 'profile', 'email', 'offline_access']
}

export default constant
