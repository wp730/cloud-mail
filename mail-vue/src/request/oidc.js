import http from '@/axios/index.js';

export function oidcAuthInfo(rid) {
    return http.get('/oidc/authInfo', {params: {rid}})
}

export function oidcConfirm(form) {
    return http.post('/oidc/confirm', form)
}
