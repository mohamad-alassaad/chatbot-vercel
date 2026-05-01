import { createOpenAI } from "@ai-sdk/openai";
import { customProvider, gateway } from "ai";
import { isTestEnvironment } from "../constants";
import { titleModel } from "./models";

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const myProvider = isTestEnvironment
  ? (() => {
      const { chatModel, titleModel } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "title-model": titleModel,
        },
      });
    })()
  : null;

const DIRECT_PREFIX = "openai-direct/";

function resolveModel(modelId: string) {
  if (modelId.startsWith(DIRECT_PREFIX)) {
    return openai(modelId.slice(DIRECT_PREFIX.length));
  }
  return gateway.languageModel(modelId);
}

export function getLanguageModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }
  return resolveModel(modelId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  return resolveModel(titleModel.id);
}
