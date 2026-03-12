---
title: "Build a X agent with LangChain (TypeScript) and Arcade"
slug: "ts-langchain-X"
framework: "langchain-ts"
language: "typescript"
toolkits: ["X"]
tools: []
difficulty: "beginner"
generated_at: "2026-03-12T01:35:11Z"
source_template: "ts_langchain"
agent_repo: ""
tags:
  - "langchain"
  - "typescript"
  - "x"
---

# Build a X agent with LangChain (TypeScript) and Arcade

In this tutorial you'll build an AI agent using [LangChain](https://js.langchain.com/) with [LangGraph](https://langchain-ai.github.io/langgraphjs/) in TypeScript and [Arcade](https://arcade.dev) that can interact with X tools — with built-in authorization and human-in-the-loop support.

## Prerequisites

- The [Bun](https://bun.com) runtime
- An [Arcade](https://arcade.dev) account and API key
- An OpenAI API key

## Project Setup

First, create a directory for this project, and install all the required dependencies:

````bash
mkdir x-agent && cd x-agent
bun install @arcadeai/arcadejs @langchain/langgraph @langchain/core langchain chalk
````

## Start the agent script

Create a `main.ts` script, and import all the packages and libraries. Imports from 
the `"./tools"` package may give errors in your IDE now, but don't worry about those
for now, you will write that helper package later.

````typescript
"use strict";
import { getTools, confirm, arcade } from "./tools";
import { createAgent } from "langchain";
import {
  Command,
  MemorySaver,
  type Interrupt,
} from "@langchain/langgraph";
import chalk from "chalk";
import * as readline from "node:readline/promises";
````

## Configuration

In `main.ts`, configure your agent's toolkits, system prompt, and model. Notice
how the system prompt tells the agent how to navigate different scenarios and
how to combine tool usage in specific ways. This prompt engineering is important
to build effective agents. In fact, the more agentic your application, the more
relevant the system prompt to truly make the agent useful and effective at
using the tools at its disposal.

````typescript
// configure your own values to customize your agent

// The Arcade User ID identifies who is authorizing each service.
const arcadeUserID = process.env.ARCADE_USER_ID;
if (!arcadeUserID) {
  throw new Error("Missing ARCADE_USER_ID. Add it to your .env file.");
}
// This determines which MCP server is providing the tools, you can customize this to make a Slack agent, or Notion agent, etc.
// all tools from each of these MCP servers will be retrieved from arcade
const toolkits=['X'];
// This determines isolated tools that will be
const isolatedTools=[];
// This determines the maximum number of tool definitions Arcade will return
const toolLimit = 100;
// This prompt defines the behavior of the agent.
const systemPrompt = "# X (Twitter) ReAct Agent \u2014 Prompt\n\nIntroduction\n- You are an AI agent that helps a human interact with X (Twitter) through a fixed set of tools. Your purpose is to look up users and tweets, search recent tweets, post tweets (including replies and quote-tweets), and delete tweets \u2014 and to do so using a ReAct-style interaction pattern (interleaving brief reasoning, tool actions, and observations).\n- Be precise, cautious with destructive actions (deletions), and explicit about any assumptions or clarifying questions needed.\n\nInstructions (how you must behave)\n- Use the ReAct step format for every turn that involves tools. Follow this exact structure:\n  - Thought: \u003ca concise, non-sensitive reason for the next action \u2014 do NOT reveal chain-of-thought\u003e\n  - Action: \u003ctool_name\u003e\n  - Action Input: \u003cJSON object with parameters for the tool\u003e\n  - Observation: \u003cthe tool output (provided by the environment)\u003e\n  - (Repeat Thought/Action/Observation as needed)\n  - Final Response: \u003cconcise message to the user describing results and any next steps\u003e\n\n- Keep the Thought short and factual (1\u20132 sentences). Do not include internal deliberation or chain-of-thought.\n- Call tools only when they are required to fulfill the user\u2019s request.\n- Do not post or reply on behalf of the user without explicit instruction. For destructive actions (delete), always request explicit confirmation first, unless the user has already explicitly and unambiguously requested deletion.\n- Follow tool-specific rules:\n  - Use X_PostTweet only to post a top-level tweet (not a reply).\n  - Use X_ReplyToTweet for replies to a specific tweet (must include tweet_id).\n  - To quote a tweet: include the quote_tweet_id parameter in the same tool call (X_PostTweet for a non-reply quote, X_ReplyToTweet for a reply that quotes).\n  - For X_SearchRecentTweetsByKeywords: provide either keywords (array) and/or phrases (array). At least one is required.\n  - For X_SearchRecentTweetsByUsername: provide a username string. max_results must be in [1,100] if provided.\n  - All tweet_id and quote_tweet_id values must be strings representing integers.\n- Validate inputs before calling a tool:\n  - Ensure tweet_text is non-empty. If the tweet text may exceed typical limits, warn and ask to confirm (X historically enforces ~280 chars for standard tweets; confirm with user if text is longer).\n  - Ensure usernames are provided without an \u201c@\u201d prefix unless the user intends otherwise \u2014 you may accept either, but normalize before calling.\n- Handle errors and missing data:\n  - If a lookup/search returns no results, inform the user and offer next steps (adjust search, try another username, etc.).\n  - If a deletion fails (e.g., not owner), convey the error and suggest verification steps.\n- Respect privacy and platform policies. Do not fabricate or guess tool outputs \u2014 always rely on the Observation.\n\nWorkflows\nBelow are common workflows and the recommended sequence of steps (Thought/Action/Action Input) for each. Use them as templates; adapt as needed to user instructions.\n\n1) Post a new (non-reply) tweet\n- Use when the user wants to post a normal tweet.\n- Sequence:\n  ```\n  Thought: Prepare to post a new top-level tweet.\n  Action: X_PostTweet\n  Action Input: {\"tweet_text\": \"\u003ctweet text here\u003e\"}\n  Observation: ...\n  Final Response: \u003cconfirm success and include new tweet id or error\u003e\n  ```\n\n- Notes: If the user asks to quote a tweet in a new post, include quote_tweet_id:\n  ```\n  Action Input: {\"tweet_text\": \"\u003ctext\u003e\", \"quote_tweet_id\": \"1234567890\"}\n  ```\n\n2) Reply to an existing tweet\n- Use when the user instructs to reply to a particular tweet_id.\n- Sequence:\n  ```\n  Thought: Reply to the given tweet with the provided message.\n  Action: X_ReplyToTweet\n  Action Input: {\"tweet_id\": \"1234567890\", \"tweet_text\": \"\u003creply text\u003e\"}\n  Observation: ...\n  Final Response: \u003cconfirm reply posted or report error\u003e\n  ```\n\n- To reply and quote another tweet in the same reply, include quote_tweet_id:\n  ```\n  Action Input: {\"tweet_id\": \"1234567890\", \"tweet_text\": \"\u003ctext\u003e\", \"quote_tweet_id\": \"0987654321\"}\n  ```\n\n3) Quote a tweet (top-level quote)\n- Use X_PostTweet with quote_tweet_id for quoting without replying:\n  ```\n  Thought: Post a top-level tweet that quotes an existing tweet.\n  Action: X_PostTweet\n  Action Input: {\"tweet_text\": \"\u003ctext\u003e\", \"quote_tweet_id\": \"1234567890\"}\n  Observation: ...\n  Final Response: \u003cconfirm and return tweet id\u003e\n  ```\n\n4) Delete a tweet by ID\n- Confirm ownership/intent before performing deletion.\n- Sequence:\n  ```\n  Thought: Verify the tweet exists and confirm deletion intent.\n  Action: X_LookupTweetById\n  Action Input: {\"tweet_id\": \"1234567890\"}\n  Observation: ...\n  Final Response: If tweet exists and user confirms -\u003e proceed, else report or ask for confirmation.\n  ```\n  After explicit user confirmation:\n  ```\n  Thought: Deleting the specified tweet as confirmed by the user.\n  Action: X_DeleteTweetById\n  Action Input: {\"tweet_id\": \"1234567890\"}\n  Observation: ...\n  Final Response: \u003cconfirm deletion or show error\u003e\n  ```\n\n5) Look up a user by username\n- Use to fetch user details (user id, display name, existence checks).\n- Sequence:\n  ```\n  Thought: Look up the user details for the requested username.\n  Action: X_LookupSingleUserByUsername\n  Action Input: {\"username\": \"exampleuser\"}\n  Observation: ...\n  Final Response: \u003creturn user info or not found\u003e\n  ```\n\n- Normalize username input: strip leading \"@\", trim whitespace.\n\n6) Look up a tweet by tweet ID\n- Use to get tweet metadata and verify existence:\n  ```\n  Thought: Fetch details for the given tweet id.\n  Action: X_LookupTweetById\n  Action Input: {\"tweet_id\": \"1234567890\"}\n  Observation: ...\n  Final Response: \u003ctweet details or not found\u003e\n  ```\n\n7) Search recent tweets by keywords/phrases\n- Use when the user wants recent tweets matching keywords/phrases from the last 7 days.\n- Sequence:\n  ```\n  Thought: Search recent tweets matching the requested keywords/phrases.\n  Action: X_SearchRecentTweetsByKeywords\n  Action Input: {\"keywords\": [\"keyword1\", \"keyword2\"], \"phrases\": [\"exact phrase\"], \"max_results\": 25}\n  Observation: ...\n  Final Response: \u003csummarize results, include next_token if present\u003e\n  ```\n- Tips: If user asks for more than 100 results, paginate and ask if they want more.\n\n8) Search recent tweets by username\n- Use when the user wants a user\u2019s recent tweets (last 7 days).\n- Sequence:\n  ```\n  Thought: Retrieve recent tweets for the requested username.\n  Action: X_SearchRecentTweetsByUsername\n  Action Input: {\"username\": \"exampleuser\", \"max_results\": 50}\n  Observation: ...\n  Final Response: \u003csummarize and include next_token if present\u003e\n  ```\n\nCombined example \u2014 find a tweet then reply to it:\n```\nThought: Find the tweet with id the user provided to ensure it exists before replying.\nAction: X_LookupTweetById\nAction Input: {\"tweet_id\": \"1234567890\"}\nObservation: ...\nThought: Tweet exists; post the reply now.\nAction: X_ReplyToTweet\nAction Input: {\"tweet_id\": \"1234567890\", \"tweet_text\": \"Thanks for this!\"}\nObservation: ...\nFinal Response: Replied to tweet 1234567890. (Include reply id or error if any.)\n```\n\nFormatting tool calls\n- Always present Action Input as a JSON object.\n- Use string values for tweet_id and quote_tweet_id (even though they are integers conceptually).\n- Example:\n  ```\n  Action: X_PostTweet\n  Action Input: {\"tweet_text\": \"Hello X community!\", \"quote_tweet_id\": \"1357924680\"}\n  ```\n\nError handling and follow-up\n- If a tool returns an error or empty result, include the Observation and then a short corrective Thought and next Action (retry with corrected input, ask user for clarification, or abort).\n- Offer sensible next steps (edit tweet text, shorten tweet, confirm deletion, expand search terms, etc.).\n\nSecurity and safety\n- Do not post content that violates the user\u0027s instructions or platform policies.\n- Do not expose secrets or authorization tokens. The environment will handle authentication for tool calls.\n\nFinal notes\n- Be succinct in user-facing Final Responses \u2014 report what you did, the key results (IDs, counts), and the next suggested actions.\n- When in doubt about intent or when the request involves side effects, ask a clarifying question before calling a tool.";
// This determines which LLM will be used inside the agent
const agentModel = process.env.OPENAI_MODEL;
if (!agentModel) {
  throw new Error("Missing OPENAI_MODEL. Add it to your .env file.");
}
// This allows LangChain to retain the context of the session
const threadID = "1";
````

Set the following environment variables in a `.env` file:

````bash
ARCADE_API_KEY=your-arcade-api-key
ARCADE_USER_ID=your-arcade-user-id
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-5-mini
````

## Implementing the `tools.ts` module

The `tools.ts` module fetches Arcade tool definitions and converts them to LangChain-compatible tools using Arcade's Zod schema conversion:

### Create the file and import the dependencies

Create a `tools.ts` file, and add import the following. These will allow you to build the helper functions needed to convert Arcade tool definitions into a format that LangChain can execute. Here, you also define which tools will require human-in-the-loop confirmation. This is very useful for tools that may have dangerous or undesired side-effects if the LLM hallucinates the values in the parameters. You will implement the helper functions to require human approval in this module.

````typescript
import { Arcade } from "@arcadeai/arcadejs";
import {
  type ToolExecuteFunctionFactoryInput,
  type ZodTool,
  executeZodTool,
  isAuthorizationRequiredError,
  toZod,
} from "@arcadeai/arcadejs/lib/index";
import { type ToolExecuteFunction } from "@arcadeai/arcadejs/lib/zod/types";
import { tool } from "langchain";
import {
  interrupt,
} from "@langchain/langgraph";
import readline from "node:readline/promises";

// This determines which tools require human in the loop approval to run
const TOOLS_WITH_APPROVAL = ['X_DeleteTweetById', 'X_PostTweet', 'X_ReplyToTweet'];
````

### Create a confirmation helper for human in the loop

The first helper that you will write is the `confirm` function, which asks a yes or no question to the user, and returns `true` if theuser replied with `"yes"` and `false` otherwise.

````typescript
// Prompt user for yes/no confirmation
export async function confirm(question: string, rl?: readline.Interface): Promise<boolean> {
  let shouldClose = false;
  let interface_ = rl;

  if (!interface_) {
      interface_ = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
      });
      shouldClose = true;
  }

  const answer = await interface_.question(`${question} (y/n): `);

  if (shouldClose) {
      interface_.close();
  }

  return ["y", "yes"].includes(answer.trim().toLowerCase());
}
````

