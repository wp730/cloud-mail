//OIDC/OAuth2标准错误, 响应体为 {error, error_description}, 不走站内的result包装
class OidcError extends Error {
	constructor(error, description, status) {
		super(description || error);
		this.error = error;
		this.status = status ? status : 400;
		this.name = 'OidcError';
	}
}

export default OidcError;
