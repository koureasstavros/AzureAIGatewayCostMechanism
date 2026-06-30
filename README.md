---
language: ["en"]
tags: ["ai", "foundry", "apim", "azure", "policy", "control", "report", "budget"]
license: "apache-2.0"
version: v0.0.1
---

# 💸 Azure AI Gateway Cost Mechanism

  - Cost control and reporting objects for **Azure AI Gateway** across **Azure Foundry** and **Azure API Management (APIM)**.

![AIGateway](material/gateway.png)


## 🧠 Description

This repository contains reusable objects and configuration assets for implementing a **cost mechanism** on top of **Azure AI Gateway**, combining **Azure Foundry** and **APIM** capabilities.


## 💖 Sponsor

This project is freely available to everyone, but your support as a sponsor can make a real difference. By sponsoring, you help us unlock the resources needed to explore new experimental directions—ranging from advanced cost control and monitoring for extended provider and api list.

[🏷️ Sponshor this Project through GitHub](https://github.com/sponsors/koureasstavros) --and let your support shine through GitHub.

[🏷️ Sponshor this Project through PayPal](https://www.paypal.com/donate/?hosted_button_id=E6E5D545H683E) --If you're looking for a donation platform other than GitHub.


## ✨ Capabilities

The repository includes assets to configure operations and reporting for Azure AI Gateway cost tracking.

It is designed to help AI administrators:

- set **cost budgets**, per subscription (user /& product)
- calculate and track **usage-based cost signals**
- generate consolidated and aggregated **cost reports**
- support multiple **AI model modalities** and **providers**

The mechanism supports workloads across:

- **Text**
- **Image**
- **Audio**
- **Video**
- **Embeddings**

It also supports multiple providers, including:

- **OpenAI**
- **Anthropic**

### 🧰 AI tools connectivity

This setup can also be used behind AI developer tools such as:

- **VS Code GitHub Copilot**
- **VS Code Codex**
- **VS Code Claude Code**
- **GitHub Copilot desktop**
- **OpenAI Codex desktop**
- **Claude Code desktop**

To support these clients, a **Front Door** layer is required in the middle.

The Front Door is used to:

- handle the **authorization header** flow
- trim the `Bearer ` schema/prefix from the authorization value
- forward the transformed value so **APIM** can accept it correctly

### 📊 What it measures

The mechanism can count and report:

- **Input tokens**
- **Output tokens**
- **Seconds**

### ⚠️ Current limitation

- The mechanism currently **does not count cached tokens**.
- The mechanism currently **does not count other variations like image or video analysis**.
- You have to manually map your deployment names with cost rations

## 🧩 Supported modalities

The included assets cover common AI request types such as:

- **Text generation**
- **Embeddings**
- **Image generation**
- **Audio transcription**
- **Video generation, download, and remix**

## 🔌 Supported providers

Provider coverage currently includes:

- **OpenAI** operations
- **Anthropic** operations


## 🎯 Use cases

This repository is useful when you want to:

- enforce **AI consumption budgets**
- monitor **token and time-based usage**
- produce **cost and utilization reports**
- standardize **provider-specific cost handling**
- support **multi-model** and **multi-provider** AI gateways
- connect AI coding tools through a gateway path backed by **Front Door** and **APIM**

## 🚀 Coverage summary

The cost mechanism is aligned with Azure AI Gateway scenarios where requests may vary by:

- **Provider**: OpenAI, Anthropic
- **Modality**: text, image, audio, video, embeddings
- **Metric type**: input tokens, output tokens, seconds

This allows a unified approach for cost monitoring across heterogeneous AI endpoints.

## 📈 Reporting focus

The repository supports reporting scenarios for:

- usage aggregation
- budget visibility
- operation-level statistics
- gateway cost analysis

## ⚖️ Notes

- Built for **Azure AI Gateway** scenarios using **Azure Foundry** and **APIM**
- Focused on **cost budgeting** and **cost reporting**
- Supports **input tokens**, **output tokens**, and **seconds**
- **Cached tokens are not included** in the current counting logic
- AI tool connectivity requires **Front Door** in front of **APIM** for authorization-header handling
- Front Door must remove the `Bearer ` schema/prefix before forwarding authorization data to **APIM**

## 🖼️ Gateway walkthrough

- `AIGatewayPostman`: Example client request flow and API testing through the gateway.
![AIGatewayPostman](material/postman.png)

- `AIGatewayPortal`: Azure portal view for gateway-related configuration and management.
![AIGatewayPortal](material/portal.png)

- `AIGatewayReport`: Example reporting output for tracked usage and cost analysis.
![AIGatewayReport](material/report.png)