<template>
  <div class="oidc-client">
    <div class="header-actions">
      <Icon class="icon" icon="ion:add-outline" width="23" height="23" @click="openAdd"/>
      <div class="search">
        <el-input
            v-model="params.name"
            class="search-input"
            :placeholder="$t('oidcSearchDesc')"
        >
        </el-input>
      </div>
      <Icon class="icon" icon="iconoir:search" @click="search" width="20" height="20"/>
      <Icon class="icon" icon="ion:reload" width="18" height="18" @click="refresh"/>
    </div>

    <el-scrollbar class="scrollbar">
      <div class="loading" :class="clientLoading ? 'loading-show' : 'loading-hide'"
           :style="clientFirst ? 'background: transparent' : ''">
        <loading/>
      </div>
      <div class="client-box">
        <div class="client-item" v-for="item in clientData" :key="item.oidcClientId">
          <div class="client-info">
            <div class="info-left">
              <div class="info-left-item">
                <span class="name">{{ item.name }}</span>
                <el-tag v-if="item.status === 1" type="danger">{{ $t('disabled') }}</el-tag>
              </div>
              <div class="info-left-item">
                <div>client_id：</div>
                <div class="ellipsis copy" @click="copy(item.clientId)">{{ item.clientId }}</div>
              </div>
              <div class="info-left-item">
                <div>{{ $t('oidcClientType') }}：</div>
                <el-tag>{{ item.clientType === 1 ? $t('oidcPublicClient') : $t('oidcConfidentialClient') }}</el-tag>
              </div>
              <div class="info-left-item">
                <div>{{ $t('oidcRedirectUris') }}：</div>
                <div class="ellipsis">{{ item.redirectUris.join('，') }}</div>
              </div>
            </div>
            <div class="info-right">
              <el-dropdown class="setting">
                <Icon icon="fluent:settings-24-filled" width="21" height="21" color="#909399"/>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="copy(item.clientId)">{{ $t('oidcCopyClientId') }}</el-dropdown-item>
                    <el-dropdown-item v-if="item.clientType === 0" @click="copySecret(item)">
                      {{ $t('oidcCopySecret') }}
                    </el-dropdown-item>
                    <el-dropdown-item v-if="item.clientType === 0" @click="resetSecret(item)">
                      {{ $t('oidcResetSecret') }}
                    </el-dropdown-item>
                    <el-dropdown-item @click="openEdit(item)">{{ $t('change') }}</el-dropdown-item>
                    <el-dropdown-item @click="deleteClient(item)">{{ $t('delete') }}</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </div>
      </div>
      <div class="empty" v-if="clientData.length === 0">
        <el-empty v-if="!clientFirst" :image-size="isMobile ? 120 : null" :description="$t('oidcNoClient')"/>
      </div>
    </el-scrollbar>

    <el-dialog v-model="showForm" :title="isEdit ? $t('oidcEditClient') : $t('oidcAddClient')">
      <div class="container">
        <el-input v-model="form.name" :placeholder="$t('oidcAppName')"/>
        <el-input v-model="form.description" :placeholder="$t('oidcAppDesc')"/>
        <el-input v-model="form.logo" :placeholder="$t('oidcAppLogo')"/>
        <el-input
            v-model="form.redirectUris"
            type="textarea"
            :rows="3"
            :placeholder="$t('oidcRedirectUrisDesc')"
        />
        <el-input
            v-model="form.postLogoutRedirectUris"
            type="textarea"
            :rows="2"
            :placeholder="$t('oidcPostLogoutUrisDesc')"
        />
        <el-select v-model="form.scopes" multiple :placeholder="$t('oidcScopes')">
          <el-option v-for="item in scopeList" :key="item" :label="item" :value="item"/>
        </el-select>
        <div class="form-label">
          <span>{{ $t('oidcClientType') }}</span>
          <el-select v-model="form.clientType">
            <el-option :value="0" :label="$t('oidcConfidentialClient')"/>
            <el-option :value="1" :label="$t('oidcPublicClient')"/>
          </el-select>
        </div>
        <div class="form-label">
          <span>{{ $t('oidcSkipConsent') }}</span>
          <el-switch v-model="form.skipConsent" :active-value="0" :inactive-value="1"/>
        </div>
        <div class="form-label">
          <span>{{ $t('enable') }}</span>
          <el-switch v-model="form.status" :active-value="0" :inactive-value="1"/>
        </div>
        <div class="form-label">
          <span>id_token(s)</span>
          <el-input-number v-model="form.idTokenTtl" :min="60" :max="86400"/>
        </div>
        <div class="form-label">
          <span>access_token(s)</span>
          <el-input-number v-model="form.accessTokenTtl" :min="60" :max="604800"/>
        </div>
        <div class="form-label">
          <span>refresh_token(s)</span>
          <el-input-number v-model="form.refreshTokenTtl" :min="3600" :max="31536000"/>
        </div>
        <el-button class="btn" type="primary" @click="submit" :loading="submitLoading">
          {{ $t('save') }}
        </el-button>
      </div>
    </el-dialog>

    <el-dialog v-model="showSecret" :title="$t('oidcSecretTitle')">
      <div class="secret-box">
        <div class="secret-tip">{{ $t('oidcSecretTip') }}</div>
        <el-input v-model="secretValue" readonly/>
        <el-button class="btn" type="primary" @click="copy(secretValue)">{{ $t('copy') }}</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import {defineOptions, reactive, ref} from "vue"
