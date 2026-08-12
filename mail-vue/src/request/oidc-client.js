import http from '@/axios/index.js';

export function oidcClientList(params) {
    return http.get('/oidcClient/list', {params: {...params}})
}

export function oidcClientAdd(form) {
    return http.post('/oidcClient/add', form)
}

export function oidcClientSet(form) {
    return http.put('/oidcClient/set', form)
}

export function oidcClientDelete(oidcClientIds) {
    return http.delete('/oidcClient/delete?oidcClientIds=' + oidcClientIds)
}

export function oidcClientResetSecret(clientId) {
    return http.put('/oidcClient/resetSecret', {clientId})
}

export function oidcClientSecret(clientId) {
    return http.get('/oidcClient/secret', {params: {clientId}})
}
