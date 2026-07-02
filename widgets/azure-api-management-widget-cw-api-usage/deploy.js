const {deployNodeJS} = require("@azure/api-management-custom-widgets-tools")
const fs = require("fs")
const path = require("path")

const envPath = path.resolve(__dirname, ".env")

if (fs.existsSync(envPath)) {
	for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
		const trimmedLine = line.trim()

		if (!trimmedLine || trimmedLine.startsWith("#")) {
			continue
		}

		const separatorIndex = trimmedLine.indexOf("=")

		if (separatorIndex === -1) {
			continue
		}

		const key = trimmedLine.slice(0, separatorIndex).trim()
		const rawValue = trimmedLine.slice(separatorIndex + 1).trim()
		const value = rawValue.replace(/^['\"]|['\"]$/g, "")

		if (!(key in process.env)) {
			process.env[key] = value
		}
	}
}

const requiredEnvironmentVariables = [
	"APIM_SUBSCRIPTION_ID",
	"APIM_RESOURCE_GROUP_NAME",
	"APIM_SERVICE_NAME",
	"APIM_TENANT_ID"
]

const missingEnvironmentVariables = requiredEnvironmentVariables.filter((variableName) => !process.env[variableName])

if (missingEnvironmentVariables.length > 0) {
	throw new Error(`Missing required environment variables: ${missingEnvironmentVariables.join(", ")}`)
}

const serviceInformation = {
	managementApiEndpoint: process.env.APIM_MANAGEMENT_API_ENDPOINT || "https://management.azure.com",
	resourceId: `subscriptions/${process.env.APIM_SUBSCRIPTION_ID}/resourceGroups/${process.env.APIM_RESOURCE_GROUP_NAME}/providers/Microsoft.ApiManagement/service/${process.env.APIM_SERVICE_NAME}`
}
const name = process.env.APIM_WIDGET_NAME || "cw-api-usage"
const fallbackConfigPath = process.env.APIM_FALLBACK_CONFIG_PATH || "./static/config.msapim.json"
const config = {
	interactiveBrowserCredentialOptions: {
		tenantId: process.env.APIM_TENANT_ID,
		redirectUri: process.env.APIM_REDIRECT_URI || "http://localhost:1337"
	}
}

deployNodeJS(serviceInformation, name, fallbackConfigPath, config)
