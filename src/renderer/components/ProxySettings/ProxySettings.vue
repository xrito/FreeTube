<template>
  <FtSettingsSection
    :title="$t('Settings.Proxy Settings.Proxy Settings')"
  >
    <div class="nodpi-block">
      <p class="nodpi-description">
        {{ $t('Settings.Proxy Settings.NoDPI Description') }}
      </p>
      <FtFlexBox class="settingsFlexStart500px">
        <FtToggleSwitch
          :label="$t('Settings.Proxy Settings.Enable NoDPI')"
          :default-value="noDpiRuntimeEnabled"
          :disabled="noDpiLoading || !noDpiAvailable"
          @change="handleUpdateNoDpi"
        />
      </FtFlexBox>
      <p
        v-if="noDpiLoading"
        class="center"
      >
        {{ $t('Settings.Proxy Settings.NoDPI Starting') }}
      </p>
      <p
        v-else-if="noDpiRuntimeEnabled"
        class="nodpi-active"
      >
        {{ $t('Settings.Proxy Settings.NoDPI Active') }}
      </p>
      <p
        v-else-if="!noDpiAvailable"
        class="proxy-warning"
      >
        {{ $t('Settings.Proxy Settings.NoDPI Unavailable') }}
      </p>
      <p
        v-if="noDpiError"
        class="proxy-warning"
      >
        {{ noDpiError }}
      </p>
    </div>
    <div class="proxy-separator" />
    <FtFlexBox class="settingsFlexStart500px">
      <p
        v-if="useProxy"
        class="proxy-warning"
      >
        <FontAwesomeIcon
          :icon="['fas', 'circle-exclamation']"
          class="warning-icon"
        />
        {{ $t('Settings.Proxy Settings.Proxy Warning') }}
      </p>
      <FtToggleSwitch
        :label="$t('Settings.Proxy Settings.Enable Tor / Proxy')"
        :default-value="useProxy"
        :disabled="noDpiRuntimeEnabled || noDpiLoading"
        @change="handleUpdateProxy"
      />
    </FtFlexBox>
    <template
      v-if="useProxy"
    >
      <FtFlexBox>
        <FtSelect
          :placeholder="$t('Settings.Proxy Settings.Proxy Protocol')"
          :value="proxyProtocol"
          :select-names="PROTOCOL_NAMES"
          :select-values="PROTOCOL_VALUES"
          class="protocol-dropdown"
          :icon="['fas', 'network-wired']"
          @change="handleUpdateProxyProtocol"
        />
      </FtFlexBox>
      <FtFlexBox>
        <FtInput
          :placeholder="$t('Settings.Proxy Settings.Proxy Host')"
          :show-action-button="false"
          show-label
          :value="proxyHostname"
          @input="handleUpdateProxyHostname"
          @keydown.enter="testProxy"
        />
        <FtInput
          :placeholder="$t('Settings.Proxy Settings.Proxy Port Number')"
          :show-action-button="false"
          show-label
          :value="proxyPort"
          :maxlength="5"
          @input="handleUpdateProxyPort"
          @keydown.enter="testProxy"
        />
      </FtFlexBox>
      <FtFlexBox
        v-if="areCredentialsSupported"
      >
        <FtInput
          :placeholder="$t('Settings.Proxy Settings.Proxy Username')"
          :show-action-button="false"
          show-label
          :value="proxyUsername"
          @input="handleUpdateProxyUsername"
          @keydown.enter="testProxy"
        />
        <FtInput
          :placeholder="$t('Settings.Proxy Settings.Proxy Password')"
          :show-action-button="false"
          show-label
          :value="proxyPassword"
          input-type="password"
          @input="handleUpdateProxyPassword"
          @keydown.enter="testProxy"
        />
      </FtFlexBox>
      <p
        class="center"
      >
        {{ $t('Settings.Proxy Settings.Clicking on Test Proxy will send a request to') }} {{ proxyTestUrl }}
      </p>
      <FtFlexBox>
        <FtButton
          :label="$t('Settings.Proxy Settings.Test Proxy')"
          @click="testProxy"
        />
      </FtFlexBox>
      <FtLoader
        v-if="isLoading"
      />
      <div
        v-if="!isLoading && dataAvailable"
        class="center"
      >
        <h3>
          {{ $t('Settings.Proxy Settings.Your Info') }}
        </h3>
        <p>
          {{ $t('Display Label', { label: $t('Settings.Proxy Settings.Ip'), value: proxyIp }) }}
        </p>
        <p>
          {{ $t('Display Label', { label: $t('Settings.Proxy Settings.Country'), value: proxyCountry }) }}
        </p>
        <p>
          {{ $t('Display Label', { label: $t('Settings.Proxy Settings.Region'), value: proxyRegion }) }}
        </p>
        <p>
          {{ $t('Display Label', { label: $t('Settings.Proxy Settings.City'), value: proxyCity }) }}
        </p>
      </div>
    </template>
  </FtSettingsSection>