import {Icon} from "@iconify/vue";
import loading from "@/components/loading/index.vue";
import {useI18n} from "vue-i18n";
import {
  oidcClientAdd,
  oidcClientDelete,
  oidcClientList,
  oidcClientResetSecret,
  oidcClientSecret,
  oidcClientSet
} from "@/request/oidc-client.js";

defineOptions({
  name: 'oidc-client'
})

const {t} = useI18n()
const isMobile = window.innerWidth < 1025
const scopeList = ['openid', 'profile', 'email', 'offline_access']

const params = reactive({
  name: ''
})

const clientData = reactive([])
const clientLoading = ref(true)
const clientFirst = ref(true)
const showForm = ref(false)
const isEdit = ref(false)
const submitLoading = ref(false)
const showSecret = ref(false)
const secretValue = ref('')

const form = reactive({
  clientId: '',
  name: '',
  description: '',
  logo: '',
  redirectUris: '',
  postLogoutRedirectUris: '',
  scopes: ['openid', 'profile', 'email'],
  clientType: 0,
  skipConsent: 1,
  status: 0,
  idTokenTtl: 3600,
  accessTokenTtl: 7200,
  refreshTokenTtl: 2592000
})

getList(true)

function refresh() {
  params.name = ''
  getList(true)
}

function search() {
  getList(true)
}

function getList(showLoading = false) {
  if (showLoading) {
    clientLoading.value = true
  }
  oidcClientList(params).then(list => {
    clientData.length = 0
    clientData.push(...list)
    clientLoading.value = false
    setTimeout(() => {
      clientFirst.value = false
    }, 200)
  })
}

function resetForm() {
  form.clientId = ''
  form.name = ''
  form.description = ''
  form.logo = ''
  form.redirectUris = ''
  form.postLogoutRedirectUris = ''
  form.scopes = ['openid', 'profile', 'email']
  form.clientType = 0
  form.skipConsent = 1
  form.status = 0
  form.idTokenTtl = 3600
  form.accessTokenTtl = 7200
  form.refreshTokenTtl = 2592000
}

function openAdd() {
  resetForm()
  isEdit.value = false
  showForm.value = true
}

function openEdit(client) {
  Object.assign(form, {
    ...client,
    redirectUris: client.redirectUris.join('\n'),
    postLogoutRedirectUris: client.postLogoutRedirectUris.join('\n'),
    scopes: [...client.scopes]
  })
  isEdit.value = true
  showForm.value = true
}

