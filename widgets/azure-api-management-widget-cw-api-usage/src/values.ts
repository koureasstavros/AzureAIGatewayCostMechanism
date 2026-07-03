export type Values = {
  statisticsApiUrl: string
  subscriptionKeyHeader: string
  contributorGroupName: string
}

export const valuesDefault: Readonly<Values> = Object.freeze({
  // Base URL of your /statistics API (the one fronted by APIM that returns
  // { consumed, quota, remaining, pct } for a given subscription key)
  statisticsApiUrl: "https://YOUR-APIM-GATEWAY.azure-api.net/statistics",
  // Header name your /statistics API expects the subscription key in.
  subscriptionKeyHeader: "Ocp-Apim-Subscription-Key",
  // Only users matching this APIM group will see the extra aggregate tab.
  contributorGroupName: "contributors",
})