Tools that require authorization trigger a LangGraph interrupt, which pauses execution until the user completes authorization in their browser.

### Create the execution helper

This is a wrapper around the `executeZodTool` function. Before you execute the tool, however, there are two logical checks to be made:

1. First, if the tool the agent wants to invoke is included in the `TOOLS_WITH_APPROVAL` variable, human-in-the-loop is enforced by calling `interrupt` and passing the necessary data to call the `confirm` helper. LangChain will surface that `interrupt` to the agentic loop, and you will be required to "resolve" the interrupt later on. For now, you can assume that the reponse of the `interrupt` will have enough information to decide whether to execute the tool or not, depending on the human's reponse.
2. Second, if the tool was approved by the human, but it doesn't have the authorization of the integration to run, then you need to present an URL to the user so they can authorize the OAuth flow for this operation. For this, an execution is attempted, that may fail to run if the user is not authorized. When it fails, you interrupt the flow and send the authorization request for the harness to handle. If the user authorizes the tool, the harness will reply with an `{authorized: true}` object, and the system will retry the tool call without interrupting the flow.

````typescript
export function executeOrInterruptTool({
  zodToolSchema,
  toolDefinition,
  client,
  userId,
}: ToolExecuteFunctionFactoryInput): ToolExecuteFunction<any> {
  const { name: toolName } = zodToolSchema;

  return async (input: unknown) => {
    try {

      // If the tool is on the list that enforces human in the loop, we interrupt the flow and ask the user to authorize the tool

      if (TOOLS_WITH_APPROVAL.includes(toolName)) {
        const hitl_response = interrupt({
          authorization_required: false,
          hitl_required: true,
          tool_name: toolName,
          input: input,
        });

        if (!hitl_response.authorized) {
          // If the user didn't approve the tool call, we throw an error, which will be handled by LangChain
          throw new Error(
            `Human in the loop required for tool call ${toolName}, but user didn't approve.`
          );
        }
      }

      // Try to execute the tool
      const result = await executeZodTool({
        zodToolSchema,
        toolDefinition,
        client,
        userId,
      })(input);
      return result;
    } catch (error) {
      // If the tool requires authorization, we interrupt the flow and ask the user to authorize the tool
      if (error instanceof Error && isAuthorizationRequiredError(error)) {
        const response = await client.tools.authorize({
          tool_name: toolName,
          user_id: userId,
        });

        // We interrupt the flow here, and pass everything the handler needs to get the user's authorization
        const interrupt_response = interrupt({
          authorization_required: true,
          authorization_response: response,
          tool_name: toolName,
          url: response.url ?? "",
        });

        // If the user authorized the tool, we retry the tool call without interrupting the flow
        if (interrupt_response.authorized) {
          const result = await executeZodTool({
            zodToolSchema,
            toolDefinition,
            client,
            userId,
          })(input);
          return result;
        } else {
          // If the user didn't authorize the tool, we throw an error, which will be handled by LangChain
          throw new Error(
            `Authorization required for tool call ${toolName}, but user didn't authorize.`
          );
        }
      }
      throw error;
    }
  };
}
````

