export type Values = {
  statisticsApiUrl: string
  subscriptionKeyHeader: string
  contributorGroupName: string
  useEntraRbac: boolean
  entraTenantId: string
  entraClientId: string
  entraRedirectUri: string
  azureSubscriptionId: string
  azureResourceGroupName: string
  apiManagementServiceName: string
  armManagementApiEndpoint: string
  armAuthenticationScope: string
  armApiVersion: string
}

export const valuesDefault: Readonly<Values> = Object.freeze({
  // Base URL of your /statistics API (the one fronted by APIM that returns
  // { consumed, quota, remaining, pct } for a given subscription key)
  statisticsApiUrl: "https://YOUR-APIM-GATEWAY.azure-api.net/statistics",
  // Header name your /statistics API expects the subscription key in.
  subscriptionKeyHeader: "Ocp-Apim-Subscription-Key",
  // Only users matching this APIM group will see the extra aggregate tab.
  contributorGroupName: "contributors",
  // When enabled, management requests use the signed-in Entra user's ARM
  // token and Azure RBAC permissions instead of the portal backend token.
  useEntraRbac: false,
  entraTenantId: "",
  entraClientId: "",
  // Must match a redirect URI configured on the SPA app registration.
  // Leave empty to use the widget iframe URL.
  entraRedirectUri: "",
  azureSubscriptionId: "",
  azureResourceGroupName: "",
  apiManagementServiceName: "",
  armManagementApiEndpoint: "https://management.azure.com",
  // ARM's resource identifier ends in '/', so '.default' requires '//'.
  armAuthenticationScope: "https://management.azure.com//.default",
  armApiVersion: "2024-05-01",
})
