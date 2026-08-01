import {useCallback, useContext} from "react"
import {OnChange, onChangeWithOrigin} from "@azure/api-management-custom-widgets-tools"

import {getArmAccessToken} from "./entraAuth"
import {Values} from "./values"
import {SecretsContext, WidgetDataContext} from "./providers"

export const useValues = () => useContext(WidgetDataContext).values
export const useEditorValues = () => useContext(WidgetDataContext).data.values
export const useSecrets = () => useContext(SecretsContext)

export function useOnChange(): OnChange<Values> {
  const {data: {instanceId}} = useContext(WidgetDataContext)
  return useCallback(values => onChangeWithOrigin("*", instanceId, values), [instanceId])
}

// Calls either the developer portal backend with the portal-provided token or
// Azure Resource Manager with a delegated Entra token, depending on settings.
export function useRequest(): (url: string, method?: string) => Promise<Response> {
  const secrets = useSecrets()
  const values = useValues()

  return useCallback(async (url, method = "GET") => {
    if (values.useEntraRbac) {
      const requestUrl = buildArmRequestUrl(url, values)
      const accessToken = await getArmAccessToken(values)

      return fetch(requestUrl.toString(), {
        method,
        headers: {Authorization: `Bearer ${accessToken}`},
      })
    }

    const managementUrl = new URL(secrets.managementApiUrl)
    let requestUrl: URL

    try {
      requestUrl = new URL(url)
    } catch {
      if (url.startsWith("?")) {
        requestUrl = new URL(managementUrl)
        requestUrl.search = url
      } else {
        const normalizedPath = url.startsWith("/") ? url : `/${url}`
        const managementPath = managementUrl.pathname.replace(/\/$/, "")
        requestUrl = normalizePathForComparison(normalizedPath).startsWith(`${normalizePathForComparison(managementPath)}/`)
          || normalizePathForComparison(normalizedPath) === normalizePathForComparison(managementPath)
          ? new URL(normalizedPath, managementUrl.origin)
          : new URL(`${managementPath}${normalizedPath}`, managementUrl.origin)
      }
    }

    if (!requestUrl.searchParams.has("api-version")) {
      requestUrl.searchParams.set("api-version", secrets.apiVersion)
    }

    return fetch(requestUrl.toString(), {
      method,
      headers: secrets.token ? {Authorization: secrets.token} : undefined,
    })
  }, [secrets, values])
}

function requireSetting(value: string, name: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`${name} is required when Entra RBAC mode is enabled.`)
  }
  return normalized
}

function buildArmRequestUrl(url: string, values: Values): URL {
  let requestUrl: URL

  try {
    requestUrl = new URL(url)
  } catch {
    const endpoint = requireSetting(values.armManagementApiEndpoint, "ARM management API endpoint")
    const subscriptionId = encodeURIComponent(requireSetting(values.azureSubscriptionId, "Azure subscription ID"))
    const resourceGroup = encodeURIComponent(requireSetting(values.azureResourceGroupName, "Azure resource group name"))
    const serviceName = encodeURIComponent(requireSetting(values.apiManagementServiceName, "API Management service name"))
    const servicePath = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.ApiManagement/service/${serviceName}`
    const normalizedPath = url.startsWith("/") ? url : `/${url}`
    requestUrl = new URL(`${servicePath}${normalizedPath}`, endpoint.endsWith("/") ? endpoint : `${endpoint}/`)
  }

  if (!requestUrl.searchParams.has("api-version")) {
    requestUrl.searchParams.set("api-version", requireSetting(values.armApiVersion, "APIM ARM API version"))
  }

  return requestUrl
}

function normalizePathForComparison(path: string): string {
  return path.replace(/\/$/, "").toLowerCase()
}

export function useDeveloperPortalRequest(): (url: string, method?: string) => Promise<Response> {
  const secrets = useSecrets()

  return useCallback((url, method = "GET") => {
    const baseUrl = new URL(secrets.managementApiUrl)
    let requestUrl: URL

    try {
      requestUrl = new URL(url)
    } catch {
      const normalizedPath = url.startsWith("/") ? url : `/${url}`
      requestUrl = new URL(normalizedPath, baseUrl.origin)
    }

    return fetch(requestUrl.toString(), {
      method,
      headers: secrets.token ? {Authorization: secrets.token} : undefined,
    })
  }, [secrets])
}

// Calls an external API (like your /statistics gateway) with a plain header.
// Deliberately does NOT send the ARM management token or any credentials -
// that token is scoped to the ARM management API only and has no meaning to
// your own gateway.
export function useExternalRequest(): (
  url: string,
  headers: Record<string, string>,
  options?: Omit<RequestInit, "headers">,
) => Promise<Response> {
  return useCallback((url, headers, options) => fetch(url, {...options, headers}), [])
}

