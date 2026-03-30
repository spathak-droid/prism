"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  const [provider, setProvider] = useState("claude-code");
  const [model, setModel] = useState("default");
  const [maxReviewCycles, setMaxReviewCycles] = useState(3);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure Prism defaults. Most settings are read from environment variables at runtime.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Model Configuration</CardTitle>
          <CardDescription>
            Default provider and model used by agents. Override with environment variables.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <Input
              id="provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="claude-code"
            />
            <p className="text-xs text-muted-foreground">
              Override with the <code className="font-mono bg-muted px-1 rounded">GOOSE_PROVIDER</code> environment variable.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="default"
            />
            <p className="text-xs text-muted-foreground">
              Override with the <code className="font-mono bg-muted px-1 rounded">GOOSE_MODEL</code> environment variable.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workflow Settings</CardTitle>
          <CardDescription>
            Controls for the automated build-review loop.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="maxReviewCycles">Max Review Cycles</Label>
            <Input
              id="maxReviewCycles"
              type="number"
              min={1}
              max={10}
              value={maxReviewCycles}
              onChange={(e) => setMaxReviewCycles(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of build-review iterations before escalating to a human (1–10).
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave}>
          {saved ? "Saved!" : "Save"}
        </Button>
        {saved && (
          <p className="text-sm text-muted-foreground">
            Settings saved. Note: active env vars take precedence at runtime.
          </p>
        )}
      </div>
    </div>
  );
}
