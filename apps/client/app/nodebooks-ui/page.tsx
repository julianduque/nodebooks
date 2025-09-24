"use client";

import React from "react";
export const dynamic = "force-dynamic";
import {
  AlertCallout,
  BadgeTag,
  CodeBlock,
  DataSummary,
  HtmlBlock,
  Image as UiImage,
  JsonViewer,
  Markdown,
  MetricTile,
  ProgressBar,
  Spinner,
  TableGrid,
  UiCard,
} from "@nodebooks/notebook-ui";

const sampleRows = [
  { id: 1, name: "Alice", age: 30, active: true },
  { id: 2, name: "Bob", age: 24, active: false },
  { id: 3, name: "Cory", age: 37, active: true },
];

const manyRows = Array.from({ length: 125 }, (_, i) => ({
  id: i + 1,
  name: `User ${i + 1}`,
  age: 18 + ((i * 7) % 50),
  active: i % 3 === 0,
  score: Math.round((Math.sin(i / 5) + 1) * 50),
}));

const demoSchema = [
  { name: "id", type: "number", nullable: false },
  { name: "name", type: "string", nullable: false },
  { name: "age", type: "number", nullable: false },
  { name: "active", type: "boolean", nullable: false },
  { name: "score", type: "number", nullable: true },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const demoStats: Record<string, any> = {
  age: {
    count: manyRows.length,
    distinct: 50,
    nulls: 0,
    min: 18,
    max: 67,
    mean: 42.1,
    median: 42,
    p25: 30,
    p75: 54,
    stddev: 12.7,
  },
  score: {
    count: manyRows.length,
    distinct: 90,
    nulls: 0,
    min: 0,
    max: 100,
    mean: 50.2,
    median: 50,
    p25: 25,
    p75: 75,
    stddev: 21.3,
  },
};

export default function UiPlaygroundPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <h1 className="text-2xl font-bold tracking-tight">UI Playground</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Alerts</h2>
        <UiCard>
          <div className="grid gap-3 md:grid-cols-2">
            <AlertCallout
              level="info"
              title="Heads up"
              text="This is an info alert with icon."
            />
            <AlertCallout
              level="success"
              title="Great!"
              text="Your action completed successfully."
            />
            <AlertCallout
              level="warn"
              title="Warning"
              text="Something needs your attention."
            />
            <AlertCallout
              level="error"
              title="Error"
              text="Something went wrong."
            />
          </div>
        </UiCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Badges</h2>
        <UiCard>
          <div className="flex flex-wrap gap-3">
            <BadgeTag text="Default" />
            <BadgeTag text="Info" color="info" />
            <BadgeTag text="Success" color="success" />
            <BadgeTag text="Warn" color="warn" />
            <BadgeTag text="Error" color="error" />
            <BadgeTag text="Brand" color="brand" />
          </div>
        </UiCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Spinner & Progress</h2>
        <UiCard>
          <div className="flex flex-wrap items-center gap-6">
            <Spinner label="Loading" size="sm" />
            <Spinner label="Fetching data" size="md" />
            <Spinner label="Compiling" size="lg" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <ProgressBar label="Deterministic" value={42} max={100} />
            <ProgressBar label="Indeterminate" indeterminate />
          </div>
        </UiCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Metrics</h2>
        <UiCard>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricTile
              label="Throughput"
              value={1234}
              unit="req/s"
              delta={12}
              helpText="Last 5 min"
            />
            <MetricTile
              label="Latency"
              value={245}
              unit="ms"
              delta={-8}
              helpText="P95 vs prev"
            />
            <MetricTile
              label="Errors"
              value={0}
              unit="/min"
              delta={0}
              helpText="Last hour"
            />
          </div>
        </UiCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">JSON Viewer</h2>
        <UiCard>
          <JsonViewer
            json={{
              message: "Hello, world",
              items: [{ id: 1 }, { id: 2 }],
              nested: { a: 1, b: true, c: null },
            }}
            collapsed
          />
        </UiCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Tables</h2>
        <UiCard>
          <TableGrid rows={sampleRows} page={{ index: 0, size: 10 }} />
        </UiCard>
        <UiCard>
          <TableGrid
            rows={manyRows}
            page={{ index: 0, size: 20 }}
            sort={{ key: "id", direction: "asc" }}
          />
        </UiCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Data Summary</h2>
        <UiCard>
          <DataSummary
            title="User Dataset"
            schema={demoSchema}
            stats={demoStats}
            sample={manyRows.slice(0, 8)}
            note="Synthetic dataset to showcase schema, stats and sample rows."
          />
        </UiCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Code & Markdown & HTML</h2>
        <UiCard>
          <CodeBlock
            language="ts"
            code={`export function add(a: number, b: number) {\n  return a + b;\n}`}
          />
        </UiCard>
        <UiCard>
          <Markdown
            markdown={"## Markdown\n\n- One\n- Two\n\n**Bold** and _italic_."}
          />
        </UiCard>
        <UiCard>
          <HtmlBlock html="<p>This <strong>HTML</strong> is sanitized.</p>" />
        </UiCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Image</h2>
        <UiCard>
          <UiImage
            src="/icon.svg"
            alt="NodeBooks"
            width={220}
            height={66}
            fit="contain"
          />
        </UiCard>
      </section>
    </div>
  );
}
