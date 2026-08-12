<template>
  <div class="oidc-consent">
    <div class="consent-box">
      <div class="loading-box" v-if="pageLoading">
        <loading/>
      </div>
      <template v-else-if="errorMsg">
        <Icon class="error-icon" icon="fluent:error-circle-24-regular" width="46" height="46"/>
        <div class="error-msg">{{ errorMsg }}</div>
      </template>
      <template v-else>
        <div class="app-logo">
          <el-image v-if="authInfo.logo" class="logo-img" :src="authInfo.logo" fit="cover"/>
          <Icon v-else icon="fluent:apps-24-regular" width="34" height="34"/>
        </div>
        <div class="app-name">{{ authInfo.clientName }}</div>
        <div class="app-desc" v-if="authInfo.description">{{ authInfo.description }}</div>
        <div class="tip">{{ $t('oidcConsentTip', {name: authInfo.clientName}) }}</div>
        <div class="scope-box">
          <div class="scope-item" v-for="scope in authInfo.scopes" :key="scope">
            <Icon class="scope-icon" icon="fluent:checkmark-circle-24-filled" width="18" height="18"/>
            <span>{{ scopeText(scope) }}</span>
          </div>
        </div>
        <div class="account">{{ $t('oidcConsentAccount') }}：{{ userStore.user.email }}</div>
        <div class="btn-box">
          <el-button class="btn" :loading="denyLoading" :disabled="approveLoading" @click="submit(false)">
            {{ $t('oidcDeny') }}
          </el-button>
          <el-button class="btn" type="primary" :loading="approveLoading" :disabled="denyLoading"
                     @click="submit(true)">
            {{ $t('oidcApprove') }}
          </el-button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import {defineOptions, reactive, ref} from "vue"
import {Icon} from "@iconify/vue";
import {useRoute} from "vue-router";
import {useI18n} from "vue-i18n";
import loading from "@/components/loading/index.vue";
import {useUserStore} from "@/store/user.js";
import {oidcAuthInfo, oidcConfirm} from "@/request/oidc.js";

defineOptions({
  name: 'oidc-consent'
})

const route = useRoute()
const {t} = useI18n()
const userStore = useUserStore()

const rid = route.query.rid
const pageLoading = ref(true)
const approveLoading = ref(false)
const denyLoading = ref(false)
const errorMsg = ref('')

const authInfo = reactive({
  clientName: '',
  logo: '',
  description: '',
  scopes: []
})

init()

async function init() {

  if (!rid) {
    errorMsg.value = t('oidcReqInvalid')
    pageLoading.value = false
    return
  }

  try {

    const info = await oidcAuthInfo(rid)
    Object.assign(authInfo, info)

    //已授权过或客户端配置了免确认时由后端直接放行, 页面只闪一下loading
    const result = await oidcConfirm({rid, approve: true, silent: true})

    if (result.redirectUri) {
      window.location.replace(result.redirectUri)
      return
    }

  } catch (e) {
    errorMsg.value = e?.message || t('oidcReqInvalid')
  }

  pageLoading.value = false
}

function submit(approve) {

  if (approve) {
    approveLoading.value = true
  } else {
    denyLoading.value = true
  }

  oidcConfirm({rid, approve}).then(result => {
    window.location.replace(result.redirectUri)
  }).catch(() => {
    approveLoading.value = false
    denyLoading.value = false
  })
}

function scopeText(scope) {
  const key = 'oidcScope_' + scope.replace(/[^a-zA-Z]/g, '')
  const text = t(key)
  return text === key ? scope : text
}

</script>

<style scoped lang="scss">
.oidc-consent {
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--extra-light-fill);
  padding: 20px;
  box-sizing: border-box;
}

.consent-box {
  width: 100%;
  max-width: 400px;
  min-height: 320px;
  box-sizing: border-box;
  padding: 30px 28px;
  border-radius: 10px;
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.loading-box {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.error-icon {
  color: var(--el-color-danger);
  margin-top: 60px;
}

.error-msg {
  padding-top: 12px;
  color: var(--el-text-color-regular);
  text-align: center;
}

.app-logo {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--extra-light-fill);
  overflow: hidden;

  .logo-img {
    width: 100%;
    height: 100%;
  }
}

.app-name {
  padding-top: 12px;
  font-size: 18px;
  font-weight: bold;
  text-align: center;
}

.app-desc {
  padding-top: 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  text-align: center;
}

.tip {
  padding-top: 18px;
  font-size: 14px;
  color: var(--el-text-color-regular);
  text-align: center;
}

.scope-box {
  width: 100%;
  padding: 16px 0 4px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;

  .scope-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;

    .scope-icon {
      color: var(--el-color-primary);
      flex-shrink: 0;
    }
  }
}

.account {
  padding-top: 14px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
  text-align: center;
}

.btn-box {
  width: 100%;
  padding-top: 24px;
  display: flex;
  gap: 12px;

  .btn {
    flex: 1;
    margin: 0;
  }
}
</style>
