import {useCallback, useContext} from "react"
import {OnChange, onChangeWithOrigin} from "@azure/api-management-custom-widgets-tools"

import {Values} from "./values"
import {SecretsContext, WidgetDataContext} from "./providers"

export const useValues = () => useContext(WidgetDataContext).values
export const useEditorValues = () => useContext(WidgetDataContext).data.values
export const useSecrets = () => useContext(SecretsContext)

export function useOnChange(): OnChange<Values> {
  const {data: {instanceId}} = useContext(WidgetDataContext)
  return useCallback(values => onChangeWithOrigin("*", instanceId, values), [instanceId])
}

// Calls the ARM management API (the one askForSecrets gave us a token for),
// e.g. useManagementRequest()("/users/123/subscriptions") or, with a method,
// useManagementRequest()("/subscriptions/abc/listSecrets", "POST")
export function useRequest(): (url: string, method?: string) => Promise<Response> {
  const secrets = useSecrets()

  return useCallback((url, method = "GET") =>
    fetch(
      `${secrets.managementApiUrl}${url}?api-version=${secrets.apiVersion}`,
      {
        method,
        headers: secrets.token ? {Authorization: secrets.token} : undefined,
      },
    ), [secrets])
}

export function useDeveloperPortalRequest(): (url: string, method?: string) => Promise<Response> {
  const secrets = useSecrets()

  return useCallback((url, method = "GET") => {
    const baseUrl = new URL(secrets.managementApiUrl)
    const normalizedPath = url.startsWith("/") ? url : `/${url}`
    const requestUrl = `${baseUrl.origin}${normalizedPath}`

    return fetch(requestUrl, {
      method,
      headers: secrets.token ? {Authorization: secrets.token} : undefined,
    })
  }, [secrets])
}

// Calls an external API (like your /statistics gateway) with a plain header.
// Deliberately does NOT send the ARM management token or any credentials -
// that token is scoped to the ARM management API only and has no meaning to
// your own gateway.
export function useExternalRequest(): (url: string, headers: Record<string, string>) => Promise<Response> {
  return useCallback((url, headers) => fetch(url, {headers}), [])
}

