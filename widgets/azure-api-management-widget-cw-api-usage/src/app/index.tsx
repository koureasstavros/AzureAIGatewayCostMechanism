import {useCallback, useEffect, useState} from "react"
import {useDeveloperPortalRequest, useExternalRequest, useRequest, useSecrets, useValues} from "../hooks"

type SubscriptionProperties = {
  displayName?: string
  name?: string
  primaryKey?: string
  secondaryKey?: string
  state?: string
  scope?: string
}

type SubscriptionEntity = {
  id: string
  name: string
  ownerId?: string
  primaryKey?: string
  secondaryKey?: string
  displayName?: string
  state?: string
  scope?: string
  properties?: SubscriptionProperties
}

type ProductProperties = {
  displayName?: string
  title?: string
}

type ProductEntity = {
  id: string
  name: string
  properties?: ProductProperties
}

type UsageStats = {
  consumed: number
  quota: number
  remaining: number
  pct: number
}

type UsageItem = {
  name: string
  subscriptionId: string
  productName?: string
  state?: string
  scope?: string
  debug?: string[]
  stats?: UsageStats
  error?: string
}

function prettifyName(value: string): string {
  return value
    .split(/[\-_]/g)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function getScopeSegment(scope: string | undefined): string | undefined {
  if (!scope) return undefined
  const parts = scope.split("/").filter(Boolean)
  return parts.at(-1)
}

function normalizeManagementPath(path: string): string {
  if (!path) return path
  const withoutQuery = path.split("?")[0] ?? path
  if (withoutQuery.startsWith("http://") || withoutQuery.startsWith("https://")) {
    try {
      return new URL(withoutQuery).pathname
    } catch {
      return withoutQuery
    }
  }

  return withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`
}

function isProductScope(scope: string | undefined): boolean {
  return Boolean(scope && /\/products\//i.test(scope))
}

function formatError(err: unknown): string {
  if (err instanceof TypeError && err.message === "Failed to fetch") {
    return "Failed to fetch. Check the statistics URL, CORS policy, HTTPS certificate, and whether the API is reachable from the browser."
  }

  return err instanceof Error ? err.message : String(err)
}

function barClassName(pct: number): string {
  if (pct >= 90) return "usage-bar-fill high"
  if (pct >= 70) return "usage-bar-fill warn"
  return "usage-bar-fill"
}

function getSubscriptionKey(sub: SubscriptionEntity): string | undefined {
  return sub.primaryKey
    ?? sub.secondaryKey
    ?? sub.properties?.primaryKey
    ?? sub.properties?.secondaryKey
}

function getSubscriptionScope(sub: SubscriptionEntity): string | undefined {
  return sub.scope ?? sub.properties?.scope
}

function getSubscriptionState(sub: SubscriptionEntity): string | undefined {
  return sub.state ?? sub.properties?.state
}

function getSubscriptionDisplayName(sub: SubscriptionEntity): string | undefined {
  return sub.displayName ?? sub.properties?.displayName ?? sub.properties?.name
}

const App = () => {
  const values = useValues()
  const {userId} = useSecrets()
  const request = useRequest()
  const developerPortalRequest = useDeveloperPortalRequest()
  const externalRequest = useExternalRequest()

  const [items, setItems] = useState<UsageItem[] | undefined>()
  const [loadError, setLoadError] = useState<string | undefined>()
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = useCallback(() => {
    setItems(undefined)
    setLoadError(undefined)
    setRefreshToken(value => value + 1)
  }, [])

  useEffect(() => {
    if (!userId) return

    let cancelled = false

    async function load() {
      try {
        // 1. List this user's subscriptions.
        //    In the user context this payload includes primaryKey/secondaryKey,
        //    unlike the admin ARM-shaped response.
        const subsRes = await developerPortalRequest(`/developer/users/${userId}/subscriptions?$top=50&$skip=0&api-version=2022-04-01-preview`)
        if (!subsRes.ok) throw new Error(`Could not load subscriptions (${subsRes.status})`)
        const subsBody = await subsRes.json()
        const subs: SubscriptionEntity[] = subsBody.value ?? []

        const productNameByScope = new Map<string, string>()

        await Promise.all(
          Array.from(new Set(
            subs
              .map(sub => normalizeManagementPath(getSubscriptionScope(sub) ?? ""))
              .filter((scope): scope is string => Boolean(scope) && isProductScope(scope)),
          ))
            .map(async scope => {
              try {
                const productRes = await request(scope)
                if (!productRes.ok) return

                const product: ProductEntity = await productRes.json()
                const productName = product.properties?.displayName ?? product.properties?.title ?? product.name
                if (productName) {
                  productNameByScope.set(scope, productName)
                }
              } catch {
                // Ignore product lookup failures and fall back to subscription id.
              }
            }),
        )

        // 2. For each subscription, use the key from the subscriptions payload,
        //    then call your /statistics API with that key.
        const results = await Promise.all(
          subs.map(async (sub): Promise<UsageItem> => {
            const normalizedScope = normalizeManagementPath(getSubscriptionScope(sub) ?? "")
            const productName = normalizedScope ? productNameByScope.get(normalizedScope) : undefined
            const scopeName = getScopeSegment(normalizedScope)
            const name = getSubscriptionDisplayName(sub)
              ?? productName
              ?? (scopeName ? prettifyName(scopeName) : undefined)
              ?? sub.name
            const debug: string[] = []

            try {
              debug.push(`subscriptionId=${sub.name}`)
              debug.push(`subscriptionState=${getSubscriptionState(sub) ?? "unknown"}`)
              debug.push(`statisticsApiUrl=${values.statisticsApiUrl}`)
              debug.push(`subscriptionKeyHeader=${values.subscriptionKeyHeader}`)

              const key = getSubscriptionKey(sub)
              if (!key) throw new Error("No subscription key available")
              debug.push(`subscriptionKeyFound=${key ? "yes" : "no"}`)

              const statsRes = await externalRequest(values.statisticsApiUrl, {
                [values.subscriptionKeyHeader]: key,
              })
              debug.push(`statisticsStatus=${statsRes.status}`)
              if (!statsRes.ok) throw new Error(`Statistics request failed (${statsRes.status})`)
              const stats: UsageStats = await statsRes.json()
              debug.push(`statisticsResponse=${JSON.stringify(stats)}`)

              return {
                name,
                subscriptionId: sub.name,
                productName,
                state: getSubscriptionState(sub),
                scope: normalizedScope,
                stats,
                debug,
              }
            } catch (err) {
              debug.push(`error=${formatError(err)}`)

              return {
                name,
                subscriptionId: sub.name,
                productName,
                state: getSubscriptionState(sub),
                scope: normalizedScope,
                debug,
                error: formatError(err),
              }
            }
          }),
        )

        if (!cancelled) setItems(results)
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err))
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [userId, request, developerPortalRequest, externalRequest, values.statisticsApiUrl, values.subscriptionKeyHeader, refreshToken])

  const content = (() => {
    if (loadError) {
      return <div className="usage-error">Could not load your usage: {loadError}</div>
    }

    if (!items) {
      return <div className="usage-loading">Loading your usage…</div>
    }

    if (items.length === 0) {
      return <div className="usage-loading">No active subscriptions found.</div>
    }

    return (
      <>
        {items.map(item => (
          <div className="usage-card" key={item.subscriptionId}>
            <div className="usage-card-header">
              <h4>{item.name}</h4>
              {item.state && item.state !== "active" ? <span className="usage-badge">{item.state}</span> : null}
            </div>
            {item.name !== item.subscriptionId ? <div className="usage-subtitle">Subscription ID: {item.subscriptionId}</div> : null}
            {item.productName && item.productName !== item.name ? <div className="usage-subtitle">Product: {item.productName}</div> : null}
            {item.scope ? <div className="usage-subtitle">{item.scope}</div> : null}
            {item.error || !item.stats ? (
              <>
                <div className="usage-error">Could not load usage: {item.error}</div>
                {item.debug?.length ? (
                  <details className="usage-debug">
                    <summary>Debug details</summary>
                    <ul>
                      {item.debug.map(line => <li key={line}>{line}</li>)}
                    </ul>
                  </details>
                ) : null}
              </>
            ) : (
              <>
                <div className="usage-bar-track">
                  <div
                    className={barClassName(item.stats.pct)}
                    style={{width: `${Math.min(item.stats.pct, 100)}%`}}
                  />
                </div>
                <div className="usage-meta">
                  <span>{item.stats.consumed.toFixed(2)} / {item.stats.quota} used</span>
                  <span>{item.stats.remaining.toFixed(2)} remaining ({item.stats.pct.toFixed(1)}%)</span>
                </div>
                {item.debug?.length ? (
                  <details className="usage-debug">
                    <summary>Debug details</summary>
                    <ul>
                      {item.debug.map(line => <li key={line}>{line}</li>)}
                    </ul>
                  </details>
                ) : null}
              </>
            )}
          </div>
        ))}
      </>
    )
  })()

  return (
    <div className="usage-widget-root">
      <div className="usage-widget-header">
        <div>
          <h3 className="usage-widget-title">API usage</h3>
          <div className="usage-widget-caption">Your current subscription usage and quota status.</div>
        </div>
        <button className="usage-refresh-button" onClick={refresh} type="button">Refresh</button>
      </div>
      {content}
    </div>
  )
}

export default App
