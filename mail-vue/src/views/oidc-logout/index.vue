<template>
  <div class="oidc-logout">
    <div class="logout-box">
      <div class="loading-box" v-if="pageLoading">
        <loading/>
      </div>
      <template v-else>
        <Icon class="done-icon" icon="fluent:checkmark-circle-24-regular" width="46" height="46"/>
        <div class="done-msg">{{ $t('oidcLogoutDone') }}</div>
        <el-button class="btn" type="primary" @click="toLogin">{{ $t('oidcBackLogin') }}</el-button>
      </template>
    </div>
  </div>
</template>

<script setup>
import {defineOptions, ref} from "vue"
import {Icon} from "@iconify/vue";
import {useRoute, useRouter} from "vue-router";
import loading from "@/components/loading/index.vue";
import {logout} from "@/request/login.js";

defineOptions({
  name: 'oidc-logout'
})

const route = useRoute()
const router = useRouter()
const pageLoading = ref(true)
const redirect = route.query.redirect

init()

async function init() {

  if (localStorage.getItem('token')) {
    //吊销站内会话, 后端不可用时也要保证本地token被清掉
    try {
      await logout()
    } catch (e) {
      console.error(e)
    }
    localStorage.removeItem('token')
  }

  if (redirect) {
    window.location.replace(redirect)
    return
  }

  pageLoading.value = false
}

function toLogin() {
  router.replace({name: 'login'})
}

</script>

<style scoped lang="scss">
.oidc-logout {
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--extra-light-fill);
  padding: 20px;
  box-sizing: border-box;
}

.logout-box {
  width: 100%;
  max-width: 400px;
  min-height: 240px;
  box-sizing: border-box;
  padding: 30px 28px;
  border-radius: 10px;
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
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

.done-icon {
  color: var(--el-color-success);
}

.done-msg {
  padding-top: 12px;
  color: var(--el-text-color-regular);
}

.btn {
  margin-top: 24px;
  width: 100%;
}
</style>