### Create the tool retrieval helper

The last helper function of this module is the `getTools` helper. This function will take the configurations you defined in the `main.ts` file, and retrieve all of the configured tool definitions from Arcade. Those definitions will then be converted to LangGraph `Function` tools, and will be returned in a format that LangChain can present to the LLM so it can use the tools and pass the arguments correctly. You will pass the `executeOrInterruptTool` helper you wrote in the previous section so all the bindings to the human-in-the-loop and auth handling are programmed when LancChain invokes a tool.


````typescript
// Initialize the Arcade client
export const arcade = new Arcade();

export type GetToolsProps = {
  arcade: Arcade;
  toolkits?: string[];
  tools?: string[];
  userId: string;
  limit?: number;
}


export async function getTools({
  arcade,
  toolkits = [],
  tools = [],
  userId,
  limit = 100,
}: GetToolsProps) {

  if (toolkits.length === 0 && tools.length === 0) {
      throw new Error("At least one tool or toolkit must be provided");
  }

  // Todo(Mateo): Add pagination support
  const from_toolkits = await Promise.all(toolkits.map(async (tkitName) => {
      const definitions = await arcade.tools.list({
          toolkit: tkitName,
          limit: limit
      });
      return definitions.items;
  }));

  const from_tools = await Promise.all(tools.map(async (toolName) => {
      return await arcade.tools.get(toolName);
  }));

  const all_tools = [...from_toolkits.flat(), ...from_tools];
  const unique_tools = Array.from(
      new Map(all_tools.map(tool => [tool.qualified_name, tool])).values()
  );

  const arcadeTools = toZod({
    tools: unique_tools,
    client: arcade,
    executeFactory: executeOrInterruptTool,
    userId: userId,
  });

  // Convert Arcade tools to LangGraph tools
  const langchainTools = arcadeTools.map(({ name, description, execute, parameters }) =>
    (tool as Function)(execute, {
      name,
      description,
      schema: parameters,
    })
  );

  return langchainTools;
}
````

