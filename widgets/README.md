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

- **Statistics endpoint:** `https://<your-apim-api-endpoint>/<your-apim-api-path>/statistics`
  - The endpoint must already exist.
- **Subscription validation key:** `x-apim-key`
  - This header or query parameter must already be configured for subscription validation.
- **Authorized group:** `contributors`
  - This API Management group must include the users who need access to the consolidated data.

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

## Required IAM permissions

Grant the API Management `contributors` group the following permissions:

- `Microsoft.ApiManagement/service/read`
- `Microsoft.ApiManagement/service/users/read`
- `Microsoft.ApiManagement/service/groups/read`
- `Microsoft.ApiManagement/service/groups/users/read`
