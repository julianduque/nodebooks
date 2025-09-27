import type { SettingsService } from "./service.js";

let instance: SettingsService | null = null;

export const setSettingsService = (service: SettingsService) => {
  instance = service;
};

export const getSettingsService = (): SettingsService => {
  if (!instance) {
    throw new Error("SettingsService has not been initialized yet");
  }
  return instance;
};
