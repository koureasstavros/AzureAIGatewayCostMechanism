npm run build
populate the.env file with your tenant-id, subscription-id, resource-group-name, service-name and any other property if needed

npm run deploy

The widget will appear under the Custom Widgets section
each time is deployed there is the need to remove the widget and add the widget again to the portal
each time the settings of the widget which are held on the widget are beeing truncated
- https://<your-apim-api-endpoint>/<your-apim-api-path>/statistics #this requires that you already have the endpoint
- x-apim-key #this requires that you already have set this header or query parameter for subscription validation

The api for getting the information should not contain the <base /> annotation as there is no need to hit the base resource
All information is retrived, calculated and return within Azure Management API using internal cache

There is the need for CORS policy in to the API level (/statistics), not in All Operations level (All Operations)
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

There is the need that the api for information contains all available products as the normal api for consumption
Otherwise you would be able to consume from api but not be able to check consumption from portal widgets in case apis are separated