</template>

<script setup>
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import FtSettingsSection from '../FtSettingsSection/FtSettingsSection.vue'
import FtToggleSwitch from '../FtToggleSwitch/FtToggleSwitch.vue'
import FtButton from '../FtButton/FtButton.vue'
import FtSelect from '../FtSelect/FtSelect.vue'
import FtInput from '../FtInput/FtInput.vue'
import FtLoader from '../FtLoader/FtLoader.vue'
import FtFlexBox from '../ft-flex-box/ft-flex-box.vue'

import store from '../../store/index'

import { debounce, showToast } from '../../helpers/utils'

const { locale, t } = useI18n()

const PROTOCOL_NAMES = [
  'HTTP',
  'HTTPS',
  'SOCKS4',
  'SOCKS5'
]

const PROTOCOL_VALUES = [
  'http',
  'https',
  'socks4',
  'socks5'
]

const isLoading = ref(false)
const dataAvailable = ref(false)
const proxyIp = ref('')
const proxyCountry = ref('')
const proxyRegion = ref('')
const proxyCity = ref('')
const noDpiLoading = ref(false)
const noDpiAvailable = ref(Boolean(process.env.IS_ELECTRON))
const noDpiRuntimeEnabled = ref(false)
const noDpiError = ref('')
let removeNoDpiStatusListener

/** @type {import('vue').ComputedRef<boolean>} */
const noDpiEnabled = computed(() => {
  return store.getters.getNoDpiEnabled
})

/** @type {import('vue').ComputedRef<boolean>} */
const useProxy = computed(() => {
  return store.getters.getUseProxy
})

/** @type {import('vue').ComputedRef<string>} */
const proxyProtocol = computed(() => {
  return store.getters.getProxyProtocol
})

/** @type {import('vue').ComputedRef<string>} */
const proxyHostname = computed(() => {
  return store.getters.getProxyHostname
})

/** @type {import('vue').ComputedRef<string>} */
const proxyPort = computed(() => {
  return store.getters.getProxyPort
})

/** @type {import('vue').ComputedRef<string>} */
const proxyUsername = computed(() => {
  return store.getters.getProxyUsername
})

/** @type {import('vue').ComputedRef<string>} */
const proxyPassword = computed(() => {
  return store.getters.getProxyPassword
})

const proxyUrl = computed(() => {
  return `${proxyProtocol.value}://${proxyHostname.value}:${proxyPort.value}`
})

// locales found here: https://ipwhois.io/documentation
const SUPPORTED_LANGS = ['en', 'ru', 'de', 'es', 'pt-BR', 'fr', 'zh-CN', 'ja']

const localeToUse = computed(() => {
  const freeTubeLang = locale.value

  return SUPPORTED_LANGS.find(lang => freeTubeLang === lang) ?? SUPPORTED_LANGS.find(lang => freeTubeLang.slice(0, 2) === lang.slice(0, 2))
})

const proxyTestUrl = computed(() => {
  let proxyTestUrl = 'https://ipwho.is/?output=json&fields=ip,country,city,region'

  if (localeToUse.value) {
    proxyTestUrl += `&lang=${localeToUse.value}`
  }

  return proxyTestUrl
})

/** @type {import('vue').ComputedRef<boolean>} */
const areCredentialsSupported = computed(() => {
  return proxyProtocol.value === 'http' || proxyProtocol.value === 'https'
})

function applyNoDpiStatus(status) {
  noDpiAvailable.value = Boolean(status?.available)
  noDpiRuntimeEnabled.value = Boolean(status?.enabled)
  noDpiError.value = status?.errorCode
    ? getNoDpiErrorMessage(status.errorCode)
    : ''
}

function getNoDpiErrorMessage(code) {
  if (code === 'unsupported-platform' || code === 'dependency-unavailable') {
    return t('Settings.Proxy Settings.NoDPI Unavailable')
  }

  return t('Settings.Proxy Settings.NoDPI Failed')
}

function handleNoDpiStatusChanged(status) {
  applyNoDpiStatus(status)
  if (!status?.enabled && noDpiEnabled.value) {
    store.dispatch('updateNoDpiEnabled', false)
  }
}

onMounted(async () => {
  if (!process.env.IS_ELECTRON) {
    noDpiAvailable.value = false
    return
  }

  removeNoDpiStatusListener = window.ftElectron.onNoDpiStatusChanged(handleNoDpiStatusChanged)

  try {
    const status = await window.ftElectron.getNoDpiStatus()
    applyNoDpiStatus(status)

    if (status.enabled && useProxy.value) {
      await store.dispatch('updateUseProxy', false)
    }
    if (noDpiEnabled.value !== Boolean(status.enabled)) {
      await store.dispatch('updateNoDpiEnabled', Boolean(status.enabled))
    }
  } catch (error) {
    noDpiAvailable.value = false
    noDpiRuntimeEnabled.value = false
    noDpiError.value = t('Settings.Proxy Settings.NoDPI Failed')
    if (process.env.NODE_ENV === 'development') {
      console.error('[NoDPI] Failed to read status', error)
    }
  }
})