function submit() {

  if (!form.name) {
    ElMessage({message: t('oidcAppNameEmpty'), type: 'error', plain: true})
    return
  }

  if (!form.redirectUris.trim()) {
    ElMessage({message: t('oidcRedirectUriEmptyMsg'), type: 'error', plain: true})
    return
  }

  const data = {
    ...form,
    redirectUris: form.redirectUris.split('\n').map(uri => uri.trim()).filter(Boolean),
    postLogoutRedirectUris: form.postLogoutRedirectUris.split('\n').map(uri => uri.trim()).filter(Boolean)
  }

  submitLoading.value = true

  const request = isEdit.value ? oidcClientSet(data) : oidcClientAdd(data)

  request.then(clientRow => {
    showForm.value = false
    ElMessage({
      message: isEdit.value ? t('setSuccess') : t('addSuccessMsg'),
      type: 'success',
      plain: true
    })
    //新建时密钥只在这里返回一次明文
    if (!isEdit.value && clientRow?.clientSecret) {
      secretValue.value = clientRow.clientSecret
      showSecret.value = true
    }
    getList()
  }).finally(() => {
    submitLoading.value = false
  })
}

function deleteClient(client) {
  ElMessageBox.confirm(t('delConfirm', {msg: client.name}), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    oidcClientDelete([client.oidcClientId]).then(() => {
      getList()
      ElMessage({message: t('delSuccessMsg'), type: 'success', plain: true})
    })
  });
}

function resetSecret(client) {
  ElMessageBox.confirm(t('oidcResetSecretConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    oidcClientResetSecret(client.clientId).then(data => {
      secretValue.value = data.clientSecret
      showSecret.value = true
      getList()
    })
  });
}

function copySecret(client) {
  oidcClientSecret(client.clientId).then(data => {
    copy(data.clientSecret)
  })
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage({message: t('copySuccessMsg'), type: 'success', plain: true})
  } catch (err) {
    console.error('复制失败:', err);
    ElMessage({message: '复制失败', type: 'error', plain: true})
  }
}

</script>

<style scoped lang="scss">
.oidc-client {
  height: 100%;
  overflow: hidden;
}

.scrollbar {
  height: calc(100% - 48px);
  position: relative;
  background: var(--extra-light-fill);
  @media (max-width: 372px) {
    height: calc(100% - 85px);
  }

  .client-box {
    padding: 15px 15px 25px 15px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 15px;

    .client-item {
      background: var(--el-bg-color);
      border-radius: 8px;
      border: 1px solid var(--el-border-color);
      transition: all 200ms;
      padding: 15px;

      .client-info {
        display: flex;

        .info-left {
          flex: 1;
          min-width: 0;

          .info-left-item {
            display: flex;
            padding-top: 5px;
            gap: 6px;
            align-items: center;

            .name {
              font-weight: bold;
              font-size: 16px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .ellipsis {
              flex: 1;
              min-width: 0;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .copy {
              cursor: pointer;
            }
          }

          .info-left-item:first-child {
            padding-top: 0;
          }
        }

        .info-right {
          display: flex;
          flex-direction: column;
          padding-top: 2px;
          gap: 5px;
        }
      }
    }
  }
}

.empty {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

.loading {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--loadding-background);
  z-index: 2;
}

.loading-show {
  transition: all 200ms ease 200ms;
  opacity: 1;
}

.loading-hide {
  pointer-events: none;
  transition: var(--loading-hide-transition);
  opacity: 0;
}

.container {
  display: grid;
  grid-template-columns: 1fr;
  gap: 15px;
}

.form-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.secret-box {
  display: grid;
  grid-template-columns: 1fr;
  gap: 15px;

  .secret-tip {
    color: var(--el-color-warning);
    font-size: 13px;
  }
}

:deep(.el-dialog) {
  width: 460px !important;
  @media (max-width: 500px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.setting {
  cursor: pointer;
}

.header-actions {
  padding: 9px 15px;
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  align-items: center;
  box-shadow: inset 0 -1px 0 0 rgba(100, 121, 143, 0.12);
  font-size: 18px;
  @media (max-width: 767px) {
    gap: 15px;
  }

  .search-input {
    width: min(200px, calc(100vw - 140px));
  }

  .search {
    :deep(.el-input-group) {
      height: 28px;
    }

    :deep(.el-input__inner) {
      height: 28px;
    }
  }

  .icon {
    cursor: pointer;
  }
}
</style>
