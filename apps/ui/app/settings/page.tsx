"use client";

import AppShell from "../../components/AppShell";
import { Card, CardContent } from "../../components/ui/card";

export default function SettingsPage() {
  return (
    <AppShell title="Settings">
      <h1 className="text-3xl font-semibold text-slate-900">Settings</h1>
      <p className="mt-2 text-slate-500">
        Workspace preferences and appearance.
      </p>
      <Card className="mt-8 max-w-xl">
        <CardContent className="space-y-4 px-6 py-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Theme</h3>
            <p className="text-sm text-slate-500">
              Dark mode is enabled by default. Light mode toggle coming soon.
            </p>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