## Building the Agent

Back on the `main.ts` file, you can now call the helper functions you wrote to build the agent.

### Retrieve the configured tools

Use the `getTools` helper you wrote to retrieve the tools from Arcade in LangChain format:

````typescript
const tools = await getTools({
  arcade,
  toolkits: toolkits,
  tools: isolatedTools,
  userId: arcadeUserID,
  limit: toolLimit,
});
````

### Write an interrupt handler

When LangChain is interrupted, it will emit an event in the stream that you will need to handle and resolve based on the user's behavior. For a human-in-the-loop interrupt, you will call the `confirm` helper you wrote earlier, and indicate to the harness whether the human approved the specific tool call or not. For an auth interrupt, you will present the OAuth URL to the user, and wait for them to finishe the OAuth dance before resolving the interrupt with `{authorized: true}` or `{authorized: false}` if an error occurred:

````typescript
async function handleInterrupt(
  interrupt: Interrupt,
  rl: readline.Interface
): Promise<{ authorized: boolean }> {
  const value = interrupt.value;
  const authorization_required = value.authorization_required;
  const hitl_required = value.hitl_required;
  if (authorization_required) {
    const tool_name = value.tool_name;
    const authorization_response = value.authorization_response;
    console.log("⚙️: Authorization required for tool call", tool_name);
    console.log(
      "⚙️: Please authorize in your browser",
      authorization_response.url
    );
    console.log("⚙️: Waiting for you to complete authorization...");
    try {
      await arcade.auth.waitForCompletion(authorization_response.id);
      console.log("⚙️: Authorization granted. Resuming execution...");
      return { authorized: true };
    } catch (error) {
      console.error("⚙️: Error waiting for authorization to complete:", error);
      return { authorized: false };
    }
  } else if (hitl_required) {
    console.log("⚙️: Human in the loop required for tool call", value.tool_name);
    console.log("⚙️: Please approve the tool call", value.input);
    const approved = await confirm("Do you approve this tool call?", rl);
    return { authorized: approved };
  }
  return { authorized: false };
}
````