/**
 * @param {boolean} enabled
 */
async function handleUpdateNoDpi(enabled) {
  if (!process.env.IS_ELECTRON || noDpiLoading.value) return

  noDpiLoading.value = true
  noDpiError.value = ''

  try {
    if (enabled && useProxy.value) {
      disableProxy()
      await store.dispatch('updateUseProxy', false)
    }

    const result = enabled
      ? await window.ftElectron.enableNoDpi()
      : await window.ftElectron.disableNoDpi()

    if (!result?.ok) {
      throw Object.assign(new Error('NoDPI operation failed'), {
        code: result?.error?.code
      })
    }

    applyNoDpiStatus(result.status)
    await store.dispatch('updateNoDpiEnabled', Boolean(result.status?.enabled))
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[NoDPI] Failed to update state', error)
    }

    noDpiRuntimeEnabled.value = false
    if (error?.code === 'unsupported-platform' || error?.code === 'dependency-unavailable') {
      noDpiAvailable.value = false
    }
    noDpiError.value = getNoDpiErrorMessage(error?.code)
    showToast(noDpiError.value)
    await store.dispatch('updateNoDpiEnabled', false)
  } finally {
    noDpiLoading.value = false
  }
}
/**
 * @param {boolean} enabled
 */
async function handleUpdateProxy(enabled) {
  if (enabled && noDpiRuntimeEnabled.value && process.env.IS_ELECTRON) {
    const result = await window.ftElectron.disableNoDpi()
    if (!result?.ok) {
      noDpiError.value = t('Settings.Proxy Settings.NoDPI Failed')
      showToast(noDpiError.value)
      return
    }

    applyNoDpiStatus(result.status)
    await store.dispatch('updateNoDpiEnabled', false)
  }

  if (enabled) {
    enableProxy()
  } else {
    disableProxy()
  }

  await store.dispatch('updateUseProxy', enabled)
}

/**
 * @param {string} value
 */
function handleUpdateProxyProtocol(value) {
  if (useProxy.value) {
    enableProxy()
  }

  store.dispatch('updateProxyProtocol', value)
}

/**
 * @param {string} value
 */
function handleUpdateProxyHostname(value) {
  if (useProxy.value) {
    debouncedEnableProxy()
  }

  store.dispatch('updateProxyHostname', value)
}

onBeforeUnmount(() => {
  removeNoDpiStatusListener?.()
  removeNoDpiStatusListener = undefined
  if (proxyHostname.value === '') {
    store.dispatch('updateProxyHostname', '127.0.0.1')
  }

  if (proxyPort.value === '') {
    store.dispatch('updateProxyPort', '9050')
  }
})

/**
 * @param {string} value
 */
function handleUpdateProxyPort(value) {
  if (useProxy.value) {
    debouncedEnableProxy()
  }

  store.dispatch('updateProxyPort', value)
}

/**
 * @param {string} value
 */
function handleUpdateProxyUsername(value) {
  if (useProxy.value) {
    debouncedEnableProxy()
  }

  store.dispatch('updateProxyUsername', value)
}

/**
 * @param {string} value
 */
function handleUpdateProxyPassword(value) {
  if (useProxy.value) {
    debouncedEnableProxy()
  }

  store.dispatch('updateProxyPassword', value)
}

function enableProxy() {
  if (process.env.IS_ELECTRON) {
    window.ftElectron.enableProxy(proxyUrl.value)
  }
}

const debouncedEnableProxy = debounce(enableProxy, 200)

function disableProxy() {
  if (process.env.IS_ELECTRON) {
    window.ftElectron.disableProxy()
  }

  dataAvailable.value = false
  proxyIp.value = ''
  proxyCountry.value = ''
  proxyRegion.value = ''
  proxyCity.value = ''
}

async function testProxy() {
  isLoading.value = true

  if (!useProxy.value) {
    enableProxy()
  }

  try {
    const response = await fetch(proxyTestUrl.value)
    const json = await response.json()

    proxyIp.value = json.ip
    proxyCountry.value = json.country
    proxyRegion.value = json.region
    proxyCity.value = json.city
    dataAvailable.value = true
  } catch (error) {
    console.error('errored while testing proxy:', error)
    showToast(t('Settings.Proxy Settings["Error getting network information. Is your proxy configured properly?"]'))
    dataAvailable.value = false
  } finally {
    if (!useProxy.value) {
      disableProxy()
    }

    isLoading.value = false
  }
}
</script>

<style scoped src="./ProxySettings.css" />
