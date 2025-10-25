"use client";
import React from "react";

export interface UiInteractionEvent {
  handlerId: string;
  event: string;
  payload?: unknown;
  componentId?: string;
  displayId?: string;
}

export type UiInteractionDispatcher = (
  event: UiInteractionEvent
) => Promise<void> | void;

export interface UiInteractionContextValue {
  displayId?: string;
  onInteraction?: UiInteractionDispatcher | null;
}

export const UiInteractionContext =
  React.createContext<UiInteractionContextValue>({
    displayId: undefined,
    onInteraction: null,
  });

export const useUiInteractionContext = () =>
  React.useContext(UiInteractionContext);
