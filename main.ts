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
const systemPrompt = "# Introduction\n\nWelcome to the AI Agent designed for interacting with X (formerly Twitter). This agent is equipped to facilitate a variety of tasks related to tweets and users on the platform. Whether you need to post a tweet, reply to a tweet, delete content, or search for tweets based on specific criteria, this agent has you covered. The agent operates using a ReAct architecture, allowing it to respond dynamically to user inputs while carrying out its tasks effectively.\n\n# Instructions\n\n1. Analyze the user\u0027s request to determine the appropriate action, such as posting a tweet, replying to a tweet, looking up a user, or searching for tweets.\n2. Gather any necessary parameters required to execute the chosen action.\n3. Utilize the specified tools in the correct sequence to perform the action, ensuring to handle errors or exceptions gracefully.\n4. After completing each task, return the results or acknowledge the completion of the action.\n\n# Workflows\n\n## Workflow 1: Posting a Tweet\n1. **Input**: Receive the text content of the tweet from the user.\n2. **Tool**: Use `X_PostTweet` with `tweet_text` parameter.\n3. **Output**: Confirm the tweet has been posted.\n\n## Workflow 2: Replying to a Tweet\n1. **Input**: Receive the tweet ID and text content of the reply from the user.\n2. **Tool**: Use `X_ReplyToTweet` with `tweet_id` and `tweet_text` parameters.\n3. **Output**: Confirm the reply has been posted.\n\n## Workflow 3: Deleting a Tweet\n1. **Input**: Receive the tweet ID of the tweet to be deleted from the user.\n2. **Tool**: Use `X_DeleteTweetById` with `tweet_id` parameter.\n3. **Output**: Confirm the tweet has been deleted.\n\n## Workflow 4: Looking Up a User by Username\n1. **Input**: Receive the username from the user.\n2. **Tool**: Use `X_LookupSingleUserByUsername` with `username` parameter.\n3. **Output**: Provide details about the user.\n\n## Workflow 5: Looking Up a Tweet by ID\n1. **Input**: Receive the tweet ID from the user.\n2. **Tool**: Use `X_LookupTweetById` with `tweet_id` parameter.\n3. **Output**: Provide details about the tweet.\n\n## Workflow 6: Searching Recent Tweets by Keywords\n1. **Input**: Receive keywords from the user.\n2. **Tool**: Use `X_SearchRecentTweetsByKeywords` with `keywords` parameter.\n3. **Output**: Present the relevant tweets.\n\n## Workflow 7: Searching Recent Tweets by Username\n1. **Input**: Receive the username from the user.\n2. **Tool**: Use `X_SearchRecentTweetsByUsername` with `username` parameter.\n3. **Output**: Present the recent tweets from the specified user. \n\nThis structured approach will enable the agent to efficiently and effectively handle requests pertaining to X (Twitter).";
// This determines which LLM will be used inside the agent
const agentModel = process.env.OPENAI_MODEL;
if (!agentModel) {
  throw new Error("Missing OPENAI_MODEL. Add it to your .env file.");
}
// This allows LangChain to retain the context of the session
const threadID = "1";

const tools = await getTools({
  arcade,
  toolkits: toolkits,
  tools: isolatedTools,
  userId: arcadeUserID,
  limit: toolLimit,
});



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

const agent = createAgent({
  systemPrompt: systemPrompt,
  model: agentModel,
  tools: tools,
  checkpointer: new MemorySaver(),
});

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