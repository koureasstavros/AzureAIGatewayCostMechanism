import {
  AccountInfo,
  InteractionRequiredAuthError,
  PublicClientApplication,
} from "@azure/msal-browser"

type EntraAuthSettings = {
  entraTenantId: string
  entraClientId: string
  entraRedirectUri: string
  armAuthenticationScope: string
}

let clientKey = ""
let client: PublicClientApplication | undefined
let initialization: Promise<void> | undefined
let tokenRequest: Promise<string> | undefined

function requireSetting(value: string, name: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`${name} is required when Entra RBAC mode is enabled.`)
  }
  return normalized
}

async function getClient(values: EntraAuthSettings): Promise<PublicClientApplication> {
  const tenantId = requireSetting(values.entraTenantId, "Entra tenant ID")
  const clientId = requireSetting(values.entraClientId, "Entra client ID")
  const redirectUri = values.entraRedirectUri.trim()
    || `${window.location.origin}${window.location.pathname}`
  const nextKey = `${tenantId}|${clientId}|${redirectUri}`

  if (!client || clientKey !== nextKey) {
    clientKey = nextKey
    client = new PublicClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri,
      },
      cache: {
        cacheLocation: "sessionStorage",
      },
    })
    initialization = client.initialize()
  }

  await initialization
  return client
}

function selectAccount(msalClient: PublicClientApplication, tenantId: string): AccountInfo | undefined {
  const normalizedTenantId = tenantId.toLowerCase()
  const activeAccount = msalClient.getActiveAccount()

  if (activeAccount?.tenantId.toLowerCase() === normalizedTenantId) {
    return activeAccount
  }

  return msalClient.getAllAccounts()
    .find(account => account.tenantId.toLowerCase() === normalizedTenantId)
}

async function acquireArmToken(values: EntraAuthSettings): Promise<string> {
  const msalClient = await getClient(values)
  const tenantId = requireSetting(values.entraTenantId, "Entra tenant ID")
  const authority = `https://login.microsoftonline.com/${tenantId}`
  const scopes = [requireSetting(values.armAuthenticationScope, "ARM authentication scope")]
  let account = selectAccount(msalClient, tenantId)

  if (account) {
    try {
      const result = await msalClient.acquireTokenSilent({account, authority, scopes})
      msalClient.setActiveAccount(result.account)
      return result.accessToken
    } catch (error) {
      if (!(error instanceof InteractionRequiredAuthError)) {
        throw error
      }
    }
  }

  const result = account
    ? await msalClient.acquireTokenPopup({account, authority, scopes})
    : await msalClient.loginPopup({authority, scopes})

  msalClient.setActiveAccount(result.account)
  return result.accessToken
}

export function getArmAccessToken(values: EntraAuthSettings): Promise<string> {
  if (!tokenRequest) {
    tokenRequest = acquireArmToken(values).finally(() => {
      tokenRequest = undefined
    })
  }

  return tokenRequest
}