### Create an Agent instance

Here you create the agent using the `createAgent` function. You pass the system prompt, the model, the tools, and the checkpointer. When the agent runs, it will automatically use the helper function you wrote earlier to handle tool calls and authorization requests.

````typescript
const agent = createAgent({
  systemPrompt: systemPrompt,
  model: agentModel,
  tools: tools,
  checkpointer: new MemorySaver(),
});
````

### Write the invoke helper

This last helper function handles the streaming of the agent’s response, and captures the interrupts. When the system detects an interrupt, it adds the interrupt to the `interrupts` array, and the flow interrupts. If there are no interrupts, it will just stream the agent’s to your console.

````typescript
async function streamAgent(
  agent: any,
  input: any,
  config: any
): Promise<Interrupt[]> {
  const stream = await agent.stream(input, {
    ...config,
    streamMode: "updates",
  });
  const interrupts: Interrupt[] = [];

  for await (const chunk of stream) {
    if (chunk.__interrupt__) {
      interrupts.push(...(chunk.__interrupt__ as Interrupt[]));
      continue;
    }
    for (const update of Object.values(chunk)) {
      for (const msg of (update as any)?.messages ?? []) {
        console.log("🤖: ", msg.toFormattedString());
      }
    }
  }

  return interrupts;
}
````

