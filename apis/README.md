# API Configuration Notes

This section describes where each API operation expects the model to be specified.

## OpenAI Completions

- **OpenAI Completions:** The model is specified in the URL, and the temperature must be set to `1`.
- **OpenAI V1 Completions:** The model is specified in the request body.
- **OpenAI Responses:** The model is specified in the request body.
- **OpenAI V1 Responses:** The model is specified in the request body.

## OpenAI Embeddings

- **OpenAI Embeddings:** The model is specified in the request body.
- **OpenAI V1 Embeddings:** The model is specified in the request body.

## OpenAI Images

- **OpenAI Image Generations:** The model is specified in the URL.
- **OpenAI V1 Image Generations:** The model is specified in the request body.
- **OpenAI Image Edits:** The model is specified in the URL.
- **OpenAI V1 Image Edits:** The model is specified in the request body.

## OpenAI Audio

- **OpenAI Audio Transcriptions:** The model is specified in the URL.
- **OpenAI V1 Audio Transcriptions:** The model is specified in the request body.
- **OpenAI Audio Translations:** The model is specified in the URL.
- **OpenAI V1 Audio Translations:** The model is specified in the request body.

## OpenAI Video

- **OpenAI Video Generations:** The model is specified in the URL.
- **OpenAI V1 Video Generations:** The model is specified in the request body.

## Anthropic Messages

- **Anthropic Messages:** The model is specified in the request body.
- **Anthropic V1 Messages:** The model is specified in the request body.



# API Variable Notes

This section describes how variables should be specified and handled

APIM retrieves and stores the variables as strings but the binary object in cache will be different.

- "true" or "0" are not true strings

- "@(true)" or "@((double)0)" are true strings