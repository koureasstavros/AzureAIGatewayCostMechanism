import React, {useEffect, useState} from "react"
import {
  askForSecrets,
  getValues,
  getWidgetData,
  Secrets,
  TargetModule,
} from "@azure/api-management-custom-widgets-tools"
import {Values, valuesDefault} from "./values"

export const WidgetDataContext = React.createContext({data: getWidgetData<Values>(), values: getValues(valuesDefault)})
export const WidgetDataProvider: React.FC<{children?: React.ReactNode}> = ({children}) => (
  <WidgetDataContext.Provider value={{data: getWidgetData<Values>(), values: getValues(valuesDefault)}}>
    {children}
  </WidgetDataContext.Provider>
)

export const SecretsContext = React.createContext<Secrets>({
  token: "",
  userId: "",
  apiVersion: "",
  managementApiUrl: "",
  parentLocation: {
    host: "",
    hostname: "",
    href: "",
    origin: "",
    pathname: "",
    port: "",
    protocol: "",
    search: "",
  },
})
export const SecretsProvider: React.FC<{children?: React.ReactNode; targetModule: TargetModule}> = (
  {children, targetModule},
) => {
  const [secrets, setSecrets] = useState<Secrets | undefined>()
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    let mounted = true
    const timeout = window.setTimeout(() => {
      if (mounted) {
        setError("The developer portal did not provide the widget session. Reload the page and verify that third-party content is not blocked.")
      }
    }, 10000)

    askForSecrets(targetModule)
      .then(value => {
        if (mounted) {
          window.clearTimeout(timeout)
          setError(undefined)
          setSecrets(value)
        }
      })
      .catch(reason => {
        console.error(reason)
        if (mounted) {
          window.clearTimeout(timeout)
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      })

    return () => {
      mounted = false
      window.clearTimeout(timeout)
    }
  }, [targetModule])

  if (secrets) {
    return <SecretsContext.Provider value={secrets}>{children}</SecretsContext.Provider>
  }

  return error
    ? <div className="widget-startup-error" role="alert">Unable to start the API usage widget. {error}</div>
    : <div className="loading" role="status" aria-live="polite">Loading API usage…</div>
}