### Write the main function

Finally, write the main function that will call the agent and handle the user input.

Here the `config` object configures the `thread_id`, which tells the agent to store the state of the conversation into that specific thread. Like any typical agent loop, you:

1. Capture the user input
2. Stream the agent's response
3. Handle any authorization interrupts
4. Resume the agent after authorization
5. Handle any errors
6. Exit the loop if the user wants to quit

````typescript
async function main() {
  const config = { configurable: { thread_id: threadID } };
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(chalk.green("Welcome to the chatbot! Type 'exit' to quit."));
  while (true) {
    const input = await rl.question("> ");
    if (input.toLowerCase() === "exit") {
      break;
    }
    rl.pause();

    try {
      let agentInput: any = {
        messages: [{ role: "user", content: input }],
      };

      // Loop until no more interrupts
      while (true) {
        const interrupts = await streamAgent(agent, agentInput, config);

        if (interrupts.length === 0) {
          break; // No more interrupts, we're done
        }

        // Handle all interrupts
        const decisions: any[] = [];
        for (const interrupt of interrupts) {
          decisions.push(await handleInterrupt(interrupt, rl));
        }

        // Resume with decisions, then loop to check for more interrupts
        // Pass single decision directly, or array for multiple interrupts
        agentInput = new Command({ resume: decisions.length === 1 ? decisions[0] : decisions });
      }
    } catch (error) {
      console.error(error);
    }

    rl.resume();
  }
  console.log(chalk.red("👋 Bye..."));
  process.exit(0);
}

// Run the main function
main().catch((err) => console.error(err));
````

## Running the Agent

### Run the agent

```bash
bun run main.ts
```

You should see the agent responding to your prompts like any model, as well as handling any tool calls and authorization requests.

## Next Steps

- Clone the [repository](https://github.com/arcade-agents/ts-langchain-X) and run it
- Add more toolkits to the `toolkits` array to expand capabilities
- Customize the `systemPrompt` to specialize the agent's behavior
- Explore the [Arcade documentation](https://docs.arcade.dev) for available toolkits

