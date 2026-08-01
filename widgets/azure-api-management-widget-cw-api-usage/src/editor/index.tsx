import {useEditorValues, useOnChange} from "../hooks"
import {Values, valuesDefault} from "../values"

type StringValueKey = {
  [Key in keyof Values]: Values[Key] extends string ? Key : never
}[keyof Values]

function InputField({valueKey, title}: {valueKey: StringValueKey, title?: string}) {
  const editorValues = useEditorValues()
  const onChange = useOnChange()

  return (
    <div className="form-group">
      <label className="form-label" htmlFor={valueKey}>
        {title ?? valueKey}
      </label>
      <div className="input-group">
        <input
          className="form-control"
          type="text"
          placeholder={valuesDefault[valueKey]}
          defaultValue={editorValues[valueKey]}
          onInput={e => {
            const target = e.target as HTMLInputElement
            onChange({[valueKey]: target.value})
          }}
        />
      </div>
    </div>
  )
}

function CheckboxField({valueKey, title}: {valueKey: "useEntraRbac", title: string}) {
  const editorValues = useEditorValues()
  const onChange = useOnChange()

  return (
    <div className="form-group">
      <label className="form-label" htmlFor={valueKey}>
        <input
          id={valueKey}
          type="checkbox"
          defaultChecked={editorValues[valueKey] ?? valuesDefault[valueKey]}
          onChange={event => onChange({[valueKey]: event.target.checked})}
        />
        {` ${title}`}
      </label>
    </div>
  )
}

const Editor = () => (
  <fieldset className="form">
    <div className="form-group">
      <InputField valueKey="statisticsApiUrl" title="Statistics API URL" />
      <InputField valueKey="subscriptionKeyHeader" title="Subscription key header name" />
      <InputField valueKey="contributorGroupName" title="Contributor group name" />
      <CheckboxField valueKey="useEntraRbac" title="Use signed-in Entra user and Azure RBAC" />
      <InputField valueKey="entraTenantId" title="Entra tenant ID" />
      <InputField valueKey="entraClientId" title="Entra SPA client ID" />
      <InputField valueKey="entraRedirectUri" title="Entra redirect URI (optional)" />
      <InputField valueKey="azureSubscriptionId" title="Azure subscription ID" />
      <InputField valueKey="azureResourceGroupName" title="Azure resource group name" />
      <InputField valueKey="apiManagementServiceName" title="API Management service name" />
      <InputField valueKey="armManagementApiEndpoint" title="ARM management API endpoint" />
      <InputField valueKey="armAuthenticationScope" title="ARM authentication scope" />
      <InputField valueKey="armApiVersion" title="APIM ARM API version" />
    </div>
  </fieldset>
)

export default Editor
