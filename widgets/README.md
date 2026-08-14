# API Management Custom Widget

## Build and deploy

1. Navigate to the widget directory:

   ```powershell
   cd widgets\azure-api-management-widget-cw-api-usage
   ```

2. Build the widget:

   ```powershell
   npm run build
   ```

3. Populate the `.env` file with the required values, including:

   - Tenant ID
   - Subscription ID
   - Resource group name
   - API Management service name
   - Any other required properties

4. Deploy the widget:

   ```powershell
   npm run deploy
   ```

The widget will appear in the **Custom Widgets** section of the API Management developer portal.

> [!IMPORTANT]
> After each deployment, remove the widget from the portal and add it again. Redeployment truncates the settings stored by the widget.

## Widget settings

Configure the widget with the following values:
- **Width**: `px` or `%`
  - This allows the configuration of the width, need to be configured for each view.
- **Height**: `px` or `%`
  - This allows the configuration of the height, need to be configured for each view.
- **Allow allow-same-origin:** `true`
  - This allows rendering from devices and/or browsers with strict policies like iOS.

## Widget Portal authentication

The widget supports portal authentication through settings:

- **Statistics endpoint:** `https://<your-apim-api-endpoint>/<your-apim-api-path>/statistics`
  - The endpoint must already exist.
- **Subscription validation key:** `x-apim-key`
  - This header or query parameter must already be configured for subscription validation.
- **Authorized group:** `contributors`
  - This API Management group must include the users who need access to the consolidated data.

## Widget Management authentication

The widget supports management authentication modes:

- **Developer portal context (default):** Uses the token and portal backend URL returned by `askForSecrets("app")`.
- **Entra RBAC:** Acquires an Azure Resource Manager token for the signed-in user with MSAL Browser. Azure evaluates that user's role assignments on the API Management resource.

### Enable Entra RBAC mode

1. Create an Entra app registration and add the **Single-page application** platform.
2. Add the exact widget iframe URL as a redirect URI. If a different URI is registered, enter it in the widget's **Entra redirect URI** setting.
3. Add the delegated **Azure Service Management** permission `user_impersonation` and grant any consent required by your tenant.
4. Assign the required Azure role to the users, or preferably an Entra security group, at the API Management service scope.
5. Configure these widget settings:
  - **Use signed-in Entra user and Azure RBAC:** enabled
  - **Entra tenant ID:** tenant associated with the Azure subscription; guest users must also acquire their ARM token from this resource tenant
  - **Entra SPA client ID:** application/client ID of the SPA registration
  - **Entra redirect URI:** optional; when empty, the widget iframe URL is used
  - **Azure subscription ID**
  - **Azure resource group name**
  - **API Management service name**
  - **ARM management API endpoint:** normally `https://management.azure.com`
  - **ARM authentication scope:** `https://management.azure.com//.default` for public Azure; the double slash is required because ARM's resource identifier ends with `/`
  - **APIM ARM API version:** normally `2024-05-01`

This is a public-client authorization-code flow with PKCE. Do not create or configure a client secret for the widget. Tenant ID, client ID, and Azure resource identifiers are public configuration.

The developer portal's Entra session can allow silent single sign-on. Browser privacy restrictions or missing consent can still cause an Entra popup. The portal token returned by `askForSecrets` is not reused as an ARM token.

## Statistics API configuration

The API used to retrieve statistics must not contain the `<base />` policy element because it does not need to call a backend resource. All information is retrieved, calculated, and returned through the Azure Management API using an internal cache.

### CORS policy

Configure the CORS policy at the `/statistics` API level, not at the **All Operations** level:

```xml
<inbound>
    <cors allow-credentials="false">
        <allowed-origins>
            <origin>https://<your-apim-portal-endpoint></origin>
        </allowed-origins>
        <allowed-methods>
            <method>GET</method>
            <method>OPTIONS</method>
        </allowed-methods>
        <allowed-headers>
            <header>x-apim-key</header>
            <header>Content-Type</header>
            <header>Authorization</header>
        </allowed-headers>
        <expose-headers>
            <header>Content-Type</header>
            <header>Content-Length</header>
        </expose-headers>
    </cors>
</inbound>
```

### Product availability

The statistics API must be included in all products that expose the regular API for consumption. Otherwise, users may be able to consume an API but unable to view its usage in the portal widget when APIs are separated across products.

## Required IAM permissions for Entra RBAC mode

Grant the signed-in Entra users, or preferably an Entra security group, the following permissions at the API Management service scope:

 - "Microsoft.ApiManagement/service/read",
 - "Microsoft.ApiManagement/service/users/read",
 - "Microsoft.ApiManagement/service/groups/read",
 - "Microsoft.ApiManagement/service/groups/users/read",
 - "Microsoft.ApiManagement/service/products/read",
 - "Microsoft.ApiManagement/service/subscriptions/read",
 - "Microsoft.ApiManagement/service/users/subscriptions/read",
 - "Microsoft.ApiManagement/service/subscriptions/listSecrets/action"

 or grant the following role (which embeds the necessary permissions):
 - API Management Service Contributor

> [!WARNING]
> A user granted `Microsoft.ApiManagement/service/subscriptions/listSecrets/action` can retrieve API Management subscription keys directly through Azure Resource Manager outside the widget. If this is not acceptable, use a server-side proxy or managed identity instead of delegated user access.

An API Management developer portal group such as `contributors` is not an Azure RBAC principal. It controls portal behavior separately. Azure roles must be assigned to an Entra user, service principal, managed identity, or Entra security group.

 ## Builtin administrator portal design
 During portal design it might be the case that iframe controls like edit widget or delete options not appear. In this case open DevTools and navigate to console. Then switch to reports context.
 Type: allow pasting
 Type: document.querySelector('custom-widget-runtime iframe').style.pointerEvents = 'none'