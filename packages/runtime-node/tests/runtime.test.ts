import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NODEBOOKS_UI_MIME, createCodeCell } from "@nodebooks/notebook-schema";
import { NotebookRuntime } from "../src/index.js";
import type {
  DisplayDataOutput,
  NotebookOutput,
} from "@nodebooks/notebook-schema";

const isDisplayData = (output: NotebookOutput): output is DisplayDataOutput =>
  output.type === "display_data";

const createEnv = (packages: Record<string, string> = {}) => ({
  runtime: "node" as const,
  version: "20.x",
  packages,
  variables: {},
});

const createTempRoot = async () => {
  return fs.mkdtemp(join(tmpdir(), "nodebooks-runtime-test-"));
};

type RuntimeOptions = ConstructorParameters<typeof NotebookRuntime>[0];

const withRuntime = async (
  options: RuntimeOptions | undefined,
  run: (runtime: NotebookRuntime, root: string) => Promise<void>
) => {
  const root = await createTempRoot();
  const runtime = new NotebookRuntime({
    ...(options ?? {}),
    workspaceRoot: root,
  });
  try {
    await run(runtime, root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
};

describe("NotebookRuntime", () => {
  it("executes JavaScript and captures console output", async () => {
    await withRuntime(undefined, async (runtime) => {
      const cell = createCodeCell({ id: "cell-js", language: "js" });
      const streams: string[] = [];

      const result = await runtime.execute({
        cell,
        code: "console.log('hello runtime'); 2 + 3;",
        notebookId: "notebook-basic",
        env: createEnv(),
        onStream: (output) => {
          streams.push(output.text.trim());
        },
      });

      expect(result.execution.status).toBe("ok");
      expect(streams.some((line) => line.includes("hello runtime"))).toBe(true);
      expect(
        result.outputs.some((output) => output.type === "display_data")
      ).toBe(true);
    });
  });

  it("transpiles TypeScript before execution", async () => {
    await withRuntime(undefined, async (runtime) => {
      const cell = createCodeCell({ id: "cell-ts", language: "ts" });

      const result = await runtime.execute({
        cell,
        code: "const add = (a: number, b: number): number => a + b; add(1, 2);",
        notebookId: "notebook-ts",
        env: createEnv(),
      });

      expect(result.execution.status).toBe("ok");
      expect(
        result.outputs.some((output) => output.type === "display_data")
      ).toBe(true);
    });
  });

  it("reports execution errors", async () => {
    await withRuntime(undefined, async (runtime) => {
      const cell = createCodeCell({ id: "cell-error", language: "js" });

      const result = await runtime.execute({
        cell,
        code: "throw new Error('boom');",
        notebookId: "notebook-error",
        env: createEnv(),
      });

      expect(result.execution.status).toBe("error");
      const last = result.outputs[result.outputs.length - 1];
      expect(last?.type).toBe("error");
    });
  });

  it("loads sandboxed dependencies using the installer hook", async () => {
    await withRuntime(
      {
        installDependencies: async (cwd) => {
          const moduleRoot = join(cwd, "node_modules", "demo-package");
          await fs.mkdir(moduleRoot, { recursive: true });
          await fs.writeFile(
            join(moduleRoot, "package.json"),
            JSON.stringify({
              name: "demo-package",
              version: "1.0.0",
              main: "index.js",
            })
          );
          await fs.writeFile(
            join(moduleRoot, "index.js"),
            "module.exports = () => 'installed-package';\n"
          );
        },
      },
      async (runtime) => {
        const cell = createCodeCell({ id: "cell-deps", language: "js" });

        const result = await runtime.execute({
          cell,
          code: "const demo = require('demo-package'); demo();",
          notebookId: "notebook-deps",
          env: createEnv({ "demo-package": "^1.0.0" }),
        });

        const display = result.outputs.find(isDisplayData);
        expect(display).toBeDefined();
        const plain = display?.data?.["text/plain"];
        expect(String(plain)).toContain("installed-package");
      }
    );
  });

  it("restricts fs access to the sandbox directory", async () => {
    await withRuntime(
      { installDependencies: async () => {} },
      async (runtime) => {
        const cell = createCodeCell({ id: "cell-fs", language: "js" });

        const result = await runtime.execute({
          cell,
          code: [
            "const fs = require('fs');",
            "try {",
            "  fs.writeFileSync('/etc/hosts', 'nope');",
            "  'allowed';",
            "} catch (error) {",
            "  error.message;",
            "}",
          ].join("\n"),
          notebookId: "notebook-fs",
          env: createEnv(),
        });

        const display = result.outputs.find(isDisplayData);
        expect(display).toBeDefined();
        const message = display?.data?.["text/plain"];
        expect(String(message)).toContain("not allowed");
      }
    );
  });

  it("sets process.cwd() to the sandbox directory", async () => {
    await withRuntime(undefined, async (runtime) => {
      const cell = createCodeCell({ id: "cell-cwd", language: "js" });

      const result = await runtime.execute({
        cell,
        code: "process.cwd();",
        notebookId: "notebook-cwd",
        env: createEnv(),
      });

      const display = result.outputs.find(isDisplayData);
      expect(display).toBeDefined();
      const plain = display?.data?.["text/plain"];
      expect(String(plain)).toContain("notebook-cwd");
    });
  });

  it("handles multi-line call expressions", async () => {
    await withRuntime(undefined, async (runtime) => {
      const cell = createCodeCell({ id: "cell-multiline", language: "js" });

      const result = await runtime.execute({
        cell,
        code: [
          'import { UiMetric } from "@nodebooks/ui";',
          "",
          "UiMetric(1234, { ",
          '  label: "Requests", unit: "/min", delta: 42, helpText: "Rolling 1m" ',
          "});",
        ].join("\n"),
        notebookId: "notebook-multiline",
        env: createEnv(),
      });

      const display = result.outputs.find(isDisplayData);
      expect(display).toBeDefined();
      // Should render as a structured UI object
      const data = display?.data ?? {};
      expect(Object.keys(data).length).toBeGreaterThan(0);
    });
  });

  it("returns value from last expression inside try/catch", async () => {
    await withRuntime(undefined, async (runtime) => {
      const cell = createCodeCell({ id: "cell-try-catch", language: "js" });

      const result = await runtime.execute({
        cell,
        code: [
          "try {",
          "  JSON.parse('not-json');",
          "} catch (error) {",
          "  error.name;",
          "}",
        ].join("\n"),
        notebookId: "notebook-try-catch",
        env: createEnv(),
      });

      const display = result.outputs.find(isDisplayData);
      expect(display).toBeDefined();
      const message = String(display?.data?.["text/plain"]);
      expect(message).toContain("SyntaxError");
    });
  });

  it("supports no trailing semicolon (ASI)", async () => {
    await withRuntime(undefined, async (runtime) => {
      const cell = createCodeCell({ id: "cell-asi", language: "js" });

      const result = await runtime.execute({
        cell,
        code: ["const a = 2", "a + 3"].join("\n"),
        notebookId: "notebook-asi",
        env: createEnv(),
      });

      const display = result.outputs.find(isDisplayData);
      expect(display).toBeDefined();
      const plain = display?.data?.["text/plain"];
      expect(String(plain)).toContain("5");
    });
  });

  it("supports dynamic import and static top imports", async () => {
    await withRuntime(undefined, async (runtime) => {
      const cell = createCodeCell({
        id: "cell-dynamic-import",
        language: "js",
      });

      const result = await runtime.execute({
        cell,
        code: [
          'import { UiMetric } from "@nodebooks/ui";',
          'const path = await import("node:path");',
          "UiMetric(1, { label: path.basename('/x/y/z.txt') });",
        ].join("\n"),
        notebookId: "notebook-dynamic-import",
        env: createEnv(),
      });

      const display = result.outputs.find(isDisplayData);
      expect(display).toBeDefined();
      const json = display?.data?.["application/json"] as unknown;
      const plain = String(display?.data?.["text/plain"]);
      // Either structured UI object or plain object string should reflect the label
      if (json && typeof json === "object") {
        expect(json as Record<string, unknown>).toHaveProperty("ui");
      }
      expect(plain).toContain("z.txt");
    });
  });

  it("handles multi-line variable initializers", async () => {
    await withRuntime(undefined, async (runtime) => {
      const cell = createCodeCell({ id: "cell-multiline-var", language: "js" });

      const result = await runtime.execute({
        cell,
        code: [
          "const value =",
          "  Math.max(",
          "    1,",
          "    2,",
          "    (3 + 4)",
          "  );",
          "value;",
        ].join("\n"),
        notebookId: "notebook-multiline-var",
        env: createEnv(),
      });

      const display = result.outputs.find(isDisplayData);
      expect(display).toBeDefined();
      const plain = String(display?.data?.["text/plain"]);
      expect(plain).toContain("7");
    });
  });

  it("supports method-chained globals and multi-cell context", async () => {
    await withRuntime(undefined, async (runtime) => {
      const notebookId = "notebook-chain";
      const declareCell = createCodeCell({
        id: "cell-chain-declare",
        language: "js",
      });

      const declarationCode = [
        "class SequenceBuilder {",
        "  constructor() { this.values = []; }",
        "  add(value) { this.values.push(value); return this; }",
        "  result() { return [...this.values]; }",
        "}",
        "",
        "const builder = new SequenceBuilder()",
        "  .add(1)",
        "  .add(2)",
        "  .add(3)",
        "",
        "builder.result();",
      ].join("\n");

      const first = await runtime.execute({
        cell: declareCell,
        code: declarationCode,
        notebookId,
        env: createEnv(),
      });
      expect(first.execution.status).toBe("ok");
      const firstDisplay = first.outputs.find(isDisplayData);
      expect(firstDisplay).toBeDefined();
      const firstJson = firstDisplay?.data?.["application/json"] as unknown;
      expect(firstJson).toEqual([1, 2, 3]);

      // Re-run the declaration to ensure idempotency and no syntax errors
      const second = await runtime.execute({
        cell: declareCell,
        code: declarationCode,
        notebookId,
        env: createEnv(),
      });
      expect(second.execution.status).toBe("ok");
      const secondDisplay = second.outputs.find(isDisplayData);
      const secondJson = secondDisplay?.data?.["application/json"] as unknown;
      expect(secondJson).toEqual([1, 2, 3]);

      const useCell = createCodeCell({
        id: "cell-chain-use",
        language: "js",
      });
      const useCode = [
        "builder.add(4)",
        "  .add(5);",
        "",
        "builder.result();",
      ].join("\n");

      const third = await runtime.execute({
        cell: useCell,
        code: useCode,
        notebookId,
        env: createEnv(),
      });
      expect(third.execution.status).toBe("ok");
      const thirdDisplay = third.outputs.find(isDisplayData);
      expect(thirdDisplay).toBeDefined();
      const thirdJson = thirdDisplay?.data?.["application/json"] as unknown;
      expect(thirdJson).toEqual([1, 2, 3, 4, 5]);
    });
  });

  it("executes a complex supervisor graph notebook without syntax issues", async () => {
    await withRuntime(undefined, async (runtime) => {
      const cell = createCodeCell({
        id: "cell-supervisor-graph",
        language: "ts",
      });

      const code = `import { UiImage, UiMarkdown } from "@nodebooks/ui";

class HumanMessage {
  constructor(public content: string) {}
}

class SystemMessage {
  constructor(public content: string) {}
}

class ChatHeroku {
  constructor(private readonly options: Record<string, unknown>) {}

  async invoke(messages: Array<HumanMessage | SystemMessage>) {
    const human = messages.find(
      (msg) => msg instanceof HumanMessage
    ) as HumanMessage | undefined;
    const system = messages.find(
      (msg) => msg instanceof SystemMessage
    ) as SystemMessage | undefined;
    const text = human?.content ?? "";
    const prompt = system?.content ?? "";

    if (prompt.includes("routing supervisor")) {
      const questionSection = text.split("Question: ").pop() ?? text;
      const question = (questionSection.split("\\n")[0] ?? questionSection)
        .toLowerCase()
        .trim();
      if (question.includes("weather") || question.includes("temperature")) {
        return { content: "weather" };
      }
      if (
        question.includes("math") ||
        question.includes("calculate") ||
        question.includes("equation")
      ) {
        return { content: "math" };
      }
      return { content: "general" };
    }

    if (prompt.includes("weather expert")) {
      return { content: "It looks sunny today." };
    }
    if (prompt.includes("mathematics expert")) {
      return { content: "Euler's identity is e^(iπ) + 1 = 0." };
    }
    return { content: "Leonhard Euler was a Swiss mathematician." };
  }
}

type AnnotationConfig<T> = {
  reducer: (x: T, y: T) => T;
  default: () => T;
};

const Annotation = Object.assign(
  <T>(config: AnnotationConfig<T>) => config,
  {
    Root: <T extends Record<string, unknown>>(config: T) => config,
  }
);

const MessagesAnnotation = Annotation;
const START = "__START__";
const END = "__END__";

type SupervisorSnapshot = {
  messages: Array<HumanMessage | SystemMessage | { content?: string }>;
  route?: string;
};

class StateGraph {
  private readonly nodes = new Map<
    string,
    (state: SupervisorSnapshot) =>
      | SupervisorSnapshot
      | Promise<SupervisorSnapshot>
  >();
  private readonly edges = new Map<string, string[]>();
  private readonly conditionals = new Map<
    string,
    (state: SupervisorSnapshot) => string
  >();
  private start: string | null = null;

  constructor(private readonly stateShape: unknown) {
    void this.stateShape;
  }

  addNode(
    name: string,
    handler: (state: SupervisorSnapshot) =>
      | SupervisorSnapshot
      | Promise<SupervisorSnapshot>
  ) {
    this.nodes.set(name, handler);
    return this;
  }

  addEdge(from: typeof START | string, to: string | typeof END) {
    if (from === START) {
      this.start = typeof to === "string" ? to : null;
      return this;
    }
    const list = this.edges.get(from) ?? [];
    if (to !== END) {
      list.push(to);
    }
    this.edges.set(from, list);
    return this;
  }

  addConditionalEdges(
    name: string,
    router: (state: SupervisorSnapshot) => string
  ) {
    this.conditionals.set(name, router);
    return this;
  }

  compile() {
    const nodes = this.nodes;
    const edges = this.edges;
    const router = this.conditionals;
    const startNode = this.start;

    return {
      invoke: async (input: SupervisorSnapshot) => {
        let current = startNode;
        let state: SupervisorSnapshot = {
          messages: [...(input.messages ?? [])],
          route: input.route,
        };

        while (current) {
          const handler = nodes.get(current);
          if (!handler) {
            break;
          }

          const result = await handler({ ...state });
          const nextMessages = result.messages ?? [];
          state = {
            ...state,
            ...result,
            messages: [...state.messages, ...nextMessages],
          };

          const conditional = router.get(current);
          if (conditional) {
            current = conditional(state);
            continue;
          }

          const nextList = edges.get(current) ?? [];
          current = nextList[0] ?? null;
        }

        return state;
      },
      getGraphAsync: async () => ({
        drawMermaidPng: async () => ({
          async arrayBuffer() {
            return Buffer.from("graphviz");
          },
        }),
      }),
    };
  }
}

const model = new ChatHeroku({
  model: "demo",
  apiKey: "demo",
  temperature: 0,
});

const SupervisorState = Annotation.Root({
  messages: Annotation({
    reducer: (x: SupervisorSnapshot["messages"], y) => x.concat(y),
    default: () => [],
  }),
  route: Annotation({
    reducer: (_x: string | undefined, y: string | undefined) => y ?? "general",
    default: () => "general",
  }),
});

async function weatherAgent(state: SupervisorSnapshot) {
  const humanMessage = state.messages.find(
    (msg) => msg instanceof HumanMessage
  ) as HumanMessage | undefined;
  if (!humanMessage) {
    throw new Error("No human message found in state");
  }

  const response = await model.invoke([
    new SystemMessage(
      "You are a weather expert. Answer weather-related questions."
    ),
    humanMessage,
  ]);
  return { messages: [response] };
}

async function mathAgent(state: SupervisorSnapshot) {
  const humanMessage = state.messages.find(
    (msg) => msg instanceof HumanMessage
  ) as HumanMessage | undefined;
  if (!humanMessage) {
    throw new Error("No human message found in state");
  }

  const response = await model.invoke([
    new SystemMessage(
      "You are a mathematics expert. Solve mathematical problems."
    ),
    humanMessage,
  ]);
  return { messages: [response] };
}

async function generalAgent(state: SupervisorSnapshot) {
  const humanMessage = state.messages.find(
    (msg) => msg instanceof HumanMessage
  ) as HumanMessage | undefined;
  if (!humanMessage) {
    throw new Error("No human message found in state");
  }

  const response = await model.invoke([
    new SystemMessage(
      "You are a helpful general knowledge assistant."
    ),
    humanMessage,
  ]);
  return { messages: [response] };
}

async function supervisor(state: SupervisorSnapshot) {
  const humanMessage = state.messages.find(
    (msg) => msg instanceof HumanMessage
  ) as HumanMessage | undefined;
  if (!humanMessage || !humanMessage.content) {
    throw new Error("No valid human message found in state");
  }

  const routingPrompt = [
    "You are a supervisor that routes questions to specialized agents.",
    "Based on the following question, decide which agent should handle it:",
    '- "weather" for weather-related questions',
    '- "math" for mathematical problems or calculations',
    '- "general" for general knowledge questions',
    "",
    "Question: " + humanMessage.content,
    "",
    "Respond with only one word: weather, math, or general",
  ].join("\\n");

  const response = await model.invoke([
    new SystemMessage(
      "You are a routing supervisor. Respond with only one word: weather, math, or general"
    ),
    new HumanMessage(routingPrompt),
  ]);

  const route = response.content?.toLowerCase().trim() || "general";

  const routingMessage = new SystemMessage(
    "Supervisor routed to: " + route + " agent"
  );
  return {
    messages: [routingMessage],
    route,
  };
}

function route(state: SupervisorSnapshot) {
  const routeDecision = state.route || "general";

  if (routeDecision.includes("weather")) {
    return "weather_agent";
  }
  if (routeDecision.includes("math")) {
    return "math_agent";
  }
  return "general_agent";
}

function createSupervisorGraph() {
  const workflow = new StateGraph(SupervisorState)
    .addNode("supervisor", supervisor)
    .addNode("weather_agent", weatherAgent)
    .addNode("math_agent", mathAgent)
    .addNode("general_agent", generalAgent)
    .addEdge(START, "supervisor")
    .addConditionalEdges("supervisor", route)
    .addEdge("weather_agent", END)
    .addEdge("math_agent", END)
    .addEdge("general_agent", END);

  return workflow.compile();
}

async function askSupervisorQuestion(question: string) {
  if (!question || typeof question !== "string") {
    throw new Error("Question must be a non-empty string");
  }

  const graph = createSupervisorGraph();

  const result = await graph.invoke({
    messages: [new HumanMessage(question)],
  });

  const agentResponse = result.messages[result.messages.length - 1];

  if (!agentResponse || !agentResponse.content) {
    throw new Error("No valid response received from agent");
  }

  return agentResponse.content;
}

async function generateSupervisorGraph() {
  const graph = createSupervisorGraph();
  const graphAsync = await graph.getGraphAsync();
  const image = await graphAsync.drawMermaidPng();
  const arrayBuffer = await image.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return "data:image/png;base64," + base64;
}

const image = await generateSupervisorGraph();
UiImage(image);

const response = await askSupervisorQuestion("What is Euler?");
UiMarkdown(response);
`;

      const result = await runtime.execute({
        cell,
        code,
        notebookId: "notebook-supervisor-graph",
        env: createEnv(),
      });

      expect(result.execution.status).toBe("ok");

      const displays = result.outputs.filter(isDisplayData);
      expect(displays.length).toBeGreaterThanOrEqual(2);

      const imageOutput = displays.find((output) => {
        const mime = output.data?.[NODEBOOKS_UI_MIME] as { ui?: string };
        return mime?.ui === "image";
      });
      expect(imageOutput).toBeDefined();
      expect(
        String(
          (imageOutput?.data?.[NODEBOOKS_UI_MIME] as { src?: string })?.src ??
            ""
        )
      ).toContain("data:image/png;base64,");

      const markdownOutput = displays.find((output) => {
        const mime = output.data?.[NODEBOOKS_UI_MIME] as { ui?: string };
        return mime?.ui === "markdown";
      });
      expect(markdownOutput).toBeDefined();
      const markdownText = String(
        (markdownOutput?.data?.[NODEBOOKS_UI_MIME] as { markdown?: string })
          ?.markdown ?? ""
      );
      expect(markdownText.toLowerCase()).toContain("euler");
    });
  });
});
